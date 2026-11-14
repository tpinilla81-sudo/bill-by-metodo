'use client'

// V29.80 — AGENDA DIARIA
// El usuario navega por días y DICTA POR VOZ (o teclea) lo que va haciendo;
// el agente IA va rellenando la agenda directamente (POST /api/agenda-diaria/
// interpretar). Dos apartados como el "Registro Diario" original:
//   - LOGÍSTICA: servicios del día agrupados en CARGAS (1, 2...) con subtotal
//     por carga y Total Día.
//   - FACTURACIÓN: entregas agrupadas por CLIENTE con total y recuentos por
//     destino (lo de antes de la "/").
// Cada línea es editable y borrable; también se pueden añadir a mano.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mic, MicOff, Sparkles, Trash2, Plus, Loader2, Pencil, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

type AgendaDiaLine = {
  id: string
  fecha: string
  tipo: 'logistica' | 'facturacion'
  carga: number
  cliente: string
  concepto: string
  nota: string
  cantidad: number
  unidad: string
  importe: number
  orden: number
}

type FormLine = {
  mode: 'edit' | 'add'
  id?: string
  fecha: string
  tipo: 'logistica' | 'facturacion'
  carga: number
  cliente: string
  concepto: string
  nota: string
  cantidad: number
  unidad: string
  importe: number
  // V29.82 — texto crudo de importe/cantidad mientras se edita: acepta coma
  // decimal («9,5») como escribe un usuario español sin perder dígitos
  importeTxt?: string
  cantidadTxt?: string
}

const EMPTY_FORM: (fecha: string, tipo: 'logistica' | 'facturacion') => FormLine = (fecha, tipo) => ({
  mode: 'add',
  fecha,
  tipo,
  carga: 1,
  cliente: '',
  concepto: '',
  nota: '',
  cantidad: 0,
  unidad: '',
  importe: 0,
  importeTxt: '',
  cantidadTxt: '',
})

// «9,5» → 9.5 · «9.5» → 9.5 · «abc» → 0 (V29.82: coma decimal española)
function parseNumEs(v: string): number {
  const n = Number(String(v || '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

// número → texto con coma para el input (9.5 → «9,5»)
function fmtTxt(n: number): string {
  const s = String(Math.round((Number(n) || 0) * 100) / 100)
  return s === '0' ? '' : s.replace('.', ',')
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtFechaLarga(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const s = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Importe estilo cuaderno: 86,4€ · 1490€ (coma decimal, sin separador de miles)
function fmtNum(n: number): string {
  const rounded = Math.round((Number(n) || 0) * 100) / 100
  const [ent, dec] = String(rounded).split('.')
  const decStr = dec ? ',' + dec.replace(/0+$/, '') : ''
  return ent + decStr
}

// Tipos mínimos de la Web Speech API (no están en el DOM lib de TS)
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function AgendaDiariaView() {
  const [fecha, setFecha] = useState(hoyISO())
  const [items, setItems] = useState<AgendaDiaLine[]>([])
  const [tab, setTab] = useState<'logistica' | 'facturacion'>('logistica')
  const [texto, setTexto] = useState('')
  const [interpretando, setInterpretando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [grabando, setGrabando] = useState(false)
  const [soportaVoz, setSoportaVoz] = useState(true)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState<FormLine | null>(null) // diálogo editar/añadir
  const [guardandoForm, setGuardandoForm] = useState(false)
  const [flashIds, setFlashIds] = useState<string[]>([])
  const [clientesLista, setClientesLista] = useState<string[]>([]) // clientes del tenant (V29.82)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const textoBaseRef = useRef('')
  // V29.82 — robustez del dictado: Chrome corta el reconocimiento tras silencios
  // largos; con seguirRef activo se reinicia solo (hasta pulsar Parar).
  const textoRef = useRef('')
  const seguirRef = useRef(false)
  const reintentosRef = useRef(0)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resalta líneas nuevas 6s (limpia el timer anterior para no pisar tandas)
  function flash(ids: string[]) {
    setFlashIds(ids)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashIds([]), 6000)
  }

  // Al desmontar: parar el micro y limpiar timers
  useEffect(() => () => {
    seguirRef.current = false
    try { recRef.current?.stop() } catch {}
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
  }, [])

  // ── Carga de líneas del día ────────────────────────────────────────────────
  const cargar = useCallback(async (f: string) => {
    setCargando(true)
    try {
      const res = await fetch(`/api/agenda-diaria?fecha=${f}`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setItems((data.items || []) as AgendaDiaLine[])
        // V29.82 — lista completa de clientes del tenant (datalist del formulario)
        if (Array.isArray(data.clientes)) setClientesLista(data.clientes as string[])
      }
      else setMsg('⚠ ' + (data.error || 'Error cargando la agenda'))
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    setMsg('')
    cargar(fecha)
  }, [fecha, cargar])

  useEffect(() => {
    setSoportaVoz(!!getSpeechRecognition())
  }, [])

  // ── DICTADO POR VOZ (Web Speech API, es-ES) ────────────────────────────────
  // V29.82: crearRec() construye el reconocedor y onend lo REINICIA mientras
  // seguirRef esté activo — el dictado continúa aunque Chrome lo corte por
  // silencio; solo para con el botón Parar, permiso denegado o 5 cortes sin
  // recibir nada. El texto ya reconocido nunca se pierde.
  function crearRec(SR: new () => SpeechRecognitionLike): SpeechRecognitionLike {
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e: any) => {
      reintentosRef.current = 0
      let finalTxt = ''
      let interimTxt = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript
        if (e.results[i].isFinal) finalTxt += chunk + ' '
        else interimTxt += chunk
      }
      if (finalTxt || interimTxt) {
        const nuevo = (textoBaseRef.current + (finalTxt || interimTxt)).trim()
        textoRef.current = nuevo
        setTexto(nuevo)
      }
    }
    rec.onerror = (e: any) => {
      const err = String(e?.error || '')
      if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') {
        // errores permanentes: no reintentar
        seguirRef.current = false
        recRef.current = null
        setGrabando(false)
        if (err === 'not-allowed') setMsg('⚠ Permiso de micrófono denegado — actívalo en el navegador')
        else if (err === 'audio-capture') setMsg('⚠ No se detecta micrófono — comprueba que funciona')
        else setMsg('⚠ No se pudo iniciar el micrófono — recarga la página e inténtalo de nuevo')
      } else if (err === 'network') {
        setMsg('⚠ El servicio de dictado pierde conexión — reintentando…')
      }
      // no-speech (silencio) y aborted se resuelven en onend (reinicio o parada)
    }
    rec.onend = () => {
      recRef.current = null
      if (!seguirRef.current) { setGrabando(false); return }
      // Corte de Chrome (silencio largo, límite interno): reinicio automático
      if (reintentosRef.current >= 5) {
        seguirRef.current = false
        setGrabando(false)
        setMsg('⚠ El dictado se cortó varias veces sin reconocer nada — pulsa «Dictar por voz» para continuar')
        return
      }
      try {
        textoBaseRef.current = textoRef.current ? textoRef.current + ' ' : ''
        const rec2 = crearRec(SR)
        rec2.start()
        recRef.current = rec2
        reintentosRef.current += 1 // se resetea al primer resultado reconocido
      } catch {
        seguirRef.current = false
        setGrabando(false)
      }
    }
    return rec
  }

  const toggleGrabar = useCallback(() => {
    if (grabando) {
      seguirRef.current = false
      recRef.current?.stop()
      setGrabando(false)
      return
    }
    const SR = getSpeechRecognition()
    if (!SR) { setSoportaVoz(false); return }
    seguirRef.current = true
    reintentosRef.current = 0
    textoBaseRef.current = textoRef.current ? textoRef.current + ' ' : ''
    const rec = crearRec(SR)
    recRef.current = rec
    try {
      rec.start()
      setGrabando(true)
      setMsg('')
    } catch {
      seguirRef.current = false
      setGrabando(false)
      setMsg('⚠ No se pudo iniciar el micrófono')
    }
  }, [grabando])

  // ── AGENTE: interpretar dictado y rellenar la agenda ──────────────────────
  async function handleInterpretar() {
    if (!texto.trim()) { setMsg('Escribe o dicta primero las entradas'); return }
    setInterpretando(true)
    setMsg('')
    try {
      const res = await fetch('/api/agenda-diaria/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, fecha }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg('⚠ ' + (data.error || 'Error interpretando'))
        return
      }
      const nuevas: AgendaDiaLine[] = (data.items || []) as AgendaDiaLine[]
      // Refresca desde el servidor y resalta las líneas nuevas unos segundos
      await cargar(fecha)
      flash(nuevas.map(n => n.id))
      setTexto('')
      textoRef.current = ''
      const nLog = nuevas.filter(n => n.tipo === 'logistica').length
      const nFac = nuevas.filter(n => n.tipo === 'facturacion').length
      const partes: string[] = []
      if (nLog > 0) partes.push(`${nLog} de logística`)
      if (nFac > 0) partes.push(`${nFac} de facturación`)
      setMsg(`✓ Añadidas a la agenda: ${partes.join(' y ')}`)
      // Cambia de pestaña si solo se añadieron líneas del otro apartado
      if (nLog > 0 && nFac === 0) setTab('logistica')
      if (nFac > 0 && nLog === 0) setTab('facturacion')
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    } finally {
      setInterpretando(false)
    }
  }

  // ── CRUD de líneas ────────────────────────────────────────────────────────
  async function guardarForm() {
    if (!form) return
    if (!form.concepto.trim()) { setMsg('⚠ El concepto no puede estar vacío'); return }
    setGuardandoForm(true)
    try {
      if (form.mode === 'edit' && form.id) {
        const res = await fetch(`/api/agenda-diaria/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: form.tipo, carga: form.carga, cliente: form.cliente, concepto: form.concepto,
            nota: form.nota, cantidad: form.cantidad, unidad: form.unidad, importe: form.importe,
          }),
        })
        if (!res.ok) { const d = await res.json(); setMsg('⚠ ' + (d.error || 'Error guardando')); return }
      } else {
        const res = await fetch('/api/agenda-diaria', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha: form.fecha, tipo: form.tipo, carga: form.carga, cliente: form.cliente,
            concepto: form.concepto, nota: form.nota, cantidad: form.cantidad,
            unidad: form.unidad, importe: form.importe,
          }),
        })
        if (!res.ok) { const d = await res.json(); setMsg('⚠ ' + (d.error || 'Error guardando')); return }
        const d = await res.json()
        flash((d.items || []).map((x: AgendaDiaLine) => x.id))
      }
      setForm(null)
      await cargar(fecha)
      setMsg('✓ Guardado')
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    } finally {
      setGuardandoForm(false)
    }
  }

  async function borrarLinea(id: string) {
    if (!confirm('¿Borrar esta línea de la agenda?')) return
    try {
      const res = await fetch(`/api/agenda-diaria/${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setMsg('⚠ ' + (d.error || 'Error borrando')); return }
      setItems(prev => prev.filter(i => i.id !== id))
      setMsg('✓ Línea borrada')
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    }
  }

  async function borrarCarga(carga: number) {
    const ids = items.filter(i => i.tipo === 'logistica' && i.carga === carga).map(i => i.id)
    if (ids.length === 0) return
    if (!confirm(`¿Borrar la carga ${carga} completa (${ids.length} línea${ids.length !== 1 ? 's' : ''})?`)) return
    try {
      await Promise.all(ids.map(id => fetch(`/api/agenda-diaria/${id}`, { method: 'DELETE' })))
      await cargar(fecha)
      setMsg(`✓ Carga ${carga} borrada`)
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    }
  }

  async function vaciarDia() {
    if (items.length === 0) return
    if (!confirm(`¿Vaciar la agenda del ${fmtFechaLarga(fecha)} (${items.length} líneas)?`)) return
    try {
      await Promise.all(items.map(i => fetch(`/api/agenda-diaria/${i.id}`, { method: 'DELETE' })))
      await cargar(fecha)
      setMsg('✓ Agenda del día vaciada')
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    }
  }

  // ── Agrupación ────────────────────────────────────────────────────────────
  const logisticas = items.filter(i => i.tipo === 'logistica')
  const facturaciones = items.filter(i => i.tipo === 'facturacion')
  const cargasNums = [...new Set(logisticas.map(i => i.carga))].sort((a, b) => a - b)
  const clientesOrden: string[] = []
  for (const f of facturaciones) {
    const cli = f.cliente || ''
    if (!clientesOrden.includes(cli)) clientesOrden.push(cli)
  }
  const totalLog = logisticas.reduce((s, i) => s + (Number(i.importe) || 0), 0)
  const totalFac = facturaciones.reduce((s, i) => s + (Number(i.importe) || 0), 0)
  // Recuentos por destino (lo de antes de la "/") — como en el cuaderno original
  const recuentos = new Map<string, number>()
  for (const f of facturaciones) {
    const dest = (f.concepto || '').split('/')[0].trim() || f.concepto
    recuentos.set(dest, (recuentos.get(dest) || 0) + 1)
  }
  const recuentosArr = [...recuentos.entries()].sort((a, b) => b[1] - a[1])

  const vocabClientes = [...new Set(items.map(i => i.cliente).filter(Boolean))]

  function abrirAddLinea(tipo: 'logistica' | 'facturacion', carga?: number, cliente?: string) {
    const f = EMPTY_FORM(fecha, tipo)
    if (tipo === 'logistica') f.carga = carga ?? (cargasNums.length > 0 ? Math.max(...cargasNums) : 1)
    if (tipo === 'facturacion') f.cliente = cliente ?? ''
    setForm(f)
  }

  function abrirNuevaCarga() {
    const f = EMPTY_FORM(fecha, 'logistica')
    f.carga = cargasNums.length > 0 ? Math.max(...cargasNums) + 1 : 1
    setForm(f)
  }

  // ── Fila de línea (estilo cuaderno) ───────────────────────────────────────
  function LineaRow({ l }: { l: AgendaDiaLine }) {
    const flash = flashIds.includes(l.id)
    return (
      <div className={`group flex items-start gap-2 py-1.5 border-b border-dashed border-gray-200 last:border-b-0 ${flash ? 'bg-green-50 rounded-md px-2 -mx-2' : ''}`}>
        <div className="flex-1 min-w-0 text-[15px] leading-snug text-slate-800">
          <span className="font-bold">{l.concepto}</span>
          <span className="text-slate-500">; </span>
          <span className="font-bold">{fmtNum(l.importe)}€</span>
          {l.cantidad > 0 && <span className="font-bold">. {fmtNum(l.cantidad)}{l.unidad ? l.unidad : ''}.</span>}
          {l.nota && <span className="font-bold"> {l.nota}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100">
          <button
            onClick={() => setForm({ mode: 'edit', ...l, importeTxt: fmtTxt(l.importe), cantidadTxt: fmtTxt(l.cantidad) })}
            className="h-8 w-8 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
            title="Editar línea"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => borrarLinea(l.id)}
            className="h-8 w-8 rounded-md hover:bg-red-50 flex items-center justify-center text-red-500"
            title="Borrar línea"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pb-8">
      {/* Cabecera + navegación por día */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Agenda Diaria</h1>
          <p className="text-sm text-slate-500">Dicta por voz tus entradas y el agente va rellenando la agenda del día.</p>
        </div>
        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={vaciarDia} className="text-red-600 border-red-300 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-1" /> Vaciar día
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" onClick={() => setFecha(addDias(fecha, -1))} className="h-10 w-10 shrink-0" title="Día anterior">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center min-w-0">
            <div className="flex items-center justify-center gap-2 text-sm sm:text-[15px] font-bold text-slate-700">
              <CalendarDays className="h-4 w-4 shrink-0 text-[#2bb24c]" />
              {fmtFechaLarga(fecha)}
            </div>
            {fecha !== hoyISO() && (
              <button onClick={() => setFecha(hoyISO())} className="text-xs text-[#005bb5] underline mt-0.5">Ir a hoy</button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setFecha(addDias(fecha, 1))} className="h-10 w-10 shrink-0" title="Día siguiente">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>

      {/* DICTADO */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={toggleGrabar}
              className={grabando ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : 'bg-[#2bb24c] hover:bg-[#239540] text-white'}
              title={soportaVoz ? (grabando ? 'Parar dictado' : 'Dictar por voz') : 'Tu navegador no soporta dictado'}
            >
              {grabando ? <><MicOff className="h-4 w-4 mr-2" /> Parar…</> : <><Mic className="h-4 w-4 mr-2" /> Dictar por voz</>}
            </Button>
            {grabando && <span className="text-sm text-red-600 font-bold">● Grabando — habla claro, una entrada por frase</span>}
            {!soportaVoz && <span className="text-xs text-amber-600">Tu navegador no soporta dictado por voz (usa Chrome/Edge) — puedes escribir el texto</span>}
            <Button onClick={handleInterpretar} disabled={interpretando || !texto.trim()} className="bg-[#005bb5] hover:bg-[#003d7a] text-white ml-auto">
              {interpretando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {interpretando ? 'Rellenando agenda…' : 'Añadir a la agenda'}
            </Button>
          </div>
          <textarea
            value={texto}
            onChange={e => { textoRef.current = e.target.value; setTexto(e.target.value) }}
            placeholder={grabando ? 'Escuchando… el dictado aparece aquí' : 'Ej: «Hualsa Milagro 125 euros. Piking bobinas 72 bobinas a 1,20. Carga palets 3 palets a 3 euros. Nueva carga. Milca Milagro 20 euros. La Boquera Milca 90 euros facturar a Vega»'}
            rows={4}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:border-[#2bb24c] focus:outline-none resize-y"
          />
          <p className="text-xs text-slate-400">Consejo: di «nueva carga» para empezar la siguiente carga; en facturación di el cliente («para Florette») y el destino («Milca/Milagro 90 euros»). Todo lo dictado se añade al día seleccionado.</p>
        </CardContent>
      </Card>

      {msg && (
        <div className={`text-sm font-bold px-3 py-2 rounded-lg ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{msg}</div>
      )}

      {/* PESTAÑAS */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTab('logistica')}
          className={`px-4 py-2 rounded-t-lg text-sm font-bold border-b-[3px] transition-colors ${tab === 'logistica' ? 'text-[#2bb24c] border-[#2bb24c] bg-white' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
        >
          Logística Hualsa {totalLog > 0 && <span className="hidden sm:inline text-xs font-normal">({fmtNum(totalLog)}€)</span>}
        </button>
        <button
          onClick={() => setTab('facturacion')}
          className={`px-4 py-2 rounded-t-lg text-sm font-bold border-b-[3px] transition-colors ${tab === 'facturacion' ? 'text-[#005bb5] border-[#005bb5] bg-white' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
        >
          Facturación Día {totalFac > 0 && <span className="hidden sm:inline text-xs font-normal">({fmtNum(totalFac)}€)</span>}
        </button>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando agenda…</div>
      ) : tab === 'logistica' ? (
        /* ── LOGÍSTICA: cargas 1, 2, 3... con subtotal ── */
        <div className="space-y-4">
          {cargasNums.length === 0 && (
            <div className="text-center text-slate-400 py-8 text-sm">No hay cargas este día. Dicta arriba o añade una línea a mano.</div>
          )}
          {cargasNums.map(c => {
            const lineas = logisticas.filter(i => i.carga === c)
            const sub = lineas.reduce((s, i) => s + (Number(i.importe) || 0), 0)
            return (
              <Card key={c}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-black text-slate-800">{c}</h3>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => abrirAddLinea('logistica', c)} className="h-8 text-xs text-[#2bb24c]">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Línea
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => borrarCarga(c)} className="h-8 w-8 p-0 text-red-500" title="Borrar carga completa">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    {lineas.map(l => <LineaRow key={l.id} l={l} />)}
                  </div>
                  <div className="mt-3 text-[15px] font-bold text-slate-800">Total; {fmtNum(sub)}€</div>
                </CardContent>
              </Card>
            )
          })}
          <Button onClick={abrirNuevaCarga} variant="outline" className="w-full border-dashed border-[#2bb24c] text-[#2bb24c] hover:bg-green-50">
            <Plus className="h-4 w-4 mr-1" /> Nueva carga
          </Button>
          {cargasNums.length > 0 && (
            <div className="text-lg font-black text-slate-800 text-center py-2 border-t-2 border-slate-200">
              Total Dia; {fmtNum(totalLog)}€
            </div>
          )}
        </div>
      ) : (
        /* ── FACTURACIÓN: grupos por cliente + recuentos ── */
        <div className="space-y-4">
          {facturaciones.length === 0 && (
            <div className="text-center text-slate-400 py-8 text-sm">No hay facturación este día. Dicta arriba o añade una línea a mano.</div>
          )}
          {clientesOrden.map(cli => {
            const lineas = facturaciones.filter(i => (i.cliente || '') === cli)
            const sub = lineas.reduce((s, i) => s + (Number(i.importe) || 0), 0)
            return (
              <Card key={cli || '(sin cliente)'}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-black text-slate-800 underline underline-offset-4">{cli || 'Sin cliente'}</h3>
                    <Button size="sm" variant="ghost" onClick={() => abrirAddLinea('facturacion', undefined, cli)} className="h-8 text-xs text-[#005bb5]">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Línea
                    </Button>
                  </div>
                  <div>
                    {lineas.map(l => <LineaRow key={l.id} l={l} />)}
                  </div>
                  <div className="mt-3 text-[15px] font-bold text-slate-800">Total; {fmtNum(sub)}€</div>
                </CardContent>
              </Card>
            )
          })}
          {facturaciones.length > 0 && (
            <>
              <div className="text-lg font-black text-slate-800 text-center py-2 border-t-2 border-slate-200">
                Total; {fmtNum(totalFac)}€
              </div>
              {recuentosArr.length > 0 && (
                <div className="text-sm font-bold text-slate-600 space-y-0.5 px-1">
                  {recuentosArr.map(([dest, n]) => (
                    <div key={dest}>{dest}; {n}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* DIÁLOGO añadir/editar línea */}
      <Dialog open={!!form} onOpenChange={(open) => { if (!open) setForm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form?.mode === 'edit' ? 'Editar línea' : form?.tipo === 'logistica' ? `Nueva línea — Carga ${form?.carga}` : 'Nueva línea de facturación'}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Concepto</label>
                <Input
                  value={form.concepto}
                  onChange={e => setForm({ ...form, concepto: e.target.value })}
                  placeholder={form.tipo === 'logistica' ? 'Piking Bobinas, Hualsa/Milagro…' : 'Milca/Milagro, La Boquera/Milca…'}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Importe €</label>
                  {/* V29.82: texto + inputMode decimal — acepta coma («9,5») */}
                  <Input type="text" inputMode="decimal" value={form.importeTxt || ''} onChange={e => setForm({ ...form, importeTxt: e.target.value, importe: parseNumEs(e.target.value) })} className="mt-1 text-right" placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Cantidad</label>
                  <Input type="text" inputMode="decimal" value={form.cantidadTxt || ''} onChange={e => setForm({ ...form, cantidadTxt: e.target.value, cantidad: parseNumEs(e.target.value) })} className="mt-1 text-right" placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Unidad</label>
                  <Input value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} placeholder="b, p, u…" className="mt-1" />
                </div>
              </div>
              {form.tipo === 'logistica' ? (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Nº de carga</label>
                  <Input type="number" min="1" value={form.carga} onChange={e => setForm({ ...form, carga: Math.max(1, Number(e.target.value) || 1) })} className="mt-1" />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Cliente (agrupación)</label>
                  <Input
                    value={form.cliente}
                    onChange={e => setForm({ ...form, cliente: e.target.value })}
                    placeholder="Florette, Milca…"
                    list="agenda-diaria-clientes"
                    className="mt-1"
                  />
                  <datalist id="agenda-diaria-clientes">
                    {[...new Set([...clientesLista, ...vocabClientes])].map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Nota</label>
                <Input value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} placeholder="Facturar a Vega, envases…" className="mt-1" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                <Button onClick={guardarForm} disabled={guardandoForm} className="bg-[#2bb24c] hover:bg-[#239540] text-white">
                  {guardandoForm ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
