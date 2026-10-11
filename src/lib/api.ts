// Client for the injomo workflow API, reached via the Worker proxy (worker/index.ts).
// Responses are normalised here so the rest of the app keeps its own data shapes.

import type { Appointment, AppointmentStatus, ClinicalNote } from '../types'
import { APPOINTMENT_STATUSES } from '../types'
import { normalizeNote } from '../data/seed'
import { debugState, logger } from './debug'

const log = logger('API')

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const started = performance.now()
  const ms = () => Math.round(performance.now() - started)
  log.log(`→ ${init?.method ?? 'GET'} ${path}`, init?.body ? safeJson(String(init.body)) : undefined)

  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    debugState.recordApiCall({ at: new Date().toISOString(), path, status: 'network-error', ms: ms(), error })
    log.error(`${path}: network error (Worker unreachable or browser offline)`, e)
    throw new Error(`Could not reach the server (${error})`)
  }

  const text = await res.text()
  debugState.recordApiCall({ at: new Date().toISOString(), path, status: res.status, ms: ms(), error: res.ok ? undefined : text.slice(0, 300) })
  if (!res.ok) {
    // 404/405 come from the Worker's route guard; 502 means the Worker couldn't reach the upstream API.
    log.error(`${path}: HTTP ${res.status} after ${ms()} ms`, text.slice(0, 500))
    throw new Error(`API ${path} failed with ${res.status}`)
  }
  if (!text) {
    log.warn(`${path}: empty response body`)
    return null
  }
  const data = safeJson(text)
  if (typeof data === 'string') log.warn(`${path}: response is not JSON`, text.slice(0, 500))
  else log.log(`← ${path} ${res.status} in ${ms()} ms`, data)
  return data
}

/** API dates are DD-MM-YYYY; the app uses ISO YYYY-MM-DD. */
function toISO(date: string, appointmentId: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date.trim())
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    log.warn(`${appointmentId}: unrecognised date "${date}" (expected DD-MM-YYYY); shown as-is and won't match date filters`)
  }
  return date
}

function toStatus(v: unknown, appointmentId: string): AppointmentStatus {
  const s = str(v)
  if ((APPOINTMENT_STATUSES as readonly string[]).includes(s)) return s as AppointmentStatus
  log.warn(`${appointmentId}: unknown status "${s}", shown as Scheduled`)
  return 'Scheduled'
}

export type ApiAppointment = Omit<Appointment, 'patientName'>

export async function fetchAppointments(): Promise<ApiAppointment[]> {
  const data = await request('/api/appointments')
  if (!Array.isArray(data)) {
    log.error('Appointment list: expected an array', data)
    throw new Error('Unexpected appointment list response')
  }
  const rows = data.map((v) => (v ?? {}) as Record<string, unknown>)
  const valid = rows.filter((o) => str(o.appointmentId) && str(o.sessionId))
  if (valid.length < rows.length) {
    log.warn(`Appointment list: dropped ${rows.length - valid.length} row(s) without appointmentId/sessionId`, rows.filter((o) => !valid.includes(o)))
  }
  if (valid.length === 0) log.warn('Appointment list is empty')
  else log.log(`Loaded ${valid.length} appointment(s)`)

  return valid.map((o) => {
    const appointmentId = str(o.appointmentId)
    if (!str(o.patientId)) log.warn(`${appointmentId}: no patientId`)
    return {
      appointmentId,
      sessionId: str(o.sessionId),
      patientId: str(o.patientId),
      date: toISO(str(o.date), appointmentId),
      time: str(o.time),
      type: str(o.type),
      dentist: str(o.dentist),
      status: toStatus(o.status, appointmentId),
    }
  })
}

/**
 * Returns the consultation note for an appointment, or null if none is recorded.
 * The API returns `[{ jsCodes, workflow_log_id }]` (no `note`) when there isn't one.
 */
export async function fetchConsultation(appointmentId: string): Promise<ClinicalNote | null> {
  const data = await request('/api/consultation/fetch', {
    method: 'POST',
    body: JSON.stringify({ appointment_id: appointmentId }),
  })
  const rows = (Array.isArray(data) ? data : [data]).map((v) => (v ?? {}) as Record<string, unknown>)
  // If several rows come back, the last one is the most recent save.
  const withNote = rows.filter((o) => o.note !== undefined && o.note !== null && o.note !== '')
  const row = withNote.at(-1)
  if (!row) {
    log.log(`${appointmentId}: no consultation recorded`, data)
    return null
  }
  if (withNote.length > 1) log.log(`${appointmentId}: ${withNote.length} consultation rows, using the last`)

  let note: unknown = row.note
  if (typeof note === 'string') {
    try {
      note = JSON.parse(note)
    } catch (e) {
      log.error(`${appointmentId}: consultation note is not valid JSON; showing an empty note`, { error: e, note: String(row.note).slice(0, 500) })
      note = {}
    }
  }
  if (!note || typeof note !== 'object' || Array.isArray(note)) {
    log.warn(`${appointmentId}: consultation note is not an object; showing an empty note`, note)
  }
  return normalizeNote(note)
}

export async function saveConsultation(appointmentId: string, note: ClinicalNote): Promise<void> {
  log.log(`Saving consultation for ${appointmentId}`)
  await request('/api/consultation/save', {
    method: 'POST',
    // `note` is stored as a JSON string, matching what the fetch endpoint returns.
    body: JSON.stringify({ appointment_id: appointmentId, note: JSON.stringify(note) }),
  })
  log.log(`Saved consultation for ${appointmentId}`)
}
