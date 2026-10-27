'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Database, MessageSquareText, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTHS_RU } from '@/lib/format'
import { FEEDBACK_QUESTIONS, MAX_SCORE, type LessonReview } from '@/lib/lesson-feedback'
import { dayTitle, groupByDay, localDayKey, monthRange, timeRange } from '@/lib/lessons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Panel } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { call } from './api'

const fmt = (n: number | null) => (n === null ? '—' : String(n).replace('.', ','))

/** Green from 8, amber from 6, red below: how the average reads at a glance. */
const tone = (n: number | null) => (n === null ? 'text-muted-foreground' : n >= 8 ? 'text-success' : n >= 6 ? 'text-warning' : 'text-destructive')
const barTone = (n: number) => (n >= 8 ? 'bg-success' : n >= 6 ? 'bg-warning' : 'bg-destructive')

function ReviewCard({ review, groupName }: { review: LessonReview; groupName?: string }) {
  const { lesson } = review
  const [all, setAll] = React.useState(false)
  const shown = all ? review.comments : review.comments.slice(0, 3)
  const rate = review.eligible ? Math.round((review.responded / review.eligible) * 100) : 0
  return (
    <article className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{lesson.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {timeRange(lesson)}
            {lesson.teacher && <span>· {lesson.teacher}</span>}
            {groupName && <Badge variant="outline">{groupName}</Badge>}
          </p>
        </div>
        <div className="text-right">
          <div className={cn('num flex items-baseline justify-end gap-1 text-2xl font-semibold', tone(review.overall))}>
            {review.overall !== null && <Star className="size-4 self-center fill-current" />}
            {fmt(review.overall)}
            <span className="text-sm font-normal text-muted-foreground">/ {MAX_SCORE}</span>
          </div>
          <p className="num text-xs text-muted-foreground">
            ответили {review.responded} из {review.eligible}
            {review.eligible > 0 && ` (${rate}%)`}
          </p>
        </div>
      </header>

      {review.responded === 0 ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">Отзывов пока нет. Участники увидят просьбу оценить урок на «Сегодня» после занятия.</p>
      ) : (
        <>
          <dl className="mt-4 space-y-2.5">
            {FEEDBACK_QUESTIONS.map(q => {
              const v = review.averages[q.key]
              return (
                <div key={q.key} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_2.5rem]" title={q.ask}>
                  <dt className="truncate text-muted-foreground">{q.label}</dt>
                  <dd className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className={cn('block h-full rounded-full', v === null ? '' : barTone(v))} style={{ width: `${((v ?? 0) / MAX_SCORE) * 100}%` }} />
                  </dd>
                  <dd className={cn('num text-right font-medium', tone(v))}>{fmt(v)}</dd>
                </div>
              )
            })}
          </dl>

          {review.comments.length > 0 && (
            <section className="mt-4 border-t pt-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <MessageSquareText className="size-4 text-muted-foreground" /> Пожелания ({review.comments.length})
              </h4>
              <ul className="space-y-2">
                {shown.map((c, i) => (
                  <li key={i} className="rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                    {c.text}
                  </li>
                ))}
              </ul>
              {review.comments.length > 3 && (
                <Button type="button" variant="ghost" size="sm" className="mt-1.5" onClick={() => setAll(a => !a)}>
                  {all ? 'Свернуть' : `Показать все (${review.comments.length})`}
                </Button>
              )}
            </section>
          )}
        </>
      )}
    </article>
  )
}

/**
 * «Отзывы»: what the participants said about the lessons of a month, day by day (latest first).
 * Reviews are shown without names; the numbers are averages over those who answered.
 */
export function LessonReviews({ programId, groupFilter, groupName }: { programId: string; groupFilter: string; groupName?: (id: string) => string | undefined }) {
  const now = new Date()
  const [ym, setYm] = React.useState({ year: now.getFullYear(), month: now.getMonth() })
  const [reviews, setReviews] = React.useState<LessonReview[] | null>(null)
  const [migration, setMigration] = React.useState(false)

  React.useEffect(() => {
    if (!programId) return
    let cancelled = false
    setReviews(null)
    const { from, to } = monthRange(ym.year, ym.month)
    call<{ data: LessonReview[] }>(`/api/lesson-feedback/summary?program_id=${programId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => {
        if (cancelled) return
        setMigration(false)
        setReviews(r.data)
      })
      .catch(e => {
        if (cancelled) return
        setReviews([])
        if (/023_lesson_feedback/.test((e as Error).message)) setMigration(true)
        else toast.error('Не удалось загрузить отзывы', { description: (e as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [programId, ym])

  const step = (d: number) => setYm(({ year, month }) => {
    const t = new Date(year, month + d, 1)
    return { year: t.getFullYear(), month: t.getMonth() }
  })

  const days = React.useMemo(() => {
    // only the month itself: the neighbouring days of the grid are not part of it
    const prefix = `${ym.year}-${String(ym.month + 1).padStart(2, '0')}`
    const mine = (reviews ?? []).filter(r => localDayKey(r.lesson.starts_at).startsWith(prefix) && (groupFilter === 'all' || !r.lesson.group_id || r.lesson.group_id === groupFilter))
    const byDay = groupByDay(mine.map(r => ({ ...r, starts_at: r.lesson.starts_at })))
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [reviews, ym, groupFilter])

  const total = days.reduce((n, [, list]) => n + list.reduce((m, r) => m + r.responded, 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon-sm" aria-label="Прошлый месяц" onClick={() => step(-1)}>
          <ChevronLeft />
        </Button>
        <h2 className="min-w-36 text-center text-base font-semibold">
          {MONTHS_RU[ym.month]} {ym.year}
        </h2>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Следующий месяц" onClick={() => step(1)}>
          <ChevronRight />
        </Button>
        {reviews !== null && !migration && <span className="num text-sm text-muted-foreground">Отзывов за месяц: {total}</span>}
      </div>

      {migration ? (
        <Panel>
          <EmptyState
            icon={Database}
            title="Отзывы об уроках ещё не подключены"
            description={
              <>
                Один раз выполните в Supabase → SQL Editor файл <code className="rounded bg-muted px-1 py-0.5 text-[12px]">migrations/023_lesson_feedback.sql</code> и обновите страницу.
              </>
            }
          />
        </Panel>
      ) : reviews === null ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : days.length === 0 ? (
        <Panel>
          <EmptyState icon={MessageSquareText} title="В этом месяце уроков нет" description="Когда в календаре появятся уроки, отзывы о них будут здесь по дням." />
        </Panel>
      ) : (
        days.map(([key, list]) => (
          <section key={key} className="space-y-2.5">
            <h3 className="px-1 text-sm font-semibold text-muted-foreground">{dayTitle(key)}</h3>
            {list.map(r => (
              <ReviewCard key={r.lesson.id} review={r} groupName={r.lesson.group_id ? groupName?.(r.lesson.group_id) : undefined} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}
