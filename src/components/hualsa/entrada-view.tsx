'use client'
// CACHE-BUST v2026-06-18-v3 — forces new chunk hash after createMany→create fix

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Trash2, Save, CheckCircle, AlertCircle, X, ArrowRightCircle, Clock, Zap, Settings2, ChevronDown, Plus } from 'lucide-react'
import { todayISO, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_FIELDS_ENTRADA, type FieldDef, parseCustomData, serializeCustomData } from '@/lib/config'
import { triggerBackup } from '@/lib/trigger-backup'

interface EntradaViewData {
  registros: Registro[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
}

function useEntradaData() {
  const [data, setData] = useState<EntradaViewData>({ registros: [], clientes: [], catalogo: [] })
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [rRes, cRes, catRes] = await Promise.all([
      fetch('/api/registros?filter=entrada'), fetch('/api/clientes'), fetch('/api/catalogo')
    ])
    setData({ registros: await rRes.json(), clientes: await cRes.json(), catalogo: await catRes.json() })
    setLoading(false)
  }, [])

  return { data, loadData, loading }
}

// ─── ComboInput: text input with dropdown suggestions from catalog ───
function ComboInput({
  value,
  onChange,
  suggestions,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filtered = value
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) { setOpen(false) }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); onChange(filtered[highlight]); setOpen(false); setHighlight(-1) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input value={value} onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1) }} onFocus={() => setOpen(true)} onKeyDown={handleKeyDown} placeholder={placeholder} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-[200px] overflow-auto">
          {filtered.map((s, i) => (
            <button key={s} className={`w-full text-left px-4 py-2.5 text-base transition-colors ${i === highlight ? 'bg-[#005bb5] text-white' : 'hover:bg-gray-50'} ${s.toLowerCase() === value.toLowerCase() ? 'font-bold' : ''}`} onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false) }} onMouseEnter={() => setHighlight(i)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Permission check helpers
const SCREEN_PERMS = ['entrada', 'entrada.pasarRegistros', 'registros', 'clientes', 'catalogo', 'facturas', 'backup'] as const

function parsePerms(permissions: string): string[] {
  if (!permissions || permissions.trim() === '') return []
  try { const p = JSON.parse(permissions); return Array.isArray(p) ? p.filter((x: string) => (SCREEN_PERMS as readonly string[]).includes(x)) : [] } catch { return [] }
}

function canTransfer(role: string, permissions: string): boolean {
  if (role === 'admin' || role === 'superadmin') return true
  const perms = parsePerms(permissions)
  if (perms.length === 0) return false
  return perms.includes('entrada.pasarRegistros')
}

function canSeePrices(role: string): boolean {
  return role === 'admin' || role === 'superadmin'
}

export function EntradaView({ userRole = 'user', userPermissions = '' }: { userRole?: string; userPermissions?: string }) {
  const { data, loadData, loading } = useEntradaData()
  const { config, update } = useConfig()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [showTransferSettings, setShowTransferSettings] = useState(false)
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTransferDateRef = useRef<string>('')

  const fieldDefs = config?.fieldsEntrada || DEFAULT_FIELDS_ENTRADA
  // Force cliente field HIDDEN in Entrada view: it's auto-detected from catalog
  // based on c1+c2 selection. Cliente is only visible in the Registros view.
  const visibleFields = fieldDefs.filter(f => f.visible && f.key !== 'cliente')
  const transferMode = config?.transferMode || 'auto'
  const transferTime = config?.transferTime || '00:00'

  const isVisible = (key: string) => visibleFields.some(f => f.key === key)
  const getField = (key: string) => fieldDefs.find(f => f.key === key)

  const [localTransferMode, setLocalTransferMode] = useState(transferMode)
  const [localTransferTime, setLocalTransferTime] = useState(transferTime)

  useEffect(() => { setLocalTransferMode(transferMode); setLocalTransferTime(transferTime) }, [transferMode, transferTime])

  // Core fields form state
  const [fecha, setFecha] = useState(todayISO())
  const [clienteId, setClienteId] = useState('')
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [cant, setCant] = useState('1')
  const [obs, setObs] = useState('')

  // Custom fields form state
  const [customValues, setCustomValues] = useState<Record<string, string>>({})

  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { loadData() }, [loadData])

  const { clientes } = data

  const clienteVisible = false  // forced hidden in Entrada; auto-detected from catalog
  const userCanTransfer = canTransfer(userRole, userPermissions)
  const userCanSeePrices = canSeePrices(userRole)

  // Auto-transfer timer — only runs if user has transfer permission
  useEffect(() => {
    if (transferMode !== 'auto') return
    if (!userCanTransfer) return
    function checkAutoTransfer() {
      const now = new Date()
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const todayStr = todayISO()
      if (lastTransferDateRef.current === todayStr) return
      if (currentTime === transferTime) { lastTransferDateRef.current = todayStr; handleTransfer() }
    }
    checkAutoTransfer()
    autoTimerRef.current = setInterval(checkAutoTransfer, 30000)
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferMode, transferTime, userCanTransfer])

  // Cascading filters based on catalog + selections
  // C1 options: if client field is visible and a client is selected, filter by client
  // If client field is hidden, show ALL (auto-detect will resolve later)
  const c1Options = [...new Set(
    data.catalogo
      .filter(x => !clienteVisible || !clienteId || !x.clienteId || x.clienteId === clienteId)
      .map(x => x.c1)
  )].sort()

  // C2 options filtered by selected client + C1
  const c2Options = [...new Set(
    data.catalogo
      .filter(x => (!clienteVisible || !clienteId || !x.clienteId || x.clienteId === clienteId) && (!c1 || x.c1 === c1))
      .map(x => x.c2)
  )].sort()

  const allC2Options = [...new Set(data.catalogo.map(x => x.c2))].sort()

  // Auto-detect client from catalog when field is hidden and c1+c2 are selected
  const detectedCliente = useMemo(() => {
    if (clienteVisible || clienteId || !c1 || !c2) return null
    const item = data.catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId)
    if (!item) return null
    const cli = data.clientes.find(c => c.id === item.clienteId)
    return cli ? { id: cli.id, nombre: cli.nombre } : null
  }, [data.catalogo, data.clientes, clienteVisible, clienteId, c1, c2])

  // Auto-price: works with or without client selected
  const autoPrice = useMemo(() => {
    if (!c1 || !c2) return null
    if (clienteId) {
      let item = data.catalogo.find(x => x.clienteId === clienteId && x.c1 === c1 && x.c2 === c2)
      if (!item) item = data.catalogo.find(x => !x.clienteId && x.c1 === c1 && x.c2 === c2)
      if (!item) item = data.catalogo.find(x => x.c1 === c1 && x.c2 === c2)
      return item ? Number(item.final) || 0 : null
    } else {
      let item = data.catalogo.find(x => x.c1 === c1 && x.c2 === c2)
      if (!item) item = data.catalogo.find(x => x.c1.toLowerCase() === c1.toLowerCase() && x.c2.toLowerCase() === c2.toLowerCase())
      return item ? Number(item.final) || 0 : null
    }
  }, [data.catalogo, clienteId, c1, c2])

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  function setCustomValue(key: string, value: string) {
    setCustomValues(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    // If cliente field is visible, it's required
    if (clienteVisible && !clienteId) {
      showStatus('err', 'Selecciona un cliente')
      return
    }
    if (!fecha || !c1 || !c2 || !cant) {
      showStatus('err', 'Completa fecha, conceptos y cantidad')
      return
    }
    // Resolve client: if field is hidden, auto-detect from catalog
    let effectiveClienteId = clienteId
    let effectiveClienteName = ''
    if (effectiveClienteId) {
      const cli = clientes.find(c => c.id === effectiveClienteId)
      effectiveClienteName = cli?.nombre || ''
    } else if (detectedCliente) {
      effectiveClienteId = detectedCliente.id
      effectiveClienteName = detectedCliente.nombre
    }
    const customDataStr = serializeCustomData(customValues)
    const currentPrice = autoPrice || 0
    const body = { fecha, clienteId: effectiveClienteId || null, cliente: effectiveClienteName, c1, c2, cant: Number(cant), obs, customData: customDataStr, precioUnitario: currentPrice }

    if (editingId) {
      const res = await fetch('/api/registros', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showStatus('err', `Error al actualizar: ${err.error || res.statusText}`)
        return
      }
      setEditingId(null)
      showStatus('ok', 'Entrada actualizada ✓')
    } else {
      const res = await fetch('/api/registros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showStatus('err', `Error al guardar: ${err.error || res.statusText}`)
        return
      }
      showStatus('ok', 'Guardado en Registros ✓')
    }
    setC1(''); setC2(''); setCant('1'); setObs(''); setCustomValues({})
    triggerBackup()
    loadData()
  }

  function handleEdit(r: Registro) {
    setEditingId(r.id)
    setFecha(r.fecha); setClienteId(r.clienteId); setC1(r.c1); setC2(r.c2); setCant(String(r.cant)); setObs(r.obs)
    // Load custom data
    const cd = parseCustomData((r as Record<string, unknown>).customData as string || '')
    setCustomValues(cd as Record<string, string>)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar entrada?')) return
    await fetch(`/api/registros?id=${id}`, { method: 'DELETE' })
    showStatus('ok', 'Eliminada')
    triggerBackup()
    loadData()
  }

  function handleCancelEdit() {
    setEditingId(null); setFecha(todayISO()); setClienteId(''); setC1(''); setC2(''); setCant('1'); setObs(''); setCustomValues({})
  }

  async function handleTransfer() {
    if (data.registros.length === 0) return
    setTransferring(true)
    try {
      const res = await fetch('/api/registros/transfer', { method: 'POST' })
      const result = await res.json()
      showStatus('ok', `${result.transferred} entrada(s) pasadas al registro ✓`)
      triggerBackup()
      loadData()
    } catch { showStatus('err', 'Error al transferir') }
    setTransferring(false)
  }

  async function handleSaveTransferSettings() {
    await update({ transferMode: localTransferMode, transferTime: localTransferTime })
    showStatus('ok', 'Ajustes de transferencia guardados ✓')
    setShowTransferSettings(false)
    triggerBackup()
  }

  const activeEntries = data.registros

  // Render a dynamic field input based on FieldDef
  function renderFieldInput(field: FieldDef) {
    if (field.key === 'fecha') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    if (field.key === 'cliente') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2">
            <Select value={clienteId} onValueChange={v => { setClienteId(v); setC1(''); setC2('') }}>
              <SelectTrigger className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 shadow-none"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )
    }
    if (field.key === 'c1') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-visible">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><ComboInput value={c1} onChange={v => { setC1(v); setC2('') }} suggestions={c1Options} placeholder="Escribe o selecciona..." label={field.label} /></div>
        </div>
      )
    }
    if (field.key === 'c2') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-visible">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><ComboInput value={c2} onChange={setC2} suggestions={c2Options.length > 0 ? c2Options : allC2Options} placeholder="Escribe o selecciona..." label={field.label} /></div>
        </div>
      )
    }
    if (field.key === 'cantidad') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><Input type="number" value={cant} onChange={e => setCant(e.target.value)} min="1" className="h-9 text-sm text-center border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    if (field.key === 'observaciones') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional..." className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    // Custom fields
    if (field.isCustom) {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}{field.required ? ' *' : ''}</Label></div>
          <div className="px-3 pb-2">
            {field.type === 'textarea' ? (
              <textarea value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="w-full h-16 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none resize-none" />
            ) : field.type === 'date' ? (
              <Input type="date" value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
            ) : field.type === 'number' ? (
              <Input type="number" step="0.01" value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
            ) : (
              <Input value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
            )}
          </div>
        </div>
      )
    }
    return null
  }

  // Get custom field values from a registro for display
  function getCustomFieldDisplay(r: Registro, field: FieldDef): string {
    if (!field.isCustom) return ''
    const cd = parseCustomData((r as Record<string, unknown>).customData as string || '')
    return String(cd[field.key] || '')
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ─── FIXED HEADER (form) ─── */}
      <div className="flex-shrink-0 space-y-2 pb-2">
        {statusMsg && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {statusMsg.text}
          </div>
        )}

        {editingId && (
          <div className="flex items-center justify-between bg-amber-100 border border-amber-300 rounded-xl px-4 py-2.5">
            <span className="text-sm font-bold text-amber-800">Modo Edición</span>
            <Button onClick={handleCancelEdit} size="sm" variant="outline" className="h-9 rounded-full"><X className="h-4 w-4 mr-1" /> Cancelar</Button>
          </div>
        )}

        {/* Transfer Mode Banner — only for users with transfer permission */}
        {userCanTransfer && (
        <div className={`rounded-xl overflow-hidden border ${transferMode === 'auto' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
          <button onClick={() => setShowTransferSettings(!showTransferSettings)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 shrink-0 text-gray-400" />
              {transferMode === 'auto' ? <span className="text-blue-700"><Clock className="h-4 w-4 inline mr-1" />Auto-transferencia a las <b>{transferTime}</b></span> : <span className="text-amber-700"><Zap className="h-4 w-4 inline mr-1" />Transferencia manual</span>}
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showTransferSettings ? 'rotate-180' : ''}`} />
          </button>
          {showTransferSettings && (
            <div className="px-4 pb-3 pt-1 border-t border-gray-200/50 space-y-3 bg-white/60">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase">Modo de transferencia</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setLocalTransferMode('auto')} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm transition-all ${localTransferMode === 'auto' ? 'border-[#005bb5] bg-blue-50 text-[#005bb5] font-bold' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}><Clock className="h-4 w-4" /> Automático</button>
                  <button onClick={() => setLocalTransferMode('manual')} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm transition-all ${localTransferMode === 'manual' ? 'border-[#2bb24c] bg-green-50 text-[#2bb24c] font-bold' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}><Zap className="h-4 w-4" /> Manual</button>
                </div>
              </div>
              {localTransferMode === 'auto' && <div><Label className="text-xs font-bold text-slate-600 uppercase">Hora</Label><Input type="time" value={localTransferTime} onChange={e => setLocalTransferTime(e.target.value)} className="w-36 text-base font-mono mt-1" /></div>}
              <button onClick={handleSaveTransferSettings} className="w-full h-10 rounded-lg bg-[#005bb5] hover:bg-[#003d7a] text-white text-sm font-bold flex items-center justify-center gap-1.5"><Save className="h-4 w-4" /> GUARDAR AJUSTES</button>
            </div>
          )}
        </div>
        )}

        {/* Dynamic field inputs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {visibleFields.map(field => (
            <div key={field.key}>{renderFieldInput(field)}</div>
          ))}
        </div>

        {/* Auto-price indicator — only for admin/superadmin */}
        {userCanSeePrices && autoPrice !== null && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Precio del catálogo</p>
              <p className="text-xl font-extrabold text-green-700">{autoPrice.toLocaleString('es-ES', { minimumFractionDigits: 2 })} {config?.currency || '€'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-500">Total</p>
              <p className="text-lg font-bold text-green-700">{(autoPrice * (Number(cant) || 1)).toLocaleString('es-ES', { minimumFractionDigits: 2 })} {config?.currency || '€'}</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={loading} className="flex-1 h-12 rounded-xl bg-[#2bb24c] hover:bg-[#23963e] active:scale-[0.98] transition-all text-white text-sm font-bold shadow-md shadow-green-200/50 disabled:opacity-50 flex items-center justify-center gap-2">
            <Save className="h-4 w-4" />{editingId ? 'ACTUALIZAR' : 'GUARDAR'}
          </button>
          {userCanTransfer && transferMode === 'manual' && activeEntries.length > 0 && (
            <button onClick={handleTransfer} disabled={transferring} className="flex-1 h-12 rounded-xl bg-[#005bb5] hover:bg-[#003d7a] active:scale-[0.98] transition-all text-white text-sm font-bold shadow-md shadow-blue-200/50 disabled:opacity-50 flex items-center justify-center gap-2">
              <ArrowRightCircle className="h-4 w-4" />{transferring ? 'Transfiriendo...' : 'PASAR AL REGISTRO'}
            </button>
          )}
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-2.5 shadow-sm text-sm font-bold border">
          <span>Entradas:<b className="text-[#005bb5] ml-1">{activeEntries.length}</b></span>
        </div>
      </div>

      {/* ─── SCROLLABLE ENTRIES ─── */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="space-y-2">
          {activeEntries.map(r => {
            const rCustom = parseCustomData((r as Record<string, unknown>).customData as string || '')
            return (
              <div key={r.id} className={`bg-white rounded-lg border p-3 shadow-sm transition-all ${editingId === r.id ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs text-gray-400">{r.fecha}</span>
                      <span className="text-sm text-[#005bb5] font-semibold truncate">{r.cliente || '—'}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 text-sm text-gray-600">
                      <span className="font-medium">{r.c1}</span>
                      <span className="text-gray-300">·</span>
                      <span>{r.c2}</span>
                      <span className="text-gray-300">·</span>
                      <span className="font-bold text-gray-900">{r.cant}x</span>
                    </div>
                    {r.obs && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.obs}</p>}
                    {visibleFields.filter(f => f.isCustom).map(f => {
                      const val = rCustom[f.key]
                      return val ? <p key={f.key} className="text-xs text-gray-500 mt-0.5 truncate"><span className="font-medium">{f.label}:</span> {String(val)}</p> : null
                    })}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleEdit(r)} className="h-8 w-8 rounded-lg flex items-center justify-center text-indigo-500 hover:bg-indigo-50 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(r.id)} className="h-8 w-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            )
          })}
          {activeEntries.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <div className="text-4xl mb-2">📝</div>
              <p className="text-gray-400 text-sm">Sin entradas activas</p>
              <p className="text-gray-300 text-xs mt-1">Las entradas se transferirán al registro {transferMode === 'auto' ? 'automáticamente' : 'con el botón "Pasar al registro"'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
