'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

// ─── Default label sets ─────────────────────────────────────
export const DEFAULT_LABELS_ENTRADA = {
  fecha: 'FECHA',
  cliente: 'CLIENTE',
  c1: 'CONCEPTO 1',
  c2: 'CONCEPTO 2',
  cantidad: 'CANTIDAD',
  observaciones: 'OBSERVACIONES',
}

export const DEFAULT_LABELS_CATALOGO = {
  c1: 'CONCEPTO 1',
  c2: 'CONCEPTO 2',
  coste: 'COSTE',
  incremento: 'INCREMENTO',
  precioCliente: 'PRECIO CLIENTE',
  cliente: 'CLIENTE',
}

export const DEFAULT_LABELS_REGISTROS = {
  fecha: 'Fecha',
  mes: 'Mes',
  semana: 'Sem',
  cliente: 'Cliente',
  c1: 'Concepto 1',
  c2: 'Concepto 2',
  cantidad: 'Cant',
  precioUnitario: 'P.Unit',
  importe: 'Importe',
  observaciones: 'Obs',
}

export const DEFAULT_LABELS_FACTURAS = {
  numero: 'Nº FACTURA',
  fecha: 'FECHA',
  cliente: 'CLIENTE',
  concepto: 'CONCEPTO',
  cantidad: 'CANT.',
  precioUnitario: 'PRECIO UNIT.',
  importe: 'IMPORTE',
  baseImponible: 'BASE IMPONIBLE',
  totalFactura: 'TOTAL FACTURA',
}

export const DEFAULT_LABELS_CLIENTES = {
  nombre: 'Nombre Cliente',
  cif: 'CIF',
  direccion: 'Dirección',
  cp: 'C.P.',
  ciudad: 'Ciudad',
  provincia: 'Provincia',
  mail: 'Mail',
  telefono: 'Teléfono',
}

// ─── Default visible fields ─────────────────────────────────
export const DEFAULT_FIELDS_ENTRADA = ['fecha', 'cliente', 'c1', 'c2', 'cantidad', 'observaciones']
export const DEFAULT_FIELDS_CLIENTES = ['nombre', 'cif', 'direccion', 'cp', 'ciudad', 'provincia', 'mail', 'telefono']
export const DEFAULT_FIELDS_CATALOGO = ['cliente', 'c1', 'c2', 'coste', 'incremento', 'precioCliente']

// ─── Config type ────────────────────────────────────────────
export interface AppConfig {
  id: string
  companyName: string
  companyFullName: string
  companyAddress: string
  companyCity: string
  companyProvince: string
  companyCif: string
  logo: string
  currency: string
  defaultIva: number
  appName: string
  appVersion: string
  labelEntrada: string
  labelCatalogo: string
  labelRegistros: string
  labelFacturas: string
  labelClientes: string
  sectionEntrada: string
  sectionRegistros: string
  sectionClientes: string
  sectionCatalogo: string
  sectionFacturas: string
  sectionBackup: string
  transferMode: string
  transferTime: string
  fieldsEntrada: string
  fieldsClientes: string
  fieldsCatalogo: string
}

// ─── Resolved labels (parsed from JSON) ─────────────────────
export interface ResolvedConfig {
  companyName: string
  companyFullName: string
  companyAddress: string
  companyCity: string
  companyProvince: string
  companyCif: string
  logo: string
  currency: string
  defaultIva: number
  appName: string
  appVersion: string
  sectionEntrada: string
  sectionRegistros: string
  sectionClientes: string
  sectionCatalogo: string
  sectionFacturas: string
  sectionBackup: string
  transferMode: string
  transferTime: string
  labelsEntrada: typeof DEFAULT_LABELS_ENTRADA
  labelsCatalogo: typeof DEFAULT_LABELS_CATALOGO
  labelsRegistros: typeof DEFAULT_LABELS_REGISTROS
  labelsFacturas: typeof DEFAULT_LABELS_FACTURAS
  labelsClientes: typeof DEFAULT_LABELS_CLIENTES
  fieldsEntrada: string[]
  fieldsClientes: string[]
  fieldsCatalogo: string[]
}

function parseJSON<T>(jsonStr: string, defaults: T): T {
  if (!jsonStr || jsonStr.trim() === '') return defaults
  try {
    const parsed = JSON.parse(jsonStr)
    return { ...defaults, ...parsed }
  } catch {
    return defaults
  }
}

function parseFieldsArray(jsonStr: string, defaults: string[]): string[] {
  if (!jsonStr || jsonStr.trim() === '') return defaults
  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
    return defaults
  } catch {
    return defaults
  }
}

export function resolveConfig(raw: AppConfig): ResolvedConfig {
  return {
    companyName: raw.companyName || 'HUALSA PRO',
    companyFullName: raw.companyFullName || '',
    companyAddress: raw.companyAddress || '',
    companyCity: raw.companyCity || '',
    companyProvince: raw.companyProvince || '',
    companyCif: raw.companyCif || '',
    logo: raw.logo || '',
    currency: raw.currency || '€',
    defaultIva: raw.defaultIva ?? 21,
    appName: raw.appName || 'HUALSA PRO',
    appVersion: raw.appVersion || 'v2.0',
    sectionEntrada: raw.sectionEntrada || 'ENTRADA',
    sectionRegistros: raw.sectionRegistros || 'REGISTROS',
    sectionClientes: raw.sectionClientes || 'CLIENTES',
    sectionCatalogo: raw.sectionCatalogo || 'CATÁLOGO',
    sectionFacturas: raw.sectionFacturas || 'FACTURAS',
    sectionBackup: raw.sectionBackup || 'SEGURIDAD',
    transferMode: raw.transferMode || 'auto',
    transferTime: raw.transferTime || '00:00',
    labelsEntrada: parseJSON(raw.labelEntrada, DEFAULT_LABELS_ENTRADA),
    labelsCatalogo: parseJSON(raw.labelCatalogo, DEFAULT_LABELS_CATALOGO),
    labelsRegistros: parseJSON(raw.labelRegistros, DEFAULT_LABELS_REGISTROS),
    labelsFacturas: parseJSON(raw.labelFacturas, DEFAULT_LABELS_FACTURAS),
    labelsClientes: parseJSON(raw.labelClientes, DEFAULT_LABELS_CLIENTES),
    fieldsEntrada: parseFieldsArray(raw.fieldsEntrada, DEFAULT_FIELDS_ENTRADA),
    fieldsClientes: parseFieldsArray(raw.fieldsClientes, DEFAULT_FIELDS_CLIENTES),
    fieldsCatalogo: parseFieldsArray(raw.fieldsCatalogo, DEFAULT_FIELDS_CATALOGO),
  }
}

// ─── Context ────────────────────────────────────────────────
interface ConfigContextType {
  raw: AppConfig | null
  config: ResolvedConfig | null
  loading: boolean
  reload: () => Promise<void>
  update: (partial: Partial<AppConfig>) => Promise<void>
}

const ConfigContext = createContext<ConfigContextType>({
  raw: null,
  config: null,
  loading: true,
  reload: async () => {},
  update: async () => {},
})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/config')
      const data = await res.json()
      setRaw(data)
    } catch (err) {
      console.error('Failed to load config:', err)
    }
    setLoading(false)
  }, [])

  const update = useCallback(async (partial: Partial<AppConfig>) => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      if (res.ok) {
        const data = await res.json()
        setRaw(data)
      }
    } catch (err) {
      console.error('Failed to update config:', err)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const config = raw ? resolveConfig(raw) : null

  return (
    <ConfigContext.Provider value={{ raw, config, loading, reload, update }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  return useContext(ConfigContext)
}
