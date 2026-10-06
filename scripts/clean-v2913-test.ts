// Limpia los datos de test de V29.13 (registros + cliente SMURFIT WESTROCK TEST)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const TID = 'cmq6uwub10000n9qluafni88m'
async function main() {
  const cli = await db.cliente.findFirst({ where: { tenantId: TID, nombre: 'SMURFIT WESTROCK TEST' } })
  if (!cli) { console.log('Nada que limpiar'); return }
  const del = await db.registro.deleteMany({ where: { tenantId: TID, clienteId: cli.id } })
  await db.cliente.delete({ where: { id: cli.id } })
  console.log(`Limpio: ${del.count} registros + cliente SMURFIT WESTROCK TEST`)
}
main().catch(e => { console.error(e?.message); process.exit(1) }).finally(() => process.exit(0))
