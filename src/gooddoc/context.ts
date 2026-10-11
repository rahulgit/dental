// What DentalCare HMS shares with the GoodDoc panel about the appointment on screen:
// the patient (with visit history), the appointment, its dentist, and the full consultation.
//
// The panel receives this as its context (usePluginContext) and can fetch the same shape for
// any appointment with `await gd.request('host.getConsultation', { appointmentId })`.

import type { PanelContext } from '@gooddoc/gd-plugin'
import type { Appointment, ClinicalNote } from '../types'
import type { RecordState } from '../store/DemoStore'

export type ConsultationStatus = 'loading' | 'recorded' | 'not-recorded' | 'error'

export type SharedConsultation = {
  appointmentId: string
  sessionId: string
  status: ConsultationStatus
  /** The saved clinical note, all fields (HMS format). Present when status is "recorded". */
  note?: ClinicalNote
  error?: string
}

const visit = (a: Appointment) => ({
  appointmentId: a.appointmentId,
  sessionId: a.sessionId,
  date: a.date, // YYYY-MM-DD
  time: a.time, // HH:mm
  type: a.type,
  status: a.status,
  ...(a.dentist ? { dentist: a.dentist } : {}),
})

export function sharedConsultation(appointment: Appointment, state: RecordState | undefined): SharedConsultation {
  const base = { appointmentId: appointment.appointmentId, sessionId: appointment.sessionId }
  if (!state || state.status === 'loading') return { ...base, status: 'loading' }
  if (state.status === 'error') return { ...base, status: 'error', error: state.message }
  return state.record ? { ...base, status: 'recorded', note: state.record.note } : { ...base, status: 'not-recorded' }
}

export function buildContext(appointment: Appointment, appointments: Appointment[], record: RecordState | undefined): PanelContext {
  const visits = appointments
    .filter((a) => a.patientId === appointment.patientId)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .map(visit)
  const dentist = appointment.dentist

  return {
    patient: {
      id: appointment.patientId,
      name: appointment.patientName || appointment.patientId,
      ...(dentist ? { primaryDentist: dentist } : {}),
      visits,
    },
    ...(dentist ? { provider: { id: dentist, name: dentist } } : {}),
    appointment: { id: appointment.appointmentId, ...visit(appointment) },
    consultation: sharedConsultation(appointment, record),
  }
}
