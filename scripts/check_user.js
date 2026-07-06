const { PrismaClient } = require('@prisma/client')
const path = require('path')

// Force SQLite
process.env.DATABASE_URL = 'file:' + path.resolve('./db/custom.db')

const prisma = new PrismaClient()
async function main() {
  const all = await prisma.user.findMany({ select: { id: true, email: true, role: true, permissions: true, active: true, tenantId: true } })
  console.log(JSON.stringify(all, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
