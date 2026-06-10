import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ─── 1. Create default tenant ──────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'bill' },
    update: {},
    create: {
      name: 'BILL',
      slug: 'bill',
      fullName: 'BILL by Metodo',
      plan: 'gratuito',
      planStatus: 'activo',
      maxUsers: 1,
      maxRegistros: 100,
    },
  })
  console.log(`✅ Tenant created: ${tenant.name} (${tenant.id})`)

  // ─── 2. Create superadmin user ─────────────────────────────
  const hashedPassword = await bcrypt.hash('admin123', 12)
  const superadmin = await prisma.user.upsert({
    where: { email: 'admin@bill.es' },
    update: {},
    create: {
      email: 'admin@bill.es',
      password: hashedPassword,
      name: 'Administrador',
      role: 'superadmin',
      tenantId: tenant.id,
      active: true,
    },
  })
  console.log(`✅ Superadmin created: ${superadmin.email}`)

  // ─── 3. Create default config for tenant ───────────────────
  const existingConfig = await prisma.config.findFirst({
    where: { tenantId: tenant.id },
  })
  if (!existingConfig) {
    await prisma.config.create({
      data: {
        tenantId: tenant.id,
        companyName: 'BILL by Metodo',
        companyFullName: '',
        appName: 'BILL by Metodo',
        appVersion: 'v3.0',
        currency: '€',
        defaultIva: 21,
        sectionEntrada: 'ENTRADA',
        sectionRegistros: 'REGISTROS',
        sectionClientes: 'CLIENTES',
        sectionCatalogo: 'CATÁLOGO',
        sectionFacturas: 'FACTURAS',
        sectionBackup: 'SEGURIDAD',
        transferMode: 'auto',
        transferTime: '00:00',
      },
    })
    console.log('✅ Default config created')
  } else {
    console.log('ℹ️  Config already exists, skipping')
  }

  // ─── 4. Create factura sequence ────────────────────────────
  const existingSeq = await prisma.facturaSeq.findFirst({
    where: { tenantId: tenant.id },
  })
  if (!existingSeq) {
    await prisma.facturaSeq.create({
      data: {
        tenantId: tenant.id,
        seq: 1,
      },
    })
    console.log('✅ Factura sequence created')
  }

  console.log('')
  console.log('🎉 Seed completed!')
  console.log('📧 Login: admin@bill.es')
  console.log('🔑 Password: admin123')
  console.log('⚠️  Change the password after first login!')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
