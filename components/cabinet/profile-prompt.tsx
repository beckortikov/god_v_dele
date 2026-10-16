'use client'

import * as React from 'react'
import { ChevronRight, UserRound } from 'lucide-react'
import { completeness } from '@/lib/participant-profile'
import type { ProfileData } from '@/app/api/participant-profile/route'
import { useNav } from '@/components/app-shell/nav-context'

/**
 * «Заполните профиль»: shown on the participant's Today page until the profile is complete.
 * Silent when the profile cannot be loaded (migration not applied, offline): it is only a nudge.
 */
export function ProfilePrompt({ participantId }: { participantId: string }) {
  const { navigate } = useNav()
  const [state, setState] = React.useState<{ done: number; total: number; missing: string[] } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    fetch(`/api/participant-profile?participant_id=${participantId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { data?: ProfileData } | null) => {
        if (cancelled || !j?.data) return
        const d = j.data
        setState(completeness(d.profile, d.years.length, d.scans.length))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [participantId])

  if (!state || state.done === state.total) return null
  return (
    <button
      type="button"
      onClick={() => navigate('my-profile')}
      className="flex w-full items-center gap-3.5 rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <UserRound className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Заполните профиль</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">
          Заполнено {state.done} из {state.total}. Не хватает: {state.missing.join(', ').toLowerCase()}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
