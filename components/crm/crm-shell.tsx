'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, LogOut, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PAGES, type PageType, type UserRole } from '@/lib/navigation'
import { useNav } from '@/components/app-shell/nav-context'
import { NotificationsBell } from '@/components/app-shell/notifications-bell'

const NewClientDialog = dynamic(() => import('@/components/crm/clients-page').then(m => m.NewClientDialog))

const item = (on: boolean) =>
  cn(
    'flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl py-2 text-center text-[11px] leading-tight font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60 md:mx-auto',
    on ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/6 hover:text-white'
  )

/**
 * The CRM opens full screen: no app header, only a narrow dark menu (tasks first, then the CRM tools),
 * a quick «+ Клиент», the bell and sign-out. `home` is the app page to go back to; none for people
 * whose whole app is the CRM (employees). On phones the menu is a bottom bar.
 */
export function CrmShell({
  pages,
  home,
  role,
  crm,
  userName,
  onLogout,
  children,
}: {
  pages: PageType[]
  home: PageType | null
  role: UserRole
  crm: boolean
  userName: string | null
  onLogout: () => void
  children: React.ReactNode
}) {
  const { page, navigate } = useNav()
  const [adding, setAdding] = React.useState(false)
  const canAddClient = pages.includes('clients')
  return (
    <div className="flex h-dvh flex-col-reverse bg-background md:flex-row">
      <nav
        aria-label="Разделы CRM"
        className="flex shrink-0 items-stretch gap-1 overflow-x-auto bg-[oklch(0.2_0.03_265)] px-1 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] scrollbar-none md:w-[76px] md:flex-col md:overflow-x-visible md:overflow-y-auto md:px-0 md:py-3.5"
      >
        {home ? (
          <button type="button" onClick={() => navigate(home)} title="Вернуться в «Год в деле»" className={cn(item(false), 'md:mb-2')}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-[oklch(0.2_0.03_265)] max-md:hidden">ГД</span>
            <ArrowLeft className="size-5 md:hidden" />
            <span className="md:hidden">Назад</span>
            <span className="max-md:hidden">Выйти</span>
          </button>
        ) : (
          <span className="mx-auto mb-2 flex size-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-[oklch(0.2_0.03_265)] max-md:hidden" aria-label="Год в деле">
            ГД
          </span>
        )}
        {pages.map(id => {
          const p = PAGES[id]
          return (
            <button key={id} type="button" onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined} className={item(page === id)}>
              <p.icon className="size-[22px]" />
              {p.label}
            </button>
          )
        })}
        {canAddClient && (
          <button type="button" onClick={() => setAdding(true)} title="Добавить клиента: с улицы, по звонку, по рекомендации" className={cn(item(false), 'md:mt-2')}>
            <span className="flex size-[22px] items-center justify-center rounded-md bg-white/15">
              <UserPlus className="size-4" />
            </span>
            Клиент
          </button>
        )}
        <div className="flex-1 max-md:hidden" />
        <div className="flex shrink-0 items-center justify-center text-white md:mx-auto [&_button]:text-white/75 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
          <NotificationsBell role={role} crm={crm} />
        </div>
        <button type="button" onClick={onLogout} title={userName ? `Выйти из аккаунта (${userName})` : 'Выйти из аккаунта'} className={item(false)}>
          <LogOut className="size-5" />
          Выход
        </button>
      </nav>
      <main className="relative min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
      {canAddClient && adding && <NewClientDialog open onClose={() => setAdding(false)} onSaved={() => setAdding(false)} />}
    </div>
  )
}
