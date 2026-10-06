'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber, plural } from '@/lib/format'
import { PageContainer, PageHeader } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { TableSkeleton } from '@/components/erp/table-parts'
import { ChartSkeleton, LoadError, ProgramSelect, usePref } from '@/components/analytics/parts'
import type { AnalyticsData } from '@/components/reports/analytics/compute'
import { DebtAging } from '@/components/reports/analytics/debt-aging'
import { Retention } from '@/components/reports/analytics/retention'
import { Revenue } from '@/components/reports/analytics/revenue'
import { Collection } from '@/components/reports/analytics/collection'
import { pct } from '@/components/reports/analytics/shared'

type Section = 'debt' | 'retention' | 'revenue' | 'collection'

/**
 * Аналитика: debt aging, retention, revenue per participant and collection rate.
 * Data comes pre-aggregated from GET /api/analytics (formulas documented in
 * components/reports/analytics/compute.ts).
 */
export function AnalyticsPage() {
  const [programId, setProgramId] = usePref<string>('analytics-program', 'all')
  const [section, setSection] = usePref<Section>('analytics-section', 'debt')
  const [data, setData] = React.useState<AnalyticsData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setRefreshing(true)
    fetch(programId === 'all' ? '/api/analytics' : `/api/analytics?program_id=${encodeURIComponent(programId)}`)
      .then(res => res.json())
      .then(result => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else {
          setData(result.data)
          setError(null)
        }
      })
      .catch(err => !cancelled && setError(err.message))
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [programId, reloadKey])

  // A remembered program that no longer exists falls back to «all»
  const programs = data?.programs ?? []
  React.useEffect(() => {
    if (data && programId !== 'all' && !programs.some(p => p.id === programId)) setProgramId('all')
  }, [data, programs, programId, setProgramId])

  if (error && !data) {
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setLoading(true)
          setReloadKey(k => k + 1)
        }}
      />
    )
  }

  const aging = data?.aging
  const r = data?.retention.totals
  const archived12 = data?.retention.churn.reduce((s, m) => s + m.archived, 0) ?? 0

  return (
    <PageContainer>
      <PageHeader
        title="Аналитика"
        description="Долги по срокам, удержание, доход на участника и собираемость"
        actions={<ProgramSelect value={programId} onChange={setProgramId} programs={programs} />}
      />

      <div className={cn('flex flex-col gap-3 transition-opacity duration-200', refreshing && !loading && 'opacity-60')}>
        <StatStrip
          loading={loading}
          stats={[
            {
              label: 'Долг активных участников',
              value: formatMoney(aging?.total ?? 0),
              tone: aging && aging.total > 0 ? 'destructive' : 'default',
              sub: aging
                ? `${formatNumber(aging.participants.length)} ${plural(aging.participants.length, ['участник', 'участника', 'участников'])} · ${formatNumber(aging.months)} мес.`
                : undefined,
              onClick: () => setSection('debt'),
            },
            {
              label: 'Собираемость за 12 мес.',
              value: pct(data?.collection.rate),
              sub: data ? (
                <>
                  <span className="num">{formatMoney(data.collection.paid)}</span> из{' '}
                  <span className="num">{formatMoney(data.collection.billed)}</span>
                </>
              ) : undefined,
              onClick: () => setSection('collection'),
            },
            {
              label: 'Средний платёж в месяц',
              value: data?.revenue.avgMonthly != null ? formatMoney(data.revenue.avgMonthly) : '—',
              sub: data?.revenue.avgLtv != null ? (
                <>
                  LTV в среднем <span className="num">{formatMoney(data.revenue.avgLtv)}</span>
                </>
              ) : undefined,
              onClick: () => setSection('revenue'),
            },
            {
              label: 'Активные участники',
              value: r ? `${formatNumber(r.active)} из ${formatNumber(r.total)}` : '—',
              sub: archived12 ? `в архив за 12 мес.: ${formatNumber(archived12)}` : 'за 12 мес. никто не ушёл',
              onClick: () => setSection('retention'),
            },
          ]}
        />

        <div className="mt-3 overflow-x-auto scrollbar-none">
          <Segmented
            aria-label="Раздел"
            value={section}
            onChange={setSection}
            options={[
              { value: 'debt', label: 'Долги по срокам' },
              { value: 'retention', label: 'Удержание' },
              { value: 'revenue', label: 'Доход на участника' },
              { value: 'collection', label: 'Собираемость' },
            ]}
          />
        </div>

        {loading || !data ? (
          <div className="flex flex-col gap-3">
            <ChartSkeleton height={120} />
            <TableSkeleton rows={6} />
          </div>
        ) : section === 'debt' ? (
          <DebtAging key={data.programId} aging={data.aging} />
        ) : section === 'retention' ? (
          <Retention retention={data.retention} />
        ) : section === 'revenue' ? (
          <Revenue revenue={data.revenue} />
        ) : (
          <Collection collection={data.collection} />
        )}
      </div>
    </PageContainer>
  )
}
