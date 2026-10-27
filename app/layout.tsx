import React from "react"
import type { Metadata, Viewport } from 'next'
import { Onest } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { ACCENT_INIT_SCRIPT } from '@/lib/accent-init'
import { Toaster } from '@/components/ui/sonner'
import { PwaRegister } from '@/components/pwa-register'
import { display } from '@/components/landing/fonts'
import './globals.css'

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-onest',
  display: 'swap',
})

/** A signed-in participant gets their look (dark unless they chose light) before the first paint, so nothing flashes. */
const PARTICIPANT_INIT_SCRIPT = `try{var l=localStorage;if(l.getItem('isAuthenticated')==='true'&&l.getItem('userRole')==='participant'){var h=document.documentElement,t=l.getItem('pt-theme'),light=t==='light'||(t==='system'&&matchMedia('(prefers-color-scheme: light)').matches);h.classList.add('participant-ui','${display.variable}');if(light)h.classList.add('pt-light')}}catch(e){}`

export const metadata: Metadata = {
  title: 'Год в деле — программа роста бизнеса',
  description: 'Годовая программа роста бизнеса для предпринимателей: наставничество, спринты, уроки и кабинет участника',
  applicationName: 'Год в деле',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Год в деле',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1c24' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className={onest.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCENT_INIT_SCRIPT + PARTICIPANT_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
        <Analytics />
        <PwaRegister />
      </body>
    </html>
  )
}
