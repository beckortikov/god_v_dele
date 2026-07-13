'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Save, Loader2, CheckCircle2, AlertCircle, Search, Eye, BarChart3, CheckSquare, Square } from 'lucide-react'
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
        color: 'violet',
        headerClass: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
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
        color: 'blue',
        headerClass: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
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
        color: 'amber',
        headerClass: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
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
        color: 'emerald',
        headerClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
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
        color: 'sky',
        headerClass: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
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
        name: '6. Командообразование / Управление командой',
        color: 'violet',
        headerClass: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
        items: [
            { id: '6_1', label: 'Организационная структура компании' },
            { id: '6_2', label: 'Портрет, ЦКП, KPI и ДИ каждого сотрудника' },
            { id: '6_3', label: 'Формы ежедневных/месячных/годовых отчетов' },
            { id: '6_4', label: 'Процессы найма, обучения и удержания' },
            { id: '6_5', label: 'Рост для ТОПов и кадровый резерв' },
            { id: '6_6', label: 'Контроль работы (Биометрика/Трекер/CRM)' },
            { id: '6_7', label: 'Тимбилдинг' }
        ]
    },
    {
        id: 7,
        name: '7. Финансы',
        color: 'blue',
        headerClass: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
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
        color: 'amber',
        headerClass: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
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
        color: 'emerald',
        headerClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
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
        name: '10. Бизнес процессы / Регламентация',
        color: 'sky',
        headerClass: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
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
            alert('Ошибка при сохранении: ' + (e.message || 'Неизвестная ошибка'))
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

    return (
        <div className="p-4 sm:p-5 space-y-5 min-h-full bg-background">
            {/* Header Title */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                        <span className="text-2xl">🏢</span>
                        Колесо бизнеса
                        {isParticipantMode && participantName && (
                            <Badge variant="secondary" className="ml-2 text-xs font-normal py-0.5 px-2">
                                {participantName}
                            </Badge>
                        )}
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Оценка 10 ключевых сфер вашего бизнеса по 7 чек-поинтам в каждой</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Period Pickers */}
                    <div className="flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-lg border border-border">
                        <select
                            value={year}
                            onChange={e => { setYear(Number(e.target.value)); setHasUnsavedChanges(true) }}
                            className="bg-transparent border-none text-xs font-bold text-foreground focus:outline-none cursor-pointer p-0.5"
                        >
                            {[2025, 2026, 2027, 2028].map(y => (
                                <option key={y} value={y} className="bg-background">{y}</option>
                            ))}
                        </select>
                        <span className="text-muted-foreground/40 font-light">|</span>
                        <select
                            value={month}
                            onChange={e => { setMonth(e.target.value); setHasUnsavedChanges(true) }}
                            className="bg-transparent border-none text-xs font-bold text-foreground focus:outline-none cursor-pointer p-0.5"
                        >
                            {MONTHS.map(m => (
                                <option key={m} value={m} className="bg-background">{m}</option>
                            ))}
                        </select>
                    </div>

                    {activeTab === 'editor' && saveStatus === 'success' && (
                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-md animate-in fade-in">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Сохранено
                        </span>
                    )}
                    {activeTab === 'editor' && saveStatus === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-red-600 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-md animate-in fade-in">
                            <AlertCircle className="w-3.5 h-3.5" /> Ошибка
                        </span>
                    )}

                    {activeTab === 'editor' && (
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !selectedParticipantId}
                            size="sm"
                            className="gap-1.5 font-bold bg-indigo-600 hover:bg-indigo-500 text-xs shadow-sm px-4"
                        >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            {isSaving ? 'Сохранение...' : 'Сохранить'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Tab Links (Admin Only) */}
            {!isParticipantMode && (
                <div className="flex border-b border-border/60">
                    <button
                        onClick={() => setActiveTab('editor')}
                        className={`px-4 py-2 border-b-2 text-xs font-bold transition-all relative ${activeTab === 'editor'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Конструктор чек-листа
                        {hasUnsavedChanges && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('report')}
                        className={`px-4 py-2 border-b-2 text-xs font-bold transition-all ${activeTab === 'report'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Отчет по заполнению
                    </button>
                </div>
            )}

            {activeTab === 'editor' ? (
                <div className="space-y-4">
                    {/* User Selection Header (Admin Mode Only) */}
                    {!isParticipantMode && (
                        <div className="bg-card border border-border p-3 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div>
                                <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Выбор участника</h3>
                                <p className="text-[10px] text-muted-foreground">Выберите участника для заполнения колеса бизнеса</p>
                            </div>
                            <select
                                value={selectedParticipantId}
                                onChange={e => { setSelectedParticipantId(e.target.value); setHasUnsavedChanges(false) }}
                                className="w-full sm:w-[260px] px-2.5 py-1.5 bg-background border border-border rounded-md text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
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
                    )}

                    {!selectedParticipantId && !isParticipantMode ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground bg-card border border-dashed border-border rounded-xl">
                            <BarChart3 className="w-10 h-10 text-muted-foreground/45" />
                            <p className="text-sm font-bold text-foreground">Выберите участника</p>
                            <p className="text-xs text-center max-w-xs text-muted-foreground/80">Выберите участника из списка выше, чтобы открыть и заполнить колесо бизнеса</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                            {/* Editor Checklist Grid */}
                            <div className="xl:col-span-8 space-y-4">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-24 gap-2 text-muted-foreground bg-card border border-border rounded-xl">
                                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                                        <p className="text-xs">Загрузка данных чек-листа...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Row 1 (Categories 1-5) */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                            {BUSINESS_CATEGORIES.slice(0, 5).map(cat => (
                                                <Card key={cat.id} className="border-border overflow-hidden flex flex-col shadow-sm">
                                                    <div className={`p-2.5 border-b font-bold text-xs flex justify-between items-center ${cat.headerClass}`}>
                                                        <span className="truncate pr-1">{cat.name}</span>
                                                        <Badge variant="outline" className="text-[10px] py-0 px-1 border-current">
                                                            {categoryScores[cat.id] || 0}/7
                                                        </Badge>
                                                    </div>
                                                    <div className="p-2 space-y-1.5 flex-1 bg-card">
                                                        {cat.items.map(item => {
                                                            const isChecked = !!checkedItems[item.id]
                                                            return (
                                                                <div
                                                                    key={item.id}
                                                                    onClick={() => toggleItem(item.id)}
                                                                    className={`flex items-start gap-1.5 p-1 rounded transition-colors cursor-pointer select-none ${
                                                                        isChecked 
                                                                            ? 'bg-indigo-500/5 hover:bg-indigo-500/10' 
                                                                            : 'hover:bg-muted/40'
                                                                    }`}
                                                                >
                                                                    <button className="flex-shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400 focus:outline-none">
                                                                        {isChecked ? (
                                                                            <CheckSquare className="w-3.5 h-3.5" />
                                                                        ) : (
                                                                            <Square className="w-3.5 h-3.5 text-muted-foreground/60" />
                                                                        )}
                                                                    </button>
                                                                    <span className={`text-[10.5px] leading-tight font-medium ${
                                                                        isChecked ? 'text-foreground font-semibold' : 'text-muted-foreground'
                                                                    }`}>
                                                                        {item.label}
                                                                    </span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>

                                        {/* Row 2 (Categories 6-10) */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                            {BUSINESS_CATEGORIES.slice(5, 10).map(cat => (
                                                <Card key={cat.id} className="border-border overflow-hidden flex flex-col shadow-sm">
                                                    <div className={`p-2.5 border-b font-bold text-xs flex justify-between items-center ${cat.headerClass}`}>
                                                        <span className="truncate pr-1">{cat.name}</span>
                                                        <Badge variant="outline" className="text-[10px] py-0 px-1 border-current">
                                                            {categoryScores[cat.id] || 0}/7
                                                        </Badge>
                                                    </div>
                                                    <div className="p-2 space-y-1.5 flex-1 bg-card">
                                                        {cat.items.map(item => {
                                                            const isChecked = !!checkedItems[item.id]
                                                            return (
                                                                <div
                                                                    key={item.id}
                                                                    onClick={() => toggleItem(item.id)}
                                                                    className={`flex items-start gap-1.5 p-1 rounded transition-colors cursor-pointer select-none ${
                                                                        isChecked 
                                                                            ? 'bg-indigo-500/5 hover:bg-indigo-500/10' 
                                                                            : 'hover:bg-muted/40'
                                                                    }`}
                                                                >
                                                                    <button className="flex-shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400 focus:outline-none">
                                                                        {isChecked ? (
                                                                            <CheckSquare className="w-3.5 h-3.5" />
                                                                        ) : (
                                                                            <Square className="w-3.5 h-3.5 text-muted-foreground/60" />
                                                                        )}
                                                                    </button>
                                                                    <span className={`text-[10.5px] leading-tight font-medium ${
                                                                        isChecked ? 'text-foreground font-semibold' : 'text-muted-foreground'
                                                                    }`}>
                                                                        {item.label}
                                                                    </span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Radar Visualization Column */}
                            <div className="xl:col-span-4">
                                <Card className="p-4 sm:p-5 border-border shadow-md flex flex-col items-center xl:sticky xl:top-4 bg-card">
                                    <h3 className="font-bold text-sm text-foreground mb-3 self-start">Диаграмма бизнеса</h3>
                                    
                                    <div className="w-full h-[280px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                                                <PolarGrid stroke="hsl(var(--muted-foreground) / 0.15)" />
                                                <PolarAngleAxis
                                                    dataKey="category"
                                                    tick={{ fill: 'currentColor', fontSize: 9, fontWeight: 500 }}
                                                    className="text-muted-foreground"
                                                />
                                                <PolarRadiusAxis angle={30} domain={[0, 7]} tick={{ fontSize: 8 }} />
                                                
                                                {/* Ideal Boundary Line (7 items) */}
                                                <Radar
                                                    name="Максимум"
                                                    dataKey="ideal"
                                                    stroke="#cbd5e1"
                                                    fill="none"
                                                    strokeDasharray="4 4"
                                                    strokeWidth={1.5}
                                                />

                                                {/* Actual Checked Items */}
                                                <Radar
                                                    name="Уровень бизнеса"
                                                    dataKey="checked"
                                                    stroke="#6366f1"
                                                    fill="#6366f1"
                                                    fillOpacity={0.15}
                                                    strokeWidth={2}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: 'hsl(var(--background))',
                                                        borderColor: 'hsl(var(--border))',
                                                        borderRadius: '8px',
                                                        fontSize: '11px'
                                                    }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '9px', marginTop: '5px' }} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Overall Completion Summary */}
                                    <div className="w-full mt-4 border-t border-border pt-3 text-center">
                                        <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                                            {Object.keys(checkedItems).length} <span className="text-xs text-muted-foreground font-semibold">из 70</span>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">
                                            Чек-поинтов пройдено
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Report View (Admin Only) */
                <Card className="p-4 border-border shadow-sm space-y-5 bg-card">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3.5">
                        <div>
                            <h2 className="text-lg font-bold text-foreground">Отчет по заполнению</h2>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Участники и месяцы, в которых заполнялся чек-лист колеса бизнеса в {year} году
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2.5">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    placeholder="Поиск по имени..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-8.5 w-full sm:w-[200px] h-8 text-xs"
                                />
                            </div>
                            <select
                                value={programFilter}
                                onChange={e => setProgramFilter(e.target.value)}
                                className="px-2.5 py-1 bg-background border border-border rounded-md text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 h-8 font-medium"
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
                                        <th className="py-2.5 px-3">Участник</th>
                                        <th className="py-2.5 px-3 text-center w-[180px]">Всего заполнено месяцев</th>
                                        <th className="py-2.5 px-3">Месяцы заполнения</th>
                                        <th className="py-2.5 px-3 text-right w-[100px]">Действие</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60 text-xs">
                                    {reportRows.map(({ participant, filledMonths, count }) => (
                                        <tr key={participant.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="py-3 px-3">
                                                <div className="font-bold text-foreground">{participant.name}</div>
                                                {participant.program?.name && (
                                                    <Badge variant="secondary" className="mt-0.5 text-[9px] px-1.5 py-0 border-none font-medium">
                                                        {participant.program.name}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    count > 0 ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {count} из 12
                                                </span>
                                            </td>
                                            <td className="py-3 px-3">
                                                {count > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
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
                                            <td className="py-3 px-3 text-right">
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
