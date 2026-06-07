'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Pencil, Trash2, Save, RotateCcw } from 'lucide-react'
import type { Cliente } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_LABELS_CLIENTES } from '@/lib/config'

export function ClientesView() {
  const { config } = useConfig()
  const L = config?.labelsClientes || DEFAULT_LABELS_CLIENTES
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [cif, setCif] = useState('')
  const [mail, setMail] = useState('')
  const [tel, setTel] = useState('')
  const [dir, setDir] = useState('')
  const [cp, setCp] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [prov, setProv] = useState('')

  const loadData = useCallback(async () => {
    const res = await fetch('/api/clientes')
    setClientes(await res.json())
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function resetForm() {
    setEditingId(null)
    setNombre(''); setCif(''); setMail(''); setTel('')
    setDir(''); setCp(''); setCiudad(''); setProv('')
  }

  async function handleSave() {
    if (!nombre) { alert('Nombre obligatorio'); return }
    const body = { nombre, cif, mail, tel, dir, cp, ciudad, prov }
    if (editingId) {
      await fetch('/api/clientes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
    } else {
      await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    resetForm()
    loadData()
  }

  function handleEdit(c: Cliente) {
    setEditingId(c.id)
    setNombre(c.nombre); setCif(c.cif); setMail(c.mail); setTel(c.tel)
    setDir(c.dir); setCp(c.cp); setCiudad(c.ciudad); setProv(c.prov)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar cliente?')) return
    await fetch(`/api/clientes?id=${id}`, { method: 'DELETE' })
    loadData()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className={`border-l-4 ${editingId ? 'border-l-indigo-500 bg-indigo-50/30' : 'border-l-transparent'}`}>
        <CardContent className="p-4">
          <div className="grid gap-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">{L.nombre}</Label>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">{L.cif}</Label>
                <Input value={cif} onChange={e => setCif(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">{L.mail}</Label>
                <Input type="email" value={mail} onChange={e => setMail(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">{L.telefono}</Label>
                <Input value={tel} onChange={e => setTel(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_150px] gap-3">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">{L.direccion}</Label>
                <Input value={dir} onChange={e => setDir(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">{L.cp}</Label>
                <Input value={cp} onChange={e => setCp(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">{L.ciudad}</Label>
                <Input value={ciudad} onChange={e => setCiudad(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">{L.provincia}</Label>
                <Input value={prov} onChange={e => setProv(e.target.value)} />
              </div>
              <div className="flex gap-2 items-end">
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
          </div>
        </CardContent>
      </Card>

      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-green-50">
              <th className="p-2 text-left font-semibold border-b">{L.nombre}</th>
              <th className="p-2 text-left font-semibold border-b">{L.cif}</th>
              <th className="p-2 text-left font-semibold border-b">{L.direccion}</th>
              <th className="p-2 text-left font-semibold border-b">{L.cp}</th>
              <th className="p-2 text-left font-semibold border-b">{L.ciudad}</th>
              <th className="p-2 text-left font-semibold border-b">{L.provincia}</th>
              <th className="p-2 text-left font-semibold border-b">Contacto</th>
              <th className="p-2 text-left font-semibold border-b">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map(c => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="p-2">{c.nombre}</td>
                <td className="p-2">{c.cif}</td>
                <td className="p-2">{c.dir}</td>
                <td className="p-2">{c.cp}</td>
                <td className="p-2">{c.ciudad}</td>
                <td className="p-2">{c.prov}</td>
                <td className="p-2">{c.mail}{c.tel ? <><br />{c.tel}</> : ''}</td>
                <td className="p-2">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-gray-400">No hay clientes</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
