/**
 * Helpers for columns that the code already uses but a database may not have
 * yet (its migration not applied). PostgREST answers PGRST204
 * «Could not find the 'x' column of 'table' in the schema cache».
 */

type PgError = { code?: string; message?: string } | null | undefined

export function isMissingColumn(error: PgError, column: string) {
  if (!error) return false
  const msg = error.message || ''
  return (error.code === 'PGRST204' || /could not find the .* column/i.test(msg)) && msg.includes(`'${column}'`)
}

/**
 * Runs a write with `row`; if the database lacks one of `optional` columns,
 * retries once without the missing ones, so the main data is still saved.
 */
export async function writeWithOptionalColumns<T extends Record<string, unknown>, R extends { error: PgError }>(
  row: T,
  optional: string[],
  write: (row: Partial<T>) => PromiseLike<R>
): Promise<R & { dropped: string[] }> {
  const first = await write(row)
  const dropped = optional.filter(c => c in row && isMissingColumn(first.error, c))
  if (!dropped.length) return { ...first, dropped: [] }
  const rest = { ...row }
  for (const c of dropped) delete rest[c]
  const second = await write(rest)
  return { ...second, dropped }
}
