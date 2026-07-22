'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Printer, FileSpreadsheet, Receipt, Search, ChevronLeft, Edit3, Save, Trash2, Eye, Plus, X } from 'lucide-react'
import { fmtCurrency, fmtDate, fmtMonth, type Cliente, type CatalogoItem } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_LABELS_FACTURAS, type ResolvedConfig } from '@/lib/config'
import { useAuth } from '@/lib/auth-context'
import { hasSubPermission } from '@/lib/permissions'
import * as XLSX from 'xlsx'

type LineaFactura = { fecha: string; c1: string; c2: string; cant: number; clienteId: string; obs: string; precioUnitario: number }

interface FacturaRow {
  id: string
  numero: string
  fecha: string
  clienteId: string
  clienteNombre: string
  clienteSnap: string
  lineas: string
  iva: number
  base: number
  ivaImp: number
  total: number
  modo: string
  registroIds: string
  impresa: boolean
  createdAt: string
}

interface InvoiceData {
  cli: Cliente
  lineas: LineaFactura[]
  iva: number
  numero: string
  fechaFact: string
  modo: string
  base: number
  ivaImp: number
  total: number
}

export function FacturasView() {
  const { config } = useConfig()
  const L = config?.labelsFacturas || DEFAULT_LABELS_FACTURAS
  const { user } = useAuth()
  const [facturas, setFacturas] = useState<FacturaRow[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<FacturaRow | null>(null)
  const [editingNumero, setEditingNumero] = useState(false)
  const [numeroDraft, setNumeroDraft] = useState('')
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  // Toast que aparece al imprimir/guardar una factura: muestra número + cliente
  const [printNotice, setPrintNotice] = useState<string | null>(null)
  // Modo edición completa: cliente, fecha, IVA, modo, líneas (añadir/eliminar/editar todo)
  const [editingFull, setEditingFull] = useState(false)
  const [lineasDraft, setLineasDraft] = useState<LineaFactura[]>([])
  const [cliDraft, setCliDraft] = useState<Cliente | null>(null)
  const [fechaDraft, setFechaDraft] = useState('')
  const [ivaDraft, setIvaDraft] = useState(21)
  const [modoDraft, setModoDraft] = useState('dia')
  const [savingFull, setSavingFull] = useState(false)

  const canEditNumero = hasSubPermission(user?.role, user?.permissions, 'facturas.editarNumero')
  // Mismo permiso para edición completa de factura
  const canEditFull = canEditNumero

  const loadFacturas = useCallback(async () => {
    const res = await fetch('/api/facturas')
    const data = await res.json()
    setFacturas(data.facturas || [])
  }, [])

  useEffect(() => {
    loadFacturas()
    fetch('/api/catalogo').then(r => r.json()).then(setCatalogo).catch(() => {})
    fetch('/api/clientes').then(r => r.json()).then(data => setClientes(data.clientes || [])).catch(() => {})
  }, [loadFacturas])

  // Refrescar facturas cuando la pestaña recupera el foco.
  // Así, si el usuario A marca un tick de impresa, el usuario B lo verá
  // al volver a la pestaña — el estado `impresa` es global (persistido en BD).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        loadFacturas()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    // También refrescar periódicamente cada 30s mientras la pestaña está abierta,
    // para que los ticks puestos por otros usuarios aparezcan sin interacción.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadFacturas()
    }, 30 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(interval)
    }
  }, [loadFacturas])

  const filtered = facturas.filter(f => {
    if (!search) return true
    const q = search.toLowerCase()
    return (f.numero || '').toLowerCase().includes(q) ||
      (f.clienteNombre || '').toLowerCase().includes(q) ||
      (f.fecha || '').includes(q)
  })

  function openFactura(f: FacturaRow, startEditing = false) {
    setSelected(f)
    setNumeroDraft(f.numero || '')
    setEditingNumero(startEditing && canEditNumero)
    let lineas: LineaFactura[] = []
    try { lineas = JSON.parse(f.lineas || '[]') } catch {}
    let cli: Cliente = { id: f.clienteId, nombre: f.clienteNombre, cif: '', dir: '', cp: '', ciudad: '', prov: '', mail: '', tel: '' }
    try {
      if (f.clienteSnap) {
        const snap = JSON.parse(f.clienteSnap)
        cli = { ...cli, ...snap }
      }
    } catch {}
    setInvoiceData({
      cli,
      lineas,
      iva: f.iva,
      numero: f.numero,
      fechaFact: f.fecha,
      modo: f.modo,
      base: f.base,
      ivaImp: f.ivaImp,
      total: f.total,
    })
  }

  async function saveNumero() {
    if (!selected) return
    try {
      const res = await fetch(`/api/facturas/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: numeroDraft })
      })
      if (!res.ok) {
        alert('Error guardando número')
        return
      }
      setFacturas(prev => prev.map(f => f.id === selected.id ? { ...f, numero: numeroDraft } : f))
      setSelected(prev => prev ? { ...prev, numero: numeroDraft } : prev)
      if (invoiceData) setInvoiceData({ ...invoiceData, numero: numeroDraft })
      setEditingNumero(false)
    } catch (err) {
      console.error(err)
      alert('Error inesperado')
    }
  }

  // ===== Edición COMPLETA de factura =====
  // Cliente, fecha, IVA, modo + líneas (añadir, eliminar, editar todos los campos).
  // Recalcula base/iva/total automáticamente al cambiar cant/precio/iva.
  function startEditFull() {
    if (!invoiceData) return
    setLineasDraft(invoiceData.lineas.map(l => ({ ...l })))
    setCliDraft({ ...invoiceData.cli })
    setFechaDraft(invoiceData.fechaFact)
    setIvaDraft(invoiceData.iva)
    setModoDraft(invoiceData.modo)
    setEditingFull(true)
  }

  function cancelEditFull() {
    setEditingFull(false)
    setLineasDraft([])
    setCliDraft(null)
  }

  // Recalcular totales a partir de líneas + IVA
  function recalcular(lineas: LineaFactura[], iva: number) {
    let base = 0
    for (const l of lineas) {
      const p = l.precioUnitario > 0 ? l.precioUnitario : 0
      base += p * (Number(l.cant) || 0)
    }
    const ivaImp = base * (iva / 100)
    const total = base + ivaImp
    return { base, ivaImp, total }
  }

  function updateLineaField(idx: number, field: keyof LineaFactura, value: string) {
    setLineasDraft(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === 'cant' || field === 'precioUnitario') {
        const n = parseFloat(value.replace(',', '.'))
        return { ...l, [field]: isNaN(n) || n < 0 ? 0 : n }
      }
      return { ...l, [field]: value }
    }))
  }

  function addLinea() {
    // Genera fecha por defecto = fecha de la factura o hoy
    const hoy = new Date().toISOString().slice(0, 10)
    setLineasDraft(prev => [...prev, {
      fecha: fechaDraft || hoy,
      c1: '', c2: '', cant: 1,
      clienteId: cliDraft?.id || '',
      obs: '', precioUnitario: 0
    }])
  }

  function removeLinea(idx: number) {
    setLineasDraft(prev => prev.filter((_, i) => i !== idx))
  }

  function onClienteChange(id: string) {
    const c = clientes.find(x => x.id === id)
    if (c) {
      setCliDraft({ ...c })
      // Actualizar clienteId en todas las líneas también (para que precioUnitario busque bien)
      setLineasDraft(prev => prev.map(l => ({ ...l, clienteId: c.id })))
    }
  }

  async function saveFull() {
    if (!selected || !invoiceData || !cliDraft) return
    setSavingFull(true)
    try {
      const { base, ivaImp, total } = recalcular(lineasDraft, ivaDraft)
      const clienteSnap = JSON.stringify({
        nombre: cliDraft.nombre, cif: cliDraft.cif, dir: cliDraft.dir,
        cp: cliDraft.cp, ciudad: cliDraft.ciudad, prov: cliDraft.prov,
        mail: cliDraft.mail, tel: cliDraft.tel,
      })
      const res = await fetch(`/api/facturas/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: cliDraft.id,
          clienteNombre: cliDraft.nombre,
          clienteSnap,
          fecha: fechaDraft,
          iva: ivaDraft,
          modo: modoDraft,
          lineas: JSON.stringify(lineasDraft),
          base,
          ivaImp,
          total,
        })
      })
      if (!res.ok) {
        alert('Error guardando factura')
        setSavingFull(false)
        return
      }
      // Actualizar estado local
      setFacturas(prev => prev.map(f => f.id === selected.id ? {
        ...f,
        clienteId: cliDraft.id,
        clienteNombre: cliDraft.nombre,
        clienteSnap,
        fecha: fechaDraft,
        iva: ivaDraft,
        modo: modoDraft,
        lineas: JSON.stringify(lineasDraft),
        base, ivaImp, total,
      } : f))
      setSelected(prev => prev ? {
        ...prev,
        clienteId: cliDraft.id,
        clienteNombre: cliDraft.nombre,
        clienteSnap,
        fecha: fechaDraft,
        iva: ivaDraft,
        modo: modoDraft,
        lineas: JSON.stringify(lineasDraft),
        base, ivaImp, total,
      } : prev)
      setInvoiceData(prev => prev ? {
        ...prev,
        cli: { ...cliDraft },
        lineas: lineasDraft.map(l => ({ ...l })),
        fechaFact: fechaDraft,
        iva: ivaDraft,
        modo: modoDraft,
        base, ivaImp, total,
      } : prev)
      setEditingFull(false)
      setLineasDraft([])
      setCliDraft(null)
    } catch (err) {
      console.error(err)
      alert('Error inesperado')
    } finally {
      setSavingFull(false)
    }
  }

  async function deleteFactura(f: FacturaRow) {
    if (!confirm(`¿Eliminar factura ${f.numero || '(sin número)'} de ${f.clienteNombre}? Los registros volverán a estar disponibles para facturar.`)) return
    try {
      const res = await fetch(`/api/facturas/${f.id}`, { method: 'DELETE' })
      if (!res.ok) { alert('Error eliminando'); return }
      setFacturas(prev => prev.filter(x => x.id !== f.id))
      if (selected?.id === f.id) {
        setSelected(null)
        setInvoiceData(null)
      }
    } catch (err) {
      console.error(err)
      alert('Error inesperado')
    }
  }

  async function toggleImpresa(f: FacturaRow, newValue?: boolean) {
    const next = typeof newValue === 'boolean' ? newValue : !f.impresa
    try {
      const res = await fetch(`/api/facturas/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ impresa: next })
      })
      if (!res.ok) { alert('Error actualizando estado impresa'); return }
      setFacturas(prev => prev.map(x => x.id === f.id ? { ...x, impresa: next } : x))
      setSelected(prev => prev && prev.id === f.id ? { ...prev, impresa: next } : prev)
    } catch (err) {
      console.error(err)
      alert('Error inesperado')
    }
  }

  async function handlePrintInvoice(inv: InvoiceData, cat: CatalogoItem[], cfg: ResolvedConfig | null) {
    // Mark factura as printed in DB (and locally) so the tick shows up in the listing
    if (selected && !selected.impresa) {
      try {
        await fetch(`/api/facturas/${selected.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ impresa: true })
        })
        setFacturas(prev => prev.map(x => x.id === selected.id ? { ...x, impresa: true } : x))
        setSelected(prev => prev ? { ...prev, impresa: true } : prev)
      } catch (err) {
        console.error('No se pudo marcar como impresa:', err)
      }
    }
    const LL = cfg?.labelsFacturas || DEFAULT_LABELS_FACTURAS
    const { cli, lineas, iva, numero, fechaFact, modo, base, ivaImp, total } = inv
    const fechaLbl = (iso: string) => modo === 'mes' ? fmtMonth(iso) : fmtDate(iso)

    function pu(c1Val: string, c2Val: string, cliId: string): number {
      // Normalizada: "Viaje Nave" en catálogo coincide con "viaje  nave" en el registro
      const a = String(c1Val || '').trim().replace(/\s+/g, ' ').toLowerCase()
      const b = String(c2Val || '').trim().replace(/\s+/g, ' ').toLowerCase()
      let it = cat.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b && x.clienteId === cliId)
      if (!it) it = cat.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b && !x.clienteId)
      if (!it) it = cat.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b)
      return it ? Number(it.final) || 0 : 0
    }

    const logoSrc = cfg?.logo
      ? (cfg.logo.startsWith('data:') ? cfg.logo : `data:image/png;base64,${cfg.logo}`)
      : ''

    const lineasHtml = lineas.map(r => {
      const p = r.precioUnitario > 0 ? r.precioUnitario : pu(r.c1, r.c2, r.clienteId)
      return `<tr>
        <td style="padding:5px 6px;border:1px solid #bbb;white-space:nowrap;">${fechaLbl(r.fecha)}</td>
        <td style="padding:5px 6px;border:1px solid #bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.c1}${r.c2 ? ' - ' + r.c2 : ''}${r.obs ? ' (' + r.obs + ')' : ''}</td>
        <td style="padding:5px 6px;border:1px solid #bbb;text-align:right;white-space:nowrap;">${r.cant}</td>
        <td style="padding:5px 6px;border:1px solid #bbb;text-align:right;white-space:nowrap;">${p.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
        <td style="padding:5px 6px;border:1px solid #bbb;text-align:right;white-space:nowrap;">${(p * r.cant).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
      </tr>`
    }).join('')

    // Título del documento (nombre de archivo al guardar como PDF):
    // directamente "número-cliente" (sin prefijo "Factura") para que al guardar
    // el archivo se llame p.ej. "1234-Cliente X.pdf".
    const docTitle = `${numero || 'sin-numero'}-${cli.nombre || 'cliente'}`
    // Texto mostrado en el aviso flotante (este sí lleva "Factura" para que se entienda).
    const displayNotice = `Imprimiendo Factura ${numero || 'sin-numero'} - ${cli.nombre || 'cliente'}`

    // Mostrar aviso en pantalla con el número y cliente de la factura que se está imprimiendo
    setPrintNotice(displayNotice)
    setTimeout(() => setPrintNotice(null), 5000)

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${docTitle}</title>
<style>
  /* margin: 0 en @page para que el navegador NO añada sus cabeceras/pie por defecto
     (fecha, hora, URL "about:blank"). El padding va en el body. */
  @page { size: A4 portrait; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 10.5pt; line-height: 1.35; padding: 22mm 14mm; }
  .page { width: 100%; max-width: 210mm; }

  /* ====== CABECERA ====== */
  /* Izquierda: nombre empresa + datos + caja nº factura/fecha. Derecha: logo grande. */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 3px solid #2bb24c; }
  .company-info { flex: 1; min-width: 0; }
  .company-name { font-size: 17pt; font-weight: 800; color: #1a1a1a; margin-bottom: 4px; }
  .company-detail { font-size: 9.5pt; color: #444; line-height: 1.45; }
  .company-detail b { color: #1a1a1a; }
  .logo-area { margin-left: 20px; flex-shrink: 0; }
  .logo-area img { max-width: 320px; max-height: 140px; object-fit: contain; }
  .factura-badge { display: inline-block; margin-top: 10px; padding: 6px 14px; border: 2px solid #1a1a1a; background: #f5f5f5; font-size: 10.5pt; line-height: 1.5; }
  .factura-badge b { font-size: 10.5pt; }

  /* ====== CLIENTE ====== */
  .client-label { font-size: 8.5pt; text-transform: uppercase; color: #888; letter-spacing: 1px; margin-bottom: 4px; }
  .client-box { border: 2px solid #1a1a1a; padding: 12px 16px; margin-bottom: 22px; background: #f9f9f9; font-size: 10.5pt; line-height: 1.55; }
  .client-box b { color: #1a1a1a; }

  /* ====== TABLA DE LÍNEAS ======
     table-layout: fixed + width columns → el contenido no se reparte libremente.
     Cada celda lleva white-space:nowrap para NO partir en 2 líneas. */
  table.lines { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 9.5pt; table-layout: fixed; }
  table.lines thead th { background: #f0f0f0; color: #1a1a1a; padding: 7px 6px; text-align: left; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  table.lines thead th:nth-child(3), table.lines thead th:nth-child(4), table.lines thead th:nth-child(5) { text-align: right; }
  table.lines tbody td { padding: 5px 6px; border: 1px solid #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  table.lines tbody td:nth-child(3), table.lines tbody td:nth-child(4), table.lines tbody td:nth-child(5) { text-align: right; font-variant-numeric: tabular-nums; }

  /* ====== TOTALES ====== */
  .totals { margin-left: auto; border-collapse: collapse; font-size: 10.5pt; }
  .totals td { padding: 7px 12px; border: 1px solid #1a1a1a; }
  .totals .label { background: #e8e8e8; font-weight: 700; text-align: right; min-width: 160px; }
  .totals .value { text-align: right; min-width: 130px; font-variant-numeric: tabular-nums; }
  .totals .total-row { background: #2bb24c; color: #fff; font-weight: 800; font-size: 12pt; }
  .totals .total-row td { border-color: #2bb24c; }

  /* ====== PIE ====== */
  .footer { margin-top: 36px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 8.5pt; color: #999; text-align: center; }
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
        <b>${LL.numero}:</b> ${numero || '(en blanco)'}<br>
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
        <th style="width:70px;">${LL.fecha}</th>
        <th>${LL.concepto}</th>
        <th style="width:50px;">${LL.cantidad}</th>
        <th style="width:85px;">${LL.precioUnitario}</th>
        <th style="width:95px;">${LL.importe}</th>
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
<script>
  window.onload = function() {
    try { document.title = ${JSON.stringify(docTitle)}; } catch (e) {}
    setTimeout(function() { window.print(); }, 300);
  };
</script>
</body>
</html>`

    const printWin = window.open('', '_blank', 'width=900,height=700')
    if (printWin) {
      printWin.document.write(html)
      printWin.document.close()
      // Reforzar el título en la ventana emergente (algunos navegadores resetean el <title>)
      try { printWin.document.title = docTitle } catch (e) {}
    }
  }

  function handleExportExcel(inv: InvoiceData, cat: CatalogoItem[], cfg: ResolvedConfig | null) {
    const LL = cfg?.labelsFacturas || DEFAULT_LABELS_FACTURAS
    const { cli, lineas, iva, numero, fechaFact, base, ivaImp, total, modo } = inv
    const fechaLbl = (iso: string) => modo === 'mes' ? fmtMonth(iso) : fmtDate(iso)

    function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
      // Normalizada: "Viaje Nave" en catálogo coincide con "viaje  nave" en el registro
      const a = String(c1Val || '').trim().replace(/\s+/g, ' ').toLowerCase()
      const b = String(c2Val || '').trim().replace(/\s+/g, ' ').toLowerCase()
      let it = cat.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b && x.clienteId === cliId)
      if (!it) it = cat.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b && !x.clienteId)
      if (!it) it = cat.find(x => String(x.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase() === a && String(x.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase() === b)
      return it ? Number(it.final) || 0 : 0
    }

    const wb = XLSX.utils.book_new()
    const wsData: (string | number)[][] = []
    wsData.push([cfg?.companyFullName || 'EMPRESA'])
    wsData.push([cfg?.companyAddress || ''])
    wsData.push([(cfg?.companyCity || '') + ' ' + (cfg?.companyProvince || '')])
    if (cfg?.companyCif) wsData.push(['CIF: ' + cfg.companyCif])
    else wsData.push([])
    wsData.push([])
    wsData.push([LL.numero + ':', numero || '(en blanco)'])
    wsData.push([LL.fecha + ':', fmtDate(fechaFact)])
    wsData.push([])
    wsData.push([LL.cliente + ':', cli.nombre])
    wsData.push(['CIF:', cli.cif])
    wsData.push(['Dirección:', `${cli.dir} ${cli.cp} ${cli.ciudad} ${cli.prov}`])
    wsData.push([])
    wsData.push([LL.fecha, LL.concepto, LL.cantidad, LL.precioUnitario, LL.importe])
    lineas.forEach(r => {
      const pu = r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
      wsData.push([fechaLbl(r.fecha), r.c1 + (r.c2 ? ' - ' + r.c2 : ''), r.cant, pu, pu * r.cant])
    })
    wsData.push([])
    wsData.push(['', '', '', LL.baseImponible, base])
    wsData.push(['', '', '', `IVA ${iva}%`, ivaImp])
    wsData.push(['', '', '', LL.totalFactura, total])
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 16 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Factura')
    XLSX.writeFile(wb, `Factura_${(numero || 'sin-numero').replace(/\//g, '-')}.xlsx`)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Aviso flotante cuando se imprime/guarda una factura: muestra el número + cliente */}
      {printNotice && (
        <div className="fixed top-4 right-4 z-50 bg-blue-600 text-white px-4 py-2.5 rounded-lg shadow-lg border border-blue-700 flex items-center gap-2 max-w-md">
          <Printer className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">{printNotice}</span>
        </div>
      )}
      <div className="flex-shrink-0 space-y-3 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Receipt className="h-5 w-5 text-rose-500" />
          <h2 className="text-lg font-bold text-gray-700">{config?.sectionFacturas || 'FACTURAS'}</h2>
          <span className="text-xs text-gray-500 ml-auto">Listado de facturas confirmadas · edita el Nº y reimprime</span>
        </div>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por número, cliente o fecha…"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={loadFacturas}>
                Recargar
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-2.5 shadow-sm text-sm font-bold border items-center">
          <span>Total facturas:<b className="text-[#005bb5] ml-1">{facturas.length}</b></span>
          <span>Suma total:<b className="text-[#005bb5] ml-1">{fmtCurrency(facturas.reduce((s, f) => s + f.total, 0))}</b></span>
          <span>Impresas:<b className="text-green-600 ml-1">{facturas.filter(f => f.impresa).length}</b></span>
          <span className="text-xs text-gray-500 ml-auto">Sin número: {facturas.filter(f => !f.numero).length}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-lg border shadow-sm flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-rose-50">
                <th className="p-2 text-left font-semibold border-b bg-rose-50">Nº</th>
                <th className="p-2 text-left font-semibold border-b bg-rose-50">Fecha</th>
                <th className="p-2 text-left font-semibold border-b bg-rose-50">Cliente</th>
                <th className="p-2 text-right font-semibold border-b bg-rose-50">Base</th>
                <th className="p-2 text-right font-semibold border-b bg-rose-50">IVA</th>
                <th className="p-2 text-right font-semibold border-b bg-rose-50">Total</th>
                <th className="p-2 text-center font-semibold border-b bg-rose-50">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id} className={`border-b ${!f.numero ? 'bg-yellow-50/40' : ''} ${f.impresa ? 'bg-green-50/40' : ''}`}>
                  <td className="p-2 font-mono">
                    {f.numero || <span className="text-yellow-700 italic">(en blanco)</span>}
                  </td>
                  <td className="p-2">{fmtDate(f.fecha)}</td>
                  <td className="p-2">{f.clienteNombre || '(varios)'}</td>
                  <td className="p-2 text-right">{fmtCurrency(f.base)}</td>
                  <td className="p-2 text-right">{fmtCurrency(f.ivaImp)}</td>
                  <td className="p-2 text-right font-bold">{fmtCurrency(f.total)}</td>
                  <td className="p-2 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${f.impresa ? 'text-green-600' : 'text-gray-300'}`}>
                        Impreso
                      </span>
                      <div className="flex items-center justify-center gap-1">
                        {/* Tick impresa — click para alternar. Global: persistido en BD */}
                        <button
                          onClick={() => toggleImpresa(f)}
                          title={f.impresa ? 'Impresa ✓ — click para quitar el tick' : 'No impresa — click para marcar como impresa'}
                          aria-label={f.impresa ? 'Quitar tick de impresa' : 'Marcar como impresa'}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-md border-2 transition-colors ${
                            f.impresa
                              ? 'bg-green-500 border-green-600 text-white hover:bg-green-600'
                              : 'bg-white border-gray-300 text-transparent hover:border-green-400 hover:bg-green-50'
                          }`}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 0 1.42l-7.5 7.5a1 1 0 0 1-1.42 0l-3.5-3.5a1 1 0 1 1 1.42-1.42l2.79 2.79 6.79-6.79a1 1 0 0 1 1.42 0Z" clipRule="evenodd" />
                          </svg>
                        </button>

                        {/* Ver / Imprimir */}
                        <Button size="sm" variant="ghost" onClick={() => openFactura(f)} title="Ver / Imprimir" className="h-8 w-8 p-0 text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                          <Eye className="h-4 w-4" />
                        </Button>

                        {/* Editar (número de factura) — visible para admin o si tiene permiso */}
                        {(canEditNumero || user?.role === 'admin' || user?.role === 'superadmin') && (
                          <Button size="sm" variant="ghost" onClick={() => openFactura(f, true)} title="Editar factura" className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        )}

                        {/* Eliminar — visible para admin/superadmin */}
                        {(user?.role === 'admin' || user?.role === 'superadmin') && (
                          <Button size="sm" variant="ghost" onClick={() => deleteFactura(f)} title="Eliminar factura" className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay facturas creadas todavía. Crea pre-facturas desde la pestaña anterior.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setInvoiceData(null); setEditingNumero(false); setEditingFull(false); setLineasDraft([]); setCliDraft(null) } }}>
        <DialogContent className="max-w-[900px] max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-rose-500" />
              Factura {selected?.numero || '(en blanco)'}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className={`mb-4 p-4 rounded-lg border-2 ${!selected.numero ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Label className="text-xs uppercase font-bold text-slate-500">Nº de Factura</Label>
                {!selected.numero && (
                  <span className="text-[10px] font-bold uppercase bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full animate-pulse">
                    ⚠ Pendiente
                  </span>
                )}
                {selected.impresa && (
                  <span className="text-[10px] font-bold uppercase bg-green-500 text-white px-2 py-0.5 rounded-full">
                    ✔ Impresa
                  </span>
                )}
                {!editingNumero && canEditNumero && (
                  <Button size="sm" onClick={() => { setEditingNumero(true); setNumeroDraft(selected.numero || '') }} className={`ml-auto h-7 px-3 text-xs ${!selected.numero ? 'bg-orange-500 hover:bg-orange-600 text-white animate-pulse' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}>
                    <Edit3 className="h-3 w-3 mr-1" /> {selected.numero ? 'Editar Nº' : 'Asignar Nº'}
                  </Button>
                )}
                {!canEditNumero && (
                  <span className="ml-auto text-[10px] text-gray-400 italic">Sin permiso para editar</span>
                )}
              </div>
              {!editingNumero ? (
                <div className={`text-2xl font-bold font-mono ${!selected.numero ? 'text-yellow-700 italic' : 'text-gray-800'}`}>
                  {selected.numero || '(en blanco — pendiente de asignar)'}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={numeroDraft}
                    onChange={e => setNumeroDraft(e.target.value)}
                    placeholder="p. ej. 0007/2026"
                    className="flex-1 font-mono text-lg"
                    autoFocus
                  />
                  <Button size="sm" onClick={saveNumero} className="bg-green-600 hover:bg-green-700 text-white">
                    <Save className="h-4 w-4 mr-1" /> Guardar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingNumero(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}

          {invoiceData && !editingFull && (
            <InvoicePreview
              data={invoiceData}
              catalogo={catalogo}
              config={config}
              editing={false}
            />
          )}

          {invoiceData && editingFull && cliDraft && (
            <FacturaEditor
              cliDraft={cliDraft}
              fechaDraft={fechaDraft}
              ivaDraft={ivaDraft}
              modoDraft={modoDraft}
              lineasDraft={lineasDraft}
              clientes={clientes}
              catalogo={catalogo}
              config={config}
              onClienteChange={onClienteChange}
              onFechaChange={setFechaDraft}
              onIvaChange={setIvaDraft}
              onModoChange={setModoDraft}
              onUpdateLinea={updateLineaField}
              onAddLinea={addLinea}
              onRemoveLinea={removeLinea}
            />
          )}

          {/* Botón para entrar en edición completa — solo si tiene permiso */}
          {invoiceData && canEditFull && !editingFull && (
            <div className="mt-2 flex justify-center">
              <Button variant="outline" size="sm" onClick={startEditFull} className="text-blue-700 border-blue-300 hover:bg-blue-50">
                <Edit3 className="h-3.5 w-3.5 mr-1" /> Editar factura (cliente, fecha, líneas, IVA)
              </Button>
            </div>
          )}
          {editingFull && (
            <div className="mt-2 flex justify-center gap-2">
              <Button size="sm" onClick={saveFull} disabled={savingFull} className="bg-green-600 hover:bg-green-700 text-white">
                <Save className="h-3.5 w-3.5 mr-1" /> {savingFull ? 'Guardando…' : 'Guardar cambios'}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEditFull} disabled={savingFull}>
                Cancelar
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-end mt-4">
            {selected && (user?.role === 'admin' || user?.role === 'superadmin') && (
              <Button variant="outline" onClick={() => deleteFactura(selected)} className="text-red-600 border-red-300 hover:bg-red-50">
                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
              </Button>
            )}
            {selected && selected.impresa && (
              <Button variant="outline" onClick={() => toggleImpresa(selected, false)} className="text-amber-700 border-amber-300 hover:bg-amber-50" title="Quitar el tick de impresa">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 mr-1"><path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 0 1.42l-7.5 7.5a1 1 0 0 1-1.42 0l-3.5-3.5a1 1 0 1 1 1.42-1.42l2.79 2.79 6.79-6.79a1 1 0 0 1 1.42 0Z" clipRule="evenodd" /></svg>
                Quitar tick impresa
              </Button>
            )}
            <Button variant="outline" onClick={() => invoiceData && handlePrintInvoice(invoiceData, catalogo, config)}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir PDF
            </Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => invoiceData && handleExportExcel(invoiceData, catalogo, config)}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
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
  config: ResolvedConfig | null
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

  // Cálculo de totales a partir de las líneas (vista previa, no edición)
  const visibleLineas = lineas
  let calcBase = 0
  for (const r of visibleLineas) {
    const p = r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
    calcBase += p * (Number(r.cant) || 0)
  }
  const calcIvaImp = ivaImp
  const calcTotal = total
  const showBase = base

  return (
    <div className="font-[family-name:var(--font-geist-sans)] text-black text-[11pt] leading-[1.35]">
      {/* ===== CABECERA (empresa a la izquierda, logo a la derecha) ===== */}
      <div className="flex justify-between items-start gap-4 mb-4">
        <div className="text-[10.5pt] leading-[1.4]">
          <h2 className="text-[14pt] font-extrabold text-black mb-1">{config?.companyFullName || 'EMPRESA'}</h2>
          {config?.companyAddress && <>{config.companyAddress}<br /></>}
          {config?.companyCity && <>{config.companyCity}</>}
          {config?.companyProvince && <> {config.companyProvince}</>}
          {(config?.companyCity || config?.companyProvince) && <br />}
          {config?.companyCif && <><b>CIF:</b> {config.companyCif}<br /></>}
          <div className="mt-2 border border-black p-2 text-[10.5pt] w-fit">
            <b>{L.numero}:</b> {numero || '(en blanco)'}<br />
            <b>{L.fecha}:</b> {fmtDate(fechaFact)}
          </div>
        </div>
        {config?.logo ? (
          <img src={config.logo.startsWith('data:') ? config.logo : `data:image/png;base64,${config.logo}`} alt="Logo" style={{ maxWidth: '320px', maxHeight: '140px', height: 'auto', objectFit: 'contain' }} />
        ) : null}
      </div>
      <div className="border border-black p-3 mb-4 text-[11pt] bg-gray-50">
        <b>{L.cliente}:</b> {cli.nombre}<br />
        {cli.cif && <><b>CIF:</b> {cli.cif}<br /></>}
        {cli.dir}{cli.dir && <br />}
        {cli.cp} {cli.ciudad} {cli.prov}
      </div>

      {/* ===== TABLA DE LÍNEAS ===== */}
      <table className="w-full border-collapse text-[10.5pt] mb-3 table-fixed">
        <thead>
          <tr>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt] w-[90px]">{L.fecha}</th>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt]">{L.concepto}</th>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt] w-[70px]">{L.cantidad}</th>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt] w-[110px]">{L.precioUnitario}</th>
            <th className="bg-[#1a1a1a] text-white p-2 text-left border border-black text-[10pt] w-[110px]">{L.importe}</th>
          </tr>
        </thead>
        <tbody>
          {visibleLineas.map((r, i) => {
            const pu = r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
            const importe = pu * (Number(r.cant) || 0)
            return (
              <tr key={i}>
                <td className="p-2 border border-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">{fechaLbl(r.fecha)}</td>
                <td className="p-2 border border-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">{r.c1}{r.c2 ? ' - ' + r.c2 : ''}{r.obs ? ` (${r.obs})` : ''}</td>
                <td className="p-1 border border-gray-400 text-right">
                  <span>{r.cant}</span>
                </td>
                <td className="p-1 border border-gray-400 text-right">
                  <span>{pu.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                </td>
                <td className="p-2 border border-gray-400 text-right tabular-nums">{importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <table className="ml-auto border-collapse text-[11pt]">
        <tbody>
          <tr>
            <td className="p-2 border border-black bg-gray-200 font-bold text-right min-w-[160px]">{L.baseImponible}</td>
            <td className="p-2 border border-black text-right min-w-[140px] tabular-nums">{fmtCurrency(showBase)}</td>
          </tr>
          <tr>
            <td className="p-2 border border-black bg-gray-200 font-bold text-right">IVA {iva}%</td>
            <td className="p-2 border border-black text-right tabular-nums">{fmtCurrency(calcIvaImp)}</td>
          </tr>
          <tr className="bg-[#2bb24c] text-white font-extrabold text-[12pt]">
            <td className="p-2 border border-black text-right">{L.totalFactura}</td>
            <td className="p-2 border border-black text-right tabular-nums">{fmtCurrency(calcTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// Componente FacturaEditor — edición COMPLETA de una factura
// Permite editar: cliente, fecha, IVA, modo y todas las líneas
// (añadir, eliminar, modificar fecha, c1, c2, cantidad, precio, obs)
// ============================================================
function FacturaEditor({
  cliDraft, fechaDraft, ivaDraft, modoDraft, lineasDraft,
  clientes, catalogo, config,
  onClienteChange, onFechaChange, onIvaChange, onModoChange,
  onUpdateLinea, onAddLinea, onRemoveLinea,
}: {
  cliDraft: Cliente
  fechaDraft: string
  ivaDraft: number
  modoDraft: string
  lineasDraft: LineaFactura[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
  config: ResolvedConfig | null
  onClienteChange: (id: string) => void
  onFechaChange: (v: string) => void
  onIvaChange: (v: number) => void
  onModoChange: (v: string) => void
  onUpdateLinea: (idx: number, field: keyof LineaFactura, value: string) => void
  onAddLinea: () => void
  onRemoveLinea: (idx: number) => void
}) {
  const L = config?.labelsFacturas || DEFAULT_LABELS_FACTURAS

  // Cálculo de totales en vivo a partir del draft
  let base = 0
  for (const l of lineasDraft) {
    const p = l.precioUnitario > 0 ? l.precioUnitario : 0
    base += p * (Number(l.cant) || 0)
  }
  const ivaImp = base * (ivaDraft / 100)
  const total = base + ivaImp

  // C1/C2 options por cliente desde catálogo
  const c1Options = useMemo(() => {
    const set = new Set<string>()
    for (const it of catalogo) {
      if (it.c1) set.add(it.c1)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
  }, [catalogo])

  function c2OptionsFor(c1Val: string): string[] {
    const a = String(c1Val || '').trim().replace(/\s+/g, ' ').toLowerCase()
    const set = new Set<string>()
    for (const it of catalogo) {
      const itA = String(it.c1 || '').trim().replace(/\s+/g, ' ').toLowerCase()
      if (itA === a && it.c2) set.add(it.c2)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
  }

  return (
    <div className="border-2 border-blue-300 rounded-lg p-4 bg-blue-50/30 space-y-4">
      <div className="text-sm font-bold text-blue-800 flex items-center gap-2">
        <Edit3 className="h-4 w-4" /> Editando factura — todos los campos son editables
      </div>

      {/* Cabecera: cliente, fecha, IVA, modo */}
      <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded border border-blue-200">
        <div>
          <Label className="text-xs uppercase font-bold text-slate-500">{L.cliente}</Label>
          <select
            value={cliDraft.id}
            onChange={e => onClienteChange(e.target.value)}
            className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <div className="mt-1 text-[10px] text-gray-500">
            CIF: {cliDraft.cif || '—'} · {cliDraft.dir || '—'} {cliDraft.cp} {cliDraft.ciudad} {cliDraft.prov}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs uppercase font-bold text-slate-500">{L.fecha}</Label>
            <Input
              type="date"
              value={fechaDraft ? fechaDraft.slice(0, 10) : ''}
              onChange={e => onFechaChange(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs uppercase font-bold text-slate-500">IVA %</Label>
            <Input
              type="number"
              step="0.01"
              value={ivaDraft}
              onChange={e => onIvaChange(parseFloat(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs uppercase font-bold text-slate-500">Modo</Label>
            <select
              value={modoDraft}
              onChange={e => onModoChange(e.target.value)}
              className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="dia">Por día</option>
              <option value="mes">Por mes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de líneas editables */}
      <div className="bg-white p-3 rounded border border-blue-200 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left border border-gray-300 w-[110px]">Fecha</th>
              <th className="p-2 text-left border border-gray-300">Concepto (C1)</th>
              <th className="p-2 text-left border border-gray-300 w-[140px]">Subconcepto (C2)</th>
              <th className="p-2 text-right border border-gray-300 w-[80px]">Cant.</th>
              <th className="p-2 text-right border border-gray-300 w-[100px]">Precio</th>
              <th className="p-2 text-right border border-gray-300 w-[100px]">Importe</th>
              <th className="p-2 text-center border border-gray-300 w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {lineasDraft.map((l, i) => {
              const importe = (l.precioUnitario > 0 ? l.precioUnitario : 0) * (Number(l.cant) || 0)
              return (
                <tr key={i}>
                  <td className="p-1 border border-gray-300">
                    <input
                      type="date"
                      value={l.fecha ? l.fecha.slice(0, 10) : ''}
                      onChange={e => onUpdateLinea(i, 'fecha', e.target.value)}
                      className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px]"
                    />
                  </td>
                  <td className="p-1 border border-gray-300">
                    <input
                      list={`c1-list-${i}`}
                      value={l.c1}
                      onChange={e => onUpdateLinea(i, 'c1', e.target.value)}
                      className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px]"
                      placeholder="Concepto"
                    />
                    <datalist id={`c1-list-${i}`}>
                      {c1Options.map(o => <option key={o} value={o} />)}
                    </datalist>
                  </td>
                  <td className="p-1 border border-gray-300">
                    <input
                      list={`c2-list-${i}`}
                      value={l.c2}
                      onChange={e => onUpdateLinea(i, 'c2', e.target.value)}
                      className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px]"
                      placeholder="Subconcepto"
                    />
                    <datalist id={`c2-list-${i}`}>
                      {c2OptionsFor(l.c1).map(o => <option key={o} value={o} />)}
                    </datalist>
                  </td>
                  <td className="p-1 border border-gray-300">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={String(l.cant)}
                      onChange={e => onUpdateLinea(i, 'cant', e.target.value)}
                      className="w-full text-right border border-gray-200 rounded px-1 py-0.5 text-[11px]"
                    />
                  </td>
                  <td className="p-1 border border-gray-300">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={String(l.precioUnitario)}
                      onChange={e => onUpdateLinea(i, 'precioUnitario', e.target.value)}
                      className="w-full text-right border border-gray-200 rounded px-1 py-0.5 text-[11px]"
                    />
                  </td>
                  <td className="p-1 border border-gray-300 text-right tabular-nums">
                    {importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-1 border border-gray-300 text-center">
                    <button
                      onClick={() => onRemoveLinea(i)}
                      title="Eliminar línea"
                      className="text-red-500 hover:bg-red-50 rounded p-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {lineasDraft.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400 italic">
                  Sin líneas. Pulsa &quot;Añadir línea&quot; para crear una.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={onAddLinea} className="text-blue-700 border-blue-300 hover:bg-blue-50">
            <Plus className="h-3.5 w-3.5 mr-1" /> Añadir línea
          </Button>
        </div>
      </div>

      {/* Totales recalculados en vivo */}
      <div className="bg-white p-3 rounded border border-blue-200 flex justify-end">
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="px-3 py-1 text-right font-bold">Base imponible:</td>
              <td className="px-3 py-1 text-right tabular-nums w-[120px]">{fmtCurrency(base)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1 text-right font-bold">IVA {ivaDraft}%:</td>
              <td className="px-3 py-1 text-right tabular-nums">{fmtCurrency(ivaImp)}</td>
            </tr>
            <tr className="bg-green-100">
              <td className="px-3 py-1 text-right font-extrabold">Total:</td>
              <td className="px-3 py-1 text-right font-extrabold tabular-nums">{fmtCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
