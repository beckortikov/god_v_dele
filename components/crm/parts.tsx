'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/** Soft pill colours by badge variant, shared by «Обзвон» and Instagram. */
export const PILL = {
  secondary: 'bg-muted text-muted-foreground',
  warning: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
  default: 'bg-primary-soft text-primary-soft-foreground',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  destructive: 'bg-destructive-soft text-destructive',
} as const

export const DOT = {
  secondary: 'bg-muted-foreground/45',
  warning: 'bg-warning',
  default: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  destructive: 'bg-destructive',
} as const

const TONES = ['bg-[oklch(0.62_0.15_45)]', 'bg-[oklch(0.55_0.15_255)]', 'bg-[oklch(0.52_0.17_295)]', 'bg-[oklch(0.5_0.09_185)]', 'bg-[oklch(0.55_0.16_350)]', 'bg-[oklch(0.56_0.12_75)]']

export const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('') || '·'

export const toneOf = (key: string) => TONES[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length]

/** «Сегодня», «Вчера» or «21 ноября». */
export function dayLabel(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) })
}

export const clock = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/** List time: «14:32» today, «вчера», else «21.11». */
export function shortTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (d.toDateString() === new Date().toDateString()) return clock(iso)
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

/** Profile picture, or initials on a colour when there is none or it fails to load. */
export function PersonAvatar({ name, picture, seed, size = 'md', className }: { name: string; picture?: string | null; seed: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [broken, setBroken] = React.useState(false)
  const box = size === 'lg' ? 'size-20 text-2xl' : size === 'sm' ? 'size-9 text-xs' : 'size-12 text-base'
  if (picture && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn('shrink-0 rounded-full bg-muted object-cover', box, className)} />
  }
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', box, toneOf(seed), className)}>
      {initials(name)}
    </span>
  )
}

const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** Phones and tablets: Enter makes a new line there, sending is the button. */
export function useTouchKeyboard() {
  const [touch, setTouch] = React.useState(false)
  React.useEffect(() => setTouch(!!coarse()), [])
  return touch
}

/**
 * Whether this Enter should send the message. Never while the keyboard is still composing a word
 * (Android, predictive input), otherwise the last word or letters are lost; never on touch screens.
 */
export function enterSends(e: React.KeyboardEvent): boolean {
  if (e.key !== 'Enter' || e.shiftKey) return false
  if (e.nativeEvent.isComposing || e.keyCode === 229) return false
  return !coarse()
}
