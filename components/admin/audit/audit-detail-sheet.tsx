'use client'

import * as React from 'react'
import { ArrowRight, ChevronDown, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, plural } from '@/lib/format'
import {
  ACTION_LABELS,
  IGNORED_DIFF_FIELDS,
  RESTORABLE_TABLES,
  TECH_FIELDS,
  changedFields,
  fieldLabel,
  tableLabel,
  type AuditEntry,
} from '@/lib/audit-labels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  ACTION_BADGE,
  describeBatchRow,
  formatValue,
  fullWhen,
  isEmptyValue,
  useRefNames,
  type RefNames,
} from '@/components/admin/audit/format'

const fieldsWord = (n: number) => `${formatNumber(n)} ${plural(n, ['поле', 'поля', 'полей'])}`

/** Known fields first (in label order), unknown after, technical last. */
function orderKeys(keys: string[]) {
  const rank = (k: string) => (TECH_FIELDS.has(k) ? 2 : 0)
  return [...keys].sort((a, b) => rank(a) - rank(b))
}

function Value({ table, field, value, row, refs, className }: { table: string; field: string; value: unknown; row: any; refs: RefNames; className?: string }) {
  const f = formatValue(table, field, value, row, refs)
  return (
    <span
      className={cn(
        'min-w-0 break-words',
        f.num && 'num',
        f.mono && 'font-mono text-xs',
        f.text === '—' && 'text-muted-foreground',
        className
      )}
    >
      {f.text}
    </span>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-1 text-[13px] font-medium text-foreground/85">{title}</h3>
      <dl className="divide-y rounded-lg border px-3">{children}</dl>
    </section>
  )
}

function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mt-4">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <ChevronDown className={cn('transition-transform duration-200', open && 'rotate-180')} />
        {label}
      </Button>
      {open && <dl className="mt-1 divide-y rounded-lg border px-3">{children}</dl>}
    </div>
  )
}

/** Fields of a single row (create / delete / restore). */
function RowFields({ table, row, refs }: { table: string; row: Record<string, unknown>; refs: RefNames }) {
  const keys = orderKeys(Object.keys(row))
  const main = keys.filter(k => !TECH_FIELDS.has(k) && !isEmptyValue(row[k]))
  const rest = keys.filter(k => !main.includes(k))
  return (
    <>
      <dl className="divide-y rounded-lg border px-3">
        {main.map(k => (
          <FieldRow key={k} label={fieldLabel(k)}>
            <Value table={table} field={k} value={row[k]} row={row} refs={refs} />
          </FieldRow>
        ))}
        {!main.length && <p className="py-3 text-sm text-muted-foreground">Нет данных</p>}
      </dl>
      {rest.length > 0 && (
        <Collapsible label={`Пустые и служебные · ${fieldsWord(rest.length)}`}>
          {rest.map(k => (
            <FieldRow key={k} label={fieldLabel(k)}>
              <Value table={table} field={k} value={row[k]} row={row} refs={refs} />
            </FieldRow>
          ))}
        </Collapsible>
      )}
    </>
  )
}

/** Field-by-field diff of an update. */
function Diff({ table, before, after, refs }: { table: string; before: Record<string, unknown>; after: Record<string, unknown>; refs: RefNames }) {
  const changed = orderKeys(changedFields(before, after))
  const unchanged = orderKeys(
    [...new Set([...Object.keys(after), ...Object.keys(before)])].filter(k => !changed.includes(k) && !IGNORED_DIFF_FIELDS.has(k))
  )
  return (
    <>
      <Section title={changed.length ? `Изменено · ${fieldsWord(changed.length)}` : 'Изменений в полях нет'}>
        {changed.map(k => (
          <FieldRow key={k} label={fieldLabel(k)}>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <Value table={table} field={k} value={before[k]} row={before} refs={refs} className="text-muted-foreground line-through decoration-muted-foreground/40" />
              <ArrowRight className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-label="стало" />
              <Value table={table} field={k} value={after[k]} row={after} refs={refs} className="font-medium" />
            </div>
          </FieldRow>
        ))}
        {!changed.length && <p className="py-3 text-sm text-muted-foreground">Запись сохранили без изменений.</p>}
      </Section>
      {unchanged.length > 0 && (
        <Collapsible label={`Без изменений · ${fieldsWord(unchanged.length)}`}>
          {unchanged.map(k => (
            <FieldRow key={k} label={fieldLabel(k)}>
              <Value table={table} field={k} value={k in after ? after[k] : before[k]} row={after} refs={refs} />
            </FieldRow>
          ))}
        </Collapsible>
      )}
    </>
  )
}

/** A batch entry (several rows saved at once, e.g. a vacation range in the schedule). */
function BatchRows({ table, title, rows, refs }: { table: string; title: string; rows: any[]; refs: RefNames }) {
  const shown = rows.slice(0, 40)
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-1 text-[13px] font-medium text-foreground/85">
        {title} · {formatNumber(rows.length)} {plural(rows.length, ['запись', 'записи', 'записей'])}
      </h3>
      <ul className="divide-y rounded-lg border px-3 text-sm">
        {shown.map((r, i) => (
          <li key={r?.id ?? i} className="num py-2">
            {describeBatchRow(table, r, refs)}
          </li>
        ))}
        {rows.length > shown.length && <li className="py-2 text-muted-foreground">и ещё {formatNumber(rows.length - shown.length)}</li>}
      </ul>
    </section>
  )
}

function EntryBody({ entry, refs }: { entry: AuditEntry; refs: RefNames }) {
  const { table_name: table, action, before, after } = entry
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

  if (Array.isArray(after) || Array.isArray(before)) {
    return (
      <>
        {Array.isArray(after) && <BatchRows table={table} title="Сохранено" rows={after} refs={refs} />}
        {Array.isArray(before) && before.length > 0 && <BatchRows table={table} title="Было до сохранения" rows={before} refs={refs} />}
      </>
    )
  }
  if (action === 'update' && isObj(before) && isObj(after)) return <Diff table={table} before={before} after={after} refs={refs} />

  const row = action === 'delete' ? before : after ?? before
  if (!isObj(row)) return <p className="text-sm text-muted-foreground">Данные записи не сохранились в журнале.</p>
  return (
    <>
      <h3 className="mb-1 text-[13px] font-medium text-foreground/85">
        {action === 'delete' ? 'Удалённые данные' : action === 'restore' ? 'Восстановленные данные' : 'Данные записи'}
      </h3>
      <RowFields table={table} row={row} refs={refs} />
    </>
  )
}

export function AuditDetailSheet({
  entry,
  open,
  onOpenChange,
  onRestore,
  restoring,
}: {
  entry: AuditEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestore?: (entry: AuditEntry) => void
  restoring?: boolean
}) {
  const refs = useRefNames(open)
  const canRestore =
    !!entry && entry.action === 'delete' && !entry.restored_at && RESTORABLE_TABLES.has(entry.table_name) && !!onRestore

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[520px]" onOpenAutoFocus={e => e.preventDefault()}>
        {entry && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={ACTION_BADGE[entry.action] ?? 'secondary'}>{ACTION_LABELS[entry.action] ?? entry.action}</Badge>
                <Badge variant="secondary">{tableLabel(entry.table_name)}</Badge>
                {entry.restored_at && <Badge variant="outline">Восстановлено</Badge>}
              </div>
              <SheetTitle className="mt-1.5 text-base leading-snug">{entry.summary || `${ACTION_LABELS[entry.action]} · ${tableLabel(entry.table_name)}`}</SheetTitle>
              <SheetDescription>
                {entry.actor_name || 'Пользователь не указан'} · <span className="num">{fullWhen(entry.created_at)}</span>
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              {entry.restored_at && (
                <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Восстановлено <span className="num">{fullWhen(entry.restored_at)}</span>
                  {entry.restored_by ? ` · ${entry.restored_by}` : ''}
                </p>
              )}
              {entry.action === 'delete' && !entry.restored_at && !RESTORABLE_TABLES.has(entry.table_name) && (
                <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Записи раздела «{tableLabel(entry.table_name)}» не восстанавливаются из корзины.
                </p>
              )}
              <EntryBody entry={entry} refs={refs} />
            </SheetBody>
            <SheetFooter className="justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
              {canRestore && (
                <Button onClick={() => onRestore!(entry)} disabled={restoring}>
                  <RotateCcw /> {restoring ? 'Восстанавливаем…' : 'Восстановить'}
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
