'use client'

import * as React from 'react'
import { Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { formatNumber, plural } from '@/lib/format'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip as Tip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Panel } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { ChartLegend, axisProps, gridProps } from '@/components/erp/chart'
import { Meter, PanelHead } from '@/components/analytics/parts'
import { COHORT_OFFSETS, type AnalyticsData, type ChurnMonth } from './compute'
import { SectionNote, longMonth, numCell, pct, shortMonth } from './shared'

const JOINED = 'var(--chart-1)'
const LEFT = 'var(--chart-4)'

export function Retention({ retention }: { retention: AnalyticsData['retention'] }) {
  const { programs, totals, cohorts, churn } = retention

  if (totals.total === 0) {
    return (
      <Panel>
        <EmptyState icon={Users} title="Участников пока нет" description="Удержание появится, когда в программе будут участники" />
      </Panel>
    )
  }

  const archived12 = churn.reduce((s, m) => s + m.archived, 0)
  const completed12 = churn.reduce((s, m) => s + m.completed, 0)
  const rated = churn.filter(m => m.churnRate != null)
  const avgChurn = rated.length ? rated.reduce((s, m) => s + (m.churnRate as number), 0) / rated.length : null

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <PanelHead title="Статусы по программам" description="Сколько участников сейчас учится, завершили программу или ушли в архив" />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Программа</TableHead>
              <TableHead className="text-right">Активные</TableHead>
              <TableHead className="text-right max-sm:hidden">Завершили</TableHead>
              <TableHead className="text-right max-sm:hidden">В архиве</TableHead>
              <TableHead className="text-right max-md:hidden">Всего</TableHead>
              <TableHead className="w-44 max-sm:w-24">Доля активных</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programs.map(p => (
              <StatusRow key={p.id} {...p} />
            ))}
          </TableBody>
          {programs.length > 1 && (
            <TableFooter>
              <StatusRow name="Итого" bold {...totals} />
            </TableFooter>
          )}
        </Table>
      </Panel>

      <Panel>
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <PanelHead
            title="Когорты по месяцу старта"
            description="Какая доля участников всё ещё с нами через N месяцев после старта"
          />
        </div>
        {cohorts.length === 0 ? (
          <EmptyState icon={Users} title="Нет дат старта" description="Укажите дату начала у участников, чтобы увидеть когорты" className="py-10" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Старт</TableHead>
                <TableHead className="text-right max-sm:hidden">Участников</TableHead>
                {COHORT_OFFSETS.map((n, i) => (
                  <TableHead key={n} className={cn('text-center', i >= 3 && 'max-sm:hidden')}>
                    +{n} мес.
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cohorts.map(c => (
                <TableRow key={c.key} className="hover:bg-transparent">
                  <TableCell className="font-medium whitespace-nowrap">
                    <span className="max-sm:hidden">{longMonth(c.year, c.month)}</span>
                    <span className="sm:hidden">{shortMonth(c.year, c.month)}</span>
                    <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                      {formatNumber(c.size)} чел.
                    </span>
                  </TableCell>
                  <TableCell className={cn(numCell, 'max-sm:hidden')}>{formatNumber(c.size)}</TableCell>
                  {c.cells.map((v, i) => (
                    <TableCell key={i} className={cn('p-1 text-center', i >= 3 && 'max-sm:hidden')}>
                      <CohortCell value={v} size={c.size} offset={COHORT_OFFSETS[i]} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <SectionNote>
          Истории статусов в базе нет, поэтому месяц ухода — это месяц последнего изменения карточки участника. «—» — этот срок ещё
          не наступил.
        </SectionNote>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <PanelHead
          title="Приход и отток по месяцам"
          description={
            archived12 + completed12 === 0
              ? 'За 12 месяцев никто не ушёл в архив и не завершил программу'
              : `Отток в среднем ${pct(avgChurn)} в месяц · ушли в архив ${formatNumber(archived12)}, завершили ${formatNumber(completed12)}`
          }
          aside={
            <ChartLegend
              items={[
                { label: 'Пришли', color: JOINED },
                { label: 'Ушли в архив', color: LEFT },
              ]}
            />
          }
        />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={churn.map(m => ({ ...m, label: shortMonth(m.year, m.month) }))}
            barGap={2}
            margin={{ left: -24, right: 4, top: 4 }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisProps} width={48} allowDecimals={false} />
            <Tooltip content={<ChurnTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
            <Bar dataKey="joined" name="Пришли" fill={JOINED} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="archived" name="Ушли в архив" fill={LEFT} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-3 text-xs text-muted-foreground">
          Отток месяца = ушли в архив за месяц ÷ активные на начало месяца. Завершение программы оттоком не считается.
        </p>
      </Panel>
    </div>
  )
}

function StatusRow({
  name,
  active,
  completed,
  archived,
  total,
  bold,
}: {
  name: string
  active: number
  completed: number
  archived: number
  total: number
  bold?: boolean
}) {
  const share = total > 0 ? active / total : 0
  return (
    <TableRow className={cn(bold && 'hover:bg-transparent')}>
      <TableCell className={cn('font-medium', bold && 'font-semibold')}>{name}</TableCell>
      <TableCell className={cn(numCell, bold && 'font-semibold')}>{formatNumber(active)}</TableCell>
      <TableCell className={cn(numCell, 'max-sm:hidden', !completed && 'text-muted-foreground')}>{formatNumber(completed)}</TableCell>
      <TableCell className={cn(numCell, 'max-sm:hidden', !archived && 'text-muted-foreground')}>{formatNumber(archived)}</TableCell>
      <TableCell className={cn(numCell, 'max-md:hidden')}>{formatNumber(total)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Meter value={share * 100} className="flex-1" />
          <span className="num w-10 text-right text-xs text-muted-foreground">{pct(share)}</span>
        </div>
      </TableCell>
    </TableRow>
  )
}

/** Retention share as a tinted cell: one hue (accent), stronger = more retained. */
function CohortCell({ value, size, offset }: { value: number | null; size: number; offset: number }) {
  if (value == null || size === 0) return <span className="block py-1.5 text-muted-foreground">—</span>
  const share = value / size
  return (
    <Tip>
      <TooltipTrigger asChild>
        <span
          className="num block rounded-md py-1.5 text-xs font-medium"
          style={{ background: `color-mix(in oklch, var(--primary) ${Math.round(8 + share * 30)}%, transparent)` }}
        >
          {pct(share)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Через {offset} {plural(offset, ['месяц', 'месяца', 'месяцев'])}: {value} из {size}
      </TooltipContent>
    </Tip>
  )
}

function ChurnTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const m = payload[0].payload as ChurnMonth
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium">{label}</p>
      <Line label="Активных на начало" value={formatNumber(m.activeAtStart)} />
      <Line label="Пришли" value={formatNumber(m.joined)} color={JOINED} />
      <Line label="Ушли в архив" value={formatNumber(m.archived)} color={LEFT} />
      {m.completed > 0 && <Line label="Завершили" value={formatNumber(m.completed)} />}
      <Line label="Отток" value={pct(m.churnRate)} />
    </div>
  )
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <p className="flex items-center gap-2">
      {color ? <span className="size-2 rounded-full" style={{ background: color }} /> : <span className="size-2" />}
      <span className="text-muted-foreground">{label}</span>
      <span className="num ml-auto pl-3 font-medium">{value}</span>
    </p>
  )
}
