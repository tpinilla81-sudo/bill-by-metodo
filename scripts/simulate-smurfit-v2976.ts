// V29.76 — Simulación del bloque SMURFIT de prefactura-view.tsx (agrupación MES + c2)
// Verifica:
//   1) Cada MES/DESCRIPCIÓN va en UNA fila (ya no se unen meses con " / ")
//   2) Los días de almacenaje caen en el grupo MES+c2 correcto
//   3) TOTAL COSTES sigue = días × 0,18€
//   4) Orden: por mes y luego por descripción
import * as fs from 'fs'

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
function descripcionDeCatalogo(c1Val: string, c2Val: string, cliId: string): string {
  // versión simplificada: devuelve "PROD <c2>"
  return `PROD ${c2Val}`
}

// ── Datos sintéticos con estructura REAL de SMURFIT, en DOS MESES ────────
const CLI = 'cli-smurfit-es'
const registros: Registro[] = [
  // ── OCTUBRE ──
  // ENTRADAS oct — producto 10F640 (lote 605430 compartido por 4 palets)
  { id: 'e1', fecha: '2026-10-03', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_lote: '605430', custom_n_palet: '504' }) },
  { id: 'e2', fecha: '2026-10-03', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_lote: '605430', custom_n_palet: '527' }) },
  { id: 'e3', fecha: '2026-10-03', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_lote: '605430', custom_n_palet: '529' }) },
  { id: 'e4', fecha: '2026-10-03', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_lote: '605430', custom_n_palet: '553' }) },
  // ENTRADA oct — producto 10F1027, palet propio
  { id: 'e5', fecha: '2026-10-10', c1: 'SMURFIT ENTRADA PALET', c2: '10F1027', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F1027', custom_descripci_n: 'CAJA NAVARRA', custom_lote: '605999', custom_n_palet: '710' }) },
  // SALIDAS oct — palets 529 y 553 del lote 605430
  { id: 's1', fecha: '2026-10-20', c1: 'SMURFIT SALIDA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_lote: '605430', custom_n_palet: '529' }) },
  { id: 's2', fecha: '2026-10-28', c1: 'SMURFIT SALIDA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_lote: '605430', custom_n_palet: '553' }) },
  // ── NOVIEMBRE ── (mismo producto 10F640 → debe salir fila SEPARADA)
  { id: 'e6', fecha: '2026-11-02', c1: 'SMURFIT ENTRADA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_descripci_n: 'CUBETA FRESCA', custom_lote: '606111', custom_n_palet: '600' }) },
  { id: 's3', fecha: '2026-11-12', c1: 'SMURFIT SALIDA PALET', c2: '10F640', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F640', custom_lote: '606111', custom_n_palet: '600' }) },
  // SALIDA oct 10F1027 sin nº palet — solo lote → match directo por lote con e5
  { id: 's4', fecha: '2026-10-25', c1: 'SMURFIT SALIDA PALET', c2: '10F1027', cant: 1, clienteId: CLI, customData: JSON.stringify({ custom_c_digo_art_culo: '10F1027', custom_lote: '605999' }) },
  // Línea no-palet (PORTE) — va como línea normal
  { id: 'n1', fecha: '2026-10-20', c1: 'SMURFIT PORTES', c2: 'PORTE PALET', cant: 1, clienteId: CLI, customData: '{}' },
]

// ── Réplica EXACTA del bloque V29.76 de prefactura-view.tsx ──────────────
const targetCliId = CLI
const precioEntradaSalida = 3
const costeDiario = 0.18
const precioPorte = 5
const fMes = ''                  // periodo "todo" (sin filtro de mes)
const fFechaFact = '2026-11-30'

const selFacturable = registros.filter(r => isEntradaPalet(r) || isSalidaPalet(r))

// V29.76: agrupar por "YYYY-MM__c2"
const porRef = new Map<string, { mes: string; c2: string; descripcion: string; nEntradas: number; nSalidas: number; diasAlmacenaje: number; transporte: number }>()
for (const r of selFacturable) {
  const esEnt = isEntradaPalet(r)
  const esSal = isSalidaPalet(r)
  if (!esEnt && !esSal) continue
  const mesReg = (r.fecha || '').slice(0, 7)
  const ref = `${mesReg}__${r.c2}`
  if (!porRef.has(ref)) {
    const desc = descripcionDeCatalogo(r.c1, r.c2, targetCliId)
    porRef.set(ref, { mes: mesReg, c2: r.c2, descripcion: `${desc} ${r.c2}`.trim(), nEntradas: 0, nSalidas: 0, diasAlmacenaje: 0, transporte: 0 })
  }
  const g = porRef.get(ref)!
  if (esEnt) g.nEntradas += Number(r.cant) || 1
  if (esSal) {
    g.nSalidas += Number(r.cant) || 1
    g.transporte += precioPorte
  }
}

// Emparejar SALIDA↔ENTRADA y sumar días al grupo MES+c2 de la SALIDA
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
    const refSal = `${(s.fecha || '').slice(0, 7)}__${s.c2 || ''}`
    if (porRef.has(refSal)) porRef.get(refSal)!.diasAlmacenaje += dias
    emparejamientos.push(`SALIDA ${s.fecha} ${s.c2} palet=${extractIdents(s).strong['custom_n_palet'] || '(sin nº)'} ↔ ENTRADA ${ent.fecha} palet=${extractIdents(ent).strong['custom_n_palet']} → ${dias} días → grupo ${refSal}`)
  } else {
    emparejamientos.push(`SALIDA ${s.fecha} ${s.c2} → SIN ENTRADA → 0 días`)
  }
}

// V29.76: generar líneas — una por MES+referencia, ordenadas por mes y descripción
const lineas: { fecha: string; c1: string; c2: string; cant: number; precioUnitario: number; smurfit?: any }[] = []
const gruposOrden = [...porRef.entries()].sort((a, b) => {
  const ka = `${a[1].mes}__${a[1].descripcion}`
  const kb = `${b[1].mes}__${b[1].descripcion}`
  return ka.localeCompare(kb)
})
for (const [, g] of gruposOrden) {
  const costeEntradas = g.nEntradas * precioEntradaSalida
  const costeSalidas = g.nSalidas * precioEntradaSalida
  const totalCostes = g.diasAlmacenaje * costeDiario
  const costeTotal = costeEntradas + costeSalidas + totalCostes + g.transporte
  const mesStr = /^\d{4}-\d{2}$/.test(g.mes) ? fmtMonth(g.mes + '-01') : (fMes && /^\d{4}-\d{2}$/.test(fMes) ? fmtMonth(fMes + '-01') : '')
  lineas.push({ fecha: fFechaFact, c1: g.c2, c2: '', cant: 1, precioUnitario: costeTotal, smurfit: { mes: mesStr, descripcion: g.descripcion, nEntradas: g.nEntradas, costeEntradas, nSalidas: g.nSalidas, costeSalidas, totalCostes, transporte: g.transporte, costeTotal } })
}

// ── Salida por consola ────────────────────────────────────────────────────
console.log('════ EMPAREJAMIENTOS (SALIDA ↔ ENTRADA) ════')
emparejamientos.forEach(e => console.log('  ' + e))
console.log('\n════ TABLA SMURFIT RESULTANTE (MES | Descripción | NºENT | CosteENT | NºSAL | CosteSAL | TOTAL COSTES | Transporte | Total) ════')
for (const l of lineas.filter(l => l.smurfit)) {
  const s = l.smurfit
  console.log(`  ${s.mes} | ${s.descripcion} | ${s.nEntradas} | ${s.costeEntradas.toFixed(2)}€ | ${s.nSalidas} | ${s.costeSalidas.toFixed(2)}€ | ${s.totalCostes.toFixed(2)}€ | ${s.transporte.toFixed(2)}€ | ${s.costeTotal.toFixed(2)}€`)
}
console.log('\n════ VERIFICACIÓN ════')
// Esperado con V29.76 (MES + c2 = fila):
//   Octubre 2026 | PROD 10F1027: 1 ent, 0 sal, 0 días
//   Octubre 2026 | PROD 10F640:   4 ent, 2 sal, 44 días (18+26) → 7.92€
//   Noviembre 2026 | PROD 10F640: 1 ent, 1 sal, 11 días (2→12 nov) → 1.98€
const g640oct = porRef.get('2026-10__10F640')
const g640nov = porRef.get('2026-11__10F640')
const g1027oct = porRef.get('2026-10__10F1027')
const filasSmurfit = lineas.filter(l => l.smurfit)
const checks = [
  { name: 'Nº filas SMURFIT = 3 (una por MES+c2)', ok: filasSmurfit.length === 3, got: filasSmurfit.length },
  { name: 'Fila "Octubre 2026" de 10F640 existe', ok: filasSmurfit.some(l => l.smurfit.mes === 'Octubre 2026' && l.c1 === '10F640'), got: filasSmurfit.map(l => `${l.smurfit.mes}/${l.c1}`).join(', ') },
  { name: 'Fila "Noviembre 2026" de 10F640 SEPARADA existe', ok: filasSmurfit.some(l => l.smurfit.mes === 'Noviembre 2026' && l.c1 === '10F640'), got: '' },
  { name: 'Ninguna fila junta meses con " / "', ok: filasSmurfit.every(l => !l.smurfit.mes.includes('/')), got: filasSmurfit.map(l => l.smurfit.mes).join(' | ') },
  { name: '10F640 OCT días = 18+26 = 44', ok: g640oct?.diasAlmacenaje === 44, got: g640oct?.diasAlmacenaje },
  { name: '10F640 OCT TOTAL COSTES = 44×0.18 = 7.92', ok: Math.abs((g640oct?.diasAlmacenaje ?? 0) * costeDiario - 7.92) < 0.001, got: ((g640oct?.diasAlmacenaje ?? 0) * costeDiario).toFixed(2) },
  { name: '10F640 NOV días = 11 (2→12 nov)', ok: g640nov?.diasAlmacenaje === 11, got: g640nov?.diasAlmacenaje },
  { name: '10F640 NOV TOTAL COSTES = 11×0.18 = 1.98', ok: Math.abs((g640nov?.diasAlmacenaje ?? 0) * costeDiario - 1.98) < 0.001, got: ((g640nov?.diasAlmacenaje ?? 0) * costeDiario).toFixed(2) },
  { name: '10F1027 OCT días = 16 (10→25 oct, match por lote)', ok: g1027oct?.diasAlmacenaje === 16, got: g1027oct?.diasAlmacenaje },
  { name: '10F1027 OCT TOTAL COSTES = 16×0.18 = 2.88', ok: Math.abs((g1027oct?.diasAlmacenaje ?? 0) * costeDiario - 2.88) < 0.001, got: ((g1027oct?.diasAlmacenaje ?? 0) * costeDiario).toFixed(2) },
  { name: 'Orden: Octubre(10F1027, 10F640) antes que Noviembre(10F640)', ok: (() => {
      const seq = filasSmurfit.map(l => `${l.smurfit.mes}|${l.c1}`).join(' :: ')
      return seq === 'Octubre 2026|10F1027 :: Octubre 2026|10F640 :: Noviembre 2026|10F640'
    })(), got: filasSmurfit.map(l => `${l.smurfit.mes}|${l.c1}`).join(' :: ') },
]
let allOk = true
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name} (got: ${c.got})`)
  if (!c.ok) allOk = false
}
console.log(`\nRESULTADO: ${allOk ? 'TODO OK ✓' : 'FALLOS ✗'}`)
if (!allOk) process.exit(1)
