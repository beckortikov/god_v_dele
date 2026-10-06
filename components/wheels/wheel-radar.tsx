'use client'

import * as React from 'react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartLegend, ChartTooltip } from '@/components/erp/chart'

export interface RadarSeries {
  key: string
  name: string
  color: string
  /** Reference line (ideal / maximum): dashed, no fill. */
  dashed?: boolean
}

/** Split a label into at most two short lines for the polar axis. */
function wrap(label: string, max = 13): string[] {
  const words = label.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > 2) return [lines[0], lines.slice(1).join(' ').slice(0, max - 1) + '…']
  return lines.map(l => (l.length > max + 3 ? l.slice(0, max + 2) + '…' : l))
}

function AngleTick(props: any) {
  const { x, y, payload, textAnchor, cx, cy } = props
  const lines = wrap(String(payload?.value ?? ''))
  // Nudge labels away from the centre a little
  const dy = y < cy - 4 ? -(lines.length - 1) * 12 - 2 : y > cy + 4 ? 6 : -((lines.length - 1) * 12) / 2
  const dx = Math.abs(x - cx) < 4 ? 0 : x > cx ? 4 : -4
  return (
    <text x={x + dx} y={y + dy} textAnchor={textAnchor} fill="var(--muted-foreground)" fontSize={11}>
      {lines.map((l, i) => (
        <tspan key={i} x={x + dx} dy={i === 0 ? '0.35em' : 12}>
          {l}
        </tspan>
      ))}
    </text>
  )
}

export function WheelRadar({
  data,
  series,
  max,
  height = 320,
  format = (v: number) => String(v),
}: {
  /** Rows with a `category` key plus one numeric key per series. */
  data: Record<string, any>[]
  series: RadarSeries[]
  max: number
  height?: number
  format?: (v: number) => string
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} outerRadius="68%" margin={{ top: 12, right: 40, bottom: 12, left: 40 }}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="category" tick={<AngleTick />} tickLine={false} />
          <PolarRadiusAxis
            domain={[0, max]}
            angle={90 - 180 / Math.max(data.length, 1)}
            tickCount={Math.min(max, 5) + 1}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10, opacity: 0.7 }}
            axisLine={false}
            tickLine={false}
          />
          {series.map(s => (
            <Radar
              key={s.key}
              name={s.name}
              dataKey={s.key}
              stroke={s.color}
              fill={s.dashed ? 'none' : s.color}
              fillOpacity={s.dashed ? 0 : 0.14}
              strokeWidth={s.dashed ? 1.5 : 2}
              strokeDasharray={s.dashed ? '4 4' : undefined}
              dot={s.dashed ? false : { r: 2.5, fill: s.color, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
          <Tooltip content={<ChartTooltip format={format} />} />
        </RadarChart>
      </ResponsiveContainer>
      {series.length > 0 && (
        <ChartLegend items={series.map(s => ({ label: s.name, color: s.color }))} />
      )}
    </div>
  )
}
