'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Database, Plus, Shuffle, Trash2 } from 'lucide-react'
import { plural } from '@/lib/format'
import { NO_GROUP } from '@/lib/sprints'
import type { GroupsData } from '@/app/api/sprints/groups/route'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import { api } from './shared'

const people = (n: number) => `${n} ${plural(n, ['участник', 'участника', 'участников'])}`

/**
 * Groups of a program: create, rename, delete, and decide who is in which group.
 * Every change is saved at once; the page behind reloads through onChanged.
 */
export function GroupsSheet({
  open,
  onOpenChange,
  programId,
  programName,
  data,
  onChanged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  programId: string
  programName: string
  data: GroupsData | null
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const groups = data?.groups ?? []
  const members = data?.participants ?? []
  const ungrouped = members.filter(p => !p.group_id)

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)
    try {
      await action()
      onChanged()
    } catch (e) {
      toast.error(failure, { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const addGroup = () => {
    const value = name.trim()
    if (!value || busy) return
    return run(async () => {
      await api('/api/sprints/groups', { method: 'POST', json: { program_id: programId, name: value } })
      setName('')
    }, 'Не удалось создать группу')
  }

  const rename = (id: string, current: string, value: string) => {
    const next = value.trim()
    if (!next || next === current) return
    return run(async () => {
      await api(`/api/sprints/groups/${id}`, { method: 'PATCH', json: { name: next } })
    }, 'Не удалось переименовать группу')
  }

  const remove = async (id: string, groupName: string, count: number) => {
    const ok = await confirm({
      title: `Удалить группу «${groupName}»?`,
      description: count ? `${people(count)} останутся в потоке без группы.` : 'В группе никого нет.',
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    return run(async () => {
      await api(`/api/sprints/groups/${id}`, { method: 'DELETE' })
    }, 'Не удалось удалить группу')
  }

  const assign = (assignments: { participant_id: string; group_id: string | null }[], done?: (r: { changed: number; tasks_assigned: number }) => void) =>
    run(async () => {
      const r = await api<{ changed: number; tasks_assigned: number }>('/api/sprints/groups/assign', {
        method: 'PUT',
        json: { program_id: programId, assignments },
      })
      if (r.tasks_assigned) toast.success('Задачи группы выданы', { description: `Новым участникам назначено задач: ${r.tasks_assigned}` })
      done?.(r)
    }, 'Не удалось изменить группу')

  // Everyone without a group goes to the currently smallest group, so the sizes stay even.
  const distribute = () => {
    const size = new Map(groups.map(g => [g.id, g.members]))
    const plan = ungrouped.map(p => {
      const [target] = [...size.entries()].sort((a, b) => a[1] - b[1])
      size.set(target[0], target[1] + 1)
      return { participant_id: p.id, group_id: target[0] }
    })
    return assign(plan, r => toast.success('Участники распределены', { description: `Без группы было: ${r.changed}` }))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Группы потока</SheetTitle>
          <SheetDescription>{programName}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {data && !data.available ? (
            <EmptyState
              icon={Database}
              title="Группы ещё не подключены"
              description={
                <>
                  Один раз выполните в Supabase → SQL Editor файл{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[12px]">migrations/018_participant_groups.sql</code> и обновите страницу.
                </>
              }
            />
          ) : (
            <div className="space-y-7">
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Группы</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">У каждой группы свои спринты: свои даты, цель и задачи.</p>
                </div>
                {groups.length > 0 && (
                  <ul className="divide-y rounded-lg border">
                    {groups.map(g => (
                      <li key={`${g.id}:${g.name}`} className="flex items-center gap-2 px-3 py-2">
                        <Input
                          defaultValue={g.name}
                          aria-label={`Название группы «${g.name}»`}
                          className="h-8 flex-1 border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-ring"
                          maxLength={60}
                          disabled={busy}
                          onBlur={e => rename(g.id, g.name, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                        <span className="num shrink-0 text-xs text-muted-foreground">{people(g.members)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Удалить группу «${g.name}»`}
                          disabled={busy}
                          onClick={() => remove(g.id, g.name, g.members)}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="flex gap-2"
                  onSubmit={e => {
                    e.preventDefault()
                    addGroup()
                  }}
                >
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={groups.length ? 'Ещё одна группа' : 'Например: Группа 1'}
                    aria-label="Название новой группы"
                    maxLength={60}
                  />
                  <Button type="submit" variant="outline" disabled={busy || !name.trim()}>
                    <Plus /> Добавить
                  </Button>
                </form>
              </section>

              {groups.length > 0 && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">Кто в какой группе</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ungrouped.length ? `Без группы: ${ungrouped.length} из ${members.length}` : `Все ${members.length} распределены`}
                      </p>
                    </div>
                    {ungrouped.length > 0 && (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={distribute}>
                        <Shuffle /> Распределить поровну
                      </Button>
                    )}
                  </div>
                  <ul className="divide-y rounded-lg border">
                    {members.map(p => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                        <Select
                          value={p.group_id ?? NO_GROUP}
                          disabled={busy}
                          onValueChange={v => assign([{ participant_id: p.id, group_id: v === NO_GROUP ? null : v }])}
                        >
                          <SelectTrigger size="sm" className="w-44" aria-label={`Группа: ${p.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_GROUP}>Без группы</SelectItem>
                            {groups.map(g => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
