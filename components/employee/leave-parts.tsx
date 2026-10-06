'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDate, plural, todayISO } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'

export type LeaveType = 'time_off' | 'vacation' | 'sick_leave'
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveRequest {
  id: string
  employee_id: string
  start_date: string
  end_date: string
  reason: string
  type: LeaveType | string
  status: LeaveStatus
  approved_by?: string | null
  created_at?: string
}

export const LEAVE_TYPES: Record<LeaveType, string> = {
  time_off: 'Отгул',
  vacation: 'Отпуск',
  sick_leave: 'Больничный',
}

export const LEAVE_STATUS: Record<LeaveStatus, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  pending: { label: 'На рассмотрении', variant: 'warning' },
  approved: { label: 'Одобрено', variant: 'success' },
  rejected: { label: 'Отклонено', variant: 'destructive' },
}

export function leaveTypeLabel(t: string) {
  return LEAVE_TYPES[t as LeaveType] ?? t
}

export function leaveDays(start: string, end: string) {
  const a = new Date(start + 'T00:00:00').getTime()
  const b = new Date(end + 'T00:00:00').getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.round((b - a) / 86400000) + 1
}

/** "12.10.2026 · 1 день" or "12.10 – 16.10.2026 · 5 дней" */
export function leaveRange(r: { start_date: string; end_date: string }) {
  const days = leaveDays(r.start_date, r.end_date)
  const range =
    r.start_date === r.end_date
      ? formatDate(r.start_date)
      : `${formatDate(r.start_date).slice(0, 5)} – ${formatDate(r.end_date)}`
  return `${range} · ${days} ${plural(days, ['день', 'дня', 'дней'])}`
}

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const s = LEAVE_STATUS[status] ?? LEAVE_STATUS.pending
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export function LeaveSheet({
  open,
  onOpenChange,
  employeeId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  employeeId: string
  onSaved: () => void
}) {
  const [type, setType] = React.useState<LeaveType>('time_off')
  const [start, setStart] = React.useState(todayISO())
  const [end, setEnd] = React.useState(todayISO())
  const [reason, setReason] = React.useState('')
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setType('time_off')
    setStart(todayISO())
    setEnd(todayISO())
    setReason('')
    setErrors({})
  }, [open])

  const days = leaveDays(start, end)

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (!start) errs.start = 'Укажите дату'
    if (!end || end < start) errs.end = 'Не раньше даты начала'
    if (!reason.trim()) errs.reason = 'Коротко напишите причину'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const res = await fetch('/api/employee/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, start_date: start, end_date: end, reason: reason.trim(), type }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || 'Сервер не ответил')
      toast.success('Заявка отправлена', { description: `${LEAVE_TYPES[type]} · ${days} ${plural(days, ['день', 'дня', 'дней'])}` })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось отправить заявку', { description: err.message })
    } finally {
      setSaving(false)
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
            <SheetTitle>Заявка на отсутствие</SheetTitle>
            <SheetDescription>Руководитель увидит её и примет решение</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Тип">
                <Segmented
                  aria-label="Тип заявки"
                  className="self-start"
                  value={type}
                  onChange={setType}
                  options={(Object.keys(LEAVE_TYPES) as LeaveType[]).map(t => ({ value: t, label: LEAVE_TYPES[t] }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="С" htmlFor="leave-start" required hint={err('start')}>
                  <Input
                    id="leave-start"
                    type="date"
                    value={start}
                    onChange={e => {
                      const v = e.target.value
                      setStart(v)
                      if (v && end < v) setEnd(v)
                    }}
                    aria-invalid={!!errors.start || undefined}
                  />
                </Field>
                <Field label="По" htmlFor="leave-end" required hint={err('end')}>
                  <Input
                    id="leave-end"
                    type="date"
                    min={start}
                    value={end}
                    onChange={e => setEnd(e.target.value)}
                    aria-invalid={!!errors.end || undefined}
                  />
                </Field>
              </div>
              <p className={cn('-mt-1 text-sm', days ? 'text-muted-foreground' : 'text-destructive')}>
                {days ? `${days} ${plural(days, ['день', 'дня', 'дней'])} отсутствия` : 'Проверьте даты'}
              </p>
              <Field label="Причина" htmlFor="leave-reason" required hint={err('reason')}>
                <Textarea
                  id="leave-reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Например: семейные обстоятельства"
                  className="min-h-20 resize-none"
                  aria-invalid={!!errors.reason || undefined}
                />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Отправка…' : 'Отправить'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
