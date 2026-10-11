// Cloudflare Worker: serves the built SPA and proxies /api/* to the injomo
// workflow API. The browser only ever talks to this origin, so the upstream's
// missing CORS headers don't matter, and endpoint IDs stay out of the bundle.
//
// Logs: `npx wrangler tail`, or the Worker's Observability → Logs in the Cloudflare
// dashboard (enabled in wrangler.jsonc). GET /api/health reports the Worker's config.

type Env = {
  ASSETS: Fetcher
  API_BASE: string
}

// Named routes → upstream workflow trigger IDs. Only these are proxied.
const ROUTES: Record<string, { method: 'GET' | 'POST'; trigger: string }> = {
  '/api/appointments': { method: 'GET', trigger: '6ac90ce7d1c1ed570000c834' },
  '/api/consultation/fetch': { method: 'POST', trigger: 'pluginintegrationconsultationfetch6ac8dd8b8d31d' },
  '/api/consultation/save': { method: 'POST', trigger: 'pluginintegrationconsultationinsert6ac8ddc79f165' },
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

// One JSON line per event, so Cloudflare's log search can filter on fields.
const logEvent = (level: 'log' | 'warn' | 'error', event: Record<string, unknown>) => console[level](JSON.stringify(event))

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    if (url.pathname === '/api/health') {
      return json({ ok: Boolean(env.API_BASE), apiBase: env.API_BASE || '(not set)', routes: Object.keys(ROUTES) }, env.API_BASE ? 200 : 500)
    }

    const route = ROUTES[url.pathname]
    if (!route) {
      logEvent('warn', { event: 'route-not-found', method: request.method, path: url.pathname })
      return json({ error: 'Not found', path: url.pathname, routes: Object.keys(ROUTES) }, 404)
    }
    if (request.method !== route.method) {
      logEvent('warn', { event: 'method-not-allowed', method: request.method, path: url.pathname, expected: route.method })
      return json({ error: 'Method not allowed', expected: route.method }, 405)
    }
    if (!env.API_BASE) {
      logEvent('error', { event: 'config-missing', detail: 'API_BASE var is not set (wrangler.jsonc vars)' })
      return json({ error: 'Server misconfigured: API_BASE is not set' }, 500)
    }

    const started = Date.now()
    const body = route.method === 'POST' ? await request.text() : undefined
    if (route.method === 'POST' && !body) logEvent('warn', { event: 'empty-body', path: url.pathname })

    try {
      const upstream = await fetch(`${env.API_BASE}/${route.trigger}`, {
        method: route.method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      })
      const ms = Date.now() - started
      const headers = { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' }
      if (!upstream.ok) {
        // Read the body for the log, then pass it on unchanged.
        const text = await upstream.text()
        logEvent('error', { event: 'upstream-error', path: url.pathname, status: upstream.status, ms, body: text.slice(0, 500) })
        return new Response(text, { status: upstream.status, headers })
      }
      logEvent('log', { event: 'proxied', method: route.method, path: url.pathname, status: upstream.status, ms })
      // Pass the body and status through, but not upstream cookies or caching headers.
      return new Response(upstream.body, { status: upstream.status, headers })
    } catch (e) {
      logEvent('error', { event: 'upstream-unreachable', path: url.pathname, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) })
      return json({ error: 'Upstream API unreachable' }, 502)
    }
  },
} satisfies ExportedHandler<Env>
