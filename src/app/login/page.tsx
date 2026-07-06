'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { LogIn, AlertCircle, Loader2, Eye, EyeOff, UserX } from 'lucide-react'

// localStorage keys for "remember me" feature
const LS_KEY = 'bill-remember-creds'

interface SavedCreds {
  email: string
  password: string
  savedAt: number
}

function loadSavedCreds(): SavedCreds | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.email === 'string' && typeof parsed.password === 'string') {
      return parsed
    }
  } catch {}
  return null
}

function saveCreds(email: string, password: string) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ email, password, savedAt: Date.now() }))
  } catch {}
}

function clearSavedCreds() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {}
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false)
  const autoLoginRef = useRef(false)

  // On mount: try to load saved credentials and auto-login
  useEffect(() => {
    if (autoLoginRef.current) return
    autoLoginRef.current = true

    const saved = loadSavedCreds()
    if (saved && saved.email && saved.password) {
      setEmail(saved.email)
      setPassword(saved.password)
      setRemember(true)
      // Auto-submit login silently
      void autoLogin(saved.email, saved.password)
    }
  }, [])

  async function autoLogin(em: string, pw: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, password: pw, remember: true }),
      })
      if (res.ok) {
        window.location.href = '/'
        return
      }
      // If auto-login fails, leave the fields pre-filled but show nothing scary
      // (the user can press the button manually)
    } catch {
      // ignore — leave fields filled
    } finally {
      setLoading(false)
      setAutoLoginAttempted(true)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al iniciar sesión')
        // If credentials are wrong, clear any saved creds so we don't keep retrying bad ones
        if (remember) clearSavedCreds()
        return
      }

      // If "remember" is checked, persist credentials locally for next time
      if (remember) {
        saveCreds(email, password)
      } else {
        clearSavedCreds()
      }

      // Redirect to home on success
      window.location.href = '/'
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  function handleForgetDevice() {
    clearSavedCreds()
    setEmail('')
    setPassword('')
    setRemember(false)
    setError('')
  }

  const hasSavedCreds = typeof window !== 'undefined' && !!localStorage.getItem(LS_KEY)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#0d2137] to-[#0a1628] px-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />
      </div>

      <Card className="w-full max-w-md relative shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-2 pt-8">
          {/* Logo */}
          <div className="mx-auto mb-4 flex items-center justify-center">
            <img
              src="/bill-by-metodo-logo.png"
              alt="BILL by Metodo"
              style={{ maxWidth: '200px', maxHeight: '80px', height: 'auto', objectFit: 'contain' }}
            />
          </div>
          <div className="mt-2">
            <p className="text-2xl font-extrabold text-gray-800 tracking-wider">BILL</p>
            <p className="text-sm font-semibold tracking-widest">by <span className="text-[#2bb24c]">MÉTODO</span></p>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-4">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@bill.es"
                required
                className="h-11 text-base"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-11 text-base pr-11"
                  disabled={loading}
                  autoComplete={remember ? 'current-password' : 'off'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                  disabled={loading}
                />
                <span className="text-sm text-gray-600">Recuérdame en este dispositivo</span>
              </label>
              {hasSavedCreds && (
                <button
                  type="button"
                  onClick={handleForgetDevice}
                  className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                  title="Borra las credenciales guardadas en este navegador"
                  disabled={loading}
                >
                  <UserX className="h-3 w-3" /> Olvidar
                </button>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-base font-bold bg-[#005bb5] hover:bg-[#004a94] text-white shadow-md"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <LogIn className="h-5 w-5 mr-2" />
              )}
              {loading ? 'Iniciando...' : 'Iniciar Sesión'}
            </Button>

            <p className="text-center text-xs text-gray-400 mt-4">
              {remember
                ? 'Sesión de 90 días. No recomendado en equipos compartidos.'
                : 'Sesión de 1 día. Más seguro en equipos compartidos.'}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
