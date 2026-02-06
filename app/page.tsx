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

import { HRDashboard } from '@/components/hr/hr-dashboard'
import { EmployeesPage } from '@/components/hr/employees-page'
import { SchedulePage } from '@/components/hr/schedule-page'
import { PayrollPage } from '@/components/hr/payroll-page'
import { VacationsPage } from '@/components/hr/vacations-page'
import { UsersPage } from '@/components/admin/users-page'

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')
  const [mode, setMode] = useState<'finance' | 'hr'>('finance')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'finance'>('admin')

  useEffect(() => {
    // Check if user is already authenticated
    const auth = localStorage.getItem('isAuthenticated')
    const role = localStorage.getItem('userRole') as 'admin' | 'finance' || 'admin'
    setIsAuthenticated(auth === 'true')
    setUserRole(role)
    setIsLoading(false)

    // If finance user, ensure they start on finance dashboard
    if (role === 'finance') {
      setMode('finance')
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('userRole')
    setIsAuthenticated(false)
    setUserRole('admin') // Reset to default
  }

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  const closeSidebar = () => {
    setIsSidebarOpen(false)
  }

  const handleModeChange = (newMode: 'finance' | 'hr') => {
    setMode(newMode)
    setCurrentPage(newMode === 'finance' ? 'dashboard' : 'hr-dashboard')
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
    return <LoginPage onLoginSuccess={() => {
      setIsAuthenticated(true)
      const role = localStorage.getItem('userRole') as 'admin' | 'finance' || 'admin'
      setUserRole(role)
      if (role === 'finance') setMode('finance')
    }} />
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        mode={mode}
        userRole={userRole}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav
          currentPage={currentPage}
          onLogout={handleLogout}
          onMenuClick={toggleSidebar}
          mode={mode}
          onModeChange={handleModeChange}
          userRole={userRole}
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

          {/* HR Pages */}
          {currentPage === 'hr-dashboard' && <HRDashboard />}
          {currentPage === 'employees' && <EmployeesPage />}
          {currentPage === 'schedule' && <SchedulePage />}
          {currentPage === 'payroll' && <PayrollPage />}
          {currentPage === 'vacations' && <VacationsPage />}
          {currentPage === 'users' && <UsersPage />}
        </main>
      </div>
    </div>
  )
}
