// Smoke test V29.11 — semilla de escenario «un hueco, un palet»:
//  · P1-1 (cap 3): lote A de 3 palets → columna LLENA
//  · E1-1 (cap 3): lote B de 1 palet → intento de moverlo a P1-1 debe
//    ser vetado por la UI (regla cliente); aquí solo preparamos datos.
// Limpia primero los lotes L-TEST-QR / L-TEST-3 de smoke anteriores.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const TID = 'cmq6uwub10000n9qluafni88m'

async function main() {
  // Limpiar smoke tests anteriores del tenant (solo ENTRADA/SALIDA PALET de test)
  const movs = await db.registro.findMany({ where: { tenantId: TID } })
  for (const r of movs) {
    const t = `${r.c1 || ''} ${r.c2 || ''}`.toLowerCase()
    if ((t.includes('entrada') && t.includes('palet')) || (t.includes('salida') && t.includes('palet'))) {
      await db.registro.delete({ where: { id: r.id } })
    }
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const mk = async (ident: string, ub: string, cant: number) => {
    await db.registro.create({
      data: {
        tenantId: TID,
        clienteId: 'FLORETTE-TEST',
        fecha: hoy,
        cant,
        c1: 'ALMACEN',
        c2: 'ENTRADA PALET',
        customData: JSON.stringify({ 'Nº PALET': ident, 'Ubicación': ub }),
      },
    })
  }

  // Cliente de test si no existe
  const cli = await db.cliente.findFirst({ where: { tenantId: TID, nombre: { contains: 'FLORETTE' } } })
  if (!cli) {
    await db.cliente.create({ data: { tenantId: TID, nombre: 'FLORETTE TEST' } })
  }
  const cliRow = await db.cliente.findFirst({ where: { tenantId: TID, nombre: { contains: 'FLORETTE' } } })

  // Borrar y recrear con el clienteId correcto
  const olds = await db.registro.findMany({ where: { tenantId: TID } })
  for (const r of olds) {
    const t = `${r.c1 || ''} ${r.c2 || ''}`.toLowerCase()
    if ((t.includes('entrada') && t.includes('palet')) || (t.includes('salida') && t.includes('palet'))) {
      await db.registro.delete({ where: { id: r.id } })
    }
  }
  const cid = cliRow!.id
  const mk2 = async (ident: string, ub: string, cant: number) => {
    await db.registro.create({
      data: {
        tenantId: TID,
        clienteId: cid,
        fecha: hoy,
        cant,
        c1: 'ALMACEN',
        c2: 'ENTRADA PALET',
        customData: JSON.stringify({ 'Nº PALET': ident, 'Ubicación': ub }),
      },
    })
  }
  await mk2('L-V2911-A', 'P1F1H1', 3)  // llena P1-1 (cap 3)
  await mk2('L-V2911-B', 'E1F1H1', 1)  // lote suelto en E1-1
  await mk2('L-V2911-C', 'E1F2H1', 1)  // lote suelto en E1-2 (para mover a P1-2 libre)
  console.log('Seed OK: P1-1 llena (3/3), E1-1 y E1-2 con 1 palet cada una')
}
main().catch(e => { console.error('SEED ERROR:', e?.message || e); process.exit(1) }).finally(() => process.exit(0))
