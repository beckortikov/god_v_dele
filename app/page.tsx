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
import { LifeWheelPage } from '@/components/life-wheel-page'

import { HRDashboard } from '@/components/hr/hr-dashboard'
import { EmployeesPage } from '@/components/hr/employees-page'
import { SchedulePage } from '@/components/hr/schedule-page'
import { TimesheetPage } from '@/components/hr/timesheet-page'
import { PayrollPage } from '@/components/hr/payroll-page'
import { VacationsPage } from '@/components/hr/vacations-page'
import { UsersPage } from '@/components/admin/users-page'
import { EmployeeDashboard } from '@/components/employee/employee-dashboard'
import { ManagerDashboard } from '@/components/employee/manager-dashboard'

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')
  const [mode, setMode] = useState<'finance' | 'hr' | 'employee'>('finance')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'finance' | 'employee' | 'manager' | 'participant'>('admin')
  const [userParticipantId, setUserParticipantId] = useState<string | null>(null)
  const [userFullName, setUserFullName] = useState<string | null>(null)

  useEffect(() => {
    // Check if user is already authenticated
    const auth = localStorage.getItem('isAuthenticated')
    const role = localStorage.getItem('userRole') as 'admin' | 'finance' | 'employee' | 'manager' | 'participant' || 'admin'
    setIsAuthenticated(auth === 'true')
    setUserRole(role as any)
    setIsLoading(false)

    if (role === 'finance') {
      setMode('finance')
    } else if (role === 'manager') {
      setMode('employee')
      setCurrentPage('manager-dashboard')
    } else if (role === 'employee' || role === 'participant') {
      setMode('employee')
      setCurrentPage('life-wheel')
    }

    // Load user info for participant self-view
    try {
      const storedUser = localStorage.getItem('user')
      if (storedUser) {
        const userData = JSON.parse(storedUser)
        setUserParticipantId(userData.participant_id || userData.employee_id || userData.id || null)
        setUserFullName(userData.full_name || userData.employee_name || userData.username || null)
      }
    } catch (e) { /* ignore */ }
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

  const handleModeChange = (newMode: 'finance' | 'hr' | 'employee') => {
    setMode(newMode)
    if (newMode === 'finance') setCurrentPage('dashboard')
    else if (newMode === 'hr') setCurrentPage('hr-dashboard')
    else setCurrentPage('employee-dashboard')
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
      const role = localStorage.getItem('userRole') as 'admin' | 'finance' | 'employee' | 'manager' | 'participant' || 'admin'
      setUserRole(role as any)

      try {
        const storedUser = localStorage.getItem('user')
        if (storedUser) {
          const userData = JSON.parse(storedUser)
          setUserParticipantId(userData.participant_id || userData.employee_id || userData.id || null)
          setUserFullName(userData.full_name || userData.employee_name || userData.username || null)
        }
      } catch (e) { /* ignore */ }

      if (role === 'finance') {
        setMode('finance')
        setCurrentPage('dashboard')
      } else if (role === 'manager') {
        setMode('employee')
        setCurrentPage('manager-dashboard')
      } else if (role === 'employee' || role === 'participant') {
        setMode('employee')
        setCurrentPage('life-wheel')
      }
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
          {currentPage === 'life-wheel' && (
            <LifeWheelPage
              participantId={(userRole === 'employee' || userRole === 'manager' || userRole === 'participant') && userParticipantId ? userParticipantId : undefined}
              participantName={userFullName || undefined}
            />
          )}

          {/* HR Pages */}
          {currentPage === 'hr-dashboard' && <HRDashboard />}
          {currentPage === 'employees' && <EmployeesPage />}
          {currentPage === 'schedule' && <SchedulePage />}
          {currentPage === 'timesheet' && <TimesheetPage />}
          {currentPage === 'payroll' && <PayrollPage />}
          {currentPage === 'vacations' && <VacationsPage />}
          {currentPage === 'users' && <UsersPage />}

          {/* Employee Pages */}
          {currentPage === 'employee-dashboard' && <EmployeeDashboard />}
          {currentPage === 'manager-dashboard' && <ManagerDashboard />}
        </main>
      </div>
    </div>
  )
}
