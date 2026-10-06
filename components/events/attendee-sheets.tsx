'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber, plural } from '@/lib/format'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { MoneyInput, type Currency } from '@/components/finance/money-input'
import { todayISO } from '@/lib/format'
import { readPref, writePref } from '@/components/finance/types'
import { ChipGroup, CheckMark } from '@/components/events/parts'
import {
  ATTENDANCE,
  EVENT_DEFAULT_RATE,
  LAST_RATE,
  attendeeName,
  num,
  type Attendee,
  type EventParticipant,
} from '@/components/events/types'

const PARTICIPANT_STATUS: Record<string, string> = { completed: 'завершил', archived: 'в архиве', paused: 'на паузе', inactive: 'неактивен' }

const statusOptions = ATTENDANCE.map(a => ({ value: a.value, label: a.label }))

/** Same conversion the page always used: TJS amounts are stored in USD at the given rate. */
function convert(amount: string, currency: Currency, rateStr: string) {
  const originalAmount = Number(amount || 0)
  let rate = 1
  let finalAmountUSD = originalAmount
  if (currency === 'TJS') {
    rate = Number(rateStr)
    if (!rate || rate <= 0) return null
    finalAmountUSD = originalAmount / rate
  }
  return { finalAmountUSD, originalAmount, rate }
}

function submitOnModEnter(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      fn()
    }
  }
}

// ---------------------------------------------------------------------------
// Add: participants of programs (batch) or a guest

export function AddAttendeesSheet({
  open,
  onOpenChange,
  eventId,
  participants,
  existingIds,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  eventId: string
  participants: EventParticipant[]
  existingIds: Set<string>
  onSaved: () => void
}) {
  const [mode, setMode] = React.useState<'participant' | 'guest'>('participant')
  const [query, setQuery] = React.useState('')
  const [programId, setProgramId] = React.useState('all')
  const [selected, setSelected] = React.useState<string[]>([])
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('TJS')
  const [rate, setRate] = React.useState(EVENT_DEFAULT_RATE)
  const [status, setStatus] = React.useState('registered')
  const [notes, setNotes] = React.useState('')
  const [guestName, setGuestName] = React.useState('')
  const [guestContact, setGuestContact] = React.useState('')
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setMode('participant')
    setQuery('')
    setProgramId('all')
    setSelected([])
    setAmount('')
    setCurrency('TJS')
    setRate(readPref(LAST_RATE) || EVENT_DEFAULT_RATE)
    setStatus('registered')
    setNotes('')
    setGuestName('')
    setGuestContact('')
    setErrors({})
  }, [open])

  // Participants not yet on the event
  const available = React.useMemo(
    () => participants.filter(p => !existingIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [participants, existingIds]
  )
  const programs = React.useMemo(() => {
    const map = new Map<string, string>()
    participants.forEach(p => p.program?.id && map.set(p.program.id, p.program.name))
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [participants])

  const q = query.trim().toLowerCase()
  const filtered = available.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(q) || (p.email && p.email.toLowerCase().includes(q)) || (p.phone && p.phone.toLowerCase().includes(q))
    const matchesProgram = programId === 'all' || p.program_id === programId
    return matchesSearch && matchesProgram
  })

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.includes(p.id))
  const someFilteredSelected = filtered.some(p => selected.includes(p.id))
  const toggleAll = () => {
    if (allFilteredSelected) {
      const ids = new Set(filtered.map(p => p.id))
      setSelected(s => s.filter(id => !ids.has(id)))
    } else {
      setSelected(s => Array.from(new Set([...s, ...filtered.map(p => p.id)])))
    }
  }
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  const post = async (body: unknown) => {
    const res = await fetch(`/api/offline-events/${eventId}/attendees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await res.json()
    if (result.error) throw new Error(result.error)
  }

  const submitBatch = async () => {
    if (selected.length === 0) return
    const money = convert(amount, currency, rate)
    if (!money) {
      setErrors({ amount: 'Введите корректный курс обмена' })
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const attendeesToInsert = selected.map(participantId => ({
        attendee_type: 'participant',
        participant_id: participantId,
        payment_received: money.finalAmountUSD,
        original_amount: money.originalAmount,
        currency,
        exchange_rate: money.rate,
        attendance_status: status || 'registered',
        payment_notes: notes || '',
      }))
      await post({ attendees: attendeesToInsert })
      if (currency === 'TJS') writePref(LAST_RATE, rate)
      toast.success(
        `${selected.length === 1 ? 'Добавлен' : 'Добавлено'} ${formatNumber(selected.length)} ${plural(selected.length, ['участник', 'участника', 'участников'])}`
      )
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось добавить участников', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const submitGuest = async (addAnother: boolean) => {
    const errs: Record<string, string> = {}
    if (!guestName.trim()) errs.guestName = 'Укажите имя гостя'
    const money = convert(amount, currency, rate)
    if (!money) errs.amount = 'Введите корректный курс обмена'
    setErrors(errs)
    if (Object.keys(errs).length || !money) return

    setSaving(true)
    try {
      await post({
        attendee_type: 'guest',
        guest_name: guestName.trim(),
        guest_phone: guestContact,
        attendance_status: status,
        payment_notes: notes,
        payment_received: money.finalAmountUSD,
        original_amount: money.originalAmount,
        currency,
        exchange_rate: money.rate,
      })
      if (currency === 'TJS') writePref(LAST_RATE, rate)
      toast.success('Гость добавлен', {
        description: money.originalAmount ? `${guestName.trim()} · ${formatMoney(money.originalAmount, currency)}` : guestName.trim(),
      })
      onSaved()
      if (addAnother) {
        setGuestName('')
        setGuestContact('')
        setNotes('')
      } else {
        onOpenChange(false)
      }
    } catch (err: any) {
      toast.error('Не удалось добавить гостя', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const submit = () => (mode === 'participant' ? submitBatch() : submitGuest(false))

  const paymentFields = (
    <>
      <Field
        label={mode === 'participant' ? 'Оплата с каждого' : 'Оплата'}
        htmlFor="att-amount"
        hint={errors.amount ? <span className="text-destructive">{errors.amount}</span> : mode === 'participant' ? 'Оставьте пустым, если участие бесплатное' : undefined}
      >
        <MoneyInput
          id="att-amount"
          amount={amount}
          onAmountChange={setAmount}
          currency={currency}
          onCurrencyChange={setCurrency}
          rate={rate}
          onRateChange={setRate}
          rateDate={todayISO()}
          invalid={!!errors.amount}
        />
      </Field>
      <Field label="Статус">
        <ChipGroup aria-label="Статус присутствия" value={status} onChange={setStatus} options={statusOptions} />
      </Field>
      <Field label="Комментарий к платежу" htmlFor="att-notes">
        <Input id="att-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Например: наличные, перевод" />
      </Field>
    </>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[520px]">
        <form
          className="flex h-full flex-col"
          onSubmit={e => {
            e.preventDefault()
            submit()
          }}
          onKeyDown={submitOnModEnter(submit)}
        >
          <SheetHeader>
            <SheetTitle>Добавить на событие</SheetTitle>
            <SheetDescription>Участники программ или гости со стороны</SheetDescription>
            <Segmented
              className="mt-3 self-start"
              aria-label="Кого добавить"
              value={mode}
              onChange={v => {
                setMode(v)
                setErrors({})
              }}
              options={[
                { value: 'participant', label: 'Участники программ', count: available.length },
                { value: 'guest', label: 'Гость' },
              ]}
            />
          </SheetHeader>

          <SheetBody>
            {mode === 'participant' ? (
              <FieldGroup>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <SearchInput value={query} onChange={setQuery} placeholder="Имя, телефон или email" className="flex-1 sm:w-auto" />
                    <Select value={programId} onValueChange={setProgramId}>
                      <SelectTrigger size="sm" className="w-40 shrink-0" aria-label="Программа">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="all">Все программы</SelectItem>
                        {programs.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="overflow-hidden rounded-lg border">
                    <button
                      type="button"
                      onClick={toggleAll}
                      disabled={filtered.length === 0}
                      className="flex w-full items-center gap-3 border-b bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/70 disabled:opacity-60"
                    >
                      <CheckMark checked={allFilteredSelected} indeterminate={someFilteredSelected} />
                      <span className="font-medium text-foreground">
                        {allFilteredSelected ? 'Снять выбор' : 'Выбрать всех'} ({formatNumber(filtered.length)})
                      </span>
                      <span className="ml-auto">
                        Выбрано: <span className="num font-semibold text-foreground">{formatNumber(selected.length)}</span>
                      </span>
                    </button>
                    <div className="max-h-72 overflow-y-auto">
                      {filtered.length === 0 ? (
                        <EmptyState
                          icon={Users}
                          className="py-8"
                          title={available.length ? 'Никого не найдено' : 'Все участники уже добавлены'}
                          description={available.length ? 'Измените поиск или программу' : undefined}
                        />
                      ) : (
                        filtered.map(p => {
                          const isSelected = selected.includes(p.id)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              role="checkbox"
                              aria-checked={isSelected}
                              onClick={() => toggle(p.id)}
                              className={cn(
                                'flex w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-0',
                                isSelected ? 'bg-primary-soft/50 hover:bg-primary-soft/70' : 'hover:bg-accent'
                              )}
                            >
                              <CheckMark checked={isSelected} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{p.name}</span>
                                {(p.phone || p.email) && (
                                  <span className="block truncate text-xs text-muted-foreground">{[p.phone, p.email].filter(Boolean).join(' · ')}</span>
                                )}
                              </span>
                              <span className="flex shrink-0 flex-col items-end gap-0.5">
                                {p.program?.name && <span className="max-w-36 truncate text-xs text-muted-foreground">{p.program.name}</span>}
                                {p.status && p.status !== 'active' && (
                                  <span className="text-[11px] text-muted-foreground">{PARTICIPANT_STATUS[p.status] ?? p.status}</span>
                                )}
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
                {paymentFields}
              </FieldGroup>
            ) : (
              <FieldGroup>
                <Field label="Имя гостя" htmlFor="guest-name" required hint={errors.guestName && <span className="text-destructive">{errors.guestName}</span>}>
                  <Input
                    id="guest-name"
                    autoFocus
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder="Фамилия и имя"
                    aria-invalid={!!errors.guestName || undefined}
                  />
                </Field>
                <Field label="Телефон или email" htmlFor="guest-contact">
                  <Input id="guest-contact" value={guestContact} onChange={e => setGuestContact(e.target.value)} placeholder="+992 … или name@mail.com" />
                </Field>
                {paymentFields}
              </FieldGroup>
            )}
          </SheetBody>

          <SheetFooter>
            {mode === 'participant' ? (
              <Button type="submit" disabled={saving || selected.length === 0}>
                {saving
                  ? 'Добавление…'
                  : selected.length
                    ? `Добавить ${formatNumber(selected.length)} ${plural(selected.length, ['участника', 'участников', 'участников'])}`
                    : 'Выберите участников'}
              </Button>
            ) : (
              <>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Сохранение…' : 'Добавить гостя'}
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => submitGuest(true)}>
                  Сохранить и ещё
                </Button>
              </>
            )}
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Edit one attendee: payment, status, guest details

export function EditAttendeeSheet({
  open,
  onOpenChange,
  eventId,
  attendee,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  eventId: string
  attendee: Attendee | null
  onSaved: () => void
}) {
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('TJS')
  const [rate, setRate] = React.useState(EVENT_DEFAULT_RATE)
  const [status, setStatus] = React.useState('registered')
  const [notes, setNotes] = React.useState('')
  const [guestName, setGuestName] = React.useState('')
  const [guestContact, setGuestContact] = React.useState('')
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  const isGuest = attendee?.attendee_type === 'guest'

  React.useEffect(() => {
    if (!open || !attendee) return
    const cur: Currency = attendee.currency === 'TJS' ? 'TJS' : 'USD'
    const value = cur === 'TJS' ? num(attendee.original_amount) : num(attendee.payment_received)
    setCurrency(cur)
    setAmount(value ? String(Math.round(value * 100) / 100) : '')
    setRate(String(num(attendee.exchange_rate) > 1 ? attendee.exchange_rate : readPref(LAST_RATE) || EVENT_DEFAULT_RATE))
    setStatus(attendee.attendance_status || 'registered')
    setNotes(attendee.payment_notes || '')
    setGuestName(attendee.guest_name || '')
    setGuestContact(attendee.guest_phone || attendee.guest_email || '')
    setErrors({})
  }, [open, attendee])

  const submit = async () => {
    if (!attendee) return
    const errs: Record<string, string> = {}
    if (isGuest && !guestName.trim()) errs.guestName = 'Укажите имя гостя'
    const money = convert(amount, currency, rate)
    if (!money) errs.amount = 'Введите корректный курс обмена'
    setErrors(errs)
    if (Object.keys(errs).length || !money) return

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        payment_received: money.finalAmountUSD,
        original_amount: money.originalAmount,
        currency,
        exchange_rate: money.rate,
        attendance_status: status,
        payment_notes: notes || null,
      }
      if (isGuest) {
        body.guest_name = guestName.trim()
        body.guest_phone = guestContact || null
      }
      const res = await fetch(`/api/offline-events/${eventId}/attendees/${attendee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      if (currency === 'TJS') writePref(LAST_RATE, rate)
      toast.success('Изменения сохранены', { description: isGuest ? guestName.trim() : attendeeName(attendee) })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось сохранить', { description: err.message })
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
          onKeyDown={submitOnModEnter(submit)}
        >
          <SheetHeader>
            <SheetTitle>{attendee ? (isGuest ? 'Гость' : attendeeName(attendee)) : 'Участник'}</SheetTitle>
            <SheetDescription>{isGuest ? 'Данные гостя, оплата и присутствие' : 'Участник программы · оплата и присутствие'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              {isGuest && (
                <>
                  <Field label="Имя гостя" htmlFor="edit-guest-name" required hint={errors.guestName && <span className="text-destructive">{errors.guestName}</span>}>
                    <Input
                      id="edit-guest-name"
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      aria-invalid={!!errors.guestName || undefined}
                    />
                  </Field>
                  <Field label="Телефон или email" htmlFor="edit-guest-contact">
                    <Input id="edit-guest-contact" value={guestContact} onChange={e => setGuestContact(e.target.value)} />
                  </Field>
                </>
              )}
              <Field label="Статус">
                <ChipGroup aria-label="Статус присутствия" value={status} onChange={setStatus} options={statusOptions} />
              </Field>
              <Field label="Оплата" htmlFor="edit-att-amount" hint={errors.amount && <span className="text-destructive">{errors.amount}</span>}>
                <MoneyInput
                  autoFocus
                  id="edit-att-amount"
                  amount={amount}
                  onAmountChange={setAmount}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  rate={rate}
                  onRateChange={setRate}
                  rateDate={todayISO()}
                  rateLocked={attendee?.currency === 'TJS' && num(attendee?.exchange_rate) > 1}
                  invalid={!!errors.amount}
                />
              </Field>
              <Field label="Комментарий к платежу" htmlFor="edit-att-notes">
                <Input id="edit-att-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Например: наличные, перевод" />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
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
