'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * «Excel» button for a page header or toolbar. `onExport` builds the file
 * (usually with `exportToExcel`) and returns its name; it may be async when
 * the page needs to fetch every row first.
 *
 *   <ExportButton empty={!filtered.length} onExport={() => exportToExcel({ … })} />
 */
export function ExportButton({
  onExport,
  empty,
  disabled,
  label = 'Excel',
  className,
}: {
  onExport: () => string | void | Promise<string | void>
  /** Nothing to export: the button is disabled with a hint. */
  empty?: boolean
  disabled?: boolean
  label?: string
  className?: string
}) {
  const [busy, setBusy] = React.useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const file = await onExport()
      toast.success('Файл Excel готов', { description: file ? `Сохранён как «${file}»` : undefined })
    } catch (err) {
      console.error('Export failed', err)
      toast.error('Не удалось сформировать файл', { description: (err instanceof Error && err.message) || 'Попробуйте ещё раз' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn(className)}
      onClick={run}
      disabled={disabled || empty || busy}
      title={empty ? 'Нет строк для выгрузки' : 'Скачать таблицу в Excel'}
      aria-label={`Экспорт в Excel${empty ? ': нет строк' : ''}`}
    >
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} {label}
    </Button>
  )
}
