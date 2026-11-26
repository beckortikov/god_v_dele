'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarClock, Check, ChevronsUpDown, Flag, ListTodo, Phone, Users, Wallet, type LucideIcon } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  /** 1 «Срочно» … 4 «Не срочно»; 3 when not set */
  priority?: number | null
  result_comment?: string | null
  created_at?: string
  updated_at?: string
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

/** P1–P4. «Обычно» (P3) is the default and shows no badge in lists. */
export const PRIORITIES = [
  { value: 1, code: 'P1', label: 'Срочно', badge: 'bg-destructive text-white', flag: 'text-destructive' },
  { value: 2, code: 'P2', label: 'Важно', badge: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))] ring-1 ring-warning/40', flag: 'text-warning' },
  { value: 3, code: 'P3', label: 'Обычно', badge: 'bg-muted text-muted-foreground', flag: 'text-muted-foreground' },
  { value: 4, code: 'P4', label: 'Не срочно', badge: 'bg-muted text-muted-foreground/80', flag: 'text-muted-foreground/60' },
] as const
export const DEFAULT_PRIORITY = 3

export function priorityOf(task: Pick<Task, 'priority'> | number | null | undefined) {
  const v = typeof task === 'number' ? task : task?.priority
  return PRIORITIES.find(p => p.value === v) ?? PRIORITIES[2]
}

/** «P1 Срочно» as a small pill; nothing for the default P3 unless `always`. */
export function PriorityBadge({ task, always, className }: { task: Pick<Task, 'priority'>; always?: boolean; className?: string }) {
  const p = priorityOf(task)
  if (p.value === DEFAULT_PRIORITY && !always) return null
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-semibold', p.badge, className)} title={`Приоритет: ${p.label}`}>
      <span className="num">{p.code}</span>
      <span className="font-medium">{p.label}</span>
    </span>
  )
}

/** Priority as a dropdown with flags. */
export function PrioritySelect({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  const current = priorityOf(value)
  return (
    <Select value={String(value)} onValueChange={v => onChange(Number(v))}>
      <SelectTrigger size="sm" className={cn('h-8 gap-1.5 bg-card', className)} aria-label="Приоритет">
        <Flag className={cn('size-4', current.flag)} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map(p => (
          <SelectItem key={p.value} value={String(p.value)}>
            <span className="num font-semibold">{p.code}</span> {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Urgent first; the same priority keeps its order. */
export const byPriority = (a: Pick<Task, 'priority'>, b: Pick<Task, 'priority'>) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY)

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
/** «только что», «25 мин», «3 ч», «2 дн» since `iso`. */
export function timeSince(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const min = Math.max(0, Math.round((now - t) / 60_000))
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч`
  return `${Math.floor(h / 24)} дн`
}

/** How long an open task has been waiting: calm for a day, then warning, then red after three. */
export function ageTone(task: Task, now = Date.now()): 'calm' | 'warn' | 'late' {
  if (!task.created_at || task.status === 'completed' || task.status === 'cancelled') return 'calm'
  const h = (now - new Date(task.created_at).getTime()) / 3_600_000
  return h >= 72 ? 'late' : h >= 24 ? 'warn' : 'calm'
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Quick deadlines for a new task or a changed one. */
export const DEADLINES = [
  { label: 'Сегодня', days: 0 },
  { label: 'Завтра', days: 1 },
  { label: 'Через 3 дня', days: 3 },
  { label: 'Через неделю', days: 7 },
]

/** «сегодня», «завтра», «пт, 28 ноя». */
export function deadlineLabel(iso: string | null | undefined) {
  if (!iso) return 'без срока'
  const today = todayISO()
  if (iso === today) return 'сегодня'
  if (iso === addDays(today, 1)) return 'завтра'
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
}

/** Choose a deadline: quick picks plus any date. */
export function DeadlinePicker({ value, onChange, compact }: { value: string; onChange: (iso: string) => void; compact?: boolean }) {
  const today = todayISO()
  return (
    <div role="radiogroup" aria-label="Срок" className="flex flex-wrap items-center gap-1">
      {DEADLINES.map(d => {
        const iso = addDays(today, d.days)
        const on = value === iso
        return (
          <button
            key={d.days}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(iso)}
            className={cn(
              'rounded-full px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30',
              compact ? 'h-8' : 'h-9',
              on ? 'bg-primary text-primary-foreground' : 'border bg-card text-foreground/80 hover:bg-muted'
            )}
          >
            {d.label}
          </button>
        )
      })}
      <label className={cn('relative inline-flex items-center gap-1 rounded-full border bg-card px-3 text-xs font-medium text-foreground/80 hover:bg-muted', compact ? 'h-8' : 'h-9', !DEADLINES.some(d => addDays(today, d.days) === value) && value && 'border-primary bg-primary-soft text-primary-soft-foreground')}>
        <CalendarClock className="size-3.5" />
        {!DEADLINES.some(d => addDays(today, d.days) === value) && value ? deadlineLabel(value) : 'Дата'}
        <input type="date" min={today} value={value} onChange={e => e.target.value && onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Своя дата срока" />
      </label>
    </div>
  )
}

/** One button «Срок: завтра» that opens quick picks and a calendar. */
export function DeadlineSelect({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const today = todayISO()
  const pick = (iso: string) => {
    onChange(iso)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Срок: ${deadlineLabel(value)}`}
          className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs outline-none hover:border-ring/40 focus-visible:ring-[3px] focus-visible:ring-ring/25"
        >
          <CalendarClock className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Срок:</span>
          <span className="font-medium">{deadlineLabel(value)}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <div role="listbox" aria-label="Срок" className="flex flex-col">
          {DEADLINES.map(d => {
            const iso = addDays(today, d.days)
            const on = iso === value
            return (
              <button
                key={d.days}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => pick(iso)}
                className={cn('flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted', on && 'font-semibold')}
              >
                <Check className={cn('size-4 text-primary', on ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1">{d.label}</span>
                <span className="text-xs text-muted-foreground">{deadlineLabel(iso)}</span>
              </button>
            )
          })}
        </div>
        <label className="mt-1 flex items-center gap-2 border-t px-2.5 pt-2 pb-1 text-sm">
          <span className="text-muted-foreground">Своя дата</span>
          <Input type="date" min={today} value={value} onChange={e => e.target.value && pick(e.target.value)} className="h-8 flex-1" />
        </label>
      </PopoverContent>
    </Popover>
  )
}

/** The kind of task as a dropdown with icons. */
export function TaskTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = taskType(value)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-8 gap-1.5 bg-card" aria-label="Тип задачи">
        <current.icon className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(TASK_TYPES).map(([k, t]) => (
          <SelectItem key={k} value={k}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

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
  priority?: number
  /** «Всем»: one copy per person */
  assignee_ids?: string[]
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
    priority: DEFAULT_PRIORITY,
    target_type: 'participant',
    target_participant_id: 'none',
    guest_name: '',
  }
}

/** «Кому» value meaning every active employee. */
export const ALL_ASSIGNEES = '__all__'

/** «Кому» options: «Всем сотрудникам» first, then each person. */
export function assigneeOptions(employees: EmployeeLite[], withAll = true): ComboOption[] {
  const people = employees.map(e => ({ value: e.id, label: employeeName(e), hint: e.position || undefined }))
  return withAll && employees.length > 1
    ? [{ value: ALL_ASSIGNEES, label: 'Всем сотрудникам', hint: `${employees.length} человек — каждому своя задача` }, ...people]
    : people
}

/** Four priority buttons, for forms. */
export function PriorityPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Приоритет">
      {PRIORITIES.map(p => {
        const active = value === p.value
        return (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p.value)}
            className={cn(
              'flex h-12 flex-col items-center justify-center rounded-md border text-xs leading-tight transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
              active ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-input bg-card text-foreground/80 hover:border-ring/40'
            )}
          >
            <span className="num flex items-center gap-1 font-semibold"><Flag className={cn('size-3.5', p.flag)} />{p.code}</span>
            <span>{p.label}</span>
          </button>
        )
      })}
    </div>
  )
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
  const eOptions = React.useMemo(() => assigneeOptions(employees ?? []), [employees])

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
      setForm(f => ({ ...emptyTask(f.assignee_id), task_type: f.task_type, priority: f.priority, target_type: f.target_type }))
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
                    stacked
                  />
                </Field>
              )}

              <Field label="Приоритет">
                <PriorityPicker value={form.priority ?? DEFAULT_PRIORITY} onChange={v => set({ priority: v })} />
              </Field>

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
  employees,
  onSaved,
  onDelete,
}: {
  task: Task | null
  open: boolean
  onOpenChange: (o: boolean) => void
  assigneeName?: string
  /** When given, the task can be handed to someone else. */
  employees?: EmployeeLite[]
  onSaved: (updated: Task) => void
  onDelete?: (task: Task) => void
}) {
  const [status, setStatus] = React.useState<TaskStatus>('todo')
  const [priority, setPriority] = React.useState(DEFAULT_PRIORITY)
  const [assignee, setAssignee] = React.useState('')
  const [comment, setComment] = React.useState('')
  const [due, setDue] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open && task) {
      setStatus(task.status)
      setComment(task.result_comment || '')
      setDue(task.due_date || '')
      setPriority(task.priority ?? DEFAULT_PRIORITY)
      setAssignee(task.assignee_id)
    }
  }, [open, task])

  const save = async () => {
    if (!task) return
    setSaving(true)
    try {
      const res = await fetch('/api/employee/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          status,
          result_comment: comment,
          ...(due !== (task.due_date || '') ? { due_date: due || null } : {}),
          ...(priority !== (task.priority ?? DEFAULT_PRIORITY) ? { priority } : {}),
          ...(assignee && assignee !== task.assignee_id ? { assignee_id: assignee } : {}),
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || 'Сервер не ответил')
      toast.success('Задача обновлена', { description: TASK_STATUS[status].label })
      onSaved({ ...task, status, result_comment: comment, due_date: due || null, priority, assignee_id: assignee || task.assignee_id })
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
              <SheetTitle className="leading-snug">
                <PriorityBadge task={{ priority }} className="mr-1.5 align-middle" />
                {task.title}
              </SheetTitle>
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

                {task.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Поставлена {formatDate(task.created_at, 'long')} в{' '}
                    {new Date(task.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · прошло {timeSince(task.created_at)}
                  </p>
                )}

                <Field label="Приоритет">
                  <PriorityPicker value={priority} onChange={setPriority} />
                </Field>

                <Field label="Срок">
                  <DeadlinePicker value={due} onChange={setDue} />
                </Field>

                {employees && employees.length > 0 && (
                  <Field label="Исполнитель" hint={assignee !== task.assignee_id ? 'Задача перейдёт к этому сотруднику' : undefined}>
                    <Combobox value={assignee} onChange={setAssignee} options={assigneeOptions(employees, false)} searchPlaceholder="Имя сотрудника…" stacked />
                  </Field>
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
