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
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => 'Not initialized',
  logout: async () => {},
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

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
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
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
