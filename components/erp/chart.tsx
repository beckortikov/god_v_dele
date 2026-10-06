'use client'

import { formatMoney } from '@/lib/format'

/** Categorical palette, theme-aware (CSS variables). */
export const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)']

/** Shared Recharts axis/grid props. Spread onto <XAxis>/<YAxis>/<CartesianGrid>. */
export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: 'var(--muted-foreground)', fontSize: 12 },
} as const

export const gridProps = { vertical: false, stroke: 'var(--border)' } as const

export const compactTick = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))

/** Recharts custom tooltip: <Tooltip content={<ChartTooltip />} /> */
export function ChartTooltip({
  active,
  payload,
  label,
  format = (v: number) => formatMoney(v),
}: {
  active?: boolean
  payload?: any[]
  label?: string
  format?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-pop">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="num ml-auto pl-3 font-medium">{format(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  )
}
