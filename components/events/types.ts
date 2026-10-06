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
  guest_name?: string
  guest_email?: string
  guest_phone?: string
  payment_received: number
  attendance_status: string
  notes?: string
  payment_notes?: string
  currency?: string
  original_amount?: number
  exchange_rate?: number
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
  { value: 'Venue', label: 'Аренда' },
  { value: 'Food', label: 'Еда' },
  { value: 'Marketing', label: 'Маркетинг' },
  { value: 'Transport', label: 'Транспорт' },
  { value: 'Other', label: 'Другое' },
]
export const categoryLabel = (v?: string) => EXPENSE_CATEGORIES.find(c => c.value === v)?.label ?? (v || 'Другое')

export const attendeeName = (a: Attendee) =>
  (a.attendee_type === 'participant' ? a.participant_name : a.guest_name) || (a.attendee_type === 'guest' ? 'Гость' : 'Участник')

/** Postgres numerics may arrive as strings. */
export const num = (v: unknown) => Number(v) || 0

export const LAST_RATE = 'last-tjs-rate'
export const EVENT_DEFAULT_RATE = '10.5'

/** «25,4%» */
export const fmtPct = (v: number) =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
