// Debug: replicate /api/auth/me queries to find what throws
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const user = { id: 'cmq6uwub100002n9ql8582b7', tenantId: 'cmq6uwub10000n9qluafni88m' }
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true, logo: true, slug: true },
    })
    console.log('tenant OK:', tenant?.name)
  } catch (e) { console.error('tenant FAIL:', e.message) }
  try {
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { permissions: true },
    })
    console.log('user OK:', JSON.stringify(dbUser))
  } catch (e) { console.error('user FAIL:', e.message) }
  await db.$disconnect()
}
main()
