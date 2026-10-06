'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/erp/segmented'
import { formatMoney } from '@/lib/format'

export type Currency = 'USD' | 'TJS'

/** Amount + currency switch + exchange rate (for TJS). */
export function MoneyInput({
  id,
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  rate,
  onRateChange,
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
  invalid?: boolean
  autoFocus?: boolean
}) {
  const usd = currency === 'TJS' && Number(rate) > 0 ? Number(amount) / Number(rate) : null
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
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor={`${id}-rate`} className="text-muted-foreground">
            Курс
          </label>
          <Input
            id={`${id}-rate`}
            type="number"
            step="0.01"
            min="0"
            value={rate}
            onChange={e => onRateChange(e.target.value)}
            className="num h-8 w-24"
          />
          <span className="text-muted-foreground">TJS за $1</span>
          {usd !== null && amount && (
            <span className="num ml-auto font-medium">≈ {formatMoney(Math.round(usd * 100) / 100)}</span>
          )}
        </div>
      )}
    </div>
  )
}
