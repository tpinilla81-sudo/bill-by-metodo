// Limpieza de los registros de prueba TEST-MAPA (verificación V23)
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const regs = await db.registro.findMany({ where: { obs: 'TEST-MAPA' }, select: { id: true } })
  console.log('Registros TEST-MAPA a borrar:', regs.length)
  if (regs.length > 0) {
    const r = await db.registro.deleteMany({ where: { obs: 'TEST-MAPA' } })
    console.log('Borrados:', r.count)
  }
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
