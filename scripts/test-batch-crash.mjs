import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ log: ['query', 'info', 'warn', 'error'] })

async function test() {
  const tid = 'cmq6uwub10000n9qluafni88m'
  try {
    console.log('Test: createMany with 2 rows, clienteId: null, MILCA/ALQUILER NAVE')
    const result = await prisma.registro.createMany({
      data: [
        { tenantId: tid, fecha: '2026-06-17', clienteId: null, cliente: '', c1: 'MILCA', c2: 'ALQUILER NAVE', cant: 1, precioUnitario: 0, obs: 'borrar', customData: '', pasadoRegistro: false },
        { tenantId: tid, fecha: '2026-06-17', clienteId: null, cliente: '', c1: 'MILCA', c2: 'ALQUILER NAVE', cant: 1, precioUnitario: 0, obs: 'borrar', customData: '', pasadoRegistro: false }
      ]
    })
    console.log('SUCCESS:', result)
  } catch (err) {
    console.error('ERROR:', err.message)
    console.error('FULL:', err)
  } finally {
    await prisma.$disconnect()
  }
}

test()
