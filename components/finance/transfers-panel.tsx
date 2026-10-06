'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ArrowLeftRight, ArrowRight, DatabaseZap, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Panel, PanelToolbar } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { rowActionsCls, dangerIconCls } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { formatDate, formatMoney } from '@/lib/format'
import { TransferSheet } from '@/components/finance/transfer-sheet'
import type { Account } from '@/components/finance/types'

export interface AccountTransfer {
  id: string
  created_at: string
  transfer_date: string
  from_account_id: string | null
  to_account_id: string | null
  amount_from: number
  amount_to: number
  exchange_rate: number
  note: string | null
}

type LoadState = 'loading' | 'ready' | 'migration' | 'error'

/**
 * Recent transfers + the «Перевод» action for the Счета tab. Copes with the
 * account_transfers table not existing yet (migration 012).
 */
export function TransfersPanel({
  accounts,
  visibleAccountIds,
  onChanged,
}: {
  accounts: Account[]
  /** Only show transfers touching these accounts (program filter). */
  visibleAccountIds?: string[]
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [rows, setRows] = React.useState<AccountTransfer[]>([])
  const [state, setState] = React.useState<LoadState>('loading')
  const [errorText, setErrorText] = React.useState('')
  const [open, setOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/account-transfers?limit=50')
      const json = await res.json()
      if (json.error === 'migration_required') {
        setState('migration')
        return
      }
      if (json.error) throw new Error(json.message || json.error)
      setRows(json.data || [])
      setState('ready')
    } catch (err: any) {
      setErrorText(err.message)
      setState('error')
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const byId = React.useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const visible = React.useMemo(() => {
    if (!visibleAccountIds) return rows
    const ids = new Set(visibleAccountIds)
    return rows.filter(r => (r.from_account_id && ids.has(r.from_account_id)) || (r.to_account_id && ids.has(r.to_account_id)))
  }, [rows, visibleAccountIds])

  const remove = async (t: AccountTransfer) => {
    const from = t.from_account_id ? byId.get(t.from_account_id) : undefined
    const to = t.to_account_id ? byId.get(t.to_account_id) : undefined
    const ok = await confirm({
      title: 'Удалить перевод?',
      description: `${from?.name ?? 'Удалённый счёт'} → ${to?.name ?? 'Удалённый счёт'} от ${formatDate(t.transfer_date)}. Остатки на обоих счетах пересчитаются.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/account-transfers?id=${t.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.message || json.error)
      toast.success('Перевод удалён')
      load()
      onChanged()
    } catch (err: any) {
      toast.error('Не удалось удалить перевод', { description: err.message })
    }
  }

  const canTransfer = state === 'ready' && accounts.length >= 2

  return (
    <Panel>
      <PanelToolbar className="justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">Переводы между счетами</h2>
          <p className="text-xs text-muted-foreground">Обмен валюты и перемещение денег. Учитываются в остатках</p>
        </div>
        {state !== 'migration' && (
          <Button size="sm" variant="outline" disabled={!canTransfer} onClick={() => setOpen(true)}>
            <ArrowLeftRight /> Перевод
          </Button>
        )}
      </PanelToolbar>

      {state === 'loading' ? (
        <div className="divide-y">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : state === 'migration' ? (
        <div className="flex gap-3 px-4 py-4 text-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
            <DatabaseZap className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">Переводы появятся после обновления базы данных</p>
            <p className="mt-0.5 text-muted-foreground">
              Примените миграцию <code className="rounded bg-muted px-1 py-0.5 text-[12px]">migrations/012_account_transfers.sql</code> в
              Supabase (SQL Editor). До этого остатки на счетах считаются без переводов, всё остальное работает как раньше.
            </p>
          </div>
        </div>
      ) : state === 'error' ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Не удалось загрузить переводы"
          description={errorText}
          action={
            <Button size="sm" variant="outline" onClick={() => { setState('loading'); load() }}>
              Повторить
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Переводов пока нет"
          description="Например, обмен долларов на сомони или инкассация из кассы на карту"
          action={
            canTransfer && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <ArrowLeftRight /> Перевод
              </Button>
            )
          }
          className="py-10"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">Дата</TableHead>
              <TableHead>Счета</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead className="text-right max-md:hidden">Курс</TableHead>
              <TableHead className="max-lg:hidden">Комментарий</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(t => {
              const from = t.from_account_id ? byId.get(t.from_account_id) : undefined
              const to = t.to_account_id ? byId.get(t.to_account_id) : undefined
              const cross = !!from && !!to && from.currency !== to.currency
              return (
                <TableRow key={t.id} className="group">
                  <TableCell className="num text-muted-foreground">{formatDate(t.transfer_date)}</TableCell>
                  <TableCell className="max-w-80 whitespace-normal">
                    <div className="flex flex-wrap items-center gap-x-1.5 font-medium">
                      <span className="truncate">{from?.name ?? 'Удалённый счёт'}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{to?.name ?? 'Удалённый счёт'}</span>
                    </div>
                    {t.note && <div className="truncate text-xs text-muted-foreground lg:hidden">{t.note}</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="num font-medium">{formatMoney(t.amount_from, from?.currency ?? 'USD')}</div>
                    {cross && <div className="num text-xs text-muted-foreground">→ {formatMoney(t.amount_to, to!.currency)}</div>}
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground max-md:hidden">{cross ? Number(t.exchange_rate) : '—'}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground max-lg:hidden">{t.note || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className={rowActionsCls}>
                      <Button variant="ghost" size="icon-sm" aria-label="Удалить перевод" className={dangerIconCls} onClick={() => remove(t)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <TransferSheet
        open={open}
        onOpenChange={setOpen}
        accounts={accounts}
        onSaved={() => {
          load()
          onChanged()
        }}
      />
    </Panel>
  )
}
