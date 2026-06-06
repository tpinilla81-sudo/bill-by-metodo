'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pencil, Trash2, Save, RotateCcw, Filter, FileSpreadsheet, Upload, Download, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react'
import { fmtCurrency, type Cliente, type CatalogoItem } from '@/lib/hualsa-utils'

interface CatalogoViewData {
  catalogo: CatalogoItem[]
  clientes: Cliente[]
}

export function CatalogoView() {
  const [data, setData] = useState<CatalogoViewData>({ catalogo: [], clientes: [] })
  const [initialized, setInitialized] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form
  const [clienteId, setClienteId] = useState('')
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [coste, setCoste] = useState('')
  const [inc, setInc] = useState('0')
  const [finalVal, setFinalVal] = useState('')

  // Filters
  const [fCli, setFCli] = useState('')
  const [fC1, setFC1] = useState('')
  const [fQ, setFQ] = useState('')

  // Excel import
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<Partial<CatalogoItem>[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [showExcelTools, setShowExcelTools] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Status
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const loadData = useCallback(async () => {
    const [catRes, cRes] = await Promise.all([fetch('/api/catalogo'), fetch('/api/clientes')])
    setData({ catalogo: await catRes.json(), clientes: await cRes.json() })
  }, [])

  if (!initialized) {
    setInitialized(true)
    loadData()
  }

  // Compute final price from coste + inc
  const computedFinal = useMemo(() => {
    const c = Number(coste) || 0
    const i = Number(inc) || 0
    return (c * (1 + i / 100)).toFixed(2)
  }, [coste, inc])

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 4000)
  }

  function resetForm() {
    setEditingId(null)
    setClienteId(''); setC1(''); setC2(''); setCoste(''); setInc('0'); setFinalVal('')
  }

  async function handleSave() {
    if (!c1 || !c2) { showStatus('err', 'Grupo (C1) y Servicio (C2) son obligatorios'); return }
    const finalPrice = finalVal || computedFinal
    const effectiveClienteId = (clienteId === '__none__' || !clienteId) ? '' : clienteId
    const body = { clienteId: effectiveClienteId, c1, c2, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(finalPrice) || 0 }
    if (editingId) {
      await fetch('/api/catalogo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
      showStatus('ok', 'Artículo actualizado ✓')
    } else {
      await fetch('/api/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      showStatus('ok', 'Artículo guardado ✓')
    }
    resetForm()
    loadData()
  }

  function handleEdit(x: CatalogoItem) {
    setEditingId(x.id)
    setClienteId(x.clienteId || '__none__'); setC1(x.c1); setC2(x.c2)
    setCoste(String(x.coste)); setInc(String(x.inc)); setFinalVal(String(x.final))
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar artículo?')) return
    await fetch(`/api/catalogo?id=${id}`, { method: 'DELETE' })
    showStatus('ok', 'Eliminado')
    loadData()
  }

  const { catalogo, clientes } = data

  // C1 options for filter
  const c1FilterOptions = [...new Set(catalogo.map(x => x.c1))].sort()

  // Filtered
  const filtered = catalogo.filter(x => {
    if (fCli === '__gen__' && x.clienteId) return false
    if (fCli && fCli !== '__gen__' && fCli !== '__all__' && x.clienteId !== fCli) return false
    if (fC1 && fC1 !== '__all__' && x.c1 !== fC1) return false
    if (fQ && !((x.c1 + ' ' + x.c2).toLowerCase().includes(fQ.toLowerCase()))) return false
    return true
  })

  // ─── Helper: get value from row trying multiple column names ───
  function getRowVal(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
        return String(row[k]).trim()
      }
    }
    return ''
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
        const workbook = XLSX.read(arrData, { type: 'array', cellDates: false })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]

        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          blankrows: false,
          raw: true,
        })

        if (rawRows.length === 0) {
          setImportErrors(['El archivo está vacío o no tiene datos'])
          setImportPreview([])
          setImportModalOpen(true)
          return
        }

        const errors: string[] = []
        const preview: Partial<CatalogoItem>[] = []

        // Load clientes for matching
        const clientesRes = await fetch('/api/clientes')
        const clientesList: Cliente[] = await clientesRes.json()

        rawRows.forEach((row, idx) => {
          const rowNum = idx + 2

          // Try all possible column name variants
          const rawC1 = getRowVal(row,
            'CONCEPTO 1', 'COCEPTO 1', 'CONCEPTO1', 'COCEPTO1',
            'C1', 'c1', 'concepto 1', 'cocepto 1', 'concepto1', 'cocepto1'
          )
          const rawC2 = getRowVal(row,
            'CONCEPTO 2', 'COCEPTO 2', 'CONCEPTO2', 'COCEPTO2',
            'C2', 'c2', 'concepto 2', 'cocepto 2', 'concepto2', 'cocepto2'
          )
          const rawCoste = getRowVal(row, 'COSTE', 'coste', 'Coste')
          const rawInc = getRowVal(row,
            'INCREMENTO', 'incremento', 'Incremento',
            'INC', 'inc', 'INC %', '% INC', '% INC', 'incremento %', 'INCREMENTO %'
          )
          const rawFinal = getRowVal(row,
            'PRECIO CLIENTE', 'PRECIO', 'precio cliente', 'precio',
            'P. FINAL', 'P FINAL', 'FINAL', 'final', 'Precio Final', 'precio final'
          )
          const rawCliente = getRowVal(row,
            'CLIENTE', 'cliente', 'Cliente'
          )

          // Skip empty rows
          if (!rawC1 && !rawC2 && !rawCoste && !rawInc && !rawFinal && !rawCliente) return

          const hasC1 = !!rawC1
          const hasC2 = !!rawC2
          if (!hasC1) errors.push(`Fila ${rowNum}: Concepto 1 vacío`)
          if (!hasC2) errors.push(`Fila ${rowNum}: Concepto 2 vacío`)

          const costeNum = Number(rawCoste) || 0
          const incNum = Number(rawInc) || 0
          // If PRECIO CLIENTE is given, use it; otherwise compute from coste + inc
          const finalNum = rawFinal ? Number(rawFinal) : (costeNum * (1 + incNum / 100))

          // Match cliente
          const matchedCliente = rawCliente
            ? clientesList.find(c =>
                c.nombre.toLowerCase() === rawCliente.toLowerCase() ||
                c.nombre.toLowerCase().includes(rawCliente.toLowerCase()) ||
                rawCliente.toLowerCase().includes(c.nombre.toLowerCase())
              )
            : null

          preview.push({
            clienteId: matchedCliente?.id || '',
            c1: rawC1,
            c2: rawC2,
            coste: costeNum,
            inc: incNum,
            final: Number(finalNum.toFixed(2)),
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
      const validRows = importPreview.filter(r => r.c1 && r.c2)
      if (validRows.length === 0) {
        showStatus('err', 'No hay filas válidas')
        setImporting(false)
        return
      }

      const rowsToImport = validRows.map(r => ({
        clienteId: r.clienteId || '',
        c1: r.c1 || '',
        c2: r.c2 || '',
        coste: r.coste || 0,
        inc: r.inc || 0,
        final: r.final || 0,
      }))

      const res = await fetch('/api/catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: rowsToImport })
      })

      if (res.ok) {
        const result = await res.json()
        showStatus('ok', `${result.count || validRows.length} artículos importados ✓`)
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
    const header = ['CONCEPTO 1', 'CONCEPTO 2', 'COSTE', 'INCREMENTO', 'PRECIO CLIENTE', 'CLIENTE']
    const ws = XLSX.utils.aoa_to_sheet([header])
    ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 25 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Catálogo')
    XLSX.writeFile(wb, 'Plantilla_Catalogo_HUALSA.xlsx')
  }

  async function handleExportData() {
    const XLSX = await import('xlsx')
    const rows = catalogo.map(x => {
      const cli = clientes.find(c => c.id === x.clienteId)
      return {
        'CONCEPTO 1': x.c1,
        'CONCEPTO 2': x.c2,
        COSTE: x.coste,
        INCREMENTO: x.inc,
        'PRECIO CLIENTE': x.final,
        CLIENTE: cli ? cli.nombre : '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 25 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Catálogo')
    XLSX.writeFile(wb, `Catalogo_HUALSA_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

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
      <Card className={`border-l-4 ${editingId ? 'border-l-indigo-500 bg-indigo-50/30' : 'border-l-transparent'}`}>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_130px] gap-3 items-end">
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger><SelectValue placeholder="— General —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— General —</SelectItem>
                  {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Grupo (C1)</Label>
              <Input value={c1} onChange={e => setC1(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Servicio (C2)</Label>
              <Input value={c2} onChange={e => setC2(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Coste (€)</Label>
              <Input type="number" step="0.01" value={coste} onChange={e => { setCoste(e.target.value); setFinalVal('') }} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">% Inc</Label>
              <Input type="number" step="0.01" value={inc} onChange={e => { setInc(e.target.value); setFinalVal('') }} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Precio Final</Label>
              <Input type="number" step="0.01" value={finalVal || computedFinal} readOnly className="bg-gray-50" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} className="bg-[#005bb5] hover:bg-[#003d7a] text-white flex-1">
                <Save className="h-4 w-4 mr-1" />
                {editingId ? 'ACTUALIZAR' : 'GUARDAR'}
              </Button>
              {editingId && (
                <Button onClick={resetForm} variant="outline" size="icon">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Excel Import/Export (collapsible) */}
      <Card>
        <CardContent className="p-0">
          <button
            onClick={() => setShowExcelTools(!showExcelTools)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#005bb5]" />
              <span className="text-sm font-semibold text-gray-700">Excel / Importar Catálogo</span>
            </div>
            <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${showExcelTools ? 'rotate-180' : ''}`} />
          </button>

          {showExcelTools && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
              <div className="flex flex-wrap gap-3">
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
                <Button onClick={handleExportData} variant="outline" disabled={catalogo.length === 0}>
                  <Download className="h-4 w-4 mr-2" /> EXPORTAR
                </Button>
                <Button onClick={handleExportTemplate} variant="outline" className="border-dashed">
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> PLANTILLA
                </Button>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Columnas: CONCEPTO 1 · CONCEPTO 2 · COSTE · INCREMENTO · PRECIO CLIENTE · CLIENTE (opcional)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-end">
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Cliente</Label>
              <Select value={fCli} onValueChange={setFCli}>
                <SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">— Todos —</SelectItem>
                  <SelectItem value="__gen__">— Generales —</SelectItem>
                  {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Grupo C1</Label>
              <Select value={fC1} onValueChange={setFC1}>
                <SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">— Todos —</SelectItem>
                  {c1FilterOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Buscar</Label>
              <Input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="C2, texto..." />
            </div>
            <Button variant="default" className="bg-[#005bb5] hover:bg-[#003d7a] text-white">
              <Filter className="h-4 w-4 mr-1" /> FILTRAR
            </Button>
            <Button variant="outline" onClick={() => { setFCli(''); setFC1(''); setFQ('') }}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-blue-50">
              <th className="p-2 text-left font-semibold border-b">Cliente</th>
              <th className="p-2 text-left font-semibold border-b">C1</th>
              <th className="p-2 text-left font-semibold border-b">C2</th>
              <th className="p-2 text-left font-semibold border-b">Coste</th>
              <th className="p-2 text-left font-semibold border-b">% Inc</th>
              <th className="p-2 text-left font-semibold border-b">P. Final</th>
              <th className="p-2 text-left font-semibold border-b">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(x => {
              const cli = clientes.find(c => c.id === x.clienteId)
              return (
                <tr key={x.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{cli ? cli.nombre : <i className="text-gray-400">— General —</i>}</td>
                  <td className="p-2">{x.c1}</td>
                  <td className="p-2">{x.c2}</td>
                  <td className="p-2">{fmtCurrency(x.coste)}</td>
                  <td className="p-2">{(Number(x.inc) || 0).toFixed(2)}%</td>
                  <td className="p-2 font-bold">{fmtCurrency(x.final)}</td>
                  <td className="p-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEdit(x)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(x.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay artículos</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Import Preview Modal ──────────────────────────── */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-[900px] max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[#005bb5]" />
              Vista Previa - Importar Catálogo
            </DialogTitle>
          </DialogHeader>

          {importErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-sm font-bold text-amber-700 mb-1">Advertencias ({importErrors.length})</p>
              <div className="max-h-28 overflow-auto text-xs text-amber-600 space-y-0.5">
                {importErrors.slice(0, 15).map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
                {importErrors.length > 15 && <div>... y {importErrors.length - 15} más</div>}
              </div>
            </div>
          )}

          <div className="text-sm text-gray-600 mb-2">
            <b>{importPreview.filter(r => r.c1 && r.c2).length}</b> filas válidas ·{' '}
            <b className="text-green-600">{importPreview.length} total</b>
          </div>

          <div className="overflow-auto max-h-[350px] border rounded-xl">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr className="bg-gray-100">
                  <th className="p-2 text-left border-b">✓</th>
                  <th className="p-2 text-left border-b">Concepto 1</th>
                  <th className="p-2 text-left border-b">Concepto 2</th>
                  <th className="p-2 text-right border-b">Coste</th>
                  <th className="p-2 text-right border-b">% Inc</th>
                  <th className="p-2 text-right border-b">P. Final</th>
                  <th className="p-2 text-left border-b">Cliente</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((r, i) => {
                  const ok = !!(r.c1 && r.c2)
                  const cli = r.clienteId ? clientes.find(c => c.id === r.clienteId) : null
                  return (
                    <tr key={i} className={`border-b ${ok ? '' : 'bg-red-50'}`}>
                      <td className="p-2">
                        {ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-red-400" />}
                      </td>
                      <td className="p-2">{r.c1 || '—'}</td>
                      <td className="p-2">{r.c2 || '—'}</td>
                      <td className="p-2 text-right">{r.coste?.toFixed(2) || '0.00'}</td>
                      <td className="p-2 text-right">{r.inc?.toFixed(2) || '0.00'}%</td>
                      <td className="p-2 text-right font-bold">{r.final?.toFixed(2) || '0.00'}</td>
                      <td className="p-2">
                        {cli ? cli.nombre : r.clienteId ? '' : <span className="text-gray-400">General</span>}
                      </td>
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
              disabled={importing || importPreview.filter(r => r.c1 && r.c2).length === 0}
            >
              {importing ? (
                <span className="animate-pulse">Importando...</span>
              ) : (
                <>IMPORTAR {importPreview.filter(r => r.c1 && r.c2).length} FILAS</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
