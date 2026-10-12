'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { todayISO } from '@/lib/format'
import { addDays, dateRange, daysBetween, nextSprintDates, type Sprint, type SprintTask } from '@/lib/sprints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import { api } from './shared'

const LENGTHS = { '7': 7, '14': 14, '28': 28 } as const
type LengthKey = keyof typeof LENGTHS | 'custom'

export function SprintSheet({
  open,
  onOpenChange,
  programId,
  programName,
  sprints,
  backlog,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  programId: string
  programName: string
  sprints: Sprint[]
  backlog: SprintTask[]
  onCreated: (sprint: Sprint) => void
}) {
  const last = sprints.length ? sprints[sprints.length - 1] : null
  const number = (last?.number ?? 0) + 1
  const [title, setTitle] = React.useState('')
  const [goal, setGoal] = React.useState('')
  const [length, setLength] = React.useState<LengthKey>('14')
  const [start, setStart] = React.useState('')
  const [end, setEnd] = React.useState('')
  const [picked, setPicked] = React.useState<string[]>([])
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const d = nextSprintDates(last, todayISO(), 14)
    setTitle('')
    setGoal('')
    setLength('14')
    setStart(d.start_date)
    setEnd(d.end_date)
    setPicked([])
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pickLength = (k: LengthKey) => {
    setLength(k)
    if (k !== 'custom' && start) setEnd(addDays(start, LENGTHS[k] - 1))
  }
  const changeStart = (v: string) => {
    setStart(v)
    if (v && length !== 'custom') setEnd(addDays(v, LENGTHS[length] - 1))
  }

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Назовите тему спринта'
    if (!start || !end) errs.dates = 'Укажите даты'
    else if (end < start) errs.dates = 'Конец раньше начала'
    else if (last && start <= last.end_date) errs.dates = `Спринт ${last.number} идёт до ${dateRange(last.start_date, last.end_date)}, начните позже`
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const res = await api<{ data: Sprint }>('/api/sprints', {
        method: 'POST',
        json: { program_id: programId, title, goal, start_date: start, end_date: end, backlog_task_ids: picked },
      })
      toast.success(`Спринт ${number} создан`, { description: dateRange(start, end) })
      onCreated(res.data)
      onOpenChange(false)
    } catch (e: any) {
      toast.error('Не удалось создать спринт', { description: e.message })
    } finally {
      setSaving(false)
    }
  }

  const days = start && end && end >= start ? daysBetween(start, end) + 1 : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          className="flex h-full flex-col"
          onSubmit={e => {
            e.preventDefault()
            submit()
          }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>Спринт {number}</SheetTitle>
            <SheetDescription>{programName}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Тема" htmlFor="sp-title" required hint={errors.title && <span className="text-destructive">{errors.title}</span>}>
                <Input
                  id="sp-title"
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Например: Первые продажи"
                  aria-invalid={!!errors.title || undefined}
                />
              </Field>

              <Field label="Длительность">
                <Segmented
                  aria-label="Длительность"
                  className="self-start"
                  value={length}
                  onChange={pickLength}
                  options={[
                    { value: '7', label: '1 неделя' },
                    { value: '14', label: '2 недели' },
                    { value: '28', label: '4 недели' },
                    { value: 'custom', label: 'Свои даты' },
                  ]}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Начало" htmlFor="sp-start">
                  <Input id="sp-start" type="date" value={start} onChange={e => changeStart(e.target.value)} aria-invalid={!!errors.dates || undefined} />
                </Field>
                <Field label="Конец" htmlFor="sp-end">
                  <Input
                    id="sp-end"
                    type="date"
                    value={end}
                    min={start}
                    onChange={e => {
                      setEnd(e.target.value)
                      setLength('custom')
                    }}
                    aria-invalid={!!errors.dates || undefined}
                  />
                </Field>
              </div>
              <p className={errors.dates ? '-mt-2 text-xs text-destructive' : '-mt-2 text-xs text-muted-foreground'}>
                {errors.dates || (days ? `${days} дн. · ${dateRange(start, end)}` : '')}
              </p>

              <Field label="Цель спринта" htmlFor="sp-goal" hint="Участники увидят её вверху своего спринта">
                <Textarea
                  id="sp-goal"
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="Чего каждый участник должен добиться к концу спринта"
                  className="min-h-20 resize-none"
                />
              </Field>

              {backlog.length > 0 && (
                <Field label="Взять из бэклога" hint="Задачи без срока получат срок — конец спринта">
                  <div className="divide-y rounded-lg border">
                    {backlog.map(t => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent">
                        <Checkbox
                          checked={picked.includes(t.id)}
                          onCheckedChange={() => setPicked(p => (p.includes(t.id) ? p.filter(x => x !== t.id) : [...p, t.id]))}
                        />
                        <span className="flex-1">{t.title}</span>
                        <span className="text-xs text-muted-foreground">{t.audience === 'all' ? 'всем' : 'личная'}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              )}
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : picked.length ? `Создать спринт · задач: ${picked.length}` : 'Создать спринт'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
