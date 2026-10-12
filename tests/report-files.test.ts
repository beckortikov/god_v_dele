import { describe, expect, it } from 'vitest'
import { ALLOWED_TYPES, MAX_FILES, MAX_FILE_BYTES, decodeName, encodeKey, formatSize, isReportKey, uploadProblem } from '@/lib/report-files'

describe('report file keys', () => {
  it('keeps the key ASCII and brings the Russian name back', () => {
    const key = encodeKey('Отчёт по продажам (финал).pdf', 'application/pdf', 1760000000000)
    expect(key).toMatch(/^1760000000000__[A-Za-z0-9_-]+\.pdf$/)
    expect(/^[\x20-\x7e]+$/.test(key)).toBe(true)
    expect(decodeName(key)).toBe('Отчёт по продажам (финал).pdf')
  })

  it('takes the extension from the checked type, not from what the user typed', () => {
    expect(encodeKey('photo.exe', 'image/png', 1)).toMatch(/\.png$/)
    expect(decodeName(encodeKey('photo.exe', 'image/png', 1))).toBe('photo.png')
  })

  it('clips long names and strips path separators', () => {
    const key = encodeKey('а'.repeat(300) + '.pdf', 'application/pdf', 1)
    expect(decodeName(key).length).toBeLessThanOrEqual(80 + 4)
    const sneaky = encodeKey('../../etc/passwd', 'text/plain', 1)
    expect(isReportKey(sneaky)).toBe(true)
    expect(decodeName(sneaky)).not.toMatch(/[\\/]/)
    expect(decodeName(encodeKey('', 'text/plain', 1))).toBe('file.txt')
  })

  it('sorts by upload time', () => {
    const a = encodeKey('b', 'text/plain', 100)
    const b = encodeKey('a', 'text/plain', 200)
    expect([b, a].sort()).toEqual([a, b])
  })

  it('accepts only keys it produced', () => {
    expect(isReportKey(encodeKey('x', 'text/plain', 5))).toBe(true)
    for (const bad of ['../x', 'a/b', '5__x.txt/..', '', 'x.txt', undefined, 5, '5__x y.txt']) expect(isReportKey(bad)).toBe(false)
  })

  it('shows a foreign key as it is', () => {
    expect(decodeName('weird.bin')).toBe('weird.bin')
  })
})

describe('uploadProblem', () => {
  const ok = { name: 'a.pdf', size: 1000, type: 'application/pdf' }

  it('lets a normal file through', () => {
    expect(uploadProblem(ok, 0)).toBeNull()
    expect(uploadProblem({ ...ok, size: MAX_FILE_BYTES }, MAX_FILES - 1)).toBeNull()
  })

  it('refuses what a report does not need', () => {
    expect(uploadProblem({ ...ok, type: 'application/x-msdownload' }, 0)).toMatch(/тип файла/)
    expect(uploadProblem({ ...ok, type: 'text/html' }, 0)).toMatch(/тип файла/)
    expect(uploadProblem({ ...ok, type: 'image/svg+xml' }, 0)).toMatch(/тип файла/)
    expect(uploadProblem({ ...ok, type: undefined }, 0)).toMatch(/тип файла/)
  })

  it('refuses empty, huge, nameless and too many', () => {
    expect(uploadProblem({ ...ok, size: 0 }, 0)).toMatch(/пустой/)
    expect(uploadProblem({ ...ok, size: 'big' }, 0)).toMatch(/пустой/)
    expect(uploadProblem({ ...ok, size: MAX_FILE_BYTES + 1 }, 0)).toMatch(/больше 10 МБ/)
    expect(uploadProblem({ ...ok, name: '  ' }, 0)).toMatch(/нет имени/)
    expect(uploadProblem(ok, MAX_FILES)).toMatch(/до 5 файлов/)
  })

  it('every allowed type has a plain extension', () => {
    for (const ext of Object.values(ALLOWED_TYPES)) expect(ext).toMatch(/^[a-z0-9]+$/)
  })
})

describe('formatSize', () => {
  it('reads like a person would say it', () => {
    expect(formatSize(500)).toBe('500 Б')
    expect(formatSize(2048)).toBe('2 КБ')
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3,5 МБ')
  })
})
