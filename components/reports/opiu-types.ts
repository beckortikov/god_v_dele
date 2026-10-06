// Shape of /api/opiu-reports → data. Kept loose where the API is loose.

export interface AccountBalance {
  id: string
  name: string
  currency: string
  opening_balance: number
  fact_income: number
  total_expenses: number
  closing_balance: number
}

export interface ProgramAnalytics {
  program_id: string
  program_name: string
  total_participants: number
  active_participants: number
  completed_participants: number
  plan_income: number
  fact_income: number
  fact_income_tjs: number
}

export interface ParticipantPayment {
  participant_id: string
  participant_name: string
  program_name: string
  plan: number
  fact: number
  factTJS: number
  deviation: number
  status: 'paid' | 'partial' | 'overdue' | 'unpaid' | string
  notes: string | null
}

export interface OpiuReport {
  period: { month: number; year: number; month_name: string }
  summary: {
    total_participants: number
    active_participants: number
    completed_participants: number
    archived_participants: number
    opening_balance_usd: number
    opening_balance_tjs: number
    closing_balance_usd: number
    closing_balance_tjs: number
    plan_income: number
    fact_income: number
    fact_income_tjs: number
    total_expenses: number
    total_expenses_tjs: number
    gross_profit: number
    net_profit: number
    deviation: number
    completion_rate: number
    paid_count: number
    partial_count: number
    overdue_count: number
    account_balances: AccountBalance[]
  }
  ifrs_metrics: {
    revenue_recognized: number
    deferred_revenue: number
    accounts_receivable: number
    overdue_receivables: number
    total_expenses: number
    expenses_by_category: Record<string, number>
    gross_profit: number
    operating_profit: number
    net_profit: number
    profit_margin: number
    collection_rate: number
    revenue_completion_rate: number
    ytd_revenue: number
    ytd_plan: number
    ytd_expenses: number
    ytd_gross_profit: number
    ytd_operating_profit: number
    ytd_net_profit: number
    ytd_completion_rate: number
    ytd_profit_margin: number
  }
  program_analytics: ProgramAnalytics[]
  participant_payments: ParticipantPayment[]
  problem_participants: { overdue: ParticipantPayment[]; partial: ParticipantPayment[] }
}
