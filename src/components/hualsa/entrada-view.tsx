'use client'

import { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pencil, Trash2, Save, RotateCcw, FileSpreadsheet, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react'
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
    setTimeout(() => setStatusMsg(null), 4000)
  }

  async function handleSave() {
    if (!fecha || !clienteId || !c1 || !c2 || !cant) {
      showStatus('err', 'Completa fecha, cliente, conceptos y cantidad')
      return
    }
    const cli = clientes.find(c => c.id === clienteId)
    const body = { fecha, clienteId, cliente: cli?.nombre || '', c1, c2, cant: Number(cant), obs }

    if (editingId) {
      await fetch('/api/registros', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
      setEditingId(null)
      showStatus('ok', 'Entrada actualizada')
    } else {
      await fetch('/api/registros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      showStatus('ok', 'Entrada guardada')
    }
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
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar entrada?')) return
    await fetch(`/api/registros?id=${id}`, { method: 'DELETE' })
    showStatus('ok', 'Entrada eliminada')
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
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

        if (rows.length === 0) {
          setImportErrors(['El archivo está vacío o no tiene filas de datos'])
          setImportPreview([])
          setImportModalOpen(true)
          return
        }

        const errors: string[] = []
        const preview: Partial<Registro>[] = []

        // Load clientes for matching
        const clientesRes = await fetch('/api/clientes')
        const clientesList: Cliente[] = await clientesRes.json()

        rows.forEach((row, idx) => {
          const rowNum = idx + 2 // header is row 1
          const rawFecha = String(row['FECHA'] || row['fecha'] || '').trim()
          const rawCliente = String(row['CLIENTE'] || row['cliente'] || '').trim()
          const rawC1 = String(row['CONCEPTO 1'] || row['CONCEPTO1'] || row['C1'] || row['c1'] || row['concepto 1'] || row['concepto1'] || '').trim()
          const rawC2 = String(row['CONCEPTO 2'] || row['CONCEPTO2'] || row['C2'] || row['c2'] || row['concepto 2'] || row['concepto2'] || '').trim()
          const rawCant = String(row['CANTIDAD'] || row['cantidad'] || row['Cant'] || row['cant'] || '').trim()
          const rawObs = String(row['OBSERVACIONES'] || row['observaciones'] || row['Obs'] || row['obs'] || row['OBS'] || '').trim()

          // Validate fecha
          let fechaISO = ''
          if (rawFecha) {
            // Try various date formats
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawFecha)) {
              fechaISO = rawFecha
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawFecha)) {
              const [d, m, y] = rawFecha.split('/')
              fechaISO = `${y}-${m}-${d}`
            } else if (/^\d{2}-\d{2}-\d{4}$/.test(rawFecha)) {
              const [d, m, y] = rawFecha.split('-')
              fechaISO = `${y}-${m}-${d}`
            } else {
              // Try Excel serial date
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

          // Find matching cliente
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
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleImportConfirm() {
    if (importPreview.length === 0) return
    setImporting(true)
    try {
      // Filter out rows with missing required data
      const validRows = importPreview.filter(r => r.fecha && r.cliente)

      // For rows without clienteId, try to match or skip
      const rowsWithIds = validRows.filter(r => r.clienteId)

      if (rowsWithIds.length === 0) {
        showStatus('err', 'No hay filas válidas con clientes reconocidos')
        setImporting(false)
        return
      }

      // Send batch to API
      const res = await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: rowsWithIds })
      })

      if (res.ok) {
        const result = await res.json()
        showStatus('ok', `${result.count || rowsWithIds.length} entradas importadas`)
        setImportModalOpen(false)
        setImportPreview([])
        setImportErrors([])
        loadData()
      } else {
        showStatus('err', 'Error importando entradas')
      }
    } catch (err) {
      showStatus('err', 'Error: ' + String(err))
    }
    setImporting(false)
  }

  // ─── Excel Export (Template) ────────────────────────────────
  async function handleExportTemplate() {
    const XLSX = await import('xlsx')
    const header = ['FECHA', 'CLIENTE', 'CONCEPTO 1', 'CONCEPTO 2', 'CANTIDAD', 'OBSERVACIONES']
    const ws = XLSX.utils.aoa_to_sheet([header])
    // Set column widths
    ws['!cols'] = [
      { wch: 12 },  // FECHA
      { wch: 25 },  // CLIENTE
      { wch: 20 },  // CONCEPTO 1
      { wch: 20 },  // CONCEPTO 2
      { wch: 10 },  // CANTIDAD
      { wch: 30 },  // OBSERVACIONES
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entrada')
    XLSX.writeFile(wb, 'Plantilla_Entrada_HUALSA.xlsx')
  }

  // ─── Excel Export (Current Data) ────────────────────────────
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
    ws['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 10 },
      { wch: 30 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entradas')
    XLSX.writeFile(wb, `Entradas_HUALSA_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Recent entries (last 20 for quick view)
  const recentEntries = data.registros.slice(0, 20)

  return (
    <div className="flex flex-col gap-4">
      {/* Status bar */}
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
          statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {statusMsg.text}
        </div>
      )}

      {/* Form */}
      <Card className={`border-l-4 ${editingId ? 'border-l-amber-500 bg-amber-50/30' : 'border-l-[#2bb24c]'}`}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm uppercase tracking-wide text-slate-600">
            {editingId ? 'Editar Entrada' : 'Nueva Entrada'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid gap-3">
            <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-3">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Fecha</Label>
                <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Cliente</Label>
                <Select value={clienteId} onValueChange={v => { setClienteId(v); setC2('') }}>
                  <SelectTrigger><SelectValue placeholder="— Selecciona —" /></SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_80px_2fr_140px] gap-3 items-end">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Concepto 1</Label>
                <Select value={c1} onValueChange={v => { setC1(v); setC2('') }}>
                  <SelectTrigger><SelectValue placeholder="— C1 —" /></SelectTrigger>
                  <SelectContent>
                    {c1Options.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Concepto 2</Label>
                <Select value={c2} onValueChange={setC2}>
                  <SelectTrigger><SelectValue placeholder="— C2 —" /></SelectTrigger>
                  <SelectContent>
                    {c2Options.map(x => <SelectItem key={x.c2} value={x.c2}>{x.c2}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Cantidad</Label>
                <Input type="number" value={cant} onChange={e => setCant(e.target.value)} min="1" />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Observaciones</Label>
                <Input value={obs} onChange={e => setObs(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} className="bg-[#2bb24c] hover:bg-[#23963e] text-white flex-1" disabled={loading}>
                  <Save className="h-4 w-4 mr-1" />
                  {editingId ? 'ACTUALIZAR' : 'GUARDAR'}
                </Button>
                {editingId && (
                  <Button onClick={handleCancelEdit} variant="outline" size="icon">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Excel Import/Export bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#005bb5] hover:bg-[#003d7a] text-white"
            >
              <Upload className="h-4 w-4 mr-2" /> IMPORTAR EXCEL
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button onClick={handleExportData} variant="outline" disabled={data.registros.length === 0}>
              <Download className="h-4 w-4 mr-2" /> EXPORTAR EXCEL
            </Button>
            <Button onClick={handleExportTemplate} variant="outline" className="border-dashed">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> DESCARGAR PLANTILLA
            </Button>
            <span className="text-xs text-gray-400 ml-auto">
              Formato: FECHA | CLIENTE | CONCEPTO 1 | CONCEPTO 2 | CANTIDAD | OBSERVACIONES
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recent entries */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm uppercase tracking-wide text-slate-500">
            Últimas Entradas ({data.registros.length} total)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[400px]">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="sticky top-0">
                <tr className="bg-yellow-50">
                  <th className="p-2 text-left font-semibold border-b">Fecha</th>
                  <th className="p-2 text-left font-semibold border-b">Cliente</th>
                  <th className="p-2 text-left font-semibold border-b">Concepto 1</th>
                  <th className="p-2 text-left font-semibold border-b">Concepto 2</th>
                  <th className="p-2 text-left font-semibold border-b">Cant.</th>
                  <th className="p-2 text-left font-semibold border-b">Obs.</th>
                  <th className="p-2 text-left font-semibold border-b w-20">Acc.</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map(r => (
                  <tr key={r.id} className={`border-b hover:bg-gray-50 ${editingId === r.id ? 'bg-yellow-50' : ''}`}>
                    <td className="p-2">{fmtDate(r.fecha)}</td>
                    <td className="p-2">{r.cliente}</td>
                    <td className="p-2">{r.c1}</td>
                    <td className="p-2">{r.c2}</td>
                    <td className="p-2">{r.cant}</td>
                    <td className="p-2 text-gray-500">{r.obs}</td>
                    <td className="p-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {recentEntries.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay entradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Import Preview Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-[900px] max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#005bb5]" />
              Vista Previa de Importación
            </DialogTitle>
          </DialogHeader>

          {importErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-bold text-red-700 mb-1">Advertencias ({importErrors.length})</p>
              <div className="max-h-32 overflow-auto text-xs text-red-600 space-y-0.5">
                {importErrors.slice(0, 20).map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
                {importErrors.length > 20 && <div>... y {importErrors.length - 20} más</div>}
              </div>
            </div>
          )}

          <div className="text-sm text-gray-600 mb-2">
            Se encontraron <b>{importPreview.length}</b> filas.
            Filas con cliente reconocido: <b className="text-green-600">{importPreview.filter(r => r.clienteId).length}</b>
            {importPreview.filter(r => !r.clienteId).length > 0 && (
              <span className="text-red-600"> | Sin cliente: {importPreview.filter(r => !r.clienteId).length}</span>
            )}
          </div>

          <div className="overflow-auto max-h-[400px] border rounded-lg">
            <table className="w-full text-xs min-w-[600px]">
              <thead className="sticky top-0">
                <tr className="bg-gray-100">
                  <th className="p-2 text-left border-b">Estado</th>
                  <th className="p-2 text-left border-b">Fecha</th>
                  <th className="p-2 text-left border-b">Cliente</th>
                  <th className="p-2 text-left border-b">C1</th>
                  <th className="p-2 text-left border-b">C2</th>
                  <th className="p-2 text-left border-b">Cant.</th>
                  <th className="p-2 text-left border-b">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((r, i) => {
                  const ok = !!r.clienteId && !!r.fecha
                  return (
                    <tr key={i} className={`border-b ${ok ? '' : 'bg-red-50'}`}>
                      <td className="p-2">
                        {ok ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-400" />
                        )}
                      </td>
                      <td className="p-2">{r.fecha || '—'}</td>
                      <td className="p-2">
                        {r.cliente || '—'}
                        {r.clienteId && <span className="text-green-600 ml-1">✓</span>}
                      </td>
                      <td className="p-2">{r.c1 || '—'}</td>
                      <td className="p-2">{r.c2 || '—'}</td>
                      <td className="p-2">{r.cant}</td>
                      <td className="p-2 text-gray-400">{r.obs}</td>
                    </tr>
                  )
                })}
                {importPreview.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay datos para importar</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleImportConfirm}
              className="bg-[#2bb24c] hover:bg-[#23963e] text-white"
              disabled={importing || importPreview.filter(r => r.clienteId).length === 0}
            >
              {importing ? (
                <span className="animate-pulse">Importando...</span>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  IMPORTAR {importPreview.filter(r => r.clienteId).length} FILAS
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
