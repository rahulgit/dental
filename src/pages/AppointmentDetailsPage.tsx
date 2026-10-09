import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ClinicalNote, ClinicalRecord, ProcedureEntry, ToothFinding } from '../types'
import { capitalize, formatDate, formatTime, shortSession } from '../lib/format'
import { emptyNote } from '../data/seed'
import { useDemoStore } from '../store/DemoStore'
import AppointmentFormModal from '../components/AppointmentFormModal'
import Odontogram from '../components/clinical/Odontogram'
import { ListEditor, ProcedureEditor, TextField, ToothFindingsEditor } from '../components/clinical/editors'
import { AlertIcon, CalendarIcon, ChevronLeftIcon, ClockIcon, InfoIcon, PencilIcon, PlusIcon } from '../components/icons'
import { Missing, StatusBadge, TextOrMissing, btn } from '../components/ui'

const SECTIONS = [
  { id: 'patient', title: 'Patient information' },
  { id: 'complaint', title: 'Chief complaint and history' },
  { id: 'medical', title: 'Medical background' },
  { id: 'exam', title: 'Dental examination' },
  { id: 'radiographs', title: 'Radiographs and assessment' },
  { id: 'plan', title: 'Treatment plan' },
  { id: 'procedures', title: 'Procedures performed' },
  { id: 'prescriptions', title: 'Prescriptions' },
  { id: 'aftercare', title: 'Aftercare and follow-up' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/** Drop blank list entries and blank optional fields before saving — blank ≠ recorded. */
function cleanNote(note: ClinicalNote): ClinicalNote {
  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean)
  const findings = note.toothFindings
    .map((f): ToothFinding => ({ tooth: f.tooth.trim(), surfaces: f.surfaces.trim(), finding: f.finding.trim() }))
    .filter((f) => f.tooth || f.surfaces || f.finding)
  const procedures = note.proceduresPerformed
    .map((p): ProcedureEntry => {
      const entry: ProcedureEntry = { tooth: p.tooth.trim(), procedure: p.procedure.trim(), materials: p.materials.trim() }
      if (p.surfaces?.trim()) entry.surfaces = p.surfaces.trim()
      if (p.notes?.trim()) entry.notes = p.notes.trim()
      return entry
    })
    .filter((p) => p.tooth || p.procedure || p.materials || p.surfaces || p.notes)
  return {
    ...note,
    allergies: list(note.allergies),
    treatmentPlan: list(note.treatmentPlan),
    prescriptions: list(note.prescriptions),
    redFlags: list(note.redFlags),
    toothFindings: findings,
    proceduresPerformed: procedures,
  }
}

export default function AppointmentDetailsPage() {
  const { sessionId = '' } = useParams()
  const { appointments, records, saveRecord, notify } = useDemoStore()
  const appointment = appointments.find((a) => a.sessionId === sessionId)
  const stored = records[sessionId]

  const [draft, setDraft] = useState<ClinicalRecord | null>(null)
  const [editingAppointment, setEditingAppointment] = useState(false)
  const editing = draft !== null

  useEffect(() => {
    if (!editing) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editing])

  if (!appointment && !stored) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-red-700">
          <AlertIcon className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Appointment not found</h1>
        <p className="mt-1 text-sm text-slate-600">
          No appointment or clinical record exists for session <span className="font-mono">{shortSession(sessionId)}</span>. It may have been
          removed when demo data was reset.
        </p>
        <Link to="/appointments" className={`${btn.primary} mt-6`}>
          <ChevronLeftIcon /> Back to appointments
        </Link>
      </div>
    )
  }

  // Appointments created in the demo have no clinical record until the first save.
  const record: ClinicalRecord = stored ?? {
    sessionId,
    patientId: appointment?.patientId ?? '',
    patientName: appointment?.patientName ?? '',
    note: emptyNote(),
  }
  const current = draft ?? record
  const note = current.note

  const setNote = (patch: Partial<ClinicalNote>) =>
    setDraft((d) => (d ? { ...d, note: { ...d.note, ...patch } } : d))

  const startEdit = (addProcedure = false) => {
    const copy: ClinicalRecord = structuredClone(record)
    if (addProcedure) copy.note.proceduresPerformed.push({ tooth: '', procedure: '', materials: '' })
    setDraft(copy)
    if (addProcedure) requestAnimationFrame(() => document.getElementById('procedures')?.scrollIntoView())
  }

  const cancelEdit = () => setDraft(null)

  const save = () => {
    if (!draft) return
    const ok = saveRecord({ ...draft, note: cleanNote(draft.note) })
    setDraft(null)
    if (ok) notify('Clinical record saved')
  }

  const section = (id: SectionId, children: ReactNode, action?: ReactNode) => {
    const index = SECTIONS.findIndex((s) => s.id === id)
    return (
      <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 id={`${id}-title`} className="flex items-center gap-3 font-semibold text-slate-900">
            <span className="font-mono text-xs font-medium text-teal-700">{String(index + 1).padStart(2, '0')}</span>
            {SECTIONS[index].title}
          </h2>
          {action}
        </div>
        <div className="space-y-5 px-5 py-4">{children}</div>
      </section>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link to="/appointments" className="inline-flex items-center gap-1 font-medium text-teal-800 underline underline-offset-4 hover:text-teal-900">
          <ChevronLeftIcon /> Appointments
        </Link>
        <span aria-hidden="true" className="text-slate-600">/</span>
        <span aria-current="page" className="text-slate-600">
          Appointment Details
        </span>
      </nav>

      {/* Patient header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{record.patientName || <Missing label="Unnamed patient" />}</h1>
              {appointment && <StatusBadge status={appointment.status} />}
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
              <div>
                <dt className="inline text-slate-600">Patient ID: </dt>
                <dd className="inline font-medium">{record.patientId || <Missing />}</dd>
              </div>
              <div>
                <dt className="inline text-slate-600">Session: </dt>
                <dd className="inline font-mono" title={record.sessionId}>
                  {shortSession(record.sessionId)}
                </dd>
              </div>
            </dl>
            {note.chiefComplaint && (
              <p className="mt-3 inline-flex rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-800 ring-1 ring-inset ring-rose-600/20">
                {note.chiefComplaint}
              </p>
            )}
          </div>

          {appointment && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm lg:min-w-72">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900">{appointment.type}</p>
                <button type="button" className={btn.ghost} onClick={() => setEditingAppointment(true)} aria-label="Edit appointment schedule">
                  <PencilIcon />
                </button>
              </div>
              <div className="mt-2 space-y-1.5 text-slate-600">
                <p className="flex items-center gap-2">
                  <CalendarIcon className="size-4 text-slate-500" /> {formatDate(appointment.date)}
                </p>
                <p className="flex items-center gap-2">
                  <ClockIcon className="size-4 text-slate-500" /> {formatTime(appointment.time)}
                </p>
                <p className="text-xs text-slate-600">
                  {appointment.appointmentId} · Dentist: {appointment.dentist || <Missing label="Not assigned" />}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {!stored && !editing && (
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <p>No clinical note has been recorded for this appointment yet. Use “Edit clinical record” to start one.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <aside className="hidden lg:block">
          <nav aria-label="Clinical record sections" className="sticky top-24 space-y-0.5">
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Clinical record</p>
            {SECTIONS.map((s, i) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900"
              >
                <span className="font-mono text-xs leading-6 text-slate-600">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Editing clinical record' : 'Clinical overview'}</h2>
            {!editing && (
              <button type="button" className={btn.primary} onClick={() => startEdit()}>
                <PencilIcon /> Edit clinical record
              </button>
            )}
          </div>

          {section(
            'patient',
            <dl className="grid gap-4 sm:grid-cols-3">
              <Item label="Patient name">
                <TextOrMissing value={current.patientName} />
              </Item>
              <Item label="Patient ID">
                <TextOrMissing value={current.patientId} />
              </Item>
              <Item label="Session ID">
                <span className="break-all font-mono text-xs">{current.sessionId}</span>
              </Item>
            </dl>,
          )}

          {section(
            'complaint',
            editing ? (
              <>
                <TextField label="Chief complaint" value={note.chiefComplaint} onChange={(v) => setNote({ chiefComplaint: v })} />
                <TextField
                  label="History of present illness"
                  multiline
                  value={note.historyOfPresentIllness}
                  onChange={(v) => setNote({ historyOfPresentIllness: v })}
                />
              </>
            ) : (
              <dl className="space-y-4">
                <Item label="Chief complaint">
                  <TextOrMissing value={note.chiefComplaint} />
                </Item>
                <Item label="History of present illness">
                  <TextOrMissing value={note.historyOfPresentIllness} />
                </Item>
              </dl>
            ),
          )}

          {section(
            'medical',
            editing ? (
              <>
                <TextField label="Medical history" multiline value={note.medicalHistory} onChange={(v) => setNote({ medicalHistory: v })} />
                <TextField label="Current medications" multiline value={note.medications} onChange={(v) => setNote({ medications: v })} />
                <ListEditor label="Allergies" itemLabel="Allergy" items={note.allergies} onChange={(v) => setNote({ allergies: v })} />
              </>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-3">
                <Item label="Medical history">
                  <TextOrMissing value={note.medicalHistory} />
                </Item>
                <Item label="Current medications">
                  <TextOrMissing value={note.medications} />
                </Item>
                <Item label="Allergies">
                  <Chips items={note.allergies} tone="bg-amber-50 text-amber-800 ring-amber-600/25" />
                </Item>
              </dl>
            ),
          )}

          {section(
            'exam',
            <>
            <Odontogram note={note} editing={editing} onChange={setNote} />
            {editing ? (
              <>
                <ToothFindingsEditor findings={note.toothFindings} onChange={(v) => setNote({ toothFindings: v })} />
                <TextField label="Periodontal examination" multiline value={note.periodontal} onChange={(v) => setNote({ periodontal: v })} />
                <TextField label="Soft tissue examination" multiline value={note.softTissue} onChange={(v) => setNote({ softTissue: v })} />
              </>
            ) : (
              <>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-600">Tooth findings</h3>
                  {note.toothFindings.length === 0 ? (
                    <Missing />
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                          <tr>
                            <th scope="col" className="px-4 py-2 font-medium">Tooth</th>
                            <th scope="col" className="px-4 py-2 font-medium">Surfaces</th>
                            <th scope="col" className="px-4 py-2 font-medium">Finding</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {note.toothFindings.map((f, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2.5"><TextOrMissing value={f.tooth} /></td>
                              <td className="px-4 py-2.5"><TextOrMissing value={f.surfaces} /></td>
                              <td className="px-4 py-2.5 text-slate-900">{f.finding ? capitalize(f.finding) : <Missing />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Item label="Periodontal">
                    <TextOrMissing value={note.periodontal} />
                  </Item>
                  <Item label="Soft tissue">
                    <TextOrMissing value={note.softTissue} />
                  </Item>
                </dl>
              </>
            )}
            </>,
          )}

          {section(
            'radiographs',
            editing ? (
              <>
                <TextField label="Radiographs" multiline value={note.radiographs} onChange={(v) => setNote({ radiographs: v })} />
                <TextField label="Clinical assessment" multiline value={note.assessment} onChange={(v) => setNote({ assessment: v })} />
              </>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label="Radiographs">
                  <TextOrMissing value={note.radiographs} />
                </Item>
                <Item label="Clinical assessment">
                  <TextOrMissing value={note.assessment} />
                </Item>
              </dl>
            ),
          )}

          {section(
            'plan',
            editing ? (
              <ListEditor label="Planned procedures" itemLabel="Plan item" items={note.treatmentPlan} onChange={(v) => setNote({ treatmentPlan: v })} />
            ) : (
              <BulletList items={note.treatmentPlan} />
            ),
          )}

          {section(
            'procedures',
            editing ? (
              <ProcedureEditor procedures={note.proceduresPerformed} onChange={(v) => setNote({ proceduresPerformed: v })} />
            ) : note.proceduresPerformed.length === 0 ? (
              <Missing label="No procedures recorded" />
            ) : (
              <ul className="space-y-3">
                {note.proceduresPerformed.map((p, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">{p.procedure ? capitalize(p.procedure) : <Missing label="Procedure not specified" />}</p>
                    <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
                      <Item label="Tooth">
                        <TextOrMissing value={p.tooth} missing="Not specified" />
                      </Item>
                      <Item label="Surfaces">
                        <TextOrMissing value={p.surfaces} missing="Not specified" />
                      </Item>
                      <Item label="Materials">
                        <TextOrMissing value={p.materials} missing="Not specified" />
                      </Item>
                      {p.notes && (
                        <div className="sm:col-span-3">
                          <Item label="Notes">{p.notes}</Item>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            ),
            !editing && (
              <button type="button" className={`${btn.ghost} text-teal-700`} onClick={() => startEdit(true)}>
                <PlusIcon /> Add procedure
              </button>
            ),
          )}

          {section(
            'prescriptions',
            editing ? (
              <ListEditor
                label="Prescriptions"
                itemLabel="Prescription"
                placeholder="Drug, dose, frequency, duration"
                items={note.prescriptions}
                onChange={(v) => setNote({ prescriptions: v })}
              />
            ) : (
              <BulletList items={note.prescriptions} />
            ),
          )}

          {section(
            'aftercare',
            editing ? (
              <>
                <TextField
                  label="Post-operative instructions"
                  multiline
                  value={note.postOpInstructions}
                  onChange={(v) => setNote({ postOpInstructions: v })}
                />
                <TextField label="Follow-up" multiline value={note.followUp} onChange={(v) => setNote({ followUp: v })} />
                <ListEditor label="Red flags" itemLabel="Red flag" items={note.redFlags} onChange={(v) => setNote({ redFlags: v })} />
              </>
            ) : (
              <dl className="space-y-4">
                <Item label="Post-operative instructions">
                  <TextOrMissing value={note.postOpInstructions} />
                </Item>
                <Item label="Follow-up">
                  <TextOrMissing value={note.followUp} />
                </Item>
                <Item label="Red flags">
                  {note.redFlags.length === 0 ? (
                    <Missing />
                  ) : (
                    <ul className="mt-1 space-y-1.5">
                      {note.redFlags.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-red-800">
                          <AlertIcon className="mt-0.5 size-4 shrink-0" /> {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </Item>
              </dl>
            ),
          )}

          <p className="text-xs text-slate-600">
            Clinical content is displayed as recorded. Empty fields are shown as “Not recorded” and are not confirmed negative findings.
          </p>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-slate-600">You are editing the clinical record. Changes are not saved until you click Save.</p>
            <div className="flex gap-2">
              <button type="button" className={`${btn.secondary} flex-1 sm:flex-none`} onClick={cancelEdit}>
                Cancel
              </button>
              <button type="button" className={`${btn.primary} flex-1 sm:flex-none`} onClick={save}>
                Save clinical record
              </button>
            </div>
          </div>
        </div>
      )}

      {editingAppointment && appointment && (
        <AppointmentFormModal appointment={appointment} onClose={() => setEditingAppointment(false)} />
      )}
    </div>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="mt-1 max-w-prose whitespace-pre-line text-sm leading-relaxed text-slate-900">{children}</dd>
    </div>
  )
}

function Chips({ items, tone }: { items: string[]; tone: string }) {
  if (items.length === 0) return <Missing />
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((x, i) => (
        <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
          {x}
        </span>
      ))}
    </span>
  )
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <Missing />
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-900">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}
