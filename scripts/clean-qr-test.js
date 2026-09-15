// Limpia las entradas de prueba L-TEST-* del dev DB local (y muestra el resto)
const path = require('path')
process.env.DATABASE_URL = 'file:' + path.resolve('./db/custom.db')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const all = await prisma.registro.findMany({
    select: { id: true, c1: true, c2: true, cant: true, customData: true, fecha: true, pasadoRegistro: true },
    orderBy: { fecha: 'asc' },
  })
  console.log('TOTAL registros:', all.length)
  for (const r of all) {
    const isTest = (r.customData || '').includes('L-TEST-')
    console.log(`${isTest ? 'TEST→' : '    '} id=${r.id} ${r.fecha} ${r.c1}/${r.c2} cant=${r.cant} ${(r.customData || '').slice(0, 90)} pasado=${r.pasadoRegistro}`)
  }
  const del = await prisma.registro.deleteMany({ where: { customData: { contains: 'L-TEST-' } } })
  console.log('Borrados:', del.count)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
