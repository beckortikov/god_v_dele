// File service for «Год в деле» on the VPS: private buckets on local disk, reached through signed links.
// No dependencies (Node 18+). Runs behind Caddy, which terminates HTTPS:
//
//   FILES_SECRET=… FILES_ROOT=/var/lib/gvd-files FILES_ORIGINS=https://godvdele.com node server.mjs
//
// Browser (signed by the site, see lib/file-storage.ts):
//   PUT /o/<bucket>/<path>?exp=&sig=        upload, multipart form (as the site sends it) or a raw body
//   GET /o/<bucket>/<path>?exp=&sig=&dl=     download; dl = file name for «Save as»
// Site, with «Authorization: Bearer <FILES_SECRET>»:
//   GET  /api/buckets/<bucket>               bucket settings, 404 when missing
//   POST /api/buckets/<bucket>               { fileSizeLimit, allowedMimeTypes } creates it
//   GET  /api/list?bucket=&prefix=&limit=&offset=
//   GET  /api/stat?bucket=&path=
//   POST /api/remove                         { bucket, paths: [] }

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

const SECRET = process.env.FILES_SECRET
const ROOT = resolve(process.env.FILES_ROOT || '/var/lib/gvd-files')
const PORT = Number(process.env.PORT || 8790)
const ORIGINS = (process.env.FILES_ORIGINS || 'https://godvdele.com').split(',').map(s => s.trim()).filter(Boolean)
const HARD_LIMIT = 60 * 1024 * 1024
if (!SECRET || SECRET.length < 32) throw new Error('FILES_SECRET must be set (32+ characters)')

const DATA = join(ROOT, 'data')
const META = join(ROOT, 'meta')

// ---------------------------------------------------------------- helpers

const BUCKET = /^[a-z0-9][a-z0-9-]{0,62}$/

/** A path inside a bucket: no empty, «.» or «..» segments, no backslashes or control characters. */
function cleanPath(p) {
  if (typeof p !== 'string' || p.length > 1024 || /[\\\u0000-\u001f]/.test(p)) return null
  const parts = p.split('/')
  if (parts.some(s => s === '' || s === '.' || s === '..')) return null
  return parts.join('/')
}

function inside(base, ...rest) {
  const full = resolve(base, ...rest)
  return full === base || full.startsWith(base + sep) ? full : null
}

function sign(method, bucket, path, exp, dl = "") {
  return createHmac('sha256', SECRET).update(`${method}\n${bucket}/${path}\n${exp}\n${dl}`).digest('base64url')
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

function cors(req, res) {
  const origin = req.headers.origin
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-upsert, cache-control')
    res.setHeader('Access-Control-Max-Age', '600')
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** The file part of a multipart body (the site sends «cacheControl» and the file under an empty name). */
function filePart(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  if (!m) return null
  const boundary = Buffer.from(`--${m[1] || m[2]}`)
  let pos = body.indexOf(boundary)
  while (pos !== -1) {
    const start = pos + boundary.length
    if (body.slice(start, start + 2).toString() === '--') break
    const headerEnd = body.indexOf('\r\n\r\n', start)
    if (headerEnd === -1) break
    const headers = body.slice(start + 2, headerEnd).toString('utf8')
    const next = body.indexOf(boundary, headerEnd + 4)
    if (next === -1) break
    const content = body.slice(headerEnd + 4, next - 2) // part ends with CRLF before the boundary
    if (/filename=/i.test(headers)) {
      const type = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim().toLowerCase() || 'application/octet-stream'
      return { content, type }
    }
    pos = next
  }
  return null
}

async function bucketConfig(bucket) {
  try {
    return JSON.parse(await readFile(join(META, `${bucket}.bucket.json`), 'utf8'))
  } catch {
    return null
  }
}

async function objectMeta(bucket, path) {
  const file = inside(DATA, bucket, path)
  if (!file) return null
  try {
    const st = await stat(file)
    if (!st.isFile()) return null
    let meta = {}
    try {
      meta = JSON.parse(await readFile(join(META, bucket, `${path}.json`), 'utf8'))
    } catch {}
    return { file, size: st.size, mimetype: meta.mimetype || 'application/octet-stream', created_at: meta.created_at || st.birthtime.toISOString(), updated_at: st.mtime.toISOString() }
  } catch {
    return null
  }
}

function checkSigned(method, url, bucket, path) {
  const exp = url.searchParams.get('exp') || ''
  const sig = url.searchParams.get('sig') || ''
  const dl = url.searchParams.get('dl') || ''
  if (!/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return 'Ссылка устарела'
  if (!sameSecret(sig, sign(method, bucket, path, exp, dl))) return 'Неверная подпись'
  return null
}

// ---------------------------------------------------------------- handlers

async function upload(req, res, url, bucket, path) {
  const problem = checkSigned('PUT', url, bucket, path)
  if (problem) return send(res, 403, { error: problem })
  const cfg = await bucketConfig(bucket)
  if (!cfg) return send(res, 404, { error: 'Bucket not found' })
  const limit = Math.min(HARD_LIMIT, cfg.fileSizeLimit || HARD_LIMIT)
  const body = await readBody(req, limit + 64 * 1024)
  const ct = String(req.headers['content-type'] || '')
  const part = ct.toLowerCase().startsWith('multipart/form-data') ? filePart(body, ct) : { content: body, type: ct.split(';')[0].trim().toLowerCase() || 'application/octet-stream' }
  if (!part) return send(res, 400, { error: 'No file in the form' })
  if (part.content.length > limit) return send(res, 413, { error: 'The object exceeded the maximum allowed size' })
  if (cfg.allowedMimeTypes?.length && !cfg.allowedMimeTypes.includes(part.type)) return send(res, 415, { error: `mime type ${part.type} is not supported` })
  const file = inside(DATA, bucket, path)
  if (!file) return send(res, 400, { error: 'Bad path' })
  const upsert = String(req.headers['x-upsert'] || 'false') === 'true'
  if (!upsert && (await objectMeta(bucket, path))) return send(res, 409, { error: 'The resource already exists' })
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.part`
  await writeFile(tmp, part.content)
  await rename(tmp, file)
  const metaFile = join(META, bucket, `${path}.json`)
  await mkdir(dirname(metaFile), { recursive: true })
  await writeFile(metaFile, JSON.stringify({ mimetype: part.type, created_at: new Date().toISOString() }))
  send(res, 200, { Key: `${bucket}/${path}` })
}

async function download(req, res, url, bucket, path) {
  const problem = checkSigned('GET', url, bucket, path)
  if (problem) return send(res, 403, { error: problem })
  const obj = await objectMeta(bucket, path)
  if (!obj) return send(res, 404, { error: 'Object not found' })
  const dl = url.searchParams.get('dl')
  const headers = { 'Content-Type': obj.mimetype, 'Content-Length': obj.size, 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff' }
  if (dl) headers['Content-Disposition'] = `attachment; filename="${dl.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(dl)}`
  res.writeHead(200, headers)
  createReadStream(obj.file).pipe(res)
}

async function list(res, url) {
  const bucket = url.searchParams.get('bucket') || ''
  const prefix = url.searchParams.get('prefix') || ''
  const limit = Math.min(1000, Number(url.searchParams.get('limit') || 100))
  const offset = Number(url.searchParams.get('offset') || 0)
  if (!BUCKET.test(bucket) || (prefix && !cleanPath(prefix))) return send(res, 400, { error: 'Bad bucket or prefix' })
  const dir = inside(DATA, bucket, prefix)
  let names = []
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter(d => !d.name.endsWith('.part'))
  } catch {
    return send(res, 200, [])
  }
  names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const out = []
  for (const d of names.slice(offset, offset + limit)) {
    if (d.isDirectory()) out.push({ name: d.name, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null })
    else {
      const obj = await objectMeta(bucket, prefix ? `${prefix}/${d.name}` : d.name)
      if (obj) out.push({ name: d.name, id: `${bucket}/${prefix ? `${prefix}/` : ''}${d.name}`, updated_at: obj.updated_at, created_at: obj.created_at, last_accessed_at: obj.updated_at, metadata: { size: obj.size, mimetype: obj.mimetype } })
    }
  }
  send(res, 200, out)
}

async function remove(req, res) {
  const { bucket, paths } = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8') || '{}')
  if (!BUCKET.test(bucket || '') || !Array.isArray(paths)) return send(res, 400, { error: 'Bad request' })
  const removed = []
  for (const p of paths) {
    const path = cleanPath(p)
    const file = path && inside(DATA, bucket, path)
    if (!file) continue
    try {
      await rm(file)
      removed.push({ name: path })
    } catch {}
    await rm(join(META, bucket, `${path}.json`), { force: true })
  }
  send(res, 200, removed)
}

async function api(req, res, url) {
  const auth = String(req.headers.authorization || '')
  if (!sameSecret(auth, `Bearer ${SECRET}`)) return send(res, 401, { error: 'Unauthorized' })
  const bucketMatch = /^\/api\/buckets\/([^/]+)$/.exec(url.pathname)
  if (bucketMatch) {
    const bucket = bucketMatch[1]
    if (!BUCKET.test(bucket)) return send(res, 400, { error: 'Bad bucket name' })
    if (req.method === 'GET') {
      const cfg = await bucketConfig(bucket)
      return cfg ? send(res, 200, { id: bucket, name: bucket, public: false, ...cfg }) : send(res, 404, { error: 'Bucket not found' })
    }
    if (req.method === 'POST') {
      if (await bucketConfig(bucket)) return send(res, 409, { error: 'The resource already exists' })
      const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
      await mkdir(join(DATA, bucket), { recursive: true })
      await mkdir(META, { recursive: true })
      const cfg = { fileSizeLimit: Number(body.fileSizeLimit) || null, allowedMimeTypes: Array.isArray(body.allowedMimeTypes) ? body.allowedMimeTypes : null }
      await writeFile(join(META, `${bucket}.bucket.json`), JSON.stringify(cfg))
      return send(res, 200, { name: bucket })
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/list') return list(res, url)
  if (req.method === 'GET' && url.pathname === '/api/stat') {
    const bucket = url.searchParams.get('bucket') || ''
    const path = cleanPath(url.searchParams.get('path') || '')
    const obj = BUCKET.test(bucket) && path ? await objectMeta(bucket, path) : null
    return obj ? send(res, 200, { size: obj.size, mimetype: obj.mimetype }) : send(res, 404, { error: 'Object not found' })
  }
  if (req.method === 'POST' && url.pathname === '/api/remove') return remove(req, res)
  send(res, 404, { error: 'Not found' })
}

// ---------------------------------------------------------------- server

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://files')
    cors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }
    if (url.pathname === '/health') return send(res, 200, { ok: true })
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    const m = /^\/o\/([^/]+)\/(.+)$/.exec(url.pathname)
    if (m) {
      const bucket = m[1]
      const path = cleanPath(decodeURIComponent(m[2]))
      if (!BUCKET.test(bucket) || !path) return send(res, 400, { error: 'Bad path' })
      if (req.method === 'PUT') return await upload(req, res, url, bucket, path)
      if (req.method === 'GET' || req.method === 'HEAD') return await download(req, res, url, bucket, path)
    }
    send(res, 404, { error: 'Not found' })
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Internal error' })
    else res.destroy()
    if (!e.status) console.error(e)
  }
})

server.requestTimeout = 10 * 60 * 1000
server.listen(PORT, '127.0.0.1', () => console.log(`files: listening on 127.0.0.1:${PORT}, root ${ROOT}`))
