// Console logging and a global inspection object for the demo. Everything is logged
// (it's a demo): failures as console.error/warn, everything else as console.log.
//
// In the browser console, `__DENTALCARE__` shows GoodDoc status and config, the context last
// sent to the panel, recent panel messages and requests, API calls and the log.
// `__DENTALCARE__.dump()` prints a summary.

type Entry = { at: string; level: 'log' | 'warn' | 'error'; scope: string; message: string; data?: unknown }
const MAX_ENTRIES = 200

/** Mask a secret so it can be shown in logs: "gd_test_demo1234" → "gd_test_…1234". */
export const mask = (v: string | undefined) => (!v ? '(not set)' : v.length <= 8 ? '****' : `${v.slice(0, 8)}…${v.slice(-4)}`)

const state = {
  mode: import.meta.env.MODE,
  gooddoc: {
    enabled: false,
    status: 'off' as string,
    error: null as null | { code: string; message: string; at: string },
    lastContext: null as unknown,
    messages: [] as { at: string; topic: string; data: unknown }[],
    requests: [] as { at: string; method: string; params: unknown; ok: boolean; error?: string }[],
  } as Record<string, unknown> & {
    status: string
    error: null | { code: string; message: string; at: string }
    lastContext: unknown
    messages: { at: string; topic: string; data: unknown }[]
    requests: { at: string; method: string; params: unknown; ok: boolean; error?: string }[]
  },
  api: {
    calls: [] as { at: string; path: string; status: number | 'network-error'; ms: number; error?: string }[],
  },
  log: [] as Entry[],
}

const push = <T>(list: T[], item: T) => {
  list.push(item)
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES)
}

const now = () => new Date().toISOString()

function write(level: Entry['level'], scope: string, message: string, data?: unknown) {
  push(state.log, { at: now(), level, scope, message, data })
  const line = `[${scope}] ${message}`
  const args = data === undefined ? [line] : [line, data]
  console[level](...args)
}

export type Logger = { log: (message: string, data?: unknown) => void; warn: (message: string, data?: unknown) => void; error: (message: string, data?: unknown) => void }

/** A logger for one area of the app, e.g. logger('API'). */
export function logger(scope: string): Logger {
  return {
    log: (m, d) => write('log', scope, m, d),
    warn: (m, d) => write('warn', scope, m, d),
    error: (m, d) => write('error', scope, m, d),
  }
}

/** Live state other modules record into; also exposed as window.__DENTALCARE__. */
export const debugState = {
  gooddoc: state.gooddoc,
  recordApiCall: (call: (typeof state.api.calls)[number]) => push(state.api.calls, call),
  recordMessage: (topic: string, data: unknown) => push(state.gooddoc.messages, { at: now(), topic, data }),
  recordRequest: (r: Omit<(typeof state.gooddoc.requests)[number], 'at'>) => push(state.gooddoc.requests, { at: now(), ...r }),
  setGoodDocError: (code: string, message: string) => (state.gooddoc.error = { code, message, at: now() }),
}

const globalApi = {
  ...state,
  /** Print a readable summary of everything above. */
  dump() {
    console.group('DentalCare HMS debug')
    console.log('Mode', state.mode)
    console.log('GoodDoc', { ...state.gooddoc, messages: state.gooddoc.messages.length, requests: state.gooddoc.requests.length })
    console.log('Last context sent to GoodDoc', state.gooddoc.lastContext)
    console.table(state.api.calls.slice(-20))
    console.table(state.log.filter((e) => e.level !== 'log').slice(-20))
    console.groupEnd()
    return 'See the grouped output above.'
  },
}

declare global {
  interface Window {
    __DENTALCARE__: typeof globalApi
  }
}

window.__DENTALCARE__ = globalApi

logger('Debug').log(`DentalCare HMS (${import.meta.env.MODE}). Inspect window.__DENTALCARE__ or run __DENTALCARE__.dump().`)
