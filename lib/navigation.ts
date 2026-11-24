import { PARTICIPANT_PAYMENTS_VISIBLE } from '@/lib/feature-flags'
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
  PieChart,
  History,
  Receipt,
  Flag,
  Sun,
  UserRound,
  CalendarRange,
  ClipboardList,
  PhoneCall,
  Filter,
  Instagram,
  Contact,
  ListTodo,
  Headset,
  type LucideIcon,
} from 'lucide-react'

export type PageType =
  | 'dashboard' | 'participants' | 'income' | 'plan-fact' | 'offline' | 'balance' | 'programs' | 'opiu-reports'
  | 'life-wheel' | 'life-balance' | 'business-wheel'
  | 'hr-dashboard' | 'employees' | 'schedule' | 'payroll' | 'vacations' | 'timesheet'
  | 'users' | 'employee-dashboard' | 'manager-dashboard'
  | 'analytics' | 'audit' | 'my-payments'
  | 'sprints' | 'plans' | 'my-sprint' | 'my-plan' | 'my-today' | 'my-profile' | 'lessons' | 'calls' | 'funnel' | 'instagram' | 'clients'

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
  'employee-dashboard': { id: 'employee-dashboard', label: 'Мои задачи', title: 'Мои задачи', description: 'Задачи на сегодня, учёт времени и заявки на отгул', icon: ListTodo },
  'manager-dashboard': { id: 'manager-dashboard', label: 'Задачи', title: 'Задачи сотрудников', description: 'Постановка и контроль задач команды, заявки на отгул', icon: ListChecks },
  analytics: { id: 'analytics', label: 'Аналитика', title: 'Аналитика', description: 'Долги по срокам, удержание и доход на участника', icon: PieChart },
  audit: { id: 'audit', label: 'Журнал изменений', title: 'Журнал изменений', description: 'Кто и что изменил, корзина удалённого', icon: History },
  'my-payments': { id: 'my-payments', label: 'Мои оплаты', title: 'Мои оплаты', description: 'График платежей и задолженность', icon: Receipt },
  sprints: { id: 'sprints', label: 'Спринты', title: 'Спринты', description: 'Задачи участников потока по спринтам', icon: Flag },
  plans: { id: 'plans', label: 'Планы участников', title: 'Операционные планы', description: 'Планы участников потока: прогресс, сроки и отмазки', icon: ClipboardList },
  'my-today': { id: 'my-today', label: 'Сегодня', title: 'Сегодня', description: 'Главное на сегодня: уроки, задачи, оплата, колёса', icon: Sun },
  lessons: { id: 'lessons', label: 'Календарь', title: 'Календарь уроков', description: 'Расписание занятий потока и материалы к урокам', icon: CalendarRange },
  'my-profile': { id: 'my-profile', label: 'Мой профиль', title: 'Мой профиль', description: 'Личные данные, фото паспорта, бизнес и динамика по годам', icon: UserRound },
  'my-sprint': { id: 'my-sprint', label: 'Мой спринт', title: 'Мой спринт', description: 'Задачи спринта и отчёты куратору', icon: Flag },
  calls: { id: 'calls', label: 'Обзвон', title: 'Обзвон', description: 'Кого пригласить на мероприятие: этапы, комментарии и кто что отметил', icon: PhoneCall },
  instagram: { id: 'instagram', label: 'Instagram', title: 'Instagram', description: 'Директ и комментарии @god_v_dele: ответы, этапы и «Завести в базу»', icon: Instagram },
  clients: { id: 'clients', label: 'Клиенты', title: 'Клиенты', description: 'База клиентов: быстро добавить человека с улицы, по звонку или рекомендации', icon: Contact },
  funnel: { id: 'funnel', label: 'Воронка', title: 'Воронка', description: 'Сколько людей дошло до каждого этапа: по мероприятиям и хантерам', icon: Filter },
  'my-plan': { id: 'my-plan', label: 'Мой план', title: 'Операционный план', description: 'Видение, направления, микро-цели и действия со сроками и ценой слова', icon: ClipboardList },
}

const S = {
  home: { id: 'home', label: 'Главное', icon: LayoutDashboard, pages: ['dashboard'] },
  people: { id: 'people', label: 'Участники', icon: Users, pages: ['participants', 'programs', 'sprints', 'plans', 'lessons'] },
  crm: { id: 'crm', label: 'CRM', icon: Headset, pages: [] },
  finance: { id: 'finance', label: 'Финансы', icon: ArrowLeftRight, pages: ['income', 'plan-fact', 'balance', 'offline'] },
  reports: { id: 'reports', label: 'Отчёты', icon: FileSpreadsheet, pages: ['opiu-reports', 'analytics'] },
  wheels: { id: 'wheels', label: 'Колёса баланса', icon: Compass, pages: ['life-wheel', 'life-balance', 'business-wheel'] },
  hr: { id: 'hr', label: 'Персонал', icon: UserSquare2, pages: ['hr-dashboard', 'employees', 'schedule', 'timesheet', 'payroll', 'vacations'] },
  admin: { id: 'admin', label: 'Администрирование', icon: ShieldCheck, pages: ['users', 'audit'] },
} satisfies Record<string, NavSection>

/** Task pages by role: they live in the CRM, first in its menu, and need no «Доступ к CRM». */
const TASK_PAGES: Record<UserRole, PageType[]> = {
  admin: ['manager-dashboard'],
  manager: ['manager-dashboard', 'employee-dashboard'],
  employee: ['employee-dashboard'],
  finance: [],
  wheels_manager: [],
  participant: [],
}

/** CRM tools that need «Доступ к CRM» (admin always has it). */
const CRM_TOOLS: PageType[] = ['instagram', 'calls', 'clients', 'funnel']

function crmSection(role: UserRole, crm: boolean): NavSection[] {
  const pages = [...TASK_PAGES[role], ...(crm || role === 'admin' ? CRM_TOOLS : [])]
  return pages.length ? [{ ...S.crm, pages }] : []
}

/** `crm`: the user has «Доступ к CRM» (admin always does). Employees and managers have no wheels of their own. */
export function getSections(role: UserRole, crm = false): NavSection[] {
  switch (role) {
    case 'admin':
      return [S.home, S.people, ...crmSection(role, crm), S.finance, S.reports, S.wheels, S.hr, S.admin]
    case 'finance':
      return [S.home, { ...S.people, pages: ['participants', 'programs'] }, S.finance, S.reports, S.wheels, ...crmSection(role, crm)]
    case 'wheels_manager':
      return [S.wheels, { ...S.people, pages: ['participants', 'sprints', 'plans', 'lessons'] }, ...crmSection(role, crm)]
    case 'manager':
      return [...crmSection(role, crm), { ...S.people, pages: ['sprints', 'plans', 'lessons'] }]
    case 'employee':
      return crmSection(role, crm)
    case 'participant':
      return [{ id: 'cabinet', label: 'Кабинет', icon: UserCircle2, pages: ['my-today', 'my-sprint', 'my-plan', ...(PARTICIPANT_PAYMENTS_VISIBLE ? (['my-payments'] as PageType[]) : []), 'my-profile'] }, S.wheels]
  }
}

export function getDefaultPage(role: UserRole): PageType {
  switch (role) {
    case 'manager':
      return 'manager-dashboard'
    case 'employee':
      return 'employee-dashboard'
    case 'participant':
      return 'my-today'
    case 'wheels_manager':
      return 'life-wheel'
    default:
      return 'dashboard'
  }
}

/** CRM pages open full screen with their own side menu instead of the app header. */
export const CRM_PAGES: PageType[] = ['manager-dashboard', 'employee-dashboard', ...CRM_TOOLS]

export function getAllowedPages(role: UserRole, crm = false): PageType[] {
  return getSections(role, crm).flatMap(s => s.pages)
}

export function findSection(sections: NavSection[], page: PageType) {
  return sections.find(s => s.pages.includes(page))
}

/** What each role can reach; shown wherever an administrator picks a role. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Полный доступ: финансы, участники, CRM и задачи, персонал и пользователи',
  manager: 'Задачи команды и свои, заявки на отгул, спринты и планы участников',
  finance: 'Участники, финансы, отчёты и колёса баланса. Без раздела «Персонал»',
  wheels_manager: 'Колёса баланса, участники, их профили, спринты и планы',
  employee: 'Свои задачи, учёт времени и заявки на отгул',
  participant: 'Свой кабинет: сегодня, спринт, операционный план, оплаты, профиль и колёса баланса',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Администратор',
  finance: 'Финансист',
  employee: 'Сотрудник',
  manager: 'Руководитель',
  wheels_manager: 'Менеджер колёс',
  participant: 'Участник',
}
