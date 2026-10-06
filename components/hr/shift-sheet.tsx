'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, plural } from '@/lib/format'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Field, FieldGroup } from '@/components/erp/field'
import { Combobox } from '@/components/erp/combobox'
import {
  ChoiceChips,
  SHIFTS,
  SHIFT_ORDER,
  dateRange,
  errorHint,
  formatDay,
  fullName,
  hhmm,
  isWeekend,
  readPref,
  writePref,
  type HrEmployee,
  type ScheduleItem,
  type ShiftType,
} from '@/components/hr/shared'

const LAST_TIMES = 'hr-last-shift-times'
const PRESETS: [string, string][] = [
  ['09:00', '18:00'],
  ['10:00', '19:00'],
  ['09:00', '13:00'],
  ['14:00', '18:00'],
]

interface FormState {
  employee_id: string
  date: string
  date_to: string
  shift_type: ShiftType
  start_time: string
  end_time: string
}

function lastTimes(): [string, string] {
  const v = readPref(LAST_TIMES)
  if (v && /^\d\d:\d\d-\d\d:\d\d$/.test(v)) return v.split('-') as [string, string]
  return ['09:00', '18:00']
}

export function ShiftSheet({
  open,
  onOpenChange,
  employees,
  editing,
  defaults,
  onSaved,
  onDelete,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  employees: HrEmployee[]
  /** Existing record for the chosen cell, if any. */
  editing: ScheduleItem | null
  /** Prefill for a new shift (employee / date picked in the grid). */
  defaults: { employee_id?: string; date: string }
  onSaved: () => void
  onDelete: (s: ScheduleItem) => void
}) {
  const [form, setForm] = React.useState<FormState>(() => ({
    employee_id: '',
    date: defaults.date,
    date_to: '',
    shift_type: 'work',
    start_time: '09:00',
    end_time: '18:00',
  }))
  const [skipWeekends, setSkipWeekends] = React.useState(true)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    const [s, e] = lastTimes()
    if (editing) {
      setForm({
        employee_id: editing.employee_id,
        date: editing.work_date,
        date_to: '',
        shift_type: editing.shift_type,
        start_time: hhmm(editing.start_time) || s,
        end_time: hhmm(editing.end_time) || e,
      })
    } else {
      setForm({
        employee_id: defaults.employee_id ?? '',
        date: defaults.date,
        date_to: '',
        shift_type: 'work',
        start_time: s,
        end_time: e,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaults.employee_id, defaults.date])

  const isEdit = !!editing?.id
  const isRange = !isEdit && !!form.date_to && form.date_to > form.date
  const rangeDays = React.useMemo(() => {
    if (!isRange) return []
    const all = dateRange(form.date, form.date_to)
    return skipWeekends ? all.filter(d => !isWeekend(d)) : all
  }, [isRange, form.date, form.date_to, skipWeekends])

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (!form.employee_id) errs.employee_id = 'Выберите сотрудника'
    if (!form.date) errs.date = 'Укажите дату'
    if (form.date_to && form.date_to < form.date) errs.date = 'Дата окончания раньше начала'
    if (form.shift_type === 'work' && (!form.start_time || !form.end_time)) errs.time = 'Укажите время смены'
    if (isRange && rangeDays.length === 0) errs.date = 'В выбранном периоде нет будних дней'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const record = (work_date: string) => ({
        employee_id: form.employee_id,
        work_date,
        shift_type: form.shift_type,
        start_time: form.shift_type === 'work' ? form.start_time : null,
        end_time: form.shift_type === 'work' ? form.end_time : null,
      })
      const payload = isRange ? rangeDays.map(record) : { id: editing?.id, ...record(form.date) }

      const res = await fetch('/api/hr/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Ошибка ${res.status}`)
      }
      if (form.shift_type === 'work') writePref(LAST_TIMES, `${form.start_time}-${form.end_time}`)
      const emp = employees.find(e => e.id === form.employee_id)
      toast.success(isEdit ? 'Смена обновлена' : isRange ? `Назначено ${formatNumber(rangeDays.length)} ${plural(rangeDays.length, ['день', 'дня', 'дней'])}` : 'Смена назначена', {
        description: `${fullName(emp)} · ${SHIFTS[form.shift_type].label}`,
      })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось сохранить смену', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const employeeOptions = employees.map(e => ({ value: e.id, label: fullName(e), hint: e.position }))

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
            <SheetTitle>{isEdit ? 'Смена' : 'Назначить смену'}</SheetTitle>
            <SheetDescription>
              {isEdit ? `${fullName(editing?.employees ?? employees.find(e => e.id === editing?.employee_id))} · ${formatDay(form.date, true)}` : 'Существующая запись на этот день будет заменена'}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Сотрудник" required hint={errorHint(errors.employee_id)}>
                <Combobox
                  value={form.employee_id}
                  onChange={v => setForm(f => ({ ...f, employee_id: v }))}
                  options={employeeOptions}
                  placeholder="Выберите сотрудника"
                  searchPlaceholder="Имя сотрудника…"
                  invalid={!!errors.employee_id}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={isEdit ? 'Дата' : 'С даты'} htmlFor="shift-date" required>
                  <Input
                    id="shift-date"
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    aria-invalid={!!errors.date || undefined}
                  />
                </Field>
                {!isEdit && (
                  <Field label="По дату" htmlFor="shift-date-to" hint={!form.date_to ? 'Пусто — один день' : undefined}>
                    <Input
                      id="shift-date-to"
                      type="date"
                      min={form.date}
                      value={form.date_to}
                      onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))}
                      aria-invalid={!!errors.date || undefined}
                    />
                  </Field>
                )}
              </div>
              {errors.date && <p className="-mt-2 text-xs text-destructive">{errors.date}</p>}

              {isRange && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <span className="text-sm">
                    Пропускать субботу и воскресенье
                    <span className="block text-xs text-muted-foreground">
                      Будет {formatNumber(rangeDays.length)} {plural(rangeDays.length, ['день', 'дня', 'дней'])}
                    </span>
                  </span>
                  <Switch checked={skipWeekends} onCheckedChange={setSkipWeekends} />
                </label>
              )}

              <Field label="Тип дня">
                <ChoiceChips
                  value={form.shift_type}
                  onChange={v => setForm(f => ({ ...f, shift_type: v }))}
                  options={SHIFT_ORDER.map(t => ({ value: t, label: SHIFTS[t].label, dot: SHIFTS[t].dot }))}
                />
              </Field>

              {form.shift_type === 'work' && (
                <Field label="Время" hint={errorHint(errors.time)}>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <Input
                      type="time"
                      aria-label="Начало"
                      value={form.start_time}
                      onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                      className="num"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      aria-label="Конец"
                      value={form.end_time}
                      onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                      className="num"
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {PRESETS.map(([s, e]) => {
                      const active = form.start_time === s && form.end_time === e
                      return (
                        <button
                          key={s + e}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, start_time: s, end_time: e }))}
                          className={cn(
                            'num h-6 rounded-full border px-2.5 text-xs transition-colors',
                            active
                              ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                              : 'border-input text-muted-foreground hover:border-ring/40 hover:text-foreground'
                          )}
                        >
                          {s}–{e}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              )}
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : isRange ? `Назначить ${formatNumber(rangeDays.length)} ${plural(rangeDays.length, ['день', 'дня', 'дней'])}` : 'Сохранить'}
            </Button>
            {isEdit && editing && (
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                onClick={() => onDelete(editing)}
              >
                <Trash2 /> Удалить
              </Button>
            )}
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
