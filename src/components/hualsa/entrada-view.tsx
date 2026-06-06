'use client'

import { useState, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pencil, Trash2, Save, RotateCcw, FileSpreadsheet, Upload, Download, CheckCircle, AlertCircle, X, ChevronDown } from 'lucide-react'
import { fmtDate, todayISO, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'

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
  const [initialized, setInitialized] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form
  const [fecha, setFecha] = useState(todayISO())
  const [clienteId, setClienteId] = useState('')
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [cant, setCant] = useState('1')
  const [obs, setObs] = useState('')

  // Excel import
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<Partial<Registro>[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Show excel tools (collapsed by default on mobile)
  const [showExcelTools, setShowExcelTools] = useState(false)

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Load data on first render
  if (!initialized) {
    setInitialized(true)
    loadData()
  }

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

  // ─── Excel Import ───────────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx')
        const arrData = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(arrData, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

        if (rows.length === 0) {
          setImportErrors(['El archivo está vacío'])
          setImportPreview([])
          setImportModalOpen(true)
          return
        }

        const errors: string[] = []
        const preview: Partial<Registro>[] = []

        const clientesRes = await fetch('/api/clientes')
        const clientesList: Cliente[] = await clientesRes.json()

        rows.forEach((row, idx) => {
          const rowNum = idx + 2
          const rawFecha = String(row['FECHA'] || row['fecha'] || '').trim()
          const rawCliente = String(row['CLIENTE'] || row['cliente'] || '').trim()
          const rawC1 = String(row['CONCEPTO 1'] || row['CONCEPTO1'] || row['C1'] || row['c1'] || row['concepto 1'] || row['concepto1'] || '').trim()
          const rawC2 = String(row['CONCEPTO 2'] || row['CONCEPTO2'] || row['C2'] || row['c2'] || row['concepto 2'] || row['concepto2'] || '').trim()
          const rawCant = String(row['CANTIDAD'] || row['cantidad'] || row['Cant'] || row['cant'] || '').trim()
          const rawObs = String(row['OBSERVACIONES'] || row['observaciones'] || row['Obs'] || row['obs'] || row['OBS'] || '').trim()

          // Skip completely empty rows (all key fields empty)
          if (!rawFecha && !rawCliente && !rawC1 && !rawC2 && !rawCant && !rawObs) return

          let fechaISO = ''
          if (rawFecha) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawFecha)) {
              fechaISO = rawFecha
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawFecha)) {
              const [d, m, y] = rawFecha.split('/')
              fechaISO = `${y}-${m}-${d}`
            } else if (/^\d{2}-\d{2}-\d{4}$/.test(rawFecha)) {
              const [d, m, y] = rawFecha.split('-')
              fechaISO = `${y}-${m}-${d}`
            } else {
              const num = Number(rawFecha)
              if (!isNaN(num) && num > 40000 && num < 60000) {
                const excelDate = new Date((num - 25569) * 86400 * 1000)
                fechaISO = excelDate.toISOString().slice(0, 10)
              }
            }
          }

          if (!fechaISO) errors.push(`Fila ${rowNum}: Fecha inválida "${rawFecha}"`)
          if (!rawCliente) errors.push(`Fila ${rowNum}: Cliente vacío`)
          if (!rawC1) errors.push(`Fila ${rowNum}: Concepto 1 vacío`)
          if (!rawC2) errors.push(`Fila ${rowNum}: Concepto 2 vacío`)

          const cant = parseInt(rawCant) || 1

          const matchedCliente = clientesList.find(c =>
            c.nombre.toLowerCase() === rawCliente.toLowerCase() ||
            c.nombre.toLowerCase().includes(rawCliente.toLowerCase()) ||
            rawCliente.toLowerCase().includes(c.nombre.toLowerCase())
          )

          preview.push({
            fecha: fechaISO,
            clienteId: matchedCliente?.id || '',
            cliente: rawCliente,
            c1: rawC1,
            c2: rawC2,
            cant,
            obs: rawObs,
          })
        })

        setImportErrors(errors)
        setImportPreview(preview)
        setImportModalOpen(true)
      } catch (err) {
        setImportErrors(['Error leyendo el archivo: ' + String(err)])
        setImportPreview([])
        setImportModalOpen(true)
      }
    }
    reader.readAsArrayBuffer(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleImportConfirm() {
    if (importPreview.length === 0) return
    setImporting(true)
    try {
      const rowsWithIds = importPreview.filter(r => r.fecha && r.clienteId)
      if (rowsWithIds.length === 0) {
        showStatus('err', 'No hay filas válidas')
        setImporting(false)
        return
      }

      const res = await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: rowsWithIds })
      })

      if (res.ok) {
        const result = await res.json()
        showStatus('ok', `${result.count || rowsWithIds.length} entradas importadas ✓`)
        setImportModalOpen(false)
        setImportPreview([])
        setImportErrors([])
        loadData()
      } else {
        showStatus('err', 'Error importando')
      }
    } catch (err) {
      showStatus('err', 'Error: ' + String(err))
    }
    setImporting(false)
  }

  async function handleExportTemplate() {
    const XLSX = await import('xlsx')
    const header = ['FECHA', 'CLIENTE', 'CONCEPTO 1', 'CONCEPTO 2', 'CANTIDAD', 'OBSERVACIONES']
    const ws = XLSX.utils.aoa_to_sheet([header])
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entrada')
    XLSX.writeFile(wb, 'Plantilla_Entrada_HUALSA.xlsx')
  }

  async function handleExportData() {
    const XLSX = await import('xlsx')
    const rows = data.registros.map(r => ({
      FECHA: r.fecha,
      CLIENTE: r.cliente,
      'CONCEPTO 1': r.c1,
      'CONCEPTO 2': r.c2,
      CANTIDAD: r.cant,
      OBSERVACIONES: r.obs,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entradas')
    XLSX.writeFile(wb, `Entradas_HUALSA_${new Date().toISOString().slice(0, 10)}.xlsx`)
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
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Fecha</Label>
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
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cliente</Label>
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
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Concepto 1</Label>
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
              <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Concepto 2</Label>
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
                <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cant.</Label>
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
                <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Observaciones</Label>
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

          {/* ── Excel Tools (collapsible) ────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowExcelTools(!showExcelTools)}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-[#005bb5]" />
                <span className="text-sm font-semibold text-gray-700">Excel / Importar</span>
              </div>
              <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${showExcelTools ? 'rotate-180' : ''}`} />
            </button>

            {showExcelTools && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-12 rounded-xl bg-[#005bb5] hover:bg-[#003d7a] active:scale-[0.98] transition-all text-white font-semibold flex items-center justify-center gap-2"
                >
                  <Upload className="h-5 w-5" /> IMPORTAR EXCEL
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleExportData}
                    disabled={data.registros.length === 0}
                    className="h-11 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" /> Exportar
                  </button>
                  <button
                    onClick={handleExportTemplate}
                    className="h-11 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 font-semibold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    <FileSpreadsheet className="h-4 w-4" /> Plantilla
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                  Columnas: FECHA · CLIENTE · CONCEPTO 1 · CONCEPTO 2 · CANTIDAD · OBSERVACIONES
                </p>
              </div>
            )}
          </div>

          {/* ── Recent Entries (Cards for mobile) ──── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                Últimas Entradas
              </h3>
              <span className="text-xs text-gray-300">{data.registros.length} total</span>
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

      {/* ─── Import Preview Modal ──────────────────────────── */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-[900px] max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#005bb5]" />
              Vista Previa de Importación
            </DialogTitle>
          </DialogHeader>

          {importErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
              <p className="text-sm font-bold text-red-700 mb-1">Advertencias ({importErrors.length})</p>
              <div className="max-h-28 overflow-auto text-xs text-red-600 space-y-0.5">
                {importErrors.slice(0, 15).map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
                {importErrors.length > 15 && <div>... y {importErrors.length - 15} más</div>}
              </div>
            </div>
          )}

          <div className="text-sm text-gray-600 mb-2">
            <b>{importPreview.length}</b> filas encontradas ·{' '}
            <b className="text-green-600">{importPreview.filter(r => r.clienteId).length} válidas</b>
            {importPreview.filter(r => !r.clienteId).length > 0 && (
              <span className="text-red-500"> · {importPreview.filter(r => !r.clienteId).length} sin cliente</span>
            )}
          </div>

          <div className="overflow-auto max-h-[350px] border rounded-xl">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr className="bg-gray-100">
                  <th className="p-2 text-left border-b">✓</th>
                  <th className="p-2 text-left border-b">Fecha</th>
                  <th className="p-2 text-left border-b">Cliente</th>
                  <th className="p-2 text-left border-b">C1</th>
                  <th className="p-2 text-left border-b">C2</th>
                  <th className="p-2 text-center border-b">Cant</th>
                  <th className="p-2 text-left border-b">Obs</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((r, i) => {
                  const ok = !!r.clienteId && !!r.fecha
                  return (
                    <tr key={i} className={`border-b ${ok ? '' : 'bg-red-50'}`}>
                      <td className="p-2">
                        {ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-red-400" />}
                      </td>
                      <td className="p-2">{r.fecha || '—'}</td>
                      <td className="p-2">{r.cliente || '—'}{r.clienteId ? ' ✓' : ''}</td>
                      <td className="p-2">{r.c1 || '—'}</td>
                      <td className="p-2">{r.c2 || '—'}</td>
                      <td className="p-2 text-center">{r.cant}</td>
                      <td className="p-2 text-gray-400">{r.obs}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setImportModalOpen(false)} className="flex-1 h-12 rounded-xl">
              Cancelar
            </Button>
            <Button
              onClick={handleImportConfirm}
              className="flex-1 h-12 rounded-xl bg-[#2bb24c] hover:bg-[#23963e] text-white font-bold"
              disabled={importing || importPreview.filter(r => r.clienteId).length === 0}
            >
              {importing ? (
                <span className="animate-pulse">Importando...</span>
              ) : (
                <>IMPORTAR {importPreview.filter(r => r.clienteId).length} FILAS</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
