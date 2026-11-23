'use client'

import * as React from 'react'
import { CalendarClock, Check, Phone, UserCheck, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger } from '@/components/ui/select'
import { attendeeContact, attendeeName, telHref, type Attendee } from '@/components/events/types'
import { FUNNEL, contactDue, type FunnelStage, type FunnelVariant } from '@/lib/event-funnel'

export interface StaffMember {
  id: string
  name: string
}

export type AttendeePatch = { funnel_stage?: FunnelStage; next_contact_on?: string | null; hunter_id?: string | null }

export function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Colours of the current step, by the stage's badge variant. */
const CURRENT: Record<FunnelVariant, string> = {
  secondary: 'bg-secondary text-foreground ring-1 ring-border',
  warning: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))] ring-1 ring-warning/40',
  default: 'bg-primary-soft text-primary-soft-foreground ring-1 ring-primary/30',
  info: 'bg-info-soft text-info ring-1 ring-info/30',
  success: 'bg-success-soft text-success ring-1 ring-success/30',
  destructive: 'bg-destructive-soft text-destructive ring-1 ring-destructive/30',
}

const MAIN = FUNNEL.filter(s => s.value !== 'declined')
const DECLINED = FUNNEL.find(s => s.value === 'declined')!

/**
 * The funnel as steps: the steps already passed are ticked, the current one is coloured,
 * one click on any step moves the person there. «Не поедет» stands apart at the end.
 */
export function StageStepper({ value, onChange, name }: { value: FunnelStage; onChange: (s: FunnelStage) => void; name: string }) {
  const idx = MAIN.findIndex(s => s.value === value)
  const declined = value === 'declined'
  const step = (s: (typeof FUNNEL)[number], i: number | null) => {
    const current = s.value === value
    const passed = !declined && i !== null && idx > i && s.value !== 'no_answer'
    return (
      <button
        key={s.value}
        type="button"
        role="radio"
        aria-checked={current}
        aria-label={`${s.label}: ${name}`}
        onClick={() => !current && onChange(s.value)}
        className={cn(
          'inline-flex h-8 min-w-0 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:px-2.5',
          current ? CURRENT[s.variant] : passed ? 'text-foreground/70 hover:bg-card' : 'text-muted-foreground hover:bg-card hover:text-foreground'
        )}
      >
        {passed && <Check className="size-3" strokeWidth={3} />}
        {s.label}
      </button>
    )
  }
  // phones: two rows of three, every step visible; wider screens: one row, «Не поедет» apart
  return (
    <div role="radiogroup" aria-label={`Этап: ${name}`} className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5 sm:flex sm:w-fit sm:items-center sm:gap-1 sm:bg-transparent sm:p-0">
      <div className="contents sm:flex sm:items-center sm:gap-0.5 sm:rounded-lg sm:bg-muted sm:p-0.5">{MAIN.map((s, i) => step(s, i))}</div>
      <div className="contents sm:flex sm:items-center sm:rounded-lg sm:bg-muted sm:p-0.5">{step(DECLINED, null)}</div>
    </div>
  )
}

/** Who calls this person; «Без хантера» clears it. */
export function HunterPicker({
  value,
  staff,
  me,
  onChange,
  compact,
}: {
  value: string | null | undefined
  staff: StaffMember[]
  me: string | null
  onChange: (id: string | null) => void
  compact?: boolean
}) {
  const current = staff.find(s => s.id === value)
  const ordered = me ? [...staff.filter(s => s.id === me), ...staff.filter(s => s.id !== me)] : staff
  return (
    <Select value={value || 'none'} onValueChange={v => onChange(v === 'none' ? null : v)}>
      <SelectTrigger
        size="sm"
        aria-label="Хантер"
        onClick={e => e.stopPropagation()}
        className={cn(
          'h-7 gap-1 px-2 text-xs shadow-none [&>svg]:size-3',
          current ? 'border-transparent bg-primary-soft text-primary-soft-foreground' : 'border-dashed text-muted-foreground',
          compact && 'max-w-36'
        )}
      >
        {current ? <UserCheck className="size-3.5 shrink-0" /> : <UserPlus className="size-3.5 shrink-0" />}
        <span className="truncate">{current ? (current.id === me ? `${current.name} (я)` : current.name) : 'Хантер'}</span>
      </SelectTrigger>
      <SelectContent align="end">
        {ordered.map(s => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
            {s.id === me && <span className="text-muted-foreground"> (я)</span>}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value="none">
          <span className="text-muted-foreground">Без хантера</span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

/** «Перезвонить 25.11» with quick picks: сегодня, завтра, через 3 дня, через неделю, own date, убрать. */
export function CallbackPicker({ value, onChange, today }: { value: string | null | undefined; onChange: (d: string | null) => void; today: string }) {
  const [open, setOpen] = React.useState(false)
  const due = contactDue(value, today)
  const set = (d: string | null) => {
    onChange(d)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30',
            !value && 'text-muted-foreground',
            due === 'overdue' && 'bg-destructive-soft font-medium text-destructive',
            due === 'today' && 'bg-warning-soft font-medium text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
            due === 'later' && 'text-foreground/80'
          )}
        >
          <CalendarClock className="size-3.5" />
          {value ? (
            <span className="num">
              {due === 'today' ? 'Перезвонить сегодня' : due === 'overdue' ? `Перезвонить: просрочено ${formatDate(value).slice(0, 5)}` : `Перезвонить ${formatDate(value).slice(0, 5)}`}
            </span>
          ) : (
            'Перезвонить…'
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2" onClick={e => e.stopPropagation()}>
        <div className="grid grid-cols-2 gap-1">
          {[
            { label: 'Сегодня', days: 0 },
            { label: 'Завтра', days: 1 },
            { label: 'Через 3 дня', days: 3 },
            { label: 'Через неделю', days: 7 },
          ].map(o => (
            <Button key={o.days} type="button" size="sm" variant="ghost" className="justify-start" onClick={() => set(addDaysISO(today, o.days))}>
              {o.label}
            </Button>
          ))}
        </div>
        <Input
          type="date"
          aria-label="Своя дата"
          className="mt-1.5"
          defaultValue={value?.slice(0, 10) ?? ''}
          min={today}
          onChange={e => e.target.value && set(e.target.value)}
        />
        {value && (
          <Button type="button" size="sm" variant="ghost" className="mt-1 w-full text-muted-foreground" onClick={() => set(null)}>
            Убрать дату
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function PhoneLink({ a, className }: { a: Attendee; className?: string }) {
  const contact = attendeeContact(a)
  const tel = telHref(contact)
  if (!contact) return <span className={cn('text-xs text-muted-foreground/70', className)}>нет телефона</span>
  return tel ? (
    <a
      href={tel}
      onClick={e => e.stopPropagation()}
      className={cn('num inline-flex h-7 items-center gap-1 rounded-md text-sm text-foreground/80 hover:text-primary hover:underline', className)}
    >
      <Phone className="size-3.5" />
      {contact}
    </a>
  ) : (
    <span className={cn('num text-sm text-muted-foreground', className)}>{contact}</span>
  )
}

/** Compact card for the board: drag it to another column to change the stage. */
export function BoardCard({
  a,
  staff,
  me,
  today,
  onOpen,
  onPatch,
}: {
  a: Attendee
  staff: StaffMember[]
  me: string | null
  today: string
  onOpen: (a: Attendee) => void
  onPatch: (a: Attendee, patch: AttendeePatch) => void
}) {
  const name = attendeeName(a)
  const due = contactDue(a.next_contact_on, today)
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/attendee', a.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(a)}
      className="cursor-grab rounded-lg border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm leading-snug font-medium">{name}</span>
        {a.attendee_type === 'guest' && (
          <Badge variant="info" className="shrink-0 px-1 py-0 text-[10px]">
            гость
          </Badge>
        )}
      </div>
      <PhoneLink a={a} className="h-6 text-xs" />
      {a.last_comment && <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{a.last_comment.body}</p>}
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <HunterPicker value={a.hunter_id} staff={staff} me={me} onChange={id => onPatch(a, { hunter_id: id })} compact />
        {a.next_contact_on && (
          <span
            className={cn(
              'num text-[11px]',
              due === 'overdue' ? 'font-medium text-destructive' : due === 'today' ? 'font-medium text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' : 'text-muted-foreground'
            )}
          >
            {due === 'today' ? 'сегодня' : formatDate(a.next_contact_on).slice(0, 5)}
          </span>
        )}
      </div>
    </div>
  )
}

