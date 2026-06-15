'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface User {
  id: string
  email: string
  name: string
  role: string
  permissions: string
  tenantId: string | null
}

interface UserPermissions {
  puedeDarEntradas?: boolean
  puedeFacturar?: boolean
  puedeVerRegistros?: boolean
  puedeGestionarClientes?: boolean
  puedeModificarCampos?: boolean
  puedeConfiguracion?: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  permissions: UserPermissions
  // Admin tenant selector
  selectedTenantId: string | null
  setSelectedTenantId: (id: string | null) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTenantId, setSelectedTenantIdState] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.user) setUser(data.user)
          else localStorage.removeItem('token')
        })
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Load saved tenant selection on mount / user change
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('selectedTenantId')
    if (saved) {
      setSelectedTenantIdState(saved === '__all__' ? null : saved)
    }
  }, [])

  // When user logs out, clear selected tenant
  useEffect(() => {
    if (!user) {
      setSelectedTenantIdState(null)
      localStorage.removeItem('selectedTenantId')
    }
  }, [user])

  const setSelectedTenantId = useCallback((id: string | null) => {
    setSelectedTenantIdState(id)
    localStorage.setItem('selectedTenantId', id || '__all__')
  }, [])

  async function login(email: string, password: string) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('token', data.token)
        setUser(data.user)
        // Clear tenant selection on new login
        setSelectedTenantIdState(null)
        localStorage.removeItem('selectedTenantId')
        return { success: true }
      }
      return { success: false, error: data.error || 'Error de login' }
    } catch {
      return { success: false, error: 'Error de conexión' }
    }
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('selectedTenantId')
    setUser(null)
    setSelectedTenantIdState(null)
  }

  const permissions: UserPermissions = user?.permissions ? JSON.parse(user.permissions) : {}

  // For regular users with a tenantId, their selectedTenantId is always their own tenantId
  // For admin with no tenantId, selectedTenantId comes from the selector
  const effectiveSelectedTenantId = user?.role === 'admin'
    ? selectedTenantId
    : user?.tenantId || null

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, permissions, selectedTenantId: effectiveSelectedTenantId, setSelectedTenantId }}>
      {children}
    </AuthContext.Provider>
  )
}
