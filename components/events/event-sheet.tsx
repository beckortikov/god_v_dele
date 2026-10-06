'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import { formatDate, todayISO } from '@/lib/format'
import { EVENT_STATUS, type EventStatus, type OfflineEvent } from '@/components/events/types'

interface FormState {
  name: string
  description: string
  event_date: string
  location: string
  status: EventStatus
}

const empty = (): FormState => ({ name: '', description: '', event_date: todayISO(), location: '', status: 'planned' })

/** Create or edit an offline event. */
export function EventSheet({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: OfflineEvent | null
  onSaved: (id?: string) => void
}) {
  const [form, setForm] = React.useState<FormState>(empty)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const isEdit = !!editing

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(
      editing
        ? {
            name: editing.name || '',
            description: editing.description || '',
            event_date: (editing.event_date || '').slice(0, 10),
            location: editing.location || '',
            status: editing.status,
          }
        : empty()
    )
  }, [open, editing])

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Укажите название'
    if (!form.event_date) errs.event_date = 'Укажите дату'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const formData = {
        name: form.name.trim(),
        description: form.description,
        event_date: form.event_date,
        location: form.location,
      }
      const res = isEdit
        ? await fetch(`/api/offline-events/${editing!.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...formData, status: form.status }),
          })
        : await fetch('/api/offline-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...formData, status: 'planned' }),
          })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      toast.success(isEdit ? 'Событие обновлено' : 'Событие создано', {
        description: `${formData.name} · ${formatDate(formData.event_date, 'long')}`,
      })
      onOpenChange(false)
      onSaved(Array.isArray(result.data) ? result.data[0]?.id : undefined)
    } catch (err: any) {
      toast.error(isEdit ? 'Не удалось сохранить событие' : 'Не удалось создать событие', { description: err.message })
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
            <SheetTitle>{isEdit ? 'Редактирование события' : 'Новое событие'}</SheetTitle>
            <SheetDescription>{isEdit ? 'Название, дата, место и статус' : 'Участников и расходы добавите на странице события'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Название" htmlFor="ev-name" required hint={errors.name && <span className="text-destructive">{errors.name}</span>}>
                <Input
                  id="ev-name"
                  autoFocus={!isEdit}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Например: разбор группы в Ташкенте"
                  aria-invalid={!!errors.name || undefined}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Дата" htmlFor="ev-date" required hint={errors.event_date && <span className="text-destructive">{errors.event_date}</span>}>
                  <Input
                    id="ev-date"
                    type="date"
                    value={form.event_date}
                    onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                    aria-invalid={!!errors.event_date || undefined}
                  />
                </Field>
                <Field label="Место" htmlFor="ev-location">
                  <Input
                    id="ev-location"
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="Город или адрес"
                  />
                </Field>
              </div>
              {isEdit && (
                <Field label="Статус">
                  <Segmented
                    aria-label="Статус события"
                    value={form.status}
                    onChange={v => setForm(f => ({ ...f, status: v }))}
                    options={(Object.keys(EVENT_STATUS) as EventStatus[]).map(k => ({ value: k, label: EVENT_STATUS[k].label }))}
                  />
                </Field>
              )}
              <Field label="Описание" htmlFor="ev-desc">
                <Textarea
                  id="ev-desc"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Необязательно"
                  className="min-h-20 resize-none"
                />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать событие'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Отмена
            </Button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
