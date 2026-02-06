'use client'

import { Bell, Settings, User, LogOut, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageType } from '@/components/sidebar'

interface TopNavProps {
  currentPage: PageType
  onLogout?: () => void
  onMenuClick?: () => void
  mode: 'finance' | 'hr'
  onModeChange: (mode: 'finance' | 'hr') => void
  userRole?: 'admin' | 'finance'
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
  // HR pages
  'hr-dashboard': 'HR Дашборд',
  employees: 'Сотрудники',
  schedule: 'График работы',
  payroll: 'Зарплата',
  vacations: 'Отгулы и отпуска',
  users: 'Управление пользователями',
}

export function TopNav({ currentPage, onLogout, onMenuClick, mode, onModeChange, userRole = 'admin' }: TopNavProps) {
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
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            {userRole === 'admin' && (
              <div className="flex bg-muted rounded-lg p-1">
                <button
                  onClick={() => onModeChange('finance')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'finance'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Финансы
                </button>
                <button
                  onClick={() => onModeChange('hr')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'hr'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  HR
                </button>
              </div>
            )}
          </div>
          <h2 className="text-base sm:text-xl font-semibold text-foreground truncate">{pageNames[currentPage]}</h2>
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
