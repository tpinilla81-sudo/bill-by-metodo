'use client'
// CACHE-BUST v2026-06-18-v5 — Entrada rows now mirror Registros table layout

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Trash2, Save, CheckCircle, AlertCircle, X, ArrowRightCircle, Clock, Zap, Settings2, ChevronDown, Plus, Table, QrCode, Printer, Warehouse, Map as MapIcon, List } from 'lucide-react'
import { todayISO, fmtCurrency, fmtDate, getISOWeek, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, DEFAULT_FIELDS_ENTRADA, type FieldDef, parseCustomData, serializeCustomData, fieldAppliesToClient } from '@/lib/config'
import { triggerBackup } from '@/lib/trigger-backup'
import { EntradaGrilla } from '@/components/hualsa/entrada-grilla'
import { QrEtiquetaDialog, type EtiquetaPalet } from '@/components/hualsa/qr-etiqueta'
import {
  loadAlmacenCfg, fetchAlmacenCfg, huecoOptimo, clasificarUbicacion, contadoresHuecos, listadoHuecos,
  esC2EntradaPalet, normAlm, getIdent, getUbicacion, identDeCustomValues,
  isQrAuto, setQrAuto,
  type EstanteriaCfg, type HuecoInfo,
} from '@/lib/almacen'

interface EntradaViewData {
  registros: Registro[]
  clientes: Cliente[]
  catalogo: CatalogoItem[]
  // TODOS los registros (entradas + salidas, activos y pasados): se usan para
  // calcular qué huecos están ocupados y sugerir el óptimo al meter palets.
  todosRegistros: Registro[]
}

function useEntradaData() {
  const [data, setData] = useState<EntradaViewData>({ registros: [], clientes: [], catalogo: [], todosRegistros: [] })
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    // cache: 'no-store' para que el navegador NO use la respuesta cacheada y
    // siempre pida el catálogo actualizado al servidor (ítems nuevos, edits, etc.)
    const [rRes, cRes, catRes, allRes] = await Promise.all([
      fetch('/api/registros?filter=entrada', { cache: 'no-store' }),
      fetch('/api/clientes', { cache: 'no-store' }),
      fetch('/api/catalogo', { cache: 'no-store' }),
      fetch('/api/registros', { cache: 'no-store' })
    ])
    setData({
      registros: await rRes.json(),
      clientes: await cRes.json(),
      catalogo: await catRes.json(),
      todosRegistros: await allRes.json(),
    })
    setLoading(false)
  }, [])

  return { data, loadData, loading }
}

// ─── ComboInput: text input with dropdown suggestions from catalog ───
function ComboInput({
  value,
  onChange,
  suggestions,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filtered = value
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) { setOpen(false) }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); onChange(filtered[highlight]); setOpen(false); setHighlight(-1) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input value={value} onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1) }} onFocus={() => setOpen(true)} onKeyDown={handleKeyDown} placeholder={placeholder} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-[200px] overflow-auto">
          {filtered.map((s, i) => (
            <button key={s} className={`w-full text-left px-4 py-2.5 text-base transition-colors ${i === highlight ? 'bg-[#005bb5] text-white' : 'hover:bg-gray-50'} ${s.toLowerCase() === value.toLowerCase() ? 'font-bold' : ''}`} onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false) }} onMouseEnter={() => setHighlight(i)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── UbicacionCombo: input de UBICACIÓN que OFRECE los huecos del almacén ───
// V27: además de la lista, MAPA VISUAL del almacén: cada estantería/pared se
// dibuja con sus niveles/alturas (3º nivel arriba, suelo abajo), cada
// casilla = 1 palet, coloreada según estado (LIBRE/CON STOCK/LLENO/SIN
// LÍMITE). Clic en cualquier hueco = elegirlo. Conmutador Mapa/Lista.
function UbicacionCombo({
  value,
  onChange,
  huecos,
  optimo,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  huecos: HuecoInfo[]
  optimo: string
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [vista, setVista] = useState<'mapa' | 'lista'>('mapa')
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Filtro sobre la marcha (normalizado, sin acentos). Si lo escrito coincide
  // EXACTAMENTE con un hueco ya puesto, se muestra la lista COMPLETA: el
  // usuario quiere VER las demás opciones para poder cambiarlo.
  const q = normAlm(value)
  const exacto = !!q && huecos.some(h => normAlm(h.hueco) === q)
  const filtrados = !q || exacto ? huecos : huecos.filter(h => normAlm(h.hueco).includes(q))

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) { setOpen(false); setHighlight(-1) }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtrados.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtrados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); onChange(filtrados[highlight].hueco); setOpen(false); setHighlight(-1) }
    else if (e.key === 'Escape') { setOpen(false); setHighlight(-1) }
  }

  function elegir(hueco: string) {
    onChange(hueco)
    setOpen(false)
    setHighlight(-1)
  }

  // Chip de estado de cada hueco: LIBRE (verde) · N/M con sitio (ámbar) ·
  // LLENO (rojo) · N/∞ sin límite de altura (azul grisáceo)
  function chipHueco(h: HuecoInfo): { text: string; cls: string } {
    if (h.altura === 0) return h.ocupacion > 0
      ? { text: `${h.ocupacion}/∞`, cls: 'bg-sky-100 text-sky-700' }
      : { text: 'LIBRE', cls: 'bg-emerald-100 text-emerald-700' }
    if (h.ocupacion === 0) return { text: 'LIBRE', cls: 'bg-emerald-100 text-emerald-700' }
    if (h.ocupacion >= h.altura) return { text: `LLENO ${h.ocupacion}/${h.altura}`, cls: 'bg-red-100 text-red-600' }
    return { text: `${h.ocupacion}/${h.altura}`, cls: 'bg-amber-100 text-amber-700' }
  }

  // Filas a pintar en lista: cabecera de zona cuando cambia + huecos con índice plano
  type Fila = { tipo: 'header'; rack: string; esPared: boolean } | { tipo: 'hueco'; h: HuecoInfo; i: number }
  const filas: Fila[] = []
  let rackActual: string | null = null
  let idx = 0
  for (const h of filtrados) {
    if (h.rack !== rackActual) {
      filas.push({ tipo: 'header', rack: h.rack, esPared: h.tipo === 'pared' })
      rackActual = h.rack
    }
    filas.push({ tipo: 'hueco', h, i: idx++ })
  }

  // Racks para el mapa: agrupados por nombre en orden de aparición
  const racksMap = useMemo(() => {
    const m = new Map<string, HuecoInfo[]>()
    for (const h of filtrados) {
      if (!m.has(h.rack)) m.set(h.rack, [])
      m.get(h.rack)!.push(h)
    }
    return m
  }, [filtrados])

  const valueNorm = normAlm(value)

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-9 text-sm border-0 bg-transparent p-0 pr-6 focus:ring-0 focus:outline-none font-semibold"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { setOpen(o => !o); setHighlight(-1) }}
          aria-label="Ver ubicaciones del almacén"
          title="Ver las ubicaciones del almacén"
          className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-[#005bb5]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-[min(560px,94vw)] bg-white border border-gray-200 rounded-xl shadow-lg flex flex-col max-h-[78vh]">
          {/* Barra superior: óptimo (si aplica) + conmutador Mapa/Lista */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
            {optimo && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); elegir(optimo) }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors"
                title="Elegir el primer hueco libre del almacén"
              >
                <Zap className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                <span className="text-xs font-bold text-teal-800 font-mono">{optimo}</span>
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-teal-600 hidden xs:inline">óptimo</span>
              </button>
            )}
            <div className="ml-auto flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setVista('mapa')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${vista === 'mapa' ? 'bg-white text-[#005bb5] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Ver el almacén dibujado (niveles y casillas)"
              >
                <MapIcon className="h-3 w-3" /> Mapa
              </button>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setVista('lista')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${vista === 'lista' ? 'bg-white text-[#005bb5] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="Ver como lista con chips de estado"
              >
                <List className="h-3 w-3" /> Lista
              </button>
            </div>
          </div>

          {/* Cuerpo: Mapa o Lista */}
          <div className="overflow-auto p-2 min-h-[120px]">
            {filtrados.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-gray-400">Sin huecos que coincidan con «{value}»</div>
            )}

            {filtrados.length > 0 && vista === 'mapa' && (
              <div className="flex flex-col gap-2">
                {Array.from(racksMap.entries()).map(([rack, huecosRack]: [string, HuecoInfo[]]) => {
                  const esPared = huecosRack[0]?.tipo === 'pared'
                  const maxAltura = huecosRack.reduce((m, h) => Math.max(m, h.altura > 0 ? h.altura : 1), 0)
                  const palabra = esPared ? 'altura' : 'nivel'
                  const ordinal = esPared ? 'ª' : 'º'
                  const totalOcup = huecosRack.reduce((s, h) => s + h.ocupacion, 0)
                  const totalCap = huecosRack.reduce((s, h) => s + (h.altura > 0 ? h.altura : 0), 0)
                  return (
                    <div key={rack} className="rounded-lg border-2 border-gray-200 bg-gradient-to-b from-gray-50 to-white p-2">
                      <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
                        <Warehouse className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                        <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                          {esPared ? 'PARED' : 'ESTANTERÍA'} {rack}
                        </span>
                        {maxAltura >= 2 && (
                          <span className="text-[9px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-1.5 py-0.5">
                            {maxAltura} {esPared ? 'alturas' : 'niveles'}
                          </span>
                        )}
                        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${totalCap > 0 && totalOcup >= totalCap ? 'bg-red-50 text-red-700 border-red-300' : totalCap > 0 && totalOcup > 0 ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
                          {totalOcup}{totalCap > 0 ? `/${totalCap}` : '/∞'} palets
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <div className="min-w-full w-max">
                          {/* Filas: del nivel más alto al suelo (top-down) */}
                          {Array.from({ length: maxAltura }, (_, idx) => maxAltura - idx).map(j => (
                            <div key={j} className="flex items-stretch gap-1 mb-1 last:mb-0">
                              <div className="w-[3.5rem] shrink-0 flex flex-col items-end justify-center pr-1 text-right leading-tight">
                                <span className="text-[8px] font-extrabold text-gray-500 uppercase tracking-wide">
                                  {j === 1 ? 'Suelo' : `${j}${ordinal} ${palabra}`}
                                </span>
                              </div>
                              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${huecosRack.length}, minmax(38px, 1fr))` }}>
                                {huecosRack.map(h => {
                                  // Sin límite de altura → solo se dibuja en la fila del suelo
                                  if (h.altura > 0 && h.altura < j) {
                                    return <div key={h.hueco} className="rounded border-2 border-dashed border-gray-200/60 bg-gray-50/30 min-h-[2.2rem]" title="A esta altura no llega este hueco" />
                                  }
                                  if (h.altura === 0 && j !== 1) {
                                    return <div key={h.hueco} className="rounded border-2 border-dashed border-gray-200/60 bg-gray-50/30 min-h-[2.2rem]" title="Sin límite de altura" />
                                  }
                                  const ocupada = h.altura > 0 ? j <= h.ocupacion : h.ocupacion > 0
                                  const llena = h.altura > 0 && h.ocupacion >= h.altura
                                  const esSeleccionado = valueNorm && normAlm(h.hueco) === valueNorm
                                  const esOptimo = optimo && normAlm(h.hueco) === normAlm(optimo)
                                  // Clases por estado
                                  let cls = ''
                                  if (h.altura === 0) {
                                    // Sin límite: azul grisáceo
                                    cls = ocupada ? 'bg-sky-100 border-sky-300 text-sky-700' : 'bg-emerald-50 border-sky-200 text-sky-600'
                                  } else if (ocupada) {
                                    cls = llena ? 'bg-red-100 border-red-400 text-red-700' : 'bg-amber-100 border-amber-400 text-amber-800'
                                  } else {
                                    cls = 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400'
                                  }
                                  return (
                                    <button
                                      key={h.hueco}
                                      type="button"
                                      onMouseDown={e => { e.preventDefault(); elegir(h.hueco) }}
                                      title={`${h.hueco} · ${j === 1 ? 'suelo' : `${j}${ordinal} ${palabra}`} · ${ocupada ? 'ocupado' : 'libre'}${h.altura > 0 ? ` (${h.ocupacion}/${h.altura})` : ` (${h.ocupacion}/∞)`}`}
                                      className={`relative rounded-md border-2 p-0.5 min-h-[2.2rem] flex flex-col items-center justify-center transition-all ${cls} ${esSeleccionado ? 'ring-2 ring-[#005bb5] ring-offset-1' : ''} cursor-pointer`}
                                    >
                                      {/* Marca ⚡ en el óptimo (solo fila suelo para no duplicar) */}
                                      {esOptimo && j === 1 && (
                                        <span className="absolute -top-1.5 -right-1.5 bg-amber-400 rounded-full p-0.5 shadow-sm border border-white">
                                          <Zap className="h-2 w-2 text-white" />
                                        </span>
                                      )}
                                      <span className="text-[10px] font-extrabold leading-none">{h.pos}</span>
                                      {h.altura === 0 && h.ocupacion > 0 ? (
                                        <span className="text-[8px] font-bold leading-none mt-0.5">{h.ocupacion}/∞</span>
                                      ) : ocupada ? (
                                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 mt-0.5" />
                                      ) : (
                                        <span className="text-[7px] font-bold uppercase leading-none mt-0.5 opacity-80">libre</span>
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                          {/* Etiquetas inferiores: nombre completo del hueco */}
                          <div className="flex items-stretch gap-1 mt-1 pt-1 border-t border-gray-200">
                            <div className="w-[3.5rem] shrink-0 text-right pr-1 text-[8px] font-extrabold text-gray-400 uppercase tracking-wide">Hueco</div>
                            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${huecosRack.length}, minmax(38px, 1fr))` }}>
                              {huecosRack.map(h => {
                                const esSeleccionado = valueNorm && normAlm(h.hueco) === valueNorm
                                return (
                                  <div key={`lbl-${h.hueco}`} className={`text-center text-[9px] font-mono leading-none ${esSeleccionado ? 'text-[#005bb5] font-extrabold' : 'text-gray-400 font-bold'}`}>
                                    {rack}-{h.pos}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* Leyenda compacta */}
                <div className="flex flex-wrap items-center gap-2 px-1 pt-1 text-[9px] text-gray-500 font-semibold">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-50 border-2 border-emerald-300 inline-block" /> Libre</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-100 border-2 border-amber-400 inline-block" /> Con stock</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-100 border-2 border-red-400 inline-block" /> Lleno</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-100 border-2 border-sky-300 inline-block" /> Sin límite</span>
                  <span className="flex items-center gap-1"><Zap className="h-2.5 w-2.5 text-amber-500" /> Óptimo</span>
                  <span className="text-gray-400">· filas = niveles/alturas · casilla = 1 palet</span>
                </div>
              </div>
            )}

            {filtrados.length > 0 && vista === 'lista' && (
              <div className="flex flex-col">
                {filas.map((f, i) => f.tipo === 'header' ? (
                  <div key={`h-${i}`} className="px-3 pt-2 pb-1 text-[9px] font-extrabold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100 sticky top-0">
                    {f.rack} · {f.esPared ? 'pared' : 'estantería'}
                  </div>
                ) : (
                  <button
                    key={f.h.hueco}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); elegir(f.h.hueco) }}
                    onMouseEnter={() => setHighlight(f.i)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${f.i === highlight ? 'bg-[#005bb5] text-white' : 'hover:bg-gray-50'} ${exacto && normAlm(f.h.hueco) === q ? 'font-bold' : ''}`}
                  >
                    <span className="text-sm font-mono">{f.h.hueco}</span>
                    {optimo === f.h.hueco && <Zap className="h-3 w-3 text-amber-500 shrink-0" />}
                    <span className={`ml-auto text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${chipHueco(f.h).cls}`}>{chipHueco(f.h).text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Permission check helpers
const SCREEN_PERMS = ['entrada', 'entrada.pasarRegistros', 'entrada.grilla', 'registros', 'clientes', 'catalogo', 'facturas', 'backup'] as const

function parsePerms(permissions: string): string[] {
  if (!permissions || permissions.trim() === '') return []
  try { const p = JSON.parse(permissions); return Array.isArray(p) ? p.filter((x: string) => (SCREEN_PERMS as readonly string[]).includes(x)) : [] } catch { return [] }
}

function canTransfer(role: string, permissions: string): boolean {
  if (role === 'admin' || role === 'superadmin') return true
  const perms = parsePerms(permissions)
  if (perms.length === 0) return false
  return perms.includes('entrada.pasarRegistros')
}

function canSeePrices(role: string): boolean {
  return role === 'admin' || role === 'superadmin'
}

function canUseGrilla(role: string, permissions: string): boolean {
  if (role === 'admin' || role === 'superadmin') return true
  const perms = parsePerms(permissions)
  if (perms.length === 0) return false
  return perms.includes('entrada.grilla')
}

export function EntradaView({ userRole = 'user', userPermissions = '' }: { userRole?: string; userPermissions?: string }) {
  const { data, loadData, loading } = useEntradaData()
  const { config, update } = useConfig()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [showTransferSettings, setShowTransferSettings] = useState(false)
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTransferDateRef = useRef<string>('')

  const fieldDefs = config?.fieldsEntrada || DEFAULT_FIELDS_ENTRADA
  // Force cliente field HIDDEN in Entrada view: it's auto-detected from catalog
  // based on c1+c2 selection. Cliente is only visible in the Registros view.

  function normStr(s: string): string {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  }

  const transferMode = config?.transferMode || 'auto'
  const transferTime = config?.transferTime || '00:00'

  const [localTransferMode, setLocalTransferMode] = useState(transferMode)
  const [localTransferTime, setLocalTransferTime] = useState(transferTime)

  useEffect(() => { setLocalTransferMode(transferMode); setLocalTransferTime(transferTime) }, [transferMode, transferTime])

  // Core fields form state — must be declared BEFORE any useMemo that references them
  const [fecha, setFecha] = useState(todayISO())
  const [clienteId, setClienteId] = useState('')
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [cant, setCant] = useState('1')
  const [obs, setObs] = useState('')

  // Custom fields form state
  const [customValues, setCustomValues] = useState<Record<string, string>>({})

  // ─── HUECO ÓPTIMO AUTOMÁTICO ───────────────────────────────────────────
  // Con las estanterías configuradas (STOCK ALMACÉN), al meter una ENTRADA
  // PALET el campo UBICACIÓN se rellena solo con el primer hueco libre.
  // La configuración se comparte vía '@/lib/almacen' (localStorage).
  const [almacenCfg, setAlmacenCfg] = useState<EstanteriaCfg[]>([])
  const autoUbicRef = useRef<string>('')      // último hueco asignado automáticamente
  const ubicClearedRef = useRef(false)        // el usuario vació la ubicación a mano → no rellenar

  // Refresca la configuración cada vez que se recargan los datos (la pestaña
  // puede recuperar el foco tras editarla en STOCK ALMACÉN en otra pestaña).
  // V25: la config ahora vive en el SERVIDOR (compartida con el móvil) —
  // local como arranque inmediato y async la versión fresca del servidor.
  useEffect(() => {
    setAlmacenCfg(loadAlmacenCfg())
    let cancelado = false
    fetchAlmacenCfg().then(cfg => { if (!cancelado && cfg.length > 0) setAlmacenCfg(cfg) }).catch(() => {})
    return () => { cancelado = true }
  }, [data])

  // Campo UBICACIÓN: cualquier campo personalizado cuyo nombre/clave contenga
  // "ubicación" (igual criterio que el motor de stock para leerlo luego).
  const ubicField = useMemo(
    () => fieldDefs.find(f => f.isCustom && /ubicac/i.test(normAlm(`${f.key} ${f.label}`))) || null,
    [fieldDefs]
  )
  const ubicKey = ubicField?.key || ''

  // Palets que hay ahora mismo en cada hueco (con CUENTA, no solo "hay/no
  // hay"): permite respetar las ALTURAS por hueco al sugerir el óptimo —
  // una columna con 1/3 palets sigue admitiendo 2 más; una llena ya no.
  const ocupadas = useMemo(() => contadoresHuecos(data.todosRegistros), [data.todosRegistros])

  // V26: listado de TODOS los huecos configurados (con su estado) y el hueco
  // óptimo actual — lo OFRECE el desplegable de UBICACIÓN al meter palets.
  const huecosLista = useMemo(() => listadoHuecos(almacenCfg, ocupadas), [almacenCfg, ocupadas])
  const huecoOptimoActual = useMemo(() => (almacenCfg.length > 0 ? huecoOptimo(almacenCfg, ocupadas)?.hueco || '' : ''), [almacenCfg, ocupadas])

  const esPalet = esC2EntradaPalet(c2)

  // Al cambiar el CONCEPTO 2 se reactiva la asignación automática
  useEffect(() => { ubicClearedRef.current = false }, [c2])

  // Asignación: ENTRADA PALET + campo UBICACIÓN vacío → primer hueco libre
  useEffect(() => {
    if (!ubicKey || !esPalet || editingId || ubicClearedRef.current) return
    const val = String(customValues[ubicKey] || '').trim()
    if (val) return
    const opt = huecoOptimo(almacenCfg, ocupadas)
    if (!opt) return
    autoUbicRef.current = opt.hueco
    setCustomValue(ubicKey, opt.hueco)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicKey, esPalet, editingId, almacenCfg, ocupadas])

  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // ─── ETIQUETA QR (desde el origen) ────────────────────────────────
  // Al guardar una ENTRADA PALET se abre el diálogo con su etiqueta QR
  // para imprimir y pegar en el palet. En STOCK ALMACÉN, "Escanear QR"
  // la lee y localiza el palet en el mapa.
  const [qrOpen, setQrOpen] = useState(false)
  const [qrEtiquetas, setQrEtiquetas] = useState<EtiquetaPalet[]>([])

  // Interruptor "impresión QR al guardar": compartido con la grilla (misma
  // clave de localStorage). Se lee al montar; al volver del modo grilla se
  // relee más abajo (depende de grillaMode, declarado después).
  const [qrAuto, setQrAutoState] = useState(true)
  useEffect(() => { setQrAutoState(isQrAuto()) }, [])
  function toggleQrAuto() {
    const v = !qrAuto
    setQrAutoState(v)
    setQrAuto(v)
  }

  function abrirQr(etiquetas: EtiquetaPalet[]) {
    if (etiquetas.length === 0) return
    setQrEtiquetas(etiquetas)
    setQrOpen(true)
  }

  // Etiqueta desde una fila de la tabla (reimprimir cuando se quiera).
  // getIdent/getUbicacion devuelven el texto normalizado (minúsculas): se
  // pasa a mayúsculas para la etiqueta — la búsqueda del escáner compara
  // con normAlm por ambos lados, así que las mayúsculas no afectan.
  function abrirQrDesdeRegistro(r: Registro) {
    abrirQr([{
      ident: getIdent(r).toUpperCase(),
      ubicacion: getUbicacion(r).toUpperCase(),
      cliente: r.cliente || '',
      fecha: r.fecha,
      cant: Math.max(1, r.cant || 1),
    }])
  }

  useEffect(() => { loadData() }, [loadData])

  // Refrescar datos cuando la pestaña recupera el foco.
  // Así, si el usuario añade un item en Catálogo y vuelve a Entrada, lo verá sin
  // tener que recargar la página. Igual patrón que en facturas-view.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        loadData()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    // Refresco periódico cada 30s por si otro usuario añade items al catálogo
    // desde otra sesión (multi-tenant: dentro del mismo tenant).
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadData()
    }, 30 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(interval)
    }
  }, [loadData])

  const { clientes } = data

  const clienteVisible = fieldDefs.some(f => f.key === 'cliente' && f.visible)

  // Auto-detect client from catalog when field is hidden and c1+c2 are selected.
  const detectedCliente = useMemo(() => {
    if (clienteVisible || clienteId || !c1 || !c2) return null
    const c1n2 = normStr(c1)
    const c2n2 = normStr(c2)
    const item = data.catalogo.find(x => normStr(x.c1) === c1n2 && normStr(x.c2) === c2n2 && x.clienteId)
    if (!item) return null
    const cli = data.clientes.find(c => c.id === item.clienteId)
    return cli ? { id: cli.id, nombre: cli.nombre } : null
  }, [data.catalogo, data.clientes, clienteVisible, clienteId, c1, c2])

  // Effective client for filtering client-specific fields. Either explicitly
  // selected (when cliente field is visible) or auto-detected from c1+c2.
  const effectiveClientId = clienteId || detectedCliente?.id || ''

  // visibleFields: respect config visibility (including 'cliente' if admin enabled it)
  // and apply client-specific filter so exclusive fields only show for the right client.
  const visibleFields = useMemo(
    () => fieldDefs.filter(f => f.visible && fieldAppliesToClient(f, effectiveClientId || null)),
    [fieldDefs, effectiveClientId]
  )

  const isVisible = (key: string) => visibleFields.some(f => f.key === key)
  const getField = (key: string) => fieldDefs.find(f => f.key === key)
  const userCanTransfer = canTransfer(userRole, userPermissions)
  const userCanSeePrices = canSeePrices(userRole)
  const userCanUseGrilla = canUseGrilla(userRole, userPermissions)
  const [grillaMode, setGrillaMode] = useState(false)

  // Al volver del modo grilla, releer el interruptor QR (puede haberse
  // cambiado allí — comparten la misma clave de localStorage).
  useEffect(() => { setQrAutoState(isQrAuto()) }, [grillaMode])

  // ─── Precio / importe helpers (mirror of Registros view) ───
  function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
    let it = data.catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && x.clienteId === cliId)
    if (!it) it = data.catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val && !x.clienteId)
    if (!it) it = data.catalogo.find(x => x.c1 === c1Val && x.c2 === c2Val)
    return it ? Number(it.final) || 0 : 0
  }
  function getPrecio(r: Registro): number {
    return r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)
  }
  // ─── Cell value formatter (mirror of Registros view) ───
  function getCellValue(r: Registro, field: FieldDef): React.ReactNode {
    const pu = getPrecio(r)
    const imp = pu * r.cant
    const d = new Date(r.fecha)
    const customData = parseCustomData((r as Record<string, unknown>).customData as string || '')
    if (field.isCustom) return String(customData[field.key] || '')
    switch (field.key) {
      case 'fecha': return fmtDate(r.fecha)
      case 'mes': return d.getMonth() + 1
      case 'semana': return getISOWeek(r.fecha)
      case 'cliente': return r.cliente
      case 'c1': return r.c1
      case 'c2': return r.c2
      case 'cantidad': return r.cant
      case 'precioUnitario': return fmtCurrency(pu)
      case 'importe': return fmtCurrency(imp)
      case 'observaciones': return r.obs
      default: return ''
    }
  }

  // Auto-transfer timer — only runs if user has transfer permission
  useEffect(() => {
    if (transferMode !== 'auto') return
    if (!userCanTransfer) return
    function checkAutoTransfer() {
      const now = new Date()
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const todayStr = todayISO()
      if (lastTransferDateRef.current === todayStr) return
      if (currentTime === transferTime) { lastTransferDateRef.current = todayStr; handleTransfer() }
    }
    checkAutoTransfer()
    autoTimerRef.current = setInterval(checkAutoTransfer, 30000)
    return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferMode, transferTime, userCanTransfer])

  // Cascading filters based on catalog + selections.
  // normStr was defined earlier (above detectedCliente) so it can be reused.

  // C1 options: if client field is visible and a client is selected, filter by client
  // If client field is hidden, show ALL (auto-detect will resolve later)
  const c1Options = [...new Set(
    data.catalogo
      .filter(x => !clienteVisible || !clienteId || !x.clienteId || x.clienteId === clienteId)
      .map(x => x.c1)
  )].sort()

  // C2 options filtered by selected client + C1 (normalizado para evitar mismatch por espacios/mayús)
  const c1n = normStr(c1)
  const c2Options = c1
    ? [...new Set(
        data.catalogo
          .filter(x => (!clienteVisible || !clienteId || !x.clienteId || x.clienteId === clienteId) && normStr(x.c1) === c1n)
          .map(x => x.c2)
      )].sort()
    : [...new Set(data.catalogo.map(x => x.c2))].sort()

  const allC2Options = [...new Set(data.catalogo.map(x => x.c2))].sort()

  // Auto-price: works with or without client selected
  const autoPrice = useMemo(() => {
    if (!c1 || !c2) return null
    const c1n2 = normStr(c1)
    const c2n2 = normStr(c2)
    if (clienteId) {
      let item = data.catalogo.find(x => x.clienteId === clienteId && normStr(x.c1) === c1n2 && normStr(x.c2) === c2n2)
      if (!item) item = data.catalogo.find(x => !x.clienteId && normStr(x.c1) === c1n2 && normStr(x.c2) === c2n2)
      if (!item) item = data.catalogo.find(x => normStr(x.c1) === c1n2 && normStr(x.c2) === c2n2)
      return item ? Number(item.final) || 0 : null
    } else {
      const item = data.catalogo.find(x => normStr(x.c1) === c1n2 && normStr(x.c2) === c2n2)
      return item ? Number(item.final) || 0 : null
    }
  }, [data.catalogo, clienteId, c1, c2])

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  function setCustomValue(key: string, value: string) {
    setCustomValues(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    // ALL visible fields in Entrada are mandatory (user requirement),
    // EXCEPT 'observaciones' which stays optional.
    for (const f of visibleFields) {
      if (f.key === 'observaciones') continue  // optional
      let empty = false
      switch (f.key) {
        case 'fecha': empty = !fecha; break
        case 'cliente': empty = !clienteId; break
        case 'c1': empty = !c1; break
        case 'c2': empty = !c2; break
        case 'cantidad': empty = !cant; break
        default:
          if (f.isCustom) empty = !String(customValues[f.key] || '').trim()
          else empty = false
      }
      if (empty) {
        showStatus('err', `El campo "${f.label}" es obligatorio`)
        return
      }
    }
    // Resolve client: if field is hidden, auto-detect from catalog
    let effectiveClienteId = clienteId
    let effectiveClienteName = ''
    if (effectiveClienteId) {
      const cli = clientes.find(c => c.id === effectiveClienteId)
      effectiveClienteName = cli?.nombre || ''
    } else if (detectedCliente) {
      effectiveClienteId = detectedCliente.id
      effectiveClienteName = detectedCliente.nombre
    }
    const customDataStr = serializeCustomData(customValues)
    const currentPrice = autoPrice || 0
    // Etiqueta QR del palet: se prepara ANTES de limpiar el formulario.
    // Codifica el lote/nº palet (o la ubicación si no hay lote).
    const etiquetaPalet: EtiquetaPalet | null = esPalet ? {
      ident: identDeCustomValues(customValues),
      ubicacion: ubicKey ? String(customValues[ubicKey] || '').trim() : '',
      cliente: effectiveClienteName,
      fecha,
      cant: Math.max(1, Number(cant) || 1),
    } : null
    const body = { fecha, clienteId: effectiveClienteId || null, cliente: effectiveClienteName, c1, c2, cant: Number(cant), obs, customData: customDataStr, precioUnitario: currentPrice }

    if (editingId) {
      const res = await fetch('/api/registros', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...body }) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showStatus('err', `Error al actualizar: ${err.error || res.statusText}`)
        return
      }
      setEditingId(null)
      showStatus('ok', 'Entrada actualizada ✓')
    } else {
      const res = await fetch('/api/registros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showStatus('err', `Error al guardar: ${err.error || res.statusText}`)
        return
      }
      showStatus('ok', 'Guardado en Registros ✓')
      // Etiqueta QR: se abre justo tras guardar el palet (imprimible),
      // salvo que el usuario haya apagado el interruptor de impresión QR.
      if (etiquetaPalet && qrAuto) abrirQr([etiquetaPalet])
    }
    setC1(''); setC2(''); setCant('1'); setObs(''); setCustomValues({})
    autoUbicRef.current = ''
    ubicClearedRef.current = false
    triggerBackup()
    loadData()
  }

  function handleEdit(r: Registro) {
    setEditingId(r.id)
    setFecha(r.fecha); setClienteId(r.clienteId); setC1(r.c1); setC2(r.c2); setCant(String(r.cant)); setObs(r.obs)
    // Load custom data
    const cd = parseCustomData((r as Record<string, unknown>).customData as string || '')
    setCustomValues(cd as Record<string, string>)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar entrada?')) return
    await fetch(`/api/registros?id=${id}`, { method: 'DELETE' })
    showStatus('ok', 'Eliminada')
    triggerBackup()
    loadData()
  }

  function handleCancelEdit() {
    setEditingId(null); setFecha(todayISO()); setClienteId(''); setC1(''); setC2(''); setCant('1'); setObs(''); setCustomValues({})
    autoUbicRef.current = ''
    ubicClearedRef.current = false
  }

  async function handleTransfer() {
    if (data.registros.length === 0) return
    setTransferring(true)
    try {
      const res = await fetch('/api/registros/transfer', { method: 'POST' })
      const result = await res.json()
      showStatus('ok', `${result.transferred} entrada(s) pasadas al registro ✓`)
      triggerBackup()
      loadData()
    } catch { showStatus('err', 'Error al transferir') }
    setTransferring(false)
  }

  async function handleSaveTransferSettings() {
    await update({ transferMode: localTransferMode, transferTime: localTransferTime })
    showStatus('ok', 'Ajustes de transferencia guardados ✓')
    setShowTransferSettings(false)
    triggerBackup()
  }

  const activeEntries = data.registros

  // Render a dynamic field input based on FieldDef
  function renderFieldInput(field: FieldDef) {
    if (field.key === 'fecha') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    if (field.key === 'cliente') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2">
            <Select value={clienteId} onValueChange={v => { setClienteId(v); setC1(''); setC2('') }}>
              <SelectTrigger className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 shadow-none"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )
    }
    if (field.key === 'c1') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-visible">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><ComboInput value={c1} onChange={v => {
            setC1(v)
            // AUTO-DESCRIPCIÓN: al poner la REFERENCIA (c1), si el catálogo
            // tiene una única DESCRIPCIÓN (c2) para esa c1, se rellena sola.
            // Si hay varias c2 distintas para esa c1, se limpia y el usuario
            // elige. Filtro: si el campo CLIENTE está visible y hay cliente
            // seleccionado, se respeta el ámbito (igual que c2Options).
            const vn = normStr(v)
            const c2matches = [...new Set(
              data.catalogo
                .filter(x => (!clienteVisible || !clienteId || !x.clienteId || x.clienteId === clienteId) && normStr(x.c1) === vn)
                .map(x => x.c2)
                .filter(Boolean)
            )].sort()
            setC2(c2matches.length === 1 ? c2matches[0] : '')
          }} suggestions={c1Options} placeholder="Escribe o selecciona..." label={field.label} /></div>
        </div>
      )
    }
    if (field.key === 'c2') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-visible">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><ComboInput value={c2} onChange={setC2} suggestions={c2Options.length > 0 ? c2Options : allC2Options} placeholder="Escribe o selecciona..." label={field.label} /></div>
        </div>
      )
    }
    if (field.key === 'cantidad') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><Input type="number" step="any" value={cant} onChange={e => setCant(e.target.value)} min="0" className="h-9 text-sm text-center border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    if (field.key === 'observaciones') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 pt-2 pb-0.5"><Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}</Label></div>
          <div className="px-3 pb-2"><Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional..." className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" /></div>
        </div>
      )
    }
    // Custom fields
    if (field.isCustom) {
      const esUbic = field.key === ubicKey
      const ofreceHuecos = esUbic && almacenCfg.length > 0
      return (
        <div className={`bg-white rounded-lg shadow-sm border ${ofreceHuecos ? 'overflow-visible' : 'overflow-hidden'} ${esUbic && esPalet ? 'border-teal-300' : 'border-gray-100'}`}>
          <div className="px-3 pt-2 pb-0.5 flex items-center justify-between gap-2">
            <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{field.label}{field.required ? ' *' : ''}</Label>
            {esUbic && esPalet && <span className="text-[9px] font-bold text-teal-600 uppercase tracking-wider whitespace-nowrap">⚡ hueco auto</span>}
          </div>
          <div className="px-3 pb-2">
            {field.type === 'textarea' ? (
              <textarea value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="w-full h-16 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none resize-none" />
            ) : field.type === 'date' ? (
              <Input type="date" value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
            ) : field.type === 'number' ? (
              <Input type="number" step="0.01" value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
            ) : ofreceHuecos ? (
              // V26: el campo UBICACIÓN OFRECE las ubicaciones del almacén
              // (desplegable con todos los huecos y su estado). Sigue siendo
              // editable a mano y mantiene la asignación automática (⚡).
              <UbicacionCombo
                value={customValues[field.key] || ''}
                onChange={v => {
                  const antes = String(customValues[field.key] || '').trim()
                  // El usuario vació el campo a mano → respetar su decisión (no rellenar)
                  if (antes && !v.trim()) ubicClearedRef.current = true
                  if (v.trim()) ubicClearedRef.current = false
                  setCustomValue(field.key, v)
                }}
                huecos={huecosLista}
                optimo={esPalet ? huecoOptimoActual : ''}
                placeholder={field.placeholder || 'Elige o escribe el hueco…'}
              />
            ) : esUbic ? (
              <Input
                value={customValues[field.key] || ''}
                onChange={e => {
                  const antes = String(customValues[field.key] || '').trim()
                  const v = e.target.value
                  // El usuario vació el campo a mano → respetar su decisión (no rellenar)
                  if (antes && !v.trim()) ubicClearedRef.current = true
                  if (v.trim()) ubicClearedRef.current = false
                  setCustomValue(field.key, v)
                }}
                placeholder={field.placeholder || field.label}
                className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none font-semibold"
              />
            ) : (
              <Input value={customValues[field.key] || ''} onChange={e => setCustomValue(field.key, e.target.value)} placeholder={field.placeholder || field.label} className="h-9 text-sm border-0 bg-transparent p-0 focus:ring-0 focus:outline-none" />
            )}
          </div>
          {esUbic && esPalet && (
            <div className="px-3 pb-2 pt-0 border-t border-dashed border-teal-100 bg-teal-50/40">
              {chipUbicacion()}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  // Línea de estado bajo el campo UBICACIÓN: hueco asignado automáticamente,
  // sugerencia, o aviso de ocupado/fuera de configuración.
  function chipUbicacion(): React.ReactNode {
    if (!ubicKey) return null
    const val = String(customValues[ubicKey] || '').trim()
    const usar = (h: string) => { ubicClearedRef.current = false; setCustomValue(ubicKey, h) }
    if (almacenCfg.length === 0) {
      return (
        <span className="text-[10px] text-gray-400 leading-tight">
          Sin estanterías configuradas — defínelas en <b>Stock Almacén</b> y el hueco se asignará solo
        </span>
      )
    }
    if (!val) {
      const opt = huecoOptimo(almacenCfg, ocupadas)
      if (!opt) return <span className="text-[10px] text-red-600 font-semibold">Almacén lleno: no queda ningún hueco libre</span>
      return (
        <span className="text-[10px] text-teal-700 leading-tight">
          Hueco óptimo: <b>{opt.hueco}</b>
          <button type="button" onClick={() => usar(opt.hueco)} className="ml-1 underline font-semibold hover:text-teal-900">usar</button>
        </span>
      )
    }
    const esAuto = !!autoUbicRef.current && normAlm(val) === normAlm(autoUbicRef.current)
    if (esAuto) {
      return <span className="text-[10px] text-teal-600 font-semibold leading-tight">⚡ {val} — primer hueco libre (asignado solo)</span>
    }
    const estado = clasificarUbicacion(almacenCfg, ocupadas, val)
    if (estado === 'ocupado') {
      return <span className="text-[10px] text-red-600 font-semibold leading-tight">{val} · columna llena / ya hay stock</span>
    }
    if (estado === 'con-stock') {
      return <span className="text-[10px] text-amber-600 font-semibold leading-tight">{val} · ya hay stock — aún queda sitio en la columna</span>
    }
    if (estado === 'libre') {
      return <span className="text-[10px] text-emerald-600 font-semibold leading-tight">{val} · libre</span>
    }
    // No está en la configuración: si es (o empieza por) una estantería,
    // sugerir su primer hueco libre
    const opt = huecoOptimo(almacenCfg, ocupadas, val)
    if (opt && normAlm(opt.hueco) !== normAlm(val)) {
      return (
        <span className="text-[10px] text-gray-500 leading-tight">
          Sugerido: <b className="text-teal-700">{opt.hueco}</b>
          <button type="button" onClick={() => usar(opt.hueco)} className="ml-1 underline font-semibold text-teal-700 hover:text-teal-900">usar</button>
        </span>
      )
    }
    return <span className="text-[10px] text-gray-400 leading-tight">{val} no está en la configuración del almacén</span>
  }

  // Get custom field values from a registro for display
  function getCustomFieldDisplay(r: Registro, field: FieldDef): string {
    if (!field.isCustom) return ''
    const cd = parseCustomData((r as Record<string, unknown>).customData as string || '')
    return String(cd[field.key] || '')
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ─── Mode toggle: Normal / Grilla ─── */}
      {userCanUseGrilla && (
        <div className="flex-shrink-0 flex items-center justify-end gap-2 pb-2">
          <div className="inline-flex rounded-lg border bg-white p-0.5 shadow-sm">
            <button
              onClick={() => setGrillaMode(false)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${!grillaMode ? 'bg-[#005bb5] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Normal
            </button>
            <button
              onClick={() => setGrillaMode(true)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1 ${grillaMode ? 'bg-[#2bb24c] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Table className="h-3.5 w-3.5" /> Grilla masiva
            </button>
          </div>
        </div>
      )}

      {grillaMode && userCanUseGrilla ? (
        <EntradaGrilla />
      ) : (
      <>

      {/* ─── FIXED HEADER (form) ─── */}
      <div className="flex-shrink-0 space-y-2 pb-2">
        {statusMsg && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {statusMsg.text}
          </div>
        )}

        {editingId && (
          <div className="flex items-center justify-between bg-amber-100 border border-amber-300 rounded-xl px-4 py-2.5">
            <span className="text-sm font-bold text-amber-800">Modo Edición</span>
            <Button onClick={handleCancelEdit} size="sm" variant="outline" className="h-9 rounded-full"><X className="h-4 w-4 mr-1" /> Cancelar</Button>
          </div>
        )}

        {/* Transfer Mode Banner — only for users with transfer permission */}
        {userCanTransfer && (
        <div className={`rounded-xl overflow-hidden border ${transferMode === 'auto' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
          <button onClick={() => setShowTransferSettings(!showTransferSettings)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 shrink-0 text-gray-400" />
              {transferMode === 'auto' ? <span className="text-blue-700"><Clock className="h-4 w-4 inline mr-1" />Auto-transferencia a las <b>{transferTime}</b></span> : <span className="text-amber-700"><Zap className="h-4 w-4 inline mr-1" />Transferencia manual</span>}
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showTransferSettings ? 'rotate-180' : ''}`} />
          </button>
          {showTransferSettings && (
            <div className="px-4 pb-3 pt-1 border-t border-gray-200/50 space-y-3 bg-white/60">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase">Modo de transferencia</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setLocalTransferMode('auto')} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm transition-all ${localTransferMode === 'auto' ? 'border-[#005bb5] bg-blue-50 text-[#005bb5] font-bold' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}><Clock className="h-4 w-4" /> Automático</button>
                  <button onClick={() => setLocalTransferMode('manual')} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-sm transition-all ${localTransferMode === 'manual' ? 'border-[#2bb24c] bg-green-50 text-[#2bb24c] font-bold' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}><Zap className="h-4 w-4" /> Manual</button>
                </div>
              </div>
              {localTransferMode === 'auto' && <div><Label className="text-xs font-bold text-slate-600 uppercase">Hora</Label><Input type="time" value={localTransferTime} onChange={e => setLocalTransferTime(e.target.value)} className="w-36 text-base font-mono mt-1" /></div>}
              <button onClick={handleSaveTransferSettings} className="w-full h-10 rounded-lg bg-[#005bb5] hover:bg-[#003d7a] text-white text-sm font-bold flex items-center justify-center gap-1.5"><Save className="h-4 w-4" /> GUARDAR AJUSTES</button>
            </div>
          )}
        </div>
        )}

        {/* Dynamic field inputs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {visibleFields.map(field => (
            <div key={field.key}>{renderFieldInput(field)}</div>
          ))}
        </div>

        {/* Auto-price indicator — only for admin/superadmin */}
        {userCanSeePrices && autoPrice !== null && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Precio del catálogo</p>
              <p className="text-xl font-extrabold text-green-700">{autoPrice.toLocaleString('es-ES', { minimumFractionDigits: 2 })} {config?.currency || '€'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-500">Total</p>
              <p className="text-lg font-bold text-green-700">{(autoPrice * (Number(cant) || 1)).toLocaleString('es-ES', { minimumFractionDigits: 2 })} {config?.currency || '€'}</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button onClick={handleSave} disabled={loading} className="flex-1 h-12 rounded-xl bg-[#2bb24c] hover:bg-[#23963e] active:scale-[0.98] transition-all text-white text-sm font-bold shadow-md shadow-green-200/50 disabled:opacity-50 flex items-center justify-center gap-2">
            <Save className="h-4 w-4" />{editingId ? 'ACTUALIZAR' : 'GUARDAR'}
          </button>
          {userCanTransfer && transferMode === 'manual' && activeEntries.length > 0 && (
            <button onClick={handleTransfer} disabled={transferring} className="flex-1 h-12 rounded-xl bg-[#005bb5] hover:bg-[#003d7a] active:scale-[0.98] transition-all text-white text-sm font-bold shadow-md shadow-blue-200/50 disabled:opacity-50 flex items-center justify-center gap-2">
              <ArrowRightCircle className="h-4 w-4" />{transferring ? 'Transfiriendo...' : 'PASAR AL REGISTRO'}
            </button>
          )}
          {/* Interruptor: ¿abrir la etiqueta QR al guardar un palet? */}
          <button
            type="button"
            onClick={toggleQrAuto}
            aria-pressed={qrAuto}
            title={qrAuto
              ? 'ACTIVADO: al guardar una ENTRADA PALET se abre su etiqueta QR para imprimir. Clic para desactivar.'
              : 'DESACTIVADO: no se abre la etiqueta QR al guardar (se puede reimprimir con el botón QR de cada fila). Clic para activar.'}
            className={`h-12 px-3.5 rounded-xl border-2 transition-all flex flex-col items-center justify-center leading-tight ${
              qrAuto
                ? 'border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100'
                : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide">
              <Printer className="h-3.5 w-3.5" /> QR al guardar
            </span>
            <span className={`text-[10px] font-bold ${qrAuto ? 'text-teal-600' : 'text-gray-400'}`}>
              {qrAuto ? 'ACTIVADA' : 'DESACTIVADA'}
            </span>
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 bg-white rounded-lg px-4 py-2.5 shadow-sm text-sm font-bold border items-center">
          <span>Entradas:<b className="text-[#005bb5] ml-1">{activeEntries.length}</b></span>
          <span className="ml-auto text-[10px] font-mono bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">TABLE-v5</span>
        </div>
      </div>

      {/* ─── SCROLLABLE TABLE (mirrors Registros view) ─── */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border shadow-sm flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-[#005bb5] text-white">
                {visibleFields.map(f => (
                  <th key={f.key} className="p-2.5 text-left font-semibold border-b border-[#004a94] bg-[#005bb5]">{f.label}</th>
                ))}
                <th className="p-2.5 text-left font-semibold border-b border-[#004a94] bg-[#005bb5]">Acc.</th>
              </tr>
            </thead>
            <tbody>
              {activeEntries.map(r => (
                <tr key={r.id} className={`border-b transition-colors ${editingId === r.id ? 'bg-amber-50 ring-2 ring-amber-200' : 'hover:bg-blue-50/50'}`}>
                  {visibleFields.map(f => (
                    <td key={f.key} className={`p-2 ${f.key === 'importe' ? 'font-bold text-[#005bb5]' : f.key === 'precioUnitario' ? 'text-gray-600' : f.key === 'observaciones' ? 'text-gray-500 text-xs' : ''}`}>
                      {getCellValue(r, f)}
                    </td>
                  ))}
                  <td className="p-2 whitespace-nowrap">
                    {esC2EntradaPalet(r.c2) && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-teal-600 hover:bg-teal-50" onClick={() => abrirQrDesdeRegistro(r)} title="Etiqueta QR del palet (imprimir)">
                        <QrCode className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
              {activeEntries.length === 0 && (
                <tr>
                  <td colSpan={visibleFields.length + 1} className="p-8 text-center text-gray-400">
                    {loading ? 'Cargando...' : 'Sin entradas activas'}
                    {activeEntries.length === 0 && !loading && (
                      <div className="text-xs text-gray-300 mt-1">Las entradas se transferirán al registro {transferMode === 'auto' ? 'automáticamente' : 'con el botón "Pasar al registro"'}</div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Fixed footer totals — only when entries exist */}
        {activeEntries.length > 0 && (
          <div className="flex-shrink-0 bg-gray-100 font-bold text-sm px-2.5 py-2.5 border-t flex items-center gap-4">
            <span>TOTALES</span>
            <span>Líneas: <span className="text-[#005bb5]">{activeEntries.length}</span></span>
            <span>Cantidad: <span className="text-[#005bb5]">{activeEntries.reduce((s, r) => s + r.cant, 0)}</span></span>
            {userCanSeePrices && (
              <span>Importe: <span className="text-[#005bb5]">{fmtCurrency(activeEntries.reduce((s, r) => s + getPrecio(r) * r.cant, 0))}</span></span>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {/* Diálogo de etiqueta QR — se abre al guardar una ENTRADA PALET */}
      <QrEtiquetaDialog open={qrOpen} onOpenChange={setQrOpen} etiquetas={qrEtiquetas} />
    </div>
  )
}
