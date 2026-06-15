'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { useAuth } from '@/lib/auth-context'

// ─── Field Definition type ────────────────────────────────────
export interface FieldDef {
  key: string           // unique identifier, e.g. "fecha", "custom_1"
  label: string         // display label, e.g. "FECHA", "Mi Campo"
  type: 'text' | 'number' | 'date' | 'select' | 'textarea'
  visible: boolean
  isCustom: boolean     // true = stored in customData JSON; false = core DB column
  required?: boolean
  placeholder?: string
  options?: string[]    // for select type
  dbColumn?: string     // maps to which DB column (for core fields)
}

// ─── Default field definitions per section ────────────────────
export const DEFAULT_FIELDS_ENTRADA: FieldDef[] = [
  { key: 'fecha', label: 'FECHA', type: 'date', visible: true, isCustom: false, required: true, dbColumn: 'fecha' },
  { key: 'cliente', label: 'CLIENTE', type: 'select', visible: true, isCustom: false, required: false, dbColumn: 'clienteId' },
  { key: 'c1', label: 'CONCEPTO 1', type: 'text', visible: true, isCustom: false, required: true, dbColumn: 'c1' },
  { key: 'c2', label: 'CONCEPTO 2', type: 'text', visible: true, isCustom: false, required: true, dbColumn: 'c2' },
  { key: 'cantidad', label: 'CANTIDAD', type: 'number', visible: true, isCustom: false, required: true, dbColumn: 'cant' },
  { key: 'observaciones', label: 'OBSERVACIONES', type: 'text', visible: true, isCustom: false, dbColumn: 'obs' },
]

export const DEFAULT_FIELDS_CLIENTES: FieldDef[] = [
  { key: 'nombre', label: 'Nombre Cliente', type: 'text', visible: true, isCustom: false, required: true, dbColumn: 'nombre' },
  { key: 'cif', label: 'CIF', type: 'text', visible: true, isCustom: false, dbColumn: 'cif' },
  { key: 'direccion', label: 'Dirección', type: 'text', visible: true, isCustom: false, dbColumn: 'dir' },
  { key: 'cp', label: 'C.P.', type: 'text', visible: true, isCustom: false, dbColumn: 'cp' },
  { key: 'ciudad', label: 'Ciudad', type: 'text', visible: true, isCustom: false, dbColumn: 'ciudad' },
  { key: 'provincia', label: 'Provincia', type: 'text', visible: true, isCustom: false, dbColumn: 'prov' },
  { key: 'mail', label: 'Mail', type: 'text', visible: true, isCustom: false, dbColumn: 'mail' },
  { key: 'telefono', label: 'Teléfono', type: 'text', visible: true, isCustom: false, dbColumn: 'tel' },
]

export const DEFAULT_FIELDS_CATALOGO: FieldDef[] = [
  { key: 'cliente', label: 'CLIENTE', type: 'select', visible: true, isCustom: false, dbColumn: 'clienteId' },
  { key: 'c1', label: 'CONCEPTO 1', type: 'text', visible: true, isCustom: false, required: true, dbColumn: 'c1' },
  { key: 'c2', label: 'CONCEPTO 2', type: 'text', visible: true, isCustom: false, required: true, dbColumn: 'c2' },
  { key: 'coste', label: 'COSTE', type: 'number', visible: true, isCustom: false, dbColumn: 'coste' },
  { key: 'incremento', label: 'INCREMENTO', type: 'number', visible: true, isCustom: false, dbColumn: 'inc' },
  { key: 'precioCliente', label: 'PRECIO CLIENTE', type: 'number', visible: true, isCustom: false, dbColumn: 'final' },
]

export const DEFAULT_FIELDS_REGISTROS: FieldDef[] = [
  { key: 'fecha', label: 'Fecha', type: 'date', visible: true, isCustom: false, dbColumn: 'fecha' },
  { key: 'mes', label: 'Mes', type: 'text', visible: true, isCustom: false },
  { key: 'semana', label: 'Sem', type: 'text', visible: true, isCustom: false },
  { key: 'cliente', label: 'Cliente', type: 'text', visible: true, isCustom: false, dbColumn: 'cliente' },
  { key: 'c1', label: 'Concepto 1', type: 'text', visible: true, isCustom: false, dbColumn: 'c1' },
  { key: 'c2', label: 'Concepto 2', type: 'text', visible: true, isCustom: false, dbColumn: 'c2' },
  { key: 'cantidad', label: 'Cant', type: 'number', visible: true, isCustom: false, dbColumn: 'cant' },
  { key: 'precioUnitario', label: 'P.Unit', type: 'number', visible: true, isCustom: false },
  { key: 'importe', label: 'Importe', type: 'number', visible: true, isCustom: false },
  { key: 'observaciones', label: 'Obs', type: 'text', visible: true, isCustom: false, dbColumn: 'obs' },
  { key: 'facturado', label: 'Estado', type: 'text', visible: true, isCustom: false, dbColumn: 'facturado' },
]

export const DEFAULT_FIELDS_FACTURAS: FieldDef[] = [
  { key: 'numero', label: 'Nº FACTURA', type: 'text', visible: true, isCustom: false },
  { key: 'fecha', label: 'FECHA', type: 'date', visible: true, isCustom: false },
  { key: 'cliente', label: 'CLIENTE', type: 'text', visible: true, isCustom: false },
  { key: 'concepto', label: 'CONCEPTO', type: 'text', visible: true, isCustom: false },
  { key: 'cantidad', label: 'CANT.', type: 'number', visible: true, isCustom: false },
  { key: 'precioUnitario', label: 'PRECIO UNIT.', type: 'number', visible: true, isCustom: false },
  { key: 'importe', label: 'IMPORTE', type: 'number', visible: true, isCustom: false },
  { key: 'baseImponible', label: 'BASE IMPONIBLE', type: 'number', visible: true, isCustom: false },
  { key: 'totalFactura', label: 'TOTAL FACTURA', type: 'number', visible: true, isCustom: false },
]

// ─── Default label sets (kept for backward compat) ────────────
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
  fieldsRegistros: string
  fieldsFacturas: string
}

// ─── Resolved config ──────────────────────────────────────────
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
  fieldsEntrada: FieldDef[]
  fieldsClientes: FieldDef[]
  fieldsCatalogo: FieldDef[]
  fieldsRegistros: FieldDef[]
  fieldsFacturas: FieldDef[]
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

function parseFieldDefs(jsonStr: string, defaults: FieldDef[]): FieldDef[] {
  if (!jsonStr || jsonStr.trim() === '') return defaults
  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed) || parsed.length === 0) return defaults
    // Validate each entry has required fields
    const valid = parsed.every((f: unknown) =>
      typeof f === 'object' && f !== null && 'key' in f && 'label' in f && 'type' in f
    )
    if (!valid) return defaults
    return parsed as FieldDef[]
  } catch {
    return defaults
  }
}

export function resolveConfig(raw: AppConfig): ResolvedConfig {
  return {
    companyName: raw.companyName || 'BILL by Metodo',
    companyFullName: raw.companyFullName || '',
    companyAddress: raw.companyAddress || '',
    companyCity: raw.companyCity || '',
    companyProvince: raw.companyProvince || '',
    companyCif: raw.companyCif || '',
    logo: raw.logo || '',
    currency: raw.currency || '€',
    defaultIva: raw.defaultIva ?? 21,
    appName: raw.appName || 'BILL by Metodo',
    appVersion: raw.appVersion || 'v3.0',
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
    fieldsEntrada: parseFieldDefs(raw.fieldsEntrada, DEFAULT_FIELDS_ENTRADA),
    fieldsClientes: parseFieldDefs(raw.fieldsClientes, DEFAULT_FIELDS_CLIENTES),
    fieldsCatalogo: parseFieldDefs(raw.fieldsCatalogo, DEFAULT_FIELDS_CATALOGO),
    fieldsRegistros: parseFieldDefs(raw.fieldsRegistros, DEFAULT_FIELDS_REGISTROS),
    fieldsFacturas: parseFieldDefs(raw.fieldsFacturas, DEFAULT_FIELDS_FACTURAS),
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
  const { effectiveTenantId } = useAuth()
  const lastLoadedTenantId = useRef<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/config')
      if (res.ok) {
        const data = await res.json()
        setRaw(data)
      } else {
        // Don't overwrite valid config with error response
        console.error('Config fetch failed:', res.status)
      }
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

  // Re-fetch config when the effective tenant changes (e.g. after login/logout)
  useEffect(() => {
    if (effectiveTenantId && effectiveTenantId !== lastLoadedTenantId.current) {
      lastLoadedTenantId.current = effectiveTenantId
      reload()
    }
  }, [effectiveTenantId, reload])

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

// ─── Helper: get visible fields ───────────────────────────────
export function getVisibleFields(fields: FieldDef[]): FieldDef[] {
  return fields.filter(f => f.visible)
}

// ─── Helper: get label for a field key ────────────────────────
export function getFieldLabel(fields: FieldDef[], key: string): string {
  return fields.find(f => f.key === key)?.label || key
}

// ─── Helper: parse customData JSON ────────────────────────────
export function parseCustomData(jsonStr: string): Record<string, unknown> {
  if (!jsonStr || jsonStr.trim() === '') return {}
  try {
    return JSON.parse(jsonStr)
  } catch {
    return {}
  }
}

// ─── Helper: serialize customData ─────────────────────────────
export function serializeCustomData(data: Record<string, unknown>): string {
  return JSON.stringify(data)
}
