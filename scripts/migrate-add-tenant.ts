import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

const oldPrisma = new PrismaClient()

async function main() {
  // Step 1: Get the first tenant (there should be at least one)
  const tenants = await oldPrisma.tenant.findMany()
  console.log(`Found ${tenants.length} tenants:`, tenants.map(t => t.name))

  if (tenants.length === 0) {
    console.error('No tenants found! Cannot migrate.')
    process.exit(1)
  }

  // For now, assign all existing data to the first tenant
  // In a real multi-tenant setup with existing data from multiple tenants,
  // you'd need a different strategy
  const defaultTenantId = tenants[0].id
  console.log(`Default tenant: ${tenants[0].name} (${defaultTenantId})`)

  // Step 2: Push schema with force (this will add the columns)
  // We need to use raw SQL to add columns with default values

  // Add tenantId to each table with a default
  const tables = ['Cliente', 'Catalogo', 'Registro', 'Config', 'FacturaSeq']

  for (const table of tables) {
    try {
      await oldPrisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT '${defaultTenantId}'`)
      console.log(`Added tenantId to ${table}`)
    } catch (e: any) {
      if (e.message?.includes('duplicate column')) {
        console.log(`tenantId already exists in ${table}`)
      } else {
        console.error(`Error adding tenantId to ${table}:`, e.message)
      }
    }
  }

  // Step 3: Fix Config and FacturaSeq - they used singleton "main" as id
  // Need to change id to cuid and add unique constraint on tenantId
  
  // For Config: update the existing row's id to a cuid
  const existingConfig = await oldPrisma.$queryRawUnsafe(`SELECT id FROM Config LIMIT 1`) as any[]
  if (existingConfig?.length) {
    const newId = 'cfg_' + Date.now()
    await oldPrisma.$executeRawUnsafe(`UPDATE Config SET id = '${newId}' WHERE id = 'main'`)
    console.log(`Updated Config id from 'main' to '${newId}'`)
  }

  // For FacturaSeq: update the existing row's id to a cuid
  const existingSeq = await oldPrisma.$queryRawUnsafe(`SELECT id FROM FacturaSeq LIMIT 1`) as any[]
  if (existingSeq?.length) {
    const newId = 'seq_' + Date.now()
    await oldPrisma.$executeRawUnsafe(`UPDATE FacturaSeq SET id = '${newId}' WHERE id = 'main'`)
    console.log(`Updated FacturaSeq id from 'main' to '${newId}'`)
  }

  console.log('\nMigration complete! Now run: npx prisma db push')
  console.log('This will sync the Prisma schema with the updated database.')

  await oldPrisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
