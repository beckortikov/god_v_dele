'use client'

import * as React from 'react'
import { CalendarX2, ChevronLeft, ChevronRight, MapPin, Paperclip, Plus, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTHS_RU } from '@/lib/format'
import { WEEKDAYS_SHORT, dayTitle, groupByDay, lessonState, localDayKey, monthGrid, timeRange, type Lesson } from '@/lib/lessons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'

export type CalendarLesson = Lesson & { material_count?: number; materials?: unknown[] }
type View = 'month' | 'list'

const materialsOf = (l: CalendarLesson) => l.material_count ?? l.materials?.length ?? 0

// A lesson stands out by its state: going on now is solid, coming is tinted with an accent bar, past fades
const chipTone = (l: CalendarLesson) => {
  const s = lessonState(l)
  return s === 'live'
    ? 'bg-primary text-primary-foreground shadow-sm'
    : s === 'past'
      ? 'bg-muted text-muted-foreground hover:bg-muted/70'
      : 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70'
}

const barTone = (l: CalendarLesson) => {
  const s = lessonState(l)
  return s === 'live' ? 'bg-primary-foreground/80' : s === 'past' ? 'bg-muted-foreground/35' : 'bg-primary'
}

const FormatIcon = ({ l, className }: { l: CalendarLesson; className?: string }) =>
  l.format === 'online' ? <Video className={className} aria-hidden /> : <MapPin className={className} aria-hidden />

/**
 * Month grid and list of lessons with month navigation. The page owns the month and loads the
 * lessons for it; this component only draws them and reports clicks.
 */
export function LessonCalendar({
  year,
  month,
  onMonthChange,
  lessons,
  groupName,
  onOpen,
  onCreateOn,
}: {
  year: number
  /** 0-11 */
  month: number
  onMonthChange: (year: number, month: number) => void
  lessons: CalendarLesson[]
  /** Name of a group for a badge; leave out when groups are not in use. */
  groupName?: (groupId: string) => string | undefined
  onOpen: (lesson: CalendarLesson) => void
  /** Curators: add a lesson on this day (YYYY-MM-DD). */
  onCreateOn?: (dayKey: string) => void
}) {
  const [view, setView] = React.useState<View>('month')
  const weeks = React.useMemo(() => monthGrid(year, month), [year, month])
  const byDay = React.useMemo(() => groupByDay(lessons), [lessons])
  const todayKey = localDayKey(new Date())
  const [selected, setSelected] = React.useState(todayKey)

  // Phones start with the list: a month grid is too tight there
  React.useEffect(() => {
    if (window.matchMedia('(max-width: 639px)').matches) setView('list')
  }, [])

  // Keep the selected day inside the shown month
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  React.useEffect(() => {
    setSelected(s => (s.startsWith(monthKey) ? s : todayKey.startsWith(monthKey) ? todayKey : `${monthKey}-01`))
  }, [monthKey, todayKey])

  const step = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    onMonthChange(d.getFullYear(), d.getMonth())
  }
  const goToday = () => {
    const d = new Date()
    onMonthChange(d.getFullYear(), d.getMonth())
    setSelected(localDayKey(d))
  }

  const inMonth = lessons.filter(l => localDayKey(l.starts_at).startsWith(monthKey))
  const listDays = [...groupByDay(inMonth).entries()]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Прошлый месяц" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <h2 className="min-w-40 text-center text-base font-semibold tracking-tight">
            {MONTHS_RU[month]} {year}
          </h2>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Следующий месяц" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={goToday}>
          Сегодня
        </Button>
        <Segmented
          size="sm"
          aria-label="Вид календаря"
          className="ml-auto"
          value={view}
          onChange={setView}
          options={[
            { value: 'month', label: 'Месяц' },
            { value: 'list', label: 'Список' },
          ]}
        />
      </div>

      {view === 'month' ? (
        <>
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAYS_SHORT.map(w => (
                <div key={w} className="py-2">
                  {w}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className={cn('grid grid-cols-7', wi > 0 && 'border-t')}>
                {week.map((d, di) => {
                  const items = byDay.get(d.key) ?? []
                  const isToday = d.key === todayKey
                  const isSelected = d.key === selected
                  const coming = items.some(l => lessonState(l) !== 'past')
                  return (
                    <div
                      key={d.key}
                      role="button"
                      tabIndex={0}
                      aria-label={`${dayTitle(d.key)}${items.length ? `, уроков: ${items.length}` : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelected(d.key)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelected(d.key)
                        }
                      }}
                      className={cn(
                        'group relative min-h-14 cursor-pointer p-1 text-left outline-none transition-colors focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:min-h-28 sm:p-1.5',
                        di > 0 && 'border-l',
                        !d.inMonth && 'bg-muted/30',
                        d.inMonth && coming && 'bg-primary-soft/30',
                        isSelected && 'bg-accent/60'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className={cn(
                            'num flex size-6 items-center justify-center rounded-full text-xs',
                            isToday
                              ? 'bg-primary font-semibold text-primary-foreground'
                              : !d.inMonth
                                ? 'text-muted-foreground/60'
                                : coming
                                  ? 'bg-primary-soft font-semibold text-primary-soft-foreground'
                                  : 'text-foreground'
                          )}
                        >
                          {d.day}
                        </span>
                        {onCreateOn && d.inMonth && (
                          <button
                            type="button"
                            aria-label={`Добавить урок на ${dayTitle(d.key)}`}
                            onClick={e => {
                              e.stopPropagation()
                              onCreateOn(d.key)
                            }}
                            className="hidden size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity outline-none group-hover:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 sm:flex"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        )}
                      </div>
                      {/* Wide screens: the lessons themselves */}
                      <div className="mt-1 hidden space-y-1 sm:block">
                        {items.slice(0, 2).map(l => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              onOpen(l)
                            }}
                            title={`${timeRange(l)} · ${l.title}`}
                            className={cn(
                              'relative flex w-full flex-col overflow-hidden rounded-md py-1 pr-1.5 pl-3 text-left text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                              chipTone(l)
                            )}
                          >
                            <span aria-hidden className={cn('absolute inset-y-1 left-1 w-[3px] rounded-full', barTone(l))} />
                            <span className="flex items-center gap-1 text-[11px] font-medium opacity-90">
                              {lessonState(l) === 'live' && <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />}
                              <span className="num">{timeRange(l).slice(0, 5)}</span>
                              <FormatIcon l={l} className="size-3 shrink-0" />
                            </span>
                            <span className="line-clamp-2 leading-snug font-medium">{l.title}</span>
                          </button>
                        ))}
                        {items.length > 2 && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setSelected(d.key)
                              setView('list')
                            }}
                            className="px-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            ещё {items.length - 2}
                          </button>
                        )}
                      </div>
                      {/* Phones: dots, the list of the day is below */}
                      {items.length > 0 && (
                        <div className="mt-1 flex justify-center gap-0.5 sm:hidden" aria-hidden>
                          {items.slice(0, 3).map(l => (
                            <span key={l.id} className={cn('size-1.5 rounded-full', lessonState(l) === 'past' ? 'bg-muted-foreground/40' : lessonState(l) === 'live' ? 'animate-pulse bg-primary' : 'bg-primary')} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* The chosen day: always on phones, and on wide screens when it has lessons beyond the chips */}
          <DayAgenda dayKey={selected} lessons={byDay.get(selected) ?? []} groupName={groupName} onOpen={onOpen} onCreateOn={onCreateOn} className="sm:hidden" />
        </>
      ) : listDays.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-xs">
          <EmptyState
            icon={CalendarX2}
            title="В этом месяце уроков нет"
            description={onCreateOn ? 'Добавьте первый урок, и участники увидят его в своём календаре.' : 'Когда куратор добавит уроки, они появятся здесь.'}
            action={
              onCreateOn && (
                <Button size="sm" onClick={() => onCreateOn(todayKey.startsWith(monthKey) ? todayKey : `${monthKey}-01`)}>
                  <Plus /> Новый урок
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {listDays.map(([key, items]) => (
            <DayAgenda key={key} dayKey={key} lessons={items} groupName={groupName} onOpen={onOpen} highlight={key === todayKey} />
          ))}
        </div>
      )}
    </div>
  )
}

function DayAgenda({
  dayKey,
  lessons,
  groupName,
  onOpen,
  onCreateOn,
  highlight,
  className,
}: {
  dayKey: string
  lessons: CalendarLesson[]
  groupName?: (id: string) => string | undefined
  onOpen: (l: CalendarLesson) => void
  onCreateOn?: (dayKey: string) => void
  highlight?: boolean
  className?: string
}) {
  return (
    <section className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <h3 className={cn('text-sm font-semibold', highlight && 'text-primary')}>{dayTitle(dayKey)}</h3>
        {onCreateOn && (
          <Button type="button" size="xs" variant="ghost" onClick={() => onCreateOn(dayKey)}>
            <Plus /> Урок
          </Button>
        )}
      </div>
      {lessons.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">В этот день уроков нет</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {lessons.map(l => (
            <li key={l.id}>
              <LessonRow lesson={l} groupName={groupName} onOpen={() => onOpen(l)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function LessonRow({ lesson: l, groupName, onOpen }: { lesson: CalendarLesson; groupName?: (id: string) => string | undefined; onOpen: () => void }) {
  const state = lessonState(l)
  const group = l.group_id ? groupName?.(l.group_id) : undefined
  const count = materialsOf(l)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('relative flex w-full items-start gap-3 py-3 pr-4 pl-5 text-left transition-colors outline-none hover:bg-accent focus-visible:bg-accent', state === 'live' && 'bg-primary-soft/40')}
    >
      <span aria-hidden className={cn('absolute inset-y-2.5 left-2 w-1 rounded-full', state === 'past' ? 'bg-muted-foreground/35' : 'bg-primary')} />
      {/* Phones: the time goes above the title, so the title gets the whole width */}
      <span className={cn('num hidden w-24 shrink-0 pt-0.5 text-sm font-semibold sm:block', state === 'past' ? 'font-medium text-muted-foreground' : 'text-primary')}>{timeRange(l)}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('num block text-[13px] font-semibold sm:hidden', state === 'past' ? 'font-medium text-muted-foreground' : 'text-primary')}>{timeRange(l)}</span>
        <span className={cn('line-clamp-2 text-[15px] leading-snug font-medium', state === 'past' && 'text-muted-foreground')}>{l.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {state === 'live' && <Badge variant="success">Идёт сейчас</Badge>}
          <span className="inline-flex items-center gap-1">
            {l.format === 'online' ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}
            {l.format === 'online' ? 'Онлайн' : l.location || 'Очно'}
          </span>
          {l.teacher && <span>{l.teacher}</span>}
          {group && <Badge variant="outline">{group}</Badge>}
          {count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" /> {count}
            </span>
          )}
        </span>
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}
