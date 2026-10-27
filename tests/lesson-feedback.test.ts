import { describe, expect, it } from 'vitest'
import { FeedbackInputError, average, feedbackDue, parseFeedback, reviewLesson } from '@/lib/lesson-feedback'
import type { Lesson } from '@/lib/lessons'

const all = (n: number) => ({ content: n, clarity: n, support: n, useful: n, overall: n })
const lesson = (over: Partial<Lesson> = {}): Lesson => ({ id: 'l1', program_id: 'p', group_id: null, title: 'Финансы', description: null, starts_at: '2026-11-10T10:00:00Z', ends_at: '2026-11-10T12:00:00Z', format: 'online', link: null, location: null, teacher: null, ...over })

describe('parseFeedback', () => {
  it('takes five whole scores from 1 to 10 and trims the wishes', () => {
    expect(parseFeedback({ ...all(8), content: '9', comment: '  больше практики ' })).toEqual({ scores: { ...all(8), content: 9 }, comment: 'больше практики' })
    expect(parseFeedback({ ...all(10), comment: '   ' }).comment).toBeNull()
  })
  it('refuses a missing, fractional or out-of-range score and names the question', () => {
    expect(() => parseFeedback({ ...all(5), clarity: undefined })).toThrow(/Подача/)
    expect(() => parseFeedback({ ...all(5), useful: 0 })).toThrow(/Применимость/)
    expect(() => parseFeedback({ ...all(5), overall: 11 })).toThrow(FeedbackInputError)
    expect(() => parseFeedback({ ...all(5), support: 7.5 })).toThrow(FeedbackInputError)
    expect(() => parseFeedback({ ...all(5), comment: 'я'.repeat(2001) })).toThrow(/2000/)
    expect(() => parseFeedback(null)).toThrow(FeedbackInputError)
  })
})

describe('reviewLesson', () => {
  it('averages per question and overall, and lists the wishes newest first', () => {
    const r = reviewLesson(
      lesson(),
      [
        { ...all(10), comment: 'раньше', created_at: '2026-11-10T13:00:00Z' },
        { ...all(7), content: 8, comment: null, created_at: '2026-11-10T14:00:00Z' },
        { ...all(9), comment: 'позже', created_at: '2026-11-11T09:00:00Z' },
      ],
      5
    )
    expect(r.responded).toBe(3)
    expect(r.eligible).toBe(5)
    expect(r.averages.content).toBe(9)
    expect(r.averages.clarity).toBe(8.7)
    expect(r.overall).toBe(8.7)
    expect(r.comments.map(c => c.text)).toEqual(['позже', 'раньше'])
  })
  it('has no numbers while nobody has answered', () => {
    const r = reviewLesson(lesson(), [], 12)
    expect(r.overall).toBeNull()
    expect(r.averages.content).toBeNull()
    expect(r.comments).toEqual([])
  })
  it('average of nothing is null', () => expect(average([])).toBeNull())
})

describe('feedbackDue', () => {
  const day = 86_400_000
  const now = Date.parse('2026-11-12T12:00:00Z')
  const l = (id: string, endsAgoDays: number) => ({ id, starts_at: new Date(now - endsAgoDays * day - 2 * 3600_000).toISOString(), ends_at: new Date(now - endsAgoDays * day).toISOString() })
  it('asks about ended lessons not yet reviewed, within two weeks, latest first', () => {
    const lessons = [l('old', 20), l('a', 3), l('b', 1), l('done', 2), { id: 'future', starts_at: new Date(now + day).toISOString(), ends_at: new Date(now + day + 3600_000).toISOString() }]
    expect(feedbackDue(lessons, new Set(['done']), now).map(x => x.id)).toEqual(['b', 'a'])
  })
})
