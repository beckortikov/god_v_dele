'use client'

import * as React from 'react'
import { Instagram, PhoneCall, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber } from '@/lib/format'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { CALL_STEPS, share, stepCounts, type StageCounts } from '@/lib/crm-funnel'

interface Group {
  id: string | null
  name: string
  counts: StageCounts
  total: number
  event_date?: string | null
}

interface FunnelData {
  options: { id: string; name: string; event_date: string; location: string | null }[]
  total: StageCounts
  events: Group[]
  hunters: Group[]
}

type Tab = 'calls' | 'instagram'

const pct = (v: number) => `${Math.round(v * 100)}%`

/** «Воронка»: how far people got, for «Обзвон» now and for Instagram once the inbox is connected. */
export function FunnelPage() {
  const [tab, setTab] = React.useState<Tab>('calls')
  return (
    <PageContainer>
      <PageHeader
        title="Воронка"
        description="Сколько людей дошло до каждого шага. Каждый следующий шаг включает тех, кто прошёл дальше"
        actions={
          <Segmented
            aria-label="Воронка"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'calls', label: (<><PhoneCall className="size-3.5" />Обзвон</>) },
              { value: 'instagram', label: (<><Instagram className="size-3.5" />Instagram</>) },
            ]}
          />
        }
      />
      {tab === 'calls' ? <CallsFunnel /> : <InstagramFunnel />}
    </PageContainer>
  )
}

function CallsFunnel() {
  const [event, setEvent] = React.useState<string>('all')
  const [data, setData] = React.useState<FunnelData | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    setData(null)
    fetch(`/api/crm/funnel${event === 'all' ? '' : `?event=${encodeURIComponent(event)}`}`)
      .then(async r => {
        const b = await r.json().catch(() => ({}))
        if (!r.ok || b.error) throw new Error(b.error || `Ошибка ${r.status}`)
        return b as FunnelData
      })
      .then(b => live && (setData(b), setError(null)))
      .catch(e => live && setError(e.message))
    return () => {
      live = false
    }
  }, [event])

  if (error) {
    return (
      <Panel>
        <EmptyState icon={SearchX} title="Не удалось загрузить" description={error} />
      </Panel>
    )
  }

  const steps = data ? stepCounts(data.total) : null
  const top = steps?.[0].count ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={event} onValueChange={setEvent}>
          <SelectTrigger className="min-w-64" aria-label="Мероприятие">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все мероприятия</SelectItem>
            {data?.options.map(o => (
              <SelectItem key={o.id} value={o.id}>
                <span className="truncate">{o.name}</span>
                <span className="num ml-1 text-xs text-muted-foreground">{formatDate(o.event_date)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Panel className="p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Путь приглашённых</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Доля — от тех, кто в списке; стрелка — переход с прошлого шага</p>
        {!steps ? (
          <div className="mt-5 space-y-3">
            {CALL_STEPS.map(s => (
              <Skeleton key={s.id} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : top === 0 ? (
          <EmptyState icon={PhoneCall} title="В списках пока никого" description="Людей в мероприятия добавляют на странице «Оффлайн-события»" />
        ) : (
          <ol className="mt-5 space-y-2.5">
            {steps.map((s, i) => {
              const w = share(s.count, top)
              const fromPrev = i > 0 ? share(s.count, steps[i - 1].count) : null
              return (
                <li key={s.id} className="grid grid-cols-[minmax(7.5rem,10rem)_1fr_auto] items-center gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                  <span className="relative h-9 rounded-md bg-muted" title={`${s.label}: ${s.count} из ${top} (${pct(w)})`}>
                    <span className="absolute inset-y-0 left-0 rounded-md bg-primary transition-[width] duration-500" style={{ width: `${Math.max(w * 100, s.count ? 1.5 : 0)}%` }} />
                    <span className={cn('num absolute inset-y-0 flex items-center px-2.5 text-sm font-semibold', w > 0.2 ? 'left-0 text-primary-foreground' : 'text-foreground')} style={w > 0.2 ? undefined : { left: `${w * 100}%` }}>
                      {formatNumber(s.count)}
                    </span>
                  </span>
                  <span className="num w-24 text-right text-sm">
                    <span className="font-semibold">{pct(w)}</span>
                    {fromPrev !== null && <span className="ml-1.5 text-xs text-muted-foreground">↓{pct(fromPrev)}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <GroupTable title="По мероприятиям" empty="Мероприятий нет" rows={data?.events.filter(e => e.total > 0)} dated />
        <GroupTable title="По хантерам" empty="Хантеров пока не назначали" rows={data?.hunters} />
      </div>
    </div>
  )
}

/** Each row: how many in the list, then each step's share of them; the share that paid as a bar. */
function GroupTable({ title, rows, empty, dated }: { title: string; rows: Group[] | undefined; empty: string; dated?: boolean }) {
  const shown = CALL_STEPS.slice(1)
  return (
    <Panel className="overflow-hidden">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      {!rows ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  {dated ? 'Мероприятие' : 'Хантер'}
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  В списке
                </th>
                {shown.map(s => (
                  <th key={s.id} scope="col" className="px-2 py-2 text-right font-medium" title={s.hint}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const st = stepCounts(r.counts)
                const paid = share(st[st.length - 1].count, r.total)
                return (
                  <tr key={r.id ?? 'none'} className="border-t">
                    <th scope="row" className="max-w-56 px-4 py-2.5 text-left font-medium">
                      <span className={cn('block truncate', r.id === null && 'text-muted-foreground')}>{r.name}</span>
                      {dated && r.event_date && <span className="num block text-xs font-normal text-muted-foreground">{formatDate(r.event_date)}</span>}
                      <span className="mt-1.5 block h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted" title={`Оплатили ${pct(paid)}`}>
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${paid * 100}%` }} />
                      </span>
                    </th>
                    <td className="num px-2 py-2.5 text-right font-semibold">{formatNumber(r.total)}</td>
                    {st.slice(1).map(s => (
                      <td key={s.id} className="num px-2 py-2.5 text-right">
                        {formatNumber(s.count)}
                        <span className="block text-xs text-muted-foreground">{pct(share(s.count, r.total))}</span>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

const INSTAGRAM_STEPS = ['Новый', 'В диалоге', 'Мастермайнд', 'Оплата', 'Участник']

function InstagramFunnel() {
  return (
    <Panel>
      <EmptyState
        icon={Instagram}
        title="Воронка Instagram появится вместе с перепиской"
        description="Когда подключим директ и комментарии в CRM, здесь будут клиенты по этапам и переходы между ними"
        action={
          <ol className="flex flex-wrap justify-center gap-1.5">
            {INSTAGRAM_STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded-full border px-2.5 py-1">{s}</span>
                {i < INSTAGRAM_STEPS.length - 1 && <span aria-hidden>→</span>}
              </li>
            ))}
          </ol>
        }
      />
    </Panel>
  )
}
