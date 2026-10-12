import { describe, expect, it, vi } from 'vitest'
import { isMissingColumn, writeWithOptionalColumns } from '@/lib/db-columns'

const missing = { code: 'PGRST204', message: "Could not find the 'employee_id' column of 'expenses' in the schema cache" }

describe('isMissingColumn', () => {
  it('recognises the PostgREST error for that column only', () => {
    expect(isMissingColumn(missing, 'employee_id')).toBe(true)
    expect(isMissingColumn(missing, 'account_id')).toBe(false)
    expect(isMissingColumn({ code: '23505', message: 'duplicate key' }, 'employee_id')).toBe(false)
    expect(isMissingColumn(null, 'employee_id')).toBe(false)
  })
})

describe('writeWithOptionalColumns', () => {
  it('writes once when the column exists', async () => {
    const write = vi.fn(async () => ({ error: null, data: [{ id: 1 }] }))
    const res = await writeWithOptionalColumns({ name: 'Зарплата', employee_id: 'e1' }, ['employee_id'], write)
    expect(write).toHaveBeenCalledTimes(1)
    expect(res.dropped).toEqual([])
    expect(res.error).toBeNull()
  })

  it('retries without the missing column and keeps the rest', async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({ error: missing, data: null })
      .mockResolvedValueOnce({ error: null, data: [{ id: 2 }] })
    const res = await writeWithOptionalColumns({ name: 'Зарплата', amount: 280, employee_id: 'e1' }, ['employee_id'], write)
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls[1][0]).toEqual({ name: 'Зарплата', amount: 280 })
    expect(res.dropped).toEqual(['employee_id'])
    expect(res.error).toBeNull()
  })

  it('does not retry other errors', async () => {
    const write = vi.fn(async () => ({ error: { code: '23503', message: 'violates foreign key' }, data: null }))
    const res = await writeWithOptionalColumns({ name: 'x', employee_id: 'e1' }, ['employee_id'], write)
    expect(write).toHaveBeenCalledTimes(1)
    expect(res.error?.code).toBe('23503')
  })

  it('does not retry when the row has no such field', async () => {
    const write = vi.fn(async () => ({ error: missing, data: null }))
    await writeWithOptionalColumns({ name: 'x' }, ['employee_id'], write)
    expect(write).toHaveBeenCalledTimes(1)
  })
})
