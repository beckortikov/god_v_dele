'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Copy, DatabaseZap, History, Inbox, RefreshCw, RotateCcw, SearchX, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatNumber, plural } from '@/lib/format'
import { ACTION_LABELS, RESTORABLE_TABLES, TABLE_LABELS, tableLabel, type AuditActionName, type AuditEntry } from '@/lib/audit-labels'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TablePagination } from '@/components/erp/pagination'
import { TableSkeleton } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { ExportButton } from '@/components/erp/export-button'
import { exportToExcel } from '@/components/erp/export'
import { BulkBar, SelectCell, SelectHeadCell, requestOk, useBulkRunner, useRowSelection } from '@/components/erp/bulk'
import { readPref, writePref } from '@/components/finance/types'
import { AuditDetailSheet } from '@/components/admin/audit/audit-detail-sheet'
import { ACTION_BADGE, fullWhen, whenLabel } from '@/components/admin/audit/format'
import { AUDIT_MIGRATION_SQL } from '@/components/admin/audit/migration-sql'

type Tab = 'all' | 'trash'
type Period = 'today' | 'week' | 'month30' | 'month' | 'all'

const PAGE_SIZE = 50
/** Export fetches every matching row page by page (the API allows ≤ 200 per page). */
const EXPORT_PAGE_SIZE = 200
const EXPORT_LIMIT = 10000
const PREFS_KEY = 'audit-page-prefs'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Последние 7 дней' },
  { value: 'month30', label: 'Последние 30 дней' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'all', label: 'Всё время' },
]

/** Start of the period in the user's local time zone, as an ISO timestamp. */
function periodFrom(p: Period): string | null {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (p) {
    case 'today':
      return today.toISOString()
    case 'week':
      return new Date(today.getTime() - 6 * 864e5).toISOString()
    case 'month30':
      return new Date(today.getTime() - 29 * 864e5).toISOString()
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    default:
      return null
  }
}

const SECTION_OPTIONS = Object.entries(TABLE_LABELS).sort((a, b) => a[1].localeCompare(b[1], 'ru'))
const ACTION_OPTIONS = Object.entries(ACTION_LABELS) as [AuditActionName, string][]

type LoadState = 'loading' | 'ready' | 'error' | 'migration'

interface Filters {
  tab: Tab
  period: Period
  table: string
  action: string
  actor: string
  q: string
}

function buildParams(f: Filters, tab: Tab, page: number, pageSize: number) {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (tab === 'trash') p.set('trash', '1')
  else if (f.action !== 'all') p.set('action', f.action)
  if (f.table !== 'all') p.set('table', f.table)
  if (f.actor !== 'all') p.set('actor', f.actor)
  const from = periodFrom(f.period)
  if (from) p.set('from', from)
  if (f.q.trim()) p.set('q', f.q.trim())
  return p
}

async function fetchAudit(params: URLSearchParams): Promise<{ data: AuditEntry[]; total: number } | 'migration'> {
  const res = await fetch(`/api/audit?${params}`)
  const json = await res.json().catch(() => ({}))
  if (json?.error === 'migration_required') return 'migration'
  if (!res.ok || json?.error) throw new Error(json?.error || `Ошибка ${res.status}`)
  return { data: json.data ?? [], total: json.total ?? 0 }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers without clipboard permission
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function AuditPage() {
  const confirm = useConfirm()

  const [tab, setTab] = React.useState<Tab>('all')
  const [period, setPeriod] = React.useState<Period>('month30')
  const [table, setTable] = React.useState('all')
  const [action, setAction] = React.useState('all')
  const [actor, setActor] = React.useState('all')
  const [query, setQuery] = React.useState('')
  const [debouncedQuery, setDebouncedQuery] = React.useState('')
  const [page, setPage] = React.useState(1)

  const [state, setState] = React.useState<LoadState>('loading')
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [rows, setRows] = React.useState<AuditEntry[]>([])
  const [total, setTotal] = React.useState(0)
  const [counts, setCounts] = React.useState<{ all?: number; trash?: number }>({})
  const [actors, setActors] = React.useState<{ id: string; name: string }[]>([])
  const [reloadKey, setReloadKey] = React.useState(0)

  const [selected, setSelected] = React.useState<AuditEntry | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [restoringId, setRestoringId] = React.useState<string | null>(null)

  // Persisted view prefs
  React.useEffect(() => {
    try {
      const saved = JSON.parse(readPref(PREFS_KEY) || '{}')
      if (saved.tab === 'all' || saved.tab === 'trash') setTab(saved.tab)
      if (PERIODS.some(p => p.value === saved.period)) setPeriod(saved.period)
    } catch {}
  }, [])
  React.useEffect(() => {
    writePref(PREFS_KEY, JSON.stringify({ tab, period }))
  }, [tab, period])

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // Any filter change returns to the first page
  React.useEffect(() => setPage(1), [tab, period, table, action, actor, debouncedQuery])

  const filters: Filters = React.useMemo(
    () => ({ tab, period, table, action, actor, q: debouncedQuery }),
    [tab, period, table, action, actor, debouncedQuery]
  )

  React.useEffect(() => {
    let alive = true
    setRefreshing(true)
    const other: Tab = tab === 'all' ? 'trash' : 'all'
    Promise.all([fetchAudit(buildParams(filters, tab, page, PAGE_SIZE)), fetchAudit(buildParams(filters, other, 1, 1))])
      .then(([main, side]) => {
        if (!alive) return
        if (main === 'migration' || side === 'migration') {
          setState('migration')
          return
        }
        setRows(main.data)
        setTotal(main.total)
        setCounts({ [tab]: main.total, [other]: side.total })
        setState('ready')
        setError(null)
      })
      .catch(err => {
        if (!alive) return
        setError(err.message)
        setState('error')
      })
      .finally(() => alive && setRefreshing(false))
    return () => {
      alive = false
    }
  }, [filters, tab, page, reloadKey])

  // Users who appear in the журнал (loaded once the table exists)
  React.useEffect(() => {
    if (state !== 'ready' || actors.length) return
    fetch('/api/audit?facet=actors')
      .then(r => r.json())
      .then(j => Array.isArray(j?.data) && setActors(j.data))
      .catch(() => {})
  }, [state, actors.length])

  const reload = () => setReloadKey(k => k + 1)

  const openEntry = (e: AuditEntry) => {
    setSelected(e)
    setSheetOpen(true)
  }

  const restore = async (e: AuditEntry) => {
    const ok = await confirm({
      title: 'Восстановить запись?',
      description: (
        <>
          «{e.summary || tableLabel(e.table_name)}» вернётся в раздел «{tableLabel(e.table_name)}» с данными на момент удаления.
        </>
      ),
      confirmText: 'Восстановить',
    })
    if (!ok) return
    setRestoringId(e.id)
    try {
      const res = await fetch('/api/audit/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) throw new Error(json.error || `Ошибка ${res.status}`)
      toast.success('Запись восстановлена', { description: e.summary ?? undefined })
      setSheetOpen(false)
      reload()
    } catch (err: any) {
      toast.error('Не удалось восстановить', { description: err.message })
    } finally {
      setRestoringId(null)
    }
  }

  // ----- Trash: selection and bulk restore -----
  const restorableIds = React.useMemo(
    () => (tab === 'trash' ? rows.filter(e => RESTORABLE_TABLES.has(e.table_name) && !e.restored_at).map(e => e.id) : []),
    [rows, tab]
  )
  const selection = useRowSelection(restorableIds, `${tab}|${period}|${table}|${action}|${actor}|${debouncedQuery}|${page}`)
  const bulk = useBulkRunner()

  const restoreSelected = async () => {
    // Oldest deletion first: a parent (employee, event) comes back before rows that depend on it
    const chosen = rows.filter(e => selection.isSelected(e.id)).sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (!chosen.length) return
    const n = chosen.length
    const ok = await confirm({
      title: `Восстановить ${formatNumber(n)} ${plural(n, ['запись', 'записи', 'записей'])}?`,
      description:
        'Записи вернутся в свои разделы с данными на момент удаления. Восстанавливаем по одной, от более ранних удалений к поздним; если какая-то не вернётся, остальные всё равно будут восстановлены.',
      confirmText: 'Восстановить',
    })
    if (!ok) return
    await bulk.run(
      chosen,
      e =>
        requestOk('/api/audit/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: e.id }),
        }),
      { done: 'Записи восстановлены', noun: ['запись', 'записи', 'записей'], label: e => e.summary || tableLabel(e.table_name) }
    )
    selection.clear()
    reload()
  }

  // ----- Export: every row that matches the current tab and filters -----
  const runExport = async () => {
    const all: AuditEntry[] = []
    for (let p = 1; all.length < EXPORT_LIMIT; p++) {
      const res = await fetchAudit(buildParams(filters, tab, p, EXPORT_PAGE_SIZE))
      if (res === 'migration') throw new Error('Журнал ещё не включён')
      all.push(...res.data)
      if (res.data.length < EXPORT_PAGE_SIZE || all.length >= res.total) break
    }
    const trash = tab === 'trash'
    return exportToExcel({
      filename: trash ? 'Корзина' : 'Журнал изменений',
      rows: all.slice(0, EXPORT_LIMIT),
      columns: [
        { header: trash ? 'Удалено' : 'Время', value: e => e.created_at, type: 'datetime' },
        { header: 'Пользователь', value: e => e.actor_name || 'Не указан' },
        { header: 'Действие', value: e => ACTION_LABELS[e.action] ?? e.action },
        { header: 'Раздел', value: e => tableLabel(e.table_name) },
        { header: 'Описание', value: e => e.summary, width: 80 },
        { header: 'Восстановлено', value: e => e.restored_at, type: 'datetime' },
      ],
    })
  }

  const copySql = async () => {
    if (await copyText(AUDIT_MIGRATION_SQL)) toast.success('SQL скопирован', { description: 'Вставьте его в SQL Editor в Supabase и нажмите Run' })
    else toast.error('Не удалось скопировать', { description: 'Откройте файл migrations/011_audit_log.sql и скопируйте его вручную' })
  }

  const hasFilters = table !== 'all' || actor !== 'all' || (tab === 'all' && action !== 'all') || !!debouncedQuery
  const resetFilters = () => {
    setTable('all')
    setAction('all')
    setActor('all')
    setQuery('')
  }

  const header = (
    <PageHeader
      title="Журнал изменений"
      description="Кто, когда и что изменил. Удалённое можно вернуть из корзины."
      actions={
        state !== 'migration' && (
          <>
            <Select value={period} onValueChange={v => setPeriod(v as Period)}>
              <SelectTrigger size="sm" className="min-w-40" aria-label="Период">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PERIODS.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={reload} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && 'animate-spin')} /> Обновить
            </Button>
            <ExportButton empty={state !== 'ready' || total === 0} onExport={runExport} />
          </>
        )
      }
    />
  )

  if (state === 'migration') {
    return (
      <PageContainer>
        {header}
        <Panel>
          <EmptyState
            icon={DatabaseZap}
            title="Журнал ещё не включён"
            description={
              <>
                Чтобы записывать изменения и вести корзину, выполните миграцию{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">migrations/011_audit_log.sql</code> в SQL Editor
                в Supabase. Она только добавляет таблицу журнала — существующие данные не меняются.
              </>
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" onClick={copySql}>
                  <Copy /> Скопировать SQL
                </Button>
                <Button size="sm" variant="outline" onClick={reload} disabled={refreshing}>
                  <RefreshCw className={cn(refreshing && 'animate-spin')} /> Проверить снова
                </Button>
              </div>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  if (state === 'error') {
    return (
      <PageContainer>
        {header}
        <Panel>
          <EmptyState
            icon={Inbox}
            title="Не удалось загрузить журнал"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={reload}>
                Повторить
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  const isTrash = tab === 'trash'

  return (
    <PageContainer>
      {header}

      <div className="mb-3 overflow-x-auto scrollbar-none">
        <Segmented
          aria-label="Раздел журнала"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'Все изменения', count: counts.all },
            { value: 'trash', label: 'Корзина', count: counts.trash },
          ]}
        />
      </div>

      {state === 'loading' ? (
        <TableSkeleton />
      ) : (
        <Panel>
          <PanelToolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Поиск по описанию" className="sm:w-72" />
            <Select value={table} onValueChange={setTable}>
              <SelectTrigger size="sm" className="min-w-40" aria-label="Раздел">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все разделы</SelectItem>
                {SECTION_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isTrash && (
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger size="sm" className="min-w-36" aria-label="Действие">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все действия</SelectItem>
                  {ACTION_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger size="sm" className="min-w-40" aria-label="Пользователь">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все пользователи</SelectItem>
                {actors.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">Без пользователя</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={resetFilters}>
                Сбросить
              </Button>
            )}
          </PanelToolbar>

          {rows.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={SearchX}
                title="Ничего не найдено"
                description="Измените поиск, фильтры или период"
                action={
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    Сбросить фильтры
                  </Button>
                }
              />
            ) : isTrash ? (
              <EmptyState icon={Trash2} title="Корзина пуста" description="Удалённые записи появятся здесь — их можно будет вернуть одним нажатием." />
            ) : (
              <EmptyState
                icon={History}
                title="Изменений пока нет"
                description={period === 'all' ? 'Как только кто-то создаст, изменит или удалит запись, она появится здесь.' : 'За выбранный период ничего не менялось.'}
              />
            )
          ) : (
            <div className={cn('transition-opacity duration-200', refreshing && 'opacity-60')}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {isTrash && <SelectHeadCell selection={selection} label="Выбрать все восстанавливаемые записи" disabled={!restorableIds.length} />}
                    <TableHead className="w-36 max-sm:w-24">{isTrash ? 'Удалено' : 'Время'}</TableHead>
                    <TableHead className="w-44 max-sm:hidden">Пользователь</TableHead>
                    {!isTrash && <TableHead className="w-32 max-sm:hidden">Действие</TableHead>}
                    <TableHead className="w-40 max-md:hidden">Раздел</TableHead>
                    <TableHead>Описание</TableHead>
                    {isTrash && <TableHead className="w-36" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(e => {
                    const restorable = RESTORABLE_TABLES.has(e.table_name)
                    return (
                      <TableRow
                        key={e.id}
                        className="group cursor-pointer"
                        data-state={selection.isSelected(e.id) ? 'selected' : undefined}
                        onClick={() => openEntry(e)}
                      >
                        {isTrash && (
                          <SelectCell
                            selection={selection}
                            id={e.id}
                            disabled={!restorable || !!e.restored_at}
                            label={`Выбрать: ${e.summary || tableLabel(e.table_name)}`}
                          />
                        )}
                        <TableCell className="num text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="max-sm:flex max-sm:flex-col">
                                {whenLabel(e.created_at)
                                  .split(', ')
                                  .map((part, i) => (
                                    <span key={i}>
                                      {i > 0 && <span className="max-sm:hidden">, </span>}
                                      {part}
                                    </span>
                                  ))}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">{fullWhen(e.created_at)}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="max-w-44 truncate max-sm:hidden">
                          {e.actor_name || <span className="text-muted-foreground">Не указан</span>}
                        </TableCell>
                        {!isTrash && (
                          <TableCell className="max-sm:hidden">
                            <span className="flex items-center gap-1.5">
                              <Badge variant={ACTION_BADGE[e.action] ?? 'secondary'}>{ACTION_LABELS[e.action] ?? e.action}</Badge>
                              {e.restored_at && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <RotateCcw className="size-3.5 text-muted-foreground" aria-label="Восстановлено" />
                                  </TooltipTrigger>
                                  <TooltipContent>Восстановлено {fullWhen(e.restored_at)}</TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground max-md:hidden">{tableLabel(e.table_name)}</TableCell>
                        <TableCell className="max-w-0 w-full">
                          <div className="truncate">{e.summary || <span className="text-muted-foreground">Без описания</span>}</div>
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:hidden">
                            {!isTrash && (
                              <Badge variant={ACTION_BADGE[e.action] ?? 'secondary'} className="sm:hidden">
                                {ACTION_LABELS[e.action] ?? e.action}
                              </Badge>
                            )}
                            <span className="truncate">{[e.actor_name, tableLabel(e.table_name)].filter(Boolean).join(' · ')}</span>
                          </div>
                        </TableCell>
                        {isTrash && (
                          <TableCell className="text-right">
                            {restorable ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={restoringId === e.id || bulk.running}
                                onClick={ev => {
                                  ev.stopPropagation()
                                  restore(e)
                                }}
                              >
                                <RotateCcw /> Восстановить
                              </Button>
                            ) : (
                              <span className="pr-2 text-xs text-muted-foreground">Не восстанавливается</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2.5 text-sm sm:px-4">
                <span className="text-muted-foreground">
                  {isTrash ? 'В корзине' : 'Найдено'} ·{' '}
                  <span className="num">
                    {formatNumber(total)} {plural(total, ['запись', 'записи', 'записей'])}
                  </span>
                </span>
                {isTrash && <span className="text-xs text-muted-foreground max-sm:hidden">Нажмите на строку, чтобы увидеть удалённые данные</span>}
              </div>
              <TablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
          )}
        </Panel>
      )}

      <BulkBar count={isTrash ? selection.count : 0} onClear={selection.clear} progress={bulk.progress}>
        <Button size="sm" onClick={restoreSelected}>
          <RotateCcw /> Восстановить выбранные
        </Button>
      </BulkBar>

      <AuditDetailSheet
        entry={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRestore={restore}
        restoring={!!selected && restoringId === selected.id}
      />
    </PageContainer>
  )
}
