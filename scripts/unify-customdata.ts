// UNIFY CUSTOMDATA — normaliza claves custom en los registros del tenant.
//
// Qué hace:
//   Para cada registro, si tiene una clave custom cuyo label normalizado coincide
//   con el de una clave CANÓNICA (definida en fieldsEntrada) PERO con nombre
//   distinto (p. ej. "custom_codigoarticulo" en lugar de "custom_codigo_articulo"),
//   RENOMBRA la clave vieja a la canónica.
//
//   Esto unifica los customData para que TODOS los registros usen las mismas
//   claves (las de fieldsEntrada), evitando columnas duplicadas en STOCK ALMACÉN.
//
//   Si no hay canónica definida (p. ej. un campo que se importó por Excel), se
//   elige como canónica la clave con guiones bajos (custom_X_Y) si existe, si no
//   la primera encontrada, y se renombran las demás a esa.
//
// Seguridad:
//   · Dry-run por defecto: lista qué haría, NO toca nada.
//   · --apply: aplica los cambios.
//   · Backup previo en scripts/backup-pre-unify-customdata.json.
//
// Uso:
//   bun scripts/unify-customdata.ts            # dry-run
//   bun scripts/unify-customdata.ts --apply    # aplicar

import { Database } from 'bun:sqlite'
import { writeFileSync } from 'fs'

const DB = '/home/z/my-project/db/custom.db'
const TID = 'cmq6uwub10000n9qluafni88m' // Hualsa
const APPLY = process.argv.includes('--apply')

const db = new Database(DB)

console.log(`\n=== UNIFY CUSTOMDATA · tenant ${TID} · ${APPLY ? 'APLICAR' : 'DRY-RUN'} ===\n`)

// 1) Cargar fieldsEntrada para saber las claves canónicas
const cfgRow = db.prepare('SELECT fieldsEntrada FROM Config WHERE tenantId = ?').get(TID) as { fieldsEntrada?: string } | undefined
const fieldsEntrada: any[] = (() => {
  if (!cfgRow?.fieldsEntrada) return []
  try { const p = JSON.parse(cfgRow.fieldsEntrada); return Array.isArray(p) ? p : [] } catch { return [] }
})()
const clavesCanonicas = new Map<string, string>() // normLabel → clave canónica
for (const f of fieldsEntrada) {
  if (!f.isCustom) continue
  const lbl = String(f.label || f.key)
  const nl = lbl.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_]+/g, '').trim()
  clavesCanonicas.set(nl, f.key)
}
console.log(`fieldsEntrada: ${fieldsEntrada.length} campos, ${clavesCanonicas.size} custom canónicos`)

// 2) Helper de normalización
const normLabel = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_]+/g, '').trim()

// 3) Recoger todos los registros
const regs = db.prepare(`SELECT id, customData FROM Registro WHERE tenantId = ?`).all(TID) as { id: string; customData: string }[]
console.log(`Registros: ${regs.length}`)

// 4) Detectar todas las claves custom distintas que existen y su grupo
// (las que tienen el mismo normLabel se agrupan).
const claveAGrupo = new Map<string, string>() // clave exacta → normLabel
const grupoAClaves = new Map<string, string[]>() // normLabel → [claves exactas]
for (const r of regs) {
  let cd: any = {}
  try { cd = JSON.parse(r.customData || '{}') } catch { cd = {} }
  for (const k of Object.keys(cd)) {
    if (!k.startsWith('custom_')) continue
    if (claveAGrupo.has(k)) continue
    const lbl = fieldsEntrada.find(f => f.key === k)?.label || k.replace(/^custom_/, '').replace(/_/g, ' ').toUpperCase()
    const nl = normLabel(lbl)
    claveAGrupo.set(k, nl)
    if (!grupoAClaves.has(nl)) grupoAClaves.set(nl, [])
    grupoAClaves.get(nl)!.push(k)
  }
}

// 5) Para cada grupo, decidir la clave CANÓNICA a la que todos deben renombrarse.
const renombrar: Map<string, string> = new Map() // clave vieja → clave canónica
const gruposConDuplicados: { grupo: string, claves: string[], canonica: string, nRegs: number }[] = []
for (const [nl, ks] of grupoAClaves) {
  if (ks.length === 1) continue // Solo una clave para este label, no hay nada que unificar
  // Prioridad: 1) clave canónica de fieldsEntrada, 2) clave con más guiones bajos (post-custom_), 3) primera
  let canonica = clavesCanonicas.get(nl)
  if (!canonica || !ks.includes(canonica)) {
    canonica = ks.slice().sort((a, b) => (b.split('_').length - a.split('_').length))[0] || ks[0]
  }
  for (const k of ks) {
    if (k !== canonica) renombrar.set(k, canonica)
  }
  const nRegs = regs.filter(r => {
    let cd: any = {}
    try { cd = JSON.parse(r.customData || '{}') } catch {}
    return ks.some(k => k in cd)
  }).length
  gruposConDuplicados.push({ grupo: nl, claves: ks, canonica, nRegs })
}

console.log(`\nGrupos con claves duplicadas (entre registros):`)
if (gruposConDuplicados.length === 0) {
  console.log('  No se detectaron grupos con claves distintas para el mismo label. Nada que unificar.')
} else {
  for (const g of gruposConDuplicados) {
    console.log(`  · "${g.grupo}" → canónica "${g.canonica}" / renombrar ${JSON.stringify(g.claves.filter(k => k !== g.canonica))} (${g.nRegs} registros)`)
  }
}

// 6) Calcular cambios por registro
const aRenombrar: { id: string, cdAntes: any, cdDespues: any, cambios: { from: string, to: string, valor: string }[] }[] = []
for (const r of regs) {
  let cd: any = {}
  try { cd = JSON.parse(r.customData || '{}') } catch { cd = {} }
  const cambios: { from: string, to: string, valor: string }[] = []
  const nuevoCd: any = { ...cd }
  for (const [from, to] of renombrar) {
    if (!(from in nuevoCd)) continue
    const v = String(nuevoCd[from] || '').trim()
    // Si la canónica ya tiene valor, no sobrescribir (canónica gana)
    if (String(nuevoCd[to] || '').trim()) {
      delete nuevoCd[from]
      cambios.push({ from, to, valor: '(descartado: ya existe valor en canónica)' })
    } else {
      nuevoCd[to] = nuevoCd[from]
      delete nuevoCd[from]
      cambios.push({ from, to, valor: v })
    }
  }
  if (cambios.length > 0) {
    aRenombrar.push({ id: r.id, cdAntes: cd, cdDespues: nuevoCd, cambios })
  }
}
console.log(`\nTotal registros a renombrar: ${aRenombrar.length}`)
if (aRenombrar.length > 0) {
  console.log(`\nDetalle (primeros 20):`)
  for (const f of aRenombrar.slice(0, 20)) {
    console.log(`  · ${f.id}: ${f.cambios.map(c => `${c.from}→${c.to}`).join(', ')}`)
  }
  if (aRenombrar.length > 20) console.log(`  ... y ${aRenombrar.length - 20} más`)
}

if (!APPLY) {
  if (aRenombrar.length > 0) {
    console.log('\n=== DRY-RUN ===')
    console.log('Para aplicar:')
    console.log('  bun scripts/unify-customdata.ts --apply')
  }
  process.exit(0)
}

// === APPLY ===
console.log('\n=== APLICANDO CAMBIOS ===')
const backup = { timestamp: new Date().toISOString(), tenant: TID, registros: regs }
writeFileSync('/home/z/my-project/scripts/backup-pre-unify-customdata.json', JSON.stringify(backup))
console.log(`  Backup: scripts/backup-pre-unify-customdata.json (${backup.registros.length} registros)`)

let actualizados = 0
for (const f of aRenombrar) {
  const res = db.prepare('UPDATE Registro SET customData = ? WHERE id = ?').run(JSON.stringify(f.cdDespues), f.id)
  if (res.changes > 0) actualizados++
}
console.log(`  Registros actualizados: ${actualizados}`)
console.log('\n=== HECHO ===')

