'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Trash2, Save, RotateCcw, Filter } from 'lucide-react'
import { useTenantFetch } from '@/lib/use-tenant-fetch'
import { fmtCurrency, fmtDate, getISOWeek, safeArray, todayISO, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'

interface RegistroViewData {
  registros: Registro[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
}

function useRegistroData(tenantFetch: (url: string, options?: RequestInit) => Promise<Response>) {
  const [data, setData] = useState<RegistroViewData>({ registros: [], clientes: [], catalogo: [] })
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [rRes, cRes, catRes] = await Promise.all([
      tenantFetch('/api/registros'), tenantFetch('/api/clientes'), tenantFetch('/api/catalogo')
    ])
    setData({ registros: safeArray(await rRes.json()), clientes: safeArray(await cRes.json()), catalogo: safeArray(await catRes.json()) })
    setLoading(false)
  }, [tenantFetch])

  return { data, loadData, loading }
}

export function RegistroView() {
  const { tenantFetch } = useTenantFetch()
  const { data, loadData, loading } = useRegistroData(tenantFetch)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form
  const [fecha, setFecha] = useState(todayISO())
  const [clienteId, setClienteId] = useState('')
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [cant, setCant] = useState('1')
  const [obs, setObs] = useState('')

  // Filters
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fQ, setFQ] = useState('')

  useEffect(() => {
    loadData()
  }, [loadData])

  const { registros, clientes, catalogo } = data

  // Available C1 options
  const c1Options = [...new Set(catalogo.map(x => x.c1))].sort()

  // Available C2 options based on selected C1 and cliente
  const c2Options = catalogo
    .filter(x => (!c1 || x.c1 === c1) && (!x.clienteId || x.clienteId === clienteId))
    .filter((x, i, arr) => arr.findIndex(y => y.c2 === x.c2) === i)

  function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
    let it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val)
    return it ? Number(it.final) || 0 : 0
  }

  async function handleSave() {
    if (!fecha || !clienteId || !c1 || !c2 || !cant) {
      alert('Completa fecha, cliente, conceptos y cantidad')
      return
    }
    const cli = clientes.find(c => c.id === clienteId)
    const body = { fecha, clienteId, cliente: cli?.nombre || '', c1, c2, cant: Number(cant), obs }

    if (editingId) {
      await tenantFetch('/api/registros', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
      setEditingId(null)
    } else {
      await tenantFetch('/api/registros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
    if (!confirm('¿Eliminar registro?')) return
    await tenantFetch(`/api/registros?id=${id}`, { method: 'DELETE' })
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

  // Filtered registros
  const filtered = registros.filter(r => {
    if (fDesde && r.fecha < fDesde) return false
    if (fHasta && r.fecha > fHasta) return false
    if (fCliente && fCliente !== '__all__' && r.clienteId !== fCliente) return false
    if (fQ) {
      const blob = (r.c1 + ' ' + r.c2 + ' ' + (r.obs || '') + ' ' + (r.cliente || '')).toLowerCase()
      if (!blob.includes(fQ.toLowerCase())) return false
    }
    return true
  })

  let tCant = 0, tImp = 0
  filtered.forEach(r => {
    tCant += r.cant
    tImp += precioUnit(r.c1, r.c2, r.clienteId) * r.cant
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Form */}
      <Card className={`border-l-4 ${editingId ? 'border-l-indigo-500 bg-indigo-50/30' : 'border-l-transparent'}`}>
        <CardContent className="p-4">
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
                    {c2Options.map(x => <SelectItem key={x.c2} value={x.c2}>{x.c2} ({fmtCurrency(precioUnit(c1, x.c2, clienteId))})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Cant.</Label>
                <Input type="number" value={cant} onChange={e => setCant(e.target.value)} min="1" />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Observaciones</Label>
                <Input value={obs} onChange={e => setObs(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} className="bg-[#005bb5] hover:bg-[#003d7a] text-white flex-1" disabled={loading}>
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto] gap-3 items-end">
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
              <Label className="text-xs uppercase font-bold text-slate-500">Buscar</Label>
              <Input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="C1, C2, obs..." />
            </div>
            <Button variant="default" className="bg-[#005bb5] hover:bg-[#003d7a] text-white">
              <Filter className="h-4 w-4 mr-1" /> FILTRAR
            </Button>
            <Button variant="outline" onClick={() => { setFDesde(''); setFHasta(''); setFCliente(''); setFQ('') }}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-3 shadow-sm text-sm font-bold">
        <span>Líneas:<b className="text-[#005bb5] ml-1">{filtered.length}</b></span>
        <span>Cantidad:<b className="text-[#005bb5] ml-1">{tCant}</b></span>
        <span>Importe:<b className="text-[#005bb5] ml-1">{fmtCurrency(tImp)}</b></span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-yellow-50">
              <th className="p-2 text-left font-semibold border-b">Fecha</th>
              <th className="p-2 text-left font-semibold border-b">Mes</th>
              <th className="p-2 text-left font-semibold border-b">Sem</th>
              <th className="p-2 text-left font-semibold border-b">Cliente</th>
              <th className="p-2 text-left font-semibold border-b">C1</th>
              <th className="p-2 text-left font-semibold border-b">C2</th>
              <th className="p-2 text-left font-semibold border-b">Cant</th>
              <th className="p-2 text-left font-semibold border-b">P.Unit</th>
              <th className="p-2 text-left font-semibold border-b">Importe</th>
              <th className="p-2 text-left font-semibold border-b">Obs</th>
              <th className="p-2 text-left font-semibold border-b">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const pu = precioUnit(r.c1, r.c2, r.clienteId)
              const imp = pu * r.cant
              const d = new Date(r.fecha)
              return (
                <tr key={r.id} className={`border-b hover:bg-gray-50 ${editingId === r.id ? 'bg-yellow-50' : ''}`}>
                  <td className="p-2">{fmtDate(r.fecha)}</td>
                  <td className="p-2">{d.getMonth() + 1}</td>
                  <td className="p-2">{getISOWeek(r.fecha)}</td>
                  <td className="p-2">{r.cliente}</td>
                  <td className="p-2">{r.c1}</td>
                  <td className="p-2">{r.c2}</td>
                  <td className="p-2">{r.cant}</td>
                  <td className="p-2">{fmtCurrency(pu)}</td>
                  <td className="p-2 font-bold">{fmtCurrency(imp)}</td>
                  <td className="p-2">{r.obs}</td>
                  <td className="p-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="p-6 text-center text-gray-400">No hay registros</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
