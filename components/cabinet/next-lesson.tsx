'use client'

import * as React from 'react'
import { CalendarClock, ChevronRight, ClipboardCheck, Paperclip, Video, X } from 'lucide-react'
import { lessonState, lessonWhen, nextLesson } from '@/lib/lessons'
import { FEEDBACK_ASK_DAYS, feedbackDue } from '@/lib/lesson-feedback'
import type { MyLesson } from '@/app/api/my-lessons/route'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LessonViewSheet } from '@/components/lessons/lesson-sheets'
import { LessonFeedbackSheet } from '@/components/lessons/lesson-feedback-sheet'
import { useMyFeedback } from '@/components/lessons/feedback-api'

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
  const [recent, setRecent] = React.useState<MyLesson[]>([])
  const [open, setOpen] = React.useState(false)
  const [rating, setRating] = React.useState<MyLesson | null>(null)
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())
  const feedback = useMyFeedback(participantId)

  React.useEffect(() => {
    let cancelled = false
    // a couple of weeks back as well: lessons that just ended are offered for a review here
    const from = new Date(Date.now() - FEEDBACK_ASK_DAYS * DAY).toISOString()
    const to = new Date(Date.now() + 60 * DAY).toISOString()
    fetch(`/api/my-lessons?participant_id=${participantId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { data?: MyLesson[] } | null) => {
        if (cancelled || !j?.data) return
        setLesson(nextLesson(j.data))
        setRecent(j.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [participantId])

  // The latest finished lesson not reviewed yet (only when reviews are set up)
  const toRate = feedback.ready && feedback.available ? feedbackDue(recent, new Set([...feedback.given.keys(), ...hidden]))[0] ?? null : null

  if (!lesson && !toRate) return null
  const live = lesson ? lessonState(lesson) === 'live' : false
  return (
    <>
      {toRate && (
        <div className="relative rounded-2xl border border-primary/30 bg-primary-soft p-4">
          <button
            type="button"
            onClick={() => setHidden(h => new Set(h).add(toRate.id))}
            aria-label="Не сейчас"
            className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-background/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
          <div className="flex items-start gap-3.5 pr-8">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-background text-primary">
              <ClipboardCheck className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">Урок прошёл, {lessonWhen(toRate)}</span>
              <span className="mt-0.5 block text-[15px] font-semibold">Как вам «{toRate.title}»?</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">Пять коротких вопросов, минута времени. Это поможет сделать занятия лучше.</span>
            </span>
          </div>
          <Button size="lg" className="mt-3.5 w-full" onClick={() => setRating(toRate)}>
            Оценить урок
          </Button>
        </div>
      )}
      {lesson && (
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
      )}
      {lesson && <LessonViewSheet open={open} onOpenChange={setOpen} lesson={lesson} materials={lesson.materials} participantId={participantId} />}
      <LessonFeedbackSheet
        open={!!rating}
        onOpenChange={o => !o && setRating(null)}
        lesson={rating}
        participantId={participantId}
        existing={rating ? (feedback.given.get(rating.id) ?? null) : null}
        onSent={feedback.remember}
      />
    </>
  )
}
