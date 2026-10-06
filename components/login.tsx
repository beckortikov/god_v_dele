'use client'

import React, { useState } from 'react'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/erp/field'

export function LoginPage({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        localStorage.setItem('isAuthenticated', 'true')
        localStorage.setItem('userRole', data.user.role)
        localStorage.setItem('userName', data.user.full_name)
        localStorage.setItem('user', JSON.stringify(data.user))
        onLoginSuccess()
      } else {
        setError(res.status === 401 ? 'Неверный логин или пароль' : data.error || 'Ошибка входа')
        setPassword('')
      }
    } catch {
      setError('Нет связи с сервером. Проверьте интернет и попробуйте снова.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
            ГД
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Год в деле</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Финансы, участники и команда в одном месте</p>
        </div>

        <form onSubmit={handleLogin} className="rounded-2xl border bg-card p-6 shadow-sm">
          {error && (
            <div role="alert" className="mb-5 flex gap-2.5 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <Field label="Логин" htmlFor="login">
              <Input
                id="login"
                autoComplete="username"
                autoFocus
                value={login}
                onChange={e => setLogin(e.target.value)}
                disabled={isLoading}
                className="h-10"
              />
            </Field>

            <Field label="Пароль" htmlFor="password">
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
          </div>

          <Button type="submit" disabled={isLoading || !login || !password} className="mt-6 h-10 w-full">
            {isLoading && <Loader2 className="animate-spin" />}
            {isLoading ? 'Вход…' : 'Войти'}
          </Button>
        </form>
      </div>
    </div>
  )
}
