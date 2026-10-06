import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { computeAnalytics, type AnalyticsInput } from '@/components/reports/analytics/compute'

/**
 * GET /api/analytics?program_id=all|<id>
 * Read-only aggregation for «Аналитика»: debt aging, retention, revenue per
 * participant and collection rate. All formulas live in
 * components/reports/analytics/compute.ts.
 */

const PAGE = 1000 // PostgREST max rows per request

/** Reads every row of a query, page by page, so the result is never silently capped. */
async function fetchAll<T>(build: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data || []) as T[]))
    if (!data || data.length < PAGE) return out
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const programId = searchParams.get('program_id') || 'all'

    // Four independent reads in parallel; only the columns the report uses.
    const [participants, payments, programs, expenses] = await Promise.all([
      fetchAll<AnalyticsInput['participants'][number]>(() =>
        supabaseAdmin
          .from('participants')
          .select('id, name, status, tariff, program_id, start_date, updated_at, program:programs(id, name, price_per_month, duration_months)')
          .order('id'),
      ),
      fetchAll<AnalyticsInput['payments'][number]>(() =>
        supabaseAdmin.from('monthly_payments').select('participant_id, year, month_number, plan_amount, fact_amount').order('id'),
      ),
      fetchAll<AnalyticsInput['programs'][number]>(() => supabaseAdmin.from('programs').select('id, name').order('name')),
      // Event expenses belong to offline events, not to the programs' running costs
      fetchAll<AnalyticsInput['expenses'][number]>(() =>
        supabaseAdmin.from('expenses').select('amount, expense_date, program_id').is('event_id', null).order('id'),
      ),
    ])

    const data = computeAnalytics({ participants, payments, programs, expenses, programId, now: new Date() })
    return NextResponse.json({ data }, { status: 200 })
  } catch (error: any) {
    console.error('Error building analytics:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
