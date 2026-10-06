'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Pencil, Phone, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatMoney } from '@/lib/format'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import { Avatar, DetailRow, errorHint, fullName, type EmployeeStatus, type HrEmployee } from '@/components/hr/shared'

export const EMPLOYEE_STATUS: Record<EmployeeStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' }> = {
  active: { label: 'Работает', variant: 'success' },
  inactive: { label: 'Не работает', variant: 'secondary' },
  terminated: { label: 'Уволен', variant: 'destructive' },
}

interface FormState {
  first_name: string
  last_name: string
  position: string
  department: string
  phone: string
  birth_date: string
  base_salary: string
  responsibilities: string
  valuable_final_product: string
  status: string
}

const emptyForm = (): FormState => ({
  first_name: '',
  last_name: '',
  position: '',
  department: '',
  phone: '',
  birth_date: '',
  base_salary: '',
  responsibilities: '',
  valuable_final_product: '',
  status: 'active',
})

const fromEmployee = (e: HrEmployee): FormState => ({
  first_name: e.first_name,
  last_name: e.last_name,
  position: e.position,
  department: e.department || '',
  phone: e.phone || '',
  birth_date: e.birth_date || '',
  base_salary: e.base_salary.toString(),
  responsibilities: e.responsibilities || '',
  valuable_final_product: e.valuable_final_product || '',
  status: e.status,
})

export type EmployeeSheetMode = 'view' | 'edit' | 'create'

export function EmployeeSheet({
  open,
  onOpenChange,
  mode,
  onModeChange,
  employee,
  departments,
  onSaved,
  onDelete,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: EmployeeSheetMode
  onModeChange: (m: EmployeeSheetMode) => void
  employee: HrEmployee | null
  departments: string[]
  onSaved: () => void
  onDelete: (e: HrEmployee) => void
}) {
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(mode !== 'create' && employee ? fromEmployee(employee) : emptyForm())
  }, [open, mode, employee])

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const editingId = mode === 'edit' ? employee?.id ?? null : null

  const submit = async (addAnother: boolean) => {
    const errs: Record<string, string> = {}
    if (!form.first_name.trim()) errs.first_name = 'Укажите имя'
    if (!form.last_name.trim()) errs.last_name = 'Укажите фамилию'
    if (!form.position.trim()) errs.position = 'Укажите должность'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const url = editingId ? `/api/hr/employees/${editingId}` : '/api/hr/employees'
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          base_salary: Number(form.base_salary) || 0,
        }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || `Ошибка ${res.status}`)
      }
      toast.success(editingId ? 'Карточка сотрудника обновлена' : 'Сотрудник добавлен', {
        description: `${form.first_name} ${form.last_name}`.trim(),
      })
      onSaved()
      if (addAnother && !editingId) {
        setForm(f => ({ ...emptyForm(), department: f.department }))
      } else {
        onOpenChange(false)
      }
    } catch (err: any) {
      toast.error('Не удалось сохранить сотрудника', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {mode === 'view' && employee ? (
          <EmployeeDetails employee={employee} onEdit={() => onModeChange('edit')} onDelete={() => onDelete(employee)} />
        ) : (
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
              <SheetTitle>{editingId ? 'Редактирование сотрудника' : 'Новый сотрудник'}</SheetTitle>
              <SheetDescription>
                {editingId ? fullName(employee) : 'Карточка появится в графике, табеле и зарплатной ведомости'}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <FieldGroup>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Имя" htmlFor="emp-first" required hint={errorHint(errors.first_name)}>
                    <Input id="emp-first" autoFocus={!editingId} value={form.first_name} onChange={set('first_name')} aria-invalid={!!errors.first_name || undefined} />
                  </Field>
                  <Field label="Фамилия" htmlFor="emp-last" required hint={errorHint(errors.last_name)}>
                    <Input id="emp-last" value={form.last_name} onChange={set('last_name')} aria-invalid={!!errors.last_name || undefined} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Должность" htmlFor="emp-pos" required hint={errorHint(errors.position)}>
                    <Input id="emp-pos" value={form.position} onChange={set('position')} placeholder="Например: менеджер" aria-invalid={!!errors.position || undefined} />
                  </Field>
                  <Field label="Отдел" htmlFor="emp-dep">
                    <Input id="emp-dep" value={form.department} onChange={set('department')} placeholder="Необязательно" />
                    {departments.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {departments.slice(0, 6).map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, department: d }))}
                            className={cn(
                              'h-6 rounded-full border px-2.5 text-xs transition-colors',
                              form.department === d
                                ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                                : 'border-input text-muted-foreground hover:border-ring/40 hover:text-foreground'
                            )}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Оклад в месяц" htmlFor="emp-salary">
                    <div className="relative">
                      <Input
                        id="emp-salary"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={form.base_salary}
                        onChange={set('base_salary')}
                        placeholder="0"
                        className="num pr-12"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">TJS</span>
                    </div>
                  </Field>
                  <Field label="Дата рождения" htmlFor="emp-birth">
                    <Input id="emp-birth" type="date" value={form.birth_date} onChange={set('birth_date')} />
                  </Field>
                </div>

                <Field label="Телефон" htmlFor="emp-phone">
                  <Input id="emp-phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+992 …" />
                </Field>

                {editingId && (
                  <Field label="Статус">
                    <Segmented
                      aria-label="Статус"
                      value={form.status as EmployeeStatus}
                      onChange={v => setForm(f => ({ ...f, status: v }))}
                      options={(Object.keys(EMPLOYEE_STATUS) as EmployeeStatus[]).map(s => ({ value: s, label: EMPLOYEE_STATUS[s].label }))}
                    />
                  </Field>
                )}

                <Field label="Ценный конечный продукт" htmlFor="emp-vfp" hint="Результат, за который отвечает сотрудник">
                  <Textarea
                    id="emp-vfp"
                    value={form.valuable_final_product}
                    onChange={set('valuable_final_product')}
                    placeholder="Например: оплаченные заявки на программу"
                    className="min-h-16 resize-none"
                  />
                </Field>

                <Field label="Должностные обязанности" htmlFor="emp-resp">
                  <Textarea
                    id="emp-resp"
                    value={form.responsibilities}
                    onChange={set('responsibilities')}
                    placeholder="Каждая обязанность с новой строки"
                    className="min-h-24"
                  />
                </Field>
              </FieldGroup>
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </Button>
              {!editingId ? (
                <Button type="button" variant="outline" disabled={saving} onClick={() => submit(true)}>
                  Сохранить и ещё
                </Button>
              ) : (
                <Button type="button" variant="ghost" disabled={saving} onClick={() => onModeChange('view')}>
                  Отмена
                </Button>
              )}
              <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}

function EmployeeDetails({ employee: e, onEdit, onDelete }: { employee: HrEmployee; onEdit: () => void; onDelete: () => void }) {
  const st = EMPLOYEE_STATUS[e.status] ?? EMPLOYEE_STATUS.inactive
  return (
    <div className="flex h-full flex-col">
      <SheetHeader>
        <div className="flex items-center gap-3">
          <Avatar person={e} className="size-11 text-sm" />
          <div className="min-w-0">
            <SheetTitle className="truncate">{fullName(e)}</SheetTitle>
            <SheetDescription className="truncate">
              {e.position}
              {e.department ? ` · ${e.department}` : ''}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <SheetBody>
        <div className="divide-y rounded-lg border px-3">
          <DetailRow label="Статус">
            <Badge variant={st.variant}>{st.label}</Badge>
          </DetailRow>
          <DetailRow label="Оклад">
            <span className="num font-medium">{formatMoney(e.base_salary, e.currency || 'TJS')}</span>
          </DetailRow>
          <DetailRow label="Телефон">
            {e.phone ? (
              <a href={`tel:${e.phone.replace(/\s/g, '')}`} className="num inline-flex items-center gap-1.5 hover:text-primary">
                <Phone className="size-3.5 text-muted-foreground" />
                {e.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          {e.email && <DetailRow label="Email">{e.email}</DetailRow>}
          <DetailRow label="Дата рождения">
            <span className="num">{formatDate(e.birth_date, 'long')}</span>
          </DetailRow>
          {e.hire_date && (
            <DetailRow label="В компании с">
              <span className="num">{formatDate(e.hire_date, 'long')}</span>
            </DetailRow>
          )}
        </div>

        <section className="mt-6">
          <h3 className="mb-1.5 text-sm font-medium">Ценный конечный продукт</h3>
          {e.valuable_final_product ? (
            <p className="text-sm whitespace-pre-wrap text-foreground/90">{e.valuable_final_product}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Не указан</p>
          )}
        </section>

        <section className="mt-6">
          <h3 className="mb-1.5 text-sm font-medium">Должностные обязанности</h3>
          {e.responsibilities ? (
            <ul className="space-y-1 text-sm text-foreground/90">
              {e.responsibilities
                .split('\n')
                .map(s => s.trim())
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span>{line}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Не указаны</p>
          )}
        </section>
      </SheetBody>
      <SheetFooter>
        <Button onClick={onEdit}>
          <Pencil /> Изменить
        </Button>
        <Button variant="ghost" className="ml-auto text-muted-foreground hover:bg-destructive-soft hover:text-destructive" onClick={onDelete}>
          <Trash2 /> Удалить
        </Button>
      </SheetFooter>
    </div>
  )
}
