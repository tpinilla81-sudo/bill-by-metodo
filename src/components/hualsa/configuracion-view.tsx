'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Settings, Building2, Upload, Save, Image as ImageIcon, RotateCcw, CheckCircle, Tag } from 'lucide-react'
import {
  useConfig,
  DEFAULT_LABELS_ENTRADA,
  DEFAULT_LABELS_CATALOGO,
  DEFAULT_LABELS_REGISTROS,
  DEFAULT_LABELS_FACTURAS,
  DEFAULT_LABELS_CLIENTES,
  type AppConfig,
} from '@/lib/config'

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

  // Labels
  const [labelsEntrada, setLabelsEntrada] = useState(DEFAULT_LABELS_ENTRADA)
  const [labelsCatalogo, setLabelsCatalogo] = useState(DEFAULT_LABELS_CATALOGO)
  const [labelsRegistros, setLabelsRegistros] = useState(DEFAULT_LABELS_REGISTROS)
  const [labelsFacturas, setLabelsFacturas] = useState(DEFAULT_LABELS_FACTURAS)
  const [labelsClientes, setLabelsClientes] = useState(DEFAULT_LABELS_CLIENTES)

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
    setLabelsEntrada(config.labelsEntrada)
    setLabelsCatalogo(config.labelsCatalogo)
    setLabelsRegistros(config.labelsRegistros)
    setLabelsFacturas(config.labelsFacturas)
    setLabelsClientes(config.labelsClientes)
    if (raw.logo) {
      setLogoPreview(raw.logo.startsWith('data:') ? raw.logo : `data:image/png;base64,${raw.logo}`)
    }
  }

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 4000)
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
        labelEntrada: JSON.stringify(labelsEntrada),
        labelCatalogo: JSON.stringify(labelsCatalogo),
        labelRegistros: JSON.stringify(labelsRegistros),
        labelFacturas: JSON.stringify(labelsFacturas),
        labelClientes: JSON.stringify(labelsClientes),
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="empresa">
            <Building2 className="h-4 w-4 mr-1.5" /> Empresa
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
