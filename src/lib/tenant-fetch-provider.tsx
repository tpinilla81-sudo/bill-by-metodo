'use client'

import { useEffect, ReactNode } from 'react'
import { useAuth } from '@/lib/auth-context'

/**
 * Provider that intercepts global fetch to automatically inject
 * the x-tenant-id header for superadmin users.
 * This way, all existing components work without modification.
 */
export function TenantFetchProvider({ children }: { children: ReactNode }) {
  const { effectiveTenantId, user } = useAuth()
  const isSuperadmin = user?.role === 'superadmin'

  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      // Only inject for API calls and only if superadmin with a selected tenant
      if (isSuperadmin && effectiveTenantId) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        if (url.startsWith('/api/') || url.includes('/api/')) {
          const headers = new Headers(init?.headers || {})
          headers.set('x-tenant-id', effectiveTenantId)
          init = { ...init, headers }
        }
      }

      return originalFetch.call(this, input, init)
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [effectiveTenantId, isSuperadmin])

  return <>{children}</>
}
