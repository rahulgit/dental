import { useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import type { ClinicalNote, ProcedureEntry, ToothFinding } from '../../types'
import { capitalize } from '../../lib/format'
import { CheckIcon, InfoIcon, PlusIcon } from '../icons'
import { Missing, btn } from '../ui'

// FDI / ISO 3950 two-digit notation, permanent dentition.

type Surface = 'M' | 'O' | 'D' | 'B' | 'L'
const SURFACE_ORDER: Surface[] = ['M', 'O', 'D', 'B', 'L']
const NO_SURFACES = new Set<Surface>()

const QUADRANTS: Record<number, string> = { 1: 'Upper right', 2: 'Upper left', 3: 'Lower left', 4: 'Lower right' }
const TOOTH_NAMES: Record<number, string> = {
  1: 'central incisor',
  2: 'lateral incisor',
  3: 'canine',
  4: 'first premolar',
  5: 'second premolar',
  6: 'first molar',
  7: 'second molar',
  8: 'third molar',
}

const isAnterior = (t: number) => t % 10 <= 3
const isUpper = (t: number) => Math.floor(t / 10) <= 2

export function toothName(t: number): string {
  return `${QUADRANTS[Math.floor(t / 10)]} ${TOOTH_NAMES[t % 10]}`
}

/** Returns an FDI tooth number only when the recorded value clearly is one — never guesses. */
export function parseTooth(value: string): number | null {
  const m = value.trim().match(/^(?:tooth\s*)?#?\s*([1-4][1-8])$/i)
  return m ? Number(m[1]) : null
}

const SURFACE_WORDS: Record<string, Surface> = {
  mesial: 'M',
  distal: 'D',
  occlusal: 'O',
  incisal: 'O',
  buccal: 'B',
  facial: 'B',
  labial: 'B',
  lingual: 'L',
  palatal: 'L',
}
const SURFACE_LETTERS: Record<string, Surface> = { M: 'M', D: 'D', O: 'O', I: 'O', B: 'B', F: 'B', L: 'L', P: 'L' }

export function parseSurfaces(value: string | undefined): Set<Surface> {
  const out = new Set<Surface>()
  if (!value) return out
  const words = value.toLowerCase().match(/[a-z]+/g) ?? []
  for (const w of words) {
    if (SURFACE_WORDS[w]) out.add(SURFACE_WORDS[w])
    else if (/^[mdoibflp]+$/.test(w)) for (const ch of w.toUpperCase()) out.add(SURFACE_LETTERS[ch])
  }
  return out
}

/** Display label for a surface on a given tooth (incisal / palatal where applicable). */
function surfaceLabel(s: Surface, t: number): string {
  if (s === 'O') return isAnterior(t) ? 'I' : 'O'
  if (s === 'L') return isUpper(t) ? 'P' : 'L'
  return s
}

const SURFACE_NAMES: Record<string, string> = {
  M: 'Mesial',
  O: 'Occlusal',
  I: 'Incisal',
  D: 'Distal',
  B: 'Buccal',
  L: 'Lingual',
  P: 'Palatal',
}

function surfacesToString(set: Set<Surface>, t: number): string {
  return SURFACE_ORDER.filter((s) => set.has(s)).map((s) => surfaceLabel(s, t)).join('')
}

type Charted = {
  findings: { entry: ToothFinding; index: number }[]
  procedures: { entry: ProcedureEntry; index: number }[]
}

function chartNote(note: ClinicalNote) {
  const byTooth = new Map<number, Charted>()
  const get = (t: number) => {
    if (!byTooth.has(t)) byTooth.set(t, { findings: [], procedures: [] })
    return byTooth.get(t)!
  }
  const uncharted: Charted = { findings: [], procedures: [] }
  note.toothFindings.forEach((entry, index) => {
    const t = parseTooth(entry.tooth)
    ;(t ? get(t) : uncharted).findings.push({ entry, index })
  })
  note.proceduresPerformed.forEach((entry, index) => {
    const t = parseTooth(entry.tooth)
    ;(t ? get(t) : uncharted).procedures.push({ entry, index })
  })
  return { byTooth, uncharted }
}

// --- Arch geometry ------------------------------------------------------------
// Teeth sit on two elliptical arches, viewed facing the patient (as if looking
// into the mouth): upper arch on top with incisors at the front, lower arch
// mirrored below. Each crown is rotated so its outer edge is buccal/labial and
// its inner edge lingual/palatal; mesial always faces the midline.

/** Crown radius per tooth position (1 = central incisor … 8 = third molar). */
const CROWN_R: Record<number, number> = { 1: 17, 2: 15, 3: 16, 4: 16, 5: 16, 6: 21, 7: 20, 8: 18 }
const TOOTH_GAP = 4
const ARCH_RX = 128
const ARCH_RY = 132
const ARCH_GAP = 40 // clear space between the back teeth of the two arches

type Placed = { t: number; x: number; y: number; r: number; nx: number; ny: number; rot: number }
type Sample = { x: number; y: number; nx: number; ny: number; len: number }

/**
 * One half of a U-shaped arch (patient's left, upper jaw, origin at the arch
 * centre, y up = negative): elliptical front segment, then straight sides.
 */
const HALF_ARCH: Sample[] = (() => {
  const pts: Sample[] = []
  let len = 0
  const push = (x: number, y: number, nx: number, ny: number) => {
    const prev = pts[pts.length - 1]
    if (prev) len += Math.hypot(x - prev.x, y - prev.y)
    const n = Math.hypot(nx, ny)
    pts.push({ x, y, nx: nx / n, ny: ny / n, len })
  }
  for (let deg = 90; deg >= 0; deg -= 0.25) {
    const phi = (deg * Math.PI) / 180
    push(ARCH_RX * Math.cos(phi), -ARCH_RY * Math.sin(phi), Math.cos(phi) / ARCH_RX, -Math.sin(phi) / ARCH_RY)
  }
  for (let y = 0.5; y <= 300; y += 0.5) push(ARCH_RX, y, 1, 0)
  return pts
})()

function placeQuadrant(q: number, lowerCentre: number): Placed[] {
  const upper = q <= 2
  const side = q === 2 || q === 3 ? 1 : -1 // patient's left is drawn on the viewer's right
  const out: Placed[] = []
  let along = TOOTH_GAP / 2
  for (let pos = 1; pos <= 8; pos++) {
    const r = CROWN_R[pos]
    const target = along + r
    along += 2 * r + TOOTH_GAP
    const s = HALF_ARCH.find((p) => p.len >= target) ?? HALF_ARCH[HALF_ARCH.length - 1]
    const nx = side * s.nx
    const ny = upper ? s.ny : -s.ny
    out.push({
      t: q * 10 + pos,
      x: side * s.x,
      y: upper ? s.y : lowerCentre - s.y,
      r,
      nx,
      ny,
      rot: (Math.atan2(nx, -ny) * 180) / Math.PI,
    })
  }
  return out
}

const UPPER_TEETH = [1, 2].flatMap((q) => placeQuadrant(q, 0))
const UPPER_BACK = Math.max(...UPPER_TEETH.map((p) => p.y + p.r))
/** Lower arch is the upper arch mirrored, with its back teeth ARCH_GAP below. */
const LOWER_CENTRE = 2 * UPPER_BACK + ARCH_GAP
const PLACED: Placed[] = [...UPPER_TEETH, ...[3, 4].flatMap((q) => placeQuadrant(q, LOWER_CENTRE))]
const MID_Y = LOWER_CENTRE / 2

const VIEW = (() => {
  const m = 30 // room for the tooth numbers outside the arch
  const xs = PLACED.flatMap((p) => [p.x - p.r - m, p.x + p.r + m])
  const ys = PLACED.flatMap((p) => [p.y - p.r - m, p.y + p.r + m])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { minX, minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
})()

type Sector = 'top' | 'right' | 'bottom' | 'left'

/** Local crown frame: -y = outward (buccal), +y = inward (lingual). */
function surfaceAt(t: number, sector: Sector | 'center'): Surface {
  const q = Math.floor(t / 10)
  const mesialOnPlusX = q === 1 || q === 3
  switch (sector) {
    case 'top':
      return 'B'
    case 'bottom':
      return 'L'
    case 'right':
      return mesialOnPlusX ? 'M' : 'D'
    case 'left':
      return mesialOnPlusX ? 'D' : 'M'
    default:
      return 'O'
  }
}

const SECTOR_START: Record<Sector, number> = { top: -45, right: 45, bottom: 135, left: 225 }

function sectorPath(sector: Sector, R: number, r: number): string {
  const a0 = (SECTOR_START[sector] * Math.PI) / 180
  const a1 = a0 + Math.PI / 2
  const pt = (rad: number, a: number) => `${(rad * Math.sin(a)).toFixed(2)} ${(-rad * Math.cos(a)).toFixed(2)}`
  return `M${pt(R, a0)} A${R} ${R} 0 0 1 ${pt(R, a1)} L${pt(r, a1)} A${r} ${r} 0 0 0 ${pt(r, a0)} Z`
}

function ToothGlyph({
  p,
  data,
  selected,
  pendingSurfaces,
  onSelect,
  onToggleSurface,
}: {
  p: Placed
  data: Charted | undefined
  selected: boolean
  pendingSurfaces: Set<Surface>
  onSelect: () => void
  onToggleSurface?: (s: Surface) => void
}) {
  const { t, r } = p
  const findings = data?.findings ?? []
  const procedures = data?.procedures ?? []
  const findingSurfaces = new Set<Surface>()
  const procSurfaces = new Set<Surface>()
  let wholeFinding = false
  let wholeProc = false
  let extracted = false
  for (const { entry } of findings) {
    const s = parseSurfaces(entry.surfaces)
    if (s.size === 0) wholeFinding = true
    s.forEach((x) => findingSurfaces.add(x))
  }
  for (const { entry } of procedures) {
    if (/extract/i.test(entry.procedure)) extracted = true
    const s = parseSurfaces(entry.surfaces)
    if (s.size === 0) wholeProc = true
    s.forEach((x) => procSurfaces.add(x))
  }

  const fillFor = (s: Surface) => {
    if (selected && pendingSurfaces.has(s)) return 'fill-[url(#odo-selected)]'
    if (procSurfaces.has(s)) return 'fill-teal-700'
    if (findingSurfaces.has(s)) return 'fill-[url(#odo-hatch)]'
    return 'fill-white'
  }

  const counts = [
    findings.length && `${findings.length} finding${findings.length > 1 ? 's' : ''}`,
    procedures.length && `${procedures.length} procedure${procedures.length > 1 ? 's' : ''}`,
  ].filter(Boolean)
  const label = `Tooth ${t}, ${toothName(t)}${counts.length ? `: ${counts.join(', ')}` : ''}`

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  const toggle = (s: Surface) =>
    selected && onToggleSurface
      ? (e: MouseEvent) => {
          e.stopPropagation()
          onToggleSurface(s)
        }
      : undefined

  const inner = r * 0.42
  const labelX = p.x + p.nx * (r + 14)
  const labelY = p.y + p.ny * (r + 14)
  // Markers sit just inside the arch, side by side along the tangent:
  // triangle = finding, square = procedure (shape, not just colour).
  const dotX = p.x - p.nx * (r + 9)
  const dotY = p.y - p.ny * (r + 9)
  const both = findings.length > 0 && procedures.length > 0
  const fx = dotX + (both ? -p.ny * 6 : 0)
  const fy = dotY + (both ? p.nx * 6 : 0)
  const px = dotX + (both ? p.ny * 6 : 0)
  const py = dotY + (both ? -p.nx * 6 : 0)

  return (
    <g role="button" tabIndex={0} aria-label={label} aria-pressed={selected} onClick={onSelect} onKeyDown={onKey} className="group cursor-pointer outline-none">
      <title>{label}</title>
      <g transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.rot.toFixed(2)})`}>
        <circle
          r={r + 6}
          className={
            selected
              ? 'fill-sky-100 stroke-sky-700 [stroke-width:2.5] group-focus-visible:stroke-teal-700 group-focus-visible:[stroke-width:4]'
              : 'fill-transparent stroke-transparent group-hover:fill-slate-200 group-hover:stroke-slate-500 group-focus-visible:stroke-teal-700 [stroke-width:3]'
          }
        />
        {(['top', 'right', 'bottom', 'left'] as const).map((sector) => {
          const s = surfaceAt(t, sector)
          return <path key={sector} d={sectorPath(sector, r, inner)} className={`${fillFor(s)} stroke-slate-500 [stroke-width:1.25]`} onClick={toggle(s)} />
        })}
        <circle r={inner} className={`${fillFor('O')} stroke-slate-500 [stroke-width:1.25]`} onClick={toggle('O')} />
        {/* Whole-tooth entries (no surface recorded): solid ring = procedure, dashed ring = finding. */}
        {wholeProc && <circle r={r + 2} className="pointer-events-none fill-none stroke-teal-700 [stroke-width:2.5]" />}
        {wholeFinding && (
          <circle r={r + (wholeProc ? 4.5 : 2)} className="pointer-events-none fill-none stroke-orange-700 [stroke-dasharray:3_2.5] [stroke-width:2.5]" />
        )}
        {extracted && (
          <path
            d={`M${-r * 0.7} ${-r * 0.7} L${r * 0.7} ${r * 0.7} M${r * 0.7} ${-r * 0.7} L${-r * 0.7} ${r * 0.7}`}
            className="pointer-events-none stroke-red-700 [stroke-width:3.5] [stroke-linecap:round]"
          />
        )}
      </g>
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="central"
        className={`text-[14px] ${selected ? 'fill-sky-800 font-bold underline' : 'fill-slate-700 font-medium'}`}
      >
        {t}
      </text>
      {findings.length > 0 && (
        <path
          d={`M${fx} ${fy - 5} L${fx + 5} ${fy + 4} L${fx - 5} ${fy + 4} Z`}
          className="pointer-events-none fill-orange-700 stroke-white [stroke-width:1.5]"
        />
      )}
      {procedures.length > 0 && (
        <rect x={px - 4} y={py - 4} width={8} height={8} className="pointer-events-none fill-teal-700 stroke-white [stroke-width:1.5]" />
      )}
    </g>
  )
}

// --- Component ----------------------------------------------------------------

export default function Odontogram({
  note,
  editing,
  onChange,
}: {
  note: ClinicalNote
  editing: boolean
  onChange: (patch: Partial<ClinicalNote>) => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [pending, setPending] = useState<Set<Surface>>(new Set())
  const [message, setMessage] = useState('')

  const { byTooth, uncharted } = chartNote(note)
  const sel = selected ? byTooth.get(selected) : undefined
  const unchartedCount = uncharted.findings.length + uncharted.procedures.length

  const select = (t: number) => {
    setSelected((cur) => (cur === t ? null : t))
    setPending(new Set())
    setMessage('')
  }

  const toggleSurface = (s: Surface) =>
    setPending((cur) => {
      const next = new Set(cur)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  const surfaces = selected ? surfacesToString(pending, selected) : ''

  const addFinding = () => {
    if (!selected) return
    onChange({ toothFindings: [...note.toothFindings, { tooth: String(selected), surfaces, finding: '' }] })
    setMessage(`Finding added for tooth ${selected} — describe it in Tooth findings below.`)
  }

  const addProcedure = () => {
    if (!selected) return
    const entry: ProcedureEntry = { tooth: String(selected), procedure: '', materials: '' }
    if (surfaces) entry.surfaces = surfaces
    onChange({ proceduresPerformed: [...note.proceduresPerformed, entry] })
    setMessage(`Procedure added for tooth ${selected} — complete it in Procedures performed.`)
  }

  const assignFinding = (index: number) => {
    if (!selected) return
    onChange({
      toothFindings: note.toothFindings.map((f, i) =>
        i === index ? { ...f, tooth: String(selected), surfaces: f.surfaces || surfaces } : f,
      ),
    })
    setMessage(`Finding assigned to tooth ${selected}.`)
  }

  const assignProcedure = (index: number) => {
    if (!selected) return
    onChange({
      proceduresPerformed: note.proceduresPerformed.map((p, i) => {
        if (i !== index) return p
        const next = { ...p, tooth: String(selected) }
        if (!p.surfaces && surfaces) next.surfaces = surfaces
        return next
      }),
    })
    setMessage(`Procedure assigned to tooth ${selected}.`)
  }

  const midY = MID_Y
  const archLabel = 'fill-slate-700 text-[14px] font-semibold uppercase tracking-widest'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-600">Odontogram</h3>
        <p className="text-xs text-slate-600">FDI notation · permanent teeth · viewed facing the patient</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-rose-50/60 via-slate-50/60 to-rose-50/60 p-2">
            <svg
              viewBox={`${VIEW.minX} ${VIEW.minY} ${VIEW.w} ${VIEW.h}`}
              className="mx-auto block w-full max-w-sm select-none"
              role="group"
              aria-label="Dental chart arranged as upper and lower arches. Select a tooth to see its findings and procedures."
            >
              <defs>
                {/* Finding: orange-700 diagonal hatch (5.2:1 vs white). */}
                <pattern id="odo-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                  <rect width="5" height="5" className="fill-white" />
                  <rect width="2.75" height="5" className="fill-orange-700" />
                </pattern>
                {/* Surface picked in edit mode: dark blue with white dots. */}
                <pattern id="odo-selected" patternUnits="userSpaceOnUse" width="5" height="5">
                  <rect width="5" height="5" className="fill-sky-700" />
                  <circle cx="2.5" cy="2.5" r="1" className="fill-white" />
                </pattern>
              </defs>
              <line x1={0} y1={VIEW.minY + 6} x2={0} y2={VIEW.minY + VIEW.h - 6} className="stroke-slate-400 [stroke-dasharray:3_4]" />
              <line x1={-ARCH_RX + 30} y1={midY} x2={ARCH_RX - 30} y2={midY} className="stroke-slate-400 [stroke-dasharray:3_4]" />
              <text x={0} y={-ARCH_RY * 0.2} textAnchor="middle" className={archLabel}>
                Upper
              </text>
              <text x={0} y={LOWER_CENTRE + ARCH_RY * 0.2} textAnchor="middle" dominantBaseline="hanging" className={archLabel}>
                Lower
              </text>
              <text x={-ARCH_RX - 10} y={midY} textAnchor="end" dominantBaseline="central" className={archLabel}>
                R<title>Patient's right</title>
              </text>
              <text x={ARCH_RX + 10} y={midY} textAnchor="start" dominantBaseline="central" className={archLabel}>
                L<title>Patient's left</title>
              </text>
              {PLACED.map((p) => (
                <ToothGlyph
                  key={p.t}
                  p={p}
                  data={byTooth.get(p.t)}
                  selected={selected === p.t}
                  pendingSurfaces={editing ? pending : NO_SURFACES}
                  onSelect={() => select(p.t)}
                  onToggleSurface={editing ? toggleSurface : undefined}
                />
              ))}
            </svg>
          </div>

          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm text-slate-700 sm:grid-cols-2" aria-label="Legend">
            <LegendItem label="Finding on a surface (hatched)">
              <circle r={8} className="fill-[url(#odo-hatch)] stroke-slate-500 [stroke-width:1.25]" />
            </LegendItem>
            <LegendItem label="Procedure on a surface (solid)">
              <circle r={8} className="fill-teal-700 stroke-slate-500 [stroke-width:1.25]" />
            </LegendItem>
            <LegendItem label="Finding, surface not recorded">
              <circle r={5.5} className="fill-white stroke-slate-500 [stroke-width:1.25]" />
              <circle r={8} className="fill-none stroke-orange-700 [stroke-dasharray:3_2.5] [stroke-width:2.5]" />
            </LegendItem>
            <LegendItem label="Procedure, surface not recorded">
              <circle r={5.5} className="fill-white stroke-slate-500 [stroke-width:1.25]" />
              <circle r={8} className="fill-none stroke-teal-700 [stroke-width:2.5]" />
            </LegendItem>
            <LegendItem label="Has finding / has procedure">
              <path d="M-4.5 -5 L0.5 4 L-9.5 4 Z" className="fill-orange-700" />
              <rect x={2} y={-4} width={8} height={8} className="fill-teal-700" />
            </LegendItem>
            <LegendItem label="Extraction">
              <path d="M-6 -6 L6 6 M6 -6 L-6 6" className="stroke-red-700 [stroke-width:3] [stroke-linecap:round]" />
            </LegendItem>
            {editing && (
              <LegendItem label="Surface selected for charting (dotted)">
                <circle r={8} className="fill-[url(#odo-selected)] stroke-slate-500 [stroke-width:1.25]" />
              </LegendItem>
            )}
          </ul>
        </div>

        <div className="space-y-4">
          {unchartedCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-slate-500" />
              <p>
                {unchartedCount} {unchartedCount === 1 ? 'entry has' : 'entries have'} no recognised tooth number and{' '}
                {unchartedCount === 1 ? 'is' : 'are'} not shown on the chart
                {editing ? '. Select a tooth to assign it.' : '.'}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-4" aria-live="polite">
            {selected === null ? (
              <p className="text-sm text-slate-600">
                Select a tooth to see its findings and procedures{editing ? ', or to chart new ones' : ''}.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-semibold text-slate-900">
                    Tooth {selected} <span className="font-normal text-slate-600">· {capitalize(toothName(selected))}</span>
                  </h4>
                  <button type="button" className={btn.ghost} onClick={() => select(selected)}>
                    Clear selection
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-600">Findings</p>
                    {sel?.findings.length ? (
                      <ul className="space-y-1 text-sm text-slate-900">
                        {sel.findings.map(({ entry, index }) => (
                          <li key={index}>
                            {entry.finding ? capitalize(entry.finding) : <Missing label="Finding not described" />}
                            <span className="text-slate-600"> · {entry.surfaces || 'surfaces not recorded'}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Missing label="None recorded" />
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-600">Procedures</p>
                    {sel?.procedures.length ? (
                      <ul className="space-y-1 text-sm text-slate-900">
                        {sel.procedures.map(({ entry, index }) => (
                          <li key={index}>
                            {entry.procedure ? capitalize(entry.procedure) : <Missing label="Procedure not specified" />}
                            <span className="text-slate-600">
                              {' '}
                              · {entry.surfaces || 'surfaces not specified'} · {entry.materials || 'materials not specified'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Missing label="None recorded" />
                    )}
                  </div>
                </div>

                {editing && (
                  <div className="space-y-4 border-t border-slate-100 pt-4">
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium text-slate-700">
                        Surfaces <span className="font-normal text-slate-600">(optional — or click surfaces on the chart)</span>
                      </legend>
                      <div className="flex flex-wrap gap-1.5">
                        {SURFACE_ORDER.map((s) => {
                          const l = surfaceLabel(s, selected)
                          const on = pending.has(s)
                          return (
                            <button
                              key={s}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleSurface(s)}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium ring-inset focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                                on ? 'bg-sky-700 text-white ring-2 ring-sky-900' : 'bg-white text-slate-800 ring-1 ring-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              {on && <CheckIcon className="size-3.5" />}
                              {l} <span className={`text-xs ${on ? 'text-white' : 'text-slate-600'}`}>{SURFACE_NAMES[l]}</span>
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btn.secondary} onClick={addFinding}>
                        <PlusIcon /> Add finding{surfaces && ` (${surfaces})`}
                      </button>
                      <button type="button" className={btn.secondary} onClick={addProcedure}>
                        <PlusIcon /> Add procedure{surfaces && ` (${surfaces})`}
                      </button>
                    </div>

                    {unchartedCount > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-600">Not yet charted</p>
                        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                          {uncharted.findings.map(({ entry, index }) => (
                            <li key={`f${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                              <span>
                                <span className="text-slate-600">Finding: </span>
                                {entry.finding ? capitalize(entry.finding) : <Missing label="Not described" />}
                                {entry.tooth && <span className="text-slate-600"> · recorded tooth “{entry.tooth}”</span>}
                              </span>
                              <button type="button" className={`${btn.ghost} text-teal-700`} onClick={() => assignFinding(index)}>
                                Assign to tooth {selected}
                              </button>
                            </li>
                          ))}
                          {uncharted.procedures.map(({ entry, index }) => (
                            <li key={`p${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                              <span>
                                <span className="text-slate-600">Procedure: </span>
                                {entry.procedure ? capitalize(entry.procedure) : <Missing label="Not specified" />}
                                {entry.tooth && <span className="text-slate-600"> · recorded tooth “{entry.tooth}”</span>}
                              </span>
                              <button type="button" className={`${btn.ghost} text-teal-700`} onClick={() => assignProcedure(index)}>
                                Assign to tooth {selected}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {message && <p className="text-sm text-teal-800">{message}</p>}
                  </div>
                )}
                {!editing && <p className="text-xs text-slate-600">Use “Edit clinical record” to chart findings or procedures on this tooth.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function LegendItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg viewBox="-10 -10 20 20" className="size-5 shrink-0" aria-hidden="true">
        {children}
      </svg>
      {label}
    </li>
  )
}
