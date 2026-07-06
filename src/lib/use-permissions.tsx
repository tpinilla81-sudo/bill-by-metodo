'use client'

import { useAuth } from '@/lib/auth-context'

// All valid permission keys (base + sub-permissions)
// Must stay in sync with src/lib/permissions.ts SCREEN_PERMISSIONS
const ALL_PERMISSIONS = [
  'entrada',
  'entrada.pasarRegistros',
  'entrada.grilla',
  'registros',
  'clientes',
  'catalogo',
  'prefactura',
  'facturas',
  'facturas.editarNumero',
  'backup',
] as const

// Parse permissions from JSON string to array
function parsePermissions(permissionsStr: string): string[] {
  if (!permissionsStr || permissionsStr.trim() === '') return []
  try {
    const parsed = JSON.parse(permissionsStr)
    if (Array.isArray(parsed)) return parsed.filter((p: string) => (ALL_PERMISSIONS as readonly string[]).includes(p))
    return []
  } catch {
    return []
  }
}

export interface PermissionHelpers {
  // Is the user an admin or superadmin (full access)
  isAdmin: boolean
  isSuperadmin: boolean

  // Check if user has a specific permission
  // Admins always return true
  has: (permission: string) => boolean

  // Check if user has a base page permission (e.g., 'entrada')
  canView: (page: string) => boolean

  // Convenience methods for specific actions
  canTransfer: boolean       // entrada.pasarRegistros
  canEditFacturaNumero: boolean // facturas.editarNumero

  // The parsed permissions array
  permissions: string[]

  // Whether user has no specific permissions set (= full access, backwards compat)
  hasNoSpecificPermissions: boolean
}

export function usePermissions(): PermissionHelpers {
  const { user } = useAuth()

  const isSuperadmin = user?.role === 'superadmin'
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const permissions = parsePermissions(user?.permissions || '')
  const hasNoSpecificPermissions = permissions.length === 0

  function has(permission: string): boolean {
    // Admins always have all permissions
    if (isAdmin) return true
    // No specific permissions = full access (backwards compat)
    if (hasNoSpecificPermissions) return true
    // Check if the permission is granted
    return permissions.includes(permission)
  }

  function canView(page: string): boolean {
    return has(page)
  }

  return {
    isAdmin,
    isSuperadmin,
    has,
    canView,
    canTransfer: has('entrada.pasarRegistros'),
    canEditFacturaNumero: has('facturas.editarNumero'),
    permissions,
    hasNoSpecificPermissions,
  }
}
