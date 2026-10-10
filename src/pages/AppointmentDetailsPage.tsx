import { useEffect, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ClinicalNote, ClinicalRecord, ProcedureEntry, ToothFinding } from '../types'
import { capitalize, formatDate, formatTime, shortSession } from '../lib/format'
import { emptyNote } from '../data/seed'
import { useDemoStore } from '../store/DemoStore'
import { useGoodDoc, useGoodDocPatient } from '../gooddoc/GoodDoc'
import AppointmentFormModal from '../components/AppointmentFormModal'
import Odontogram from '../components/clinical/Odontogram'
import { ListEditor, ProcedureEditor, TextField, ToothFindingsEditor } from '../components/clinical/editors'
import { AlertIcon, CalendarIcon, ChevronLeftIcon, ClockIcon, InfoIcon, MicIcon, PencilIcon, PlusIcon, RefreshIcon } from '../components/icons'
import { ConfirmDialog, LoadPanel, Missing, StatusBadge, TextOrMissing, btn, isPlaceholder } from '../components/ui'

const filled = (v: string) => !isPlaceholder(v)

type NoteKey = keyof ClinicalNote

// Each section owns some note fields (`keys`, saved together; the exam's odontogram can also chart
// procedures) and reports which are filled in, so the sidebar can show how complete it is.
const SECTIONS: readonly { id: SectionId; title: string; keys: readonly NoteKey[]; fields: (n: ClinicalNote) => boolean[] }[] = [
  { id: 'complaint', title: 'Chief complaint and history', keys: ['chiefComplaint', 'historyOfPresentIllness'], fields: (n) => [filled(n.chiefComplaint), filled(n.historyOfPresentIllness)] },
  { id: 'medical', title: 'Medical background', keys: ['medicalHistory', 'medications', 'allergies'], fields: (n) => [filled(n.medicalHistory), filled(n.medications), n.allergies.length > 0] },
  { id: 'exam', title: 'Dental examination', keys: ['toothFindings', 'periodontal', 'softTissue', 'proceduresPerformed'], fields: (n) => [n.toothFindings.length > 0, filled(n.periodontal), filled(n.softTissue)] },
  { id: 'radiographs', title: 'Radiographs and assessment', keys: ['radiographs', 'assessment'], fields: (n) => [filled(n.radiographs), filled(n.assessment)] },
  { id: 'plan', title: 'Treatment plan', keys: ['treatmentPlan'], fields: (n) => [n.treatmentPlan.length > 0] },
  { id: 'procedures', title: 'Procedures performed', keys: ['proceduresPerformed'], fields: (n) => [n.proceduresPerformed.length > 0] },
  { id: 'prescriptions', title: 'Prescriptions', keys: ['prescriptions'], fields: (n) => [n.prescriptions.length > 0] },
  { id: 'aftercare', title: 'Aftercare and follow-up', keys: ['postOpInstructions', 'followUp', 'redFlags'], fields: (n) => [filled(n.postOpInstructions), filled(n.followUp), n.redFlags.length > 0] },
]

type SectionId = 'complaint' | 'medical' | 'exam' | 'radiographs' | 'plan' | 'procedures' | 'prescriptions' | 'aftercare'

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

/** The fields a section owns, cleaned. A section save writes only these onto the latest saved note,
 *  so it never overwrites changes made elsewhere in the meantime (e.g. a GoodDoc ambient note). */
const sectionPart = (id: SectionId, note: ClinicalNote): Partial<ClinicalNote> => {
  const clean = cleanNote(note)
  return Object.fromEntries(SECTIONS.find((s) => s.id === id)!.keys.map((k) => [k, clean[k]]))
}

const sameSection = (id: SectionId, a: ClinicalNote, b: ClinicalNote) => JSON.stringify(sectionPart(id, a)) === JSON.stringify(sectionPart(id, b))

const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

type EditTarget = { id: SectionId; addProcedure?: boolean }

export default function AppointmentDetailsPage() {
  const { sessionId = '' } = useParams()
  const { appointments, appointmentsState, reloadAppointments, records, loadRecord, saveRecord, notify } = useDemoStore()
  const appointment = appointments.find((a) => a.sessionId === sessionId)
  const recordState = records[sessionId]
  const ready = appointmentsState.status === 'ready' && recordState?.status === 'ready'
  const goodDoc = useGoodDoc()
  useGoodDocPatient(appointment)

  // One section is edited at a time; the draft is a full copy of the note because the API saves the whole note.
  const [editingId, setEditingId] = useState<SectionId | null>(null)
  const [draft, setDraft] = useState<ClinicalNote | null>(null)
  const [pending, setPending] = useState<EditTarget | 'cancel' | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(false)
  const [active, setActive] = useState<SectionId>('complaint')

  useEffect(() => {
    if (appointment) loadRecord(appointment)
  }, [appointment, loadRecord])

  const stored = recordState?.status === 'ready' ? recordState.record : null
  const savedNote = stored?.note ?? null
  const dirty = draft !== null && editingId !== null && !sameSection(editingId, draft, savedNote ?? emptyNote())

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Scroll-spy: the active section is the last one whose top has passed the sticky header.
  useEffect(() => {
    if (!ready) return
    let frame = 0
    const update = () => {
      frame = 0
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      const passed = SECTIONS.filter((s) => (document.getElementById(s.id)?.getBoundingClientRect().top ?? Infinity) <= 140)
      setActive(atBottom ? SECTIONS[SECTIONS.length - 1].id : (passed.at(-1) ?? SECTIONS[0]).id)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [ready])

  if (!ready) {
    const loadingRecord = appointmentsState.status === 'ready'
    if (loadingRecord && !appointment) return <NotFound sessionId={sessionId} />
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white shadow-sm">
        <LoadPanel
          state={loadingRecord ? (recordState ?? { status: 'loading' }) : appointmentsState}
          label={loadingRecord ? 'clinical record' : 'appointment'}
          onRetry={() => (loadingRecord && appointment ? loadRecord(appointment, true) : reloadAppointments())}
        />
      </div>
    )
  }
  if (!appointment) return <NotFound sessionId={sessionId} />

  // Appointments without a consultation in the API have no clinical record until the first save.
  const record: ClinicalRecord = stored ?? {
    sessionId,
    patientId: appointment.patientId,
    patientName: appointment.patientName,
    note: emptyNote(),
  }
  const saved = record.note
  const view = (id: SectionId) => (editingId === id && draft ? draft : saved)
  const setNote = (patch: Partial<ClinicalNote>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const begin = ({ id, addProcedure }: EditTarget) => {
    const copy = structuredClone(saved)
    if (addProcedure) copy.proceduresPerformed.push({ tooth: '', procedure: '', materials: '' })
    setDraft(copy)
    setEditingId(id)
    requestAnimationFrame(() => {
      scrollToSection(id)
      const field = document.querySelector<HTMLElement>(`#${id} :is(input, textarea, select)`)
      if (field && !addProcedure) field.focus({ preventScroll: true })
    })
  }

  const close = () => {
    setDraft(null)
    setEditingId(null)
  }

  // Switching sections or cancelling with unsaved changes asks first.
  const requestEdit = (target: EditTarget) => (dirty ? setPending(target) : begin(target))
  const requestCancel = () => (dirty ? setPending('cancel') : close())

  const save = async () => {
    if (!draft || !editingId || saving) return
    if (!dirty) return close()
    setSaving(true)
    const ok = await saveRecord(appointment, { ...record, note: { ...saved, ...sectionPart(editingId, draft) } })
    setSaving(false)
    // On failure keep the section open so no edits are lost; the store shows the error.
    if (ok) {
      notify(`${SECTIONS.find((s) => s.id === editingId)?.title} saved`)
      close()
    }
  }

  const onSectionKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('dialog')) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      requestCancel()
    }
  }

  const section = (id: SectionId, viewContent: ReactNode, editContent: () => ReactNode, extraAction?: ReactNode) => {
    const index = SECTIONS.findIndex((s) => s.id === id)
    const editing = editingId === id
    return (
      <section
        id={id}
        aria-labelledby={`${id}-title`}
        onKeyDown={editing ? onSectionKeyDown : undefined}
        className={`scroll-mt-24 rounded-xl border bg-white shadow-sm transition-shadow ${
          editing ? 'border-teal-600 ring-4 ring-teal-600/10' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 id={`${id}-title`} className="flex items-center gap-3 font-semibold text-slate-900">
            <span className="font-mono text-xs font-medium text-teal-700">{String(index + 1).padStart(2, '0')}</span>
            {SECTIONS[index].title}
            {editing && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">Editing</span>}
          </h2>
          {!editing && (
            <div className="flex items-center gap-1">
              {extraAction}
              <button
                type="button"
                className={btn.ghost}
                onClick={() => requestEdit({ id })}
                aria-label={`Edit ${SECTIONS[index].title.toLowerCase()}`}
              >
                <PencilIcon /> Edit
              </button>
            </div>
          )}
        </div>
        <div className="space-y-5 px-5 py-4">{editing ? editContent() : viewContent}</div>
        {editing && (
          <div className="sticky bottom-0 flex flex-col gap-3 rounded-b-xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-slate-600" aria-live="polite">
              {dirty ? (
                <>
                  <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" /> Unsaved changes
                </>
              ) : (
                'No changes yet'
              )}
              <span className="hidden text-xs text-slate-500 md:inline">· Ctrl+S to save · Esc to cancel</span>
            </p>
            <div className="flex gap-2">
              <button type="button" className={`${btn.secondary} flex-1 sm:flex-none`} onClick={requestCancel} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={`${btn.primary} flex-1 sm:flex-none`} onClick={save} disabled={saving || !dirty}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </section>
    )
  }

  /** Empty-state for a view: says nothing is recorded and offers to add it in place. */
  const emptyAdd = (id: SectionId, label: string, missing = 'Not recorded') => (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Missing label={missing} />
      <button type="button" className={`${btn.ghost} -ml-2 text-teal-700`} onClick={() => requestEdit({ id })}>
        <PlusIcon /> {label}
      </button>
    </span>
  )

  const isEmptyRecord = !stored
  const n = (id: SectionId) => view(id)

  return (
    <div className="space-y-6 pb-16">
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
              <StatusBadge status={appointment.status} />
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
              <div>
                <dt className="inline">Patient ID: </dt>
                <dd className="inline font-medium text-slate-800">{record.patientId || <Missing />}</dd>
              </div>
              <div>
                <dt className="inline">Session: </dt>
                <dd className="inline font-mono" title={record.sessionId}>
                  {shortSession(record.sessionId)}
                </dd>
              </div>
            </dl>
            {saved.chiefComplaint && (
              <p className="mt-3 inline-flex rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-800 ring-1 ring-inset ring-rose-600/20">
                {saved.chiefComplaint}
              </p>
            )}
            {goodDoc.enabled && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={goodDoc.show}
                  disabled={!goodDoc.ready}
                  title={goodDoc.ready ? 'Open the GoodDoc Control Panel (Ctrl+G)' : 'GoodDoc is connecting…'}
                >
                  <MicIcon /> Ambient scribe
                </button>
                <span className="text-xs text-slate-600">
                  {goodDoc.ready ? 'Reviewed GoodDoc notes are saved to this chart automatically.' : 'Connecting to GoodDoc…'}
                </span>
              </div>
            )}
          </div>

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
        </div>
      </header>

      {isEmptyRecord && !editingId ? (
        <div className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50 p-5 text-sky-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <InfoIcon className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">No clinical note recorded yet</p>
              <p className="mt-0.5 text-sm text-sky-800">Start with the chief complaint. Each section is saved on its own, so you can fill it in as the visit goes.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {goodDoc.ready && (
              <button type="button" className={btn.secondary} onClick={goodDoc.show}>
                <MicIcon /> Record with GoodDoc
              </button>
            )}
            <button type="button" className={btn.primary} onClick={() => requestEdit({ id: 'complaint' })}>
              <PlusIcon /> Start clinical note
            </button>
          </div>
        </div>
      ) : (
        !isEmptyRecord && <Summary note={saved} />
      )}

      {/* Section chips on small screens */}
      <nav aria-label="Clinical record sections" className="sticky top-[61px] z-10 -mx-4 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur lg:hidden">
        <div className="flex gap-1.5">
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                active === s.id ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300'
              }`}
            >
              {i + 1}. {s.title}
            </a>
          ))}
        </div>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">
          <nav aria-label="Clinical record sections" className="sticky top-24">
            <div className="mb-2 flex items-center justify-between px-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Clinical record</p>
              <button
                type="button"
                className={`${btn.ghost} -mr-2 px-1.5 py-1`}
                onClick={() => loadRecord(appointment, true)}
                disabled={!!editingId}
                title={editingId ? 'Finish editing to reload' : 'Reload from API'}
                aria-label="Reload clinical record from API"
              >
                <RefreshIcon className="size-3.5" />
              </button>
            </div>
            <ul className="space-y-0.5">
              {SECTIONS.map((s, i) => {
                const fields = s.fields(view(s.id))
                const done = fields.filter(Boolean).length
                const editing = editingId === s.id
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      aria-current={active === s.id ? 'location' : undefined}
                      className={`flex items-start gap-2 rounded-md border-l-2 px-3 py-1.5 text-sm ${
                        active === s.id ? 'border-teal-700 bg-white font-medium text-slate-900 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      <span className="font-mono text-xs leading-5 text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                      <span className="flex-1 leading-5">{s.title}</span>
                      {editing ? (
                        <PencilIcon className="mt-0.5 size-3.5 text-teal-700" aria-label="Editing" />
                      ) : (
                        <span
                          className={`mt-1.5 size-2 shrink-0 rounded-full ${done === fields.length ? 'bg-emerald-500' : done > 0 ? 'bg-amber-400' : 'bg-slate-300'}`}
                          title={`${done} of ${fields.length} recorded`}
                        >
                          <span className="sr-only">
                            {done} of {fields.length} recorded
                          </span>
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Complete</span>
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-400" /> Partial</span>
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-slate-300" /> Empty</span>
            </p>
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          {section(
            'complaint',
            <dl className="space-y-4">
              <Item label="Chief complaint">
                <TextOrMissing value={saved.chiefComplaint} />
              </Item>
              <Item label="History of present illness">
                <TextOrMissing value={saved.historyOfPresentIllness} />
              </Item>
            </dl>,
            () => (
              <>
                <TextField label="Chief complaint" placeholder="e.g. Toothache, lower right" value={n('complaint').chiefComplaint} onChange={(v) => setNote({ chiefComplaint: v })} />
                <TextField
                  label="History of present illness"
                  multiline
                  placeholder="Onset, duration, triggers, severity…"
                  value={n('complaint').historyOfPresentIllness}
                  onChange={(v) => setNote({ historyOfPresentIllness: v })}
                />
              </>
            ),
          )}

          {section(
            'medical',
            <dl className="grid gap-4 sm:grid-cols-3">
              <Item label="Medical history">
                <TextOrMissing value={saved.medicalHistory} />
              </Item>
              <Item label="Current medications">
                <TextOrMissing value={saved.medications} />
              </Item>
              <Item label="Allergies">
                {saved.allergies.length === 0 ? (
                  emptyAdd('medical', 'Add allergy', 'None recorded')
                ) : (
                  <Chips items={saved.allergies} tone="bg-amber-50 text-amber-800 ring-amber-600/25" />
                )}
              </Item>
            </dl>,
            () => (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField label="Medical history" multiline value={n('medical').medicalHistory} onChange={(v) => setNote({ medicalHistory: v })} />
                  <TextField label="Current medications" multiline value={n('medical').medications} onChange={(v) => setNote({ medications: v })} />
                </div>
                <ListEditor label="Allergies" itemLabel="Allergy" placeholder="e.g. Penicillin" items={n('medical').allergies} onChange={(v) => setNote({ allergies: v })} />
              </>
            ),
          )}

          {section(
            'exam',
            <>
              <Odontogram note={saved} editing={false} onChange={setNote} />
              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-600">Tooth findings</h3>
                {saved.toothFindings.length === 0 ? (
                  emptyAdd('exam', 'Add tooth finding')
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th scope="col" className="w-24 px-4 py-2 font-medium">Tooth</th>
                          <th scope="col" className="w-28 px-4 py-2 font-medium">Surfaces</th>
                          <th scope="col" className="px-4 py-2 font-medium">Finding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {saved.toothFindings.map((f, i) => (
                          <tr key={i} className="align-top">
                            <td className="px-4 py-2.5"><TextOrMissing value={f.tooth} missing="—" /></td>
                            <td className="px-4 py-2.5"><TextOrMissing value={f.surfaces} missing="—" /></td>
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
                  <TextOrMissing value={saved.periodontal} />
                </Item>
                <Item label="Soft tissue">
                  <TextOrMissing value={saved.softTissue} />
                </Item>
              </dl>
            </>,
            () => (
              <>
                <Odontogram note={n('exam')} editing onChange={setNote} />
                <ToothFindingsEditor findings={n('exam').toothFindings} onChange={(v) => setNote({ toothFindings: v })} />
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField label="Periodontal examination" multiline value={n('exam').periodontal} onChange={(v) => setNote({ periodontal: v })} />
                  <TextField label="Soft tissue examination" multiline value={n('exam').softTissue} onChange={(v) => setNote({ softTissue: v })} />
                </div>
              </>
            ),
          )}

          {section(
            'radiographs',
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Radiographs">
                <TextOrMissing value={saved.radiographs} />
              </Item>
              <Item label="Clinical assessment">
                <TextOrMissing value={saved.assessment} />
              </Item>
            </dl>,
            () => (
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Radiographs" multiline placeholder="Views taken and findings" value={n('radiographs').radiographs} onChange={(v) => setNote({ radiographs: v })} />
                <TextField label="Clinical assessment" multiline placeholder="Diagnosis / working diagnosis" value={n('radiographs').assessment} onChange={(v) => setNote({ assessment: v })} />
              </div>
            ),
          )}

          {section(
            'plan',
            saved.treatmentPlan.length === 0 ? emptyAdd('plan', 'Add plan item') : <NumberedList items={saved.treatmentPlan} />,
            () => (
              <ListEditor label="Planned steps" itemLabel="Plan item" numbered items={n('plan').treatmentPlan} onChange={(v) => setNote({ treatmentPlan: v })} />
            ),
          )}

          {section(
            'procedures',
            saved.proceduresPerformed.length === 0 ? (
              emptyAdd('procedures', 'Add procedure', 'No procedures recorded')
            ) : (
              <ul className="space-y-3">
                {saved.proceduresPerformed.map((p, i) => (
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
            () => <ProcedureEditor procedures={n('procedures').proceduresPerformed} onChange={(v) => setNote({ proceduresPerformed: v })} />,
            saved.proceduresPerformed.length > 0 && (
              <button type="button" className={`${btn.ghost} text-teal-700`} onClick={() => requestEdit({ id: 'procedures', addProcedure: true })}>
                <PlusIcon /> Add
              </button>
            ),
          )}

          {section(
            'prescriptions',
            saved.prescriptions.length === 0 ? emptyAdd('prescriptions', 'Add prescription', 'None prescribed') : <BulletList items={saved.prescriptions} />,
            () => (
              <ListEditor
                label="Prescriptions"
                itemLabel="Prescription"
                placeholder="Drug, dose, frequency, duration"
                items={n('prescriptions').prescriptions}
                onChange={(v) => setNote({ prescriptions: v })}
              />
            ),
          )}

          {section(
            'aftercare',
            <dl className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Item label="Post-operative instructions">
                  <TextOrMissing value={saved.postOpInstructions} />
                </Item>
                <Item label="Follow-up">
                  <TextOrMissing value={saved.followUp} />
                </Item>
              </div>
              <Item label="Red flags — seek urgent care if">
                {saved.redFlags.length === 0 ? (
                  emptyAdd('aftercare', 'Add red flag')
                ) : (
                  <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {saved.redFlags.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-red-800">
                        <AlertIcon className="mt-0.5 size-4 shrink-0" /> {r}
                      </li>
                    ))}
                  </ul>
                )}
              </Item>
            </dl>,
            () => (
              <>
                <TextField
                  label="Post-operative instructions"
                  multiline
                  value={n('aftercare').postOpInstructions}
                  onChange={(v) => setNote({ postOpInstructions: v })}
                />
                <TextField label="Follow-up" multiline value={n('aftercare').followUp} onChange={(v) => setNote({ followUp: v })} />
                <ListEditor label="Red flags" itemLabel="Red flag" items={n('aftercare').redFlags} onChange={(v) => setNote({ redFlags: v })} />
              </>
            ),
          )}

          <p className="text-xs text-slate-600">
            Clinical content is displayed as recorded. Empty fields are shown as “Not recorded” and are not confirmed negative findings.
          </p>
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message={`Your changes to “${SECTIONS.find((s) => s.id === editingId)?.title}” haven’t been saved.`}
          confirmLabel="Discard changes"
          danger
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const target = pending
            setPending(null)
            if (target === 'cancel') close()
            else begin(target)
          }}
        />
      )}

      {editingAppointment && <AppointmentFormModal appointment={appointment} onClose={() => setEditingAppointment(false)} />}
    </div>
  )
}

/** The facts a clinician checks first, pulled up from the sections below. */
function Summary({ note }: { note: ClinicalNote }) {
  const tile = (id: SectionId, label: string, body: ReactNode, tone = 'border-slate-200') => (
    <button
      type="button"
      onClick={() => scrollToSection(id)}
      className={`group flex flex-col justify-start rounded-xl border bg-white p-4 text-left shadow-sm hover:border-teal-600 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${tone}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 group-hover:text-teal-800">{label}</p>
      <div className="mt-1.5 text-sm text-slate-900">{body}</div>
    </button>
  )
  return (
    <section aria-label="Clinical summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tile('radiographs', 'Assessment', <p className="line-clamp-3">{note.assessment ? <TextOrMissing value={note.assessment} /> : <Missing />}</p>)}
      {tile(
        'medical',
        'Allergies',
        note.allergies.length ? <Chips items={note.allergies} tone="bg-amber-50 text-amber-800 ring-amber-600/25" /> : <Missing label="None recorded" />,
        note.allergies.length ? 'border-amber-300' : undefined,
      )}
      {tile(
        'plan',
        'Next steps',
        note.treatmentPlan.length ? (
          <p className="line-clamp-3">
            {note.treatmentPlan[0]}
            {note.treatmentPlan.length > 1 && <span className="text-slate-600"> +{note.treatmentPlan.length - 1} more</span>}
          </p>
        ) : (
          <Missing />
        ),
      )}
      {tile(
        'aftercare',
        'Red flags',
        note.redFlags.length ? (
          <p className="flex items-center gap-2 text-red-800">
            <AlertIcon className="size-4 shrink-0" /> {note.redFlags.length} warning sign{note.redFlags.length > 1 ? 's' : ''} given to patient
          </p>
        ) : (
          <Missing />
        ),
        note.redFlags.length ? 'border-red-200' : undefined,
      )}
    </section>
  )
}

function NotFound({ sessionId }: { sessionId: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-red-700">
        <AlertIcon className="size-6" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Appointment not found</h1>
      <p className="mt-1 text-sm text-slate-600">
        No appointment exists for session <span className="font-mono">{shortSession(sessionId)}</span>. It may have been removed from the appointment list.
      </p>
      <Link to="/appointments" className={`${btn.primary} mt-6`}>
        <ChevronLeftIcon /> Back to appointments
      </Link>
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
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-900">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2 text-sm leading-relaxed text-slate-900">
      {items.map((x, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-teal-50 font-mono text-[11px] font-medium text-teal-800">{i + 1}</span>
          <span>{x}</span>
        </li>
      ))}
    </ol>
  )
}
