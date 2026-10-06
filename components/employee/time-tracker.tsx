'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Play, Square, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Panel } from '@/components/erp/page-header'

interface TimeTrackerProps {
    employeeId: string
}

interface TimeLog {
    id: string
    start_time: string
    end_time?: string | null
    duration_minutes?: number | null
    status: 'active' | 'completed'
}

/** A running timer older than this is most likely forgotten. */
const STALE_SECONDS = 16 * 3600

function localDay(iso: string) {
    const d = new Date(iso)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function formatTime(totalSeconds: number) {
    const s = Math.max(0, totalSeconds)
    const hours = Math.floor(s / 3600)
    const minutes = Math.floor((s % 3600) / 60)
    const seconds = s % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/** "2 ч 15 мин", "45 мин" */
export function formatDuration(totalMinutes: number) {
    const m = Math.max(0, Math.round(totalMinutes))
    const h = Math.floor(m / 60)
    const rest = m % 60
    if (!h) return `${rest} мин`
    return rest ? `${h} ч ${rest} мин` : `${h} ч`
}

function formatStart(date: Date) {
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    if (localDay(date.toISOString()) === todayISO()) return `с ${time}`
    return `с ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${time}`
}

export function TimeTracker({ employeeId }: TimeTrackerProps) {
    const [isActive, setIsActive] = useState(false)
    const [loading, setLoading] = useState(true)
    const [initialised, setInitialised] = useState(false)
    const [elapsedTime, setElapsedTime] = useState(0) // in seconds
    const [activeStartTime, setActiveStartTime] = useState<Date | null>(null)
    const [logs, setLogs] = useState<TimeLog[]>([])

    const loadLogs = useCallback(
        (syncStatus: boolean) =>
            fetch(`/api/employee/time-logs?employee_id=${employeeId}`)
                .then(res => res.json())
                .then(data => {
                    if (!data.error && Array.isArray(data)) {
                        setLogs(data)
                        if (syncStatus && data.length > 0) {
                            const latestLog = data[0]
                            if (latestLog.status === 'active') {
                                setIsActive(true)
                                setActiveStartTime(new Date(latestLog.start_time))
                            }
                        }
                    }
                })
                .catch(err => {
                    console.error('Error fetching time logs:', err)
                }),
        [employeeId]
    )

    useEffect(() => {
        // Fetch current status
        loadLogs(true).finally(() => {
            setLoading(false)
            setInitialised(true)
        })
    }, [loadLogs])

    useEffect(() => {
        let interval: NodeJS.Timeout | undefined
        if (isActive && activeStartTime) {
            const tick = () => setElapsedTime(Math.floor((Date.now() - activeStartTime.getTime()) / 1000))
            tick()
            interval = setInterval(tick, 1000)
        }
        return () => clearInterval(interval)
    }, [isActive, activeStartTime])

    const toggleTimer = async () => {
        try {
            setLoading(true)
            const action = isActive ? 'end' : 'start'
            const response = await fetch('/api/employee/time-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: employeeId, action })
            })

            const result = await response.json()

            if (result.error) {
                toast.error(isActive ? 'Не удалось завершить день' : 'Не удалось начать день', { description: result.error })
            } else {
                if (action === 'start') {
                    setIsActive(true)
                    setActiveStartTime(new Date(result.start_time))
                    setElapsedTime(0)
                    toast.success('Рабочий день начат', { description: 'Хорошего дня!' })
                } else {
                    setIsActive(false)
                    setActiveStartTime(null)
                    setElapsedTime(0)
                    toast.success('Рабочий день завершён', { description: `Отработано ${formatDuration(result.duration_minutes ?? 0)}` })
                }
                loadLogs(false)
            }
        } catch (error) {
            toast.error('Не удалось сохранить статус', { description: 'Проверьте соединение и попробуйте ещё раз' })
        } finally {
            setLoading(false)
        }
    }

    // Worked today: finished sessions that started today + the running one
    const today = todayISO()
    const finishedToday = logs
        .filter(l => l.status === 'completed' && l.start_time && localDay(l.start_time) === today)
        .reduce((sum, l) => sum + (l.duration_minutes || 0), 0)
    // Only the part of a running session that falls on today
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
    const runningToday =
        isActive && activeStartTime
            ? Math.floor(Math.min(elapsedTime, (Date.now() - Math.max(activeStartTime.getTime(), startOfToday)) / 1000) / 60)
            : 0
    const todayMinutes = finishedToday + Math.max(0, runningToday)
    const stale = isActive && elapsedTime > STALE_SECONDS

    return (
        <Panel className="p-5">
            <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                        aria-hidden
                        className={cn('size-2 rounded-full transition-colors', isActive ? 'bg-success' : 'bg-muted-foreground/40')}
                    />
                    {isActive ? 'На работе' : 'Не на смене'}
                </span>
                {initialised && todayMinutes > 0 && (
                    <span className="num text-xs text-muted-foreground">Сегодня {formatDuration(todayMinutes)}</span>
                )}
            </div>

            {!initialised ? (
                <Skeleton className="mt-4 h-12 w-48" />
            ) : (
                <p
                    className={cn(
                        'num mt-3 text-5xl font-semibold tracking-tight tabular-nums transition-colors',
                        isActive ? 'text-foreground' : 'text-muted-foreground/60'
                    )}
                    aria-live="off"
                >
                    {formatTime(elapsedTime)}
                </p>
            )}

            <p className="mt-1 min-h-5 text-sm text-muted-foreground">
                {initialised && (isActive && activeStartTime ? `Рабочий день идёт ${formatStart(activeStartTime)}` : 'Нажмите, когда начнёте работать')}
            </p>

            {stale && (
                <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-foreground">
                    <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
                    Таймер идёт дольше 16 часов. Похоже, его забыли остановить. Завершите день и сообщите руководителю.
                </p>
            )}

            <Button
                onClick={toggleTimer}
                disabled={loading}
                size="lg"
                className={cn(
                    'mt-5 h-12 w-full text-base',
                    isActive && 'bg-destructive-soft text-destructive shadow-none hover:bg-destructive-soft/70'
                )}
            >
                {isActive ? (
                    <>
                        <Square className="size-4 fill-current" />
                        Завершить день
                    </>
                ) : (
                    <>
                        <Play className="size-4 fill-current" />
                        Начать рабочий день
                    </>
                )}
            </Button>
        </Panel>
    )
}
