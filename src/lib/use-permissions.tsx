'use client'

import { useAuth } from '@/lib/auth-context'

// All valid permission keys (base + sub-permissions)
const ALL_PERMISSIONS = [
  'entrada', 'entrada.transferir',
  'registros', 'registros.editar',
  'clientes', 'clientes.editar',
  'catalogo', 'catalogo.editar',
  'facturas', 'facturas.generar',
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
  canTransfer: boolean       // entrada.transferir
  canEditRegistros: boolean  // registros.editar
  canEditClientes: boolean   // clientes.editar
  canEditCatalogo: boolean   // catalogo.editar
  canGenerateFacturas: boolean // facturas.generar

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
    canTransfer: has('entrada.transferir'),
    canEditRegistros: has('registros.editar'),
    canEditClientes: has('clientes.editar'),
    canEditCatalogo: has('catalogo.editar'),
    canGenerateFacturas: has('facturas.generar'),
    permissions,
    hasNoSpecificPermissions,
  }
}
