'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Package, Warehouse, ArrowDownToLine, ArrowUpFromLine, RefreshCw, CalendarClock, Printer, Search, QrCode, X, Settings2, Layers, ChevronDown, Plus, Trash2, Scale, Copy } from 'lucide-react'
import { Hint } from '@/components/hualsa/hint'
import { CriteriosEditor } from '@/components/hualsa/criterios-editor'
import { fmtDate, type Cliente, type Registro } from '@/lib/hualsa-utils'
import {
  normAlm, isEntradaPalet, isSalidaPalet, getUbicacion, getIdent, splitUbicacion,
  diasEnAlmacen, buildStock, buildRacks, nombresHuecos, detectarEstanterias,
  loadAlmacenCfg, saveAlmacenCfg, fetchAlmacenCfg, pushAlmacenCfg, pesosDeZona, resumenCriterios, type EstanteriaCfg, type LoteStock, type CeldaStock, type PesosCriterios,
} from '@/lib/almacen'

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
// ENTRADA PALET suma, SALIDA PALET resta (lote → ubicación → FIFO).
// El motor de stock, la configuración de estanterías/huecos y el cálculo
// del hueco óptimo viven en '@/lib/almacen' — compartidos con ENTRADA,
// que asigna el hueco automáticamente al meter palets nuevos.

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

// Palets de una COLUMNA de abajo arriba: cada lote ocupa tantos puestos
// como palets tenga (cantRestante), en orden FIFO (el más antiguo abajo).
// Lo usa el ALZADO del mapa para pintar cada nivel/altura con SU palet
// (ident + días), porque el motor solo guarda la ubicación de columna.
function paletsDeColumna(c: CeldaStock): LoteStock[] {
  const out: LoteStock[] = []
  for (const l of [...c.lotes].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const n = Math.max(1, Math.round(l.cantRestante || 0))
    for (let i = 0; i < n; i++) out.push(l)
  }
  return out
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

// ─── Conversión FILAS DE ALTURA ⇄ caps[] ────────────────────────────────
// La configuración V21 se define por FILAS DE ALTURA: cada fila tiene su
// propio nº de huecos (pueden ser distintas: suelo 12, 2ª 12, 3ª 6…).
// El motor (hueco óptimo, mapa, avisos) sigue usando caps[] (altura por
// hueco), así que convertimos en ambos sentidos:
//   niveles = [N1, N2, …, Nk] → Nj huecos que llegan a la fila j+1
//   caps[i] = altura (nº de palets/niveles) de la posición i+1

// caps[] → filas de altura. [] sin caps → [] (apilado libre, sin límite).
// Ej: caps=[3,3,3,2,2,2,2,2,1,1] → [10, 8, 3]
//   (los 10 huecos llegan al suelo, 8 a la 2ª fila, 3 a la 3ª)
function alturasDesdeCaps(e: EstanteriaCfg): number[] {
  const huecos = e.huecos || 0
  if (huecos <= 0) return []
  const slice = (e.caps || []).slice(0, huecos)
  let k = 0
  for (const c of slice) if ((c || 0) > k) k = c || 0
  if (k === 0) return []
  const niveles = new Array<number>(k).fill(0)
  for (let i = 0; i < huecos; i++) {
    const c = Math.min(20, Math.max(0, slice[i] || 0))
    for (let fila = 1; fila <= c; fila++) niveles[fila - 1]++
  }
  return niveles
}

// filas de altura → caps[] (pirámide: la fila j tiene Nj huecos → los
// primeros Nj huecos del suelo llegan a la fila j). Nunca más arriba que
// abajo: si N3 > N2, se eleva N2 (los de arriba necesitan apoyo debajo).
// Devuelve también el nº de huecos del suelo (= niveles[0]).
function capsDesdeNiveles(niveles: number[]): { caps: number[]; suelo: number } {
  // Pirámide: cada fila ≤ la anterior
  const pir = niveles.map(n => Math.max(0, Math.min(200, Math.floor(n) || 0)))
  for (let i = 1; i < pir.length; i++) {
    if (pir[i] > pir[i - 1]) pir[i] = pir[i - 1]
  }
  const N1 = pir[0] || 0
  if (N1 <= 0) return { caps: [], suelo: 0 }
  const caps = new Array<number>(N1).fill(0)
  for (let i = 0; i < N1; i++) {
    let a = 0
    for (let fila = 0; fila < pir.length; fila++) {
      if (pir[fila] > i) a = fila + 1
    }
    caps[i] = a
  }
  return { caps, suelo: N1 }
}

// ─── Editor de FILAS DE ALTURA (configuración principal de cada zona) ───
// FLUJO EN 2 PASOS: PRIMERO el nº de niveles/alturas (stepper − N +) y
// LUEGO los huecos de cada fila, de forma INDEPENDIENTE:
//   · ESTANTERÍA: cada fila = un nivel del rack (nivel 1 suelo, nivel 2…).
//   · PARED: cada fila = una altura de palets apilados (suelo, 2ª…).
// La fila 1 (suelo) siempre existe: es el nº de huecos de la zona.
function FilasAlturaEditor({
  est,
  onCambiarSuelo,
  onCambiarFila,
  onCambiarNumFilas,
  onQuitarFila,
  onQuitarLimite,
}: {
  est: EstanteriaCfg
  onCambiarSuelo: (v: number) => void
  onCambiarFila: (idx: number, v: number) => void
  onCambiarNumFilas: (n: number) => void
  onQuitarFila: (idx: number) => void
  onQuitarLimite: () => void
}) {
  const esPared = est.tipo === 'pared'
  const palabra = esPared ? 'altura' : 'nivel'
  const plural = esPared ? 'alturas' : 'niveles'
  const ordinal = esPared ? 'ª' : 'º'   // 2ª altura · 2º nivel
  const niveles = alturasDesdeCaps(est)        // [] → apilado libre
  const tieneLimite = niveles.length > 0
  const suelo = est.huecos || 0
  const capacidadTotal = niveles.reduce((s, n) => s + Math.max(0, n), 0)

  return (
    <div className="mt-2 rounded-md border border-teal-200 bg-teal-50/40 p-2">
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <Layers className="h-3.5 w-3.5 text-teal-700 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-teal-800">
          {esPared ? 'Alturas de palet (apilado)' : 'Niveles (estantería)'}
        </span>
        {tieneLimite ? (
          <span className="text-[10px] font-semibold text-teal-700 bg-teal-100 border border-teal-200 rounded-full px-2 py-0.5">
            {niveles.length} fila{niveles.length > 1 ? 's' : ''} · caben {capacidadTotal} palets
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            sin límite de altura (apilado libre)
          </span>
        )}
        {/* Stepper − N + : PRIMERO el nº de niveles/alturas, LUEGO los huecos */}
        {tieneLimite ? (
          <div className="ml-auto flex items-center gap-0.5" title={`Nº de ${plural} de la zona — luego ajusta los huecos de cada uno`}>
            <button
              onClick={() => onCambiarNumFilas(niveles.length - 1)}
              disabled={niveles.length <= 1}
              className="h-5 w-5 rounded border border-teal-300 bg-white text-teal-700 font-bold leading-none hover:bg-teal-100 disabled:opacity-30 disabled:hover:bg-white"
              title={niveles.length <= 1 ? 'El suelo (fila 1) siempre está — usa «quitar límite» para apilado libre' : `Quitar la fila más alta (${niveles.length}ª)`}
            >
              −
            </button>
            <Input
              type="number" min={1} max={20}
              value={niveles.length}
              onChange={ev => {
                const v = parseInt(ev.target.value, 10)
                if (!Number.isNaN(v)) onCambiarNumFilas(v)
              }}
              className="h-5 w-9 text-[11px] text-center tabular-nums px-0.5 border-teal-300 bg-white"
            />
            <button
              onClick={() => onCambiarNumFilas(niveles.length + 1)}
              className="h-5 w-5 rounded border border-teal-300 bg-white text-teal-700 font-bold leading-none hover:bg-teal-100"
              title={`Añadir una fila más de ${plural} arriba (empieza con los mismos huecos que la última — ajústala)`}
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={() => onCambiarNumFilas(1)}
            className="ml-auto h-5 px-2 rounded bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-bold"
            title={`Definir ${esPared ? 'las alturas' : 'los niveles'}: empieza con 1 fila (solo suelo) y sube con +`}
          >
            Definir {esPared ? 'alturas' : 'niveles'}
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-600 leading-tight mb-2">
        {esPared ? (
          <>Elige el <b>nº de alturas</b> (− N +) y luego cuántos <b>huecos</b> llegan a cada una — pueden ser distintas.</>
        ) : (
          <>Elige el <b>nº de niveles</b> (− N +) y luego cuántos <b>huecos</b> tiene cada uno — pueden ser distintos.</>
        )}
      </p>

      {/* Fila 1 — SUELO (siempre presente): nº de huecos de la zona */}
      <label
        className="flex items-center gap-2 rounded border border-gray-300 bg-white px-2 py-1 mb-1"
        title={`Suelo: nº de huecos de la zona (${est.nombre}-01, ${est.nombre}-02…)`}
      >
        <span className="text-[10px] font-bold text-gray-700 w-24 shrink-0">1 · Suelo</span>
        <div className="flex-1 min-w-[50px] h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-teal-600" style={{ width: '100%' }} />
        </div>
        <Input
          type="number" min={1} max={200}
          value={suelo || ''}
          onChange={ev => onCambiarSuelo(parseInt(ev.target.value, 10) || 0)}
          placeholder="—"
          className="h-6 w-14 text-xs text-center tabular-nums px-1"
        />
        <span className="text-[10px] text-gray-500 w-14 text-right shrink-0">huecos</span>
      </label>

      {/* Filas 2..k — cada una con su nº de huecos INDEPENDIENTE */}
      {niveles.slice(1).map((n, j) => {
        const fila = j + 2  // nº de fila (2, 3, 4…)
        const pct = suelo > 0 ? Math.min(100, Math.round((n / suelo) * 100)) : 0
        return (
          <label
            key={fila}
            className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1 mb-1"
            title={`Fila ${fila}: ${n} huecos llegan a esta ${palabra}`}
          >
            <span className="text-[10px] font-bold text-gray-600 w-24 shrink-0">{fila} · {fila}{ordinal} {palabra}</span>
            <div className="flex-1 min-w-[50px] h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <Input
              type="number" min={0} max={200}
              value={n || ''}
              onChange={ev => onCambiarFila(j + 1, parseInt(ev.target.value, 10) || 0)}
              placeholder="0"
              className="h-6 w-14 text-xs text-center tabular-nums px-1"
            />
            <span className="text-[10px] text-gray-500 w-14 text-right shrink-0 flex items-center justify-end gap-1">
              huecos
              <button
                onClick={e => { e.preventDefault(); onQuitarFila(j + 1) }}
                className="text-gray-300 hover:text-red-500 transition-colors"
                title={`Quitar la fila ${fila} (${n} huecos)`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </label>
        )
      })}

      {/* Acciones: quitar límite (apilado libre) */}
      <div className="flex items-center gap-2 pt-0.5">
        {tieneLimite && (
          <button
            onClick={onQuitarLimite}
            className="h-6 px-2 rounded text-gray-500 hover:text-red-600 text-[10px] font-bold underline"
            title="Quitar todas las filas de altura — la zona pasa a apilado libre (sin límite)"
          >
            quitar límite
          </button>
        )}
        <span className="ml-auto text-[10px] text-gray-400">
          {suelo} huecos · {tieneLimite ? `${capacidadTotal} palets máx.` : 'capacidad ∞'}
        </span>
      </div>
    </div>
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

  // Configuración del almacén: lista de ZONAS (estanterías o paredes),
  // cada una con sus FILAS DE ALTURA (nº de huecos independiente por fila).
  // Cada hueco se nombra automáticamente y el mapa se dibuja a partir de
  // esta lista. Compartida con ENTRADA (hueco óptimo automático) vía
  // '@/lib/almacen': persistida en localStorage ('stock-config-v2') con
  // migración de las claves antiguas 'stock-config' y 'stock-capacidades'.
  const [almacenCfg, setAlmacenCfg] = useState<EstanteriaCfg[]>(() => loadAlmacenCfg())
  const [showCfgEditor, setShowCfgEditor] = useState(false)
  // Formulario "añadir zona" (tarjeta punteada al final de la lista):
  // primero el TIPO (estantería / pared), luego nombre y nº de huecos.
  const [addOpen, setAddOpen] = useState(false)
  const [newRackTipo, setNewRackTipo] = useState<'estanteria' | 'pared'>('estanteria')
  const [newRackName, setNewRackName] = useState('')
  // V24: orientación — desde dónde se numeran los huecos al dibujar el mapa.
  // 'izq' (por defecto): hueco 01 a la izquierda · 'der': hueco 01 a la derecha.
  const [newRackOrientacion, setNewRackOrientacion] = useState<'izq' | 'der'>('izq')
  // Formulario en 2 pasos: PRIMERO el nº de niveles/alturas (incluye el
  // suelo) y LUEGO un input de huecos por cada fila. Las filas nuevas
  // empiezan con el valor de la última; los valores escritos se conservan.
  const [newRackNiveles, setNewRackNiveles] = useState('')   // '' → 1 (solo suelo)
  const [newRackFilas, setNewRackFilas] = useState<string[]>([''])
  const [newRackCap, setNewRackCap] = useState('')
  const numNewNiveles = Math.max(1, Math.min(20, parseInt(newRackNiveles, 10) || 1))
  const palabraNew = newRackTipo === 'pared' ? 'altura' : 'nivel'
  const pluralNew = newRackTipo === 'pared' ? 'alturas' : 'niveles'
  const ordinalNew = newRackTipo === 'pared' ? 'ª' : 'º'
  function cambiarNewNiveles(v: string) {
    setNewRackNiveles(v)
    const n = Math.max(1, Math.min(20, parseInt(v, 10) || 1))
    setNewRackFilas(prev => {
      if (n <= prev.length) return prev.slice(0, n)
      const fill = prev.length ? prev[prev.length - 1] : ''
      return [...prev, ...Array.from({ length: n - prev.length }, () => fill)]
    })
  }
  function cambiarNewFila(i: number, v: string) {
    setNewRackFilas(prev => {
      const next = [...prev]
      while (next.length <= i) next.push(next[next.length - 1] ?? '')
      next[i] = v
      return next
    })
  }
  // V25: la config se guarda en localStorage (arranque rápido) Y en el
  // servidor (para que el móvil/otros dispositivos vean el mismo mapa).
  // ⚠️ No se pushea al servidor hasta que la config del SERVIDOR se ha
  // cargado (serverCfgReadyRef): si no, el estado inicial vacío del
  // primer render SOBRESCRIBIRÍA la config guardada (race condition).
  const serverCfgReadyRef = useRef(false)
  const initialCfgJsonRef = useRef('')   // config local al montar (¿ha editado el usuario?)
  useEffect(() => {
    saveAlmacenCfg(almacenCfg)
    if (serverCfgReadyRef.current) pushAlmacenCfg(almacenCfg)
  }, [almacenCfg])
  // Al montar: carga la config del SERVIDOR (fuente compartida). Si el
  // servidor está vacío pero este navegador tenía config local, se sube
  // automáticamente (migración desde el PC donde se configuró).
  useEffect(() => {
    initialCfgJsonRef.current = JSON.stringify(almacenCfg)  // eslint-disable-line react-hooks/exhaustive-deps
    let cancelado = false
    fetchAlmacenCfg().then(cfg => {
      if (cancelado) return
      serverCfgReadyRef.current = true
      // Solo reemplaza el estado si el usuario NO ha editado nada mientras
      // llegaba la respuesta (si ya tocó algo, no se le pisa por encima).
      setAlmacenCfg(prev =>
        JSON.stringify(prev) === initialCfgJsonRef.current ? cfg : prev
      )
    }).catch(() => { serverCfgReadyRef.current = true })
    return () => { cancelado = true }
  }, [])

  // ── Helpers de configuración (zonas → filas de altura → huecos) ──
  // filas = nº de huecos de CADA nivel/altura (fila 1 = suelo). Ej:
  // [12, 10, 6] → suelo 12 huecos, 2º nivel 10, 3º nivel 6. La pirámide
  // (una fila nunca supera a la de abajo) se aplica en capsDesdeNiveles.
  function anadirEstanteria(nombre: string, filas: number[], cap: number, tipo: 'estanteria' | 'pared' = 'estanteria', orientacion: 'izq' | 'der' = 'izq'): boolean {
    const n = nombre.trim().toUpperCase()
    const { caps, suelo } = capsDesdeNiveles(filas)
    if (!n || suelo <= 0) return false
    if (almacenCfg.some(e => e.nombre.trim().toUpperCase() === n)) return false
    setAlmacenCfg(prev => prev.some(e => e.nombre.trim().toUpperCase() === n)
      ? prev
      : [...prev, { id: Math.random().toString(36).slice(2, 9), nombre: n, tipo, orientacion, huecos: suelo, cap: Math.max(0, cap || 0), caps }])
    return true
  }
  function quitarEstanteria(id: string) {
    setAlmacenCfg(prev => prev.filter(e => e.id !== id))
  }
  function cambiarCap(id: string, v: number) {
    setAlmacenCfg(prev => prev.map(e => (e.id === id ? { ...e, cap: Math.max(0, v || 0) } : e)))
  }
  // Cambiar el TIPO de la zona (badge clicable en la tarjeta): estantería ↔ pared.
  // Solo cambia etiquetas/ayuda — el motor es el mismo (huecos + altura por hueco).
  function cambiarTipo(id: string) {
    setAlmacenCfg(prev => prev.map(e => (e.id === id ? { ...e, tipo: e.tipo === 'pared' ? 'estanteria' : 'pared' } : e)))
  }
  // V24: cambiar la ORIENTACIÓN de la zona (de dónde se numeran los huecos al
  // dibujar el mapa). 'izq' ↔ 'der'. No afecta al motor — solo al orden visual.
  function cambiarOrientacion(id: string) {
    setAlmacenCfg(prev => prev.map(e => (e.id === id ? { ...e, orientacion: e.orientacion === 'der' ? 'izq' : 'der' } : e)))
  }

  // ── FILAS DE ALTURA (configuración principal V21) ──
  // Cambiar el nº de huecos del SUELO (fila 1). Si la zona tiene filas de
  // altura definidas, se regeneran los caps[] manteniendo las filas;
  // si está en apilado libre, solo cambia el nº de huecos.
  function cambiarSuelo(id: string, v: number) {
    const N1 = Math.max(1, Math.min(200, v || 0))
    setAlmacenCfg(prev => prev.map(e => {
      if (e.id !== id) return e
      const niveles = alturasDesdeCaps(e)
      if (niveles.length === 0) return { ...e, huecos: N1 }
      const { caps } = capsDesdeNiveles([N1, ...niveles.slice(1)])
      return { ...e, huecos: N1, caps }
    }))
  }
  // Cambiar el nº de huecos de la fila idx (0-based; idx ≥ 1, la 0 es el suelo)
  function cambiarFila(id: string, idx: number, v: number) {
    setAlmacenCfg(prev => prev.map(e => {
      if (e.id !== id) return e
      const niveles = alturasDesdeCaps(e)
      if (niveles.length === 0 || idx <= 0 || idx >= niveles.length + 1) return e
      const next = [...niveles]
      next[idx] = Math.max(0, Math.min(200, v || 0))
      // Pirámide: una fila nunca puede tener más huecos que la de abajo
      for (let i = 1; i < next.length; i++) {
        if (next[i] > next[i - 1]) next[i] = next[i - 1]
      }
      const { caps, suelo } = capsDesdeNiveles(next)
      return { ...e, huecos: suelo, caps }
    }))
  }
  // Cambiar el Nº DE FILAS de altura de la zona (stepper − N + del editor):
  // PRIMERO se elige cuántos niveles/alturas hay y LUEGO los huecos de cada
  // una. n=0 → apilado libre; n>k → añade filas arriba (= última); n<k →
  // quita las de arriba. Desde apilado libre, la 1ª fila creada es el suelo.
  function cambiarNumFilas(id: string, n: number) {
    const target = Math.max(0, Math.min(20, Math.floor(n) || 0))
    setAlmacenCfg(prev => prev.map(e => {
      if (e.id !== id) return e
      if (target === 0) return { ...e, caps: [] }
      const niveles = alturasDesdeCaps(e)
      let next: number[]
      if (niveles.length === 0) {
        next = new Array(target).fill(Math.max(1, e.huecos))
      } else if (target > niveles.length) {
        const ultima = niveles[niveles.length - 1]
        next = [...niveles, ...new Array(target - niveles.length).fill(ultima)]
      } else {
        next = niveles.slice(0, target)
      }
      const { caps, suelo } = capsDesdeNiveles(next)
      return { ...e, huecos: suelo, caps }
    }))
  }
  // Quitar la fila idx (0-based; solo filas ≥ 2 — el suelo siempre está)
  function quitarFila(id: string, idx: number) {
    setAlmacenCfg(prev => prev.map(e => {
      if (e.id !== id) return e
      const niveles = alturasDesdeCaps(e)
      if (idx <= 0 || idx >= niveles.length) return e
      const next = niveles.filter((_, i) => i !== idx)
      if (next.length === 0) return { ...e, caps: [] }
      const { caps, suelo } = capsDesdeNiveles(next)
      return { ...e, huecos: suelo, caps }
    }))
  }
  // Quitar TODAS las filas de altura → apilado libre (sin límite)
  function quitarLimiteAlturas(id: string) {
    setAlmacenCfg(prev => prev.map(e => (e.id === id ? { ...e, caps: [] } : e)))
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

  // ── V29: CRITERIOS DE ASIGNACIÓN por zona (ponderaciones 0–10) ──
  // Los usa el asistente de UBICACIÓN de ENTRADAS para proponer el hueco de
  // cada zona. Se editan aquí (por zona, no global) o con «Ajustar» en el
  // propio asistente; se guardan con la configuración (localStorage + servidor).
  const [critOpenId, setCritOpenId] = useState<string | null>(null)
  function cambiarCriterios(id: string, pesos: PesosCriterios) {
    setAlmacenCfg(prev => prev.map(e => (e.id === id ? { ...e, criterios: { ...pesos } } : e)))
  }
  // Copia los pesos de UNA zona a TODAS (mismo criterio en todo el almacén)
  function aplicarCriteriosATodas(id: string) {
    const src = almacenCfg.find(e => e.id === id)
    if (!src) return
    const pesos = pesosDeZona(src)
    setAlmacenCfg(prev => prev.map(e => ({ ...e, criterios: { ...pesos } })))
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
            <Hint variant="info" className="block mb-3 w-full">
              Configura cada zona: elige si es <b>ESTANTERÍA</b> (rack con niveles) o <b>PARED</b> (apilado en suelo), luego <b>cuántos niveles de altura</b> y los <b>huecos de cada uno</b> — pueden ser distintos. Los huecos se nombran solos (E1-01, E1-02…) y el mapa se dibuja con ellos.
            </Hint>

            {/* Sugerencias detectadas en los movimientos */}
            {sugerencias.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Estanterías detectadas en los movimientos (pulsa para añadirlas)
                </div>
                <div className="flex flex-wrap gap-2">
                  {sugerencias.map(s => (
                    <button
                      key={s.nombre}
                      onClick={() => anadirEstanteria(s.nombre, [Math.max(1, s.maxPos)], 0)}
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

            {/* UNA sola lista: las zonas existentes + tarjeta punteada para añadir más */}
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              Tus zonas
              <span className="normal-case font-semibold text-gray-400">
                {' '}· {almacenCfg.length} zona(s) · {totalHuecos} huecos en el mapa
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {almacenCfg.map(e => {
                  const huecosNombres = nombresHuecos(e.nombre, e.huecos)
                  const rk = racks.find(r => r.name === e.nombre.trim().toUpperCase())
                  const ocup = rk ? rk.celdas.filter(c => c.total > 0).length : 0
                  const esPared = e.tipo === 'pared'
                  return (
                    <div key={e.id} className="rounded-lg border border-gray-200 p-3 bg-white">
                      <div className="flex items-center gap-2">
                        <NombreEstanteriaInput nombre={e.nombre} onCommit={n => renombrarEstanteria(e.id, n)} />
                        {/* TIPO de zona: clicable para cambiar estantería ↔ pared */}
                        <button
                          onClick={() => cambiarTipo(e.id)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                            esPared
                              ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                              : 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100'
                          }`}
                          title={esPared
                            ? 'PARED: palets apilados en el suelo, uno encima de otro — pulsa para cambiar a ESTANTERÍA'
                            : 'ESTANTERÍA: rack con niveles — pulsa para cambiar a PARED (apilado en suelo)'}
                        >
                          {esPared ? 'PARED' : 'ESTANTERÍA'}
                        </button>
                        {/* ORIENTACIÓN: clicable para cambiar izq ↔ der.
                            Indica desde DÓNDE se numeran los huecos en el mapa. */}
                        <button
                          onClick={() => cambiarOrientacion(e.id)}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                            e.orientacion === 'der'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
                              : 'bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100'
                          }`}
                          title={e.orientacion === 'der'
                            ? 'DERECHA: el hueco 01 se dibuja a la derecha — pulsa para cambiar a IZQUIERDA'
                            : 'IZQUIERDA: el hueco 01 se dibuja a la izquierda — pulsa para cambiar a DERECHA'}
                        >
                          {e.orientacion === 'der' ? '→ Der' : '← Izq'}
                        </button>
                        {e.huecos > 0 ? (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-auto ${
                            ocup > 0 ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-gray-50 text-gray-400 border-gray-200'
                          }`}>
                            {ocup}/{e.huecos} ocupados
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border ml-auto bg-amber-50 text-amber-700 border-amber-200">
                            importada · sin huecos
                          </span>
                        )}
                        <button
                          onClick={() => quitarEstanteria(e.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                          title="Eliminar esta zona y sus huecos del mapa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {/* FILAS DE ALTURA — configuración principal: nº de huecos
                          INDEPENDIENTE por fila (suelo, 2ª, 3ª…) */}
                      {e.huecos > 0 && (
                        <FilasAlturaEditor
                          est={e}
                          onCambiarSuelo={v => cambiarSuelo(e.id, v)}
                          onCambiarFila={(idx, v) => cambiarFila(e.id, idx, v)}
                          onCambiarNumFilas={n => cambiarNumFilas(e.id, n)}
                          onQuitarFila={idx => quitarFila(e.id, idx)}
                          onQuitarLimite={() => quitarLimiteAlturas(e.id)}
                        />
                      )}
                      {/* Huecos con nombre automático — muestran su altura (·N) si está definida */}
                      {huecosNombres.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-2 max-h-24 overflow-y-auto">
                          {huecosNombres.map((h, i) => {
                            const celda = rk?.celdas[i]
                            const ocupado = (celda?.total || 0) > 0
                            const altura = e.caps?.[i] || 0
                            return (
                              <span
                                key={h}
                                title={`${h}${altura > 0 ? ` · altura ${altura} (palets apilables)` : ''}${ocupado ? ` · ${celda?.total} palet(s)` : ' · libre'}`}
                                className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                                  ocupado ? 'bg-teal-100 border-teal-300 text-teal-800' : 'bg-gray-50 border-gray-200 text-gray-400'
                                }`}
                              >
                                {h}{altura > 0 && <span className="text-teal-600">·{altura}</span>}
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-600 mt-2">
                          Importada de la configuración anterior (capacidad). No aparece en el mapa hasta que
                          le des un nº de huecos en la fila Suelo — o elimínala con la papelera si no la necesitas.
                        </p>
                      )}
                      <div className="flex flex-wrap items-end gap-2 mt-2 pt-2 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400">
                          {rk ? `${rk.total} palet(s) ahora` : 'Sin palets ahora'} · los huecos se nombran solos
                        </p>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase" title="Capacidad total de toda la zona (opcional)">Cap. máx. total</span>
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
                    </div>
                  )
                })}

                {/* Tarjeta punteada: añadir una zona nueva A ESTA MISMA LISTA */}
                {addOpen ? (
                  <div className="rounded-lg border-2 border-dashed border-teal-400 bg-teal-50/40 p-3">
                    <div className="text-[11px] font-bold text-teal-800 uppercase tracking-wide mb-2">Nueva zona</div>
                    {/* 1º — TIPO de zona: estantería o pared + orientación */}
                    <div className="mb-2">
                      <Label className="text-[10px] font-semibold text-gray-400 uppercase">Tipo de zona</Label>
                      <div className="flex gap-1 mt-0.5">
                        <button
                          onClick={() => setNewRackTipo('estanteria')}
                          className={`flex-1 h-10 px-2 rounded-md text-left border transition-colors ${newRackTipo === 'estanteria' ? 'bg-sky-100 border-sky-400' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                          title="Rack con niveles: cada nivel tiene sus huecos (posiciones) y caben distintos números por nivel"
                        >
                          <span className={`block text-[11px] font-bold ${newRackTipo === 'estanteria' ? 'text-sky-800' : 'text-gray-600'}`}>ESTANTERÍA</span>
                          <span className="block text-[9px] leading-tight text-gray-500">rack con niveles · 1 palet por hueco y nivel</span>
                        </button>
                        <button
                          onClick={() => setNewRackTipo('pared')}
                          className={`flex-1 h-10 px-2 rounded-md text-left border transition-colors ${newRackTipo === 'pared' ? 'bg-amber-100 border-amber-400' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                          title="Palets apilados en el suelo (contra pared), uno encima de otro — cada posición tiene su altura en nº de palets"
                        >
                          <span className={`block text-[11px] font-bold ${newRackTipo === 'pared' ? 'text-amber-800' : 'text-gray-600'}`}>PARED</span>
                          <span className="block text-[9px] leading-tight text-gray-500">apilado en suelo · uno encima de otro</span>
                        </button>
                      </div>
                      {/* Orientación: desde DÓNDE se numeran los huecos (01…N) en el mapa */}
                      <div className="flex items-center gap-1 mt-1.5">
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase shrink-0">Empieza en</Label>
                        <button
                          onClick={() => setNewRackOrientacion('izq')}
                          className={`h-6 px-2 rounded-md border text-[10px] font-bold transition-colors ${newRackOrientacion === 'izq' ? 'bg-teal-100 border-teal-400 text-teal-800' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                          title="El hueco 01 se dibuja a la izquierda (orden natural: 01, 02, 03… de izquierda a derecha)"
                        >
                          ← Izquierda
                        </button>
                        <button
                          onClick={() => setNewRackOrientacion('der')}
                          className={`h-6 px-2 rounded-md border text-[10px] font-bold transition-colors ${newRackOrientacion === 'der' ? 'bg-teal-100 border-teal-400 text-teal-800' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                          title="El hueco 01 se dibuja a la derecha (orden invertido: 01, 02, 03… de derecha a izquierda) — útil para paredes vistas desde el otro lado"
                        >
                          Derecha →
                        </button>
                      </div>
                    </div>
                    {/* 2º — nombre, Nº DE NIVELES/ALTURAS y cap. opcional */}
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-28">
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase">Nombre</Label>
                        <Input
                          type="text"
                          value={newRackName}
                          onChange={e => setNewRackName(e.target.value.toUpperCase())}
                          placeholder="E2"
                          className="h-8 mt-0.5 text-sm"
                        />
                      </div>
                      <div className="w-32">
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase">
                          {newRackTipo === 'pared' ? 'Nº de alturas' : 'Nº de niveles'}
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={newRackNiveles}
                          onChange={e => cambiarNewNiveles(e.target.value)}
                          placeholder="1"
                          className="h-8 mt-0.5 text-sm"
                          title={`Cuántos niveles de altura tiene la zona (el 1º es el suelo) — luego escribe los huecos de cada uno`}
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-[10px] font-semibold text-gray-400 uppercase">Cap. máx.</Label>
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
                          const filas = newRackFilas.slice(0, numNewNiveles).map(s => parseInt(s, 10) || 0)
                          const ok = anadirEstanteria(newRackName, filas, parseInt(newRackCap, 10) || 0, newRackTipo, newRackOrientacion)
                          if (ok) { setNewRackName(''); setNewRackNiveles(''); setNewRackFilas(['']); setNewRackCap(''); setNewRackOrientacion('izq') }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Añadir
                      </Button>
                      <button
                        onClick={() => setAddOpen(false)}
                        className="text-[11px] text-gray-400 hover:text-gray-600 underline mb-1.5"
                      >
                        cancelar
                      </button>
                    </div>
                    {/* 3º — LOS HUECOS DE CADA NIVEL/ALTURA (fila 1 = suelo) */}
                    <div className="mt-2 rounded-md border border-teal-200 bg-white/70 p-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-teal-800 mb-1.5">
                        Huecos por {palabraNew} · {numNewNiveles} {numNewNiveles > 1 ? pluralNew : palabraNew}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {Array.from({ length: numNewNiveles }, (_, i) => (
                          <label
                            key={i}
                            className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1"
                            title={i === 0
                              ? `Suelo: nº de huecos de la zona (${newRackName.trim().toUpperCase() || 'E2'}-01, …-02…)`
                              : `Fila ${i + 1}: huecos que llegan a esta ${palabraNew} (no puede superar la de abajo)`}
                          >
                            <span className="text-[10px] font-bold text-gray-600 w-[4.5rem] shrink-0">
                              {i === 0 ? '1 · Suelo' : `${i + 1} · ${i + 1}${ordinalNew} ${palabraNew}`}
                            </span>
                            <Input
                              type="number" min={i === 0 ? 1 : 0} max={200}
                              value={newRackFilas[i] ?? ''}
                              onChange={e => cambiarNewFila(i, e.target.value)}
                              placeholder={i === 0 ? '12' : '0'}
                              className="h-6 w-14 text-xs text-center tabular-nums px-1"
                            />
                            <span className="text-[10px] text-gray-500">huecos</span>
                          </label>
                        ))}
                      </div>
                      {(() => {
                        const filasNum = newRackFilas.slice(0, numNewNiveles).map(s => parseInt(s, 10) || 0)
                        if (filasNum.every(v => v <= 0)) return null
                        const pir = filasNum.map(v => v)
                        for (let i = 1; i < pir.length; i++) if (pir[i] > pir[i - 1]) pir[i] = pir[i - 1]
                        const total = pir.reduce((s, v) => s + v, 0)
                        const ajustada = pir.some((v, i) => v !== filasNum[i])
                        return (
                          <p className="text-[10px] mt-1.5 leading-tight">
                            <span className="text-teal-800 font-semibold">Caben {total} palets en total.</span>{' '}
                            {ajustada && <span className="text-amber-600">Una fila no puede tener más huecos que la de abajo — se ajustará al añadir.</span>}
                          </p>
                        )
                      })()}
                    </div>
                    {/* Vista previa del nombrado automático */}
                    {(() => {
                      const n = newRackName.trim().toUpperCase()
                      const filasNum = newRackFilas.slice(0, numNewNiveles).map(s => parseInt(s, 10) || 0)
                      const h = filasNum[0] || 0
                      if (!n) return null
                      if (h <= 0) {
                        return <div className="mt-2 text-xs text-amber-600 font-semibold">Pon al menos los huecos del suelo (fila 1) para añadir la zona.</div>
                      }
                      const nombres = nombresHuecos(n, h)
                      const muestra = h <= 4 ? nombres : [...nombres.slice(0, 3), `… (+${h - 4} más)`, nombres[nombres.length - 1]]
                      const dup = almacenCfg.some(e => e.nombre.trim().toUpperCase() === n)
                      return (
                        <div className="mt-2 text-xs">
                          {dup && <div className="text-red-600 font-semibold mb-1">Ya existe una zona llamada {n}.</div>}
                          <span className="text-teal-800 font-semibold">
                            {numNewNiveles} {numNewNiveles > 1 ? pluralNew : palabraNew} · Se nombrarán así:{' '}
                          </span>
                          <span className="inline-flex flex-wrap gap-1 mt-1">
                            {muestra.map((m, i) => (
                              <span key={`${m}-${i}`} className="px-1.5 py-0.5 rounded bg-white border border-teal-200 text-teal-700 font-mono text-[11px] font-bold">{m}</span>
                            ))}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <button
                    onClick={() => setAddOpen(true)}
                    className={`rounded-lg border-2 border-dashed border-gray-300 p-3 hover:border-teal-400 hover:bg-teal-50/40 transition-colors flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:text-teal-700 ${
                      almacenCfg.length === 0 ? 'min-h-[150px]' : 'min-h-[110px]'
                    }`}
                    title="Añadir una zona nueva (estantería o pared) a esta lista"
                  >
                    <Plus className="h-5 w-5" />
                    <span className="text-xs font-bold uppercase tracking-wide">Añadir zona</span>
                    {almacenCfg.length === 0 && (
                      <span className="text-[10px] normal-case text-gray-400 text-center max-w-[240px]">
                        Estantería o pared: elige el tipo, cuántos niveles de altura y los huecos de cada uno
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* ── V29: CRITERIOS DE ASIGNACIÓN · POR ZONA ──
                  Ponderaciones (0–10) con las que el asistente de UBICACIÓN
                  de ENTRADAS puntúa los huecos de CADA zona. No es global:
                  cada estantería/pared tiene los suyos. */}
              <div className="mt-5 pt-4 border-t border-gray-200">
                <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  <Scale className="h-4 w-4 text-indigo-600" /> CRITERIOS DE ASIGNACIÓN
                  <span className="text-[10px] font-semibold text-gray-400 normal-case">· por zona, no general</span>
                </h4>
                <Hint variant="info" className="block mb-3 w-full mt-2">
                  Al meter palets en <b>ENTRADAS</b>, el asistente puntúa cada hueco de la zona con estas <b>ponderaciones (0–10)</b> y propone el de mayor puntuación. Sube <b>Familia</b> para juntar productos, <b>Lote</b> para agrupar lotes, <b>Orden</b> para FIFO de posiciones, <b>Rotación</b> para colocar junto al stock más antiguo… Cada zona tiene <b>sus propios criterios</b>.
                </Hint>
                <div className="space-y-2">
                  {almacenCfg.filter(e => e.huecos > 0).map(e => {
                    const pesos = pesosDeZona(e)
                    const top = resumenCriterios(pesos)
                    const abierto = critOpenId === e.id
                    const personalizados = !!e.criterios
                    return (
                      <div key={e.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                          <Warehouse className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                          <span className="font-bold text-sm text-gray-800">{e.nombre}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${e.tipo === 'pared' ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-sky-50 text-sky-700 border-sky-300'}`}>
                            {e.tipo === 'pared' ? 'PARED' : 'ESTANTERÍA'}
                          </span>
                          <div className="flex items-center gap-1 flex-wrap min-w-0">
                            {top.length > 0 ? top.map(c => (
                              <span
                                key={c.id}
                                title="Criterio con más peso de esta zona"
                                className="text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-1.5 py-0.5"
                              >
                                {c.nombre} <b className="font-mono">{c.peso}</b>
                              </span>
                            )) : (
                              <span className="text-[10px] text-gray-400 font-semibold">todos a 0 — solo orden</span>
                            )}
                            {personalizados && (
                              <span className="text-[9px] font-bold text-teal-600" title="Esta zona tiene criterios personalizados (no los por defecto)">●</span>
                            )}
                          </div>
                          <div className="ml-auto flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => aplicarCriteriosATodas(e.id)}
                              className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-indigo-600 px-1.5 py-1 rounded-md hover:bg-indigo-50 transition-colors"
                              title="Copiar los criterios de esta zona a TODAS las zonas"
                            >
                              <Copy className="h-3 w-3" /> a todas
                            </button>
                            <button
                              onClick={() => setCritOpenId(abierto ? null : e.id)}
                              className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${abierto ? 'bg-indigo-600 text-white' : 'text-indigo-700 hover:bg-indigo-50'}`}
                              title="Editar las ponderaciones de esta zona"
                            >
                              {abierto ? 'Cerrar' : 'Editar'}
                            </button>
                          </div>
                        </div>
                        {abierto && (
                          <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50/40">
                            <CriteriosEditor pesos={pesos} onChange={p => cambiarCriterios(e.id, p)} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {almacenCfg.filter(e => e.huecos > 0).length === 0 && (
                    <p className="text-xs text-gray-400">Añade primero zonas con huecos para configurar sus criterios.</p>
                  )}
                </div>
              </div>
          </CardContent>
        </Card>
      )}

      {!tieneMovs && !loading && (
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <Package className="h-3 w-3 text-gray-400 shrink-0" />
          <span className="font-semibold text-gray-600">Sin movimientos todavía.</span>
          <span className="text-gray-400">·</span>
          <span>Registra entradas/salidas con <b>ENTRADA PALET</b>/<b>SALIDA PALET</b> y los campos <b>Lote / Nº Palet / Ubicación</b> para ver el stock en vivo.</span>
        </div>
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
                <Warehouse className="h-4 w-4 text-teal-600" /> MAPA DEL ALMACÉN
              </h3>
              <div className="flex flex-wrap items-center gap-2 ml-auto text-[11px] font-semibold print-hide">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-200 border border-emerald-400 inline-block" /> ≤ 30 días</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-200 border border-amber-400 inline-block" /> 30–60 días</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-200 border border-red-400 inline-block" /> +60 días</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-gray-100 border-2 border-dashed border-gray-300 inline-block" /> LIBRE</span>
                {racks.some(rk => rk.celdas.some(c => c.cap > 1)) && (
                  <span className="text-gray-400 font-semibold">filas = niveles/alturas · cada casilla = 1 palet</span>
                )}
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
                const cfgRack = almacenCfg.find(c => c.nombre.trim().toUpperCase() === rk.name)
                const tipoRack = cfgRack?.tipo
                const esParedRack = tipoRack === 'pared'
                // Nº de niveles/alturas que se dibujan en el alzado: la altura
                // máxima de las columnas (cap). ≥ 2 → una fila por nivel (se
                // ve TODO lo configurado); si no → fila única (apilado libre).
                const kNiveles = rk.celdas.reduce((m, c) => Math.max(m, c.cap > 0 ? c.cap : 0), 0)
                // Columnas del alzado: palets de abajo arriba + altura dibujada
                // (cap 0 = sin límite → llega hasta el nivel más alto dibujado)
                const columnas = rk.celdas.map(c => ({
                  c,
                  palets: paletsDeColumna(c),
                  altura: c.cap > 0 ? c.cap : Math.max(1, kNiveles),
                }))
                // V24: ORIENTACIÓN — si la zona está marcada como 'der', el
                // hueco 01 se dibuja a la derecha (orden invertido).
                const orientacionRack = cfgRack?.orientacion === 'der' ? 'der' : 'izq'
                const columnasVis = orientacionRack === 'der' ? [...columnas].reverse() : columnas
                return (
                <div key={rk.name} className="rounded-xl border-2 border-gray-300 bg-gradient-to-b from-gray-50 to-white p-3 shadow-sm min-w-[250px] flex-1 max-w-full print-rack">
                  <div className="flex items-center justify-between mb-1 px-0.5">
                    <div className="font-bold text-gray-700 text-sm flex items-center gap-1.5">
                      <Warehouse className="h-4 w-4 text-teal-600" />
                      {tipoRack === 'pared' ? 'PARED' : 'ESTANTERÍA'} {rk.name}
                      {kNiveles >= 2 && (
                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
                          {kNiveles} {esParedRack ? 'alturas' : 'niveles'}
                        </span>
                      )}
                      {/* Badge de orientación visible en el mapa */}
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5" title={orientacionRack === 'der' ? 'Empieza en la derecha' : 'Empieza en la izquierda'}>
                        {orientacionRack === 'der' ? '→ Der' : '← Izq'}
                      </span>
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
                  {/* Postes laterales + huecos — ALZADO POR NIVELES/ALTURAS:
                      se dibuja TODO lo configurado: una fila por nivel (la más
                      alta arriba, columnas alineadas) y cada casilla = 1 palet
                      (de abajo arriba, FIFO). Sin niveles definidos → fila
                      única como antes. */}
                  <div className="border-l-[6px] border-r-[6px] border-gray-400 rounded-sm bg-white p-1.5">
                    {kNiveles >= 2 ? (
                    <div className="overflow-x-auto">
                      <div className="min-w-full w-max">
                        {Array.from({ length: kNiveles }, (_, idx) => kNiveles - idx).map(j => {
                          const visibles = columnasVis.filter(col => col.altura >= j).length
                          return (
                            <div key={j} className="flex items-stretch gap-1 mb-1 last:mb-0">
                              <div className="w-[4.4rem] shrink-0 flex flex-col items-end justify-center pr-1 text-right leading-tight">
                                <span className="text-[9px] font-extrabold text-gray-500 uppercase tracking-wide">
                                  {j === 1 ? 'Suelo' : `${j}${esParedRack ? 'ª altura' : 'º nivel'}`}
                                </span>
                                <span className="text-[8px] font-bold text-gray-400">{visibles} huecos</span>
                              </div>
                              <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${rk.celdas.length}, minmax(56px, 1fr))` }}>
                                {columnasVis.map((col, i) => {
                                  if (col.altura < j) {
                                    return (
                                      <div key={i} className="rounded-md border-2 border-dashed border-gray-200/70 bg-gray-50/40" title="A esta altura no llega esta columna" />
                                    )
                                  }
                                  const { c, palets, altura } = col
                                  const palet = palets[j - 1]
                                  const ocupada = j <= palets.length
                                  const dias = palet ? diasEnAlmacen(palet.fecha, now) : 0
                                  const esTope = j === altura
                                  const llena = c.cap > 0 && c.total >= c.cap
                                  const desborda = esTope && c.total > altura
                                  const match = cellMatch(c)
                                  return (
                                    <div
                                      key={i}
                                      title={`${c.ubicacion} · ${j === 1 ? 'suelo' : `${j}${esParedRack ? 'ª altura' : 'º nivel'}`}${ocupada ? ` · palet ${palet?.ident || '—'} · ${dias} días` : ' · LIBRE'}${llena ? ' · LLENO' : ''}`}
                                      className={`rounded-md border-2 p-1 shadow-sm min-h-[3.2rem] flex flex-col ${
                                        match
                                          ? 'ring-4 ring-sky-500 ring-offset-1 relative z-10'
                                          : queryNorm
                                            ? 'opacity-30'
                                            : ''
                                      } ${ocupada ? colorPorDias(dias) : 'bg-gray-50 border-dashed border-gray-300 border-b-gray-300'} ${llena && esTope && !match ? 'ring-2 ring-red-500 ring-offset-1' : ''}`}
                                    >
                                      <div className="flex items-center justify-between gap-0.5 pb-0.5 border-b border-gray-300/70">
                                        <span className="text-[8px] font-bold text-gray-400 truncate">{c.rack}</span>
                                        <span className={`text-[11px] font-extrabold leading-none ${ocupada ? textoPorDias(dias) : 'text-gray-300'}`}>{c.pos}</span>
                                      </div>
                                      {ocupada ? (
                                        <>
                                          <div className={`text-[10px] font-bold truncate mt-0.5 ${textoPorDias(dias)}`}>{palet?.ident || '—'}</div>
                                          <div className="mt-auto flex items-baseline justify-between gap-0.5">
                                            <span className={`text-sm font-extrabold leading-none ${textoPorDias(dias)}`}>{dias}<span className="text-[8px] ml-px">d</span></span>
                                            {desborda ? (
                                              <span className="text-[8px] font-extrabold text-red-600" title={`Hay ${c.total} palets y la columna llega a ${altura}`}>+{c.total - altura}</span>
                                            ) : llena && esTope ? (
                                              <span className="text-[8px] font-extrabold text-red-600">LLENO</span>
                                            ) : c.cap === 0 && esTope ? (
                                              <span className="text-[10px] font-bold text-gray-300" title="Columna sin límite de altura">∞</span>
                                            ) : null}
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center">
                                          <span className="text-sm font-extrabold text-gray-300 leading-none">—</span>
                                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Libre</span>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                        {/* Totales por columna: palets / altura */}
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-[4.4rem] shrink-0 text-right pr-1 text-[8px] font-extrabold text-gray-400 uppercase tracking-wide">Total</div>
                          <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${rk.celdas.length}, minmax(56px, 1fr))` }}>
                            {columnasVis.map(({ c }, i) => (
                              <div key={i} className="text-center text-[9px] font-extrabold tabular-nums text-gray-600">
                                {c.total}{c.cap > 0 ? <span className="text-gray-400 font-bold">/{c.cap}</span> : <span className="text-gray-300 font-bold">/∞</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-1.5">
                      {(orientacionRack === 'der' ? [...rk.celdas].reverse() : rk.celdas).map(c => {
                        const ocupada = c.total > 0
                        const lotesUnicos = [...new Map(c.lotes.map(l => [l.ident || l.id, l])).values()]
                        const diasMax = c.dias
                        const match = cellMatch(c)
                        return (
                          <div
                            key={`${c.rack}-${c.ubicacion}`}
                            title={`${c.ubicacion}${c.cap > 0 ? ` · altura ${c.cap}` : ''}${ocupada ? ` · ${c.total}${c.cap > 0 ? `/${c.cap}` : ''} palet(s) · ${diasMax} días${c.cap > 0 && c.total >= c.cap ? ' · LLENO' : ''}` : ' · LIBRE'}${lotesUnicos.some(l => l.ident) ? ' · ' + lotesUnicos.map(l => l.ident).join(', ') : ''}`}
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
                            } ${c.cap > 0 && c.total >= c.cap ? 'ring-2 ring-red-500 ring-offset-1' : ''}`}
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
                            {/* Nº de PALETS — el más grande de la celda (con su altura: 2/3) */}
                            {ocupada ? (
                              <>
                                <div className={`text-2xl font-extrabold leading-tight ${textoPorDias(c.dias)}`}>
                                  {c.total}
                                  {c.cap > 0 && <span className="text-sm text-gray-400 font-bold">/{c.cap}</span>}
                                </div>
                                <div className={`text-[8px] font-bold uppercase tracking-wide -mt-0.5 ${c.cap > 0 && c.total >= c.cap ? 'text-red-600' : 'text-gray-500'}`}>
                                  {c.cap > 0 && c.total >= c.cap ? 'lleno' : c.total === 1 ? 'palet' : 'palets'}
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
                                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                  Libre{c.cap > 0 ? <span className="text-gray-300 normal-case"> ·{c.cap}</span> : ''}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    )}
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
            <Hint variant="warning" className="block mb-3 w-full print-hide">
              Palets en ubicaciones que no existen en la configuración (o sin ubicación). Añade la estantería con esos huecos en <b>Configurar almacén</b> o revisa la ubicación del movimiento.
            </Hint>
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
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <Warehouse className="h-3 w-3 text-teal-400 shrink-0" />
              <p className="text-[11px] font-semibold text-gray-600">Configura tu almacén para ver el dibujo</p>
            </div>
            <Hint variant="tip" className="mt-1 max-w-md mx-auto">
              En <b>Configurar almacén</b> añade cada estantería con su nº de <b>huecos</b> (ej. E1 con 12 → E1-01…E1-12). El mapa se dibuja solo y los huecos vacíos aparecen como LIBRE.
            </Hint>
            <Button
              size="sm"
              className="mt-2 h-7 px-2 text-[11px] bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => setShowCfgEditor(true)}
            >
              <Settings2 className="h-3 w-3 mr-1" /> Configurar almacén
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
            <Hint variant="info" className="w-full">
              Apunta la cámara al QR del palet (las etiquetas se generan al guardar <b>ENTRADAS de palets</b>). Al leerlo, se buscará automáticamente en el mapa.
            </Hint>
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
