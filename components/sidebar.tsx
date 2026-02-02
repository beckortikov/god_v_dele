'use client'

import {
  BarChart3,
  Users,
  TrendingUp,
  Target,
  Calendar,
  PieChart,
  LogOut,
  BookOpen, // Added icon
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PageType = 'dashboard' | 'participants' | 'income' | 'plan-fact' | 'offline' | 'balance' | 'programs'

interface SidebarProps {
  currentPage: PageType
  onPageChange: (page: PageType) => void
}

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard' as PageType, icon: BarChart3, label: 'Дашборд', badge: undefined },
    { id: 'participants' as PageType, icon: Users, label: 'Участники' },
    { id: 'programs' as PageType, icon: BookOpen, label: 'Программы' },
    { id: 'income' as PageType, icon: TrendingUp, label: 'Доходы / Расходы' },
    { id: 'plan-fact' as PageType, icon: Target, label: 'План–Факт' },
    { id: 'offline' as PageType, icon: Calendar, label: 'Оффлайн события' },
    { id: 'balance' as PageType, icon: PieChart, label: 'Прогноз баланса' },
  ]

  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-2xl font-bold text-sidebar-primary">План–Факт</h1>
        <p className="text-xs text-sidebar-foreground/60 mt-1">Финансовая платформа</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-sidebar-border space-y-3">
        <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/50">
          <LogOut className="w-5 h-5" />
          <span className="text-sm">Выход</span>
        </Button>
      </div>
    </aside>
  )
}
