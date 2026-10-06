'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarClock, ListTodo, Phone, Users, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, todayISO } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Field, FieldGroup } from '@/components/erp/field'
import { Combobox, type ComboOption } from '@/components/erp/combobox'
import { Segmented } from '@/components/erp/segmented'

// ---------------------------------------------------------------------------
// Types and dictionaries

export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled'

export interface TaskTarget {
  id: string
  name: string
  phone?: string | null
}

export interface Task {
  id: string
  assignee_id: string
  creator_id?: string | null
  title: string
  description?: string | null
  target_participant_id?: string | null
  due_date?: string | null
  status: TaskStatus
  task_type?: string | null
  result_comment?: string | null
  created_at?: string
  target?: TaskTarget | null
}

export interface EmployeeLite {
  id: string
  first_name: string
  last_name: string
  position?: string | null
  status?: string | null
}

export interface ParticipantLite {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  status?: string | null
  program?: { id: string; name: string } | null
}

export const TASK_STATUS: Record<TaskStatus, { label: string; variant: 'secondary' | 'info' | 'success' | 'outline' }> = {
  todo: { label: 'К выполнению', variant: 'secondary' },
  in_progress: { label: 'В работе', variant: 'info' },
  completed: { label: 'Выполнено', variant: 'success' },
  cancelled: { label: 'Отменено', variant: 'outline' },
}

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'completed', 'cancelled']

/** Value sent for a generic task. The DB check allows call | meeting | payment_reminder | other. */
export const GENERIC_TASK_TYPE = 'other'

const TASK_TYPES: Record<string, { label: string; icon: LucideIcon }> = {
  call: { label: 'Звонок', icon: Phone },
  meeting: { label: 'Встреча', icon: Users },
  payment_reminder: { label: 'Напоминание об оплате', icon: Wallet },
  other: { label: 'Задача', icon: ListTodo },
}

export function taskType(type?: string | null) {
  return TASK_TYPES[type || ''] ?? TASK_TYPES.other
}

export function isOverdue(task: Task) {
  return !!task.due_date && task.due_date < todayISO() && task.status !== 'completed' && task.status !== 'cancelled'
}

export function employeeName(e?: EmployeeLite | null) {
  return e ? `${e.first_name} ${e.last_name}`.trim() : ''
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary-soft-foreground',
        className
      )}
    >
      {initials(name) || '?'}
    </span>
  )
}

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const s = TASK_STATUS[status] ?? TASK_STATUS.todo
  return (
    <Badge variant={s.variant} className={className}>
      {s.label}
    </Badge>
  )
}

/** Due date line: highlights overdue tasks, hides today's date. */
export function DueLabel({ task, className }: { task: Task; className?: string }) {
  if (!task.due_date) return null
  if (isOverdue(task)) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-destructive', className)}>
        <CalendarClock className="size-3.5" /> срок {formatDate(task.due_date)}
      </span>
    )
  }
  if (task.due_date === todayISO()) return null
  return <span className={cn('num text-muted-foreground', className)}>срок {formatDate(task.due_date)}</span>
}

// ---------------------------------------------------------------------------
// New task sheet

export type TargetType = 'participant' | 'guest' | 'none'

export interface NewTaskValues {
  assignee_id: string
  title: string
  description: string
  task_type: string
  target_type: TargetType
  target_participant_id: string // 'none' when nobody is picked
  guest_name: string
}

function emptyTask(assignee = ''): NewTaskValues {
  return {
    assignee_id: assignee,
    title: '',
    description: '',
    task_type: 'call',
    target_type: 'participant',
    target_participant_id: 'none',
    guest_name: '',
  }
}

export function participantOptions(participants: ParticipantLite[]): ComboOption[] {
  return participants.map(p => ({
    value: p.id,
    label: p.name,
    hint: p.phone || undefined,
    keywords: [p.email, p.program?.name].filter(Boolean).join(' '),
  }))
}

/**
 * Create-task form. The parent builds the request body (`onCreate` returns true on success),
 * so each cabinet keeps its own payload rules.
 */
export function NewTaskSheet({
  open,
  onOpenChange,
  participants,
  employees,
  defaultAssignee,
  description,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  participants: ParticipantLite[]
  /** When given, the form asks whom the task is for. */
  employees?: EmployeeLite[]
  defaultAssignee?: string
  description?: string
  onCreate: (values: NewTaskValues) => Promise<boolean>
}) {
  const [form, setForm] = React.useState<NewTaskValues>(() => emptyTask(defaultAssignee))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(emptyTask(defaultAssignee))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (patch: Partial<NewTaskValues>) => setForm(f => ({ ...f, ...patch }))

  const pOptions = React.useMemo(
    () => [{ value: 'none', label: 'Не выбран' }, ...participantOptions(participants)],
    [participants]
  )
  const eOptions = React.useMemo(
    () => (employees ?? []).map(e => ({ value: e.id, label: employeeName(e), hint: e.position || undefined })),
    [employees]
  )

  const submit = async (addAnother: boolean) => {
    const errs: Record<string, string> = {}
    if (employees && !form.assignee_id) errs.assignee_id = 'Выберите сотрудника'
    if (!form.title.trim()) errs.title = 'Опишите задачу в двух словах'
    if (form.target_type === 'guest' && !form.guest_name.trim()) errs.guest_name = 'Укажите имя или телефон гостя'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    const ok = await onCreate(form)
    setSaving(false)
    if (!ok) return
    if (addAnother) {
      setForm(f => ({ ...emptyTask(f.assignee_id), task_type: f.task_type, target_type: f.target_type }))
    } else {
      onOpenChange(false)
    }
  }

  const err = (k: string) => errors[k] && <span className="text-destructive">{errors[k]}</span>

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
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
            <SheetDescription>{description ?? 'Срок: сегодня'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              {employees && (
                <Field label="Исполнитель" required hint={err('assignee_id')}>
                  <Combobox
                    value={form.assignee_id}
                    onChange={v => set({ assignee_id: v })}
                    options={eOptions}
                    placeholder="Выберите сотрудника"
                    searchPlaceholder="Имя или должность…"
                    invalid={!!errors.assignee_id}
                  />
                </Field>
              )}

              <Field label="Тип">
                <Segmented
                  aria-label="Тип задачи"
                  className="self-start"
                  value={form.task_type === 'call' ? 'call' : GENERIC_TASK_TYPE}
                  onChange={v => set({ task_type: v })}
                  options={[
                    { value: 'call', label: <><Phone className="size-3.5" /> Звонок</> },
                    { value: GENERIC_TASK_TYPE, label: <><ListTodo className="size-3.5" /> Задача</> },
                  ]}
                />
              </Field>

              <Field label="Что сделать" htmlFor="task-title" required hint={err('title')}>
                <Input
                  id="task-title"
                  autoFocus
                  value={form.title}
                  onChange={e => set({ title: e.target.value })}
                  placeholder={form.task_type === 'call' ? 'Например: напомнить об оплате' : 'Например: подготовить отчёт'}
                  aria-invalid={!!errors.title || undefined}
                />
              </Field>

              <Field label="Кого касается">
                <Segmented
                  aria-label="Кого касается"
                  className="self-start"
                  value={form.target_type}
                  onChange={v => set({ target_type: v, target_participant_id: 'none', guest_name: '' })}
                  options={[
                    { value: 'participant', label: 'Участник' },
                    { value: 'guest', label: 'Гость' },
                    { value: 'none', label: 'Никого' },
                  ]}
                />
              </Field>

              {form.target_type === 'participant' && (
                <Field label="Участник" hint="Поиск по имени, телефону или группе">
                  <Combobox
                    value={form.target_participant_id}
                    onChange={v => set({ target_participant_id: v })}
                    options={pOptions}
                    placeholder="Не выбран"
                    searchPlaceholder="Имя или телефон…"
                  />
                </Field>
              )}

              {form.target_type === 'guest' && (
                <Field label="Гость" htmlFor="task-guest" required hint={err('guest_name') || 'Имя попадёт в название задачи'}>
                  <Input
                    id="task-guest"
                    value={form.guest_name}
                    onChange={e => set({ guest_name: e.target.value })}
                    placeholder="Например: Алишер, 93 000 00 00"
                    aria-invalid={!!errors.guest_name || undefined}
                  />
                </Field>
              )}

              <Field label="Подробности" htmlFor="task-desc">
                <Textarea
                  id="task-desc"
                  value={form.description}
                  onChange={e => set({ description: e.target.value })}
                  placeholder="Необязательно"
                  className="min-h-20 resize-none"
                />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Создать'}
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

// ---------------------------------------------------------------------------
// Task card sheet: details, status and result

export function TaskSheet({
  task,
  open,
  onOpenChange,
  assigneeName,
  onSaved,
  onDelete,
}: {
  task: Task | null
  open: boolean
  onOpenChange: (o: boolean) => void
  assigneeName?: string
  onSaved: (updated: Task) => void
  onDelete?: (task: Task) => void
}) {
  const [status, setStatus] = React.useState<TaskStatus>('todo')
  const [comment, setComment] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open && task) {
      setStatus(task.status)
      setComment(task.result_comment || '')
    }
  }, [open, task])

  const save = async () => {
    if (!task) return
    setSaving(true)
    try {
      const res = await fetch('/api/employee/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status, result_comment: comment }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || 'Сервер не ответил')
      toast.success('Задача обновлена', { description: TASK_STATUS[status].label })
      onSaved({ ...task, status, result_comment: comment })
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось сохранить задачу', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const type = taskType(task?.task_type)
  const TypeIcon = type.icon

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {task && (
          <form
            className="flex h-full flex-col"
            onSubmit={e => {
              e.preventDefault()
              save()
            }}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
          >
            <SheetHeader>
              <SheetDescription className="flex items-center gap-1.5">
                <TypeIcon className="size-3.5" /> {type.label}
                {task.due_date && (
                  <>
                    <span aria-hidden>·</span>
                    <DueLabel task={task} />
                    {!isOverdue(task) && task.due_date === todayISO() && <span>на сегодня</span>}
                  </>
                )}
              </SheetDescription>
              <SheetTitle className="leading-snug">{task.title}</SheetTitle>
            </SheetHeader>
            <SheetBody>
              <FieldGroup>
                {(task.description || assigneeName) && (
                  <div className="space-y-2 text-sm">
                    {assigneeName && (
                      <p className="flex items-center gap-2">
                        <Avatar name={assigneeName} />
                        <span>{assigneeName}</span>
                      </p>
                    )}
                    {task.description && <p className="whitespace-pre-wrap text-muted-foreground">{task.description}</p>}
                  </div>
                )}

                {task.target && (
                  <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <Avatar name={task.target.name} className="size-8 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.target.name}</p>
                      {task.target.phone && <p className="num text-xs text-muted-foreground">{task.target.phone}</p>}
                    </div>
                    {task.target.phone && (
                      <Button asChild size="sm" variant="soft">
                        <a href={`tel:${task.target.phone.replace(/[^\d+]/g, '')}`}>
                          <Phone /> Позвонить
                        </a>
                      </Button>
                    )}
                  </div>
                )}

                <Field label="Статус">
                  <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Статус">
                    {STATUS_ORDER.map(s => {
                      const active = status === s
                      return (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setStatus(s)}
                          className={cn(
                            'h-9 rounded-md border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                            active
                              ? 'border-primary bg-primary-soft font-medium text-primary-soft-foreground'
                              : 'border-input bg-card text-foreground/80 hover:border-ring/40 hover:text-foreground'
                          )}
                        >
                          {TASK_STATUS[s].label}
                        </button>
                      )
                    })}
                  </div>
                </Field>

                <Field label="Результат" htmlFor="task-result">
                  <Textarea
                    id="task-result"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder={task.task_type === 'call' ? 'Чем закончился звонок' : 'Что сделано'}
                    className="min-h-24 resize-none"
                  />
                </Field>
              </FieldGroup>
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
              {onDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-destructive hover:bg-destructive-soft hover:text-destructive"
                  onClick={() => onDelete(task)}
                >
                  Удалить
                </Button>
              )}
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}
