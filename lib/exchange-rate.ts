'use client'

import * as React from 'react'

/** Official NBT rate: `rate` TJS per 1 unit of `currency`, published for `date`. */
export interface NbtRate {
  date: string
  requestedDate: string
  currency: string
  rate: number
  source: 'nbt'
}

// Client-side cache shared by every form on the page: one request per date/currency.
const cache = new Map<string, Promise<NbtRate>>()
const resolved = new Map<string, NbtRate>()

const key = (date: string, currency: string) => `${currency.toUpperCase()}:${date}`

/** Fetches the NBT rate for a day (falls back to the nearest earlier day server-side). */
export function fetchNbtRate(date: string, currency = 'USD'): Promise<NbtRate> {
  const k = key(date, currency)
  const hit = cache.get(k)
  if (hit) return hit
  const p = fetch(`/api/exchange-rate?date=${encodeURIComponent(date)}&currency=${encodeURIComponent(currency)}`)
    .then(async res => {
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) throw new Error(json.message || json.error || `HTTP ${res.status}`)
      const r = json as NbtRate
      resolved.set(k, r)
      return r
    })
    .catch(err => {
      cache.delete(k) // let the next attempt retry
      throw err
    })
  cache.set(k, p)
  return p
}

/** Synchronous read of an already loaded rate. */
export function peekNbtRate(date: string, currency = 'USD'): NbtRate | undefined {
  return resolved.get(key(date, currency))
}

/**
 * TJS per 1 unit of `currency` (1 for TJS itself). Lets you convert between any
 * two NBT-quoted currencies: amountTo = amountFrom * tjsPer(from) / tjsPer(to).
 */
export async function tjsPer(currency: string, date: string): Promise<number> {
  if (currency.toUpperCase() === 'TJS') return 1
  return (await fetchNbtRate(date, currency)).rate
}

/** "06.10" — the short label used next to rate inputs. */
export function shortRateDate(iso: string) {
  const [, m, d] = iso.split('-')
  return d && m ? `${d}.${m}` : iso
}

export function useNbtRate(date: string | null | undefined, currency = 'USD', enabled = true) {
  const valid = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const active = enabled && valid && currency.toUpperCase() !== 'TJS'
  const [state, setState] = React.useState<{ key: string; data: NbtRate | null; error: string | null }>(() => {
    const k = active ? key(date!, currency) : ''
    return { key: k, data: active ? peekNbtRate(date!, currency) ?? null : null, error: null }
  })

  React.useEffect(() => {
    if (!active) return
    const k = key(date!, currency)
    const cached = peekNbtRate(date!, currency)
    if (cached) {
      setState({ key: k, data: cached, error: null })
      return
    }
    let alive = true
    setState({ key: k, data: null, error: null })
    fetchNbtRate(date!, currency).then(
      data => alive && setState({ key: k, data, error: null }),
      err => alive && setState({ key: k, data: null, error: (err as Error).message })
    )
    return () => {
      alive = false
    }
  }, [active, date, currency])

  const current = active && state.key === key(date!, currency)
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: active && (!current || (!state.data && !state.error)),
  }
}
