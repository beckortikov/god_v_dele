'use client'

import * as React from 'react'
import type { TelegramLinkSummary } from '@/lib/telegram'

export type { TelegramLinkSummary } from '@/lib/telegram'

export type TelegramUnavailableReason = 'not_configured' | 'migration_required' | 'error'

export type TelegramLinkState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: TelegramUnavailableReason; message?: string }
  | { status: 'ready'; link: TelegramLinkSummary | null }

export class TelegramNotConfiguredError extends Error {
  constructor() {
    super('Telegram-бот ещё не подключён')
    this.name = 'TelegramNotConfiguredError'
  }
}

async function readJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

/** Creates (or reuses) a link code for a participant and returns the t.me deep link. */
export async function createTelegramLink(participantId: string): Promise<{ code: string; url: string; expiresAt: string }> {
  const res = await fetch('/api/telegram/link-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subjectType: 'participant', subjectId: participantId }),
  })
  const json = await readJson(res)
  if (json.configured === false) throw new TelegramNotConfiguredError()
  if (json.error === 'migration_required') throw new Error('Привязка Telegram ещё не настроена: нужна миграция базы данных.')
  if (!res.ok || !json.url) throw new Error(json.error || 'Не удалось получить ссылку')
  return { code: json.code, url: json.url, expiresAt: json.expiresAt }
}

export async function unlinkTelegram(participantId: string) {
  const res = await fetch(`/api/telegram/links?subject_type=participant&subject_id=${encodeURIComponent(participantId)}`, {
    method: 'DELETE',
  })
  const json = await readJson(res)
  if (!res.ok) throw new Error(json.message || json.error || 'Не удалось отвязать')
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for http origins and older browsers.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

const POLL_INTERVAL_MS = 5_000
const POLL_DURATION_MS = 2 * 60_000

/**
 * Link status of one participant. `watch()` polls every 5 s for up to 2 min
 * (after the person opened the bot) and stops as soon as the link appears.
 */
export function useTelegramLink(participantId: string | null | undefined) {
  const [state, setState] = React.useState<TelegramLinkState>({ status: 'loading' })
  const [watching, setWatching] = React.useState(false)
  const watchUntil = React.useRef(0)

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!participantId) return null
      if (!opts?.silent) setState({ status: 'loading' })
      try {
        const res = await fetch(
          `/api/telegram/links?subject_type=participant&subject_id=${encodeURIComponent(participantId)}`,
          { cache: 'no-store' }
        )
        const json = await readJson(res)
        let next: TelegramLinkState
        if (json.error === 'migration_required') next = { status: 'unavailable', reason: 'migration_required' }
        else if (!res.ok) next = { status: 'unavailable', reason: 'error', message: json.error }
        else if (json.configured === false) next = { status: 'unavailable', reason: 'not_configured' }
        else next = { status: 'ready', link: (json.link as TelegramLinkSummary | null) ?? null }
        // Keep the last good state while polling in the background.
        if (!(opts?.silent && next.status === 'unavailable' && next.reason === 'error')) setState(next)
        return next
      } catch (e) {
        if (!opts?.silent) setState({ status: 'unavailable', reason: 'error', message: (e as Error).message })
        return null
      }
    },
    [participantId]
  )

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!watching) return
    const id = window.setInterval(async () => {
      if (Date.now() > watchUntil.current) {
        setWatching(false)
        return
      }
      const next = await load({ silent: true })
      if (next?.status === 'ready' && next.link) setWatching(false)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [watching, load])

  const watch = React.useCallback(() => {
    watchUntil.current = Date.now() + POLL_DURATION_MS
    setWatching(true)
  }, [])

  const stopWatching = React.useCallback(() => setWatching(false), [])

  return { state, reload: load, watch, stopWatching, watching }
}

export interface TelegramLinksIndex {
  loading: boolean
  /** False when the bot is not configured or migration 015 is not applied. */
  available: boolean
  configured: boolean
  links: Map<string, TelegramLinkSummary>
  get: (participantId: string) => TelegramLinkSummary | null
  reload: () => Promise<void>
}

/** All active participant links, fetched once, for list pages (badges in rows). */
export function useTelegramLinks(): TelegramLinksIndex {
  const [loading, setLoading] = React.useState(true)
  const [available, setAvailable] = React.useState(false)
  const [configured, setConfigured] = React.useState(false)
  const [links, setLinks] = React.useState<Map<string, TelegramLinkSummary>>(() => new Map())

  const reload = React.useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/links?subject_type=participant', { cache: 'no-store' })
      const json = await readJson(res)
      if (!res.ok) {
        setAvailable(false)
        setLinks(new Map())
        return
      }
      setConfigured(json.configured !== false)
      setAvailable(true)
      setLinks(new Map(((json.links as TelegramLinkSummary[]) ?? []).map(l => [l.subjectId, l])))
    } catch {
      setAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const get = React.useCallback((id: string) => links.get(id) ?? null, [links])
  return { loading, available, configured, links, get, reload }
}
