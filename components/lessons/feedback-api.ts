'use client'

import * as React from 'react'
import type { LessonFeedback } from '@/lib/lesson-feedback'

/**
 * The reviews this participant has already given, by lesson. Silent when the feature is not set up
 * (migration 023) or the server is down: a review is a convenience, nothing else may suffer.
 */
export function useMyFeedback(participantId: string | null) {
  const [given, setGiven] = React.useState<Map<string, LessonFeedback>>(new Map())
  const [ready, setReady] = React.useState(false)
  const [available, setAvailable] = React.useState(true)

  React.useEffect(() => {
    if (!participantId) return
    let cancelled = false
    fetch(`/api/lesson-feedback?participant_id=${participantId}`)
      .then(async r => {
        if (cancelled) return
        if (!r.ok) {
          setAvailable(false)
          return
        }
        const j = (await r.json()) as { data?: LessonFeedback[] }
        setGiven(new Map((j.data ?? []).map(f => [f.lesson_id, f])))
      })
      .catch(() => !cancelled && setAvailable(false))
      .finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [participantId])

  const remember = React.useCallback((f: LessonFeedback) => setGiven(m => new Map(m).set(f.lesson_id, f)), [])
  return { given, ready, available, remember }
}
