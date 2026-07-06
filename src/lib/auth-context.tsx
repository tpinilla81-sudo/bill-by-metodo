'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

export interface TenantOption {
  id: string
  name: string
  slug: string
}

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
  effectiveTenantName: string | null
  availableTenants: TenantOption[]
  setEffectiveTenantId: (tenantId: string) => void
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  refreshAndGetUser: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  effectiveTenantId: null,
  effectiveTenantName: null,
  availableTenants: [],
  setEffectiveTenantId: () => {},
  loading: true,
  login: async () => 'Not initialized',
  logout: async () => {},
  refreshUser: async () => {},
  refreshAndGetUser: async () => null,
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

// localStorage key for superadmin tenant selection
const SUPERADMIN_TENANT_KEY = 'bill-superadmin-tenant'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [availableTenants, setAvailableTenants] = useState<TenantOption[]>([])

  // For superadmin: the tenant they selected (or their own if not set)
  // For admin/user: always their own tenantId
  const isSuperadmin = user?.role === 'superadmin'
  const effectiveTenantId = isSuperadmin
    ? (selectedTenantId || user?.tenantId || null)
    : (user?.tenantId ?? null)

  // Compute effective tenant name from availableTenants
  const effectiveTenantName = isSuperadmin && effectiveTenantId && availableTenants.length > 0
    ? (availableTenants.find(t => t.id === effectiveTenantId)?.name || 'Sistema')
    : (user?.tenantName || null)

  // Keep the global tenant ID in sync
  useEffect(() => {
    _currentTenantId = effectiveTenantId
  }, [effectiveTenantId])

  // For superadmin: load available tenants and restore saved selection
  useEffect(() => {
    if (isSuperadmin) {
      // Restore saved tenant selection from localStorage
      const saved = typeof window !== 'undefined' ? localStorage.getItem(SUPERADMIN_TENANT_KEY) : null
      if (saved) {
        setSelectedTenantId(saved)
      }
      // Load tenant list
      fetch('/api/tenants')
        .then(res => res.ok ? res.json() : [])
        .then((tenants: TenantOption[]) => {
          // Include Sistema tenant in the list for superadmin
          setAvailableTenants([
            { id: user!.tenantId, name: 'Sistema', slug: 'sistema' },
            ...tenants.filter((t: TenantOption) => t.slug !== 'sistema')
          ])
        })
        .catch(() => {})
    }
  }, [isSuperadmin, user?.tenantId])

  // Function to change the effective tenant (for superadmin)
  const setEffectiveTenantId = useCallback((tenantId: string) => {
    setSelectedTenantId(tenantId)
    if (typeof window !== 'undefined') {
      localStorage.setItem(SUPERADMIN_TENANT_KEY, tenantId)
    }
  }, [])

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

  // Expose a variant that returns the fresh user, so callers can check
  // updated permissions immediately after a save.
  const refreshAndGetUser = useCallback(async (): Promise<AuthUser | null> => {
    await fetchUser()
    // fetchUser is async and setUser is called inside; we need to read
    // the latest from the API directly because setUser is batched.
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        return data.user as AuthUser
      }
    } catch {}
    return null
  }, [])

  return (
    <AuthContext.Provider value={{ user, effectiveTenantId, effectiveTenantName, availableTenants, setEffectiveTenantId, loading, login, logout, refreshUser, refreshAndGetUser }}>
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
