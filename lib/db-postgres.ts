import { Pool } from 'pg'

/**
 * Direct Postgres access with the slice of the supabase-js query builder this app uses:
 *
 *   db.from('participants').select('id, name, program:programs(name)').eq('status', 'active').order('name')
 *
 * Results keep PostgREST's shape and formats ({ data, error, count }, rows built with json_agg in SQL,
 * so numbers, dates and timestamps serialise exactly as before). Embedded resources are resolved from
 * the foreign keys in the catalog. Error codes the routes check are kept: PGRST116 (single row),
 * PGRST204 (unknown column in a write), PGRST205 (unknown table), and Postgres codes as they are.
 */

export interface DbError {
  code: string
  message: string
  details: string | null
  hint: string | null
}

export interface DbResult<T = any> {
  data: T
  error: DbError | null
  count: number | null
  status: number
  statusText: string
}

type Value = unknown
type Row = Record<string, Value>
/** What a row looks like to callers: untyped, like supabase-js without generated types. */
export type DbRow = any

// ---------------------------------------------------------------- connection

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Serverless: a few connections per instance; pgbouncer on the server multiplexes them
      max: Number(process.env.DATABASE_POOL_MAX ?? 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    })
    pool.on('error', err => console.error('[db] idle client error:', err.message))
  }
  return pool
}

async function query(text: string, params: Value[]) {
  return getPool().query(text, params as any[])
}

// ---------------------------------------------------------------- catalog

interface ForeignKey {
  name: string
  table: string
  columns: string[]
  ftable: string
  fcolumns: string[]
}

interface Catalog {
  columns: Map<string, Set<string>>
  primaryKeys: Map<string, string[]>
  foreignKeys: ForeignKey[]
  loadedAt: number
}

const CATALOG_TTL_MS = 60_000
let catalog: Catalog | null = null
let catalogLoading: Promise<Catalog> | null = null

const CATALOG_SQL = `
  select json_build_object(
    'columns', (
      select coalesce(json_agg(json_build_object('t', c.relname, 'c', a.attname)), '[]')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f') and a.attnum > 0 and not a.attisdropped
    ),
    'keys', (
      select coalesce(json_agg(json_build_object(
        'name', con.conname, 'type', con.contype, 't', cl.relname, 'ft', fcl.relname,
        'cols', (select json_agg(a.attname order by k.i) from unnest(con.conkey) with ordinality k(n, i)
                 join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n),
        'fcols', (select json_agg(a.attname order by k.i) from unnest(con.confkey) with ordinality k(n, i)
                  join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n)
      )), '[]')
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      left join pg_class fcl on fcl.oid = con.confrelid
      where n.nspname = 'public' and con.contype in ('p', 'f')
    )
  ) as catalog`

async function loadCatalog(force = false): Promise<Catalog> {
  if (!force && catalog && Date.now() - catalog.loadedAt < CATALOG_TTL_MS) return catalog
  if (!catalogLoading) {
    catalogLoading = query(CATALOG_SQL, [])
      .then(res => {
        const raw = res.rows[0].catalog as {
          columns: { t: string; c: string }[]
          keys: { name: string; type: 'p' | 'f'; t: string; ft: string | null; cols: string[]; fcols: string[] | null }[]
        }
        const columns = new Map<string, Set<string>>()
        for (const { t, c } of raw.columns) (columns.get(t) ?? columns.set(t, new Set()).get(t)!).add(c)
        const primaryKeys = new Map<string, string[]>()
        const foreignKeys: ForeignKey[] = []
        for (const k of raw.keys) {
          if (k.type === 'p') primaryKeys.set(k.t, k.cols)
          else if (k.ft) foreignKeys.push({ name: k.name, table: k.t, columns: k.cols, ftable: k.ft, fcolumns: k.fcols ?? [] })
        }
        catalog = { columns, primaryKeys, foreignKeys, loadedAt: Date.now() }
        return catalog
      })
      .finally(() => {
        catalogLoading = null
      })
  }
  return catalogLoading
}

// ---------------------------------------------------------------- errors

class QueryError extends Error {
  constructor(public readonly dbError: DbError, public readonly status: number) {
    super(dbError.message)
  }
}

function fail(code: string, message: string, status = 400, details: string | null = null): never {
  throw new QueryError({ code, message, details, hint: null }, status)
}

function toDbError(err: unknown): { error: DbError; status: number } {
  if (err instanceof QueryError) return { error: err.dbError, status: err.status }
  const e = err as { code?: string; message?: string; detail?: string; hint?: string }
  const code = e.code ?? ''
  const status = code === '23505' || code === '23503' ? 409 : code.startsWith('08') || !code ? 503 : 400
  return { error: { code, message: e.message ?? String(err), details: e.detail ?? null, hint: e.hint ?? null }, status }
}

// ---------------------------------------------------------------- select parsing

type Field =
  | { kind: 'star' }
  | { kind: 'column'; name: string; alias: string; cast?: string }
  | { kind: 'count'; alias: string }
  | { kind: 'embed'; alias: string; table: string; hint?: string; inner: boolean; fields: Field[] }

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

function ident(name: string): string {
  if (!IDENT.test(name)) fail('PGRST100', `"${name}" is not a valid name`)
  return `"${name}"`
}

/** Splits at top-level commas (outside parentheses and double quotes). */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let quoted = false
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"' && s[i - 1] !== '\\') quoted = !quoted
    if (!quoted) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (ch === ',' && depth === 0) {
        out.push(cur)
        cur = ''
        continue
      }
    }
    cur += ch
  }
  if (cur.trim() !== '' || out.length) out.push(cur)
  return out
}

function parseSelect(columns: string): Field[] {
  // PostgREST ignores whitespace outside quotes
  const compact = columns.replace(/\s+/g, '')
  if (compact === '') return [{ kind: 'star' }]
  return splitTop(compact).map(parseField)
}

function parseField(item: string): Field {
  if (item === '*') return { kind: 'star' }
  const open = item.indexOf('(')
  if (open > 0 && item.endsWith(')')) {
    const head = item.slice(0, open)
    const inside = item.slice(open + 1, -1)
    const [aliasPart, rest] = head.includes(':') ? head.split(':', 2) : [undefined, head]
    const [table, ...mods] = rest.split('!')
    const inner = mods.includes('inner')
    const hint = mods.find(m => m !== 'inner' && m !== 'left')
    const fields = inside === '' ? [{ kind: 'star' } as Field] : splitTop(inside).map(parseField)
    return { kind: 'embed', alias: aliasPart ?? table, table, hint, inner, fields }
  }
  const [aliasPart, rest] = item.includes(':') && !item.includes('::') ? item.split(':', 2) : [undefined, item]
  const [name, cast] = rest.split('::')
  return { kind: 'column', name, alias: aliasPart ?? name, cast }
}

// ---------------------------------------------------------------- filters

type Op = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in'

type Cond =
  | { kind: 'op'; column: string; op: Op; value: Value; negate: boolean }
  | { kind: 'group'; join: 'and' | 'or'; items: Cond[]; negate: boolean }

const SQL_OP: Record<Exclude<Op, 'is' | 'in'>, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
}

function unquote(v: string): string {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v
}

/** «(a,b,"c,d")» → ['a', 'b', 'c,d'] */
function parseList(v: string): string[] {
  const body = v.trim().replace(/^\(/, '').replace(/\)$/, '')
  return body === '' ? [] : splitTop(body).map(x => unquote(x.trim()))
}

function parseIs(v: Value): Value {
  if (v === null || v === true || v === false) return v
  const s = String(v).toLowerCase()
  if (s === 'null') return null
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'unknown') return 'unknown'
  fail('PGRST100', `"${v}" is not a valid value for is`)
}

/** One PostgREST logic expression: «col.op.value», «not.col.op.value», «and(...)», «or(...)», «not.and(...)». */
function parseLogic(expr: string): Cond {
  let s = expr.trim()
  let negate = false
  if (s.startsWith('not.')) {
    negate = true
    s = s.slice(4)
  }
  const group = /^(and|or)\(([\s\S]*)\)$/.exec(s)
  if (group) return { kind: 'group', join: group[1] as 'and' | 'or', items: splitTop(group[2]).map(parseLogic), negate }
  const firstDot = s.indexOf('.')
  if (firstDot < 0) fail('PGRST100', `"${expr}" is not a valid filter`)
  const column = s.slice(0, firstDot)
  let rest = s.slice(firstDot + 1)
  if (rest.startsWith('not.')) {
    negate = !negate
    rest = rest.slice(4)
  }
  const secondDot = rest.indexOf('.')
  const op = (secondDot < 0 ? rest : rest.slice(0, secondDot)) as Op
  const raw = secondDot < 0 ? '' : rest.slice(secondDot + 1)
  if (!(op in SQL_OP) && op !== 'is' && op !== 'in') fail('PGRST100', `"${op}" is not a supported operator`)
  const value = op === 'in' ? parseList(raw) : op === 'is' ? parseIs(raw) : unquote(raw)
  return { kind: 'op', column, op, value, negate }
}

// ---------------------------------------------------------------- SQL building

class Sql {
  params: Value[] = []
  private aliasSeq = 0
  constructor(public readonly cat: Catalog) {}

  param(v: Value): string {
    this.params.push(v)
    return `$${this.params.length}`
  }

  nextAlias(): string {
    return `_t${this.aliasSeq++}`
  }
}

function checkTable(cat: Catalog, table: string) {
  if (!cat.columns.has(table)) fail('PGRST205', `Could not find the table 'public.${table}' in the schema cache`, 404)
}

function condSql(sql: Sql, cond: Cond, alias: string): string {
  if (cond.kind === 'group') {
    const inner = cond.items.map(c => condSql(sql, c, alias)).join(cond.join === 'and' ? ' AND ' : ' OR ')
    return `${cond.negate ? 'NOT ' : ''}(${inner || (cond.join === 'and' ? 'TRUE' : 'FALSE')})`
  }
  const col = `${alias}.${ident(cond.column)}`
  let out: string
  if (cond.op === 'is') {
    const v = parseIs(cond.value)
    out = `${col} IS ${v === null ? 'NULL' : v === true ? 'TRUE' : v === false ? 'FALSE' : 'UNKNOWN'}`
  } else if (cond.op === 'in') {
    const list = Array.isArray(cond.value) ? cond.value : parseList(String(cond.value))
    out = `${col} = ANY(${sql.param(list)})`
  } else {
    let v = cond.value
    // PostgREST lets «*» stand for «%» in like patterns
    if ((cond.op === 'like' || cond.op === 'ilike') && typeof v === 'string') v = v.replace(/\*/g, '%')
    out = `${col} ${SQL_OP[cond.op]} ${sql.param(v)}`
  }
  return cond.negate ? `NOT (${out})` : out
}

interface Relation {
  /** Join condition, given the parent and child aliases. */
  on: (parent: string, child: string) => string
  /** The child is the «one» side: embed an object, not an array. */
  toOne: boolean
}

function resolveRelation(cat: Catalog, parent: string, child: string, hint?: string): Relation {
  checkTable(cat, child)
  const matches = (fk: ForeignKey) => !hint || fk.name === hint || fk.columns.includes(hint) || fk.fcolumns.includes(hint)
  const manyToOne = cat.foreignKeys.filter(fk => fk.table === parent && fk.ftable === child && matches(fk))
  const oneToMany = cat.foreignKeys.filter(fk => fk.table === child && fk.ftable === parent && matches(fk))
  const found = [...manyToOne.map(fk => ({ fk, toOne: true })), ...oneToMany.map(fk => ({ fk, toOne: false }))]
  if (found.length === 0) {
    fail('PGRST200', `Could not find a relationship between '${parent}' and '${child}' in the schema cache`)
  }
  if (found.length > 1) {
    fail('PGRST201', `Could not embed because more than one relationship was found for '${parent}' and '${child}'`, 300)
  }
  const { fk, toOne } = found[0]
  return {
    toOne,
    on: (p, c) =>
      fk.columns
        .map((col, i) => (toOne ? `${c}.${ident(fk.fcolumns[i])} = ${p}.${ident(col)}` : `${c}.${ident(col)} = ${p}.${ident(fk.fcolumns[i])}`))
        .join(' AND '),
  }
}

interface EmbedFilters {
  /** Filters keyed by embed path, e.g. 'participant' or 'task.sprint'. */
  byPath: Map<string, Cond[]>
}

/**
 * The select list for `table` under `alias`. Embedded resources become correlated subqueries;
 * `!inner` embeds add an EXISTS condition to `existsOut` (applied to the parent's WHERE).
 */
function selectList(sql: Sql, table: string, alias: string, fields: Field[], filters: EmbedFilters, path: string, existsOut: string[]): string {
  const cols = sql.cat.columns.get(table)!
  const parts: string[] = []
  for (const f of fields) {
    if (f.kind === 'star') parts.push(`${alias}.*`)
    else if (f.kind === 'count') parts.push(`count(*) AS ${ident(f.alias)}`)
    else if (f.kind === 'column') {
      if (!cols.has(f.name)) fail('42703', `column ${table}.${f.name} does not exist`)
      const expr = `${alias}.${ident(f.name)}`
      parts.push(`${f.cast ? `${expr}::${ident(f.cast).slice(1, -1)}` : expr} AS ${ident(f.alias)}`)
    } else {
      const childPath = path ? `${path}.${f.alias}` : f.alias
      const rel = resolveRelation(sql.cat, table, f.table, f.hint)
      const child = sql.nextAlias()
      const childConds = (filters.byPath.get(childPath) ?? []).map(c => condSql(sql, c, child))
      const where = [rel.on(alias, child), ...childConds]
      const childFields = f.fields
      const childCols = sql.cat.columns.get(f.table)!
      // «table(count)» is PostgREST's row count of the related rows
      const isCount = childFields.length === 1 && childFields[0].kind === 'column' && childFields[0].name === 'count' && !childCols.has('count')
      const nestedExists: string[] = []
      let expr: string
      if (isCount) {
        expr = `(SELECT json_build_array(json_build_object('count', count(*))) FROM ${ident(f.table)} ${child} WHERE ${where.join(' AND ')})`
      } else {
        const list = selectList(sql, f.table, child, childFields, filters, childPath, nestedExists)
        const whereAll = [...where, ...nestedExists].join(' AND ')
        const row = sql.nextAlias()
        expr = rel.toOne
          ? `(SELECT row_to_json(${row}) FROM (SELECT ${list} FROM ${ident(f.table)} ${child} WHERE ${whereAll} LIMIT 1) ${row})`
          : `COALESCE((SELECT json_agg(${row}) FROM (SELECT ${list} FROM ${ident(f.table)} ${child} WHERE ${whereAll}) ${row}), '[]'::json)`
      }
      parts.push(`${expr} AS ${ident(f.alias)}`)
      if (f.inner) {
        const probe = sql.nextAlias()
        const probeConds = (filters.byPath.get(childPath) ?? []).map(c => condSql(sql, c, probe))
        existsOut.push(`EXISTS (SELECT 1 FROM ${ident(f.table)} ${probe} WHERE ${[rel.on(alias, probe), ...probeConds].join(' AND ')})`)
      }
    }
  }
  return parts.join(', ')
}

// ---------------------------------------------------------------- the builder

type Action =
  | { kind: 'select' }
  | { kind: 'insert'; rows: Row[]; upsert?: { onConflict?: string; ignoreDuplicates?: boolean } }
  | { kind: 'update'; values: Row }
  | { kind: 'delete' }

interface Order {
  column: string
  ascending: boolean
  nullsFirst?: boolean
}

export class QueryBuilder<T = DbRow[]> implements PromiseLike<DbResult<T>> {
  private action: Action = { kind: 'select' }
  private columns: string | null = null
  private countMode: 'exact' | null = null
  private head = false
  private conds: { path: string; cond: Cond }[] = []
  private orders: Order[] = []
  private limitN: number | null = null
  private offsetN: number | null = null
  private singleMode: 'single' | 'maybe' | null = null
  private promise: Promise<DbResult<T>> | null = null

  constructor(private readonly table: string) {}

  select(columns = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): QueryBuilder<DbRow[]> {
    this.columns = columns
    if (opts?.count) this.countMode = 'exact'
    if (opts?.head) this.head = true
    return this as unknown as QueryBuilder<DbRow[]>
  }

  insert(values: object | object[], opts?: { count?: 'exact' }): QueryBuilder<DbRow[]> {
    this.action = { kind: 'insert', rows: (Array.isArray(values) ? values : [values]) as Row[] }
    if (opts?.count) this.countMode = 'exact'
    return this as unknown as QueryBuilder<DbRow[]>
  }

  upsert(values: object | object[], opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: 'exact' }): QueryBuilder<DbRow[]> {
    this.action = { kind: 'insert', rows: (Array.isArray(values) ? values : [values]) as Row[], upsert: { onConflict: opts?.onConflict, ignoreDuplicates: opts?.ignoreDuplicates } }
    if (opts?.count) this.countMode = 'exact'
    return this as unknown as QueryBuilder<DbRow[]>
  }

  update(values: object, opts?: { count?: 'exact' }): QueryBuilder<DbRow[]> {
    this.action = { kind: 'update', values: values as Row }
    if (opts?.count) this.countMode = 'exact'
    return this as unknown as QueryBuilder<DbRow[]>
  }

  delete(opts?: { count?: 'exact' }): QueryBuilder<DbRow[]> {
    this.action = { kind: 'delete' }
    if (opts?.count) this.countMode = 'exact'
    return this as unknown as QueryBuilder<DbRow[]>
  }

  private add(column: string, op: Op, value: Value, negate = false): this {
    const dot = column.lastIndexOf('.')
    const path = dot < 0 ? '' : column.slice(0, dot)
    this.conds.push({ path, cond: { kind: 'op', column: dot < 0 ? column : column.slice(dot + 1), op, value, negate } })
    return this
  }

  eq(column: string, value: Value) { return this.add(column, 'eq', value) }
  neq(column: string, value: Value) { return this.add(column, 'neq', value) }
  gt(column: string, value: Value) { return this.add(column, 'gt', value) }
  gte(column: string, value: Value) { return this.add(column, 'gte', value) }
  lt(column: string, value: Value) { return this.add(column, 'lt', value) }
  lte(column: string, value: Value) { return this.add(column, 'lte', value) }
  like(column: string, pattern: string) { return this.add(column, 'like', pattern) }
  ilike(column: string, pattern: string) { return this.add(column, 'ilike', pattern) }
  is(column: string, value: null | boolean) { return this.add(column, 'is', value) }
  in(column: string, values: readonly Value[]) { return this.add(column, 'in', [...values]) }

  not(column: string, op: string, value: Value) {
    const v = op === 'in' && typeof value === 'string' ? parseList(value) : value
    return this.add(column, op as Op, v, true)
  }

  match(query: object) {
    for (const [k, v] of Object.entries(query)) this.eq(k, v)
    return this
  }

  filter(column: string, op: string, value: Value) {
    const negate = op.startsWith('not.')
    const bare = (negate ? op.slice(4) : op) as Op
    const v = bare === 'in' && typeof value === 'string' ? parseList(value) : value
    return this.add(column, bare, v, negate)
  }

  or(filters: string, opts?: { foreignTable?: string; referencedTable?: string }) {
    const path = opts?.referencedTable ?? opts?.foreignTable ?? ''
    this.conds.push({ path, cond: { kind: 'group', join: 'or', items: splitTop(filters).map(parseLogic), negate: false } })
    return this
  }

  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    if (opts?.foreignTable || opts?.referencedTable) fail('PGRST100', 'Ordering embedded resources is not supported')
    this.orders.push({ column, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst })
    return this
  }

  limit(n: number) {
    this.limitN = n
    return this
  }

  range(from: number, to: number) {
    this.offsetN = from
    this.limitN = to - from + 1
    return this
  }

  single(): QueryBuilder<DbRow> {
    this.singleMode = 'single'
    return this as unknown as QueryBuilder<DbRow>
  }

  maybeSingle(): QueryBuilder<DbRow | null> {
    this.singleMode = 'maybe'
    return this as unknown as QueryBuilder<DbRow | null>
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    this.promise ??= this.execute()
    return this.promise.then(onfulfilled, onrejected)
  }

  private async execute(): Promise<DbResult<T>> {
    try {
      let cat = await loadCatalog()
      // A table or column added since the catalog was read: look again before reporting it missing
      if (!cat.columns.has(this.table)) cat = await loadCatalog(true)
      return await this.run(cat)
    } catch (err) {
      const { error, status } = toDbError(err)
      if ((error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204') && catalog && Date.now() - catalog.loadedAt > 1000) {
        try {
          return await this.run(await loadCatalog(true))
        } catch (retryErr) {
          const r = toDbError(retryErr)
          return { data: null as T, error: r.error, count: null, status: r.status, statusText: 'Error' }
        }
      }
      return { data: null as T, error, count: null, status, statusText: 'Error' }
    }
  }

  private async run(cat: Catalog): Promise<DbResult<T>> {
    checkTable(cat, this.table)
    const sql = new Sql(cat)
    const filters: EmbedFilters = { byPath: new Map() }
    const baseConds: Cond[] = []
    for (const { path, cond } of this.conds) {
      if (path === '') baseConds.push(cond)
      else (filters.byPath.get(path) ?? filters.byPath.set(path, []).get(path)!).push(cond)
    }
    const fields = this.columns === null ? null : parseSelect(this.columns)
    const base = sql.nextAlias()

    if (this.action.kind === 'select') {
      const exists: string[] = []
      const list = selectList(sql, this.table, base, fields ?? [{ kind: 'star' }], filters, '', exists)
      const where = [...baseConds.map(c => condSql(sql, c, base)), ...exists]
      const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
      const orderSql = this.orders.length
        ? ` ORDER BY ${this.orders
            .map(o => `${base}.${ident(o.column)} ${o.ascending ? 'ASC' : 'DESC'}${o.nullsFirst === undefined ? '' : o.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST'}`)
            .join(', ')}`
        : ''
      const limitSql = `${this.limitN !== null ? ` LIMIT ${Math.max(0, Math.floor(this.limitN))}` : ''}${this.offsetN ? ` OFFSET ${Math.max(0, Math.floor(this.offsetN))}` : ''}`
      const countSql = this.countMode ? `(SELECT count(*) FROM ${ident(this.table)} ${base}${whereSql})` : 'NULL'
      const dataSql = this.head
        ? 'NULL::json'
        : `(SELECT COALESCE(json_agg(_r), '[]'::json) FROM (SELECT ${list} FROM ${ident(this.table)} ${base}${whereSql}${orderSql}${limitSql}) _r)`
      const res = await query(`SELECT ${dataSql} AS data, ${countSql} AS count`, sql.params)
      return this.finish(res.rows[0].data, res.rows[0].count, 200)
    }

    if (Object.keys(filters.byPath).length || filters.byPath.size) fail('PGRST100', 'Filters on embedded resources are only supported in reads')
    const where = baseConds.map(c => condSql(sql, c, base))
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const tableCols = cat.columns.get(this.table)!
    const checkPayload = (keys: string[]) => {
      for (const k of keys) {
        if (!tableCols.has(k)) fail('PGRST204', `Could not find the '${k}' column of '${this.table}' in the schema cache`)
      }
    }

    let writeSql: string
    let status = 200
    if (this.action.kind === 'insert') {
      const rows = this.action.rows
      if (rows.length === 0) return this.finish(fields ? [] : null, 0, 201)
      const keys = [...new Set(rows.flatMap(r => Object.keys(r)))]
      checkPayload(keys)
      const colList = keys.map(ident).join(', ')
      const payload = sql.param(JSON.stringify(rows))
      let conflict = ''
      if (this.action.upsert) {
        const target = this.action.upsert.onConflict
          ? this.action.upsert.onConflict.split(',').map(s => s.trim()).filter(Boolean)
          : cat.primaryKeys.get(this.table) ?? []
        if (!target.length) fail('PGRST100', `No conflict target for upsert on '${this.table}'`)
        conflict = this.action.upsert.ignoreDuplicates
          ? ` ON CONFLICT (${target.map(ident).join(', ')}) DO NOTHING`
          : ` ON CONFLICT (${target.map(ident).join(', ')}) DO UPDATE SET ${keys.map(k => `${ident(k)} = EXCLUDED.${ident(k)}`).join(', ')}`
      }
      writeSql = `INSERT INTO ${ident(this.table)} AS ${base} (${colList}) SELECT ${colList} FROM json_populate_recordset(NULL::${ident(this.table)}, ${payload}::json)${conflict} RETURNING ${base}.*`
      status = 201
    } else if (this.action.kind === 'update') {
      const keys = Object.keys(this.action.values)
      if (keys.length === 0) return this.finish(fields ? [] : null, 0, 204)
      checkPayload(keys)
      const v = sql.nextAlias()
      const payload = sql.param(JSON.stringify(this.action.values))
      writeSql = `UPDATE ${ident(this.table)} AS ${base} SET ${keys.map(k => `${ident(k)} = ${v}.${ident(k)}`).join(', ')} FROM json_populate_record(NULL::${ident(this.table)}, ${payload}::json) ${v}${whereSql} RETURNING ${base}.*`
    } else {
      writeSql = `DELETE FROM ${ident(this.table)} AS ${base}${whereSql} RETURNING ${base}.*`
    }

    if (!fields) {
      const res = await query(`WITH _w AS (${writeSql}) SELECT count(*) AS count FROM _w`, sql.params)
      return this.finish(null, this.countMode ? res.rows[0].count : null, status)
    }
    // Returned rows go through the same select list, so embeds work after a write too
    const out = sql.nextAlias()
    const list = selectList(sql, this.table, out, fields, filters, '', [])
    const res = await query(
      `WITH _w AS (${writeSql}) SELECT (SELECT COALESCE(json_agg(_r), '[]'::json) FROM (SELECT ${list} FROM _w ${out}) _r) AS data, (SELECT count(*) FROM _w) AS count`,
      sql.params,
    )
    return this.finish(res.rows[0].data, this.countMode ? res.rows[0].count : null, status)
  }

  private finish(rows: Row[] | null, count: string | number | null, status: number): DbResult<T> {
    const n = count === null ? null : Number(count)
    if (this.singleMode && rows !== null) {
      if (rows.length === 1) return { data: rows[0] as T, error: null, count: n, status, statusText: 'OK' }
      if (rows.length === 0 && this.singleMode === 'maybe') return { data: null as T, error: null, count: n, status, statusText: 'OK' }
      return {
        data: null as T,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null },
        count: n,
        status: 406,
        statusText: 'Not Acceptable',
      }
    }
    return { data: rows as T, error: null, count: n, status, statusText: 'OK' }
  }
}

export interface PostgresClient {
  from(table: string): QueryBuilder
}

export function createPostgresClient(): PostgresClient {
  return { from: (table: string) => new QueryBuilder(table) }
}

/** For scripts and tests: closes the pool so the process can exit. */
export async function closePostgres() {
  await pool?.end()
  pool = null
  catalog = null
}
