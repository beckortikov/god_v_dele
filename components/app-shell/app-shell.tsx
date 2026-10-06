'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import {
  Menu,
  Search,
  Plus,
  ChevronDown,
  LogOut,
  Sun,
  Moon,
  Monitor,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  UserPlus,
  CalendarPlus,
  UserSquare2,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  PAGES,
  ROLE_LABELS,
  findSection,
  getSections,
  type NavSection,
  type PageType,
  type UserRole,
} from '@/lib/navigation'
import { useNav } from '@/components/app-shell/nav-context'
import { ACCENTS, useAccent } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'

export interface CreateAction {
  id: string
  label: string
  hint: string
  page: PageType
  icon: LucideIcon
  roles: UserRole[]
}

export const CREATE_ACTIONS: CreateAction[] = [
  { id: 'new-payment', label: 'Поступление', hint: 'Оплата от участника', page: 'income', icon: ArrowDownLeft, roles: ['admin', 'finance'] },
  { id: 'new-expense', label: 'Расход', hint: 'Списание со счёта', page: 'income', icon: ArrowUpRight, roles: ['admin', 'finance'] },
  { id: 'new-participant', label: 'Участник', hint: 'Запись на программу', page: 'participants', icon: UserPlus, roles: ['admin', 'finance', 'wheels_manager'] },
  { id: 'new-event', label: 'Мероприятие', hint: 'Оффлайн-событие', page: 'offline', icon: CalendarPlus, roles: ['admin', 'finance'] },
  { id: 'new-employee', label: 'Сотрудник', hint: 'Карточка сотрудника', page: 'employees', icon: UserSquare2, roles: ['admin'] },
]

const LAST_PAGES_KEY = 'nav-last-pages'

function useLastPages() {
  const [last, setLast] = React.useState<Record<string, PageType>>({})
  React.useEffect(() => {
    try {
      setLast(JSON.parse(localStorage.getItem(LAST_PAGES_KEY) || '{}'))
    } catch {}
  }, [])
  const remember = React.useCallback((sectionId: string, page: PageType) => {
    setLast(prev => {
      if (prev[sectionId] === page) return prev
      const next = { ...prev, [sectionId]: page }
      try {
        localStorage.setItem(LAST_PAGES_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])
  return { last, remember }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('') || 'Я'
}

export function AppShell({
  role,
  userName,
  onLogout,
  children,
}: {
  role: UserRole
  userName: string | null
  onLogout: () => void
  children: React.ReactNode
}) {
  const { page, navigate } = useNav()
  const sections = React.useMemo(() => getSections(role), [role])
  const current = findSection(sections, page) ?? sections[0]
  const { last, remember } = useLastPages()
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const createActions = CREATE_ACTIONS.filter(a => a.roles.includes(role))

  React.useEffect(() => {
    if (current) remember(current.id, page)
  }, [current, page, remember])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openSection = (s: NavSection) => {
    const target = last[s.id] && s.pages.includes(last[s.id]) ? last[s.id] : s.pages[0]
    navigate(target)
  }

  const displayName = userName || ROLE_LABELS[role]

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="relative z-30 shrink-0 border-b border-nav-border bg-nav text-nav-foreground">
        {/* Row 1: brand · sections · tools */}
        <div className="flex h-13 items-center gap-2 px-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu />
          </Button>

          <button
            onClick={() => navigate(sections[0].pages[0])}
            className="mr-3 flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <BrandMark />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Год в деле</span>
          </button>

          <nav className="hidden min-w-0 items-center gap-0.5 lg:flex" aria-label="Разделы">
            {sections.map(s => {
              const active = s.id === current?.id
              return (
                <button
                  key={s.id}
                  onClick={() => openSection(s)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'h-8 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                    active
                      ? 'bg-primary-soft text-primary-soft-foreground'
                      : 'text-nav-muted hover:bg-accent hover:text-nav-foreground'
                  )}
                >
                  {s.label}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden h-8 w-56 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground md:flex xl:w-64"
            >
              <Search className="size-4" />
              <span>Поиск и команды</span>
              <kbd className="ml-auto rounded border bg-card px-1.5 py-px font-sans text-[11px] text-muted-foreground">
                ⌘K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label="Поиск"
            >
              <Search />
            </Button>

            {createActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1.5 max-sm:size-8 max-sm:px-0">
                    <Plus />
                    <span className="max-sm:sr-only">Создать</span>
                    <ChevronDown className="opacity-70 max-sm:hidden" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {createActions.map(a => (
                    <DropdownMenuItem key={a.id} onSelect={() => navigate(a.page, a.id)} className="py-2">
                      <span className="flex size-7 items-center justify-center rounded-md bg-muted">
                        <a.icon className="size-4" />
                      </span>
                      <span className="flex flex-col">
                        <span className="font-medium">{a.label}</span>
                        <span className="text-xs text-muted-foreground">{a.hint}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <UserMenu name={displayName} role={role} onLogout={onLogout} />
          </div>
        </div>

        {/* Row 2: pages of the current section */}
        {current && (
          <div className="flex h-11 items-stretch gap-1 overflow-x-auto px-3 scrollbar-none sm:px-5">
            {current.pages.map(id => {
              const p = PAGES[id]
              const active = id === page
              return (
                <button
                  key={id}
                  onClick={() => navigate(id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex shrink-0 items-center gap-2 px-2.5 text-sm whitespace-nowrap transition-colors outline-none',
                    active ? 'font-medium text-nav-foreground' : 'text-nav-muted hover:text-nav-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors group-focus-visible:ring-[3px] group-focus-visible:ring-ring/30',
                      !active && 'group-hover:bg-accent'
                    )}
                  >
                    <p.icon className={cn('size-4', active ? 'text-primary' : 'opacity-70')} />
                    {p.label}
                  </span>
                  <span
                    className={cn(
                      'absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-opacity duration-200',
                      active ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </button>
              )
            })}
          </div>
        )}
      </header>

      <main className="relative flex-1 overflow-auto">{children}</main>

      <MobileDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        sections={sections}
        page={page}
        onNavigate={p => {
          navigate(p)
          setDrawerOpen(false)
        }}
        name={displayName}
        role={role}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        sections={sections}
        createActions={createActions}
        onNavigate={(p, action) => {
          navigate(p, action)
          setPaletteOpen(false)
        }}
      />
    </div>
  )
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold tracking-tight text-primary-foreground shadow-xs',
        className
      )}
      aria-hidden
    >
      ГД
    </span>
  )
}

function UserMenu({ name, role, onLogout }: { name: string; role: UserRole; onLogout: () => void }) {
  const { theme, setTheme } = useTheme()
  const { accent, setAccent } = useAccent()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground ring-offset-2 ring-offset-nav transition-shadow outline-none hover:ring-2 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Профиль и настройки"
        >
          {initials(name)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-foreground">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Тема</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? 'light'} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light" onSelect={e => e.preventDefault()}>
            <Sun /> Светлая
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" onSelect={e => e.preventDefault()}>
            <Moon /> Тёмная
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" onSelect={e => e.preventDefault()}>
            <Monitor /> Как в системе
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuLabel className="pt-2.5">Акцентный цвет</DropdownMenuLabel>
        <div className="flex flex-wrap gap-1.5 px-2 pt-0.5 pb-2" role="radiogroup" aria-label="Акцентный цвет">
          {ACCENTS.map(a => (
            <button
              key={a.id}
              role="radio"
              aria-checked={accent === a.id}
              title={a.label}
              onClick={() => setAccent(a.id)}
              className={cn(
                'flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring',
                accent === a.id ? 'ring-2 ring-foreground/70' : 'hover:ring-2 hover:ring-border'
              )}
              style={{ background: a.swatch }}
            >
              {accent === a.id && <Check className="size-3.5 text-white" strokeWidth={3} />}
              <span className="sr-only">{a.label}</span>
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onLogout}>
          <LogOut /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileDrawer({
  open,
  onOpenChange,
  sections,
  page,
  onNavigate,
  name,
  role,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  sections: NavSection[]
  page: PageType
  onNavigate: (p: PageType) => void
  name: string
  role: UserRole
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="gap-0 p-0">
        <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
          <BrandMark />
          <div>
            <SheetTitle className="text-[15px]">Год в деле</SheetTitle>
            <p className="text-xs text-muted-foreground">
              {name} · {ROLE_LABELS[role]}
            </p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map(s => (
            <div key={s.id} className="mb-3">
              <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{s.label}</p>
              {s.pages.map(id => {
                const p = PAGES[id]
                const active = id === page
                return (
                  <button
                    key={id}
                    onClick={() => onNavigate(id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors',
                      active ? 'bg-primary-soft font-medium text-primary-soft-foreground' : 'hover:bg-accent'
                    )}
                  >
                    <p.icon className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')} />
                    {p.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

function CommandPalette({
  open,
  onOpenChange,
  sections,
  createActions,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  sections: NavSection[]
  createActions: CreateAction[]
  onNavigate: (p: PageType, action?: string) => void
}) {
  const { setTheme } = useTheme()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <DialogTitle className="sr-only">Поиск и команды</DialogTitle>
        <Command loop>
          <CommandInput placeholder="Куда перейти или что сделать?" autoFocus />
          <CommandList>
            <CommandEmpty>Ничего не найдено</CommandEmpty>
            {createActions.length > 0 && (
              <CommandGroup heading="Создать">
                {createActions.map(a => (
                  <CommandItem key={a.id} value={`создать ${a.label} ${a.hint}`} onSelect={() => onNavigate(a.page, a.id)}>
                    <Plus />
                    Новое: {a.label.toLowerCase()}
                    <span className="text-muted-foreground">— {a.hint.toLowerCase()}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {sections.map(s => (
              <CommandGroup key={s.id} heading={s.label}>
                {s.pages.map(id => {
                  const p = PAGES[id]
                  return (
                    <CommandItem key={id} value={`${p.label} ${p.title} ${s.label} ${p.description}`} onSelect={() => onNavigate(id)}>
                      <p.icon />
                      {p.label}
                      <CommandShortcut className="max-sm:hidden">{p.description}</CommandShortcut>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
            <CommandGroup heading="Оформление">
              <CommandItem value="тема светлая" onSelect={() => { setTheme('light'); onOpenChange(false) }}>
                <Sun /> Светлая тема
              </CommandItem>
              <CommandItem value="тема тёмная темная" onSelect={() => { setTheme('dark'); onOpenChange(false) }}>
                <Moon /> Тёмная тема
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
