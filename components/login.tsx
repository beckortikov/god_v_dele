'use client'

import React from "react"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export function LoginPage({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500))

    if (login === 'admin' && password === 'Admin123') {
      localStorage.setItem('isAuthenticated', 'true')
      onLoginSuccess()
    } else {
      setError('Неправильные учетные данные. Используйте login: admin, password: Admin123')
      setPassword('')
    }

    setIsLoading(false)
  }

  return (
    <div className="w-full h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border border-border bg-card/95 backdrop-blur-sm shadow-2xl">
          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">План–Факт</h1>
              <p className="text-sm text-muted-foreground">Финансовая платформа для образовательных проектов</p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <Label htmlFor="login" className="text-foreground text-sm font-medium mb-2 block">
                  Логин
                </Label>
                <Input
                  id="login"
                  type="text"
                  placeholder="Введите логин"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  disabled={isLoading}
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-foreground text-sm font-medium mb-2 block">
                  Пароль
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || !login || !password}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-6"
              >
                {isLoading ? 'Вход...' : 'Войти'}
              </Button>
            </form>

            {/* Demo Credentials */}
            <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-border/50">
              <p className="text-xs text-muted-foreground font-medium mb-2">Демо учетные данные:</p>
              <p className="text-xs text-foreground">Логин: <span className="font-mono">admin</span></p>
              <p className="text-xs text-foreground">Пароль: <span className="font-mono">Admin123</span></p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
