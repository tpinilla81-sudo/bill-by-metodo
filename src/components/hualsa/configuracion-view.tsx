'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings, Building2, Upload, Save, Image as ImageIcon, RotateCcw, CheckCircle, Tag, ArrowRightLeft, Clock, Zap, Eye, EyeOff, LayoutList, Pencil, Trash2, Plus, BookOpen, X } from 'lucide-react'
import {
  useConfig,
  DEFAULT_LABELS_ENTRADA,
  DEFAULT_LABELS_CATALOGO,
  DEFAULT_LABELS_REGISTROS,
  DEFAULT_LABELS_FACTURAS,
  DEFAULT_LABELS_CLIENTES,
  DEFAULT_FIELDS_ENTRADA,
  DEFAULT_FIELDS_CLIENTES,
  DEFAULT_FIELDS_CATALOGO,
  type AppConfig,
} from '@/lib/config'
import type { CatalogoItem, Cliente } from '@/lib/hualsa-utils'

// Field labels map (human-readable names for field keys)
const FIELD_LABELS_ENTRADA: Record<string, string> = {
  fecha: 'Fecha',
  cliente: 'Cliente',
  c1: 'Concepto 1',
  c2: 'Concepto 2',
  cantidad: 'Cantidad',
  observaciones: 'Observaciones',
}

const FIELD_LABELS_CLIENTES: Record<string, string> = {
  nombre: 'Nombre',
  cif: 'CIF',
  direccion: 'Dirección',
  cp: 'Código Postal',
  ciudad: 'Ciudad',
  provincia: 'Provincia',
  mail: 'Email',
  telefono: 'Teléfono',
}

const FIELD_LABELS_CATALOGO: Record<string, string> = {
  cliente: 'Cliente',
  c1: 'Concepto 1',
  c2: 'Concepto 2',
  coste: 'Coste',
  incremento: 'Incremento',
  precioCliente: 'Precio Cliente',
}

// ─── ConceptosManager: Full CRUD for catalog concepts ─────────
function ConceptosManager() {
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Form state
  const [formC1, setFormC1] = useState('')
  const [formC2, setFormC2] = useState('')
  const [formClienteId, setFormClienteId] = useState('')
  const [formCoste, setFormCoste] = useState('')
  const [formInc, setFormInc] = useState('0')

  // Filter
  const [filterC1, setFilterC1] = useState('')
  const [filterCli, setFilterCli] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [catRes, cliRes] = await Promise.all([fetch('/api/catalogo'), fetch('/api/clientes')])
      setCatalogo(await catRes.json())
      setClientes(await cliRes.json())
    } catch (err) {
      console.error('Error loading conceptos:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function showMsg(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  function resetForm() {
    setEditingId(null)
    setFormC1(''); setFormC2(''); setFormClienteId(''); setFormCoste(''); setFormInc('0')
  }

  // Unique C1 groups
  const c1Groups = [...new Set(catalogo.map(x => x.c1))].sort()

  // Filtered catalogo
  const filtered = catalogo.filter(x => {
    if (filterC1 && x.c1 !== filterC1) return false
    if (filterCli === '__gen__' && x.clienteId) return false
    if (filterCli && filterCli !== '__gen__' && x.clienteId !== filterCli) return false
    return true
  })

  async function handleSave() {
    if (!formC1 || !formC2) { showMsg('err', 'Concepto 1 y Concepto 2 son obligatorios'); return }
    const costeNum = Number(formCoste) || 0
    const incNum = Number(formInc) || 0
    const finalNum = costeNum * (1 + incNum / 100)
    const body = {
      clienteId: formClienteId || '',
      c1: formC1,
      c2: formC2,
      coste: costeNum,
      inc: incNum,
      final: Number(finalNum.toFixed(2)),
    }

    if (editingId) {
      await fetch('/api/catalogo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...body })
      })
      showMsg('ok', 'Concepto actualizado ✓')
    } else {
      await fetch('/api/catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      showMsg('ok', 'Concepto añadido ✓')
    }
    resetForm()
    loadData()
  }

  function handleEdit(x: CatalogoItem) {
    setEditingId(x.id)
    setFormC1(x.c1); setFormC2(x.c2); setFormClienteId(x.clienteId || '')
    setFormCoste(String(x.coste)); setFormInc(String(x.inc))
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este concepto?')) return
    await fetch(`/api/catalogo?id=${id}`, { method: 'DELETE' })
    showMsg('ok', 'Concepto eliminado')
    loadData()
  }

  // Rename a C1 group across all catalog items
  async function handleRenameC1(oldName: string) {
    const newName = prompt(`Renombrar grupo "${oldName}" a:`, oldName)
    if (!newName || newName === oldName) return
    const items = catalogo.filter(x => x.c1 === oldName)
    for (const item of items) {
      await fetch('/api/catalogo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, c1: newName, c2: item.c2, clienteId: item.clienteId || '', coste: item.coste, inc: item.inc, final: item.final })
      })
    }
    showMsg('ok', `Grupo "${oldName}" renombrado a "${newName}" ✓`)
    loadData()
  }

  // Delete entire C1 group
  async function handleDeleteC1(name: string) {
    const count = catalogo.filter(x => x.c1 === name).length
    if (!confirm(`¿Eliminar el grupo "${name}" con ${count} concepto(s)?`)) return
    const items = catalogo.filter(x => x.c1 === name)
    for (const item of items) {
      await fetch(`/api/catalogo?id=${item.id}`, { method: 'DELETE' })
    }
    showMsg('ok', `Grupo "${name}" eliminado (${count} conceptos)`)
    loadData()
  }

  // Add a new empty C1 group (creates a placeholder item)
  async function handleAddC1() {
    const name = prompt('Nombre del nuevo grupo (Concepto 1):')
    if (!name) return
    await fetch('/api/catalogo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ c1: name, c2: '(nuevo)', coste: 0, inc: 0, final: 0 })
    })
    showMsg('ok', `Grupo "${name}" creado ✓`)
    loadData()
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando conceptos...</div>

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
          statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : null}
          {statusMsg.text}
        </div>
      )}

      <p className="text-sm text-gray-500">
        Gestiona los conceptos del catálogo. Añade nuevos, edita los existentes o elimina los que no necesites.
        Los conceptos que añadas aquí aparecerán como sugerencias en la Entrada.
      </p>

      {/* ── C1 Groups Overview ──── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#005bb5]" /> Grupos (Concepto 1)
            <span className="text-xs text-gray-400 ml-auto">{c1Groups.length} grupos</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            {c1Groups.map(g => {
              const count = catalogo.filter(x => x.c1 === g).length
              return (
                <div key={g} className="flex items-center gap-0 border-2 border-[#005bb5]/20 rounded-xl overflow-hidden bg-blue-50/50">
                  <button
                    onClick={() => setFilterC1(filterC1 === g ? '' : g)}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      filterC1 === g ? 'bg-[#005bb5] text-white' : 'text-[#005bb5] hover:bg-blue-100'
                    }`}
                  >
                    {g} <span className="text-xs opacity-70">({count})</span>
                  </button>
                  <button
                    onClick={() => handleRenameC1(g)}
                    className="px-2 py-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Renombrar grupo"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteC1(g)}
                    className="px-2 py-2 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Eliminar grupo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
            <button
              onClick={handleAddC1}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-[#2bb24c] hover:text-[#2bb24c] transition-colors text-sm"
            >
              <Plus className="h-4 w-4" /> Nuevo grupo
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Add / Edit Form ──── */}
      <Card className={`border-l-4 ${editingId ? 'border-l-indigo-500 bg-indigo-50/30' : 'border-l-[#2bb24c]'}`}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {editingId ? <Pencil className="h-4 w-4 text-indigo-500" /> : <Plus className="h-4 w-4 text-[#2bb24c]" />}
            {editingId ? 'Editar Concepto' : 'Añadir Concepto'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Grupo (C1)</Label>
              <Input value={formC1} onChange={e => setFormC1(e.target.value)} placeholder="Ej: Transporte" />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Servicio (C2)</Label>
              <Input value={formC2} onChange={e => setFormC2(e.target.value)} placeholder="Ej: Carga completa" />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Cliente</Label>
              <Select value={formClienteId || '__none__'} onValueChange={setFormClienteId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— General —</SelectItem>
                  {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Coste (€)</Label>
              <Input type="number" step="0.01" value={formCoste} onChange={e => setFormCoste(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Incremento %</Label>
              <Input type="number" step="0.01" value={formInc} onChange={e => setFormInc(e.target.value)} placeholder="0" />
            </div>
            <div className="flex gap-1">
              <Button onClick={handleSave} className="bg-[#2bb24c] hover:bg-[#23963e] text-white">
                <Save className="h-4 w-4 mr-1" />
                {editingId ? 'ACTUALIZAR' : 'AÑADIR'}
              </Button>
              {editingId && (
                <Button onClick={resetForm} variant="outline" size="icon">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Table of Concepts ──── */}
      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-50">
              <th className="p-2 text-left font-semibold border-b">Grupo (C1)</th>
              <th className="p-2 text-left font-semibold border-b">Servicio (C2)</th>
              <th className="p-2 text-left font-semibold border-b">Cliente</th>
              <th className="p-2 text-right font-semibold border-b">Coste</th>
              <th className="p-2 text-right font-semibold border-b">Inc. %</th>
              <th className="p-2 text-right font-semibold border-b">P. Final</th>
              <th className="p-2 text-center font-semibold border-b">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(x => {
              const cli = clientes.find(c => c.id === x.clienteId)
              return (
                <tr key={x.id} className={`border-b hover:bg-gray-50 ${editingId === x.id ? 'bg-indigo-50' : ''}`}>
                  <td className="p-2 font-medium">{x.c1}</td>
                  <td className="p-2">{x.c2}</td>
                  <td className="p-2 text-gray-500">{cli ? cli.nombre : <i>General</i>}</td>
                  <td className="p-2 text-right">{x.coste.toFixed(2)}€</td>
                  <td className="p-2 text-right">{x.inc.toFixed(2)}%</td>
                  <td className="p-2 text-right font-bold">{x.final.toFixed(2)}€</td>
                  <td className="p-2 text-center">
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
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay conceptos{filterC1 ? ` en el grupo "${filterC1}"` : ''}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Toggle chip component for field visibility ───────────────
function FieldToggle({
  fieldKey,
  label,
  active,
  onToggle,
}: {
  fieldKey: string
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
        active
          ? 'border-[#2bb24c] bg-green-50 text-green-700'
          : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
      }`}
    >
      {active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      <span>{label}</span>
    </button>
  )
}

export function ConfiguracionView() {
  const { raw, config, update, loading } = useConfig()
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Local state for editing (initialized from config)
  const [companyName, setCompanyName] = useState('')
  const [companyFullName, setCompanyFullName] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyCity, setCompanyCity] = useState('')
  const [companyProvince, setCompanyProvince] = useState('')
  const [companyCif, setCompanyCif] = useState('')
  const [currency, setCurrency] = useState('€')
  const [defaultIva, setDefaultIva] = useState('21')
  const [appName, setAppName] = useState('')
  const [appVersion, setAppVersion] = useState('')

  // Section names
  const [sectionEntrada, setSectionEntrada] = useState('')
  const [sectionRegistros, setSectionRegistros] = useState('')
  const [sectionClientes, setSectionClientes] = useState('')
  const [sectionCatalogo, setSectionCatalogo] = useState('')
  const [sectionFacturas, setSectionFacturas] = useState('')
  const [sectionBackup, setSectionBackup] = useState('')

  // Transfer settings
  const [transferMode, setTransferMode] = useState('auto')
  const [transferTime, setTransferTime] = useState('00:00')

  // Labels
  const [labelsEntrada, setLabelsEntrada] = useState(DEFAULT_LABELS_ENTRADA)
  const [labelsCatalogo, setLabelsCatalogo] = useState(DEFAULT_LABELS_CATALOGO)
  const [labelsRegistros, setLabelsRegistros] = useState(DEFAULT_LABELS_REGISTROS)
  const [labelsFacturas, setLabelsFacturas] = useState(DEFAULT_LABELS_FACTURAS)
  const [labelsClientes, setLabelsClientes] = useState(DEFAULT_LABELS_CLIENTES)

  // Visible fields
  const [fieldsEntrada, setFieldsEntrada] = useState<string[]>(DEFAULT_FIELDS_ENTRADA)
  const [fieldsClientes, setFieldsClientes] = useState<string[]>(DEFAULT_FIELDS_CLIENTES)
  const [fieldsCatalogo, setFieldsCatalogo] = useState<string[]>(DEFAULT_FIELDS_CATALOGO)

  // Logo preview
  const [logoPreview, setLogoPreview] = useState('')
  const [logoBase64, setLogoBase64] = useState('')

  // Initialize local state from config when loaded
  const [initDone, setInitDone] = useState(false)
  if (config && raw && !initDone) {
    setInitDone(true)
    setCompanyName(raw.companyName)
    setCompanyFullName(raw.companyFullName)
    setCompanyAddress(raw.companyAddress)
    setCompanyCity(raw.companyCity)
    setCompanyProvince(raw.companyProvince)
    setCompanyCif(raw.companyCif)
    setCurrency(raw.currency)
    setDefaultIva(String(raw.defaultIva))
    setAppName(raw.appName)
    setAppVersion(raw.appVersion)
    setSectionEntrada(raw.sectionEntrada)
    setSectionRegistros(raw.sectionRegistros)
    setSectionClientes(raw.sectionClientes)
    setSectionCatalogo(raw.sectionCatalogo)
    setSectionFacturas(raw.sectionFacturas)
    setSectionBackup(raw.sectionBackup)
    setTransferMode(raw.transferMode || 'auto')
    setTransferTime(raw.transferTime || '00:00')
    setLabelsEntrada(config.labelsEntrada)
    setLabelsCatalogo(config.labelsCatalogo)
    setLabelsRegistros(config.labelsRegistros)
    setLabelsFacturas(config.labelsFacturas)
    setLabelsClientes(config.labelsClientes)
    setFieldsEntrada(config.fieldsEntrada)
    setFieldsClientes(config.fieldsClientes)
    setFieldsCatalogo(config.fieldsCatalogo)
    if (raw.logo) {
      setLogoPreview(raw.logo.startsWith('data:') ? raw.logo : `data:image/png;base64,${raw.logo}`)
    }
  }

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 4000)
  }

  // Toggle a field in a visible fields array
  function toggleField(fields: string[], setFields: (f: string[]) => void, fieldKey: string) {
    if (fields.includes(fieldKey)) {
      setFields(fields.filter(f => f !== fieldKey))
    } else {
      setFields([...fields, fieldKey])
    }
  }

  // Handle logo upload
  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showStatus('err', 'El logo debe ser menor de 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string
      setLogoPreview(dataUrl)
      setLogoBase64(dataUrl)
    }
    reader.readAsDataURL(file)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  function handleRemoveLogo() {
    setLogoPreview('')
    setLogoBase64('REMOVE')
  }

  // Save all config
  async function handleSave() {
    setSaving(true)
    try {
      const partial: Partial<AppConfig> = {
        companyName,
        companyFullName,
        companyAddress,
        companyCity,
        companyProvince,
        companyCif,
        currency,
        defaultIva: Number(defaultIva) || 21,
        appName,
        appVersion,
        sectionEntrada,
        sectionRegistros,
        sectionClientes,
        sectionCatalogo,
        sectionFacturas,
        sectionBackup,
        transferMode,
        transferTime,
        labelEntrada: JSON.stringify(labelsEntrada),
        labelCatalogo: JSON.stringify(labelsCatalogo),
        labelRegistros: JSON.stringify(labelsRegistros),
        labelFacturas: JSON.stringify(labelsFacturas),
        labelClientes: JSON.stringify(labelsClientes),
        fieldsEntrada: JSON.stringify(fieldsEntrada),
        fieldsClientes: JSON.stringify(fieldsClientes),
        fieldsCatalogo: JSON.stringify(fieldsCatalogo),
      }

      // Handle logo
      if (logoBase64 === 'REMOVE') {
        partial.logo = ''
      } else if (logoBase64) {
        partial.logo = logoBase64
      }

      await update(partial)
      showStatus('ok', 'Configuración guardada ✓')
    } catch (err) {
      showStatus('err', 'Error guardando: ' + String(err))
    }
    setSaving(false)
  }

  if (loading || !config) {
    return <div className="p-6 text-center text-gray-400">Cargando configuración...</div>
  }

  return (
    <div className="max-w-4xl flex flex-col gap-4">
      {/* Status */}
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
          statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : null}
          {statusMsg.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[#005bb5]" />
          <h2 className="text-lg font-bold text-gray-700">Configuración</h2>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#2bb24c] hover:bg-[#23963e] text-white">
          <Save className="h-4 w-4 mr-1" />
          {saving ? 'Guardando...' : 'GUARDAR TODO'}
        </Button>
      </div>

      <Tabs defaultValue="empresa" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="empresa">
            <Building2 className="h-4 w-4 mr-1.5" /> Empresa
          </TabsTrigger>
          <TabsTrigger value="transfer">
            <ArrowRightLeft className="h-4 w-4 mr-1.5" /> Transfer
          </TabsTrigger>
          <TabsTrigger value="conceptos">
            <BookOpen className="h-4 w-4 mr-1.5" /> Conceptos
          </TabsTrigger>
          <TabsTrigger value="campos">
            <LayoutList className="h-4 w-4 mr-1.5" /> Campos
          </TabsTrigger>
          <TabsTrigger value="secciones">
            <Tag className="h-4 w-4 mr-1.5" /> Secciones
          </TabsTrigger>
          <TabsTrigger value="etiquetas">
            <Settings className="h-4 w-4 mr-1.5" /> Etiquetas
          </TabsTrigger>
        </TabsList>

        {/* ─── EMPRESA TAB ────────────────────────────────── */}
        <TabsContent value="empresa" className="space-y-4 mt-4">
          {/* Logo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Logotipo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <div className="w-[180px] h-[60px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white overflow-hidden shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-xs text-gray-400">Sin logo</span>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp"
                    className="hidden"
                    onChange={handleLogoSelect}
                  />
                  <Button onClick={() => logoInputRef.current?.click()} variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-1.5" /> Subir Logo
                  </Button>
                  {logoPreview && (
                    <Button onClick={handleRemoveLogo} variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50 ml-2">
                      <RotateCcw className="h-4 w-4 mr-1.5" /> Quitar
                    </Button>
                  )}
                  <p className="text-[11px] text-gray-400">PNG, JPG, SVG o WebP. Máximo 2MB.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company data */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Datos de la Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Nombre App (sidebar)</Label>
                  <Input value={appName} onChange={e => setAppName(e.target.value)} placeholder="MI APP PRO" />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Razón Social</Label>
                  <Input value={companyFullName} onChange={e => setCompanyFullName(e.target.value)} placeholder="Mi Empresa S.L." />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">CIF</Label>
                  <Input value={companyCif} onChange={e => setCompanyCif(e.target.value)} placeholder="B12345678" />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Dirección</Label>
                  <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="C/ Example, Nº 1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Ciudad / C.P.</Label>
                  <Input value={companyCity} onChange={e => setCompanyCity(e.target.value)} placeholder="28001 Madrid" />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Provincia</Label>
                  <Input value={companyProvince} onChange={e => setCompanyProvince(e.target.value)} placeholder="Madrid" />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Versión</Label>
                  <Input value={appVersion} onChange={e => setAppVersion(e.target.value)} placeholder="v2.0" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Moneda</Label>
                  <Input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="€" className="w-24" />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">IVA por defecto (%)</Label>
                  <Input type="number" step="0.01" value={defaultIva} onChange={e => setDefaultIva(e.target.value)} className="w-32" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TRANSFER TAB ─────────────────────────────── */}
        <TabsContent value="transfer" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" /> Transferencia Entrada → Registros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                Configura cómo y cuándo las entradas pasan de la sección Entrada a Registros.
                En Entrada solo se ven las entradas activas (no transferidas). Una vez transferidas, aparecen en Registros.
              </p>

              {/* Mode selection */}
              <div className="space-y-3">
                <Label className="text-sm font-bold text-slate-700">Modo de transferencia</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setTransferMode('auto')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      transferMode === 'auto'
                        ? 'border-[#005bb5] bg-blue-50 text-[#005bb5]'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Clock className="h-6 w-6" />
                    <span className="text-sm font-bold">Automático</span>
                    <span className="text-[11px] text-center opacity-70">A la hora configurada</span>
                  </button>
                  <button
                    onClick={() => setTransferMode('manual')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      transferMode === 'manual'
                        ? 'border-[#2bb24c] bg-green-50 text-[#2bb24c]'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Zap className="h-6 w-6" />
                    <span className="text-sm font-bold">Manual</span>
                    <span className="text-[11px] text-center opacity-70">Con botón "Pasar al registro"</span>
                  </button>
                </div>
              </div>

              {/* Time picker (only for auto mode) */}
              {transferMode === 'auto' && (
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-700">Hora de transferencia automática</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="time"
                      value={transferTime}
                      onChange={e => setTransferTime(e.target.value)}
                      className="w-40 text-lg font-mono"
                    />
                    <span className="text-sm text-gray-400">
                      A esta hora, todas las entradas activas pasarán automáticamente a Registros
                    </span>
                  </div>
                </div>
              )}

              {/* Info box */}
              <div className={`rounded-lg p-3 text-sm ${
                transferMode === 'auto'
                  ? 'bg-blue-50 border border-blue-200 text-blue-700'
                  : 'bg-green-50 border border-green-200 text-green-700'
              }`}>
                {transferMode === 'auto' ? (
                  <p>Las entradas se transferirán automáticamente cada día a las <b>{transferTime}</b>. Debes tener la aplicación abierta para que se ejecute la transferencia.</p>
                ) : (
                  <p>Las entradas permanecerán en Entrada hasta que pulses el botón <b>"Pasar al registro"</b>. Tú decides cuándo transferirlas.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CONCEPTOS TAB (CRUD for catalog concepts) ──────────────── */}
        <TabsContent value="conceptos" className="space-y-4 mt-4">
          <ConceptosManager />
        </TabsContent>

        {/* ─── CAMPOS TAB (Visible Fields) ─────────────────── */}
        <TabsContent value="campos" className="space-y-4 mt-4">
          <p className="text-sm text-gray-500">
            Elige qué campos se muestran en cada sección. Los campos desactivados se ocultarán en el formulario y en la tabla.
          </p>

          {/* ── Entrada Fields ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-[#2bb24c]" /> Campos visibles — Entrada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_FIELDS_ENTRADA.map(field => (
                  <FieldToggle
                    key={field}
                    fieldKey={field}
                    label={FIELD_LABELS_ENTRADA[field] || field}
                    active={fieldsEntrada.includes(field)}
                    onToggle={() => toggleField(fieldsEntrada, setFieldsEntrada, field)}
                  />
                ))}
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => setFieldsEntrada(DEFAULT_FIELDS_ENTRADA)}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar
                </button>
              </div>
            </CardContent>
          </Card>

          {/* ── Clientes Fields ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-[#005bb5]" /> Campos visibles — Clientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_FIELDS_CLIENTES.map(field => (
                  <FieldToggle
                    key={field}
                    fieldKey={field}
                    label={FIELD_LABELS_CLIENTES[field] || field}
                    active={fieldsClientes.includes(field)}
                    onToggle={() => toggleField(fieldsClientes, setFieldsClientes, field)}
                  />
                ))}
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => setFieldsClientes(DEFAULT_FIELDS_CLIENTES)}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar
                </button>
              </div>
            </CardContent>
          </Card>

          {/* ── Catálogo Fields ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-500" /> Campos visibles — Catálogo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_FIELDS_CATALOGO.map(field => (
                  <FieldToggle
                    key={field}
                    fieldKey={field}
                    label={FIELD_LABELS_CATALOGO[field] || field}
                    active={fieldsCatalogo.includes(field)}
                    onToggle={() => toggleField(fieldsCatalogo, setFieldsCatalogo, field)}
                  />
                ))}
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => setFieldsCatalogo(DEFAULT_FIELDS_CATALOGO)}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Reset all */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setFieldsEntrada(DEFAULT_FIELDS_ENTRADA)
                setFieldsClientes(DEFAULT_FIELDS_CLIENTES)
                setFieldsCatalogo(DEFAULT_FIELDS_CATALOGO)
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" /> Restaurar todos los campos
            </Button>
          </div>
        </TabsContent>

        {/* ─── SECCIONES TAB ─────────────────────────────── */}
        <TabsContent value="secciones" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nombres de Secciones</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">Personaliza los nombres de las secciones en el menú lateral.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Sección Entrada</Label>
                  <Input value={sectionEntrada} onChange={e => setSectionEntrada(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Sección Registros</Label>
                  <Input value={sectionRegistros} onChange={e => setSectionRegistros(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Sección Clientes</Label>
                  <Input value={sectionClientes} onChange={e => setSectionClientes(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Sección Catálogo</Label>
                  <Input value={sectionCatalogo} onChange={e => setSectionCatalogo(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Sección Facturas</Label>
                  <Input value={sectionFacturas} onChange={e => setSectionFacturas(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs uppercase font-bold text-slate-500">Sección Seguridad</Label>
                  <Input value={sectionBackup} onChange={e => setSectionBackup(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ETIQUETAS TAB ─────────────────────────────── */}
        <TabsContent value="etiquetas" className="space-y-4 mt-4">
          {/* Entrada Labels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Etiquetas — Entrada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(DEFAULT_LABELS_ENTRADA) as (keyof typeof DEFAULT_LABELS_ENTRADA)[]).map(key => (
                  <div key={key}>
                    <Label className="text-xs uppercase font-bold text-slate-500">{key}</Label>
                    <Input
                      value={labelsEntrada[key]}
                      onChange={e => setLabelsEntrada(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Catalogo Labels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Etiquetas — Catálogo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(DEFAULT_LABELS_CATALOGO) as (keyof typeof DEFAULT_LABELS_CATALOGO)[]).map(key => (
                  <div key={key}>
                    <Label className="text-xs uppercase font-bold text-slate-500">{key}</Label>
                    <Input
                      value={labelsCatalogo[key]}
                      onChange={e => setLabelsCatalogo(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Registros Labels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Etiquetas — Registros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(DEFAULT_LABELS_REGISTROS) as (keyof typeof DEFAULT_LABELS_REGISTROS)[]).map(key => (
                  <div key={key}>
                    <Label className="text-xs uppercase font-bold text-slate-500">{key}</Label>
                    <Input
                      value={labelsRegistros[key]}
                      onChange={e => setLabelsRegistros(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Facturas Labels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Etiquetas — Facturas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(DEFAULT_LABELS_FACTURAS) as (keyof typeof DEFAULT_LABELS_FACTURAS)[]).map(key => (
                  <div key={key}>
                    <Label className="text-xs uppercase font-bold text-slate-500">{key}</Label>
                    <Input
                      value={labelsFacturas[key]}
                      onChange={e => setLabelsFacturas(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Clientes Labels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Etiquetas — Clientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(DEFAULT_LABELS_CLIENTES) as (keyof typeof DEFAULT_LABELS_CLIENTES)[]).map(key => (
                  <div key={key}>
                    <Label className="text-xs uppercase font-bold text-slate-500">{key}</Label>
                    <Input
                      value={labelsClientes[key]}
                      onChange={e => setLabelsClientes(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Reset to defaults */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setLabelsEntrada(DEFAULT_LABELS_ENTRADA)
                setLabelsCatalogo(DEFAULT_LABELS_CATALOGO)
                setLabelsRegistros(DEFAULT_LABELS_REGISTROS)
                setLabelsFacturas(DEFAULT_LABELS_FACTURAS)
                setLabelsClientes(DEFAULT_LABELS_CLIENTES)
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" /> Restaurar etiquetas por defecto
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
