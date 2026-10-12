/**
 * Files attached to a sprint report. They live in a private Storage bucket under
 * `<assignment id>/<key>`. Storage keys must be plain ASCII, while people upload
 * «Отчёт по продажам.pdf», so the original name travels inside the key and nothing
 * extra needs saving in the database.
 */

export const REPORT_BUCKET = 'sprint-reports'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_FILES = 5

/** Pictures, PDF, office documents and plain text: what a report needs, nothing executable. */
export const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
}

export const ACCEPT_ATTR = [...Object.keys(ALLOWED_TYPES), '.heic'].join(',')

export interface ReportFile {
  /** Object key inside the assignment folder. */
  key: string
  name: string
  size: number
}

const NAME_LIMIT = 80

const b64url = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

/** `1760000000000__<base64url name>.<ext>`: sorts by upload time, decodes back to the original name. */
export function encodeKey(name: string, type: string, now = Date.now()): string {
  const ext = ALLOWED_TYPES[type] ?? 'bin'
  const base = name.replace(/\.[^.]*$/, '').replace(/[\\/]/g, '_').trim().slice(0, NAME_LIMIT) || 'file'
  return `${now}__${b64url(base)}.${ext}`
}

export function decodeName(key: string): string {
  const m = /^\d+__([A-Za-z0-9_-]+)\.([a-z0-9]+)$/.exec(key)
  if (!m) return key
  try {
    return `${unb64url(m[1])}.${m[2]}`
  } catch {
    return key
  }
}

/** A key we produced: guards downloads and deletes against path tricks. */
export const isReportKey = (key: unknown): key is string => typeof key === 'string' && /^\d+__[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(key)

/** Returns the reason an upload is refused, or null. */
export function uploadProblem(file: { name?: unknown; size?: unknown; type?: unknown }, existing: number): string | null {
  if (typeof file.name !== 'string' || !file.name.trim()) return 'У файла нет имени'
  if (typeof file.type !== 'string' || !(file.type in ALLOWED_TYPES)) return 'Такой тип файла не принимаем. Подойдут фото, PDF, документы Word, Excel, PowerPoint и текст'
  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0) return 'Файл пустой'
  if (file.size > MAX_FILE_BYTES) return `Файл больше ${MAX_FILE_BYTES / 1024 / 1024} МБ`
  if (existing >= MAX_FILES) return `К отчёту можно приложить до ${MAX_FILES} файлов`
  return null
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(Math.round((bytes / 1024 / 1024) * 10) / 10).toString().replace('.', ',')} МБ`
}
