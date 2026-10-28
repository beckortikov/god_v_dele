import { createHmac } from 'node:crypto'

/**
 * Client for the file service on the server (server/files/server.mjs), shaped like the slice of
 * Supabase Storage the routes use: getBucket / createBucket / from(bucket).list / createSignedUrl /
 * createSignedUploadUrl / remove. The browser uploads and downloads through signed links straight
 * to the service, so big files never pass through a serverless function.
 *
 * Needs FILES_URL (e.g. https://files.godvdele.com) and FILES_SECRET (shared with the service).
 */

type StorageError = { message: string; statusCode?: string }
type Result<T> = Promise<{ data: T | null; error: StorageError | null }>

/** Upload links live as long as Supabase's (2 hours): a slow phone upload still finishes. */
const UPLOAD_TTL_S = 2 * 60 * 60

function config() {
  const url = process.env.FILES_URL?.replace(/\/+$/, '')
  const secret = process.env.FILES_SECRET
  if (!url || !secret) throw new Error('FILES_URL and FILES_SECRET must be set')
  return { url, secret }
}

function sign(secret: string, method: 'GET' | 'PUT', bucket: string, path: string, exp: number, dl = '') {
  return createHmac('sha256', secret).update(`${method}\n${bucket}/${path}\n${exp}\n${dl}`).digest('base64url')
}

function signedLink(method: 'GET' | 'PUT', bucket: string, path: string, ttlSeconds: number, dl?: string) {
  const { url, secret } = config()
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const q = new URLSearchParams({ exp: String(exp), sig: sign(secret, method, bucket, path, exp, dl ?? '') })
  if (dl) q.set('dl', dl)
  return `${url}/o/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}?${q}`
}

async function call<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Result<T> {
  try {
    const { url, secret } = config()
    const res = await fetch(`${url}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${secret}`, ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { data: null, error: { message: body?.error ?? `File service answered ${res.status}`, statusCode: String(res.status) } }
    return { data: body as T, error: null }
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } }
  }
}

interface ListItem {
  name: string
  id: string | null
  created_at: string | null
  updated_at: string | null
  metadata: { size: number; mimetype: string } | null
}

export function createFileStorage() {
  return {
    getBucket: (name: string) => call<{ name: string }>(`/api/buckets/${encodeURIComponent(name)}`),

    createBucket: (name: string, opts?: { public?: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] }) =>
      call<{ name: string }>(`/api/buckets/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: { fileSizeLimit: opts?.fileSizeLimit ?? null, allowedMimeTypes: opts?.allowedMimeTypes ?? null },
      }),

    from: (bucket: string) => ({
      list: (prefix = '', opts?: { limit?: number; offset?: number }) => {
        const q = new URLSearchParams({ bucket, prefix, limit: String(opts?.limit ?? 100), offset: String(opts?.offset ?? 0) })
        return call<ListItem[]>(`/api/list?${q}`)
      },

      /** Like Supabase: an error when the object is not there. */
      createSignedUrl: async (path: string, expiresIn: number, opts?: { download?: string | boolean }): Result<{ signedUrl: string }> => {
        const found = await call(`/api/stat?${new URLSearchParams({ bucket, path })}`)
        if (found.error) return { data: null, error: found.error.statusCode === '404' ? { message: 'Object not found', statusCode: '404' } : found.error }
        const dl = typeof opts?.download === 'string' ? opts.download : opts?.download ? path.split('/').pop() : undefined
        return { data: { signedUrl: signedLink('GET', bucket, path, expiresIn, dl) }, error: null }
      },

      createSignedUploadUrl: async (path: string): Result<{ signedUrl: string; path: string; token: string }> => {
        try {
          return { data: { signedUrl: signedLink('PUT', bucket, path, UPLOAD_TTL_S), path, token: '' }, error: null }
        } catch (e) {
          return { data: null, error: { message: (e as Error).message } }
        }
      },

      remove: (paths: string[]) => call<{ name: string }[]>('/api/remove', { method: 'POST', body: { bucket, paths } }),
    }),
  }
}
