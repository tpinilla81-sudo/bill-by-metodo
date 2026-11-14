// Inspección del catálogo del tenant Hualsa (qué c2 tienen precio y cliente asociado)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true } })
  console.log('TENANTS:', JSON.stringify(tenants))
  const t = tenants.find(x => x.name?.toLowerCase().includes('hualsa'))
  if (!t) return
  const clientes = await db.cliente.findMany({ where: { tenantId: t.id, deletedAt: null }, select: { id: true, nombre: true } })
  const nm = new Map(clientes.map(c => [c.id, c.nombre]))
  const cat = await db.catalogo.findMany({ where: { tenantId: t.id, deletedAt: null }, select: { c1: true, c2: true, final: true, clienteId: true }, take: 300 })
  console.log('CATALOG rows:', cat.length, '· con clienteId:', cat.filter(c => c.clienteId).length)
  const seen = new Set<string>()
  for (const c of cat) {
    const k = String(c.c2 || '').trim().replace(/\s+/g, ' ').toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    const cli = c.clienteId ? (nm.get(c.clienteId) || '¿?') : '(sin cliente)'
    console.log(`  [${String(c.c1 || '').trim()}] ${String(c.c2).trim().replace(/\s+/g, ' ')} = ${Number(c.final) || 0}€ → ${cli}`)
  }
  console.log('conceptos c2 únicos:', seen.size)
}
main().finally(() => db.$disconnect())
