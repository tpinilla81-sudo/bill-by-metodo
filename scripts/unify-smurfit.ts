// UNIFICACIÓN DE CLIENTES SMURFIT — se ejecuta en DRY-RUN por defecto.
// Para aplicar cambios: bun scripts/unify-smurfit.ts --apply
//
// Qué hace:
//   1. Busca todos los clientes del tenant cuyo nombre contiene SMURFIT o WESTROCK.
//   2. Elige el canonical = el que tenga el nombre MÁS LARGO (típicamente el
//      completo con "ESPAÑA SA" / "SLU" / "S.L." / "S.A." al final). Si hay
//      empate, el primero alfabéticamente.
//   3. Reasigna al canonical:
//        · Registros (clienteId en todos los movimientos del tenant).
//        · Catálogo (clienteId en todas las líneas con c1/c2 SMURFIT).
//        · Campo `cliente` (nombre visible) en los registros → al nombre canonical.
//   4. Borra los clientes duplicados (los no-canonical que ya no tienen registros
//      ni catálogo apuntándolos).
//
// Seguridad:
//   · Dry-run por defecto: lista qué haría, NO toca nada.
//   · --apply: aplica los cambios.
//   · Antes de tocar nada, hace un backup de las tablas Cliente, Catalogo y Registro
//     en /home/z/my-project/scripts/backup-pre-unify-smurfit.json.
//   · Solo actúa sobre clientes con SMURFIT/WESTROCK en el nombre. El resto intacto.

import { Database } from 'bun:sqlite'
import { writeFileSync, readFileSync } from 'fs'

const DB = '/home/z/my-project/db/custom.db'
const TID = 'cmq6uwub10000n9qluafni88m' // Hualsa — cambia si otro tenant
const APPLY = process.argv.includes('--apply')

const db = new Database(DB)

console.log(`\n=== UNIFICACIÓN SMURFIT · tenant ${TID} · ${APPLY ? 'APLICAR' : 'DRY-RUN (no toca nada)'} ===\n`)

// 1) Buscar clientes SMURFIT/WESTROCK
const clientes = db.prepare(
  `SELECT id, nombre, cif FROM Cliente WHERE tenantId = ? AND (LOWER(nombre) LIKE '%smurfit%' OR LOWER(nombre) LIKE '%westrock%') ORDER BY LENGTH(nombre) DESC, nombre`
).all(TID) as { id: string; nombre: string; cif: string }[]

if (clientes.length === 0) {
  console.log('No hay clientes SMURFIT/WESTROCK en este tenant. Nada que unificar.')
  process.exit(0)
}

console.log(`Clientes encontrados: ${clientes.length}`)
for (const c of clientes) {
  console.log(`  · [${c.id}] "${c.nombre}"  CIF=${c.cif || '—'}`)
}

if (clientes.length === 1) {
  console.log('\nSolo hay un cliente SMURFIT/WESTROCK — ya está unificado. Nada que hacer.')
  process.exit(0)
}

// 2) Canonical = el de nombre más largo (típicamente "SMURFIT WESTROCK ESPAÑA SA")
const canonical = clientes[0]
console.log(`\nCanonical elegido (nombre más largo):`)
console.log(`  → [${canonical.id}] "${canonical.nombre}"  CIF=${canonical.cif || '—'}`)

const duplicados = clientes.slice(1)
console.log(`\nDuplicados a eliminar (${duplicados.length}):`)
for (const d of duplicados) {
  console.log(`  · [${d.id}] "${d.nombre}"  CIF=${d.cif || '—'}`)
}

// 3) Contar qué se va a mover
const statsPorDup = duplicados.map(d => {
  const regs = db.prepare('SELECT COUNT(*) as n FROM Registro WHERE tenantId = ? AND clienteId = ?').get(TID, d.id) as { n: number }
  const cat = db.prepare('SELECT COUNT(*) as n FROM Catalogo WHERE tenantId = ? AND clienteId = ?').get(TID, d.id) as { n: number }
  return { id: d.id, nombre: d.nombre, regs: regs.n, cat: cat.n }
})

console.log(`\nRegistros y catálogo a reasignar al canonical:`)
let totalRegs = 0, totalCat = 0
for (const s of statsPorDup) {
  console.log(`  · [${s.id}] "${s.nombre}": ${s.regs} registros + ${s.cat} líneas de catálogo`)
  totalRegs += s.regs
  totalCat += s.cat
}
console.log(`  TOTAL: ${totalRegs} registros + ${totalCat} líneas de catálogo → clienteId=${canonical.id}`)

// Adicional: también reasignar registros donde `cliente` (nombre) NO case con el canonical
// pero sí con un duplicado (p. ej. registros con cliente="SMURFIT WESTROCK" pero
// clienteId=canonical). Estos NO necesitan mover clienteId, pero sí actualizar el
// nombre visible al canonical.
const nomDups = duplicados.map(d => d.nombre)
const placeholders = nomDups.map(() => '?').join(',')
const regsNomMal = db.prepare(
  `SELECT COUNT(*) as n FROM Registro WHERE tenantId = ? AND cliente IN (${placeholders})`
).get(TID, ...nomDups) as { n: number }
console.log(`\nAdicional: ${regsNomMal.n} registros con nombre visible = un duplicado (se actualizará el campo 'cliente' al canonical).`)

if (!APPLY) {
  console.log('\n=== DRY-RUN ===')
  console.log('Para aplicar los cambios:')
  console.log('  bun scripts/unify-smurfit.ts --apply')
  process.exit(0)
}

// === APPLY ===
console.log('\n=== APLICANDO CAMBIOS ===')

// Backup previo
const backup = {
  timestamp: new Date().toISOString(),
  tenant: TID,
  clientes: db.prepare('SELECT * FROM Cliente WHERE tenantId = ?').all(TID),
  catalogo: db.prepare('SELECT * FROM Catalogo WHERE tenantId = ?').all(TID),
  registros: db.prepare('SELECT id, tenantId, clienteId, cliente, c1, c2, customData FROM Registro WHERE tenantId = ?').all(TID),
}
writeFileSync('/home/z/my-project/scripts/backup-pre-unify-smurfit.json', JSON.stringify(backup))
console.log(`  Backup: scripts/backup-pre-unify-smurfit.json (${backup.clientes.length} clientes, ${backup.catalogo.length} catálogo, ${backup.registros.length} registros)`)

// Transacción
db.transaction(() => {
  // 3a) Reasignar clienteId en Registros de cada duplicado → canonical
  for (const d of duplicados) {
    const r1 = db.prepare('UPDATE Registro SET clienteId = ? WHERE tenantId = ? AND clienteId = ?').run(canonical.id, TID, d.id)
    console.log(`  · UPDATE Registro SET clienteId=${canonical.id} WHERE clienteId=${d.id} → ${r1.changes} filas`)
  }
  // 3b) Reasignar clienteId en Catálogo de cada duplicado → canonical
  for (const d of duplicados) {
    const r2 = db.prepare('UPDATE Catalogo SET clienteId = ? WHERE tenantId = ? AND clienteId = ?').run(canonical.id, TID, d.id)
    console.log(`  · UPDATE Catalogo SET clienteId=${canonical.id} WHERE clienteId=${d.id} → ${r2.changes} filas`)
  }
  // 3c) Actualizar el campo 'cliente' (nombre visible) en todos los registros
  //     cuyo nombre sea uno de los duplicados → nombre canonical.
  for (const d of duplicados) {
    const r3 = db.prepare('UPDATE Registro SET cliente = ? WHERE tenantId = ? AND cliente = ?').run(canonical.nombre, TID, d.nombre)
    console.log(`  · UPDATE Registro SET cliente="${canonical.nombre}" WHERE cliente="${d.nombre}" → ${r3.changes} filas`)
  }
  // 3d) Borrar los duplicados (ya no tienen registros ni catálogo)
  for (const d of duplicados) {
    const r4 = db.prepare('DELETE FROM Cliente WHERE id = ?').run(d.id)
    console.log(`  · DELETE Cliente WHERE id=${d.id} → ${r4.changes} filas`)
  }
})()

console.log('\n=== HECHO ===')
// Verificación
const finalClientes = db.prepare(
  `SELECT id, nombre FROM Cliente WHERE tenantId = ? AND (LOWER(nombre) LIKE '%smurfit%' OR LOWER(nombre) LIKE '%westrock%')`
).all(TID) as { id: string; nombre: string }[]
console.log(`Clientes SMURFIT/WESTROCK tras la unificación: ${finalClientes.length}`)
for (const c of finalClientes) console.log(`  · [${c.id}] "${c.nombre}"`)

const finalRegs = db.prepare(
  `SELECT COUNT(*) as n, COUNT(DISTINCT clienteId) as cids FROM Registro WHERE tenantId = ? AND (LOWER(c1) LIKE '%smurfit%' OR LOWER(c2) LIKE '%smurfit%')`
).get(TID) as { n: number; cids: number }
console.log(`\nRegistros SMURFIT PALET: ${finalRegs.n} filas, ${finalRegs.cids} clienteId(s) distinto(s) (debería ser 1).`)
