import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import type { ProcedureEntry, ToothFinding } from '../../types'
import { capitalize } from '../../lib/format'
import { PlusIcon, TrashIcon } from '../icons'
import { ConfirmDialog, Field, btn, inputCls } from '../ui'

/** Textarea that grows with its content, so long clinical text is never hidden behind a scrollbar. */
export function AutoTextarea({ className = '', value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return <textarea ref={ref} rows={1} value={value} className={`${inputCls} resize-none overflow-hidden leading-relaxed ${className}`} {...props} />
}

export function TextField({
  label,
  value,
  onChange,
  multiline,
  placeholder = 'Not recorded',
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id}>
      {multiline ? (
        <AutoTextarea id={id} rows={2} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className={inputCls} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

/**
 * Editable list of free-text entries (allergies, treatment plan, prescriptions, red flags).
 * Enter adds the next entry; Backspace on an empty entry removes it.
 */
export function ListEditor({
  label,
  items,
  onChange,
  itemLabel,
  placeholder,
  numbered,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  itemLabel: string
  placeholder?: string
  numbered?: boolean
}) {
  const id = useId()
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  useEffect(() => {
    if (focusIndex === null) return
    const el = document.getElementById(`${id}-${focusIndex}`) as HTMLTextAreaElement | null
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
    setFocusIndex(null)
  }, [focusIndex, id])

  const insertAfter = (i: number) => {
    onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)])
    setFocusIndex(i + 1)
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium text-slate-700">{label}</legend>
      {items.length === 0 && <p className="text-sm italic text-slate-600">None recorded</p>}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          {numbered && <span className="w-5 shrink-0 pt-2 text-right font-mono text-xs text-slate-500">{i + 1}.</span>}
          <label htmlFor={`${id}-${i}`} className="sr-only">
            {itemLabel} {i + 1}
          </label>
          <AutoTextarea
            id={`${id}-${i}`}
            value={item}
            placeholder={placeholder ?? `${itemLabel}…`}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                insertAfter(i)
              } else if (e.key === 'Backspace' && item === '') {
                e.preventDefault()
                onChange(items.filter((_, j) => j !== i))
                if (i > 0) setFocusIndex(i - 1)
              }
            }}
          />
          <button
            type="button"
            className={`${btn.ghost} mt-0.5 text-slate-600 hover:text-red-700`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-3">
        <button type="button" className={`${btn.ghost} text-teal-700`} onClick={() => insertAfter(items.length - 1)}>
          <PlusIcon /> Add {itemLabel.toLowerCase()}
        </button>
        {items.length > 0 && <span className="text-xs text-slate-500">Enter adds another · Backspace on an empty line removes it</span>}
      </div>
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
        <div key={i} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[6rem_7rem_1fr_auto] sm:items-start">
          <Field label="Tooth" htmlFor={`${id}-${i}-tooth`}>
            <input id={`${id}-${i}-tooth`} className={inputCls} value={f.tooth} placeholder="e.g. 46" onChange={(e) => update(i, { tooth: e.target.value })} />
          </Field>
          <Field label="Surfaces" htmlFor={`${id}-${i}-surf`}>
            <input id={`${id}-${i}-surf`} className={inputCls} value={f.surfaces} placeholder="e.g. MO" onChange={(e) => update(i, { surfaces: e.target.value })} />
          </Field>
          <Field label="Finding" htmlFor={`${id}-${i}-finding`}>
            <AutoTextarea id={`${id}-${i}-finding`} value={f.finding} placeholder="Describe the finding" onChange={(e) => update(i, { finding: e.target.value })} />
          </Field>
          <button
            type="button"
            className={`${btn.ghost} text-slate-600 hover:text-red-700 sm:mt-7`}
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
            <AutoTextarea id={`${id}-notes`} rows={2} value={entry.notes ?? ''} onChange={(e) => onChange({ ...entry, notes: e.target.value })} />
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
              {target?.procedure ? ` (${capitalize(target.procedure)})` : ''} will be removed when you save this section.
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
