'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Pencil, Trash2, Save, RotateCcw, Settings2, ChevronDown } from 'lucide-react'
import { safeArray, type Cliente } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_FIELDS_CLIENTES, type FieldDef, parseCustomData, serializeCustomData } from '@/lib/config'
import { useTenantFetch } from '@/lib/use-tenant-fetch'

export function ClientesView() {
  const { tenantFetch } = useTenantFetch()
  const { config, update } = useConfig()
  const fieldDefs = config?.fieldsClientes || DEFAULT_FIELDS_CLIENTES
  const visibleFields = fieldDefs.filter(f => f.visible)
  const isVisible = (key: string) => visibleFields.some(f => f.key === key)
  const [showSettings, setShowSettings] = useState(false)
  const [localLabels, setLocalLabels] = useState<Record<string, string>>({})
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  // Core field state
  const [nombre, setNombre] = useState('')
  const [cif, setCif] = useState('')
  const [mail, setMail] = useState('')
  const [tel, setTel] = useState('')
  const [dir, setDir] = useState('')
  const [cp, setCp] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [prov, setProv] = useState('')

  // Custom fields state
  const [customValues, setCustomValues] = useState<Record<string, string>>({})

  // Sync labels from field definitions
  useEffect(() => {
    const labels: Record<string, string> = {}
    fieldDefs.forEach(f => { labels[f.key] = f.label })
    setLocalLabels(labels)
  }, [fieldDefs])

  const getLabel = (key: string) => localLabels[key] || key

  const loadData = useCallback(async () => {
    const res = await tenantFetch('/api/clientes')
    setClientes(safeArray(await res.json()))
  }, [tenantFetch])

  useEffect(() => { loadData() }, [loadData])

  function resetForm() {
    setEditingId(null)
    setNombre(''); setCif(''); setMail(''); setTel('')
    setDir(''); setCp(''); setCiudad(''); setProv('')
    setCustomValues({})
  }

  function setCustomValue(key: string, value: string) {
    setCustomValues(prev => ({ ...prev, [key]: value }))
  }

  // Get core field value
  function getCoreValue(key: string): string {
    switch (key) {
      case 'nombre': return nombre
      case 'cif': return cif
      case 'direccion': return dir
      case 'cp': return cp
      case 'ciudad': return ciudad
      case 'provincia': return prov
      case 'mail': return mail
      case 'telefono': return tel
      default: return ''
    }
  }

  // Set core field value
  function setCoreValue(key: string, value: string) {
    switch (key) {
      case 'nombre': setNombre(value); break
      case 'cif': setCif(value); break
      case 'direccion': setDir(value); break
      case 'cp': setCp(value); break
      case 'ciudad': setCiudad(value); break
      case 'provincia': setProv(value); break
      case 'mail': setMail(value); break
      case 'telefono': setTel(value); break
    }
  }

  async function handleSave() {
    if (!nombre) { alert('Nombre obligatorio'); return }
    const customDataStr = serializeCustomData(customValues)
    const body = { nombre, cif, mail, tel, dir, cp, ciudad, prov, customData: customDataStr }
    if (editingId) {
      await tenantFetch('/api/clientes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
    } else {
      await tenantFetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    resetForm(); loadData()
  }

  function handleEdit(c: Cliente) {
    setEditingId(c.id)
    setNombre(c.nombre); setCif(c.cif); setMail(c.mail); setTel(c.tel)
    setDir(c.dir); setCp(c.cp); setCiudad(c.ciudad); setProv(c.prov)
    const cd = parseCustomData((c as Record<string, unknown>).customData as string || '')
    setCustomValues(cd as Record<string, string>)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar cliente?')) return
    await tenantFetch(`/api/clientes?id=${id}`, { method: 'DELETE' }); loadData()
  }

  // Get display value from a cliente record for a field
  function getDisplayValue(c: Cliente, field: FieldDef): string {
    if (field.isCustom) {
      const cd = parseCustomData((c as Record<string, unknown>).customData as string || '')
      return String(cd[field.key] || '')
    }
    switch (field.key) {
      case 'nombre': return c.nombre
      case 'cif': return c.cif
      case 'direccion': return c.dir
      case 'cp': return c.cp
      case 'ciudad': return c.ciudad
      case 'provincia': return c.prov
      case 'mail': return c.mail
      case 'telefono': return c.tel
      default: return ''
    }
  }

  // Render field input
  function renderFieldInput(field: FieldDef) {
    const value = field.isCustom ? (customValues[field.key] || '') : getCoreValue(field.key)
    const onChange = field.isCustom
      ? (e: React.ChangeEvent<HTMLInputElement>) => setCustomValue(field.key, e.target.value)
      : (e: React.ChangeEvent<HTMLInputElement>) => setCoreValue(field.key, e.target.value)

    return (
      <div key={field.key}>
        <Label className="text-xs uppercase font-bold text-slate-500">{field.label}{field.required ? ' *' : ''}</Label>
        <Input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          step={field.type === 'number' ? '0.01' : undefined}
          value={value}
          onChange={onChange}
          placeholder={field.placeholder || field.label}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className={`border-l-4 ${editingId ? 'border-l-indigo-500 bg-indigo-50/30' : 'border-l-transparent'}`}>
        <CardContent className="p-4">
          <div className="grid gap-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {visibleFields.filter(f => !f.isCustom).slice(0, 4).map(renderFieldInput)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_150px] gap-3">
              {visibleFields.filter((f, i) => !f.isCustom && i >= 4).map(renderFieldInput)}
              {/* Custom fields inline */}
              {visibleFields.filter(f => f.isCustom).map(renderFieldInput)}
              <div className="flex gap-2 items-end">
                <Button onClick={handleSave} className="bg-[#005bb5] hover:bg-[#003d7a] text-white flex-1">
                  <Save className="h-4 w-4 mr-1" />{editingId ? 'ACTUALIZAR' : 'GUARDAR'}
                </Button>
                {editingId && <Button onClick={resetForm} variant="outline" size="icon"><RotateCcw className="h-4 w-4" /></Button>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-green-50">
              {visibleFields.map(f => (
                <th key={f.key} className="p-2 text-left font-semibold border-b">{f.label}</th>
              ))}
              <th className="p-2 text-left font-semibold border-b">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map(c => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                {visibleFields.map(f => (
                  <td key={f.key} className="p-2">{getDisplayValue(c, f)}</td>
                ))}
                <td className="p-2">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr><td colSpan={visibleFields.length + 1} className="p-6 text-center text-gray-400">No hay clientes</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
