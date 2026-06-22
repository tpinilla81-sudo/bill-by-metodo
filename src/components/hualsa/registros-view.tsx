'use client'
// CACHE-BUST v2026-06-22-v1 — adds entrada_asc sort option (ascending entry order)

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Filter, RotateCcw, FileSpreadsheet, Table2, CheckCircle2, Upload, Download, CheckCircle, AlertCircle, ChevronDown, Pencil, Trash2, Save, SquareCheck, X } from 'lucide-react'
import { fmtCurrency, fmtDate, getISOWeek, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_FIELDS_REGISTROS, type FieldDef, parseCustomData } from '@/lib/config'
import { triggerBackup } from '@/lib/trigger-backup'

interface RegistrosViewData {
  registros: Registro[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
}

function useRegistrosData() {
  const [data, setData] = useState<RegistrosViewData>({ registros: [], clientes: [], catalogo: [] })
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [rRes, cRes, catRes] = await Promise.all([
      fetch('/api/registros?filter=registros'), fetch('/api/clientes'), fetch('/api/catalogo')
    ])
    setData({ registros: await rRes.json(), clientes: await cRes.json(), catalogo: await catRes.json() })
    setLoading(false)
  }, [])

  return { data, loadData, loading }
}

export function RegistrosView() {
  const { data, loadData, loading } = useRegistrosData()
  const { config } = useConfig()
  const fieldDefs = config?.fieldsRegistros || DEFAULT_FIELDS_REGISTROS
  const visibleFields = fieldDefs.filter(f => f.visible)

  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fC1, setFC1] = useState('')
  const [fC2, setFC2] = useState('')
  const [fQ, setFQ] = useState('')

  // Sort control: 'entrada' = order in which records were entered (createdAt),
  // which is what users mean by "ordenar según como pasa desde entradas".
  // 'entrada_desc' = newest entry first (default), 'entrada_asc' = oldest entry first.
  type SortKey = 'entrada_desc' | 'entrada_asc' | 'fecha_asc' | 'fecha_desc' | 'cliente' | 'c1' | 'c2' | 'importe' | 'cant'
  const [sortBy, setSortBy] = useState<SortKey>('entrada_desc')

  // Excel import
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<Partial<Registro & { precioUnitario?: number; importe?: number }>[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [showExcelTools, setShowExcelTools] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [deletingBulk, setDeletingBulk] = useState(false)

  // UI collapse states
  const [showFilters, setShowFilters] = useState(true)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFecha, setEditFecha] = useState('')
  const [editClienteId, setEditClienteId] = useState('')
  const [editC1, setEditC1] = useState('')
  const [editC2, setEditC2] = useState('')
  const [editCant, setEditCant] = useState('')
  const [editObs, setEditObs] = useState('')
  const [editPrecioUnitario, setEditPrecioUnitario] = useState('')
  const [editModalOpen, setEditModalOpen] = useState(false)

  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { loadData() }, [loadData])

  const { registros, clientes, catalogo } = data

  // Helper: get label for a field key
  function getLabel(key: string): string {
    return fieldDefs.find(f => f.key === key)?.label || key
  }

  function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
    let it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val)
    return it ? Number(it.final) || 0 : 0
  }

  // Use stored precioUnitario if available, otherwise fall back to catalog lookup
  function getPrecio(r: Registro): number {
    return r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
  }

  const c1FilterOptions = [...new Set(catalogo.map(x => x.c1))].sort()
  const c2FilterOptions = useMemo(() => [...new Set(catalogo.filter(x => !fC1 || fC1 === '__all__' || x.c1 === fC1).map(x => x.c2))].sort(), [catalogo, fC1])

  const filtered = registros.filter(r => {
    if (fDesde && r.fecha < fDesde) return false
    if (fHasta && r.fecha > fHasta) return false
    if (fCliente && fCliente !== '__all__' && r.clienteId !== fCliente) return false
    if (fC1 && fC1 !== '__all__' && r.c1 !== fC1) return false
    if (fC2 && fC2 !== '__all__' && r.c2 !== fC2) return false
    if (fQ) { const blob = (r.c1 + ' ' + r.c2 + ' ' + (r.obs || '') + ' ' + (r.cliente || '')).toLowerCase(); if (!blob.includes(fQ.toLowerCase())) return false }
    return true
  }).sort((a, b) => {
    switch (sortBy) {
      case 'entrada_desc':
        // Most recently entered first (matches how they appear in Entradas — newest on top)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      case 'entrada_asc':
        // Oldest entry first — useful for tracking the original entry order top-to-bottom
        return (a.createdAt || '').localeCompare(b.createdAt || '')
      case 'fecha_asc':
        return a.fecha.localeCompare(b.fecha)
      case 'fecha_desc':
        return b.fecha.localeCompare(a.fecha)
      case 'cliente':
        return (a.cliente || '').localeCompare(b.cliente || '')
      case 'c1':
        return (a.c1 || '').localeCompare(b.c1 || '')
      case 'c2':
        return (a.c2 || '').localeCompare(b.c2 || '')
      case 'cant':
        return b.cant - a.cant
      case 'importe':
        return (getPrecio(b) * b.cant) - (getPrecio(a) * a.cant)
      default:
        return 0
    }
  })

  let tCant = 0, tImp = 0
  filtered.forEach(r => { tCant += r.cant; tImp += getPrecio(r) * r.cant })

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text }); setTimeout(() => setStatusMsg(null), 4000)
  }

  // ─── Excel helpers ─────────────────────────────────────────

  function getRowVal(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) { if (row[k] !== undefined && row[k] !== null && row[k] !== '') return String(row[k]).trim() }
    return ''
  }

  function parseExcelDate(val: string): string {
    if (!val) return ''
    // Try ISO format: 2024-01-15
    const isoMatch = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    // Try DD/MM/YYYY
    const dmyMatch = String(val).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`
    // Try Excel serial number
    const num = Number(val)
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const excelEpoch = new Date(1899, 11, 30)
      excelEpoch.setDate(excelEpoch.getDate() + Math.floor(num))
      // Use local date methods to avoid timezone offset (toISOString uses UTC)
      const y = excelEpoch.getFullYear()
      const m = String(excelEpoch.getMonth() + 1).padStart(2, '0')
      const d = String(excelEpoch.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    return ''
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx')
        const arrData = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(arrData, { type: 'array', cellDates: false })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', blankrows: false, raw: true })
        if (rawRows.length === 0) { setImportErrors(['El archivo está vacío']); setImportPreview([]); setImportModalOpen(true); return }

        const errors: string[] = []
        const preview: Partial<Registro & { precioUnitario?: number; importe?: number }>[] = []

        // Fetch clientes for matching
        const clientesRes = await fetch('/api/clientes')
        const clientesList: Cliente[] = await clientesRes.json()

        rawRows.forEach((row, idx) => {
          const rowNum = idx + 2
          const rawFecha = getRowVal(row, getLabel('fecha'), 'FECHA', 'Fecha', 'fecha', 'DATE')
          const rawCliente = getRowVal(row, getLabel('cliente'), 'CLIENTE', 'Cliente', 'cliente')
          const rawC1 = getRowVal(row, getLabel('c1'), 'CONCEPTO 1', 'Concepto 1', 'C1', 'c1')
          const rawC2 = getRowVal(row, getLabel('c2'), 'CONCEPTO 2', 'Concepto 2', 'C2', 'c2')
          const rawCant = getRowVal(row, getLabel('cantidad'), 'CANTIDAD', 'Cant', 'Cantidad', 'CANT', 'cantidad')
          const rawObs = getRowVal(row, getLabel('observaciones'), 'OBSERVACIONES', 'Obs', 'Observaciones', 'obs')

          // Skip empty rows
          if (!rawFecha && !rawCliente && !rawC1 && !rawC2 && !rawCant) return

          const fechaParsed = parseExcelDate(rawFecha)
          if (!fechaParsed) errors.push(`Fila ${rowNum}: Fecha inválida "${rawFecha}"`)
          if (!rawC1) errors.push(`Fila ${rowNum}: Concepto 1 vacío`)
          if (!rawC2) errors.push(`Fila ${rowNum}: Concepto 2 vacío`)

          // Match cliente
          const matchedCliente = rawCliente
            ? clientesList.find(c => c.nombre.toLowerCase() === rawCliente.toLowerCase() || c.nombre.toLowerCase().includes(rawCliente.toLowerCase()))
            : null

          if (rawCliente && !matchedCliente) errors.push(`Fila ${rowNum}: Cliente "${rawCliente}" no encontrado`)

          const cantNum = Number(rawCant) || 1
          const clienteId = matchedCliente?.id || ''
          const pu = precioUnit(rawC1, rawC2, clienteId)
          const imp = pu * cantNum

          preview.push({
            fecha: fechaParsed,
            clienteId,
            cliente: matchedCliente?.nombre || rawCliente || '',
            c1: rawC1,
            c2: rawC2,
            cant: cantNum,
            obs: rawObs,
            precioUnitario: pu,
            importe: imp,
          })
        })

        setImportErrors(errors); setImportPreview(preview); setImportModalOpen(true)
      } catch (err) {
        setImportErrors(['Error leyendo el archivo: ' + String(err)]); setImportPreview([]); setImportModalOpen(true)
      }
    }
    reader.readAsArrayBuffer(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleImportConfirm() {
    if (importPreview.length === 0) return
    setImporting(true)
    try {
      const validRows = importPreview.filter(r => r.fecha && r.c1 && r.c2)
      if (validRows.length === 0) { showStatus('err', 'No hay filas válidas (requieren fecha y conceptos)'); setImporting(false); return }

      const res = await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch: validRows.map(r => ({
            fecha: r.fecha,
            clienteId: r.clienteId || '',
            cliente: r.cliente || '',
            c1: r.c1 || '',
            c2: r.c2 || '',
            cant: r.cant || 1,
            obs: r.obs || '',
          }))
        })
      })
      if (res.ok) {
        const result = await res.json()
        showStatus('ok', `${result.count || validRows.length} registros importados ✓`)
        setImportModalOpen(false); setImportPreview([]); setImportErrors([])
        triggerBackup(); loadData()
      } else {
        const d = await res.json().catch(() => ({}))
        showStatus('err', d.error || 'Error importando')
      }
    } catch (err) {
      showStatus('err', 'Error: ' + String(err))
    }
    setImporting(false)
  }

  async function handleExportTemplate() {
    const XLSX = await import('xlsx')
    const header = [getLabel('fecha'), getLabel('cliente'), getLabel('c1'), getLabel('c2'), getLabel('cantidad'), getLabel('observaciones')]
    const exampleRow = ['15/01/2025', 'Cliente Ejemplo', 'Grupo', 'Servicio', '5', 'Observaciones opcionales']
    const ws = XLSX.utils.aoa_to_sheet([header, exampleRow])
    ws['!cols'] = [{ wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Registros')
    const appName = config?.appName || 'HUALSA'; XLSX.writeFile(wb, `Plantilla_Registros_${appName}.xlsx`)
  }

  async function handleExportData() {
    const XLSX = await import('xlsx')
    const rows = filtered.map(r => {
      const pu = getPrecio(r)
      const imp = pu * r.cant
      const customData = parseCustomData((r as Record<string, unknown>).customData as string || '')
      const row: Record<string, unknown> = {
        Fecha: fmtDate(r.fecha), Mes: new Date(r.fecha).getMonth() + 1, Sem: getISOWeek(r.fecha),
        Cliente: r.cliente, 'Concepto 1': r.c1, 'Concepto 2': r.c2,
        Cantidad: r.cant, 'P.Unitario': pu, Importe: imp, Observaciones: r.obs,
      }
      // Add custom fields
      visibleFields.filter(f => f.isCustom).forEach(f => { row[f.label] = customData[f.key] || '' })
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 30 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Registros')
    const totalsWs = XLSX.utils.json_to_sheet([{ 'TOTAL CANTIDAD': tCant, 'TOTAL IMPORTE': tImp, 'Nº LÍNEAS': filtered.length }])
    XLSX.utils.book_append_sheet(wb, totalsWs, 'Resumen')
    const appName = config?.appName || 'HUALSA'; const _d = new Date(); const _p = (n: number) => String(n).padStart(2, '0'); XLSX.writeFile(wb, `Registros_${appName}_${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}.xlsx`)
  }

  function handleEdit(r: Registro) {
    setEditingId(r.id)
    setEditFecha(r.fecha)
    setEditClienteId(r.clienteId)
    setEditC1(r.c1)
    setEditC2(r.c2)
    setEditCant(String(r.cant))
    setEditObs(r.obs || '')
    setEditPrecioUnitario(r.precioUnitario > 0 ? String(r.precioUnitario) : '')
    setEditModalOpen(true)
  }

  function resetEditForm() {
    setEditingId(null); setEditFecha(''); setEditClienteId(''); setEditC1(''); setEditC2(''); setEditCant(''); setEditObs(''); setEditPrecioUnitario(''); setEditModalOpen(false)
  }

  async function handleUpdate() {
    if (!editingId) return
    if (!editFecha || !editClienteId || !editC1 || !editC2 || !editCant) {
      showStatus('err', 'Completa fecha, cliente, conceptos y cantidad')
      return
    }
    const matchedCliente = clientes.find(c => c.id === editClienteId)
    try {
      const res = await fetch('/api/registros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          fecha: editFecha,
          clienteId: editClienteId,
          cliente: matchedCliente?.nombre || '',
          c1: editC1,
          c2: editC2,
          cant: Number(editCant) || 1,
          obs: editObs,
          precioUnitario: editPrecioUnitario ? Number(editPrecioUnitario) : undefined,
        })
      })
      if (res.ok) {
        showStatus('ok', 'Registro actualizado ✓')
        resetEditForm()
        triggerBackup()
        loadData()
      } else {
        const d = await res.json().catch(() => ({}))
        showStatus('err', d.error || 'Error actualizando')
      }
    } catch (err) {
      showStatus('err', 'Error: ' + String(err))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar registro?')) return
    try {
      const res = await fetch(`/api/registros?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        showStatus('ok', 'Registro eliminado')
        triggerBackup()
        loadData()
      } else {
        showStatus('err', 'Error eliminando registro')
      }
    } catch (err) {
      showStatus('err', 'Error: ' + String(err))
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)))
    }
  }

  function selectVisible() {
    setSelectedIds(new Set(filtered.map(r => r.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    setDeletingBulk(true)
    try {
      const ids = Array.from(selectedIds)
      const res = await fetch('/api/registros', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      })
      if (res.ok) {
        const result = await res.json()
        showStatus('ok', `${result.count || ids.length} registros eliminados`)
        setSelectedIds(new Set())
        setBulkDeleteConfirm(false)
        triggerBackup()
        loadData()
      } else {
        const d = await res.json().catch(() => ({}))
        showStatus('err', d.error || 'Error eliminando registros')
      }
    } catch (err) {
      showStatus('err', 'Error: ' + String(err))
    }
    setDeletingBulk(false)
  }

  // Get cell value for a field
  function getCellValue(r: Registro, field: FieldDef): React.ReactNode {
    const pu = getPrecio(r)
    const imp = pu * r.cant
    const d = new Date(r.fecha)
    const customData = parseCustomData((r as Record<string, unknown>).customData as string || '')

    if (field.isCustom) return String(customData[field.key] || '')

    switch (field.key) {
      case 'fecha': return fmtDate(r.fecha)
      case 'mes': return d.getMonth() + 1
      case 'semana': return getISOWeek(r.fecha)
      case 'cliente': return r.cliente
      case 'c1': return r.c1
      case 'c2': return r.c2
      case 'cantidad': return r.cant
      case 'precioUnitario': return fmtCurrency(pu)
      case 'importe': return fmtCurrency(imp)
      case 'observaciones': return r.obs
      case 'facturado': return r.facturado
        ? <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full whitespace-nowrap"><CheckCircle2 className="h-3 w-3" /> Facturado</span>
        : <span className="text-[10px] text-gray-400">—</span>
      default: return ''
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ─── FIXED HEADER ─── */}
      <div className="flex-shrink-0 space-y-3 pb-2">
        {statusMsg && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{statusMsg.text}
          </div>
        )}

        {/* Title + toggle buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Table2 className="h-5 w-5 text-[#005bb5]" />
          <h2 className="text-lg font-bold text-gray-700">Registros</h2>
          <button onClick={() => setShowFilters(!showFilters)} className={`ml-2 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${showFilters ? 'bg-blue-50 text-[#005bb5] border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-[#005bb5]'}`}>
            <Filter className="h-3 w-3" /> Filtros
          </button>
          <button onClick={() => setShowExcelTools(!showExcelTools)} className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${showExcelTools ? 'bg-blue-50 text-[#005bb5] border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-[#005bb5]'}`}>
            <FileSpreadsheet className="h-3 w-3" /> Transferir tabla
          </button>
        </div>

        {/* Collapsible Filters */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto_auto] gap-3 items-end">
                <div><Label className="text-xs uppercase font-bold text-slate-500">Desde</Label><Input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Hasta</Label><Input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Cliente</Label><Select value={fCliente} onValueChange={setFCliente}><SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger><SelectContent><SelectItem value="__all__">— Todos —</SelectItem>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Concepto 1</Label><Select value={fC1} onValueChange={v => { setFC1(v); setFC2('') }}><SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger><SelectContent><SelectItem value="__all__">— Todos —</SelectItem>{c1FilterOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Concepto 2</Label><Select value={fC2} onValueChange={setFC2}><SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger><SelectContent><SelectItem value="__all__">— Todos —</SelectItem>{c2FilterOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Buscar</Label><Input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="Texto..." /></div>
                <Button variant="default" className="bg-[#005bb5] hover:bg-[#003d7a] text-white"><Filter className="h-4 w-4 mr-1" /> FILTRAR</Button>
                <Button variant="outline" onClick={() => { setFDesde(''); setFHasta(''); setFCliente(''); setFC1(''); setFC2(''); setFQ('') }}><RotateCcw className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Collapsible Transferir tabla */}
        {showExcelTools && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => fileInputRef.current?.click()} className="bg-[#005bb5] hover:bg-[#003d7a] text-white"><Upload className="h-4 w-4 mr-2" /> IMPORTAR</Button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
                <Button onClick={handleExportData} variant="outline" disabled={filtered.length === 0}><Download className="h-4 w-4 mr-2" /> EXPORTAR</Button>
                <Button onClick={handleExportTemplate} variant="outline" className="border-dashed"><FileSpreadsheet className="h-4 w-4 mr-2" /> PLANTILLA</Button>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed mt-2">Columnas: {getLabel('fecha')} · {getLabel('cliente')} · {getLabel('c1')} · {getLabel('c2')} · {getLabel('cantidad')} · {getLabel('observaciones')} (opcional)</p>
            </CardContent>
          </Card>
        )}

        {/* Bulk selection bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
            <SquareCheck className="h-5 w-5 text-rose-600" />
            <span className="text-sm font-bold text-rose-700">{selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}</span>
            <Button onClick={selectVisible} variant="outline" size="sm" className="text-xs h-8">Todos visibles</Button>
            <Button onClick={clearSelection} variant="outline" size="sm" className="text-xs h-8">Ninguno</Button>
            <div className="flex-1" />
            <Button onClick={() => setBulkDeleteConfirm(true)} className="bg-rose-600 hover:bg-rose-700 text-white h-9"><Trash2 className="h-4 w-4 mr-2" />ELIMINAR SELECCIONADOS</Button>
            <Button onClick={clearSelection} variant="ghost" size="icon" className="h-8 w-8 text-rose-400"><X className="h-4 w-4" /></Button>
          </div>
        )}

        {/* Stats bar — always visible, includes sort selector */}
        <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-2.5 shadow-sm text-sm font-bold border items-center">
          <span>Líneas:<b className="text-[#005bb5] ml-1">{filtered.length}</b></span>
          <span>Cantidad:<b className="text-[#005bb5] ml-1">{tCant}</b></span>
          <span>Importe:<b className="text-[#2bb24c] ml-1">{fmtCurrency(tImp)}</b></span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">Ordenar:</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-7 w-44 text-xs font-semibold border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada_desc">Orden de entrada (más reciente primero)</SelectItem>
                <SelectItem value="entrada_asc">Orden de entrada (más antiguo primero)</SelectItem>
                <SelectItem value="fecha_desc">Fecha (más reciente primero)</SelectItem>
                <SelectItem value="fecha_asc">Fecha (más antigua primero)</SelectItem>
                <SelectItem value="cliente">Cliente (A-Z)</SelectItem>
                <SelectItem value="c1">Concepto 1 (A-Z)</SelectItem>
                <SelectItem value="c2">Concepto 2 (A-Z)</SelectItem>
                <SelectItem value="cant">Cantidad (mayor primero)</SelectItem>
                <SelectItem value="importe">Importe (mayor primero)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedIds.size === 0 && filtered.length > 0 && (
            <>
              <div className="flex-1" />
              <Button onClick={toggleSelectAll} variant="outline" size="sm" className="text-xs h-7 border-dashed"><SquareCheck className="h-3.5 w-3.5 mr-1" /> Seleccionar</Button>
            </>
          )}
        </div>
      </div>

      {/* ─── SCROLLABLE TABLE ─── */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border shadow-sm flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-[#005bb5] text-white">
                {selectedIds.size > 0 && (
                  <th className="p-2.5 text-center border-b border-[#004a94] w-10 bg-[#005bb5]">
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="h-4 w-4 accent-[#005bb5] cursor-pointer" />
                  </th>
                )}
                {visibleFields.map(f => (
                  <th key={f.key} className="p-2.5 text-left font-semibold border-b border-[#004a94] bg-[#005bb5]">{f.label}</th>
                ))}
                <th className="p-2.5 text-left font-semibold border-b border-[#004a94] bg-[#005bb5]">Acc.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isSelected = selectedIds.has(r.id)
                return (
                <tr key={r.id} className={`border-b transition-colors ${isSelected ? 'bg-rose-50' : 'hover:bg-blue-50/50'}`}>
                  {selectedIds.size > 0 && (
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} className="h-4 w-4 accent-[#005bb5] cursor-pointer" />
                    </td>
                  )}
                  {visibleFields.map(f => (
                    <td key={f.key} className={`p-2 ${f.key === 'importe' ? 'font-bold text-[#005bb5]' : f.key === 'precioUnitario' ? 'text-gray-600' : f.key === 'observaciones' ? 'text-gray-500 text-xs' : ''}`}>
                      {getCellValue(r, f)}
                    </td>
                  ))}
                  <td className="p-2 whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={visibleFields.length + (selectedIds.size > 0 ? 2 : 1)} className="p-8 text-center text-gray-400">{loading ? 'Cargando...' : 'No hay registros con estos filtros'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Fixed footer totals */}
        {filtered.length > 0 && (
          <div className="flex-shrink-0 bg-gray-100 font-bold text-sm px-2.5 py-2.5 border-t flex items-center gap-4">
            <span>TOTALES</span>
            <span>Cantidad: <span className="text-[#005bb5]">{tCant}</span></span>
            <span>Importe: <span className="text-[#005bb5]">{fmtCurrency(tImp)}</span></span>
          </div>
        )}
      </div>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-rose-600" />Eliminar Registros</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">¿Seguro que quieres eliminar <b className="text-rose-600">{selectedIds.size} registro{selectedIds.size > 1 ? 's' : ''}</b>? Esta acción no se puede deshacer.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)} className="flex-1 h-11 rounded-xl">Cancelar</Button>
            <Button onClick={handleBulkDelete} className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold" disabled={deletingBulk}>{deletingBulk ? <span className="animate-pulse">Eliminando...</span> : <>ELIMINAR {selectedIds.size}</>}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={(open) => { if (!open) resetEditForm() }}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-indigo-600" />Editar Registro</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Fecha</Label>
              <Input type="date" value={editFecha} onChange={e => setEditFecha(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Cliente</Label>
              <Select value={editClienteId} onValueChange={setEditClienteId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Concepto 1</Label>
              <Input value={editC1} onChange={e => setEditC1(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Concepto 2</Label>
              <Input value={editC2} onChange={e => setEditC2(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Cantidad</Label>
              <Input type="number" step="any" min="0" value={editCant} onChange={e => setEditCant(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Observaciones</Label>
              <Input value={editObs} onChange={e => setEditObs(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">P. Unitario</Label>
              <Input type="number" step="0.01" value={editPrecioUnitario} onChange={e => setEditPrecioUnitario(e.target.value)} placeholder={editC1 && editC2 ? String(precioUnit(editC1, editC2, editClienteId)) : ''} />
            </div>
          </div>
          {editC1 && editC2 && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-500">Catálogo: </span><span className="font-bold">{fmtCurrency(precioUnit(editC1, editC2, editClienteId))}</span>
              <span className="text-gray-500 ml-4">Importe: </span><span className="font-bold text-[#005bb5]">{fmtCurrency((editPrecioUnitario ? Number(editPrecioUnitario) : precioUnit(editC1, editC2, editClienteId)) * (Number(editCant) || 1))}</span>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={resetEditForm} className="flex-1 h-11 rounded-xl">Cancelar</Button>
            <Button onClick={handleUpdate} className="flex-1 h-11 rounded-xl bg-[#005bb5] hover:bg-[#003d7a] text-white font-bold"><Save className="h-4 w-4 mr-2" />ACTUALIZAR</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Preview Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-[900px] max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-[#005bb5]" />Vista Previa - Importar Registros</DialogTitle></DialogHeader>
          {importErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-sm font-bold text-amber-700 mb-1">Advertencias ({importErrors.length})</p>
              <div className="max-h-28 overflow-auto text-xs text-amber-600 space-y-0.5">{importErrors.slice(0, 15).map((err, i) => <div key={i}>{err}</div>)}{importErrors.length > 15 && <div>... y {importErrors.length - 15} más</div>}</div>
            </div>
          )}
          <div className="text-sm text-gray-600 mb-2"><b>{importPreview.filter(r => r.fecha && r.c1 && r.c2).length}</b> filas válidas · <b className="text-amber-600">{importPreview.filter(r => !(r.fecha && r.c1 && r.c2)).length} con errores</b> · <b className="text-green-600">{importPreview.length} total</b></div>
          <div className="overflow-auto max-h-[350px] border rounded-xl">
            <table className="w-full text-xs">
              <thead className="sticky top-0"><tr className="bg-gray-100">
                <th className="p-2 text-left border-b">✓</th>
                <th className="p-2 text-left border-b">{getLabel('fecha')}</th>
                <th className="p-2 text-left border-b">{getLabel('cliente')}</th>
                <th className="p-2 text-left border-b">{getLabel('c1')}</th>
                <th className="p-2 text-left border-b">{getLabel('c2')}</th>
                <th className="p-2 text-right border-b">{getLabel('cantidad')}</th>
                <th className="p-2 text-right border-b">P.Unit</th>
                <th className="p-2 text-right border-b">Importe</th>
                <th className="p-2 text-left border-b">{getLabel('observaciones')}</th>
              </tr></thead>
              <tbody>
                {importPreview.map((r, i) => {
                  const ok = !!(r.fecha && r.c1 && r.c2)
                  return (
                    <tr key={i} className={`border-b ${ok ? '' : 'bg-red-50'}`}>
                      <td className="p-2">{ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-red-400" />}</td>
                      <td className="p-2">{r.fecha ? fmtDate(r.fecha) : '—'}</td>
                      <td className="p-2">{r.cliente || <span className="text-amber-500">Sin cliente</span>}</td>
                      <td className="p-2">{r.c1 || '—'}</td>
                      <td className="p-2">{r.c2 || '—'}</td>
                      <td className="p-2 text-right">{r.cant || 1}</td>
                      <td className="p-2 text-right">{(r.precioUnitario || 0).toFixed(2)}</td>
                      <td className="p-2 text-right font-bold">{(r.importe || 0).toFixed(2)}</td>
                      <td className="p-2 text-gray-500">{r.obs || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setImportModalOpen(false)} className="flex-1 h-12 rounded-xl">Cancelar</Button>
            <Button onClick={handleImportConfirm} className="flex-1 h-12 rounded-xl bg-[#2bb24c] hover:bg-[#23963e] text-white font-bold" disabled={importing || importPreview.filter(r => r.fecha && r.c1 && r.c2).length === 0}>{importing ? <span className="animate-pulse">Importando...</span> : <>IMPORTAR {importPreview.filter(r => r.fecha && r.c1 && r.c2).length} FILAS</>}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
