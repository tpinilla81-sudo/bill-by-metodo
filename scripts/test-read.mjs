import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  // Check registros with empty clienteId
  const emptyCount = await prisma.registro.count({ where: { clienteId: '' } })
  const nullCount = await prisma.registro.count({ where: { clienteId: null } })
  console.log(`Empty clienteId: ${emptyCount}, Null clienteId: ${nullCount}`)
  
  // Read a sample
  const sample = await prisma.registro.findFirst({ where: { clienteId: '' } })
  if (sample) {
    console.log('Sample:', { id: sample.id, clienteId: sample.clienteId, c1: sample.c1 })
  }
}
main().finally(() => prisma.$disconnect())
