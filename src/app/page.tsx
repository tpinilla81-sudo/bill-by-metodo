'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/hualsa/sidebar'
import { RegistroView } from '@/components/hualsa/registro-view'
import { ClientesView } from '@/components/hualsa/clientes-view'
import { CatalogoView } from '@/components/hualsa/catalogo-view'
import { FacturasView } from '@/components/hualsa/facturas-view'
import { BackupView } from '@/components/hualsa/backup-view'

type View = 'registro' | 'clientes' | 'catalogo' | 'facturas' | 'backup'

export default function Home() {
  const [activeView, setActiveView] = useState<View>('registro')
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-[#f4f7f6]">
      <Sidebar
        active={activeView}
        onNavigate={setActiveView}
        mobileOpen={mobileOpen}
        onMobileToggle={() => setMobileOpen(!mobileOpen)}
      />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="p-4 md:p-6 pt-14 md:pt-6">
          {activeView === 'registro' && <RegistroView />}
          {activeView === 'clientes' && <ClientesView />}
          {activeView === 'catalogo' && <CatalogoView />}
          {activeView === 'facturas' && <FacturasView />}
          {activeView === 'backup' && <BackupView />}
        </div>
      </main>
    </div>
  )
}
