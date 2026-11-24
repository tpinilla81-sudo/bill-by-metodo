'use client'

// AGENDA DIARIA — Transportes Hualsa
// Diario por días con dos apartados:
//   - LOGÍSTICA: servicios del día agrupados en CARGAS (1, 2...) con subtotal
//     por carga y Total Día.
//   - FACTURACIÓN: entregas agrupadas por CLIENTE con total y recuentos por
//     destino (lo de antes de la "/").
// Cada línea es editable y borrable; también se pueden añadir a mano o desde
// el catálogo con click directo (V29.98).
// V29.99 — DICTADO eliminado: se quita Web Speech, Whisper y foto (VLM). Solo
// se añaden líneas a mano o desde el catálogo. Mucho más fiable.
// V29.92 — Estilo OPUS ONE (planner de papel): hoja crema con tipografía serif,
// tarjetas papel, tinta burdeos. PRIORIDADES A/B/C en cada línea (badge + orden
// dentro del grupo) y NOTAS DEL DÍA libres con autosave.
// V29.94 — Calendario MENSUAL en una página paralela (estilo Filofax/Opus One):
// a la izquierda el mes con flechas anterior/siguiente + "Ir a hoy" y marcadores
// (punto burdeos si hay logística, azul si hay facturación); a la derecha el día
// seleccionado con todo su contenido. En móvil se apila (calendario arriba).

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trash2, Plus, Loader2, Pencil, ChevronLeft, ChevronRight, CalendarDays, ListPlus, Search, ArrowRightLeft, Check } from 'lucide-react'

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
  traspasadoAt?: string | null // V29.99.3 — ISO date si la línea ya se traspasó a Registros
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

// ── V29.92 — clases del tema PAPEL (Opus One) ───────────────────────────────
const SERIF = "[font-family:Georgia,'Times_New_Roman',serif]"
const HOJA = 'bg-[#f6f1e2] border border-[#e3d8bc] rounded-2xl shadow-[0_2px_10px_rgba(90,70,20,0.10)]'
const PAPEL = 'bg-[#fffdf7] border border-[#e3d8bc] rounded-xl shadow-[0_1px_4px_rgba(90,70,20,0.08)]'
const TINTA = 'text-[#3d3225]'
const TINTA_SUAVE = 'text-[#8a7a55]'
const BURDEOS = '#7a1f2b'

// V29.99.13 — palabras clave que indican que un servicio del catálogo admite
// cantidad (palets, bobinas, descargas...). Si el nombre O el grupo las contiene,
// al añadir se abre el modal pidiendo la cantidad (1-30 + opción "otra").
// Incluye "descarga" y "carga" porque en el catálogo de Hualsa las descargas
// (DESCARGA CEPAC, DESCARGA RIALTO, CARGA PALETS...) siempre van por nº de palets.
const ADMITEN_CANTIDAD = /palet|bobina|doypack|rollo|pieza|unidad|caja|bulto|descarga|carga|movimiento/
function admiteCantidadPalabra(txt: string): boolean {
  return ADMITEN_CANTIDAD.test(String(txt || '').toLowerCase())
}

export function AgendaDiariaView() {
  const [fecha, setFecha] = useState(hoyISO())
  // V29.94 — mes mostrado en el calendario mensual (independiente del día seleccionado)
  const [mesCal, setMesCal] = useState(mesDeFecha(hoyISO()))
  const [marcadoresMes, setMarcadoresMes] = useState<Record<string, { log: boolean; fac: boolean; logTrasp: boolean; facTrasp: boolean }>>({})
  const [items, setItems] = useState<AgendaDiaLine[]>([])
  const [cargando, setCargando] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState<FormLine | null>(null) // diálogo editar/añadir
  const [guardandoForm, setGuardandoForm] = useState(false)
  const [flashIds, setFlashIds] = useState<string[]>([])
  const [clientesLista, setClientesLista] = useState<string[]>([]) // clientes del tenant (V29.82)
  const [conceptosLista, setConceptosLista] = useState<string[]>([]) // conceptos del catálogo (V29.83)
  // V29.98 — catálogo completo (nombre+grupo+precio+cliente) para el diálogo
  // "Del catálogo" con click directo. Cargado al inicio del día desde /api/agenda-diaria.
  const [catalogoLista, setCatalogoLista] = useState<{ nombre: string; grupo: string; precio: number; cliente: string }[]>([])
  // V29.99.11 — catálogoAbierto ahora es un objeto con contexto:
  //   tipo: 'logistica' | 'facturacion'
  //   cargaNueva?: true → crear una carga nueva (max+1) al confirmar
  //   cargaDestino?: number → añadir a esta carga existente (logística)
  //   clienteDestino?: string → asignar este cliente al crear (facturación)
  // Si no se especifica nada, comportamiento por defecto: logística → añadir a
  // la carga máxima existente (o crear la 1); facturación → cliente del catálogo.
  const [catalogoAbierto, setCatalogoAbierto] = useState<{
    tipo: 'logistica' | 'facturacion'
    cargaNueva?: boolean
    cargaDestino?: number
    clienteDestino?: string
  } | null>(null)
  const [catalogoBusq, setCatalogoBusq] = useState('')
  // V29.99.2 — modal propio para pedir cantidad/nota al añadir del catálogo.
  // Sustituye a prompt() nativo que iOS Safari bloquea en PWA standalone.
  // V29.99.11 — incluye el contexto (cargaNueva/cargaDestino/clienteDestino) para
  // que confirmarDesdeCatalogo sepa dónde añadir la línea.
  const [catSel, setCatSel] = useState<{
    item: { nombre: string; grupo: string; precio: number; cliente: string }
    tipo: 'logistica' | 'facturacion'
    cargaNueva?: boolean
    cargaDestino?: number
    clienteDestino?: string
  } | null>(null)
  const [catSelCantidad, setCatSelCantidad] = useState('') // texto del input (acepta coma decimal)
  const [catSelNota, setCatSelNota] = useState('')
  const [guardandoCat, setGuardandoCat] = useState(false)
  // V29.99.3 — traspaso a Registros
  const [traspasando, setTraspasando] = useState(false)
  // V29.99.9 — null = cerrado; 'logistica' | 'facturacion' = modal abierto para ese tipo
  const [confirmarTraspaso, setConfirmarTraspaso] = useState<null | 'logistica' | 'facturacion'>(null)
  // V29.92 — notas del día (Opus One "Daily Notes") con autosave
  const [nota, setNota] = useState('')
  const [notaEstado, setNotaEstado] = useState<'' | 'guardando' | 'guardada' | 'error'>('')
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notaGuardadaRef = useRef('') // último texto de nota GUARDADO en el servidor

  // Resalta líneas nuevas 6s (limpia el timer anterior para no pisar tandas)
  function flash(ids: string[]) {
    setFlashIds(ids)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashIds([]), 6000)
  }

  // Al desmontar: limpiar timers pendientes
  useEffect(() => () => {
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
        // V29.98 — catálogo completo para el diálogo "Del catálogo" (click directo)
        if (Array.isArray(data.catalogo)) setCatalogoLista(data.catalogo as { nombre: string; grupo: string; precio: number; cliente: string }[])
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

  // ── V29.98 — AÑADIR DEL CATÁLOGO: click directo en una entrada del catálogo.
  // V29.99.2 — ya NO usamos prompt() nativo (iOS lo bloquea en PWA). Abrimos un
  // modal propio que pide la cantidad (si aplica) y la nota (si aplica) y guarda.
  // V29.99.11 — propagamos el contexto (cargaNueva/cargaDestino/clienteDestino)
  // desde catalogoAbierto a catSel para que confirmarDesdeCatalogo sepa dónde
  // añadir la línea.
  function abrirDesdeCatalogo(item: { nombre: string; grupo: string; precio: number; cliente: string }) {
    if (!catalogoAbierto) return
    // Capturar el contexto antes de cerrar
    const { tipo, cargaNueva, cargaDestino, clienteDestino } = catalogoAbierto
    // V29.99.7 — cerrar el modal del catálogo ANTES de abrir el de cantidad.
    setCatalogoAbierto(null)
    setCatalogoBusq('')
    setCatSel({ item, tipo, cargaNueva, cargaDestino, clienteDestino })
    // V29.99.13 — admiteCantidad ahora también para descargas/cargas/movimientos
    const txt = (item.nombre + ' ' + item.grupo).toLowerCase()
    const admiteCantidad = admiteCantidadPalabra(txt)
    setCatSelCantidad(admiteCantidad ? '1' : '')
    setCatSelNota('')
  }

  // Confirma el alta de la línea seleccionada (llamado por el modal).
  async function confirmarDesdeCatalogo() {
    if (!catSel) return
    const { item, tipo, cargaNueva, cargaDestino, clienteDestino } = catSel
    const txt = (item.nombre + ' ' + item.grupo).toLowerCase()
    const admiteCantidad = admiteCantidadPalabra(txt)

    let cantidad = 0
    let unidad = ''
    let importe = item.precio
    let nota = catSelNota.trim()

    if (admiteCantidad) {
      const n = parseNumEs(catSelCantidad)
      if (n <= 0) { setMsg('⚠ Cantidad no válida — no se ha añadido nada'); return }
      cantidad = n
      if (/palet/.test(txt)) unidad = 'p'
      else if (/bobina/.test(txt)) unidad = 'b'
      else if (/rollo/.test(txt)) unidad = 'rollos'
      else if (/doypack/.test(txt)) unidad = 'p'
      else unidad = 'u'
      importe = Math.round(n * item.precio * 100) / 100
    }

    // V29.99.11 — Cálculo de carga según contexto (logística):
    //   - cargaNueva: max+1 (o 1 si no hay)
    //   - cargaDestino: esa carga específica
    //   - sin contexto (Del catálogo general): max si hay, o 1
    let carga = 0
    if (tipo === 'logistica') {
      if (cargaNueva) {
        carga = cargasNums.length > 0 ? Math.max(...cargasNums) + 1 : 1
      } else if (cargaDestino !== undefined) {
        carga = cargaDestino
      } else {
        carga = cargasNums.length > 0 ? Math.max(...cargasNums) : 1
      }
    }

    // Facturación: cliente del catálogo si la entrada lo tiene, o el clienteDestino
    let cliente = ''
    if (tipo === 'facturacion') {
      if (clienteDestino) cliente = clienteDestino
      else if (item.cliente) cliente = item.cliente
    }

    setGuardandoCat(true)
    setMsg('')
    try {
      const body: any = {
        fecha, tipo,
        carga,
        cliente,
        concepto: item.nombre,
        nota,
        cantidad,
        unidad,
        importe,
        prioridad: '',
      }
      const res = await fetch('/api/agenda-diaria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setMsg('⚠ ' + (data.error || 'Error guardando')); return }
      await cargar(fecha)
      flash((data.items || []).map((x: AgendaDiaLine) => x.id))
      setMsg(`✓ Añadido: ${item.nombre} — ${fmtNum(importe)}€${cantidad > 0 ? ` (${fmtNum(cantidad)}${unidad})` : ''}`)
      setCatSel(null) // cerrar modal
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    } finally {
      setGuardandoCat(false)
    }
  }

  // V29.99.3 — Traspasar las líneas de logística del día a Registros.
  // V29.99.9 — y facturación también (lo mismo pero con tipo='facturacion').
  // Pide confirmación antes (abre el modal confirmarTraspaso con el tipo).
  // Solo traspasa las que aún no están traspasadas (traspasadoAt === null).
  async function traspasar(tipo: 'logistica' | 'facturacion') {
    setConfirmarTraspaso(null) // cerrar modal
    setTraspasando(true)
    setMsg('')
    try {
      const res = await fetch('/api/agenda-diaria/traspasar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, tipo }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg('⚠ ' + (data.error || 'Error traspasando')); return }
      await cargar(fecha)
      const label = tipo === 'facturacion' ? 'facturación' : 'logística'
      setMsg(`✓ Traspasadas ${data.count} líneas de ${label} a Registros${data.yaTraspasadas ? ` (${data.yaTraspasadas} ya estaban traspasadas)` : ''}`)
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    } finally {
      setTraspasando(false)
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
    const traspasada = !!l.traspasadoAt
    return (
      <div className={`group flex items-start gap-2 py-1.5 border-b border-dashed border-[#ddd2b4] last:border-b-0 ${flash ? 'bg-[#eef4e2] rounded-md px-2 -mx-2' : ''} ${traspasada ? 'opacity-50' : ''}`}>
        <span className="pt-[3px] shrink-0"><BadgePrioridad p={l.prioridad || ''} /></span>
        <div className={`flex-1 min-w-0 text-[15px] leading-snug ${TINTA} ${traspasada ? 'line-through' : ''}`}>
          {/* V29.99.1 — punto (bullet) delante de cada línea, como lista de texto */}
          <span className="font-bold mr-1 leading-none">•</span>
          <span className="font-bold">{l.concepto}</span>
          <span className={TINTA_SUAVE}>; </span>
          <span className="font-bold">{fmtNum(l.importe)}€</span>
          {l.cantidad > 0 && <span className="font-bold">. {fmtNum(l.cantidad)}{l.unidad ? l.unidad : ''}.</span>}
          {l.nota && <span className="font-bold"> {l.nota}</span>}
          {/* V29.99.3 — marca de traspasada */}
          {traspasada && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide text-[#2d6a4f] font-bold no-underline">
              <Check className="h-3 w-3" /> en registro
            </span>
          )}
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
                      title={celda.fuera ? '' : (marc ? `${marc.log ? 'logística' : ''}${marc.log && marc.fac ? ' + ' : ''}${marc.fac ? 'facturación' : ''}${marc.logTrasp || marc.facTrasp ? ' (con traspaso a registro)' : ''}` : 'día sin apuntes')}
                    >
                      <span>{celda.dia}</span>
                      {/* Marcadores: punto burdeos (logística) + punto azul (facturación).
                          V29.99.5 — si está traspasado a registro, el punto lleva un círculo alrededor. */}
                      {marc && (marc.log || marc.fac) && !esSel && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {marc.log && <span className={`h-1.5 w-1.5 rounded-full bg-[#7a1f2b] ${marc.logTrasp ? 'ring-1 ring-[#7a1f2b] ring-offset-[1px] ring-offset-[#f6f1e2]' : ''}`} />}
                          {marc.fac && <span className={`h-1.5 w-1.5 rounded-full bg-[#1d4ed8] ${marc.facTrasp ? 'ring-1 ring-[#1d4ed8] ring-offset-[1px] ring-offset-[#f6f1e2]' : ''}`} />}
                        </span>
                      )}
                      {/* En el día seleccionado los puntos en blanco para que se vean */}
                      {marc && (marc.log || marc.fac) && esSel && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {marc.log && <span className={`h-1.5 w-1.5 rounded-full bg-[#fdf6e9] ${marc.logTrasp ? 'ring-1 ring-[#fdf6e9] ring-offset-[1px] ring-offset-[#7a1f2b]' : ''}`} />}
                          {marc.fac && <span className={`h-1.5 w-1.5 rounded-full bg-[#9ec5ff] ${marc.facTrasp ? 'ring-1 ring-[#9ec5ff] ring-offset-[1px] ring-offset-[#7a1f2b]' : ''}`} />}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Leyenda */}
          <div className={`mt-2 pt-2 border-t border-dashed border-[#ddd2b4] flex items-center gap-3 text-[10px] ${TINTA_SUAVE} flex-wrap`}>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#7a1f2b]" />Logística</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#1d4ed8]" />Facturación</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#7a1f2b] ring-1 ring-[#7a1f2b] ring-offset-[1px] ring-offset-[#f6f1e2]" />Traspasado a registro</span>
          </div>
        </aside>

        {/* ── PÁGINA DERECHA: el día seleccionado ── */}
        <div className={`${HOJA} p-3 sm:p-5 space-y-4`}>

        {/* Cabecera de la página (planner) */}
        <div className="text-center pt-1">
          <div className={`text-[10px] tracking-[0.35em] uppercase ${TINTA_SUAVE}`}>Transportes Hualsa</div>
          <h1 className="text-[26px] leading-tight font-bold text-[#7a1f2b] mt-0.5">Agenda Diaria</h1>
          <p className={`text-xs italic mt-0.5 ${TINTA_SUAVE}`}>Tu día en una página — añade servicios del catálogo con un toque</p>
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

        {msg && (
          <div className={`text-sm font-bold px-3 py-2 rounded-lg border ${msg.startsWith('✓') ? 'bg-[#eef4e2] text-[#4a6b2f] border-[#d3e0c0]' : 'bg-[#f7ecd7] text-[#8a5a19] border-[#e8d3a8]'}`}>{msg}</div>
        )}

        {cargando ? (
          <div className={`flex items-center justify-center py-10 ${TINTA_SUAVE}`}><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando agenda…</div>
        ) : (
          <>
            {/* ── LOGÍSTICA: cargas 1, 2, 3... con subtotal ── */}
            <div className={`${PAPEL} p-4`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TituloSeccion>Logística Hualsa</TituloSeccion>
                {/* V29.99.12 — botón único "Nueva carga" (el de "Del catálogo" era
                    redundante: el botón "Línea" dentro de cada carga ya abre el
                    mismo diálogo del catálogo con su contexto). */}
                <button onClick={() => { setCatalogoAbierto({ tipo: 'logistica', cargaNueva: true }); setCatalogoBusq('') }} className="text-xs text-[#7a1f2b] hover:underline flex items-center gap-1 mb-2 shrink-0">
                  <Plus className="h-3.5 w-3.5" /> Nueva carga
                </button>
              </div>
              {cargasNums.length === 0 && (
                <div className={`text-center py-6 text-sm italic ${TINTA_SUAVE}`}>No hay cargas este día. Pulsa «Nueva carga» para empezar.</div>
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
                          <Button size="sm" variant="ghost" onClick={() => { setCatalogoAbierto({ tipo: 'logistica', cargaDestino: c }); setCatalogoBusq('') }} className="h-7 text-xs text-[#7a1f2b] hover:bg-[#f1e8d2]">
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
              {/* V29.99.3 — Pasar logística a Registros. Solo si hay líneas
                  pendientes (no traspasadas). Pide confirmación antes. */}
              {logisticas.some(l => !l.traspasadoAt) && (
                <div className="mt-3 flex justify-center">
                  <Button
                    onClick={() => setConfirmarTraspaso('logistica')}
                    disabled={traspasando}
                    className="bg-[#2d6a4f] hover:bg-[#1b4332] text-white"
                    title="Crear registros en la sección REGISTROS a partir de las líneas de logística pendientes de traspasar"
                  >
                    {traspasando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                    {traspasando ? 'Traspasando…' : 'Pasar a registro'}
                  </Button>
                </div>
              )}
              {logisticas.length > 0 && logisticas.every(l => l.traspasadoAt) && (
                <div className={`mt-3 text-center text-xs italic ${TINTA_SUAVE} flex items-center justify-center gap-1`}>
                  <Check className="h-3.5 w-3.5 text-[#2d6a4f]" /> Logística traspasada a Registros
                </div>
              )}
            </div>

            {/* ── FACTURACIÓN: grupos por cliente + recuentos ── */}
            <div className={`${PAPEL} p-4`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TituloSeccion color="#1d4ed8">Facturación del día</TituloSeccion>
                {/* V29.99.12 — botón único "Nueva línea" (paralelo a "Nueva carga"
                    de logística). El botón "Línea" dentro de cada cliente abre el
                    mismo diálogo del catálogo con ese cliente pre-seleccionado. */}
                <button onClick={() => { setCatalogoAbierto({ tipo: 'facturacion' }); setCatalogoBusq('') }} className="text-xs text-[#1d4ed8] hover:underline flex items-center gap-1 mb-2 font-bold" title="Elegir un servicio del catálogo y añadirlo con su cliente e importe automático">
                  <Plus className="h-3.5 w-3.5" /> Nueva línea
                </button>
              </div>
              {facturaciones.length === 0 && (
                <div className={`text-center py-6 text-sm italic ${TINTA_SUAVE}`}>No hay facturación este día. Pulsa «Nueva línea» para empezar.</div>
              )}
              <div className="space-y-3">
                {clientesOrden.map(cli => {
                  const lineas = facturaciones.filter(i => (i.cliente || '') === cli)
                  const sub = lineas.reduce((s, i) => s + (Number(i.importe) || 0), 0)
                  return (
                    <div key={cli || '(sin cliente)'} className="bg-[#fbf6e7] border border-[#e9dfc2] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <h3 className={`text-base font-bold underline underline-offset-4 decoration-[#cbb98d] ${TINTA}`}>{cli || 'Sin cliente'}</h3>
                        <Button size="sm" variant="ghost" onClick={() => { setCatalogoAbierto({ tipo: 'facturacion', clienteDestino: cli }); setCatalogoBusq('') }} className="h-7 text-xs text-[#1d4ed8] hover:bg-[#e5ebf7]">
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
              {/* V29.99.9 — Pasar facturación a Registros (igual que logística).
                  Solo si hay líneas pendientes (no traspasadas). Pide confirmación. */}
              {facturaciones.some(l => !l.traspasadoAt) && (
                <div className="mt-3 flex justify-center">
                  <Button
                    onClick={() => setConfirmarTraspaso('facturacion')}
                    disabled={traspasando}
                    className="bg-[#2d6a4f] hover:bg-[#1b4332] text-white"
                    title="Crear registros en la sección REGISTROS a partir de las líneas de facturación pendientes de traspasar"
                  >
                    {traspasando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                    {traspasando ? 'Traspasando…' : 'Pasar a registro'}
                  </Button>
                </div>
              )}
              {facturaciones.length > 0 && facturaciones.every(l => l.traspasadoAt) && (
                <div className={`mt-3 text-center text-xs italic ${TINTA_SUAVE} flex items-center justify-center gap-1`}>
                  <Check className="h-3.5 w-3.5 text-[#2d6a4f]" /> Facturación traspasada a Registros
                </div>
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
                  {/* V29.99.10 — desplegable de cantidad (0-30 + opción "otra") igual que el catálogo. */}
                  {(() => {
                    const valorActual = form.cantidadTxt && form.cantidadTxt !== '' && form.cantidadTxt !== '+30'
                      ? String(Math.round(parseNumEs(form.cantidadTxt)))
                      : (form.cantidad > 0 ? String(Math.round(form.cantidad)) : '0')
                    const esOtra = form.cantidadTxt === '+30' || (form.cantidad > 30)
                    return (
                      <>
                        <select
                          value={esOtra ? '+30' : valorActual}
                          onChange={e => {
                            if (e.target.value === '+30') {
                              setForm({ ...form, cantidadTxt: '+30', cantidad: 0 })
                            } else {
                              const n = parseNumEs(e.target.value)
                              setForm({ ...form, cantidadTxt: e.target.value, cantidad: n })
                            }
                          }}
                          className="mt-1 w-full h-10 px-2 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:border-[#7a1f2b]"
                        >
                          <option value="0">0</option>
                          {Array.from({ length: 30 }, (_, i) => String(i + 1)).map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                          <option value="+30">+30 (otra)</option>
                        </select>
                        {esOtra && (
                          <Input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            value={form.cantidadTxt === '+30' ? '' : form.cantidadTxt}
                            onChange={e => setForm({ ...form, cantidadTxt: e.target.value, cantidad: parseNumEs(e.target.value) })}
                            placeholder="31"
                            className="mt-1 text-right"
                          />
                        )}
                      </>
                    )
                  })()}
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

      {/* V29.98 — DIÁLOGO "DEL CATÁLOGO": lista navegable con buscador.
          Click en una entrada → crea la línea con importe automático. */}
      <Dialog open={!!catalogoAbierto} onOpenChange={(open) => { if (!open) { setCatalogoAbierto(null); setCatalogoBusq('') } }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className={SERIF}>
              {/* V29.99.11 — el título muestra el contexto (carga nueva, carga X, para cliente X) */}
              {(() => {
                if (!catalogoAbierto) return 'Añadir servicio'
                if (catalogoAbierto.tipo === 'logistica') {
                  if (catalogoAbierto.cargaNueva) return 'Nueva carga — elige servicio'
                  if (catalogoAbierto.cargaDestino !== undefined) return `Carga ${catalogoAbierto.cargaDestino} — elige servicio`
                  return 'Logística — elige servicio'
                }
                if (catalogoAbierto.clienteDestino) return `${catalogoAbierto.clienteDestino} — elige servicio`
                return 'Facturación — elige servicio'
              })()}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a7a55]" />
              <input
                autoFocus
                value={catalogoBusq}
                onChange={e => setCatalogoBusq(e.target.value)}
                placeholder="Buscar servicio..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-[#e3d8bc] rounded-md bg-[#fffdf7] focus:outline-none focus:border-[#7a1f2b]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
            {catalogoLista.length === 0 && (
              <div className={`text-center py-6 text-sm italic ${TINTA_SUAVE}`}>
                No hay servicios en el catálogo todavía.<br/>
                Cuando des de alta servicios en CATÁLOGO aparecerán aquí para añadirlos con un toque.
              </div>
            )}
            {catalogoLista.length > 0 && (() => {
              const q = catalogoBusq.trim().toLowerCase()
              const filtrados = q
                ? catalogoLista.filter(c => (c.nombre + ' ' + c.grupo + ' ' + c.cliente).toLowerCase().includes(q))
                : catalogoLista
              if (filtrados.length === 0) {
                return <div className={`text-center py-4 text-sm italic ${TINTA_SUAVE}`}>No hay coincidencias para «{catalogoBusq}»</div>
              }
              // Ordenar: primero por grupo (MILCA, NAVE, HUALSA...) y luego por nombre
              const ordenados = [...filtrados].sort((a, b) => {
                const g = a.grupo.localeCompare(b.grupo)
                return g !== 0 ? g : a.nombre.localeCompare(b.nombre)
              })
              return ordenados.map((c, i) => (
                <button
                  key={i}
                  onClick={() => { abrirDesdeCatalogo(c) }}
                  className="w-full text-left px-3 py-2 rounded-md border border-[#e3d8bc] bg-[#fffdf7] hover:bg-[#f1e8d2] hover:border-[#7a1f2b] transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-bold ${TINTA} truncate`}>{c.nombre}</div>
                    <div className={`text-[10px] uppercase tracking-wide ${TINTA_SUAVE}`}>
                      {c.grupo}{c.cliente ? ` · ${c.cliente}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[#7a1f2b]">{fmtNum(c.precio)}€</div>
                    {catalogoAbierto?.tipo === 'facturacion' && c.cliente && (
                      <div className={`text-[10px] ${TINTA_SUAVE}`}>cli: {c.cliente}</div>
                    )}
                  </div>
                </button>
              ))
            })()}
          </div>
          <div className={`text-xs ${TINTA_SUAVE} pt-2 border-t border-[#e3d8bc] mt-1`}>
            {catalogoAbierto?.tipo === 'logistica'
              ? 'Pulsa un servicio para añadirlo. Si lleva cantidad (palets, bobinas...) te la pedirá.'
              : 'Pulsa un servicio para añadirlo con su cliente e importe. Si lleva cantidad te la pedirá.'}
          </div>
        </DialogContent>
      </Dialog>

      {/* V29.99.2 — MODAL para pedir cantidad (y nota opcional) al añadir del catálogo.
          Sustituye al prompt() nativo que iOS bloquea en PWA standalone. */}
      <Dialog open={!!catSel} onOpenChange={(open) => { if (!open && !guardandoCat) setCatSel(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={SERIF}>
              {catSel?.item.nombre}
            </DialogTitle>
          </DialogHeader>
          {catSel && (() => {
            const txt = (catSel.item.nombre + ' ' + catSel.item.grupo).toLowerCase()
            const admiteCantidad = admiteCantidadPalabra(txt)
            const cantNum = parseNumEs(catSelCantidad)
            const importeCalc = admiteCantidad && cantNum > 0
              ? Math.round(cantNum * catSel.item.precio * 100) / 100
              : catSel.item.precio
            return (
              <div className="space-y-3">
                <div className={`text-sm ${TINTA_SUAVE}`}>
                  {/* V29.99.11 — mostrar contexto (carga nueva, carga X, para cliente X) */}
                  {catSel.tipo === 'logistica'
                    ? (catSel.cargaNueva
                        ? 'Nueva carga'
                        : (catSel.cargaDestino !== undefined ? `Carga ${catSel.cargaDestino}` : 'Logística'))
                    : (catSel.clienteDestino
                        ? `Facturación · ${catSel.clienteDestino}`
                        : (catSel.item.cliente ? `Facturación · ${catSel.item.cliente}` : 'Facturación'))}
                  {' · '}{catSel.item.grupo}
                  {catSel.tipo === 'facturacion' && catSel.item.cliente && !catSel.clienteDestino ? ` · cliente: ${catSel.item.cliente}` : ''}
                </div>

                {admiteCantidad && (
                  <div>
                    <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Cantidad</label>
                    <div className="flex items-center gap-2 mt-1">
                      {/* V29.99.4 — selector desplegable de cantidad (más fácil en móvil que teclear) */}
                      <select
                        value={catSelCantidad === '' ? '1' : catSelCantidad}
                        onChange={e => setCatSelCantidad(e.target.value)}
                        className="h-12 px-3 text-lg font-bold rounded-md border border-[#e3d8bc] bg-[#fffdf7] text-[#3d3225] focus:outline-none focus:border-[#7a1f2b]"
                      >
                        {Array.from({ length: 30 }, (_, i) => String(i + 1)).map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                        <option value="+30">+30 (otra)</option>
                      </select>
                      {catSelCantidad === '+30' && (
                        <Input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={catSelCantidad === '+30' ? '' : catSelCantidad}
                          onChange={e => setCatSelCantidad(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') confirmarDesdeCatalogo() }}
                          placeholder="31"
                          className="text-right text-lg font-bold w-24"
                        />
                      )}
                      <span className={`text-sm ${TINTA_SUAVE}`}>
                        × {fmtNum(catSel.item.precio)}€/ud
                      </span>
                    </div>
                  </div>
                )}

                {/* Vista previa del importe calculado */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-md bg-[#fbf6e7] border border-[#e3d8bc] ${SERIF}`}>
                  <span className={`text-xs uppercase tracking-wide ${TINTA_SUAVE}`}>Importe</span>
                  <span className="text-xl font-bold text-[#7a1f2b]">{fmtNum(importeCalc)}€</span>
                </div>

                {/* Nota opcional (facturación sin cantidad, o cualquier caso) */}
                <div>
                  <label className="text-xs font-bold text-[#8a7a55] uppercase tracking-wide">Nota (opcional)</label>
                  <Input
                    value={catSelNota}
                    onChange={e => setCatSelNota(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmarDesdeCatalogo() }}
                    placeholder="Facturar a Vega, envases..."
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setCatSel(null)} disabled={guardandoCat}>Cancelar</Button>
                  <Button onClick={confirmarDesdeCatalogo} disabled={guardandoCat || (admiteCantidad && (catSelCantidad === '+30' || parseNumEs(catSelCantidad) <= 0))} className="bg-[#7a1f2b] hover:bg-[#5f1620] text-white">
                    {guardandoCat ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {guardandoCat ? 'Guardando…' : 'Añadir a la agenda'}
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* V29.99.3 — Confirmación de traspaso a Registros.
          V29.99.9 — funciona para logística Y facturación. */}
      <Dialog open={!!confirmarTraspaso} onOpenChange={(open) => { if (!open && !traspasando) setConfirmarTraspaso(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={SERIF}>Pasar {confirmarTraspaso === 'facturacion' ? 'facturación' : 'logística'} a Registros</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className={`text-sm ${TINTA}`}>
              {(() => {
                const lista = confirmarTraspaso === 'facturacion' ? facturaciones : logisticas
                const label = confirmarTraspaso === 'facturacion' ? 'facturación' : 'logística'
                return <>Se van a crear <strong>{lista.filter(l => !l.traspasadoAt).length} registros</strong> en la sección <strong>REGISTROS</strong> a partir de las líneas de {label} del día <strong>{fmtFechaLarga(fecha)}</strong>.</>
              })()}
            </p>
            <ul className={`text-xs ${TINTA_SUAVE} list-disc pl-4 space-y-0.5`}>
              <li>Cada línea se convierte en un registro (c1/c2 del catálogo, fecha de la agenda).</li>
              <li>Cliente, precio y descripción se rellenan del catálogo si faltan.</li>
              <li>Las líneas se marcan como <em>traspasadas</em> en la agenda para no duplicarlas.</li>
              <li>Las que ya están traspasadas se saltan.</li>
              <li>Puedes seguir editando las líneas después (la marca no lo impide).</li>
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setConfirmarTraspaso(null)} disabled={traspasando}>Cancelar</Button>
              <Button onClick={() => confirmarTraspaso && traspasar(confirmarTraspaso)} disabled={traspasando || !confirmarTraspaso} className="bg-[#2d6a4f] hover:bg-[#1b4332] text-white">
                {traspasando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                {traspasando ? 'Traspasando…' : 'Sí, traspasar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
