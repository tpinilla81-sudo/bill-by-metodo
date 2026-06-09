'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Trash2, Save, CheckCircle, AlertCircle, X, ArrowRightCircle, Clock, Zap, Settings2, ChevronDown, Plus } from 'lucide-react'
import { todayISO, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_FIELDS_ENTRADA, type FieldDef, parseCustomData, serializeCustomData } from '@/lib/config'
import { useTenantFetch } from '@/lib/use-tenant-fetch'

interface EntradaViewData {
  registros: Registro[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
}

function useEntradaData(tenantFetch: (url: string, options?: RequestInit) => Promise<Response>) {
  const [data, setData] = useState<EntradaViewData>({ registros: [], clientes: [], catalogo: [] })
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [rRes, cRes, catRes] = await Promise.all([
      tenantFetch('/api/registros?filter=entrada'), tenantFetch('/api/clientes'), tenantFetch('/api/catalogo')
    ])
    setData({ registros: await rRes.json(), clientes: await cRes.json(), catalogo: await catRes.json() })
    setLoading(false)
  }, [tenantFetch])

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
      <Input value={value} onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1) }} onFocus={() => setOpen(true)} onKeyDown={handleKeyDown} placeholder={placeholder} className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
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

export function EntradaView() {
  const { tenantFetch } = useTenantFetch()
  const { data, loadData, loading } = useEntradaData(tenantFetch)
  const { config, update } = useConfig()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [showTransferSettings, setShowTransferSettings] = useState(false)
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTransferDateRef = useRef<string>('')

  const fieldDefs = config?.fieldsEntrada || DEFAULT_FIELDS_ENTRADA
  const visibleFields = fieldDefs.filter(f => f.visible)
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

  // Auto-transfer timer
  useEffect(() => {
    if (transferMode !== 'auto') return
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
  }, [transferMode, transferTime])

  const { clientes } = data

  const c1Options = [...new Set(data.catalogo.map(x => x.c1))].sort()
  const c2Options = [...new Set(data.catalogo.filter(x => (!c1 || x.c1 === c1) && (!x.clienteId || x.clienteId === clienteId)).map(x => x.c2))].sort()
  const allC2Options = [...new Set(data.catalogo.map(x => x.c2))].sort()

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  function setCustomValue(key: string, value: string) {
    setCustomValues(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    // Validate required core fields
    if (!fecha || !clienteId || !c1 || !c2 || !cant) {
      showStatus('err', 'Completa todos los campos obligatorios')
      return
    }
    const cli = clientes.find(c => c.id === clienteId)
    const customDataStr = serializeCustomData(customValues)
    const body = { fecha, clienteId, cliente: cli?.nombre || '', c1, c2, cant: Number(cant), obs, customData: customDataStr }

    if (editingId) {
      await tenantFetch('/api/registros', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
      setEditingId(null)
      showStatus('ok', 'Entrada actualizada ✓')
    } else {
      await tenantFetch('/api/registros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      showStatus('ok', 'Entrada guardada ✓')
    }
    setC1(''); setC2(''); setCant('1'); setObs(''); setCustomValues({})
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
    await tenantFetch(`/api/registros?id=${id}`, { method: 'DELETE' })
    showStatus('ok', 'Eliminada')
    loadData()
  }

  function handleCancelEdit() {
    setEditingId(null); setFecha(todayISO()); setClienteId(''); setC1(''); setC2(''); setCant('1'); setObs(''); setCustomValues({})
  }

  async function handleTransfer() {
    if (data.registros.length === 0) return
    setTransferring(true)
    try {
      const res = await tenantFetch('/api/registros/transfer', { method: 'POST' })
      const result = await res.json()
      showStatus('ok', `${result.transferred} entrada(s) pasadas al registro ✓`)
      loadData()
    } catch { showStatus('err', 'Error al transferir') }
    setTransferring(false)
  }

  async function handleSaveTransferSettings() {
    await update({ transferMode: localTransferMode, transferTime: localTransferTime })
    showStatus('ok', 'Ajustes de transferencia guardados ✓')
    setShowTransferSettings(false)
  }

  const activeEntries = data.registros

  // Render a dynamic field input based on FieldDef
  function renderFieldInput(field: FieldDef) {
    if (field.key === 'fecha') {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 pt-3 pb-1"><Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-4 pb-3"><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    if (field.key === 'cliente') {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 pt-3 pb-1"><Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-4 pb-3">
            <Select value={clienteId} onValueChange={v => { setClienteId(v); setC2('') }}>
              <SelectTrigger className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 shadow-none"><SelectValue placeholder="Selecciona cliente..." /></SelectTrigger>
              <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id} className="text-base py-3">{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )
    }
    if (field.key === 'c1') {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible">
          <div className="px-4 pt-3 pb-1"><Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-4 pb-3"><ComboInput value={c1} onChange={v => { setC1(v); setC2('') }} suggestions={c1Options} placeholder="Escribe o selecciona..." label={field.label} /></div>
        </div>
      )
    }
    if (field.key === 'c2') {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible">
          <div className="px-4 pt-3 pb-1"><Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-4 pb-3"><ComboInput value={c2} onChange={setC2} suggestions={c2Options.length > 0 ? c2Options : allC2Options} placeholder="Escribe o selecciona..." label={field.label} /></div>
        </div>
      )
    }
    if (field.key === 'cantidad') {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-3 pb-1"><Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-3"><Input type="number" value={cant} onChange={e => setCant(e.target.value)} min="1" className="h-12 text-lg text-center border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    if (field.key === 'observaciones') {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-3 pb-1"><Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-3"><Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional..." className="h-12 text-base border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    // Custom fields
    if (field.isCustom) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 pt-3 pb-1"><Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{field.label}{field.required ? ' *' : ''}</Label></div>
          <div className="px-4 pb-3">
            {field.type === 'textarea' ? (
              <textarea value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="w-full h-20 text-base border-0 bg-transparent p-0 focus:ring-0 focus:outline-none resize-none" />
            ) : field.type === 'date' ? (
              <Input type="date" value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
            ) : field.type === 'number' ? (
              <Input type="number" step="0.01" value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
            ) : (
              <Input value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
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
    <div className="flex flex-col min-h-[calc(100vh-2rem)] md:min-h-0">
      {statusMsg && (
        <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center px-4 py-3 text-sm font-semibold shadow-lg transition-all ${statusMsg.type === 'ok' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-5 w-5 mr-2" /> : <AlertCircle className="h-5 w-5 mr-2" />}
          {statusMsg.text}
        </div>
      )}

      <div className="flex-1 pb-24 md:pb-0">
        <div className="px-3 py-3 space-y-3">
          {editingId && (
            <div className="flex items-center justify-between bg-amber-100 border border-amber-300 rounded-xl px-4 py-2.5">
              <span className="text-sm font-bold text-amber-800">Modo Edición</span>
              <Button onClick={handleCancelEdit} size="sm" variant="outline" className="h-9 rounded-full"><X className="h-4 w-4 mr-1" /> Cancelar</Button>
            </div>
          )}

          {/* Transfer Mode Banner */}
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

          {/* Dynamic field inputs */}
          {visibleFields.map(field => (
            <div key={field.key}>{renderFieldInput(field)}</div>
          ))}

          {/* GUARDAR Button */}
          <button onClick={handleSave} disabled={loading} className="w-full h-14 rounded-2xl bg-[#2bb24c] hover:bg-[#23963e] active:scale-[0.98] transition-all text-white text-lg font-bold shadow-lg shadow-green-200 disabled:opacity-50 flex items-center justify-center gap-2">
            <Save className="h-5 w-5" />{editingId ? 'ACTUALIZAR' : 'GUARDAR'}
          </button>

          {/* PASAR AL REGISTRO Button */}
          {transferMode === 'manual' && activeEntries.length > 0 && (
            <button onClick={handleTransfer} disabled={transferring} className="w-full h-14 rounded-2xl bg-[#005bb5] hover:bg-[#003d7a] active:scale-[0.98] transition-all text-white text-lg font-bold shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2">
              <ArrowRightCircle className="h-5 w-5" />{transferring ? 'Transfiriendo...' : 'PASAR AL REGISTRO'}
            </button>
          )}

          {/* Active Entries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Entradas Activas</h3>
              <span className="text-xs text-gray-300">{activeEntries.length}</span>
            </div>
            <div className="space-y-2">
              {activeEntries.map(r => {
                const rCustom = parseCustomData((r as Record<string, unknown>).customData as string || '')
                return (
                  <div key={r.id} className={`bg-white rounded-xl border p-3.5 shadow-sm transition-all ${editingId === r.id ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-gray-100 active:bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs text-gray-400">{r.fecha}</span>
                          <span className="text-sm text-[#005bb5] font-semibold truncate">{r.cliente}</span>
                        </div>
                        <div className="flex items-baseline gap-1.5 text-sm text-gray-600">
                          <span className="font-medium">{r.c1}</span>
                          <span className="text-gray-300">·</span>
                          <span>{r.c2}</span>
                          <span className="text-gray-300">·</span>
                          <span className="font-bold text-gray-900">{r.cant}x</span>
                        </div>
                        {r.obs && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.obs}</p>}
                        {/* Custom field values */}
                        {visibleFields.filter(f => f.isCustom).map(f => {
                          const val = rCustom[f.key]
                          return val ? <p key={f.key} className="text-xs text-gray-500 mt-0.5 truncate"><span className="font-medium">{f.label}:</span> {String(val)}</p> : null
                        })}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => handleEdit(r)} className="h-10 w-10 rounded-xl flex items-center justify-center text-indigo-500 hover:bg-indigo-50 active:bg-indigo-100 transition-colors"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(r.id)} className="h-10 w-10 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-50 active:bg-red-100 transition-colors"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {activeEntries.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                  <div className="text-4xl mb-2">📝</div>
                  <p className="text-gray-400 text-sm">Sin entradas activas</p>
                  <p className="text-gray-300 text-xs mt-1">Las entradas se transferirán al registro {transferMode === 'auto' ? `automáticamente a las ${transferTime}` : 'con el botón "Pasar al registro"'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
