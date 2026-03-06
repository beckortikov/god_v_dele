'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, Play, Square } from 'lucide-react'
import { toast } from 'sonner'

interface TimeTrackerProps {
    employeeId: string
}

export function TimeTracker({ employeeId }: TimeTrackerProps) {
    const [isActive, setIsActive] = useState(false)
    const [loading, setLoading] = useState(true)
    const [elapsedTime, setElapsedTime] = useState(0) // in seconds
    const [activeStartTime, setActiveStartTime] = useState<Date | null>(null)

    useEffect(() => {
        // Fetch current status
        fetch(`/api/employee/time-logs?employee_id=${employeeId}`)
            .then(res => res.json())
            .then(data => {
                if (!data.error && data.length > 0) {
                    const latestLog = data[0]
                    if (latestLog.status === 'active') {
                        setIsActive(true)
                        setActiveStartTime(new Date(latestLog.start_time))
                    }
                }
                setLoading(false)
            })
            .catch(err => {
                console.error('Error fetching time logs:', err)
                setLoading(false)
            })
    }, [employeeId])

    useEffect(() => {
        let interval: NodeJS.Timeout
        if (isActive && activeStartTime) {
            interval = setInterval(() => {
                const now = new Date()
                const diffInSeconds = Math.floor((now.getTime() - activeStartTime.getTime()) / 1000)
                setElapsedTime(diffInSeconds)
            }, 1000)
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
                toast.error(`Ошибка: ${result.error}`)
            } else {
                if (action === 'start') {
                    setIsActive(true)
                    setActiveStartTime(new Date(result.start_time))
                    setElapsedTime(0)
                    toast.success('Рабочий день начат')
                } else {
                    setIsActive(false)
                    setActiveStartTime(null)
                    setElapsedTime(0)
                    toast.success(`Рабочий день завершен. Отработано минут: ${result.duration_minutes}`)
                }
            }
        } catch (error) {
            toast.error('Произошла ошибка при сохранении статуса')
        } finally {
            setLoading(false)
        }
    }

    const formatTime = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }

    return (
        <Card className="p-6 bg-card border-border flex flex-col items-center justify-center space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-5 h-5" />
                <span className="font-medium text-sm">Учет рабочего времени</span>
            </div>

            <div className="text-4xl font-mono font-bold text-foreground">
                {formatTime(elapsedTime)}
            </div>

            <Button
                onClick={toggleTimer}
                disabled={loading}
                variant={isActive ? "destructive" : "default"}
                className="w-full flex items-center justify-center gap-2"
            >
                {isActive ? (
                    <>
                        <Square className="w-4 h-4 fill-current" />
                        Завершить работу
                    </>
                ) : (
                    <>
                        <Play className="w-4 h-4 fill-current" />
                        Начать рабочий день
                    </>
                )}
            </Button>
        </Card>
    )
}
