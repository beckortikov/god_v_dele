'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Save, Loader2, CheckCircle2, AlertCircle, Search, Eye, BarChart3, CheckSquare, Square, Check, X, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Legend,
    Tooltip
} from 'recharts'

// ─────────────────────────── Types ───────────────────────────
interface Participant {
    id: string
    name: string
    program?: { name: string }
    status: string
}

interface BusinessWheelEntry {
    id?: string
    participant_id: string
    year: number
    month: string
    checked_items: Record<string, boolean>
}

// ─────────────────────────── Constants ───────────────────────────
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'

const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const BUSINESS_CATEGORIES = [
    {
        id: 1,
        name: '1. Ниша',
        color: '#8b5cf6', // Violet
        gradient: 'from-violet-500/10 to-violet-500/0',
        borderClass: 'border-violet-500/20 hover:border-violet-500/40 dark:border-violet-800/30 dark:hover:border-violet-700/50',
        bgHeader: 'bg-violet-500/10 text-violet-700 dark:bg-violet-950/20 dark:text-violet-400',
        items: [
            { id: '1_1', label: 'Анализ ниши и поиск голубого океана' },
            { id: '1_2', label: 'Анализ объема и емкости рынка' },
            { id: '1_3', label: 'Анализ запросов из поисковых систем Яндекс / Гугл' },
            { id: '1_4', label: 'Изучение потребностей клиентов' },
            { id: '1_5', label: 'Доля компании в этой нише в %' },
            { id: '1_6', label: 'Цель по доходу/прибыли на 12/24/36 мес.' },
            { id: '1_7', label: 'Выбор бизнес модели' }
        ]
    },
    {
        id: 2,
        name: '2. Клиенты и рынок',
        color: '#3b82f6', // Blue
        gradient: 'from-blue-500/10 to-blue-500/0',
        borderClass: 'border-blue-500/20 hover:border-blue-500/40 dark:border-blue-800/30 dark:hover:border-blue-700/50',
        bgHeader: 'bg-blue-500/10 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400',
        items: [
            { id: '2_1', label: 'Анализ конкурентов' },
            { id: '2_2', label: 'Портреты-аватар целевой аудитории' },
            { id: '2_3', label: 'Анализ ЦА по болям / страхам / возражениям' },
            { id: '2_4', label: 'Анализ по численности ЦА и географии' },
            { id: '2_5', label: 'План/факт по конверсиям в лида/клиента' },
            { id: '2_6', label: 'SWOT анализ' },
            { id: '2_7', label: 'Оценка удовлетворенности клиентов и отзывов' }
        ]
    },
    {
        id: 3,
        name: '3. Продукт',
        color: '#f59e0b', // Amber
        gradient: 'from-amber-500/10 to-amber-500/0',
        borderClass: 'border-amber-500/20 hover:border-amber-500/40 dark:border-amber-800/30 dark:hover:border-amber-700/50',
        bgHeader: 'bg-amber-500/10 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400',
        items: [
            { id: '3_1', label: 'Анализ конкурентоспособности продукта' },
            { id: '3_2', label: 'Плановый и фактический MVP продукта' },
            { id: '3_3', label: 'Юнит-экономика и доходность позиций' },
            { id: '3_4', label: 'Стратегия по увеличению LTV клиентов' },
            { id: '3_5', label: 'Карта маршрута клиента (CJM)' },
            { id: '3_6', label: 'Бизнес-модель Остервальдера и Пинье' },
            { id: '3_7', label: 'Финансовый расчет рентабельности продукта' }
        ]
    },
    {
        id: 4,
        name: '4. Трафик / продажи',
        color: '#10b981', // Emerald
        gradient: 'from-emerald-500/10 to-emerald-500/0',
        borderClass: 'border-emerald-500/20 hover:border-emerald-500/40 dark:border-emerald-800/30 dark:hover:border-emerald-700/50',
        bgHeader: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400',
        items: [
            { id: '4_1', label: 'План/факт лидов, план/факт охватов' },
            { id: '4_2', label: 'План/факт по стоимости лида и клиента' },
            { id: '4_3', label: 'Анализ каналов продвижения' },
            { id: '4_4', label: 'Воронка продаж с конверсиями' },
            { id: '4_5', label: 'Бизнес процесс, регламенты и скрипты продаж' },
            { id: '4_6', label: 'Настроенная CRM и инструменты взращивания' },
            { id: '4_7', label: 'Ежедневный план / факт продаж' }
        ]
    },
    {
        id: 5,
        name: '5. Маркетинг и брендинг',
        color: '#0ea5e9', // Sky
        gradient: 'from-sky-500/10 to-sky-500/0',
        borderClass: 'border-sky-500/20 hover:border-sky-500/40 dark:border-sky-800/30 dark:hover:border-sky-700/50',
        bgHeader: 'bg-sky-500/10 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400',
        items: [
            { id: '5_1', label: 'Брендбук' },
            { id: '5_2', label: 'Наличие оффера или УТП' },
            { id: '5_3', label: 'Маркетинговая стратегия' },
            { id: '5_4', label: 'Наличие сайта и аккаунта в соцсетях' },
            { id: '5_5', label: 'Программа лояльности/реферальная система' },
            { id: '5_6', label: 'Позиционирование' },
            { id: '5_7', label: 'Наличие 30 точек касания' }
        ]
    },
    {
        id: 6,
        name: '6. Командообразование',
        color: '#a78bfa', // Light violet
        gradient: 'from-violet-400/10 to-violet-400/0',
        borderClass: 'border-violet-400/20 hover:border-violet-400/40 dark:border-violet-800/30 dark:hover:border-violet-700/50',
        bgHeader: 'bg-violet-400/10 text-violet-700 dark:bg-violet-950/20 dark:text-violet-400',
        items: [
            { id: '6_1', label: 'Организационная структура компании' },
            { id: '6_2', label: 'Портрет, ЦКП, KPI и ДИ каждого сотрудника' },
            { id: '6_3', label: 'Формы ежедневных/месячных/годовых отчетов' },
            { id: '6_4', label: 'Процессы найма, обучения и удержания' },
            { id: '6_5', label: 'Рост для ТОПов и кадровый резерв' },
            { id: '6_6', label: 'Контроль работы (Биометрика/CRM/Битрикс)' },
            { id: '6_7', label: 'Тимбилдинг' }
        ]
    },
    {
        id: 7,
        name: '7. Финансы',
        color: '#60a5fa', // Light blue
        gradient: 'from-blue-400/10 to-blue-400/0',
        borderClass: 'border-blue-400/20 hover:border-blue-400/40 dark:border-blue-800/30 dark:hover:border-blue-700/50',
        bgHeader: 'bg-blue-400/10 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400',
        items: [
            { id: '7_1', label: 'Финансовое планирование (бюджет)' },
            { id: '7_2', label: 'План прибыли' },
            { id: '7_3', label: 'Баланс' },
            { id: '7_4', label: 'ОПиУ' },
            { id: '7_5', label: 'ОДДС' },
            { id: '7_6', label: 'Коэффициенты и управленческий учет' },
            { id: '7_7', label: 'Автоматизация учета' }
        ]
    },
    {
        id: 8,
        name: '8. Масштабирование',
        color: '#fbbf24', // Light amber
        gradient: 'from-amber-400/10 to-amber-400/0',
        borderClass: 'border-amber-400/20 hover:border-amber-400/40 dark:border-amber-800/30 dark:hover:border-amber-700/50',
        bgHeader: 'bg-amber-400/10 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400',
        items: [
            { id: '8_1', label: 'Цели и инструменты масштабирования' },
            { id: '8_2', label: 'Система безопасности в налогообложении' },
            { id: '8_3', label: 'Модель масштабирования (партнеры/франшиза)' },
            { id: '8_4', label: 'Юридическая безопасность соглашений' },
            { id: '8_5', label: 'Стандарты и регламенты масштабирования' },
            { id: '8_6', label: 'План/факт по скорости и качеству роста' },
            { id: '8_7', label: 'Адаптация франшизы и улучшение процессов' }
        ]
    },
    {
        id: 9,
        name: '9. Стратегия',
        color: '#34d399', // Light emerald
        gradient: 'from-emerald-400/10 to-emerald-400/0',
        borderClass: 'border-emerald-400/20 hover:border-emerald-400/40 dark:border-emerald-800/30 dark:hover:border-emerald-700/50',
        bgHeader: 'bg-emerald-400/10 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400',
        items: [
            { id: '9_1', label: 'Стратегическая сессия (от 2-х раз в год)' },
            { id: '9_2', label: 'Стратегия внедрения инноваций ИИ в бизнес' },
            { id: '9_3', label: 'Стратегии по поиску новых ниш' },
            { id: '9_4', label: 'Инструменты роста стоимости и капитализации' },
            { id: '9_5', label: 'Аналитика бизнеса для привлечения инвесторов' },
            { id: '9_6', label: 'HR-платформа для обучения сотрудников' },
            { id: '9_7', label: 'Опционы и перевод ТОПов в партнеры/соучредители' }
        ]
    },
    {
        id: 10,
        name: '10. Бизнес процессы',
        color: '#38bdf8', // Light sky
        gradient: 'from-sky-400/10 to-sky-400/0',
        borderClass: 'border-sky-400/20 hover:border-sky-400/40 dark:border-sky-800/30 dark:hover:border-sky-700/50',
        bgHeader: 'bg-sky-400/10 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400',
        items: [
            { id: '10_1', label: 'Определение направлений внедрения регламентации' },
            { id: '10_2', label: 'Разработка карты процессов по направлениям' },
            { id: '10_3', label: 'Регламенты, хронометраж и метрики позиций' },
            { id: '10_4', label: 'Разработка стандартов' },
            { id: '10_5', label: 'Внедрение системы «Кайдзен»' },
            { id: '10_6', label: 'Автоматизация бизнес-процессов' },
            { id: '10_7', label: 'Аудит во всех направлениях' }
        ]
    }
]

export function BusinessWheelPage({ participantId: fixedParticipantId, participantName }: { participantId?: string, participantName?: string } = {}) {
    const isParticipantMode = !!fixedParticipantId

    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>(fixedParticipantId || '')
    const [year, setYear] = useState<number>(() => new Date().getFullYear())
    const [month, setMonth] = useState<string>(() => MONTHS[new Date().getMonth()])

    // Checked elements state
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})

    // UI Feedback States
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

    // Filter query for highlighting items
    const [highlightFilter, setHighlightFilter] = useState('')

    // Report states
    const [activeTab, setActiveTab] = useState<'editor' | 'report'>('editor')
    const [allEntries, setAllEntries] = useState<BusinessWheelEntry[]>([])
    const [isReportLoading, setIsReportLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [programFilter, setProgramFilter] = useState('all')

    // Fetch active participants (admin mode only)
    useEffect(() => {
        if (isParticipantMode) return
        fetch('/api/participants')
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) {
                    setParticipants(data.filter((p: Participant) => p.status === 'active'))
                }
            })
            .catch(console.error)
    }, [isParticipantMode])

    // Fetch report statistics
    const fetchReportData = useCallback(() => {
        if (activeTab !== 'report') return
        setIsReportLoading(true)
        fetch(`/api/business-wheel?year=${year}`)
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) {
                    setAllEntries(data)
                }
            })
            .catch(console.error)
            .finally(() => setIsReportLoading(false))
    }, [activeTab, year])

    useEffect(() => {
        fetchReportData()
    }, [fetchReportData])

    // Fetch single entry for editor
    const fetchEntry = useCallback(async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        setIsLoading(true)

        try {
            const params = new URLSearchParams({
                participant_id: pid,
                year: String(year),
                month: month
            })
            const res = await fetch(`/api/business-wheel?${params}`)
            const { data } = await res.json()

            if (data && data.length > 0) {
                setCheckedItems(data[0].checked_items || {})
            } else {
                setCheckedItems({})
            }
        } catch (e) {
            console.error('Error fetching business wheel:', e)
            setCheckedItems({})
        } finally {
            setIsLoading(false)
            setHasUnsavedChanges(false)
        }
    }, [fixedParticipantId, selectedParticipantId, year, month])

    useEffect(() => {
        fetchEntry()
    }, [fetchEntry])

    // Save
    const handleSave = async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) {
            alert('Пожалуйста, выберите участника')
            return
        }

        setIsSaving(true)
        setSaveStatus('idle')

        try {
            const res = await fetch('/api/business-wheel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participant_id: pid,
                    year,
                    month,
                    checked_items: checkedItems
                })
            })

            const result = await res.json()
            if (!res.ok || result?.error) {
                throw new Error(result?.error || 'Не удалось сохранить')
            }

            setSaveStatus('success')
            setTimeout(() => setSaveStatus('idle'), 3000)
            setHasUnsavedChanges(false)
            fetchReportData()
        } catch (e: any) {
            setSaveStatus('error')
            let userMsg = e.message || 'Неизвестная ошибка'
            if (userMsg.includes('violates foreign key constraint')) {
                userMsg = 'Ваш аккаунт персонала не связан с записью участника в базе данных. Пожалуйста, обратитесь к администратору или примените SQL-миграцию.'
            }
            alert('Ошибка при сохранении: ' + userMsg)
        } finally {
            setIsSaving(false)
        }
    }

    // Toggle checklist item
    const toggleItem = (itemId: string) => {
        setCheckedItems(prev => {
            const next = { ...prev }
            if (next[itemId]) {
                delete next[itemId]
            } else {
                next[itemId] = true
            }
            return next
        })
        setHasUnsavedChanges(true)
    }

    // Batch toggle all items in a category
    const toggleCategoryAll = (catId: number, currentCount: number, items: { id: string }[]) => {
        setCheckedItems(prev => {
            const next = { ...prev }
            if (currentCount === 7) {
                // Uncheck all in this category
                items.forEach(item => {
                    delete next[item.id]
                })
            } else {
                // Check all in this category
                items.forEach(item => {
                    next[item.id] = true
                })
            }
            return next
        })
        setHasUnsavedChanges(true)
    }

    // Calculate dynamic scores for the Radar chart
    const categoryScores = useMemo(() => {
        const scores: Record<number, number> = {}
        BUSINESS_CATEGORIES.forEach(cat => {
            let count = 0
            cat.items.forEach(item => {
                if (checkedItems[item.id]) count++
            })
            scores[cat.id] = count
        })
        return scores
    }, [checkedItems])

    const totalChecked = useMemo(() => {
        return Object.keys(checkedItems).length
    }, [checkedItems])

    // Recharts Data
    const chartData = useMemo(() => {
        return BUSINESS_CATEGORIES.map(cat => ({
            category: cat.name.replace(/^\d+\.\s+/, ''), // Strip the number prefix for clean labels
            checked: categoryScores[cat.id] || 0,
            ideal: 7 // Max checkpoints per category is 7
        }))
    }, [categoryScores])

    // Report table processing
    const uniquePrograms = Array.from(new Set(participants.map(p => p.program?.name).filter(Boolean)))

    const reportRows = useMemo(() => {
        return participants
            .filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
                const matchesProgram = programFilter === 'all' || p.program?.name === programFilter
                return matchesSearch && matchesProgram
            })
            .map(p => {
                const userEntries = allEntries.filter(e => e.participant_id === p.id && e.participant_id !== TEMPLATE_ID)
                const filledMonths = MONTHS.filter(m => {
                    const entry = userEntries.find(e => e.month === m)
                    return entry && Object.keys(entry.checked_items || {}).length > 0
                })
                return {
                    participant: p,
                    filledMonths,
                    count: filledMonths.length
                }
            })
    }, [participants, allEntries, searchTerm, programFilter])

    const overallPercentage = Math.round((totalChecked / 70) * 100)
    const overallStrokeDashoffset = 201.06 - (201.06 * overallPercentage) / 100

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 min-h-full bg-background/50">
            {/* Header Title */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3.5">
                <div>
                    <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                        <span className="text-2xl sm:text-4xl animate-pulse">🏢</span>
                        Колесо бизнеса
                        {isParticipantMode && participantName && (
                            <Badge variant="outline" className="ml-1.5 text-xs font-bold py-0.5 px-2 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                                {participantName}
                            </Badge>
                        )}
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">Интерактивный аудит 10 ключевых сфер вашего бизнеса по 7 чек-поинтам в каждой</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
                    {/* Period Pickers */}
                    <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border shadow-sm">
                        <select
                            value={year}
                            onChange={e => { setYear(Number(e.target.value)); setHasUnsavedChanges(true) }}
                            className="bg-transparent border-none text-xs font-bold text-foreground focus:outline-none cursor-pointer p-0.5"
                        >
                            {[2025, 2026, 2027, 2028].map(y => (
                                <option key={y} value={y} className="bg-card text-foreground">{y} год</option>
                            ))}
                        </select>
                        <span className="text-muted-foreground/30 font-light">|</span>
                        <select
                            value={month}
                            onChange={e => { setMonth(e.target.value); setHasUnsavedChanges(true) }}
                            className="bg-transparent border-none text-xs font-bold text-foreground focus:outline-none cursor-pointer p-0.5"
                        >
                            {MONTHS.map(m => (
                                <option key={m} value={m} className="bg-card text-foreground">{m}</option>
                            ))}
                        </select>
                    </div>

                    {activeTab === 'editor' && saveStatus === 'success' && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg animate-in fade-in zoom-in duration-300 font-semibold">
                            <CheckCircle2 className="w-4 h-4" /> Изменения сохранены!
                        </span>
                    )}
                    {activeTab === 'editor' && saveStatus === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg animate-in fade-in zoom-in duration-300 font-semibold">
                            <AlertCircle className="w-4 h-4" /> Ошибка сохранения
                        </span>
                    )}

                    {activeTab === 'editor' && (
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !selectedParticipantId}
                            size="default"
                            className="gap-2 font-bold bg-indigo-600 hover:bg-indigo-500 text-xs shadow-md px-5 py-2 transition-all active:scale-95 text-white"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isSaving ? 'Сохранение...' : 'Сохранить изменения'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Tab Links (Admin Only) */}
            {!isParticipantMode && (
                <div className="flex border-b border-border/80 gap-1">
                    <button
                        onClick={() => setActiveTab('editor')}
                        className={`px-5 py-2.5 border-b-2 text-xs font-bold transition-all relative ${activeTab === 'editor'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Конструктор чек-листа
                        {hasUnsavedChanges && (
                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('report')}
                        className={`px-5 py-2.5 border-b-2 text-xs font-bold transition-all ${activeTab === 'report'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Отчет по заполнению
                    </button>
                </div>
            )}

            {activeTab === 'editor' ? (
                <div className="space-y-5">
                    {/* User Selection & Highlighting (Admin/User Mode) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        {/* Selector (Admin Only) */}
                        {!isParticipantMode ? (
                            <div className="md:col-span-6 bg-card border border-border p-3.5 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">Выбор участника</h3>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Выберите анкету для заполнения</p>
                                </div>
                                <select
                                    value={selectedParticipantId}
                                    onChange={e => { setSelectedParticipantId(e.target.value); setHasUnsavedChanges(false) }}
                                    className="w-full sm:w-[280px] px-3 py-2 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold shadow-sm"
                                >
                                    <option value="">— Выберите участника —</option>
                                    <option value={TEMPLATE_ID}>⚙️ Базовый шаблон (для всех)</option>
                                    {participants.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} {p.program?.name ? `(${p.program.name})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="md:col-span-6" />
                        )}

                        {/* Search Checkpoints Filter */}
                        {selectedParticipantId && (
                            <div className="md:col-span-6 bg-card border border-border p-3.5 rounded-xl shadow-sm flex items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                                    <Input
                                        placeholder="Поиск по чек-поинтам (например: CRM, SWOT, план)..."
                                        value={highlightFilter}
                                        onChange={e => setHighlightFilter(e.target.value)}
                                        className="pl-9 h-9 text-xs border-border bg-background focus-visible:ring-indigo-500/30 rounded-lg"
                                    />
                                    {highlightFilter && (
                                        <button 
                                            onClick={() => setHighlightFilter('')}
                                            className="absolute right-3 top-2.5 text-muted-foreground/60 hover:text-foreground text-xs"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {!selectedParticipantId && !isParticipantMode ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground bg-card border border-dashed border-border rounded-2xl shadow-sm">
                            <div className="p-4 bg-indigo-500/5 rounded-full border border-indigo-500/10 text-indigo-500">
                                <BarChart3 className="w-12 h-12" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">Выберите участника для аудита</h3>
                            <p className="text-xs text-center max-w-sm text-muted-foreground mt-0.5 leading-relaxed">
                                Выберите студента или базовый шаблон в выпадающем списке выше, чтобы открыть интерактивный чек-лист и радар-диаграмму его бизнеса.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                            {/* Editor Checklist Grid */}
                            <div className="xl:col-span-8 space-y-6">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground bg-card border border-border rounded-2xl shadow-sm">
                                        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                                        <p className="text-xs font-semibold">Загрузка данных чек-листа бизнеса...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Row 1 (Categories 1-5) */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                                            {BUSINESS_CATEGORIES.slice(0, 5).map(cat => {
                                                const checkedCount = cat.items.filter(item => checkedItems[item.id]).length
                                                const percentage = Math.round((checkedCount / 7) * 100)
                                                const strokeDashoffset = 50.26 - (50.26 * percentage) / 100

                                                return (
                                                    <Card key={cat.id} className="border-border hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col group rounded-xl">
                                                        {/* Header banner */}
                                                        <div className={`p-3 border-b flex justify-between items-center transition-all ${cat.bgHeader} border-border/40`}>
                                                            <div className="flex flex-col truncate pr-1">
                                                                <span className="font-extrabold text-xs tracking-tight truncate">{cat.name}</span>
                                                            </div>

                                                            {/* Custom Animated Progress Ring */}
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => toggleCategoryAll(cat.id, checkedCount, cat.items)}
                                                                    className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground touch-manipulation"
                                                                    title={checkedCount === 7 ? "Сбросить все" : "Выбрать все"}
                                                                >
                                                                    {checkedCount === 7 ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                                                                </button>
                                                                
                                                                <div className="relative flex items-center justify-center w-7 h-7 flex-shrink-0">
                                                                    <svg className="w-7 h-7 transform -rotate-90">
                                                                        <circle
                                                                            cx="14"
                                                                            cy="14"
                                                                            r="8"
                                                                            className="stroke-muted/30 dark:stroke-muted/10 fill-none"
                                                                            strokeWidth="2"
                                                                        />
                                                                        <circle
                                                                            cx="14"
                                                                            cy="14"
                                                                            r="8"
                                                                            className="fill-none transition-all duration-500 ease-in-out"
                                                                            strokeWidth="2.2"
                                                                            strokeDasharray="50.26"
                                                                            strokeDashoffset={strokeDashoffset}
                                                                            stroke={cat.color}
                                                                            strokeLinecap="round"
                                                                        />
                                                                    </svg>
                                                                    <span className="absolute text-[8.5px] font-extrabold text-foreground">
                                                                        {checkedCount}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Items list */}
                                                        <div className="p-2.5 space-y-2 flex-1 bg-card/60">
                                                            {cat.items.map(item => {
                                                                const isChecked = !!checkedItems[item.id]
                                                                const isHighlighted = highlightFilter
                                                                    ? item.label.toLowerCase().includes(highlightFilter.toLowerCase())
                                                                    : false
                                                                const isDimmed = highlightFilter && !isHighlighted

                                                                return (
                                                                    <div
                                                                        key={item.id}
                                                                        onClick={() => toggleItem(item.id)}
                                                                        className={`group/item flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-200 select-none border-l-2 ${
                                                                            isChecked 
                                                                                ? 'shadow-sm' 
                                                                                : 'border-transparent hover:bg-muted/40'
                                                                        } ${isDimmed ? 'opacity-30 scale-95' : 'opacity-100 scale-100'} ${
                                                                            isHighlighted ? 'ring-2 ring-indigo-500/30 dark:ring-indigo-400/30' : ''
                                                                        }`}
                                                                        style={isChecked ? { borderLeftColor: cat.color, backgroundColor: `${cat.color}08` } : {}}
                                                                    >
                                                                        {/* Custom Checkbox */}
                                                                        <div 
                                                                            className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all duration-200 ${
                                                                                isChecked 
                                                                                    ? 'border-transparent text-white' 
                                                                                    : 'border-muted-foreground/30 bg-background group-hover/item:border-muted-foreground/60'
                                                                            }`}
                                                                            style={isChecked ? { backgroundColor: cat.color } : {}}
                                                                        >
                                                                            {isChecked && (
                                                                                <svg className="w-2.5 h-2.5 fill-current stroke-white stroke-2" viewBox="0 0 20 20">
                                                                                    <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                                                                                </svg>
                                                                            )}
                                                                        </div>
                                                                        <span className={`text-[11px] leading-tight font-semibold transition-colors ${
                                                                            isChecked 
                                                                                ? 'text-foreground' 
                                                                                : 'text-muted-foreground/90 group-hover/item:text-foreground'
                                                                        }`}>
                                                                            {item.label}
                                                                        </span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </Card>
                                                )
                                            })}
                                        </div>

                                        {/* Row 2 (Categories 6-10) */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                                            {BUSINESS_CATEGORIES.slice(5, 10).map(cat => {
                                                const checkedCount = cat.items.filter(item => checkedItems[item.id]).length
                                                const percentage = Math.round((checkedCount / 7) * 100)
                                                const strokeDashoffset = 50.26 - (50.26 * percentage) / 100

                                                return (
                                                    <Card key={cat.id} className="border-border hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col group rounded-xl">
                                                        {/* Header banner */}
                                                        <div className={`p-3 border-b flex justify-between items-center transition-all ${cat.bgHeader} border-border/40`}>
                                                            <div className="flex flex-col truncate pr-1">
                                                                <span className="font-extrabold text-xs tracking-tight truncate">{cat.name}</span>
                                                            </div>

                                                            {/* Custom Animated Progress Ring */}
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => toggleCategoryAll(cat.id, checkedCount, cat.items)}
                                                                    className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground touch-manipulation"
                                                                    title={checkedCount === 7 ? "Сбросить все" : "Выбрать все"}
                                                                >
                                                                    {checkedCount === 7 ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                                                                </button>
                                                                
                                                                <div className="relative flex items-center justify-center w-7 h-7 flex-shrink-0">
                                                                    <svg className="w-7 h-7 transform -rotate-90">
                                                                        <circle
                                                                            cx="14"
                                                                            cy="14"
                                                                            r="8"
                                                                            className="stroke-muted/30 dark:stroke-muted/10 fill-none"
                                                                            strokeWidth="2"
                                                                        />
                                                                        <circle
                                                                            cx="14"
                                                                            cy="14"
                                                                            r="8"
                                                                            className="fill-none transition-all duration-500 ease-in-out"
                                                                            strokeWidth="2.2"
                                                                            strokeDasharray="50.26"
                                                                            strokeDashoffset={strokeDashoffset}
                                                                            stroke={cat.color}
                                                                            strokeLinecap="round"
                                                                        />
                                                                    </svg>
                                                                    <span className="absolute text-[8.5px] font-extrabold text-foreground">
                                                                        {checkedCount}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Items list */}
                                                        <div className="p-2.5 space-y-2 flex-1 bg-card/60">
                                                            {cat.items.map(item => {
                                                                const isChecked = !!checkedItems[item.id]
                                                                const isHighlighted = highlightFilter
                                                                    ? item.label.toLowerCase().includes(highlightFilter.toLowerCase())
                                                                    : false
                                                                const isDimmed = highlightFilter && !isHighlighted

                                                                return (
                                                                    <div
                                                                        key={item.id}
                                                                        onClick={() => toggleItem(item.id)}
                                                                        className={`group/item flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-200 select-none border-l-2 ${
                                                                            isChecked 
                                                                                ? 'shadow-sm' 
                                                                                : 'border-transparent hover:bg-muted/40'
                                                                        } ${isDimmed ? 'opacity-30 scale-95' : 'opacity-100 scale-100'} ${
                                                                            isHighlighted ? 'ring-2 ring-indigo-500/30 dark:ring-indigo-400/30' : ''
                                                                        }`}
                                                                        style={isChecked ? { borderLeftColor: cat.color, backgroundColor: `${cat.color}08` } : {}}
                                                                    >
                                                                        {/* Custom Checkbox */}
                                                                        <div 
                                                                            className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all duration-200 ${
                                                                                isChecked 
                                                                                    ? 'border-transparent text-white' 
                                                                                    : 'border-muted-foreground/30 bg-background group-hover/item:border-muted-foreground/60'
                                                                            }`}
                                                                            style={isChecked ? { backgroundColor: cat.color } : {}}
                                                                        >
                                                                            {isChecked && (
                                                                                <svg className="w-2.5 h-2.5 fill-current stroke-white stroke-2" viewBox="0 0 20 20">
                                                                                    <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                                                                                </svg>
                                                                            )}
                                                                        </div>
                                                                        <span className={`text-[11px] leading-tight font-semibold transition-colors ${
                                                                            isChecked 
                                                                                ? 'text-foreground' 
                                                                                : 'text-muted-foreground/90 group-hover/item:text-foreground'
                                                                        }`}>
                                                                            {item.label}
                                                                        </span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </Card>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Radar Visualization Column */}
                            <div className="xl:col-span-4 space-y-6">
                                <Card className="p-5 border-border shadow-md flex flex-col items-center xl:sticky xl:top-4 bg-card/75 backdrop-blur-md">
                                    <div className="w-full flex items-center justify-between mb-3 border-b border-border/50 pb-3">
                                        <h3 className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
                                            <Sparkles className="w-4 h-4 text-amber-500 animate-spin" style={{ animationDuration: '6s' }} />
                                            Диаграмма бизнеса
                                        </h3>
                                        {totalChecked > 0 && (
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                onClick={() => { setCheckedItems({}); setHasUnsavedChanges(true) }}
                                                className="h-6 text-[10px] font-bold text-muted-foreground hover:text-red-500 px-2 rounded"
                                            >
                                                Сбросить всё
                                            </Button>
                                        )}
                                    </div>
                                    
                                    <div className="w-full h-[320px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                                                <PolarGrid stroke="hsl(var(--muted-foreground) / 0.18)" />
                                                <PolarAngleAxis
                                                    dataKey="category"
                                                    tick={{ fill: 'currentColor', fontSize: 9, fontWeight: 600 }}
                                                    className="text-muted-foreground"
                                                />
                                                <PolarRadiusAxis angle={30} domain={[0, 7]} tick={{ fontSize: 8 }} />
                                                
                                                {/* Ideal Boundary Line (7 items) */}
                                                <Radar
                                                    name="Максимум"
                                                    dataKey="ideal"
                                                    stroke="#94a3b8"
                                                    fill="none"
                                                    strokeDasharray="4 4"
                                                    strokeWidth={1.5}
                                                />

                                                {/* Actual Checked Items */}
                                                <Radar
                                                    name="Уровень бизнеса"
                                                    dataKey="checked"
                                                    stroke="#6366f1"
                                                    fill="url(#radarGradient)"
                                                    fillOpacity={0.25}
                                                    strokeWidth={2.5}
                                                />
                                                <defs>
                                                    <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.4} />
                                                        <stop offset="100%" stopColor="#c084fc" stopOpacity={0.1} />
                                                    </linearGradient>
                                                </defs>
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: 'hsl(var(--background))',
                                                        borderColor: 'hsl(var(--border))',
                                                        borderRadius: '12px',
                                                        fontSize: '11px',
                                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                                                    }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '9px', marginTop: '10px', fontWeight: 600 }} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Overall Dynamic Circular Progress */}
                                    <div className="w-full mt-4 border-t border-border/50 pt-5 flex flex-col items-center">
                                        <div className="relative flex items-center justify-center w-28 h-28 my-1">
                                            <svg className="w-28 h-28 transform -rotate-90">
                                                <circle
                                                    cx="56"
                                                    cy="56"
                                                    r="32"
                                                    className="stroke-muted/30 dark:stroke-muted/10 fill-none"
                                                    strokeWidth="6"
                                                />
                                                <circle
                                                    cx="56"
                                                    cy="56"
                                                    r="32"
                                                    className="fill-none transition-all duration-700 ease-in-out"
                                                    strokeWidth="7"
                                                    strokeDasharray="201.06"
                                                    strokeDashoffset={overallStrokeDashoffset}
                                                    stroke="url(#progressGradient)"
                                                    strokeLinecap="round"
                                                />
                                                <defs>
                                                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="#6366f1" />
                                                        <stop offset="100%" stopColor="#a855f7" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                            <div className="absolute text-center">
                                                <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 leading-none">
                                                    {totalChecked}
                                                </div>
                                                <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                                                    из 70
                                                </div>
                                                <div className="text-[10px] font-bold text-foreground/80 leading-none mt-0.5">
                                                    {overallPercentage}%
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-[10px] text-muted-foreground uppercase font-extrabold tracking-widest mt-3">
                                            Пройдено чек-поинтов
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Report View (Admin Only) */
                <Card className="p-5 border-border shadow-md space-y-6 bg-card">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
                        <div>
                            <h2 className="text-lg font-extrabold text-foreground">Отчет по заполнению</h2>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Участники и месяцы, в которых заполнялся чек-лист колеса бизнеса в {year} году
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2.5">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
                                <Input
                                    placeholder="Поиск по имени..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-8.5 w-full sm:w-[200px] h-9 text-xs border-border bg-background focus-visible:ring-indigo-500/30 rounded-lg"
                                />
                            </div>
                            <select
                                value={programFilter}
                                onChange={e => setProgramFilter(e.target.value)}
                                className="px-3 py-1 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 h-9 font-semibold shadow-sm"
                            >
                                <option value="all">Все программы</option>
                                {uniquePrograms.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {isReportLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                            <p className="text-xs">Загрузка данных отчета...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        <th className="py-3 px-4">Участник</th>
                                        <th className="py-3 px-4 text-center w-[180px]">Всего заполнено месяцев</th>
                                        <th className="py-3 px-4">Месяцы заполнения</th>
                                        <th className="py-3 px-4 text-right w-[100px]">Действие</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60 text-xs">
                                    {reportRows.map(({ participant, filledMonths, count }) => (
                                        <tr key={participant.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-foreground">{participant.name}</div>
                                                {participant.program?.name && (
                                                    <Badge variant="secondary" className="mt-0.5 text-[9px] px-1.5 py-0 border-none font-medium">
                                                        {participant.program.name}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    count > 0 ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {count} из 12
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {count > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {filledMonths.map(m => (
                                                            <Badge
                                                                key={m}
                                                                variant="outline"
                                                                className="text-[9px] px-1.5 py-0 font-bold bg-emerald-500/5 text-emerald-600 border-emerald-500/20"
                                                            >
                                                                {m}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground italic">Не заполнено</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="gap-1 hover:text-indigo-600 hover:bg-indigo-500/10 text-muted-foreground text-[10.5px] h-7 px-2 font-bold"
                                                    onClick={() => {
                                                        setSelectedParticipantId(participant.id)
                                                        setActiveTab('editor')
                                                        if (filledMonths.length > 0) {
                                                            setMonth(filledMonths[filledMonths.length - 1])
                                                        }
                                                    }}
                                                >
                                                    <Eye className="w-3.5 h-3.5" /> Посмотреть
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}

                                    {reportRows.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-10 text-center text-muted-foreground italic text-xs">
                                                Участники не найдены
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}
        </div>
    )
}

export default BusinessWheelPage
