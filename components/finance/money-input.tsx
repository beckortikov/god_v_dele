'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/erp/segmented'
import { formatMoney } from '@/lib/format'
import { shortRateDate, useNbtRate } from '@/lib/exchange-rate'

export type Currency = 'USD' | 'TJS'

/**
 * Amount + currency switch + exchange rate (for TJS).
 *
 * With `rateDate`, the rate is pre-filled from the National Bank of Tajikistan
 * for that day and follows the date until the user types their own rate.
 * `rateLocked` (e.g. editing a saved TJS record) keeps the given rate and only
 * offers the NBT one.
 */
export function MoneyInput({
  id,
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  rate,
  onRateChange,
  rateDate,
  rateLocked,
  invalid,
  autoFocus,
}: {
  id?: string
  amount: string
  onAmountChange: (v: string) => void
  currency: Currency
  onCurrencyChange: (c: Currency) => void
  rate: string
  onRateChange: (v: string) => void
  /** Operation date (YYYY-MM-DD). Enables the NBT rate. */
  rateDate?: string
  /** The current rate was chosen earlier: do not overwrite it automatically. */
  rateLocked?: boolean
  invalid?: boolean
  autoFocus?: boolean
}) {
  const [manual, setManual] = React.useState(!!rateLocked)
  React.useEffect(() => setManual(!!rateLocked), [rateLocked])

  const auto = currency === 'TJS' && !!rateDate
  const nbt = useNbtRate(rateDate, 'USD', auto)
  const nbtRate = nbt.data?.rate ?? null

  // Follow the NBT rate (and the date) until the user sets their own.
  React.useEffect(() => {
    if (!auto || manual || nbtRate == null) return
    if (Number(rate) !== nbtRate) onRateChange(String(nbtRate))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, manual, nbtRate, rate])

  const usd = currency === 'TJS' && Number(rate) > 0 ? Number(amount) / Number(rate) : null
  const differs = nbtRate != null && Number(rate) !== nbtRate

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            placeholder="0"
            value={amount}
            autoFocus={autoFocus}
            aria-invalid={invalid || undefined}
            onChange={e => onAmountChange(e.target.value)}
            className="num h-10 pr-14 text-base font-medium"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
            {currency}
          </span>
        </div>
        <Segmented
          aria-label="Валюта"
          value={currency}
          onChange={onCurrencyChange}
          options={[
            { value: 'USD', label: 'USD' },
            { value: 'TJS', label: 'TJS' },
          ]}
          className="h-10 [&>button]:h-9"
        />
      </div>
      {currency === 'TJS' && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <label htmlFor={`${id}-rate`} className="text-muted-foreground">
            Курс
          </label>
          <Input
            id={`${id}-rate`}
            type="number"
            step="0.0001"
            min="0"
            value={rate}
            onChange={e => {
              setManual(true)
              onRateChange(e.target.value)
            }}
            className="num h-8 w-24"
          />
          <span className="text-muted-foreground">TJS за $1</span>
          {usd !== null && amount && (
            <span className="num ml-auto font-medium">≈ {formatMoney(Math.round(usd * 100) / 100)}</span>
          )}
          {auto && <NbtNote nbt={nbt} differs={differs} onApply={() => setManual(false)} />}
        </div>
      )}
    </div>
  )
}

function NbtNote({
  nbt,
  differs,
  onApply,
}: {
  nbt: ReturnType<typeof useNbtRate>
  differs: boolean
  onApply: () => void
}) {
  if (nbt.loading) {
    return (
      <span className="flex basis-full items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Загружаем курс НБТ…
      </span>
    )
  }
  if (nbt.error || !nbt.data) {
    return <span className="basis-full text-xs text-muted-foreground">Курс НБТ недоступен, укажите курс вручную</span>
  }
  const label = `курс НБТ на ${shortRateDate(nbt.data.date)}`
  if (!differs) return <span className="basis-full text-xs text-muted-foreground">{label}</span>
  return (
    <span className="basis-full text-xs text-muted-foreground">
      Свой курс · {label}: <span className="num">{nbt.data.rate}</span>{' '}
      <button
        type="button"
        onClick={onApply}
        className="rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        Подставить
      </button>
    </span>
  )
}
