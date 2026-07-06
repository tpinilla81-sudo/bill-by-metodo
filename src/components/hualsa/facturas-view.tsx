'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Printer, FileSpreadsheet, Receipt, Search, ChevronLeft, Edit3, Save, Trash2, Eye } from 'lucide-react'
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
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)

  const canEditNumero = hasSubPermission(user?.role, user?.permissions, 'facturas.editarNumero')

  const loadFacturas = useCallback(async () => {
    const res = await fetch('/api/facturas')
    const data = await res.json()
    setFacturas(data.facturas || [])
  }, [])

  useEffect(() => {
    loadFacturas()
    fetch('/api/catalogo').then(r => r.json()).then(setCatalogo).catch(() => {})
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
      let it = cat.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
      if (!it) it = cat.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
      if (!it) it = cat.find(x => x.c1 === c1Val && x.c2 === c2Val)
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

  function handleExportExcel(inv: InvoiceData, cat: CatalogoItem[], cfg: ResolvedConfig | null) {
    const LL = cfg?.labelsFacturas || DEFAULT_LABELS_FACTURAS
    const { cli, lineas, iva, numero, fechaFact, base, ivaImp, total, modo } = inv
    const fechaLbl = (iso: string) => modo === 'mes' ? fmtMonth(iso) : fmtDate(iso)

    function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
      let it = cat.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
      if (!it) it = cat.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
      if (!it) it = cat.find(x => x.c1 === c1Val && x.c2 === c2Val)
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
                    <div className="flex items-center justify-center gap-1">
                      {/* Tick impresa — click para alternar */}
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
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setInvoiceData(null); setEditingNumero(false) } }}>
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

          {invoiceData && <InvoicePreview data={invoiceData} catalogo={catalogo} config={config} />}

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
    let it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val)
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
            <b>{L.numero}:</b> {numero || '(en blanco)'}<br />
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
