// Test: create a factura, toggle impresa on/off, verify persistence, then delete
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const tenant = await db.tenant.findFirst({ where: { slug: 'transportes-hualsa-2021-sl' } })
  if (!tenant) { console.log('No tenant'); return }
  console.log('Using tenant:', tenant.id, tenant.name)

  // 1) create test factura with impresa=false (default)
  const f = await db.factura.create({
    data: {
      tenantId: tenant.id,
      numero: 'TEST-IMPRESA-001',
      fecha: '2026-07-06',
      clienteNombre: 'CLIENTE TEST',
      lineas: JSON.stringify([{ fecha: '2026-07-06', c1: 'TEST', c2: 'X', cant: 1, clienteId: '', obs: '', precioUnitario: 100 }]),
      iva: 21,
      base: 100,
      ivaImp: 21,
      total: 121,
      modo: 'dia',
      registroIds: '[]',
      createdBy: 'test-script',
    }
  })
  console.log('Created factura:', f.id, 'impresa=', f.impresa)

  // 2) toggle to true
  await db.factura.update({ where: { id: f.id }, data: { impresa: true } })
  const f2 = await db.factura.findUnique({ where: { id: f.id } })
  console.log('After toggle TRUE: impresa=', f2.impresa)

  // 3) toggle back to false (simulating "quitar tick")
  await db.factura.update({ where: { id: f.id }, data: { impresa: false } })
  const f3 = await db.factura.findUnique({ where: { id: f.id } })
  console.log('After toggle FALSE: impresa=', f3.impresa)

  // 4) cleanup
  await db.factura.delete({ where: { id: f.id } })
  console.log('Deleted test factura ✓')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
