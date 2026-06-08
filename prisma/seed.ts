import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create default BILL tenant (the platform company)
  const billTenant = await prisma.tenant.upsert({
    where: { slug: 'bill' },
    update: {},
    create: {
      name: 'BILL',
      slug: 'bill',
      fullName: 'BILL Sistema de Gestión',
      active: true,
    },
  })

  // Create superadmin user
  const hashedPw = await bcrypt.hash('admin123', 12)
  await prisma.user.upsert({
    where: { email: 'admin@bill.es' },
    update: {},
    create: {
      email: 'admin@bill.es',
      password: hashedPw,
      name: 'Administrador',
      role: 'superadmin',
      tenantId: billTenant.id,
      active: true,
    },
  })

  console.log('Seed complete: admin@bill.es / admin123')
}

main().catch(console.error).finally(() => prisma.$disconnect())
