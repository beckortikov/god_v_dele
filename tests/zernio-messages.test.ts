import { afterEach, describe, expect, it, vi } from 'vitest'
import { listMessages } from '@/lib/zernio'

const msg = (id: string, extra: Record<string, unknown>) => ({ id, message: '', direction: 'incoming', createdAt: `2026-11-2${id}T10:00:00Z`, attachments: [], ...extra })

describe('Instagram messages Instagram does not hand over', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('marks empty ones and Instagram’s «Use the latest app» stand-in as unsupported, keeps real cards', async () => {
    process.env.ZERNIO_API_KEY = 'test'
    const messages = [
      msg('1', { message: 'Привет' }),
      msg('2', {}),
      msg('3', { noRenderableContent: true, attachments: [{ type: 'template', payload: { generic: { elements: [] } } }] }),
      msg('4', { attachments: [{ type: 'template', payload: { template_type: 'generic', elements: [{ title: 'Use the latest app' }] } }] }),
      msg('5', { attachments: [{ type: 'template', payload: { elements: [{ title: 'Мастермайнд', subtitle: '25 декабря', default_action: { url: 'https://example.com' } }] } }] }),
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/accounts') ? { accounts: [{ _id: 'a1', platform: 'instagram', username: 'x' }] } : { messages }))
    ))
    const out = await listMessages('c1')
    expect(out.map(m => m.unsupported)).toEqual([false, true, true, true, false])
    expect(out[4].card).toEqual({ title: 'Мастермайнд', subtitle: '25 декабря', url: 'https://example.com' })
  })
})
