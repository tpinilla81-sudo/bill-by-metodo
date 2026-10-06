// V29.11 — Inspección: ¿hay columnas por encima de su altura configurada?
// Regla del usuario: «un hueco, un palet» → ninguna columna puede superar su cap.
// Replica el motor de stock (buildStock) y cruza con Config.almacenCfg.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const isEntrada = (c1?: string, c2?: string) => {
  const t = `${c1 || ''} ${c2 || ''}`.toLowerCase()
  return t.includes('entrada') && t.includes('palet')
}
const isSalida = (c1?: string, c2?: string) => {
  const t = `${c1 || ''} ${c2 || ''}`.toLowerCase()
  return t.includes('salida') && t.includes('palet')
}
function getUbicacion(cdRaw: string): string {
  try {
    const cd = JSON.parse(cdRaw || '{}') as Record<string, unknown>
    for (const [k, v] of Object.entries(cd)) {
      const nk = k.toLowerCase()
      const val = String(v ?? '').trim()
      if (!val) continue
      if (/palet|lote/.test(nk)) continue
      if (/ubicac/.test(nk)) return val
    }
  } catch {}
  return ''
}
function getIdent(cdRaw: string): string {
  try {
    const cd = JSON.parse(cdRaw || '{}') as Record<string, unknown>
    for (const [k, v] of Object.entries(cd)) {
      const nk = k.toLowerCase()
      const val = String(v ?? '').trim()
      if (!val) continue
      if (/palet|lote/.test(nk)) return val
    }
  } catch {}
  return ''
}
// Réplica de normHuecoKey: clave de COLUMNA (rack-fila, sin altura)
function normHuecoKey(s: string): string {
  const t = String(s || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!t) return ''
  const m = t.match(/^([A-ZÀ-ÿ]+[0-9]*)F([0-9]+)(?:H([0-9]+))?/)
  if (m) return `${m[1]}-${parseInt(m[2], 10)}`
  const m2 = t.match(/^([A-ZÀ-ÿ]+[0-9]*)(.*)$/)
  if (!m2) return t.replace(/[^A-Z0-9]+/g, '-')
  const resto = (m2[2] || '').replace(/[^0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map(n => String(parseInt(n, 10)))
  if (resto.length >= 1) return `${m2[1]}-${resto[0]}`
  return m2[1]
}
// Réplica de capDeHueco: cap del hueco n (1-based) de una estantería
function capDeHueco(e: { cap?: number; caps?: number[] }, n: number): number {
  const c = Number(e?.caps?.[n - 1] ?? 0)
  return c > 0 ? Math.min(20, Math.floor(c)) : 0
}

async function main() {
  const tenants = await db.tenant.findMany()
  for (const t of tenants) {
    const regs = await db.registro.findMany({ where: { tenantId: t.id }, orderBy: { fecha: 'asc' } })
    const movs = regs.filter(r => isEntrada(r.c1, r.c2) || isSalida(r.c1, r.c2))
    if (movs.length === 0) continue
    console.log(`\n════ TENANT ${t.name} (${t.id}) · ${movs.length} movimientos palet ════`)

    // Config del tenant
    const cfgRow = await db.config.findUnique({ where: { tenantId: t.id }, select: { almacenCfg: true } })
    type Est = { id?: string; nombre: string; tipo?: string; huecos: number; cap?: number; caps?: number[] }
    let cfg: Est[] = []
    try { cfg = JSON.parse(cfgRow?.almacenCfg || '[]') as Est[] } catch {}
    const capDeClave = new Map<string, number>()
    for (const e of cfg) {
      const nombre = String(e?.nombre || '').trim().toUpperCase()
      if (!nombre || !e.huecos) continue
      console.log(`  config: ${nombre} (${e.tipo || 'estanteria'}) huecos=${e.huecos} caps=${JSON.stringify(e.caps || e.cap || [])}`)
      for (let n = 1; n <= e.huecos; n++) capDeClave.set(`${nombre}-${n}`, capDeHueco(e, n))
    }

    // Motor de stock (mismo orden que buildStock)
    const sorted = [...movs].sort((a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
      a.id.localeCompare(b.id))
    type Lote = { id: string; fecha: string; cant: number; ub: string; ident: string }
    const lotes: Lote[] = []
    for (const m of sorted) {
      if (isEntrada(m.c1, m.c2)) {
        lotes.push({ id: m.id, fecha: m.fecha, cant: m.cant || 0, ub: getUbicacion(m.customData || ''), ident: getIdent(m.customData || '') })
        continue
      }
      let resto = m.cant || 0
      for (const l of lotes) {
        if (resto <= 0) break
        if (l.cant <= 0) continue
        const toma = Math.min(l.cant, resto)
        l.cant -= toma
        resto -= toma
      }
    }
    const stock = lotes.filter(l => l.cant > 0)

    // Agrupar por COLUMNA
    type Col = { clave: string; ejemplo: string; total: number; lotes: Lote[] }
    const cols = new Map<string, Col>()
    for (const l of stock) {
      const clave = normHuecoKey(l.ub) || '(SIN UBICACIÓN)'
      let c = cols.get(clave)
      if (!c) { c = { clave, ejemplo: l.ub, total: 0, lotes: [] }; cols.set(clave, c) }
      c.total += l.cant
      c.lotes.push(l)
    }

    // Reporte
    let desbordadas = 0
    const filas: string[] = []
    for (const c of [...cols.values()].sort((a, b) => a.clave.localeCompare(b.clave))) {
      const n = parseInt(c.clave.split('-')[1], 10) || 0
      const cap = capDeClave.get(c.clave) ?? 0
      const exceso = cap > 0 && c.total > cap
      if (exceso) desbordadas++
      filas.push(`  ${exceso ? '⚠️ ' : '  '}${c.clave.padEnd(12)} total=${String(c.total).padStart(2)} cap=${String(cap).padStart(2)}${exceso ? '  ← EXCESO ' + (c.total - cap) : ''}  lotes: ${c.lotes.map(l => `${l.ident || l.id.slice(0, 6)}(${l.cant})ub=${l.ub || '—'}`).join(' · ')}`)
    }
    console.log(filas.join('\n'))
    console.log(`  → Columnas por encima de su altura: ${desbordadas}`)

    // Extra: dos lotes en la MISMA PLAZA (misma rack-fila-altura)
    const plazas = new Map<string, Lote[]>()
    for (const l of stock) {
      const m = l.ub.toUpperCase().match(/^([A-ZÀ-ÿ]+[0-9]*)F([0-9]+)H([0-9]+)/)
      if (!m) continue
      const pk = `${m[1]}-${parseInt(m[2], 10)}-${parseInt(m[3], 10)}`
      const arr = plazas.get(pk) || []
      arr.push(l)
      plazas.set(pk, arr)
    }
    const dupPlaza = [...plazas.entries()].filter(([, ls]) => ls.length > 1)
    if (dupPlaza.length) {
      console.log('  Plazas con MÁS DE UN LOTE (misma rack-fila-altura):')
      for (const [pk, ls] of dupPlaza) console.log(`    ${pk}: ${ls.map(l => `${l.ident || l.id.slice(0, 6)}(${l.cant})`).join(' · ')}`)
    } else {
      console.log('  Plazas duplicadas (misma rack-fila-altura): ninguna')
    }
  }
}
main().finally(() => process.exit(0))
