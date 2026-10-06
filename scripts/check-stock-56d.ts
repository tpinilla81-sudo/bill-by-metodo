// Consulta rápida: lotes en stock (ENTRADA PALET sin consumir) y sus días/ubicaciones
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
async function main() {
  const regs = await db.registro.findMany({ orderBy: { fecha: 'asc' } })
  const now = Date.now()
  const lotes: { id: string; fecha: string; dias: number; cant: number; ub: string; c1: string; c2: string; cli: string }[] = []
  for (const m of regs) {
    if (!isEntrada(m.c1, m.c2) && !isSalida(m.c1, m.c2)) continue
    if (isEntrada(m.c1, m.c2)) {
      lotes.push({ id: m.id, fecha: m.fecha, dias: Math.floor((now - new Date(m.fecha + 'T00:00:00').getTime()) / 86400000) + 1, cant: m.cant || 0, ub: getUbicacion(m.customData || ''), c1: m.c1 || '', c2: m.c2 || '', cli: m.clienteId || '' })
      continue
    }
    // salida: consumir FIFO
    let resto = m.cant || 0
    for (const l of lotes) {
      if (resto <= 0) break
      if (l.cant <= 0) continue
      const toma = Math.min(l.cant, resto)
      l.cant -= toma
      resto -= toma
    }
  }
  const stock = lotes.filter(l => l.cant > 0).sort((a, b) => b.dias - a.dias)
  console.log(`Lotes en stock: ${stock.length}`)
  for (const l of stock) {
    console.log(`${String(l.dias).padStart(3)}d · cant=${l.cant} · ub="${l.ub}" · ${l.c1}/${l.c2} · cli=${l.cli}`)
  }
  const cfg = await db.configKey.findMany().catch(() => [])
  console.log('\nconfigKeys:', cfg.map(c => c.key).join(', '))
}
main().finally(() => process.exit(0))
