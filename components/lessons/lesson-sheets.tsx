'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarDays, ClipboardCheck, Loader2, MapPin, Trash2, User, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAX_REPEAT_WEEKS, fromFormParts, lessonState, lessonWhen, toFormParts, type Lesson, type LessonFormat, type LessonMaterial } from '@/lib/lessons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import { useConfirm } from '@/components/erp/confirm'
import { average, SCORE_KEYS } from '@/lib/lesson-feedback'
import { call } from './api'
import { useMyFeedback } from './feedback-api'
import { LessonFeedbackSheet } from './lesson-feedback-sheet'
import { MaterialsEditor, MaterialsList } from './materials'

// ---------------------------------------------------------------------------
// Participant: what the lesson is and its materials

export function LessonViewSheet({
  open,
  onOpenChange,
  lesson,
  materials,
  groupName,
  participantId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lesson: Lesson | null
  materials: LessonMaterial[]
  groupName?: string
  /** The participant who is looking: with it a started lesson offers «Оценить урок». */
  participantId?: string
}) {
  const state = lesson ? lessonState(lesson) : 'upcoming'
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {lesson && (
          <>
            <SheetHeader>
              <SheetTitle>{lesson.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{lessonWhen(lesson)}</span>
                {state === 'live' && <Badge variant="success">Идёт сейчас</Badge>}
                {state === 'past' && <Badge variant="secondary">Прошёл</Badge>}
                {groupName && <Badge variant="outline">{groupName}</Badge>}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-6">
              <dl className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  {lesson.format === 'online' ? <Video className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <div>
                    <dt className="font-medium">{lesson.format === 'online' ? 'Онлайн' : 'Очно'}</dt>
                    <dd className="text-muted-foreground">{lesson.format === 'online' ? (lesson.link ? 'Ссылка для подключения ниже' : 'Ссылку куратор добавит позже') : lesson.location || 'Адрес уточняется'}</dd>
                  </div>
                </div>
                {lesson.teacher && (
                  <div className="flex items-start gap-3">
                    <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="font-medium">Ведёт</dt>
                      <dd className="text-muted-foreground">{lesson.teacher}</dd>
                    </div>
                  </div>
                )}
              </dl>

              {lesson.format === 'online' && lesson.link && state !== 'past' && (
                <Button asChild size="lg" className="w-full">
                  <a href={lesson.link} target="_blank" rel="noreferrer noopener">
                    <Video /> Подключиться к уроку
                  </a>
                </Button>
              )}

              {participantId && state !== 'upcoming' && <FeedbackBlock lesson={lesson} participantId={participantId} />}

              {lesson.description && (
                <section>
                  <h3 className="mb-1.5 text-sm font-semibold">О чём урок</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{lesson.description}</p>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold">Материалы</h3>
                {materials.length ? <MaterialsList lessonId={lesson.id} materials={materials} /> : <p className="text-sm text-muted-foreground">Материалов пока нет. Куратор добавит презентацию до или после урока.</p>}
              </section>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** «Оценить урок» / «Вы оценили урок на 8,6 из 10» in the lesson card of a participant. */
function FeedbackBlock({ lesson, participantId }: { lesson: Lesson; participantId: string }) {
  const feedback = useMyFeedback(participantId)
  const [open, setOpen] = React.useState(false)
  if (!feedback.available) return null
  const mine = feedback.given.get(lesson.id) ?? null
  const score = mine ? average(SCORE_KEYS.map(k => mine[k])) : null
  return (
    <>
      <Button variant={mine ? 'outline' : 'default'} size="lg" className="w-full" disabled={!feedback.ready} onClick={() => setOpen(true)}>
        <ClipboardCheck /> {mine ? `Вы оценили урок: ${String(score).replace('.', ',')} из 10. Изменить` : 'Оценить урок'}
      </Button>
      <LessonFeedbackSheet open={open} onOpenChange={setOpen} lesson={lesson} participantId={participantId} existing={mine} onSent={feedback.remember} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Curator: plan or change a lesson, attach materials

interface FormState {
  title: string
  date: string
  start: string
  end: string
  format: LessonFormat
  link: string
  location: string
  teacher: string
  description: string
  group_id: string
  weeks: string
}

const ALL = 'all'
const REPEATS = [1, 2, 3, 4, 6, 8, 10, 12, 16, 24, MAX_REPEAT_WEEKS].filter((n, i, a) => a.indexOf(n) === i)

const blank = (date: string): FormState => ({ title: '', date, start: '18:00', end: '20:00', format: 'online', link: '', location: '', teacher: '', description: '', group_id: ALL, weeks: '1' })

const fromLesson = (l: Lesson): FormState => {
  const s = toFormParts(l.starts_at)
  const e = toFormParts(l.ends_at)
  return { title: l.title, date: s.date, start: s.time, end: e.time, format: l.format, link: l.link ?? '', location: l.location ?? '', teacher: l.teacher ?? '', description: l.description ?? '', group_id: l.group_id ?? ALL, weeks: '1' }
}

export function LessonEditSheet({
  open,
  onOpenChange,
  programId,
  lesson,
  newOnDate,
  defaultGroupId,
  groups,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  programId: string
  /** The lesson being edited; null to plan a new one. */
  lesson: Lesson | null
  /** For a new lesson: the day (YYYY-MM-DD) it starts on. */
  newOnDate: string
  /** For a new lesson: the group the calendar is filtered to. */
  defaultGroupId: string | null
  groups: { id: string; name: string }[]
  /** Something changed: reload the calendar. `created` is the lesson just made (a single one), to keep editing it. */
  onSaved: (created?: Lesson) => void
}) {
  const confirm = useConfirm()
  const [form, setForm] = React.useState<FormState>(() => blank(newOnDate))
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [materials, setMaterials] = React.useState<LessonMaterial[]>([])
  const editingId = lesson?.id ?? null

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(lesson ? fromLesson(lesson) : { ...blank(newOnDate), group_id: defaultGroupId ?? ALL })
  }, [open, lesson, newOnDate, defaultGroupId])

  const loadMaterials = React.useCallback(async () => {
    if (!editingId) {
      setMaterials([])
      return
    }
    try {
      const r = await call<{ data: { materials: LessonMaterial[] } }>(`/api/lessons/${editingId}`)
      setMaterials(r.data.materials)
    } catch {
      setMaterials([])
    }
  }, [editingId])

  React.useEffect(() => {
    if (open) loadMaterials()
  }, [open, loadMaterials])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))
  const text = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.title.trim()) errs.title = 'Назовите урок'
    if (!form.date) errs.date = 'Укажите дату'
    if (!form.start || !form.end) errs.time = 'Укажите время начала и конца'
    else if (form.end <= form.start) errs.time = 'Конец должен быть позже начала'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const payload = {
        program_id: programId,
        group_id: form.group_id === ALL ? null : form.group_id,
        title: form.title,
        description: form.description,
        starts_at: fromFormParts(form.date, form.start),
        ends_at: fromFormParts(form.date, form.end),
        format: form.format,
        link: form.link,
        location: form.location,
        teacher: form.teacher,
        ...(editingId ? {} : { weeks: Number(form.weeks) }),
      }
      if (editingId) {
        await call(`/api/lessons/${editingId}`, { method: 'PATCH', json: payload })
        toast.success('Урок сохранён')
        onSaved()
        onOpenChange(false)
      } else {
        const r = await call<{ data: Lesson[] }>('/api/lessons', { method: 'POST', json: payload })
        const n = r.data.length
        toast.success(n > 1 ? `Добавлено уроков: ${n}` : 'Урок добавлен', { description: n > 1 ? 'Материалы прикрепляются к каждому уроку отдельно' : 'Теперь можно прикрепить презентацию' })
        // One lesson: stay on it, so the materials can be attached at once
        onSaved(n === 1 ? r.data[0] : undefined)
        if (n > 1) onOpenChange(false)
      }
    } catch (err) {
      toast.error('Не удалось сохранить урок', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!lesson) return
    const ok = await confirm({
      title: `Удалить урок «${lesson.title}»?`,
      description: materials.length ? `Вместе с ним пропадут материалы: ${materials.length}. Участники перестанут видеть урок в календаре.` : 'Участники перестанут видеть урок в календаре.',
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      await call(`/api/lessons/${lesson.id}`, { method: 'DELETE' })
      toast.success('Урок удалён')
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error('Не удалось удалить урок', { description: (err as Error).message })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form className="flex h-full flex-col" onSubmit={submit} noValidate>
          <SheetHeader>
            <SheetTitle>{editingId ? 'Урок' : 'Новый урок'}</SheetTitle>
            <SheetDescription>{editingId ? lessonWhen(lesson!) : 'Появится в календаре участников'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Название" htmlFor="ls-title" required hint={errors.title && <span className="text-destructive">{errors.title}</span>}>
                <Input id="ls-title" autoFocus={!editingId} value={form.title} onChange={text('title')} placeholder="Например: Финансовая модель бизнеса" maxLength={150} aria-invalid={!!errors.title || undefined} />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Дата" htmlFor="ls-date" className="col-span-3 sm:col-span-1" hint={errors.date && <span className="text-destructive">{errors.date}</span>}>
                  <Input id="ls-date" type="date" value={form.date} onChange={text('date')} aria-invalid={!!errors.date || undefined} />
                </Field>
                <Field label="Начало" htmlFor="ls-start" className="col-span-1">
                  <Input id="ls-start" type="time" value={form.start} onChange={text('start')} aria-invalid={!!errors.time || undefined} />
                </Field>
                <Field label="Конец" htmlFor="ls-end" className="col-span-1">
                  <Input id="ls-end" type="time" value={form.end} onChange={text('end')} aria-invalid={!!errors.time || undefined} />
                </Field>
              </div>
              {errors.time && <p className="-mt-2 text-xs text-destructive">{errors.time}</p>}

              <Field label="Формат">
                <Segmented
                  aria-label="Формат"
                  className="self-start"
                  value={form.format}
                  onChange={v => set('format', v)}
                  options={[
                    { value: 'online', label: 'Онлайн' },
                    { value: 'offline', label: 'Очно' },
                  ]}
                />
              </Field>

              {form.format === 'online' ? (
                <Field label="Ссылка на урок" htmlFor="ls-link" hint="Zoom, Google Meet, Телемост. Участники увидят кнопку «Подключиться»">
                  <Input id="ls-link" value={form.link} onChange={text('link')} placeholder="https://" inputMode="url" autoCapitalize="none" spellCheck={false} />
                </Field>
              ) : (
                <Field label="Адрес" htmlFor="ls-location">
                  <Input id="ls-location" value={form.location} onChange={text('location')} placeholder="Город, улица, зал" maxLength={200} />
                </Field>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Кто ведёт" htmlFor="ls-teacher">
                  <Input id="ls-teacher" value={form.teacher} onChange={text('teacher')} placeholder="Необязательно" maxLength={100} />
                </Field>
                <Field label="Для кого" hint={groups.length ? undefined : 'Группы создаются на странице «Спринты»'}>
                  <Select value={form.group_id} onValueChange={v => set('group_id', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Весь поток</SelectItem>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="О чём урок" htmlFor="ls-desc" hint="Участники увидят это в карточке урока">
                <Textarea id="ls-desc" value={form.description} onChange={text('description')} placeholder="План урока, что подготовить заранее" className="min-h-24 resize-none" maxLength={2000} />
              </Field>

              {!editingId && (
                <Field label="Повторять" hint="Одинаковые уроки в этот же день недели и время, каждую неделю">
                  <Select value={form.weeks} onValueChange={v => set('weeks', v)}>
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPEATS.map(n => (
                        <SelectItem key={n} value={String(n)}>
                          {n === 1 ? 'Не повторять' : `Каждую неделю, ${n} уроков`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {editingId ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Материалы урока</h3>
                  <MaterialsEditor lessonId={editingId} materials={materials} onChanged={() => { loadMaterials(); onSaved() }} />
                </section>
              ) : (
                <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                  <CalendarDays className="mt-0.5 size-3.5 shrink-0" />
                  Презентации и ссылки прикрепляются после сохранения: откроется карточка урока.
                </p>
              )}
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? 'Сохраняем…' : editingId ? 'Сохранить' : 'Добавить урок'}
            </Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              {editingId ? 'Закрыть' : 'Отмена'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" className={cn('ml-auto text-muted-foreground hover:bg-destructive-soft hover:text-destructive')} onClick={remove}>
                <Trash2 /> Удалить
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

