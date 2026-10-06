import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

/**
 * GET /api/search?q=…&role=…
 * Read-only record search for the ⌘K palette. Returns up to LIMIT records per
 * group, only for the groups the role may open.
 */

const LIMIT = 5
/** Rows fetched per group before the multi-word filter narrows them down. */
const FETCH = 25

type Group = 'participants' | 'employees' | 'events' | 'expenses' | 'payments'

const GROUPS_BY_ROLE: Record<string, Group[]> = {
  admin: ['participants', 'employees', 'events', 'expenses', 'payments'],
  finance: ['participants', 'events', 'expenses', 'payments'],
  wheels_manager: ['participants', 'events'],
}

/** Characters that break PostgREST `or=(…)` filters or act as LIKE wildcards. */
function sanitize(token: string) {
  return token.replace(/[,()*%_\\"'.:]/g, ' ').trim()
}

function tokensOf(q: string) {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map(sanitize)
    .flatMap(t => t.split(/\s+/))
    .filter(Boolean)
}

/** Every token must appear somewhere in the haystack (so «иван пет» finds «Иван Петров»). */
function matchesAll(tokens: string[], ...fields: (string | null | undefined)[]) {
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  const hayDigits = hay.replace(/[\s()+-]/g, '')
  return tokens.every(t => hay.includes(t) || (/^\d+$/.test(t) && hayDigits.includes(t)))
}

/** The longest token makes the most selective database filter. */
function pivot(tokens: string[]) {
  return [...tokens].sort((a, b) => b.length - a.length)[0]
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const role = searchParams.get('role') || ''
  const groups = GROUPS_BY_ROLE[role] ?? []

  const empty = { participants: [], employees: [], events: [], expenses: [], payments: [] }
  const tokens = tokensOf(q)
  if (q.length < 2 || tokens.length === 0 || groups.length === 0) {
    return NextResponse.json({ q, ...empty })
  }
  const like = `%${pivot(tokens)}%`
  const allow = (g: Group) => groups.includes(g)

  try {
    const [participants, employees, events, expenses, payments] = await Promise.all([
      allow('participants')
        ? supabaseAdmin
            .from('participants')
            .select('id, name, phone, email, status, program:programs(name)')
            .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
            .order('name')
            .limit(FETCH)
        : null,
      allow('employees')
        ? supabaseAdmin
            .from('employees')
            .select('id, first_name, last_name, position, department, status')
            .or(`first_name.ilike.${like},last_name.ilike.${like},position.ilike.${like}`)
            .order('first_name')
            .limit(FETCH)
        : null,
      allow('events')
        ? supabaseAdmin
            .from('offline_events')
            .select('id, name, location, event_date, status')
            .or(`name.ilike.${like},location.ilike.${like}`)
            .order('event_date', { ascending: false })
            .limit(FETCH)
        : null,
      allow('expenses')
        ? supabaseAdmin
            .from('expenses')
            .select('id, name, description, category, amount, currency, original_amount, expense_date')
            .or(`name.ilike.${like},description.ilike.${like},category.ilike.${like}`)
            .order('expense_date', { ascending: false })
            .limit(FETCH)
        : null,
      allow('payments')
        ? supabaseAdmin
            .from('monthly_payments')
            .select('id, participant_id, month_number, year, plan_amount, fact_amount, status, paid_date, participant:participants!inner(id, name)')
            .ilike('participant.name', like)
            .order('year', { ascending: false })
            .order('month_number', { ascending: false })
            .limit(FETCH)
        : null,
    ])

    for (const r of [participants, employees, events, expenses, payments]) {
      if (r?.error) throw r.error
    }

    const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

    return NextResponse.json({
      q,
      participants: (participants?.data ?? [])
        .filter((p: any) => matchesAll(tokens, p.name, p.phone, p.email))
        .slice(0, LIMIT)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          phone: p.phone || null,
          email: p.email || null,
          status: p.status,
          program: one<{ name: string }>(p.program)?.name ?? null,
        })),
      employees: (employees?.data ?? [])
        .filter((e: any) => matchesAll(tokens, e.first_name, e.last_name, e.position))
        .slice(0, LIMIT)
        .map((e: any) => ({
          id: e.id,
          name: [e.first_name, e.last_name].filter(Boolean).join(' '),
          position: e.position || null,
          department: e.department || null,
          status: e.status,
        })),
      events: (events?.data ?? [])
        .filter((e: any) => matchesAll(tokens, e.name, e.location))
        .slice(0, LIMIT)
        .map((e: any) => ({
          id: e.id,
          name: e.name,
          location: e.location || null,
          date: e.event_date,
          status: e.status,
        })),
      expenses: (expenses?.data ?? [])
        .filter((e: any) => matchesAll(tokens, e.name, e.description, e.category))
        .slice(0, LIMIT)
        .map((e: any) => ({
          id: e.id,
          name: e.name,
          category: e.category || null,
          amount: Number(e.amount) || 0,
          date: e.expense_date,
        })),
      payments: (payments?.data ?? [])
        .filter((p: any) => matchesAll(tokens, one<{ name: string }>(p.participant)?.name))
        .slice(0, LIMIT)
        .map((p: any) => ({
          id: p.id,
          participantId: p.participant_id,
          participantName: one<{ name: string }>(p.participant)?.name ?? '',
          month: p.month_number,
          year: p.year,
          plan: Number(p.plan_amount) || 0,
          fact: Number(p.fact_amount) || 0,
          status: p.status,
          paidDate: p.paid_date,
        })),
    })
  } catch (error: any) {
    console.error('Search failed:', error)
    return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 })
  }
}
