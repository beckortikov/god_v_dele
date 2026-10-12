'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/format'
import { addDays, shortDate, SUBMISSION, type ParticipantLite, type Sprint, type SubmissionType } from '@/lib/sprints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import { api } from './shared'

const BACKLOG = 'backlog'

interface Form {
  title: string
  description: string
  sprintId: string
  due: string
  submission: SubmissionType
  audience: 'all' | 'selected'
  selected: string[]
  review: boolean
}

export function TaskSheet({
  open,
  onOpenChange,
  programId,
  sprints,
  defaultSprintId,
  participants,
  preselect,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  programId: string
  sprints: Sprint[]
  defaultSprintId: string | null
  participants: ParticipantLite[]
  /** Opens the form as a personal task for these people. */
  preselect?: string[]
  onCreated: () => void
}) {
  const blank = React.useCallback(
    (): Form => ({
      title: '',
      description: '',
      sprintId: defaultSprintId ?? BACKLOG,
      due: '',
      submission: 'text',
      audience: preselect?.length ? 'selected' : 'all',
      selected: preselect ?? [],
      review: true,
    }),
    [defaultSprintId, preselect]
  )
  const [form, setForm] = React.useState<Form>(blank)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setForm(blank())
    setErrors({})
    setQuery('')
  }, [open, blank])

  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }))
  const sprint = sprints.find(s => s.id === form.sprintId) ?? null
  const today = todayISO()

  const quick = sprint
    ? [
        { label: 'Конец спринта', date: sprint.end_date },
        { label: 'Через 3 дня', date: addDays(today, 3) },
        { label: 'Через неделю', date: addDays(today, 7) },
      ]
    : []

  const visible = participants.filter(p => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()))
  const toggle = (id: string) =>
    set({ selected: form.selected.includes(id) ? form.selected.filter(x => x !== id) : [...form.selected, id] })

  const count = form.audience === 'all' ? participants.length : form.selected.length

  const submit = async (again: boolean) => {
    const errs: Record<string, string> = {}
    if (!form.title.trim()) errs.title = 'Опишите задачу в двух словах'
    if (form.audience === 'selected' && !form.selected.length) errs.selected = 'Выберите хотя бы одного участника'
    if (sprint && form.due && (form.due < sprint.start_date || form.due > sprint.end_date)) errs.due = 'Срок выходит за даты спринта'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const res = await api<{ assigned: number }>('/api/sprints/tasks', {
        method: 'POST',
        json: {
          program_id: programId,
          sprint_id: sprint?.id ?? null,
          title: form.title,
          description: form.description,
          due_date: form.due || null,
          submission_type: form.submission,
          requires_review: form.review,
          audience: form.audience,
          participant_ids: form.audience === 'selected' ? form.selected : [],
        },
      })
      toast.success(sprint ? 'Задача поставлена' : 'Задача добавлена в бэклог', {
        description: sprint ? `Получили участников: ${res.assigned}` : 'Возьмёте её в спринт, когда придёт время',
      })
      onCreated()
      if (again) setForm(f => ({ ...blank(), sprintId: f.sprintId, submission: f.submission, audience: f.audience, selected: f.selected }))
      else onOpenChange(false)
    } catch (e: any) {
      toast.error('Не удалось создать задачу', { description: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <form
          className="flex h-full flex-col"
          onSubmit={e => {
            e.preventDefault()
            submit(false)
          }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit(false)
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>Новая задача</SheetTitle>
            <SheetDescription>{sprint ? `Спринт ${sprint.number} · ${sprint.title}` : 'В бэклог потока'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Что сделать" htmlFor="st-title" required hint={errors.title && <span className="text-destructive">{errors.title}</span>}>
                <Input
                  id="st-title"
                  autoFocus
                  value={form.title}
                  onChange={e => set({ title: e.target.value })}
                  placeholder="Например: провести 5 интервью с клиентами"
                  aria-invalid={!!errors.title || undefined}
                />
              </Field>

              <Field label="Подробности" htmlFor="st-desc">
                <Textarea
                  id="st-desc"
                  value={form.description}
                  onChange={e => set({ description: e.target.value })}
                  placeholder="Что именно сделать, где взять шаблон"
                  className="min-h-20 resize-none"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Спринт">
                  <Select value={form.sprintId} onValueChange={v => set({ sprintId: v, due: '' })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sprints.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          Спринт {s.number} · {s.title}
                        </SelectItem>
                      ))}
                      <SelectItem value={BACKLOG}>В бэклог</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Срок"
                  htmlFor="st-due"
                  hint={errors.due ? <span className="text-destructive">{errors.due}</span> : sprint && !form.due ? `По умолчанию — конец спринта, ${shortDate(sprint.end_date)}` : undefined}
                >
                  <Input
                    id="st-due"
                    type="date"
                    value={form.due}
                    min={sprint?.start_date}
                    max={sprint?.end_date}
                    onChange={e => set({ due: e.target.value })}
                    disabled={!sprint}
                    aria-invalid={!!errors.due || undefined}
                  />
                </Field>
              </div>
              {quick.length > 0 && (
                <div className="-mt-2 flex flex-wrap gap-1.5">
                  {quick.map(q => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => set({ due: q.date })}
                      className={cn(
                        'h-7 rounded-md border px-2.5 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                        form.due === q.date ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {q.label} · {shortDate(q.date)}
                    </button>
                  ))}
                </div>
              )}

              <Field label="Кому" hint={errors.selected && <span className="text-destructive">{errors.selected}</span>}>
                <Segmented
                  aria-label="Кому"
                  className="self-start"
                  value={form.audience}
                  onChange={v => set({ audience: v })}
                  options={[
                    { value: 'all', label: <>Всему потоку <span className="text-muted-foreground">{participants.length}</span></> },
                    { value: 'selected', label: 'Выбрать участников' },
                  ]}
                />
                {form.audience === 'all' ? (
                  <p className="text-xs text-muted-foreground">
                    Каждый активный участник получит свою копию задачи. Тем, кто подключил Telegram, придёт уведомление.
                  </p>
                ) : (
                  <div className="rounded-lg border">
                    <label className="flex items-center gap-2 border-b px-3">
                      <Search className="size-4 text-muted-foreground" />
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Имя участника…"
                        aria-label="Поиск участника"
                        className="h-9 flex-1 bg-transparent text-sm outline-none"
                      />
                    </label>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {visible.map(p => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent">
                          <Checkbox checked={form.selected.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                          {p.name}
                        </label>
                      ))}
                      {!visible.length && <p className="px-3 py-2 text-sm text-muted-foreground">Никого не нашли</p>}
                    </div>
                  </div>
                )}
              </Field>

              <Field label="Как сдать результат">
                <div role="radiogroup" aria-label="Как сдать результат" className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(SUBMISSION) as SubmissionType[]).map(k => {
                    const on = form.submission === k
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set({ submission: k })}
                        className={cn(
                          'flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                          on ? 'border-primary bg-primary-soft' : 'hover:border-ring/40'
                        )}
                      >
                        <span className={cn('text-sm font-medium', on && 'text-primary-soft-foreground')}>{SUBMISSION[k].label}</span>
                        <span className="text-xs text-muted-foreground">{SUBMISSION[k].hint}</span>
                      </button>
                    )
                  })}
                </div>
              </Field>

              <label className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
                <span className="flex-1">
                  <span className="block text-sm font-medium">Проверка куратора</span>
                  <span className="block text-xs text-muted-foreground">
                    {form.review ? 'Задача засчитается, когда вы нажмёте «Принять»' : 'Сданная задача сразу считается выполненной'}
                  </span>
                </span>
                <Switch checked={form.review} onCheckedChange={v => set({ review: v })} aria-label="Проверка куратора" />
              </label>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : sprint ? `Создать для ${count}` : 'В бэклог'}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => submit(true)}>
              Создать и ещё
            </Button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
