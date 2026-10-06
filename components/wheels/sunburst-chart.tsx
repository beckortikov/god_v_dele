'use client'

import * as React from 'react'
import { PieChart } from 'lucide-react'
import { tint, wheelColor } from './colors'
import { useMediaQuery } from './shared'

export interface SunburstCategory {
  id: string
  group?: string
  name: string
  value: number
}

export const OTHER_GROUP = 'Прочее'

export function groupKey(c: { group?: string }) {
  return c.group && c.group.trim() !== '' ? c.group.trim() : OTHER_GROUP
}

/**
 * Stable colours: each group gets a hue by order of first appearance, each
 * category a tint of its group colour by its position inside the group.
 */
export function buildColors(categories: SunburstCategory[]) {
  const groups = new Map<string, string>()
  const byCat = new Map<string, string>()
  const seen = new Map<string, number>()
  for (const c of categories) {
    const g = groupKey(c)
    if (!groups.has(g)) groups.set(g, wheelColor(groups.size))
    const n = seen.get(g) ?? 0
    seen.set(g, n + 1)
    byCat.set(c.id, tint(groups.get(g)!, n))
  }
  return { group: (g: string) => groups.get(g) ?? wheelColor(0), cat: (id: string) => byCat.get(id) ?? wheelColor(0) }
}

const fmtH = (v: number) => (Math.round(v * 10) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 })

interface Slice {
  type: 'group' | 'child'
  key: string
  name: string
  value: number
  percentage: number
  color: string
  parent?: string
  d: string
  midAngle: number
  angle: number
}

export function SunburstChart({ categories, maxHours }: { categories: SunburstCategory[]; maxHours: number }) {
  // Hooks first: the original declared state after an early return, which
  // crashed the page once the total went from 0 to a positive value.
  const [active, setActive] = React.useState<Slice | null>(null)
  const wide = useMediaQuery('(min-width: 640px)')
  const colors = React.useMemo(() => buildColors(categories), [categories])

  const width = 800
  const height = 550
  const cx = width / 2
  const cy = height / 2
  const rOuter = 210
  const rMid = 140
  const rInner = 80

  const total = categories.reduce((s, c) => s + (c.value || 0), 0)
  if (total === 0 || categories.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted">
          <PieChart className="size-5" />
        </span>
        <p className="text-sm">Укажите часы, и здесь появится диаграмма</p>
      </div>
    )
  }

  const pctOfMax = Math.min(100, Math.round((total / maxHours) * 100))
  const over = total > maxHours + 0.05

  const grouped = new Map<string, { value: number; items: SunburstCategory[] }>()
  categories
    .filter(c => c.value > 0)
    .forEach(c => {
      const g = groupKey(c)
      if (!grouped.has(g)) grouped.set(g, { value: 0, items: [] })
      const e = grouped.get(g)!
      e.value += c.value
      e.items.push(c)
    })

  const arc = (start: number, angle: number, ri: number, ro: number) => {
    const a = Math.min(angle, Math.PI * 2 - 0.0001)
    const end = start + a
    const large = a > Math.PI ? 1 : 0
    const p = (r: number, t: number) => `${cx + r * Math.cos(t)} ${cy + r * Math.sin(t)}`
    return `M ${p(ri, start)} L ${p(ro, start)} A ${ro} ${ro} 0 ${large} 1 ${p(ro, end)} L ${p(ri, end)} A ${ri} ${ri} 0 ${large} 0 ${p(ri, start)} Z`
  }

  const slices: Slice[] = []
  let cum = -Math.PI / 2
  grouped.forEach((g, gName) => {
    const gAngle = (g.value / total) * 2 * Math.PI
    slices.push({
      type: 'group',
      key: `g:${gName}`,
      name: gName,
      value: g.value,
      percentage: Math.round((g.value / total) * 100),
      color: colors.group(gName),
      d: arc(cum, gAngle, rInner, rMid),
      midAngle: cum + gAngle / 2,
      angle: gAngle,
    })
    let childCum = cum
    g.items.forEach(child => {
      const cAngle = (child.value / total) * 2 * Math.PI
      if (cAngle > 0) {
        slices.push({
          type: 'child',
          key: `c:${child.id}`,
          name: child.name,
          value: child.value,
          percentage: Math.round((child.value / total) * 100),
          color: colors.cat(child.id),
          parent: gName,
          d: arc(childCum, cAngle, rMid + 3, rOuter),
          midAngle: childCum + cAngle / 2,
          angle: cAngle,
        })
      }
      childCum += cAngle
    })
    cum += gAngle
  })

  // Callout labels (wide screens only), pushed apart vertically per side
  const labels: { s: Slice; isRight: boolean; x1: number; y1: number }[] = []
  if (wide) {
    slices.forEach(s => {
      if (s.type === 'child' && s.angle >= 0.05) labels.push({ s, isRight: Math.cos(s.midAngle) >= 0, x1: 0, y1: 0 })
    })
    const MIN_GAP = 20
    for (const right of [true, false]) {
      const side = labels.filter(l => l.isRight === right)
      side.sort((a, b) => Math.sin(a.s.midAngle) - Math.sin(b.s.midAngle))
      side.forEach((l, i) => {
        let y = cy + (rOuter + 15) * Math.sin(l.s.midAngle)
        if (i > 0 && y - side[i - 1].y1 < MIN_GAP) y = side[i - 1].y1 + MIN_GAP
        l.y1 = y
        l.x1 = cx + (rOuter + 15) * Math.cos(l.s.midAngle)
      })
    }
  }

  const related = (s: Slice) =>
    !active || active.key === s.key || active.name === s.parent || active.parent === s.name

  const ringR = rInner - 8
  const circ = 2 * Math.PI * ringR
  const pad = 8
  const viewBox = wide
    ? `0 0 ${width} ${height}`
    : `${cx - rOuter - pad} ${cy - rOuter - pad} ${(rOuter + pad) * 2} ${(rOuter + pad) * 2}`

  return (
    <svg
      viewBox={viewBox}
      className="mx-auto block w-full max-w-[760px] overflow-visible font-sans select-none"
      role="img"
      aria-label={`Распределение времени: ${fmtH(total)} ч из ${maxHours}`}
      onMouseLeave={() => setActive(null)}
    >
      <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="var(--muted)" strokeWidth={5} />
      <circle
        cx={cx}
        cy={cy}
        r={ringR}
        fill="none"
        stroke={over ? 'var(--destructive)' : 'var(--primary)'}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ - (circ * pctOfMax) / 100}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 250ms ease' }}
      />

      {slices.map(s => (
        <path
          key={s.key}
          d={s.d}
          fill={s.color}
          stroke="var(--card)"
          strokeWidth={2}
          className="cursor-pointer outline-none"
          style={{ opacity: related(s) ? 1 : 0.25, transition: 'opacity 150ms' }}
          onMouseEnter={() => setActive(s)}
          onClick={() => setActive(a => (a?.key === s.key ? null : s))}
        >
          <title>{`${s.name}: ${fmtH(s.value)} ч (${s.percentage}%)`}</title>
        </path>
      ))}

      {labels.map(l => {
        const s = l.s
        const x0 = cx + rOuter * Math.cos(s.midAngle)
        const y0 = cy + rOuter * Math.sin(s.midAngle)
        const x2 = l.isRight ? l.x1 + 15 : l.x1 - 15
        return (
          <g key={`l:${s.key}`} style={{ opacity: related(s) ? 1 : 0.15, transition: 'opacity 150ms' }}>
            <polyline points={`${x0},${y0} ${l.x1},${l.y1} ${x2},${l.y1}`} fill="none" stroke="var(--border)" strokeWidth={1.5} />
            <text
              x={l.isRight ? x2 + 5 : x2 - 5}
              y={l.y1}
              textAnchor={l.isRight ? 'start' : 'end'}
              dominantBaseline="middle"
              fontSize={13}
            >
              <tspan fill="var(--foreground)">{s.name.length > 22 ? s.name.slice(0, 21) + '…' : s.name}</tspan>
              <tspan fill="var(--muted-foreground)" dx={6} className="num">
                {s.percentage}%
              </tspan>
            </text>
          </g>
        )
      })}

      {/* Centre read-out */}
      <g pointerEvents="none" textAnchor="middle">
        {active ? (
          <>
            <text x={cx} y={cy - 20} fontSize={12} fill="var(--muted-foreground)">
              {(active.type === 'group' ? 'Сфера' : active.parent ?? '').slice(0, 16)}
            </text>
            <text x={cx} y={cy + 2} fontSize={14} fontWeight={600} fill="var(--foreground)">
              {active.name.length > 15 ? active.name.slice(0, 14) + '…' : active.name}
            </text>
            <text x={cx} y={cy + 24} fontSize={13} fill="var(--muted-foreground)" className="num">
              {fmtH(active.value)} ч · {active.percentage}%
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy + 4} fontSize={28} fontWeight={600} fill={over ? 'var(--destructive)' : 'var(--foreground)'} className="num">
              {fmtH(total)}
            </text>
            <text x={cx} y={cy + 26} fontSize={13} fill="var(--muted-foreground)" className="num">
              из {maxHours} ч
            </text>
          </>
        )}
      </g>
    </svg>
  )
}
