// Clinical record — mirrors the supplied JSON data contract (PRD §4).

export type ToothFinding = {
  tooth: string
  surfaces: string
  finding: string
}

export type ProcedureEntry = {
  tooth: string
  procedure: string
  materials: string
  // Optional extensions (PRD §3.5) — only written when filled in.
  surfaces?: string
  notes?: string
}

export type ClinicalNote = {
  chiefComplaint: string
  historyOfPresentIllness: string
  medicalHistory: string
  medications: string
  allergies: string[]
  toothFindings: ToothFinding[]
  periodontal: string
  softTissue: string
  radiographs: string
  assessment: string
  treatmentPlan: string[]
  proceduresPerformed: ProcedureEntry[]
  prescriptions: string[]
  postOpInstructions: string
  followUp: string
  redFlags: string[]
}

export type ClinicalRecord = {
  sessionId: string
  patientId: string
  patientName: string
  note: ClinicalNote
}

// Scheduling data — kept separate from the clinical record, linked by sessionId.

export const APPOINTMENT_STATUSES = [
  'Scheduled',
  'Checked In',
  'In Progress',
  'Completed',
  'Cancelled',
] as const

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export type Appointment = {
  appointmentId: string
  sessionId: string
  patientId: string
  patientName: string
  date: string // YYYY-MM-DD
  time: string // HH:mm
  type: string
  dentist: string
  status: AppointmentStatus
}
