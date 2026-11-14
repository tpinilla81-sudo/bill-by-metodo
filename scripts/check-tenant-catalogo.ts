import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true, slug: true } })
  console.log('TENANTS:')
  for (const t of tenants) console.log(`  ${t.id} name="${t.name}" slug="${t.slug}"`)
  const users = await db.user.findMany({ select: { email: true, tenantId: true, role: true } })
  console.log('USERS:')
  for (const u of users) console.log(`  ${u.email} (${u.role}) → ${u.tenantId}`)
}
main().catch(e => console.error('ERR:', e.message)).finally(() => process.exit(0))
