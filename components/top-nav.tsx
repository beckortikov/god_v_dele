'use client'

import { Bell, Settings, User, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageType } from '@/components/sidebar'

interface TopNavProps {
  currentPage: PageType
  onLogout?: () => void
}

const pageNames: Record<PageType, string> = {
  dashboard: 'Главный дашборд',
  participants: 'Управление участниками',
  programs: 'Управление программами',
  income: 'Доходы и расходы',
  'plan-fact': 'План–Факт анализ',
  offline: 'Оффлайн мероприятия',
  balance: 'Прогноз баланса',
}

export function TopNav({ currentPage, onLogout }: TopNavProps) {
  return (
    <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{pageNames[currentPage]}</h2>
        <p className="text-xs text-muted-foreground mt-1">Приложение для управления финансами</p>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted">
          <Bell className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted">
          <Settings className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted">
          <User className="w-5 h-5" />
        </Button>
        {onLogout && (
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground hover:bg-muted hover:text-destructive"
            onClick={onLogout}
            title="Выход"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        )}
      </div>
    </header>
  )
}
