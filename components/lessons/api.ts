/** JSON calls to the lesson routes with readable errors. */
export class LessonsMigrationRequired extends Error {}

export async function call<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 503 && body?.error === 'lessons_migration_required') throw new LessonsMigrationRequired(body.message)
  if (!res.ok || body?.error) throw new Error(body?.error || `Сервер ответил ${res.status}`)
  return body as T
}
