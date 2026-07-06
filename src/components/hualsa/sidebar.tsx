'use client'

import { FileInput, Table2, Users, BookOpen, Receipt, Shield, Menu, X, Settings, LogOut, Crown, CreditCard, Building2, ChevronDown, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/lib/config'
import { useAuth, type TenantOption } from '@/lib/auth-context'
import type { View } from '@/app/page'

interface TenantInfo {
  id: string
  name: string
  fullName: string
  logo: string
  address: string
  city: string
  province: string
  cif: string
}

interface SessionUser {
  id: string
  email: string
  name: string
  role: string    // "superadmin", "admin", "user"
  tenantId: string
  permissions: string  // JSON array string e.g. '["entrada","registros"]'
}

interface SidebarProps {
  active: View
  onNavigate: (view: View) => void
  mobileOpen: boolean
  onMobileToggle: () => void
  user: SessionUser
  tenant: TenantInfo | null
  onLogout: () => void
  effectiveTenantId?: string | null
  effectiveTenantName?: string | null
  availableTenants?: TenantOption[]
  onTenantChange?: (tenantId: string) => void
}

// All available screen permission keys (including sub-permissions)
const SCREEN_PERMISSIONS = ['entrada', 'entrada.pasarRegistros', 'entrada.grilla', 'registros', 'clientes', 'catalogo', 'prefactura', 'facturas', 'facturas.editarNumero', 'backup'] as const

// Parse permissions from JSON string to array
function parsePermissions(permissionsStr: string): string[] {
  if (!permissionsStr || permissionsStr.trim() === '') return []
  try {
    const parsed = JSON.parse(permissionsStr)
    if (Array.isArray(parsed)) return parsed.filter((p: string) => SCREEN_PERMISSIONS.includes(p as any))
    return []
  } catch {
    return []
  }
}

export function Sidebar({ active, onNavigate, mobileOpen, onMobileToggle, user, tenant, onLogout, effectiveTenantId, effectiveTenantName, availableTenants, onTenantChange }: SidebarProps) {
  const { config } = useConfig()

  const isSuperadmin = user?.role === 'superadmin'
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  // Parse user permissions
  const userPermissions = parsePermissions(user?.permissions || '')
  const hasNoPermissions = userPermissions.length === 0 // empty = all accessible (backwards compat)

  const navItems: { key: View; label: string; icon: React.ReactNode; color: string; adminOnly?: boolean; superadminOnly?: boolean; permissionKey?: string }[] = [
    { key: 'entrada', label: config?.sectionEntrada || 'ENTRADA', icon: <FileInput className="h-4 w-4" />, color: 'text-green-400', permissionKey: 'entrada' },
    { key: 'registros', label: config?.sectionRegistros || 'REGISTROS', icon: <Table2 className="h-4 w-4" />, color: 'text-blue-400', permissionKey: 'registros' },
    { key: 'clientes', label: config?.sectionClientes || 'CLIENTES', icon: <Users className="h-4 w-4" />, color: 'text-purple-400', permissionKey: 'clientes' },
    { key: 'catalogo', label: config?.sectionCatalogo || 'CATÁLOGO', icon: <BookOpen className="h-4 w-4" />, color: 'text-amber-400', permissionKey: 'catalogo' },
    { key: 'prefactura', label: config?.sectionPreFactura || 'PRE-FACTURA', icon: <ClipboardList className="h-4 w-4" />, color: 'text-orange-400', permissionKey: 'prefactura' },
    { key: 'facturas', label: config?.sectionFacturas || 'FACTURAS', icon: <Receipt className="h-4 w-4" />, color: 'text-rose-400', permissionKey: 'facturas' },
    { key: 'backup', label: config?.sectionBackup || 'SEGURIDAD', icon: <Shield className="h-4 w-4" />, color: 'text-cyan-400', permissionKey: 'backup' },
    { key: 'suscripcion', label: 'SUSCRIPCIÓN', icon: <CreditCard className="h-4 w-4" />, color: 'text-emerald-400', adminOnly: true, superadminOnly: false },
    { key: 'config', label: 'CONFIGURACIÓN', icon: <Settings className="h-4 w-4" />, color: 'text-gray-400', adminOnly: true },
    { key: 'admin', label: 'ADMIN', icon: <Crown className="h-4 w-4" />, color: 'text-amber-300', superadminOnly: true },
  ]

  // Use tenant logo if available, otherwise fall back to config logo, then default
  const tenantLogo = tenant?.logo
  const configLogo = config?.logo

  const logoSrc = tenantLogo
    ? (tenantLogo.startsWith('data:') ? tenantLogo : `data:image/png;base64,${tenantLogo}`)
    : configLogo
      ? (configLogo.startsWith('data:') ? configLogo : `data:image/png;base64,${configLogo}`)
      : '/bill-by-metodo-logo.png'

  const displayName = tenant?.name || config?.appName || 'BILL by Metodo'

  function getRoleLabel(role: string) {
    switch (role) {
      case 'superadmin': return 'SuperAdmin'
      case 'admin': return 'Admin'
      default: return ''
    }
  }

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="default"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden bg-[#005bb5] hover:bg-[#003d7a] text-white shadow-lg h-11 w-11 rounded-xl"
        onClick={onMobileToggle}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={onMobileToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 h-[100dvh] md:h-screen w-[220px] bg-[#1a1a1a] flex flex-col transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Logo header - fixed */}
        <div className="flex-shrink-0 p-3 bg-white border-b-[3px] border-[#2bb24c] flex items-center justify-center min-h-[70px] md:min-h-[80px]">
          <img
            key={logoSrc}
            src={logoSrc}
            alt={displayName}
            style={{ maxWidth: '180px', maxHeight: '55px', height: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Tenant selector for superadmin */}
        {isSuperadmin && availableTenants && availableTenants.length > 0 && (
          <div className="flex-shrink-0 px-3 py-2 border-b border-gray-700/50">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              <Building2 className="h-3 w-3" /> Empresa activa
            </div>
            <select
              value={effectiveTenantId || user.tenantId}
              onChange={(e) => onTenantChange?.(e.target.value)}
              className="w-full bg-[#2a2a2a] text-white text-xs rounded-lg px-2.5 py-2 border border-gray-600 focus:border-[#005bb5] focus:outline-none cursor-pointer hover:bg-[#333] transition-colors"
            >
              {availableTenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation - scrollable */}
        <nav className="flex-1 flex flex-col overflow-y-auto min-h-0">
          {navItems
            .filter(item => {
              // Superadmin-only items
              if (item.superadminOnly && !isSuperadmin) return false

              // Admin-only items (config, suscripcion)
              if (item.adminOnly && !isAdmin) return false

              // Suscripción: only for admin (not superadmin)
              if (item.key === 'suscripcion' && isSuperadmin) return false

              // Permission-based filtering for regular users
              if (user?.role === 'user' && item.permissionKey) {
                // If permissions array is empty, show all (backwards compat)
                if (hasNoPermissions) return true
                // Otherwise only show if the screen is in their permissions
                return userPermissions.includes(item.permissionKey)
              }

              return true
            })
            .map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key)
                  onMobileToggle()
                }}
                className={`w-full px-4 py-3 md:py-3.5 flex items-center gap-3 text-sm text-left transition-colors ${
                  active === item.key
                    ? `${item.color} bg-white/10 border-l-4 border-[#2bb24c] font-bold`
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border-l-4 border-transparent'
                }`}
              >
                {item.icon}
                {item.label}
                {item.superadminOnly && <Crown className="h-3 w-3 ml-auto text-amber-400" />}
              </button>
            ))}
        </nav>

        {/* User info + Logout - always visible at bottom */}
        <div className="flex-shrink-0 border-t border-gray-700/50">
          <div className="px-4 py-2 text-xs text-gray-500 truncate flex items-center gap-1.5">
            <span className="truncate">{user?.name || user?.email}</span>
            {user?.role && user.role !== 'user' && (
              <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                user.role === 'superadmin' ? 'bg-red-900/40 text-red-400' : 'bg-purple-900/40 text-purple-400'
              }`}>
                {getRoleLabel(user.role)}
              </span>
            )}
          </div>
          <button
            onClick={onLogout}
            className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-left text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>

        {/* Safe area padding for iPhone bottom bar */}
        <div className="flex-shrink-0 p-2 text-center text-[10px] text-gray-600 pb-[env(safe-area-inset-bottom,8px)]">
          {displayName}
        </div>
      </aside>
    </>
  )
}
