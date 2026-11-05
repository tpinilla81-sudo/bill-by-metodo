// V29.74 — Simulación del bloque SMURFIT de prefactura-view.tsx
// Replica EXACTAMENTE las funciones y el flujo del componente para verificar:
//   1) TOTAL COSTES (días × 0,18€) NO sale a 0 (fix del bug extractIdents)
//   2) La nueva columna MES se rellena con el mes de los registros
import * as fs from 'fs'

// ── Tipos y helpers idénticos a prefactura-view.tsx ──────────────────────
type Registro = {
  id: string; fecha: string; c1: string; c2: string; cant: number
  clienteId: string; obs?: string; customData: string; facturado?: boolean
}

function normAlm(s: string): string {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isEntradaPalet(r: Registro): boolean {
  return /entrada palet/.test(normAlm(`${r.c1} ${r.c2}`))
}
function isSalidaPalet(r: Registro): boolean {
  return /salida palet/.test(normAlm(`${r.c1} ${r.c2}`))
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

function matchIdents(a: { strong: Record<string, string>; weak: Record<string, string> }, b: { strong: Record<string, string>; weak: Record<string, string> }): boolean {
  const norm = (s: string) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const aPalet = Object.entries(a.strong).filter(([k]) => /palet/.test(norm(k)) && !/lote/.test(norm(k))).map(([, v]) => norm(v))
  const bPalet = Object.entries(b.strong).filter(([k]) => /palet/.test(norm(k)) && !/lote/.test(norm(k))).map(([, v]) => norm(v))
  const aLote = Object.entries(a.strong).filter(([k]) => /lote/.test(norm(k))).map(([, v]) => norm(v))
  const bLote = Object.entries(b.strong).filter(([k]) => /lote/.test(norm(k))).map(([, v]) => norm(v))
  if (aPalet.length > 0 && bPalet.length > 0) {
    if (aPalet.some(v => bPalet.includes(v))) return true
  } else {
    if (aLote.some(v => bLote.includes(v))) return true
    if (Object.keys(a.strong).length > 0 && Object.keys(b.strong).length > 0) {
      const aVals = Object.values(a.strong); const bVals = Object.values(b.strong)
      if (aVals.some(v => bVals.includes(v))) return true
    }
  }
  for (const k of Object.keys(a.weak)) {
    if (b.weak[k] && norm(b.weak[k]) === norm(a.weak[k])) return true
  }
  return false
}

function diasAlmacenaje(fEntrada: string, fSalida: string): number {
  const d1 = new Date(fEntrada + 'T00:00:00')
  const d2 = new Date(fSalida + 'T00:00:00')
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1
  return Math.max(1, diff)
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
function fmtMonth(iso: string): string {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4})-(\d{2})/)
  if (!m) return iso
  const monthNum = parseInt(m[2], 10)
  return `${MESES[monthNum - 1]} ${m[1]}`
}

// ── Datos sintéticos con la estructura REAL de SMURFIT ───────────────────
// (lote compartido 605430, palets individuales, claves custom con acentos quitados)
const CLI = 'cli-smurfit-es'
const registros: Registro[] = [
  // ENTRADAS octubre — producto 10F640 (lote 605430 compartido por 4 palets)
  { id: 'e1', fecha: '2026-10-03', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_fecha_de_fabricaci_n: '2026-10-02', custom_lote: '605430', custom_n_palet: '504' }) },
  { id: 'e2', fecha: '2026-10-03', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_fecha_de_fabricaci_n: '2026-10-02', custom_lote: '605430', custom_n_palet: '527' }) },
  { id: 'e3', fecha: '2026-10-03', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_fecha_de_fabricaci_n: '2026-10-02', custom_lote: '605430', custom_n_palet: '529' }) },
  { id: 'e4', fecha: '2026-10-03', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_fecha_de_fabricaci_n: '2026-10-02', custom_lote: '605430', custom_n_palet: '553' }) },
  // ENTRADA octubre — producto 10F1027, palet propio (lote distinto)
  { id: 'e5', fecha: '2026-10-10', c1: 'SMURFIT ENTRADA PALET', c2: '10F1027', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F1027', custom_descripci_n: 'CAJA NAVARRA', custom_fecha_de_fabricaci_n: '2026-10-09', custom_lote: '605999', custom_n_palet: '710' }) },
  // SALIDAS octubre — palets 529 y 553 del lote 605430 (emparejables por nº palet)
  { id: 's1', fecha: '2026-10-20', c1: 'SMURFIT SALIDA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_lote: '605430', custom_n_palet: '529' }) },
  { id: 's2', fecha: '2026-10-28', c1: 'SMURFIT SALIDA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_lote: '605430', custom_n_palet: '553' }) },
  // SALIDA sin custom_n_palet — solo lote → cae al fallback (lote compartido)
  { id: 's3', fecha: '2026-10-25', c1: 'SMURFIT SALIDA PALET', c2: '10F1027', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F1027', custom_lote: '605999' }) },
  // Línea no-palet (PORTE) — va como línea normal fuera de la tabla SMURFIT
  { id: 'n1', fecha: '2026-10-20', c1: 'SMURFIT PORTES', c2: 'PORTE PALET', cant: 1, clienteId: CLI, customData: '{}' },
]

// ── Simulación del bloque SMURFIT (V29.72 + V29.73-fixed + V29.74) ──────
const targetCliId = CLI
const precioEntradaSalida = 3   // del catálogo
const costeDiario = 0.18
const precioPorte = 5
const fMes = '2026-10'          // filtro de mes seleccionado
const fFechaFact = '2026-10-31'

const sel = registros.filter(r => r.fecha.slice(0, 7) === fMes || true) // sin filtro real: todo
const isEntradaPaletFn = isEntradaPalet
const selFacturable = sel

// Agrupar por c2 + acumular meses (V29.74)
const porRef = new Map<string, { descripcion: string; nEntradas: number; nSalidas: number; diasAlmacenaje: number; transporte: number; meses: string[] }>()
for (const r of selFacturable) {
  const esEnt = isEntradaPaletFn(r)
  const esSal = isSalidaPalet(r)
  if (!esEnt && !esSal) continue
  const ref = r.c2
  if (!porRef.has(ref)) porRef.set(ref, { descripcion: `PROD ${ref}`, nEntradas: 0, nSalidas: 0, diasAlmacenaje: 0, transporte: 0, meses: [] })
  const g = porRef.get(ref)!
  const mesReg = (r.fecha || '').slice(0, 7)
  if (mesReg && !g.meses.includes(mesReg)) g.meses.push(mesReg)
  if (esEnt) g.nEntradas += Number(r.cant) || 1
  if (esSal) {
    g.nSalidas += Number(r.cant) || 1
    g.transporte += precioPorte
  }
}

// V29.74: emparejar SALIDA↔ENTRADA (extractIdents con Registro + matchIdents)
const todasEntradas = registros.filter(r => isEntradaPalet(r) && r.clienteId === targetCliId).sort((a, b) => a.fecha.localeCompare(b.fecha))
const salidasRef = selFacturable.filter(r => isSalidaPalet(r))
const usadosLocal = new Set<string>()
for (const [, g] of porRef) g.diasAlmacenaje = 0
const emparejamientos: string[] = []
for (const s of [...salidasRef].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
  const siS = extractIdents(s)
  let ent = todasEntradas.find(e => !usadosLocal.has(e.id) && matchIdents(extractIdents(e), siS))
  if (!ent) {
    const restantes = todasEntradas.filter(e => !usadosLocal.has(e.id))
    if (restantes.length === 1) ent = restantes[0]
  }
  if (ent) {
    usadosLocal.add(ent.id)
    const dias = diasAlmacenaje(ent.fecha, s.fecha)
    const refSal = s.c2 || ''
    if (porRef.has(refSal)) porRef.get(refSal)!.diasAlmacenaje += dias
    emparejamientos.push(`SALIDA ${s.fecha} palet=${extractIdents(s).strong['custom_n_palet'] || '(sin nº)'} ↔ ENTRADA ${ent.fecha} palet=${extractIdents(ent).strong['custom_n_palet']} → ${dias} días → ref ${refSal}`)
  } else {
    emparejamientos.push(`SALIDA ${s.fecha} palet=${extractIdents(s).strong['custom_n_palet'] || '(sin nº)'} → SIN ENTRADA → 0 días`)
  }
}

// Generar líneas
const lineas: { fecha: string; c1: string; c2: string; cant: number; precioUnitario: number; smurfit?: any }[] = []
for (const [ref, g] of porRef) {
  const costeEntradas = g.nEntradas * precioEntradaSalida
  const costeSalidas = g.nSalidas * precioEntradaSalida
  const totalCostes = g.diasAlmacenaje * costeDiario
  const costeTotal = costeEntradas + costeSalidas + totalCostes + g.transporte
  const mesStr = (() => {
    const ms = [...g.meses].sort()
    if (ms.length > 0) return ms.map(m => fmtMonth(m + '-01')).join(' / ')
    if (fMes && /^\d{4}-\d{2}$/.test(fMes)) return fmtMonth(fMes + '-01')
    return ''
  })()
  lineas.push({ fecha: fFechaFact, c1: ref, c2: '', cant: 1, precioUnitario: costeTotal, smurfit: { mes: mesStr, descripcion: `${g.descripcion}`, nEntradas: g.nEntradas, costeEntradas, nSalidas: g.nSalidas, costeSalidas, totalCostes, transporte: g.transporte, costeTotal } })
}

// ── Salida por consola ────────────────────────────────────────────────────
console.log('════ EMPAREJAMIENTOS (SALIDA ↔ ENTRADA) ════')
emparejamientos.forEach(e => console.log('  ' + e))
console.log('\n════ TABLA SMURFIT RESULTANTE (MES | Descripción | NºENT | CosteENT | NºSAL | CosteSAL | TOTAL COSTES | Transporte | Total) ════')
let ok = true
for (const l of lineas.filter(l => l.smurfit)) {
  const s = l.smurfit
  console.log(`  ${s.mes} | ${s.descripcion} | ${s.nEntradas} | ${s.costeEntradas.toFixed(2)}€ | ${s.nSalidas} | ${s.costeSalidas.toFixed(2)}€ | ${s.totalCostes.toFixed(2)}€ | ${s.transporte.toFixed(2)}€ | ${s.costeTotal.toFixed(2)}€`)
  if (s.nSalidas > 0 && s.totalCostes <= 0) ok = false
}
console.log('\n════ VERIFICACIÓN ════')
// Esperado: 10F640 → palet 529: 3→20 oct = 18 días; palet 553: 3→28 oct = 26 días → 44 días × 0.18 = 7.92€
// 10F1027 → palet 710 (única entrada restante vía fallback): 10→25 oct = 16 días × 0.18 = 2.88€
const g640 = porRef.get('10F640')
const g1027 = porRef.get('10F1027')
const checks = [
  { name: '10F640 días = 18+26 = 44', ok: g640?.diasAlmacenaje === 44, got: g640?.diasAlmacenaje },
  { name: '10F640 TOTAL COSTES = 44×0.18 = 7.92', ok: Math.abs((g640?.diasAlmacenaje ?? 0) * costeDiario - 7.92) < 0.001, got: ((g640?.diasAlmacenaje ?? 0) * costeDiario).toFixed(2) },
  { name: '10F1027 días = 16', ok: g1027?.diasAlmacenaje === 16, got: g1027?.diasAlmacenaje },
  { name: '10F1027 TOTAL COSTES = 16×0.18 = 2.88', ok: Math.abs((g1027?.diasAlmacenaje ?? 0) * costeDiario - 2.88) < 0.001, got: ((g1027?.diasAlmacenaje ?? 0) * costeDiario).toFixed(2) },
  { name: 'MES relleno en todas las filas', ok: lineas.every(l => !l.smurfit || l.smurfit.mes === 'Octubre 2026'), got: lineas.map(l => l.smurfit?.mes).join(', ') },
]
let allOk = true
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name} (got: ${c.got})`)
  if (!c.ok) allOk = false
}
console.log(`\nRESULTADO: ${allOk ? 'TODO OK ✓' : 'FALLOS ✗'}`)
if (!allOk) process.exit(1)
