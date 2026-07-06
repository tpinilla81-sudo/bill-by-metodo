// List all users with their roles and tenants
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, tenantId: true, permissions: true },
    orderBy: [{ tenantId: 'asc' }, { role: 'asc' }, { email: 'asc' }],
  })
  console.log(`Total users: ${users.length}\n`)
  console.log('EMAIL | NAME | ROLE | TENANT | PERMISSIONS')
  console.log('-'.repeat(100))
  for (const u of users) {
    const perms = u.permissions ? u.permissions.substring(0, 80) : '(none)'
    console.log(`${u.email} | ${u.name || '-'} | ${u.role} | ${u.tenantId} | ${perms}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
