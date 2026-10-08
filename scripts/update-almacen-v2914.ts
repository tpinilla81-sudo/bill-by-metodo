// V29.14 — Nueva configuración del almacén: PARED 1 (P1) y PARED 2 (P2).
// Layout piramidal según la imagen del usuario (igual para ambas paredes):
//   FILA 1 (suelo): 9 huecos · FILA 2: 9 · FILA 3: 8 · FILA 4: 7 · FILA 5: 6
// El motor expresa la pirámide con caps[] (altura por hueco/columna):
//   columnas 1-6 → 5 niveles · columna 7 → 4 · columna 8 → 3 · columna 9 → 2
// Reemplaza la config anterior (E1, P1 antigua de 8, E2, S1) — el nuevo
// almacén SON las dos paredes. También elimina el registro de test L-TEST-4
// (único con ubicación, resto de sesiones de prueba anteriores).
import { Database } from 'bun:sqlite'

const DB_PATH = '/home/z/my-project/db/custom.db'
const TENANT = 'cmq6uwub10000n9qluafni88m' // Transportes Hualsa 2021 SL.

// caps equivalente a la pirámide [9,9,8,7,6] (verificada con capsDesdeNiveles)
const CAPS_PIRAMIDE = [5, 5, 5, 5, 5, 5, 4, 3, 2]

function nuevaPared(nombre: string) {
  return {
    id: Math.random().toString(36).slice(2, 9),
    nombre,
    tipo: 'pared',
    orientacion: 'izq',
    huecos: 9,
    cap: 0,
    caps: CAPS_PIRAMIDE,
    alias: [],
    criterios: {},
  }
}

// Réplica de alturasDesdeCaps (stock-almacen-view.tsx) para verificar
function alturasDesdeCaps(e: { huecos: number; caps?: number[] }): number[] {
  const huecos = e.huecos || 0
  if (huecos <= 0) return []
  const slice = (e.caps || []).slice(0, huecos)
  let k = 0
  for (const c of slice) if ((c || 0) > k) k = c || 0
  if (k === 0) return []
  const niveles = new Array<number>(k).fill(0)
  for (let i = 0; i < huecos; i++) {
    const c = Math.min(20, Math.max(0, slice[i] || 0))
    for (let fila = 1; fila <= c; fila++) niveles[fila - 1]++
  }
  return niveles
}

async function main() {
  const db = new Database(DB_PATH)

  // 1) BACKUP de la config actual
  const row = db.query('SELECT almacenCfg FROM Config WHERE tenantId = ?').get(TENANT) as { almacenCfg: string | null } | undefined
  const actual = row?.almacenCfg || '[]'
  const backupPath = '/home/z/my-project/scripts/backup-almacen-cfg-anterior.json'
  await Bun.write(backupPath, actual)
  console.log('Backup config anterior →', backupPath)
  console.log('Config anterior:', actual)

  // 2) Nueva config: P1 + P2 (las dos paredes con la pirámide de la imagen)
  const nueva = [nuevaPared('P1'), nuevaPared('P2')]
  db.query('UPDATE Config SET almacenCfg = ? WHERE tenantId = ?').run(JSON.stringify(nueva), TENANT)
  console.log('\nConfig actualizada: P1 + P2 (pared, 9 huecos, caps', JSON.stringify(CAPS_PIRAMIDE), ')')

  // 3) Eliminar el registro de test L-TEST-4 (resto de sesiones anteriores)
  const del = db.query(`DELETE FROM Registro WHERE id = 'cmu5ccfer0003u2y680je39ur' AND customData LIKE '%L-TEST-4%'`).run()
  console.log(`Registro de test L-TEST-4 eliminado: ${del.changes} fila(s)`)

  // 4) Verificación: leer de nuevo y reproducir la pirámide
  const row2 = db.query('SELECT almacenCfg FROM Config WHERE tenantId = ?').get(TENANT) as { almacenCfg: string }
  const cfg = JSON.parse(row2.almacenCfg)
  console.log('\n=== VERIFICACIÓN (leída de la DB) ===')
  let ok = true
  for (const e of cfg) {
    const niveles = alturasDesdeCaps(e)
    const total = niveles.reduce((s, n) => s + n, 0)
    const esperado = JSON.stringify([9, 9, 8, 7, 6])
    const valido = JSON.stringify(niveles) === esperado
    if (!valido) ok = false
    console.log(`  ${e.nombre} (${e.tipo}): huecos=${e.huecos} caps=${JSON.stringify(e.caps)}`)
    console.log(`    → filas ${JSON.stringify(niveles)} ${valido ? '✓ coincide con la imagen' : '✗ NO coincide'} · capacidad ${total} palets`)
  }
  const hu = db.query(`SELECT COUNT(*) n FROM Registro WHERE tenantId = ? AND customData LIKE '%ubicacion%'`).get(TENANT) as { n: number }
  console.log(`\nRegistros con ubicación restantes: ${hu.n} (esperado 0)`)
  console.log(ok ? '\n✔ CONFIGURACIÓN VÁLIDA' : '\n✗ ERROR: la pirámide no coincide')
  db.close()
  if (!ok) process.exit(1)
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })
