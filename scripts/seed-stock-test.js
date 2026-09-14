// Registros de prueba para validar STOCK ALMACÉN (solo BD local de pruebas).
// Se pueden borrar luego con: node scripts/seed-stock-test.js --clean
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const TENANT = 'cmq6uwub10000n9qluafni88m' // Transportes Hualsa 2021 SL.
const CLIENTE_ID = 'cmq5fc7x7003wnhqtsfwnaev9' // FLORETTE (cliente real del tenant)

function fechaHoyMenos(dias) {
  const d = new Date(Date.now() - dias * 86400000)
  return d.toISOString().slice(0, 10)
}

const TEST = [
  // entrada hoy → 1 día, verde
  { fecha: fechaHoyMenos(0), cliente: 'TEST CLIENTE A', c1: 'ALMACEN', c2: 'ENTRADA PALET', cant: 2, customData: JSON.stringify({ Lote: 'L-001', 'Ubicación': 'E1-03' }) },
  // entrada hace 40 días → ámbar
  { fecha: fechaHoyMenos(40), cliente: 'TEST CLIENTE A', c1: 'ALMACEN', c2: 'ENTRADA PALET', cant: 1, customData: JSON.stringify({ Lote: 'L-002', 'Ubicación': 'E1-07' }) },
  // entrada hace 70 días, ubicación NO configurada → rojo + fuera de config
  { fecha: fechaHoyMenos(70), cliente: 'TEST CLIENTE B', c1: 'ALMACEN', c2: 'ENTRADA PALET', cant: 3, customData: JSON.stringify({ Lote: 'L-003', 'Ubicación': 'NAVE-9' }) },
  // salida parcial del lote L-001 → E1-03 queda con 1
  { fecha: fechaHoyMenos(0), cliente: 'TEST CLIENTE A', c1: 'ALMACEN', c2: 'SALIDA PALET', cant: 1, customData: JSON.stringify({ Lote: 'L-001', 'Ubicación': 'E1-03' }) },
]

async function main() {
  if (process.argv.includes('--clean')) {
    const del = await p.registro.deleteMany({ where: { tenantId: TENANT, cliente: { startsWith: 'TEST CLIENTE' } } })
    console.log('borrados:', del.count)
  } else {
    for (const r of TEST) {
      await p.registro.create({ data: { ...r, clienteId: CLIENTE_ID, tenantId: TENANT } })
    }
    console.log('creados:', TEST.length)
  }
}

main().finally(() => p.$disconnect())
