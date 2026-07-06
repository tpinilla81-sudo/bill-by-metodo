const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, tenantId: true, permissions: true },
    orderBy: [{ tenantId: 'asc' }, { email: 'asc' }],
  })
  console.log(`Total users: ${users.length}\n`)
  for (const u of users) {
    let perms = []
    try { const v = JSON.parse(u.permissions || '[]'); if (Array.isArray(v)) perms = v } catch {}
    const permsStr = perms.length === 0 ? '(empty)' : perms.join(',')
    console.log(`${u.email} | ${u.role} | perms: ${permsStr}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })
