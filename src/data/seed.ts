import type { ClinicalNote, ClinicalRecord, ProcedureEntry, ToothFinding } from '../types'
import { parseCsv } from '../lib/csv'
import patientsCsv from './patients.csv?raw'

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

// --- Patient directory (CSV) ----------------------------------------------
//
// patients.csv   patientId (PK), patientName
//
// Appointments and consultations come from the API (src/lib/api.ts); the API
// has no patient names, so they are looked up here by patientId.

let names: Map<string, string> | undefined

export function patientName(patientId: string): string {
  names ??= new Map(parseCsv(patientsCsv).map((p) => [p.patientId, p.patientName]))
  return names.get(patientId) ?? ''
}
