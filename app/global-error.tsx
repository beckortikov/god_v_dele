'use client'

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/erp/error-boundary'
import { ACCENT_INIT_SCRIPT } from '@/components/theme-provider'
import './globals.css'

// The root layout (and its ThemeProvider) is replaced here, so restore the
// saved theme and accent ourselves before paint.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <title>Ошибка — Год в деле</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT + ACCENT_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <main className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xs">
            <ErrorFallback
              error={error}
              title="Приложение не загрузилось"
              description="Произошла непредвиденная ошибка. Данные не потеряны: обновите страницу. Если ошибка повторится, скопируйте детали и отправьте их администратору."
            />
          </div>
        </main>
      </body>
    </html>
  )
}
