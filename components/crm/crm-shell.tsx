'use client'

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CRM_PAGES, PAGES, type PageType } from '@/lib/navigation'
import { useNav } from '@/components/app-shell/nav-context'

/**
 * The CRM opens full screen: no app header, only a narrow dark menu on the left
 * (Instagram, Обзвон, Воронка) and the way back to «Год в деле». On phones the menu is a bottom bar.
 */
export function CrmShell({ home, children }: { home: PageType; children: React.ReactNode }) {
  const { page, navigate } = useNav()
  return (
    <div className="flex h-dvh flex-col-reverse bg-background md:flex-row">
      <nav aria-label="Разделы CRM" className="flex shrink-0 items-stretch justify-around gap-1 bg-[oklch(0.2_0.03_265)] px-1 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:w-[76px] md:flex-col md:justify-start md:px-0 md:py-3.5">
        <button
          type="button"
          onClick={() => navigate(home)}
          title="Вернуться в «Год в деле»"
          className="group flex w-16 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold text-white/65 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 md:mx-auto md:mb-3"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-[oklch(0.2_0.03_265)] max-md:hidden">ГД</span>
          <ArrowLeft className="size-5 md:hidden" />
          <span className="md:hidden">Назад</span>
          <span className="max-md:hidden">Выйти</span>
        </button>
        {CRM_PAGES.map(id => {
          const p = PAGES[id]
          const on = page === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60 md:mx-auto',
                on ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/6 hover:text-white'
              )}
            >
              <p.icon className="size-[22px]" />
              {p.label}
            </button>
          )
        })}
      </nav>
      <main className="relative min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
