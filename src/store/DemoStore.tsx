import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Appointment, ClinicalRecord } from '../types'
import { APPOINTMENT_STATUSES } from '../types'
import { normalizeRecord, seedAppointments, seedRecords } from '../data/seed'

// Demo persistence only — browser storage is NOT secure storage for real patient data.
const APPOINTMENTS_KEY = 'dentalcare-hms.appointments.v1'
const RECORDS_KEY = 'dentalcare-hms.records.v1'

type Toast = { id: number; message: string; kind: 'success' | 'error' }

type DemoStore = {
  appointments: Appointment[]
  records: Record<string, ClinicalRecord>
  saveAppointment: (appointment: Appointment) => boolean
  saveRecord: (record: ClinicalRecord) => boolean
  resetDemo: () => void
  toast: Toast | null
  notify: (message: string, kind?: Toast['kind']) => void
  dismissToast: () => void
}

const StoreContext = createContext<DemoStore | null>(null)

function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function loadAppointments(): Appointment[] {
  const stored = readJSON(APPOINTMENTS_KEY)
  if (!Array.isArray(stored)) return seedAppointments()
  return stored.filter(
    (a): a is Appointment =>
      a && typeof a.appointmentId === 'string' && typeof a.sessionId === 'string',
  ).map((a) => ({
    ...a,
    dentist: a.dentist ?? '',
    status: APPOINTMENT_STATUSES.includes(a.status) ? a.status : 'Scheduled',
  }))
}

function loadRecords(): Record<string, ClinicalRecord> {
  const stored = readJSON(RECORDS_KEY)
  if (!stored || typeof stored !== 'object') return seedRecords()
  const out: Record<string, ClinicalRecord> = {}
  for (const value of Object.values(stored)) {
    const record = normalizeRecord(value)
    if (record) out[record.sessionId] = record
  }
  return out
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [appointments, setAppointments] = useState(loadAppointments)
  const [records, setRecords] = useState(loadRecords)
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), message, kind })
    timer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const saveAppointment = useCallback(
    (appointment: Appointment) => {
      const exists = appointments.some((a) => a.appointmentId === appointment.appointmentId)
      const next = exists
        ? appointments.map((a) => (a.appointmentId === appointment.appointmentId ? appointment : a))
        : [...appointments, appointment]
      setAppointments(next)
      const ok = writeJSON(APPOINTMENTS_KEY, next)
      if (!ok) notify('Appointment updated for this session, but could not be saved to browser storage.', 'error')
      return ok
    },
    [appointments, notify],
  )

  const saveRecord = useCallback(
    (record: ClinicalRecord) => {
      const next = { ...records, [record.sessionId]: record }
      setRecords(next)
      const ok = writeJSON(RECORDS_KEY, next)
      if (!ok) notify('Clinical record updated for this session, but could not be saved to browser storage.', 'error')
      return ok
    },
    [records, notify],
  )

  const resetDemo = useCallback(() => {
    const a = seedAppointments()
    const r = seedRecords()
    setAppointments(a)
    setRecords(r)
    const ok = writeJSON(APPOINTMENTS_KEY, a) && writeJSON(RECORDS_KEY, r)
    notify(ok ? 'Demo data reset' : 'Demo data reset, but browser storage is unavailable.', ok ? 'success' : 'error')
  }, [notify])

  const value = useMemo(
    () => ({ appointments, records, saveAppointment, saveRecord, resetDemo, toast, notify, dismissToast }),
    [appointments, records, saveAppointment, saveRecord, resetDemo, toast, notify, dismissToast],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useDemoStore(): DemoStore {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useDemoStore must be used inside DemoStoreProvider')
  return ctx
}
