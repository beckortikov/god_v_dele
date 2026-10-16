'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarRange, Database, MessageCircleQuestion } from 'lucide-react'
import { monthRange } from '@/lib/lessons'
import type { MyLesson } from '@/app/api/my-lessons/route'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { LessonCalendar } from '@/components/lessons/lesson-calendar'
import { LessonViewSheet } from '@/components/lessons/lesson-sheets'
import { LessonsMigrationRequired, call } from '@/components/lessons/api'

/** The participant's calendar: lessons of their program and group, with links and materials. */
export function MyLessonsPage({ participantId }: { participantId: string | null }) {
  const now = new Date()
  const [ym, setYm] = React.useState({ year: now.getFullYear(), month: now.getMonth() })
  const [lessons, setLessons] = React.useState<MyLesson[] | null>(null)
  const [migration, setMigration] = React.useState(false)
  const [open, setOpen] = React.useState<MyLesson | null>(null)

  React.useEffect(() => {
    if (!participantId) return
    let cancelled = false
    setLessons(null)
    const { from, to } = monthRange(ym.year, ym.month)
    call<{ data: MyLesson[] }>(`/api/my-lessons?participant_id=${participantId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(r => !cancelled && (setMigration(false), setLessons(r.data)))
      .catch(e => {
        if (cancelled) return
        setLessons([])
        if (e instanceof LessonsMigrationRequired) setMigration(true)
        else toast.error('Не удалось загрузить уроки', { description: (e as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [participantId, ym])

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Календарь" description="Уроки вашего потока, ссылки для подключения и материалы" />
      {!participantId ? (
        <Panel>
          <EmptyState icon={MessageCircleQuestion} title="Профиль участника не подключён" description="Попросите администратора привязать ваш вход к карточке участника." />
        </Panel>
      ) : migration ? (
        <Panel>
          <EmptyState icon={Database} title="Календарь пока недоступен" description="Скоро здесь появятся ваши уроки. Если это не проходит, напишите куратору." />
        </Panel>
      ) : lessons === null ? (
        <Skeleton className="h-[30rem] w-full rounded-xl" />
      ) : (
        <>
          {lessons.length === 0 && (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              <CalendarRange className="size-4 shrink-0" /> В этом месяце уроков пока нет. Куратор добавит их в календарь.
            </p>
          )}
          <LessonCalendar year={ym.year} month={ym.month} onMonthChange={(year, month) => setYm({ year, month })} lessons={lessons} onOpen={l => setOpen(l as MyLesson)} />
        </>
      )}
      <LessonViewSheet open={!!open} onOpenChange={o => !o && setOpen(null)} lesson={open} materials={open?.materials ?? []} />
    </PageContainer>
  )
}
