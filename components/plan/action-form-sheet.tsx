'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/format'
import { addDays } from '@/lib/sprints'
import { PRIORITIES, type MyPlanData, type OpAction, type OpGoal, type Priority } from '@/lib/op-plan'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Field, FieldGroup } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import { planApi } from './plan-shared'

const NEW_GOAL = '__new__'

export interface ActionFormTarget {
  /** Editing this action; absent for a new one. */
  action?: OpAction
  directionId?: string
  goalId?: string
  /** Prefilled «Что сделать» (a suggestion the participant tapped). */
  title?: string
}

/** «Новое действие» / «Изменить действие»: everything a row of the plan has, in one sheet. */
export function ActionFormSheet({
  target,
  data,
  owners,
  participantId,
  onClose,
  onSaved,
}: {
  target: ActionFormTarget | null
  data: MyPlanData
  /** Names already used in the plan, offered as one-tap chips. */
  owners: string[]
  participantId: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const action = target?.action
  const goalOf = (id?: string) => data.goals.find(g => g.id === id)
  const [directionId, setDirectionId] = React.useState('')
  const [goalId, setGoalId] = React.useState('')
  const [newGoal, setNewGoal] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [indicator, setIndicator] = React.useState('')
  const [due, setDue] = React.useState('')
  const [people, setPeople] = React.useState<string[]>([])
  const [person, setPerson] = React.useState('')
  const [priority, setPriority] = React.useState<Priority>('B')
  const [price, setPrice] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const titleRef = React.useRef<HTMLInputElement>(null)

  const reset = React.useCallback(
    (keepPlace: boolean) => {
      setTitle('')
      setIndicator('')
      setError(null)
      if (keepPlace) return
      const g = goalOf(target?.action?.goal_id ?? target?.goalId)
      const dir = g?.direction_id ?? target?.directionId ?? data.directions[0]?.id ?? ''
      const goals = data.goals.filter(x => x.direction_id === dir)
      setDirectionId(dir)
      setGoalId(g?.id ?? goals[0]?.id ?? NEW_GOAL)
      setNewGoal('')
      const a = target?.action
      setTitle(a?.title ?? target?.title ?? '')
      setIndicator(a?.indicator ?? '')
      setDue(a?.due_date ?? '')
      setPeople(a?.owners ?? [])
      setPerson('')
      setPriority(a?.priority ?? 'B')
      setPrice(a ? String(a.price || '') : '')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, data]
  )

  React.useEffect(() => {
    if (target) reset(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const goals = data.goals.filter(g => g.direction_id === directionId)
  const today = todayISO()

  const addPerson = (raw: string) => {
    const names = raw.split(',').map(s => s.trim()).filter(Boolean)
    if (names.length) setPeople(p => [...new Set([...p, ...names])])
    setPerson('')
  }

  const save = async (more: boolean) => {
    if (!title.trim()) return setError('Напишите, что нужно сделать')
    if (!directionId) return setError('Сначала добавьте направление')
    if (goalId === NEW_GOAL && !newGoal.trim()) return setError('Назовите микро-цель')
    setSaving(true)
    setError(null)
    try {
      let gid = goalId
      if (goalId === NEW_GOAL) {
        const r = await planApi<{ data: OpGoal }>(participantId, '/goals', { method: 'POST', json: { direction_id: directionId, title: newGoal } })
        gid = r.data.id
      }
      const allPeople = person.trim() ? [...new Set([...people, ...person.split(',').map(s => s.trim()).filter(Boolean)])] : people
      const json = { goal_id: gid, title, indicator, due_date: due || null, owners: allPeople, priority, price: price || 0 }
      if (action) await planApi(participantId, `/actions/${action.id}`, { method: 'PATCH', json })
      else await planApi(participantId, '/actions', { method: 'POST', json })
      toast.success(action ? 'Действие сохранено' : 'Действие добавлено')
      await onSaved()
      if (more) {
        if (goalId === NEW_GOAL) {
          setGoalId(gid)
          setNewGoal('')
        }
        reset(true)
        titleRef.current?.focus()
      } else onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!target} onOpenChange={o => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <form
          className="flex h-full flex-col"
          onSubmit={e => {
            e.preventDefault()
            save(false)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              save(false)
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{action ? 'Изменить действие' : 'Новое действие'}</SheetTitle>
            <SheetDescription>Что сделать, как поймём, что сделано, к какому сроку и чего стоит слово</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Направление" htmlFor="pa-dir">
                  <Select
                    value={directionId}
                    onValueChange={v => {
                      setDirectionId(v)
                      setGoalId(data.goals.find(g => g.direction_id === v)?.id ?? NEW_GOAL)
                    }}
                  >
                    <SelectTrigger id="pa-dir" className="w-full">
                      <SelectValue placeholder="Выберите" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.directions.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Микро-цель" htmlFor="pa-goal">
                  <Select value={goalId} onValueChange={setGoalId}>
                    <SelectTrigger id="pa-goal" className="w-full">
                      <SelectValue placeholder="Выберите" />
                    </SelectTrigger>
                    <SelectContent>
                      {goals.map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.title}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_GOAL}>+ Новая микро-цель</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {goalId === NEW_GOAL && (
                <Field label="Новая микро-цель" htmlFor="pa-newgoal">
                  <Input id="pa-newgoal" value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="Например: Исследование рынка и ЦА" />
                </Field>
              )}

              <Field label="Что сделать" htmlFor="pa-title" required>
                <Input id="pa-title" ref={titleRef} autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Изучить путь клиента (CJM)" />
              </Field>
              <Field label="Индикатор результата" htmlFor="pa-ind" hint="Что можно показать, когда сделано">
                <Input id="pa-ind" value={indicator} onChange={e => setIndicator(e.target.value)} placeholder="Например: Расписанный путь клиента" />
              </Field>

              <Field label="Срок" htmlFor="pa-due">
                <div className="flex flex-wrap gap-2">
                  <Input id="pa-due" type="date" value={due} onChange={e => setDue(e.target.value)} className="w-auto min-w-40 flex-1" />
                  {[
                    { label: '+1 нед', days: 7 },
                    { label: '+2 нед', days: 14 },
                    { label: '+1 мес', days: 30 },
                  ].map(q => (
                    <Button key={q.label} type="button" variant="secondary" size="sm" className="h-9" onClick={() => setDue(addDays(today, q.days))}>
                      {q.label}
                    </Button>
                  ))}
                </div>
              </Field>

              <Field label="Ответственные" htmlFor="pa-person" hint="Имя и Enter. Можно несколько через запятую">
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25 dark:bg-input/25">
                  {people.map(p => (
                    <span key={p} className="inline-flex h-7 items-center gap-1 rounded-full bg-muted pr-1 pl-2.5 text-sm">
                      {p}
                      <button
                        type="button"
                        aria-label={`Убрать: ${p}`}
                        onClick={() => setPeople(list => list.filter(x => x !== p))}
                        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="pa-person"
                    value={person}
                    onChange={e => (e.target.value.endsWith(',') ? addPerson(e.target.value) : setPerson(e.target.value))}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        addPerson(person)
                      } else if (e.key === 'Backspace' && !person && people.length) setPeople(list => list.slice(0, -1))
                    }}
                    onBlur={() => person.trim() && addPerson(person)}
                    placeholder={people.length ? '' : 'Например: Амир'}
                    className="h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                {owners.filter(o => !people.includes(o)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {owners
                      .filter(o => !people.includes(o))
                      .slice(0, 8)
                      .map(o => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setPeople(p => [...p, o])}
                          className="inline-flex h-7 items-center rounded-full border border-dashed px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground"
                        >
                          + {o}
                        </button>
                      ))}
                  </div>
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Приоритет">
                  <Segmented
                    aria-label="Приоритет"
                    value={priority}
                    onChange={setPriority}
                    options={PRIORITIES.map(p => ({ value: p, label: p }))}
                    className="w-full [&>button]:flex-1 [&>button]:justify-center"
                  />
                </Field>
                <Field label="Цена слова, $" htmlFor="pa-price">
                  <Input id="pa-price" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="1000" className="num" />
                </Field>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Цена слова — сумма, которую вы отдаёте, если срок прошёл без результата. Тогда действие отмечается как отмазка.
              </p>
              {error && <p className={cn('rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive')}>{error}</p>}
            </FieldGroup>
          </SheetBody>
          <SheetFooter className="pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {!action && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => save(true)}>
                Сохранить и ещё
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
