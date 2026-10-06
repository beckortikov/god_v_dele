import { NextResponse } from 'next/server'
import { roundRate } from '@/lib/money'

/**
 * Official exchange rate of the National Bank of Tajikistan (NBT).
 *
 * GET /api/exchange-rate?date=YYYY-MM-DD&currency=USD
 *   → { date, requestedDate, currency, rate, source: 'nbt' }
 *
 * `rate` is TJS per 1 unit of `currency` (NBT `Value / Nominal`). `date` is the
 * day the rate was actually published for: when the requested day has no
 * quotes (weekend, holiday, outage) we walk back to the nearest earlier day.
 * Future dates are clamped to today (Dushanbe time).
 */

export const dynamic = 'force-dynamic'

const NBT_URL = 'https://nbt.tj/ru/kurs/export_xml.php'
const MAX_LOOKBACK_DAYS = 10
const FETCH_TIMEOUT_MS = 8000
/** Today's quotes can still change during the day; past days are final. */
const TODAY_TTL_MS = 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 500

type Rates = Record<string, number>

interface CacheEntry {
  rates: Rates | null // null = NBT answered but had no quotes for that day
  at: number
}

// Module-level cache, per NBT date. Survives between requests in one server instance.
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<Rates | null>>()

function dushanbeToday(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dushanbe' }).format(new Date())
}

function isValidISODate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * NBT declares windows-1251 in the XML prolog, but has also been seen serving
 * UTF-8 bytes under that declaration. Try strict UTF-8 first, then cp1251.
 */
function decodeXml(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1251').decode(buf)
  }
}

function parseRates(xml: string): Rates | null {
  const rates: Rates = {}
  const blocks = xml.match(/<Valute\b[\s\S]*?<\/Valute>/gi) || []
  for (const block of blocks) {
    const code = block.match(/<CharCode>\s*([A-Za-z]{3})\s*<\/CharCode>/i)?.[1]?.toUpperCase()
    const value = Number(block.match(/<Value>\s*([\d.,]+)\s*<\/Value>/i)?.[1]?.replace(',', '.'))
    const nominal = Number(block.match(/<Nominal>\s*([\d.,]+)\s*<\/Nominal>/i)?.[1]?.replace(',', '.')) || 1
    if (code && Number.isFinite(value) && value > 0) rates[code] = value / nominal
  }
  return Object.keys(rates).length ? rates : null
}

class NbtUnavailableError extends Error {}

async function loadDay(date: string, today: string): Promise<Rates | null> {
  const hit = cache.get(date)
  if (hit && (date < today || Date.now() - hit.at < TODAY_TTL_MS)) return hit.rates

  const pending = inflight.get(date)
  if (pending) return pending

  const p = (async () => {
    let res: Response
    try {
      res = await fetch(`${NBT_URL}?date=${date}&export=xmlout`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
        headers: { Accept: 'application/xml,text/xml,*/*' },
      })
    } catch (e) {
      throw new NbtUnavailableError((e as Error).message)
    }
    if (!res.ok) throw new NbtUnavailableError(`HTTP ${res.status}`)
    const rates = parseRates(decodeXml(await res.arrayBuffer()))
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string)
    cache.set(date, { rates, at: Date.now() })
    return rates
  })()

  inflight.set(date, p)
  try {
    return await p
  } finally {
    inflight.delete(date)
  }
}

function errorJson(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const today = dushanbeToday()
  const requested = searchParams.get('date') || today
  const currency = (searchParams.get('currency') || 'USD').toUpperCase()

  if (!isValidISODate(requested)) {
    return errorJson(400, 'invalid_date', 'Дата должна быть в формате ГГГГ-ММ-ДД')
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return errorJson(400, 'invalid_currency', 'Код валюты из трёх латинских букв, например USD')
  }

  const start = requested > today ? today : requested

  if (currency === 'TJS') {
    return NextResponse.json({ date: start, requestedDate: requested, currency, rate: 1, source: 'nbt' })
  }

  try {
    for (let i = 0; i <= MAX_LOOKBACK_DAYS; i++) {
      const day = shiftDay(start, -i)
      const rates = await loadDay(day, today)
      if (!rates) continue
      const rate = rates[currency]
      if (rate == null) {
        // The day has quotes, just not for this currency: NBT does not publish it.
        return errorJson(404, 'unknown_currency', `НБТ не публикует курс ${currency}`)
      }
      return NextResponse.json(
        { date: day, requestedDate: requested, currency, rate: roundRate(rate), source: 'nbt' },
        { headers: { 'Cache-Control': day < today ? 'private, max-age=86400' : 'private, max-age=600' } }
      )
    }
    return errorJson(404, 'rate_not_found', `Нет курса НБТ за ${MAX_LOOKBACK_DAYS} дней до ${start}`)
  } catch (e) {
    if (e instanceof NbtUnavailableError) {
      console.warn('[exchange-rate] NBT unavailable:', e.message)
      return errorJson(502, 'nbt_unavailable', 'Сайт НБТ не отвечает. Введите курс вручную')
    }
    console.error('[exchange-rate] unexpected error:', e)
    return errorJson(500, 'internal_error', 'Не удалось получить курс')
  }
}
