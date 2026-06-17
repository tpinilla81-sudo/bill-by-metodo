'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Save, CheckCircle, AlertCircle, Table, Download, Upload } from 'lucide-react'
import { todayISO, type Cliente, type CatalogoItem } from '@/lib/hualsa-utils'
import { useConfig, parseCustomData, serializeCustomData, type FieldDef } from '@/lib/config'
import { triggerBackup } from '@/lib/trigger-backup'

interface GrillaData {
  clientes: Cliente[]
  catalogo: CatalogoItem[]
}

interface GrillaRow {
  id: string
  fecha: string
  clienteId: string
  c1: string
  c2: string
  cant: string
  obs: string
  customValues: Record<string, string>
}

function uid() { return Math.random().toString(36).slice(2, 11) }

function emptyRow(fecha = todayISO()): GrillaRow {
  return { id: uid(), fecha, clienteId: '', c1: '', c2: '', cant: '1', obs: '', customValues: {} }
}

// Lookup price from catalog for preview
function lookupPrecio(catalogo: CatalogoItem[], c1: string, c2: string, clienteId: string): number {
  if (clienteId) {
    let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId === clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
    return it ? Number(it.final) || 0 : 0
  }
  let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
  return it ? Number(it.final) || 0 : 0
}

// Reverse-lookup client from catalog
function lookupCliente(catalogo: CatalogoItem[], c1: string, c2: string): string {
  const item = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId)
  return item?.clienteId || ''
}

export function EntradaGrilla() {
  const { config } = useConfig()
  const [data, setData] = useState<GrillaData>({ clientes: [], catalogo: [] })
  const [rows, setRows] = useState<GrillaRow[]>(() => Array.from({ length: 5 }, () => emptyRow()))
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [rowCountInput, setRowCountInput] = useState('5')

  const fieldDefs = config?.fieldsEntrada || []
  const customFields = fieldDefs.filter(f => f.isCustom && f.visible)
  const clienteVisible = fieldDefs.some(f => f.key === 'cliente' && f.visible)

  const loadData = useCallback(async () => {
    const [cRes, catRes] = await Promise.all([
      fetch('/api/clientes'),
      fetch('/api/catalogo'),
    ])
    setData({ clientes: await cRes.json(), catalogo: await catRes.json() })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Keep rowCountInput synced when rows change by other means (+5, +10, duplicate, delete, CSV import, etc.)
  useEffect(() => { setRowCountInput(String(rows.length)) }, [rows.length])

  // Build c1/c2 option lists for dropdowns
  const c1Options = useMemo(() => {
    const all = data.catalogo.map(c => c.c1).filter(Boolean)
    return [...new Set(all)].sort()
  }, [data.catalogo])

  // C2 options depend on selected c1 (per row) - we'll just provide all unique c2
  const allC2Options = useMemo(() => {
    const all = data.catalogo.map(c => c.c2).filter(Boolean)
    return [...new Set(all)].sort()
  }, [data.catalogo])

  function updateRow(id: string, patch: Partial<GrillaRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addRow() {
    const lastRow = rows[rows.length - 1]
    const newFecha = lastRow?.fecha || todayISO()
    const newClienteId = lastRow?.clienteId || ''
    setRows(prev => [...prev, emptyRow(newFecha)])
  }

  function addManyRows(n: number) {
    const lastRow = rows[rows.length - 1]
    const baseFecha = lastRow?.fecha || todayISO()
    const baseClienteId = lastRow?.clienteId || ''
    setRows(prev => [...prev, ...Array.from({ length: n }, () => ({ ...emptyRow(baseFecha), clienteId: baseClienteId }))])
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
    if (rows.length <= 1) {
      setRows([emptyRow()])
    }
  }

  function clearAll() {
    if (!confirm('¿Borrar todas las filas?')) return
    setRows(Array.from({ length: 5 }, () => emptyRow()))
  }

  // Set exact number of rows (add or remove from the end)
  function setRowCount(n: number) {
    const target = Math.max(1, Math.min(500, n))
    setRows(prev => {
      if (prev.length === target) return prev
      if (prev.length < target) {
        const lastRow = prev[prev.length - 1]
        const baseFecha = lastRow?.fecha || todayISO()
        const baseClienteId = lastRow?.clienteId || ''
        return [...prev, ...Array.from({ length: target - prev.length }, () => ({ ...emptyRow(baseFecha), clienteId: baseClienteId }))]
      }
      return prev.slice(0, target)
    })
  }

  function duplicateRow(id: string) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      const copy = { ...prev[idx], id: uid(), customValues: { ...prev[idx].customValues } }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  function fillDown(id: string, field: keyof GrillaRow) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      const value = prev[idx][field]
      return prev.map((r, i) => (i > idx && r[field] === '' ? { ...r, [field]: value } : r))
    })
  }

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 4000)
  }

  // Handle Enter key to move to next row's same column
  function handleKeyDown(e: React.KeyboardEvent, rowIdx: number, _field: string) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Add a new row if at the last one
      if (rowIdx === rows.length - 1) {
        addRow()
      }
      // Focus next row same column (best-effort)
      setTimeout(() => {
        const nextId = rows[rowIdx + 1]?.id || ''
        if (nextId) {
          const el = document.querySelector<HTMLElement>(`[data-row-id="${nextId}"][data-field="${_field}"]`)
          el?.focus()
        }
      }, 10)
    }
  }

  async function handleSave() {
    const validRows = rows.filter(r => r.fecha && r.c1 && r.c2)
    if (validRows.length === 0) {
      showStatus('err', 'No hay filas válidas (necesitan fecha, c1 y c2)')
      return
    }

    setSaving(true)
    try {
      const batch = validRows.map(r => {
        const customDataStr = customFields.length > 0 ? serializeCustomData(r.customValues, customFields as FieldDef[]) : ''
        let clienteId = r.clienteId
        if (!clienteId && !clienteVisible) {
          clienteId = lookupCliente(data.catalogo, r.c1, r.c2)
        }
        const cliente = data.clientes.find(c => c.id === clienteId)?.nombre || ''
        const precio = lookupPrecio(data.catalogo, r.c1, r.c2, clienteId)
        return {
          fecha: r.fecha,
          clienteId,
          cliente,
          c1: r.c1,
          c2: r.c2,
          cant: Number(r.cant) || 1,
          obs: r.obs,
          customData: customDataStr,
          precioUnitario: precio,
        }
      })

      const res = await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch, pasadoRegistro: false }),
      })
      const result = await res.json()
      if (!res.ok) {
        showStatus('err', result.error || 'Error al guardar')
        return
      }
      showStatus('ok', `${result.count} entrada(s) guardada(s) ✓`)
      setRows(Array.from({ length: 5 }, () => emptyRow()))
      triggerBackup()
    } catch (err) {
      console.error('Grilla save error:', err)
      showStatus('err', 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // CSV import
  function handleImportCSV(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result || '')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length === 0) return
      // Detect delimiter (comma or semicolon)
      const delim = lines[0].includes(';') ? ';' : ','
      // Skip header if it looks like one
      const firstLine = lines[0].toLowerCase()
      const hasHeader = firstLine.includes('fecha') || firstLine.includes('cliente') || firstLine.includes('c1')
      const dataLines = hasHeader ? lines.slice(1) : lines
      const newRows: GrillaRow[] = dataLines.map(line => {
        const parts = line.split(delim).map(p => p.trim().replace(/^"|"$/g, ''))
        return {
          id: uid(),
          fecha: parts[0] || todayISO(),
          clienteId: parts[1] || '',
          c1: parts[2] || '',
          c2: parts[3] || '',
          cant: parts[4] || '1',
          obs: parts[5] || '',
          customValues: {},
        }
      })
      setRows(newRows.length > 0 ? newRows : [emptyRow()])
      showStatus('ok', `${newRows.length} filas importadas`)
    }
    reader.readAsText(file)
  }

  function handleExportTemplate() {
    const header = 'fecha,clienteId,c1,c2,cantidad,observaciones'
    const example = `${todayISO()},,EJEMPLO_C1,EJEMPLO_C2,1,Ejemplo`
    const csv = `${header}\n${example}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_entradas.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Stats
  const validCount = rows.filter(r => r.fecha && r.c1 && r.c2).length
  const totalCant = rows.reduce((s, r) => s + (Number(r.cant) || 0), 0)
  const totalImporte = rows.reduce((s, r) => {
    if (!r.c1 || !r.c2) return s
    const cli = r.clienteId || (clienteVisible ? '' : lookupCliente(data.catalogo, r.c1, r.c2))
    const precio = lookupPrecio(data.catalogo, r.c1, r.c2, cli)
    return s + precio * (Number(r.cant) || 0)
  }, 0)

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3">
      {/* Status */}
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {statusMsg.text}
        </div>
      )}

      {/* Header with toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-lg px-4 py-2.5 shadow-sm border">
        <div className="flex items-center gap-2">
          <Table className="h-5 w-5 text-[#005bb5]" />
          <h2 className="text-sm font-bold text-slate-700">Entrada Masiva</h2>
          <span className="text-xs text-slate-500">
            {rows.length} filas · {validCount} válidas · {totalCant} unidades
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <Button variant="outline" size="sm" onClick={handleExportTemplate} title="Descargar plantilla CSV">
            <Download className="h-4 w-4 mr-1" /> Plantilla
          </Button>
          <label className="inline-flex items-center h-9 px-3 text-sm rounded-md border border-input bg-background hover:bg-accent cursor-pointer">
            <Upload className="h-4 w-4 mr-1" /> Importar CSV
            <input type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCSV(f); e.target.value = '' }} />
          </label>
          <div className="flex items-center gap-1.5 px-2 h-9 rounded-md border border-input bg-background">
            <span className="text-xs text-slate-500">Filas:</span>
            <input
              type="number"
              min={1}
              max={500}
              value={rowCountInput}
              onChange={e => setRowCountInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
              onBlur={() => setRowCount(Number(rowCountInput) || 1)}
              className="w-16 h-7 px-1 text-sm text-center border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-[#005bb5] rounded"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => addManyRows(5)} title="Añadir 5 filas">
            <Plus className="h-4 w-4 mr-1" /> +5
          </Button>
          <Button variant="outline" size="sm" onClick={() => addManyRows(10)} title="Añadir 10 filas">
            <Plus className="h-4 w-4 mr-1" /> +10
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll} title="Borrar todo">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 z-10">
            <tr className="text-left">
              <th className="px-2 py-2 w-10 text-center text-xs font-bold text-slate-500">#</th>
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[120px]">Fecha</th>
              {clienteVisible && <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[160px]">Cliente</th>}
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[140px]">Concepto 1</th>
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[140px]">Concepto 2</th>
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase w-20">Cant.</th>
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[160px]">Obs.</th>
              {customFields.map(f => (
                <th key={f.key} className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[120px]">{f.label}</th>
              ))}
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase w-24 text-right">Precio</th>
              <th className="px-2 py-2 w-24 text-center text-xs font-bold text-slate-500">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const detectedClienteId = !clienteVisible && !row.clienteId ? lookupCliente(data.catalogo, row.c1, row.c2) : row.clienteId
              const precio = row.c1 && row.c2 ? lookupPrecio(data.catalogo, row.c1, row.c2, detectedClienteId) : 0
              const isValid = row.fecha && row.c1 && row.c2
              return (
                <tr key={row.id} className={`border-t hover:bg-blue-50/30 ${!isValid ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-2 py-1 text-center text-xs text-slate-400">{idx + 1}</td>
                  <td className="px-1 py-1">
                    <input
                      type="date"
                      data-row-id={row.id}
                      data-field="fecha"
                      value={row.fecha}
                      onChange={e => updateRow(row.id, { fecha: e.target.value })}
                      onKeyDown={e => handleKeyDown(e, idx, 'fecha')}
                      className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                    />
                  </td>
                  {clienteVisible && (
                    <td className="px-1 py-1">
                      <select
                        data-row-id={row.id}
                        data-field="clienteId"
                        value={row.clienteId}
                        onChange={e => updateRow(row.id, { clienteId: e.target.value })}
                        onKeyDown={e => handleKeyDown(e, idx, 'clienteId')}
                        className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                      >
                        <option value="">—</option>
                        {data.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="px-1 py-1">
                    <CellCombo
                      value={row.c1}
                      options={c1Options}
                      rowId={row.id}
                      field="c1"
                      onChange={v => updateRow(row.id, { c1: v })}
                      onKeyDown={e => handleKeyDown(e, idx, 'c1')}
                      onFillDown={() => fillDown(row.id, 'c1')}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CellCombo
                      value={row.c2}
                      options={allC2Options}
                      rowId={row.id}
                      field="c2"
                      onChange={v => updateRow(row.id, { c2: v })}
                      onKeyDown={e => handleKeyDown(e, idx, 'c2')}
                      onFillDown={() => fillDown(row.id, 'c2')}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      data-row-id={row.id}
                      data-field="cant"
                      value={row.cant}
                      onChange={e => updateRow(row.id, { cant: e.target.value })}
                      onKeyDown={e => handleKeyDown(e, idx, 'cant')}
                      className="w-full h-8 px-1 text-sm text-right bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      data-row-id={row.id}
                      data-field="obs"
                      value={row.obs}
                      onChange={e => updateRow(row.id, { obs: e.target.value })}
                      onKeyDown={e => handleKeyDown(e, idx, 'obs')}
                      className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                    />
                  </td>
                  {customFields.map(f => (
                    <td key={f.key} className="px-1 py-1">
                      <input
                        type="text"
                        value={row.customValues[f.key] || ''}
                        onChange={e => updateRow(row.id, { customValues: { ...row.customValues, [f.key]: e.target.value } })}
                        onKeyDown={e => handleKeyDown(e, idx, f.key)}
                        className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right text-xs text-slate-600">
                    {precio > 0 ? `${precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'}
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => duplicateRow(row.id)} title="Duplicar" className="p-1 hover:bg-blue-100 rounded text-blue-600">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteRow(row.id)} title="Borrar" className="p-1 hover:bg-red-100 rounded text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-100 z-10 border-t-2 border-slate-300">
            <tr>
              <td colSpan={clienteVisible ? 5 : 4} className="px-3 py-2 text-right text-xs font-bold text-slate-600">TOTALES</td>
              <td className="px-2 py-2 text-right text-sm font-bold text-slate-700">{totalCant}</td>
              <td colSpan={customFields.length + 2} className="px-2 py-2 text-right text-sm font-bold text-[#005bb5]">
                {totalImporte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer with save */}
      <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 shadow-sm border">
        <div className="text-xs text-slate-500">
          💡 <b>Tip:</b> Enter para bajar a la siguiente fila · botón <b>+</b> para duplicar · el precio se autodetecta del catálogo
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" /> Añadir fila
          </Button>
          <Button onClick={handleSave} disabled={saving || validCount === 0} className="bg-[#2bb24c] hover:bg-[#239a3f] text-white">
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Guardando...' : `GUARDAR ${validCount} entrada(s)`}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── CellCombo: an input cell with autocomplete suggestions ───
function CellCombo({
  value,
  options,
  rowId,
  field,
  onChange,
  onKeyDown,
  onFillDown,
}: {
  value: string
  options: string[]
  rowId: string
  field: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onFillDown: () => void
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const wrapperRef = useRef<HTMLTableCellElement>(null)

  const filtered = useMemo(() => {
    if (!value) return options.slice(0, 50)
    return options.filter(o => o.toLowerCase().includes(value.toLowerCase())).slice(0, 50)
  }, [value, options])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) { setOpen(false) }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDownLocal(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && filtered.length > 0) { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && open && highlight >= 0) { e.preventDefault(); onChange(filtered[highlight]); setOpen(false); setHighlight(-1) }
    else if (e.key === 'Escape') { setOpen(false); setHighlight(-1) }
    else { onKeyDown(e) }
  }

  return (
    <td ref={wrapperRef} className="relative px-1 py-1">
      <input
        type="text"
        data-row-id={rowId}
        data-field={field}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDownLocal}
        className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 top-full mt-0.5 min-w-[180px] bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
          {value && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-blue-600 border-b"
              onMouseDown={e => { e.preventDefault(); onFillDown(); setOpen(false) }}
            >
              ↓ Rellenar hacia abajo
            </button>
          )}
          {filtered.map((s, i) => (
            <button
              key={s}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${i === highlight ? 'bg-[#005bb5] text-white' : 'hover:bg-gray-50'} ${s === value ? 'font-bold' : ''}`}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); setHighlight(-1) }}
              onMouseEnter={() => setHighlight(i)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </td>
  )
}
