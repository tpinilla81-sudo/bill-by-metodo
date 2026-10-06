// Distribución de conceptos c1/c2 en los registros del tenant Hualsa
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const tid = 'cmq6uwub10000n9qluafni88m'
async function main() {
  const regs = await db.registro.findMany({ where: { tenantId: tid }, orderBy: { fecha: 'desc' }, take: 250 })
  const acc = new Map<string, number>()
  for (const r of regs) { const k = `${r.c1 || ''}|${r.c2 || ''}`; acc.set(k, (acc.get(k) || 0) + 1) }
  console.log('Conceptos c1|c2:')
  for (const [k, n] of [...acc.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`)
}
main().finally(() => process.exit(0))
