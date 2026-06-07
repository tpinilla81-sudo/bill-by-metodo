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
import { ConfigProvider, useConfig } from '@/lib/config'

export type View = 'entrada' | 'registros' | 'clientes' | 'catalogo' | 'facturas' | 'backup' | 'config'

function AppContent() {
  const [activeView, setActiveView] = useState<View>('entrada')
  const [mobileOpen, setMobileOpen] = useState(false)
  const { config } = useConfig()

  // Update page title dynamically based on config
  useEffect(() => {
    if (config) {
      document.title = `${config.appName} - ${config.companyFullName || 'Gestión'}`
    }
  }, [config])

  return (
    <div className="flex min-h-screen bg-[#f4f7f6]">
      <Sidebar
        active={activeView}
        onNavigate={setActiveView}
        mobileOpen={mobileOpen}
        onMobileToggle={() => setMobileOpen(!mobileOpen)}
      />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="p-3 md:p-6 pt-16 md:pt-6 pb-4">
          {activeView === 'entrada' && <EntradaView />}
          {activeView === 'registros' && <RegistrosView />}
          {activeView === 'clientes' && <ClientesView />}
          {activeView === 'catalogo' && <CatalogoView />}
          {activeView === 'facturas' && <FacturasView />}
          {activeView === 'backup' && <BackupView />}
          {activeView === 'config' && <ConfiguracionView />}
        </div>
      </main>
    </div>
  )
}

export default function Home() {
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  )
}
