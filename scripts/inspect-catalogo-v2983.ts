// V29.83 — inspección del catálogo para integrarlo en el agente de la agenda
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const cats = await db.catalogo.findMany({ where: { deletedAt: null }, take: 50, orderBy: { createdAt: 'asc' } })
  console.log('Catálogo activo:', cats.length, '(mostrando hasta 50)')
  for (const c of cats) console.log(`  c1="${c.c1}" | c2="${c.c2}" | coste=${c.coste} inc=${c.inc} final=${c.final} clienteId="${c.clienteId.slice(0,8)}"`)
  const clientes = await db.cliente.findMany({ where: { deletedAt: null }, select: { id: true, nombre: true }, take: 15 })
  console.log('\nClientes:', clientes.length)
  for (const c of clientes) console.log(`  ${c.id.slice(0,8)} ${c.nombre}`)
  const tenants = await db.tenant.findMany({ select: { id: true, nombre: true } })
  console.log('\nTenants:', tenants.map(t => `${t.id.slice(0,8)} ${t.nombre}`).join(' | '))
}
main().finally(() => process.exit(0))
