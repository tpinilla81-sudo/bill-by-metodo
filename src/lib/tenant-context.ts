import { getSessionUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

/**
 * Get the effective tenantId for the current request.
 * - For regular users: uses their session tenantId
 * - For superadmin: reads x-tenant-id header as override (required)
 * Returns null if no valid session.
 */
export async function getTenantId(req?: Request): Promise<string | null> {
  const user = await getSessionUser()
  if (!user) return null

  // Superadmin MUST specify which tenant they're managing via header
  if (user.role === 'superadmin' && req) {
    const headerTenantId = req.headers.get('x-tenant-id')
    if (headerTenantId) return headerTenantId
    // If superadmin doesn't specify a tenant, use their own (Sistema)
    // This prevents accidental data access
    return user.tenantId
  }

  return user.tenantId
}

/**
 * Require a valid tenant context. Returns the tenantId or a 401/400 response.
 * Use this in API routes that must be tenant-scoped.
 */
export async function requireTenantId(req?: Request): Promise<string | NextResponse> {
  const tenantId = await getTenantId(req)
  if (!tenantId) {
    return NextResponse.json({ error: 'No autenticado o sin empresa asignada' }, { status: 401 })
  }
  return tenantId
}

/**
 * Helper: get the session user (for auth checks in API routes)
 */
export async function getAuthUser() {
  return getSessionUser()
}
