'use client'

import * as React from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboOption } from '@/components/erp/combobox'
import { Segmented } from '@/components/erp/segmented'
import { Kbd } from '@/components/erp/table-parts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TEMPLATE_ID, YEARS, type WheelParticipant } from './shared'

/* ───────────────────────── Participant picker ───────────────────────── */

export function ParticipantPicker({
  participants,
  value,
  onChange,
  className,
}: {
  participants: WheelParticipant[]
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  const options = React.useMemo<ComboOption[]>(
    () => [
      { value: TEMPLATE_ID, label: 'Базовый шаблон', hint: 'для новых', group: 'Шаблон', keywords: 'шаблон template' },
      ...[...participants]
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map(p => ({ value: p.id, label: p.name, hint: p.program?.name, group: 'Участники' })),
    ],
    [participants]
  )
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Выберите участника"
      searchPlaceholder="Имя или программа"
      emptyText="Никого не нашли"
      className={cn('w-full sm:w-72', className)}
    />
  )
}

/* ───────────────────────── Editor / report switch ───────────────────────── */

export type WheelTab = 'editor' | 'report'

export function WheelTabs({
  value,
  onChange,
  editorLabel = 'Колесо участника',
  dirty,
}: {
  value: WheelTab
  onChange: (v: WheelTab) => void
  editorLabel?: string
  dirty?: boolean
}) {
  return (
    <div className="mb-4 overflow-x-auto scrollbar-none">
      <Segmented
        aria-label="Раздел"
        value={value}
        onChange={onChange}
        options={[
          {
            value: 'editor',
            label: (
              <>
                {editorLabel}
                {dirty && <span className="size-1.5 rounded-full bg-warning" aria-label="Есть несохранённые изменения" />}
              </>
            ),
          },
          { value: 'report', label: 'Кто заполнил' },
        ]}
      />
    </div>
  )
}

/* ───────────────────────── Period stepper ───────────────────────── */

export function PeriodStepper({
  label,
  sub,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  onReset,
  className,
}: {
  label: React.ReactNode
  sub?: React.ReactNode
  onPrev: () => void
  onNext: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
  /** Shown as a small «Сейчас» link when the user moved away from the current period. */
  onReset?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex h-9 flex-1 items-center rounded-md border border-input bg-card shadow-xs sm:h-8 sm:flex-none dark:bg-input/25">
        <button
          type="button"
          onClick={onPrev}
          disabled={prevDisabled}
          aria-label="Предыдущий период"
          className="flex h-full w-10 shrink-0 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 sm:w-8"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1 truncate px-2 text-center text-sm whitespace-nowrap sm:min-w-40">
          <span className="font-medium">{label}</span>
          {sub && <span className="ml-1.5 text-muted-foreground max-[360px]:hidden">{sub}</span>}
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          aria-label="Следующий период"
          className="flex h-full w-10 shrink-0 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 sm:w-8"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="max-sm:h-9 text-primary">
          Сейчас
        </Button>
      )}
    </div>
  )
}

export function YearSelect({ value, onChange, className }: { value: number; onChange: (y: number) => void; className?: string }) {
  return (
    <Select value={String(value)} onValueChange={v => onChange(Number(v))}>
      <SelectTrigger size="sm" className={cn('min-w-28 max-sm:h-9', className)} aria-label="Год">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {YEARS.map(y => (
          <SelectItem key={y} value={String(y)}>
            {y} год
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ───────────────────────── Sticky save bar ───────────────────────── */

/**
 * Sits at the bottom of the scroll area: full-bleed on phones, a floating
 * rounded bar on larger screens. `children` replaces the default status text.
 */
export function SaveBar({
  dirty,
  saving,
  disabled,
  onSave,
  children,
}: {
  dirty: boolean
  saving: boolean
  disabled?: boolean
  onSave: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-3 mt-4 max-sm:-mb-10 sm:bottom-4 sm:mx-0">
      <div className="flex items-center gap-3 border-t bg-card px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-pop sm:rounded-xl sm:border sm:py-2.5">
        <div className="min-w-0 flex-1 text-sm">
          {children ?? <SaveStatus dirty={dirty} saving={saving} />}
        </div>
        <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>S</Kbd>
        </span>
        <Button onClick={onSave} disabled={disabled || saving} className="h-11 min-w-32 px-5 sm:h-9">
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  )
}

export function SaveStatus({ dirty, saving }: { dirty: boolean; saving?: boolean }) {
  if (saving) return <span className="text-muted-foreground">Сохраняем…</span>
  return dirty ? (
    <span className="flex items-center gap-2">
      <span className="size-2 shrink-0 rounded-full bg-warning" />
      <span className="truncate">Есть несохранённые изменения</span>
    </span>
  ) : (
    <span className="flex items-center gap-2 text-muted-foreground">
      <Check className="size-4 shrink-0 text-success" />
      <span className="truncate">Всё сохранено</span>
    </span>
  )
}

/* ───────────────────────── Small pieces ───────────────────────── */

/** Thin horizontal progress track. */
export function Meter({
  value,
  max,
  tone = 'primary',
  className,
  marker,
}: {
  value: number
  max: number
  tone?: 'primary' | 'success' | 'destructive' | 'warning'
  className?: string
  /** Optional marker position (same scale as value), e.g. the ideal score. */
  marker?: number
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const fill = {
    primary: 'bg-primary',
    success: 'bg-success',
    destructive: 'bg-destructive',
    warning: 'bg-warning',
  }[tone]
  return (
    <div className={cn('relative h-1.5 overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-200', fill)} style={{ width: `${pct}%` }} />
      {marker !== undefined && max > 0 && (
        <span
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-foreground/50"
          style={{ left: `${Math.min(100, (marker / max) * 100)}%` }}
        />
      )}
    </div>
  )
}

export function PanelHeading({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b px-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="-my-0.5 flex shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>}
    </div>
  )
}
