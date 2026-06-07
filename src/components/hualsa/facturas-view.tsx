'use client'

import { useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Printer, FileSpreadsheet, Receipt, RotateCcw, ArrowLeftRight } from 'lucide-react'
import { fmtCurrency, fmtDate, fmtMonth, todayISO, currentYear, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_LABELS_FACTURAS } from '@/lib/config'

interface FacturasData {
  registros: Registro[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
  seq: number
}

type LineaFactura = { fecha: string; c1: string; c2: string; cant: number; clienteId: string; obs: string }
interface InvoiceData {
  cli: Cliente; lineas: LineaFactura[]
  iva: number; numero: string; fechaFact: string; modo: string; base: number; ivaImp: number; total: number
}

export function FacturasView() {
  const { config } = useConfig()
  const L = config?.labelsFacturas || DEFAULT_LABELS_FACTURAS
  const [data, setData] = useState<FacturasData>({ registros: [], clientes: [], catalogo: [], seq: 1 })
  const [initialized, setInitialized] = useState(false)

  // Filters
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fMes, setFMes] = useState('')
  const [fCliente, setFCliente] = useState('')

  // Invoice settings
  const [fNumero, setFNumero] = useState('')
  const [fFechaFact, setFFechaFact] = useState(todayISO())
  const [fIva, setFIva] = useState('')
  const [fModo, setFModo] = useState<'dia' | 'mes'>('dia')

  // Selection
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [checkAll, setCheckAll] = useState(true)

  // Invoice modal
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const loadData = useCallback(async () => {
    const [rRes, cRes, catRes, seqRes] = await Promise.all([
      fetch('/api/registros'), fetch('/api/clientes'), fetch('/api/catalogo'), fetch('/api/factura-seq')
    ])
    const seq = (await seqRes.json()).seq
    setData({ registros: await rRes.json(), clientes: await cRes.json(), catalogo: await catRes.json(), seq })
  }, [])

  if (!initialized) {
    setInitialized(true)
    loadData()
  }

  // Set default factura number and IVA
  if (!fNumero && data.seq) {
    setFNumero(String(data.seq).padStart(4, '0') + '/' + currentYear())
  }
  if (!fIva && config) {
    setFIva(String(config.defaultIva))
  }

  const { registros, clientes, catalogo } = data

  function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
    let it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val)
    return it ? Number(it.final) || 0 : 0
  }

  // Filtered registros
  const filtered = useMemo(() =>
    registros.filter(r => {
      if (fDesde && r.fecha < fDesde) return false
      if (fHasta && r.fecha > fHasta) return false
      if (fMes && r.fecha.slice(0, 7) !== fMes) return false
      if (fCliente && fCliente !== '__all__' && r.clienteId !== fCliente) return false
      return true
    }).sort((a, b) => a.fecha.localeCompare(b.fecha))
  , [registros, fDesde, fHasta, fMes, fCliente])

  const selectedItems = filtered.filter(r => selection[r.id] !== false)
  const totalCant = selectedItems.reduce((s, r) => s + r.cant, 0)
  const totalBase = selectedItems.reduce((s, r) => s + precioUnit(r.c1, r.c2, r.clienteId) * r.cant, 0)

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

  async function handleGenerar() {
    const sel = selectedItems
    if (!sel.length) { alert('No hay líneas seleccionadas'); return }
    const cliIds = [...new Set(sel.map(r => r.clienteId))]
    const effectiveFCliente = (fCliente && fCliente !== '__all__') ? fCliente : ''
    const targetCliId = effectiveFCliente || cliIds[0]
    const cli = clientes.find(c => c.id === targetCliId) || { id: '', nombre: '(varios)', cif: '', dir: '', cp: '', ciudad: '', prov: '', mail: '', tel: '' }
    const lineasBase = effectiveFCliente ? sel.filter(r => r.clienteId === effectiveFCliente) : sel
    const iva = Number(fIva) || 0

    let lineas: LineaFactura[]
    if (fModo === 'mes') {
      const map: Record<string, LineaFactura> = {}
      lineasBase.forEach(r => {
        const mes = r.fecha.slice(0, 7)
        const k = mes + '|' + r.c1 + '|' + r.c2
        if (!map[k]) map[k] = { fecha: mes + '-01', c1: r.c1, c2: r.c2, cant: 0, clienteId: r.clienteId, obs: '' }
        map[k].cant += r.cant
      })
      lineas = Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha))
    } else {
      lineas = lineasBase
    }

    const base = lineas.reduce((s, r) => s + precioUnit(r.c1, r.c2, r.clienteId) * r.cant, 0)
    const ivaImp = base * iva / 100
    const total = base + ivaImp

    setInvoiceData({ cli, lineas, iva, numero: fNumero, fechaFact: fFechaFact, modo: fModo, base, ivaImp, total })
    setModalOpen(true)

    // Increment seq
    const newSeq = data.seq + 1
    await fetch('/api/factura-seq', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seq: newSeq }) })
    setData(prev => ({ ...prev, seq: newSeq }))
  }

  function handleExportExcel() {
    if (!invoiceData) return
    const { cli, lineas, iva, numero, fechaFact, base, ivaImp, total, modo } = invoiceData
    const fechaLbl = (iso: string) => modo === 'mes' ? fmtMonth(iso) : fmtDate(iso)

    const rows: (string | number)[][] = [
      [config?.companyFullName || 'EMPRESA'],
      [config?.companyAddress || ''],
      [config?.companyCity + ' ' + (config?.companyProvince || '')],
      [],
      [L.numero, numero],
      [L.fecha, fmtDate(fechaFact)],
      [L.cliente, cli.nombre],
      ['CIF', cli.cif],
      ['DIRECCIÓN', `${cli.dir} ${cli.cp} ${cli.ciudad} ${cli.prov}`],
      [],
      [L.fecha, L.concepto, L.cantidad, L.precioUnitario, L.importe],
      ...lineas.map(r => { const pu = precioUnit(r.c1, r.c2, r.clienteId); return [fechaLbl(r.fecha), r.c1 + (r.c2 ? ' - ' + r.c2 : ''), r.cant, pu, pu * r.cant] }),
      [],
      ['', '', '', L.baseImponible, base],
      ['', '', '', `IVA ${iva}%`, ivaImp],
      ['', '', '', L.totalFactura, total],
    ]

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Factura_${numero.replace(/\//g, '-')}.csv`
    a.click()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters row 1 */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
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
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Cliente</Label>
              <Select value={fCliente} onValueChange={setFCliente}>
                <SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">— Todos —</SelectItem>
                  {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="bg-[#005bb5] hover:bg-[#003d7a] text-white">
              <Receipt className="h-4 w-4 mr-1" /> FILTRAR
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoice settings */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto_auto] gap-3 items-end">
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Nº Factura</Label>
              <Input value={fNumero} onChange={e => setFNumero(e.target.value)} placeholder="auto" />
            </div>
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
            <Button variant="outline" onClick={() => { setFDesde(''); setFHasta(''); setFMes(''); setFCliente(''); setFNumero('') }}>
              <RotateCcw className="h-4 w-4 mr-1" /> Limpiar
            </Button>
            <Button onClick={handleGenerar} className="bg-green-600 hover:bg-green-700 text-white">
              <Receipt className="h-4 w-4 mr-1" /> GENERAR
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-3 shadow-sm text-sm font-bold">
        <span>Líneas:<b className="text-[#005bb5] ml-1">{filtered.length}</b></span>
        <span>Seleccionadas:<b className="text-[#005bb5] ml-1">{selectedItems.length}</b></span>
        <span>Cantidad:<b className="text-[#005bb5] ml-1">{totalCant}</b></span>
        <span>Base:<b className="text-[#005bb5] ml-1">{fmtCurrency(totalBase)}</b></span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-indigo-50">
              <th className="p-2 text-left border-b w-10">
                <Checkbox checked={checkAll} onCheckedChange={toggleAll} />
              </th>
              <th className="p-2 text-left font-semibold border-b">Fecha</th>
              <th className="p-2 text-left font-semibold border-b">Cliente</th>
              <th className="p-2 text-left font-semibold border-b">C1</th>
              <th className="p-2 text-left font-semibold border-b">C2</th>
              <th className="p-2 text-left font-semibold border-b">Cant</th>
              <th className="p-2 text-left font-semibold border-b">P.Unit</th>
              <th className="p-2 text-left font-semibold border-b">Importe</th>
              <th className="p-2 text-left font-semibold border-b">Obs</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const pu = precioUnit(r.c1, r.c2, r.clienteId)
              const imp = pu * r.cant
              const sel = selection[r.id] !== false
              return (
                <tr key={r.id} className={`border-b ${sel ? '' : 'opacity-40'}`}>
                  <td className="p-2"><Checkbox checked={sel} onCheckedChange={() => toggleItem(r.id)} /></td>
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

      {/* Invoice Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-[900px] max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Factura</DialogTitle>
          </DialogHeader>
          {invoiceData && <InvoicePreview data={invoiceData} catalogo={catalogo} config={config} />}
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir
            </Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel/CSV
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
    let it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val)
    return it ? Number(it.final) || 0 : 0
  }

  return (
    <div className="font-[family-name:var(--font-geist-sans)] text-black text-[11pt] leading-[1.35]">
      {/* Header */}
      <div className="flex justify-between items-start gap-4 mb-4">
        <div className="text-[10.5pt] leading-[1.4]">
          <h2 className="text-[14pt] font-extrabold text-black mb-1">{config?.companyFullName || 'EMPRESA'}</h2>
          {config?.companyAddress && <>{config.companyAddress}<br /></>}
          {config?.companyCity && <>{config.companyCity}</>}
          {config?.companyProvince && <> {config.companyProvince}</>}
          {(config?.companyCity || config?.companyProvince) && <br />}
          <div className="mt-2 border border-black p-2 text-[10.5pt] w-fit">
            <b>{L.numero}:</b> {numero}<br />
            <b>{L.fecha}:</b> {fmtDate(fechaFact)}
          </div>
        </div>
        {config?.logo ? (
          <img
            src={config.logo.startsWith('data:') ? config.logo : `data:image/png;base64,${config.logo}`}
            alt="Logo"
            style={{ maxWidth: '230px', height: 'auto', objectFit: 'contain' }}
          />
        ) : (
          <Image
            src="/hualsa-logo.png"
            alt="Logo"
            width={200}
            height={55}
            style={{ maxWidth: '230px', height: 'auto' }}
          />
        )}
      </div>

      {/* Client */}
      <div className="border border-black p-3 mb-4 text-[11pt] bg-gray-50">
        <b>{L.cliente}:</b> {cli.nombre}<br />
        {cli.cif && <><b>CIF:</b> {cli.cif}<br /></>}
        {cli.dir}{cli.dir && <br />}
        {cli.cp} {cli.ciudad} {cli.prov}
      </div>

      {/* Lines */}
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
            const pu = precioUnit(r.c1, r.c2, r.clienteId)
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

      {/* Totals */}
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
