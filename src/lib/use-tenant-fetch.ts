'use client'

import { useAuth } from '@/lib/auth-context'

/**
 * Hook that provides fetch wrappers with automatic tenant header injection.
 * For superadmin, includes the x-tenant-id header with the selected company.
 * For admin/user, the session cookie already carries the correct tenantId.
 */
export function useTenantFetch() {
  const { effectiveTenantId, user } = useAuth()
  const isSuperadmin = user?.role === 'superadmin'

  /**
   * Fetch with tenant header. Same API as native fetch but adds x-tenant-id for superadmin.
   */
  function tenantFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (isSuperadmin && effectiveTenantId) {
      const headers = new Headers(options.headers || {})
      headers.set('x-tenant-id', effectiveTenantId)
      options = { ...options, headers }
    }
    return fetch(url, options)
  }

  return { tenantFetch, effectiveTenantId }
}
