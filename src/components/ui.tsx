import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import type { AppointmentStatus } from '../types'
import { XIcon } from './icons'

// Borders use slate-500 (4.7:1) so form controls meet the 3:1 non-text contrast minimum.
export const inputCls =
  'block w-full rounded-lg border border-slate-500 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-500 focus:border-teal-700 focus:outline-3 focus:outline-offset-1 focus:outline-teal-700 focus-within:outline-3 focus-within:outline-offset-1 focus-within:outline-teal-700 aria-invalid:border-2 aria-invalid:border-red-700 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-slate-100 disabled:text-slate-700'

// Locked (read-only) fields: dashed border + tint + "(locked)" in the label, so status is not colour-only.
export const lockedCls = 'cursor-default border-dashed bg-slate-100'

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-500 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-700',
  ghost:
    'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-teal-700',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-700',
}

const statusStyles: Record<AppointmentStatus, string> = {
  Scheduled: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  'Checked In': 'bg-violet-50 text-violet-800 ring-violet-600/20',
  'In Progress': 'bg-amber-50 text-amber-800 ring-amber-600/25',
  Completed: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  Cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles[status]}`}
    >
      {status}
    </span>
  )
}

/** Placeholder for empty / unrecorded values — never a confirmed negative (PRD §4.1). */
export function Missing({ label = 'Not recorded' }: { label?: string }) {
  return <span className="italic text-slate-600">{label}</span>
}

export function TextOrMissing({ value, missing }: { value: string | undefined; missing?: string }) {
  return value && value.trim() ? <>{value}</> : <Missing label={missing} />
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  )
}

/** Native <dialog>: focus trap, Esc to close and inert background for free. Mount to open. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={`m-auto w-[calc(100%-2rem)] ${size === 'sm' ? 'max-w-md' : 'max-w-lg'} rounded-2xl bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <button type="button" onClick={onClose} className={btn.ghost} aria-label="Close dialog">
          <XIcon />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer && (
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          {footer}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className={danger ? btn.danger : btn.primary} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  )
}
