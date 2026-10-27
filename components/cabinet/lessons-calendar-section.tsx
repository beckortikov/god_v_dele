'use client'

import * as React from 'react'
import { monthRange } from '@/lib/lessons'
import type { MyLesson } from '@/app/api/my-lessons/route'
import { LessonCalendar } from '@/components/lessons/lesson-calendar'
import { LessonViewSheet } from '@/components/lessons/lesson-sheets'
import { LessonsMigrationRequired, call } from '@/components/lessons/api'
import { Skeleton } from '@/components/ui/skeleton'
import { LESSONS_CALENDAR_ID } from './next-lesson'

/**
 * The month calendar of the participant's lessons, a block of the Today page (it used to be a page of
 * its own). Not shown at all when the calendar is not set up yet: the rest of the page must not suffer.
 */
export function LessonsCalendarSection({ participantId }: { participantId: string }) {
  const now = new Date()
  const [ym, setYm] = React.useState({ year: now.getFullYear(), month: now.getMonth() })
  const [lessons, setLessons] = React.useState<MyLesson[] | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)
  const [open, setOpen] = React.useState<MyLesson | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLessons(null)
    const { from, to } = monthRange(ym.year, ym.month)
    call<{ data: MyLesson[] }>(`/api/my-lessons?participant_id=${participantId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => !cancelled && (setUnavailable(false), setLessons(r.data)))
      .catch(e => {
        if (cancelled) return
        setLessons([])
        if (e instanceof LessonsMigrationRequired) setUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [participantId, ym])

  if (unavailable) return null
  return (
    <section id={LESSONS_CALENDAR_ID} className="scroll-mt-4">
      <h2 className="mb-2.5 px-1 text-[17px] font-semibold tracking-tight">Календарь уроков</h2>
      {lessons === null ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : (
        <>
          {lessons.length === 0 && <p className="mb-3 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">В этом месяце уроков пока нет. Куратор добавит их в календарь.</p>}
          <LessonCalendar year={ym.year} month={ym.month} onMonthChange={(year, month) => setYm({ year, month })} lessons={lessons} onOpen={l => setOpen(l as MyLesson)} />
        </>
      )}
      <LessonViewSheet open={!!open} onOpenChange={o => !o && setOpen(null)} lesson={open} materials={open?.materials ?? []} participantId={participantId} />
    </section>
  )
}
