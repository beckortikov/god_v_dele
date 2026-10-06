'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import type { Account, Program } from '@/components/finance/types'

const CURRENCIES = ['USD', 'TJS', 'RUB', 'EUR'] as const

export function AccountSheet({
  open,
  onOpenChange,
  editing,
  programs,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Account | null
  programs: Program[]
  onSaved: () => void
}) {
  const [form, setForm] = React.useState({ name: '', currency: 'USD', program_id: 'none', is_default: false, initial_balance: '0' })
  const [saving, setSaving] = React.useState(false)
  const [nameError, setNameError] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setNameError(false)
    setForm(
      editing
        ? {
            name: editing.name,
            currency: editing.currency,
            program_id: editing.program_id || 'none',
            is_default: editing.is_default,
            initial_balance: String(editing.initial_balance || 0),
          }
        : { name: '', currency: 'USD', program_id: 'none', is_default: false, initial_balance: '0' }
    )
  }, [open, editing])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setNameError(true)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/accounts', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          name: form.name.trim(),
          currency: form.currency,
          program_id: form.program_id === 'none' ? null : form.program_id,
          is_default: form.is_default,
          initial_balance: Number(form.initial_balance) || 0,
        }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      toast.success(editing ? 'Счёт обновлён' : 'Счёт создан', { description: form.name.trim() })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось сохранить счёт', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form className="flex h-full flex-col" onSubmit={submit}>
          <SheetHeader>
            <SheetTitle>{editing ? 'Редактирование счёта' : 'Новый счёт'}</SheetTitle>
            <SheetDescription>Касса, банковская карта или расчётный счёт</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Название" htmlFor="acc-name" required hint={nameError && <span className="text-destructive">Укажите название</span>}>
                <Input
                  id="acc-name"
                  autoFocus
                  value={form.name}
                  aria-invalid={nameError || undefined}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Например: Касса (сомони)"
                />
              </Field>
              <Field label="Валюта">
                <Segmented
                  aria-label="Валюта"
                  value={form.currency}
                  onChange={v => setForm(f => ({ ...f, currency: v }))}
                  options={CURRENCIES.map(c => ({ value: c, label: c }))}
                  className="w-fit"
                />
              </Field>
              <Field label="Программа" hint="Счёт без программы доступен для всех программ">
                <Select value={form.program_id} onValueChange={v => setForm(f => ({ ...f, program_id: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Общий счёт</SelectItem>
                    {programs.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Начальный остаток" htmlFor="acc-initial">
                <Input
                  id="acc-initial"
                  type="number"
                  step="0.01"
                  className="num"
                  value={form.initial_balance}
                  onChange={e => setForm(f => ({ ...f, initial_balance: e.target.value }))}
                />
              </Field>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium">Счёт по умолчанию</span>
                  <span className="block text-xs text-muted-foreground">Подставляется в новые операции автоматически</span>
                </span>
                <Switch checked={form.is_default} onCheckedChange={v => setForm(f => ({ ...f, is_default: v }))} />
              </label>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Создать счёт'}
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
