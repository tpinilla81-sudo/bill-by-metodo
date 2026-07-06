// Quick check: list facturas with impresa field across all tenants
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const facturas = await db.factura.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: { id: true, numero: true, clienteNombre: true, total: true, impresa: true, tenantId: true }
  })
  console.log('Total facturas (top 10):', facturas.length)
  facturas.forEach(f => {
    console.log(`  id=${f.id.slice(-8)} numero=${JSON.stringify(f.numero)} cliente=${f.clienteNombre} total=${f.total} impresa=${f.impresa} tenant=${f.tenantId.slice(-8)}`)
  })
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
