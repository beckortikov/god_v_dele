import { describe, expect, it, vi } from 'vitest'
import { poolConfig } from '@/lib/db-postgres'

describe('Postgres pool config', () => {
  it('connects to the looked-up address and checks the certificate against the name', async () => {
    const resolve = vi.fn().mockResolvedValue('77.42.8.140')
    const config = await poolConfig('postgres://gvd_app:p%40ss@db.godvdele.com:6432/godvdele?sslmode=verify-full', resolve)
    expect(resolve).toHaveBeenCalledWith('db.godvdele.com')
    expect(config).toMatchObject({ host: '77.42.8.140', port: 6432, user: 'gvd_app', password: 'p@ss', database: 'godvdele', ssl: { servername: 'db.godvdele.com' } })
    expect(config.connectionString).toBeUndefined()
  })

  it('keeps the TLS choice of the URL', async () => {
    const resolve = async () => '10.0.0.1'
    expect((await poolConfig('postgres://u:p@db.example.com/x', resolve)).ssl).toBe(false)
    expect((await poolConfig('postgres://u:p@db.example.com/x?sslmode=disable', resolve)).ssl).toBe(false)
    expect((await poolConfig('postgres://u:p@db.example.com/x?sslmode=no-verify', resolve)).ssl).toEqual({ servername: 'db.example.com', rejectUnauthorized: false })
  })

  it('leaves addresses and localhost alone', async () => {
    const resolve = vi.fn()
    for (const url of ['postgres://u:p@127.0.0.1:5432/x', 'postgres://u:p@localhost/x', 'postgres://u:p@[::1]:5432/x']) {
      expect((await poolConfig(url, resolve)).connectionString).toBe(url)
    }
    expect(resolve).not.toHaveBeenCalled()
  })
})
