'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/hualsa/sidebar'
import { EntradaView } from '@/components/hualsa/entrada-view'
import { RegistrosView } from '@/components/hualsa/registros-view'
import { ClientesView } from '@/components/hualsa/clientes-view'
import { CatalogoView } from '@/components/hualsa/catalogo-view'
import { FacturasView } from '@/components/hualsa/facturas-view'
import { PreFacturaView } from '@/components/hualsa/prefactura-view'
import { BackupView } from '@/components/hualsa/backup-view'
import { ConfiguracionView } from '@/components/hualsa/configuracion-view'
import { AdminView } from '@/components/hualsa/admin-view'
import { PlansView } from '@/components/hualsa/plans-view'
import { ConfigProvider, useConfig } from '@/lib/config'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { canAccessConfig } from '@/lib/permissions'

export type View = 'entrada' | 'registros' | 'clientes' | 'catalogo' | 'prefactura' | 'facturas' | 'backup' | 'config' | 'admin' | 'suscripcion'

// Screen permission keys (including sub-permissions)
const SCREEN_PERMISSIONS = ['entrada', 'entrada.pasarRegistros', 'entrada.grilla', 'registros', 'clientes', 'catalogo', 'prefactura', 'facturas', 'facturas.editarNumero', 'backup', 'configuracion', 'configuracion.empresa', 'configuracion.usuarios', 'configuracion.campos'] as const

// Parse permissions from JSON string to array
function parsePermissions(permissionsStr: string): string[] {
  if (!permissionsStr || permissionsStr.trim() === '') return []
  try {
    const parsed = JSON.parse(permissionsStr)
    if (Array.isArray(parsed)) return parsed.filter((p: string) => (SCREEN_PERMISSIONS as readonly string[]).includes(p))
    return []
  } catch {
    return []
  }
}

// Check if user has permission to access a screen
function hasPermission(userRole: string, userPermissions: string, screenKey: string): boolean {
  // Admin and superadmin always have access
  if (userRole === 'admin' || userRole === 'superadmin') return true

  // For regular users: check permissions
  const perms = parsePermissions(userPermissions)

  // Empty permissions = all screens accessible (backwards compat)
  if (perms.length === 0) return true

  return perms.includes(screenKey)
}

// Check if user has a specific sub-permission (e.g. "entrada.pasarRegistros")
// If permissions array is empty (all access), sub-permission is granted
export function hasSubPermission(userRole: string, userPermissions: string, subKey: string): boolean {
  if (userRole === 'admin' || userRole === 'superadmin') return true
  const perms = parsePermissions(userPermissions)
  if (perms.length === 0) return true
  return perms.includes(subKey)
}

function AppContent() {
  const { user, loading, login, logout, effectiveTenantId, effectiveTenantName, availableTenants, setEffectiveTenantId, refreshUser } = useAuth()
  const [activeView, setActiveView] = useState<View>('entrada')
  const [mobileOpen, setMobileOpen] = useState(false)
  const { config } = useConfig()

  // Update page title dynamically
  useEffect(() => {
    if (config) {
      document.title = `${config.appName} - ${config.companyFullName || 'Gestión'}`
    }
  }, [config])

  // When user logs in, check if the default view is accessible
  // If not, find the first accessible view
  useEffect(() => {
    if (user && !loading) {
      if (!hasPermission(user.role, user.permissions, activeView)) {
        // Find first accessible view
        const viewOrder: View[] = ['entrada', 'registros', 'clientes', 'catalogo', 'prefactura', 'facturas', 'backup']
        const accessible = viewOrder.find(v => hasPermission(user.role, user.permissions, v))
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (accessible) setActiveView(accessible)
      }
    }
  }, [user, loading, activeView])

  // Refrescar la sesión del usuario al recuperar el foco de la pestaña.
  // Así, si un admin cambió los permisos de este usuario, los verá al volver a la app
  // sin tener que cerrar y abrir sesión.
  useEffect(() => {
    if (!user) return
    let lastRefresh = Date.now()
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        // Solo refrescar si ha pasado al menos 30s desde el último refresco
        // para evitar spam de requests
        if (Date.now() - lastRefresh > 30 * 1000) {
          lastRefresh = Date.now()
          refreshUser()
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [user, refreshUser])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7f6]">
        <div className="text-center">
          <img
            src="/bill-by-metodo-logo.png"
            alt="BILL by Metodo"
            style={{ maxWidth: '200px', height: 'auto', objectFit: 'contain' }}
          />
          <div className="mt-4 flex items-center justify-center gap-2 text-gray-400">
            <div className="h-4 w-4 border-2 border-gray-300 border-t-[#005bb5] rounded-full animate-spin" />
            Cargando...
          </div>
        </div>
      </div>
    )
  }

  // Not authenticated: show login
  if (!user) {
    return <InlineLogin onLogin={login} />
  }

  // Build tenant info from auth user
  const tenant = {
    id: user.tenantId,
    name: user.tenantName,
    fullName: '',
    logo: user.tenantLogo,
    address: '',
    city: '',
    province: '',
    cif: '',
  }

  // Build session user for sidebar (with permissions)
  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    permissions: user.permissions || '',
  }

  // Handle navigation with permission check
  function handleNavigate(view: View) {
    // Admin/superadmin can always navigate
    if (user.role === 'admin' || user.role === 'superadmin') {
      setActiveView(view)
      return
    }
    // For regular users (empleado / facturacion), check permissions for screen views
    if (['entrada', 'registros', 'clientes', 'catalogo', 'prefactura', 'facturas', 'backup'].includes(view)) {
      if (hasPermission(user.role, user.permissions, view)) {
        setActiveView(view)
      }
      return
    }
    // Config: visible to users with any configuracion.* permission
    if (view === 'config') {
      if (canAccessConfig(user.role, user.permissions)) {
        setActiveView(view)
      } else {
        // Si el usuario no tiene permiso, intentar refrescar la sesión primero.
        // Quizá un admin le acaba de dar permisos y la sesión está stale.
        refreshUser()
      }
      return
    }
    // admin is superadmin-only — handled by sidebar visibility
    setActiveView(view)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f7f6]">
      <Sidebar
        active={activeView}
        onNavigate={handleNavigate}
        mobileOpen={mobileOpen}
        onMobileToggle={() => setMobileOpen(!mobileOpen)}
        user={sessionUser}
        tenant={tenant}
        onLogout={logout}
        effectiveTenantId={effectiveTenantId}
        effectiveTenantName={effectiveTenantName}
        availableTenants={availableTenants}
        onTenantChange={setEffectiveTenantId}
      />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Table views: manage their own internal scroll */}
        {/* key={effectiveTenantId} forces remount when superadmin switches tenant, ensuring fresh data */}
        {['entrada','registros','clientes','catalogo','prefactura','facturas'].includes(activeView) && (
          <div key={effectiveTenantId} className="p-3 md:p-6 pt-16 md:pt-6 pb-4 flex-1 min-h-0 overflow-hidden">
            {activeView === 'entrada' && hasPermission(user.role, user.permissions, 'entrada') && <div className="h-full flex flex-col"><EntradaView userRole={user.role} userPermissions={user.permissions} /></div>}
            {activeView === 'registros' && hasPermission(user.role, user.permissions, 'registros') && <div className="h-full flex flex-col"><RegistrosView /></div>}
            {activeView === 'clientes' && hasPermission(user.role, user.permissions, 'clientes') && <div className="h-full flex flex-col"><ClientesView /></div>}
            {activeView === 'catalogo' && hasPermission(user.role, user.permissions, 'catalogo') && <div className="h-full flex flex-col"><CatalogoView /></div>}
            {activeView === 'prefactura' && hasPermission(user.role, user.permissions, 'prefactura') && <div className="h-full flex flex-col"><PreFacturaView /></div>}
            {activeView === 'facturas' && hasPermission(user.role, user.permissions, 'facturas') && <div className="h-full flex flex-col"><FacturasView /></div>}
          </div>
        )}
        {/* Scrollable views: config, admin, backup, suscripcion */}
        {['backup','suscripcion','config','admin'].includes(activeView) && (
          <div key={`${activeView}-${effectiveTenantId}`} className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-3 md:p-6 pt-16 md:pt-6 pb-8">
              {activeView === 'backup' && hasPermission(user.role, user.permissions, 'backup') && <BackupView />}
              {activeView === 'suscripcion' && (user.role === 'admin' || user.role === 'superadmin') && <PlansView tenantId={effectiveTenantId || user.tenantId} />}
              {activeView === 'config' && canAccessConfig(user.role, user.permissions) && <ConfiguracionView tenant={tenant} />}
              {activeView === 'admin' && user.role === 'superadmin' && <AdminView />}
              {/* Debug: si activeView es config pero no se renderizó, mostrar mensaje */}
              {activeView === 'config' && !canAccessConfig(user.role, user.permissions) && (
                <div className="p-6 text-center text-amber-700 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="font-semibold mb-2">No tienes permiso para acceder a Configuración.</p>
                  <p className="text-sm text-amber-600">Si acabas de recibir permiso, cierra sesión y vuelve a entrar para que se actualicen tus permisos.</p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* No permission view */}
        {['entrada', 'registros', 'clientes', 'catalogo', 'prefactura', 'facturas', 'backup'].includes(activeView) && !hasPermission(user.role, user.permissions, activeView) && (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="text-4xl">🔒</div>
              <h3 className="text-lg font-bold text-gray-600">Sin acceso</h3>
              <p className="text-sm text-gray-400">No tienes permiso para ver esta pantalla.</p>
              <p className="text-xs text-gray-400">Contacta con tu administrador para solicitar acceso.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <ConfigProvider>
        <AppContent />
      </ConfigProvider>
    </AuthProvider>
  )
}

// ─── Inline Login (shown in the main page when not authenticated) ──
function InlineLogin({ onLogin }: { onLogin: (email: string, password: string) => Promise<string | null> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const err = await onLogin(email, password)
    if (err) {
      setError(err)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#0d2137] to-[#0a1628] px-4">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />
      </div>

      <div className="w-full max-w-md relative">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border-0 overflow-hidden">
          <div className="text-center pb-2 pt-8 px-8">
            <div className="mx-auto mb-4 flex items-center justify-center">
              <img
                src="/bill-by-metodo-logo.png"
                alt="BILL by Metodo"
                style={{ maxWidth: '200px', maxHeight: '80px', height: 'auto', objectFit: 'contain' }}
              />
            </div>
            <div className="mt-2">
              <p className="text-2xl font-extrabold text-gray-800 tracking-wider">BILL</p>
              <p className="text-sm font-semibold tracking-widest">by <span className="text-[#2bb24c]">MÉTODO</span></p>
            </div>
          </div>
          <div className="px-8 pb-8 pt-4">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <span className="text-red-500">⚠</span>
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@bill.es"
                  required
                  className="w-full h-11 text-base px-3 rounded-lg border border-gray-200 focus:border-[#005bb5] focus:ring-2 focus:ring-[#005bb5]/20 outline-none transition-all"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-11 text-base px-3 rounded-lg border border-gray-200 focus:border-[#005bb5] focus:ring-2 focus:ring-[#005bb5]/20 outline-none transition-all"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 text-base font-bold bg-[#005bb5] hover:bg-[#004a94] text-white shadow-md rounded-lg transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Iniciando...
                  </span>
                ) : (
                  'Iniciar Sesión'
                )}
              </button>

              <p className="text-center text-xs text-gray-400 mt-4">
                Acceso exclusivo para usuarios autorizados
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
