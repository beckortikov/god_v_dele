import type { FunnelStage, Mark } from '@/lib/event-funnel'

export type EventStatus = 'planned' | 'completed' | 'cancelled'

export interface OfflineEvent {
  id: string
  name: string
  description?: string
  event_date: string
  location?: string
  status: EventStatus
  total_income: number
  total_expenses: number
  balance: number
  attendees_registered: number
  attendees_attended: number
  program_id?: string
}

export interface Attendee {
  id: string
  event_id: string
  attendee_type: 'participant' | 'guest'
  participant_id?: string
  participant_name?: string
  participant_phone?: string | null
  participant_email?: string | null
  guest_name?: string
  guest_email?: string
  guest_phone?: string
  payment_received: number
  /** Planned price of participation (migration 034); payment_received is what was actually paid. */
  price?: number
  price_currency?: 'USD' | 'TJS'
  price_original?: number
  attendance_status: string
  notes?: string
  payment_notes?: string
  currency?: string
  original_amount?: number
  exchange_rate?: number
  /** Invitation funnel (migration 025); missing before it is applied. */
  funnel_stage?: FunnelStage
  next_contact_on?: string | null
  last_comment?: Mark | null
  comments_count?: number
  /** Who put the person on their current stage, and when (migration 026). */
  last_mark?: Mark | null
  /** The employee who calls this person (migration 027). */
  hunter_id?: string | null
  hunter_name?: string | null
}

export interface EventExpense {
  id: string
  event_id: string
  name: string
  amount: number
  category: string
  expense_date: string
  status: string
  currency?: string
  description?: string
  original_amount?: number
  exchange_rate?: number
  /** Who was paid and where the money came from (migration 033). */
  supplier_id?: string | null
  account_id?: string | null
  loan_id?: string | null
}

export interface EventParticipant {
  id: string
  name: string
  email?: string
  phone?: string
  status?: string
  program_id?: string
  program?: { id: string; name: string }
}

export interface FinancialSummary {
  total_income: number
  total_expenses: number
  balance: number
  roi: number
  income_breakdown: { guest_payments: number; other_income: number }
  expense_breakdown: Record<string, number>
  attendee_stats?: { total_registered: number; total_attended: number; participants: number; guests: number }
  /** Plan vs fact (migration 034): everyone except «Не поедет». */
  plan?: { planned: number; expected_left: number; priced: number; paid_count: number; paid_without_amount: number }
}

export const EVENT_STATUS: Record<EventStatus, { label: string; variant: 'info' | 'success' | 'secondary' }> = {
  planned: { label: 'Запланировано', variant: 'info' },
  completed: { label: 'Завершено', variant: 'success' },
  cancelled: { label: 'Отменено', variant: 'secondary' },
}

export const ATTENDANCE: { value: string; label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' }[] = [
  { value: 'registered', label: 'Зарегистрирован', variant: 'secondary' },
  { value: 'confirmed', label: 'Подтвердил', variant: 'info' },
  { value: 'attended', label: 'Пришёл', variant: 'success' },
  { value: 'cancelled', label: 'Отменил', variant: 'warning' },
  { value: 'no_show', label: 'Не пришёл', variant: 'destructive' },
]
export const attendanceOf = (v: string) => ATTENDANCE.find(a => a.value === v) ?? { value: v, label: v, variant: 'secondary' as const }

/** Stored values stay in English; labels are Russian. */
export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'Tour', label: 'Тур-компания' },
  { value: 'Hotel', label: 'Отель' },
  { value: 'Venue', label: 'Аренда' },
  { value: 'Food', label: 'Еда' },
  { value: 'Marketing', label: 'Маркетинг' },
  { value: 'Transport', label: 'Транспорт' },
  { value: 'Other', label: 'Другое' },
]
export const categoryLabel = (v?: string) => EXPENSE_CATEGORIES.find(c => c.value === v)?.label ?? (v || 'Другое')

export const attendeeName = (a: Attendee) =>
  (a.attendee_type === 'participant' ? a.participant_name : a.guest_name) || (a.attendee_type === 'guest' ? 'Гость' : 'Участник')

/** Phone (or, failing that, email) to reach the person: a guest's own, or the participant's card. */
export const attendeeContact = (a: Attendee) =>
  (a.attendee_type === 'guest' ? a.guest_phone || a.guest_email : a.participant_phone || a.participant_email) || ''

/** Digits and a leading + for a tel: link, or null when the contact is not a phone number. */
export function telHref(contact: string) {
  if (!contact || contact.includes('@')) return null
  const digits = contact.replace(/[^\d+]/g, '')
  return digits.replace(/\D/g, '').length >= 5 ? `tel:${digits}` : null
}

/** Postgres numerics may arrive as strings. */
export const num = (v: unknown) => Number(v) || 0

export const LAST_RATE = 'last-tjs-rate'
export const EVENT_DEFAULT_RATE = '10.5'

/** «25,4%» */
export const fmtPct = (v: number) =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

// ---------- Money: suppliers and loans (migration 033) ----------

export interface AccountLite {
  id: string
  name: string
  currency: string
  balance?: number
}

export interface EventSupplier {
  id: string
  event_id: string
  name: string
  kind: string
  contract_amount: number
  contract_currency: 'USD' | 'TJS'
  contract_original: number
  contract_rate: number
  contact?: string | null
  note?: string | null
  totals: { currency: 'USD' | 'TJS'; contract: number; paid: number; left: number; overpaid: number; paid_usd: number; left_usd: number; payments: number }
}

export interface EventRepayment {
  id: string
  loan_id: string
  amount: number
  currency: 'USD' | 'TJS'
  original_amount: number
  exchange_rate: number
  repaid_on: string
  account_id?: string | null
  note?: string | null
}

export interface EventLoan {
  id: string
  event_id: string
  source: 'account' | 'person'
  account_id?: string | null
  lender_name?: string | null
  amount: number
  currency: 'USD' | 'TJS'
  original_amount: number
  exchange_rate: number
  received_on: string
  due_on?: string | null
  note?: string | null
  repayments: EventRepayment[]
  totals: { currency: 'USD' | 'TJS'; taken: number; repaid: number; owed: number; owed_usd: number; spent_usd: number; unspent_usd: number; overdue: boolean; closed: boolean }
}

export interface EventMoney {
  suppliers: EventSupplier[]
  loans: EventLoan[]
  totals: { contracts_usd: number; suppliers_paid_usd: number; suppliers_left_usd: number; loans_taken_usd: number; loans_owed_usd: number; loans_overdue: number }
}
