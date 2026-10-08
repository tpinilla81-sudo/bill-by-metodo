// Distribución de conceptos + clientes con movimientos de palet/almacén
import { Database } from 'bun:sqlite'
const db = new Database('/home/z/my-project/db/custom.db', { readonly: true })
const tid = 'cmq6uwub10000n9qluafni88m'

const regs = db.query(`SELECT c1, c2, COUNT(*) as n FROM Registro WHERE tenantId = ? GROUP BY c1, c2 ORDER BY n DESC`).all(tid) as any[]
console.log('=== CONCEPTOS HUALSA (c1 | c2: n) ===')
for (const r of regs) console.log(`  ${r.c1 || '(vacío)'} | ${r.c2 || '(vacío)'}: ${r.n}`)

const clientes = db.query(`SELECT id, nombre FROM Cliente WHERE tenantId = ?`).all(tid) as any[]
console.log('\n=== CLIENTES ===')
for (const c of clientes) console.log(`  ${c.id} → ${c.nombre}`)
db.close()
