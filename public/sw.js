/*
 * Год в деле: minimal service worker.
 *
 * Its only job is an offline fallback page for navigations. It deliberately
 * caches NOTHING else: no /api responses, no HTML pages, no assets, so the app
 * can never show stale financial data. Every request goes to the network as usual.
 */
const CACHE = 'gvd-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || request.mode !== 'navigate') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse
        if (preloaded) return preloaded
        return await fetch(request)
      } catch {
        const cache = await caches.open(CACHE)
        const offline = await cache.match(OFFLINE_URL)
        return offline || new Response('Нет подключения к интернету', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
    })(),
  )
})
