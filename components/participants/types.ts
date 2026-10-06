export interface Program {
  id: string
  name: string
  price_per_month: number
  duration_months: number
}

export interface Participant {
  id: string
  name: string
  email?: string
  phone?: string
  program_id: string
  start_date: string
  status: 'active' | 'completed' | 'archived'
  tariff?: number
  program?: Program
}

export interface MonthlyPayment {
  id: string
  month_number: number
  year: number
  amount: number
  fact_amount: number
  status: string
  participant_id: string
  payment_month?: string
  notes?: string
}

export const PARTICIPANT_STATUS: Record<Participant['status'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Активный', variant: 'default' },
  completed: { label: 'Завершено', variant: 'secondary' },
  archived: { label: 'Архив', variant: 'outline' },
}

/** Monthly plan for a participant: individual tariff, otherwise the program price. */
export const monthlyTariff = (p: Participant) => p.tariff || p.program?.price_per_month || 0

/**
 * Has unpaid past months (no record, or fact < plan) from the start month up to,
 * but not including, the current month. `payments` may be all payments or only
 * this participant's: they are filtered by participant id either way.
 */
export function checkOverdue(participant: Participant, payments: MonthlyPayment[]) {
  if (!participant.start_date) return false

  const start = new Date(participant.start_date)
  const now = new Date()
  const pPayments = payments.filter(p => p.participant_id === participant.id)

  const currentDate = new Date(start.getFullYear(), start.getMonth(), 1)
  const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  while (currentDate < firstDayCurrentMonth) {
    const month = currentDate.getMonth() + 1
    const year = currentDate.getFullYear()

    const payment = pPayments.find(p => p.month_number === month && p.year === year)
    const plan = payment?.amount || participant.tariff || participant.program?.price_per_month || 0
    const fact = payment?.fact_amount || 0

    if (!payment || fact < plan) return true

    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  return false
}

/** Paid something, but less than the plan, in any month. */
export function checkPartial(participant: Participant, payments: MonthlyPayment[]) {
  const pPayments = payments.filter(p => p.participant_id === participant.id)
  return pPayments.some(p => {
    const plan = p.amount || participant.tariff || participant.program?.price_per_month || 0
    const fact = p.fact_amount || 0
    return fact > 0 && fact < plan
  })
}

/** The current month's payment record has status «paid». */
export function checkPaidThisMonth(participant: Participant, payments: MonthlyPayment[]) {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const payment = payments.find(
    pay => pay.participant_id === participant.id && pay.month_number === currentMonth && pay.year === currentYear
  )
  return payment?.status === 'paid'
}

/** Status of one monthly payment row, as shown in the history. */
export function paymentRowStatus(payment: MonthlyPayment, participant: Participant) {
  const plan = payment.amount || participant.tariff || participant.program?.price_per_month || 0
  const fact = payment.fact_amount || 0
  if (payment.status === 'overdue') return { label: 'Просрочен', variant: 'destructive' as const }
  if (fact >= plan && fact > 0) return { label: 'Оплачен', variant: 'success' as const }
  if (fact > 0 && fact < plan) return { label: 'Частично', variant: 'warning' as const }
  return { label: 'Ожидается', variant: 'secondary' as const }
}

export interface ParticipantSummary {
  overdue: boolean
  partial: boolean
  paidThisMonth: boolean
  paidCount: number
  totalCount: number
  collected: number
}

export function summarize(participant: Participant, own: MonthlyPayment[]): ParticipantSummary {
  return {
    overdue: checkOverdue(participant, own),
    partial: checkPartial(participant, own),
    paidThisMonth: checkPaidThisMonth(participant, own),
    paidCount: own.filter(p => p.status === 'paid' || (p.fact_amount || 0) >= (p.amount || 0)).length,
    totalCount: own.length,
    collected: own.reduce((acc, cur) => acc + (cur.fact_amount || 0), 0),
  }
}

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}
