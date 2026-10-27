'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarRange, Database, Plus, Users } from 'lucide-react'
import { localDayKey, monthRange, type LessonWithCount } from '@/lib/lessons'
import type { GroupsData } from '@/app/api/sprints/groups/route'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useStoredState } from '@/components/sprints/shared'
import { LessonCalendar } from './lesson-calendar'
import { LessonEditSheet } from './lesson-sheets'
import { LessonReviews } from './lesson-reviews'
import { LessonsMigrationRequired, call } from './api'

interface Program {
  id: string
  name: string
}

const ALL = 'all'

/** Curators' calendar: plan lessons for a program (or one of its groups) and attach materials. */
export function LessonsPage() {
  const now = new Date()
  const [programs, setPrograms] = React.useState<Program[] | null>(null)
  const [programId, setProgramId] = useStoredState<string>('lessons-program', '')
  const [ym, setYm] = React.useState({ year: now.getFullYear(), month: now.getMonth() })
  const [lessons, setLessons] = React.useState<LessonWithCount[] | null>(null)
  const [groups, setGroups] = React.useState<GroupsData | null>(null)
  const [groupFilter, setGroupFilter] = React.useState(ALL)
  const [migration, setMigration] = React.useState(false)
  const [tab, setTab] = useStoredState<'calendar' | 'reviews'>('lessons-tab', 'calendar')

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<LessonWithCount | null>(null)
  const [newDate, setNewDate] = React.useState(localDayKey(now))

  React.useEffect(() => {
    call<{ data: Program[] }>('/api/programs')
      .then(r => setPrograms(r.data ?? []))
      .catch(e => {
        setPrograms([])
        toast.error('Не удалось загрузить программы', { description: (e as Error).message })
      })
  }, [])

  React.useEffect(() => {
    if (programs?.length && !programs.some(p => p.id === programId)) setProgramId(programs[0].id)
  }, [programs, programId, setProgramId])

  // Groups are optional (migration 018): without them the calendar is simply per program
  React.useEffect(() => {
    setGroups(null)
    setGroupFilter(ALL)
    if (!programId) return
    call<{ data: GroupsData }>(`/api/sprints/groups?program_id=${programId}`)
      .then(r => setGroups(r.data))
      .catch(() => setGroups(null))
  }, [programId])

  const load = React.useCallback(async () => {
    if (!programId) return
    const { from, to } = monthRange(ym.year, ym.month)
    try {
      const r = await call<{ data: LessonWithCount[] }>(`/api/lessons?program_id=${programId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      setMigration(false)
      setLessons(r.data)
      // keep an open card in sync with what the server has
      setEditing(cur => (cur ? (r.data.find(l => l.id === cur.id) ?? cur) : cur))
    } catch (e) {
      setLessons([])
      if (e instanceof LessonsMigrationRequired) setMigration(true)
      else toast.error('Не удалось загрузить уроки', { description: (e as Error).message })
    }
  }, [programId, ym])

  React.useEffect(() => {
    setLessons(null)
    load()
  }, [load])

  const groupList = groups?.available ? groups.groups : []
  const groupName = React.useCallback((id: string) => groupList.find(g => g.id === id)?.name, [groupList])
  const shown = React.useMemo(() => (lessons ?? []).filter(l => groupFilter === ALL || !l.group_id || l.group_id === groupFilter), [lessons, groupFilter])

  const openNew = (dayKey: string) => {
    setEditing(null)
    setNewDate(dayKey)
    setSheetOpen(true)
  }

  const header = (
    <PageHeader
      title="Календарь уроков"
      description="Расписание занятий потока, материалы к ним и отзывы участников"
      actions={
        <>
          {programs && programs.length > 0 && (
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger size="sm" className="w-56" aria-label="Поток">
                <SelectValue placeholder="Поток" />
              </SelectTrigger>
              <SelectContent>
                {programs.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {groupList.length > 0 && (
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger size="sm" className="w-44" aria-label="Группа">
                <Users className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все группы</SelectItem>
                {groupList.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            aria-label="Раздел"
            options={[
              { value: 'calendar', label: 'Календарь' },
              { value: 'reviews', label: 'Отзывы' },
            ]}
          />
          {tab === 'calendar' && (
            <Button size="sm" disabled={!programId || migration} onClick={() => openNew(localDayKey(new Date()))}>
              <Plus /> Новый урок
            </Button>
          )}
        </>
      }
    />
  )

  if (migration) {
    return (
      <PageContainer>
        {header}
        <Panel>
          <EmptyState
            icon={Database}
            title="Календарь уроков ещё не подключён"
            description={
              <>
                Один раз выполните в Supabase → SQL Editor файл <code className="rounded bg-muted px-1 py-0.5 text-[12px]">migrations/020_lessons.sql</code> и обновите страницу.
              </>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  if (programs && !programs.length) {
    return (
      <PageContainer>
        {header}
        <Panel>
          <EmptyState icon={CalendarRange} title="Нет программ" description="Сначала создайте программу, и для неё можно будет планировать уроки." />
        </Panel>
      </PageContainer>
    )
  }

  if (tab === 'reviews') {
    return (
      <PageContainer>
        {header}
        <LessonReviews programId={programId} groupFilter={groupFilter} groupName={groupList.length ? groupName : undefined} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {header}
      {lessons === null ? (
        <Skeleton className="h-[34rem] w-full rounded-xl" />
      ) : (
        <LessonCalendar
          year={ym.year}
          month={ym.month}
          onMonthChange={(year, month) => setYm({ year, month })}
          lessons={shown}
          groupName={groupList.length ? groupName : undefined}
          onOpen={l => {
            setEditing(l as LessonWithCount)
            setSheetOpen(true)
          }}
          onCreateOn={openNew}
        />
      )}

      <LessonEditSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        programId={programId}
        lesson={editing}
        newOnDate={newDate}
        defaultGroupId={groupFilter === ALL ? null : groupFilter}
        groups={groupList.map(g => ({ id: g.id, name: g.name }))}
        onSaved={created => {
          if (created) setEditing({ ...created, material_count: 0 })
          load()
        }}
      />
    </PageContainer>
  )
}
