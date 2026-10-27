'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEEDBACK_QUESTIONS, MAX_SCORE, SCORE_KEYS, type LessonFeedback, type ScoreKey } from '@/lib/lesson-feedback'
import { lessonWhen, type Lesson } from '@/lib/lessons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { call } from './api'

type Draft = Partial<Record<ScoreKey, number>>

/** Ten numbers in a row: the tapped one is filled. */
function ScoreRow({ label, ask, value, onChange }: { label: string; ask: string; value: number | undefined; onChange: (n: number) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm leading-snug font-medium">{ask}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-10 gap-1">
        {Array.from({ length: MAX_SCORE }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn(
              'num flex h-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              value === n ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-accent'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>совсем нет</span>
        <span>полностью</span>
      </div>
    </fieldset>
  )
}

/**
 * «Оцените урок»: five questions, 1-10 each, and wishes in free words. One review per lesson;
 * opening it again shows the earlier answers to change them.
 */
export function LessonFeedbackSheet({
  open,
  onOpenChange,
  lesson,
  participantId,
  existing,
  onSent,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lesson: Lesson | null
  participantId: string
  existing: LessonFeedback | null
  onSent: (f: LessonFeedback) => void
}) {
  const [draft, setDraft] = React.useState<Draft>({})
  const [comment, setComment] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Every time the sheet opens it starts from the earlier review, or blank
  React.useEffect(() => {
    if (!open) return
    setDraft(existing ? Object.fromEntries(SCORE_KEYS.map(k => [k, existing[k]])) : {})
    setComment(existing?.comment ?? '')
  }, [open, existing, lesson?.id])

  const complete = SCORE_KEYS.every(k => draft[k])
  const send = async () => {
    if (!lesson || !complete) return
    setSaving(true)
    try {
      const r = await call<{ data: LessonFeedback }>(`/api/lesson-feedback?participant_id=${participantId}`, { method: 'POST', json: { lesson_id: lesson.id, ...draft, comment } })
      toast.success('Спасибо за отзыв!', { description: 'Он поможет сделать занятия лучше' })
      onSent(r.data)
      onOpenChange(false)
    } catch (e) {
      toast.error('Не удалось отправить отзыв', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Оцените урок</SheetTitle>
          <SheetDescription>{lesson ? `${lesson.title}, ${lessonWhen(lesson)}` : ''}</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-6">
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">Отзыв видят только организаторы, ваше имя рядом с ним не показывается. Оценка от 1 до 10.</p>
          {FEEDBACK_QUESTIONS.map(q => (
            <ScoreRow key={q.key} label={q.label} ask={q.ask} value={draft[q.key]} onChange={n => setDraft(d => ({ ...d, [q.key]: n }))} />
          ))}
          <div className="space-y-1.5">
            <label htmlFor="fb-comment" className="text-sm font-medium">
              Пожелания и предложения, как улучшить урок
            </label>
            <Textarea id="fb-comment" value={comment} onChange={e => setComment(e.target.value)} rows={4} maxLength={2000} placeholder="Необязательно" />
          </div>
        </SheetBody>
        <SheetFooter>
          <div className="flex w-full flex-col gap-2">
            <Button size="lg" className="w-full" disabled={!complete || saving} onClick={send}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? 'Отправляем…' : existing ? 'Сохранить отзыв' : 'Отправить отзыв'}
            </Button>
            {!complete && <p className="text-center text-xs text-muted-foreground">Поставьте оценку в каждом из пяти вопросов</p>}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
