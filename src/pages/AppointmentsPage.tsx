import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Appointment, AppointmentStatus } from '../types'
import { APPOINTMENT_STATUSES } from '../types'
import { formatDate, formatTime, todayISO } from '../lib/format'
import { useDemoStore } from '../store/DemoStore'
import AppointmentFormModal from '../components/AppointmentFormModal'
import { CalendarIcon, CheckIcon, ChevronRightIcon, ClockIcon, PencilIcon, PlusIcon, SearchIcon, XIcon } from '../components/icons'
import { Missing, StatusBadge, btn, inputCls } from '../components/ui'

type ModalState = { mode: 'new' } | { mode: 'edit'; appointment: Appointment } | null

export default function AppointmentsPage() {
  const { appointments } = useDemoStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState<ModalState>(null)

  // Filters live in the URL so they survive navigating to details and back.
  const query = params.get('q') ?? ''
  const date = params.get('date') ?? ''
  const status = (params.get('status') ?? 'All') as AppointmentStatus | 'All'
  const today = todayISO()

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'All') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return appointments
      .filter((a) => {
        if (date && a.date !== date) return false
        if (status !== 'All' && a.status !== status) return false
        if (!q) return true
        return [a.patientName, a.patientId, a.appointmentId].some((v) => v.toLowerCase().includes(q))
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  }, [appointments, query, date, status])

  const stats = useMemo(() => {
    const todays = appointments.filter((a) => a.date === today)
    return [
      { label: "Today's appointments", value: todays.length, tone: 'text-slate-900' },
      { label: 'Waiting / in chair', value: todays.filter((a) => a.status === 'Checked In' || a.status === 'In Progress').length, tone: 'text-violet-700' },
      { label: 'Completed today', value: todays.filter((a) => a.status === 'Completed').length, tone: 'text-emerald-700' },
      { label: 'Cancelled today', value: todays.filter((a) => a.status === 'Cancelled').length, tone: 'text-slate-600' },
    ]
  }, [appointments, today])

  const hasFilters = Boolean(query || date || status !== 'All')
  const open = (a: Appointment) => navigate(`/appointments/${a.sessionId}`)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Appointments</h1>
          <p className="mt-1 text-sm text-slate-600">Manage and review scheduled dental visits.</p>
        </div>
        <button type="button" className={btn.primary} onClick={() => setModal({ mode: 'new' })}>
          <PlusIcon /> New appointment
        </button>
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-600 sm:text-sm">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold sm:text-3xl ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Search and filters" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto_auto] md:items-end">
        <div className="space-y-1.5">
          <label htmlFor="search" className="block text-sm font-medium text-slate-700">
            Search appointments
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              id="search"
              type="search"
              className={`${inputCls} pl-9`}
              placeholder="Patient name, ID or appointment ID"
              value={query}
              onChange={(e) => setParam('q', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="date" className="block text-sm font-medium text-slate-700">
            Date
          </label>
          <div className="flex gap-2">
            <input id="date" type="date" className={`${inputCls} min-w-0`} value={date} onChange={(e) => setParam('date', e.target.value)} />
            <button
              type="button"
              className={`${btn.secondary} px-3 ${date === today ? 'border-2 border-teal-700 bg-teal-50 text-teal-900' : ''}`}
              aria-pressed={date === today}
              onClick={() => setParam('date', date === today ? '' : today)}
            >
              {date === today && <CheckIcon />}
              Today
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-medium text-slate-700">
            Status
          </label>
          <select id="status" className={inputCls} value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="All">All statuses</option>
            {APPOINTMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {hasFilters ? (
          <button type="button" className={btn.ghost} onClick={() => setParams({}, { replace: true })}>
            <XIcon /> Clear filters
          </button>
        ) : (
          <p className="py-2 text-sm text-slate-600">No filters applied</p>
        )}
      </section>

      <section aria-labelledby="list-heading" className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 id="list-heading" className="font-semibold text-slate-900">
            Appointment list
          </h2>
          <span className="text-sm text-slate-600" aria-live="polite">
            {filtered.length} of {appointments.length} {date === today ? '· Today' : date ? `· ${formatDate(date)}` : ''}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-600">
              <SearchIcon className="size-6" />
            </div>
            <h3 className="mt-4 font-medium text-slate-900">
              {appointments.length === 0 ? 'No appointments yet' : 'No appointments match your filters'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {appointments.length === 0
                ? 'Create a demo appointment to get started.'
                : 'Try a different name, ID, date or status.'}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              {hasFilters && (
                <button type="button" className={btn.secondary} onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </button>
              )}
              <button type="button" className={btn.primary} onClick={() => setModal({ mode: 'new' })}>
                <PlusIcon /> New appointment
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3">Patient</th>
                  <th scope="col" className="px-5 py-3">Date &amp; time</th>
                  <th scope="col" className="px-5 py-3">Type</th>
                  <th scope="col" className="hidden px-5 py-3 lg:table-cell">Dentist</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a) => (
                  <tr key={a.appointmentId} onClick={() => open(a)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">{a.patientName}</div>
                      <div className="text-xs text-slate-600">
                        {a.patientId} · {a.appointmentId}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="text-slate-900">{formatTime(a.time)}</div>
                      <div className="text-xs text-slate-600">{a.date === today ? 'Today' : formatDate(a.date)}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{a.type}</td>
                    <td className="hidden px-5 py-3.5 text-slate-700 lg:table-cell">
                      {a.dentist || <Missing label="Not assigned" />}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={btn.ghost}
                          onClick={() => setModal({ mode: 'edit', appointment: a })}
                          aria-label={`Edit appointment for ${a.patientName}`}
                        >
                          <PencilIcon /> <span className="hidden xl:inline">Edit</span>
                        </button>
                        <Link
                          to={`/appointments/${a.sessionId}`}
                          className={`${btn.ghost} whitespace-nowrap text-teal-800 underline underline-offset-4 hover:text-teal-900`}
                          aria-label={`View appointment details for ${a.patientName}`}
                        >
                          View details <ChevronRightIcon />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map((a) => (
                <li key={a.appointmentId} className="relative px-4 py-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/appointments/${a.sessionId}`}
                        className="font-medium text-slate-900 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-teal-700"
                      >
                        {a.patientName}
                      </Link>
                      <p className="text-xs text-slate-600">
                        {a.patientId} · {a.appointmentId}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{a.type}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <CalendarIcon className="size-3.5" /> {a.date === today ? 'Today' : formatDate(a.date)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="size-3.5" /> {formatTime(a.time)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${btn.ghost} relative z-10`}
                      onClick={() => setModal({ mode: 'edit', appointment: a })}
                      aria-label={`Edit appointment for ${a.patientName}`}
                    >
                      <PencilIcon /> Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {modal && (
        <AppointmentFormModal
          appointment={modal.mode === 'edit' ? modal.appointment : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
