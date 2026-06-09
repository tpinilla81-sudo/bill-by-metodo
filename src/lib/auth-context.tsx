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

interface TenantOption {
  id: string
  name: string
  slug: string
  logo: string
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  // Tenant switching for GESTORAPP
  activeTenantId: string | null
  activeTenantName: string
  activeTenantLogo: string
  tenants: TenantOption[]
  switchTenant: (tenantId: string) => void
  effectiveTenantId: string | null  // The tenantId to use for data operations
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => 'Not initialized',
  logout: async () => {},
  refreshUser: async () => {},
  activeTenantId: null,
  activeTenantName: '',
  activeTenantLogo: '',
  tenants: [],
  switchTenant: () => {},
  effectiveTenantId: null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null)
  const [activeTenantName, setActiveTenantName] = useState('')
  const [activeTenantLogo, setActiveTenantLogo] = useState('')
  const [tenants, setTenants] = useState<TenantOption[]>([])

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

  // When user changes, set up tenant context
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!user) {
      setActiveTenantId(null)
      setActiveTenantName('')
      setActiveTenantLogo('')
      setTenants([])
      return
    }

    if (user.role === 'superadmin') {
      // Load all tenants for the selector
      fetch('/api/tenants')
        .then(res => res.ok ? res.json() : [])
        .then((data: TenantOption[]) => {
          const filtered = data.filter((t: TenantOption) => t.slug !== 'sistema')
          setTenants(filtered)
          // Restore last selected tenant from localStorage, or pick first available
          const saved = typeof window !== 'undefined' ? localStorage.getItem('bill-active-tenant') : null
          if (saved && filtered.some((t: TenantOption) => t.id === saved)) {
            setActiveTenantId(saved)
            const found = filtered.find((t: TenantOption) => t.id === saved)
            if (found) {
              setActiveTenantName(found.name)
              setActiveTenantLogo(found.logo)
            }
          } else if (filtered.length > 0) {
            setActiveTenantId(filtered[0].id)
            setActiveTenantName(filtered[0].name)
            setActiveTenantLogo(filtered[0].logo)
            if (typeof window !== 'undefined') {
              localStorage.setItem('bill-active-tenant', filtered[0].id)
            }
          }
        })
        .catch(() => setTenants([]))
    } else {
      // Regular admin/user: their tenant is fixed
      setActiveTenantId(user.tenantId)
      setActiveTenantName(user.tenantName)
      setActiveTenantLogo(user.tenantLogo)
    }
  }, [user])

  const switchTenant = useCallback((tenantId: string) => {
    const found = tenants.find(t => t.id === tenantId)
    if (found) {
      setActiveTenantId(found.id)
      setActiveTenantName(found.name)
      setActiveTenantLogo(found.logo)
      localStorage.setItem('bill-active-tenant', found.id)
    }
  }, [tenants])

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
    setActiveTenantId(null)
    localStorage.removeItem('bill-active-tenant')
  }, [])

  const refreshUser = useCallback(async () => {
    await fetchUser()
  }, [fetchUser])

  // effectiveTenantId: for superadmin it's the selected tenant, for others it's their own tenantId
  const effectiveTenantId = user?.role === 'superadmin' ? activeTenantId : user?.tenantId || null

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, refreshUser,
      activeTenantId, activeTenantName, activeTenantLogo, tenants, switchTenant,
      effectiveTenantId,
    }}>
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
