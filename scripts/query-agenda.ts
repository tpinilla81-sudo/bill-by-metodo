// Consulta rápida: líneas de AgendaDia de noviembre (activas y borradas)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const rows = await db.agendaDia.findMany({
    where: { fecha: { gte: '2026-11-01' } },
    orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
  })
  console.log(`total filas: ${rows.length}`)
  for (const r of rows) {
    console.log(`${r.deletedAt ? 'DEL' : 'ACT'} | ${r.fecha} | c${r.carga} | ${r.tipo} | ${r.cliente || '-'} | ${r.concepto} | ${r.cantidad}${r.unidad} | ${r.importe}€ | voz:${r.viaVoz} | ${r.createdAt.toISOString()}`)
  }
}
main().catch(e => { console.error(e.message); process.exit(1) }).finally(() => db.$disconnect())
