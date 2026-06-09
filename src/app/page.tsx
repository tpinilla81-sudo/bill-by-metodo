'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/hualsa/sidebar'
import { EntradaView } from '@/components/hualsa/entrada-view'
import { RegistrosView } from '@/components/hualsa/registros-view'
import { ClientesView } from '@/components/hualsa/clientes-view'
import { CatalogoView } from '@/components/hualsa/catalogo-view'
import { FacturasView } from '@/components/hualsa/facturas-view'
import { BackupView } from '@/components/hualsa/backup-view'
import { ConfiguracionView } from '@/components/hualsa/configuracion-view'
import { AdminView } from '@/components/hualsa/admin-view'
import { ConfigProvider, useConfig } from '@/lib/config'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { TenantFetchProvider } from '@/lib/tenant-fetch-provider'

export type View = 'entrada' | 'registros' | 'clientes' | 'catalogo' | 'facturas' | 'backup' | 'config' | 'admin'

function AppContent() {
  const { user, loading, login, logout, effectiveTenantId } = useAuth()
  const [activeView, setActiveView] = useState<View>('entrada')
  const [mobileOpen, setMobileOpen] = useState(false)
  const { config, reload: reloadConfig } = useConfig()

  // Update page title dynamically
  useEffect(() => {
    if (config) {
      document.title = `${config.appName} - ${config.companyFullName || 'Gestión'}`
    }
  }, [config])

  // When tenant changes, reload config and reset to entrada view
  useEffect(() => {
    if (effectiveTenantId) {
      reloadConfig()
      setActiveView('entrada')
    }
  }, [effectiveTenantId, reloadConfig])

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

  return (
    <div className="flex min-h-screen bg-[#f4f7f6]">
      <Sidebar
        active={activeView}
        onNavigate={setActiveView}
        mobileOpen={mobileOpen}
        onMobileToggle={() => setMobileOpen(!mobileOpen)}
        user={user}
        tenant={tenant}
        onLogout={logout}
      />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="p-3 md:p-6 pt-16 md:pt-6 pb-4">
          {activeView === 'entrada' && <EntradaView key={effectiveTenantId} />}
          {activeView === 'registros' && <RegistrosView key={effectiveTenantId} />}
          {activeView === 'clientes' && <ClientesView key={effectiveTenantId} />}
          {activeView === 'catalogo' && <CatalogoView key={effectiveTenantId} />}
          {activeView === 'facturas' && <FacturasView key={effectiveTenantId} />}
          {activeView === 'backup' && <BackupView key={effectiveTenantId} />}
          {activeView === 'config' && <ConfiguracionView key={effectiveTenantId} tenant={tenant} />}
          {activeView === 'admin' && user.role === 'superadmin' && <AdminView key={effectiveTenantId} />}
        </div>
      </main>
    </div>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <TenantFetchProvider>
        <ConfigProvider>
          <AppContent />
        </ConfigProvider>
      </TenantFetchProvider>
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
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold tracking-wide text-gray-800">BILL</span>
              <span className="text-sm font-medium text-gray-500">by <span className="text-[#2bb24c] font-semibold">Método</span></span>
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
