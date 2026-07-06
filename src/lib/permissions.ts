// Consolidated permission constants & helpers.
// Single source of truth for screen + sub-permission keys.

export const SCREEN_PERMISSIONS = [
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
  'configuracion',
  'configuracion.empresa',
  'configuracion.usuarios',
  'configuracion.campos',
] as const

export type ScreenPermission = typeof SCREEN_PERMISSIONS[number]

export const SCREEN_OPTIONS: Array<{ key: string; label: string; parent?: string }> = [
  { key: 'entrada', label: 'Entrada' },
  { key: 'entrada.pasarRegistros', label: '  ↳ Pasar a Registros', parent: 'entrada' },
  { key: 'entrada.grilla', label: '  ↳ Entrada Masiva (Grilla)', parent: 'entrada' },
  { key: 'registros', label: 'Registros' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'catalogo', label: 'Catálogo' },
  { key: 'prefactura', label: 'Pre-Factura' },
  { key: 'facturas', label: 'Facturas (confirmadas)' },
  { key: 'facturas.editarNumero', label: '  ↳ Editar Nº de Factura', parent: 'facturas' },
  { key: 'backup', label: 'Seguridad (Backup)' },
  { key: 'configuracion', label: 'Configuración' },
  { key: 'configuracion.empresa', label: '  ↳ Empresa (datos y logo)', parent: 'configuracion' },
  { key: 'configuracion.usuarios', label: '  ↳ Usuarios', parent: 'configuracion' },
  { key: 'configuracion.campos', label: '  ↳ Campos personalizados', parent: 'configuracion' },
]

export function parsePermissions(raw: string | undefined | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function hasPermission(
  userRole: string | undefined | null,
  userPermissions: string | undefined | null,
  screenKey: string,
): boolean {
  if (userRole === 'admin' || userRole === 'superadmin') return true
  const perms = parsePermissions(userPermissions)
  if (perms.length === 0) return true // backwards-compat: empty = all
  return perms.includes(screenKey)
}

export function hasSubPermission(
  userRole: string | undefined | null,
  userPermissions: string | undefined | null,
  subKey: string,
): boolean {
  if (userRole === 'admin' || userRole === 'superadmin') return true
  const perms = parsePermissions(userPermissions)
  if (perms.length === 0) return true
  return perms.includes(subKey)
}

/**
 * Check if user can access the Configuración screen at all.
 * True if: admin/superadmin, OR has 'configuracion', OR has any 'configuracion.*' sub-permission.
 * (Sub-permissions like configuracion.empresa imply access to the screen,
 * but only the granted tabs are shown inside.)
 */
export function canAccessConfig(
  userRole: string | undefined | null,
  userPermissions: string | undefined | null,
): boolean {
  if (userRole === 'admin' || userRole === 'superadmin') return true
  const perms = parsePermissions(userPermissions)
  if (perms.length === 0) return true // backwards-compat
  return (
    perms.includes('configuracion') ||
    perms.includes('configuracion.empresa') ||
    perms.includes('configuracion.usuarios') ||
    perms.includes('configuracion.campos')
  )
}

/**
 * Check if user can see a specific tab within Configuración.
 * - admin/superadmin: all tabs
 * - users with 'configuracion' (full): all tabs
 * - users with only 'configuracion.empresa': only Empresa tab
 * - users with only 'configuracion.usuarios': only Usuarios tab
 * - users with only 'configuracion.campos': only Campos tab
 */
export function canSeeConfigTab(
  userRole: string | undefined | null,
  userPermissions: string | undefined | null,
  tab: 'empresa' | 'usuarios' | 'campos',
): boolean {
  if (userRole === 'admin' || userRole === 'superadmin') return true
  const perms = parsePermissions(userPermissions)
  if (perms.length === 0) return true // backwards-compat
  if (perms.includes('configuracion')) return true // full config = all tabs
  if (tab === 'empresa') return perms.includes('configuracion.empresa')
  if (tab === 'usuarios') return perms.includes('configuracion.usuarios')
  if (tab === 'campos') return perms.includes('configuracion.campos')
  return false
}
