'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPT_ATTR, MAX_FILES, formatSize, uploadProblem, type ReportFile } from '@/lib/report-files'
import { api } from './shared'

/** Files attached to one assignment's report. `enabled` false = nothing to load (a mark task, nothing sent yet). */
export function useReportFiles(assignmentId: string | undefined, enabled = true) {
  const [files, setFiles] = React.useState<ReportFile[]>([])

  const reload = React.useCallback(async () => {
    if (!assignmentId || !enabled) {
      setFiles([])
      return
    }
    try {
      const r = await api<{ data: ReportFile[] }>(`/api/sprints/assignments/${assignmentId}/files`)
      setFiles(r.data)
    } catch {
      // Storage unavailable: the report still works without attachments.
      setFiles([])
    }
  }, [assignmentId, enabled])

  React.useEffect(() => {
    reload()
  }, [reload])

  return { files, reload }
}

const isImage = (name: string) => /\.(jpe?g|png|webp|heic)$/i.test(name)

/** Chips that open the file (a short-lived link, so the sign-in is checked every time). */
export function FileChips({
  assignmentId,
  files,
  onRemove,
  removing,
  className,
}: {
  assignmentId: string
  files: ReportFile[]
  onRemove?: (f: ReportFile) => void
  removing?: string | null
  className?: string
}) {
  if (!files.length) return null
  return (
    <ul className={cn('space-y-2', className)}>
      {files.map(f => {
        const Icon = isImage(f.name) ? ImageIcon : FileText
        return (
          <li key={f.key} className="flex items-center gap-1 rounded-lg bg-muted pr-1">
            <a
              href={`/api/sprints/assignments/${assignmentId}/files?download=${encodeURIComponent(f.key)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="num shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
            </a>
            {onRemove && (
              <button
                type="button"
                aria-label={`Убрать файл ${f.name}`}
                disabled={removing === f.key}
                onClick={() => onRemove(f)}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-background hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50"
              >
                {removing === f.key ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Attach button plus the list of what is attached. Photos from the phone go straight to Storage. */
export function FileUploader({ assignmentId, files, reload }: { assignmentId: string; files: ReportFile[]; reload: () => Promise<void> }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    let count = files.length
    try {
      for (const file of Array.from(list)) {
        const problem = uploadProblem({ name: file.name, size: file.size, type: file.type }, count)
        if (problem) {
          toast.error(file.name, { description: problem })
          continue
        }
        const prep = await api<{ data: { signedUrl: string } }>(`/api/sprints/assignments/${assignmentId}/files`, {
          method: 'POST',
          json: { name: file.name, size: file.size, type: file.type },
        })
        const form = new FormData()
        form.append('cacheControl', '3600')
        form.append('', file)
        const put = await fetch(prep.data.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form })
        if (!put.ok) throw new Error('Файл не загрузился. Проверьте интернет и попробуйте ещё раз')
        count++
      }
    } catch (e) {
      toast.error('Не удалось прикрепить файл', { description: (e as Error).message })
    } finally {
      if (input.current) input.current.value = ''
      await reload()
      setBusy(false)
    }
  }

  const remove = async (f: ReportFile) => {
    setRemoving(f.key)
    try {
      await api(`/api/sprints/assignments/${assignmentId}/files?key=${encodeURIComponent(f.key)}`, { method: 'DELETE' })
      await reload()
    } catch (e) {
      toast.error('Не удалось убрать файл', { description: (e as Error).message })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-2.5">
      <FileChips assignmentId={assignmentId} files={files} onRemove={remove} removing={removing} />
      {files.length < MAX_FILES && (
        <>
          <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-hidden onChange={e => upload(e.target.files)} />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-[15px] font-medium text-primary outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {busy ? 'Загружаем…' : files.length ? 'Прикрепить ещё' : 'Прикрепить фото или файл'}
          </button>
        </>
      )}
      <p className="ml-1 text-xs text-muted-foreground">До {MAX_FILES} файлов по 10 МБ: фото, PDF, Word, Excel, PowerPoint</p>
    </div>
  )
}
