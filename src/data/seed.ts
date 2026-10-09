import type { Appointment, AppointmentStatus, ClinicalNote, ClinicalRecord, ProcedureEntry, ToothFinding } from '../types'
import { APPOINTMENT_STATUSES } from '../types'
import { parseCsv } from '../lib/csv'
import patientsCsv from './patients.csv?raw'
import appointmentsCsv from './appointments.csv?raw'
import consultationsCsv from './consultations.csv?raw'

// --- Normalisation: tolerate missing / malformed fields (PRD AD-11) ---------

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const strList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
    : []

function normalizeFinding(v: unknown): ToothFinding {
  const o = (v ?? {}) as Record<string, unknown>
  return { tooth: str(o.tooth), surfaces: str(o.surfaces), finding: str(o.finding) }
}

function normalizeProcedure(v: unknown): ProcedureEntry {
  const o = (v ?? {}) as Record<string, unknown>
  const entry: ProcedureEntry = {
    tooth: str(o.tooth),
    procedure: str(o.procedure),
    materials: str(o.materials),
  }
  if (typeof o.surfaces === 'string') entry.surfaces = o.surfaces
  if (typeof o.notes === 'string') entry.notes = o.notes
  return entry
}

export function emptyNote(): ClinicalNote {
  return normalizeNote({})
}

export function normalizeNote(v: unknown): ClinicalNote {
  const o = (v ?? {}) as Record<string, unknown>
  return {
    chiefComplaint: str(o.chiefComplaint),
    historyOfPresentIllness: str(o.historyOfPresentIllness),
    medicalHistory: str(o.medicalHistory),
    medications: str(o.medications),
    allergies: strList(o.allergies),
    toothFindings: Array.isArray(o.toothFindings) ? o.toothFindings.map(normalizeFinding) : [],
    periodontal: str(o.periodontal),
    softTissue: str(o.softTissue),
    radiographs: str(o.radiographs),
    assessment: str(o.assessment),
    treatmentPlan: strList(o.treatmentPlan),
    proceduresPerformed: Array.isArray(o.proceduresPerformed)
      ? o.proceduresPerformed.map(normalizeProcedure)
      : [],
    prescriptions: strList(o.prescriptions),
    postOpInstructions: str(o.postOpInstructions),
    followUp: str(o.followUp),
    redFlags: strList(o.redFlags),
  }
}

export function normalizeRecord(v: unknown): ClinicalRecord | null {
  const o = (v ?? {}) as Record<string, unknown>
  if (typeof o.sessionId !== 'string' || !o.sessionId) return null
  return {
    sessionId: o.sessionId,
    patientId: str(o.patientId),
    patientName: str(o.patientName),
    note: normalizeNote(o.note),
  }
}

// --- Seed data (CSV) ---------------------------------------------------------
//
// patients.csv       patientId (PK), patientName
// appointments.csv   appointmentId (PK), sessionId, patientId (FK), date, time, type, dentist, status
// consultations.csv  sessionId (PK), appointmentId (FK), patientId (FK), note (clinical note as JSON)
//
// Scheduling (appointments) stays separate from the clinical record (consultations),
// linked by sessionId / appointmentId as the PRD requires.

function patientNames(): Map<string, string> {
  return new Map(parseCsv(patientsCsv).map((p) => [p.patientId, p.patientName]))
}

export function seedAppointments(): Appointment[] {
  const names = patientNames()
  return parseCsv(appointmentsCsv)
    .filter((a) => a.appointmentId && a.sessionId)
    .map((a) => ({
      appointmentId: a.appointmentId,
      sessionId: a.sessionId,
      patientId: a.patientId,
      patientName: names.get(a.patientId) ?? '',
      date: a.date,
      time: a.time,
      type: a.type,
      dentist: a.dentist,
      status: (APPOINTMENT_STATUSES as readonly string[]).includes(a.status) ? (a.status as AppointmentStatus) : 'Scheduled',
    }))
}

function parseNote(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

export function seedRecords(): Record<string, ClinicalRecord> {
  const names = patientNames()
  const out: Record<string, ClinicalRecord> = {}
  for (const c of parseCsv(consultationsCsv)) {
    const record = normalizeRecord({
      sessionId: c.sessionId,
      patientId: c.patientId,
      patientName: names.get(c.patientId) ?? '',
      note: parseNote(c.note),
    })
    if (record) out[record.sessionId] = record
  }
  return out
}
