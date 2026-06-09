import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Get the effective tenant ID for the current request.
 * For superadmin: accepts an X-Tenant-Id header to override
 * For admin/user: uses their own tenantId from the session
 * Returns null if not authenticated
 */
export async function getEffectiveTenantId(req?: Request): Promise<string | null> {
  const user = await getSessionUser()
  if (!user) return null

  if (user.role === 'superadmin') {
    // Superadmin can override tenant via header
    if (req) {
      const overrideTenantId = req.headers.get('x-tenant-id')
      if (overrideTenantId) {
        // Verify the tenant exists
        const tenant = await db.tenant.findUnique({ where: { id: overrideTenantId } })
        if (tenant) return overrideTenantId
      }
    }
    // Default: return the user's own tenantId (system tenant)
    return user.tenantId
  }

  return user.tenantId
}

/**
 * Require authentication and return the effective tenant ID.
 * Returns { tenantId, user } or { error: Response }
 */
export async function requireAuthWithTenant(req?: Request): Promise<
  | { tenantId: string; user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>> }
  | { error: Response }
> {
  const user = await getSessionUser()
  if (!user) {
    return { error: new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }
  }

  const tenantId = await getEffectiveTenantId(req)
  if (!tenantId) {
    return { error: new Response(JSON.stringify({ error: 'Sin empresa asignada' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) }
  }

  return { tenantId, user }
}
