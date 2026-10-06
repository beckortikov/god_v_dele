'use client'

import { useState, useEffect, useMemo } from 'react'
import { getAllowedPages, getDefaultPage, type UserRole } from '@/lib/navigation'
import { NavProvider, useNav } from '@/components/app-shell/nav-context'
import { AppShell } from '@/components/app-shell/app-shell'
import { ConfirmProvider } from '@/components/erp/confirm'
import { TooltipProvider } from '@/components/ui/tooltip'
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
import { LifeBalancePage } from '@/components/life-balance-page'
import { BusinessWheelPage } from '@/components/business-wheel-page'

import { HRDashboard } from '@/components/hr/hr-dashboard'
import { EmployeesPage } from '@/components/hr/employees-page'
import { SchedulePage } from '@/components/hr/schedule-page'
import { TimesheetPage } from '@/components/hr/timesheet-page'
import { PayrollPage } from '@/components/hr/payroll-page'
import { VacationsPage } from '@/components/hr/vacations-page'
import { UsersPage } from '@/components/admin/users-page'
import { EmployeeDashboard } from '@/components/employee/employee-dashboard'
import { ManagerDashboard } from '@/components/employee/manager-dashboard'

interface SessionUser {
  role: UserRole
  participantId: string | null
  fullName: string | null
}

function readSession(): SessionUser | null {
  if (localStorage.getItem('isAuthenticated') !== 'true') return null
  const role = (localStorage.getItem('userRole') as UserRole) || 'admin'
  let participantId: string | null = null
  let fullName: string | null = null
  try {
    const stored = localStorage.getItem('user')
    if (stored) {
      const u = JSON.parse(stored)
      participantId = u.participant_id || u.employee_id || u.id || null
      fullName = u.full_name || u.employee_name || u.username || null
    }
  } catch { /* ignore */ }
  return { role, participantId, fullName }
}

export default function Home() {
  const [session, setSession] = useState<SessionUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setSession(readSession())
    setIsLoading(false)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('userRole')
    localStorage.removeItem('user')
    const url = new URL(window.location.href)
    url.searchParams.delete('page')
    window.history.replaceState(null, '', url)
    setSession(null)
  }

  if (isLoading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <div className="size-7 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
      </div>
    )
  }

  if (!session) {
    return <LoginPage onLoginSuccess={() => setSession(readSession())} />
  }

  return <AuthedApp session={session} onLogout={handleLogout} />
}

function AuthedApp({ session, onLogout }: { session: SessionUser; onLogout: () => void }) {
  const allowedPages = useMemo(() => getAllowedPages(session.role), [session.role])
  return (
    <NavProvider allowedPages={allowedPages} defaultPage={getDefaultPage(session.role)}>
      <TooltipProvider>
        <ConfirmProvider>
          <AppShell role={session.role} userName={session.fullName} onLogout={onLogout}>
            <PageRouter session={session} />
          </AppShell>
        </ConfirmProvider>
      </TooltipProvider>
    </NavProvider>
  )
}

function PageRouter({ session }: { session: SessionUser }) {
  const { page } = useNav()
  const isWheelsAdmin = session.role === 'admin' || session.role === 'wheels_manager'
  const selfView = {
    participantId: !isWheelsAdmin && session.participantId ? session.participantId : undefined,
    participantName: !isWheelsAdmin ? session.fullName || undefined : undefined,
  }

  switch (page) {
    case 'dashboard': return <Dashboard />
    case 'participants': return <ParticipantsPage />
    case 'programs': return <ProgramsPage />
    case 'opiu-reports': return <OPiUReportsPage />
    case 'income': return <IncomeExpensesPage />
    case 'plan-fact': return <PlanFactPage />
    case 'offline': return <OfflineEventsPage />
    case 'balance': return <BalanceForecastPage />
    case 'life-wheel': return <LifeWheelPage {...selfView} />
    case 'life-balance': return <LifeBalancePage {...selfView} />
    case 'business-wheel': return <BusinessWheelPage {...selfView} />
    case 'hr-dashboard': return <HRDashboard />
    case 'employees': return <EmployeesPage />
    case 'schedule': return <SchedulePage />
    case 'timesheet': return <TimesheetPage />
    case 'payroll': return <PayrollPage />
    case 'vacations': return <VacationsPage />
    case 'users': return <UsersPage />
    case 'employee-dashboard': return <EmployeeDashboard />
    case 'manager-dashboard': return <ManagerDashboard />
  }
}
