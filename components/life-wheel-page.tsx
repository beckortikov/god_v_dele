'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, Save, ChevronLeft, ChevronRight, PieChart, Loader2, CheckCircle2, AlertCircle, RefreshCw, Search, Eye, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────── Types ───────────────────────────
interface Participant {
    id: string
    name: string
    program?: { name: string }
    status: string
}

interface WheelCategory {
    id: string
    group?: string
    name: string
    value: number
    color: string
}

interface WheelEntry {
    id?: string
    participant_id: string
    period_type: 'weekly' | 'monthly'
    period_label: string
    categories: WheelCategory[]
}

// ─────────────────────────── Constants ───────────────────────────
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'

const PALETTE = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#a855f7', '#84cc16',
]

const DEFAULT_CATEGORIES: WheelCategory[] = [
    // 1. Здоровье и Энергия (Indigo)
    { id: '1', group: 'Здоровье и Энергия', name: 'Здоровье', value: 0, color: '#4f46e5' },
    { id: '2', group: 'Здоровье и Энергия', name: 'Спорт', value: 0, color: '#6366f1' },
    { id: '3', group: 'Здоровье и Энергия', name: 'Сон', value: 0, color: '#818cf8' },
    
    // 2. Семья и Отношения (Pink)
    { id: '4', group: 'Семья и Отношения', name: 'Жена', value: 0, color: '#be185d' },
    { id: '5', group: 'Семья и Отношения', name: 'Дети', value: 0, color: '#db2777' },
    { id: '6', group: 'Семья и Отношения', name: 'Родители', value: 0, color: '#ec4899' },
    { id: '7', group: 'Семья и Отношения', name: 'Братья / Сестры', value: 0, color: '#f472b6' },
    { id: '8', group: 'Семья и Отношения', name: 'Родственники', value: 0, color: '#f9a8d4' },
    
    // 3. Бизнес и Работа (Blue)
    { id: '9', group: 'Бизнес и Работа', name: 'Операционка', value: 0, color: '#1d4ed8' },
    { id: '10', group: 'Бизнес и Работа', name: 'Сотрудники', value: 0, color: '#2563eb' },
    { id: '11', group: 'Бизнес и Работа', name: 'Стратегия', value: 0, color: '#3b82f6' },
    { id: '12', group: 'Бизнес и Работа', name: 'Маркетинг / Продажи', value: 0, color: '#60a5fa' },
    
    // 4. Личность и Рост (Yellow/Amber)
    { id: '13', group: 'Личность и Рост', name: 'Учеба / Чтение', value: 0, color: '#d97706' },
    { id: '14', group: 'Личность и Рост', name: 'Хобби / Отдых', value: 0, color: '#f59e0b' },
    { id: '15', group: 'Личность и Рост', name: 'Личный бренд', value: 0, color: '#fbbf24' },
    { id: '16', group: 'Личность и Рост', name: 'Активы / Финансы', value: 0, color: '#fde047' },
    
    // 5. Духовность (Teal/Green)
    { id: '17', group: 'Духовность', name: 'Духовные практики', value: 0, color: '#0d9488' },
    { id: '18', group: 'Духовность', name: 'Благотворительность', value: 0, color: '#14b8a6' },
    { id: '19', group: 'Духовность', name: 'Окружение / Друзья', value: 0, color: '#22c55e' }
]

function getPeriodLabel(type: 'weekly' | 'monthly', offset: number): string {
    const d = new Date()
    if (type === 'monthly') {
        d.setMonth(d.getMonth() + offset)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        return `${y}-${m}`
    } else {
        d.setDate(d.getDate() + offset * 7)
        const y = d.getFullYear()
        
        // Calculate ISO Week Number
        const tempDate = new Date(d.valueOf())
        tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7))
        const yearStart = new Date(tempDate.getFullYear(), 0, 1)
        const weekNo = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
        
        const w = String(weekNo).padStart(2, '0')
        return `${y}-W${w}`
    }
}

function formatPeriodLabel(label: string, type: 'weekly' | 'monthly'): string {
    if (!label) return ''
    if (label === 'template') return 'Базовый шаблон'
    if (type === 'monthly') {
        const [y, m] = label.split('-')
        const monthNames = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ]
        const idx = parseInt(m, 10) - 1
        return `${monthNames[idx] || m} ${y}`
    } else {
        const [y, w] = label.split('-W')
        return `${w} неделя ${y}`
    }
}

function balanceCategories(cats: WheelCategory[]): WheelCategory[] {
    if (!Array.isArray(cats)) return []
    return cats.map(c => ({ ...c, value: Number(c.value) || 0 }))
}

function scaleCategoriesToMax(cats: WheelCategory[], targetMax: number): WheelCategory[] {
    if (!Array.isArray(cats) || cats.length === 0) return []
    const currentTotal = cats.reduce((s, c) => s + (Number(c.value) || 0), 0)
    if (currentTotal === 0) return cats.map(c => ({ ...c, value: 0 }))
    if (Math.abs(currentTotal - targetMax) < 0.05) return cats

    const scale = targetMax / currentTotal
    const scaled = cats.map(c => ({
        ...c,
        value: Number(((Number(c.value) || 0) * scale).toFixed(1))
    }))

    const newTotal = scaled.reduce((s, c) => s + c.value, 0)
    const diff = Number((targetMax - newTotal).toFixed(1))
    if (Math.abs(diff) > 0.001 && scaled.length > 0) {
        let maxIndex = 0
        let maxVal = -1
        scaled.forEach((c, idx) => {
            if (c.value > maxVal) {
                maxVal = c.value
                maxIndex = idx
            }
        })
        scaled[maxIndex] = {
            ...scaled[maxIndex],
            value: Number((scaled[maxIndex].value + diff).toFixed(1))
        }
    }
    return scaled
}

// ─────────────────────────── SVG Sunburst Chart ───────────────────────────
function SunburstChartSVG({ categories, periodType }: { categories: WheelCategory[], periodType: 'weekly' | 'monthly' }) {
    const width = 800
    const height = 550
    const cx = width / 2
    const cy = height / 2
    
    // Radii
    const rOuter = 210
    const rMid = 140
    const rInner = 80

    const total = categories.reduce((s, c) => s + (c.value || 0), 0)
    if (total === 0 || categories.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[350px] text-muted-foreground gap-2">
                <AlertCircle className="w-16 h-16 opacity-30" />
                <p className="text-sm">Нет данных для графика</p>
            </div>
        )
    }

    const maxHours = periodType === 'weekly' ? 168 : 720
    const percentageOfMax = Math.min(100, Math.round((total / maxHours) * 100))

    const grouped = new Map<string, { value: number; color: string; items: WheelCategory[] }>()
    categories.filter(c => c.value > 0).forEach(c => {
        const gName = (c.group && c.group.trim() !== '') ? c.group.trim() : 'Прочее'
        if (!grouped.has(gName)) {
            grouped.set(gName, { value: 0, color: c.color, items: [] })
        }
        const g = grouped.get(gName)!
        g.value += c.value
        g.items.push(c)
    })

    const createArc = (startAngle: number, angle: number, radiusInner: number, radiusOuter: number) => {
        const safeAngle = Math.min(angle, Math.PI * 2 - 0.0001)
        const endAngle = startAngle + safeAngle
        
        const x1Inner = cx + radiusInner * Math.cos(startAngle)
        const y1Inner = cy + radiusInner * Math.sin(startAngle)
        const x2Inner = cx + radiusInner * Math.cos(endAngle)
        const y2Inner = cy + radiusInner * Math.sin(endAngle)
        
        const x1Outer = cx + radiusOuter * Math.cos(startAngle)
        const y1Outer = cy + radiusOuter * Math.sin(startAngle)
        const x2Outer = cx + radiusOuter * Math.cos(endAngle)
        const y2Outer = cy + radiusOuter * Math.sin(endAngle)
        
        const largeArc = safeAngle > Math.PI ? 1 : 0
        
        return [
            `M ${x1Inner} ${y1Inner}`,
            `L ${x1Outer} ${y1Outer}`,
            `A ${radiusOuter} ${radiusOuter} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
            `L ${x2Inner} ${y2Inner}`,
            `A ${radiusInner} ${radiusInner} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}`,
            'Z'
        ].join(' ')
    }

    const slices: any[] = []
    let cumAngle = -Math.PI / 2

    grouped.forEach((g, gName) => {
        const gAngle = (g.value / total) * 2 * Math.PI
        const gStart = cumAngle
        const gPercentage = total > 0 ? Math.round((g.value / total) * 100) : 0
        
        slices.push({
            type: 'group', name: gName, value: g.value, percentage: gPercentage, color: g.color,
            d: createArc(gStart, gAngle, rInner, rMid),
            midAngle: gStart + gAngle / 2,
            angle: gAngle,
        })

        let childCumAngle = gStart
        g.items.forEach(child => {
            const cAngle = (child.value / total) * 2 * Math.PI
            const cPercentage = total > 0 ? Math.round((child.value / total) * 100) : 0
            if (cAngle > 0) {
                slices.push({
                    type: 'child', name: child.name, value: child.value, percentage: cPercentage, color: child.color, parent: gName,
                    d: createArc(childCumAngle, cAngle, rMid + 3, rOuter), // Gap between circles
                    midAngle: childCumAngle + cAngle / 2,
                    angle: cAngle,
                })
            }
            childCumAngle += cAngle
        })

        cumAngle += gAngle
    })

    const [hoveredNode, setHoveredNode] = useState<any>(null)

    const labels: any[] = []
    slices.forEach((s) => {
        if (s.type === 'child' && s.angle >= 0.05) {
            const isRight = Math.cos(s.midAngle) >= 0;
            labels.push({ s, isRight, y1: 0, x1: 0 });
        }
    });
    
    const MIN_Y_DIST = 20;
    ['right', 'left'].forEach(side => {
        const sideLabels = labels.filter(l => (side === 'right' ? l.isRight : !l.isRight));
        sideLabels.sort((a, b) => {
            const yA = cy + (rOuter + 15) * Math.sin(a.s.midAngle);
            const yB = cy + (rOuter + 15) * Math.sin(b.s.midAngle);
            return yA - yB;
        });
        
        for (let i = 1; i < sideLabels.length; i++) {
            const prevY = sideLabels[i-1].y1 || (cy + (rOuter + 15) * Math.sin(sideLabels[i-1].s.midAngle));
            let currY = cy + (rOuter + 15) * Math.sin(sideLabels[i].s.midAngle);
            if (currY - prevY < MIN_Y_DIST) {
                currY = prevY + MIN_Y_DIST;
            }
            sideLabels[i].y1 = currY;
        }
        
        sideLabels.forEach(l => {
            if (!l.y1) l.y1 = cy + (rOuter + 15) * Math.sin(l.s.midAngle);
            l.x1 = cx + (rOuter + 15) * Math.cos(l.s.midAngle);
        });
    });

    return (
        <div className="relative w-full flex justify-center">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[800px] drop-shadow-sm font-sans overflow-visible" aria-label="Солнечные лучи">
                
                {/* Center circle progress track (dial) */}
                <circle 
                    cx={cx} 
                    cy={cy} 
                    r={rInner - 8} 
                    className="stroke-muted/30 dark:stroke-muted/10 fill-none" 
                    strokeWidth="3.5" 
                />
                
                {/* Center circle progress value ring */}
                <circle 
                    cx={cx} 
                    cy={cy} 
                    r={rInner - 8} 
                    className="fill-none transition-all duration-700 ease-in-out origin-center" 
                    strokeWidth="4.5" 
                    strokeDasharray={2 * Math.PI * (rInner - 8)}
                    strokeDashoffset={2 * Math.PI * (rInner - 8) - (2 * Math.PI * (rInner - 8) * Math.min(percentageOfMax, 100)) / 100}
                    stroke={total > maxHours ? "#ef4444" : "#6366f1"}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${cx} ${cy})`}
                />

                {slices.map((s, i) => (
                    <path
                        key={i}
                        d={s.d}
                        fill={s.color}
                        stroke="hsl(var(--background))"
                        strokeWidth="2"
                        className="transition-opacity duration-200 cursor-pointer outline-none hover:brightness-110"
                        style={{
                            opacity: hoveredNode 
                                ? (hoveredNode.name === s.name || hoveredNode.name === s.parent || hoveredNode.parent === s.name ? 1 : 0.25)
                                : 1
                        }}
                        onMouseEnter={() => setHoveredNode(s)}
                        onMouseLeave={() => setHoveredNode(null)}
                    />
                ))}

                {/* Callout lines and text labels */}
                {labels.map((l, i) => {
                    const s = l.s;
                    const x0 = cx + rOuter * Math.cos(s.midAngle);
                    const y0 = cy + rOuter * Math.sin(s.midAngle);
                    
                    const x1 = l.x1;
                    const y1 = l.y1;
                    
                    const x2 = l.isRight ? x1 + 15 : x1 - 15;
                    const textX = l.isRight ? x2 + 5 : x2 - 5;
                    const textAnchor = l.isRight ? "start" : "end";
                    
                    return (
                        <g key={`label-${i}`} 
                            className="transition-opacity duration-200"
                            style={{
                                opacity: hoveredNode 
                                    ? (hoveredNode.name === s.name || hoveredNode.name === s.parent || hoveredNode.parent === s.name ? 1 : 0.15)
                                    : 1
                            }}>
                            <polyline 
                                points={`${x0},${y0} ${x1},${y1} ${x2},${y1}`} 
                                fill="none" 
                                stroke={s.color} 
                                strokeWidth="1.5"
                                opacity="0.6"
                            />
                            <text 
                                x={textX} 
                                y={y1} 
                                textAnchor={textAnchor} 
                                dominantBaseline="middle" 
                                className="text-[13px] font-bold"
                            >
                                <tspan fill="hsl(var(--foreground))" opacity="0.8">
                                    {s.name.length > 22 ? s.name.substring(0, 21) + '…' : s.name}
                                </tspan>
                                <tspan fill={s.color} fontWeight="bold" dx="6">
                                    {s.percentage}%
                                </tspan>
                            </text>
                        </g>
                    )
                })}
            </svg>

            {/* Central Info HUD inside Doughnut */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200">
               {hoveredNode ? (
                   <div className="bg-background/95 backdrop-blur-md border border-border shadow-lg rounded-full w-36 h-36 p-4 flex flex-col items-center justify-center animate-in zoom-in-95 duration-200">
                       <span className="text-[8.5px] font-extrabold uppercase tracking-widest text-muted-foreground line-clamp-1 mb-0.5">
                           {hoveredNode.type === 'group' ? 'БЛОК' : hoveredNode.parent}
                       </span>
                       <span className="text-[11.5px] font-extrabold text-foreground text-center line-clamp-2 w-full leading-tight">
                           {hoveredNode.name}
                       </span>
                       <div className="mt-1 text-xl font-black tabular-nums" style={{ color: hoveredNode.color }}>
                           {hoveredNode.percentage}%
                       </div>
                       <div className="text-[10px] font-bold text-muted-foreground mt-0.5">
                           {hoveredNode.value} ч.
                       </div>
                   </div>
               ) : (
                   <div className="text-center bg-card/85 backdrop-blur-md rounded-full w-[130px] h-[130px] flex flex-col items-center justify-center shadow-lg border border-border/60 transition-opacity duration-300">
                      <p className={`text-xl font-extrabold leading-none ${total > maxHours ? "text-red-500 animate-pulse" : "text-foreground"}`}>
                           {Number.isInteger(total) ? total : total.toFixed(1)} ч
                      </p>
                      <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Итого часов</p>
                      <span className={`text-[9.5px] font-bold mt-1 px-1.5 py-0.5 rounded-full ${
                          total > maxHours ? 'bg-red-500/10 text-red-500' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                      }`}>
                          {percentageOfMax}%
                      </span>
                   </div>
               )}
            </div>
        </div>
    )
}

// ─────────────────────────── Main Component ───────────────────────────
interface LifeWheelPageProps {
    participantId?: string
    participantName?: string
}

export function LifeWheelPage({ participantId: fixedParticipantId, participantName }: LifeWheelPageProps = {}) {
    const isParticipantMode = !!fixedParticipantId

    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>(fixedParticipantId || '')
    const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly')
    const [periodOffset, setPeriodOffset] = useState(0)
    const [categories, setCategories] = useState<WheelCategory[]>(() => balanceCategories(DEFAULT_CATEGORIES))
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [history, setHistory] = useState<Array<{ label: string; period_type: string }>>([])
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

    // Filter query for category item highlight search
    const [searchFilter, setSearchFilter] = useState('')

    // Report states
    const [activeTab, setActiveTab] = useState<'editor' | 'report'>('editor')
    const [allEntries, setAllEntries] = useState<Array<{ participant_id: string; period_label: string; period_type: 'weekly' | 'monthly' }>>([])
    const [isReportLoading, setIsReportLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [programFilter, setProgramFilter] = useState('all')

    // Fetch all entries for the report
    useEffect(() => {
        if (activeTab !== 'report') return
        setIsReportLoading(true)
        fetch('/api/life-wheel')
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) {
                    setAllEntries(data)
                }
            })
            .catch(console.error)
            .finally(() => setIsReportLoading(false))
    }, [activeTab])

    const uniquePrograms = Array.from(new Set(participants.map(p => p.program?.name).filter(Boolean)))

    const filteredParticipants = participants.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesProgram = programFilter === 'all' || p.program?.name === programFilter
        return matchesSearch && matchesProgram
    })

    const formatTimes = (count: number): string => {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) {
            return `${count} раз`;
        } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
            return `${count} раза`;
        } else {
            return `${count} раз`;
        }
    }

    const currentLabel = getPeriodLabel(periodType, periodOffset)
    const total = categories.reduce((s, c) => s + (c.value || 0), 0)
    const maxHours = periodType === 'weekly' ? 168 : 720
    const isOverLimit = total > maxHours
    const selectedParticipant = participants.find(p => p.id === selectedParticipantId)

    // Fetch list of participants (admin mode only)
    useEffect(() => {
        if (isParticipantMode) return
        fetch('/api/participants')
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) setParticipants(data.filter((p: Participant) => p.status === 'active'))
            })
            .catch(console.error)
    }, [isParticipantMode])

    // Fetch wheel entry for selected participant + period
    const fetchEntry = useCallback(async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        setIsLoading(true)

        const targetMax = periodType === 'weekly' ? 168 : 720
        let pType = periodType
        let pLabel = currentLabel

        if (pid === TEMPLATE_ID) {
            pType = periodType
            pLabel = periodType === 'weekly' ? 'template_weekly' : 'template'
        }

        try {
            const params = new URLSearchParams({
                participant_id: pid,
                period_type: pType,
                period_label: pLabel,
            })
            const res = await fetch(`/api/life-wheel?${params}`)
            const { data } = await res.json()
            if (data && data.length > 0 && data[0].categories?.length > 0) {
                setCategories(scaleCategoriesToMax(balanceCategories(data[0].categories), targetMax))
            } else {
                if (pid !== TEMPLATE_ID) {
                    try {
                        const tempLabel = periodType === 'weekly' ? 'template_weekly' : 'template'
                        const tempRes = await fetch(`/api/life-wheel?participant_id=${TEMPLATE_ID}&period_type=${pType}&period_label=${tempLabel}`)
                        const tempJson = await tempRes.json()
                        if (tempJson.data && tempJson.data.length > 0 && tempJson.data[0].categories?.length > 0) {
                            setCategories(scaleCategoriesToMax(balanceCategories(tempJson.data[0].categories), targetMax))
                            setIsLoading(false)
                            setHasUnsavedChanges(false)
                            return
                        }
                    } catch (err) { console.error('Failed to fetch template', err) }
                }
                setCategories(scaleCategoriesToMax(balanceCategories(DEFAULT_CATEGORIES), targetMax))
            }
        } catch (e) {
            console.error(e)
            setCategories(scaleCategoriesToMax(balanceCategories(DEFAULT_CATEGORIES), targetMax))
        } finally {
            setIsLoading(false)
            setHasUnsavedChanges(false)
        }
    }, [fixedParticipantId, selectedParticipantId, periodType, currentLabel])

    useEffect(() => {
        fetchEntry()
    }, [fetchEntry])

    // Fetch history (last 6 periods)
    useEffect(() => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        fetch(`/api/life-wheel?participant_id=${pid}`)
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) {
                    setHistory(data.map((e: any) => ({ label: e.period_label, period_type: e.period_type })))
                }
            })
            .catch(console.error)
    }, [fixedParticipantId, selectedParticipantId, saveStatus])

    // Save Logic
    const handleSave = async (silent = false) => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return

        let finalCategories = categories
        const currentDiff = Math.abs(total - maxHours)

        if (!silent && pid !== TEMPLATE_ID && currentDiff > 0.01) {
            if (currentDiff <= 2.0) {
                // Auto-fix tiny rounding discrepancies automatically
                finalCategories = scaleCategoriesToMax(categories, maxHours)
                setCategories(finalCategories)
            } else {
                alert(`Итоговая сумма часов должна быть строго равна ${maxHours} ч. (сейчас: ${Number(total.toFixed(1))} ч.)\nНажмите "⚡ Авто-баланс" под полосой прогресса для моментального выравнивания.`)
                return
            }
        }

        if (!silent) setIsSaving(true)
        if (!silent) setSaveStatus('idle')

        let pType = periodType
        let pLabel = currentLabel
        if (pid === TEMPLATE_ID) {
            pType = periodType
            pLabel = periodType === 'weekly' ? 'template_weekly' : 'template'
        }

        try {
            const res = await fetch('/api/life-wheel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participant_id: pid,
                    period_type: pType,
                    period_label: pLabel,
                    categories: finalCategories,
                }),
            })
            
            let result;
            try {
                result = await res.json()
            } catch (err) {
                throw new Error('Не удалось прочитать ответ сервера')
            }
            
            if (!res.ok || result?.error) {
                throw new Error(result?.error || 'Ошибка сервера при сохранении')
            }
            
            if (!silent) {
                setSaveStatus('success')
                setTimeout(() => setSaveStatus('idle'), 3000)
            }
            setHasUnsavedChanges(false)
        } catch (e: any) {
            if (!silent) {
                setSaveStatus('error')
                let userMsg = e.message || 'Неизвестная ошибка'
                if (userMsg.includes('violates foreign key constraint')) {
                    userMsg = 'Ваш аккаунт персонала не связан с записью участника в базе данных. Пожалуйста, обратитесь к администратору или примените SQL-миграцию.'
                }
                alert('Ошибка сохранения: ' + userMsg)
            }
        } finally {
            if (!silent) setIsSaving(false)
        }
    }

    const updateCategory = (id: string, key: keyof WheelCategory, val: any) => {
        setCategories(prev => prev.map(c => {
            if (c.id === id) {
                const next = { ...c, [key]: val }
                return next
            }
            return c
        }))
        setHasUnsavedChanges(true)
    }

    const addCategory = () => {
        const id = String(Date.now())
        const color = PALETTE[categories.length % PALETTE.length]
        const group = categories[categories.length - 1]?.group || ''
        setCategories(prev => [...prev, { id, name: 'Новая категория', value: 0, color, group }])
        setHasUnsavedChanges(true)
    }

    const removeCategory = (id: string, name: string) => {
        if (!confirm(`Удалить категорию "${name}"?`)) return
        setCategories(prev => prev.filter(c => c.id !== id))
        setHasUnsavedChanges(true)
    }

    const resetToDefault = () => {
        if (!confirm('Вы уверены, что хотите сбросить структуру категорий к стандартной? Все ваши изменения структуры сотрутся.')) return
        setCategories(balanceCategories(DEFAULT_CATEGORIES))
        setHasUnsavedChanges(true)
    }

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 min-h-full bg-background/50">
            {/* Header Title */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3.5">
                <div>
                    <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                        <span className="text-2xl sm:text-4xl animate-pulse">🎯</span>
                        Колесо внимания
                        {isParticipantMode && participantName && (
                            <Badge variant="outline" className="ml-1.5 text-xs font-bold py-0.5 px-2 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                                {participantName}
                            </Badge>
                        )}
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">Распределение времени по категориям жизни и сферам внимания</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
                    {activeTab === 'editor' && saveStatus === 'success' && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg animate-in fade-in zoom-in duration-300 font-semibold w-full sm:w-auto justify-center">
                            <CheckCircle2 className="w-4 h-4" /> Изменения сохранены!
                        </span>
                    )}
                    {activeTab === 'editor' && saveStatus === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg animate-in fade-in zoom-in duration-300 font-semibold w-full sm:w-auto justify-center">
                            <AlertCircle className="w-4 h-4" /> Ошибка сохранения
                        </span>
                    )}

                    {activeTab === 'editor' && (
                        <Button
                            onClick={() => handleSave(false)}
                            disabled={isSaving || !selectedParticipantId}
                            size="default"
                            className="gap-2 font-bold bg-indigo-600 hover:bg-indigo-500 text-xs shadow-md px-5 py-2.5 transition-all active:scale-95 text-white w-full sm:w-auto justify-center touch-manipulation"
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
                        Колеса участников
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
                <div className="space-y-4 sm:space-y-5">
                    {/* Controls: Participant + Period */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
                        {/* Participant selector (admin only) */}
                        {!isParticipantMode ? (
                            <div className="sm:col-span-2 md:col-span-4 bg-card border border-border p-3 rounded-xl shadow-sm space-y-1.5">
                                <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Участник</label>
                                <select
                                    value={selectedParticipantId}
                                    onChange={e => { setSelectedParticipantId(e.target.value); setPeriodOffset(0) }}
                                    className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold touch-manipulation"
                                >
                                    <option value="">— Выберите участника —</option>
                                    <option value={TEMPLATE_ID}>⚙️ Базовый шаблон (для всех)</option>
                                    {participants.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        ) : null}

                        {/* Period type */}
                        {selectedParticipantId && selectedParticipantId !== TEMPLATE_ID && (
                            <div className="sm:col-span-1 md:col-span-3 bg-card border border-border p-3 rounded-xl shadow-sm space-y-1.5">
                                <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Масштаб периода</label>
                                <div className="flex rounded-lg border border-border overflow-hidden p-0.5 bg-background">
                                    {(['monthly', 'weekly'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => { setPeriodType(t); setPeriodOffset(0) }}
                                            className={`flex-1 py-1 text-xs font-bold rounded-md transition-all touch-manipulation ${periodType === t
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                                }`}
                                        >
                                            {t === 'monthly' ? 'Месяц' : 'Неделя'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Period navigation */}
                        {selectedParticipantId && selectedParticipantId !== TEMPLATE_ID && (
                            <div className="sm:col-span-1 md:col-span-3 bg-card border border-border p-3 rounded-xl shadow-sm space-y-1.5">
                                <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Текущий период</label>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setPeriodOffset(o => o - 1)}
                                        className="p-1.5 border border-border rounded-lg hover:bg-muted/50 transition-colors touch-manipulation"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <div className="flex-1 text-center min-w-0">
                                        <p className="text-xs font-bold text-foreground truncate capitalize">
                                            {formatPeriodLabel(currentLabel, periodType)}
                                        </p>
                                        <p className="text-[9px] text-muted-foreground font-semibold leading-none mt-0.5">
                                            {periodOffset === 0 ? (
                                                <span className="text-indigo-600 dark:text-indigo-400">текущий период</span>
                                            ) : (
                                                <span>{Math.abs(periodOffset)} {periodType === 'monthly' ? 'мес.' : 'нед.'} {periodOffset < 0 ? 'назад' : 'вперёд'}</span>
                                            )}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setPeriodOffset(o => o + 1)}
                                        className="p-1.5 border border-border rounded-lg hover:bg-muted/50 transition-colors touch-manipulation"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Search Highlighter */}
                        {selectedParticipantId && (
                            <div className="md:col-span-2 bg-card border border-border p-2 rounded-xl shadow-sm flex items-center h-16">
                                <div className="relative w-full">
                                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground/60" />
                                    <Input
                                        placeholder="Поиск..."
                                        value={searchFilter}
                                        onChange={e => setSearchFilter(e.target.value)}
                                        className="pl-8.5 h-8 text-xs border-border bg-background focus-visible:ring-indigo-500/30 rounded-lg"
                                    />
                                    {searchFilter && (
                                        <button 
                                            onClick={() => setSearchFilter('')}
                                            className="absolute right-2.5 top-2 text-muted-foreground/60 hover:text-foreground text-xs"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {!selectedParticipantId && !isParticipantMode ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground bg-card border border-dashed border-border rounded-2xl shadow-sm">
                            <div className="p-4 bg-indigo-500/5 rounded-full border border-indigo-500/10 text-indigo-500">
                                <PieChart className="w-12 h-12" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">Выберите участника</h3>
                            <p className="text-xs text-center max-w-sm text-muted-foreground mt-0.5 leading-relaxed">
                                Выберите студента в выпадающем списке, чтобы открыть и заполнить его колесо внимания.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            
                            {/* Editor List Side */}
                            <Card className="p-4 sm:p-5 space-y-4 border-border bg-card/65 backdrop-blur-md rounded-2xl">
                                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                                    <div>
                                        <h2 className="font-extrabold text-sm text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <span>Показатели времени</span>
                                            <Badge variant="outline" className="text-[10px] font-bold py-0 px-2 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                                                Всего: {categories.length}
                                            </Badge>
                                        </h2>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">Укажите точное количество часов для каждой сферы</p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                                        <button
                                            onClick={resetToDefault}
                                            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                            title="Сбросить к стандартным"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                        </button>
                                        <Button size="sm" variant="outline" onClick={addCategory} className="gap-1 text-[10px] font-bold h-8 border-indigo-600/30 text-indigo-600 dark:text-indigo-400">
                                            <Plus className="w-3.5 h-3.5" /> Добавить
                                        </Button>
                                    </div>
                                </div>

                                {/* Total Hour Progress limit */}
                                <div className="space-y-1.5 bg-muted/30 p-3 rounded-xl border border-border/50">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-muted-foreground">Итого распределено часов:</span>
                                        <span className={`font-extrabold ${isOverLimit ? 'text-red-500 animate-pulse' : 'text-foreground'}`}>
                                            {Number.isInteger(total) ? total : total.toFixed(1)} / {maxHours} ч.
                                        </span>
                                    </div>
                                    <div className="h-2.5 bg-background rounded-full overflow-hidden border border-border/30">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                                isOverLimit ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                                            }`}
                                            style={{ width: `${Math.min((total / maxHours) * 100, 100)}%` }}
                                        />
                                    </div>
                                    {Math.abs(total - maxHours) > 0.05 && (
                                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-[10px] text-amber-500 font-bold">
                                                {total > maxHours 
                                                    ? `⚠️ Превышение на ${(total - maxHours).toFixed(1)} ч`
                                                    : `ℹ️ Осталось распределить ${(maxHours - total).toFixed(1)} ч`}
                                            </p>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setCategories(prev => scaleCategoriesToMax(prev, maxHours))
                                                    setHasUnsavedChanges(true)
                                                }}
                                                className="h-6 text-[10px] px-2 font-extrabold border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/15"
                                            >
                                                ⚡ Авто-баланс до {maxHours} ч
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {/* Category Rows */}
                                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                                    {categories.map((cat, index) => {
                                        const isHighlighted = searchFilter
                                            ? cat.name.toLowerCase().includes(searchFilter.toLowerCase()) || (cat.group || '').toLowerCase().includes(searchFilter.toLowerCase())
                                            : false
                                        const isDimmed = searchFilter && !isHighlighted

                                        return (
                                            <div 
                                                key={cat.id} 
                                                className={`flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-2.5 group p-2 rounded-xl transition-all border-l-3 hover:bg-muted/15 border-border ${
                                                    isDimmed ? 'opacity-35 scale-98' : 'opacity-100'
                                                } ${isHighlighted ? 'ring-2 ring-indigo-500/30' : ''}`}
                                                style={{ borderLeftColor: cat.color }}
                                            >
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span 
                                                        className="text-[9px] font-extrabold text-white w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 select-none shadow-sm"
                                                        style={{ backgroundColor: cat.color }}
                                                    >
                                                        {index + 1}
                                                    </span>
                                                    
                                                    {/* Color picker */}
                                                    <input
                                                        type="color"
                                                        value={cat.color}
                                                        onChange={e => updateCategory(cat.id, 'color', e.target.value)}
                                                        className="w-6 h-6 rounded-[5px] border-2 border-border cursor-pointer p-0 bg-transparent"
                                                        title="Изменить цвет"
                                                    />
                                                </div>

                                                {/* Group & Name Split Inputs */}
                                                <div className="flex flex-1 min-w-[160px] -space-x-px">
                                                     <Input
                                                         placeholder="Сфера (Блок)"
                                                         value={cat.group || ''}
                                                         onChange={e => updateCategory(cat.id, 'group', e.target.value)}
                                                         className="w-1/2 h-8 text-[11px] font-bold rounded-r-none focus-visible:z-10 bg-muted/40 border-border placeholder:text-muted-foreground/45"
                                                     />
                                                     <Input
                                                         placeholder="Категория"
                                                         value={cat.name}
                                                         onChange={e => updateCategory(cat.id, 'name', e.target.value)}
                                                         className="w-1/2 h-8 text-[11.5px] font-extrabold rounded-l-none focus-visible:z-10 border-border"
                                                     />
                                                </div>

                                                {/* Value (Hours) */}
                                                <div className="flex items-center gap-1.5 ml-auto sm:ml-0 flex-shrink-0">
                                                    <div className="relative w-[65px]">
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            step="0.1"
                                                            value={cat.value || ''}
                                                            onChange={e => updateCategory(cat.id, 'value', Math.max(0, Number(e.target.value)))}
                                                            className="h-8 text-xs pr-1.5 text-right font-extrabold border-border"
                                                        />
                                                    </div>
                                                    <div className="w-[36px] text-right text-[10.5px] font-extrabold text-muted-foreground">
                                                        {total > 0 ? Math.round((cat.value / total) * 100) : 0}%
                                                    </div>

                                                    {/* Delete button (visible on mobile touch) */}
                                                    <button
                                                        onClick={() => removeCategory(cat.id, cat.name)}
                                                        className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-500 transition-all rounded-lg hover:bg-red-500/5 flex-shrink-0 touch-manipulation"
                                                        title="Удалить категорию"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {categories.length === 0 && (
                                        <div className="py-10 text-center text-muted-foreground">
                                            <p className="text-xs italic">Категории не найдены. Создайте первую!</p>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {/* Chart Display Side */}
                            <div className="space-y-6">
                                <Card className="p-4 sm:p-5 border-border flex flex-col items-center overflow-hidden bg-card/75 backdrop-blur-md rounded-2xl shadow-md">
                                    <h2 className="font-extrabold text-sm text-foreground mb-3 self-start flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4 text-amber-500 animate-spin" style={{ animationDuration: '7s' }} />
                                        Диаграмма баланса времени
                                    </h2>
                                    <div className="w-full max-w-[800px]">
                                        <SunburstChartSVG categories={categories} periodType={periodType} />
                                    </div>
                                </Card>

                                {/* Saved periods history */}
                                <Card className="p-4 sm:p-5 border-border rounded-2xl shadow-sm bg-card/60">
                                    <h3 className="text-xs font-extrabold text-foreground mb-3 uppercase tracking-wider">История сохраненных периодов</h3>
                                    {history.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {history.slice(0, 10).map((h, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        const now = new Date()
                                                        if (h.period_type === 'monthly') {
                                                            const [y, m] = h.label.split('-').map(Number)
                                                            const nowY = now.getFullYear()
                                                            const nowM = now.getMonth() + 1
                                                            const diff = (y - nowY) * 12 + (m - nowM)
                                                            setPeriodType('monthly')
                                                            setPeriodOffset(diff)
                                                        } else {
                                                            const [y, w] = h.label.replace('W', '').split('-').map(Number)
                                                            const nowWeek = Math.ceil((((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)
                                                            const diff = (y - now.getFullYear()) * 52 + (w - nowWeek)
                                                            setPeriodOffset(diff)
                                                        }
                                                    }}
                                                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-all shadow-sm"
                                                >
                                                    {formatPeriodLabel(h.label, h.period_type as any)}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic">История записей за текущий год отсутствует</p>
                                    )}
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Report View (Admin Only) */
                <Card className="p-5 border-border shadow-md space-y-6 bg-card rounded-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
                        <div>
                            <h2 className="text-lg font-extrabold text-foreground">Сводный отчет по заполнению</h2>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Количество сохраненных периодов внимания у каждого участника
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2.5">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
                                <Input
                                    placeholder="Поиск..."
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
                                        <th className="py-3 px-4 text-center w-[180px]">Всего записей</th>
                                        <th className="py-3 px-4">Месяцы/Недели заполнения</th>
                                        <th className="py-3 px-4 text-right w-[100px]">Действие</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60 text-xs">
                                    {filteredParticipants.map(p => {
                                        const pEntries = allEntries.filter(e => e.participant_id === p.id && e.participant_id !== TEMPLATE_ID)
                                        const count = pEntries.length
                                        return (
                                            <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="py-3.5 px-4">
                                                    <div className="font-bold text-foreground">{p.name}</div>
                                                    {p.program?.name && (
                                                        <Badge variant="secondary" className="mt-0.5 text-[9px] px-1.5 py-0 border-none font-medium">
                                                            {p.program.name}
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        count > 0 ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                        {formatTimes(count)}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    {count > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {pEntries.slice(0, 10).map((e, idx) => (
                                                                <Badge
                                                                    key={idx}
                                                                    variant="outline"
                                                                    className="text-[9px] px-1.5 py-0 font-bold bg-indigo-500/5 text-indigo-600 border-indigo-500/20"
                                                                >
                                                                    {formatPeriodLabel(e.period_label, e.period_type)}
                                                                </Badge>
                                                            ))}
                                                            {count > 10 && <span className="text-[10px] text-muted-foreground font-semibold">+{count - 10}</span>}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-muted-foreground italic">Нет сохраненных периодов</span>
                                                    )}
                                                </td>
                                                <td className="py-3.5 px-4 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="gap-1 hover:text-indigo-600 hover:bg-indigo-500/10 text-muted-foreground text-[10.5px] h-7 px-2 font-bold"
                                                        onClick={() => {
                                                            setSelectedParticipantId(p.id)
                                                            setActiveTab('editor')
                                                            if (count > 0) {
                                                                setPeriodType(pEntries[0].period_type)
                                                                // Set offset based on the latest entry label
                                                                const label = pEntries[0].period_label
                                                                const now = new Date()
                                                                if (pEntries[0].period_type === 'monthly') {
                                                                    const [y, m] = label.split('-').map(Number)
                                                                    const nowY = now.getFullYear()
                                                                    const nowM = now.getMonth() + 1
                                                                    const diff = (y - nowY) * 12 + (m - nowM)
                                                                    setPeriodOffset(diff)
                                                                } else {
                                                                    const [y, w] = label.replace('W', '').split('-').map(Number)
                                                                    const nowWeek = Math.ceil((((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)
                                                                    const diff = (y - now.getFullYear()) * 52 + (w - nowWeek)
                                                                    setPeriodOffset(diff)
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        <Eye className="w-3.5 h-3.5" /> Посмотреть
                                                    </Button>
                                                </td>
                                            </tr>
                                        )
                                    })}

                                    {filteredParticipants.length === 0 && (
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

export default LifeWheelPage
