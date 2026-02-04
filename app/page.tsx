'use client'

import { useState, useEffect } from 'react'
import { Sidebar, PageType } from '@/components/sidebar' // Updated import
import { TopNav } from '@/components/top-nav'
import { Dashboard } from '@/components/dashboard'
import { ParticipantsPage } from '@/components/participants-page'
import { IncomeExpensesPage } from '@/components/income-expenses-page'
import { PlanFactPage } from '@/components/plan-fact-page'
import { OfflineEventsPage } from '@/components/offline-events-page'
import { BalanceForecastPage } from '@/components/balance-forecast-page'
import { ProgramsPage } from '@/components/programs-page'
import OPiUReportsPage from '@/components/opiu-reports-page'
import { LoginPage } from '@/components/login'

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    // Check if user is already authenticated
    const auth = localStorage.getItem('isAuthenticated')
    setIsAuthenticated(auth === 'true')
    setIsLoading(false)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated')
    setIsAuthenticated(false)
  }

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  const closeSidebar = () => {
    setIsSidebarOpen(false)
  }

  if (isLoading) {
    return (
      <div className="w-full h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav
          currentPage={currentPage}
          onLogout={handleLogout}
          onMenuClick={toggleSidebar}
        />
        <main className="flex-1 overflow-auto">
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'participants' && <ParticipantsPage />}
          {currentPage === 'programs' && <ProgramsPage />}
          {currentPage === 'opiu-reports' && <OPiUReportsPage />}
          {currentPage === 'income' && <IncomeExpensesPage />}
          {currentPage === 'plan-fact' && <PlanFactPage />}
          {currentPage === 'offline' && <OfflineEventsPage />}
          {currentPage === 'balance' && <BalanceForecastPage />}
        </main>
      </div>
    </div>
  )
}
