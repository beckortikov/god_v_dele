'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/format'
import { TEMPLATE_DIRECTIONS, type MyPlanData, type OpPlan } from '@/lib/op-plan'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/erp/field'
import { planApi } from './plan-shared'

/** First run: the vision and the directions (picked from the template or typed), in one screen. */
export function PlanSetup({ participantId, onCreated }: { participantId: string; onCreated: (d: MyPlanData) => void }) {
  const [vision, setVision] = React.useState('')
  const [visionDate, setVisionDate] = React.useState('')
  const [picked, setPicked] = React.useState<string[]>(['Стратегия', 'HR', 'Продажи', 'Маркетинг'])
  const [custom, setCustom] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const options = [...TEMPLATE_DIRECTIONS, ...picked.filter(p => !TEMPLATE_DIRECTIONS.includes(p))]

  const toggle = (d: string) => setPicked(p => (p.includes(d) ? p.filter(x => x !== d) : [...p, d]))
  const addCustom = () => {
    const t = custom.trim()
    if (t && !picked.some(p => p.toLowerCase() === t.toLowerCase())) setPicked(p => [...p, t])
    setCustom('')
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!picked.length) return toast.error('Выберите хотя бы одно направление')
    setSaving(true)
    try {
      const r = await planApi<{ data: MyPlanData }>(participantId, '', { method: 'PUT', json: { vision, vision_date: visionDate || null, directions: picked } })
      toast.success('План создан', { description: 'Теперь добавьте микро-цели и действия' })
      onCreated(r.data)
    } catch (err) {
      toast.error('Не удалось создать план', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={create} className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-5 pb-10 sm:pt-8">
      <header className="px-1">
        <p className="text-sm text-muted-foreground">Операционный план</p>
        <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-tight text-balance sm:text-3xl">Соберите план за пару минут</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-pretty text-muted-foreground">
          Видение → направления → микро-цели → действия. У каждого действия будет срок, ответственные и цена слова. Всё можно поменять позже.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
          <span className="num flex size-7 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">1</span>
          Видение
        </h2>
        <FieldGroup>
          <Field label="Каким станет бизнес" htmlFor="ps-vision" hint="Одна-две фразы с цифрами">
            <Textarea
              id="ps-vision"
              value={vision}
              onChange={e => setVision(e.target.value)}
              placeholder="Например: №1 платформа по продаже цветов онлайн в Центральной Азии — 1000 магазинов в 50 городах"
              className="min-h-24 resize-none"
            />
          </Field>
          <Field label="К какой дате" htmlFor="ps-date">
            <Input id="ps-date" type="date" value={visionDate} onChange={e => setVisionDate(e.target.value)} className="w-auto" />
          </Field>
        </FieldGroup>
      </section>

      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
          <span className="num flex size-7 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">2</span>
          Направления
        </h2>
        <p className="-mt-2 text-sm text-muted-foreground">Отметьте, по каким направлениям будете двигаться</p>
        <div className="flex flex-wrap gap-2">
          {options.map(d => {
            const on = picked.includes(d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(d)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                  on ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'bg-card hover:border-ring/40'
                )}
              >
                {on && <Check className="size-3.5" strokeWidth={3} />}
                {d}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="Своё направление"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
            placeholder="Своё направление"
          />
          <Button type="button" variant="outline" onClick={addCustom} disabled={!custom.trim()}>
            <Plus />
            Добавить
          </Button>
        </div>
      </section>

      <Button type="submit" size="lg" className="h-12 text-[15px]" disabled={saving}>
        {saving ? 'Создаю…' : `Создать план · ${picked.length} ${plural(picked.length, ['направление', 'направления', 'направлений'])}`}
      </Button>
    </form>
  )
}

/** Edit the vision of an existing plan. */
export function VisionSheet({
  open,
  plan,
  participantId,
  onClose,
  onSaved,
}: {
  open: boolean
  plan: OpPlan | null
  participantId: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [vision, setVision] = React.useState('')
  const [date, setDate] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setVision(plan?.vision ?? '')
    setDate(plan?.vision_date ?? '')
  }, [open, plan])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await planApi(participantId, '', { method: 'PUT', json: { vision, vision_date: date || null } })
      toast.success('Видение сохранено')
      await onSaved()
      onClose()
    } catch (err) {
      toast.error('Не удалось сохранить', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <form onSubmit={save} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Видение</SheetTitle>
            <SheetDescription>Каким станет бизнес и к какой дате</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Видение" htmlFor="vs-vision">
                <Textarea id="vs-vision" value={vision} onChange={e => setVision(e.target.value)} className="min-h-32 resize-none" />
              </Field>
              <Field label="К какой дате" htmlFor="vs-date">
                <Input id="vs-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="w-auto" />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter className="pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** A tiny one-field prompt: name a direction or a micro-goal. Template names are offered as chips. */
export function NameDialog({
  open,
  title,
  label,
  initial,
  suggestions = [],
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  label: string
  initial?: string
  suggestions?: string[]
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) setName(initial ?? '')
  }, [open, initial])

  const submit = async (value: string) => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await onSubmit(value.trim())
      onClose()
    } catch (err) {
      toast.error('Не удалось сохранить', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={e => {
            e.preventDefault()
            submit(name)
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{label}</DialogDescription>
          </DialogHeader>
          <Field label={label} htmlFor="nd-name">
            <Input id="nd-name" autoFocus value={name} onChange={e => setName(e.target.value)} />
          </Field>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  disabled={saving}
                  onClick={() => submit(s)}
                  className="inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors hover:border-ring/40 hover:bg-accent"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
