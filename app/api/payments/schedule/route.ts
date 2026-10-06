import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { changeSuffix } from '@/lib/audit-labels'
import { roundMoney } from '@/lib/money'
import { monthIndex, monthOfDate, programDuration, scheduleMonths, toCents } from '@/lib/payment-schedule'
import { defaultPlan, loadParticipants, planSummary, planUpdate, scheduleRow, type ParticipantForPlan } from '../_server'

export const dynamic = 'force-dynamic'

/**
 * Payment schedules (графики оплат): one monthly_payments row per month with
 * the plan and nothing received yet.
 *
 * GET  /api/payments/schedule?participant_ids=a,b&from_month=&from_year=&months=&plan_amount=&overwrite_plan=
 *      Preview, writes nothing. Without participant_ids: every active participant.
 * POST /api/payments/schedule
 *      { participant_ids: [], from_month?, from_year?, months?, plan_amount?, overwrite_plan?: false }
 *      Creates the missing months (status pending, fact 0). Existing months are
 *      skipped, or get the new plan with overwrite_plan (received money is never touched).
 *
 * Defaults per participant: from = start_date month, months = program
 * duration_months, plan = individual tariff or program price.
 * Both return { created, skipped, updated, participants: [...] }.
 */

type Reason = 'no_start' | 'no_duration' | 'no_plan'

interface Options {
  fromMonth: number | null
  fromYear: number | null
  months: number | null
  plan: number | null
  overwrite: boolean
}

interface Plan {
  participant: ParticipantForPlan
  reason?: Reason
  from?: { month: number; year: number }
  to?: { month: number; year: number }
  create: ReturnType<typeof scheduleRow>[]
  update: { row: any; plan: number }[]
  skipped: number
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })
const intOrNull = (v: unknown) => (v == null || v === '' ? null : Math.floor(Number(v)))

function parseOptions(src: Record<string, unknown>): Options | string {
  const fromMonth = intOrNull(src.from_month)
  const fromYear = intOrNull(src.from_year)
  const months = intOrNull(src.months)
  const plan = src.plan_amount == null || src.plan_amount === '' ? null : roundMoney(src.plan_amount)
  if ((fromMonth == null) !== (fromYear == null)) return 'Укажите и месяц, и год начала'
  if (fromMonth != null && !(fromMonth >= 1 && fromMonth <= 12)) return 'Месяц начала — от 1 до 12'
  if (fromYear != null && !(fromYear >= 2000 && fromYear <= 2100)) return 'Неверный год начала'
  if (months != null && !(months >= 1 && months <= 60)) return 'Число месяцев — от 1 до 60'
  if (plan != null && !(plan >= 0)) return 'План не может быть отрицательным'
  const overwrite = src.overwrite_plan === true || src.overwrite_plan === 'true' || src.overwrite_plan === '1'
  return { fromMonth, fromYear, months, plan, overwrite }
}

async function existingRows(ids: string[]) {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from('monthly_payments')
        .select('id, participant_id, month_number, year, plan_amount, fact_amount, status')
        .in('participant_id', chunk)
        .order('id')
        .range(from, from + 999)
      if (error) throw error
      out.push(...(data || []))
      if (!data || data.length < 1000) break
    }
  }
  return out
}

async function buildPlans(ids: string[] | null, opts: Options): Promise<Plan[]> {
  let participants = await loadParticipants(ids)
  if (!ids) participants = participants.filter(p => p.status === 'active')
  const rows = await existingRows(participants.map(p => p.id))
  const byParticipant = new Map<string, Map<number, any>>()
  for (const r of rows) {
    const m = byParticipant.get(r.participant_id) ?? new Map<number, any>()
    m.set(monthIndex(r.year, r.month_number), r)
    byParticipant.set(r.participant_id, m)
  }

  return participants
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))
    .map((p): Plan => {
      const base: Plan = { participant: p, create: [], update: [], skipped: 0 }
      const start = opts.fromMonth != null ? { month: opts.fromMonth, year: opts.fromYear! } : monthOfDate(p.start_date)
      if (!start) return { ...base, reason: 'no_start' }
      const count = opts.months ?? programDuration(p.program)
      if (!count) return { ...base, reason: 'no_duration' }
      const plan = opts.plan ?? defaultPlan(p)
      if (opts.plan == null && !(plan > 0)) return { ...base, reason: 'no_plan' }

      const months = scheduleMonths(start.month, start.year, count)
      const own = byParticipant.get(p.id) ?? new Map<number, any>()
      for (const m of months) {
        const row = own.get(monthIndex(m.year, m.month))
        if (!row) base.create.push(scheduleRow(p, m.month, m.year, plan))
        else if (opts.overwrite && toCents(row.plan_amount) !== toCents(plan)) base.update.push({ row, plan })
        else base.skipped++
      }
      return { ...base, from: months[0], to: months[months.length - 1] }
    })
}

function summarize(plans: Plan[], done?: Map<string, { created: number; updated: number; error?: string }>) {
  const participants = plans.map(pl => {
    const d = done?.get(pl.participant.id)
    return {
      id: pl.participant.id,
      name: pl.participant.name,
      from: pl.from ?? null,
      to: pl.to ?? null,
      reason: pl.reason ?? null,
      created: d ? d.created : pl.create.length,
      updated: d ? d.updated : pl.update.length,
      skipped: pl.skipped,
      error: d?.error ?? null,
    }
  })
  return {
    created: participants.reduce((s, p) => s + p.created, 0),
    updated: participants.reduce((s, p) => s + p.updated, 0),
    skipped: participants.reduce((s, p) => s + p.skipped, 0),
    participants,
  }
}

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams
    const opts = parseOptions(Object.fromEntries(sp.entries()))
    if (typeof opts === 'string') return fail(opts, 400)
    const raw = sp.get('participant_ids')
    const ids = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : null
    return NextResponse.json({ preview: true, ...summarize(await buildPlans(ids, opts)) })
  } catch (error: any) {
    console.error('Error previewing payment schedules:', error)
    return fail(error.message || 'Не удалось рассчитать график', 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.participant_ids) ? body.participant_ids.map(String).filter(Boolean) : []
    if (!ids.length) return fail('Выберите участников', 400)
    if (ids.length > 500) return fail('Не больше 500 участников за раз', 400)
    const opts = parseOptions(body ?? {})
    if (typeof opts === 'string') return fail(opts, 400)

    const plans = await buildPlans(ids, opts)
    const done = new Map<string, { created: number; updated: number; error?: string }>()

    for (const pl of plans) {
      const p = pl.participant
      const result = { created: 0, updated: 0 } as { created: number; updated: number; error?: string }
      done.set(p.id, result)
      try {
        if (pl.create.length) {
          // ignoreDuplicates: a month created meanwhile by someone else is left alone
          const { data, error } = await supabaseAdmin
            .from('monthly_payments')
            .upsert(pl.create, { onConflict: 'participant_id,month_number,year', ignoreDuplicates: true })
            .select('*')
          if (error) throw error
          result.created = data?.length ?? 0
          await Promise.all(
            (data || []).map(row =>
              logAudit(req, { table: 'monthly_payments', recordId: row.id, action: 'create', summary: planSummary(p.name, row), after: row })
            )
          )
        }
        for (const { row, plan } of pl.update) {
          const { data: before } = await supabaseAdmin.from('monthly_payments').select('*').eq('id', row.id).maybeSingle()
          if (!before) continue
          const { data: after, error } = await supabaseAdmin
            .from('monthly_payments')
            .update(planUpdate(before, plan))
            .eq('id', row.id)
            .select('*')
            .single()
          if (error) throw error
          result.updated++
          await logAudit(req, {
            table: 'monthly_payments',
            recordId: row.id,
            action: 'update',
            summary: `${planSummary(p.name, after)}${changeSuffix(before, after)}`,
            before,
            after,
          })
        }
      } catch (err: any) {
        result.error = err.message || 'Ошибка'
      }
    }

    const out = summarize(plans, done)
    const failed = out.participants.filter(p => p.error)
    return NextResponse.json({ ...out, failed: failed.length }, { status: failed.length && !out.created && !out.updated ? 500 : 200 })
  } catch (error: any) {
    console.error('Error creating payment schedules:', error)
    return fail(error.message || 'Не удалось сформировать график', 500)
  }
}
