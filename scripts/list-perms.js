// List all users with their permissions expanded
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['user', 'facturacion'] } },
    select: { id: true, email: true, name: true, role: true, permissions: true },
    orderBy: [{ email: 'asc' }],
  })
  console.log(`Regular users (user/facturacion): ${users.length}\n`)
  for (const u of users) {
    let perms = []
    try { const v = JSON.parse(u.permissions || '[]'); if (Array.isArray(v)) perms = v } catch {}
    console.log(`Email: ${u.email}`)
    console.log(`  Name: ${u.name || '-'} | Role: ${u.role}`)
    console.log(`  Permissions (${perms.length}): ${perms.length === 0 ? '(empty = full access)' : perms.join(', ')}`)
    console.log(`  Has configuracion: ${perms.includes('configuracion')}`)
    console.log(`  Has configuracion.empresa: ${perms.includes('configuracion.empresa')}`)
    console.log('')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
