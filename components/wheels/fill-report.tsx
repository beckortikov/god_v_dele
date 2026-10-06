'use client'

import * as React from 'react'
import { ChevronRight, Users } from 'lucide-react'
import { plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Panel, PanelToolbar } from '@/components/erp/page-header'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { StatStrip } from '@/components/erp/stat-strip'
import { TableSkeleton, rowActionsCls } from '@/components/erp/table-parts'
import type { WheelParticipant } from './shared'

export interface FillRow {
  participant: WheelParticipant
  /** Number of filled periods. */
  count: number
  /** Human labels of filled periods, newest or most relevant first. */
  periods: string[]
  /** Filled for the current period (this month / week). */
  current: boolean
}

type Status = 'all' | 'filled' | 'empty' | 'current'

export function FillReport({
  rows,
  loading,
  outOf,
  unit,
  currentLabel,
  onOpen,
  toolbarExtra,
  maxBadges = 8,
}: {
  rows: FillRow[]
  loading: boolean
  /** When set, the count reads «3 из 12». */
  outOf?: number
  /** Plural forms for the count without `outOf`, e.g. ['период', 'периода', 'периодов']. */
  unit: [string, string, string]
  /** «в этом месяце» */
  currentLabel: string
  onOpen: (row: FillRow) => void
  toolbarExtra?: React.ReactNode
  maxBadges?: number
}) {
  const [query, setQuery] = React.useState('')
  const [program, setProgram] = React.useState('all')
  const [status, setStatus] = React.useState<Status>('all')

  const programs = React.useMemo(
    () => Array.from(new Set(rows.map(r => r.participant.program?.name).filter(Boolean))) as string[],
    [rows]
  )

  const scoped = rows.filter(r => {
    const q = query.trim().toLowerCase()
    const matchesSearch = !q || r.participant.name.toLowerCase().includes(q)
    const matchesProgram = program === 'all' || r.participant.program?.name === program
    return matchesSearch && matchesProgram
  })
  const visible = scoped.filter(r =>
    status === 'all' ? true : status === 'filled' ? r.count > 0 : status === 'current' ? r.current : r.count === 0
  )

  const filled = scoped.filter(r => r.count > 0).length
  const current = scoped.filter(r => r.current).length

  return (
    <div className="space-y-4">
      <StatStrip
        loading={loading}
        stats={[
          { label: 'Участников', value: scoped.length, onClick: () => setStatus('all') },
          {
            label: 'Заполняли',
            value: filled,
            sub: scoped.length ? `${Math.round((filled / scoped.length) * 100)}% участников` : undefined,
            tone: 'success',
            onClick: () => setStatus('filled'),
          },
          {
            label: 'Ни разу не заполняли',
            value: scoped.length - filled,
            tone: scoped.length - filled > 0 ? 'warning' : 'default',
            onClick: () => setStatus('empty'),
          },
          { label: `Заполнили ${currentLabel}`, value: current, dot: 'var(--primary)', onClick: () => setStatus('current') },
        ]}
      />

      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <Panel>
          <PanelToolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Имя участника" className="sm:w-64" />
            {programs.length > 0 && (
              <Select value={program} onValueChange={setProgram}>
                <SelectTrigger size="sm" className="min-w-40 max-sm:flex-1" aria-label="Программа">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все программы</SelectItem>
                  {programs.map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={status} onValueChange={v => setStatus(v as Status)}>
              <SelectTrigger size="sm" className="min-w-36 max-sm:flex-1" aria-label="Кто заполнил">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="filled">Заполняли</SelectItem>
                <SelectItem value="empty">Не заполняли</SelectItem>
                <SelectItem value="current">Заполнили {currentLabel}</SelectItem>
              </SelectContent>
            </Select>
            {toolbarExtra && <div className="ml-auto flex items-center gap-2">{toolbarExtra}</div>}
          </PanelToolbar>

          {visible.length === 0 ? (
            <EmptyState
              icon={Users}
              title={rows.length ? 'Никого не нашли' : 'Участников пока нет'}
              description={rows.length ? 'Измените поиск или фильтры' : 'Активные участники появятся здесь автоматически'}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Участник</TableHead>
                  <TableHead className="w-32">Заполнено</TableHead>
                  <TableHead className="max-md:hidden">Периоды</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(r => (
                  <TableRow key={r.participant.id} className="group cursor-pointer" onClick={() => onOpen(r)}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{r.participant.name}</div>
                      {r.participant.program?.name && (
                        <div className="text-xs text-muted-foreground">{r.participant.program.name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={r.count > 0 ? 'success' : 'secondary'} className="num">
                          {outOf !== undefined ? `${r.count} из ${outOf}` : r.count > 0 ? `${r.count} ${plural(r.count, unit)}` : 'Нет записей'}
                        </Badge>
                        {r.current && <span className="text-xs text-muted-foreground">есть {currentLabel}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal max-md:hidden">
                      {r.periods.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.periods.slice(0, maxBadges).map(p => (
                            <Badge key={p} variant="outline" className="font-normal">
                              {p}
                            </Badge>
                          ))}
                          {r.periods.length > maxBadges && (
                            <Badge variant="secondary" className="num">
                              +{r.periods.length - maxBadges}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={rowActionsCls}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Открыть колесо: ${r.participant.name}`}
                          onClick={e => {
                            e.stopPropagation()
                            onOpen(r)
                          }}
                        >
                          <ChevronRight />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}
    </div>
  )
}
