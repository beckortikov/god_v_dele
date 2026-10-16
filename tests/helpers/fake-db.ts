/**
 * A small in-memory stand-in for supabaseAdmin: tables with the query builder the
 * routes use, and a storage bucket. Enough to run route handlers in tests without
 * a database. Use it from a test with:
 *
 *   vi.mock('@/lib/supabase-client', async () => ({ supabaseAdmin: (await import('./helpers/fake-db')).fakeAdmin }))
 */
type Row = Record<string, any>
type Err = { code?: string; message: string }

export const fake = {
  tables: {} as Record<string, Row[]>,
  /** Inserts into these tables fail. */
  failInsert: new Set<string>(),
  /** Any query on these tables answers with this error (a table that is not there yet). */
  missing: new Map<string, Err>(),
  /** Storage: bucket -> object path -> size. */
  buckets: new Map<string, Map<string, number>>(),
  seq: 0,
  reset() {
    this.tables = {}
    this.failInsert.clear()
    this.missing.clear()
    this.buckets.clear()
    this.seq = 0
  },
  rows(table: string): Row[] {
    return (this.tables[table] ??= [])
  },
}

function from(table: string) {
  const q: { op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'; filters: ((r: Row) => boolean)[]; payload: any; single: boolean; limit: number | null; conflict: string[] } = {
    op: 'select',
    filters: [],
    payload: null,
    single: false,
    limit: null,
    conflict: [],
  }
  const run = () => {
    const miss = fake.missing.get(table)
    if (miss) return { data: null, error: miss }
    const list = fake.rows(table)
    if (q.op === 'insert') {
      if (fake.failInsert.has(table)) return { data: null, error: { message: 'insert failed' } }
      const made = q.payload.map((p: Row) => ({ id: `id-${++fake.seq}`, created_at: new Date().toISOString(), ...p }))
      list.push(...made)
      return { data: q.single ? made[0] : made, error: null }
    }
    if (q.op === 'upsert') {
      const out: Row[] = []
      for (const p of q.payload as Row[]) {
        const found = list.find(r => q.conflict.every(c => r[c] === p[c]))
        if (found) {
          Object.assign(found, p)
          out.push(found)
        } else {
          const made = { id: `id-${++fake.seq}`, created_at: new Date().toISOString(), ...p }
          list.push(made)
          out.push(made)
        }
      }
      return { data: q.single ? out[0] : out, error: null }
    }
    const hit = list.filter(r => q.filters.every(f => f(r)))
    if (q.op === 'delete') {
      fake.tables[table] = list.filter(r => !hit.includes(r))
      return { data: null, error: null }
    }
    if (q.op === 'update') {
      for (const r of hit) Object.assign(r, q.payload)
      return { data: q.single ? (hit[0] ?? null) : hit, error: null }
    }
    const out = q.limit == null ? hit : hit.slice(0, q.limit)
    return { data: q.single ? (out[0] ?? null) : out, error: null }
  }
  const b: Record<string, any> = {
    select: () => b,
    insert: (r: Row | Row[]) => ((q.op = 'insert'), (q.payload = Array.isArray(r) ? r : [r]), b),
    upsert: (r: Row | Row[], opts?: { onConflict?: string }) => ((q.op = 'upsert'), (q.payload = Array.isArray(r) ? r : [r]), (q.conflict = (opts?.onConflict ?? 'id').split(',')), b),
    update: (r: Row) => ((q.op = 'update'), (q.payload = r), b),
    delete: () => ((q.op = 'delete'), b),
    eq: (c: string, v: unknown) => (q.filters.push(r => r[c] === v), b),
    in: (c: string, vs: unknown[]) => (q.filters.push(r => vs.includes(r[c])), b),
    ilike: (c: string, v: string) => {
      const want = v.replace(/\\([\\%_])/g, '$1').toLowerCase()
      q.filters.push(r => String(r[c] ?? '').toLowerCase() === want)
      return b
    },
    order: () => b,
    limit: (n: number) => ((q.limit = n), b),
    single: () => ((q.single = true), b),
    maybeSingle: () => ((q.single = true), b),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

const storage = {
  getBucket: async (name: string) => ({ data: fake.buckets.has(name) ? { name } : null, error: null }),
  createBucket: async (name: string) => (fake.buckets.set(name, new Map()), { data: { name }, error: null }),
  from: (bucket: string) => {
    const objects = () => fake.buckets.get(bucket) ?? new Map<string, number>()
    return {
      list: async (folder: string) =>
        folder === ''
          ? // like Storage: the top level lists one entry per «folder»
            { data: [...new Set([...objects().keys()].map(p => p.split('/')[0]))].map(name => ({ name, metadata: null })), error: null }
          : {
        data: [...objects().entries()].filter(([p]) => p.startsWith(`${folder}/`)).map(([p, size]) => ({ name: p.slice(folder.length + 1), metadata: { size } })),
        error: null,
      },
      createSignedUrl: async (path: string, _s: number, opts?: { download?: string }) =>
        objects().has(path) ? { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t&download=${encodeURIComponent(opts?.download ?? '')}` }, error: null } : { data: null, error: { message: 'Object not found' } },
      createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/upload/${bucket}/${path}?token=t`, path }, error: null }),
      remove: async (paths: string[]) => {
        for (const p of paths) objects().delete(p)
        return { data: null, error: null }
      },
    }
  },
}

export const fakeAdmin = { from, storage }
