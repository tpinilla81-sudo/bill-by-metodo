// V29.76 — ACLARACIÓN OCTUBRE: replica la pre-factura SMURFIT con los datos
// reales del Excel "registros-palet-crudo-2026-10-22.xlsx" y muestra:
//   1) todos los registros de octubre (entradas/salidas con palet y lote)
//   2) el emparejamiento SALIDA↔ENTRADA con los días de cada palet
//   3) la tabla final tal cual la pinta la pre-factura
import * as fs from 'fs'
import * as XLSX from 'xlsx'

type Registro = {
  id: string; fecha: string; cliente: string; c1: string; c2: string; cant: number
  customData: string
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
  } catch { /* ignorar */ }
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
  const m = String(iso).match(/^(\d{4})-(\d{2})/)
  if (!m) return iso
  return `${MESES[parseInt(m[2], 10) - 1]} ${m[1]}`
}
function paletDe(r: Registro): string {
  try { return String(JSON.parse(r.customData).custom_n_palet || '') } catch { return '' }
}
function loteDe(r: Registro): string {
  try { return String(JSON.parse(r.customData).custom_lote || '') } catch { return '' }
}

// ── Cargar Excel crudo ────────────────────────────────────────────────────
const wb = XLSX.readFile('upload/registros-palet-crudo-2026-10-22.xlsx')
const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
const HDR = rows[0]
const idx = (name: string) => HDR.findIndex(h => String(h) === name)
const registros: Registro[] = rows.slice(1).filter(r => r && r[idx('id')]).map(r => ({
  id: String(r[idx('id')]),
  fecha: String(r[idx('fecha')]).slice(0, 10),
  cliente: String(r[idx('cliente')] || ''),
  c1: String(r[idx('c1')] || ''),
  c2: String(r[idx('c2')] || ''),
  cant: Number(r[idx('cant')]) || 1,
  customData: String(r[idx('customData_JSON')] || '{}'),
}))

const CLI = 'SMURFIT WESTROCK ESPAÑA SA'
const smurfit = registros.filter(r => /smurfit|westrock/i.test(normAlm(r.cliente)))
const MESES_FILTRO = /^2026-10/ // OCTUBRE

console.log(`Registros SMURFIT en el Excel: ${smurfit.length} (exportado el 22-oct)`)

// ── Precios (catálogo SMURFIT: entrada/salida 3€, coste diario 0,18€, porte 5€) ──
const precioEntradaSalida = 3
const costeDiario = 0.18
const precioPorte = 5

// ── Paso 1: registros de OCTUBRE facturables ─────────────────────────────
const octubre = smurfit.filter(r => MESES_FILTRO.test(r.fecha))
const entOct = octubre.filter(isEntradaPalet)
const salOct = octubre.filter(isSalidaPalet)
console.log(`\n── PASO 1 · OCTUBRE: ${entOct.length} ENTRADAS y ${salOct.length} SALIDAS ──`)
console.log('FECHA      | TIPO    | PROD    | PALET | LOTE')
for (const r of [...octubre].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
  console.log(`${r.fecha} | ${isEntradaPalet(r) ? 'ENTRADA' : 'SALIDA '} | ${r.c2.padEnd(7)} | ${paletDe(r).padEnd(5)} | ${loteDe(r)}`)
}

// ── Paso 2: agrupación V29.76 por MES + c2 ───────────────────────────────
const porRef = new Map<string, { mes: string; c2: string; descripcion: string; nEntradas: number; nSalidas: number; diasAlmacenaje: number; transporte: number }>()
for (const r of octubre) {
  const esEnt = isEntradaPalet(r)
  const esSal = isSalidaPalet(r)
  if (!esEnt && !esSal) continue
  const mesReg = (r.fecha || '').slice(0, 7)
  const ref = `${mesReg}__${r.c2}`
  if (!porRef.has(ref)) porRef.set(ref, { mes: mesReg, c2: r.c2, descripcion: `10F — ${r.c2}`, nEntradas: 0, nSalidas: 0, diasAlmacenaje: 0, transporte: 0 })
  const g = porRef.get(ref)!
  if (esEnt) g.nEntradas += Number(r.cant) || 1
  if (esSal) { g.nSalidas += Number(r.cant) || 1; g.transporte += precioPorte }
}

// ── Paso 3: emparejar SALIDA↔ENTRADA (entradas de TODO el histórico del cliente,
//    igual que hace la pre-factura: una entrada de septiembre puede ser la pareja
//    de una salida de octubre) ──
const todasEntradas = smurfit.filter(r => isEntradaPalet(r)).sort((a, b) => a.fecha.localeCompare(b.fecha))
const usados = new Set<string>()
const pares: { entFecha: string; salFecha: string; refSal: string; palet: string }[] = []
console.log(`\n── PASO 2 · EMPAREJAMIENTO SALIDA ↔ ENTRADA (días de cada palet) ──`)
console.log('   (entradas candidatas: TODAS las de SMURFIT en el Excel: ' + todasEntradas.length + ')')
for (const s of [...salOct].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
  const siS = extractIdents(s)
  let ent = todasEntradas.find(e => !usados.has(e.id) && matchIdents(extractIdents(e), siS))
  if (!ent) {
    const restantes = todasEntradas.filter(e => !usados.has(e.id))
    if (restantes.length === 1) ent = restantes[0]
  }
  const refSal = `${(s.fecha || '').slice(0, 7)}__${s.c2 || ''}`
  if (ent) {
    usados.add(ent.id)
    const dias = diasAlmacenaje(ent.fecha, s.fecha)
    if (porRef.has(refSal)) porRef.get(refSal)!.diasAlmacenaje += dias
    pares.push({ entFecha: ent.fecha, salFecha: s.fecha, refSal, palet: paletDe(s) || paletDe(ent) })
    console.log(`  SALIDA ${s.fecha} ${s.c2} palet=${paletDe(s) || '(sin nº)'} ↔ ENTRADA ${ent.fecha} palet=${paletDe(ent)} → ${dias} días × 0,18€ = ${(dias * costeDiario).toFixed(2)}€`)
  } else {
    console.log(`  SALIDA ${s.fecha} ${s.c2} palet=${paletDe(s) || '(sin nº)'} → SIN ENTRADA → 0 días`)
  }
}

// ── Paso 4: tabla final como la pre-factura ──────────────────────────────
const gruposOrden = [...porRef.entries()].sort((a, b) => `${a[1].mes}__${a[1].descripcion}`.localeCompare(`${b[1].mes}__${b[1].descripcion}`))
console.log(`\n── PASO 3 · TABLA QUE PINTA LA PRE-FACTURA (coste diario ${costeDiario}€) ──`)
console.log('MES          | DESCRIPCIÓN | NºENT | CosteENT | NºSAL | CosteSAL | TOTAL COSTES | Transporte | Coste Total')
let tc = 0, tt = 0, ct = 0
for (const [, g] of gruposOrden) {
  const costeEntradas = g.nEntradas * precioEntradaSalida
  const costeSalidas = g.nSalidas * precioEntradaSalida
  const totalCostes = g.diasAlmacenaje * costeDiario
  const costeTotal = costeEntradas + costeSalidas + totalCostes + g.transporte
  tc += totalCostes; tt += g.transporte; ct += costeTotal
  console.log(`${fmtMonth(g.mes + '-01').padEnd(12)} | ${g.descripcion.padEnd(11)} | ${String(g.nEntradas).padEnd(5)} | ${costeEntradas.toFixed(2).padStart(8)} | ${String(g.nSalidas).padEnd(5)} | ${costeSalidas.toFixed(2).padStart(8)} | ${totalCostes.toFixed(2).padStart(12)} | ${g.transporte.toFixed(2).padStart(10)} | ${costeTotal.toFixed(2).padStart(11)}`)
}
console.log(`\nTOTAL COSTES (almacenaje) de octubre: ${tc.toFixed(2)}€ | Transporte: ${tt.toFixed(2)}€ | Coste Total: ${ct.toFixed(2)}€`)
console.log('\nNOTA: el Excel es del 22-oct → las salidas de los días 23-31 de octubre NO están en el fichero.')

// ── Comparación: descontando 1 día a cada palet ─────────────────────────
// Actual: días = (salida − entrada) + 1  (ambos días inclusive)
// Nuevo:  días = (salida − entrada)      (descuenta 1 día a cada palet)
function diasNuevo(fEntrada: string, fSalida: string): number {
  const d1 = new Date(fEntrada + 'T00:00:00')
  const d2 = new Date(fSalida + 'T00:00:00')
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000))
}
const porGrupoActual = new Map<string, number>()
const porGrupoNuevo = new Map<string, number>()
for (const p of pares) {
  porGrupoActual.set(p.refSal, (porGrupoActual.get(p.refSal) || 0) + diasAlmacenaje(p.entFecha, p.salFecha))
  porGrupoNuevo.set(p.refSal, (porGrupoNuevo.get(p.refSal) || 0) + diasNuevo(p.entFecha, p.salFecha))
}
console.log(`\n── COMPARACIÓN · DESCONTANDO 1 DÍA A CADA PALET (${pares.length} palets salidos) ──`)
console.log('FILA                  | DÍAS ACTUAL | DÍAS NUEVO | TOTAL COSTES ACTUAL | TOTAL COSTES NUEVO')
let sumA = 0, sumN = 0
for (const [ref, dA] of porGrupoActual) {
  const dN = porGrupoNuevo.get(ref) || 0
  sumA += dA; sumN += dN
  const etiqueta = fmtMonth(ref.split('__')[0] + '-01') + ' · ' + ref.split('__')[1]
  console.log(`${etiqueta.padEnd(21)} | ${String(dA).padStart(11)} | ${String(dN).padStart(10)} | ${(dA * costeDiario).toFixed(2).padStart(19)} | ${(dN * costeDiario).toFixed(2).padStart(18)}`)
}
console.log(`\nTOTAL días: ${sumA} → ${sumN} (−${sumA - sumN} días por ${pares.length} palets)`)
console.log(`TOTAL COSTES: ${tc.toFixed(2)}€ → ${(sumN * costeDiario).toFixed(2)}€  (ahorro: ${(tc - sumN * costeDiario).toFixed(2)}€)`)
console.log(`Coste Total octubre: ${ct.toFixed(2)}€ → ${(ct - (tc - sumN * costeDiario)).toFixed(2)}€`)
