'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Filter, RotateCcw, FileSpreadsheet, Table2, CheckCircle2 } from 'lucide-react'
import { fmtCurrency, fmtDate, getISOWeek, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_FIELDS_REGISTROS, type FieldDef, parseCustomData } from '@/lib/config'
import { useTenantFetch } from '@/lib/use-tenant-fetch'

interface RegistrosViewData {
  registros: Registro[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
}

function useRegistrosData(tenantFetch: (url: string, options?: RequestInit) => Promise<Response>) {
  const [data, setData] = useState<RegistrosViewData>({ registros: [], clientes: [], catalogo: [] })
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [rRes, cRes, catRes] = await Promise.all([
      tenantFetch('/api/registros?filter=registros'), tenantFetch('/api/clientes'), tenantFetch('/api/catalogo')
    ])
    setData({ registros: await rRes.json(), clientes: await cRes.json(), catalogo: await catRes.json() })
    setLoading(false)
  }, [tenantFetch])

  return { data, loadData, loading }
}

export function RegistrosView() {
  const { tenantFetch } = useTenantFetch()
  const { data, loadData, loading } = useRegistrosData(tenantFetch)
  const { config } = useConfig()
  const fieldDefs = config?.fieldsRegistros || DEFAULT_FIELDS_REGISTROS
  const visibleFields = fieldDefs.filter(f => f.visible)

  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fC1, setFC1] = useState('')
  const [fQ, setFQ] = useState('')

  useEffect(() => { loadData() }, [loadData])

  const { registros, clientes, catalogo } = data

  function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
    let it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val)
    return it ? Number(it.final) || 0 : 0
  }

  const c1FilterOptions = [...new Set(catalogo.map(x => x.c1))].sort()

  const filtered = registros.filter(r => {
    if (fDesde && r.fecha < fDesde) return false
    if (fHasta && r.fecha > fHasta) return false
    if (fCliente && fCliente !== '__all__' && r.clienteId !== fCliente) return false
    if (fC1 && fC1 !== '__all__' && r.c1 !== fC1) return false
    if (fQ) { const blob = (r.c1 + ' ' + r.c2 + ' ' + (r.obs || '') + ' ' + (r.cliente || '')).toLowerCase(); if (!blob.includes(fQ.toLowerCase())) return false }
    return true
  }).sort((a, b) => a.fecha.localeCompare(b.fecha))

  let tCant = 0, tImp = 0
  filtered.forEach(r => { tCant += r.cant; tImp += precioUnit(r.c1, r.c2, r.clienteId) * r.cant })

  async function handleExportExcel() {
    const XLSX = await import('xlsx')
    const rows = filtered.map(r => {
      const pu = precioUnit(r.c1, r.c2, r.clienteId)
      const imp = pu * r.cant
      const d = new Date(r.fecha)
      const customData = parseCustomData((r as Record<string, unknown>).customData as string || '')
      const row: Record<string, unknown> = {
        Fecha: fmtDate(r.fecha), Mes: d.getMonth() + 1, Sem: getISOWeek(r.fecha),
        Cliente: r.cliente, 'Concepto 1': r.c1, 'Concepto 2': r.c2,
        Cant: r.cant, 'P.Unit': pu, Importe: imp, Obs: r.obs,
      }
      // Add custom fields
      visibleFields.filter(f => f.isCustom).forEach(f => { row[f.label] = customData[f.key] || '' })
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Registros')
    const totalsWs = XLSX.utils.json_to_sheet([{ 'TOTAL CANTIDAD': tCant, 'TOTAL IMPORTE': tImp, 'Nº LÍNEAS': filtered.length }])
    XLSX.utils.book_append_sheet(wb, totalsWs, 'Resumen')
    const appName = config?.appName || 'HUALSA'; XLSX.writeFile(wb, `Registros_${appName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Get cell value for a field
  function getCellValue(r: Registro, field: FieldDef): React.ReactNode {
    const pu = precioUnit(r.c1, r.c2, r.clienteId)
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Table2 className="h-5 w-5 text-[#005bb5]" />
        <h2 className="text-lg font-bold text-gray-700">Registros</h2>
        <span className="text-xs text-gray-400 ml-2">Entradas + datos de catálogo</span>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto] gap-3 items-end">
            <div><Label className="text-xs uppercase font-bold text-slate-500">Desde</Label><Input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} /></div>
            <div><Label className="text-xs uppercase font-bold text-slate-500">Hasta</Label><Input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} /></div>
            <div><Label className="text-xs uppercase font-bold text-slate-500">Cliente</Label><Select value={fCliente} onValueChange={setFCliente}><SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger><SelectContent><SelectItem value="__all__">— Todos —</SelectItem>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs uppercase font-bold text-slate-500">C1</Label><Select value={fC1} onValueChange={setFC1}><SelectTrigger><SelectValue placeholder="— Todos —" /></SelectTrigger><SelectContent><SelectItem value="__all__">— Todos —</SelectItem>{c1FilterOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs uppercase font-bold text-slate-500">Buscar</Label><Input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="Texto..." /></div>
            <Button variant="default" className="bg-[#005bb5] hover:bg-[#003d7a] text-white"><Filter className="h-4 w-4 mr-1" /> FILTRAR</Button>
            <Button variant="outline" onClick={() => { setFDesde(''); setFHasta(''); setFCliente(''); setFC1(''); setFQ('') }}><RotateCcw className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-3 shadow-sm text-sm font-bold">
        <span>Líneas:<b className="text-[#005bb5] ml-1">{filtered.length}</b></span>
        <span>Cantidad:<b className="text-[#005bb5] ml-1">{tCant}</b></span>
        <span>Importe:<b className="text-[#2bb24c] ml-1">{fmtCurrency(tImp)}</b></span>
        <div className="ml-auto"><Button onClick={handleExportExcel} variant="outline" size="sm" disabled={filtered.length === 0}><FileSpreadsheet className="h-4 w-4 mr-1" /> Exportar Excel</Button></div>
      </div>

      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-[#005bb5] text-white">
              {visibleFields.map(f => (
                <th key={f.key} className="p-2.5 text-left font-semibold border-b border-[#004a94]">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b hover:bg-blue-50/50 transition-colors">
                {visibleFields.map(f => (
                  <td key={f.key} className={`p-2 ${f.key === 'importe' ? 'font-bold text-[#005bb5]' : f.key === 'precioUnitario' ? 'text-gray-600' : f.key === 'observaciones' ? 'text-gray-500 text-xs' : ''}`}>
                    {getCellValue(r, f)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={visibleFields.length} className="p-8 text-center text-gray-400">{loading ? 'Cargando...' : 'No hay registros con estos filtros'}</td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 font-bold text-sm">
                <td className="p-2.5" colSpan={visibleFields.findIndex(f => f.key === 'cantidad')}>TOTALES</td>
                <td className="p-2.5 text-right">{tCant}</td>
                {visibleFields.filter(f => f.key !== 'cantidad' && visibleFields.indexOf(f) > visibleFields.findIndex(ff => ff.key === 'cantidad')).map(f => (
                  <td key={f.key} className="p-2.5">{f.key === 'importe' ? <span className="text-[#005bb5]">{fmtCurrency(tImp)}</span> : ''}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
