import { useId, useState } from 'react'
import type { ProcedureEntry, ToothFinding } from '../../types'
import { capitalize } from '../../lib/format'
import { PlusIcon, TrashIcon } from '../icons'
import { ConfirmDialog, Field, btn, inputCls } from '../ui'

export function TextField({
  label,
  value,
  onChange,
  multiline,
  placeholder = 'Not recorded',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id}>
      {multiline ? (
        <textarea id={id} rows={3} className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

/** Editable list of free-text entries (allergies, treatment plan, prescriptions, red flags). */
export function ListEditor({
  label,
  items,
  onChange,
  itemLabel,
  placeholder,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  itemLabel: string
  placeholder?: string
}) {
  const id = useId()
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium text-slate-700">{label}</legend>
      {items.length === 0 && <p className="text-sm italic text-slate-600">None recorded</p>}
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <label htmlFor={`${id}-${i}`} className="sr-only">
            {itemLabel} {i + 1}
          </label>
          <input
            id={`${id}-${i}`}
            className={inputCls}
            value={item}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button
            type="button"
            className={`${btn.ghost} text-slate-600 hover:text-red-700`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button type="button" className={`${btn.ghost} text-teal-700`} onClick={() => onChange([...items, ''])}>
        <PlusIcon /> Add {itemLabel.toLowerCase()}
      </button>
    </fieldset>
  )
}

export function ToothFindingsEditor({
  findings,
  onChange,
}: {
  findings: ToothFinding[]
  onChange: (f: ToothFinding[]) => void
}) {
  const id = useId()
  const update = (i: number, patch: Partial<ToothFinding>) =>
    onChange(findings.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1.5 text-sm font-medium text-slate-700">Tooth findings</legend>
      {findings.length === 0 && <p className="text-sm italic text-slate-600">None recorded</p>}
      {findings.map((f, i) => (
        <div key={i} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[7rem_8rem_1fr_auto] sm:items-end">
          <Field label="Tooth" htmlFor={`${id}-${i}-tooth`}>
            <input id={`${id}-${i}-tooth`} className={inputCls} value={f.tooth} placeholder="e.g. 46" onChange={(e) => update(i, { tooth: e.target.value })} />
          </Field>
          <Field label="Surfaces" htmlFor={`${id}-${i}-surf`}>
            <input id={`${id}-${i}-surf`} className={inputCls} value={f.surfaces} placeholder="e.g. MO" onChange={(e) => update(i, { surfaces: e.target.value })} />
          </Field>
          <Field label="Finding" htmlFor={`${id}-${i}-finding`}>
            <input id={`${id}-${i}-finding`} className={inputCls} value={f.finding} onChange={(e) => update(i, { finding: e.target.value })} />
          </Field>
          <button
            type="button"
            className={`${btn.ghost} text-slate-600 hover:text-red-700`}
            onClick={() => onChange(findings.filter((_, j) => j !== i))}
            aria-label={`Remove tooth finding ${i + 1}`}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={`${btn.ghost} text-teal-700`}
        onClick={() => onChange([...findings, { tooth: '', surfaces: '', finding: '' }])}
      >
        <PlusIcon /> Add tooth finding
      </button>
    </fieldset>
  )
}

export const PROCEDURE_OPTIONS = ['filling', 'extraction', 'root canal treatment', 'scaling and polishing', 'crown']

function ProcedureCard({
  index,
  entry,
  onChange,
  onRemove,
}: {
  index: number
  entry: ProcedureEntry
  onChange: (e: ProcedureEntry) => void
  onRemove: () => void
}) {
  const id = useId()
  const known = PROCEDURE_OPTIONS.includes(entry.procedure.toLowerCase())
  const [custom, setCustom] = useState(!known && entry.procedure !== '')
  const selectValue = custom ? 'other' : known ? entry.procedure.toLowerCase() : ''

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">
          Procedure {index + 1}
          {entry.procedure && <span className="font-normal text-slate-600"> · {capitalize(entry.procedure)}</span>}
        </h4>
        <button type="button" className={`${btn.ghost} text-red-700 hover:bg-red-50 hover:text-red-800`} onClick={onRemove}>
          <TrashIcon /> Remove
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Procedure" htmlFor={`${id}-proc`}>
          <select
            id={`${id}-proc`}
            className={inputCls}
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'other') {
                setCustom(true)
                onChange({ ...entry, procedure: '' })
              } else {
                setCustom(false)
                onChange({ ...entry, procedure: v })
              }
            }}
          >
            <option value="">Select a procedure…</option>
            {PROCEDURE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {capitalize(p)}
              </option>
            ))}
            <option value="other">Other (specify)</option>
          </select>
        </Field>
        {custom ? (
          <Field label="Custom procedure" htmlFor={`${id}-custom`}>
            <input
              id={`${id}-custom`}
              className={inputCls}
              value={entry.procedure}
              onChange={(e) => onChange({ ...entry, procedure: e.target.value })}
              placeholder="Describe the procedure"
              autoFocus
            />
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="Tooth number" htmlFor={`${id}-tooth`}>
          <input id={`${id}-tooth`} className={inputCls} value={entry.tooth} placeholder="Not specified" onChange={(e) => onChange({ ...entry, tooth: e.target.value })} />
        </Field>
        <Field label="Surfaces involved" htmlFor={`${id}-surf`}>
          <input
            id={`${id}-surf`}
            className={inputCls}
            value={entry.surfaces ?? ''}
            placeholder="Not specified"
            onChange={(e) => onChange({ ...entry, surfaces: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Materials used" htmlFor={`${id}-mat`}>
            <input id={`${id}-mat`} className={inputCls} value={entry.materials} placeholder="Not specified" onChange={(e) => onChange({ ...entry, materials: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor={`${id}-notes`}>
            <textarea id={`${id}-notes`} rows={2} className={inputCls} value={entry.notes ?? ''} onChange={(e) => onChange({ ...entry, notes: e.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  )
}

export function ProcedureEditor({
  procedures,
  onChange,
}: {
  procedures: ProcedureEntry[]
  onChange: (p: ProcedureEntry[]) => void
}) {
  const [pendingRemove, setPendingRemove] = useState<number | null>(null)
  // Stable keys so per-card state (custom mode) survives removals.
  const [keys, setKeys] = useState(() => procedures.map((_, i) => i))
  const [nextKey, setNextKey] = useState(procedures.length)

  const keyList = keys.length === procedures.length ? keys : procedures.map((_, i) => i)

  function add() {
    setKeys([...keyList, nextKey])
    setNextKey(nextKey + 1)
    onChange([...procedures, { tooth: '', procedure: '', materials: '' }])
  }

  function remove(i: number) {
    setKeys(keyList.filter((_, j) => j !== i))
    onChange(procedures.filter((_, j) => j !== i))
  }

  const target = pendingRemove !== null ? procedures[pendingRemove] : undefined

  return (
    <div className="space-y-3">
      {procedures.length === 0 && <p className="text-sm italic text-slate-600">No procedures recorded</p>}
      {procedures.map((p, i) => (
        <ProcedureCard
          key={keyList[i]}
          index={i}
          entry={p}
          onChange={(e) => onChange(procedures.map((x, j) => (j === i ? e : x)))}
          onRemove={() => setPendingRemove(i)}
        />
      ))}
      <button type="button" className={btn.secondary} onClick={add}>
        <PlusIcon /> Add procedure
      </button>

      {pendingRemove !== null && (
        <ConfirmDialog
          title="Remove procedure?"
          message={
            <>
              Procedure {pendingRemove + 1}
              {target?.procedure ? ` (${capitalize(target.procedure)})` : ''} will be removed when you save the clinical record.
            </>
          }
          confirmLabel="Remove"
          danger
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            remove(pendingRemove)
            setPendingRemove(null)
          }}
        />
      )}
    </div>
  )
}
