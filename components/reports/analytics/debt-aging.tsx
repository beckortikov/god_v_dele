'use client'

import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber, plural } from '@/lib/format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Panel, PanelToolbar } from '@/components/erp/page-header'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { TablePagination } from '@/components/erp/pagination'
import { TotalsBar } from '@/components/erp/table-parts'
import { PanelHead } from '@/components/analytics/parts'
import { useNav } from '@/components/app-shell/nav-context'
import type { AnalyticsData } from './compute'
import { SectionNote, numCell, rowLinkProps } from './shared'

const PAGE_SIZE = 20

/** Older debt reads darker: one hue (destructive), stepped by opacity. */
const BUCKET_FILL = [
  'color-mix(in oklch, var(--destructive) 30%, transparent)',
  'color-mix(in oklch, var(--destructive) 50%, transparent)',
  'color-mix(in oklch, var(--destructive) 75%, transparent)',
  'var(--destructive)',
]
const BUCKET_SHORT = ['0–30', '31–60', '61–90', '90+']

export function DebtAging({ aging }: { aging: AnalyticsData['aging'] }) {
  const { navigate } = useNav()
  const [view, setView] = React.useState<'participants' | 'programs'>('participants')
  const [page, setPage] = React.useState(1)

  if (aging.total <= 0) {
    return (
      <Panel>
        <EmptyState icon={CheckCircle2} title="Долгов нет" description="Все активные участники оплатили прошлые месяцы полностью" />
      </Panel>
    )
  }

  const rows = aging.participants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-4 sm:p-5">
        <PanelHead
          title="Долг по срокам"
          description="Сколько дней прошло с конца неоплаченного месяца. Только активные участники."
        />
        {/* One bar split by age; widths are shares of the total debt */}
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Доли долга по срокам">
          {aging.buckets.map((b, i) =>
            b.amount > 0 ? (
              <div
                key={b.key}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(b.amount / aging.total) * 100}%`, background: BUCKET_FILL[i] }}
              />
            ) : null,
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {aging.buckets.map((b, i) => (
            <div key={b.key} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: BUCKET_FILL[i] }} />
                {b.label}
              </dt>
              <dd className={cn('num mt-0.5 text-lg font-semibold', b.amount > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                {formatMoney(b.amount)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {formatNumber(b.months)} {plural(b.months, ['месяц', 'месяца', 'месяцев'])}
                {b.participants > 0 && ` · ${formatNumber(b.participants)} ${plural(b.participants, ['участник', 'участника', 'участников'])}`}
              </dd>
            </div>
          ))}
        </dl>
        {aging.missingMonths > 0 && (
          <p className="mt-4 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatNumber(aging.missingMonths)} из {formatNumber(aging.months)} {plural(aging.months, ['месяца', 'месяцев', 'месяцев'])}
            </span>{' '}
            — без записи о платеже: месяц входит в срок программы, но в «Платежах» его нет. Если оплата была, внесите её, и долг
            исчезнет. Остальные {formatNumber(aging.underpaidMonths)} — оплачены не полностью.
          </p>
        )}
      </Panel>

      <Panel>
        <PanelToolbar>
          <Segmented
            size="sm"
            aria-label="Группировка"
            value={view}
            onChange={setView}
            options={[
              { value: 'participants', label: 'По участникам', count: aging.participants.length },
              { value: 'programs', label: 'По программам', count: aging.programs.length },
            ]}
          />
        </PanelToolbar>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{view === 'participants' ? 'Участник' : 'Программа'}</TableHead>
              {view === 'participants' ? (
                <TableHead className="max-lg:hidden">Программа</TableHead>
              ) : (
                <TableHead className="text-right max-sm:hidden">Участники</TableHead>
              )}
              {BUCKET_SHORT.map((l, i) => (
                <TableHead key={l} className={cn('text-right', i < 3 ? 'max-md:hidden' : 'max-sm:hidden')}>
                  {l} дн.
                </TableHead>
              ))}
              <TableHead className="text-right max-sm:hidden">Месяцев</TableHead>
              <TableHead className="text-right">Долг</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view === 'participants'
              ? rows.map(r => (
                  <TableRow key={r.id} {...rowLinkProps(() => navigate('participants', 'open-participant', { id: r.id }))}>
                    <TableCell>
                      <div className="font-medium group-hover:underline group-hover:underline-offset-2">{r.name}</div>
                      <div className="text-xs text-muted-foreground lg:hidden">
                        {r.program}
                        <span className="sm:hidden"> · {formatNumber(r.missing + r.underpaid)} мес.</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-lg:hidden">{r.program}</TableCell>
                    <BucketCells values={r.buckets} />
                    <TableCell className={cn(numCell, 'max-sm:hidden')}>
                      {r.missing + r.underpaid}
                      {r.underpaid > 0 && <span className="block text-xs text-warning">{r.underpaid} недоплата</span>}
                    </TableCell>
                    <TableCell className={cn(numCell, 'font-medium text-destructive')}>{formatMoney(r.total)}</TableCell>
                  </TableRow>
                ))
              : aging.programs.map(g => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className={cn(numCell, 'max-sm:hidden')}>{formatNumber(g.participants)}</TableCell>
                    <BucketCells values={g.buckets} />
                    <TableCell className={cn(numCell, 'max-sm:hidden')}>{formatNumber(g.months)}</TableCell>
                    <TableCell className={cn(numCell, 'font-medium text-destructive')}>{formatMoney(g.total)}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        <TotalsBar
          label={`${formatNumber(aging.participants.length)} ${plural(aging.participants.length, ['участник', 'участника', 'участников'])}`}
          value={formatMoney(aging.total)}
          tone="destructive"
        />
        {view === 'participants' && (
          <TablePagination page={page} pageSize={PAGE_SIZE} total={aging.participants.length} onPageChange={setPage} />
        )}
        <SectionNote>
          Долг месяца = план − факт; для месяца без записи — тариф участника. Нажмите на строку, чтобы открыть карточку.
        </SectionNote>
      </Panel>
    </div>
  )
}

function BucketCells({ values }: { values: number[] }) {
  return (
    <>
      {values.map((v, i) => (
        <TableCell key={i} className={cn(numCell, i < 3 ? 'max-md:hidden' : 'max-sm:hidden', v <= 0 && 'text-muted-foreground')}>
          {v > 0 ? formatMoney(v) : '—'}
        </TableCell>
      ))}
    </>
  )
}
