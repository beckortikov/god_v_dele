'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ClipboardList, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { plural, todayISO } from '@/lib/format'
import { shortDate } from '@/lib/sprints'
import type { PlanOverviewRow, PlansOverview } from '@/app/api/op-plans/route'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TableSkeleton } from '@/components/erp/table-parts'
import { MigrationRequired, api, useStoredState } from '@/components/sprints/shared'
import { ProgressBar, usd } from '@/components/plan/plan-shared'
import { MyPlanPage } from '@/components/cabinet/my-plan-page'

type Program = { id: string; name: string }
type View = 'all' | 'waiting' | 'none'
const ALL_GROUPS = '__all__'

/** Curators: every participant of a поток with their operational plan, and the plan itself read-only. */
export function PlansPage() {
  const [programs, setPrograms] = React.useState<Program[] | null>(null)
  const [programId, setProgramId] = useStoredState<string>('plans-program', '')
  const [groupId, setGroupId] = useStoredState<string>(`plans-group:${programId}`, ALL_GROUPS)
  const [data, setData] = React.useState<PlansOverview | null>(null)
  const [migration, setMigration] = React.useState(false)
  const [view, setView] = React.useState<View>('all')
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState<PlanOverviewRow['participant'] | null>(null)

  React.useEffect(() => {
    api<{ data: Program[] }>('/api/programs')
      .then(r => setPrograms(r.data ?? []))
      .catch(e => {
        setPrograms([])
        toast.error('Не удалось загрузить программы', { description: (e as Error).message })
      })
  }, [])

  React.useEffect(() => {
    if (programs?.length && !programs.some(p => p.id === programId)) setProgramId(programs[0].id)
  }, [programs, programId, setProgramId])

  React.useEffect(() => {
    if (!programId) return
    let live = true
    setData(null)
    api<{ data: PlansOverview }>(`/api/op-plans?program_id=${programId}`)
      .then(r => live && (setData(r.data), setMigration(false)))
      .catch(e => {
        if (!live) return
        if (e instanceof MigrationRequired) setMigration(true)
        else toast.error('Не удалось загрузить планы', { description: (e as Error).message })
        setData({ rows: [], groups: [] })
      })
    return () => {
      live = false
    }
  }, [programId, open])

  if (open) {
    return <MyPlanPage participantId={open.id} readOnly title={open.name} onBack={() => setOpen(null)} />
  }

  const today = todayISO()
  const groups = data?.groups ?? []
  const group = groups.find(g => g.id === groupId)
  const inGroup = (data?.rows ?? []).filter(r => !group || r.participant.group_id === group.id)
  const withPlan = inGroup.filter(r => r.summary)
  const totals = withPlan.reduce(
    (t, r) => ({ total: t.total + r.summary!.total, done: t.done + r.summary!.done, waiting: t.waiting + r.summary!.waiting, paid: t.paid + r.summary!.paid }),
    { total: 0, done: 0, waiting: 0, paid: 0 }
  )
  const q = query.trim().toLowerCase()
  const shown = inGroup
    .filter(r => (view === 'waiting' ? (r.summary?.waiting ?? 0) > 0 : view === 'none' ? !r.summary : true))
    .filter(r => !q || r.participant.name.toLowerCase().includes(q))
    // who needs attention first: deadlines without a result, then excuses; people without a plan last
    .sort((a, b) => Number(!a.summary) - Number(!b.summary) || (b.summary?.waiting ?? 0) - (a.summary?.waiting ?? 0) || (b.summary?.excuses ?? 0) - (a.summary?.excuses ?? 0) || a.participant.name.localeCompare(b.participant.name, 'ru'))
  const groupName = (id: string | null) => groups.find(g => g.id === id)?.name

  return (
    <PageContainer>
      <PageHeader
        title="Операционные планы"
        description="Планы участников потока: что сделано, где прошёл срок и сколько отмазок"
        actions={
          <>
            {programs && programs.length > 0 && (
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger size="sm" className="min-w-44" aria-label="Поток">
                  <SelectValue placeholder="Поток" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {groups.length > 0 && (
              <Select value={group ? groupId : ALL_GROUPS} onValueChange={setGroupId}>
                <SelectTrigger size="sm" className="min-w-36" aria-label="Группа">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_GROUPS}>Все группы</SelectItem>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        }
      />

      {migration ? (
        <Panel>
          <EmptyState icon={Database} title="Планы ещё не подключены" description="Нужна миграция migrations/024_operational_plan.sql в базе данных." />
        </Panel>
      ) : programs && !programs.length ? (
        <Panel>
          <EmptyState icon={ClipboardList} title="Программ пока нет" description="Планы появятся, когда в программе будут участники." />
        </Panel>
      ) : (
        <>
          <StatStrip
            className="mb-4"
            loading={!data}
            stats={[
              { label: 'Ведут план', value: `${withPlan.length} из ${inGroup.length}`, sub: plural(inGroup.length, ['участник', 'участника', 'участников']) },
              { label: 'Выполнено', value: totals.total ? `${Math.round((totals.done / totals.total) * 100)}%` : '—', sub: `${totals.done} из ${totals.total} действий` },
              { label: 'Ждут итога', value: totals.waiting, tone: totals.waiting ? 'warning' : 'default', sub: 'срок прошёл, итог не отмечен' },
              { label: 'Отдано за отмазки', value: totals.paid ? `−${usd(totals.paid)}` : usd(0), tone: totals.paid ? 'destructive' : 'default' },
            ]}
          />

          <Panel>
            <PanelToolbar>
              <Segmented
                size="sm"
                aria-label="Кого показать"
                value={view}
                onChange={setView}
                options={[
                  { value: 'all', label: 'Все', count: inGroup.length },
                  { value: 'waiting', label: 'Ждут итога', count: inGroup.filter(r => (r.summary?.waiting ?? 0) > 0).length },
                  { value: 'none', label: 'Без плана', count: inGroup.length - withPlan.length },
                ]}
              />
              <SearchInput value={query} onChange={setQuery} placeholder="Участник" className="sm:ml-auto" />
            </PanelToolbar>

            {!data ? (
              <TableSkeleton toolbar={false} rows={6} />
            ) : !shown.length ? (
              <EmptyState
                icon={ClipboardList}
                title={q ? 'Никого не нашлось' : view === 'waiting' ? 'Просроченных итогов нет' : view === 'none' ? 'План есть у всех' : 'В потоке нет участников'}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Участник</TableHead>
                      <TableHead className="w-52">Выполнено</TableHead>
                      <TableHead className="w-28 text-right">Ждут итога</TableHead>
                      <TableHead className="w-24 text-right">Отмазки</TableHead>
                      <TableHead className="w-28 text-right">Отдано</TableHead>
                      <TableHead className="w-28 text-right">На кону</TableHead>
                      <TableHead className="w-64">Ближайший срок</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map(r => {
                      const s = r.summary
                      return (
                        <TableRow key={r.participant.id} className="cursor-pointer" onClick={() => setOpen(r.participant)}>
                          <TableCell className="py-2.5">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                setOpen(r.participant)
                              }}
                              className="text-left font-medium outline-none hover:underline focus-visible:underline"
                            >
                              {r.participant.name}
                            </button>
                            {groupName(r.participant.group_id) && <span className="block text-xs text-muted-foreground">{groupName(r.participant.group_id)}</span>}
                          </TableCell>
                          {s ? (
                            <>
                              <TableCell>
                                <span className="flex items-center gap-2.5">
                                  <ProgressBar value={s.total ? s.done / s.total : 0} className="w-20" />
                                  <span className="num text-sm">
                                    {s.done} из {s.total}
                                  </span>
                                </span>
                              </TableCell>
                              <TableCell className={cn('num text-right', s.waiting ? 'font-semibold text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' : 'text-muted-foreground')}>{s.waiting || '—'}</TableCell>
                              <TableCell className={cn('num text-right', s.excuses ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{s.excuses || '—'}</TableCell>
                              <TableCell className={cn('num text-right', s.paid ? 'text-destructive' : 'text-muted-foreground')}>{s.paid ? `−${usd(s.paid)}` : '—'}</TableCell>
                              <TableCell className="num text-right">{s.atStake ? usd(s.atStake) : '—'}</TableCell>
                              <TableCell>
                                {r.next ? (
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      className={cn(
                                        'num inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium',
                                        r.next.due_date < today ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground'
                                      )}
                                    >
                                      {shortDate(r.next.due_date)}
                                    </span>
                                    <span className="truncate text-sm">{r.next.title}</span>
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </>
                          ) : (
                            <TableCell colSpan={6} className="text-sm text-muted-foreground">
                              План ещё не создан
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </>
      )}
    </PageContainer>
  )
}
