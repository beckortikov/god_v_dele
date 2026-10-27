'use client'

import * as React from 'react'
import { tasksNeedingAttention, type MySprintData } from '@/lib/sprints'
import { todayISO } from '@/lib/format'
import type { PageType } from '@/lib/navigation'
import { buildView, useMyPayments } from '@/components/cabinet/my-payments-page'
import { PARTICIPANT_PAYMENTS_VISIBLE } from '@/lib/feature-flags'

/** Don't ask again sooner than this when the participant just moves between tabs. */
const REFRESH_MS = 60_000

/**
 * Numbers for the participant's tab bar: tasks that want attention (sent back or overdue) on «Спринт»,
 * overdue months on «Оплаты». Loaded once, then refreshed when the participant moves between tabs
 * (at most once a minute) and when they come back to the app. Silent on any error: a badge is a hint.
 */
export function useTabBadges(participantId: string | null, page: PageType): Partial<Record<PageType, number>> {
  const pay = useMyPayments(PARTICIPANT_PAYMENTS_VISIBLE ? participantId : null)
  const retryPayments = pay.retry
  const [sprint, setSprint] = React.useState(0)
  const lastLoad = React.useRef(Date.now())

  const loadSprint = React.useCallback(() => {
    if (!participantId) return
    fetch(`/api/my-sprint?participant_id=${participantId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { data?: MySprintData } | null) => {
        if (j?.data) setSprint(tasksNeedingAttention(j.data.tasks, todayISO()))
      })
      .catch(() => {})
  }, [participantId])

  React.useEffect(() => {
    loadSprint()
  }, [loadSprint])

  const refresh = React.useCallback(() => {
    if (!participantId || Date.now() - lastLoad.current < REFRESH_MS) return
    lastLoad.current = Date.now()
    loadSprint()
    retryPayments()
  }, [participantId, loadSprint, retryPayments])

  React.useEffect(() => {
    refresh()
  }, [page, refresh])

  React.useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const debtMonths = React.useMemo(() => (pay.participant ? buildView(pay.participant, pay.program, pay.payments, pay.receipts).debtMonths : 0), [pay.participant, pay.program, pay.payments, pay.receipts])

  return PARTICIPANT_PAYMENTS_VISIBLE ? { 'my-sprint': sprint, 'my-payments': debtMonths } : { 'my-sprint': sprint }
}
