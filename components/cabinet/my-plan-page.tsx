'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, ClipboardList, MessageCircleQuestion, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, plural, todayISO } from '@/lib/format'
import { addDays, shortDate } from '@/lib/sprints'
import {
  STATE_META,
  TEMPLATE_DIRECTIONS,
  actionState,
  byDeadline,
  dueHint,
  planSummary,
  suggestionsFor,
  type ActionState,
  type MyPlanData,
  type OpAction,
  type OpDirection,
  type OpGoal,
} from '@/lib/op-plan'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/erp/empty-state'
import { ExportButton } from '@/components/erp/export-button'
import { exportToExcel } from '@/components/erp/export'
import { useConfirm } from '@/components/erp/confirm'
import { MigrationRequired, PriorityMark, ProgressBar, StatePill, planApi, usd, usePlanIndex } from '@/components/plan/plan-shared'
import { ActionFormSheet, type ActionFormTarget } from '@/components/plan/action-form-sheet'
import { ActionSheet } from '@/components/plan/action-sheet'
import { NameDialog, PlanSetup, VisionSheet } from '@/components/plan/plan-setup'

type Filter = 'all' | ActionState

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'work', label: 'В работе' },
  { id: 'waiting', label: 'Ждут итога' },
  { id: 'excuse', label: 'Отмазки' },
  { id: 'done', label: 'Сделано' },
]

type NameTarget =
  | { kind: 'direction-new' }
  | { kind: 'direction-rename'; direction: OpDirection }
  | { kind: 'goal-new'; direction: OpDirection }
  | { kind: 'goal-rename'; goal: OpGoal }

/** Desktop columns of an action row; the header row uses the same template. */
const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_96px_minmax(0,1.1fr)_28px_88px_104px] lg:items-center lg:gap-4'

export function MyPlanPage({
  participantId,
  readOnly = false,
  title,
  onBack,
}: {
  participantId: string | null
  /** A curator looking at a participant's plan: nothing can be changed. */
  readOnly?: boolean
  /** Shown instead of «Мой план» (the participant's name for a curator). */
  title?: string
  onBack?: () => void
}) {
  const today = todayISO()
  const confirm = useConfirm()
  const [data, setData] = React.useState<MyPlanData | null>(null)
  const [error, setError] = React.useState<'migration' | string | null>(null)
  const [filter, setFilter] = React.useState<Filter>('all')
  const [query, setQuery] = React.useState('')
  const [form, setForm] = React.useState<ActionFormTarget | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [visionOpen, setVisionOpen] = React.useState(false)
  const [naming, setNaming] = React.useState<NameTarget | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const index = usePlanIndex(data)

  const load = React.useCallback(async () => {
    if (!participantId) return
    try {
      const r = await planApi<{ data: MyPlanData }>(participantId, '')
      setData(r.data)
      setError(null)
    } catch (e) {
      setError(e instanceof MigrationRequired ? 'migration' : (e as Error).message)
    }
  }, [participantId])

  React.useEffect(() => {
    load()
  }, [load])

  if (!participantId) {
    return (
      <Shell>
        <EmptyState
          icon={MessageCircleQuestion}
          title="Профиль участника не подключён"
          description="Ваш вход пока не связан с карточкой участника. Напишите менеджеру программы, и он подключит её."
        />
      </Shell>
    )
  }
  if (error === 'migration') {
    return (
      <Shell>
        <EmptyState icon={ClipboardList} title="Раздел скоро заработает" description="Здесь появится ваш операционный план. Загляните чуть позже." />
      </Shell>
    )
  }
  if (error && !data) {
    return (
      <Shell>
        <EmptyState
          icon={MessageCircleQuestion}
          title="Не удалось загрузить план"
          description="Проверьте интернет и попробуйте ещё раз."
          action={<Button variant="outline" size="sm" onClick={load}>Повторить</Button>}
        />
      </Shell>
    )
  }
  if (!data) return <Shell><LoadingState /></Shell>
  if (!data.plan || !data.directions.length) {
    if (!readOnly) return <PlanSetup participantId={participantId} onCreated={setData} />
    return (
      <Shell wide>
        <PageTitle title={title} onBack={onBack} />
        <EmptyState icon={ClipboardList} title="Плана пока нет" description="Участник ещё не заполнил операционный план. Он появится здесь, как только будет создан." />
      </Shell>
    )
  }

  const summary = planSummary(data, today)
  const stateOf = (a: OpAction) => actionState(a, index.excusesOf.get(a.id) ?? [], today)
  const q = query.trim().toLowerCase()
  const matches = (a: OpAction) =>
    (filter === 'all' || stateOf(a) === filter) &&
    (!q || a.title.toLowerCase().includes(q) || (a.indicator ?? '').toLowerCase().includes(q) || a.owners.some(o => o.toLowerCase().includes(q)))
  const narrowed = filter !== 'all' || !!q
  const shownCount = data.actions.filter(matches).length
  const waiting = byDeadline(data.actions).filter(a => stateOf(a) === 'waiting')
  const upcoming = byDeadline(data.actions).filter(a => a.due_date).slice(0, 4)
  const placeOf = (a: OpAction) => {
    const g = index.goals.get(a.goal_id)
    const d = g ? index.directions.get(g.direction_id) : undefined
    return [d?.title, g?.title].filter(Boolean).join(' · ')
  }
  const selected = data.actions.find(a => a.id === openId) ?? null
  const pct = summary.total ? summary.done / summary.total : 0

  const quickToggle = async (a: OpAction) => {
    setBusy(a.id)
    try {
      await planApi(participantId, `/actions/${a.id}/result`, { method: 'POST', json: { type: a.status === 'done' ? 'reopen' : 'done' } })
      if (a.status !== 'done') toast.success('Сделано', { description: a.title })
      await load()
    } catch (e) {
      toast.error('Не получилось', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const removeDirection = async (d: OpDirection) => {
    const n = data.actions.filter(a => index.goals.get(a.goal_id)?.direction_id === d.id).length
    const ok = await confirm({
      title: `Удалить направление «${d.title}»?`,
      description: n ? `Вместе с ним удалятся микро-цели и ${n} ${plural(n, ['действие', 'действия', 'действий'])}.` : 'В нём пока нет действий.',
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      await planApi(participantId, `/directions/${d.id}`, { method: 'DELETE' })
      toast.success('Направление удалено')
      await load()
    } catch (e) {
      toast.error('Не удалось удалить', { description: (e as Error).message })
    }
  }

  const removeGoal = async (g: OpGoal) => {
    const n = data.actions.filter(a => a.goal_id === g.id).length
    const ok = await confirm({
      title: `Удалить микро-цель «${g.title}»?`,
      description: n ? `Вместе с ней удалятся ${n} ${plural(n, ['действие', 'действия', 'действий'])}.` : 'В ней пока нет действий.',
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      await planApi(participantId, `/goals/${g.id}`, { method: 'DELETE' })
      toast.success('Микро-цель удалена')
      await load()
    } catch (e) {
      toast.error('Не удалось удалить', { description: (e as Error).message })
    }
  }

  const submitName = async (name: string) => {
    if (!naming) return
    if (naming.kind === 'direction-new') await planApi(participantId, '/directions', { method: 'POST', json: { title: name } })
    if (naming.kind === 'direction-rename') await planApi(participantId, `/directions/${naming.direction.id}`, { method: 'PATCH', json: { title: name } })
    if (naming.kind === 'goal-new') await planApi(participantId, '/goals', { method: 'POST', json: { direction_id: naming.direction.id, title: name } })
    if (naming.kind === 'goal-rename') await planApi(participantId, `/goals/${naming.goal.id}`, { method: 'PATCH', json: { title: name } })
    await load()
  }

  const exportPlan = () => {
    const rows = data.directions.flatMap(d =>
      data.goals.filter(g => g.direction_id === d.id).flatMap(g => data.actions.filter(a => a.goal_id === g.id).map(a => ({ d, g, a })))
    )
    return exportToExcel({
      filename: 'Операционный план',
      columns: [
        { header: 'Направление', value: r => r.d.title },
        { header: 'Микро-цель', value: r => r.g.title },
        { header: 'Действие', value: r => r.a.title },
        { header: 'Индикатор', value: r => r.a.indicator ?? '' },
        { header: 'Срок', value: r => r.a.due_date, type: 'date' },
        { header: 'Ответственные', value: r => r.a.owners.join(', ') },
        { header: 'Приоритет', value: r => r.a.priority },
        { header: 'Цена слова, $', value: r => r.a.price, type: 'money' },
        { header: 'Статус', value: r => STATE_META[stateOf(r.a)].label },
        { header: 'Отмазок', value: r => index.excusesOf.get(r.a.id)?.length ?? 0, type: 'number' },
      ],
      rows,
    })
  }

  return (
    <Shell wide>
      <PageTitle title={title} onBack={onBack}>
        <ExportButton className="max-sm:hidden" empty={!data.actions.length} onExport={exportPlan} />
        {!readOnly && (
          <Button onClick={() => setForm({})}>
            <Plus />
            Новое действие
          </Button>
        )}
      </PageTitle>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setVisionOpen(true)}
          className="group flex flex-col items-start gap-1.5 rounded-2xl bg-primary-soft px-5 py-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <span className="flex w-full items-center justify-between text-[11px] font-semibold tracking-[0.06em] text-primary-soft-foreground uppercase">
            Видение{data.plan.vision_date ? ` · до ${formatDate(data.plan.vision_date)}` : ''}
            {!readOnly && <Pencil className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100" />}
          </span>
          <span className={cn('text-[15px] leading-snug font-medium text-pretty', data.plan.vision ? 'text-foreground' : 'text-primary-soft-foreground')}>
            {data.plan.vision || (readOnly ? 'Видение не заполнено' : 'Добавьте видение: каким станет бизнес и к какой дате')}
          </span>
        </button>

        <section aria-label="Итоги плана" className="rounded-2xl border bg-card p-5 shadow-xs">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Выполнено</p>
              <p className="num text-[15px] font-medium">
                {summary.done} из {summary.total} {plural(summary.total, ['действия', 'действий', 'действий'])}
              </p>
            </div>
            <span className="num text-[34px] leading-none font-bold tracking-tight">{Math.round(pct * 100)}%</span>
          </div>
          <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            {summary.total > 0 && (
              <>
                <span className="bg-success" style={{ width: `${(summary.done / summary.total) * 100}%` }} />
                <span className="bg-warning" style={{ width: `${(summary.waiting / summary.total) * 100}%` }} />
                <span className="bg-destructive" style={{ width: `${(summary.excuse / summary.total) * 100}%` }} />
              </>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3 min-[420px]:grid-cols-4">
            <Count label="Сделано" value={summary.done} dot="bg-success" />
            <Count label="В работе" value={summary.work} dot="bg-muted-foreground/40" />
            <Count label="Ждут итога" value={summary.waiting} dot="bg-warning" />
            <Count label="Отмазки" value={summary.excuses} dot="bg-destructive" />
          </dl>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3 text-sm">
            <span className="text-muted-foreground">Цена слова</span>
            <span className="num">
              <span className={cn('font-semibold', summary.paid ? 'text-destructive' : 'text-foreground')}>{summary.paid ? `−${usd(summary.paid)}` : usd(0)}</span>
              <span className="text-muted-foreground"> отдано · </span>
              <span className="font-semibold">{usd(summary.atStake)}</span>
              <span className="text-muted-foreground"> на кону</span>
            </span>
          </div>
        </section>
      </div>

      {waiting.length > 0 && (
        <button
          type="button"
          onClick={() => setOpenId(waiting[0].id)}
          className="flex w-full items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <AlertTriangle className="size-5 shrink-0 text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              Срок прошёл у {waiting.length} {plural(waiting.length, ['действия', 'действий', 'действий'])}{readOnly ? ', итог не отмечен' : ': отметьте итог'}
            </span>
            <span className="block truncate text-sm text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]">
              «{waiting[0].title}»{waiting.length > 1 ? ` и ещё ${waiting.length - 1}` : ''} — сделано или отмазка?
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </button>
      )}

      {!narrowed && upcoming.length > 0 && (
        <section className="space-y-2 lg:hidden">
          <h2 className="px-1 text-[17px] font-semibold">Ближайшие сроки</h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-xs">
            {upcoming.map(a => {
              const st = stateOf(a)
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => setOpenId(a.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:bg-accent">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-snug font-medium">{a.title}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{placeOf(a)}</span>
                    </span>
                    <DuePill due={a.due_date} state={st} today={today} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Фильтр действий" className="-mx-4 flex min-w-0 flex-[1_1_100%] gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:flex-1 sm:px-0">
          {FILTERS.map(f => {
            const on = filter === f.id
            const n = f.id === 'all' ? summary.total : summary[f.id]
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                  on ? 'border-primary-soft bg-primary-soft text-primary-soft-foreground' : 'bg-card hover:border-ring/40'
                )}
              >
                {f.label}
                <span className={cn('num text-[12.5px]', f.id === 'excuse' && n && !on ? 'text-destructive' : 'opacity-70')}>{n}</span>
              </button>
            )
          })}
        </div>
        <label className="relative flex-[1_1_100%] sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по действиям и людям" aria-label="Поиск по действиям и людям" className="pl-9" />
        </label>
      </div>

      {narrowed && !shownCount && (
        <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          {q ? 'Ничего не нашлось' : filter === 'waiting' ? 'Нет действий с прошедшим сроком' : filter === 'excuse' ? 'Отмазок нет. Так держать' : filter === 'done' ? 'Пока ничего не сделано' : 'Нет действий в работе'}
        </p>
      )}

      {data.directions.map(d => {
        const goals = data.goals.filter(g => g.direction_id === d.id)
        const all = data.actions.filter(a => goals.some(g => g.id === a.goal_id))
        const visible = all.filter(matches)
        if (narrowed && !visible.length) return null
        const done = all.filter(a => a.status === 'done').length
        return (
          <section key={d.id} aria-labelledby={`dir-${d.id}`} className="space-y-2.5">
            <div className="flex items-center gap-3 px-1">
              <h2 id={`dir-${d.id}`} className="min-w-0 truncate text-lg font-bold tracking-tight">{d.title}</h2>
              <span className="num shrink-0 text-sm text-muted-foreground">{done} из {all.length}</span>
              <ProgressBar value={all.length ? done / all.length : 0} className="w-14 shrink-0" />
              <span className="flex-1" />
              {!readOnly && (<>
              <Button variant="ghost" size="sm" className="max-sm:hidden" onClick={() => setForm({ directionId: d.id })}>
                <Plus />
                Действие
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Ещё: ${d.title}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setForm({ directionId: d.id })}>
                    <Plus />
                    Действие
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setNaming({ kind: 'goal-new', direction: d })}>
                    <Plus />
                    Микро-цель
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setNaming({ kind: 'direction-rename', direction: d })}>
                    <Pencil />
                    Переименовать
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => removeDirection(d)}>
                    <Trash2 />
                    Удалить направление
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </>)}
            </div>

            <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
              <div className={cn('hidden border-b bg-muted/40 py-2 pr-4 pl-[3.25rem] text-xs text-muted-foreground', ROW_GRID)} aria-hidden>
                <span>Действие</span>
                <span>Индикатор</span>
                <span>Срок</span>
                <span>Ответственные</span>
                <span className="text-center">Пр.</span>
                <span className="text-right">Цена слова</span>
                <span>Статус</span>
              </div>

              {goals.map(g => {
                const acts = data.actions.filter(a => a.goal_id === g.id)
                const shown = acts.filter(matches)
                if (narrowed && !shown.length) return null
                const gDone = acts.filter(a => a.status === 'done').length
                return (
                  <div key={g.id} className="border-b last:border-b-0">
                    <div className="flex items-center gap-2 py-1.5 pr-2 pl-4 lg:pl-[3.25rem]">
                      <h3 className="min-w-0 truncate text-[12.5px] font-semibold tracking-[0.04em] text-primary-soft-foreground uppercase">{g.title}</h3>
                      <span className="num shrink-0 text-xs text-muted-foreground">{gDone}/{acts.length}</span>
                      <span className="flex-1" />
                      {!readOnly && (<>
                      <Button variant="ghost" size="xs" onClick={() => setForm({ goalId: g.id })} aria-label={`Действие в «${g.title}»`}>
                        <Plus />
                        <span className="max-sm:sr-only">Действие</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label={`Ещё: ${g.title}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setNaming({ kind: 'goal-rename', goal: g })}>
                            <Pencil />
                            Переименовать
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => removeGoal(g)}>
                            <Trash2 />
                            Удалить микро-цель
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </>)}
                    </div>
                    {shown.length ? (
                      <ul className="divide-y border-t">
                        {shown.map(a => (
                          <ActionRow
                            key={a.id}
                            a={a}
                            state={stateOf(a)}
                            excuses={index.excusesOf.get(a.id)?.length ?? 0}
                            today={today}
                            busy={busy === a.id}
                            readOnly={readOnly}
                            onToggle={() => quickToggle(a)}
                            onOpen={() => setOpenId(a.id)}
                          />
                        ))}
                      </ul>
                    ) : readOnly ? (
                      <p className="border-t border-dashed px-4 py-3 text-sm text-muted-foreground lg:pl-[3.25rem]">Действий пока нет</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setForm({ goalId: g.id })}
                        className="block w-full border-t border-dashed px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:pl-[3.25rem]"
                      >
                        + Добавьте первое действие
                      </button>
                    )}
                  </div>
                )
              })}

              {!narrowed && !readOnly && (
                <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-2.5 lg:pl-[3.25rem]">
                  <Button variant="ghost" size="sm" className="-ml-2 text-primary hover:text-primary" onClick={() => setNaming({ kind: 'goal-new', direction: d })}>
                    <Plus />
                    Микро-цель
                  </Button>
                  {!goals.length && <span className="text-[13px] text-muted-foreground">Разбейте направление на 2–4 микро-цели</span>}
                  {goals.length > 0 &&
                    suggestionsFor(d.title)
                      .filter(s => !all.some(a => a.title.toLowerCase() === s.toLowerCase()))
                      .slice(0, 3)
                      .map(s => (
                        <SuggestionChip key={s} text={s} onClick={() => setForm({ goalId: goals[0].id, title: s })} />
                      ))}
                </div>
              )}
            </div>
          </section>
        )
      })}

      {!narrowed && !readOnly && (
        <Button variant="outline" className="h-11 self-start border-dashed" onClick={() => setNaming({ kind: 'direction-new' })}>
          <Plus />
          Направление
        </Button>
      )}

      <ActionFormSheet
        target={form}
        data={data}
        owners={index.owners}
        participantId={participantId}
        onClose={() => setForm(null)}
        onSaved={load}
      />
      <ActionSheet
        action={selected}
        excuses={selected ? (index.excusesOf.get(selected.id) ?? []) : []}
        place={selected ? placeOf(selected) : ''}
        participantId={participantId}
        readOnly={readOnly}
        onClose={() => setOpenId(null)}
        onEdit={a => {
          setOpenId(null)
          setForm({ action: a })
        }}
        onChanged={load}
      />
      <VisionSheet open={visionOpen} plan={data.plan} participantId={participantId} onClose={() => setVisionOpen(false)} onSaved={load} />
      <NameDialog
        open={!!naming}
        title={
          naming?.kind === 'direction-new'
            ? 'Новое направление'
            : naming?.kind === 'direction-rename'
              ? 'Переименовать направление'
              : naming?.kind === 'goal-new'
                ? `Микро-цель в «${naming.direction.title}»`
                : 'Переименовать микро-цель'
        }
        label={naming?.kind.startsWith('direction') ? 'Направление' : 'Микро-цель'}
        initial={naming?.kind === 'direction-rename' ? naming.direction.title : naming?.kind === 'goal-rename' ? naming.goal.title : ''}
        suggestions={naming?.kind === 'direction-new' ? TEMPLATE_DIRECTIONS.filter(t => !data.directions.some(d => d.title.toLowerCase() === t.toLowerCase())) : []}
        onClose={() => setNaming(null)}
        onSubmit={submitName}
      />
    </Shell>
  )
}

function PageTitle({ title, onBack, children }: { title?: string; onBack?: () => void; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1">
      <div className="min-w-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-my-2 inline-flex items-center gap-1 rounded-md py-2 text-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <ChevronLeft className="size-4" />
            Все планы
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">Операционный план</p>
        )}
        <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-tight text-balance sm:text-3xl">{title ?? 'Мой план'}</h1>
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </header>
  )
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={cn('mx-auto flex w-full flex-col gap-5 px-4 pt-5 pb-10 sm:pt-8', wide ? 'max-w-6xl' : 'max-w-2xl')}>{children}</div>
}

function LoadingState() {
  return (
    <>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </>
  )
}

function Count({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        <span className={cn('size-2 shrink-0 rounded-full', dot)} />
        {label}
      </dt>
      <dd className="num mt-0.5 text-[17px] font-semibold">{value}</dd>
    </div>
  )
}

function DuePill({ due, state, today }: { due: string | null; state: ActionState; today: string }) {
  if (!due) return null
  const soon = state !== 'done' && due >= today && due <= addDays(today, 2)
  return (
    <span
      title={dueHint(due, today)}
      className={cn(
        'num inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12.5px] font-medium whitespace-nowrap',
        state === 'waiting' ? 'bg-destructive-soft font-semibold text-destructive' : soon ? 'bg-warning-soft font-semibold text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' : 'bg-muted text-muted-foreground'
      )}
    >
      {due === today ? 'сегодня' : shortDate(due)}
    </span>
  )
}

function ActionRow({
  a,
  state,
  excuses,
  today,
  busy,
  readOnly,
  onToggle,
  onOpen,
}: {
  a: OpAction
  state: ActionState
  excuses: number
  today: string
  busy: boolean
  readOnly?: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const done = state === 'done'
  return (
    <li className={cn('flex items-start gap-3 py-3 pr-4 pl-4 lg:items-center lg:py-2.5', state === 'waiting' && 'bg-destructive-soft/40')}>
      {readOnly ? (
        <span
          role="img"
          aria-label={STATE_META[state].label}
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 lg:mt-0',
            done ? 'border-success bg-success text-white' : state === 'waiting' ? 'border-destructive' : 'border-muted-foreground/35'
          )}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          aria-label={done ? `Вернуть в работу: ${a.title}` : `Отметить сделанным: ${a.title}`}
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 lg:mt-0',
            done ? 'border-success bg-success text-white' : state === 'waiting' ? 'border-destructive hover:bg-destructive-soft' : 'border-muted-foreground/35 hover:border-success hover:bg-success-soft',
            busy && 'opacity-50'
          )}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
        </button>
      )}
      <button type="button" onClick={onOpen} className={cn('min-w-0 flex-1 text-left outline-none focus-visible:underline', ROW_GRID)}>
        <span className="flex min-w-0 items-start gap-2 lg:block">
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[15px] leading-snug font-medium lg:text-sm', done && 'text-muted-foreground')}>{a.title}</span>
            {a.indicator && <span className="mt-0.5 block text-[13px] text-muted-foreground lg:hidden">→ {a.indicator}</span>}
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
              {!done && <DuePill due={a.due_date} state={state} today={today} />}
              {(state === 'excuse' || state === 'waiting') && <StatePill state={state} />}
              {a.owners.length > 0 && <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-[12.5px] text-muted-foreground">{a.owners.join(', ')}</span>}
              {a.price > 0 && !done && <span className="num inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-[12.5px] text-muted-foreground">{usd(a.price)}</span>}
              {excuses > 1 && <span className="num text-[12.5px] text-destructive">отмазок: {excuses}</span>}
            </span>
          </span>
          <PriorityMark p={a.priority} className="lg:hidden" />
        </span>
        <span className="hidden truncate text-sm text-muted-foreground lg:block">{a.indicator || '—'}</span>
        <span className="hidden lg:block">{a.due_date ? <DuePill due={a.due_date} state={state} today={today} /> : <span className="text-sm text-muted-foreground">—</span>}</span>
        <span className="hidden truncate text-sm lg:block">{a.owners.join(', ') || <span className="text-muted-foreground">—</span>}</span>
        <span className="hidden justify-center lg:flex">
          <PriorityMark p={a.priority} />
        </span>
        <span className="num hidden text-right text-sm lg:block">{a.price ? usd(a.price) : '—'}</span>
        <span className="hidden lg:flex">
          <StatePill state={state} />
        </span>
      </button>
    </li>
  )
}

function SuggestionChip({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center rounded-full border bg-card px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground"
    >
      + {text}
    </button>
  )
}
