// Cloudflare Worker: serves the built SPA and proxies /api/* to the injomo
// workflow API. The browser only ever talks to this origin, so the upstream's
// missing CORS headers don't matter, and endpoint IDs stay out of the bundle.

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
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const route = ROUTES[url.pathname]
    if (!route) return json({ error: 'Not found' }, 404)
    if (request.method !== route.method) return json({ error: 'Method not allowed' }, 405)

    try {
      const upstream = await fetch(`${env.API_BASE}/${route.trigger}`, {
        method: route.method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: route.method === 'POST' ? await request.text() : undefined,
      })
      // Pass the body and status through, but not upstream cookies or caching headers.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    } catch {
      return json({ error: 'Upstream API unreachable' }, 502)
    }
  },
} satisfies ExportedHandler<Env>
