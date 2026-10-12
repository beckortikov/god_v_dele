'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, Copy, Minus, Plus, Settings2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Panel } from '@/components/erp/page-header'
import { Meter, PanelHeading, PeriodStepper } from '@/components/wheels/parts'
import { WheelRadar } from '@/components/wheels/wheel-radar'
import { average, MAX_SCORE, previousRatedMonth, ratedCount, stepScore, weakestSphere, type YearScores } from '@/lib/life-balance'

/**
 * The participant's own «Колесо жизни»: one month at a time, scores set with
 * − / + buttons (no typing on a phone), the radar on top so every tap shows up
 * immediately, and last month as a quiet outline to compare against.
 * Loading and saving stay in the page; this only draws and reports edits.
 */
export function LifeBalanceSelf({
  months,
  year,
  focusIdx,
  onFocusIdx,
  curMonthIdx,
  isCurrentYear,
  categories,
  defaultCategories,
  ideals,
  monthly,
  loading,
  onScore,
  onIdeal,
  onCopyMonth,
  onRename,
  onRemove,
  onAdd,
}: {
  months: string[]
  year: number
  focusIdx: number
  onFocusIdx: (i: number) => void
  curMonthIdx: number
  isCurrentYear: boolean
  categories: string[]
  defaultCategories: string[]
  ideals: Record<string, number>
  monthly: YearScores
  loading: boolean
  onScore: (cat: string, value: number) => void
  onIdeal: (cat: string, value: number) => void
  onCopyMonth: (fromIdx: number) => void
  onRename: (index: number, name: string) => void
  onRemove: (index: number) => void
  onAdd: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const month = months[focusIdx]
  const scores = monthly[month]
  const prevIdx = previousRatedMonth(monthly, months, focusIdx)
  const prevScores = prevIdx === null ? undefined : monthly[months[prevIdx]]
  const idealOf = (c: string) => ideals[c] ?? MAX_SCORE

  const rated = ratedCount(scores, categories)
  const avg = average(scores, categories)
  const prevAvg = average(prevScores, categories)
  const weakest = weakestSphere(scores, ideals, categories)

  const chartData = React.useMemo(
    () =>
      categories.map(c => ({
        category: c,
        ideal: ideals[c] ?? MAX_SCORE,
        prev: prevScores?.[c] ?? 0,
        cur: scores?.[c] ?? 0,
      })),
    [categories, ideals, scores, prevScores]
  )
  const series = [
    { key: 'ideal', name: 'Мой идеал', color: 'var(--muted-foreground)', dashed: true },
    ...(prevIdx !== null ? [{ key: 'prev', name: months[prevIdx], color: 'var(--chart-3)' }] : []),
    { key: 'cur', name: month, color: 'var(--primary)' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PeriodStepper
        label={`${month} ${year}`}
        onPrev={() => onFocusIdx(focusIdx - 1)}
        onNext={() => onFocusIdx(focusIdx + 1)}
        prevDisabled={focusIdx <= 0}
        nextDisabled={focusIdx >= months.length - 1}
        onReset={isCurrentYear && focusIdx !== curMonthIdx ? () => onFocusIdx(curMonthIdx) : undefined}
      />

      {/* Picture and summary */}
      <Panel>
        <div className="grid grid-cols-3 divide-x border-b text-center">
          <Summary label="Средняя" value={avg === null ? '–' : String(avg).replace('.', ',')} delta={avg !== null && prevAvg !== null ? Math.round((avg - prevAvg) * 10) / 10 : null} />
          <Summary label="Оценено" value={`${rated}/${categories.length}`} />
          <Summary label="Сильнее растить" value={weakest ? weakest.category : rated ? 'всё в идеале' : '–'} small />
        </div>
        <div className="px-1 pt-1 pb-3 sm:px-4">
          {loading ? <Skeleton className="mx-4 my-6 h-64 rounded-2xl" /> : <WheelRadar data={chartData} series={series} max={MAX_SCORE} height={290} />}
        </div>
      </Panel>

      {/* Scores */}
      <Panel className="overflow-visible">
        <PanelHeading
          title="Оценки за месяц"
          description="0 — совсем плохо, 10 — идеально"
          actions={
            <Button variant={editing ? 'soft' : 'ghost'} size="sm" onClick={() => setEditing(v => !v)}>
              {editing ? 'Готово' : <><Settings2 /> Настроить</>}
            </Button>
          }
          className="rounded-t-xl"
        />

        {!loading && rated === 0 && prevIdx !== null && (
          <div className="flex items-center gap-3 border-b bg-primary-soft/60 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm text-primary-soft-foreground">Начните с оценок за {months[prevIdx].toLowerCase()} и поправьте, что изменилось.</p>
            <Button variant="outline" size="sm" onClick={() => onCopyMonth(prevIdx)} className="shrink-0 bg-card">
              <Copy /> Взять
            </Button>
          </div>
        )}

        {loading ? (
          <div className="divide-y">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-10 w-32" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y">
            {categories.map((cat, idx) => {
              const val = scores?.[cat]
              const prev = prevScores?.[cat]
              const ideal = idealOf(cat)
              const custom = !defaultCategories.includes(cat)
              const diff = val !== undefined && prev !== undefined ? val - prev : null
              return (
                <li key={idx} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      {editing && custom ? (
                        <Input aria-label="Название сферы" value={cat} onChange={e => onRename(idx, e.target.value)} className="h-10" />
                      ) : (
                        <p className="truncate text-[15px] font-medium first-letter:uppercase">{cat}</p>
                      )}
                      <Meter value={val ?? 0} max={MAX_SCORE} marker={ideal} tone={val !== undefined && val >= ideal ? 'success' : 'primary'} className="mt-2" />
                    </div>
                    <Stepper
                      label={cat}
                      value={val}
                      delta={diff}
                      onMinus={() => onScore(cat, stepScore(val, -1, prev))}
                      onPlus={() => onScore(cat, stepScore(val, 1, prev))}
                    />
                  </div>
                  {editing && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2">
                      <span className="flex-1 text-sm text-muted-foreground">Мой идеал</span>
                      <Stepper
                        compact
                        label={`Идеал: ${cat}`}
                        value={ideal}
                        onMinus={() => onIdeal(cat, Math.max(0, ideal - 1))}
                        onPlus={() => onIdeal(cat, Math.min(MAX_SCORE, ideal + 1))}
                      />
                      {custom && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Удалить ${cat}`}
                          onClick={() => onRemove(idx)}
                          className="size-10 shrink-0 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
            {editing && (
              <li className="px-4 py-3">
                <Button variant="outline" onClick={onAdd} className="h-11 w-full">
                  <Plus /> Добавить сферу
                </Button>
              </li>
            )}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Summary({ label, value, delta, small }: { label: string; value: string; delta?: number | null; small?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('num max-w-full truncate font-semibold first-letter:uppercase', small ? 'text-sm leading-6' : 'text-xl')}>{value}</span>
      {delta != null && delta !== 0 && (
        <span className={cn('num flex items-center text-xs font-medium', delta > 0 ? 'text-success' : 'text-destructive')}>
          {delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          {String(Math.abs(delta)).replace('.', ',')}
        </span>
      )}
    </div>
  )
}

/** − value + with 44px targets; an empty value shows a dash until the first press. */
function Stepper({
  label,
  value,
  delta,
  compact,
  onMinus,
  onPlus,
}: {
  label: string
  value: number | undefined
  /** Change against last month, shown under the number. */
  delta?: number | null
  compact?: boolean
  onMinus: () => void
  onPlus: () => void
}) {
  const btn =
    'flex shrink-0 items-center justify-center rounded-full border bg-card text-foreground transition-transform outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30 active:scale-95 disabled:opacity-35 disabled:active:scale-100'
  const size = compact ? 'size-9' : 'size-11'
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-1.5">
      <button type="button" aria-label={`Меньше: ${label}`} onClick={onMinus} disabled={value === 0} className={cn(btn, size)}>
        <Minus className="size-4" />
      </button>
      <div className="flex w-9 flex-col items-center leading-none" aria-live="polite">
        <span className={cn('num font-semibold', compact ? 'text-lg' : 'text-2xl', value === undefined && 'text-muted-foreground')}>{value ?? '–'}</span>
        {!compact && delta != null && delta !== 0 && (
          <span className={cn('num mt-1 text-[11px] font-medium', delta > 0 ? 'text-success' : 'text-destructive')}>{delta > 0 ? `+${delta}` : delta}</span>
        )}
      </div>
      <button type="button" aria-label={`Больше: ${label}`} onClick={onPlus} disabled={value === MAX_SCORE} className={cn(btn, size)}>
        <Plus className="size-4" />
      </button>
    </div>
  )
}
