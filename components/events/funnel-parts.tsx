'use client'

import * as React from 'react'
import { MessageSquare, Phone, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Panel } from '@/components/erp/page-header'
import { Initials } from '@/components/events/parts'
import { funnelDot } from '@/components/events/funnel-strip'
import { commentTime } from '@/components/events/attendee-comments'
import { FUNNEL, contactDue, funnelOf, type FunnelStage, type TeamRow } from '@/lib/event-funnel'
import { attendeeContact, attendeeName, telHref, type Attendee } from '@/components/events/types'

/**
 * Pieces of an attendee row shared by the event page (finance) and «Обзвон» (employees):
 * who the person is and how to call them, their stage with who set it, the callback date.
 */

export function PersonCell({ a }: { a: Attendee }) {
  const name = attendeeName(a)
  const isGuest = a.attendee_type === 'guest'
  const contact = attendeeContact(a)
  const tel = telHref(contact)
  return (
    <div className="flex items-start gap-2.5">
      <Initials name={name} guest={isGuest} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{name}</span>
          {isGuest && (
            <Badge variant="info" className="shrink-0 px-1 py-0 text-[11px]">
              гость
            </Badge>
          )}
        </div>
        {contact && (
          <div className="truncate text-xs text-muted-foreground">
            {tel ? (
              <a href={tel} onClick={e => e.stopPropagation()} className="num inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <Phone className="size-3" />
                {contact}
              </a>
            ) : (
              <span className="num">{contact}</span>
            )}
          </div>
        )}
        {a.last_comment && (
          <div
            className="mt-0.5 flex items-start gap-1 text-xs text-foreground/75"
            title={`${a.last_comment.author_name ? `${a.last_comment.author_name}, ` : ''}${commentTime(a.last_comment.created_at)}: ${a.last_comment.body}`}
          >
            <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span className="line-clamp-2">
              {a.last_comment.body}
              {(a.comments_count ?? 0) > 1 && <span className="text-muted-foreground"> · ещё {formatNumber((a.comments_count ?? 1) - 1)}</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** «Анвар · 20.11»: who put the person on the current stage. */
export function MarkedBy({ a, className }: { a: Attendee; className?: string }) {
  const m = a.last_mark
  if (!m) return null
  const d = new Date(m.created_at)
  const short = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
  return (
    <div className={cn('truncate pl-0.5 text-[11px] leading-tight text-muted-foreground', className)} title={`Отметил(а) ${m.author_name || 'без имени'}, ${commentTime(m.created_at)}`}>
      {m.author_name || 'Без имени'}
      {short && <span className="num"> · {short}</span>}
    </div>
  )
}

export function StageCell({ a, onStage }: { a: Attendee; onStage: (a: Attendee, stage: FunnelStage) => void }) {
  const stage = funnelOf(a.funnel_stage)
  const name = attendeeName(a)
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Select value={stage.value} onValueChange={v => onStage(a, v as FunnelStage)}>
        <SelectTrigger
          size="sm"
          aria-label={`Этап: ${name}`}
          className="-ml-2 h-7 gap-1 border-transparent bg-transparent px-2 shadow-none hover:border-input dark:bg-transparent [&>svg]:opacity-0 group-hover:[&>svg]:opacity-60"
        >
          <Badge variant={stage.variant}>{stage.label}</Badge>
        </SelectTrigger>
        <SelectContent>
          {FUNNEL.map(o => (
            <SelectItem key={o.value} value={o.value}>
              <span className={cn('size-2 rounded-full', funnelDot[o.variant])} />
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <MarkedBy a={a} />
    </div>
  )
}

export function CallbackCell({ a, today }: { a: Attendee; today: string }) {
  if (!a.next_contact_on) return <span className="text-muted-foreground/70">—</span>
  const due = contactDue(a.next_contact_on, today)
  return (
    <span
      className={cn(
        'num text-sm',
        due === 'overdue' && 'font-medium text-destructive',
        due === 'today' && 'font-medium text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
        due === 'later' && 'text-muted-foreground'
      )}
    >
      {due === 'today' ? 'Сегодня' : formatDate(a.next_contact_on)}
    </span>
  )
}

/** For the administrator: who did the calling on this event and with what result. */
export function TeamPanel({ team }: { team: TeamRow[] | undefined }) {
  if (!team?.length) return null
  return (
    <Panel className="mt-3">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <UsersRound className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Кто вёл обзвон</h3>
        <span className="text-xs text-muted-foreground">по отметкам и комментариям</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Сотрудник</TableHead>
            <TableHead className="text-right">Людей</TableHead>
            <TableHead className="text-right">Отметок</TableHead>
            <TableHead className="text-right max-sm:hidden">Комментариев</TableHead>
            <TableHead className="text-right">Поедет</TableHead>
            <TableHead className="text-right">Оплатил</TableHead>
            <TableHead className="text-right max-sm:hidden">Не поедет</TableHead>
            <TableHead className="text-right max-md:hidden">Последнее</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {team.map(t => (
            <TableRow key={t.name} className="hover:bg-transparent">
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell className="num text-right">{formatNumber(t.people)}</TableCell>
              <TableCell className="num text-right">{formatNumber(t.marks)}</TableCell>
              <TableCell className="num text-right max-sm:hidden">{formatNumber(t.notes)}</TableCell>
              <TableCell className="num text-right">{t.going ? formatNumber(t.going) : <span className="text-muted-foreground/70">—</span>}</TableCell>
              <TableCell className={cn('num text-right', t.paid > 0 && 'font-medium text-success')}>
                {t.paid ? formatNumber(t.paid) : <span className="text-muted-foreground/70">—</span>}
              </TableCell>
              <TableCell className="num text-right max-sm:hidden">{t.declined ? formatNumber(t.declined) : <span className="text-muted-foreground/70">—</span>}</TableCell>
              <TableCell className="num text-right text-muted-foreground max-md:hidden">{t.last_at ? commentTime(t.last_at) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  )
}
