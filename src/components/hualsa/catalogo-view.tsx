'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pencil, Trash2, Save, RotateCcw, Filter, FileSpreadsheet, Upload, Download, CheckCircle, AlertCircle, ChevronDown, Settings2, BookOpen, Merge } from 'lucide-react'
import { fmtCurrency, type Cliente, type CatalogoItem } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_FIELDS_CATALOGO, type FieldDef, parseCustomData, serializeCustomData } from '@/lib/config'
import { triggerBackup } from '@/lib/trigger-backup'

interface CatalogoViewData {
  catalogo: CatalogoItem[]
  clientes: Cliente[]
}

// ─── ComboInput: input con autocompletado a partir de sugerencias ───
// Igual patrón que en entrada-view.tsx. Permite escribir un valor nuevo o
// elegir uno ya existente. Así evitamos "VIAJE NAVE" vs "VIAJE  NAVE" vs
// "Viaje Nave" que causan duplicados no detectados.
function ComboInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
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
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-9 text-sm"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto">
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${i === highlight ? 'bg-[#005bb5] text-white' : 'hover:bg-gray-50'} ${s.toLowerCase() === value.toLowerCase() ? 'font-bold' : ''}`}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false) }}
              onMouseEnter={() => setHighlight(i)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Normaliza una cadena para comparar (trim + colapsar espacios + lowercase)
function normStr(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function CatalogoView() {
  const { config, update } = useConfig()
  const fieldDefs = config?.fieldsCatalogo || DEFAULT_FIELDS_CATALOGO
  const visibleFields = fieldDefs.filter(f => f.visible)
  const isVisible = (key: string) => visibleFields.some(f => f.key === key)
  const getLabel = (key: string) => fieldDefs.find(f => f.key === key)?.label || key

  const [data, setData] = useState<CatalogoViewData>({ catalogo: [], clientes: [] })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [localLabels, setLocalLabels] = useState<Record<string, string>>({})

  // Core form
  const [clienteId, setClienteId] = useState('')
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [coste, setCoste] = useState('')
  const [inc, setInc] = useState('0')
  const [finalVal, setFinalVal] = useState('')

  // Custom fields
  const [customValues, setCustomValues] = useState<Record<string, string>>({})

  // Filters
  const [fCli, setFCli] = useState('')
  const [fC1, setFC1] = useState('')
  const [fQ, setFQ] = useState('')

  // UI collapse states
  const [showFilters, setShowFilters] = useState(false)

  // Excel import
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<Partial<CatalogoItem>[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [showExcelTools, setShowExcelTools] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Unify modal — NO destructivo: solo normaliza C1/C2 y lista duplicados
  const [unifyModalOpen, setUnifyModalOpen] = useState(false)
  const [unifying, setUnifying] = useState(false)
  const [unifyResult, setUnifyResult] = useState<{
    totalItems: number
    normalized: number
    duplicateGroups: number
    duplicateItems: number
    duplicates: Array<{ c1: string; c2: string; clienteId: string; count: number; ids: string[] }>
  } | null>(null)

  // Duplicate detection on form
  const [dupWarning, setDupWarning] = useState<CatalogoItem | null>(null)
  const [checkingDup, setCheckingDup] = useState(false)

  const loadData = useCallback(async () => {
    const [catRes, cRes] = await Promise.all([
      fetch('/api/catalogo', { cache: 'no-store' }),
      fetch('/api/clientes', { cache: 'no-store' })
    ])
    setData({ catalogo: await catRes.json(), clientes: await cRes.json() })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const labels: Record<string, string> = {}
    fieldDefs.forEach(f => { labels[f.key] = f.label })
    setLocalLabels(labels)
  }, [fieldDefs])

  const computedFinal = useMemo(() => {
    const c = Number(coste) || 0; const i = Number(inc) || 0
    return (c * (1 + i / 100)).toFixed(2)
  }, [coste, inc])

  // Sugerencias para autocompletado C1 y C2 (valores únicos ya existentes)
  const c1Suggestions = useMemo(() => {
    return [...new Set(data.catalogo.map(x => x.c1))].sort((a, b) => a.localeCompare(b, 'es'))
  }, [data.catalogo])

  const c2Suggestions = useMemo(() => {
    // Si ya hay un C1 seleccionado, sugerir C2s que existan para ese C1 (case-insensitive)
    if (c1) {
      const c1n = normStr(c1)
      return [...new Set(
        data.catalogo.filter(x => normStr(x.c1) === c1n).map(x => x.c2)
      )].sort((a, b) => a.localeCompare(b, 'es'))
    }
    return [...new Set(data.catalogo.map(x => x.c2))].sort((a, b) => a.localeCompare(b, 'es'))
  }, [data.catalogo, c1])

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text }); setTimeout(() => setStatusMsg(null), 4000)
  }

  function resetForm() {
    setEditingId(null); setClienteId(''); setC1(''); setC2(''); setCoste(''); setInc('0'); setFinalVal(''); setCustomValues({})
    setDupWarning(null)
  }

  function setCustomValue(key: string, value: string) {
    setCustomValues(prev => ({ ...prev, [key]: value }))
  }

  // Comprobación en vivo de duplicado mientras se rellena el form
  useEffect(() => {
    if (!c1 || !c2) { setDupWarning(null); return }
    setCheckingDup(true)
    const effCli = (clienteId === '__none__' || !clienteId) ? '' : clienteId
    // Búsqueda local inmediata (sin esperar al servidor) para feedback rápido
    const c1n = normStr(c1)
    const c2n = normStr(c2)
    const clin = normStr(effCli)
    const found = data.catalogo.find(x =>
      normStr(x.c1) === c1n &&
      normStr(x.c2) === c2n &&
      normStr(x.clienteId || '') === clin &&
      x.id !== editingId
    )
    setDupWarning(found || null)
    setCheckingDup(false)
  }, [c1, c2, clienteId, editingId, data.catalogo])

  async function handleSave() {
    if (!c1 || !c2) { showStatus('err', 'Grupo (C1) y Servicio (C2) son obligatorios'); return }
    // Normalizar antes de guardar (trim + colapsar espacios dobles)
    const c1Norm = String(c1).trim().replace(/\s+/g, ' ')
    const c2Norm = String(c2).trim().replace(/\s+/g, ' ')
    const finalPrice = finalVal || computedFinal
    const effectiveClienteId = (clienteId === '__none__' || !clienteId) ? '' : clienteId
    const customDataStr = serializeCustomData(customValues)
    const body = { clienteId: effectiveClienteId, c1: c1Norm, c2: c2Norm, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(finalPrice) || 0, customData: customDataStr }

    // Detección de duplicado: si existe otro item con misma combinación (case-insensitive,
    // trim, colapsar espacios), preguntar al usuario antes de sobrescribir.
    if (dupWarning) {
      const cliName = dupWarning.clienteId
        ? (data.clientes.find(c => c.id === dupWarning.clienteId)?.nombre || '?')
        : '— General —'
      const ok = confirm(
        `Ya existe un artículo con:\n` +
        `  Grupo: ${dupWarning.c1}\n` +
        `  Servicio: ${dupWarning.c2}\n` +
        `  Cliente: ${cliName}\n` +
        `  Precio actual: ${fmtCurrency(dupWarning.final)}\n\n` +
        `¿Quieres SOBREESCRIBIRLO con los nuevos datos (${fmtCurrency(Number(finalPrice) || 0)})?`
      )
      if (!ok) {
        showStatus('err', 'Operación cancelada — ya existe ese artículo')
        return
      }
      // Sobrescribir el duplicado existente en vez de crear uno nuevo
      await fetch('/api/catalogo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dupWarning.id, ...body })
      })
      showStatus('ok', 'Artículo existente sobrescrito ✓')
    } else if (editingId) {
      await fetch('/api/catalogo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
      showStatus('ok', 'Artículo actualizado ✓')
    } else {
      await fetch('/api/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      showStatus('ok', 'Artículo guardado ✓')
    }
    resetForm(); triggerBackup(); loadData()
  }

  // Unificar catálogo: NO destructivo. Solo normaliza C1/C2 (trim + colapsar
  // espacios) y lista los grupos de duplicados para que el usuario decida
  // manualmente cuáles borrar. Ya NO borra nada automáticamente.
  async function handleUnify() {
    setUnifying(true)
    setUnifyResult(null)
    try {
      const res = await fetch('/api/catalogo/unify', { method: 'POST' })
      if (!res.ok) { alert('Error normalizando catálogo'); setUnifying(false); return }
      const r = await res.json()
      setUnifyResult({
        totalItems: r.totalItems,
        normalized: r.normalized,
        duplicateGroups: r.duplicateGroups,
        duplicateItems: r.duplicateItems,
        duplicates: r.duplicates || [],
      })
      showStatus('ok', `${r.normalized} normalizados · ${r.duplicateGroups} grupos duplicados`)
      triggerBackup(); loadData()
    } catch (err) {
      console.error(err)
      alert('Error inesperado')
    } finally {
      setUnifying(false)
    }
  }

  function handleEdit(x: CatalogoItem) {
    setEditingId(x.id); setClienteId(x.clienteId || '__none__'); setC1(x.c1); setC2(x.c2)
    setCoste(String(x.coste)); setInc(String(x.inc)); setFinalVal(String(x.final))
    const cd = parseCustomData((x as Record<string, unknown>).customData as string || '')
    setCustomValues(cd as Record<string, string>)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar artículo?')) return
    await fetch(`/api/catalogo?id=${id}`, { method: 'DELETE' }); showStatus('ok', 'Eliminado'); triggerBackup(); loadData()
  }

  const { catalogo, clientes } = data
  const c1FilterOptions = useMemo(
    () => [...new Set(catalogo.map(x => x.c1).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [catalogo]
  )

  const filtered = catalogo.filter(x => {
    if (fCli === '__gen__' && x.clienteId) return false
    if (fCli && fCli !== '__gen__' && fCli !== '__all__' && x.clienteId !== fCli) return false
    // Comparación normalizada para C1: el catálogo está normalizado, pero por si
    // acaso quedan variantes, el filtro debe coincidir igualmente
    if (fC1 && fC1 !== '__all__' && normStr(x.c1) !== normStr(fC1)) return false
    if (fQ && !((x.c1 + ' ' + x.c2).toLowerCase().includes(fQ.toLowerCase()))) return false
    return true
  })

  function getRowVal(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) { if (row[k] !== undefined && row[k] !== null && row[k] !== '') return String(row[k]).trim() }
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
        const errors: string[] = []; const preview: Partial<CatalogoItem>[] = []
        const clientesRes = await fetch('/api/clientes'); const clientesList: Cliente[] = await clientesRes.json()
        rawRows.forEach((row, idx) => {
          const rowNum = idx + 2
          const rawC1 = getRowVal(row, getLabel('c1'), 'CONCEPTO 1', 'C1', 'c1')
          const rawC2 = getRowVal(row, getLabel('c2'), 'CONCEPTO 2', 'C2', 'c2')
          const rawCoste = getRowVal(row, getLabel('coste'), 'COSTE', 'coste')
          const rawInc = getRowVal(row, getLabel('incremento'), 'INCREMENTO', 'incremento', 'INC')
          const rawFinal = getRowVal(row, getLabel('precioCliente'), 'PRECIO CLIENTE', 'PRECIO', 'final')
          const rawCliente = getRowVal(row, getLabel('cliente'), 'CLIENTE', 'cliente')
          if (!rawC1 && !rawC2 && !rawCoste && !rawInc && !rawFinal && !rawCliente) return
          if (!rawC1) errors.push(`Fila ${rowNum}: C1 vacío`)
          if (!rawC2) errors.push(`Fila ${rowNum}: C2 vacío`)
          const costeNum = Number(rawCoste) || 0; const incNum = Number(rawInc) || 0
          const finalNum = rawFinal ? Number(rawFinal) : (costeNum * (1 + incNum / 100))
          const matchedCliente = rawCliente ? clientesList.find(c => c.nombre.toLowerCase() === rawCliente.toLowerCase() || c.nombre.toLowerCase().includes(rawCliente.toLowerCase())) : null
          preview.push({ clienteId: matchedCliente?.id || '', c1: rawC1, c2: rawC2, coste: costeNum, inc: incNum, final: Number(finalNum.toFixed(2)) })
        })
        setImportErrors(errors); setImportPreview(preview); setImportModalOpen(true)
      } catch (err) { setImportErrors(['Error leyendo el archivo: ' + String(err)]); setImportPreview([]); setImportModalOpen(true) }
    }
    reader.readAsArrayBuffer(file); if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleImportConfirm() {
    if (importPreview.length === 0) return
    setImporting(true)
    try {
      const validRows = importPreview.filter(r => r.c1 && r.c2)
      if (validRows.length === 0) { showStatus('err', 'No hay filas válidas'); setImporting(false); return }
      const res = await fetch('/api/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch: validRows.map(r => ({ clienteId: r.clienteId || '', c1: r.c1 || '', c2: r.c2 || '', coste: r.coste || 0, inc: r.inc || 0, final: r.final || 0 })) }) })
      if (res.ok) { const result = await res.json(); showStatus('ok', `${result.count || validRows.length} artículos importados ✓`); setImportModalOpen(false); setImportPreview([]); setImportErrors([]); triggerBackup(); loadData() }
      else { showStatus('err', 'Error importando') }
    } catch (err) { showStatus('err', 'Error: ' + String(err)) }
    setImporting(false)
  }

  async function handleExportTemplate() {
    const XLSX = await import('xlsx')
    const header = [getLabel('c1'), getLabel('c2'), getLabel('coste'), getLabel('incremento'), getLabel('precioCliente'), getLabel('cliente')]
    const ws = XLSX.utils.aoa_to_sheet([header])
    ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 25 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Catálogo')
    const appName = config?.appName || 'HUALSA'; XLSX.writeFile(wb, `Plantilla_Catalogo_${appName}.xlsx`)
  }

  async function handleExportData() {
    const XLSX = await import('xlsx')
    const rows = catalogo.map(x => {
      const cli = clientes.find(c => c.id === x.clienteId)
      return { [getLabel('c1')]: x.c1, [getLabel('c2')]: x.c2, [getLabel('coste')]: x.coste, [getLabel('incremento')]: x.inc, [getLabel('precioCliente')]: x.final, [getLabel('cliente')]: cli ? cli.nombre : '' }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 25 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Catálogo')
    const appName = config?.appName || 'HUALSA'; const _d = new Date(); const _p = (n: number) => String(n).padStart(2, '0'); XLSX.writeFile(wb, `Catalogo_${appName}_${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}.xlsx`)
  }

  // Get display value for a catalogo item
  function getDisplayValue(x: CatalogoItem, field: FieldDef): string {
    if (field.isCustom) {
      const cd = parseCustomData((x as Record<string, unknown>).customData as string || '')
      return String(cd[field.key] || '')
    }
    switch (field.key) {
      case 'cliente': { const cli = clientes.find(c => c.id === x.clienteId); return cli ? cli.nombre : '' }
      case 'c1': return x.c1
      case 'c2': return x.c2
      case 'coste': return fmtCurrency(x.coste)
      case 'incremento': return (Number(x.inc) || 0).toFixed(2) + '%'
      case 'precioCliente': return fmtCurrency(x.final)
      default: return ''
    }
  }

  // Render custom field input
  function renderCustomFieldInput(field: FieldDef) {
    if (!field.isCustom) return null
    return (
      <div key={field.key}>
        <Label className="text-xs uppercase font-bold text-slate-500">{field.label}</Label>
        <Input
          type={field.type === 'number' ? 'number' : undefined}
          step={field.type === 'number' ? '0.01' : undefined}
          value={customValues[field.key] || ''}
          onChange={e => setCustomValue(field.key, e.target.value)}
          placeholder={field.placeholder || field.label}
        />
      </div>
    )
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
          <BookOpen className="h-5 w-5 text-[#005bb5]" />
          <h2 className="text-lg font-bold text-gray-700">Catálogo</h2>
          <button onClick={() => setShowFilters(!showFilters)} className={`ml-2 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${showFilters ? 'bg-blue-50 text-[#005bb5] border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-[#005bb5]'}`}>
            <Filter className="h-3 w-3" /> Filtros
          </button>
          <button onClick={() => setShowExcelTools(!showExcelTools)} className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${showExcelTools ? 'bg-blue-50 text-[#005bb5] border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-[#005bb5]'}`}>
            <FileSpreadsheet className="h-3 w-3" /> Transferir tabla
          </button>
          <button
            onClick={() => setUnifyModalOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 transition-colors"
            title="Fusionar artículos duplicados (mismo cliente + grupo + servicio, ignorando mayúsculas y espacios extra)"
          >
            <Merge className="h-3 w-3" /> Unificar
          </button>
        </div>

        {/* Form — always visible */}
        <Card className={`border-l-4 ${editingId ? 'border-l-indigo-500 bg-indigo-50/30' : 'border-l-transparent'}`}>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_130px] gap-3 items-end">
              {isVisible('cliente') && (
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">{getLabel('cliente')}</Label>
                  <Select value={clienteId} onValueChange={setClienteId}>
                    <SelectTrigger><SelectValue placeholder="— General —" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">— General —</SelectItem>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {isVisible('c1') && (
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Grupo ({getLabel('c1')})</Label>
                  <ComboInput value={c1} onChange={v => setC1(v)} suggestions={c1Suggestions} placeholder="Escribe o elige..." />
                </div>
              )}
              {isVisible('c2') && (
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Servicio ({getLabel('c2')})</Label>
                  <ComboInput value={c2} onChange={v => setC2(v)} suggestions={c2Suggestions} placeholder="Escribe o elige..." />
                </div>
              )}
              {isVisible('coste') && <div><Label className="text-xs uppercase font-bold text-slate-500">{getLabel('coste')} ({config?.currency || '€'})</Label><Input type="number" step="0.01" value={coste} onChange={e => { setCoste(e.target.value); setFinalVal('') }} /></div>}
              {isVisible('incremento') && <div><Label className="text-xs uppercase font-bold text-slate-500">{getLabel('incremento')} %</Label><Input type="number" step="0.01" value={inc} onChange={e => { setInc(e.target.value); setFinalVal('') }} /></div>}
              {isVisible('precioCliente') && <div><Label className="text-xs uppercase font-bold text-slate-500">Precio Final</Label><Input type="number" step="0.01" value={finalVal || computedFinal} readOnly className="bg-gray-50" /></div>}
              <div className="flex gap-2">
                <Button onClick={handleSave} className="bg-[#005bb5] hover:bg-[#003d7a] text-white flex-1"><Save className="h-4 w-4 mr-1" />{editingId ? 'ACTUALIZAR' : 'GUARDAR'}</Button>
                {editingId && <Button onClick={resetForm} variant="outline" size="icon"><RotateCcw className="h-4 w-4" /></Button>}
              </div>
            </div>
            {visibleFields.some(f => f.isCustom) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                {visibleFields.filter(f => f.isCustom).map(renderCustomFieldInput)}
              </div>
            )}
            {/* Aviso de duplicado detectado en vivo */}
            {dupWarning && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-xs">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <b>Ya existe un artículo con ese Grupo + Servicio + Cliente.</b><br />
                  Precio actual: <b>{fmtCurrency(dupWarning.final)}</b>. Al pulsar GUARDAR te preguntará si quieres <b>sobrescribirlo</b>.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Collapsible Filters */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-end">
                <div><Label className="text-xs uppercase font-bold text-slate-500">{getLabel('cliente')}</Label><Select value={fCli} onValueChange={setFCli}><SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger><SelectContent><SelectItem value="__all__">— Todos —</SelectItem><SelectItem value="__gen__">— Generales —</SelectItem>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Grupo {getLabel('c1')}</Label><Select value={fC1} onValueChange={setFC1}><SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger><SelectContent><SelectItem value="__all__">— Todos —</SelectItem>{c1FilterOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Buscar</Label><Input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="C2, texto..." /></div>
                <Button variant="default" className="bg-[#005bb5] hover:bg-[#003d7a] text-white"><Filter className="h-4 w-4 mr-1" /> FILTRAR</Button>
                <Button variant="outline" onClick={() => { setFCli(''); setFC1(''); setFQ('') }}><RotateCcw className="h-4 w-4" /></Button>
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
                <Button onClick={handleExportData} variant="outline" disabled={catalogo.length === 0}><Download className="h-4 w-4 mr-2" /> EXPORTAR</Button>
                <Button onClick={handleExportTemplate} variant="outline" className="border-dashed"><FileSpreadsheet className="h-4 w-4 mr-2" /> PLANTILLA</Button>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed mt-2">Columnas: {getLabel('c1')} · {getLabel('c2')} · {getLabel('coste')} · {getLabel('incremento')} · {getLabel('precioCliente')} · {getLabel('cliente')} (opcional)</p>
            </CardContent>
          </Card>
        )}

        {/* Stats bar — always visible */}
        <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-2.5 shadow-sm text-sm font-bold border">
          <span>Artículos:<b className="text-[#005bb5] ml-1">{filtered.length}</b></span>
        </div>
      </div>

      {/* ─── SCROLLABLE TABLE ─── */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border shadow-sm flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-blue-50">
                {visibleFields.map(f => (
                  <th key={f.key} className="p-2 text-left font-semibold border-b bg-blue-50">{f.label}</th>
                ))}
                <th className="p-2 text-left font-semibold border-b bg-blue-50">Acc.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(x => (
                <tr key={x.id} className="border-b hover:bg-gray-50">
                  {visibleFields.map(f => {
                    const val = getDisplayValue(x, f)
                    return <td key={f.key} className={`p-2 ${f.key === 'precioCliente' ? 'font-bold' : ''}`}>{val || (f.key === 'cliente' ? <i className="text-gray-400">— General —</i> : '')}</td>
                  })}
                  <td className="p-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEdit(x)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(x.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={visibleFields.length + 1} className="p-6 text-center text-gray-400">No hay artículos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Preview Modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-[900px] max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-[#005bb5]" />Vista Previa - Importar Catálogo</DialogTitle></DialogHeader>
          {importErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-sm font-bold text-amber-700 mb-1">Advertencias ({importErrors.length})</p>
              <div className="max-h-28 overflow-auto text-xs text-amber-600 space-y-0.5">{importErrors.slice(0, 15).map((err, i) => <div key={i}>{err}</div>)}{importErrors.length > 15 && <div>... y {importErrors.length - 15} más</div>}</div>
            </div>
          )}
          <div className="text-sm text-gray-600 mb-2"><b>{importPreview.filter(r => r.c1 && r.c2).length}</b> filas válidas · <b className="text-green-600">{importPreview.length} total</b></div>
          <div className="overflow-auto max-h-[350px] border rounded-xl">
            <table className="w-full text-xs">
              <thead className="sticky top-0"><tr className="bg-gray-100"><th className="p-2 text-left border-b">✓</th><th className="p-2 text-left border-b">{getLabel('c1')}</th><th className="p-2 text-left border-b">{getLabel('c2')}</th><th className="p-2 text-right border-b">{getLabel('coste')}</th><th className="p-2 text-right border-b">{getLabel('incremento')}</th><th className="p-2 text-right border-b">P. Final</th><th className="p-2 text-left border-b">{getLabel('cliente')}</th></tr></thead>
              <tbody>
                {importPreview.map((r, i) => { const ok = !!(r.c1 && r.c2); const cli = r.clienteId ? clientes.find(c => c.id === r.clienteId) : null; return (
                  <tr key={i} className={`border-b ${ok ? '' : 'bg-red-50'}`}><td className="p-2">{ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-red-400" />}</td><td className="p-2">{r.c1 || '—'}</td><td className="p-2">{r.c2 || '—'}</td><td className="p-2 text-right">{r.coste?.toFixed(2) || '0.00'}</td><td className="p-2 text-right">{r.inc?.toFixed(2) || '0.00'}%</td><td className="p-2 text-right font-bold">{r.final?.toFixed(2) || '0.00'}</td><td className="p-2">{cli ? cli.nombre : <span className="text-gray-400">General</span>}</td></tr>
                )})}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setImportModalOpen(false)} className="flex-1 h-12 rounded-xl">Cancelar</Button>
            <Button onClick={handleImportConfirm} className="flex-1 h-12 rounded-xl bg-[#2bb24c] hover:bg-[#23963e] text-white font-bold" disabled={importing || importPreview.filter(r => r.c1 && r.c2).length === 0}>{importing ? <span className="animate-pulse">Importando...</span> : <>IMPORTAR {importPreview.filter(r => r.c1 && r.c2).length} FILAS</>}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Unify Modal ─── */}
      <Dialog open={unifyModalOpen} onOpenChange={setUnifyModalOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5 text-orange-500" /> Unificar catálogo
            </DialogTitle>
          </DialogHeader>
          {!unifyResult ? (
            <>
              <div className="text-sm text-gray-700 space-y-3">
                <p>Esta operación es <b>NO destructiva</b>:</p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>Normaliza C1 y C2 de todos los artículos (quita espacios extra al inicio/final y colapsa dobles espacios).</li>
                  <li><b>NO borra duplicados</b> — solo te muestra cuántos grupos de duplicados hay para que los revises manualmente.</li>
                  <li>Así no se pierden precios distintos que tuvieran los duplicados.</li>
                </ul>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                  <b>Seguro:</b> no se elimina ningún artículo del catálogo.
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={() => setUnifyModalOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={handleUnify} disabled={unifying} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                  {unifying ? <span className="animate-pulse">Normalizando…</span> : <><Merge className="h-4 w-4 mr-1" /> Normalizar ahora</>}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-700 space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                  <p className="font-bold text-green-800">Catálogo normalizado ✓</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-500 uppercase">Total artículos</div>
                    <div className="text-xl font-bold">{unifyResult.totalItems}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2">
                    <div className="text-[10px] text-blue-500 uppercase">Normalizados</div>
                    <div className="text-xl font-bold text-blue-600">{unifyResult.normalized}</div>
                  </div>
                </div>
                {unifyResult.duplicateGroups > 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                    <p className="font-bold text-amber-800 mb-1">
                      ⚠ {unifyResult.duplicateGroups} grupos de duplicados ({unifyResult.duplicateItems} artículos)
                    </p>
                    <p className="text-amber-700 mb-2">Revisa manualmente estos artículos y borra los que no quieras mantener:</p>
                    <div className="max-h-[180px] overflow-auto bg-white rounded border border-amber-200">
                      {unifyResult.duplicates.slice(0, 30).map((d, i) => {
                        const cliName = d.clienteId
                          ? (data.clientes.find(c => c.id === d.clienteId)?.nombre || '?')
                          : '— General —'
                        return (
                          <div key={i} className="px-2 py-1 border-b border-amber-100 last:border-b-0">
                            <span className="font-semibold">{d.c1}</span> · <span>{d.c2}</span>
                            <span className="text-gray-500"> · {cliName}</span>
                            <span className="ml-2 text-amber-700 font-bold">×{d.count}</span>
                          </div>
                        )
                      })}
                      {unifyResult.duplicates.length > 30 && (
                        <div className="px-2 py-1 text-xs text-gray-500 italic">
                          … y {unifyResult.duplicates.length - 30} grupos más
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                    ✓ No hay duplicados. Todos los artículos tienen combinaciones únicas de Cliente + Grupo + Servicio.
                  </div>
                )}
                <p className="text-xs text-gray-500 text-center">
                  Se ha creado un backup automático.
                </p>
              </div>
              <Button onClick={() => { setUnifyModalOpen(false); setUnifyResult(null) }} className="w-full mt-4">Cerrar</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
