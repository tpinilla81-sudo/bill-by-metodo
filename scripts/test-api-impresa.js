// Test API endpoint: GET returns impresa, PUT toggles impresa correctly
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const tenant = await db.tenant.findFirst({ where: { slug: 'transportes-hualsa-2021-sl' } })

  // Create a test factura via DB (we'll test the API GET/PUT on it)
  const f = await db.factura.create({
    data: {
      tenantId: tenant.id,
      numero: 'API-TEST-IMPRESA',
      fecha: '2026-07-06',
      clienteNombre: 'API TEST',
      lineas: '[]',
      iva: 21, base: 0, ivaImp: 0, total: 0,
      modo: 'dia', registroIds: '[]', createdBy: 'api-test',
    }
  })
  console.log('TEST_FACTURA_ID=' + f.id)
  console.log('TENANT_ID=' + tenant.id)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
