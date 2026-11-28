'use client'

import * as XLSX from 'xlsx'
import { formatDate } from '@/lib/format'
import { funnelOf } from '@/lib/event-funnel'
import {
  EVENT_STATUS,
  attendanceOf,
  attendeeContact,
  attendeeName,
  categoryLabel,
  num,
  type Attendee,
  type EventExpense,
  type FinancialSummary,
  type OfflineEvent,
} from '@/components/events/types'

/** Client-side XLSX with the event summary, attendees and expenses. Read-only. */
export function exportEventToExcel(event: OfflineEvent, attendees: Attendee[], expenses: EventExpense[], summary: FinancialSummary | null) {
  const wb = XLSX.utils.book_new()

  const summaryRows: (string | number)[][] = [
    [event.name],
    [`${formatDate(event.event_date, 'long')}${event.location ? ` · ${event.location}` : ''}`],
    [`Статус: ${EVENT_STATUS[event.status]?.label ?? event.status}`],
    [],
    ['Показатель', 'Значение, USD'],
    ['Доход (факт)', num(summary?.total_income ?? event.total_income)],
    ['План (цена участия, кроме «Не поедет»)', num(summary?.plan?.planned)],
    ['Ещё ожидаем по плану', num(summary?.plan?.expected_left)],
    ['  от гостей', num(summary?.income_breakdown?.guest_payments)],
    ['  от участников программ', num(summary?.income_breakdown?.other_income)],
    ['Расходы', num(summary?.total_expenses ?? event.total_expenses)],
    ['Баланс', num(summary?.balance ?? event.balance)],
    ['ROI, %', Number(num(summary?.roi).toFixed(1))],
    ['Участников в списке', attendees.length],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Итоги')

  const attendeeRows: (string | number)[][] = [
    ['Имя', 'Тип', 'Контакт', 'Этап', 'Перезвонить', 'Последний комментарий', 'Присутствие', 'Цена (план), USD', 'Оплачено (факт), USD', 'Оплачено в валюте', 'Валюта', 'Комментарий к платежу'],
    ...attendees.map(a => [
      attendeeName(a),
      a.attendee_type === 'guest' ? 'Гость' : 'Участник',
      attendeeContact(a),
      funnelOf(a.funnel_stage).label,
      a.next_contact_on ? formatDate(a.next_contact_on) : '',
      a.last_comment ? `${formatDate(a.last_comment.created_at)}: ${a.last_comment.body}` : '',
      attendanceOf(a.attendance_status).label,
      Math.round(num(a.price) * 100) / 100,
      Math.round(num(a.payment_received) * 100) / 100,
      num(a.original_amount),
      a.currency || 'USD',
      a.payment_notes || '',
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attendeeRows), 'Участники')

  const expenseRows: (string | number)[][] = [
    ['Дата', 'Название', 'Категория', 'Сумма, USD', 'Сумма в валюте', 'Валюта', 'Комментарий'],
    ...expenses.map(e => [
      formatDate(e.expense_date),
      e.name,
      categoryLabel(e.category),
      Math.round(num(e.amount) * 100) / 100,
      num(e.original_amount),
      e.currency || 'USD',
      e.description || '',
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseRows), 'Расходы')

  const safe = event.name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'event'
  XLSX.writeFile(wb, `${safe} ${(event.event_date || '').slice(0, 10)}.xlsx`)
}
