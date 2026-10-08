// Inspección: configuración actual del almacén (Config.almacenCfg) por tenant
// + ubicaciones reales en los registros de palets.
import { Database } from 'bun:sqlite'

const dbPath = process.env.DB_PATH || '/home/z/my-project/db/custom.db'
const db = new Database(dbPath, { readonly: true })

const configs = db.query(`SELECT tenantId, almacenCfg FROM Config WHERE almacenCfg IS NOT NULL AND almacenCfg != ''`).all() as { tenantId: string; almacenCfg: string }[]

for (const c of configs) {
  console.log(`\n=== TENANT ${c.tenantId} ===`)
  try {
    const cfg = JSON.parse(c.almacenCfg)
    for (const e of cfg) {
      console.log(`  · ${e.nombre} (tipo=${e.tipo}, orientacion=${e.orientacion || 'izq'}): huecos=${e.huecos}, cap=${e.cap}, caps=${JSON.stringify(e.caps || null)}, alias=${JSON.stringify(e.alias || [])}, criterios=${JSON.stringify(e.criterios || {})}`)
    }
  } catch (e) {
    console.log('  ERROR parseando:', e)
  }
}

// Tenants (para saber cuál es Hualsa)
const tenants = db.query(`SELECT id, name FROM Tenant`).all() as { id: string; name: string }[]
console.log('\n=== TENANTS ===')
for (const t of tenants) console.log(`  ${t.id} → ${t.name}`)

// Ubicaciones actuales en registros de palets del tenant Hualsa
const hualsa = tenants.find(t => /hualsa/i.test(t.name))
if (hualsa) {
  const regs = db.query(`SELECT id, c1, c2, cant, fecha, customData FROM Registro WHERE tenantId = ? ORDER BY fecha`).all(hualsa.id) as any[]
  const palets = regs.filter(r => /entrada palet|salida palet/i.test(`${r.c1} ${r.c2}`))
  console.log(`\n=== HUALSA (${hualsa.id}): ${regs.length} registros, ${palets.length} movimientos de palet ===`)
  const ubicCounts = new Map<string, number>()
  for (const r of palets) {
    let ub = ''
    try {
      const cd = JSON.parse(r.customData || '{}')
      for (const [k, v] of Object.entries(cd)) {
        if (/ubicac/i.test(k) && String(v || '').trim()) { ub = String(v).trim().toUpperCase(); break }
      }
    } catch {}
    if (ub) ubicCounts.set(ub, (ubicCounts.get(ub) || 0) + 1)
  }
  console.log('Ubicaciones vistas en movimientos:')
  for (const [ub, n] of [...ubicCounts.entries()].sort()) console.log(`  ${ub}: ${n} movs`)
}
db.close()
