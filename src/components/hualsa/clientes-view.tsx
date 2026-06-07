'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Pencil, Trash2, Save, RotateCcw, Settings2, ChevronDown } from 'lucide-react'
import type { Cliente } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_LABELS_CLIENTES } from '@/lib/config'

export function ClientesView() {
  const { config, update } = useConfig()
  const L = config?.labelsClientes || DEFAULT_LABELS_CLIENTES
  const [showSettings, setShowSettings] = useState(false)
  const [localLabels, setLocalLabels] = useState(DEFAULT_LABELS_CLIENTES)
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

  // Sync local labels from config
  useEffect(() => {
    if (config?.labelsClientes) setLocalLabels(config.labelsClientes)
  }, [config?.labelsClientes])

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

  async function handleSaveSettings() {
    await update({ labelClientes: JSON.stringify(localLabels) })
    setShowSettings(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Inline Settings ──── */}
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600 font-medium">Configuración de Clientes</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
        </button>
        {showSettings && (
          <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3 bg-gray-50/50">
            <p className="text-xs text-gray-500">Personaliza las etiquetas de los campos de clientes.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(Object.keys(DEFAULT_LABELS_CLIENTES) as (keyof typeof DEFAULT_LABELS_CLIENTES)[]).map(key => (
                <div key={key}>
                  <Label className="text-[10px] uppercase font-bold text-slate-400">{key}</Label>
                  <Input
                    value={localLabels[key]}
                    onChange={e => setLocalLabels(prev => ({ ...prev, [key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveSettings}
                className="h-9 px-4 rounded-lg bg-[#005bb5] hover:bg-[#003d7a] text-white text-sm font-bold flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" /> GUARDAR
              </button>
              <button
                onClick={() => { setLocalLabels(DEFAULT_LABELS_CLIENTES) }}
                className="h-9 px-4 rounded-lg border border-gray-300 text-gray-500 text-sm hover:bg-gray-100 flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
              </button>
            </div>
          </div>
        )}
      </div>

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
