import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const tenant = await prisma.tenant.findFirst()
  console.log('Tenant:', tenant?.id, tenant?.name)
  if (!tenant) { console.log('No tenants'); return }
  
  // Test 1: with empty string ''
  try {
    const r1 = await prisma.registro.createMany({
      data: [{
        tenantId: tenant.id,
        fecha: '2025-01-15',
        clienteId: '',
        cliente: '',
        c1: 'TEST_EMPTY_STR',
        c2: 'TEST',
        cant: 1,
        precioUnitario: 0,
        obs: '',
        customData: '',
        pasadoRegistro: false,
      }]
    })
    console.log('TEST 1 (empty string) SUCCESS:', r1)
    await prisma.registro.deleteMany({ where: { c1: 'TEST_EMPTY_STR' } })
  } catch (err) {
    console.error('TEST 1 (empty string) ERROR:', err.message)
  }
  
  // Test 2: with null
  try {
    const r2 = await prisma.registro.createMany({
      data: [{
        tenantId: tenant.id,
        fecha: '2025-01-15',
        clienteId: null,
        cliente: '',
        c1: 'TEST_NULL',
        c2: 'TEST',
        cant: 1,
        precioUnitario: 0,
        obs: '',
        customData: '',
        pasadoRegistro: false,
      }]
    })
    console.log('TEST 2 (null) SUCCESS:', r2)
    await prisma.registro.deleteMany({ where: { c1: 'TEST_NULL' } })
  } catch (err) {
    console.error('TEST 2 (null) ERROR:', err.message)
  }
  
  // Test 3: without clienteId field
  try {
    const r3 = await prisma.registro.createMany({
      data: [{
        tenantId: tenant.id,
        fecha: '2025-01-15',
        cliente: '',
        c1: 'TEST_OMITTED',
        c2: 'TEST',
        cant: 1,
        precioUnitario: 0,
        obs: '',
        customData: '',
        pasadoRegistro: false,
      }]
    })
    console.log('TEST 3 (omitted) SUCCESS:', r3)
    await prisma.registro.deleteMany({ where: { c1: 'TEST_OMITTED' } })
  } catch (err) {
    console.error('TEST 3 (omitted) ERROR:', err.message)
  }
}
main().finally(() => prisma.$disconnect())
