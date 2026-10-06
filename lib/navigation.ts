import {
  LayoutDashboard,
  Users,
  BookOpen,
  ArrowLeftRight,
  Target,
  CalendarDays,
  LineChart,
  FileSpreadsheet,
  Compass,
  Scale,
  Briefcase,
  Activity,
  UserSquare2,
  CalendarClock,
  Clock,
  Wallet,
  Palmtree,
  ShieldCheck,
  UserCircle2,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'

export type PageType =
  | 'dashboard' | 'participants' | 'income' | 'plan-fact' | 'offline' | 'balance' | 'programs' | 'opiu-reports'
  | 'life-wheel' | 'life-balance' | 'business-wheel'
  | 'hr-dashboard' | 'employees' | 'schedule' | 'payroll' | 'vacations' | 'timesheet'
  | 'users' | 'employee-dashboard' | 'manager-dashboard'

export type UserRole = 'admin' | 'finance' | 'employee' | 'manager' | 'wheels_manager' | 'participant'

export interface NavPage {
  id: PageType
  label: string
  title: string
  description: string
  icon: LucideIcon
}

export interface NavSection {
  id: string
  label: string
  icon: LucideIcon
  pages: PageType[]
}

export const PAGES: Record<PageType, NavPage> = {
  dashboard: { id: 'dashboard', label: 'Дашборд', title: 'Дашборд', description: 'Ключевые показатели по всем программам', icon: LayoutDashboard },
  participants: { id: 'participants', label: 'Участники', title: 'Участники', description: 'Список участников, тарифы и оплаты', icon: Users },
  programs: { id: 'programs', label: 'Программы', title: 'Программы', description: 'Обучающие программы и их стоимость', icon: BookOpen },
  income: { id: 'income', label: 'Доходы и расходы', title: 'Доходы и расходы', description: 'Поступления, расходы и счета', icon: ArrowLeftRight },
  'plan-fact': { id: 'plan-fact', label: 'План–Факт', title: 'План–Факт', description: 'Сравнение плановых и фактических сумм', icon: Target },
  balance: { id: 'balance', label: 'Прогноз баланса', title: 'Прогноз баланса', description: 'Ожидаемый остаток на будущие месяцы', icon: LineChart },
  offline: { id: 'offline', label: 'Оффлайн-события', title: 'Оффлайн-события', description: 'Мероприятия, участники и их бюджет', icon: CalendarDays },
  'opiu-reports': { id: 'opiu-reports', label: 'ОПиУ по месяцам', title: 'Отчёт о прибылях и убытках', description: 'Ежемесячный ОПиУ по программам', icon: FileSpreadsheet },
  'life-wheel': { id: 'life-wheel', label: 'Колесо внимания', title: 'Колесо внимания', description: 'Распределение времени по сферам', icon: Compass },
  'life-balance': { id: 'life-balance', label: 'Колесо жизни', title: 'Колесо жизни', description: 'Оценка баланса жизни', icon: Scale },
  'business-wheel': { id: 'business-wheel', label: 'Колесо бизнеса', title: 'Колесо бизнеса', description: 'Оценка направлений бизнеса', icon: Briefcase },
  'hr-dashboard': { id: 'hr-dashboard', label: 'Обзор', title: 'Персонал — обзор', description: 'Сотрудники, присутствие и фонд оплаты', icon: Activity },
  employees: { id: 'employees', label: 'Сотрудники', title: 'Сотрудники', description: 'Карточки сотрудников и ставки', icon: UserSquare2 },
  schedule: { id: 'schedule', label: 'График', title: 'График работы', description: 'Смены и рабочие дни', icon: CalendarClock },
  timesheet: { id: 'timesheet', label: 'Табель', title: 'Табель учёта времени', description: 'Отработанные часы по дням', icon: Clock },
  payroll: { id: 'payroll', label: 'Зарплата', title: 'Зарплата', description: 'Начисления и выплаты', icon: Wallet },
  vacations: { id: 'vacations', label: 'Отпуска', title: 'Отгулы и отпуска', description: 'Заявки и остатки дней', icon: Palmtree },
  users: { id: 'users', label: 'Пользователи', title: 'Пользователи', description: 'Доступы и роли', icon: ShieldCheck },
  'employee-dashboard': { id: 'employee-dashboard', label: 'Мой кабинет', title: 'Мой кабинет', description: 'Задачи, время и заявки', icon: UserCircle2 },
  'manager-dashboard': { id: 'manager-dashboard', label: 'Задачи команды', title: 'Задачи сотрудников', description: 'Постановка и контроль задач', icon: ListChecks },
}

const S = {
  home: { id: 'home', label: 'Главное', icon: LayoutDashboard, pages: ['dashboard'] },
  people: { id: 'people', label: 'Участники', icon: Users, pages: ['participants', 'programs'] },
  finance: { id: 'finance', label: 'Финансы', icon: ArrowLeftRight, pages: ['income', 'plan-fact', 'balance', 'offline'] },
  reports: { id: 'reports', label: 'Отчёты', icon: FileSpreadsheet, pages: ['opiu-reports'] },
  wheels: { id: 'wheels', label: 'Колёса баланса', icon: Compass, pages: ['life-wheel', 'life-balance', 'business-wheel'] },
  hr: { id: 'hr', label: 'Персонал', icon: UserSquare2, pages: ['hr-dashboard', 'employees', 'schedule', 'timesheet', 'payroll', 'vacations'] },
  admin: { id: 'admin', label: 'Администрирование', icon: ShieldCheck, pages: ['users'] },
} satisfies Record<string, NavSection>

export function getSections(role: UserRole): NavSection[] {
  switch (role) {
    case 'admin':
      return [S.home, S.people, S.finance, S.reports, S.wheels, S.hr, S.admin]
    case 'finance':
      return [S.home, S.people, S.finance, S.reports, S.wheels]
    case 'wheels_manager':
      return [S.wheels, { ...S.people, pages: ['participants'] }]
    case 'manager':
      return [{ id: 'cabinet', label: 'Кабинет', icon: UserCircle2, pages: ['employee-dashboard', 'manager-dashboard'] }, S.wheels]
    case 'employee':
      return [{ id: 'cabinet', label: 'Кабинет', icon: UserCircle2, pages: ['employee-dashboard'] }, S.wheels]
    case 'participant':
      return [S.wheels]
  }
}

export function getDefaultPage(role: UserRole): PageType {
  switch (role) {
    case 'manager':
      return 'manager-dashboard'
    case 'wheels_manager':
    case 'employee':
    case 'participant':
      return 'life-wheel'
    default:
      return 'dashboard'
  }
}

export function getAllowedPages(role: UserRole): PageType[] {
  return getSections(role).flatMap(s => s.pages)
}

export function findSection(sections: NavSection[], page: PageType) {
  return sections.find(s => s.pages.includes(page))
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Администратор',
  finance: 'Финансист',
  employee: 'Сотрудник',
  manager: 'Руководитель',
  wheels_manager: 'Менеджер колёс',
  participant: 'Участник',
}
