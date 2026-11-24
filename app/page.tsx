'use client'

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { CRM_PAGES, PAGES, getAllowedPages, getDefaultPage, type UserRole } from '@/lib/navigation'
import { NavProvider, useNav } from '@/components/app-shell/nav-context'
import { AppShell } from '@/components/app-shell/app-shell'
import { CrmShell } from '@/components/crm/crm-shell'
import { ConfirmProvider } from '@/components/erp/confirm'
import { ErrorBoundary } from '@/components/erp/error-boundary'
import { TooltipProvider } from '@/components/ui/tooltip'
import { clearLocalSession, installAuthGuard } from '@/lib/client-actor'
import { hideNativeSplash, isIosApp } from '@/lib/native-app'
import { NativeReminders } from '@/components/cabinet/native-reminders'

// Every screen is its own chunk: a participant opening the cabinet must not download the admin pages,
// charts and the PDF/Excel exporters (one 3.4 MB bundle before this).
const Dashboard = dynamic(() => import('@/components/dashboard').then(m => m.Dashboard), { loading: PageSpinner })
const ParticipantsPage = dynamic(() => import('@/components/participants-page').then(m => m.ParticipantsPage), { loading: PageSpinner })
const IncomeExpensesPage = dynamic(() => import('@/components/income-expenses-page').then(m => m.IncomeExpensesPage), { loading: PageSpinner })
const PlanFactPage = dynamic(() => import('@/components/plan-fact-page').then(m => m.PlanFactPage), { loading: PageSpinner })
const CallsPage = dynamic(() => import('@/components/crm/calls-page').then(m => m.CallsPage), { loading: PageSpinner })
const InstagramPage = dynamic(() => import('@/components/crm/instagram-page').then(m => m.InstagramPage), { loading: PageSpinner })
const ClientsPage = dynamic(() => import('@/components/crm/clients-page').then(m => m.ClientsPage), { loading: PageSpinner })
const FunnelPage = dynamic(() => import('@/components/crm/funnel-page').then(m => m.FunnelPage), { loading: PageSpinner })
const OfflineEventsPage = dynamic(() => import('@/components/offline-events-page').then(m => m.OfflineEventsPage), { loading: PageSpinner })
const BalanceForecastPage = dynamic(() => import('@/components/balance-forecast-page').then(m => m.BalanceForecastPage), { loading: PageSpinner })
const ProgramsPage = dynamic(() => import('@/components/programs-page').then(m => m.ProgramsPage), { loading: PageSpinner })
const OPiUReportsPage = dynamic(() => import('@/components/opiu-reports-page'), { loading: PageSpinner })
const LoginPage = dynamic(() => import('@/components/login').then(m => m.LoginPage), { loading: ScreenSpinner })
const LandingPage = dynamic(() => import('@/components/landing/landing-page').then(m => m.LandingPage), { loading: ScreenSpinner })
const LifeWheelPage = dynamic(() => import('@/components/life-wheel-page').then(m => m.LifeWheelPage), { loading: PageSpinner })
const LifeBalancePage = dynamic(() => import('@/components/life-balance-page').then(m => m.LifeBalancePage), { loading: PageSpinner })
const BusinessWheelPage = dynamic(() => import('@/components/business-wheel-page').then(m => m.BusinessWheelPage), { loading: PageSpinner })
const HRDashboard = dynamic(() => import('@/components/hr/hr-dashboard').then(m => m.HRDashboard), { loading: PageSpinner })
const EmployeesPage = dynamic(() => import('@/components/hr/employees-page').then(m => m.EmployeesPage), { loading: PageSpinner })
const SchedulePage = dynamic(() => import('@/components/hr/schedule-page').then(m => m.SchedulePage), { loading: PageSpinner })
const TimesheetPage = dynamic(() => import('@/components/hr/timesheet-page').then(m => m.TimesheetPage), { loading: PageSpinner })
const PayrollPage = dynamic(() => import('@/components/hr/payroll-page').then(m => m.PayrollPage), { loading: PageSpinner })
const VacationsPage = dynamic(() => import('@/components/hr/vacations-page').then(m => m.VacationsPage), { loading: PageSpinner })
const UsersPage = dynamic(() => import('@/components/admin/users-page').then(m => m.UsersPage), { loading: PageSpinner })
const EmployeeDashboard = dynamic(() => import('@/components/employee/employee-dashboard').then(m => m.EmployeeDashboard), { loading: PageSpinner })
const ManagerDashboard = dynamic(() => import('@/components/employee/manager-dashboard').then(m => m.ManagerDashboard), { loading: PageSpinner })
const AnalyticsPage = dynamic(() => import('@/components/reports/analytics-page').then(m => m.AnalyticsPage), { loading: PageSpinner })
const AuditPage = dynamic(() => import('@/components/admin/audit-page').then(m => m.AuditPage), { loading: PageSpinner })
const MyPaymentsPage = dynamic(() => import('@/components/cabinet/my-payments-page').then(m => m.MyPaymentsPage), { loading: PageSpinner })
const MySprintPage = dynamic(() => import('@/components/cabinet/my-sprint-page').then(m => m.MySprintPage), { loading: PageSpinner })
const PlansPage = dynamic(() => import('@/components/plans/plans-page').then(m => m.PlansPage), { loading: PageSpinner })
const MyPlanPage = dynamic(() => import('@/components/cabinet/my-plan-page').then(m => m.MyPlanPage), { loading: PageSpinner })
const MyProfilePage = dynamic(() => import('@/components/cabinet/my-profile-page').then(m => m.MyProfilePage), { loading: PageSpinner })
const LessonsPage = dynamic(() => import('@/components/lessons/lessons-page').then(m => m.LessonsPage), { loading: PageSpinner })
const MyTodayPage = dynamic(() => import('@/components/cabinet/my-today-page').then(m => m.MyTodayPage), { loading: PageSpinner })
const SprintsPage = dynamic(() => import('@/components/sprints/sprints-page').then(m => m.SprintsPage), { loading: PageSpinner })

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
  // Signed-out visitors see the public landing; the login form opens on request (button, ?login, or after logout).
  const [loginRequested, setLoginRequested] = useState(false)

  const showLogin = useCallback(() => {
    clearLocalSession()
    const url = new URL(window.location.href)
    url.searchParams.delete('page')
    window.history.replaceState(null, '', url)
    setSession(null)
    setLoginRequested(true)
  }, [])

  useEffect(() => {
    installAuthGuard(showLogin)
    setSession(readSession())
    if (new URLSearchParams(window.location.search).has('login') || isIosApp()) setLoginRequested(true)
    setIsLoading(false)
  }, [showLogin])

  const handleLogout = () => {
    // End the server session first; the screen switches even if the request fails
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    showLogin()
  }

  if (isLoading) return <ScreenSpinner />

  if (!session) {
    if (!loginRequested) return <LandingPage onLogin={() => setLoginRequested(true)} />
    // The iOS app has no landing to go back to
    const onBack = isIosApp() ? undefined : () => setLoginRequested(false)
    return <LoginPage onLoginSuccess={() => setSession(readSession())} onBack={onBack} />
  }

  return <AuthedApp session={session} onLogout={handleLogout} />
}

const CRM_KEY = 'crmAccess'

/** «Доступ к CRM» for the menu: remembered from the last visit, then checked with the server. null while unknown. */
function useCrmAccess(role: UserRole): boolean | null {
  const [crm, setCrm] = useState<boolean | null>(() => {
    if (role === 'admin') return true
    if (role === 'participant') return false
    try {
      const v = localStorage.getItem(CRM_KEY)
      return v === null ? null : v === 'true'
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (role === 'admin' || role === 'participant') return
    fetch('/api/crm/access')
      .then(r => r.json())
      .then(b => {
        setCrm(!!b.access)
        try {
          localStorage.setItem(CRM_KEY, String(!!b.access))
        } catch {}
      })
      .catch(() => setCrm(c => c ?? false))
  }, [role])
  return crm
}

function AuthedApp({ session, onLogout }: { session: SessionUser; onLogout: () => void }) {
  const crmKnown = useCrmAccess(session.role)
  const crm = !!crmKnown
  const allowedPages = useMemo(() => getAllowedPages(session.role, crm), [session.role, crm])
  // iOS app: the splash goes once the cabinet shell is on screen, not before (no blank loader in between)
  useEffect(() => {
    if (crmKnown !== null) hideNativeSplash()
  }, [crmKnown])
  // Wait for the first answer so that a link to a CRM page is not thrown back to the start page
  if (crmKnown === null) return <ScreenSpinner />
  return (
    <NavProvider allowedPages={allowedPages} defaultPage={getDefaultPage(session.role)}>
      <TooltipProvider>
        <ConfirmProvider>
          <Shell session={session} crm={crm} onLogout={onLogout}>
            <PageBoundary>
              <PageRouter session={session} />
            </PageBoundary>
            {session.role === 'participant' && session.participantId && <NativeReminders participantId={session.participantId} />}
          </Shell>
        </ConfirmProvider>
      </TooltipProvider>
    </NavProvider>
  )
}

/** CRM pages get their own full-screen shell; everything else the app shell with its header. */
function Shell({ session, crm, onLogout, children }: { session: SessionUser; crm: boolean; onLogout: () => void; children: ReactNode }) {
  const { page } = useNav()
  if (CRM_PAGES.includes(page)) {
    const allowed = getAllowedPages(session.role, crm)
    const pages = CRM_PAGES.filter(p => allowed.includes(p))
    const home = allowed.find(p => !CRM_PAGES.includes(p)) ?? null
    return (
      <CrmShell pages={pages} home={home} role={session.role} crm={crm} userName={session.fullName} onLogout={onLogout}>
        {children}
      </CrmShell>
    )
  }
  return (
    <AppShell role={session.role} crm={crm} userName={session.fullName} participantId={session.participantId} onLogout={onLogout}>
      {children}
    </AppShell>
  )
}

/** Keyed by page: a crash stays inside one page and clears when the user navigates away. */
function PageBoundary({ children }: { children: ReactNode }) {
  const { page } = useNav()
  return <ErrorBoundary key={page} scope={PAGES[page]?.title ?? page}>{children}</ErrorBoundary>
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
    case 'calls': return <CallsPage />
    case 'funnel': return <FunnelPage />
    case 'instagram': return <InstagramPage />
    case 'clients': return <ClientsPage />
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
    case 'analytics': return <AnalyticsPage />
    case 'audit': return <AuditPage />
    case 'my-payments': return <MyPaymentsPage participantId={session.participantId} participantName={session.fullName} />
    case 'sprints': return <SprintsPage />
    case 'plans': return <PlansPage />
    case 'my-sprint': return <MySprintPage participantId={session.participantId} />
    case 'my-plan': return <MyPlanPage participantId={session.participantId} />
    case 'lessons': return <LessonsPage />
    case 'my-profile': return <MyProfilePage participantId={session.participantId} />
    case 'my-today': return <MyTodayPage participantId={session.participantId} participantName={session.fullName} />
  }
}

function ScreenSpinner() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background">
      <div className="size-7 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
    </div>
  )
}

/** Shown inside the app shell while a screen's chunk downloads. */
function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <div className="size-7 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
    </div>
  )
}
