'use client'

import * as React from 'react'
import { useNav } from '@/components/app-shell/nav-context'
import { localNotifications } from '@/lib/native-app'
import { planReminders } from '@/lib/native-reminders'
import type { MyLesson } from '@/app/api/my-lessons/route'
import type { MySprintData } from '@/lib/sprints'

/** Plan again when the app comes back to the screen, but not more often than this. */
const RESYNC_MS = 10 * 60_000
const LOOKAHEAD_DAYS = 30

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    return res.ok ? ((await res.json()) as { data: T }).data : null
  } catch {
    return null
  }
}

/**
 * Inside the iOS app: puts reminders of the participant's lessons and sprint deadlines on the phone
 * (lib/native-reminders.ts) and opens the right page when one is tapped. Renders nothing; in a browser
 * it does nothing at all.
 */
export function NativeReminders({ participantId }: { participantId: string }) {
  const { navigate } = useNav()
  const navigateRef = React.useRef(navigate)
  navigateRef.current = navigate

  React.useEffect(() => {
    const ln = localNotifications()
    if (!ln) return
    let cancelled = false
    let last = 0

    const sync = async () => {
      last = Date.now()
      try {
        let { display } = await ln.checkPermissions()
        if (display === 'prompt' || display === 'prompt-with-rationale') display = (await ln.requestPermissions()).display
        if (display !== 'granted' || cancelled) return

        const now = new Date()
        const to = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000)
        const q = (extra: Record<string, string>) => new URLSearchParams({ participant_id: participantId, ...extra })
        const [lessons, sprint] = await Promise.all([
          getJson<MyLesson[]>(`/api/my-lessons?${q({ from: now.toISOString(), to: to.toISOString() })}`),
          getJson<MySprintData>(`/api/my-sprint?${q({})}`),
        ])
        // nothing came back (offline, signed out): keep what is already planned
        if (cancelled || (!lessons && !sprint)) return

        const plan = planReminders(lessons ?? [], sprint?.tasks ?? [], now)
        const { notifications: pending } = await ln.getPending()
        if (pending.length) await ln.cancel({ notifications: pending.map(n => ({ id: n.id })) })
        if (plan.length) {
          await ln.schedule({
            notifications: plan.map(r => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true }, extra: { page: r.page } })),
          })
        }
      } catch {
        // reminders are a convenience: never let them break the cabinet
      }
    }

    sync()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > RESYNC_MS) sync()
    }
    document.addEventListener('visibilitychange', onVisible)

    let listener: ReturnType<typeof ln.addListener> | null = null
    try {
      listener = ln.addListener('localNotificationActionPerformed', e => {
        const page = e.notification?.extra?.page
        if (page === 'my-today' || page === 'my-sprint') navigateRef.current(page)
      })
    } catch {
      // without the tap handler a reminder still opens the app
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      Promise.resolve(listener)
        .then(l => l?.remove())
        .catch(() => {})
    }
  }, [participantId])

  return null
}
