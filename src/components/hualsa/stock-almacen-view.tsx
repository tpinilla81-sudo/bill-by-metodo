'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Package, Warehouse, ArrowDownToLine, ArrowUpFromLine, RefreshCw, CalendarClock, Printer, Search, QrCode, X, Settings2, Layers, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { fmtDate, type Cliente, type Registro } from '@/lib/hualsa-utils'

// Tipo minimo para el escáner QR — cargado dinamicamente para evitar
// problemas de SSR/bundling y reducir el JS inicial de la página.
type Html5QrcodeLike = {
  start: (
    cameraIdOrConfig: { facingMode: string } | string,
    configuration: { fps: number; qrbox: { width: number; height: number } },
    qrCodeSuccessCallback: (decoded: string) => void,
    qrCodeErrorCallback?: (err: unknown) => void
  ) => Promise<void>
  stop: () => Promise<void>
  clear: () => Promise<void>
  isScanning: boolean
}

// ─── STOCK ALMACÉN ─────────────────────────────────────────────────────
// Control del stock en almacén a partir de los registros de palets:
//  · ENTRADA PALET → suma stock
//  · SALIDA PALET  → resta stock (emparejando por lote/nº palet/ubicación, FIFO)
// El stock actual = entradas − salidas, agrupado por UBICACIÓN (customData).
// Las ubicaciones se agrupan en ESTANTERÍAS por su primer token:
//  · "E1-03" → estantería E1, posición 03
//  · "A/12"  → estantería A,  posición 12
//  · sin separador → estantería ALMACÉN
// Vista 100% lectura: no modifica registros.

interface LoteStock {
  id: string
  fecha: string
  clienteId: string
  ubicacion: string
  ident: string
  cantTotal: number
  cantRestante: number
}

interface CeldaStock {
  ubicacion: string
  rack: string
  pos: string
  total: number
  dias: number      // días del lote más antiguo
  lotes: LoteStock[]
}

interface RackStock {
  name: string
  total: number
  celdas: CeldaStock[]
}

// ─── CONFIGURACIÓN DEL ALMACÉN ─────────────────────────────────────────
// El almacén se define a partir de ESTANTERÍAS y sus HUECOS: cada estantería
// tiene un nombre y un nº de huecos, y cada hueco se nombra automáticamente
// (E1 con 12 huecos → E1-01, E1-02 … E1-12). El mapa del almacén se dibuja
// a partir de esta configuración; los huecos sin palets se ven como LIBRE.
interface EstanteriaCfg {
  id: string        // id estable (keys de React)
  nombre: string    // "E1" — prefijo con el que se nombran los huecos
  huecos: number    // nº de huecos de la estantería
  cap: number       // capacidad máx. de palets (0 = sin límite) — opcional
  alias?: string[]  // nombres antiguos de la estantería: los palets registrados
                    // con ellos siguen apareciendo en el mapa tras un renombrado
}

function normAlm(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isEntradaPalet(r: Registro): boolean {
  return /entrada palet/.test(normAlm(r.c2))
}

function isSalidaPalet(r: Registro): boolean {
  return /salida palet/.test(normAlm(r.c2))
}

function extractIdents(r: Registro): { strong: Record<string, string>; weak: Record<string, string> } {
  const strong: Record<string, string> = {}
  const weak: Record<string, string> = {}
  try {
    const cd = JSON.parse(r.customData || '{}') as Record<string, unknown>
    for (const [k, v] of Object.entries(cd)) {
      const nk = normAlm(k)
      const val = normAlm(String(v ?? ''))
      if (!val) continue
      if (/palet|lote/.test(nk)) strong[nk] = val
      else if (/ubicac/.test(nk)) weak[nk] = val
    }
  } catch { /* customData corrupto — ignorar */ }
  return { strong, weak }
}

function getUbicacion(r: Registro): string {
  const { weak } = extractIdents(r)
  return Object.values(weak)[0] || ''
}

function getIdent(r: Registro): string {
  const { strong } = extractIdents(r)
  return Object.values(strong)[0] || ''
}

// "E1-03" → { rack: 'E1', pos: '03' } · "Nave 2 Paso B" → { rack: 'NAVE', pos: '2-PASO-B' }
function splitUbicacion(ub: string): { rack: string; pos: string } {
  const t = String(ub || '').trim()
  if (!t) return { rack: 'SIN UBICACIÓN', pos: '' }
  const parts = t.split(/[\s\-_/.]+/).filter(Boolean)
  if (parts.length >= 2) return { rack: parts[0].toUpperCase(), pos: parts.slice(1).join('-').toUpperCase() }
  return { rack: 'ALMACÉN', pos: t.toUpperCase() }
}

// Clave robusta para emparejar ubicaciones de los movimientos con huecos
// configurados: "E1-03", "e1 3", "E1/03" → todas → "E-1-3" (bloques de
// letras y números, sin acentos, sin ceros a la izquierda, sin separadores).
function normHuecoKey(s: string): string {
  const t = String(s || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!t) return ''
  return (t.match(/[A-Z]+|[0-9]+/g) || [])
    .map(tok => (/^[0-9]+$/.test(tok) ? String(parseInt(tok, 10)) : tok))
    .join('-')
}

// Número de hueco con ceros: hueco 3 de 12 → "03" · hueco 5 de 120 → "005"
function padPos(n: number, total: number): string {
  return String(n).padStart(Math.max(2, String(total).length), '0')
}

// Días que un palet lleva en almacén: fechaEntrada → ahora.
// El día de entrada cuenta como 1 día (ambos inclusive), como en facturación.
// Recibe `refNow` (ms) para forzar recálculo limpio cuando el reloj avanza.
function diasEnAlmacen(fecha: string, refNow: number = Date.now()): number {
  const d = new Date(fecha + 'T00:00:00')
  if (isNaN(d.getTime())) return 0
  // Diferencia en ms → redondear a días naturales completados + 1 (día inicial inclusive)
  // Ej: entrada hoy → 1 día. Entrada ayer → 2 días.
  const diffDays = Math.floor((refNow - d.getTime()) / 86400000)
  return Math.max(1, diffDays + 1)
}

// Motor de stock: recorre los movimientos por orden de fecha y va
// consumiendo lotes. Salida sin coincidencia → descuenta del lote más antiguo.
function buildStock(registros: Registro[], clientesFiltro: string[]): LoteStock[] {
  const movs = registros
    .filter(r => isEntradaPalet(r) || isSalidaPalet(r))
    .filter(r => clientesFiltro.length === 0 || clientesFiltro.includes(r.clienteId || ''))
    // Orden cronológico: fecha, y dentro del mismo día por createdAt (la API
    // devuelve desc por createdAt; sin este desempate una SALIDA creada después
    // de su ENTRADA el mismo día se procesaría antes y consumiría FIFO.
    .sort((a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
      a.id.localeCompare(b.id)
    )

  const lotes: LoteStock[] = []
  for (const m of movs) {
    if (isEntradaPalet(m)) {
      lotes.push({
        id: m.id,
        fecha: m.fecha,
        clienteId: m.clienteId || '',
        ubicacion: getUbicacion(m),
        ident: getIdent(m),
        cantTotal: m.cant || 0,
        cantRestante: m.cant || 0,
      })
      continue
    }
    // SALIDA: consumir stock
    let resto = m.cant || 0
    const si = extractIdents(m)
    const candidatos = lotes.filter(l => l.cantRestante > 0 && l.clienteId === (m.clienteId || ''))
    // Prioridad 1: mismo lote/nº palet
    let sel = candidatos.filter(l => {
      const strongVals = Object.values(si.strong)
      return strongVals.length > 0 && strongVals.includes(l.ident) && !!l.ident
    })
    // Prioridad 2: misma ubicación
    if (sel.length === 0) {
      const ubSalida = Object.values(si.weak)[0] || ''
      if (ubSalida) sel = candidatos.filter(l => normAlm(l.ubicacion) === normAlm(ubSalida))
    }
    // Prioridad 3: FIFO — el más antiguo
    if (sel.length === 0) sel = candidatos
    sel.sort((a, b) => a.fecha.localeCompare(b.fecha))
    for (const l of sel) {
      if (resto <= 0) break
      const toma = Math.min(l.cantRestante, resto)
      l.cantRestante -= toma
      resto -= toma
    }
  }
  return lotes.filter(l => l.cantRestante > 0)
}

interface RacksResultado {
  racks: RackStock[]       // estanterías configuradas, con TODOS sus huecos
  fuera: CeldaStock[]      // stock en ubicaciones que no están en la configuración
  totalHuecos: number      // nº total de huecos configurados
  huecosOcupados: number   // huecos con al menos 1 palet
}

// El mapa se dibuja SOLO a partir de la configuración (estantería → nº de
// huecos). Cada hueco se nombra automáticamente RACK-01…N; los que no tienen
// palets se ven LIBRE. El stock que cae en ubicaciones fuera de la
// configuración (o sin ubicación) se devuelve aparte para no perder nada.
function buildRacks(stock: LoteStock[], cfg: EstanteriaCfg[], refNow: number): RacksResultado {
  const racksMap = new Map<string, RackStock>()
  const huecoPorClave = new Map<string, CeldaStock>()
  for (const e of cfg) {
    const nombre = String(e?.nombre || '').trim().toUpperCase()
    if (!nombre || !e.huecos || e.huecos <= 0) continue
    const rk: RackStock = { name: nombre, total: 0, celdas: [] }
    racksMap.set(nombre, rk)
    // Prefijos que reconocen los huecos: el nombre actual + alias antiguos
    const prefijos = [nombre, ...(e.alias || []).map(a => String(a || '').trim().toUpperCase())]
      .filter(p => p)
      .filter((p, i, arr) => arr.indexOf(p) === i)
    for (let n = 1; n <= e.huecos; n++) {
      const pos = padPos(n, e.huecos)
      const celda: CeldaStock = { ubicacion: `${nombre}-${pos}`, rack: nombre, pos, total: 0, dias: 0, lotes: [] }
      rk.celdas.push(celda)
      for (const pref of prefijos) {
        huecoPorClave.set(normHuecoKey(`${pref}-${pos}`), celda)
      }
    }
  }
  const fueraMap = new Map<string, CeldaStock>()
  for (const l of stock) {
    const clave = normHuecoKey(l.ubicacion)
    const celda = clave ? huecoPorClave.get(clave) : undefined
    if (celda) {
      celda.total += l.cantRestante
      celda.dias = Math.max(celda.dias, diasEnAlmacen(l.fecha, refNow))
      celda.lotes.push(l)
      const rk = racksMap.get(celda.rack)
      if (rk) rk.total += l.cantRestante
    } else {
      const key = clave || '(SIN UBICACIÓN)'
      let f = fueraMap.get(key)
      if (!f) {
        f = { ubicacion: l.ubicacion || 'SIN UBICACIÓN', rack: 'FUERA', pos: (l.ubicacion || '—').toUpperCase(), total: 0, dias: 0, lotes: [] }
        fueraMap.set(key, f)
      }
      f.total += l.cantRestante
      f.dias = Math.max(f.dias, diasEnAlmacen(l.fecha, refNow))
      f.lotes.push(l)
    }
  }
  const racks = [...racksMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
  const fuera = [...fueraMap.values()].sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, 'es', { numeric: true }))
  let totalHuecos = 0
  let huecosOcupados = 0
  for (const rk of racks) {
    for (const c of rk.celdas) {
      totalHuecos++
      if (c.total > 0) huecosOcupados++
    }
  }
  return { racks, fuera, totalHuecos, huecosOcupados }
}

// Nombres automáticos de los huecos de una estantería: E1 + 12 → E1-01…E1-12
function nombresHuecos(nombre: string, huecos: number): string[] {
  const n = String(nombre || '').trim().toUpperCase()
  if (!n || huecos <= 0) return []
  return Array.from({ length: huecos }, (_, i) => `${n}-${padPos(i + 1, huecos)}`)
}

// Estanterías detectadas en los movimientos (para sugerir su configuración):
// rack → nº de hueco máximo visto y nº de movimientos.
function detectarEstanterias(registros: Registro[]): { nombre: string; maxPos: number; movs: number }[] {
  const acc = new Map<string, { maxPos: number; movs: number }>()
  for (const r of registros) {
    if (!isEntradaPalet(r) && !isSalidaPalet(r)) continue
    const { rack, pos } = splitUbicacion(getUbicacion(r))
    if (!rack || rack === 'SIN UBICACIÓN' || rack === 'ALMACÉN') continue
    let a = acc.get(rack)
    if (!a) { a = { maxPos: 0, movs: 0 }; acc.set(rack, a) }
    a.movs++
    const n = parseInt(pos, 10)
    if (!isNaN(n) && n > a.maxPos) a.maxPos = n
  }
  return [...acc.entries()]
    .map(([nombre, a]) => ({ nombre, maxPos: a.maxPos, movs: a.movs }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es', { numeric: true }))
}

function colorPorDias(dias: number): string {
  if (dias > 60) return 'bg-red-100 border-red-400 border-b-red-500'
  if (dias > 30) return 'bg-amber-100 border-amber-400 border-b-amber-500'
  return 'bg-emerald-100 border-emerald-400 border-b-emerald-500'
}

function textoPorDias(dias: number): string {
  if (dias > 60) return 'text-red-700'
  if (dias > 30) return 'text-amber-700'
  return 'text-emerald-700'
}

// Input del nombre de una estantería con estado local — el commit se hace al
// salir del campo (o Enter). Si el nombre es duplicado/vacío, se ignora.
function NombreEstanteriaInput({ nombre, onCommit }: { nombre: string; onCommit: (nuevo: string) => void }) {
  const [val, setVal] = useState(nombre)
  useEffect(() => { setVal(nombre) }, [nombre])
  return (
    <Input
      value={val}
      onChange={e => setVal(e.target.value.toUpperCase())}
      onBlur={() => {
        const v = val.trim().toUpperCase()
        if (v && v !== nombre) onCommit(v)
        else setVal(nombre)
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="h-8 w-28 text-sm font-bold"
      title="Nombre de la estantería — los huecos se renombran solos"
    />
  )
}

export function StockAlmacenView() {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cliFiltro, setCliFiltro] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [openClientes, setOpenClientes] = useState(false)
  const dropdownClientesRef = useRef<HTMLDivElement>(null)

  // Buscador por lote/palet/ubicación
  const [query, setQuery] = useState('')
  const queryNorm = normAlm(query.trim())

  // Configuración del almacén: lista de estanterías con su nº de huecos.
  // Cada hueco se nombra automáticamente y el mapa se dibuja a partir de
  // esta lista. Persistida en localStorage ('stock-config-v2'); migra las
  // claves antiguas 'stock-config' y 'stock-capacidades' si existen.
  const [almacenCfg, setAlmacenCfg] = useState<EstanteriaCfg[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('stock-config-v2')
      if (raw) {
        const arr = JSON.parse(raw) as EstanteriaCfg[]
        return Array.isArray(arr)
          ? arr.filter(e => e && String(e.nombre || '').trim()).map(e => ({
              id: e.id || Math.random().toString(36).slice(2, 9),
              nombre: String(e.nombre).trim().toUpperCase(),
              huecos: Math.max(0, Math.min(200, Number(e.huecos) || 0)),
              cap: Math.max(0, Number(e.cap) || 0),
              alias: Array.isArray(e.alias) ? e.alias.map(a => String(a || '').trim().toUpperCase()).filter(Boolean).slice(0, 10) : [],
            }))
          : []
      }
      const nuevaId = () => Math.random().toString(36).slice(2, 9)
      // Migración: formato anterior { nombre: { cap, pos } }
      const old = JSON.parse(localStorage.getItem('stock-config') || '{}') as Record<string, { cap?: number; pos?: number }>
      const migrado: EstanteriaCfg[] = Object.entries(old).map(([nombre, v]) => ({
        id: nuevaId(),
        nombre: nombre.trim().toUpperCase(),
        huecos: Math.max(0, Math.min(200, Number(v?.pos) || 0)),
        cap: Math.max(0, Number(v?.cap) || 0),
      })).filter(e => e.nombre)
      if (migrado.length > 0) return migrado
      // Migración: formato original { nombre: capacidad }
      const older = JSON.parse(localStorage.getItem('stock-capacidades') || '{}') as Record<string, number>
      return Object.entries(older).map(([nombre, v]) => ({
        id: nuevaId(),
        nombre: nombre.trim().toUpperCase(),
        huecos: 0,
        cap: Math.max(0, Number(v) || 0),
      })).filter(e => e.nombre)
    } catch { return [] }
  })
  const [showCfgEditor, setShowCfgEditor] = useState(false)
  // Formulario "añadir estantería"
  const [newRackName, setNewRackName] = useState('')
  const [newRackHuecos, setNewRackHuecos] = useState('')
  const [newRackCap, setNewRackCap] = useState('')
  useEffect(() => {
    try { localStorage.setItem('stock-config-v2', JSON.stringify(almacenCfg)) } catch { /* quota */ }
  }, [almacenCfg])

  // ── Helpers de configuración (estanterías → huecos) ──
  function anadirEstanteria(nombre: string, huecos: number, cap: number): boolean {
    const n = nombre.trim().toUpperCase()
    const h = Math.max(1, Math.min(200, huecos || 0))
    if (!n || huecos <= 0) return false
    if (almacenCfg.some(e => e.nombre.trim().toUpperCase() === n)) return false
    setAlmacenCfg(prev => prev.some(e => e.nombre.trim().toUpperCase() === n)
      ? prev
      : [...prev, { id: Math.random().toString(36).slice(2, 9), nombre: n, huecos: h, cap: Math.max(0, cap || 0) }])
    return true
  }
  function quitarEstanteria(id: string) {
    setAlmacenCfg(prev => prev.filter(e => e.id !== id))
  }
  function cambiarHuecos(id: string, v: number) {
    setAlmacenCfg(prev => prev.map(e => (e.id === id ? { ...e, huecos: Math.max(1, Math.min(200, v || 0)) } : e)))
  }
  function cambiarCap(id: string, v: number) {
    setAlmacenCfg(prev => prev.map(e => (e.id === id ? { ...e, cap: Math.max(0, v || 0) } : e)))
  }
  function renombrarEstanteria(id: string, nuevo: string) {
    const n = nuevo.trim().toUpperCase()
    if (!n) return
    setAlmacenCfg(prev => {
      if (prev.some(e => e.id !== id && e.nombre.trim().toUpperCase() === n)) return prev // duplicado: sin cambio
      return prev.map(e => {
        if (e.id !== id) return e
        const viejo = e.nombre.trim().toUpperCase()
        if (viejo === n) return e
        // El nombre antiguo pasa a alias: el stock registrado con él sigue en el mapa
        const alias = [viejo, ...(e.alias || [])]
          .map(a => String(a || '').trim().toUpperCase())
          .filter((a, i, arr) => a && a !== n && arr.indexOf(a) === i)
          .slice(0, 10)
        return { ...e, nombre: n, alias }
      })
    })
  }

  // Escáner QR
  const [qrOpen, setQrOpen] = useState(false)
  const [qrMsg, setQrMsg] = useState<{ txt: string; kind: 'ok' | 'err' | 'info' } | null>(null)
  const qrScannerRef = useRef<Html5QrcodeLike | null>(null)
  const qrRegionId = 'qr-reader-region'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, cRes] = await Promise.all([fetch('/api/registros'), fetch('/api/clientes')])
      setRegistros(await rRes.json())
      setClientes(await cRes.json())
    } catch (err) { console.error('Error cargando stock:', err) }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Reloj en vivo: refresca "días en almacén" cada minuto y muestra un contador
  // "actualizado hace Xs" para que se vea que el cálculo está vivo.
  const [lastUpdate, setLastUpdate] = useState(() => Date.now())
  const [tick, setTick] = useState(0)  // para el contador "hace Xs"
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now())
      setLastUpdate(Date.now())
    }, 60000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const segundosDesdeUpdate = Math.floor((Date.now() - lastUpdate) / 1000)

  // Cerrar dropdown de clientes al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownClientesRef.current && !dropdownClientesRef.current.contains(e.target as Node)) {
        setOpenClientes(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Cerrar el escáner QR al desmontar / cerrar el modal
  const stopQr = useCallback(async () => {
    const s = qrScannerRef.current
    qrScannerRef.current = null
    if (!s) return
    try {
      // El escáner puede estar "running" o ya parado — ambos casos son seguros
      // porque capturamos cualquier error y lo ignoramos (cleanup best-effort).
      try { if (s.isScanning) await s.stop() } catch { /* ya parado */ }
      try { await s.clear() } catch { /* ya limpiado */ }
    } catch (err) { console.warn('QR cleanup:', err) }
  }, [])
  useEffect(() => () => { stopQr() }, [stopQr])

  // Iniciar el escáner QR cuando se abre el modal
  useEffect(() => {
    if (!qrOpen) return
    let cancelled = false
    let stopNeeded = false
    setQrMsg(null)
    // Pequeño retardo para que el div del reader exista en el DOM
    const t = setTimeout(async () => {
      if (cancelled) return
      try {
        // Dynamic import — solo carga html5-qrcode cuando se abre el modal.
        // Asi evitamos problemas de SSR en el bundle inicial y reducimos el
        // JS que se descarga al entrar en STOCK ALMACÉN.
        const mod = await import('html5-qrcode')
        if (cancelled) return
        const s: Html5QrcodeLike = new mod.Html5Qrcode(qrRegionId) as Html5QrcodeLike
        qrScannerRef.current = s
        stopNeeded = true
        await s.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded: string) => {
            setQuery(decoded)
            setQrMsg({ txt: `QR leído: "${decoded}"`, kind: 'ok' })
            setTimeout(() => { setQrOpen(false) }, 600)
          },
          () => { /* frame sin decode — ignorar */ }
        )
      } catch (err) {
        console.error('QR start error:', err)
        setQrMsg({ txt: 'No se pudo acceder a la cámara. Revisa permisos del navegador.', kind: 'err' })
      }
    }, 100)
    return () => {
      cancelled = true
      clearTimeout(t)
      if (stopNeeded) stopQr()
    }
  }, [qrOpen, stopQr])

  const clienteFiltro = cliFiltro // string[]: vacío = todos

  // El motor de stock depende de "now" para los días → key de recálculo
  const stock = useMemo(
    () => buildStock(registros, clienteFiltro),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registros, clienteFiltro, now]
  )

  // El mapa sale de la CONFIGURACIÓN (estanterías + huecos). El stock en
  // ubicaciones no configuradas aparece en la lista "fuera de configuración".
  const racksCalc = useMemo(
    () => buildRacks(stock, almacenCfg, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, almacenCfg, now]
  )
  const racks = racksCalc.racks
  const fueraCfg = racksCalc.fuera
  const totalHuecos = racksCalc.totalHuecos
  const huecosOcupados = racksCalc.huecosOcupados
  const paletsFuera = useMemo(() => fueraCfg.reduce((s, c) => s + c.total, 0), [fueraCfg])

  // Estanterías detectadas en los movimientos y aún sin configurar (sugerencias).
  // No se sugieren nombres ya configurados ni antiguos (alias) de estanterías.
  const sugerencias = useMemo(() => {
    const yaCfg = new Set(almacenCfg.flatMap(e => [
      e.nombre.trim().toUpperCase(),
      ...(e.alias || []).map(a => String(a || '').trim().toUpperCase()),
    ]))
    return detectarEstanterias(registros).filter(s => !yaCfg.has(s.nombre))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registros, almacenCfg])

  const totalStock = useMemo(() => stock.reduce((s, l) => s + l.cantRestante, 0), [stock])
  const ubicOcupadas = useMemo(() => new Set(stock.map(l => normAlm(l.ubicacion) || '(sin ubicación)')).size, [stock])

  const mesActual = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const movsMes = useMemo(() => {
    const entradas = registros.filter(r => isEntradaPalet(r) && (clienteFiltro.length === 0 || clienteFiltro.includes(r.clienteId || '')) && r.fecha.slice(0, 7) === mesActual)
    const salidas = registros.filter(r => isSalidaPalet(r) && (clienteFiltro.length === 0 || clienteFiltro.includes(r.clienteId || '')) && r.fecha.slice(0, 7) === mesActual)
    return {
      entradas: entradas.reduce((s, r) => s + (r.cant || 0), 0),
      salidas: salidas.reduce((s, r) => s + (r.cant || 0), 0),
    }
  }, [registros, clienteFiltro, mesActual])

  // Tabla detalle: lotes abiertos, más antiguos primero
  const detalle = useMemo(
    () => [...stock].sort((a, b) => diasEnAlmacen(b.fecha, now) - diasEnAlmacen(a.fecha, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, now]
  )

  // Últimos movimientos palet
  const ultMovs = useMemo(
    () => registros
      .filter(r => isEntradaPalet(r) || isSalidaPalet(r))
      .filter(r => clienteFiltro.length === 0 || clienteFiltro.includes(r.clienteId || ''))
      .sort((a, b) => (b.fecha + (b.customData || '')).localeCompare(a.fecha + (a.customData || '')) || (b.id > a.id ? 1 : -1))
      .slice(0, 10),
    [registros, clienteFiltro]
  )

  const nombreCli = (id: string) => clientes.find(c => c.id === id)?.nombre || '(sin cliente)'

  const tieneMovs = registros.some(r => isEntradaPalet(r) || isSalidaPalet(r))

  // Buscador: ¿coincide una celda o un lote con la query?
  function cellMatch(c: { ubicacion: string; pos: string; rack: string; lotes: LoteStock[] }): boolean {
    if (!queryNorm) return false
    if (normAlm(c.ubicacion).includes(queryNorm)) return true
    if (normAlm(c.pos).includes(queryNorm)) return true
    if (normAlm(c.rack).includes(queryNorm)) return true
    return c.lotes.some(l => normAlm(l.ident).includes(queryNorm))
  }

  // ¿La celda tiene capacidad agotada?
  function capInfo(rackName: string, total: number): { cap: number; pct: number; full: boolean } {
    const cap = almacenCfg.find(e => e.nombre.trim().toUpperCase() === rackName)?.cap || 0
    if (cap <= 0) return { cap: 0, pct: 0, full: false }
    const pct = Math.min(100, Math.round((total / cap) * 100))
    return { cap, pct, full: total >= cap }
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <div className="h-9 w-9 rounded-lg bg-teal-100 flex items-center justify-center">
            <Warehouse className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800 leading-tight">STOCK ALMACÉN</h2>
            <p className="text-xs text-gray-500">
              Control de palets en almacén y estanterías · lectura en vivo
              <span className="ml-2 text-[10px] text-teal-600 font-semibold tabular-nums" data-tick={tick}>
                ● actualizado hace {segundosDesdeUpdate}s
              </span>
            </p>
          </div>
        </div>

        {/* Multi-select de clientes con checkboxes */}
        <div className="relative" ref={dropdownClientesRef}>
          <button
            onClick={() => setOpenClientes(v => !v)}
            className="h-9 px-3 min-w-[200px] flex items-center gap-2 rounded-md border border-gray-200 bg-white text-sm hover:bg-gray-50"
          >
            <span className="font-semibold text-gray-700 truncate">
              {cliFiltro.length === 0
                ? 'Todos los clientes'
                : cliFiltro.length === 1
                  ? (clientes.find(c => c.id === cliFiltro[0])?.nombre || '1 cliente')
                  : `${cliFiltro.length} clientes`}
            </span>
            <ChevronDown className="h-4 w-4 ml-auto text-gray-400" />
          </button>
          {openClientes && (
            <div className="absolute z-30 mt-1 w-[280px] max-h-[360px] overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg p-2">
              <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-100 mb-1">
                <Checkbox
                  id="cli-todos"
                  checked={cliFiltro.length === 0}
                  onCheckedChange={(v) => { if (v) setCliFiltro([]) }}
                />
                <Label htmlFor="cli-todos" className="text-sm font-bold cursor-pointer flex-1">
                  Todos los clientes
                </Label>
              </div>
              <div className="space-y-0.5">
                {clientes.map(c => {
                  const checked = cliFiltro.includes(c.id)
                  return (
                    <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                      <Checkbox
                        id={`cli-${c.id}`}
                        checked={checked}
                        onCheckedChange={(v) => {
                          setCliFiltro(prev => v
                            ? [...prev, c.id]
                            : prev.filter(x => x !== c.id))
                        }}
                      />
                      <Label htmlFor={`cli-${c.id}`} className="text-sm cursor-pointer flex-1 truncate">
                        {c.nombre}
                      </Label>
                    </div>
                  )
                })}
              </div>
              {cliFiltro.length > 0 && (
                <button
                  onClick={() => setCliFiltro([])}
                  className="mt-2 w-full text-xs font-bold text-teal-700 hover:bg-teal-50 rounded py-1.5"
                >
                  Limpiar selección
                </button>
              )}
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" className="h-9" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      {/* Barra de búsqueda + QR + capacidades */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar lote / nº palet / ubicación / estantería…"
            className="pl-9 pr-9 h-9 bg-white"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Limpiar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setQrOpen(true)}
          title="Escanear QR con la cámara"
        >
          <QrCode className="h-4 w-4 mr-1" /> Escanear QR
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-9 ml-auto"
          onClick={() => setShowCfgEditor(v => !v)}
          title="Definir estanterías y sus huecos — el mapa se genera solo"
        >
          <Settings2 className="h-4 w-4 mr-1" /> Configurar almacén
        </Button>
      </div>

      {/* Editor del almacén: estanterías → huecos con nombre automático */}
      {showCfgEditor && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-gray-800 mb-1 text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-teal-600" /> CONFIGURAR ALMACÉN
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              El mapa se genera a partir de las <b>estanterías</b> y sus <b>huecos</b>: defines la estantería con un nombre
              y un nº de huecos, y cada hueco se nombra solo (<b>E1-01, E1-02…</b>). Los huecos sin palets se ven como LIBRE.
              Se guarda en este navegador.
            </p>

            {/* 1 · Añadir estantería */}
            <div className="rounded-lg border-2 border-teal-100 bg-teal-50/40 p-3 mb-4">
              <div className="text-[11px] font-bold text-teal-800 uppercase tracking-wide mb-2">1 · Añadir estantería</div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-36">
                  <Label className="text-[10px] font-semibold text-gray-400 uppercase">Nombre</Label>
                  <Input
                    type="text"
                    value={newRackName}
                    onChange={e => setNewRackName(e.target.value.toUpperCase())}
                    placeholder="E1"
                    className="h-8 mt-0.5 text-sm"
                  />
                </div>
                <div className="w-28">
                  <Label className="text-[10px] font-semibold text-gray-400 uppercase">Nº de huecos</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={newRackHuecos}
                    onChange={e => setNewRackHuecos(e.target.value)}
                    placeholder="12"
                    className="h-8 mt-0.5 text-sm"
                  />
                </div>
                <div className="w-28">
                  <Label className="text-[10px] font-semibold text-gray-400 uppercase">Capacidad máx.</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newRackCap}
                    onChange={e => setNewRackCap(e.target.value)}
                    placeholder="Opcional"
                    className="h-8 mt-0.5 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="h-8 bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={() => {
                    const ok = anadirEstanteria(newRackName, parseInt(newRackHuecos, 10) || 0, parseInt(newRackCap, 10) || 0)
                    if (ok) { setNewRackName(''); setNewRackHuecos(''); setNewRackCap('') }
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Añadir
                </Button>
              </div>
              {/* Vista previa del nombrado automático */}
              {(() => {
                const n = newRackName.trim().toUpperCase()
                const h = parseInt(newRackHuecos, 10) || 0
                if (!n || h <= 0) return null
                const nombres = nombresHuecos(n, h)
                const muestra = h <= 4 ? nombres : [...nombres.slice(0, 3), `… (+${h - 4} más)`, nombres[nombres.length - 1]]
                const dup = almacenCfg.some(e => e.nombre.trim().toUpperCase() === n)
                return (
                  <div className="mt-2 text-xs">
                    {dup && <div className="text-red-600 font-semibold mb-1">Ya existe una estantería llamada {n}.</div>}
                    <span className="text-teal-800 font-semibold">Se nombrarán así: </span>
                    <span className="inline-flex flex-wrap gap-1 mt-1">
                      {muestra.map((m, i) => (
                        <span key={`${m}-${i}`} className="px-1.5 py-0.5 rounded bg-white border border-teal-200 text-teal-700 font-mono text-[11px] font-bold">{m}</span>
                      ))}
                    </span>
                  </div>
                )
              })()}
            </div>

            {/* Sugerencias detectadas en los movimientos */}
            {sugerencias.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Detectadas en los movimientos (sin configurar)
                </div>
                <div className="flex flex-wrap gap-2">
                  {sugerencias.map(s => (
                    <button
                      key={s.nombre}
                      onClick={() => anadirEstanteria(s.nombre, Math.max(1, s.maxPos), 0)}
                      className="text-xs rounded-md border border-gray-200 bg-white px-2.5 py-1.5 hover:border-teal-400 hover:bg-teal-50 transition-colors"
                      title={`Añadir estantería ${s.nombre} con ${s.maxPos || 1} huecos`}
                    >
                      <span className="font-bold text-gray-700">{s.nombre}</span>
                      <span className="text-gray-400"> · hasta {s.maxPos || '?'} huecos en {s.movs} mov.</span>
                      <span className="text-teal-700 font-bold ml-1">+ Añadir</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2 · Estanterías configuradas */}
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              2 · Tus estanterías
              <span className="normal-case font-semibold text-gray-400">
                {' '}· {almacenCfg.length} estantería(s) · {totalHuecos} huecos en el mapa
              </span>
            </div>
            {almacenCfg.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500">
                Todavía no hay estanterías. Añade la primera arriba: nombre + nº de huecos y el dibujo se crea solo.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {almacenCfg.map(e => {
                  const huecosNombres = nombresHuecos(e.nombre, e.huecos)
                  const rk = racks.find(r => r.name === e.nombre.trim().toUpperCase())
                  const ocup = rk ? rk.celdas.filter(c => c.total > 0).length : 0
                  return (
                    <div key={e.id} className="rounded-lg border border-gray-200 p-3 bg-white">
                      <div className="flex items-center gap-2">
                        <NombreEstanteriaInput nombre={e.nombre} onCommit={n => renombrarEstanteria(e.id, n)} />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-auto ${
                          ocup > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-50 text-gray-400 border-gray-200'
                        }`}>
                          {ocup}/{e.huecos} ocupados
                        </span>
                        <button
                          onClick={() => quitarEstanteria(e.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                          title="Eliminar esta estantería y sus huecos del mapa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {/* Huecos con nombre automático */}
                      {huecosNombres.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-2 max-h-24 overflow-y-auto">
                          {huecosNombres.map((h, i) => {
                            const celda = rk?.celdas[i]
                            const ocupado = (celda?.total || 0) > 0
                            return (
                              <span
                                key={h}
                                title={`${h}${ocupado ? ` · ${celda?.total} palet(s)` : ' · libre'}`}
                                className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                                  ocupado ? 'bg-teal-100 border-teal-300 text-teal-800' : 'bg-gray-50 border-gray-200 text-gray-400'
                                }`}
                              >
                                {h}
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-600 mt-2">
                          Sin nº de huecos: esta estantería no aparece en el mapa. Ponle huecos abajo.
                        </p>
                      )}
                      <div className="flex flex-wrap items-end gap-2 mt-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => cambiarHuecos(e.id, e.huecos - 1)}
                            className="h-7 w-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold"
                            title="Un hueco menos"
                          >−</button>
                          <Input
                            type="number"
                            min={1}
                            max={200}
                            value={e.huecos || ''}
                            onChange={ev => cambiarHuecos(e.id, parseInt(ev.target.value, 10) || 0)}
                            className="h-7 w-14 text-sm text-center"
                          />
                          <button
                            onClick={() => cambiarHuecos(e.id, e.huecos + 1)}
                            className="h-7 w-7 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold"
                            title="Un hueco más (se nombra solo al final)"
                          >+</button>
                          <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">huecos</span>
                        </div>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase">Cap. máx.</span>
                          <Input
                            type="number"
                            min={0}
                            value={e.cap || ''}
                            onChange={ev => cambiarCap(e.id, parseInt(ev.target.value, 10) || 0)}
                            placeholder="—"
                            className="h-7 w-16 text-sm text-center"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        {rk ? `${rk.total} palet(s) ahora` : 'Sin palets ahora'} · los huecos nuevos se nombran solos al final
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!tieneMovs && !loading && (
        <Card>
          <CardContent className="p-6 text-center">
            <Package className="h-10 w-10 mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-gray-700">Todavía no hay movimientos de palets</p>
            <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto">
              El stock se calcula con los registros cuyo concepto (C2) contiene <b>&quot;ENTRADA PALET&quot;</b> (suma) o
              <b> &quot;SALIDA PALET&quot;</b> (resta). Registra entradas y salidas con los campos personalizados
              <b> Lote / Nº Palet / Ubicación</b> y aquí verás el stock en vivo, las estanterías y los días de almacenaje.
            </p>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-teal-700" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold text-gray-800 leading-none">{totalStock}</p>
              <p className="text-xs font-semibold text-gray-500 mt-1">PALETS EN ALMACÉN</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-sky-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5 text-sky-700" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold text-gray-800 leading-none">
                {totalHuecos > 0 ? `${huecosOcupados}/${totalHuecos}` : ubicOcupadas}
              </p>
              <p className="text-xs font-semibold text-gray-500 mt-1">
                {totalHuecos > 0 ? 'HUECOS OCUPADOS' : 'UBICACIONES OCUPADAS'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <ArrowDownToLine className="h-5 w-5 text-green-700" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold text-green-700 leading-none">+{movsMes.entradas}</p>
              <p className="text-xs font-semibold text-gray-500 mt-1">ENTRADAS ESTE MES</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-rose-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
              <ArrowUpFromLine className="h-5 w-5 text-rose-700" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold text-rose-700 leading-none">−{movsMes.salidas}</p>
              <p className="text-xs font-semibold text-gray-500 mt-1">SALIDAS ESTE MES</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mapa de estanterías */}
      {racks.length > 0 && (
        <Card className="print-card">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-teal-600" /> MAPA DE ESTANTERÍAS
              </h3>
              <div className="flex flex-wrap items-center gap-2 ml-auto text-[11px] font-semibold print-hide">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-200 border border-emerald-400 inline-block" /> ≤ 30 días</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-200 border border-amber-400 inline-block" /> 30–60 días</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-200 border border-red-400 inline-block" /> +60 días</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-gray-100 border-2 border-dashed border-gray-300 inline-block" /> LIBRE</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 ml-1 text-xs print-hide"
                  onClick={() => {
                    document.body.classList.add('printing-stock')
                    setTimeout(() => {
                      window.print()
                      setTimeout(() => document.body.classList.remove('printing-stock'), 500)
                    }, 50)
                  }}
                >
                  <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir / PDF
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 print-racks">
              {racks.map(rk => {
                const cap = capInfo(rk.name, rk.total)
                return (
                <div key={rk.name} className="rounded-xl border-2 border-gray-300 bg-gradient-to-b from-gray-50 to-white p-3 shadow-sm min-w-[250px] flex-1 max-w-full print-rack">
                  <div className="flex items-center justify-between mb-1 px-0.5">
                    <div className="font-bold text-gray-700 text-sm flex items-center gap-1.5">
                      <Warehouse className="h-4 w-4 text-teal-600" /> ESTANTERÍA {rk.name}
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      cap.cap > 0
                        ? cap.full
                          ? 'bg-red-50 text-red-700 border-red-300'
                          : cap.pct > 75
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'bg-teal-50 text-teal-700 border-teal-200'
                        : 'bg-teal-50 text-teal-700 border-teal-200'
                    }`}>
                      {rk.total}{cap.cap > 0 ? `/${cap.cap}` : ''} {rk.total === 1 ? 'palet' : 'palets'}
                    </span>
                  </div>
                  {/* Barra de capacidad */}
                  {cap.cap > 0 && (
                    <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden mb-2 mx-0.5 print-hide">
                      <div
                        className={`h-full rounded-full transition-all ${cap.full ? 'bg-red-500' : cap.pct > 75 ? 'bg-amber-500' : 'bg-teal-500'}`}
                        style={{ width: `${Math.min(100, cap.pct)}%` }}
                      />
                    </div>
                  )}
                  {/* Postes laterales del estante + huecos */}
                  <div className="border-l-[6px] border-r-[6px] border-gray-400 rounded-sm bg-white p-1.5">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-1.5">
                      {rk.celdas.map(c => {
                        const ocupada = c.total > 0
                        const lotesUnicos = [...new Map(c.lotes.map(l => [l.ident || l.id, l])).values()]
                        const diasMax = c.dias
                        const match = cellMatch(c)
                        return (
                          <div
                            key={`${c.rack}-${c.ubicacion}`}
                            title={`${c.ubicacion}${ocupada ? ` · ${c.total} palet(s) · ${diasMax} días` : ' · LIBRE'}${lotesUnicos.some(l => l.ident) ? ' · ' + lotesUnicos.map(l => l.ident).join(', ') : ''}`}
                            className={`rounded-md border-2 p-1.5 shadow-sm cursor-default transition-all ${
                              match
                                ? 'ring-4 ring-sky-500 ring-offset-1 scale-105 z-10 relative'
                                : queryNorm
                                  ? 'opacity-30'
                                  : ''
                            } ${
                              ocupada
                                ? colorPorDias(c.dias)
                                : 'bg-gray-50 border-dashed border-gray-300 border-b-gray-300'
                            }`}
                          >
                            {/* Nº de UBICACIÓN — visible siempre, aunque esté libre */}
                            <div className="flex items-center justify-between gap-1 pb-1 border-b border-gray-300">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide truncate">
                                {c.rack}
                              </span>
                              <span className={`text-base font-extrabold leading-none ${ocupada ? textoPorDias(c.dias) : 'text-gray-400'}`}>
                                {c.pos || '—'}
                              </span>
                            </div>
                            {/* Nº de PALETS — el más grande de la celda */}
                            {ocupada ? (
                              <>
                                <div className={`text-2xl font-extrabold leading-tight ${textoPorDias(c.dias)}`}>
                                  {c.total}
                                </div>
                                <div className="text-[8px] font-bold text-gray-500 uppercase tracking-wide -mt-0.5">
                                  {c.total === 1 ? 'palet' : 'palets'}
                                </div>
                                {/* Lista de todos los lotes con sus días */}
                                {lotesUnicos.length > 0 && (
                                  <div className="mt-1 space-y-0.5">
                                    {lotesUnicos.map(l => {
                                      const dl = diasEnAlmacen(l.fecha, now)
                                      return (
                                        <div key={l.id} className="text-[9px] font-semibold text-gray-600 flex items-center justify-between gap-1">
                                          <span className="truncate">{l.ident || '—'}</span>
                                          <span className={`${textoPorDias(dl)} font-bold`}>{dl}d</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                                {/* DÍAS destacados (total del lote más antiguo) */}
                                <div className={`mt-1 pt-1 border-t border-gray-300 flex items-baseline gap-1 ${textoPorDias(c.dias)}`}>
                                  <span className="text-lg font-extrabold leading-none">{diasMax}</span>
                                  <span className="text-[8px] font-bold uppercase tracking-wide">días</span>
                                </div>
                              </>
                            ) : (
                              <div className="py-2 flex flex-col items-center justify-center">
                                <div className="text-base font-extrabold leading-tight text-gray-300">—</div>
                                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Libre</div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {/* Base del estante */}
                  <div className="h-2 bg-gray-400 rounded-b-lg -mx-1.5 mt-0" />
                </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Palets en ubicaciones que no están en la configuración */}
      {fueraCfg.length > 0 && (
        <Card className="border-amber-300 print-card">
          <CardContent className="p-4">
            <h3 className="font-bold text-amber-700 mb-1 text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> PALETS FUERA DE LA CONFIGURACIÓN ({paletsFuera} palets)
            </h3>
            <p className="text-xs text-gray-500 mb-3 print-hide">
              Están en ubicaciones que no existen en las estanterías configuradas (o sin ubicación).
              Añade la estantería con esos huecos en <b>Configurar almacén</b> o revisa la ubicación del movimiento.
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {fueraCfg.map(c => {
                const match = cellMatch(c)
                return (
                  <div
                    key={c.ubicacion}
                    title={`${c.ubicacion} · ${c.total} palet(s) · ${c.dias} días`}
                    className={`rounded-md border-2 border-amber-300 bg-amber-50 p-2 ${match ? 'ring-4 ring-sky-500 ring-offset-1' : ''} ${queryNorm && !match ? 'opacity-30' : ''}`}
                  >
                    <div className="text-[10px] font-bold text-amber-700 uppercase truncate">{c.ubicacion}</div>
                    <div className="text-xl font-extrabold text-amber-700 leading-tight">{c.total}</div>
                    <div className="text-[8px] font-bold text-amber-600 uppercase">palets · {c.dias} días</div>
                    {c.lotes.some(l => l.ident) && (
                      <div className="text-[9px] font-semibold text-gray-500 mt-1 truncate">
                        {c.lotes.map(l => l.ident).filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sin configuración: guía para empezar por estanterías/huecos */}
      {racks.length === 0 && fueraCfg.length === 0 && !loading && (
        <Card>
          <CardContent className="p-6 text-center">
            <Warehouse className="h-10 w-10 mx-auto text-teal-300 mb-3" />
            <p className="font-semibold text-gray-700">Configura tu almacén para ver el dibujo</p>
            <p className="text-sm text-gray-500 mt-2 max-w-lg mx-auto">
              Empieza por las <b>estanterías</b>: en <b>Configurar almacén</b> añade cada estantería con su nº de
              <b> huecos</b> (ej. E1 con 12 huecos → se nombran solos E1-01 … E1-12). El mapa se dibuja a partir de
              esa configuración y los huecos sin palets aparecen como LIBRE.
            </p>
            <Button
              size="sm"
              className="mt-4 bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => setShowCfgEditor(true)}
            >
              <Settings2 className="h-4 w-4 mr-1" /> Configurar almacén
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Detalle del stock */}
      {detalle.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-teal-600" /> DETALLE DEL STOCK ({totalStock} palets)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b-2 border-gray-200">
                    <th className="py-2 pr-3 font-semibold">UBICACIÓN</th>
                    <th className="py-2 pr-3 font-semibold">ESTANTERÍA</th>
                    <th className="py-2 pr-3 font-semibold">LOTE / Nº PALET</th>
                    <th className="py-2 pr-3 font-semibold">CLIENTE</th>
                    <th className="py-2 pr-3 font-semibold text-right">PALETS</th>
                    <th className="py-2 pr-3 font-semibold">FECHA ENTRADA</th>
                    <th className="py-2 font-semibold text-right">DÍAS</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map(l => {
                    const d = diasEnAlmacen(l.fecha, now)
                    const { rack, pos } = splitUbicacion(l.ubicacion)
                    return (
                      <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-semibold text-gray-700">{l.ubicacion || '—'}</td>
                        <td className="py-2 pr-3 text-gray-600">{rack}{pos ? ` · ${pos}` : ''}</td>
                        <td className="py-2 pr-3 text-gray-600">{l.ident || '—'}</td>
                        <td className="py-2 pr-3 text-gray-600">{nombreCli(l.clienteId)}</td>
                        <td className="py-2 pr-3 text-right font-bold text-gray-800">{l.cantRestante}</td>
                        <td className="py-2 pr-3 text-gray-600">{fmtDate(l.fecha)}</td>
                        <td className={`py-2 text-right font-bold ${d > 60 ? 'text-red-600' : d > 30 ? 'text-amber-600' : 'text-gray-600'}`}>{d}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Últimos movimientos */}
      {ultMovs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-gray-800 mb-3 text-sm">ÚLTIMOS MOVIMIENTOS DE PALET</h3>
            <div className="space-y-1.5">
              {ultMovs.map(m => {
                const esEnt = isEntradaPalet(m)
                const { pos } = splitUbicacion(getUbicacion(m))
                return (
                  <div key={m.id} className="flex items-center gap-2 text-sm border-b border-gray-50 pb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${esEnt ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                      {esEnt ? 'ENTRADA' : 'SALIDA'}
                    </span>
                    <span className="text-gray-500 text-xs w-20 shrink-0">{fmtDate(m.fecha)}</span>
                    <span className="font-semibold text-gray-700 truncate">{getIdent(m) || pos || m.c2}</span>
                    <span className="text-gray-400 text-xs truncate hidden md:inline">{nombreCli(m.clienteId)}</span>
                    <span className={`ml-auto font-bold shrink-0 ${esEnt ? 'text-green-600' : 'text-rose-600'}`}>
                      {esEnt ? '+' : '−'}{m.cant}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal Escáner QR */}
      <Dialog open={qrOpen} onOpenChange={(o) => { if (!o) setQrOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-teal-600" /> Escanear código QR
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Apunta la cámara al QR del palet. Al leerlo, se buscará automáticamente en el mapa.
            </p>
            <div
              id={qrRegionId}
              className="w-full aspect-square rounded-lg overflow-hidden bg-black border-2 border-gray-200"
            />
            {qrMsg && (
              <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                qrMsg.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' :
                qrMsg.kind === 'err' ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {qrMsg.txt}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setQrOpen(false)}
              >
                <X className="h-4 w-4 mr-1" /> Cerrar
              </Button>
            </div>
            <p className="text-[10px] text-gray-400">
              Si no funciona, revisa que el navegador tenga permiso de cámara para esta web.
              En iPhone usa Safari; en Android, Chrome.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
