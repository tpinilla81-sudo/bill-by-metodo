'use client'

import { FileInput, Table2, Users, BookOpen, Receipt, Shield, Menu, X, Settings, LogOut, Crown, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/lib/config'
import { useAuth } from '@/lib/auth-context'
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
}

interface SidebarProps {
  active: View
  onNavigate: (view: View) => void
  mobileOpen: boolean
  onMobileToggle: () => void
  user: SessionUser
  tenant: TenantInfo | null
  onLogout: () => void
}

export function Sidebar({ active, onNavigate, mobileOpen, onMobileToggle, user, tenant, onLogout }: SidebarProps) {
  const { config } = useConfig()
  const { activeTenantId, activeTenantName, activeTenantLogo, tenants, switchTenant, effectiveTenantId } = useAuth()

  const isSuperadmin = user?.role === 'superadmin'

  const navItems: { key: View; label: string; icon: React.ReactNode; color: string; adminOnly?: boolean; superadminOnly?: boolean }[] = [
    { key: 'entrada', label: config?.sectionEntrada || 'ENTRADA', icon: <FileInput className="h-4 w-4" />, color: 'text-green-400' },
    { key: 'registros', label: config?.sectionRegistros || 'REGISTROS', icon: <Table2 className="h-4 w-4" />, color: 'text-blue-400' },
    { key: 'clientes', label: config?.sectionClientes || 'CLIENTES', icon: <Users className="h-4 w-4" />, color: 'text-purple-400' },
    { key: 'catalogo', label: config?.sectionCatalogo || 'CATÁLOGO', icon: <BookOpen className="h-4 w-4" />, color: 'text-amber-400' },
    { key: 'facturas', label: config?.sectionFacturas || 'FACTURAS', icon: <Receipt className="h-4 w-4" />, color: 'text-rose-400' },
    { key: 'backup', label: config?.sectionBackup || 'SEGURIDAD', icon: <Shield className="h-4 w-4" />, color: 'text-cyan-400' },
    { key: 'config', label: 'CONFIGURACIÓN', icon: <Settings className="h-4 w-4" />, color: 'text-gray-400' },
    { key: 'admin', label: 'ADMIN', icon: <Crown className="h-4 w-4" />, color: 'text-amber-300', superadminOnly: true },
  ]

  // Use tenant logo if available, otherwise fall back to config logo, then default
  const tenantLogo = tenant?.logo || activeTenantLogo
  const configLogo = config?.logo

  const logoSrc = tenantLogo
    ? (tenantLogo.startsWith('data:') ? tenantLogo : `data:image/png;base64,${tenantLogo}`)
    : configLogo
      ? (configLogo.startsWith('data:') ? configLogo : `data:image/png;base64,${configLogo}`)
      : '/bill-by-metodo-logo.png'

  const displayName = isSuperadmin ? activeTenantName : (tenant?.name || config?.appName || 'BILL by Metodo')
  const appVersion = config?.appVersion || 'v3.0'

  function getRoleLabel(role: string) {
    switch (role) {
      case 'superadmin': return 'GESTORAPP'
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
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-[220px] bg-[#1a1a1a] flex flex-col transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-3 bg-white border-b-[3px] border-[#2bb24c] flex items-center justify-center min-h-[80px]">
          <img
            key={logoSrc}
            src={logoSrc}
            alt={displayName}
            style={{ maxWidth: '180px', maxHeight: '65px', height: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Tenant selector for GESTORAPP */}
        {isSuperadmin && tenants.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-700/50 bg-[#222]">
            <label className="text-[9px] uppercase font-bold text-gray-500 tracking-wider mb-1 block">Empresa activa</label>
            <div className="relative">
              <select
                value={activeTenantId || ''}
                onChange={(e) => switchTenant(e.target.value)}
                className="w-full bg-[#333] text-white text-xs font-medium rounded-md px-2 py-1.5 pr-6 border border-gray-600 appearance-none cursor-pointer hover:border-[#2bb24c] focus:border-[#2bb24c] focus:outline-none transition-colors"
              >
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        <nav className="flex-1 flex flex-col overflow-y-auto">
          {navItems
            .filter(item => {
              if (item.superadminOnly && !isSuperadmin) return false
              return true
            })
            .map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key)
                  onMobileToggle()
                }}
                className={`w-full px-4 py-3.5 flex items-center gap-3 text-sm text-left transition-colors ${
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

        {/* User info + Logout */}
        <div className="border-t border-gray-700/50">
          <div className="px-4 py-2.5 text-xs text-gray-500 truncate flex items-center gap-1.5">
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

        <div className="p-3 text-center text-xs text-gray-500">
          {displayName} {appVersion}
        </div>
      </aside>
    </>
  )
}
