'use client'

import * as React from 'react'
import { Wallet } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber, plural } from '@/lib/format'
import { Panel } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { EmptyState } from '@/components/erp/empty-state'
import { axisProps, gridProps } from '@/components/erp/chart'
import { PanelHead } from '@/components/analytics/parts'
import { useNav } from '@/components/app-shell/nav-context'
import type { AnalyticsData, RevenueRow } from './compute'

const LIST = 5

/** 1500 → «1,5k», 500 → «500»: bin edges need one decimal, unlike axis ticks. */
const kTick = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}k` : String(v))

export function Revenue({ revenue }: { revenue: AnalyticsData['revenue'] }) {
  const { navigate } = useNav()

  if (revenue.paying === 0) {
    return (
      <Panel>
        <EmptyState icon={Wallet} title="Оплат пока нет" description="Доход на участника появится после первых оплат" />
      </Panel>
    )
  }

  const margin = revenue.avgMonthly != null && revenue.costPerMonth != null ? revenue.avgMonthly - revenue.costPerMonth : null
  const paying = revenue.participants.filter(p => Math.round(p.ltv * 100) > 0)
  const top = paying.slice(0, LIST)
  const bottom = [...paying].reverse().slice(0, LIST)
  const open = (id: string) => navigate('participants', 'open-participant', { id })
  const distribution = revenue.distribution.map(b => ({
    ...b,
    label: `${kTick(b.from)}–${kTick(b.to)}`,
    name: `${formatMoney(b.from)} – ${formatMoney(b.to)}`,
  }))

  return (
    <div className="flex flex-col gap-3">
      <StatStrip
        stats={[
          {
            label: 'Всего оплачено',
            value: formatMoney(revenue.totalPaid),
            sub: `${formatNumber(revenue.rows)} ${plural(revenue.rows, ['месяц', 'месяца', 'месяцев'])} с записями`,
          },
          {
            label: 'Средний платёж в месяц',
            value: revenue.avgMonthly != null ? formatMoney(revenue.avgMonthly) : '—',
            sub: 'оплачено ÷ месяцы с записями',
          },
          {
            label: 'LTV, среднее',
            value: revenue.avgLtv != null ? formatMoney(revenue.avgLtv) : '—',
            sub: (
              <>
                медиана <span className="num">{revenue.medianLtv != null ? formatMoney(revenue.medianLtv) : '—'}</span>
              </>
            ),
          },
          {
            label: 'Расход на участника в месяц',
            value: revenue.costPerMonth != null ? formatMoney(revenue.costPerMonth) : '—',
            tone: margin != null && margin < 0 ? 'destructive' : 'default',
            sub:
              margin != null ? (
                <>
                  маржа <span className={cn('num', margin < 0 ? 'text-destructive' : 'text-success')}>{formatMoney(margin, 'USD', { sign: true })}</span>
                </>
              ) : undefined,
          },
        ]}
      />

      <Panel className="p-4 sm:p-5">
        <PanelHead
          title="Распределение LTV"
          description={`Сколько участников оплатили за всё время сумму в каждом диапазоне${
            revenue.withoutPayments
              ? ` · ещё ${formatNumber(revenue.withoutPayments)} ${plural(revenue.withoutPayments, ['участник', 'участника', 'участников'])} без оплат`
              : ''
          }`}
        />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={distribution} margin={{ left: -24, right: 4, top: 4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={4} />
            <YAxis {...axisProps} width={48} allowDecimals={false} />
            <Tooltip content={<DistTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
            <Bar dataKey="count" name="Участников" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RankList title="Больше всего оплатили" description="LTV за всё время" rows={top} onOpen={open} />
        <RankList title="Меньше всего оплатили" description="Среди тех, у кого есть оплаты" rows={bottom} onOpen={open} />
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        LTV — сумма всех оплат участника. Средний платёж — LTV ÷ число месяцев с записью о платеже. Расход на участника — расходы
        (без мероприятий) за месяцы с записями ÷ число таких записей.
      </p>
    </div>
  )
}

function RankList({
  title,
  description,
  rows,
  onOpen,
}: {
  title: string
  description: string
  rows: RevenueRow[]
  onOpen: (id: string) => void
}) {
  return (
    <Panel>
      <div className="border-b px-4 py-3.5 sm:px-5">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <ul className="divide-y">
        {rows.map(r => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.program} · {formatNumber(r.months)} {plural(r.months, ['месяц', 'месяца', 'месяцев'])}
                  {r.avgMonthly != null && (
                    <>
                      {' '}
                      · в среднем <span className="num">{formatMoney(r.avgMonthly)}</span>
                    </>
                  )}
                </span>
              </span>
              <span className="num text-sm font-medium">{formatMoney(r.ltv)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function DistTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium">{b.name}</p>
      <p className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-chart-1" />
        <span className="text-muted-foreground">Участников</span>
        <span className="num ml-auto pl-3 font-medium">{formatNumber(b.count)}</span>
      </p>
    </div>
  )
}
