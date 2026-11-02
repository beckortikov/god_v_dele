/**
 * Operational plan of a participant: vision → directions → micro-goals → actions. Each action has a result
 * indicator, a deadline, owners, a priority and «цена слова» (the sum the participant gives up when the deadline
 * passes without a result: an «отмазка»). Pure: types, input validation, states and totals for the API and screens.
 */
import { plural } from '@/lib/format'
import { addDays, daysBetween } from '@/lib/sprints'

export type Priority = 'A' | 'B' | 'C'
export const PRIORITIES: Priority[] = ['A', 'B', 'C']

export interface OpPlan {
  id: string
  participant_id: string
  vision: string | null
  vision_date: string | null
  created_at?: string
  updated_at?: string
}

export interface OpDirection {
  id: string
  plan_id: string
  title: string
  position: number
}

export interface OpGoal {
  id: string
  plan_id: string
  direction_id: string
  title: string
  position: number
}

export interface OpAction {
  id: string
  plan_id: string
  goal_id: string
  title: string
  indicator: string | null
  due_date: string | null
  owners: string[]
  priority: Priority
  price: number
  status: 'open' | 'done'
  result_note: string | null
  result_link: string | null
  done_at: string | null
  position: number
  created_at?: string
}

export interface OpExcuse {
  id: string
  plan_id: string
  action_id: string
  reason: string
  price: number
  missed_due: string | null
  new_due: string | null
  created_at: string
}

export interface MyPlanData {
  plan: OpPlan | null
  directions: OpDirection[]
  goals: OpGoal[]
  actions: OpAction[]
  excuses: OpExcuse[]
}

export const EMPTY_PLAN: MyPlanData = { plan: null, directions: [], goals: [], actions: [], excuses: [] }

/**
 * What the participant sees on an action:
 * done — сделано; waiting — срок прошёл, итога нет (нужно выбрать «Сделано» или «Отмазка»);
 * excuse — была отмазка, идёт новый срок; work — срок впереди или не задан.
 */
export type ActionState = 'done' | 'waiting' | 'excuse' | 'work'

export const STATE_META: Record<ActionState, { label: string; cls: string }> = {
  done: { label: 'Сделано', cls: 'bg-success-soft text-success' },
  waiting: { label: 'Ждёт итога', cls: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' },
  excuse: { label: 'Отмазка', cls: 'bg-destructive-soft text-destructive' },
  work: { label: 'В работе', cls: 'bg-muted text-muted-foreground' },
}

export function actionState(a: Pick<OpAction, 'id' | 'status' | 'due_date'>, excuses: Pick<OpExcuse, 'action_id'>[], today: string): ActionState {
  if (a.status === 'done') return 'done'
  if (a.due_date && a.due_date < today) return 'waiting'
  if (excuses.some(e => e.action_id === a.id)) return 'excuse'
  return 'work'
}

export interface PlanSummary {
  total: number
  done: number
  work: number
  waiting: number
  /** Open actions that already had an excuse. */
  excuse: number
  /** Excuses recorded in all: every broken word counts. */
  excuses: number
  /** Цена слова given up through excuses. */
  paid: number
  /** Цена слова of the actions still open. */
  atStake: number
  /** Open actions with a deadline in the next 7 days (today included). */
  thisWeek: number
}

export function planSummary(data: Pick<MyPlanData, 'actions' | 'excuses'>, today: string): PlanSummary {
  const s: PlanSummary = { total: data.actions.length, done: 0, work: 0, waiting: 0, excuse: 0, excuses: data.excuses.length, paid: 0, atStake: 0, thisWeek: 0 }
  const weekEnd = addDays(today, 6)
  for (const a of data.actions) {
    s[actionState(a, data.excuses, today)]++
    if (a.status !== 'done') {
      s.atStake += Number(a.price) || 0
      if (a.due_date && a.due_date >= today && a.due_date <= weekEnd) s.thisWeek++
    }
  }
  s.paid = data.excuses.reduce((sum, e) => sum + (Number(e.price) || 0), 0)
  return s
}

/** Open actions by deadline: overdue first, then the nearest; actions without a deadline last. */
export function byDeadline<T extends Pick<OpAction, 'due_date' | 'status'>>(actions: T[]): T[] {
  return actions
    .filter(a => a.status !== 'done')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
}

/** «через 3 дня», «сегодня», «просрочено на 2 дня» for a deadline. */
export function dueHint(due: string | null, today: string) {
  if (!due) return 'без срока'
  const n = daysBetween(today, due)
  if (n < 0) return `срок был ${-n} ${plural(-n, ['день', 'дня', 'дней'])} назад`
  if (n === 0) return 'сегодня'
  if (n === 1) return 'завтра'
  return `через ${n} ${plural(n, ['день', 'дня', 'дней'])}`
}

// ---------- input ----------

export class PlanInputError extends Error {}

const MAX_TITLE = 300
const MAX_TEXT = 2000
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function text(v: unknown, field: string, max: number, required: boolean): string | null {
  if (v == null || v === '') {
    if (required) throw new PlanInputError(`${field}: заполните`)
    return null
  }
  if (typeof v !== 'string') throw new PlanInputError(`${field}: нужен текст`)
  const s = v.trim()
  if (!s) {
    if (required) throw new PlanInputError(`${field}: заполните`)
    return null
  }
  if (s.length > max) throw new PlanInputError(`${field}: не длиннее ${max} символов`)
  return s
}

function date(v: unknown, field: string): string | null {
  if (v == null || v === '') return null
  if (!isIsoDate(v)) throw new PlanInputError(`${field}: дата в формате ГГГГ-ММ-ДД`)
  return v
}

export function parseTitle(v: unknown, field = 'Название') {
  return text(v, field, MAX_TITLE, true) as string
}

export function parseVision(body: unknown): { vision: string | null; vision_date: string | null } {
  const b = (body ?? {}) as Record<string, unknown>
  return { vision: text(b.vision, 'Видение', MAX_TEXT, false), vision_date: date(b.vision_date, 'Срок видения') }
}

export type ActionInput = Pick<OpAction, 'title' | 'indicator' | 'due_date' | 'owners' | 'priority' | 'price'>

function owners(v: unknown): string[] {
  if (v == null) return []
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null
  if (!list) throw new PlanInputError('Ответственные: нужен список имён')
  const names = list.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
  if (names.some(n => n.length > 80)) throw new PlanInputError('Ответственные: имя не длиннее 80 символов')
  return [...new Set(names)].slice(0, 12)
}

function price(v: unknown): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s$]/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw new PlanInputError('Цена слова: неотрицательное число')
  if (n > 1e9) throw new PlanInputError('Цена слова: слишком большая сумма')
  return Math.round(n * 100) / 100
}

/** A new action (`partial` false) or the fields of an edit that were sent (`partial` true). */
export function parseAction(body: unknown, partial: boolean): Partial<ActionInput> {
  if (!body || typeof body !== 'object') throw new PlanInputError('Нечего сохранять')
  const b = body as Record<string, unknown>
  const out: Partial<ActionInput> = {}
  const has = (k: string) => !partial || k in b
  if (has('title')) out.title = text(b.title, 'Действие', MAX_TITLE, true) as string
  if (has('indicator')) out.indicator = text(b.indicator, 'Индикатор', MAX_TITLE, false)
  if (has('due_date')) out.due_date = date(b.due_date, 'Срок')
  if (has('owners')) out.owners = owners(b.owners)
  if (has('priority')) {
    const p = b.priority ?? 'B'
    if (!PRIORITIES.includes(p as Priority)) throw new PlanInputError('Приоритет: A, B или C')
    out.priority = p as Priority
  }
  if (has('price')) out.price = price(b.price)
  return out
}

export type ResultInput =
  | { type: 'done'; note: string | null; link: string | null }
  | { type: 'excuse'; reason: string; new_due: string | null }
  | { type: 'reopen' }

export function parseResult(body: unknown, today: string): ResultInput {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.type === 'done') {
    const link = text(b.link, 'Ссылка', 1000, false)
    if (link && !/^https?:\/\//i.test(link)) throw new PlanInputError('Ссылка должна начинаться с http:// или https://')
    return { type: 'done', note: text(b.note, 'Комментарий', MAX_TEXT, false), link }
  }
  if (b.type === 'excuse') {
    const newDue = date(b.new_due, 'Новый срок')
    if (newDue && newDue < today) throw new PlanInputError('Новый срок не может быть в прошлом')
    return { type: 'excuse', reason: text(b.reason, 'Причина', MAX_TEXT, true) as string, new_due: newDue }
  }
  if (b.type === 'reopen') return { type: 'reopen' }
  throw new PlanInputError('Итог: done, excuse или reopen')
}

// ---------- templates ----------

/** Directions a plan usually has; offered when the plan is created and in «+ Направление». */
export const TEMPLATE_DIRECTIONS = ['Стратегия', 'HR', 'Продажи', 'Маркетинг', 'IT', 'Учёт и контроль', 'Инвестиции', 'Логистика', 'Сервис и бренд', 'Автоматизация']

/** Typical actions per direction (from the plans participants already keep), offered as one-tap suggestions. */
export const SUGGESTED_ACTIONS: Record<string, string[]> = {
  'стратегия': ['SWOT-анализ', 'Определить целевую аудиторию', 'Создать аватар клиента', 'Сформировать миссию и ценности'],
  hr: ['Создать орг. структуру', 'Написать должностные инструкции и KPI', 'Найм ключевых сотрудников', 'Регламенты по отделам'],
  'продажи': ['Выбрать и внедрить CRM', 'Скрипты продаж', 'Воронка продаж по сегментам', 'Расчёт конверсии и стоимости лида'],
  'маркетинг': ['Определить бюджет маркетинга', 'Разработать оффер и УТП', 'Тест каналов продвижения', 'Таргетированная реклама'],
  it: ['Техническое задание на сайт или приложение', 'Найти подрядчика', 'Договор с подрядчиком на результат', 'Поэтапная приёмка работ'],
  'учёт и контроль': ['Бюджет и финансовый план', 'Шаблоны отчётов: баланс, ОПиУ, ОДДС', 'Программа для учёта', 'План продаж и прибыли'],
  'инвестиции': ['Определить сумму и условия привлечения', 'Подготовить презентацию для инвестора', 'Договор инвестиций'],
  'логистика': ['Выбрать подрядчиков доставки', 'Договор со службой доставки', 'Стандарты оказания услуг'],
  'сервис и бренд': ['Сбор отзывов клиентов', 'Брендбук', 'Стандарты обслуживания'],
  'автоматизация': ['Учёт в одной системе', 'Автоматические уведомления в CRM', 'Электронный документооборот'],
}

export function suggestionsFor(direction: string) {
  return SUGGESTED_ACTIONS[direction.trim().toLowerCase()] ?? []
}
