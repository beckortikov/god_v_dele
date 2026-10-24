import type { MetadataRoute } from 'next'

// Colours mirror the light tokens in app/globals.css:
// --nav oklch(1 0 0) → #ffffff, --background oklch(0.982 0.004 265) → #f8f9fc.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Год в деле',
    short_name: 'Год в деле',
    description: 'Годовая программа роста бизнеса для предпринимателей: наставничество, спринты, уроки и кабинет участника',
    lang: 'ru',
    dir: 'ltr',
    // Installed app opens straight to the sign-in form, not the public landing page.
    start_url: '/?login',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#ffffff',
    background_color: '#f8f9fc',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
