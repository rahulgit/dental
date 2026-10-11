import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Appointment, ClinicalRecord } from '../types'
import { patientName } from '../data/seed'
import { fetchAppointments, fetchConsultation, saveConsultation } from '../lib/api'
import { logger } from '../lib/debug'

const log = logger('Store')

type Toast = { id: number; message: string; kind: 'success' | 'error' }

export type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' }

/** Consultation for a session: `record` is null when none has been recorded yet. */
export type RecordState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; record: ClinicalRecord | null }

type DemoStore = {
  appointments: Appointment[]
  appointmentsState: LoadState
  reloadAppointments: () => void
  saveAppointment: (appointment: Appointment) => boolean
  records: Record<string, RecordState>
  loadRecord: (appointment: Appointment, force?: boolean) => void
  saveRecord: (appointment: Appointment, record: ClinicalRecord) => Promise<boolean>
  /** Latest saved record, fetching it if this session hasn't loaded it yet. Throws if the fetch fails. */
  getRecord: (appointment: Appointment) => Promise<ClinicalRecord | null>
  toast: Toast | null
  notify: (message: string, kind?: Toast['kind']) => void
  dismissToast: () => void
}

const StoreContext = createContext<DemoStore | null>(null)

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error')

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [remote, setRemote] = useState<Appointment[]>([])
  // Appointment create/edit has no API endpoint yet, so those changes are kept
  // in memory for this session and layered over the API data.
  const [local, setLocal] = useState<Record<string, Appointment>>({})
  const [appointmentsState, setAppointmentsState] = useState<LoadState>({ status: 'loading' })
  const [records, setRecords] = useState<Record<string, RecordState>>({})
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    window.clearTimeout(timer.current)
    // Error toasts are user-facing failures; keep them in the log too.
    if (kind === 'error') log.error(`Toast: ${message}`)
    setToast({ id: Date.now(), message, kind })
    timer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const reloadAppointments = useCallback(() => {
    setAppointmentsState({ status: 'loading' })
    fetchAppointments()
      .then((list) => {
        const named = list.map((a) => ({ ...a, patientName: patientName(a.patientId) }))
        const unnamed = [...new Set(named.filter((a) => !a.patientName).map((a) => a.patientId))]
        if (unnamed.length) log.warn(`No name in patients.csv for ${unnamed.join(', ')}; showing the patient ID instead`)
        setRemote(named)
        setAppointmentsState({ status: 'ready' })
      })
      .catch((e) => {
        log.error('Could not load appointments', e)
        setAppointmentsState({ status: 'error', message: errorMessage(e) })
      })
  }, [])

  useEffect(reloadAppointments, [reloadAppointments])

  const appointments = useMemo(() => {
    const ids = new Set(remote.map((a) => a.appointmentId))
    return [...remote.map((a) => local[a.appointmentId] ?? a), ...Object.values(local).filter((a) => !ids.has(a.appointmentId))]
  }, [remote, local])

  const saveAppointment = useCallback((appointment: Appointment) => {
    log.log(`Appointment ${appointment.appointmentId} saved locally (no appointment API; lost on reload)`, appointment)
    setLocal((l) => ({ ...l, [appointment.appointmentId]: appointment }))
    return true
  }, [])

  const toRecord = (appointment: Appointment, note: ClinicalRecord['note']): ClinicalRecord => ({
    sessionId: appointment.sessionId,
    patientId: appointment.patientId,
    patientName: appointment.patientName,
    note,
  })

  // Tracks which sessions have been requested, so callers can ask freely without refetching.
  const requested = useRef(new Set<string>())

  const loadRecord = useCallback((appointment: Appointment, force = false) => {
    const key = appointment.sessionId
    if (requested.current.has(key) && !force) return
    requested.current.add(key)
    setRecords((r) => ({ ...r, [key]: { status: 'loading' } }))
    fetchConsultation(appointment.appointmentId)
      .then((note) =>
        setRecords((r) => ({ ...r, [key]: { status: 'ready', record: note ? toRecord(appointment, note) : null } })),
      )
      .catch((e) => {
        log.error(`Could not load consultation for ${appointment.appointmentId}`, e)
        setRecords((r) => ({ ...r, [key]: { status: 'error', message: errorMessage(e) } }))
      })
  }, [])

  const recordsRef = useRef(records)
  recordsRef.current = records

  const getRecord = useCallback(async (appointment: Appointment) => {
    const cached = recordsRef.current[appointment.sessionId]
    if (cached?.status === 'ready') return cached.record
    const note = await fetchConsultation(appointment.appointmentId)
    const record = note ? toRecord(appointment, note) : null
    requested.current.add(appointment.sessionId)
    setRecords((r) => ({ ...r, [appointment.sessionId]: { status: 'ready', record } }))
    return record
  }, [])

  const saveRecord = useCallback(
    async (appointment: Appointment, record: ClinicalRecord) => {
      try {
        await saveConsultation(appointment.appointmentId, record.note)
        setRecords((r) => ({ ...r, [record.sessionId]: { status: 'ready', record } }))
        return true
      } catch (e) {
        log.error(`Could not save consultation for ${appointment.appointmentId}`, e)
        notify(`Could not save clinical record: ${errorMessage(e)}`, 'error')
        return false
      }
    },
    [notify],
  )

  const value = useMemo(
    () => ({
      appointments,
      appointmentsState,
      reloadAppointments,
      saveAppointment,
      records,
      loadRecord,
      saveRecord,
      getRecord,
      toast,
      notify,
      dismissToast,
    }),
    [appointments, appointmentsState, reloadAppointments, saveAppointment, records, loadRecord, saveRecord, getRecord, toast, notify, dismissToast],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useDemoStore(): DemoStore {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useDemoStore must be used inside DemoStoreProvider')
  return ctx
}
