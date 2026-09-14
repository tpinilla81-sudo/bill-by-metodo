'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Package, Warehouse, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Layers, CalendarClock, Printer, Map } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { fmtDate, type Cliente, type Registro } from '@/lib/hualsa-utils'

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

function diasEnAlmacen(fecha: string): number {
  const d = new Date(fecha + 'T00:00:00')
  if (isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}

// Motor de stock: recorre los movimientos por orden de fecha y va
// consumiendo lotes. Salida sin coincidencia → descuenta del lote más antiguo.
function buildStock(registros: Registro[], clienteFiltro: string): LoteStock[] {
  const movs = registros
    .filter(r => isEntradaPalet(r) || isSalidaPalet(r))
    .filter(r => !clienteFiltro || r.clienteId === clienteFiltro)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

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

function buildRacks(stock: LoteStock[], known: Map<string, { rack: string; pos: string; ubicacion: string }>): RackStock[] {
  const porUb = new Map<string, CeldaStock>()
  for (const l of stock) {
    const key = normAlm(l.ubicacion) || '(sin ubicación)'
    const { rack, pos } = splitUbicacion(l.ubicacion)
    let c = porUb.get(key)
    if (!c) {
      c = { ubicacion: l.ubicacion || 'SIN UBICACIÓN', rack, pos, total: 0, dias: 0, lotes: [] }
      porUb.set(key, c)
    }
    c.total += l.cantRestante
    c.dias = Math.max(c.dias, diasEnAlmacen(l.fecha))
    c.lotes.push(l)
  }
  // Ubicaciones conocidas (aparecieron en movimientos) sin stock actual → LIBRE
  for (const [key, k] of known.entries()) {
    if (!porUb.has(key)) {
      porUb.set(key, { ubicacion: k.ubicacion, rack: k.rack, pos: k.pos, total: 0, dias: 0, lotes: [] })
    }
  }
  const racksMap = new Map<string, RackStock>()
  for (const c of porUb.values()) {
    let rk = racksMap.get(c.rack)
    if (!rk) {
      rk = { name: c.rack, total: 0, celdas: [] }
      racksMap.set(c.rack, rk)
    }
    rk.total += c.total
    rk.celdas.push(c)
  }
  // RELLENAR HUECOS NUMÉRICOS: si en un rack hay posiciones 01, 02, 05, 07,
  // añadir 03, 04, 06 como LIBRE para que se vea el mapa completo.
  for (const rk of racksMap.values()) {
    const nums = rk.celdas
      .filter(c => /^\d{1,3}$/.test(c.pos))
      .map(c => parseInt(c.pos, 10))
    if (nums.length >= 2) {
      const min = Math.min(...nums)
      const max = Math.max(...nums)
      const existentes = new Set(rk.celdas.map(c => c.pos))
      for (let n = min; n <= max; n++) {
        const posStr = String(n).padStart(2, '0')
        if (!existentes.has(posStr) && !existentes.has(String(n))) {
          rk.celdas.push({
            ubicacion: `${rk.name}-${posStr}`,
            rack: rk.name,
            pos: posStr,
            total: 0,
            dias: 0,
            lotes: [],
          })
        }
      }
    }
    rk.celdas.sort((a, b) => a.pos.localeCompare(b.pos, 'es', { numeric: true }))
  }
  const racks = [...racksMap.values()]
  racks.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
  return racks
}

// Todas las ubicaciones que aparecen en CUALQUIER movimiento de palet
// (con stock o sin él) para dibujar también las posiciones libres.
function knownUbicaciones(registros: Registro[], clienteFiltro: string): Map<string, { rack: string; pos: string; ubicacion: string }> {
  const known = new Map<string, { rack: string; pos: string; ubicacion: string }>()
  for (const r of registros) {
    if (!isEntradaPalet(r) && !isSalidaPalet(r)) continue
    if (clienteFiltro && r.clienteId !== clienteFiltro) continue
    const ub = getUbicacion(r)
    const key = normAlm(ub)
    if (!key || known.has(key)) continue
    const { rack, pos } = splitUbicacion(ub)
    known.set(key, { rack, pos, ubicacion: ub })
  }
  return known
}

const PIE_COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e', '#ef4444', '#6366f1', '#6b7280', '#0ea5e9']

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

export function StockAlmacenView() {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cliFiltro, setCliFiltro] = useState<string>('todos')
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

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

  // Refrescar "días en almacén" cada 60s sin recargar datos
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const clienteFiltro = cliFiltro === 'todos' ? '' : cliFiltro

  const smurfitId = useMemo(
    () => clientes.find(c => /smurfit/i.test(normAlm(c.nombre)))?.id || '',
    [clientes]
  )

  // El motor de stock depende de "now" para los días → key de recálculo
  const stock = useMemo(
    () => buildStock(registros, clienteFiltro),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registros, clienteFiltro, now]
  )

  const racks = useMemo(
    () => buildRacks(stock, knownUbicaciones(registros, clienteFiltro)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, registros, clienteFiltro, now]
  )

  const totalStock = useMemo(() => stock.reduce((s, l) => s + l.cantRestante, 0), [stock])
  const ubicOcupadas = useMemo(() => new Set(stock.map(l => normAlm(l.ubicacion) || '(sin ubicación)')).size, [stock])

  const mesActual = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const movsMes = useMemo(() => {
    const entradas = registros.filter(r => isEntradaPalet(r) && (!clienteFiltro || r.clienteId === clienteFiltro) && r.fecha.slice(0, 7) === mesActual)
    const salidas = registros.filter(r => isSalidaPalet(r) && (!clienteFiltro || r.clienteId === clienteFiltro) && r.fecha.slice(0, 7) === mesActual)
    return {
      entradas: entradas.reduce((s, r) => s + (r.cant || 0), 0),
      salidas: salidas.reduce((s, r) => s + (r.cant || 0), 0),
    }
  }, [registros, clienteFiltro, mesActual])

  // Gráfico barras: palets por estantería
  const barData = useMemo(
    () => racks.map(rk => ({ name: rk.name, palets: rk.total })),
    [racks]
  )

  // Gráfico circular: stock por cliente (respeta el motor de stock completo,
  // no el filtro, para ver la reparto real del almacén)
  const pieData = useMemo(() => {
    const all = buildStock(registros, '')
    const porCli = new Map<string, number>()
    for (const l of all) porCli.set(l.clienteId, (porCli.get(l.clienteId) || 0) + l.cantRestante)
    return [...porCli.entries()]
      .map(([id, v]) => ({ name: clientes.find(c => c.id === id)?.nombre || '(sin cliente)', value: v }))
      .sort((a, b) => b.value - a.value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registros, clientes, now])

  // Tabla detalle: lotes abiertos, más antiguos primero
  const detalle = useMemo(
    () => [...stock].sort((a, b) => diasEnAlmacen(b.fecha) - diasEnAlmacen(a.fecha)),
    [stock]
  )

  // Últimos movimientos palet
  const ultMovs = useMemo(
    () => registros
      .filter(r => isEntradaPalet(r) || isSalidaPalet(r))
      .filter(r => !clienteFiltro || r.clienteId === clienteFiltro)
      .sort((a, b) => (b.fecha + (b.customData || '')).localeCompare(a.fecha + (a.customData || '')) || (b.id > a.id ? 1 : -1))
      .slice(0, 10),
    [registros, clienteFiltro]
  )

  const nombreCli = (id: string) => clientes.find(c => c.id === id)?.nombre || '(sin cliente)'

  const tieneMovs = registros.some(r => isEntradaPalet(r) || isSalidaPalet(r))

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
            <p className="text-xs text-gray-500">Control de palets en almacén y estanterías · lectura en vivo</p>
          </div>
        </div>

        {/* Acceso rápido SMURFIT */}
        {smurfitId && (
          <button
            onClick={() => setCliFiltro(smurfitId)}
            className={`h-9 px-3 rounded-lg text-xs font-bold border transition-colors ${cliFiltro === smurfitId ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-teal-300 text-teal-700 hover:bg-teal-50'}`}
          >
            SMURFIT
          </button>
        )}

        <Select value={cliFiltro} onValueChange={setCliFiltro}>
          <SelectTrigger className="w-[220px] h-9 bg-white text-sm">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los clientes</SelectItem>
            {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="h-9" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

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
              <p className="text-2xl font-extrabold text-gray-800 leading-none">{ubicOcupadas}</p>
              <p className="text-xs font-semibold text-gray-500 mt-1">UBICACIONES OCUPADAS</p>
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
              {racks.map(rk => (
                <div key={rk.name} className="rounded-xl border-2 border-gray-300 bg-gradient-to-b from-gray-50 to-white p-3 shadow-sm min-w-[250px] flex-1 max-w-full print-rack">
                  <div className="flex items-center justify-between mb-2 px-0.5">
                    <div className="font-bold text-gray-700 text-sm flex items-center gap-1.5">
                      <Warehouse className="h-4 w-4 text-teal-600" /> ESTANTERÍA {rk.name}
                    </div>
                    <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                      {rk.total} {rk.total === 1 ? 'palet' : 'palets'}
                    </span>
                  </div>
                  {/* Postes laterales del estante + huecos */}
                  <div className="border-l-[6px] border-r-[6px] border-gray-400 rounded-sm bg-white p-1.5">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-1.5">
                      {rk.celdas.map(c => {
                        const ocupada = c.total > 0
                        const lotesUnicos = [...new Map(c.lotes.map(l => [l.ident || l.id, l])).values()]
                        const diasMax = c.dias
                        return (
                          <div
                            key={`${c.rack}-${c.ubicacion}`}
                            title={`${c.ubicacion}${ocupada ? ` · ${c.total} palet(s) · ${diasMax} días` : ' · LIBRE'}${lotesUnicos.some(l => l.ident) ? ' · ' + lotesUnicos.map(l => l.ident).join(', ') : ''}`}
                            className={`rounded-md border-2 p-1.5 shadow-sm cursor-default ${
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
                                      const dl = diasEnAlmacen(l.fecha)
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
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos */}
      {totalStock > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-bold text-gray-800 mb-3 text-sm">PALETS POR ESTANTERÍA</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#374151' }} />
                    <Tooltip />
                    <Bar dataKey="palets" name="Palets" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="font-bold text-gray-800 mb-3 text-sm">STOCK POR CLIENTE (TODO EL ALMACÉN)</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
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
                    const d = diasEnAlmacen(l.fecha)
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
    </div>
  )
}
