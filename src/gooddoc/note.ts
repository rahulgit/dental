// Mapping between the GoodDoc panel's ambient dental note and this app's ClinicalNote.
//
// The two share field names, but the panel structures some lists:
//   allergies      { allergen, reaction }                              → "Penicillin (rash)"
//   treatmentPlan  { tooth, procedure, priority }                      → "#46 Filling (high priority)"
//   prescriptions  { name, dosage, frequency, duration, instructions } → "Amoxicillin 500 mg, TID, 5 days. With food"

import type { ClinicalNote } from '../types'
import { normalizeNote } from '../data/seed'

type Row = Record<string, unknown>

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const rows = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const joined = (...parts: string[]) => parts.filter(Boolean).join(', ')

/** Each list entry may be a plain string or the panel's structured object. */
function listOf(v: unknown, format: (o: Row) => string): string[] {
  return rows(v)
    .map((x) => (typeof x === 'string' ? x.trim() : x && typeof x === 'object' ? format(x as Row) : ''))
    .filter(Boolean)
}

const allergy = (o: Row) => {
  const allergen = text(o.allergen)
  const reaction = text(o.reaction)
  return allergen && reaction ? `${allergen} (${reaction})` : allergen || reaction
}

const planStep = (o: Row) => {
  const tooth = text(o.tooth)
  const priority = text(o.priority)
  const step = [tooth && `#${tooth.replace(/^#/, '')}`, text(o.procedure)].filter(Boolean).join(' ')
  return priority && step ? `${step} (${priority.toLowerCase()} priority)` : step
}

const prescription = (o: Row) => {
  const main = joined([text(o.name), text(o.dosage)].filter(Boolean).join(' '), text(o.frequency), text(o.duration))
  const instructions = text(o.instructions)
  return instructions ? (main ? `${main}. ${instructions}` : instructions) : main
}

export function fromAmbientNote(v: unknown): ClinicalNote {
  const o = (v ?? {}) as Row
  return normalizeNote({
    ...o,
    allergies: listOf(o.allergies, allergy),
    treatmentPlan: listOf(o.treatmentPlan, planStep),
    prescriptions: listOf(o.prescriptions, prescription),
    redFlags: listOf(o.redFlags, (x) => text(x.text ?? x.flag)),
  })
}

const isEmpty = (v: unknown) => (Array.isArray(v) ? v.length === 0 : typeof v !== 'string' || v.trim() === '')

/**
 * Lay the reviewed ambient note over the existing record. Fields the scribe filled in win;
 * fields it left empty keep what's already charted, so nothing recorded by hand is erased.
 */
export function mergeAmbientNote(base: ClinicalNote, incoming: ClinicalNote): { note: ClinicalNote; updated: (keyof ClinicalNote)[] } {
  const note = { ...base }
  const updated: (keyof ClinicalNote)[] = []
  for (const key of Object.keys(incoming) as (keyof ClinicalNote)[]) {
    const value = incoming[key]
    if (isEmpty(value) || JSON.stringify(value) === JSON.stringify(base[key])) continue
    ;(note as Record<string, unknown>)[key] = value
    updated.push(key)
  }
  return { note, updated }
}
