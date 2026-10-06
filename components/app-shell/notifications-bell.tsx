'use client'

import * as React from 'react'
import {
  Bell,
  BellRing,
  Cake,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  ListChecks,
  Palmtree,
  Receipt,
  RefreshCw,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { plural } from '@/lib/format'
import { getAllowedPages, type PageType, type UserRole } from '@/lib/navigation'
import { useNav } from '@/components/app-shell/nav-context'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import type { AppNotification, NotificationDetail, NotificationKind } from '@/app/api/notifications/route'

const REFRESH_MS = 5 * 60 * 1000
/** Focus refreshes are skipped if the last load is this recent. */
const FOCUS_THROTTLE_MS = 30 * 1000
const MAX_READ_KEYS = 400

const warningText = 'text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]'

const KIND_STYLE: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  'overdue-payments': { icon: Wallet, tone: 'bg-destructive-soft text-destructive' },
  'my-debt': { icon: Receipt, tone: cn('bg-warning-soft', warningText) },
  'overdue-tasks': { icon: ListChecks, tone: 'bg-destructive-soft text-destructive' },
  'long-timer': { icon: Timer, tone: cn('bg-warning-soft', warningText) },
  'leave-requests': { icon: Palmtree, tone: 'bg-info-soft text-info' },
  payroll: { icon: Wallet, tone: cn('bg-warning-soft', warningText) },
  event: { icon: CalendarDays, tone: 'bg-muted text-muted-foreground' },
  birthday: { icon: Cake, tone: 'bg-primary-soft text-primary-soft-foreground' },
}

interface SessionIds {
  userId: string
  employeeId: string
  participantId: string
}

function readSessionIds(): SessionIds {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    return { userId: u.id || '', employeeId: u.employee_id || '', participantId: u.participant_id || '' }
  } catch {
    return { userId: '', employeeId: '', participantId: '' }
  }
}

function readKeys(storageKey: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return new Set(Array.isArray(raw) ? raw : [])
  } catch {
    return new Set()
  }
}

function writeKeys(storageKey: string, keys: Set<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...keys].slice(-MAX_READ_KEYS)))
  } catch {}
}

function useNotifications(role: UserRole) {
  const [items, setItems] = React.useState<AppNotification[] | null>(null)
  const [error, setError] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const lastLoad = React.useRef(0)
  const controller = React.useRef<AbortController | null>(null)

  const load = React.useCallback(async () => {
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    lastLoad.current = Date.now()
    setRefreshing(true)
    try {
      const ids = readSessionIds()
      const params = new URLSearchParams({ role, ...ids })
      const res = await fetch(`/api/notifications?${params}`, { signal: ctrl.signal })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
      setItems(json.items ?? [])
      setError(false)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setError(true)
    } finally {
      if (controller.current === ctrl) setRefreshing(false)
    }
  }, [role])

  React.useEffect(() => {
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    const onFocus = () => {
      if (Date.now() - lastLoad.current > FOCUS_THROTTLE_MS) load()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') onFocus()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      controller.current?.abort()
    }
  }, [load])

  const refreshIfStale = React.useCallback(() => {
    if (Date.now() - lastLoad.current > FOCUS_THROTTLE_MS) load()
  }, [load])

  return { items, error, refreshing, reload: load, refreshIfStale }
}

function useReadState(role: UserRole) {
  const storageKey = React.useMemo(() => {
    if (typeof window === 'undefined') return `notifications-read:${role}`
    const { userId } = readSessionIds()
    return `notifications-read:${userId || role}`
  }, [role])
  const [read, setRead] = React.useState<Set<string>>(() => new Set())

  React.useEffect(() => setRead(readKeys(storageKey)), [storageKey])

  const markRead = React.useCallback(
    (keys: string[]) => {
      setRead(prev => {
        if (keys.every(k => prev.has(k))) return prev
        const next = new Set(prev)
        for (const k of keys) {
          next.delete(k) // re-insert so the newest keys survive trimming
          next.add(k)
        }
        writeKeys(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  return { read, markRead }
}

export function NotificationsBell({ role }: { role: UserRole }) {
  const { navigate } = useNav()
  const [open, setOpen] = React.useState(false)
  const { items, error, refreshing, reload, refreshIfStale } = useNotifications(role)
  const { read, markRead } = useReadState(role)
  const allowed = React.useMemo(() => new Set<string>(getAllowedPages(role)), [role])

  const list = items ?? []
  const unread = list.filter(n => !read.has(n.key))
  const unreadHigh = unread.some(n => n.priority === 'high')
  const unreadNormal = unread.some(n => n.priority !== 'low')
  const countLabel = unread.length > 9 ? '9+' : String(unread.length)

  const go = (page: string | null | undefined, action?: string, payload?: Record<string, unknown>) => {
    if (!page || !allowed.has(page)) return false
    navigate(page as PageType, action, payload)
    setOpen(false)
    return true
  }

  const onItem = (n: AppNotification) => {
    markRead([n.key])
    go(n.page, n.action, n.payload)
  }

  const onDetail = (n: AppNotification, d: NotificationDetail) => {
    markRead([n.key])
    go(d.page, d.action, d.payload)
  }

  const ariaLabel = unread.length
    ? `Уведомления: ${unread.length} непрочитанных`
    : 'Уведомления'

  return (
    <Popover
      open={open}
      onOpenChange={o => {
        setOpen(o)
        if (o) refreshIfStale()
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={ariaLabel}>
          {unreadHigh ? <BellRing /> : <Bell />}
          {unread.length > 0 &&
            (unreadNormal ? (
              <span
                className={cn(
                  'num absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold ring-2 ring-nav',
                  unreadHigh ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
                )}
              >
                {countLabel}
              </span>
            ) : (
              // Only low-priority news: a quiet dot, no number
              <span className="absolute top-1 right-1 size-2 rounded-full bg-muted-foreground ring-2 ring-nav" />
            ))}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Уведомления</p>
          {unread.length > 0 && (
            <span className="num text-xs whitespace-nowrap text-muted-foreground max-sm:hidden">{unread.length} {plural(unread.length, ['новое', 'новых', 'новых'])}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              disabled={unread.length === 0}
              onClick={() => markRead(list.map(n => n.key))}
            >
              <CheckCheck />
              <span className="max-sm:hidden">Отметить всё прочитанным</span>
              <span className="sm:hidden">Прочитать всё</span>
            </Button>
          </div>
        </div>

        <div className="max-h-[min(460px,70dvh)] overflow-y-auto">
          {items === null && !error ? (
            <div className="space-y-3 p-4" aria-busy>
              {[0, 1, 2].map(i => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : error && list.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <p className="text-sm font-medium">Не удалось загрузить уведомления</p>
              <p className="mt-1 text-xs text-muted-foreground">Проверьте соединение и попробуйте ещё раз</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={reload} disabled={refreshing}>
                <RefreshCw className={cn(refreshing && 'animate-spin')} /> Повторить
              </Button>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Bell className="size-5" />
              </span>
              <p className="text-sm font-medium">Всё спокойно</p>
              <p className="mt-1 text-xs text-muted-foreground">Новых уведомлений нет. Проверяем каждые 5 минут</p>
            </div>
          ) : (
            <ul className="divide-y">
              {list.map(n => (
                <NotificationRow
                  key={n.key}
                  n={n}
                  unread={!read.has(n.key)}
                  clickable={!!n.page && allowed.has(n.page)}
                  detailClickable={d => !!d.page && allowed.has(d.page)}
                  onClick={() => onItem(n)}
                  onDetail={d => onDetail(n, d)}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationRow({
  n,
  unread,
  clickable,
  detailClickable,
  onClick,
  onDetail,
}: {
  n: AppNotification
  unread: boolean
  clickable: boolean
  detailClickable: (d: NotificationDetail) => boolean
  onClick: () => void
  onDetail: (d: NotificationDetail) => void
}) {
  const style = KIND_STYLE[n.kind] ?? KIND_STYLE.event
  const Icon = style.icon
  return (
    <li className={cn('relative transition-colors', unread ? 'bg-card' : 'bg-card/60')}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full gap-3 px-4 py-3 text-left transition-colors outline-none focus-visible:bg-accent',
          clickable ? 'hover:bg-accent' : 'cursor-default'
        )}
      >
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', style.tone)}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className={cn('min-w-0 flex-1 text-sm leading-snug', unread ? 'font-medium' : 'text-muted-foreground')}>
              {n.title}
            </span>
            {n.time && <span className="shrink-0 pt-px text-xs text-muted-foreground">{n.time}</span>}
          </span>
          <span className="mt-0.5 flex items-end gap-1 text-xs text-muted-foreground">
            <span className="line-clamp-2 min-w-0">{n.subtitle}</span>
            {clickable && !n.details?.length && <ChevronRight className="size-3.5 shrink-0 opacity-60" />}
          </span>
        </span>
        {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Не прочитано" />}
      </button>
      {n.details && n.details.length > 0 && (
        <div className="-mt-1 space-y-px pr-4 pb-2.5 pl-13">
          {n.details.map(d => {
            const can = detailClickable(d)
            return (
              <button
                key={d.key}
                type="button"
                disabled={!can}
                onClick={() => onDetail(d)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors outline-none hover:bg-accent focus-visible:bg-accent disabled:hover:bg-transparent"
              >
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                {d.value && <span className="num shrink-0 text-muted-foreground">{d.value}</span>}
              </button>
            )
          })}
        </div>
      )}
    </li>
  )
}
