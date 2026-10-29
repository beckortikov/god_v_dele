import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileStorage } from '@/lib/file-storage'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('file storage client', () => {
  beforeEach(() => {
    vi.stubEnv('FILES_URL', 'https://files.example.test')
    vi.stubEnv('FILES_SECRET', 'secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('retries a request that died on a stale connection', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(ok({ name: 'lesson-materials' }))
    vi.stubGlobal('fetch', fetch)
    const { data, error } = await createFileStorage().getBucket('lesson-materials')
    expect(error).toBeNull()
    expect(data).toEqual({ name: 'lesson-materials' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after three network failures with the error, not a throw', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetch)
    const { data, error } = await createFileStorage().from('lesson-materials').remove(['a/b.pdf'])
    expect(data).toBeNull()
    expect(error?.message).toBe('fetch failed')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not repeat a request the service answered', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const { error } = await createFileStorage().getBucket('nope')
    expect(error).toEqual({ message: 'Not found', statusCode: '404' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
