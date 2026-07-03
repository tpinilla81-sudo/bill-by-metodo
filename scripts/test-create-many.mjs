// Test if prisma.registro.createMany with clienteId: null works
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function test() {
  try {
    const tid = 'cmq6uwub10000n9qluafni88m'
    console.log('Testing createMany with clienteId: null...')
    
    const result = await prisma.registro.createMany({
      data: [
        {
          tenantId: tid,
          fecha: '2026-06-17',
          clienteId: null,
          cliente: '',
          c1: 'TEST',
          c2: 'TEST_ITEM',
          cant: 1,
          precioUnitario: 0,
          obs: 'test_null',
          customData: '',
          pasadoRegistro: false,
        }
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
