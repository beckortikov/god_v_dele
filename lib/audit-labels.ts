/**
 * Human labels and small pure helpers for the audit log (журнал изменений).
 * Safe to import from both API routes and client components: no DB access here.
 */
import { roundMoney, roundRate } from '@/lib/money'
import { MONTHS_RU, formatMoney } from '@/lib/format'

export type AuditActionName = 'create' | 'update' | 'delete' | 'restore'

export interface AuditEntry {
  id: string
  created_at: string
  table_name: string
  record_id: string | null
  action: AuditActionName
  actor_id: string | null
  actor_name: string | null
  summary: string | null
  before: any
  after: any
  restored_at: string | null
  restored_by: string | null
}

/** Section names shown in the journal filter and table. */
export const TABLE_LABELS: Record<string, string> = {
  monthly_payments: 'Поступления',
  payment_transactions: 'Оплаты участников',
  expenses: 'Расходы',
  accounts: 'Счета',
  account_transfers: 'Переводы между счетами',
  participants: 'Участники',
  programs: 'Программы',
  monthly_forecasts: 'Прогнозы',
  offline_events: 'Мероприятия',
  event_attendees: 'Гости мероприятий',
  employees: 'Сотрудники',
  employee_schedules: 'График',
  payroll: 'Зарплата',
  leave_requests: 'Заявки на отпуск',
  tasks: 'Задачи',
  time_logs: 'Учёт времени',
  app_users: 'Пользователи',
  life_wheel_entries: 'Колесо жизни',
  life_balance_entries: 'Баланс жизни',
  business_wheel_entries: 'Колесо бизнеса',
}

export const tableLabel = (t: string) => TABLE_LABELS[t] ?? t

export const ACTION_LABELS: Record<AuditActionName, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
  restore: 'Восстановление',
}

/**
 * Tables whose deleted rows can be re-inserted from the журнал. app_users is
 * deliberately missing: its rows are logged without the password.
 */
export const RESTORABLE_TABLES = new Set([
  'monthly_payments',
  'payment_transactions',
  'expenses',
  'accounts',
  'account_transfers',
  'participants',
  'programs',
  'monthly_forecasts',
  'offline_events',
  'event_attendees',
  'employees',
  'employee_schedules',
  'payroll',
  'leave_requests',
  'tasks',
  'life_wheel_entries',
  'life_balance_entries',
  'business_wheel_entries',
])

// ---------------------------------------------------------------------------
// Money

/** Columns that hold money. Rounded to cents on write. */
export const MONEY_FIELDS = new Set([
  'amount',
  'fact_amount',
  'plan_amount',
  'amount_usd',
  'original_amount',
  'payment_received',
  'price_per_month',
  'tariff',
  'base_salary',
  'bonus_amount',
  'deduction_amount',
  'total_amount',
  'planned_income',
  'planned_expenses',
  'optimistic_income',
  'pessimistic_income',
  'initial_balance',
  'total_income',
  'total_expenses',
  'balance',
])

/** Columns that hold exchange rates. Rounded to 4 decimals on write. */
export const RATE_FIELDS = new Set(['exchange_rate'])

function roundValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return value
  if (typeof value !== 'number' && typeof value !== 'string') return value
  if (!Number.isFinite(Number(value))) return value // leave invalid input for the DB to reject, as before
  if (MONEY_FIELDS.has(key)) return roundMoney(value)
  if (RATE_FIELDS.has(key)) return roundRate(value)
  return value
}

/**
 * Returns a copy of a write payload (object or array of objects) with money
 * fields rounded to cents and exchange rates to 4 decimals. Other keys,
 * null/empty values and invalid numbers are left untouched.
 */
export function roundMoneyFields<T>(payload: T): T {
  if (Array.isArray(payload)) return payload.map(p => roundMoneyFields(p)) as T
  if (!payload || typeof payload !== 'object') return payload
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) out[k] = roundValue(k, v)
  return out as T
}

/** Removes secrets before a row goes into the журнал. */
export function stripSecrets<T>(row: T): T {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  const { password: _password, ...rest } = row as Record<string, unknown>
  return rest as T
}

/** «$500» or «5 000 TJS» for a row with amount / original_amount / currency. */
export function rowMoney(row: any, usdField = 'amount'): string {
  if (!row) return ''
  if (row.currency && row.currency !== 'USD' && row.original_amount != null && row.original_amount !== '') {
    return formatMoney(row.original_amount, row.currency)
  }
  return formatMoney(row[usdField], 'USD')
}

/** «июль 2026» */
export function monthLabel(month: number | string | null | undefined, year?: number | string | null) {
  const m = Number(month)
  const name = m >= 1 && m <= 12 ? MONTHS_RU[m - 1].toLowerCase() : ''
  return [name, year].filter(Boolean).join(' ')
}

export const personName = (e?: { first_name?: string | null; last_name?: string | null } | null) =>
  e ? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() : ''

// ---------------------------------------------------------------------------
// Field labels for the diff view

export const FIELD_LABELS: Record<string, string> = {
  name: 'Название',
  title: 'Заголовок',
  description: 'Описание',
  notes: 'Комментарий',
  amount: 'Сумма, $',
  fact_amount: 'Получено, $',
  amount_usd: 'Сумма, $',
  monthly_payment_id: 'Месяц графика',
  created_by: 'Внёс',
  plan_amount: 'План, $',
  original_amount: 'Сумма в валюте',
  currency: 'Валюта',
  exchange_rate: 'Курс',
  payment_received: 'Оплачено, $',
  category: 'Категория',
  status: 'Статус',
  expense_date: 'Дата расхода',
  paid_date: 'Дата оплаты',
  payment_date: 'Дата оплаты',
  due_date: 'Срок',
  payment_month: 'Месяц',
  month_number: 'Месяц',
  month: 'Месяц',
  year: 'Год',
  participant_id: 'Участник',
  program_id: 'Программа',
  account_id: 'Счёт',
  employee_id: 'Сотрудник',
  event_id: 'Мероприятие',
  assignee_id: 'Исполнитель',
  creator_id: 'Автор',
  approved_by: 'Согласовал',
  target_participant_id: 'Участник',
  email: 'Email',
  phone: 'Телефон',
  tariff: 'Тариф, $',
  start_date: 'Дата начала',
  end_date: 'Дата окончания',
  price_per_month: 'Цена в месяц, $',
  duration_months: 'Длительность, мес.',
  first_name: 'Имя',
  last_name: 'Фамилия',
  position: 'Должность',
  department: 'Отдел',
  base_salary: 'Оклад',
  bonus_amount: 'Премия',
  deduction_amount: 'Удержания',
  total_amount: 'К выплате',
  hire_date: 'Дата найма',
  birth_date: 'Дата рождения',
  responsibilities: 'Обязанности',
  valuable_final_product: 'ЦКП',
  work_date: 'Дата',
  shift_type: 'Тип дня',
  start_time: 'Начало',
  end_time: 'Окончание',
  duration_minutes: 'Длительность, мин',
  event_date: 'Дата мероприятия',
  location: 'Место',
  total_income: 'Доход',
  total_expenses: 'Расходы',
  balance: 'Баланс',
  attendees_registered: 'Зарегистрировано',
  attendees_attended: 'Пришло',
  attendee_type: 'Тип гостя',
  guest_name: 'Имя гостя',
  guest_email: 'Email гостя',
  guest_phone: 'Телефон гостя',
  attendance_status: 'Посещение',
  payment_method: 'Способ оплаты',
  payment_notes: 'Комментарий к оплате',
  registration_date: 'Дата регистрации',
  planned_income: 'План доходов, $',
  planned_expenses: 'План расходов, $',
  optimistic_income: 'Оптимистичный доход, $',
  pessimistic_income: 'Пессимистичный доход, $',
  confidence_level: 'Уверенность',
  username: 'Логин',
  full_name: 'Имя',
  role: 'Роль',
  last_login_at: 'Последний вход',
  is_default: 'По умолчанию',
  initial_balance: 'Начальный остаток',
  reason: 'Причина',
  type: 'Тип',
  task_type: 'Тип задачи',
  result_comment: 'Результат',
  period_type: 'Период',
  period_label: 'Период',
  categories: 'Оценки',
  ideal_values: 'Идеал',
  monthly_values: 'По месяцам',
  checked_items: 'Отмечено',
  transfer_date: 'Дата перевода',
  from_account_id: 'Со счёта',
  to_account_id: 'На счёт',
  amount_from: 'Списано',
  amount_to: 'Зачислено',
  note: 'Комментарий',
  created_at: 'Создано',
  updated_at: 'Изменено',
  id: 'ID',
}

export const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f

/** Fields that are not shown in a diff (always change or are noise). */
export const IGNORED_DIFF_FIELDS = new Set(['updated_at'])

/** Technical fields shown last, in the collapsed block. */
export const TECH_FIELDS = new Set(['id', 'created_at', 'updated_at'])

const STATUS_BY_TABLE: Record<string, Record<string, string>> = {
  monthly_payments: { paid: 'Оплачен', partial: 'Частично', overdue: 'Просрочен', pending: 'Ожидается' },
  expenses: { pending: 'На согласовании', approved: 'Проведён', rejected: 'Отклонён' },
  participants: { active: 'Активен', completed: 'Завершил', archived: 'В архиве' },
  employees: { active: 'Работает', inactive: 'Неактивен', terminated: 'Уволен' },
  payroll: { pending: 'К выплате', paid: 'Выплачено', cancelled: 'Отменено' },
  offline_events: { planned: 'Запланировано', completed: 'Завершено', cancelled: 'Отменено' },
  leave_requests: { pending: 'На рассмотрении', approved: 'Одобрено', rejected: 'Отклонено' },
  tasks: { todo: 'К выполнению', in_progress: 'В работе', completed: 'Выполнена', cancelled: 'Отменена' },
  time_logs: { active: 'Идёт', completed: 'Завершён' },
}

const ENUM_LABELS: Record<string, Record<string, string>> = {
  shift_type: {
    work: 'Рабочий день',
    day_off: 'Выходной',
    vacation: 'Отпуск',
    sick_leave: 'Больничный',
    unpaid_leave: 'Отгул без сохранения',
  },
  attendance_status: {
    registered: 'Зарегистрирован',
    confirmed: 'Подтвердил',
    attended: 'Пришёл',
    cancelled: 'Отменил',
    no_show: 'Не пришёл',
  },
  attendee_type: { participant: 'Участник программы', guest: 'Гость' },
  role: {
    admin: 'Администратор',
    finance: 'Финансист',
    employee: 'Сотрудник',
    manager: 'Менеджер',
    wheels_manager: 'Менеджер колёс',
    participant: 'Участник',
  },
  task_type: { call: 'Звонок', meeting: 'Встреча', payment_reminder: 'Напоминание об оплате', other: 'Другое' },
  type: { time_off: 'Отгул', vacation: 'Отпуск', sick_leave: 'Больничный' },
  payment_method: { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', other: 'Другое' },
}

/** Human label for an enum-like value, or null when the field is not an enum. */
export function enumLabel(table: string, field: string, value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (field === 'status') return STATUS_BY_TABLE[table]?.[value] ?? null
  return ENUM_LABELS[field]?.[value] ?? null
}

/** Currency used to display a money field of a row. */
export function moneyCurrency(table: string, field: string, row: any): string {
  if (field === 'original_amount') return row?.currency || 'USD'
  if (table === 'employees' || table === 'payroll') return row?.currency || 'TJS'
  if (table === 'accounts') return row?.currency || 'USD'
  return 'USD'
}

export const SHIFT_LABELS = ENUM_LABELS.shift_type

// ---------------------------------------------------------------------------
// Diff helpers

/** Loose equality for DB values: 1000 == "1000", null == undefined, deep for JSON. */
export function sameValue(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a)
    const nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  }
  return String(a) === String(b)
}

/** Keys whose value differs between two versions of a row. */
export function changedFields(before: any, after: any): string[] {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter(k => !IGNORED_DIFF_FIELDS.has(k) && k in after && !sameValue(before[k], after[k]))
}

const shortLabel = (f: string) => {
  const l = fieldLabel(f).replace(/,\s*(\$|мин|мес\.)$/, '')
  return l.length > 1 && l[1] === l[1].toLowerCase() ? l[0].toLowerCase() + l.slice(1) : l
}

/** «: сумма, статус» — what changed, for an update summary. Empty when nothing is known. */
export function changeSuffix(before: any, after: any, max = 3): string {
  const keys = changedFields(before, after)
  if (!keys.length) return ''
  const names = [...new Set(keys.map(shortLabel))]
  const shown = names.slice(0, max).join(', ')
  return `: ${shown}${names.length > max ? ` и ещё ${names.length - max}` : ''}`
}
