// Client for the injomo workflow API, reached via the Worker proxy (worker/index.ts).
// Responses are normalised here so the rest of the app keeps its own data shapes.

import type { Appointment, AppointmentStatus, ClinicalNote } from '../types'
import { APPOINTMENT_STATUSES } from '../types'
import { normalizeNote } from '../data/seed'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`)
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return text
  }
}

/** API dates are DD-MM-YYYY; the app uses ISO YYYY-MM-DD. */
function toISO(date: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : date
}

export type ApiAppointment = Omit<Appointment, 'patientName'>

export async function fetchAppointments(): Promise<ApiAppointment[]> {
  const data = await request('/api/appointments')
  if (!Array.isArray(data)) throw new Error('Unexpected appointment list response')
  return data
    .map((v) => (v ?? {}) as Record<string, unknown>)
    .filter((o) => str(o.appointmentId) && str(o.sessionId))
    .map((o) => ({
      appointmentId: str(o.appointmentId),
      sessionId: str(o.sessionId),
      patientId: str(o.patientId),
      date: toISO(str(o.date)),
      time: str(o.time),
      type: str(o.type),
      dentist: str(o.dentist),
      status: (APPOINTMENT_STATUSES as readonly string[]).includes(str(o.status))
        ? (o.status as AppointmentStatus)
        : 'Scheduled',
    }))
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
  const rows = Array.isArray(data) ? data : [data]
  // If several rows come back, the last one is the most recent save.
  const row = rows
    .map((v) => (v ?? {}) as Record<string, unknown>)
    .filter((o) => o.note !== undefined && o.note !== null && o.note !== '')
    .at(-1)
  if (!row) return null
  let note: unknown = row.note
  if (typeof note === 'string') {
    try {
      note = JSON.parse(note)
    } catch {
      note = {}
    }
  }
  return normalizeNote(note)
}

export async function saveConsultation(appointmentId: string, note: ClinicalNote): Promise<void> {
  await request('/api/consultation/save', {
    method: 'POST',
    // `note` is stored as a JSON string, matching what the fetch endpoint returns.
    body: JSON.stringify({ appointment_id: appointmentId, note: JSON.stringify(note) }),
  })
}
