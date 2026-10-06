'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/erp/field'
import { formatMoney, todayISO } from '@/lib/format'
import type { Participant, Program } from '@/components/participants/types'

type FormState = {
  name: string
  email: string
  phone: string
  program_id: string
  tariff: string
  start_date: string
}

const emptyForm = (): FormState => ({ name: '', email: '', phone: '', program_id: '', tariff: '', start_date: todayISO() })

const fromParticipant = (p: Participant): FormState => ({
  name: p.name,
  email: p.email || '',
  phone: p.phone || '',
  program_id: p.program_id,
  tariff: p.tariff ? String(p.tariff) : '',
  start_date: (p.start_date || '').split('T')[0],
})

export function ParticipantFormSheet({
  open,
  onOpenChange,
  editing,
  programs,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Participant being edited, or null to create a new one. */
  editing: Participant | null
  programs: Program[]
  /** Called with the record returned by the server. */
  onSaved: (participant: Participant, mode: 'create' | 'update') => void
}) {
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(editing ? fromParticipant(editing) : emptyForm())
  }, [open, editing])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  const program = programs.find(p => p.id === form.program_id)

  const submit = async (addAnother: boolean) => {
    const errs: typeof errors = {}
    if (!form.name.trim()) errs.name = 'Укажите имя участника'
    if (!form.program_id) errs.program_id = 'Выберите программу'
    if (!form.start_date) errs.start_date = 'Укажите дату начала'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      if (editing) {
        const payload = {
          id: editing.id,
          ...form,
          tariff: form.tariff ? Number(form.tariff) : undefined,
        }
        const response = await fetch('/api/participants', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = await response.json()
        if (result.error) throw new Error(result.error)
        if (result.data && result.data[0]) onSaved(result.data[0], 'update')
        toast.success('Изменения сохранены', { description: form.name })
        onOpenChange(false)
      } else {
        const payload = {
          ...form,
          tariff: form.tariff ? Number(form.tariff) : null,
        }
        const response = await fetch('/api/participants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = await response.json()
        if (result.error) throw new Error(result.error)
        onSaved(result.data[0], 'create')
        toast.success('Участник добавлен', { description: `${form.name} · ${program?.name ?? ''}` })
        if (addAnother) {
          // Keep the program and start date: people usually join a cohort together
          setForm(f => ({ ...emptyForm(), program_id: f.program_id, start_date: f.start_date }))
        } else {
          onOpenChange(false)
        }
      }
    } catch (err: any) {
      toast.error(editing ? 'Не удалось сохранить изменения' : 'Не удалось добавить участника', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const errorHint = (key: keyof FormState) => errors[key] && <span className="text-destructive">{errors[key]}</span>

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          className="flex h-full flex-col"
          noValidate
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
            <SheetTitle>{editing ? 'Редактирование участника' : 'Новый участник'}</SheetTitle>
            <SheetDescription>{editing ? editing.name : 'Участник программы обучения'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="ФИО" htmlFor="pt-name" required hint={errorHint('name')}>
                <Input
                  id="pt-name"
                  autoFocus
                  placeholder="Фамилия Имя"
                  value={form.name}
                  aria-invalid={!!errors.name || undefined}
                  onChange={e => set('name', e.target.value)}
                />
              </Field>

              <Field label="Программа" required hint={errorHint('program_id')}>
                <Select value={form.program_id} onValueChange={v => set('program_id', v)}>
                  <SelectTrigger className="w-full" aria-invalid={!!errors.program_id || undefined}>
                    <SelectValue placeholder="Выберите программу" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        <span className="num text-muted-foreground">· {formatMoney(p.price_per_month)}/мес</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Индивидуальный тариф"
                  htmlFor="pt-tariff"
                  hint={program ? `Пусто — по программе, ${formatMoney(program.price_per_month)}/мес` : 'Пусто — по цене программы'}
                >
                  <div className="relative">
                    <Input
                      id="pt-tariff"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder={program ? String(program.price_per_month) : ''}
                      value={form.tariff}
                      onChange={e => set('tariff', e.target.value)}
                      className="num pr-14"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                      $/мес
                    </span>
                  </div>
                </Field>
                <Field label="Дата начала" htmlFor="pt-start" required hint={errorHint('start_date')}>
                  <Input
                    id="pt-start"
                    type="date"
                    value={form.start_date}
                    aria-invalid={!!errors.start_date || undefined}
                    onChange={e => set('start_date', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Телефон" htmlFor="pt-phone">
                  <Input
                    id="pt-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="+992 90 123 45 67"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                  />
                </Field>
                <Field label="Email" htmlFor="pt-email">
                  <Input
                    id="pt-email"
                    type="email"
                    placeholder="name@example.com"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Добавить'}
            </Button>
            {editing ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled={saving} onClick={() => submit(true)}>
                Добавить и ещё
              </Button>
            )}
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
