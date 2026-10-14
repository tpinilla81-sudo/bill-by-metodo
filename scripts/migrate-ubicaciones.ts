// MIGRACIÓN DE UBICACIONES al formato V29.15 (plano en papel).
//
// Qué hace:
//   Lee customData de todos los registros del tenant, busca el campo
//   "ubicacion" (custom_ubicacion / ubicación / ubicacion / etc.) y convierte
//   los formatos antiguos al nuevo formato plano "RACK F fila-hueco":
//     · P1F1H1   → P1F1-1   (columna 1, suelo)
//     · P1F1H2   → P1F2-1   (columna 1, 2ª altura)
//     · P1F3H2   → P1F2-3   (columna 3, 2ª altura)
//     · P1-01    → P1F1-1   (columna 1, sin altura → suelo)
//     · P1-1-1   → P1F1-1   (formato V29.3: rack-columna-altura)
//     · P1F1-1   → P1F1-1   (ya en formato nuevo, sin cambio)
//   Las ubicaciones que no casan con la configuración actual (E1, E2, S1
//   tras V29.14) se LISTAN pero NO se migran — el usuario debe recolocarlas
//   a mano (arrastrarlas desde DETALLE DEL STOCK ⚠ al mapa).
//
// Seguridad:
//   · Dry-run por defecto: lista qué haría, NO toca nada.
//   · --apply: aplica los cambios.
//   · Backup previo en scripts/backup-pre-migrate-ubic.json.
//
// Uso:
//   bun scripts/migrate-ubicaciones.ts            # dry-run
//   bun scripts/migrate-ubicaciones.ts --apply    # aplicar

import { Database } from 'bun:sqlite'
import { writeFileSync } from 'fs'

const DB = '/home/z/my-project/db/custom.db'
const TID = 'cmq6uwub10000n9qluafni88m' // Hualsa
const APPLY = process.argv.includes('--apply')

const db = new Database(DB)

console.log(`\n=== MIGRACIÓN UBICACIONES V29.15 · tenant ${TID} · ${APPLY ? 'APLICAR' : 'DRY-RUN'} ===\n`)

// ── Cargar config del almacén para saber qué ubicaciones son válidas ──
const cfgRow = db.prepare('SELECT almacenCfg FROM Config WHERE tenantId = ?').get(TID) as { almacenCfg?: string } | undefined
const cfg: any[] = (() => {
  if (!cfgRow?.almacenCfg) return []
  try {
    const parsed = JSON.parse(cfgRow.almacenCfg)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
})()
const huecosValidos = new Set<string>()
for (const e of cfg) {
  const nombre = String(e?.nombre || '').trim().toUpperCase()
  if (!nombre || !e.huecos) continue
  for (let n = 1; n <= e.huecos; n++) huecosValidos.add(`${nombre}-${n}`)
}
console.log(`Config cargada: ${cfg.length} zonas, ${huecosValidos.size} huecos válidos (${[...huecosValidos].slice(0, 10).join(', ')}${huecosValidos.size > 10 ? '...' : ''})`)

// ── Helpers de conversión ──
function normKey(s: string): string {
  const t = String(s || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!t) return ''
  // V29.15: P1F1-1
  const mPlano = t.match(/^([A-ZÀ-ÿ]+[0-9]*)F([0-9]+)-([0-9]+)$/)
  if (mPlano) return `${mPlano[1]}-${parseInt(mPlano[3], 10)}`
  // V29.4: P1F1H1 / P1F1
  const m = t.match(/^([A-ZÀ-ÿ]+[0-9]*)F([0-9]+)(?:H([0-9]+))?/)
  if (m) {
    const rack = m[1], fila = parseInt(m[2], 10)
    return `${rack}-${fila}`
  }
  // Antiguo: P1-01 / P1-1-1
  const m2 = t.match(/^([A-ZÀ-ÿ]+[0-9]*)(.*)$/)
  if (!m2) return t.replace(/[^A-Z0-9]+/g, '-')
  const rack = m2[1]
  const resto = (m2[2] || '').replace(/[^0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map(n => String(parseInt(n, 10)))
  if (resto.length >= 1) return `${rack}-${resto[0]}`
  return rack
}

// Convierte cualquier formato viejo al nuevo "RACK F fila-hueco".
// Devuelve null si no puede parsear o si la ubicación no es válida para la config actual.
function convertirAUbicacionNueva(ub: string): string | null {
  const t = String(ub || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!t) return null
  // Ya está en formato nuevo: P1F1-1
  const mPlano = t.match(/^([A-ZÀ-ÿ]+[0-9]*)F([0-9]+)-([0-9]+)$/)
  if (mPlano) return `${mPlano[1]}F${mPlano[2]}-${mPlano[3]}`
  // V29.4: P1F1H1 → fila=altura, hueco=fila
  const m = t.match(/^([A-ZÀ-ÿ]+[0-9]*)F([0-9]+)H([0-9]+)$/)
  if (m) {
    const rack = m[1], filaVieja = parseInt(m[2], 10), altura = parseInt(m[3], 10)
    // filaVieja era la posición en la fila (= columna = hueco nuevo)
    // altura era la altura (1=suelo, 2=2ª...) → ahora es la fila nueva
    return `${rack}F${altura}-${filaVieja}`
  }
  // V29.4 sin H: P1F1 → sin altura, asumir suelo
  const m2 = t.match(/^([A-ZÀ-ÿ]+[0-9]*)F([0-9]+)$/)
  if (m2) {
    const rack = m2[1], fila = parseInt(m2[2], 10)
    return `${rack}F1-${fila}`
  }
  // Antiguo: P1-01 → sin altura, asumir suelo
  const m3 = t.match(/^([A-ZÀ-ÿ]+[0-9]*)-0*([0-9]+)$/)
  if (m3) {
    const rack = m3[1], hueco = parseInt(m3[2], 10)
    return `${rack}F1-${hueco}`
  }
  // V29.3: P1-1-1 (rack-columna-altura)
  const m4 = t.match(/^([A-ZÀ-ÿ]+[0-9]*)-0*([0-9]+)-0*([0-9]+)$/)
  if (m4) {
    const rack = m4[1], hueco = parseInt(m4[2], 10), altura = parseInt(m4[3], 10)
    return `${rack}F${altura}-${hueco}`
  }
  return null
}

// ── Listar todos los registros con su ubicación ──
const regs = db.prepare(`SELECT id, fecha, clienteId, cliente, c1, c2, cant, customData FROM Registro WHERE tenantId = ?`).all(TID) as any[]

let sinUbicacion = 0, yaNuevo = 0, migrables = 0, fueraConfig = 0, noParseable = 0
const aMigrar: { id: string, fecha: string, cliente: string, ubVieja: string, ubNueva: string, key: string }[] = []
const fueraConfigLista: { id: string, fecha: string, cliente: string, ub: string, key: string }[] = []

for (const r of regs) {
  let cd: any = {}
  try { cd = JSON.parse(r.customData || '{}') } catch {}
  // Buscar clave de ubicación en customData (igual que extractIdents del motor)
  let ubKey = '', ubVal = ''
  for (const [k, v] of Object.entries(cd)) {
    const nk = String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ')
    if (/ubicac/.test(nk)) { ubKey = k; ubVal = String(v || '').trim(); break }
  }
  if (!ubVal) { sinUbicacion++; continue }
  const key = normKey(ubVal)
  const yaNuevo = /^([A-ZÀ-ÿ]+[0-9]*)F([0-9]+)-([0-9]+)$/.test(ubVal.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  if (yaNuevo) { if (huecosValidos.has(key)) { /* ok */ } else { fueraConfig++; fueraConfigLista.push({ id: r.id, fecha: r.fecha, cliente: r.cliente, ub: ubVal, key }) } continue }
  const nueva = convertirAUbicacionNueva(ubVal)
  if (!nueva) { noParseable++; continue }
  if (!huecosValidos.has(key)) {
    fueraConfig++
    fueraConfigLista.push({ id: r.id, fecha: r.fecha, cliente: r.cliente, ub: ubVal, key })
    continue
  }
  migrables++
  aMigrar.push({ id: r.id, fecha: r.fecha, cliente: r.cliente, ubVieja: ubVal, ubNueva: nueva, key })
}

console.log(`\nResumen de ${regs.length} registros del tenant:`)
console.log(`  · Sin ubicación: ${sinUbicacion}`)
console.log(`  · Ya en formato nuevo (V29.15) y válido: ${regs.length - sinUbicacion - migrables - fueraConfig - noParseable}`)
console.log(`  · Migrables al formato nuevo (en zona válida): ${migrables}`)
console.log(`  · En zona que YA NO EXISTE (E1/E2/S1... V29.14 los quitó): ${fueraConfig}`)
console.log(`  · No parseable (formato raro): ${noParseable}`)

if (aMigrar.length > 0) {
  console.log(`\nMigraciones propuestas (de ${aMigrar.length}):`)
  for (const m of aMigrar.slice(0, 30)) {
    console.log(`  · ${m.ubVieja.padEnd(12)} → ${m.ubNueva.padEnd(10)}  [${m.cliente || '—'} · ${m.fecha}]`)
  }
  if (aMigrar.length > 30) console.log(`  ... y ${aMigrar.length - 30} más`)
}
if (fueraConfigLista.length > 0) {
  console.log(`\nUbicaciones FUERA de la configuración actual (NO se migran — recolocar a mano):`)
  // Agrupar por zona (key.split('-')[0])
  const porZona = new Map<string, { zona: string, count: number, ejemplos: string[] }>()
  for (const f of fueraConfigLista) {
    const zona = f.key.split('-')[0] || '(desconocida)'
    const e = porZona.get(zona) || { zona, count: 0, ejemplos: [] }
    e.count++
    if (e.ejemplos.length < 3) e.ejemplos.push(f.ub)
    porZona.set(zona, e)
  }
  for (const [, e] of porZona) {
    console.log(`  · Zona ${e.zona}: ${e.count} registro(s) — ejemplos: ${e.ejemplos.join(', ')}${e.count > 3 ? '...' : ''}`)
  }
  console.log(`  → Estos palets están en STOCK ALMACÉN ⚠ ámbar. Arrastrarlos al mapa para recolocarlos.`)
}

if (!APPLY) {
  if (migrables > 0) {
    console.log('\n=== DRY-RUN ===')
    console.log('Para aplicar las migraciones:')
    console.log('  bun scripts/migrate-ubicaciones.ts --apply')
  } else {
    console.log('\nNo hay ubicaciones migrables — todo está ya en formato nuevo.')
  }
  process.exit(0)
}

// === APPLY ===
console.log('\n=== APLICANDO CAMBIOS ===')
const backup = {
  timestamp: new Date().toISOString(),
  tenant: TID,
  registros: regs,
}
writeFileSync('/home/z/my-project/scripts/backup-pre-migrate-ubic.json', JSON.stringify(backup))
console.log(`  Backup: scripts/backup-pre-migrate-ubic.json (${backup.registros.length} registros)`)

let actualizados = 0
for (const m of aMigrar) {
  const r = regs.find(x => x.id === m.id)
  if (!r) continue
  let cd: any = {}
  try { cd = JSON.parse(r.customData || '{}') } catch {}
  // Actualizar el campo de ubicación al nuevo formato
  for (const [k, v] of Object.entries(cd)) {
    const nk = String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ')
    if (/ubicac/.test(nk)) { cd[k] = m.ubNueva; break }
  }
  const newCustom = JSON.stringify(cd)
  const res = db.prepare('UPDATE Registro SET customData = ? WHERE id = ?').run(newCustom, r.id)
  if (res.changes > 0) actualizados++
}
console.log(`  Registros actualizados al formato nuevo: ${actualizados}`)
console.log(`  Registros FUERA de configuración (no tocados): ${fueraConfig}`)
console.log('\n=== HECHO ===')
