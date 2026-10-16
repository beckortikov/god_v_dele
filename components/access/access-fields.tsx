'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Copy, KeyRound, RefreshCw } from 'lucide-react'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type UserRole } from '@/lib/navigation'
import { credentialsText, generatePassword, loginProblem, passwordProblem, suggestLogin } from '@/lib/access'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/erp/field'

// ---------------------------------------------------------------------------
// The form block: «Вход на платформу» with role, login and password

export interface AccessDraft {
  enabled: boolean
  role: UserRole
  username: string
  password: string
  /** The person typed the login themselves: stop suggesting one from the name. */
  loginTouched: boolean
}

export const newAccessDraft = (role: UserRole): AccessDraft => ({ enabled: true, role, username: '', password: generatePassword(), loginTouched: false })

export function accessProblems(d: AccessDraft): { username?: string; password?: string } {
  if (!d.enabled) return {}
  return { username: loginProblem(d.username) ?? undefined, password: passwordProblem(d.password) ?? undefined }
}

export const accessPayload = (d: AccessDraft) => (d.enabled ? { username: d.username.trim(), password: d.password, role: d.role } : undefined)

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error('Не удалось скопировать', { description: 'Выделите текст и скопируйте вручную' })
  }
}

/** Password input with «new» and «copy» buttons; the password is shown, because the person creating the sign-in has to hand it over. */
export function PasswordField({
  id,
  value,
  onChange,
  error,
  label = 'Пароль',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  error?: string
  label?: string
}) {
  return (
    <Field label={label} htmlFor={id} required hint={error ? <span className="text-destructive">{error}</span> : 'Минимум 8 символов. Передайте его человеку сразу после сохранения'}>
      <div className="flex gap-1.5">
        <Input
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-invalid={!!error || undefined}
        />
        <Button type="button" variant="outline" size="icon" aria-label="Сгенерировать новый пароль" title="Сгенерировать новый" onClick={() => onChange(generatePassword())}>
          <RefreshCw />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Скопировать пароль" title="Скопировать" onClick={() => copy(value, 'Пароль скопирован')}>
          <Copy />
        </Button>
      </div>
    </Field>
  )
}

export function AccessFields({
  draft,
  onChange,
  nameHint,
  roles,
  errors = {},
  idPrefix = 'acc',
  title = 'Вход на платформу',
  offText = 'Человек не сможет войти. Доступ можно выдать позже.',
  optional = true,
}: {
  draft: AccessDraft
  onChange: (d: AccessDraft) => void
  /** Full name of the person, to suggest a login from. */
  nameHint: string
  /** Roles to choose from; leave out to fix the role (participants). */
  roles?: readonly UserRole[]
  errors?: { username?: string; password?: string }
  idPrefix?: string
  title?: string
  offText?: string
  /** false: no on/off switch, the block is always filled in (a dialog that exists to create the sign-in). */
  optional?: boolean
}) {
  // Suggest a login from the name until the person types their own.
  React.useEffect(() => {
    if (draft.loginTouched || !draft.enabled) return
    const suggestion = suggestLogin(nameHint)
    if (suggestion !== draft.username) onChange({ ...draft, username: suggestion })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameHint, draft.loginTouched, draft.enabled])

  return (
    <section className={optional ? 'space-y-4 rounded-lg border p-4' : 'space-y-4'}>
      {optional && (
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <KeyRound className="size-4 text-muted-foreground" /> {title}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{draft.enabled ? 'Создадим логин и пароль вместе с карточкой' : offText}</span>
          </span>
          <Switch checked={draft.enabled} onCheckedChange={enabled => onChange({ ...draft, enabled })} aria-label={title} />
        </label>
      )}

      {draft.enabled && (
        <div className="grid gap-4">
          {roles && (
            <Field label="Доступ к платформе" hint={ROLE_DESCRIPTIONS[draft.role]}>
              <Select value={draft.role} onValueChange={v => onChange({ ...draft, role: v as UserRole })}>
                <SelectTrigger className="w-full">
                  <SelectValue>{ROLE_LABELS[draft.role]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r} value={r} className="py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{ROLE_LABELS[r]}</span>
                        <span className="text-xs whitespace-normal text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Логин" htmlFor={`${idPrefix}-login`} required hint={errors.username ? <span className="text-destructive">{errors.username}</span> : 'Латинскими буквами; предложен по имени'}>
            <Input
              id={`${idPrefix}-login`}
              value={draft.username}
              onChange={e => onChange({ ...draft, username: e.target.value, loginTouched: true })}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="login"
              aria-invalid={!!errors.username || undefined}
            />
          </Field>
          <PasswordField id={`${idPrefix}-password`} value={draft.password} onChange={password => onChange({ ...draft, password })} error={errors.password} />
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// «Передайте человеку»: shown once after a sign-in is created or a password changed

export interface IssuedCredentials {
  person: string
  username: string
  password: string
  roleLabel?: string
  /** «created» when the sign-in is new, «reset» when only the password changed. */
  kind: 'created' | 'reset'
}

export function CredentialsDialog({ credentials, onClose }: { credentials: IssuedCredentials | null; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => setCopied(false), [credentials])
  const text = credentials ? credentialsText({ url: typeof window === 'undefined' ? '' : window.location.origin, username: credentials.username, password: credentials.password }) : ''

  return (
    <Dialog open={!!credentials} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {credentials && (
          <>
            <DialogHeader>
              <DialogTitle>{credentials.kind === 'created' ? 'Вход создан' : 'Пароль изменён'}</DialogTitle>
              <DialogDescription>
                {credentials.person}
                {credentials.roleLabel ? ` · ${credentials.roleLabel}` : ''}
              </DialogDescription>
            </DialogHeader>
            <dl className="divide-y rounded-lg border text-sm">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-muted-foreground">Адрес</dt>
                <dd className="font-mono">{typeof window === 'undefined' ? '' : window.location.host}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-muted-foreground">Логин</dt>
                <dd className="font-mono font-medium">{credentials.username}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-muted-foreground">Пароль</dt>
                <dd className="font-mono font-medium">{credentials.password}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">Пароль виден только сейчас, потом его можно лишь заменить. Передайте его человеку безопасным способом.</p>
            <DialogFooter>
              <Button
                type="button"
                onClick={async () => {
                  await copy(text, 'Скопировано: адрес, логин и пароль')
                  setCopied(true)
                }}
              >
                {copied ? <Check /> : <Copy />} Скопировать для отправки
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Готово
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Card for a person who already exists: shows the sign-in, creates or resets it

interface AccountInfo {
  id: string
  username: string
  role: UserRole
  last_login_at?: string | null
}

type Kind = 'employee' | 'participant'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.error) throw new Error(json?.error || `Ошибка ${res.status}`)
  return json as T
}

export function AccessCard({
  kind,
  id,
  name,
  roles,
}: {
  kind: Kind
  id: string
  name: string
  /** Roles to choose from when creating (employees); omitted for participants. */
  roles?: readonly UserRole[]
}) {
  const query = `${kind}_id=${id}`
  const [account, setAccount] = React.useState<AccountInfo | null | undefined>(undefined)
  const [loadError, setLoadError] = React.useState('')
  const [mode, setMode] = React.useState<'create' | 'reset' | null>(null)
  const [draft, setDraft] = React.useState<AccessDraft>(() => newAccessDraft(roles?.[0] ?? 'participant'))
  const [newPassword, setNewPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [issued, setIssued] = React.useState<IssuedCredentials | null>(null)
  const problems = accessProblems(draft)
  const [showProblems, setShowProblems] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoadError('')
    try {
      const r = await call<{ data: AccountInfo | null }>(`/api/access?${query}`)
      setAccount(r.data)
    } catch (e) {
      setAccount(undefined)
      setLoadError((e as Error).message)
    }
  }, [query])

  React.useEffect(() => {
    setAccount(undefined)
    load()
  }, [load])

  const open = (m: 'create' | 'reset') => {
    setShowProblems(false)
    setDraft(newAccessDraft(roles?.[0] ?? 'participant'))
    setNewPassword(generatePassword())
    setMode(m)
  }

  const submit = async () => {
    setShowProblems(true)
    setBusy(true)
    try {
      if (mode === 'create') {
        if (problems.username || problems.password) return
        await call(`/api/access`, { method: 'POST', body: JSON.stringify({ [`${kind}_id`]: id, username: draft.username.trim(), password: draft.password, role: draft.role }) })
        setIssued({ kind: 'created', person: name, username: draft.username.trim(), password: draft.password, roleLabel: ROLE_LABELS[kind === 'participant' ? 'participant' : draft.role] })
      } else if (mode === 'reset' && account) {
        const issue = passwordProblem(newPassword)
        if (issue) {
          toast.error(issue)
          return
        }
        await call(`/api/access`, { method: 'PUT', body: JSON.stringify({ [`${kind}_id`]: id, password: newPassword }) })
        setIssued({ kind: 'reset', person: name, username: account.username, password: newPassword, roleLabel: ROLE_LABELS[account.role] })
      }
      setMode(null)
      await load()
    } catch (e) {
      toast.error(mode === 'create' ? 'Не удалось создать вход' : 'Не удалось сменить пароль', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <KeyRound className="size-4 text-muted-foreground" /> Вход на платформу
        </h3>
        {account === null && (
          <Button type="button" size="sm" variant="outline" onClick={() => open('create')}>
            Создать вход
          </Button>
        )}
        {account && (
          <Button type="button" size="sm" variant="outline" onClick={() => open('reset')}>
            Сменить пароль
          </Button>
        )}
      </div>

      {account === undefined && !loadError && <p className="mt-2 text-sm text-muted-foreground">Загружаем…</p>}
      {loadError && <p className="mt-2 text-sm text-muted-foreground">Не удалось узнать про вход: {loadError}</p>}
      {account === null && <p className="mt-2 text-sm text-muted-foreground">Пока нет входа: человек не может войти на платформу.</p>}
      {account && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Логин</dt>
          <dd className="font-mono">{account.username}</dd>
          <dt className="text-muted-foreground">Доступ</dt>
          <dd>
            <Badge variant="secondary">{ROLE_LABELS[account.role] ?? account.role}</Badge>
          </dd>
          <dt className="text-muted-foreground">Последний вход</dt>
          <dd>{account.last_login_at ? formatDate(account.last_login_at, 'long') : 'ещё не входил'}</dd>
        </dl>
      )}

      <Dialog open={mode !== null} onOpenChange={o => !o && !busy && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Создать вход' : 'Новый пароль'}</DialogTitle>
            <DialogDescription>{mode === 'create' ? name : `${name} · ${account?.username ?? ''}`}</DialogDescription>
          </DialogHeader>
          {mode === 'create' ? (
            <AccessFields draft={draft} onChange={setDraft} nameHint={name} roles={roles} errors={showProblems ? problems : {}} idPrefix={`acc-${kind}`} optional={false} />
          ) : (
            <PasswordField id="acc-reset-password" value={newPassword} onChange={setNewPassword} label="Новый пароль" />
          )}
          <DialogFooter>
            <Button type="button" disabled={busy} onClick={submit}>
              {busy ? 'Сохраняем…' : mode === 'create' ? 'Создать' : 'Сменить пароль'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode(null)}>
              Отмена
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CredentialsDialog credentials={issued} onClose={() => setIssued(null)} />
    </section>
  )
}
