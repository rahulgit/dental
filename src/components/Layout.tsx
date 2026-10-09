import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useDemoStore } from '../store/DemoStore'
import { AlertIcon, CheckIcon, ToothIcon, XIcon } from './icons'
import { ConfirmDialog } from './ui'

export default function Layout() {
  const { toast, dismissToast, resetDemo } = useDemoStore()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:font-medium focus:text-teal-800 focus:shadow"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/appointments" className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
            <span className="grid size-9 place-items-center rounded-xl bg-teal-700 text-white">
              <ToothIcon className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-semibold text-slate-900">DentalCare HMS</span>
              <span className="block text-xs text-slate-600">Appointment Management</span>
            </span>
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>



      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast && (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${toast.kind === 'error' ? 'bg-red-700 text-white' : 'bg-slate-900 text-white'
              }`}
          >
            {toast.kind === 'error' ? <AlertIcon className="mt-0.5 size-4 shrink-0" /> : <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-400" />}
            <span className="flex-1">{toast.message}</span>
            <button type="button" onClick={dismissToast} aria-label="Dismiss notification" className="rounded p-0.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
              <XIcon />
            </button>
          </div>
        )}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset demo data?"
          message="All appointments and clinical edits will be replaced with the original demo data."
          confirmLabel="Reset data"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            resetDemo()
            setConfirmReset(false)
          }}
        />
      )}
    </div>
  )
}
