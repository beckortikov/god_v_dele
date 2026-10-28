// Mirrors Supabase Storage into the file service on the VPS: creates the three buckets with the code's
// limits, uploads what is missing and removes what Supabase no longer has. Run from god_v_dele_finance/:
//
//   set -a; . ./.env.local; set +a
//   FILES_URL=https://files.godvdele.com FILES_SECRET=$(ssh godvdele '. /root/gvd-secrets.env; printf %s "$FILES_SECRET"') \
//     node --experimental-transform-types --no-warnings server/sync-files.mts
import { createClient } from '@supabase/supabase-js'
import { createFileStorage } from '../lib/file-storage.ts'
import { REPORT_BUCKET, MAX_FILE_BYTES, ALLOWED_TYPES } from '../lib/report-files.ts'
// same values as lib/participant-profile.ts and lib/lessons.ts
const PASSPORT_BUCKET = 'participant-docs', MAX_SCAN_BYTES = 10 * 1024 * 1024
const SCAN_TYPES = Object.fromEntries(Object.entries(ALLOWED_TYPES).filter(([t]) => t.startsWith('image/') || t === 'application/pdf'))
const MAX_MATERIAL_BYTES = 50 * 1024 * 1024, MATERIAL_TYPES = ALLOWED_TYPES
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const fs = createFileStorage()
const buckets = [
  [REPORT_BUCKET, MAX_FILE_BYTES, Object.keys(ALLOWED_TYPES)],
  [PASSPORT_BUCKET, MAX_SCAN_BYTES, Object.keys(SCAN_TYPES)],
  ['lesson-materials', MAX_MATERIAL_BYTES, Object.keys(MATERIAL_TYPES)],
] as const
async function walk(bucket: string, prefix = ''): Promise<{ path: string; size: number; type: string }[]> {
  const out: { path: string; size: number; type: string }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const it of data) {
      const path = prefix ? `${prefix}/${it.name}` : it.name
      if (it.id === null) out.push(...(await walk(bucket, path)))
      else out.push({ path, size: it.metadata?.size ?? 0, type: it.metadata?.mimetype ?? 'application/octet-stream' })
    }
    if (data.length < 1000) break
  }
  return out
}
/** Everything the file service holds in a bucket. */
async function walkVps(bucket: string, prefix = ''): Promise<string[]> {
  const out: string[] = []
  const { data } = await fs.from(bucket).list(prefix, { limit: 1000 })
  for (const it of data ?? []) {
    const path = prefix ? `${prefix}/${it.name}` : it.name
    if (it.id === null) out.push(...(await walkVps(bucket, path)))
    else out.push(path)
  }
  return out
}

let copied = 0, skipped = 0, removed = 0
for (const [bucket, limit, types] of buckets) {
  const have = await fs.getBucket(bucket)
  if (!have.data) {
    const r = await fs.createBucket(bucket, { public: false, fileSizeLimit: limit, allowedMimeTypes: types })
    if (r.error) throw new Error(`${bucket}: ${r.error.message}`)
  }
  const objects = await walk(bucket)
  for (const o of objects) {
    const { data: blob, error } = await sb.storage.from(bucket).download(o.path)
    if (error) throw new Error(`${bucket}/${o.path}: ${error.message}`)
    const { data: up } = await fs.from(bucket).createSignedUploadUrl(o.path)
    const form = new FormData(); form.append('cacheControl', '3600'); form.append('', new Blob([await blob.arrayBuffer()], { type: o.type }), o.path.split('/').pop())
    const r = await fetch(up!.signedUrl, { method: 'PUT', headers: { 'x-upsert': 'false' }, body: form })
    if (r.status === 409) { skipped++; continue }
    if (!r.ok) throw new Error(`${bucket}/${o.path}: upload ${r.status} ${await r.text()}`)
    const check = (await fs.from(bucket).list(o.path.split('/').slice(0, -1).join('/'))).data?.find(x => x.name === o.path.split('/').pop())
    if (check?.metadata?.size !== blob.size) throw new Error(`${bucket}/${o.path}: size mismatch`)
    copied++
  }
  const keep = new Set(objects.map(o => o.path))
  const extra = (await walkVps(bucket)).filter(p => !keep.has(p))
  if (extra.length) {
    await fs.from(bucket).remove(extra)
    removed += extra.length
  }
  console.log(`${bucket}: ${objects.length} objects in Supabase`)
}
console.log(`copied ${copied}, already there ${skipped}, removed ${removed}`)
