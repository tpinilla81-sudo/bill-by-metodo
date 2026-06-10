// Utility functions for HUALSA PRO

export function fmtCurrency(n: number, currency: string = '€'): string {
  return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency
}

export function fmtDate(iso: string): string {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function fmtMonth(iso: string): string {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4})-(\d{2})/)
  if (!m) return iso
  const monthNum = parseInt(m[2], 10)
  return `${MESES[monthNum - 1]} ${m[1]}`
}

export function getISOWeek(dateStr: string): number {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function currentYear(): number {
  return new Date().getFullYear()
}

export interface Cliente {
  id: string
  nombre: string
  cif: string
  dir: string
  cp: string
  ciudad: string
  prov: string
  mail: string
  tel: string
  customData?: string
}

export interface CatalogoItem {
  id: string
  clienteId: string
  c1: string
  c2: string
  coste: number
  inc: number
  final: number
  customData?: string
}

export interface Registro {
  id: string
  fecha: string
  clienteId: string
  cliente: string
  c1: string
  c2: string
  cant: number
  obs: string
  pasadoRegistro: boolean
  facturado: boolean
  customData?: string
}
