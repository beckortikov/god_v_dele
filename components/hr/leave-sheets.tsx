'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, plural, todayISO } from '@/lib/format'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Field, FieldGroup } from '@/components/erp/field'
import { Combobox } from '@/components/erp/combobox'
import { dangerIconCls } from '@/components/erp/table-parts'
import {
  Avatar,
  ChoiceChips,
  LEAVE_TYPES,
  SHIFTS,
  WEEKDAYS_SHORT,
  dateRange,
  errorHint,
  formatDay,
  fullName,
  isWeekend,
  weekday,
  type HrEmployee,
  type LeaveType,
} from '@/components/hr/shared'

export interface LeaveRecord {
  id: string
  employee_id: string
  work_date: string
  shift_type: LeaveType
  employees?: { first_name: string; last_name: string; position?: string }
}

export interface LeavePeriod {
  key: string
  employee_id: string
  employees?: LeaveRecord['employees']
  type: LeaveType
  from: string
  to: string
  records: LeaveRecord[]
}

const LEAVE_HINT: Record<LeaveType, string> = {
  vacation: 'Оплачиваемый отпуск',
  sick_leave: 'По больничному листу',
  unpaid_leave: 'Без сохранения зарплаты: день будет удержан при расчёте',
}

// ---------------------------------------------------------------------------
// Create a period / edit one day

export function LeaveSheet({
  open,
  onOpenChange,
  employees,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  employees: HrEmployee[]
  /** A single day to edit; null to register a new period. */
  editing: LeaveRecord | null
  onSaved: () => void
}) {
  const [formData, setFormData] = React.useState({
    employee_id: '',
    start_date: '',
    end_date: '',
    leave_type: 'vacation' as LeaveType,
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const editingId = editing?.id ?? null

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    if (editing) {
      setFormData({
        employee_id: editing.employee_id,
        start_date: editing.work_date,
        end_date: editing.work_date, // Edit mode works on a single day
        leave_type: editing.shift_type,
      })
    } else {
      const t = todayISO()
      setFormData({ employee_id: '', start_date: t, end_date: t, leave_type: 'vacation' })
    }
  }, [open, editing])

  const days = !editingId && formData.start_date && formData.end_date >= formData.start_date ? dateRange(formData.start_date, formData.end_date) : []
  const weekendDays = days.filter(isWeekend).length

  const handleSubmit = async () => {
    const errs: Record<string, string> = {}
    if (!formData.employee_id) errs.employee_id = 'Выберите сотрудника'
    if (!formData.start_date) errs.date = 'Укажите дату'
    else if (!editingId && (!formData.end_date || formData.end_date < formData.start_date)) errs.date = 'Дата окончания раньше начала'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      if (editingId) {
        // Update single record
        const res = await fetch(`/api/hr/schedule/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: formData.employee_id,
            work_date: formData.start_date,
            shift_type: formData.leave_type,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to update')
        }
      } else {
        // One schedule record per calendar day of the period
        const records = dateRange(formData.start_date, formData.end_date).map(work_date => ({
          employee_id: formData.employee_id,
          work_date,
          shift_type: formData.leave_type,
        }))
        const res = await fetch('/api/hr/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(records),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to create records')
        }
      }

      const emp = employees.find(e => e.id === formData.employee_id)
      toast.success(editingId ? 'День обновлён' : `${SHIFTS[formData.leave_type].label} оформлен`, {
        description: editingId
          ? `${fullName(emp)} · ${formatDay(formData.start_date, true)}`
          : `${fullName(emp)} · ${formatDay(formData.start_date)} – ${formatDay(formData.end_date, true)}`,
      })
      onOpenChange(false)
      onSaved()
    } catch (error: any) {
      console.error('Error saving leave:', error)
      toast.error('Не удалось сохранить', { description: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          className="flex h-full flex-col"
          onSubmit={e => {
            e.preventDefault()
            handleSubmit()
          }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{editingId ? 'Изменить день' : 'Новое отсутствие'}</SheetTitle>
            <SheetDescription>{editingId ? 'Изменения касаются только этого дня' : 'Отпуск, больничный или отгул попадут в график работы'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Сотрудник" required hint={errorHint(errors.employee_id)}>
                <Combobox
                  value={formData.employee_id}
                  onChange={v => setFormData(f => ({ ...f, employee_id: v }))}
                  options={employees.map(e => ({ value: e.id, label: fullName(e), hint: e.position }))}
                  placeholder="Выберите сотрудника"
                  searchPlaceholder="Имя сотрудника…"
                  invalid={!!errors.employee_id}
                />
              </Field>

              <Field label="Тип" hint={LEAVE_HINT[formData.leave_type]}>
                <ChoiceChips
                  value={formData.leave_type}
                  onChange={v => setFormData(f => ({ ...f, leave_type: v }))}
                  options={LEAVE_TYPES.map(t => ({ value: t, label: SHIFTS[t].label, dot: SHIFTS[t].dot }))}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={editingId ? 'Дата' : 'С даты'} htmlFor="leave-from" required>
                  <Input
                    id="leave-from"
                    type="date"
                    value={formData.start_date}
                    onChange={e => {
                      const v = e.target.value
                      // Keep the period valid when the start moves past the end
                      setFormData(f => ({ ...f, start_date: v, end_date: !f.end_date || f.end_date < v ? v : f.end_date }))
                    }}
                    aria-invalid={!!errors.date || undefined}
                  />
                </Field>
                {!editingId && (
                  <Field label="По дату" htmlFor="leave-to" required>
                    <Input
                      id="leave-to"
                      type="date"
                      min={formData.start_date}
                      value={formData.end_date}
                      onChange={e => setFormData(f => ({ ...f, end_date: e.target.value }))}
                      aria-invalid={!!errors.date || undefined}
                    />
                  </Field>
                )}
              </div>
              {errors.date ? (
                <p className="-mt-2 text-xs text-destructive">{errors.date}</p>
              ) : (
                days.length > 0 && (
                  <p className="-mt-2 text-xs text-muted-foreground">
                    <span className="num font-medium text-foreground">
                      {formatNumber(days.length)} {plural(days.length, ['день', 'дня', 'дней'])}
                    </span>
                    {weekendDays > 0 && ` · из них ${formatNumber(weekendDays)} ${plural(weekendDays, ['выходной', 'выходных', 'выходных'])}`}
                  </p>
                )
              )}
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : editingId ? 'Сохранить' : 'Оформить'}
            </Button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Period details with per-day actions

export function PeriodSheet({
  period,
  onClose,
  onEditDay,
  onDeleteDay,
  onDeletePeriod,
  statusOf,
}: {
  period: LeavePeriod | null
  onClose: () => void
  onEditDay: (r: LeaveRecord) => void
  onDeleteDay: (r: LeaveRecord) => void
  onDeletePeriod: (p: LeavePeriod) => void
  statusOf: (p: LeavePeriod) => { label: string; variant: 'info' | 'secondary' }
}) {
  const [shown, setShown] = React.useState<LeavePeriod | null>(period)
  React.useEffect(() => {
    if (period) setShown(period)
  }, [period])
  const p = period ?? shown
  const st = p ? statusOf(p) : null

  return (
    <Sheet open={!!period} onOpenChange={o => !o && onClose()}>
      <SheetContent>
        {p && st && (
          <div className="flex h-full flex-col">
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar person={p.employees} className="size-11 text-sm" />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{fullName(p.employees) || 'Сотрудник'}</SheetTitle>
                  <SheetDescription>
                    {SHIFTS[p.type].label} · {formatDay(p.from)} – {formatDay(p.to, true)}
                  </SheetDescription>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={SHIFTS[p.type].badge}>{SHIFTS[p.type].label}</Badge>
                <Badge variant={st.variant}>{st.label}</Badge>
                <span className="num ml-auto text-sm text-muted-foreground">
                  {formatNumber(p.records.length)} {plural(p.records.length, ['день', 'дня', 'дней'])}
                </span>
              </div>
            </SheetHeader>
            <SheetBody>
              <ul className="divide-y rounded-lg border">
                {p.records.map(r => (
                  <li key={r.id} className="group flex items-center gap-3 px-3 py-1.5">
                    <span className={cn('num w-6 text-xs', isWeekend(r.work_date) ? 'text-muted-foreground' : 'text-foreground/80')}>
                      {WEEKDAYS_SHORT[weekday(r.work_date)]}
                    </span>
                    <span className="num flex-1 text-sm">{formatDay(r.work_date, true)}</span>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Изменить день" onClick={() => onEditDay(r)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className={dangerIconCls} aria-label="Удалить день" onClick={() => onDeleteDay(r)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </SheetBody>
            <SheetFooter>
              <Button variant="ghost" className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive" onClick={() => onDeletePeriod(p)}>
                <Trash2 /> {p.records.length > 1 ? 'Удалить весь период' : 'Удалить'}
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
