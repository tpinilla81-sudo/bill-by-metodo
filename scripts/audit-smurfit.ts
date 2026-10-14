// AUDITORÍA SMURFIT — solo lectura, no toca nada.
// Ejecuta: bun scripts/audit-smurfit.ts
//
// Busca:
//  1. Clientes duplicados (SMURFIT WESTROCK ESPAÑA SA vs SMURFIT WESTROCK etc.)
//  2. Registros de ENTRADA/SALIDA PALET agrupados por clienteId
//  3. SALIDAS que el motor buildStock no logró descontar (palets "fantasma")
//  4. Para cada SALIDA fantasma, busca la ENTRADA con el mismo lote bajo OTRO
//     clienteId (eso confirma que el problema es clienteId, no lote).
import { Database } from 'bun:sqlite'
const DB = '/home/z/my-project/db/custom.db'
const TID = 'cmq6uwub10000n9qluafni88m' // Hualsa — cambia si otro tenant
const db = new Database(DB)

const normAlm = (s: string) => String(s || '').trim().replace(/\s+/g, ' ')
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// 1) Clientes con nombre parecido a SMURFIT/WESTROCK
console.log('\n=== 1. CLIENTES Smurfit/Westrock ===')
const clientes = db.prepare(
  `SELECT id, nombre, cif FROM Cliente WHERE tenantId = ? AND (LOWER(nombre) LIKE '%smurfit%' OR LOWER(nombre) LIKE '%westrock%') ORDER BY nombre`
).all(TID) as any[]
for (const c of clientes) console.log(`  · [${c.id}] ${c.nombre}  CIF=${c.cif || '—'}`)
if (clientes.length === 0) console.log('  (no hay clientes con SMURFIT/WESTROCK en este tenant)')

// 2) Catálogo de líneas SMURFIT + su clienteId asociado
console.log('\n=== 2. CATÁLOGO Smurfit ===')
const cat = db.prepare(
  `SELECT c1, c2, clienteId, (SELECT nombre FROM Cliente WHERE id = cat.clienteId) as cliente
   FROM Catalogo cat WHERE tenantId = ? AND (LOWER(c1) LIKE '%smurfit%' OR LOWER(c2) LIKE '%smurfit%') ORDER BY c1, c2`
).all(TID) as any[]
for (const c of cat) console.log(`  · c1="${c.c1}" c2="${c.c2}" → clienteId=${c.clienteId || '—'} (${c.cliente || '—'})`)
if (cat.length === 0) console.log('  (no hay líneas SMURFIT en el catálogo)')

// 3) Registros ENTRADA/SALIDA PALET agrupados por clienteId + cliente (nombre)
console.log('\n=== 3. REGISTROS PALET por cliente ===')
const regs = db.prepare(
  `SELECT id, fecha, clienteId, cliente, c1, c2, cant, customData, pasadoRegistro
   FROM Registro WHERE tenantId = ?
     AND (LOWER(c1) LIKE '%palet%' OR LOWER(c2) LIKE '%palet%')
   ORDER BY fecha DESC`
).all(TID) as any[]
const porCli = new Map<string, { nombre: string; ent: number; sal: number; saldo: number }>()
for (const r of regs) {
  const k = r.clienteId || '(null)'
  const ent = /entrada palet/.test(normAlm(`${r.c1} ${r.c2}`))
  const sal = /salida palet/.test(normAlm(`${r.c1} ${r.c2}`))
  const e = porCli.get(k) || { nombre: r.cliente || '(sin nombre)', ent: 0, sal: 0, saldo: 0 }
  if (ent) { e.ent += Number(r.cant) || 0; e.saldo += Number(r.cant) || 0 }
  if (sal) { e.sal += Number(r.cant) || 0; e.saldo -= Number(r.cant) || 0 }
  porCli.set(k, e)
}
for (const [k, v] of porCli) {
  console.log(`  · clienteId=${k}  nombre="${v.nombre}"`)
  console.log(`      entradas=${v.ent}  salidas=${v.sal}  saldoNeto=${v.saldo}`)
}

// 4) SALIDAS que NO consumieron nada en buildStock (palets fantasma)
console.log('\n=== 4. SALIDAS que NO descuentan (posibles palets fantasma) ===')
// Réplica minimal de buildStock():
type Lote = { id: string; fecha: string; clienteId: string; ident: string; cantRestante: number }
const movs = regs
  .filter(r => /entrada palet/.test(normAlm(`${r.c1} ${r.c2}`)) || /salida palet/.test(normAlm(`${r.c1} ${r.c2}`)))
  .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id))
const lotes: Lote[] = []
const salidasSinMatch: any[] = []
function extractIdents(r: any) {
  let cd: any = {}
  try { cd = JSON.parse(r.customData || '{}') } catch {}
  const strong: string[] = [], weak: string[] = []
  for (const [k, v] of Object.entries(cd)) {
    const nk = normAlm(k); const val = String(v ?? '').trim()
    if (!val) continue
    if (/palet|lote/.test(nk)) strong.push(normAlm(val))
    else if (/ubicac/.test(nk)) weak.push(normAlm(val))
  }
  return { strong, weak }
}
for (const m of movs) {
  if (/entrada palet/.test(normAlm(`${m.c1} ${m.c2}`))) {
    const { strong, weak } = extractIdents(m)
    lotes.push({ id: m.id, fecha: m.fecha, clienteId: m.clienteId || '', ident: strong[0] || '', cantRestante: Number(m.cant) || 0 })
    continue
  }
  // SALIDA
  let resto = Number(m.cant) || 0
  const si = extractIdents(m)
  let cand = lotes.filter(l => l.cantRestante > 0 && l.clienteId === (m.clienteId || ''))
  let sel = cand.filter(l => l.ident && si.strong.includes(l.ident))
  if (sel.length === 0) {
    const kSal = si.weak[0] || ''
    if (kSal) sel = cand.filter(l => /* simplificado */ true)
  }
  if (sel.length === 0) sel = cand
  sel.sort((a, b) => a.fecha.localeCompare(b.fecha))
  const antes = resto
  for (const l of sel) {
    if (resto <= 0) break
    const toma = Math.min(l.cantRestante, resto)
    l.cantRestante -= toma
    resto -= toma
  }
  if (resto > 0) {
    // SALIDA no descuenta del todo → buscar ENTRADA con el mismo lote en OTRO clienteId
    const mismoloteOtro = lotes.find(l => l.cantRestante > 0 && l.ident && si.strong.includes(l.ident) && l.clienteId !== (m.clienteId || ''))
    salidasSinMatch.push({
      salida_id: m.id,
      salida_fecha: m.fecha,
      salida_clienteId: m.clienteId || '(null)',
      salida_cliente: m.cliente || '(sin nombre)',
      salida_cant: m.cant,
      lote_buscado: si.strong[0] || '—',
      no_descuento: resto,
      encontrada_en_clienteId_otro: mismoloteOtro?.clienteId || null,
      encontrada_en_cliente_otro: mismoloteOtro?.clienteId ? db.prepare('SELECT nombre FROM Cliente WHERE id = ?').get(mismoloteOtro.clienteId)?.nombre : null,
    })
  }
}
console.log(`  Total SALIDAS fantasma: ${salidasSinMatch.length}`)
for (const s of salidasSinMatch.slice(0, 20)) {
  console.log(`  · ${s.salida_fecha} lote=${s.lote_buscado} cant=${s.salida_cant} (no descuenta ${s.no_descuento})`)
  console.log(`      salida_clienteId=${s.salida_clienteId}  cliente="${s.salida_cliente}"`)
  if (s.encontrada_en_clienteId_otro) {
    console.log(`      ✗ ENCONTRADA bajo OTRO clienteId=${s.encontrada_en_clienteId_otro}  nombre="${s.encontrada_en_cliente_otro}"`)
  } else {
    console.log(`      ? no encontrada por lote en ningún cliente (lote inexistente o ya consumido)`)
  }
}
if (salidasSinMatch.length > 20) console.log(`  ... y ${salidasSinMatch.length - 20} más`)

console.log('\n=== RESUMEN ===')
console.log(`  Clientes Smurfit/Westrock distintos: ${clientes.length}`)
console.log(`  Registros PALET totales: ${regs.length}`)
console.log(`  SALIDAS que no descuentan: ${salidasSinMatch.length}`)
console.log(`  De esas, SALIDAS con lote encontrado en OTRO clienteId: ${salidasSinMatch.filter(s => s.encontrada_en_clienteId_otro).length}`)
