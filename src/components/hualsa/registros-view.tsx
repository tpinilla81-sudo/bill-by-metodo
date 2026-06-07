'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Filter, RotateCcw, FileSpreadsheet, Table2 } from 'lucide-react'
import { fmtCurrency, fmtDate, getISOWeek, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_LABELS_REGISTROS } from '@/lib/config'

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
      fetch('/api/registros'), fetch('/api/clientes'), fetch('/api/catalogo')
    ])
    setData({ registros: await rRes.json(), clientes: await cRes.json(), catalogo: await catRes.json() })
    setLoading(false)
  }, [])

  return { data, loadData, loading }
}

export function RegistrosView() {
  const { data, loadData, loading } = useRegistrosData()
  const { config } = useConfig()
  const L = config?.labelsRegistros || DEFAULT_LABELS_REGISTROS
  // Filters
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fC1, setFC1] = useState('')
  const [fQ, setFQ] = useState('')

  useEffect(() => {
    loadData()
  }, [loadData])

  const { registros, clientes, catalogo } = data

  function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
    let it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val)
    return it ? Number(it.final) || 0 : 0
  }

  // C1 options for filter
  const c1FilterOptions = [...new Set(catalogo.map(x => x.c1))].sort()

  // Filtered registros
  const filtered = registros.filter(r => {
    if (fDesde && r.fecha < fDesde) return false
    if (fHasta && r.fecha > fHasta) return false
    if (fCliente && fCliente !== '__all__' && r.clienteId !== fCliente) return false
    if (fC1 && fC1 !== '__all__' && r.c1 !== fC1) return false
    if (fQ) {
      const blob = (r.c1 + ' ' + r.c2 + ' ' + (r.obs || '') + ' ' + (r.cliente || '')).toLowerCase()
      if (!blob.includes(fQ.toLowerCase())) return false
    }
    return true
  }).sort((a, b) => a.fecha.localeCompare(b.fecha))

  let tCant = 0, tImp = 0
  filtered.forEach(r => {
    tCant += r.cant
    tImp += precioUnit(r.c1, r.c2, r.clienteId) * r.cant
  })

  // Export to Excel
  async function handleExportExcel() {
    const XLSX = await import('xlsx')
    const rows = filtered.map(r => {
      const pu = precioUnit(r.c1, r.c2, r.clienteId)
      const imp = pu * r.cant
      const d = new Date(r.fecha)
      return {
        [L.fecha]: fmtDate(r.fecha),
        [L.mes]: d.getMonth() + 1,
        [L.semana]: getISOWeek(r.fecha),
        [L.cliente]: r.cliente,
        [L.c1]: r.c1,
        [L.c2]: r.c2,
        [L.cantidad]: r.cant,
        [L.precioUnitario]: pu,
        [L.importe]: imp,
        [L.observaciones]: r.obs,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 12 }, { wch: 5 }, { wch: 7 }, { wch: 25 },
      { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 30 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Registros')

    // Add totals row
    const totalsWs = XLSX.utils.json_to_sheet([{
      'TOTAL CANTIDAD': tCant,
      'TOTAL IMPORTE': tImp,
      'Nº LÍNEAS': filtered.length,
    }])
    XLSX.utils.book_append_sheet(wb, totalsWs, 'Resumen')

    const appName = config?.appName || 'HUALSA'
    XLSX.writeFile(wb, `Registros_${appName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Table2 className="h-5 w-5 text-[#005bb5]" />
        <h2 className="text-lg font-bold text-gray-700">Registros</h2>
        <span className="text-xs text-gray-400 ml-2">Entradas + datos de catálogo</span>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto] gap-3 items-end">
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Desde</Label>
              <Input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Hasta</Label>
              <Input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} />
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
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">C1</Label>
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
              <Input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="Texto..." />
            </div>
            <Button variant="default" className="bg-[#005bb5] hover:bg-[#003d7a] text-white">
              <Filter className="h-4 w-4 mr-1" /> FILTRAR
            </Button>
            <Button variant="outline" onClick={() => { setFDesde(''); setFHasta(''); setFCliente(''); setFC1(''); setFQ('') }}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-3 shadow-sm text-sm font-bold">
        <span>Líneas:<b className="text-[#005bb5] ml-1">{filtered.length}</b></span>
        <span>Cantidad:<b className="text-[#005bb5] ml-1">{tCant}</b></span>
        <span>Importe:<b className="text-[#2bb24c] ml-1">{fmtCurrency(tImp)}</b></span>
        <div className="ml-auto">
          <Button onClick={handleExportExcel} variant="outline" size="sm" disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Exportar Excel
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-[#005bb5] text-white">
              <th className="p-2.5 text-left font-semibold border-b border-[#004a94]">{L.fecha}</th>
              <th className="p-2.5 text-left font-semibold border-b border-[#004a94]">{L.mes}</th>
              <th className="p-2.5 text-left font-semibold border-b border-[#004a94]">{L.semana}</th>
              <th className="p-2.5 text-left font-semibold border-b border-[#004a94]">{L.cliente}</th>
              <th className="p-2.5 text-left font-semibold border-b border-[#004a94]">{L.c1}</th>
              <th className="p-2.5 text-left font-semibold border-b border-[#004a94]">{L.c2}</th>
              <th className="p-2.5 text-right font-semibold border-b border-[#004a94]">{L.cantidad}</th>
              <th className="p-2.5 text-right font-semibold border-b border-[#004a94]">{L.precioUnitario}</th>
              <th className="p-2.5 text-right font-semibold border-b border-[#004a94]">{L.importe}</th>
              <th className="p-2.5 text-left font-semibold border-b border-[#004a94]">{L.observaciones}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const pu = precioUnit(r.c1, r.c2, r.clienteId)
              const imp = pu * r.cant
              const d = new Date(r.fecha)
              return (
                <tr key={r.id} className="border-b hover:bg-blue-50/50 transition-colors">
                  <td className="p-2">{fmtDate(r.fecha)}</td>
                  <td className="p-2 text-center">{d.getMonth() + 1}</td>
                  <td className="p-2 text-center">{getISOWeek(r.fecha)}</td>
                  <td className="p-2">{r.cliente}</td>
                  <td className="p-2">{r.c1}</td>
                  <td className="p-2">{r.c2}</td>
                  <td className="p-2 text-right">{r.cant}</td>
                  <td className="p-2 text-right text-gray-600">{fmtCurrency(pu)}</td>
                  <td className="p-2 text-right font-bold text-[#005bb5]">{fmtCurrency(imp)}</td>
                  <td className="p-2 text-gray-500 text-xs">{r.obs}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="p-8 text-center text-gray-400">
                {loading ? 'Cargando...' : 'No hay registros con estos filtros'}
              </td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 font-bold text-sm">
                <td className="p-2.5" colSpan={6}>TOTALES</td>
                <td className="p-2.5 text-right">{tCant}</td>
                <td className="p-2.5"></td>
                <td className="p-2.5 text-right text-[#005bb5]">{fmtCurrency(tImp)}</td>
                <td className="p-2.5"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
