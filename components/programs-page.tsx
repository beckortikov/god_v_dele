'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { BookOpen, Inbox, Plus, Trash2 } from 'lucide-react'

import { formatMoney, formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { TableSkeleton, rowActionsCls, dangerIconCls } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { ExportButton } from '@/components/erp/export-button'
import { exportToExcel } from '@/components/erp/export'
import { ProgramSheet } from '@/components/participants/program-sheet'
import type { Program } from '@/components/participants/types'

const monthsWord = (n: number) => plural(n, ['месяц', 'месяца', 'месяцев'])

export function ProgramsPage() {
  const confirm = useConfirm()

  const [programs, setPrograms] = React.useState<Program[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isAddOpen, setIsAddOpen] = React.useState(false)

  const fetchPrograms = React.useCallback(async () => {
    try {
      const res = await fetch('/api/programs')
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setPrograms(result.data || [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchPrograms()
  }, [fetchPrograms])

  const handleDelete = async (program: Program) => {
    const ok = await confirm({
      title: `Удалить программу «${program.name}»?`,
      description: 'Действие нельзя отменить. Проверьте, что в программе не осталось участников.',
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return

    try {
      const res = await fetch(`/api/programs/${program.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      setPrograms(list => list.filter(p => p.id !== program.id))
      toast.success('Программа удалена', { description: program.name })
    } catch (err: any) {
      toast.error('Не удалось удалить программу', { description: err.message })
    }
  }

  const handleCreated = (program: Program) => {
    // Keep the same order as the server (by name)
    setPrograms(list => [...list, program].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
  }

  const runExport = () =>
    exportToExcel({
      filename: 'Программы',
      rows: programs,
      columns: [
        { header: 'Программа', value: p => p.name },
        { header: 'Цена в месяц, USD', value: p => Number(p.price_per_month || 0), type: 'money' },
        { header: 'Длительность, мес.', value: p => Number(p.duration_months || 0), type: 'number' },
        { header: 'Полная стоимость, USD', value: p => Number(p.price_per_month || 0) * Number(p.duration_months || 0), type: 'money' },
      ],
    })

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Программы" />
        <Panel>
          <EmptyState
            icon={Inbox}
            title="Не удалось загрузить программы"
            description={error}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  fetchPrograms()
                }}
              >
                Повторить
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Программы"
        description={
          loading
            ? 'Образовательные продукты и их стоимость'
            : `${formatNumber(programs.length)} ${plural(programs.length, ['программа', 'программы', 'программ'])} · цены и длительность обучения`
        }
        actions={
          <>
            <ExportButton empty={loading || !programs.length} onExport={runExport} />
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
              <Plus /> Новая программа
            </Button>
          </>
        }
      />

      {loading ? (
        <TableSkeleton rows={4} toolbar={false} />
      ) : programs.length === 0 ? (
        <Panel>
          <EmptyState
            icon={BookOpen}
            title="Программ пока нет"
            description="Создайте первую программу, чтобы добавлять в неё участников"
            action={
              <Button size="sm" onClick={() => setIsAddOpen(true)}>
                <Plus /> Новая программа
              </Button>
            }
          />
        </Panel>
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Программа</TableHead>
                <TableHead className="text-right">Цена в месяц</TableHead>
                <TableHead className="text-right max-sm:hidden">Длительность</TableHead>
                <TableHead className="text-right max-sm:hidden">Полная стоимость</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.map(program => {
                const price = Number(program.price_per_month || 0)
                const months = Number(program.duration_months || 0)
                return (
                  <TableRow key={program.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                          <BookOpen className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{program.name}</div>
                          <div className="num text-xs text-muted-foreground sm:hidden">
                            {months} {monthsWord(months)} · {formatMoney(price * months)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="num text-right font-medium">{formatMoney(price)}</TableCell>
                    <TableCell className="num text-right text-muted-foreground max-sm:hidden">
                      {months} {monthsWord(months)}
                    </TableCell>
                    <TableCell className="num text-right max-sm:hidden">{formatMoney(price * months)}</TableCell>
                    <TableCell className="text-right">
                      <div className={rowActionsCls}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Удалить «${program.name}»`}
                          className={dangerIconCls}
                          onClick={() => handleDelete(program)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Panel>
      )}

      <ProgramSheet open={isAddOpen} onOpenChange={setIsAddOpen} onCreated={handleCreated} />
    </PageContainer>
  )
}
