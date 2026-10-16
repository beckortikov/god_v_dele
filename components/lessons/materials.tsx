'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, Paperclip, Presentation, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSize } from '@/lib/report-files'
import { MATERIAL_ACCEPT_ATTR, MAX_MATERIALS, materialProblem, parseLinkMaterial, type LessonMaterial } from '@/lib/lessons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/erp/field'
import { useConfirm } from '@/components/erp/confirm'
import { call } from './api'

const isSlides = (name: string) => /\.(pptx?|key|odp)$/i.test(name)
const isPicture = (name: string) => /\.(jpe?g|png|webp|heic)$/i.test(name)

function MaterialIcon({ m }: { m: LessonMaterial }) {
  const c = 'size-4 shrink-0 text-muted-foreground'
  if (m.kind === 'link') return <Link2 className={c} />
  const name = m.file_name ?? m.title
  return isSlides(name) ? <Presentation className={c} /> : isPicture(name) ? <ImageIcon className={c} /> : <FileText className={c} />
}

/** Where a material opens: a link as it is, a file through the checked, short-lived download. */
export const materialHref = (lessonId: string, m: LessonMaterial) => (m.kind === 'link' ? (m.url ?? '#') : `/api/lessons/${lessonId}/materials?download=${m.id}`)

/** The materials of a lesson. With `onRemove` a curator can take one away. */
export function MaterialsList({ lessonId, materials, onRemove, removing }: { lessonId: string; materials: LessonMaterial[]; onRemove?: (m: LessonMaterial) => void; removing?: string | null }) {
  if (!materials.length) return null
  return (
    <ul className="space-y-2">
      {materials.map(m => (
        <li key={m.id} className="flex items-center gap-1 rounded-lg bg-muted pr-1">
          <a
            href={materialHref(lessonId, m)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <MaterialIcon m={m} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{m.title}</span>
              {m.kind === 'file' && m.file_name && m.file_name !== m.title && <span className="block truncate text-xs text-muted-foreground">{m.file_name}</span>}
            </span>
            {m.kind === 'file' ? <span className="num shrink-0 text-xs text-muted-foreground">{m.file_size ? formatSize(m.file_size) : ''}</span> : <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />}
          </a>
          {onRemove && (
            <button
              type="button"
              aria-label={`Убрать материал ${m.title}`}
              disabled={removing === m.id}
              onClick={() => onRemove(m)}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-background hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50"
            >
              {removing === m.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Curator's block: the list plus «прикрепить файл» and «добавить ссылку». */
export function MaterialsEditor({ lessonId, materials, onChanged }: { lessonId: string; materials: LessonMaterial[]; onChanged: () => void }) {
  const confirm = useConfirm()
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [url, setUrl] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const base = `/api/lessons/${lessonId}/materials`

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    let count = materials.length
    try {
      for (const file of Array.from(list)) {
        const problem = materialProblem({ name: file.name, size: file.size, type: file.type }, count)
        if (problem) {
          toast.error(file.name, { description: problem })
          continue
        }
        const prep = await call<{ data: { key: string; signedUrl: string } }>(`${base}/prepare`, { method: 'POST', json: { name: file.name, size: file.size, type: file.type } })
        const form = new FormData()
        form.append('cacheControl', '3600')
        form.append('', file)
        const put = await fetch(prep.data.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form })
        if (!put.ok) throw new Error('Файл не загрузился. Проверьте интернет и попробуйте ещё раз')
        await call(base, { method: 'POST', json: { kind: 'file', key: prep.data.key, name: file.name, size: file.size } })
        count++
      }
    } catch (e) {
      toast.error('Не удалось прикрепить файл', { description: (e as Error).message })
    } finally {
      if (input.current) input.current.value = ''
      setBusy(false)
      onChanged()
    }
  }

  // A div, not a form: this block sits inside the lesson's own form, and forms cannot nest
  const addLink = async () => {
    try {
      parseLinkMaterial({ url, title })
    } catch (err) {
      toast.error((err as Error).message)
      return
    }
    setAdding(true)
    try {
      await call(base, { method: 'POST', json: { kind: 'link', url, title } })
      setUrl('')
      setTitle('')
      setLinkOpen(false)
      onChanged()
    } catch (err) {
      toast.error('Не удалось добавить ссылку', { description: (err as Error).message })
    } finally {
      setAdding(false)
    }
  }

  const remove = async (m: LessonMaterial) => {
    const ok = await confirm({ title: `Убрать «${m.title}»?`, description: m.kind === 'file' ? 'Файл будет удалён, участники его больше не увидят.' : 'Ссылка пропадёт у участников.', confirmText: 'Убрать', destructive: true })
    if (!ok) return
    setRemoving(m.id)
    try {
      await call(`${base}?material_id=${m.id}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      toast.error('Не удалось убрать материал', { description: (e as Error).message })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-2.5">
      <MaterialsList lessonId={lessonId} materials={materials} onRemove={remove} removing={removing} />
      {materials.length < MAX_MATERIALS && (
        <div className={cn('grid gap-2', !linkOpen && 'sm:grid-cols-2')}>
          <input ref={input} type="file" multiple accept={MATERIAL_ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden onChange={e => upload(e.target.files)} />
          {!linkOpen && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed text-[15px] font-medium text-primary outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                {busy ? 'Загружаем…' : 'Прикрепить файл'}
              </button>
              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed text-[15px] font-medium text-primary outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30"
              >
                <Link2 className="size-4" /> Добавить ссылку
              </button>
            </>
          )}
        </div>
      )}
      {linkOpen && (
        <div
          className="space-y-3 rounded-lg border bg-muted/40 p-3"
          onKeyDown={e => {
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
              e.preventDefault()
              addLink()
            }
          }}
        >
          <Field label="Ссылка" htmlFor="mat-url" hint="Google Drive, YouTube, Zoom-запись, любой адрес">
            <Input id="mat-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" autoFocus inputMode="url" autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field label="Название" htmlFor="mat-title" hint="Пусто — покажем адрес сайта">
            <Input id="mat-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Запись урока" maxLength={150} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={adding || !url.trim()} onClick={addLink}>
              {adding ? 'Добавляем…' : 'Добавить'}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={adding} onClick={() => setLinkOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Презентации (PowerPoint, PDF), документы и фото до 50 МБ. Больше — загрузите в облако и добавьте ссылкой.</p>
    </div>
  )
}
