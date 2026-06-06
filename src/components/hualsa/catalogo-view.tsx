'use client'

import { useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Trash2, Save, RotateCcw, Filter } from 'lucide-react'
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

  function resetForm() {
    setEditingId(null)
    setClienteId(''); setC1(''); setC2(''); setCoste(''); setInc('0'); setFinalVal('')
  }

  async function handleSave() {
    if (!c1 || !c2) { alert('Grupo (C1) y Servicio (C2) son obligatorios'); return }
    const finalPrice = finalVal || computedFinal
    const effectiveClienteId = (clienteId === '__none__' || !clienteId) ? '' : clienteId
    const body = { clienteId: effectiveClienteId, c1, c2, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(finalPrice) || 0 }
    if (editingId) {
      await fetch('/api/catalogo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
    } else {
      await fetch('/api/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}
