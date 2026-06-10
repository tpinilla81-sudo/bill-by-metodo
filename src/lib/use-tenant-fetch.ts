'use client'

import { useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'

/**
 * Hook that provides fetch wrappers with automatic tenant header injection.
 * ALL requests include the x-tenant-id header so the server can properly
 * scope data to the correct tenant.
 *
 * - For admin/user: sends their own tenantId from session
 * - For superadmin: sends the selected company's tenantId
 *
 * IMPORTANT: tenantFetch is memoized with useCallback so it's stable across
 * re-renders (only changes when effectiveTenantId changes).
 * This prevents infinite re-render loops in consuming components.
 */
export function useTenantFetch() {
  const { effectiveTenantId, user } = useAuth()

  /**
   * Fetch with tenant header. Same API as native fetch but adds x-tenant-id.
   */
  const tenantFetch = useCallback(function tenantFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (effectiveTenantId) {
      const headers = new Headers(options.headers || {})
      headers.set('x-tenant-id', effectiveTenantId)
      options = { ...options, headers }
    }
    return fetch(url, options)
  }, [effectiveTenantId])

  return { tenantFetch, effectiveTenantId }
}
