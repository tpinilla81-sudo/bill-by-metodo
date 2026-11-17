'use client'

// V29.80 — AGENDA DIARIA
// El usuario navega por días y DICTA POR VOZ (o teclea) lo que va haciendo;
// el agente IA va rellenando la agenda directamente (POST /api/agenda-diaria/
// interpretar). Dos apartados:
//   - LOGÍSTICA: servicios del día agrupados en CARGAS (1, 2...) con subtotal
//     por carga y Total Día.
//   - FACTURACIÓN: entregas agrupadas por CLIENTE con total y recuentos por
//     destino (lo de antes de la "/").
// Cada línea es editable y borrable; también se pueden añadir a mano.
// V29.85 — el diario es SOLO la agenda que rellena el agente: no se vincula con
// Registros ni Facturas (no los lee ni los escribe).
// V29.92 — REDISEÑO estilo OPUS ONE (planner de papel): hoja crema con
// tipografía serif, tarjetas papel, tinta burdeos, una sola columna apilada
// (calendario → dictado → Logística → Facturación → Notas del día), PRIORIDADES
// A/B/C en cada línea (badge + orden dentro del grupo, también extraídas del
// dictado) y NOTAS DEL DÍA libres con autosave (GET/PUT /api/agenda-diaria/notas).
// V29.94 — Calendario MENSUAL en una página paralela (estilo Filofax/Opus One):
// a la izquierda el mes con flechas anterior/siguiente + "Ir a hoy" y marcadores
// (punto burdeos si hay logística, azul si hay facturación); a la derecha el día
// seleccionado con todo su contenido. En móvil se apila (calendario arriba).

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mic, MicOff, Sparkles, Trash2, Plus, Loader2, Pencil, ChevronLeft, ChevronRight, CalendarDays, Camera, X, Image as ImageIcon } from 'lucide-react'

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
  prioridad?: string // V29.92 estilo Opus One: A1, A2, B1... ('' = sin prioridad)
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
  prioridad: string
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
  prioridad: '',
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

// V29.94 — mes (YYYY-MM) de una fecha ISO
function mesDeFecha(iso: string): string {
  return iso.slice(0, 7)
}

// V29.94 — nombre del mes en español + año («Noviembre 2026»)
function fmtMesLargo(mes: string): string {
  const [yy, mm] = mes.split('-').map(Number)
  const d = new Date(yy, mm - 1, 1, 12, 0, 0)
  const s = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// V29.94 — matriz del mes para pintar el grid: semanas (L→D) con días rellenos
// y huecos del mes anterior/siguiente en gris claro.
function matrizMes(mes: string): { iso: string; dia: number; fuera: boolean }[][] {
  const [yy, mm] = mes.split('-').map(Number)
  const primero = new Date(yy, mm - 1, 1, 12, 0, 0)
  // 0=domingo → queremos L=0
  let primerLun = (primero.getDay() + 6) % 7
  const ultimoDia = new Date(yy, mm, 0).getDate()
  // días del mes anterior para completar la primera semana
  const prevUltimo = new Date(yy, mm - 1, 0).getDate()
  const dias: { iso: string; dia: number; fuera: boolean }[] = []
  for (let i = primerLun - 1; i >= 0; i--) {
    const d = new Date(yy, mm - 2, prevUltimo - i, 12, 0, 0)
    dias.push({ iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, dia: d.getDate(), fuera: true })
  }
  for (let d = 1; d <= ultimoDia; d++) {
    dias.push({ iso: `${mes}-${String(d).padStart(2, '0')}`, dia: d, fuera: false })
  }
  // completar hasta múltiplo de 7
  while (dias.length % 7 !== 0) {
    const last = dias[dias.length - 1].iso
    const d = new Date(last + 'T12:00:00'); d.setDate(d.getDate() + 1)
    dias.push({ iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, dia: d.getDate(), fuera: true })
  }
  // trocear en semanas
  const sem: { iso: string; dia: number; fuera: boolean }[][] = []
  for (let i = 0; i < dias.length; i += 7) sem.push(dias.slice(i, i + 7))
  return sem
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

// ── V29.92 — PRIORIDADES estilo Opus One ────────────────────────────────────
// Rango de orden: A1=1, A2=2… B1=101… C1=201…; sin prioridad → 999 (al final).
function prioridadRank(p: string): number {
  if (!p) return 999
  const letra = p.toUpperCase().charCodeAt(0) // A=65, B=66, C=67
  if (letra < 65 || letra > 67) return 999
  const num = parseInt(p.slice(1), 10) || 0
  return (letra - 65) * 100 + num
}

function compararLineas(a: AgendaDiaLine, b: AgendaDiaLine): number {
  const pa = prioridadRank(a.prioridad || '')
  const pb = prioridadRank(b.prioridad || '')
  if (pa !== pb) return pa - pb
  return (a.orden || 0) - (b.orden || 0)
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

// ── V29.92 — clases del tema PAPEL (Opus One) ───────────────────────────────
const SERIF = "[font-family:Georgia,'Times_New_Roman',serif]"
const HOJA = 'bg-[#f6f1e2] border border-[#e3d8bc] rounded-2xl shadow-[0_2px_10px_rgba(90,70,20,0.10)]'
const PAPEL = 'bg-[#fffdf7] border border-[#e3d8bc] rounded-xl shadow-[0_1px_4px_rgba(90,70,20,0.08)]'
const TINTA = 'text-[#3d3225]'
const TINTA_SUAVE = 'text-[#8a7a55]'
const BURDEOS = '#7a1f2b'

export function AgendaDiariaView() {
  const [fecha, setFecha] = useState(hoyISO())
  // V29.94 — mes mostrado en el calendario mensual (independiente del día seleccionado)
  const [mesCal, setMesCal] = useState(mesDeFecha(hoyISO()))
  const [marcadoresMes, setMarcadoresMes] = useState<Record<string, { log: boolean; fac: boolean }>>({})
  const [items, setItems] = useState<AgendaDiaLine[]>([])
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
  const [conceptosLista, setConceptosLista] = useState<string[]>([]) // conceptos del catálogo (V29.83)
  // V29.92 — notas del día (Opus One "Daily Notes") con autosave
  const [nota, setNota] = useState('')
  const [notaEstado, setNotaEstado] = useState<'' | 'guardando' | 'guardada' | 'error'>('')
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const textoBaseRef = useRef('')
  // V29.82 — robustez del dictado: Chrome corta el reconocimiento tras silencios
  // largos; con seguirRef activo se reinicia solo (hasta pulsar Parar).
  const textoRef = useRef('')
  const seguirRef = useRef(false)
  const reintentosRef = useRef(0)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notaGuardadaRef = useRef('') // último texto de nota GUARDADO en el servidor
  // V29.95 — foto adjunta (data URL) para que el agente la lea con VLM
  const [foto, setFoto] = useState<string>('') // data URL
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Resalta líneas nuevas 6s (limpia el timer anterior para no pisar tandas)
  function flash(ids: string[]) {
    setFlashIds(ids)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashIds([]), 6000)
  }

  // Al desmontar: parar el micro, limpiar timers y descartar nota pendiente
  useEffect(() => () => {
    seguirRef.current = false
    try { recRef.current?.stop() } catch {}
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    if (notaTimerRef.current) clearTimeout(notaTimerRef.current)
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
        // V29.83 — conceptos del catálogo (datalist del concepto)
        if (Array.isArray(data.conceptos)) setConceptosLista(data.conceptos as string[])
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

  // ── V29.94 — cargar marcadores del mes para el calendario mensual ─────────
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const res = await fetch(`/api/agenda-diaria/mes?mes=${mesCal}`, { cache: 'no-store' })
        const d = await res.json()
        if (!cancel && res.ok) setMarcadoresMes(d.dias || {})
      } catch { /* sin marcadores no rompe */ }
    })()
    return () => { cancel = true }
  }, [mesCal])

  // V29.94 — al cambiar de día con las flechas del strip, si el día cae en otro mes
  // distinto del calendario, también movemos el calendario para que se vea.
  // (El usuario puede seguir navegando el calendario por su cuenta con sus flechas.)
  useEffect(() => {
    const m = mesDeFecha(fecha)
    if (m !== mesCal) setMesCal(m)
    // refrescar marcadores (puede haber cambiado algo en el día recién editado)
    ;(async () => {
      try {
        const res = await fetch(`/api/agenda-diaria/mes?mes=${m}`, { cache: 'no-store' })
        const d = await res.json()
        if (res.ok) setMarcadoresMes(d.dias || {})
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha])

  // ── V29.92 — NOTAS DEL DÍA: cargar al cambiar de fecha ────────────────────
  useEffect(() => {
    let cancel = false
    setNotaEstado('')
    ;(async () => {
      try {
        const res = await fetch(`/api/agenda-diaria/notas?fecha=${fecha}`, { cache: 'no-store' })
        const d = await res.json()
        if (!cancel && res.ok) {
          setNota(String(d.texto || ''))
          notaGuardadaRef.current = String(d.texto || '')
        }
      } catch { /* sin nota no pasa nada */ }
    })()
    return () => { cancel = true }
  }, [fecha])

  async function guardarNota(v: string, f: string) {
    if (v === notaGuardadaRef.current) { setNotaEstado(''); return }
    setNotaEstado('guardando')
    try {
      const res = await fetch('/api/agenda-diaria/notas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: f, texto: v }),
      })
      if (res.ok) {
        notaGuardadaRef.current = v
        setNotaEstado('guardada')
        setTimeout(() => setNotaEstado(s => (s === 'guardada' ? '' : s)), 2500)
      } else {
        setNotaEstado('error')
      }
    } catch {
      setNotaEstado('error')
    }
  }

  function cambiarNota(v: string) {
    setNota(v)
    const f = fecha // se captura AHÍ: si cambias de día antes del debounce, la nota se guarda en el día correcto
    if (notaTimerRef.current) clearTimeout(notaTimerRef.current)
    notaTimerRef.current = setTimeout(() => guardarNota(v, f), 900)
  }

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
    // V29.95 — se puede enviar texto, foto, o ambos
    if (!texto.trim() && !foto) { setMsg('Escribe, dicta o adjunta una foto primero'); return }
    setInterpretando(true)
    setMsg('')
    try {
      const payload: any = { fecha }
      if (texto.trim()) payload.texto = texto.trim()
      if (foto) payload.imagen = foto
      const res = await fetch('/api/agenda-diaria/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      setFoto('') // V29.95 — limpia la foto tras procesarla
      const nLog = nuevas.filter(n => n.tipo === 'logistica').length
      const nFac = nuevas.filter(n => n.tipo === 'facturacion').length
      const partes: string[] = []
      if (nLog > 0) partes.push(`${nLog} de logística`)
      if (nFac > 0) partes.push(`${nFac} de facturación`)
      setMsg(`✓ Añadidas a la agenda: ${partes.join(' y ')}`)
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    } finally {
      setInterpretando(false)
    }
  }

  // V29.95 — leer un File de imagen y devolver un data URL redimensionado
  // (max ~1280px lado largo, JPEG calidad 0.8) para no petar el body del POST.
  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
      reader.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error('La imagen no es válida'))
        img.onload = () => {
          const MAX = 1280
          let w = img.width, h = img.height
          if (w > MAX || h > MAX) {
            if (w >= h) { h = Math.round(h * MAX / w); w = MAX }
            else { w = Math.round(w * MAX / h); h = MAX }
          }
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(String(reader.result)); return }
          ctx.drawImage(img, 0, 0, w, h)
          try { resolve(canvas.toDataURL('image/jpeg', 0.8)) }
          catch { resolve(String(reader.result)) }
        }
        img.src = String(reader.result)
      }
      reader.readAsDataURL(file)
    })
  }

  async function onSeleccionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!f) return
    if (!f.type.startsWith('image/')) { setMsg('⚠ El archivo no es una imagen'); return }
    if (f.size > 15 * 1024 * 1024) { setMsg('⚠ La imagen es demasiado grande (máx 15MB)'); return }
    try {
      const url = await fileToDataUrl(f)
      setFoto(url)
      setMsg('')
    } catch (err: any) {
      setMsg('⚠ ' + (err?.message || 'No se pudo cargar la imagen'))
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
            prioridad: form.prioridad,
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
            unidad: form.unidad, importe: form.importe, prioridad: form.prioridad,
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
  const logisticas = items.filter(i => i.tipo === 'logistica').sort(compararLineas)
  const facturaciones = items.filter(i => i.tipo === 'facturacion').sort(compararLineas)
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

  // ── V29.92 — piezas visuales del tema papel ───────────────────────────────
  // Cabecera de sección tipo planner: versalitas espaciadas + doble filete
  function TituloSeccion({ children, color = BURDEOS }: { children: ReactNode; color?: string }) {
    return (
      <div className="border-b-4 border-double border-[#cbb98d] pb-1 mb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.2em]" style={{ color }}>{children}</h2>
      </div>
    )
  }

  // Badge de prioridad A/B/C (A burdeos, B ocre, C pizarra)
  function BadgePrioridad({ p }: { p: string }) {
    if (!p) return null
    const cls = p.startsWith('A')
      ? 'bg-[#7a1f2b] text-[#fdf6e9] border-[#5f1620]'
      : p.startsWith('B')
        ? 'bg-[#c98f2d] text-white border-[#9a6c1f]'
        : 'bg-[#eef0ee] text-[#5b6b7a] border-[#93a1ad]'
    return (
      <span className={`inline-flex items-center justify-center h-5 min-w-[28px] px-1 rounded-md border text-[10px] font-bold tracking-wide ${cls}`} title={`Prioridad ${p}`}>
        {p}
      </span>
    )
  }

  // ── Fila de línea (estilo cuaderno, con badge de prioridad) ───────────────
  function LineaRow({ l }: { l: AgendaDiaLine }) {
    const flash = flashIds.includes(l.id)
    return (
      <div className={`group flex items-start gap-2 py-1.5 border-b border-dashed border-[#ddd2b4] last:border-b-0 ${flash ? 'bg-[#eef4e2] rounded-md px-2 -mx-2' : ''}`}>
        <span className="pt-[3px] shrink-0"><BadgePrioridad p={l.prioridad || ''} /></span>
        <div className={`flex-1 min-w-0 text-[15px] leading-snug ${TINTA}`}>
          <span className="font-bold">{l.concepto}</span>
          <span className={TINTA_SUAVE}>; </span>
          <span className="font-bold">{fmtNum(l.importe)}€</span>
          {l.cantidad > 0 && <span className="font-bold">. {fmtNum(l.cantidad)}{l.unidad ? l.unidad : ''}.</span>}
          {l.nota && <span className="font-bold"> {l.nota}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100">
          <button
            onClick={() => setForm({ mode: 'edit', ...l, prioridad: l.prioridad || '', importeTxt: fmtTxt(l.importe), cantidadTxt: fmtTxt(l.cantidad) })}
            className="h-8 w-8 rounded-md hover:bg-[#f1e8d2] flex items-center justify-center text-[#8a7a55]"
            title="Editar línea"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => borrarLinea(l.id)}
            className="h-8 w-8 rounded-md hover:bg-[#f3e0dd] flex items-center justify-center text-[#a33b30]"
            title="Borrar línea"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // Fecha partida para el strip estilo planner: «LUNES» + «16 de noviembre de 2026»
  const [diaNombre, ...fechaResto] = fmtFechaLarga(fecha).split(', ')
  const esHoy = fecha === hoyISO()

  // V29.94 — mover mes del calendario
  function cambiarMes(delta: number) {
    const [yy, mm] = mesCal.split('-').map(Number)
    const d = new Date(yy, mm - 1 + delta, 1, 12, 0, 0)
    setMesCal(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // ── V29.94 — Calendario mensual (página izquierda) ──────────────────────────
  const semanas = matrizMes(mesCal)
  const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div className={`w-full max-w-5xl mx-auto pb-10 ${SERIF}`}>
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-4 space-y-4 lg:space-y-0">

        {/* ── PÁGINA IZQUIERDA: calendario mensual ── */}
        <aside className={`${HOJA} p-3 lg:sticky lg:top-2 lg:self-start`}>
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="icon" onClick={() => cambiarMes(-1)} className="h-8 w-8 shrink-0 text-[#7a1f2b] hover:bg-[#f1e8d2]" title="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-0 px-1">
              <div className={`text-[10px] tracking-[0.25em] uppercase ${TINTA_SUAVE}`}>Calendario</div>
              <div className={`text-sm font-bold leading-tight ${TINTA}`}>{fmtMesLargo(mesCal)}</div>
              {mesCal !== mesDeFecha(hoyISO()) && (
                <button onClick={() => { setMesCal(mesDeFecha(hoyISO())); setFecha(hoyISO()) }} className="text-[11px] text-[#7a1f2b] underline underline-offset-2 mt-0.5">Ir a hoy</button>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => cambiarMes(1)} className="h-8 w-8 shrink-0 text-[#7a1f2b] hover:bg-[#f1e8d2]" title="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Cabecera días de la semana */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DOW.map(d => (
              <div key={d} className={`text-center text-[10px] font-bold uppercase tracking-wide ${TINTA_SUAVE}`}>{d}</div>
            ))}
          </div>

          {/* Grid de días */}
          <div className="space-y-0.5">
            {semanas.map((sem, i) => (
              <div key={i} className="grid grid-cols-7 gap-0.5">
                {sem.map(celda => {
                  const marc = marcadoresMes[celda.iso]
                  const esHoyCell = celda.iso === hoyISO()
                  const esSel = celda.iso === fecha
                  return (
                    <button
                      key={celda.iso}
                      onClick={() => setFecha(celda.iso)}
                      className={`relative h-9 rounded-md flex items-center justify-center text-sm transition-colors
                        ${celda.fuera ? `text-[#b9ad8a]/60 ${esSel ? 'bg-[#e8d3a8] font-bold' : 'hover:bg-[#f1e8d2]'}` : ''}
                        ${!celda.fuera && esSel ? 'bg-[#7a1f2b] text-[#fdf6e9] font-bold' : ''}
                        ${!celda.fuera && !esSel && esHoyCell ? 'bg-[#fbf6e7] border border-[#cbb98d] font-bold text-[#7a1f2b]' : ''}
                        ${!celda.fuera && !esSel && !esHoyCell ? `${TINTA} hover:bg-[#f1e8d2]` : ''}
                      `}
                      title={celda.fuera ? '' : (marc ? `${marc.log ? 'logística' : ''}${marc.log && marc.fac ? ' + ' : ''}${marc.fac ? 'facturación' : ''}` : 'día sin apuntes')}
                    >
                      <span>{celda.dia}</span>
                      {/* Marcadores: punto burdeos (logística) + punto azul (facturación) */}
                      {marc && (marc.log || marc.fac) && !esSel && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {marc.log && <span className="h-1.5 w-1.5 rounded-full bg-[#7a1f2b]" />}
                          {marc.fac && <span className="h-1.5 w-1.5 rounded-full bg-[#1d4ed8]" />}
                        </span>
                      )}
                      {/* En el día seleccionado los puntos en blanco para que se vean */}
                      {marc && (marc.log || marc.fac) && esSel && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {marc.log && <span className="h-1.5 w-1.5 rounded-full bg-[#fdf6e9]" />}
                          {marc.fac && <span className="h-1.5 w-1.5 rounded-full bg-[#9ec5ff]" />}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Leyenda */}
          <div className={`mt-2 pt-2 border-t border-dashed border-[#ddd2b4] flex items-center gap-3 text-[10px] ${TINTA_SUAVE}`}>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#7a1f2b]" />Logística</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#1d4ed8]" />Facturación</span>
          </div>
        </aside>

        {/* ── PÁGINA DERECHA: el día seleccionado ── */}
        <div className={`${HOJA} p-3 sm:p-5 space-y-4`}>

        {/* Cabecera de la página (planner) */}
        <div className="text-center pt-1">
          <div className={`text-[10px] tracking-[0.35em] uppercase ${TINTA_SUAVE}`}>Transportes Hualsa</div>
          <h1 className="text-[26px] leading-tight font-bold text-[#7a1f2b] mt-0.5">Agenda Diaria</h1>
          <p className={`text-xs italic mt-0.5 ${TINTA_SUAVE}`}>Tu día en una página — dicta y el agente rellena</p>
        </div>

        {/* Navegación por día (strip compacto: flechas + fecha) */}
        <div className={`${PAPEL} p-2.5 flex items-center justify-between gap-2`}>
          <Button variant="ghost" size="icon" onClick={() => setFecha(addDias(fecha, -1))} className="h-10 w-10 shrink-0 text-[#7a1f2b] hover:bg-[#f1e8d2]" title="Día anterior">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center min-w-0">
            <div className={`flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.25em] ${TINTA_SUAVE}`}>
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {diaNombre}
            </div>
            <div className={`text-lg font-bold leading-tight ${TINTA}`}>{fechaResto.join(', ')}</div>
            {!esHoy && (
              <button onClick={() => setFecha(hoyISO())} className="text-xs text-[#7a1f2b] underline underline-offset-2 mt-0.5">Ir a hoy</button>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setFecha(addDias(fecha, 1))} className="h-10 w-10 shrink-0 text-[#7a1f2b] hover:bg-[#f1e8d2]" title="Día siguiente">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* DICTADO */}
        <div className={`${PAPEL} p-4 space-y-3`}>
          <TituloSeccion>Dictado</TituloSeccion>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={toggleGrabar}
              className={grabando ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : 'bg-[#2bb24c] hover:bg-[#239540] text-white'}
              title={soportaVoz ? (grabando ? 'Parar dictado' : 'Dictar por voz') : 'Tu navegador no soporta dictado'}
            >
              {grabando ? <><MicOff className="h-4 w-4 mr-2" /> Parar…</> : <><Mic className="h-4 w-4 mr-2" /> Dictar por voz</>}
            </Button>
            {/* V29.95 — Foto: en móvil abre la cámara (capture=environment), en desktop elige archivo */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onSeleccionarFoto}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="text-[#7a1f2b] border-[#d8b88a] hover:bg-[#f1e8d2]"
              title="Hacer o adjuntar una foto para que el agente la lea"
            >
              <Camera className="h-4 w-4 mr-2" /> Foto
            </Button>
            {grabando && <span className="text-sm text-[#a33b30] font-bold">● Grabando — habla claro, una línea por frase</span>}
            {!soportaVoz && <span className="text-xs text-[#8a5a19]">Tu navegador no soporta dictado por voz (usa Chrome/Edge) — puedes escribir el texto o adjuntar una foto</span>}
            <Button onClick={handleInterpretar} disabled={interpretando || (!texto.trim() && !foto)} className="bg-[#7a1f2b] hover:bg-[#5f1620] text-white ml-auto">
              {interpretando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {interpretando ? 'Rellenando agenda…' : 'Añadir a la agenda'}
            </Button>
          </div>
          {/* V29.95 — vista previa de la foto adjunta */}
          {foto && (
            <div className="relative inline-block rounded-lg overflow-hidden border border-[#d8b88a] bg-[#fbf6e7]">
              <img src={foto} alt="Foto adjunta" className="max-h-44 block" />
              <button
                onClick={() => setFoto('')}
                className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                title="Quitar foto"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <textarea
            value={texto}
            onChange={e => { textoRef.current = e.target.value; setTexto(e.target.value) }}
            placeholder={grabando ? 'Escuchando… el dictado aparece aquí' : foto ? 'Contexto opcional para la foto (cliente, fecha, prioridad…) — puedes dejarlo vacío' : 'Ej: «Hualsa Milagro 125 euros. Piking bobinas 72 bobinas a 1,20. Carga palets 3 palets a 3 euros. Nueva carga. Milca Milagro 20 euros. La Boquera Milca 90 euros facturar a Vega»'}
            rows={4}
            className="w-full bg-[#fffdf7] border border-[#e3d8bc] rounded-lg p-3 text-sm focus:border-[#7a1f2b] focus:outline-none resize-y leading-relaxed"
          />
          <p className={`text-xs ${TINTA_SUAVE}`}>Consejo: di «nueva carga» para empezar la siguiente carga; en facturación di el cliente («para Florette») y el destino («Milca/Milagro 90 euros»). Prioridades: di «prioridad A1» o «urgente». <strong>Foto</strong>: adjunta un parte, hoja escrita o albarán y el agente lo leerá con visión IA. Todo lo dictado o fotografiado se añade al día seleccionado.</p>
        </div>

        {msg && (
          <div className={`text-sm font-bold px-3 py-2 rounded-lg border ${msg.startsWith('✓') ? 'bg-[#eef4e2] text-[#4a6b2f] border-[#d3e0c0]' : 'bg-[#f7ecd7] text-[#8a5a19] border-[#e8d3a8]'}`}>{msg}</div>
        )}

        {cargando ? (
          <div className={`flex items-center justify-center py-10 ${TINTA_SUAVE}`}><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando agenda…</div>
        ) : (
          <>
            {/* ── LOGÍSTICA: cargas 1, 2, 3... con subtotal ── */}
            <div className={`${PAPEL} p-4`}>
              <div className="flex items-center justify-between">
                <TituloSeccion>Logística Hualsa</TituloSeccion>
                <button onClick={abrirNuevaCarga} className="text-xs text-[#7a1f2b] hover:underline flex items-center gap-1 mb-2 shrink-0">
                  <Plus className="h-3.5 w-3.5" /> Nueva carga
                </button>
              </div>
              {cargasNums.length === 0 && (
                <div className={`text-center py-6 text-sm italic ${TINTA_SUAVE}`}>No hay cargas este día. Dicta arriba o añade una línea a mano.</div>
              )}
              <div className="space-y-3">
                {cargasNums.map(c => {
                  const lineas = logisticas.filter(i => i.carga === c)
                  const sub = lineas.reduce((s, i) => s + (Number(i.importe) || 0), 0)
                  return (
                    <div key={c} className="bg-[#fbf6e7] border border-[#e9dfc2] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <h3 className={`text-base font-bold ${TINTA}`}>Carga {c}</h3>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => abrirAddLinea('logistica', c)} className="h-7 text-xs text-[#7a1f2b] hover:bg-[#f1e8d2]">
                            <Plus className="h-3 w-3 mr-1" /> Línea
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => borrarCarga(c)} className="h-7 w-7 p-0 text-[#a33b30] hover:bg-[#f3e0dd]" title="Borrar carga completa">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        {lineas.map(l => <LineaRow key={l.id} l={l} />)}
                      </div>
                      <div className={`mt-2 text-[15px] font-bold text-right ${TINTA}`}>Total; {fmtNum(sub)}€</div>
                    </div>
                  )
                })}
              </div>
              {cargasNums.length > 0 && (
                <div className={`mt-3 pt-2 border-t-4 border-double border-[#cbb98d] text-lg font-bold text-center ${TINTA}`}>
                  Total Día; {fmtNum(totalLog)}€
                </div>
              )}
            </div>

            {/* ── FACTURACIÓN: grupos por cliente + recuentos ── */}
            <div className={`${PAPEL} p-4`}>
              <TituloSeccion color="#1d4ed8">Facturación del día</TituloSeccion>
              {facturaciones.length === 0 && (
                <div className={`text-center py-6 text-sm italic ${TINTA_SUAVE}`}>No hay facturación este día. Dicta arriba o añade una línea a mano.</div>
              )}
              <div className="space-y-3">
                {clientesOrden.map(cli => {
                  const lineas = facturaciones.filter(i => (i.cliente || '') === cli)
                  const sub = lineas.reduce((s, i) => s + (Number(i.importe) || 0), 0)
                  return (
                    <div key={cli || '(sin cliente)'} className="bg-[#fbf6e7] border border-[#e9dfc2] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <h3 className={`text-base font-bold underline underline-offset-4 decoration-[#cbb98d] ${TINTA}`}>{cli || 'Sin cliente'}</h3>
                        <Button size="sm" variant="ghost" onClick={() => abrirAddLinea('facturacion', undefined, cli)} className="h-7 text-xs text-[#1d4ed8] hover:bg-[#e5ebf7]">
                          <Plus className="h-3 w-3 mr-1" /> Línea
                        </Button>
                      </div>
                      <div>
                        {lineas.map(l => <LineaRow key={l.id} l={l} />)}
                      </div>
                      <div className={`mt-2 text-[15px] font-bold text-right ${TINTA}`}>Total; {fmtNum(sub)}€</div>
                    </div>
                  )
                })}
              </div>
              {facturaciones.length > 0 && (
                <>
                  <div className={`mt-3 pt-2 border-t-4 border-double border-[#cbb98d] text-lg font-bold text-center ${TINTA}`}>
                    Total; {fmtNum(totalFac)}€
                  </div>
                  {recuentosArr.length > 0 && (
                    <div className={`text-sm font-bold space-y-0.5 px-1 mt-2 ${TINTA}`}>
                      {recuentosArr.map(([dest, n]) => (
                        <div key={dest}>{dest}; {n}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── NOTAS DEL DÍA (Opus One "Daily Notes") ── */}
            <div className={`${PAPEL} p-4`}>
              <TituloSeccion>Notas del día</TituloSeccion>
              <textarea
                value={nota}
                onChange={e => cambiarNota(e.target.value)}
                onBlur={() => { if (notaTimerRef.current) clearTimeout(notaTimerRef.current); guardarNota(nota, fecha) }}
                placeholder="Apuntes libres del día (se guardan solos)…"
                rows={4}
                className="w-full bg-transparent border-0 border-b border-dashed border-[#ddd2b4] p-1 text-[15px] leading-relaxed focus:outline-none focus:border-[#7a1f2b] resize-y"
              />
              <div className={`text-[11px] text-right mt-1 ${TINTA_SUAVE}`}>
                {notaEstado === 'guardando' && 'Guardando…'}
                {notaEstado === 'guardada' && '✓ Guardado'}
                {notaEstado === 'error' && <span className="text-[#a33b30] font-bold">⚠ No se pudo guardar — toca la nota para reintentar</span>}
                {notaEstado === '' && <span> </span>}
              </div>
            </div>

            {/* Vaciar día */}
            {items.length > 0 && (
              <div className="text-center">
                <Button variant="outline" size="sm" onClick={vaciarDia} className="text-[#a33b30] border-[#dcc3b8] hover:bg-[#f3e0dd] bg-transparent">
                  <Trash2 className="h-4 w-4 mr-1" /> Vaciar el día
                </Button>
              </div>
            )}
          </>
        )}
        </div>{/* fin página derecha */}
      </div>{/* fin grid calendario | día */}

      {/* DIÁLOGO añadir/editar línea */}
      <Dialog open={!!form} onOpenChange={(open) => { if (!open) setForm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={SERIF}>
              {form?.mode === 'edit' ? 'Editar línea' : form?.tipo === 'logistica' ? `Nueva línea — Carga ${form?.carga}` : 'Nueva línea de facturación'}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Concepto</label>
                <Input
                  value={form.concepto}
                  onChange={e => setForm({ ...form, concepto: e.target.value })}
                  placeholder={form.tipo === 'logistica' ? 'Piking Bobinas, Hualsa/Milagro…' : 'Milca/Milagro, La Boquera/Milca…'}
                  list="agenda-diaria-conceptos"
                  className="mt-1"
                />
                <datalist id="agenda-diaria-conceptos">
                  {[...new Set([...conceptosLista, ...items.map(i => i.concepto).filter(Boolean)])].map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Importe €</label>
                  {/* V29.82: texto + inputMode decimal — acepta coma («9,5») */}
                  <Input type="text" inputMode="decimal" value={form.importeTxt || ''} onChange={e => setForm({ ...form, importeTxt: e.target.value, importe: parseNumEs(e.target.value) })} className="mt-1 text-right" placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Cantidad</label>
                  <Input type="text" inputMode="decimal" value={form.cantidadTxt || ''} onChange={e => setForm({ ...form, cantidadTxt: e.target.value, cantidad: parseNumEs(e.target.value) })} className="mt-1 text-right" placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Unidad</label>
                  <Input value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} placeholder="b, p, u…" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {form.tipo === 'logistica' ? (
                  <div>
                    <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Nº de carga</label>
                    <Input type="number" min="1" value={form.carga} onChange={e => setForm({ ...form, carga: Math.max(1, Number(e.target.value) || 1) })} className="mt-1" />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Cliente (agrupación)</label>
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
                  {/* V29.92 — prioridad estilo Opus One */}
                  <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Prioridad</label>
                  <select
                    value={form.prioridad}
                    onChange={e => setForm({ ...form, prioridad: e.target.value })}
                    className="mt-1 w-full h-10 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:border-[#7a1f2b]"
                  >
                    <option value="">— sin prioridad —</option>
                    {['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Nota</label>
                <Input value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} placeholder="Facturar a Vega, envases…" className="mt-1" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                <Button onClick={guardarForm} disabled={guardandoForm} className="bg-[#7a1f2b] hover:bg-[#5f1620] text-white">
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
