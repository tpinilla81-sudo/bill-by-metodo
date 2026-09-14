// ─── ALMACÉN: librería compartida ──────────────────────────────────────
// Motor de stock + configuración de estanterías/huecos + hueco óptimo.
// La usan STOCK ALMACÉN (mapa) y las vistas de ENTRADA (asignación
// automática del hueco) para que ambas vean EXACTAMENTE lo mismo:
//  · la configuración vive en localStorage ('stock-config-v2')
//  · el stock se calcula de los registros (ENTRADA PALET + / SALIDA PALET −)
import type { Registro } from '@/lib/hualsa-utils'

// ─── Tipos ─────────────────────────────────────────────────────────────
export interface LoteStock {
  id: string
  fecha: string
  clienteId: string
  ubicacion: string
  ident: string
  cantTotal: number
  cantRestante: number
}

export interface CeldaStock {
  ubicacion: string
  rack: string
  pos: string
  total: number
  dias: number      // días del lote más antiguo
  lotes: LoteStock[]
}

export interface RackStock {
  name: string
  total: number
  celdas: CeldaStock[]
}

// El almacén se define a partir de ESTANTERÍAS y sus HUECOS: cada estantería
// tiene un nombre y un nº de huecos, y cada hueco se nombra automáticamente
// (E1 con 12 huecos → E1-01, E1-02 … E1-12). El mapa del almacén se dibuja
// a partir de esta configuración; los huecos sin palets se ven como LIBRE.
export interface EstanteriaCfg {
  id: string        // id estable (keys de React)
  nombre: string    // "E1" — prefijo con el que se nombran los huecos
  huecos: number    // nº de huecos de la estantería
  cap: number       // capacidad máx. de palets (0 = sin límite) — opcional
  alias?: string[]  // nombres antiguos de la estantería: los palets registrados
                    // con ellos siguen apareciendo en el mapa tras un renombrado
}

export interface RacksResultado {
  racks: RackStock[]       // estanterías configuradas, con TODOS sus huecos
  fuera: CeldaStock[]      // stock en ubicaciones que no están en la configuración
  totalHuecos: number      // nº total de huecos configurados
  huecosOcupados: number   // huecos con al menos 1 palet
}

// ─── Normalización / utilidades ────────────────────────────────────────
export function normAlm(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ¿El CONCEPTO 2 del registro es "ENTRADA PALET"? (en las vistas de entrada
// se usa sobre el c2 del formulario)
export function esC2EntradaPalet(c2: string): boolean {
  return /entrada palet/.test(normAlm(c2))
}

export function isEntradaPalet(r: Registro): boolean {
  return esC2EntradaPalet(r.c2)
}

export function isSalidaPalet(r: Registro): boolean {
  return /salida palet/.test(normAlm(r.c2))
}

export function extractIdents(r: Registro): { strong: Record<string, string>; weak: Record<string, string> } {
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

export function getUbicacion(r: Registro): string {
  const { weak } = extractIdents(r)
  return Object.values(weak)[0] || ''
}

export function getIdent(r: Registro): string {
  const { strong } = extractIdents(r)
  return Object.values(strong)[0] || ''
}

// "E1-03" → { rack: 'E1', pos: '03' } · "Nave 2 Paso B" → { rack: 'NAVE', pos: '2-PASO-B' }
export function splitUbicacion(ub: string): { rack: string; pos: string } {
  const t = String(ub || '').trim()
  if (!t) return { rack: 'SIN UBICACIÓN', pos: '' }
  const parts = t.split(/[\s\-_/.]+/).filter(Boolean)
  if (parts.length >= 2) return { rack: parts[0].toUpperCase(), pos: parts.slice(1).join('-').toUpperCase() }
  return { rack: 'ALMACÉN', pos: t.toUpperCase() }
}

// Clave robusta para emparejar ubicaciones de los movimientos con huecos
// configurados: "E1-03", "e1 3", "E1/03" → todas → "E-1-3" (bloques de
// letras y números, sin acentos, sin ceros a la izquierda, sin separadores).
export function normHuecoKey(s: string): string {
  const t = String(s || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!t) return ''
  return (t.match(/[A-Z]+|[0-9]+/g) || [])
    .map(tok => (/^[0-9]+$/.test(tok) ? String(parseInt(tok, 10)) : tok))
    .join('-')
}

// Número de hueco con ceros: hueco 3 de 12 → "03" · hueco 5 de 120 → "005"
export function padPos(n: number, total: number): string {
  return String(n).padStart(Math.max(2, String(total).length), '0')
}

// Días que un palet lleva en almacén: fechaEntrada → ahora.
// El día de entrada cuenta como 1 día (ambos inclusive), como en facturación.
// Recibe `refNow` (ms) para forzar recálculo limpio cuando el reloj avanza.
export function diasEnAlmacen(fecha: string, refNow: number = Date.now()): number {
  const d = new Date(fecha + 'T00:00:00')
  if (isNaN(d.getTime())) return 0
  // Diferencia en ms → redondear a días naturales completados + 1 (día inicial inclusive)
  // Ej: entrada hoy → 1 día. Entrada ayer → 2 días.
  const diffDays = Math.floor((refNow - d.getTime()) / 86400000)
  return Math.max(1, diffDays + 1)
}

// ─── Motor de stock ────────────────────────────────────────────────────
// Recorre los movimientos por orden de fecha y va consumiendo lotes.
// Salida sin coincidencia → descuenta del lote más antiguo.
export function buildStock(registros: Registro[], clientesFiltro: string[]): LoteStock[] {
  const movs = registros
    .filter(r => isEntradaPalet(r) || isSalidaPalet(r))
    .filter(r => clientesFiltro.length === 0 || clientesFiltro.includes(r.clienteId || ''))
    // Orden cronológico: fecha, y dentro del mismo día por createdAt (la API
    // devuelve desc por createdAt; sin este desempate una SALIDA creada después
    // de su ENTRADA el mismo día se procesaría antes y consumiría FIFO).
    .sort((a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      String(a.createdAt || '').localeCompare(String(a.createdAt || '')) ||
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

// El mapa se dibuja SOLO a partir de la configuración (estantería → nº de
// huecos). Cada hueco se nombra automáticamente RACK-01…N; los que no tienen
// palets se ven LIBRE. El stock que cae en ubicaciones fuera de la
// configuración (o sin ubicación) se devuelve aparte para no perder nada.
export function buildRacks(stock: LoteStock[], cfg: EstanteriaCfg[], refNow: number): RacksResultado {
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
export function nombresHuecos(nombre: string, huecos: number): string[] {
  const n = String(nombre || '').trim().toUpperCase()
  if (!n || huecos <= 0) return []
  return Array.from({ length: huecos }, (_, i) => `${n}-${padPos(i + 1, huecos)}`)
}

// Estanterías detectadas en los movimientos (para sugerir su configuración):
// rack → nº de hueco máximo visto y nº de movimientos.
export function detectarEstanterias(registros: Registro[]): { nombre: string; maxPos: number; movs: number }[] {
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

// ─── Persistencia de la configuración (localStorage) ───────────────────
export const ALMACEN_CFG_KEY = 'stock-config-v2'

// Lee la configuración del almacén (estanterías + huecos) del localStorage,
// migrando las claves antiguas 'stock-config' y 'stock-capacidades' si existen.
// SSR-safe: en el servidor devuelve [].
export function loadAlmacenCfg(): EstanteriaCfg[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ALMACEN_CFG_KEY)
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
}

export function saveAlmacenCfg(cfg: EstanteriaCfg[]): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(ALMACEN_CFG_KEY, JSON.stringify(cfg)) } catch { /* quota */ }
}

// ─── HUECO ÓPTIMO (asignación automática en ENTRADA) ───────────────────
// Claves (normHuecoKey) de las ubicaciones que tienen stock ahora mismo:
// un hueco cuya clave está aquí está OCUPADO (los alias cuentan: si la
// estantería E1 se llamaba B1, el stock en "B1-03" ocupa "E1-03").
export function clavesOcupadas(registros: Registro[]): Set<string> {
  const s = new Set<string>()
  for (const l of buildStock(registros, [])) {
    const k = normHuecoKey(l.ubicacion)
    if (k) s.add(k)
  }
  return s
}

export interface HuecoOptimo {
  hueco: string     // nombre completo, p.ej. "E1-04"
  rack: string      // estantería, p.ej. "E1"
  pos: string       // nº de hueco, p.ej. "04"
}

// Estanterías válidas de la configuración, saneadas y en su ORDEN de
// configuración (el orden en que el usuario las creó = su orden físico).
function estanteriasValidas(cfg: EstanteriaCfg[]): { nombre: string; huecos: number; alias: string[] }[] {
  return cfg
    .map(e => ({
      nombre: String(e?.nombre || '').trim().toUpperCase(),
      huecos: Math.max(0, Math.min(200, Number(e.huecos) || 0)),
      alias: (e.alias || []).map(a => String(a || '').trim().toUpperCase()).filter(Boolean),
    }))
    .filter(e => e.nombre && e.huecos > 0)
}

function tokensRack(nombre: string): string[] {
  return normHuecoKey(nombre).split('-').filter(Boolean)
}

// Hueco libre óptimo para colocar un palet nuevo:
//  · sin prefijo → el primer hueco libre de la primera estantería con sitio
//    (en el orden en que están configuradas)
//  · con prefijo ("E2", "e2-", "NAVE 2"…) → el primer hueco libre de ESA
//    estantería (reconoce también los alias)
//  · extraOcupadas → ubicaciones ya asignadas en la misma tanda (p.ej. otras
//    filas de la grilla que aún no se han guardado) que no deben repetirse
// Devuelve null si no hay configuración o si todo está lleno.
export function huecoOptimo(
  cfg: EstanteriaCfg[],
  ocupadas: Set<string>,
  prefijo = '',
  extraOcupadas: string[] = []
): HuecoOptimo | null {
  const estanterias = estanteriasValidas(cfg)
  if (estanterias.length === 0) return null

  const ocup = ocupadas
  const extra = new Set<string>()
  for (const u of extraOcupadas) {
    const k = normHuecoKey(u)
    if (k) extra.add(k)
  }

  // ¿Prefijo que apunta a una estantería concreta? "E2-0" → tokens [E,2,0];
  // la estantería "E2" (tokens [E,2]) encaja al inicio. Gana la coincidencia
  // MÁS LARGA (entre "E" y "E1", el prefijo "E1" elige "E1").
  const prefTokens = normHuecoKey(prefijo).split('-').filter(Boolean)
  let candidatas = estanterias
  if (prefTokens.length > 0) {
    const conMatch = estanterias
      .map(e => {
        let mejor = 0
        for (const n of [e.nombre, ...e.alias]) {
          const t = tokensRack(n)
          if (t.length === 0 || t.length > prefTokens.length) continue
          if (t.every((tok, i) => tok === prefTokens[i])) mejor = Math.max(mejor, t.length)
        }
        return { e, mejor }
      })
      .filter(x => x.mejor > 0)
    if (conMatch.length === 0) return null  // prefijo que no corresponde a ninguna estantería
    const top = Math.max(...conMatch.map(x => x.mejor))
    candidatas = conMatch.filter(x => x.mejor === top).map(x => x.e)
  }

  for (const e of candidatas) {
    const prefijos = [e.nombre, ...e.alias].filter(Boolean)
    for (let n = 1; n <= e.huecos; n++) {
      const pos = padPos(n, e.huecos)
      // El hueco está ocupado si ALGUNA de sus claves (nombre actual o alias)
      // tiene stock — así un renombrado nunca "libera" huecos con palets.
      let libre = true
      for (const p of prefijos) {
        const k = normHuecoKey(`${p}-${pos}`)
        if (!k) continue
        if (ocup.has(k) || extra.has(k)) { libre = false; break }
      }
      if (libre) return { hueco: `${e.nombre}-${pos}`, rack: e.nombre, pos }
    }
  }
  return null
}

export type EstadoUbicacion = 'vacio' | 'no-config' | 'libre' | 'ocupado'

// Estado de una ubicación escrita a mano: ¿está en la configuración y tiene
// stock? Se usa para los avisos junto al campo Ubicación en ENTRADA.
export function clasificarUbicacion(cfg: EstanteriaCfg[], ocupadas: Set<string>, valor: string): EstadoUbicacion {
  const v = String(valor || '').trim()
  if (!v) return 'vacio'
  const clave = normHuecoKey(v)
  if (!clave) return 'no-config'
  const estanterias = estanteriasValidas(cfg)
  if (estanterias.length === 0) return 'no-config'
  for (const e of estanterias) {
    const prefijos = [e.nombre, ...e.alias].filter(Boolean)
    for (let n = 1; n <= e.huecos; n++) {
      const pos = padPos(n, e.huecos)
      for (const p of prefijos) {
        if (normHuecoKey(`${p}-${pos}`) === clave) {
          return ocupadas.has(clave) ? 'ocupado' : 'libre'
        }
      }
    }
  }
  return 'no-config'
}
