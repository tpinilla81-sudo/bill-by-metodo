// Test if Prisma's registro.create() with clienteId: null actually works
process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db'
const { PrismaClient } = require('/home/z/my-project/node_modules/@prisma/client')
const db = new PrismaClient()

async function main() {
  console.log('--- Test 1: create() with clienteId: null ---')
  try {
    const r = await db.registro.create({
      data: {
        tenantId: 'cmq6uwub10000n9qluafni88m',
        fecha: '2026-06-17',
        clienteId: null,
        cliente: 'TEST_DELETE',
        c1: 'TEST',
        c2: 'TEST',
        cant: 1,
        precioUnitario: 0,
        obs: 'test-prisma-create',
        customData: '',
        pasadoRegistro: false,
      }
    })
    console.log('SUCCESS:', r.id)
    await db.registro.delete({ where: { id: r.id } })
    console.log('cleaned up')
  } catch (e) {
    console.log('FAILED:', e.message)
  }

  console.log('')
  console.log('--- Test 2: create() with clienteId: "" (empty string) ---')
  try {
    const r = await db.registro.create({
      data: {
        tenantId: 'cmq6uwub10000n9qluafni88m',
        fecha: '2026-06-17',
        clienteId: '',
        cliente: 'TEST_DELETE',
        c1: 'TEST',
        c2: 'TEST',
        cant: 1,
        precioUnitario: 0,
        obs: 'test-prisma-create',
        customData: '',
        pasadoRegistro: false,
      }
    })
    console.log('SUCCESS:', r.id)
    await db.registro.delete({ where: { id: r.id } })
    console.log('cleaned up')
  } catch (e) {
    console.log('FAILED:', e.message)
  }

  console.log('')
  console.log('--- Test 3: createMany() with clienteId: null (what user error mentions) ---')
  try {
    const r = await db.registro.createMany({
      data: [{
        tenantId: 'cmq6uwub10000n9qluafni88m',
        fecha: '2026-06-17',
        clienteId: null,
        cliente: 'TEST_DELETE',
        c1: 'TEST',
        c2: 'TEST',
        cant: 1,
        precioUnitario: 0,
        obs: 'test-prisma-create',
        customData: '',
        pasadoRegistro: false,
      }, {
        tenantId: 'cmq6uwub10000n9qluafni88m',
        fecha: '2026-06-17',
        clienteId: null,
        cliente: 'TEST_DELETE2',
        c1: 'TEST',
        c2: 'TEST',
        cant: 1,
        precioUnitario: 0,
        obs: 'test-prisma-create2',
        customData: '',
        pasadoRegistro: false,
      }]
    })
    console.log('SUCCESS count:', r.count)
    await db.registro.deleteMany({ where: { obs: { in: ['test-prisma-create', 'test-prisma-create2'] } } })
    console.log('cleaned up')
  } catch (e) {
    console.log('FAILED:', e.message)
  }

  console.log('')
  console.log('--- Test 4: createMany() with clienteId OMITTED entirely ---')
  try {
    const r = await db.registro.createMany({
      data: [{
        tenantId: 'cmq6uwub10000n9qluafni88m',
        fecha: '2026-06-17',
        cliente: 'TEST_DELETE',
        c1: 'TEST',
        c2: 'TEST',
        cant: 1,
        precioUnitario: 0,
        obs: 'test-prisma-create',
        customData: '',
        pasadoRegistro: false,
      }]
    })
    console.log('SUCCESS count:', r.count)
    await db.registro.deleteMany({ where: { obs: 'test-prisma-create' } })
    console.log('cleaned up')
  } catch (e) {
    console.log('FAILED:', e.message)
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) }).finally(() => db.$disconnect())
