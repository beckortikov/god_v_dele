'use client'

import * as React from 'react'
import { CalendarClock, ChevronRight, Paperclip, Video } from 'lucide-react'
import { lessonState, lessonWhen, nextLesson } from '@/lib/lessons'
import type { MyLesson } from '@/app/api/my-lessons/route'
import { Badge } from '@/components/ui/badge'
import { LessonViewSheet } from '@/components/lessons/lesson-sheets'

const DAY = 86_400_000

/** Id of the calendar block lower on the same page. */
export const LESSONS_CALENDAR_ID = 'lessons-calendar'

/**
 * «Ближайший урок» at the top of the participant's Today page: tap for the lesson, its link and
 * materials; «Весь календарь» scrolls to the calendar further down. Silent when there is nothing
 * to show or the calendar cannot be loaded: it is a convenience, not something that may break the page.
 */
export function NextLessonCard({ participantId }: { participantId: string }) {
  const [lesson, setLesson] = React.useState<MyLesson | null>(null)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const from = new Date(Date.now() - DAY).toISOString()
    const to = new Date(Date.now() + 60 * DAY).toISOString()
    fetch(`/api/my-lessons?participant_id=${participantId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { data?: MyLesson[] } | null) => {
        if (!cancelled && j?.data) setLesson(nextLesson(j.data))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [participantId])

  if (!lesson) return null
  const live = lessonState(lesson) === 'live'
  return (
    <>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3.5 p-4 text-left transition-colors outline-none hover:bg-accent focus-visible:bg-accent"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
            {lesson.format === 'online' ? <Video className="size-5" /> : <CalendarClock className="size-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              Ближайший урок {live && <Badge variant="success">Идёт сейчас</Badge>}
            </span>
            <span className="mt-0.5 block truncate text-[15px] font-semibold">{lesson.title}</span>
            <span className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
              {lessonWhen(lesson)}
              {lesson.materials.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="size-3.5" /> {lesson.materials.length}
                </span>
              )}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => document.getElementById(LESSONS_CALENDAR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-sm font-medium text-primary transition-colors outline-none hover:bg-accent focus-visible:bg-accent"
        >
          Весь календарь уроков
        </button>
      </div>
      <LessonViewSheet open={open} onOpenChange={setOpen} lesson={lesson} materials={lesson.materials} />
    </>
  )
}
