'use client'

import * as React from 'react'
import type { UserRole } from '@/lib/navigation'

/**
 * The signed-in role as the browser knows it (for hiding buttons only: the server
 * checks the real session on every request).
 */
export function useRole(): UserRole | null {
  const [role, setRole] = React.useState<UserRole | null>(null)
  React.useEffect(() => {
    try {
      setRole((localStorage.getItem('userRole') as UserRole) || null)
    } catch {
      setRole(null)
    }
  }, [])
  return role
}
