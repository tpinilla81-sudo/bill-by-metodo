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

  // Create default config for the BILL tenant
  await prisma.config.upsert({
    where: { id: 'config-bill' },
    update: {},
    create: {
      id: 'config-bill',
      tenantId: billTenant.id,
      companyName: 'BILL by Metodo',
      appName: 'BILL by Metodo',
      appVersion: 'v3.0',
    },
  })

  console.log('Seed complete: admin@bill.es / admin123 (GESTORAPP)')
}

main().catch(console.error).finally(() => prisma.$disconnect())
