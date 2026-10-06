'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Briefcase, Check, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import { FillReport, type FillRow } from '@/components/wheels/fill-report'
import {
    Meter,
    PanelHeading,
    ParticipantPicker,
    PeriodStepper,
    SaveBar,
    SaveStatus,
    WheelTabs,
    YearSelect,
    type WheelTab,
} from '@/components/wheels/parts'
import {
    MONTHS_FULL,
    TEMPLATE_ID,
    YEARS,
    saveErrorMessage,
    useBeforeUnload,
    usePersistentState,
    useSaveShortcut,
    type WheelParticipant,
} from '@/components/wheels/shared'
import { WheelRadar } from '@/components/wheels/wheel-radar'

// ─────────────────────────── Types ───────────────────────────
type Participant = WheelParticipant

interface BusinessWheelEntry {
    id?: string
    participant_id: string
    year: number
    month: string
    checked_items: Record<string, boolean>
}

// ─────────────────────────── Constants ───────────────────────────
const MONTHS = MONTHS_FULL

const BUSINESS_CATEGORIES = [
    {
        id: 1,
        name: '1. Ниша',
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


const shortName = (name: string) => name.replace(/^\d+\.\s+/, '')

export function BusinessWheelPage({ participantId: fixedParticipantId, participantName }: { participantId?: string, participantName?: string } = {}) {
    const isParticipantMode = !!fixedParticipantId
    const confirm = useConfirm()

    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>(fixedParticipantId || '')
    const [year, setYear] = useState<number>(() => new Date().getFullYear())
    const [month, setMonth] = useState<string>(() => MONTHS[new Date().getMonth()])

    // Checked elements state
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})

    // UI Feedback States
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

    // Filter query for checkpoints
    const [highlightFilter, setHighlightFilter] = useState('')

    // Report states
    const [savedTab, setSavedTab] = usePersistentState<WheelTab>('business-wheel-tab', 'editor', ['editor', 'report'])
    const activeTab: WheelTab = isParticipantMode ? 'editor' : savedTab
    const [allEntries, setAllEntries] = useState<BusinessWheelEntry[]>([])
    const [isReportLoading, setIsReportLoading] = useState(false)

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

    const pid = fixedParticipantId || selectedParticipantId

    // Save
    const handleSave = async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) {
            toast.error('Сначала выберите участника')
            return
        }

        setIsSaving(true)

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

            toast.success('Колесо бизнеса сохранено', { description: `${month} ${year}` })
            setHasUnsavedChanges(false)
            fetchReportData()
        } catch (e: any) {
            toast.error('Не удалось сохранить', { description: saveErrorMessage(e) })
        } finally {
            setIsSaving(false)
        }
    }

    useSaveShortcut(handleSave, activeTab === 'editor' && !!pid && !isSaving)
    useBeforeUnload(hasUnsavedChanges)

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

    const resetAll = async () => {
        const ok = await confirm({
            title: 'Снять все отметки?',
            description: `Все пункты за ${month.toLowerCase()} ${year} станут неотмеченными. Изменение применится после сохранения.`,
            confirmText: 'Снять все',
            destructive: true,
        })
        if (!ok) return
        setCheckedItems({})
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
            category: shortName(cat.name), // Strip the number prefix for clean labels
            checked: categoryScores[cat.id] || 0,
            ideal: 7 // Max checkpoints per category is 7
        }))
    }, [categoryScores])

    // Report table processing
    const curMonthName = MONTHS[new Date().getMonth()]
    const reportRows: FillRow[] = useMemo(() => {
        return participants.map(p => {
            const userEntries = allEntries.filter(e => e.participant_id === p.id && e.participant_id !== TEMPLATE_ID)
            const filledMonths = MONTHS.filter(m => {
                const entry = userEntries.find(e => e.month === m)
                return entry && Object.keys(entry.checked_items || {}).length > 0
            })
            return {
                participant: p,
                count: filledMonths.length,
                periods: filledMonths,
                current: year === new Date().getFullYear() && filledMonths.includes(curMonthName),
            }
        })
    }, [participants, allEntries, year, curMonthName])

    const overallPercentage = Math.round((totalChecked / 70) * 100)

    /** Run `fn` only if there is nothing to lose, or the user agrees to drop it. */
    const guard = async (fn: () => void) => {
        if (hasUnsavedChanges) {
            const ok = await confirm({
                title: 'Уйти без сохранения?',
                description: 'Отметки за этот месяц пропадут.',
                confirmText: 'Не сохранять',
                destructive: true,
            })
            if (!ok) return
        }
        fn()
    }

    const openFromReport = (row: FillRow) =>
        guard(() => {
            setSelectedParticipantId(row.participant.id)
            setSavedTab('editor')
            if (row.periods.length > 0) {
                setMonth(row.periods[row.periods.length - 1])
            }
        })

    // Month stepper that crosses year boundaries (within the supported years)
    const mIdx = MONTHS.indexOf(month)
    const canPrev = mIdx > 0 || year > YEARS[0]
    const canNext = mIdx < 11 || year < YEARS[YEARS.length - 1]
    const step = (dir: -1 | 1) =>
        guard(() => {
            const next = mIdx + dir
            if (next < 0) {
                setYear(year - 1)
                setMonth(MONTHS[11])
            } else if (next > 11) {
                setYear(year + 1)
                setMonth(MONTHS[0])
            } else {
                setMonth(MONTHS[next])
            }
        })
    const now = new Date()
    const isNow = year === now.getFullYear() && mIdx === now.getMonth()

    // Search filters the checklist (presentation only)
    const q = highlightFilter.trim().toLowerCase()
    const visibleCategories = BUSINESS_CATEGORIES.map(cat => ({
        ...cat,
        visibleItems: q
            ? cat.items.filter(i => i.label.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q))
            : cat.items,
    })).filter(c => c.visibleItems.length > 0)

    return (
        <PageContainer>
            <PageHeader
                title="Колесо бизнеса"
                description={
                    isParticipantMode
                        ? `${participantName ? participantName + ' · ' : ''}Отметьте, что уже есть в вашем бизнесе: 10 направлений по 7 пунктов`
                        : 'Аудит бизнеса участников: 10 направлений по 7 пунктов'
                }
            />

            {!isParticipantMode && (
                <WheelTabs value={activeTab} onChange={t => setSavedTab(t)} dirty={hasUnsavedChanges} />
            )}

            {activeTab === 'report' ? (
                <FillReport
                    rows={reportRows}
                    loading={isReportLoading}
                    outOf={12}
                    unit={['месяц', 'месяца', 'месяцев']}
                    currentLabel="в этом месяце"
                    onOpen={openFromReport}
                    toolbarExtra={<YearSelect value={year} onChange={y => guard(() => setYear(y))} />}
                    maxBadges={12}
                />
            ) : (
                <>
                    {/* Controls */}
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        {!isParticipantMode && (
                            <ParticipantPicker
                                participants={participants}
                                value={selectedParticipantId}
                                onChange={id => guard(() => setSelectedParticipantId(id))}
                            />
                        )}
                        {pid && (
                            <PeriodStepper
                                label={`${month} ${year}`}
                                onPrev={() => step(-1)}
                                onNext={() => step(1)}
                                prevDisabled={!canPrev}
                                nextDisabled={!canNext}
                                onReset={
                                    !isNow && YEARS.includes(now.getFullYear())
                                        ? () => guard(() => { setYear(now.getFullYear()); setMonth(MONTHS[now.getMonth()]) })
                                        : undefined
                                }
                            />
                        )}
                        {pid && (
                            <SearchInput
                                value={highlightFilter}
                                onChange={setHighlightFilter}
                                placeholder="Найти пункт: CRM, SWOT…"
                                className="sm:ml-auto sm:w-72 [&_input]:max-sm:h-9"
                            />
                        )}
                    </div>

                    {!pid ? (
                        <Panel>
                            <EmptyState
                                icon={Briefcase}
                                title="Выберите участника"
                                description="Найдите участника в списке выше, чтобы открыть его чек-лист и диаграмму бизнеса."
                                action={
                                    <Button variant="outline" size="sm" onClick={() => setSavedTab('report')}>
                                        Кто уже заполнил
                                    </Button>
                                }
                            />
                        </Panel>
                    ) : (
                        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                            {/* Checklist */}
                            <div className="min-w-0">
                                {isLoading ? (
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <Panel key={i} className="space-y-3 p-4">
                                                <Skeleton className="h-5 w-40" />
                                                {Array.from({ length: 5 }).map((__, j) => (
                                                    <Skeleton key={j} className="h-4 w-full" />
                                                ))}
                                            </Panel>
                                        ))}
                                    </div>
                                ) : visibleCategories.length === 0 ? (
                                    <Panel>
                                        <EmptyState
                                            icon={SearchX}
                                            title="Ничего не нашли"
                                            description="Попробуйте другое слово"
                                            action={<Button variant="outline" size="sm" onClick={() => setHighlightFilter('')}>Сбросить поиск</Button>}
                                        />
                                    </Panel>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        {visibleCategories.map(cat => {
                                            const checkedCount = cat.items.filter(item => checkedItems[item.id]).length
                                            const full = checkedCount === 7
                                            return (
                                                <Panel key={cat.id} id={`bw-cat-${cat.id}`} className="scroll-mt-4">
                                                    <div className="flex items-center gap-3 border-b px-4 py-3">
                                                        <span className="num flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                                                            {cat.id}
                                                        </span>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-baseline justify-between gap-2">
                                                                <h3 className="truncate font-medium">{shortName(cat.name)}</h3>
                                                                <span className={cn('num shrink-0 text-sm', full ? 'text-success' : 'text-muted-foreground')}>
                                                                    {checkedCount} из 7
                                                                </span>
                                                            </div>
                                                            <Meter value={checkedCount} max={7} tone={full ? 'success' : 'primary'} className="mt-1.5" />
                                                        </div>
                                                    </div>
                                                    <ul className="py-1">
                                                        {cat.visibleItems.map(item => {
                                                            const isChecked = !!checkedItems[item.id]
                                                            return (
                                                                <li key={item.id}>
                                                                    <button
                                                                        type="button"
                                                                        role="checkbox"
                                                                        aria-checked={isChecked}
                                                                        onClick={() => toggleItem(item.id)}
                                                                        className="flex min-h-11 w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent sm:min-h-0 sm:py-2"
                                                                    >
                                                                        <span
                                                                            className={cn(
                                                                                'mt-px flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                                                                                isChecked
                                                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                                                    : 'border-input bg-card'
                                                                            )}
                                                                        >
                                                                            {isChecked && <Check className="size-3.5" strokeWidth={3} />}
                                                                        </span>
                                                                        <span className={cn('leading-snug', !isChecked && 'text-foreground/85')}>{item.label}</span>
                                                                    </button>
                                                                </li>
                                                            )
                                                        })}
                                                    </ul>
                                                    {!q && (
                                                        <div className="border-t px-2 py-1.5">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="w-full text-muted-foreground max-sm:h-10"
                                                                onClick={() => toggleCategoryAll(cat.id, checkedCount, cat.items)}
                                                            >
                                                                {full ? 'Снять все' : 'Отметить все'}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </Panel>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Overview + radar */}
                            <Panel className="xl:sticky xl:top-4">
                                <PanelHeading
                                    title="Диаграмма бизнеса"
                                    description={`${month} ${year}`}
                                    actions={
                                        totalChecked > 0 && (
                                            <Button variant="ghost" size="xs" onClick={resetAll} className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive">
                                                Снять все
                                            </Button>
                                        )
                                    }
                                />
                                <div className="space-y-2 border-b px-4 py-3">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <p>
                                            <span className="num text-2xl font-semibold tracking-tight">{totalChecked}</span>
                                            <span className="num text-muted-foreground"> из 70 пунктов</span>
                                        </p>
                                        <span className="num text-sm font-medium text-muted-foreground">{overallPercentage}%</span>
                                    </div>
                                    <Meter value={totalChecked} max={70} className="h-2" />
                                </div>
                                <div className="px-2 pt-2 pb-3 sm:px-4">
                                    <WheelRadar
                                        data={chartData}
                                        max={7}
                                        height={320}
                                        series={[
                                            { key: 'ideal', name: 'Максимум', color: 'var(--muted-foreground)', dashed: true },
                                            { key: 'checked', name: 'Уровень бизнеса', color: 'var(--chart-1)' },
                                        ]}
                                    />
                                </div>
                            </Panel>
                        </div>
                    )}

                    {pid && (
                        <SaveBar dirty={hasUnsavedChanges} saving={isSaving} disabled={!selectedParticipantId} onSave={handleSave}>
                            <div className="min-w-0">
                                <p className="truncate font-medium">
                                    <span className="num">{totalChecked} из 70</span>
                                    <span className="font-normal text-muted-foreground"> · {month} {year}</span>
                                </p>
                                <div className="text-xs">
                                    <SaveStatus dirty={hasUnsavedChanges} />
                                </div>
                            </div>
                        </SaveBar>
                    )}
                </>
            )}
        </PageContainer>
    )
}

export default BusinessWheelPage
