'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup } from '@/components/erp/field'
import { formatMoney, plural } from '@/lib/format'
import type { Program } from '@/components/participants/types'

const DURATION_PRESETS = [3, 6, 9, 12]
const EMPTY = { name: '', price_per_month: '', duration_months: '' }

export function ProgramSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (program: Program) => void
}) {
  const [formData, setFormData] = React.useState(EMPTY)
  const [errors, setErrors] = React.useState<Partial<Record<keyof typeof EMPTY, string>>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setFormData(EMPTY)
      setErrors({})
    }
  }, [open])

  const set = (key: keyof typeof EMPTY, value: string) => {
    setFormData(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  const price = Number(formData.price_per_month)
  const months = Number(formData.duration_months)
  const total = price > 0 && months > 0 ? price * months : 0

  const submit = async () => {
    const errs: typeof errors = {}
    if (!formData.name.trim()) errs.name = 'Укажите название'
    if (!(price > 0)) errs.price_per_month = 'Укажите цену больше нуля'
    if (!(months > 0)) errs.duration_months = 'Укажите длительность'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const payload = {
        name: formData.name,
        price_per_month: Number(formData.price_per_month),
        duration_months: Number(formData.duration_months),
      }
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      onCreated(result.data)
      toast.success('Программа создана', { description: formData.name })
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось создать программу', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const errorHint = (key: keyof typeof EMPTY) => errors[key] && <span className="text-destructive">{errors[key]}</span>

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          className="flex h-full flex-col"
          noValidate
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
            <SheetTitle>Новая программа</SheetTitle>
            <SheetDescription>Образовательный продукт с помесячной оплатой</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Название" htmlFor="prog-name" required hint={errorHint('name')}>
                <Input
                  id="prog-name"
                  autoFocus
                  placeholder="Например: Фундамент"
                  value={formData.name}
                  aria-invalid={!!errors.name || undefined}
                  onChange={e => set('name', e.target.value)}
                />
              </Field>

              <Field label="Цена за месяц" htmlFor="prog-price" required hint={errorHint('price_per_month')}>
                <div className="relative">
                  <Input
                    id="prog-price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="1000"
                    value={formData.price_per_month}
                    aria-invalid={!!errors.price_per_month || undefined}
                    onChange={e => set('price_per_month', e.target.value)}
                    className="num pr-12"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                    USD
                  </span>
                </div>
              </Field>

              <Field
                label="Длительность"
                htmlFor="prog-duration"
                required
                hint={errorHint('duration_months')}
                aside={
                  <div className="flex gap-1">
                    {DURATION_PRESETS.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set('duration_months', String(m))}
                        className="num rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary-soft aria-pressed:text-primary-soft-foreground"
                        aria-pressed={months === m}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="relative">
                  <Input
                    id="prog-duration"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    placeholder="12"
                    value={formData.duration_months}
                    aria-invalid={!!errors.duration_months || undefined}
                    onChange={e => set('duration_months', e.target.value)}
                    className="num pr-12"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                    мес
                  </span>
                </div>
              </Field>

              {total > 0 && (
                <div className="flex items-baseline justify-between rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    Полная стоимость за {months} {plural(months, ['месяц', 'месяца', 'месяцев'])}
                  </span>
                  <span className="num font-semibold">{formatMoney(total)}</span>
                </div>
              )}
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Создать программу'}
            </Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
