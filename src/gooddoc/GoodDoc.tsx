// GoodDoc Control Panel integration (@gooddoc/gd-plugin).
//
// - <GoodDocProvider> mounts the panel (floating launcher + Ctrl+G) and the bridge below.
// - useGoodDocPatient(appointment) tells the panel which patient/appointment is on screen.
// - The bridge answers the panel: ambient notes are saved to the chart, follow-up requests
//   create appointments, "visit summary" reads recent appointments, "Open visits" navigates.
//
// Configured by VITE_GD_API_KEY (see .env.example). Without it the integration is
// switched off and the app runs exactly as before.

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GDPluginProvider,
  useGDPlugin,
  usePluginContext,
  usePluginMessage,
  usePluginRequestHandler,
} from '@gooddoc/gd-plugin/react'
import type { Appointment } from '../types'
import { emptyNote } from '../data/seed'
import { formatDate, todayISO, toISODate } from '../lib/format'
import { newAppointmentId, newSessionId } from '../lib/ids'
import { useDemoStore } from '../store/DemoStore'
import { fromAmbientNote, mergeAmbientNote } from './note'

const apiKey = import.meta.env.VITE_GD_API_KEY
export const GOODDOC_ENABLED = Boolean(apiKey)
const apiBaseUrl =   'https://gd-plugin-api.vizru-aix.workers.dev';
const panelUrl =  'https://gd-plugin-panel.vizru-aix.workers.dev';

// The appointment currently on screen. Ambient notes arriving for this patient are filed against it.
let activeAppointment: Appointment | null = null

type AmbientNoteMessage = { sessionId?: string; patientId?: string; patientName?: string; note?: unknown }
type FollowUpRequest = { patientId?: string; type?: string; inMonths?: number }

export function GoodDocProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  if (!GOODDOC_ENABLED) return <>{children}</>

  return (
    <GDPluginProvider
      apiKey={apiKey!}
      apiBaseUrl={apiBaseUrl}
      panelUrl={panelUrl}
      hotkey="ctrl+g"
      // The panel speaks in /patients/:id paths; this app lists a patient's visits on the appointments page.
      onNavigateRequest={(path) => {
        const patient = /^\/patients\/([^/?#]+)/.exec(path)
        if (patient) navigate(`/appointments?q=${encodeURIComponent(decodeURIComponent(patient[1]))}`)
        else if (path.startsWith('/appointments')) navigate(path)
        else return false
      }}
      onError={(e) => console.warn(`[GoodDoc] Control Panel unavailable (${e.code}): ${e.message}`)}
    >
      <GoodDocBridge />
      {children}
    </GDPluginProvider>
  )
}

/** Best appointment to file a patient's note against: today's, else the most recent past, else the next one. */
function appointmentFor(appointments: Appointment[], patientId: string): Appointment | undefined {
  const today = todayISO()
  const mine = appointments
    .filter((a) => a.patientId === patientId && a.status !== 'Cancelled')
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  return mine.find((a) => a.date === today) ?? mine.find((a) => a.date < today) ?? mine.at(-1)
}

function GoodDocBridge() {
  const { appointments, saveAppointment, getRecord, saveRecord, notify } = useDemoStore()
  // GoodDoc ambient session → the appointment that was open when recording started.
  const sessions = useRef(new Map<string, string>())

  usePluginMessage<{ sessionId?: string; patientId?: string }>('ambient.started', ({ sessionId, patientId }) => {
    if (sessionId && activeAppointment && activeAppointment.patientId === patientId) {
      sessions.current.set(sessionId, activeAppointment.sessionId)
    }
  })

  // The clinician reviewed, confirmed and saved the note in the panel: file it in the chart.
  usePluginMessage<AmbientNoteMessage>('ambient.note', async (data) => {
    const patientId = data.patientId ?? ''
    const started = data.sessionId ? sessions.current.get(data.sessionId) : undefined
    const target =
      appointments.find((a) => a.sessionId === started) ??
      (activeAppointment?.patientId === patientId ? activeAppointment : undefined) ??
      appointmentFor(appointments, patientId)
    const who = data.patientName || target?.patientName || patientId || 'this patient'
    if (!target) return notify(`GoodDoc note for ${who} received, but there is no appointment to file it against.`, 'error')

    try {
      const existing = await getRecord(target)
      const { note, updated } = mergeAmbientNote(existing?.note ?? emptyNote(), fromAmbientNote(data.note))
      if (updated.length === 0) return notify(`GoodDoc note for ${who} matches the chart. Nothing to update.`)
      const ok = await saveRecord(target, {
        sessionId: target.sessionId,
        patientId: target.patientId,
        patientName: target.patientName,
        note,
      })
      if (ok) notify(`GoodDoc note saved to ${who}’s chart (${target.appointmentId}) · ${updated.length} field${updated.length > 1 ? 's' : ''} updated`)
    } catch (e) {
      notify(`Could not save the GoodDoc note: ${e instanceof Error ? e.message : 'unknown error'}`, 'error')
    }
  })

  // "Book follow-up" in the panel. There is no appointment API yet, so this is kept for the session.
  usePluginMessage<FollowUpRequest>('appointment.requested', ({ patientId = '', type, inMonths = 6 }) => {
    const last = appointmentFor(appointments, patientId) ?? appointments.find((a) => a.patientId === patientId)
    const date = new Date()
    date.setMonth(date.getMonth() + inMonths)
    const appointment: Appointment = {
      appointmentId: newAppointmentId(appointments),
      sessionId: newSessionId(),
      patientId,
      patientName: last?.patientName ?? '',
      date: toISODate(date),
      time: '09:00',
      type: type === 'recall' ? `${inMonths}-month recall` : type || 'Follow-up',
      dentist: last?.dentist ?? '',
      status: 'Scheduled',
    }
    saveAppointment(appointment)
    notify(`Follow-up booked for ${appointment.patientName || patientId} on ${formatDate(appointment.date)} (${appointment.appointmentId})`)
  })

  usePluginMessage<{ patientId?: string; kind?: string }>('report.requested', ({ kind }) =>
    notify(`GoodDoc ${kind ? kind.replace(/-/g, ' ') + ' ' : ''}report requested. It will appear in GoodDoc when ready.`),
  )

  // "Send summary to chart". The summary is built from this app's own visit list, so there's nothing new to store.
  usePluginMessage<{ items?: unknown[] }>('summary.ready', ({ items }) =>
    notify(`GoodDoc visit summary received (${items?.length ?? 0} visit${items?.length === 1 ? '' : 's'})`),
  )

  // "Prepare visit summary": the patient's visits from this app, newest first.
  usePluginRequestHandler('host.getRecentActivity', (params) => {
    const { patientId } = (params ?? {}) as { patientId?: string }
    return appointments
      .filter((a) => a.patientId === patientId)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
      .slice(0, 10)
      .map((a) => ({ title: a.type, date: formatDate(a.date), detail: `${a.status} · ${a.appointmentId}` }))
  })

  return null
}

function useGoodDocPatientLive(appointment: Appointment | undefined) {
  usePluginContext(
    appointment
      ? {
          patient: {
            id: appointment.patientId,
            name: appointment.patientName || appointment.patientId,
            ...(appointment.dentist ? { primaryDentist: appointment.dentist } : {}),
          },
          appointment: {
            id: appointment.appointmentId,
            type: appointment.type,
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
          },
        }
      : null,
  )
  useEffect(() => {
    activeAppointment = appointment ?? null
    return () => {
      if (activeAppointment?.sessionId === appointment?.sessionId) activeAppointment = null
    }
  }, [appointment])
}

function useGoodDocLive() {
  const gd = useGDPlugin()
  // A failed connection (bad key, origin not registered, GoodDoc unreachable) hides GoodDoc UI.
  return { enabled: gd.status !== 'error' && gd.status !== 'destroyed', ready: gd.isReady, isOpen: gd.isOpen, show: gd.show }
}

const disabled = { enabled: false, ready: false, isOpen: false, show: () => {} }

// Chosen once at load, so hook order never changes between renders.
/** Tell the panel which patient and appointment are on screen while the calling page is mounted. */
export const useGoodDocPatient: (appointment: Appointment | undefined) => void = GOODDOC_ENABLED ? useGoodDocPatientLive : () => {}
/** Panel status and controls; `enabled` is false when GoodDoc isn't configured. */
export const useGoodDoc: () => typeof disabled = GOODDOC_ENABLED ? useGoodDocLive : () => disabled
