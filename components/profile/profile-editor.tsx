'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ArrowDownRight, ArrowUpRight, Database, FileText, Image as ImageIcon, Loader2, Lock, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { formatMoney, formatNumber, plural } from '@/lib/format'
import { formatSize } from '@/lib/report-files'
import {
  MAX_SCANS,
  SCAN_ACCEPT_ATTR,
  completeness,
  parseYear,
  scanProblem,
  yearlyDynamics,
  type BusinessYear,
  type Currency,
  type ParticipantProfile,
} from '@/lib/participant-profile'
import type { ProfileData } from '@/app/api/participant-profile/route'
import type { ScanFile } from '@/app/api/participant-profile/_lib'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Field } from '@/components/erp/field'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import { ChartTooltip, CHART_COLORS, axisProps, compactTick, gridProps } from '@/components/erp/chart'

class MigrationRequired extends Error {}

async function call<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 503 && body?.error === 'profile_migration_required') throw new MigrationRequired(body.message)
  if (!res.ok || body?.error) throw new Error(body?.error || `Сервер ответил ${res.status}`)
  return body as T
}

type State = { status: 'loading' } | { status: 'ready'; data: ProfileData } | { status: 'migration' } | { status: 'error'; message: string }

const Card = ({ title, hint, children, aside }: { title: string; hint?: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) => (
  <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {aside}
    </div>
    {children}
  </section>
)

/**
 * Personal data, passport, business and the year-by-year dynamics of one participant.
 * `self` is the participant's own page; `staff` is the view of an administrator or wheels manager.
 */
export function ProfileEditor({ participantId, variant }: { participantId: string; variant: 'self' | 'staff' }) {
  const [state, setState] = React.useState<State>({ status: 'loading' })
  const q = `participant_id=${participantId}`

  const load = React.useCallback(async () => {
    try {
      const r = await call<{ data: ProfileData }>(`/api/participant-profile?${q}`)
      setState({ status: 'ready', data: r.data })
    } catch (e) {
      setState(e instanceof MigrationRequired ? { status: 'migration' } : { status: 'error', message: (e as Error).message })
    }
  }, [q])

  React.useEffect(() => {
    setState({ status: 'loading' })
    load()
  }, [load])

  if (state.status === 'loading') {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    )
  }
  if (state.status === 'migration') {
    return (
      <EmptyState
        icon={Database}
        title="Профили ещё не подключены"
        description={
          <>
            Один раз выполните в Supabase → SQL Editor файл{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">migrations/019_participant_profiles.sql</code> и обновите страницу.
          </>
        }
      />
    )
  }
  if (state.status === 'error') {
    return (
      <EmptyState
        title="Не удалось загрузить профиль"
        description={state.message}
        action={
          <Button size="sm" variant="outline" onClick={load}>
            Повторить
          </Button>
        }
      />
    )
  }

  const { data } = state
  return (
    <div className="space-y-4">
      <Overview data={data} variant={variant} />
      <PersonalForm key={data.profile?.updated_at ?? 'new'} participantId={participantId} data={data} onSaved={load} />
      <ScansCard participantId={participantId} scans={data.scans} unavailable={data.scansUnavailable} onChanged={load} />
      <YearsCard participantId={participantId} years={data.years} currency={data.profile?.currency ?? 'TJS'} onChanged={load} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function Overview({ data, variant }: { data: ProfileData; variant: 'self' | 'staff' }) {
  const c = completeness(data.profile, data.years.length, data.scans.length)
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{data.participant.name}</p>
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3 shrink-0" />
            {variant === 'self' ? 'Эти данные видите только вы и администрация школы.' : 'Конфиденциально: фото паспорта и цифры бизнеса. Каждое открытие скана записывается в журнал.'}
          </p>
        </div>
        <Badge variant={c.done === c.total ? 'success' : 'secondary'}>
          Заполнено {c.done} из {c.total}
        </Badge>
      </div>
      <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${c.total}, minmax(0, 1fr))` }} aria-hidden>
        {Array.from({ length: c.total }, (_, i) => (
          <span key={i} className={cn('h-1.5 rounded-full', i < c.done ? 'bg-primary' : 'bg-muted')} />
        ))}
      </div>
      {c.missing.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Не хватает: {c.missing.join(', ').toLowerCase()}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface FormState {
  birth_date: string
  city: string
  activity: string
  business_name: string
  currency: Currency
}

const toForm = (p: ParticipantProfile | null): FormState => ({
  birth_date: p?.birth_date ?? '',
  city: p?.city ?? '',
  activity: p?.activity ?? '',
  business_name: p?.business_name ?? '',
  currency: p?.currency ?? 'TJS',
})

function PersonalForm({ participantId, data, onSaved }: { participantId: string; data: ProfileData; onSaved: () => void }) {
  const initial = React.useMemo(() => toForm(data.profile), [data.profile])
  const [form, setForm] = React.useState<FormState>(initial)
  const [saving, setSaving] = React.useState(false)
  const dirty = (Object.keys(form) as (keyof FormState)[]).some(k => form[k] !== initial[k])
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))
  const text = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await call(`/api/participant-profile?participant_id=${participantId}`, { method: 'PUT', json: form })
      toast.success('Профиль сохранён')
      onSaved()
    } catch (err) {
      toast.error('Не удалось сохранить', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card title="Личные данные">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Дата рождения" htmlFor="pf-birth">
            <Input id="pf-birth" type="date" value={form.birth_date} onChange={text('birth_date')} max={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Город" htmlFor="pf-city">
            <Input id="pf-city" value={form.city} onChange={text('city')} placeholder="Например: Душанбе" maxLength={100} />
          </Field>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:col-span-2">
            <div>
              <dt className="text-xs text-muted-foreground">Телефон</dt>
              <dd className="mt-0.5">{data.participant.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="mt-0.5 break-all">{data.participant.email || '—'}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card title="Чем занимаетесь" hint="Оборот и прибыль по годам заполняются в блоке «Динамика по годам». Цифры указываются в сомони (TJS).">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Род деятельности" htmlFor="pf-activity">
            <Input id="pf-activity" value={form.activity} onChange={text('activity')} placeholder="Например: розничная торговля одеждой" maxLength={200} />
          </Field>
          <Field label="Название бизнеса" htmlFor="pf-business">
            <Input id="pf-business" value={form.business_name} onChange={text('business_name')} placeholder="Необязательно" maxLength={150} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        {dirty && !saving && <span className="text-xs text-muted-foreground">Есть несохранённые изменения</span>}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------

const isImage = (name: string) => /\.(jpe?g|png|webp|heic)$/i.test(name)

function ScansCard({ participantId, scans, unavailable, onChanged }: { participantId: string; scans: ScanFile[]; unavailable: boolean; onChanged: () => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const base = `/api/participant-profile/files?participant_id=${participantId}`

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    let count = scans.length
    try {
      for (const file of Array.from(list)) {
        const problem = scanProblem({ name: file.name, size: file.size, type: file.type }, count)
        if (problem) {
          toast.error(file.name, { description: problem })
          continue
        }
        const prep = await call<{ data: { signedUrl: string } }>(base, { method: 'POST', json: { name: file.name, size: file.size, type: file.type } })
        const form = new FormData()
        form.append('cacheControl', '3600')
        form.append('', file)
        const put = await fetch(prep.data.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form })
        if (!put.ok) throw new Error('Файл не загрузился. Проверьте интернет и попробуйте ещё раз')
        count++
      }
    } catch (e) {
      toast.error('Не удалось загрузить файл', { description: (e as Error).message })
    } finally {
      if (input.current) input.current.value = ''
      setBusy(false)
      onChanged()
    }
  }

  const remove = async (f: ScanFile) => {
    setRemoving(f.key)
    try {
      await call(`${base}&key=${encodeURIComponent(f.key)}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      toast.error('Не удалось удалить файл', { description: (e as Error).message })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Card title="Фото загранпаспорта" hint={`Фото или PDF главной страницы, до ${MAX_SCANS} файлов по 10 МБ.`}>
      {unavailable && <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm">Хранилище файлов сейчас недоступно, список сканов не загрузился.</p>}
      {scans.length > 0 && (
        <ul className="mb-3 space-y-2">
          {scans.map(f => {
            const Icon = isImage(f.name) ? ImageIcon : FileText
            return (
              <li key={f.key} className="flex items-center gap-1 rounded-lg bg-muted pr-1">
                <a
                  href={`${base}&download=${encodeURIComponent(f.key)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
                </a>
                <button
                  type="button"
                  aria-label={`Удалить файл ${f.name}`}
                  disabled={removing === f.key}
                  onClick={() => remove(f)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-background hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50"
                >
                  {removing === f.key ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {scans.length < MAX_SCANS && (
        <>
          <input ref={input} type="file" multiple accept={SCAN_ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden onChange={e => upload(e.target.files)} />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-[15px] font-medium text-primary outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {busy ? 'Загружаем…' : scans.length ? 'Загрузить ещё' : 'Загрузить фото или PDF паспорта'}
          </button>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('num inline-flex items-center gap-0.5 text-xs font-medium', up ? 'text-success' : 'text-destructive')}>
      <Icon className="size-3.5" />
      {up ? '+' : '−'}
      {formatNumber(Math.abs(value))}%
    </span>
  )
}

const yearsWord = (n: number) => plural(n, ['год', 'года', 'лет'])

function YearsCard({ participantId, years, currency, onChanged }: { participantId: string; years: BusinessYear[]; currency: Currency; onChanged: () => void }) {
  const confirm = useConfirm()
  const dynamics = React.useMemo(() => yearlyDynamics(years), [years])
  const [editing, setEditing] = React.useState<{ year: string; turnover: string; net_profit: string; notes: string; isNew: boolean } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const nextYear = React.useMemo(() => {
    const taken = new Set(years.map(y => y.year))
    let y = new Date().getFullYear()
    while (taken.has(y)) y--
    return y
  }, [years])

  const chartData = dynamics.map(d => ({ year: String(d.year), turnover: d.turnover ?? 0, profit: d.net_profit ?? 0 }))
  const money = (v: number | null) => (v === null ? '—' : formatMoney(v, currency))

  const startNew = () => setEditing({ year: String(nextYear), turnover: '', net_profit: '', notes: '', isNew: true })
  const startEdit = (y: BusinessYear) =>
    setEditing({ year: String(y.year), turnover: y.turnover === null ? '' : String(y.turnover), net_profit: y.net_profit === null ? '' : String(y.net_profit), notes: y.notes ?? '', isNew: false })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    let parsed
    try {
      parsed = parseYear({ year: editing.year, turnover: editing.turnover, net_profit: editing.net_profit, notes: editing.notes })
    } catch (err) {
      toast.error((err as Error).message)
      return
    }
    if (editing.isNew && years.some(y => y.year === parsed.year)) {
      toast.error(`За ${parsed.year} год данные уже есть`, { description: 'Откройте строку и измените её' })
      return
    }
    setSaving(true)
    try {
      await call(`/api/participant-profile/years?participant_id=${participantId}`, { method: 'PUT', json: parsed })
      toast.success(`${parsed.year} год сохранён`)
      setEditing(null)
      onChanged()
    } catch (err) {
      toast.error('Не удалось сохранить', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (y: BusinessYear) => {
    const ok = await confirm({ title: `Убрать ${y.year} год?`, description: 'Цифры за этот год исчезнут из динамики.', confirmText: 'Убрать', destructive: true })
    if (!ok) return
    try {
      await call(`/api/participant-profile/years?participant_id=${participantId}&year=${y.year}`, { method: 'DELETE' })
      onChanged()
    } catch (err) {
      toast.error('Не удалось убрать год', { description: (err as Error).message })
    }
  }

  return (
    <Card
      title="Динамика по годам"
      hint={`Оборот и чистая прибыль за календарный год, ${currency}. По ним видно, растёт ли бизнес.`}
      aside={
        !editing && (
          <Button type="button" size="sm" variant="outline" onClick={startNew}>
            <Plus /> Добавить год
          </Button>
        )
      }
    >
      {editing && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Год" htmlFor="yr-year">
              <Input id="yr-year" type="number" inputMode="numeric" min={1990} max={new Date().getFullYear() + 1} value={editing.year} disabled={!editing.isNew} onChange={e => setEditing({ ...editing, year: e.target.value })} className="num" />
            </Field>
            <Field label="Оборот" htmlFor="yr-turnover">
              <Input id="yr-turnover" inputMode="decimal" value={editing.turnover} onChange={e => setEditing({ ...editing, turnover: e.target.value })} placeholder="0" className="num" autoFocus />
            </Field>
            <Field label="Чистая прибыль" htmlFor="yr-profit" hint="Убыток — со знаком минус">
              <Input id="yr-profit" inputMode="decimal" value={editing.net_profit} onChange={e => setEditing({ ...editing, net_profit: e.target.value })} placeholder="0" className="num" />
            </Field>
          </div>
          <Field label="Комментарий" htmlFor="yr-notes">
            <Input id="yr-notes" value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} placeholder="Например: открыл вторую точку" maxLength={300} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить год'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(null)}>
              Отмена
            </Button>
          </div>
        </form>
      )}

      {dynamics.length === 0 && !editing ? (
        <EmptyState
          title="Цифр пока нет"
          description="Добавьте оборот и чистую прибыль хотя бы за один год. Со второго года появится динамика."
          action={
            <Button size="sm" onClick={startNew}>
              <Plus /> Добавить год
            </Button>
          }
        />
      ) : (
        dynamics.length > 0 && (
          <div className="space-y-5">
            {dynamics.length > 1 && (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: CHART_COLORS[0] }} /> Оборот
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: CHART_COLORS[2] }} /> Чистая прибыль
                  </span>
                  <span>
                    за {dynamics.length} {yearsWord(dynamics.length)}
                  </span>
                </div>
                <div className="h-56 w-full" role="img" aria-label="Оборот и чистая прибыль по годам">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="year" {...axisProps} />
                      <YAxis {...axisProps} tickFormatter={compactTick} width={44} />
                      <Tooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltip format={v => formatMoney(v, currency)} />} />
                      <Bar dataKey="turnover" name="Оборот" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="profit" name="Чистая прибыль" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Phone: one card per year, the table does not fit */}
            <ul className="space-y-2 sm:hidden">
              {[...dynamics].reverse().map(d => (
                <li key={d.year} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-base font-semibold">{d.year}</span>
                    <div className="flex gap-0.5">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Изменить ${d.year} год`} className="text-muted-foreground" onClick={() => startEdit(d)}>
                        <Pencil />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Убрать ${d.year} год`} className="text-muted-foreground hover:text-destructive" onClick={() => remove(d)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Оборот</dt>
                      <dd className="num mt-0.5 font-medium">{money(d.turnover)}</dd>
                      <dd className="mt-0.5">
                        <Delta value={d.turnover_change} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Чистая прибыль</dt>
                      <dd className={cn('num mt-0.5 font-medium', d.net_profit !== null && d.net_profit < 0 && 'text-destructive')}>{money(d.net_profit)}</dd>
                      <dd className="mt-0.5">
                        <Delta value={d.profit_change} />
                      </dd>
                    </div>
                  </dl>
                  {(d.margin !== null || d.notes) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {d.margin !== null && <>Рентабельность {d.margin.toString().replace('.', ',')}%</>}
                      {d.margin !== null && d.notes && ' · '}
                      {d.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <Table className="max-sm:hidden">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Год</TableHead>
                  <TableHead className="text-right">Оборот</TableHead>
                  <TableHead className="text-right">Чистая прибыль</TableHead>
                  <TableHead className="text-right max-sm:hidden">Рентабельность</TableHead>
                  <TableHead className="text-right max-md:hidden">К прошлому году</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...dynamics].reverse().map(d => (
                  <TableRow key={d.year} className="group">
                    <TableCell className="num font-medium">
                      {d.year}
                      {d.notes && <span className="mt-0.5 block max-w-40 truncate text-xs font-normal text-muted-foreground">{d.notes}</span>}
                    </TableCell>
                    <TableCell className="num text-right">{money(d.turnover)}</TableCell>
                    <TableCell className={cn('num text-right font-medium', d.net_profit !== null && d.net_profit < 0 && 'text-destructive')}>{money(d.net_profit)}</TableCell>
                    <TableCell className="num text-right text-muted-foreground max-sm:hidden">{d.margin === null ? '—' : `${d.margin.toString().replace('.', ',')}%`}</TableCell>
                    <TableCell className="text-right max-md:hidden">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          оборот <Delta value={d.turnover_change} />
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          прибыль <Delta value={d.profit_change} />
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Изменить ${d.year} год`} className="text-muted-foreground" onClick={() => startEdit(d)}>
                          <Pencil />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Убрать ${d.year} год`} className="text-muted-foreground hover:text-destructive" onClick={() => remove(d)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </Card>
  )
}
