// Seed V29.13 — datos de prueba SMURFIT para validar la tabla de datos
// de PRE-FACTURA: registros ENTRADA/SALIDA PALET con estructura nueva
// (c1="SMURFIT ENTRADA/SALIDA PALET", c2=código producto) y customData
// con campos propios NO configurados (albarán, matrícula, bultos).
// Limpiar al terminar: bun scripts/clean-v2913-test.ts
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const TID = 'cmq6uwub10000n9qluafni88m'

async function main() {
  let cli = await db.cliente.findFirst({ where: { tenantId: TID, nombre: 'SMURFIT WESTROCK TEST' } })
  if (!cli) cli = await db.cliente.create({ data: { tenantId: TID, nombre: 'SMURFIT WESTROCK TEST' } })

  // limpiar test anterior si lo hubiera
  const olds = await db.registro.findMany({ where: { tenantId: TID, clienteId: cli.id } })
  for (const r of olds) await db.registro.delete({ where: { id: r.id } })

  const mk = async (fecha: string, c1: string, c2: string, cant: number, cd: Record<string, string>) => {
    await db.registro.create({
      data: { tenantId: TID, clienteId: cli!.id, fecha, cant, c1, c2, customData: JSON.stringify(cd) },
    })
  }

  // Estructura NUEVA de catálogo SMURFIT: c1 = concepto completo, c2 = código
  await mk('2026-10-01', 'SMURFIT ENTRADA PALET', '10F1027', 12, {
    custom_lote: 'L-SM-001',
    custom_ubicacion: 'E1F3H2',
    'ALBARÁN': 'AB-88421',
    'MATRÍCULA': '4520-KJL',
    'BULTOS': '12',
  })
  await mk('2026-10-03', 'SMURFIT ENTRADA PALET', '10F1122', 8, {
    custom_lote: 'L-SM-002',
    custom_ubicacion: 'E1F4H1',
    'ALBARÁN': 'AB-88437',
    'MATRÍCULA': '8810-GTR',
    'BULTOS': '8',
  })
  await mk('2026-10-06', 'SMURFIT SALIDA PALET', '10F1027', 12, {
    custom_lote: 'L-SM-001',
    custom_ubicacion: 'E1F3H2',
    'ALBARÁN': 'AB-88502',
    'MATRÍCULA': '4520-KJL',
    'BULTOS': '12',
  })
  console.log('Seed OK: 3 registros SMURFIT con campos custom_lote, custom_ubicacion, ALBARÁN, MATRÍCULA, BULTOS · cliente:', cli.id)
}
main().catch(e => { console.error('SEED ERROR:', e?.message || e); process.exit(1) }).finally(() => process.exit(0))
