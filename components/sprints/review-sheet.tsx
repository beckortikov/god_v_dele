'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, ExternalLink, Plus, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/format'
import {
  STATUS,
  addDays,
  effectiveDue,
  isOverdue,
  percent,
  shortDate,
  tally,
  type Assignment,
  type ParticipantLite,
  type Sprint,
  type SprintTask,
} from '@/lib/sprints'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api } from './shared'
import { FileChips, useReportFiles } from './report-files'

export function ReviewSheet({
  open,
  onOpenChange,
  participant,
  sprint,
  tasks,
  assignments,
  focusTaskId,
  onChanged,
  onNewPersonalTask,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  participant: ParticipantLite | null
  sprint: Sprint
  tasks: SprintTask[]
  assignments: Assignment[]
  focusTaskId?: string | null
  onChanged: () => void
  onNewPersonalTask: (participantId: string) => void
}) {
  const today = todayISO()
  const mine = React.useMemo(() => {
    if (!participant) return []
    return tasks
      .map(task => ({ task, a: assignments.find(a => a.task_id === task.id && a.participant_id === participant.id) }))
      .filter((r): r is { task: SprintTask; a: Assignment } => !!r.a)
  }, [participant, tasks, assignments])
  const t = tally(mine.map(r => r.a))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        {participant && (
          <div className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>{participant.name}</SheetTitle>
              <SheetDescription>
                Спринт {sprint.number} · сдано {t.done} из {t.total}
                {t.review ? ` · ждут проверки: ${t.review}` : ''}
              </SheetDescription>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent(t.done, t.total)}%` }} />
              </div>
            </SheetHeader>
            <SheetBody className="space-y-3">
              {!mine.length && <p className="py-6 text-center text-sm text-muted-foreground">В этом спринте у участника нет задач</p>}
              {mine.map(({ task, a }) => (
                <AssignmentCard
                  key={a.id}
                  task={task}
                  a={a}
                  sprint={sprint}
                  overdue={isOverdue(task, a, today)}
                  focused={task.id === focusTaskId}
                  onChanged={onChanged}
                />
              ))}
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" onClick={() => onNewPersonalTask(participant.id)}>
                <Plus /> Личная задача
              </Button>
              <Button variant="ghost" className="ml-auto" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function AssignmentCard({
  task,
  a,
  sprint,
  overdue,
  focused,
  onChanged,
}: {
  task: SprintTask
  a: Assignment
  sprint: Sprint
  overdue: boolean
  focused: boolean
  onChanged: () => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [comment, setComment] = React.useState('')
  const [returning, setReturning] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // Attachments exist once something was sent; nothing to ask for before that.
  const { files } = useReportFiles(a.id, task.submission_type !== 'mark' && a.status !== 'todo')
  const today = todayISO()
  const due = effectiveDue(task, a)
  // One button per date: «оставить» wins over «+2 дня», which wins over «конец спринта».
  const dueOptions = [
    ...(due && due >= today ? [{ label: `Оставить ${shortDate(due)}`, date: due }] : []),
    { label: `${shortDate(addDays(today, 2))} · +2 дня`, date: addDays(today, 2) },
    ...(sprint.end_date >= today ? [{ label: `${shortDate(sprint.end_date)} · конец спринта`, date: sprint.end_date }] : []),
  ].filter((o, i, all) => all.findIndex(x => x.date === o.date) === i)
  const [newDue, setNewDue] = React.useState(dueOptions[0].date)

  React.useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center' })
  }, [focused])

  const act = async (type: 'accept' | 'return') => {
    if (type === 'return' && !comment.trim()) {
      toast.error('Напишите, что поправить', { description: 'Участник увидит комментарий в задаче' })
      return
    }
    setBusy(true)
    try {
      await api(`/api/sprints/assignments/${a.id}`, {
        method: 'POST',
        json: { type, comment, due_date: type === 'return' ? newDue : undefined },
      })
      toast.success(type === 'accept' ? 'Принято' : 'Вернули на доработку', {
        description: type === 'return' ? `Исправить до ${shortDate(newDue)}` : task.title,
      })
      setComment('')
      setReturning(false)
      onChanged()
    } catch (e: any) {
      toast.error('Не удалось сохранить', { description: e.message })
    } finally {
      setBusy(false)
    }
  }

  const st = STATUS[a.status]
  return (
    <div ref={ref} className={cn('rounded-lg border p-3.5', focused && 'border-primary ring-[3px] ring-primary/15', a.status === 'review' && 'bg-info-soft/40')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{task.title}</p>
          <p className={cn('num mt-0.5 text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')}>
            {due ? (overdue ? `просрочено, срок был ${shortDate(due)}` : `срок ${shortDate(due)}`) : 'без срока'}
            {a.submitted_at && ` · сдано ${shortDate(a.submitted_at.slice(0, 10))}`}
          </p>
        </div>
        <Badge variant={overdue ? 'destructive' : st.variant}>{overdue ? 'Просрочено' : st.label}</Badge>
      </div>

      {(a.report_text || a.report_link || files.length > 0) && (
        <div className="mt-3 space-y-2 text-sm">
          {a.report_text && <p className="whitespace-pre-wrap leading-relaxed">{a.report_text}</p>}
          {a.report_link && (
            <a
              href={a.report_link}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-[13px] hover:bg-accent"
            >
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{a.report_link}</span>
            </a>
          )}
          <FileChips assignmentId={a.id} files={files} />
        </div>
      )}
      {a.review_comment && a.status !== 'review' && (
        <p className="mt-3 rounded-md bg-muted px-2.5 py-2 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Комментарий: </span>
          {a.review_comment}
        </p>
      )}

      {(a.status === 'review' || returning) && (
        <div className="mt-3 space-y-2.5">
          <Textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Что получилось хорошо и что поправить"
            aria-label={`Комментарий к задаче «${task.title}»`}
            className="min-h-16 resize-none bg-card"
          />
          <div>
            <p className="mb-1.5 text-xs font-medium">Если вернёте, исправить до</p>
            <div role="radiogroup" aria-label="Новый срок" className="flex flex-wrap gap-1.5">
              {dueOptions.map(o => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={newDue === o.date}
                  onClick={() => setNewDue(o.date)}
                  className={cn(
                    'h-7 rounded-md border bg-card px-2.5 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                    newDue === o.date ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.status !== 'done' && (
              <Button size="sm" disabled={busy} onClick={() => act('accept')}>
                <Check /> Принять
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act('return')}>
              <RotateCcw /> На доработку
            </Button>
            {returning && (
              <Button size="sm" variant="ghost" onClick={() => setReturning(false)}>
                Отмена
              </Button>
            )}
          </div>
        </div>
      )}
      {a.status === 'done' && !returning && task.submission_type !== 'mark' && (
        <Button size="xs" variant="ghost" className="mt-2 text-muted-foreground" onClick={() => setReturning(true)}>
          Вернуть на доработку
        </Button>
      )}
    </div>
  )
}
