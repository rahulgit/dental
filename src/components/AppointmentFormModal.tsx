import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { Appointment, AppointmentStatus } from '../types'
import { APPOINTMENT_STATUSES } from '../types'
import { todayISO } from '../lib/format'
import { useDemoStore } from '../store/DemoStore'
import { newAppointmentId, newSessionId } from '../lib/ids'
import { AlertIcon } from './icons'
import { Field, Modal, btn, inputCls, lockedCls } from './ui'

const APPOINTMENT_TYPES = [
  'Dental consultation',
  'Routine check-up',
  'Scaling and polishing',
  'Filling',
  'Extraction consultation',
  'Root canal treatment',
  'Root canal follow-up',
  'Crown fitting',
  'Emergency visit',
]

type FormState = {
  patientName: string
  patientId: string
  date: string
  time: string
  type: string
  dentist: string
  status: AppointmentStatus
}

/** Mount to open. With `appointment`, edits it (AP-07); otherwise creates a new one (AP-06). */
export default function AppointmentFormModal({
  appointment,
  onClose,
}: {
  appointment?: Appointment
  onClose: () => void
}) {
  const { appointments, saveAppointment, notify } = useDemoStore()
  const isEdit = Boolean(appointment)
  const uid = useId()
  const formId = `${uid}-form`

  const [form, setForm] = useState<FormState>(() => ({
    patientName: appointment?.patientName ?? '',
    patientId: appointment?.patientId ?? '',
    date: appointment?.date ?? todayISO(),
    time: appointment?.time ?? '',
    type: appointment?.type ?? '',
    dentist: appointment?.dentist ?? '',
    status: appointment?.status ?? 'Scheduled',
  }))
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.patientName.trim()) e.patientName = 'Patient name is required.'
    if (!form.patientId.trim()) e.patientId = 'Patient ID is required.'
    if (!form.date) e.date = 'Date is required.'
    if (!form.time) e.time = 'Time is required.'
    if (!form.type.trim()) e.type = 'Appointment type is required.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    const base: Appointment = appointment ?? {
      appointmentId: newAppointmentId(appointments),
      sessionId: newSessionId(),
      patientId: '',
      patientName: '',
      date: '',
      time: '',
      type: '',
      dentist: '',
      status: 'Scheduled',
    }
    const ok = saveAppointment({
      ...base,
      patientName: form.patientName.trim(),
      patientId: form.patientId.trim(),
      date: form.date,
      time: form.time,
      type: form.type.trim(),
      dentist: form.dentist.trim(),
      status: form.status,
    })
    if (ok) notify(isEdit ? 'Appointment updated' : 'Appointment created')
    onClose()
  }

  const id = (name: string) => `${uid}-${name}`
  const err = (name: keyof FormState) =>
    errors[name] ? (
      <p id={id(`${name}-error`)} className="flex items-center gap-1 text-xs font-medium text-red-700">
        <AlertIcon className="size-3.5 shrink-0" /> {errors[name]}
      </p>
    ) : null
  const aria = (name: keyof FormState) => ({
    'aria-invalid': Boolean(errors[name]) || undefined,
    'aria-describedby': errors[name] ? id(`${name}-error`) : undefined,
  })

  return (
    <Modal
      title={isEdit ? `Edit appointment ${appointment?.appointmentId}` : 'New appointment'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={btn.primary}>
            {isEdit ? 'Save changes' : 'Create appointment'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label={isEdit ? 'Patient name (locked)' : 'Patient name'}
            htmlFor={id('patientName')}
            hint={isEdit ? 'Patient name and ID are linked to the clinical record and cannot be changed here.' : undefined}
          >
            <input
              id={id('patientName')}
              className={isEdit ? `${inputCls} ${lockedCls}` : inputCls}
              value={form.patientName}
              onChange={(e) => set('patientName', e.target.value)}
              readOnly={isEdit}
              autoFocus={!isEdit}
              autoComplete="off"
              {...aria('patientName')}
            />
            {err('patientName')}
          </Field>
        </div>
        <Field label={isEdit ? 'Patient ID (locked)' : 'Patient ID'} htmlFor={id('patientId')}>
          <input
            id={id('patientId')}
            className={isEdit ? `${inputCls} ${lockedCls}` : inputCls}
            value={form.patientId}
            onChange={(e) => set('patientId', e.target.value)}
            readOnly={isEdit}
            placeholder="e.g. DEN-88230"
            autoComplete="off"
            {...aria('patientId')}
          />
          {err('patientId')}
        </Field>
        <Field label="Status" htmlFor={id('status')}>
          <select
            id={id('status')}
            className={inputCls}
            value={form.status}
            onChange={(e) => set('status', e.target.value as AppointmentStatus)}
          >
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Date" htmlFor={id('date')}>
          <input
            id={id('date')}
            type="date"
            className={inputCls}
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            autoFocus={isEdit}
            {...aria('date')}
          />
          {err('date')}
        </Field>
        <Field label="Time" htmlFor={id('time')}>
          <input
            id={id('time')}
            type="time"
            className={inputCls}
            value={form.time}
            onChange={(e) => set('time', e.target.value)}
            {...aria('time')}
          />
          {err('time')}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Appointment type or reason" htmlFor={id('type')}>
            <input
              id={id('type')}
              className={inputCls}
              list={id('types')}
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              placeholder="Select or type a reason"
              autoComplete="off"
              {...aria('type')}
            />
            <datalist id={id('types')}>
              {APPOINTMENT_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {err('type')}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Dentist (optional)" htmlFor={id('dentist')}>
            <input
              id={id('dentist')}
              className={inputCls}
              value={form.dentist}
              onChange={(e) => set('dentist', e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
