import type { Appointment } from '../types'

/** Next sequential appointment ID after the highest existing one (APT-1001, APT-1002, …). */
export function newAppointmentId(appointments: Appointment[]): string {
  const max = appointments.reduce((m, a) => {
    const n = Number(a.appointmentId.replace(/\D/g, ''))
    return Number.isFinite(n) && n > m ? n : m
  }, 1000)
  return `APT-${max + 1}`
}

export function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}
