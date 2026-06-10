'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string         // "superadmin", "admin", "user"
  tenantId: string
  tenantName: string
  tenantLogo: string
  tenantSlug: string
  permissions: string  // JSON array string e.g. '["entrada","registros"]'
}

interface AuthContextType {
  user: AuthUser | null
  effectiveTenantId: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  effectiveTenantId: null,
  loading: true,
  login: async () => 'Not initialized',
  logout: async () => {},
  refreshUser: async () => {},
})

// ─── Global fetch interceptor: auto-adds x-tenant-id header ────
// This patches the global fetch so ALL API calls automatically include
// the tenant context header, without needing to modify every component.
let _currentTenantId: string | null = null

// Only patch in browser environment
let _originalFetch: typeof fetch | null = null

if (typeof window !== 'undefined') {
  _originalFetch = window.fetch.bind(window)

  function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (_currentTenantId && typeof input === 'string' && input.startsWith('/api/')) {
      const headers = new Headers(init?.headers || {})
      // Don't override if already set
      if (!headers.has('x-tenant-id')) {
        headers.set('x-tenant-id', _currentTenantId)
      }
      init = { ...init, headers }
    }
    return _originalFetch!(input, init)
  }

  // Only patch once
  if (!(window as any).__fetchPatched) {
    window.fetch = patchedFetch
    ;(window as any).__fetchPatched = true
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // For superadmin: the tenant they're currently managing
  // For admin/user: always their own tenantId
  const effectiveTenantId = user?.tenantId ?? null

  // Keep the global tenant ID in sync
  useEffect(() => {
    _currentTenantId = effectiveTenantId
  }, [effectiveTenantId])

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    fetchUser().finally(() => setLoading(false))
  }, [fetchUser])

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
        return null // no error
      }
      const data = await res.json()
      return data.error || 'Error al iniciar sesión'
    } catch {
      return 'Error de conexión'
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    await fetchUser()
  }, [fetchUser])

  return (
    <AuthContext.Provider value={{ user, effectiveTenantId, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// Helper hooks
export function useIsSuperadmin(): boolean {
  const { user } = useAuth()
  return user?.role === 'superadmin'
}

export function useIsAdmin(): boolean {
  const { user } = useAuth()
  return user?.role === 'superadmin' || user?.role === 'admin'
}
