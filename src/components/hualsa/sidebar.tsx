'use client'

import { FileInput, Table2, Users, BookOpen, Receipt, Shield, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Image from 'next/image'

type View = 'entrada' | 'registros' | 'clientes' | 'catalogo' | 'facturas' | 'backup'

const navItems: { key: View; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'entrada', label: 'ENTRADA', icon: <FileInput className="h-4 w-4" />, color: 'text-green-400' },
  { key: 'registros', label: 'REGISTROS', icon: <Table2 className="h-4 w-4" />, color: 'text-blue-400' },
  { key: 'clientes', label: 'CLIENTES', icon: <Users className="h-4 w-4" />, color: 'text-purple-400' },
  { key: 'catalogo', label: 'CATÁLOGO', icon: <BookOpen className="h-4 w-4" />, color: 'text-amber-400' },
  { key: 'facturas', label: 'FACTURAS', icon: <Receipt className="h-4 w-4" />, color: 'text-rose-400' },
  { key: 'backup', label: 'SEGURIDAD', icon: <Shield className="h-4 w-4" />, color: 'text-cyan-400' },
]

interface SidebarProps {
  active: View
  onNavigate: (view: View) => void
  mobileOpen: boolean
  onMobileToggle: () => void
}

export function Sidebar({ active, onNavigate, mobileOpen, onMobileToggle }: SidebarProps) {
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
        <div className="p-4 bg-white border-b-[3px] border-[#2bb24c]">
          <Image
            src="/hualsa-logo.png"
            alt="HUALSA"
            width={180}
            height={50}
            style={{ maxWidth: '100%', height: 'auto' }}
            priority
          />
        </div>
        <nav className="flex-1 flex flex-col">
          {navItems.map((item) => (
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
            </button>
          ))}
        </nav>
        <div className="p-3 text-center text-xs text-gray-500">
          HUALSA PRO v2.0
        </div>
      </aside>
    </>
  )
}
