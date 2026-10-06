// Ver los campos configurados del tenant Hualsa (fieldsEntrada / fieldsRegistros)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const TID = 'cmq6uwub10000n9qluafni88m'
async function main() {
  const cfg = await db.config.findUnique({ where: { tenantId: TID } })
  if (!cfg) { console.log('Sin config'); return }
  for (const key of ['fieldsEntrada', 'fieldsRegistros'] as const) {
    const raw = (cfg as unknown as Record<string, string>)[key] || ''
    console.log(`\n── ${key} ──`)
    try {
      const arr = JSON.parse(raw) as Array<Record<string, unknown>>
      for (const f of arr) console.log(`  key=${f.key} · label=${f.label} · visible=${f.visible} · isCustom=${f.isCustom}`)
    } catch { console.log('  (vacío o no parseable):', raw.slice(0, 120)) }
  }
}
main().catch(e => { console.error(e?.message); process.exit(1) }).finally(() => process.exit(0))
