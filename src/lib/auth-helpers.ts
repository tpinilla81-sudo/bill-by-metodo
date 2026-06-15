export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  // Include selected tenant for admin impersonation
  const selectedTenant = localStorage.getItem('selectedTenantId')
  if (selectedTenant && selectedTenant !== '__all__') {
    headers['X-Tenant-Id'] = selectedTenant
  }

  return headers
}

/**
 * Get the effective tenant ID from headers (server-side).
 * Admin can send X-Tenant-Id header to impersonate a specific tenant.
 * Regular users always use their own tenantId from the JWT.
 */
export function getEffectiveTenantId(authUser: { role: string; tenantId: string | null }, req: Request): string | null {
  // Regular users always use their own tenantId
  if (authUser.role !== 'admin') {
    return authUser.tenantId
  }

  // Admin users: check X-Tenant-Id header first
  const headerTenantId = req.headers.get('x-tenant-id')
  if (headerTenantId) {
    return headerTenantId
  }

  // Admin without header: if they have their own tenantId, use it
  // Otherwise null = see all
  return authUser.tenantId
}
