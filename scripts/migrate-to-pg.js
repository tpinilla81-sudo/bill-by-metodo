/**
 * Migration script: Copy data from local SQLite to production PostgreSQL
 * Uses native drivers to avoid Prisma schema conflicts
 */

const Database = require('better-sqlite3')
const { Client } = require('pg')

const PG_URL = 'postgresql://neondb_owner:npg_XTkOlLru2Q0U@ep-flat-dust-a2ska0bs-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

async function main() {
  const sqlite = new Database('/home/z/my-project/db/custom.db')
  sqlite.pragma('journal_mode = WAL')

  const pg = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } })
  await pg.connect()

  console.log('🔄 Starting data migration...\n')

  function esc(val) {
    if (val === null || val === undefined) return 'NULL'
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
    if (typeof val === 'number') return String(val)
    return "'" + String(val).replace(/'/g, "''") + "'"
  }

  function escBool(val) {
    if (val === null || val === undefined) return 'NULL'
    return val ? 'TRUE' : 'FALSE'
  }

  function escDate(val) {
    if (val === null || val === undefined) return 'NULL'
    if (typeof val === 'number') {
      return "'" + new Date(val).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00') + "'"
    }
    const d = new Date(val)
    if (isNaN(d.getTime())) return 'NULL'
    return "'" + d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00') + "'"
  }

  // Clean up
  console.log('🧹 Cleaning up existing data...')
  await pg.query(`DELETE FROM "Config"`)
  await pg.query(`DELETE FROM "FacturaSeq"`)
  await pg.query(`DELETE FROM "Registro"`)
  await pg.query(`DELETE FROM "Catalogo"`)
  await pg.query(`DELETE FROM "Cliente"`)
  await pg.query(`DELETE FROM "User"`)
  await pg.query(`DELETE FROM "Tenant"`)
  console.log('  ✅ Cleaned\n')

  // 1. Tenants
  const tenants = sqlite.prepare('SELECT * FROM Tenant').all()
  console.log(`📦 Tenants: ${tenants.length}`)
  for (const t of tenants) {
    try {
      await pg.query(`
        INSERT INTO "Tenant" ("id","name","slug","fullName","logo","address","city","province","cif","active","plan","planStatus","planExpiresAt","maxUsers","maxRegistros","createdAt","updatedAt")
        VALUES (${esc(t.id)},${esc(t.name)},${esc(t.slug)},${esc(t.fullName)},${esc(t.logo)},${esc(t.address)},${esc(t.city)},${esc(t.province)},${esc(t.cif)},${escBool(t.active)},${esc(t.plan)},${esc(t.planStatus)},${escDate(t.planExpiresAt)},${esc(t.maxUsers)},${esc(t.maxRegistros)},${escDate(t.createdAt)},${escDate(t.updatedAt)})
      `)
      console.log(`  ✅ ${t.name}`)
    } catch (e) {
      console.error(`  ❌ ${t.name}: ${e.message.slice(0, 150)}`)
    }
  }

  // 2. Users
  const users = sqlite.prepare('SELECT * FROM User').all()
  console.log(`\n📦 Users: ${users.length}`)
  for (const u of users) {
    try {
      await pg.query(`
        INSERT INTO "User" ("id","email","password","name","role","permissions","tenantId","active","createdAt","updatedAt")
        VALUES (${esc(u.id)},${esc(u.email)},${esc(u.password)},${esc(u.name)},${esc(u.role)},${esc(u.permissions)},${esc(u.tenantId)},${escBool(u.active)},${escDate(u.createdAt)},${escDate(u.updatedAt)})
      `)
      console.log(`  ✅ ${u.email}`)
    } catch (e) {
      console.error(`  ❌ ${u.email}: ${e.message.slice(0, 150)}`)
    }
  }

  // 3. Configs
  const configs = sqlite.prepare('SELECT * FROM Config').all()
  console.log(`\n📦 Configs: ${configs.length}`)
  for (const c of configs) {
    try {
      await pg.query(`
        INSERT INTO "Config" ("id","tenantId","companyName","companyFullName","companyAddress","companyCity","companyProvince","companyCif","logo","currency","defaultIva","appName","appVersion","labelEntrada","labelCatalogo","labelRegistros","labelFacturas","labelClientes","sectionEntrada","sectionRegistros","sectionClientes","sectionCatalogo","sectionFacturas","sectionBackup","transferMode","transferTime","fieldsEntrada","fieldsClientes","fieldsCatalogo","fieldsRegistros","fieldsFacturas","updatedAt")
        VALUES (${esc(c.id)},${esc(c.tenantId)},${esc(c.companyName)},${esc(c.companyFullName)},${esc(c.companyAddress)},${esc(c.companyCity)},${esc(c.companyProvince)},${esc(c.companyCif)},${esc(c.logo)},${esc(c.currency)},${esc(c.defaultIva)},${esc(c.appName)},${esc(c.appVersion)},${esc(c.labelEntrada)},${esc(c.labelCatalogo)},${esc(c.labelRegistros)},${esc(c.labelFacturas)},${esc(c.labelClientes)},${esc(c.sectionEntrada)},${esc(c.sectionRegistros)},${esc(c.sectionClientes)},${esc(c.sectionCatalogo)},${esc(c.sectionFacturas)},${esc(c.sectionBackup)},${esc(c.transferMode)},${esc(c.transferTime)},${esc(c.fieldsEntrada)},${esc(c.fieldsClientes)},${esc(c.fieldsCatalogo)},${esc(c.fieldsRegistros)},${esc(c.fieldsFacturas)},${escDate(c.updatedAt)})
      `)
      console.log(`  ✅ Config for ${c.tenantId}`)
    } catch (e) {
      console.error(`  ❌ Config: ${e.message.slice(0, 150)}`)
    }
  }

  // 4. Clientes
  const clientes = sqlite.prepare('SELECT * FROM Cliente').all()
  console.log(`\n📦 Clientes: ${clientes.length}`)
  for (const c of clientes) {
    try {
      await pg.query(`
        INSERT INTO "Cliente" ("id","tenantId","nombre","cif","dir","cp","ciudad","prov","mail","tel","customData","createdAt","updatedAt")
        VALUES (${esc(c.id)},${esc(c.tenantId)},${esc(c.nombre)},${esc(c.cif)},${esc(c.dir)},${esc(c.cp)},${esc(c.ciudad)},${esc(c.prov)},${esc(c.mail)},${esc(c.tel)},${esc(c.customData)},${escDate(c.createdAt)},${escDate(c.updatedAt)})
      `)
      console.log(`  ✅ ${c.nombre}`)
    } catch (e) {
      console.error(`  ❌ ${c.nombre}: ${e.message.slice(0, 150)}`)
    }
  }

  // 5. Catalogo
  const catalogo = sqlite.prepare('SELECT * FROM Catalogo').all()
  console.log(`\n📦 Catalogo: ${catalogo.length} items`)
  let catOk = 0
  for (const c of catalogo) {
    try {
      await pg.query(`
        INSERT INTO "Catalogo" ("id","tenantId","clienteId","c1","c2","coste","inc","final","customData","createdAt","updatedAt")
        VALUES (${esc(c.id)},${esc(c.tenantId)},${esc(c.clienteId)},${esc(c.c1)},${esc(c.c2)},${esc(c.coste)},${esc(c.inc)},${esc(c.final)},${esc(c.customData)},${escDate(c.createdAt)},${escDate(c.updatedAt)})
      `)
      catOk++
    } catch (e) {
      console.error(`  ❌ Catalogo: ${e.message.slice(0, 100)}`)
    }
  }
  console.log(`  ✅ ${catOk}/${catalogo.length} migrated`)

  // 6. Registros
  const registros = sqlite.prepare('SELECT * FROM Registro').all()
  console.log(`\n📦 Registros: ${registros.length} items`)
  let regOk = 0
  for (const r of registros) {
    try {
      await pg.query(`
        INSERT INTO "Registro" ("id","tenantId","fecha","clienteId","cliente","c1","c2","cant","obs","pasadoRegistro","facturado","customData","createdAt","updatedAt")
        VALUES (${esc(r.id)},${esc(r.tenantId)},${esc(r.fecha)},${esc(r.clienteId)},${esc(r.cliente)},${esc(r.c1)},${esc(r.c2)},${esc(r.cant)},${esc(r.obs)},${escBool(r.pasadoRegistro)},${escBool(r.facturado)},${esc(r.customData)},${escDate(r.createdAt)},${escDate(r.updatedAt)})
      `)
      regOk++
    } catch (e) {
      console.error(`  ❌ Registro: ${e.message.slice(0, 100)}`)
    }
  }
  console.log(`  ✅ ${regOk}/${registros.length} migrated`)

  // 7. FacturaSeqs
  const seqs = sqlite.prepare('SELECT * FROM FacturaSeq').all()
  console.log(`\n📦 FacturaSeqs: ${seqs.length}`)
  for (const f of seqs) {
    try {
      await pg.query(`
        INSERT INTO "FacturaSeq" ("id","tenantId","seq")
        VALUES (${esc(f.id)},${esc(f.tenantId)},${esc(f.seq)})
      `)
      console.log(`  ✅ Seq for ${f.tenantId}`)
    } catch (e) {
      console.error(`  ❌ FacturaSeq: ${e.message.slice(0, 100)}`)
    }
  }

  sqlite.close()
  await pg.end()
  console.log('\n🎉 Migration complete!')
}

main().catch(e => {
  console.error('❌ Migration failed:', e)
  process.exit(1)
})
