'use client'

import * as React from 'react'
import { Receipt } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber } from '@/lib/format'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Panel } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { ChartLegend, axisProps, compactTick, gridProps } from '@/components/erp/chart'
import { Meter, PanelHead } from '@/components/analytics/parts'
import type { AnalyticsData, CollectionMonth } from './compute'
import { SectionNote, longMonth, numCell, pct, shortMonth } from './shared'

const COLOR = 'var(--chart-income)'
const BILLED = `color-mix(in oklch, ${COLOR} 35%, transparent)`

export function Collection({ collection }: { collection: AnalyticsData['collection'] }) {
  const months = collection.months
  if (months.every(m => m.rows === 0)) {
    return (
      <Panel>
        <EmptyState icon={Receipt} title="Начислений за 12 месяцев нет" description="Собираемость появится, когда в «Платежах» будут записи" />
      </Panel>
    )
  }

  // Newest first in the table, chronological in the chart
  const tableRows = [...months].reverse()

  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-4 sm:p-5">
        <PanelHead
          title="Начислено и оплачено"
          description={`За 12 месяцев собрано ${pct(collection.rate)}: ${formatMoney(collection.paid)} из ${formatMoney(collection.billed)}`}
          aside={
            <ChartLegend
              items={[
                { label: 'Начислено', color: BILLED },
                { label: 'Оплачено', color: COLOR },
              ]}
            />
          }
        />
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={months.map(m => ({ ...m, label: shortMonth(m.year, m.month) }))} barGap={2} margin={{ left: -8, right: 4, top: 4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisProps} width={56} tickFormatter={compactTick} />
            <Tooltip content={<CollectionTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
            <Bar dataKey="billed" name="Начислено" fill={BILLED} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="paid" name="Оплачено" fill={COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Месяц</TableHead>
              <TableHead className="text-right max-sm:hidden">Начислено</TableHead>
              <TableHead className="text-right">Оплачено</TableHead>
              <TableHead className="w-44 max-sm:w-28">Собираемость</TableHead>
              <TableHead className="text-right max-md:hidden">Без записи</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map(m => (
              <TableRow key={m.key}>
                <TableCell className="font-medium whitespace-nowrap">{longMonth(m.year, m.month)}</TableCell>
                <TableCell className={cn(numCell, 'text-muted-foreground max-sm:hidden')}>{m.rows ? formatMoney(m.billed) : '—'}</TableCell>
                <TableCell className={numCell}>
                  {m.rows ? formatMoney(m.paid) : '—'}
                  {m.rows > 0 && <span className="block text-xs text-muted-foreground sm:hidden">из {formatMoney(m.billed)}</span>}
                </TableCell>
                <TableCell>
                  <RateMeter rate={m.rate} />
                </TableCell>
                <TableCell className={cn(numCell, 'max-md:hidden', m.missing ? 'text-warning' : 'text-muted-foreground')}>
                  {m.missing ? formatNumber(m.missing) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="font-semibold">За 12 месяцев</TableCell>
              <TableCell className={cn(numCell, 'text-muted-foreground max-sm:hidden')}>{formatMoney(collection.billed)}</TableCell>
              <TableCell className={cn(numCell, 'font-semibold')}>{formatMoney(collection.paid)}</TableCell>
              <TableCell>
                <RateMeter rate={collection.rate} />
              </TableCell>
              <TableCell className="max-md:hidden" />
            </TableRow>
          </TableFooter>
        </Table>
        <SectionNote>
          Начислено — план по записям месяца, оплачено — факт по тем же записям, когда бы он ни поступил; больше 100% — переплата или
          оплата вперёд. «Без записи» — активные участники, у которых месяц входит в срок программы, но записи о платеже нет: их
          суммы не входят в начисления, они видны в долгах.
        </SectionNote>
      </Panel>
    </div>
  )
}

function RateMeter({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-xs text-muted-foreground">нет начислений</span>
  const p = rate * 100
  return (
    <div className="flex items-center gap-2.5">
      <Meter value={p} tone={p >= 100 ? 'success' : p >= 80 ? 'default' : 'warning'} className="flex-1" />
      <span className="num w-11 text-right text-xs text-muted-foreground">{pct(rate)}</span>
    </div>
  )
}

function CollectionTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const m = payload[0].payload as CollectionMonth
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium">{label}</p>
      {[
        { l: 'Начислено', v: formatMoney(m.billed), c: BILLED },
        { l: 'Оплачено', v: formatMoney(m.paid), c: COLOR },
        { l: 'Собираемость', v: pct(m.rate) },
        { l: 'Записей', v: formatNumber(m.rows) },
      ].map(r => (
        <p key={r.l} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: r.c ?? 'transparent' }} />
          <span className="text-muted-foreground">{r.l}</span>
          <span className="num ml-auto pl-3 font-medium">{r.v}</span>
        </p>
      ))}
    </div>
  )
}
