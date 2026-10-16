import { describe, expect, it } from 'vitest'
import {
  LessonInputError,
  dayTitle,
  fromFormParts,
  groupByDay,
  lessonWhen,
  lessonState,
  lessonsForParticipant,
  localDayKey,
  materialProblem,
  monthGrid,
  monthRange,
  nextLesson,
  parseLesson,
  parseLinkMaterial,
  repeatWeekly,
  safeUrl,
  timeRange,
  toFormParts,
} from '@/lib/lessons'

const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m, d, h, min).toISOString()
const base = { title: 'Финансы бизнеса', starts_at: at(2026, 9, 20, 18), ends_at: at(2026, 9, 20, 20) }

describe('parseLesson', () => {
  it('takes a normal online lesson and trims the text', () => {
    const l = parseLesson({ ...base, title: '  Финансы бизнеса ', description: ' ', link: 'zoom.us/j/123', teacher: 'Анвар Халиков', format: 'online' })
    expect(l).toMatchObject({ title: 'Финансы бизнеса', description: null, format: 'online', link: 'https://zoom.us/j/123', location: null, teacher: 'Анвар Халиков', weeks: 1 })
  })
  it('keeps only the field of its own format', () => {
    expect(parseLesson({ ...base, format: 'offline', link: 'https://zoom.us/j/1', location: ' Душанбе, ул. Рудаки 1 ' })).toMatchObject({ link: null, location: 'Душанбе, ул. Рудаки 1' })
    expect(parseLesson({ ...base, format: 'online', location: 'ул. Рудаки' })).toMatchObject({ location: null })
  })
  it('refuses a missing title, bad or reversed times and absurd lengths', () => {
    expect(() => parseLesson({ ...base, title: '  ' })).toThrow(/Название/)
    expect(() => parseLesson({ ...base, starts_at: 'вчера' })).toThrow(/Начало/)
    expect(() => parseLesson({ ...base, ends_at: base.starts_at })).toThrow(/раньше/)
    expect(() => parseLesson({ ...base, ends_at: at(2026, 9, 21, 20) })).toThrow(/длиннее 12/)
    expect(() => parseLesson(null)).toThrow(LessonInputError)
  })
  it('limits repeats and refuses unsafe links', () => {
    expect(parseLesson({ ...base, weeks: '8' }).weeks).toBe(8)
    expect(() => parseLesson({ ...base, weeks: 0 })).toThrow(/Повторов/)
    expect(() => parseLesson({ ...base, weeks: 53 })).toThrow(/Повторов/)
    expect(() => parseLesson({ ...base, link: 'javascript:alert(1)' })).toThrow(/http/)
  })
})

describe('safeUrl', () => {
  it('adds https and accepts normal addresses', () => {
    expect(safeUrl('drive.google.com/file/d/1')).toBe('https://drive.google.com/file/d/1')
    expect(safeUrl(' http://example.com/a b ')).toBe('http://example.com/a%20b')
  })
  it('refuses other schemes and nonsense', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://x.tj/a', '', '   ', 'http://']) expect(() => safeUrl(bad)).toThrow(LessonInputError)
  })
})

describe('materials', () => {
  const pptx = { name: 'Урок 3.pptx', size: 8_000_000, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
  it('accepts presentations, PDFs and documents', () => {
    expect(materialProblem(pptx, 0)).toBeNull()
    expect(materialProblem({ ...pptx, type: 'application/pdf' }, 29)).toBeNull()
  })
  it('refuses executables, empty, huge files and too many', () => {
    expect(materialProblem({ ...pptx, type: 'application/x-msdownload' }, 0)).toMatch(/тип файла/)
    expect(materialProblem({ ...pptx, type: 'video/mp4' }, 0)).toMatch(/тип файла/)
    expect(materialProblem({ ...pptx, size: 0 }, 0)).toMatch(/пустой/)
    expect(materialProblem({ ...pptx, size: 60 * 1024 * 1024 }, 0)).toMatch(/ссылкой/)
    expect(materialProblem(pptx, 30)).toMatch(/до 30/)
  })
  it('names a link after its site when the title is empty', () => {
    expect(parseLinkMaterial({ url: 'https://www.youtube.com/watch?v=1' })).toEqual({ url: 'https://www.youtube.com/watch?v=1', title: 'youtube.com' })
    expect(parseLinkMaterial({ url: 'drive.google.com/x', title: ' Запись урока ' }).title).toBe('Запись урока')
    expect(() => parseLinkMaterial({ url: 'javascript:1' })).toThrow()
  })
})

describe('repeatWeekly', () => {
  it('makes one lesson per week, the first being the original', () => {
    const r = repeatWeekly(base.starts_at, base.ends_at, 3)
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({ starts_at: base.starts_at, ends_at: base.ends_at })
    expect(Date.parse(r[2].starts_at) - Date.parse(r[0].starts_at)).toBe(14 * 86_400_000)
    expect(Date.parse(r[1].ends_at) - Date.parse(r[1].starts_at)).toBe(2 * 3_600_000)
  })
})

describe('calendar grid', () => {
  it('starts on Monday and covers whole weeks', () => {
    // October 2026 starts on a Thursday and has 31 days
    const weeks = monthGrid(2026, 9)
    expect(weeks.every(w => w.length === 7)).toBe(true)
    expect(weeks[0][0].key).toBe('2026-09-28')
    expect(weeks[0][3]).toMatchObject({ key: '2026-10-01', day: 1, inMonth: true })
    expect(weeks[0][0].inMonth).toBe(false)
    expect(weeks).toHaveLength(5)
    expect(weeks[4][6].key).toBe('2026-11-01')
    expect(weeks.flat().filter(d => d.inMonth)).toHaveLength(31)
  })
  it('uses six rows when the month needs them and handles a Monday start', () => {
    expect(monthGrid(2026, 2)).toHaveLength(6) // March 2026 starts on Sunday: 6 weeks
    expect(monthGrid(2026, 5)[0][0]).toMatchObject({ key: '2026-06-01', inMonth: true }) // June 2026 starts on Monday
    expect(monthGrid(2027, 1)).toHaveLength(4) // Feb 2027: Monday to Sunday, 4 weeks
  })
  it('asks for exactly the days on screen', () => {
    const { from, to } = monthRange(2026, 9)
    expect(localDayKey(from)).toBe('2026-09-28')
    expect(localDayKey(to)).toBe('2026-11-02')
    expect(new Date(to).getHours()).toBe(0)
  })
})

describe('grouping and state', () => {
  const l = (id: string, d: number, h: number, group_id: string | null = null) => ({ id, starts_at: at(2026, 9, d, h), ends_at: at(2026, 9, d, h + 1), group_id })
  it('groups lessons by local day, in time order', () => {
    const map = groupByDay([l('b', 20, 15), l('a', 20, 9), l('c', 21, 9)])
    expect([...map.keys()]).toEqual(['2026-10-20', '2026-10-21'])
    expect(map.get('2026-10-20')!.map(x => x.id)).toEqual(['a', 'b'])
  })
  it('tells upcoming, live and past', () => {
    const lesson = { starts_at: at(2026, 9, 20, 18), ends_at: at(2026, 9, 20, 20) }
    expect(lessonState(lesson, new Date(2026, 9, 20, 17).getTime())).toBe('upcoming')
    expect(lessonState(lesson, new Date(2026, 9, 20, 19).getTime())).toBe('live')
    expect(lessonState(lesson, new Date(2026, 9, 20, 21).getTime())).toBe('past')
  })
  it('finds the next lesson that has not ended, even one in progress', () => {
    const now = new Date(2026, 9, 20, 19).getTime()
    expect(nextLesson([l('past', 19, 10), l('live', 20, 18), l('later', 22, 10)], now)?.id).toBe('live')
    expect(nextLesson([l('past', 19, 10)], now)).toBeNull()
  })
  it('shows a participant the program-wide lessons and their own group\'s', () => {
    const all = [l('p', 20, 9), l('a', 21, 9, 'ga'), l('b', 22, 9, 'gb')]
    expect(lessonsForParticipant(all, 'ga').map(x => x.id)).toEqual(['p', 'a'])
    expect(lessonsForParticipant(all, null).map(x => x.id)).toEqual(['p'])
  })
  it('writes the time range in local time', () => {
    expect(timeRange({ starts_at: at(2026, 9, 20, 9, 5), ends_at: at(2026, 9, 20, 10, 30) })).toBe('09:05–10:30')
  })
})

describe('words and form parts', () => {
  it('writes a day and a lesson in Russian', () => {
    const now = new Date(2026, 9, 16)
    expect(dayTitle('2026-10-20', now)).toBe('Вторник, 20 октября')
    expect(dayTitle('2027-01-05', now)).toBe('Вторник, 5 января 2027')
    expect(lessonWhen({ starts_at: at(2026, 9, 20, 18), ends_at: at(2026, 9, 20, 20) }, now)).toBe('20 октября, 18:00–20:00')
  })
  it('round-trips a date and time through the form', () => {
    const iso = fromFormParts('2026-10-20', '18:30')
    expect(toFormParts(iso)).toEqual({ date: '2026-10-20', time: '18:30' })
    expect(() => fromFormParts('', '18:30')).toThrow(LessonInputError)
    expect(() => fromFormParts('2026-10-20', '')).toThrow(LessonInputError)
    expect(() => fromFormParts('2026-13-45', '18:30')).toThrow(LessonInputError)
  })
})
