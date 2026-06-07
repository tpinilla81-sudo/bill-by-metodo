'use client'

import { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { Pencil, Trash2, Save, Download, CheckCircle, AlertCircle, X } from 'lucide-react'
import { fmtDate, todayISO, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_LABELS_ENTRADA } from '@/lib/config'

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
      fetch('/api/registros'), fetch('/api/clientes'), fetch('/api/catalogo')
    ])
    setData({ registros: await rRes.json(), clientes: await cRes.json(), catalogo: await catRes.json() })
    setLoading(false)
  }, [])

  return { data, loadData, loading }
}

export function EntradaView() {
  const { data, loadData, loading } = useEntradaData()
  const { config } = useConfig()
  const [editingId, setEditingId] = useState<string | null>(null)

  const L = config?.labelsEntrada || DEFAULT_LABELS_ENTRADA

  // Form
  const [fecha, setFecha] = useState(todayISO())
  const [clienteId, setClienteId] = useState('')
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [cant, setCant] = useState('1')
  const [obs, setObs] = useState('')

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Load data on mount (client-side only)
  useEffect(() => {
    loadData()
  }, [loadData])

  const { clientes } = data

  // Available C1 options from catalog
  const c1Options = [...new Set(data.catalogo.map(x => x.c1))].sort()

  // Available C2 options based on selected C1 and cliente
  const c2Options = data.catalogo
    .filter(x => (!c1 || x.c1 === c1) && (!x.clienteId || x.clienteId === clienteId))
    .filter((x, i, arr) => arr.findIndex(y => y.c2 === x.c2) === i)

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  async function handleSave() {
    if (!fecha || !clienteId || !c1 || !c2 || !cant) {
      showStatus('err', 'Completa todos los campos')
      return
    }
    const cli = clientes.find(c => c.id === clienteId)
    const body = { fecha, clienteId, cliente: cli?.nombre || '', c1, c2, cant: Number(cant), obs }

    if (editingId) {
      await fetch('/api/registros', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
      setEditingId(null)
      showStatus('ok', 'Entrada actualizada ✓')
    } else {
      await fetch('/api/registros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      showStatus('ok', 'Entrada guardada ✓')
    }
    // Keep fecha and clienteId for quick consecutive entries
    setC1('')
    setC2('')
    setCant('1')
    setObs('')
    loadData()
  }

  function handleEdit(r: Registro) {
    setEditingId(r.id)
    setFecha(r.fecha)
    setClienteId(r.clienteId)
    setC1(r.c1)
    setC2(r.c2)
    setCant(String(r.cant))
    setObs(r.obs)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar entrada?')) return
    await fetch(`/api/registros?id=${id}`, { method: 'DELETE' })
    showStatus('ok', 'Eliminada')
    loadData()
  }

  function handleCancelEdit() {
    setEditingId(null)
    setFecha(todayISO())
    setClienteId('')
    setC1('')
    setC2('')
    setCant('1')
    setObs('')
  }

  async function handleExportData() {
    const XLSX = await import('xlsx')
    const rows = data.registros.map(r => ({
      [L.fecha]: r.fecha,
      [L.cliente]: r.cliente,
      [L.c1]: r.c1,
      [L.c2]: r.c2,
      [L.cantidad]: r.cant,
      [L.observaciones]: r.obs,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entradas')
    const appName = config?.appName || 'HUALSA'
    XLSX.writeFile(wb, `Entradas_${appName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Recent entries (last 15)
  const recentEntries = data.registros.slice(0, 15)

  return (
    <div className="flex flex-col min-h-[calc(100vh-2rem)] md:min-h-0">
      {/* ─── Status Toast ────────────────────────────────────── */}
      {statusMsg && (
        <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center px-4 py-3 text-sm font-semibold shadow-lg transition-all ${
          statusMsg.type === 'ok'
            ? 'bg-green-500 text-white'
            : 'bg-red-500 text-white'
        }`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-5 w-5 mr-2" /> : <AlertCircle className="h-5 w-5 mr-2" />}
          {statusMsg.text}
        </div>
      )}

      {/* ─── FORM (Mobile-First, iPhone Optimized) ────────── */}
      <div className="flex-1 pb-24 md:pb-0">
        <div className="px-3 py-3 space-y-3">
          {/* Editing banner */}
          {editingId && (
            <div className="flex items-center justify-between bg-amber-100 border border-amber-300 rounded-xl px-4 py-2.5">
              <span className="text-sm font-bold text-amber-800">Modo Edición</span>
              <Button onClick={handleCancelEdit} size="sm" variant="outline" className="h-9 rounded-full">
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            </div>
          )}

          {/* ── Fecha ────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{L.fecha}</Label>
            </div>
            <div className="px-4 pb-3">
              <Input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 focus:outline-none"
              />
            </div>
          </div>

          {/* ── Cliente ──────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{L.cliente}</Label>
            </div>
            <div className="px-4 pb-3">
              <Select value={clienteId} onValueChange={v => { setClienteId(v); setC2('') }}>
                <SelectTrigger className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 shadow-none">
                  <SelectValue placeholder="Selecciona cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-base py-3">{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Concepto 1 ──────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{L.c1}</Label>
            </div>
            <div className="px-4 pb-3">
              <Select value={c1} onValueChange={v => { setC1(v); setC2('') }}>
                <SelectTrigger className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 shadow-none">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {c1Options.map(c => (
                    <SelectItem key={c} value={c} className="text-base py-3">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Concepto 2 ──────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{L.c2}</Label>
            </div>
            <div className="px-4 pb-3">
              <Select value={c2} onValueChange={setC2}>
                <SelectTrigger className="h-12 text-lg border-0 bg-transparent p-0 focus:ring-0 shadow-none">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {c2Options.map(x => (
                    <SelectItem key={x.c2} value={x.c2} className="text-base py-3">{x.c2}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Cantidad + Obs (side by side on wider, stacked on narrow) */}
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-3 pt-3 pb-1">
                <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{L.cantidad}</Label>
              </div>
              <div className="px-3 pb-3">
                <Input
                  type="number"
                  value={cant}
                  onChange={e => setCant(e.target.value)}
                  min="1"
                  className="h-12 text-lg text-center border-0 bg-transparent p-0 focus:ring-0 focus:outline-none"
                />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-3 pt-3 pb-1">
                <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{L.observaciones}</Label>
              </div>
              <div className="px-3 pb-3">
                <Input
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Opcional..."
                  className="h-12 text-base border-0 bg-transparent p-0 focus:ring-0 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* ── GUARDAR Button (large, prominent) ──── */}
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-14 rounded-2xl bg-[#2bb24c] hover:bg-[#23963e] active:scale-[0.98] transition-all text-white text-lg font-bold shadow-lg shadow-green-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save className="h-5 w-5" />
            {editingId ? 'ACTUALIZAR' : 'GUARDAR'}
          </button>

          {/* ── Recent Entries (Cards for mobile) ──── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                Últimas Entradas
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportData}
                  disabled={data.registros.length === 0}
                  className="h-7 px-2.5 rounded-lg border border-gray-200 text-gray-500 hover:text-[#005bb5] hover:border-[#005bb5] text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-30"
                >
                  <Download className="h-3.5 w-3.5" /> Exportar
                </button>
                <span className="text-xs text-gray-300">{data.registros.length} total</span>
              </div>
            </div>

            <div className="space-y-2">
              {recentEntries.map(r => (
                <div
                  key={r.id}
                  className={`bg-white rounded-xl border p-3.5 shadow-sm transition-all ${
                    editingId === r.id
                      ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                      : 'border-gray-100 active:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Date + Cliente */}
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-bold text-gray-800">{fmtDate(r.fecha)}</span>
                        <span className="text-sm text-[#005bb5] font-semibold truncate">{r.cliente}</span>
                      </div>
                      {/* Concepts */}
                      <div className="flex items-baseline gap-1.5 text-sm text-gray-600">
                        <span className="font-medium">{r.c1}</span>
                        <span className="text-gray-300">·</span>
                        <span>{r.c2}</span>
                        <span className="text-gray-300">·</span>
                        <span className="font-bold text-gray-900">{r.cant}x</span>
                      </div>
                      {/* Obs */}
                      {r.obs && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{r.obs}</p>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(r)}
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-indigo-500 hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-50 active:bg-red-100 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {recentEntries.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                  <div className="text-4xl mb-2">📝</div>
                  <p className="text-gray-400 text-sm">No hay entradas todavía</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
