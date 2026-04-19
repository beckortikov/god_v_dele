'use client'

import {
  BarChart3,
  Users,
  TrendingUp,
  Target,
  Calendar,
  PieChart,
  LogOut,
  BookOpen,
  X,
  FileText,
  User,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PageType =
  | 'dashboard' | 'participants' | 'income' | 'plan-fact' | 'offline' | 'balance' | 'programs' | 'opiu-reports' | 'life-wheel'
  | 'hr-dashboard' | 'employees' | 'schedule' | 'payroll' | 'vacations' | 'timesheet'
  | 'users' | 'employee-dashboard' | 'manager-dashboard'

interface SidebarProps {
  currentPage: PageType
  onPageChange: (page: PageType) => void
  isOpen?: boolean
  onClose?: () => void
  mode: 'finance' | 'hr' | 'employee'
  userRole?: 'admin' | 'finance' | 'employee' | 'manager' | 'participant'
}

export function Sidebar({ currentPage, onPageChange, isOpen = true, onClose, mode, userRole = 'admin' }: SidebarProps) {
  const financeMenuItems: { id: PageType; icon: any; label: string; section?: string; badge?: any }[] = [
    { id: 'dashboard', icon: BarChart3, label: 'Дашборд', badge: undefined },
    { id: 'participants', icon: Users, label: 'Участники' },
    { id: 'programs', icon: BookOpen, label: 'Программы' },
    { id: 'income', icon: TrendingUp, label: 'Доходы / Расходы', section: 'finance' },
    { id: 'plan-fact', icon: Target, label: 'План–Факт', section: 'finance' },
    { id: 'offline', icon: Calendar, label: 'Оффлайн события', section: 'finance' },
    { id: 'balance', icon: PieChart, label: 'Прогноз баланса', section: 'finance' },
    { id: 'life-wheel', icon: PieChart, label: 'Колесо внимания', section: 'participants' },
    { id: 'opiu-reports', icon: FileText, label: 'Ежемесячные отчеты', section: 'opiu' },
  ]

  const hrMenuItems: { id: PageType; icon: any; label: string; section?: string; badge?: any }[] = [
    { id: 'hr-dashboard', icon: BarChart3, label: 'HR Дашборд' },
    { id: 'employees', icon: Users, label: 'Сотрудники' },
    { id: 'schedule', icon: Calendar, label: 'График работы' },
    { id: 'timesheet', icon: Clock, label: 'Табель времени' },
    { id: 'payroll', icon: TrendingUp, label: 'Зарплата' },
    { id: 'vacations', icon: FileText, label: 'Отгулы / Отпуска' },
  ]

  const adminMenuItems: { id: PageType; icon: any; label: string; section?: string; badge?: any }[] = [
    { id: 'users', icon: Users, label: 'Пользователи', section: 'admin' }
  ]

  const employeeMenuItems: { id: PageType; icon: any; label: string; section?: string; badge?: any }[] = [
    { id: 'employee-dashboard', icon: User, label: 'Мой кабинет' },
    { id: 'life-wheel', icon: PieChart, label: 'Колесо внимания' },
  ]

  const participantMenuItems: { id: PageType; icon: any; label: string; section?: string; badge?: any }[] = [
    { id: 'life-wheel', icon: PieChart, label: 'Колесо внимания' },
  ]

  if (userRole === 'manager') {
    employeeMenuItems.push({ id: 'manager-dashboard', icon: Users, label: 'Задачи сотрудников' })
  }

  let menuItems = mode === 'finance' ? financeMenuItems : mode === 'hr' ? hrMenuItems : userRole === 'participant' ? participantMenuItems : employeeMenuItems

  if (userRole === 'admin' && (mode === 'finance' || mode === 'hr')) {
    menuItems = [...menuItems, ...adminMenuItems]
  }

  // Simplified logic
  // const menuItems = mode === 'finance' ? financeMenuItems : hrMenuItems
  // if (userRole === 'admin') menuItems.push(...adminMenuItems) -- can't push to const/readonly. 


  const handlePageChange = (page: PageType) => {
    onPageChange(page)
    // Close sidebar on mobile after navigation
    if (onClose) {
      onClose()
    }
  }

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="p-4 sm:p-6 border-b border-sidebar-border flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-sidebar-primary">Год в деле</h1>
            <p className="text-xs text-sidebar-foreground/60 mt-1">Обучение твой рост</p>
          </div>
          {/* Close button - mobile only */}
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-sidebar-accent/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 sm:p-4 space-y-1 sm:space-y-2 overflow-y-auto">
          {menuItems.map((item, index) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            const prevItem = menuItems[index - 1]
            const showSectionHeader = item.section && item.section !== prevItem?.section

            return (
              <div key={item.id}>
                {showSectionHeader && (
                  <div className="px-3 py-2 mt-4 first:mt-0">
                    <p className="text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
                      {item.section === 'opiu' ? 'ОПиУ' : item.section === 'admin' ? 'Пользователи' : item.section === 'participants' ? 'Участники' : 'Финансы'}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => handlePageChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3 sm:px-4 py-3 rounded-lg transition-colors touch-manipulation ${isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                    }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              </div>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-3 sm:p-4 border-t border-sidebar-border space-y-3">
          <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/50 touch-manipulation">
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Выход</span>
          </Button>
        </div>
      </aside>
    </>
  )
}
