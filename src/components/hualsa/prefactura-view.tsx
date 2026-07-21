'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Printer, FileSpreadsheet, Receipt, RotateCcw, ArrowLeftRight, CheckCircle2, X, Filter, ChevronDown, ClipboardList, Plus } from 'lucide-react'
import { fmtCurrency, fmtDate, fmtMonth, todayISO, currentYear, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_LABELS_FACTURAS, type ResolvedConfig } from '@/lib/config'
import { triggerBackup } from '@/lib/trigger-backup'
import * as XLSX from 'xlsx'

interface FacturasData {
  registros: Registro[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
  seq: number
}

type LineaFactura = { fecha: string; c1: string; c2: string; cant: number; clienteId: string; obs: string; precioUnitario: number }
interface InvoiceData {
  cli: Cliente; lineas: LineaFactura[]
  iva: number; numero: string; fechaFact: string; modo: string; base: number; ivaImp: number; total: number
  registroIds: string[]
}

export function PreFacturaView() {
  const { config } = useConfig()
  const L = config?.labelsFacturas || DEFAULT_LABELS_FACTURAS
  const [data, setData] = useState<FacturasData>({ registros: [], clientes: [], catalogo: [], seq: 1 })
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fMes, setFMes] = useState('')
  const [fClientes, setFClientes] = useState<string[]>([])
  const [fC1s, setFC1s] = useState<string[]>([])
  const [fC2s, setFC2s] = useState<string[]>([])
  const [openClientes, setOpenClientes] = useState(false)
  const [openC1, setOpenC1] = useState(false)
  const [openC2, setOpenC2] = useState(false)

  // El número de factura se asigna después, en la pestaña FACTURAS
  // Aquí en PRE-FACTURA se genera siempre SIN número (en blanco)
  const [fFechaFact, setFFechaFact] = useState(todayISO())
  const [fIva, setFIva] = useState('')
  const [fModo, setFModo] = useState<'dia' | 'mes'>('dia')

  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [checkAll, setCheckAll] = useState(true)

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [createdMsg, setCreatedMsg] = useState('')

  const [showFacturados, setShowFacturados] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  const loadData = useCallback(async () => {
    const [rRes, cRes, catRes, seqRes] = await Promise.all([
      fetch('/api/registros'), fetch('/api/clientes'), fetch('/api/catalogo'), fetch('/api/factura-seq')
    ])
    const seq = (await seqRes.json()).seq
    setData({ registros: await rRes.json(), clientes: await cRes.json(), catalogo: await catRes.json(), seq })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('.relative')) {
        setOpenClientes(false); setOpenC1(false); setOpenC2(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // El número de factura se asigna después, en la pestaña FACTURAS
  // Aquí en PRE-FACTURA se genera siempre SIN número (en blanco)
  if (!fIva && config) {
    setFIva(String(config.defaultIva))
  }

  const { registros, clientes, catalogo } = data

  // Normaliza para comparar C1/C2 ignorando mayúsculas y espacios extra.
  // Necesario porque los registros pueden tener "viaje  nave" y el catálogo
  // "Viaje Nave" — deben coincidir al buscar precio y al filtrar.
  function normStr(s: string): string {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  }

  function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
    const a = normStr(c1Val), b = normStr(c2Val)
    let it = catalogo.find(x => normStr(x.c1) === a && normStr(x.c2) === b && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => normStr(x.c1) === a && normStr(x.c2) === b && !x.clienteId)
    if (!it) it = catalogo.find(x => normStr(x.c1) === a && normStr(x.c2) === b)
    return it ? Number(it.final) || 0 : 0
  }

  function getPrecio(r: Registro): number {
    return r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
  }

  // Opciones de filtro: vienen de los PROPIOS registros (no del catálogo) para que
  // muestre los valores que realmente existen en los registros. Aunque el catálogo
  // se haya normalizado, los registros pueden tener variantes ("viaje  nave" vs
  // "Viaje Nave") que deben aparecer como opciones.
  const allC1Options = useMemo(
    () => [...new Set(registros.map(r => r.c1).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [registros]
  )
  const c2OptionsFiltered = useMemo(() => {
    if (fC1s.length === 0) {
      return [...new Set(registros.map(r => r.c2).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
    }
    // Filtrar C2 por coincidencia normalizada con cualquiera de los C1s seleccionados
    const c1sNorm = fC1s.map(normStr)
    return [...new Set(
      registros.filter(r => c1sNorm.includes(normStr(r.c1))).map(r => r.c2).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es'))
  }, [registros, fC1s])

  function toggleMulti(current: string[], value: string): string[] {
    return current.includes(value) ? current.filter(v => v !== value) : [...current, value]
  }

  const filtered = useMemo(() => {
    // Pre-computar versiones normalizadas de los filtros C1/C2 para comparación rápida
    const fC1sNorm = fC1s.map(normStr)
    const fC2sNorm = fC2s.map(normStr)
    return registros.filter(r => {
      if (fDesde && r.fecha < fDesde) return false
      if (fHasta && r.fecha > fHasta) return false
      if (fMes && r.fecha.slice(0, 7) !== fMes) return false
      if (fClientes.length > 0 && !fClientes.includes(r.clienteId)) return false
      // Comparación normalizada: "Viaje Nave" en el filtro coincide con "viaje  nave" en el registro
      if (fC1sNorm.length > 0 && !fC1sNorm.includes(normStr(r.c1))) return false
      if (fC2sNorm.length > 0 && !fC2sNorm.includes(normStr(r.c2))) return false
      if (!showFacturados && r.facturado) return false
      return true
    }).sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [registros, fDesde, fHasta, fMes, fClientes, fC1s, fC2s, showFacturados])

  const selectedItems = filtered.filter(r => selection[r.id] !== false)
  const totalCant = selectedItems.reduce((s, r) => s + r.cant, 0)
  const totalBase = selectedItems.reduce((s, r) => s + getPrecio(r) * r.cant, 0)

  function toggleItem(id: string) {
    setSelection(prev => ({ ...prev, [id]: prev[id] === false ? true : false }))
  }

  function toggleAll() {
    const newVal = !checkAll
    const s: Record<string, boolean> = {}
    filtered.forEach(r => s[r.id] = newVal)
    setSelection(s)
    setCheckAll(newVal)
  }

  function handleAlternos() {
    const fechas = [...new Set(filtered.map(r => r.fecha))].sort()
    const quitar = new Set(fechas.filter((_, i) => i % 2 === 1))
    setSelection(prev => {
      const s = { ...prev }
      filtered.forEach(r => { if (quitar.has(r.fecha)) s[r.id] = false })
      return s
    })
  }

  async function handleQuitarFacturado() {
    const facturados = selectedItems.filter(r => r.facturado === true)
    if (!facturados.length) { alert('Selecciona registros facturados para quitar el estado'); return }
    if (!confirm(`¿Quitar estado "Facturado" de ${facturados.length} registro(s)?`)) return
    const ids = facturados.map(r => r.id)
    try {
      await fetch('/api/registros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchQuitarFacturado: true, ids })
      })
      setData(prev => ({
        ...prev,
        registros: prev.registros.map(r =>
          ids.includes(r.id) ? { ...r, facturado: false } : r
        )
      }))
      triggerBackup()
    } catch (err) { console.error('Error quitando facturado:', err) }
  }

  async function handleQuitarFacturadoSingle(id: string) {
    try {
      await fetch('/api/registros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, facturado: false })
      })
      setData(prev => ({
        ...prev,
        registros: prev.registros.map(r =>
          r.id === id ? { ...r, facturado: false } : r
        )
      }))
      triggerBackup()
    } catch (err) { console.error('Error quitando facturado:', err) }
  }

  // Crear factura: POST /api/facturas (persists + marks registros as facturado)
  async function handleGenerar() {
    const sel = selectedItems
    if (!sel.length) { alert('No hay líneas seleccionadas'); return }
    const cliIds = [...new Set(sel.map(r => r.clienteId))]
    const effectiveFCliente = fClientes.length === 1 ? fClientes[0] : ''
    const targetCliId = effectiveFCliente || cliIds[0]
    const cli = clientes.find(c => c.id === targetCliId) || { id: '', nombre: '(varios)', cif: '', dir: '', cp: '', ciudad: '', prov: '', mail: '', tel: '' }
    const lineasBase: LineaFactura[] = (effectiveFCliente ? sel.filter(r => r.clienteId === effectiveFCliente) : sel).map(r => ({ fecha: r.fecha, c1: r.c1, c2: r.c2, cant: r.cant, clienteId: r.clienteId, obs: r.obs || '', precioUnitario: getPrecio(r) }))
    const iva = Number(fIva) || 0

    let lineas: LineaFactura[]
    if (fModo === 'mes') {
      const map: Record<string, LineaFactura> = {}
      lineasBase.forEach(r => {
        const mes = r.fecha.slice(0, 7)
        const pu = r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
        const k = mes + '|' + r.c1 + '|' + r.c2 + '|' + pu.toFixed(2)
        if (!map[k]) map[k] = { fecha: mes + '-01', c1: r.c1, c2: r.c2, cant: 0, clienteId: r.clienteId, obs: '', precioUnitario: pu }
        map[k].cant += r.cant
      })
      lineas = Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha))
    } else {
      lineas = lineasBase
    }

    const base = lineas.reduce((s, r) => s + (r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)) * r.cant, 0)
    const ivaImp = base * iva / 100
    const total = base + ivaImp
    const registroIds = sel.map(r => r.id)

    setInvoiceData({ cli, lineas, iva, numero: '', fechaFact: fFechaFact, modo: fModo, base, ivaImp, total, registroIds })
    setModalOpen(true)
  }

  // Confirm: persist the factura
  async function handleConfirmarCrear() {
    if (!invoiceData) return
    try {
      const res = await fetch('/api/facturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: invoiceData.numero,
          fecha: invoiceData.fechaFact,
          clienteId: invoiceData.cli.id,
          clienteNombre: invoiceData.cli.nombre,
          clienteSnap: JSON.stringify(invoiceData.cli),
          lineas: invoiceData.lineas,
          iva: invoiceData.iva,
          base: invoiceData.base,
          ivaImp: invoiceData.ivaImp,
          total: invoiceData.total,
          modo: invoiceData.modo,
          registroIds: invoiceData.registroIds,
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Error creando factura: ' + (err.error || res.status))
        return
      }
      const { factura } = await res.json()
      // update local registros (mark facturado)
      setData(prev => ({
        ...prev,
        registros: prev.registros.map(r =>
          invoiceData.registroIds.includes(r.id) ? { ...r, facturado: true } : r
        ),
      }))
      setCreatedMsg(`✅ Pre-factura creada (sin número) — visible en la pestaña FACTURAS para asignar el Nº`)
      setModalOpen(false)
      triggerBackup()
      setTimeout(() => setCreatedMsg(''), 6000)
    } catch (err) {
      console.error('Error creando factura:', err)
      alert('Error inesperado al crear factura')
    }
  }

  function handlePrintInvoice(inv: InvoiceData, cat: CatalogoItem[], cfg: ResolvedConfig | null) {
    const LL = cfg?.labelsFacturas || DEFAULT_LABELS_FACTURAS
    const { cli, lineas, iva, numero, fechaFact, modo, base, ivaImp, total } = inv
    const fechaLbl = (iso: string) => modo === 'mes' ? fmtMonth(iso) : fmtDate(iso)

    function pu(c1Val: string, c2Val: string, cliId: string): number {
      const a = normStr(c1Val), b = normStr(c2Val)
      let it = cat.find(x => normStr(x.c1) === a && normStr(x.c2) === b && x.clienteId === cliId)
      if (!it) it = cat.find(x => normStr(x.c1) === a && normStr(x.c2) === b && !x.clienteId)
      if (!it) it = cat.find(x => normStr(x.c1) === a && normStr(x.c2) === b)
      return it ? Number(it.final) || 0 : 0
    }

    const logoSrc = cfg?.logo
      ? (cfg.logo.startsWith('data:') ? cfg.logo : `data:image/png;base64,${cfg.logo}`)
      : ''

    const lineasHtml = lineas.map(r => {
      const p = r.precioUnitario > 0 ? r.precioUnitario : pu(r.c1, r.c2, r.clienteId)
      return `<tr>
        <td style="padding:7px 10px;border:1px solid #bbb;">${fechaLbl(r.fecha)}</td>
        <td style="padding:7px 10px;border:1px solid #bbb;">${r.c1}${r.c2 ? ' - ' + r.c2 : ''}${r.obs ? ' (' + r.obs + ')' : ''}</td>
        <td style="padding:7px 10px;border:1px solid #bbb;text-align:right;">${r.cant}</td>
        <td style="padding:7px 10px;border:1px solid #bbb;text-align:right;">${p.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
        <td style="padding:7px 10px;border:1px solid #bbb;text-align:right;">${(p * r.cant).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${numero}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.45; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .page { width: 100%; max-width: 210mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 3px solid #2bb24c; }
  .company-info { flex: 1; }
  .company-name { font-size: 18pt; font-weight: 800; color: #1a1a1a; margin-bottom: 4px; }
  .company-detail { font-size: 10pt; color: #444; line-height: 1.5; }
  .company-detail b { color: #1a1a1a; }
  .logo-area { margin-left: 20px; }
  .logo-area img { max-width: 240px; max-height: 100px; object-fit: contain; }
  .factura-badge { display: inline-block; margin-top: 12px; padding: 8px 16px; border: 2px solid #1a1a1a; background: #f5f5f5; font-size: 11pt; line-height: 1.6; }
  .factura-badge b { font-size: 11pt; }
  .client-box { border: 2px solid #1a1a1a; padding: 14px 18px; margin-bottom: 24px; background: #f9f9f9; font-size: 11pt; line-height: 1.6; }
  .client-box b { color: #1a1a1a; }
  .client-label { font-size: 9pt; text-transform: uppercase; color: #888; letter-spacing: 1px; margin-bottom: 4px; }
  table.lines { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10.5pt; }
  table.lines thead th { background: #1a1a1a; color: #fff; padding: 9px 10px; text-align: left; font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #1a1a1a; }
  table.lines thead th:nth-child(3), table.lines thead th:nth-child(4), table.lines thead th:nth-child(5) { text-align: right; }
  table.lines tbody tr:nth-child(even) { background: #fafafa; }
  table.lines tbody td { padding: 7px 10px; border: 1px solid #ccc; }
  table.lines tbody td:nth-child(3), table.lines tbody td:nth-child(4), table.lines tbody td:nth-child(5) { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-left: auto; border-collapse: collapse; font-size: 11pt; }
  .totals td { padding: 8px 14px; border: 1px solid #1a1a1a; }
  .totals .label { background: #e8e8e8; font-weight: 700; text-align: right; min-width: 170px; }
  .totals .value { text-align: right; min-width: 140px; font-variant-numeric: tabular-nums; }
  .totals .total-row { background: #2bb24c; color: #fff; font-weight: 800; font-size: 13pt; }
  .totals .total-row td { border-color: #2bb24c; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 8.5pt; color: #999; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="company-info">
      <div class="company-name">${cfg?.companyFullName || 'EMPRESA'}</div>
      <div class="company-detail">
        ${cfg?.companyAddress ? cfg.companyAddress + '<br>' : ''}
        ${cfg?.companyCity ? cfg.companyCity : ''}${cfg?.companyProvince ? ' ' + cfg.companyProvince : ''}${(cfg?.companyCity || cfg?.companyProvince) ? '<br>' : ''}
        ${cfg?.companyCif ? '<b>CIF:</b> ' + cfg.companyCif : ''}
      </div>
      <div class="factura-badge">
        <b>${LL.numero}:</b> ${numero}<br>
        <b>${LL.fecha}:</b> ${fmtDate(fechaFact)}
      </div>
    </div>
    ${logoSrc ? '<div class="logo-area"><img src="' + logoSrc + '" alt="Logo"></div>' : ''}
  </div>
  <div class="client-label">DATOS DEL CLIENTE</div>
  <div class="client-box">
    <b>${LL.cliente}:</b> ${cli.nombre}<br>
    ${cli.cif ? '<b>CIF:</b> ' + cli.cif + '<br>' : ''}
    ${cli.dir ? cli.dir + '<br>' : ''}
    ${cli.cp || cli.ciudad || cli.prov ? (cli.cp ? cli.cp + ' ' : '') + (cli.ciudad || '') + (cli.prov ? ' (' + cli.prov + ')' : '') : ''}
  </div>
  <table class="lines">
    <thead>
      <tr>
        <th style="width:90px;">${LL.fecha}</th>
        <th>${LL.concepto}</th>
        <th style="width:70px;">${LL.cantidad}</th>
        <th style="width:120px;">${LL.precioUnitario}</th>
        <th style="width:120px;">${LL.importe}</th>
      </tr>
    </thead>
    <tbody>${lineasHtml}</tbody>
  </table>
  <table class="totals">
    <tr><td class="label">${LL.baseImponible}</td><td class="value">${fmtCurrency(base)}</td></tr>
    <tr><td class="label">IVA ${iva}%</td><td class="value">${fmtCurrency(ivaImp)}</td></tr>
    <tr class="total-row"><td>${LL.totalFactura}</td><td>${fmtCurrency(total)}</td></tr>
  </table>
  <div class="footer">${cfg?.companyFullName || 'EMPRESA'} &mdash; ${cfg?.companyAddress || ''} ${cfg?.companyCity || ''}</div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    const printWin = window.open('', '_blank', 'width=900,height=700')
    if (printWin) { printWin.document.write(html); printWin.document.close() }
  }

  function handleExportExcel() {
    if (!invoiceData) return
    const { cli, lineas, iva, numero, fechaFact, base, ivaImp, total, modo } = invoiceData
    const fechaLbl = (iso: string) => modo === 'mes' ? fmtMonth(iso) : fmtDate(iso)
    const wb = XLSX.utils.book_new()
    const wsData: (string | number)[][] = []
    wsData.push([config?.companyFullName || 'EMPRESA'])
    wsData.push([config?.companyAddress || ''])
    wsData.push([(config?.companyCity || '') + ' ' + (config?.companyProvince || '')])
    if (config?.companyCif) wsData.push(['CIF: ' + config.companyCif])
    else wsData.push([])
    wsData.push([])
    wsData.push([L.numero + ':', numero])
    wsData.push([L.fecha + ':', fmtDate(fechaFact)])
    wsData.push([])
    wsData.push([L.cliente + ':', cli.nombre])
    wsData.push(['CIF:', cli.cif])
    wsData.push(['Dirección:', `${cli.dir} ${cli.cp} ${cli.ciudad} ${cli.prov}`])
    wsData.push([])
    wsData.push([L.fecha, L.concepto, L.cantidad, L.precioUnitario, L.importe])
    lineas.forEach(r => {
      const pu = r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
      wsData.push([fechaLbl(r.fecha), r.c1 + (r.c2 ? ' - ' + r.c2 : ''), r.cant, pu, pu * r.cant])
    })
    wsData.push([])
    wsData.push(['', '', '', L.baseImponible, base])
    wsData.push(['', '', '', `IVA ${iva}%`, ivaImp])
    wsData.push(['', '', '', L.totalFactura, total])
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 16 }, { wch: 16 }]
    const companyCell = ws['A1']
    if (companyCell) { companyCell.s = { font: { bold: true, sz: 16 } } }
    const headerRowIndex = wsData.findIndex(row => row[0] === L.fecha && row[1] === L.concepto)
    if (headerRowIndex >= 0) {
      for (let c = 0; c < 5; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: headerRowIndex, c })]
        if (cell) { cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1A1A1A' } }, alignment: { horizontal: c >= 2 ? 'right' : 'left' } } }
      }
    }
    const totalRowIndex = wsData.length - 1
    for (let c = 0; c < 5; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: totalRowIndex, c })]
      if (cell) { cell.s = { font: { bold: true } } }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Factura')
    XLSX.writeFile(wb, `Factura_${numero.replace(/\//g, '-')}.xlsx`)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-shrink-0 space-y-3 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ClipboardList className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-bold text-gray-700">{config?.sectionPreFactura || 'PRE-FACTURA'}</h2>
          <button onClick={() => setShowFilters(!showFilters)} className={`ml-2 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${showFilters ? 'bg-blue-50 text-[#005bb5] border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-[#005bb5]'}`}>
            <Filter className="h-3 w-3" /> Filtros
          </button>
          <span className="text-xs text-gray-500 ml-auto">Genera facturas que luego se gestionan en FACTURAS</span>
        </div>

        {createdMsg && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-300 text-green-800 rounded-lg text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" /> {createdMsg}
          </div>
        )}

        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_auto_auto_auto_auto] gap-3 items-end">
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Desde</Label>
                  <Input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Hasta</Label>
                  <Input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Mes</Label>
                  <Input type="month" value={fMes} onChange={e => setFMes(e.target.value)} />
                </div>
                <div className="relative">
                  <Label className="text-xs uppercase font-bold text-slate-500">Cliente{fClientes.length > 0 ? ` (${fClientes.length})` : ''}</Label>
                  <button type="button" onClick={() => { setOpenClientes(!openClientes); setOpenC1(false); setOpenC2(false) }} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                    <span className="truncate">{fClientes.length === 0 ? '— Todos —' : clientes.filter(c => fClientes.includes(c.id)).map(c => c.nombre).join(', ')}</span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
                  </button>
                  {openClientes && (
                    <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {clientes.map(c => (
                        <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
                          <Checkbox checked={fClientes.includes(c.id)} onCheckedChange={() => setFClientes(prev => toggleMulti(prev, c.id))} />
                          <span className="truncate">{c.nombre}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Label className="text-xs uppercase font-bold text-slate-500">Concepto 1{fC1s.length > 0 ? ` (${fC1s.length})` : ''}</Label>
                  <button type="button" onClick={() => { setOpenC1(!openC1); setOpenClientes(false); setOpenC2(false) }} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                    <span className="truncate">{fC1s.length === 0 ? '— Todos —' : fC1s.join(', ')}</span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
                  </button>
                  {openC1 && (
                    <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {allC1Options.map(opt => (
                        <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
                          <Checkbox checked={fC1s.includes(opt)} onCheckedChange={() => { setFC1s(prev => toggleMulti(prev, opt)); setFC2s([]) }} />
                          <span className="truncate">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Label className="text-xs uppercase font-bold text-slate-500">Concepto 2{fC2s.length > 0 ? ` (${fC2s.length})` : ''}</Label>
                  <button type="button" onClick={() => { setOpenC2(!openC2); setOpenClientes(false); setOpenC1(false) }} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                    <span className="truncate">{fC2s.length === 0 ? '— Todos —' : fC2s.join(', ')}</span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
                  </button>
                  {openC2 && (
                    <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {c2OptionsFiltered.map(opt => (
                        <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
                          <Checkbox checked={fC2s.includes(opt)} onCheckedChange={() => setFC2s(prev => toggleMulti(prev, opt))} />
                          <span className="truncate">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="outline" onClick={() => { setFDesde(''); setFHasta(''); setFMes(''); setFClientes([]); setFC1s([]); setFC2s([]) }}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto_auto] gap-3 items-end">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Fecha factura</Label>
                <Input type="date" value={fFechaFact} onChange={e => setFFechaFact(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">IVA %</Label>
                <Input type="number" value={fIva} onChange={e => setFIva(e.target.value)} step="0.01" />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Agrupar por</Label>
                <Select value={fModo} onValueChange={v => setFModo(v as 'dia' | 'mes')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia">Días</SelectItem>
                    <SelectItem value="mes">Mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handleAlternos} title="Desmarca días alternos">
                <ArrowLeftRight className="h-4 w-4 mr-1" /> Alternos
              </Button>
              <Button variant="outline" onClick={() => { setFDesde(''); setFHasta(''); setFMes(''); setFClientes([]); setFC1s([]); setFC2s([]) }}>
                <RotateCcw className="h-4 w-4 mr-1" /> Limpiar
              </Button>
              <Button onClick={handleGenerar} className="bg-orange-500 hover:bg-orange-600 text-white">
                <Plus className="h-4 w-4 mr-1" /> Crear Pre-Factura
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-2.5 shadow-sm text-sm font-bold border items-center">
          <span>Líneas:<b className="text-[#005bb5] ml-1">{filtered.length}</b></span>
          <span>Seleccionadas:<b className="text-[#005bb5] ml-1">{selectedItems.length}</b></span>
          <span>Cantidad:<b className="text-[#005bb5] ml-1">{totalCant}</b></span>
          <span>Base:<b className="text-[#005bb5] ml-1">{fmtCurrency(totalBase)}</b></span>
          {selectedItems.some(r => r.facturado) && (
            <Button variant="outline" size="sm" onClick={handleQuitarFacturado} className="text-orange-600 border-orange-300 hover:bg-orange-50 text-xs h-7">
              <X className="h-3 w-3 mr-1" /> Quitar facturado
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Checkbox id="showFacturados" checked={showFacturados} onCheckedChange={(v) => setShowFacturados(v === true)} />
            <Label htmlFor="showFacturados" className="text-xs font-semibold text-slate-600 cursor-pointer select-none">Mostrar facturados</Label>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-lg border shadow-sm flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-orange-50">
                <th className="p-2 text-left border-b w-10 bg-orange-50"><Checkbox checked={checkAll} onCheckedChange={toggleAll} /></th>
                <th className="p-2 text-left font-semibold border-b bg-orange-50">Fecha</th>
                <th className="p-2 text-left font-semibold border-b bg-orange-50">Cliente</th>
                <th className="p-2 text-left font-semibold border-b bg-orange-50">C1</th>
                <th className="p-2 text-left font-semibold border-b bg-orange-50">C2</th>
                <th className="p-2 text-left font-semibold border-b bg-orange-50">Cant</th>
                <th className="p-2 text-left font-semibold border-b bg-orange-50">P.Unit</th>
                <th className="p-2 text-left font-semibold border-b bg-orange-50">Importe</th>
                <th className="p-2 text-left font-semibold border-b bg-orange-50">Obs</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const pu = getPrecio(r)
                const imp = pu * r.cant
                const sel = selection[r.id] !== false
                const isFacturado = r.facturado === true
                return (
                  <tr key={r.id} className={`border-b ${sel ? '' : 'opacity-40'} ${isFacturado ? 'border-l-4 border-l-green-500 bg-green-50/40' : ''}`}>
                    <td className="p-2 flex items-center gap-1">
                      <Checkbox checked={sel} onCheckedChange={() => toggleItem(r.id)} />
                      {isFacturado && (
                        <button onClick={() => handleQuitarFacturadoSingle(r.id)} title="Quitar estado facturado" className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full whitespace-nowrap hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer">
                          <CheckCircle2 className="h-3 w-3" /> Facturado
                          <X className="h-2.5 w-2.5 ml-0.5 opacity-60" />
                        </button>
                      )}
                    </td>
                    <td className="p-2">{fmtDate(r.fecha)}</td>
                    <td className="p-2">{r.cliente}</td>
                    <td className="p-2">{r.c1}</td>
                    <td className="p-2">{r.c2}</td>
                    <td className="p-2">{r.cant}</td>
                    <td className="p-2">{fmtCurrency(pu)}</td>
                    <td className="p-2 font-bold">{fmtCurrency(imp)}</td>
                    <td className="p-2">{r.obs}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-gray-400">No hay registros para facturar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-[900px] max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Pre-Factura — Confirmar creación</DialogTitle>
          </DialogHeader>
          {invoiceData && <InvoicePreview data={invoiceData} catalogo={catalogo} config={config} />}
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => invoiceData && handlePrintInvoice(invoiceData, catalogo, config)}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir A4
            </Button>
            <Button variant="outline" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
            </Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleConfirmarCrear}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar y crear
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InvoicePreview({ data, catalogo, config }: {
  data: InvoiceData
  catalogo: CatalogoItem[]
  config: import('@/lib/config').ResolvedConfig | null
}) {
  const L = config?.labelsFacturas || DEFAULT_LABELS_FACTURAS
  const { cli, lineas, iva, numero, fechaFact, modo, base, ivaImp, total } = data
  const fechaLbl = (iso: string) => modo === 'mes' ? fmtMonth(iso) : fmtDate(iso)

  function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
    // Normalizada: "Viaje Nave" en catálogo coincide con "viaje  nave" en el registro
    const a = String(c1Val || '').trim().replace(/\s+/g, ' ').toLowerCase()
    const b = String(c2Val || '').trim().replace(/\s+/g, ' ').toLowerCase()
    let it = catalogo.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b && !x.clienteId)
    if (!it) it = catalogo.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b)
    return it ? Number(it.final) || 0 : 0
  }

  return (
    <div className="font-[family-name:var(--font-geist-sans)] text-black text-[11pt] leading-[1.35]">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div className="text-[10.5pt] leading-[1.4]">
          <h2 className="text-[14pt] font-extrabold text-black mb-1">{config?.companyFullName || 'EMPRESA'}</h2>
          {config?.companyAddress && <>{config.companyAddress}<br /></>}
          {config?.companyCity && <>{config.companyCity}</>}
          {config?.companyProvince && <> {config.companyProvince}</>}
          {(config?.companyCity || config?.companyProvince) && <br />}
          {config?.companyCif && <><b>CIF:</b> {config.companyCif}<br /></>}
          <div className="mt-2 border border-black p-2 text-[10.5pt] w-fit">
            <b>{L.numero}:</b> {numero}<br />
            <b>{L.fecha}:</b> {fmtDate(fechaFact)}
          </div>
        </div>
        {config?.logo ? (
          <img src={config.logo.startsWith('data:') ? config.logo : `data:image/png;base64,${config.logo}`} alt="Logo" style={{ maxWidth: '230px', height: 'auto', objectFit: 'contain' }} />
        ) : null}
      </div>
      <div className="border border-black p-3 mb-4 text-[11pt] bg-gray-50">
        <b>{L.cliente}:</b> {cli.nombre}<br />
        {cli.cif && <><b>CIF:</b> {cli.cif}<br /></>}
        {cli.dir}{cli.dir && <br />}
        {cli.cp} {cli.ciudad} {cli.prov}
      </div>
      <table className="w-full border-collapse text-[10.5pt] mb-3">
        <thead>
          <tr>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt] w-[90px]">{L.fecha}</th>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt]">{L.concepto}</th>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt] w-[60px]">{L.cantidad}</th>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt] w-[110px]">{L.precioUnitario}</th>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt] w-[110px]">{L.importe}</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((r, i) => {
            const pu = r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
            return (
              <tr key={i}>
                <td className="p-2 border border-gray-400">{fechaLbl(r.fecha)}</td>
                <td className="p-2 border border-gray-400">{r.c1}{r.c2 ? ' - ' + r.c2 : ''}{r.obs ? ` (${r.obs})` : ''}</td>
                <td className="p-2 border border-gray-400 text-right">{r.cant}</td>
                <td className="p-2 border border-gray-400 text-right">{pu.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                <td className="p-2 border border-gray-400 text-right">{(pu * r.cant).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <table className="ml-auto border-collapse text-[11pt]">
        <tbody>
          <tr>
            <td className="p-2 border border-black bg-gray-200 font-bold text-right min-w-[160px]">{L.baseImponible}</td>
            <td className="p-2 border border-black text-right min-w-[140px]">{fmtCurrency(base)}</td>
          </tr>
          <tr>
            <td className="p-2 border border-black bg-gray-200 font-bold text-right">IVA {iva}%</td>
            <td className="p-2 border border-black text-right">{fmtCurrency(ivaImp)}</td>
          </tr>
          <tr className="bg-[#2bb24c] text-white font-extrabold text-[12pt]">
            <td className="p-2 border border-black text-right">{L.totalFactura}</td>
            <td className="p-2 border border-black text-right">{fmtCurrency(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
