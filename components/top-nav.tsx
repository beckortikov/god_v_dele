'use client'

import { Bell, Settings, User, LogOut, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageType } from '@/components/sidebar'

interface TopNavProps {
  currentPage: PageType
  onLogout?: () => void
  onMenuClick?: () => void
}

const pageNames: Record<PageType, string> = {
  dashboard: 'Главный дашборд',
  participants: 'Управление участниками',
  programs: 'Управление программами',
  income: 'Доходы и расходы',
  'plan-fact': 'План–Факт анализ',
  offline: 'Оффлайн мероприятия',
  balance: 'Прогноз баланса',
  'opiu-reports': 'Ежемесячные отчеты ОПиУ',
}

export function TopNav({ currentPage, onLogout, onMenuClick }: TopNavProps) {
  return (
    <header className="bg-card border-b border-border px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Hamburger menu - mobile only */}
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-foreground hover:bg-muted touch-manipulation"
            onClick={onMenuClick}
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}
        <div className="min-w-0">
          <h2 className="text-base sm:text-xl font-semibold text-foreground truncate">{pageNames[currentPage]}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 sm:mt-1 hidden sm:block">Приложение для управления финансами</p>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
        <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted touch-manipulation hidden sm:flex">
          <Bell className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted touch-manipulation hidden md:flex">
          <Settings className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted touch-manipulation hidden sm:flex">
          <User className="w-5 h-5" />
        </Button>
        {onLogout && (
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground hover:bg-muted hover:text-destructive touch-manipulation"
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
