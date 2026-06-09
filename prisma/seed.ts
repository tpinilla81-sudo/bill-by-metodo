import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create system tenant (for GESTORAPP - not a real company)
  const systemTenant = await prisma.tenant.upsert({
    where: { slug: 'sistema' },
    update: {},
    create: {
      name: 'Sistema',
      slug: 'sistema',
      fullName: 'METODO - Sistema',
      active: true,
    },
  })

  // Create superadmin user (GESTORAPP) - belongs to system tenant
  const hashedPw = await bcrypt.hash('admin123', 12)
  await prisma.user.upsert({
    where: { email: 'admin@bill.es' },
    update: {},
    create: {
      email: 'admin@bill.es',
      password: hashedPw,
      name: 'GESTORAPP',
      role: 'superadmin',
      tenantId: systemTenant.id,
      active: true,
    },
  })

  console.log('Seed complete: admin@bill.es / admin123 (GESTORAPP)')
}

main().catch(console.error).finally(() => prisma.$disconnect())
