#!/usr/bin/env node
/**
 * Restore BILL database from a backup
 * 
 * Usage:
 *   node scripts/restore.mjs                     — list available backups
 *   node scripts/restore.mjs db <filename>        — restore from DB file copy
 *   node scripts/restore.mjs json <filename>      — restore from JSON export
 */

import { PrismaClient } from '@prisma/client'
import { readdirSync, readFileSync, copyFileSync, statSync, mkdirSync } from 'fs'
import { join } from 'path'

const BACKUP_DIR = '/home/z/my-project/backups'
const DB_BACKUP_DIR = '/home/z/my-project/backups/db'
const DB_PATH = '/home/z/my-project/db/custom.db'

function listBackups() {
  console.log('\n═══ Available DB file backups ═══')
  let dbFiles = []
  try {
    dbFiles = readdirSync(DB_BACKUP_DIR)
      .filter(f => f.startsWith('bill_db_') && f.endsWith('.db'))
      .sort()
      .reverse()
  } catch {}
  
  if (dbFiles.length === 0) {
    console.log('  (none)')
  } else {
    for (const f of dbFiles.slice(0, 20)) {
      const stat = statSync(join(DB_BACKUP_DIR, f))
      const size = (stat.size / 1024).toFixed(0)
      console.log(`  ${f}  (${size} KB)  ${stat.mtime.toISOString()}`)
    }
    if (dbFiles.length > 20) console.log(`  ... and ${dbFiles.length - 20} more`)
  }

  console.log('\n═══ Available JSON backups ═══')
  let jsonFiles = []
  try {
    jsonFiles = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('bill_backup_') && f.endsWith('.json'))
      .sort()
      .reverse()
  } catch {}

  if (jsonFiles.length === 0) {
    console.log('  (none)')
  } else {
    for (const f of jsonFiles.slice(0, 20)) {
      const stat = statSync(join(BACKUP_DIR, f))
      const size = (stat.size / 1024).toFixed(0)
      let counts = ''
      try {
        const data = JSON.parse(readFileSync(join(BACKUP_DIR, f), 'utf-8'))
        const c = data._meta?.counts
        if (c) counts = `T:${c.tenants||0} U:${c.users||0} Cl:${c.clientes||0} Cat:${c.catalogo||0} R:${c.registros||0}`
      } catch {}
      console.log(`  ${f}  (${size} KB)  ${counts}`)
    }
    if (jsonFiles.length > 20) console.log(`  ... and ${jsonFiles.length - 20} more`)
  }

  console.log('\nUsage:')
  console.log('  node scripts/restore.mjs db <filename>    — restore DB file (full binary copy)')
  console.log('  node scripts/restore.mjs json <filename>  — restore from JSON export')
  console.log('')
}

async function restoreFromDB(filename) {
  const sourcePath = join(DB_BACKUP_DIR, filename)
  try { statSync(sourcePath) } catch { console.error(`File not found: ${sourcePath}`); process.exit(1) }

  // Create a safety backup of current DB first
  const safetyName = `bill_db_pre-restore_${new Date().toISOString().slice(0,16).replace(/[:-]/g, '')}.db`
  mkdirSync(DB_BACKUP_DIR, { recursive: true })
  copyFileSync(DB_PATH, join(DB_BACKUP_DIR, safetyName))
  console.log(`✓ Current DB saved as safety backup: ${safetyName}`)

  // Copy the backup DB file
  copyFileSync(sourcePath, DB_PATH)
  console.log(`✓ Database restored from: ${filename}`)
  console.log('  Restart the app: npx pm2 restart bill-app')
}

async function restoreFromJSON(filename) {
  const sourcePath = join(BACKUP_DIR, filename)
  let data
  try { data = JSON.parse(readFileSync(sourcePath, 'utf-8')) } catch { console.error(`File not found or invalid: ${sourcePath}`); process.exit(1) }

  // Create safety backup first
  const safetyName = `bill_db_pre-restore_${new Date().toISOString().slice(0,16).replace(/[:-]/g, '')}.db`
  mkdirSync(DB_BACKUP_DIR, { recursive: true })
  copyFileSync(DB_PATH, join(DB_BACKUP_DIR, safetyName))
  console.log(`✓ Current DB saved as safety backup: ${safetyName}`)

  const prisma = new PrismaClient()
  try {
    console.log('Restoring data from JSON...')

    // Restore tenants
    if (data.tenants?.length) {
      await prisma.tenant.deleteMany().catch(() => {})
      for (const t of data.tenants) {
        await prisma.tenant.create({ data: { id: t.id, name: t.name } }).catch(e => console.log('  Tenant skip:', t.name, e.message))
      }
      console.log(`✓ Tenants: ${data.tenants.length}`)
    }

    // Restore users
    if (data.users?.length) {
      await prisma.user.deleteMany().catch(() => {})
      for (const u of data.users) {
        await prisma.user.create({ data: {
          id: u.id, email: u.email, passwordHash: u.passwordHash,
          name: u.name || '', role: u.role || 'user',
          permissions: u.permissions || '', tenantId: u.tenantId || null,
          isActive: u.isActive ?? true,
        } }).catch(e => console.log('  User skip:', u.email, e.message))
      }
      console.log(`✓ Users: ${data.users.length}`)
    }

    // Restore clientes
    if (data.clientes?.length) {
      await prisma.cliente.deleteMany().catch(() => {})
      await prisma.cliente.createMany({ data: data.clientes.map((c: any) => ({
        id: c.id, nombre: c.nombre || '', cif: c.cif || '', dir: c.dir || '',
        cp: c.cp || '', ciudad: c.ciudad || '', prov: c.prov || '',
        mail: c.mail || '', tel: c.tel || '', tenantId: c.tenantId || null,
      })) }).catch(e => console.log('  Clientes error:', e.message))
      console.log(`✓ Clientes: ${data.clientes.length}`)
    }

    // Restore catalogo
    if (data.catalogo?.length) {
      await prisma.catalogo.deleteMany().catch(() => {})
      await prisma.catalogo.createMany({ data: data.catalogo.map((x: any) => ({
        id: x.id, clienteId: x.clienteId || '', c1: x.c1 || '', c2: x.c2 || '',
        coste: Number(x.coste) || 0, inc: Number(x.inc) || 0, final: Number(x.final) || 0,
        tenantId: x.tenantId || null,
      })) }).catch(e => console.log('  Catalogo error:', e.message))
      console.log(`✓ Catalogo: ${data.catalogo.length}`)
    }

    // Restore registros
    if (data.registros?.length) {
      await prisma.registro.deleteMany().catch(() => {})
      await prisma.registro.createMany({ data: data.registros.map((r: any) => ({
        id: r.id, fecha: r.fecha || '', clienteId: r.clienteId || '',
        cliente: r.cliente || '', c1: r.c1 || '', c2: r.c2 || '',
        cant: Number(r.cant) || 1, obs: r.obs || '', pasadoRegistro: r.pasadoRegistro || false,
        tenantId: r.tenantId || null,
      })) }).catch(e => console.log('  Registros error:', e.message))
      console.log(`✓ Registros: ${data.registros.length}`)
    }

    // Restore config
    if (data.config) {
      await prisma.config.upsert({
        where: { id: 'main' },
        update: data.config,
        create: { id: 'main', ...data.config },
      }).catch(e => console.log('  Config error:', e.message))
      console.log(`✓ Config restored`)
    }

    // Restore factura seq
    if (data.facturaSeq) {
      await prisma.facturaSeq.deleteMany().catch(() => {})
      await prisma.facturaSeq.create({ data: { id: 'main', seq: Number(data.facturaSeq) || 1 } }).catch(() => {})
      console.log(`✓ FacturaSeq: ${data.facturaSeq}`)
    }

    console.log('\n✓ Restore complete! Restart the app: npx pm2 restart bill-app')
  } catch (err) {
    console.error('❌ Restore failed:', err)
  } finally {
    await prisma.$disconnect()
  }
}

// Main
const [,, mode, filename] = process.argv

if (!mode) {
  listBackups()
} else if (mode === 'db' && filename) {
  restoreFromDB(filename)
} else if (mode === 'json' && filename) {
  restoreFromJSON(filename)
} else {
  console.log('Usage:')
  console.log('  node scripts/restore.mjs                    — list backups')
  console.log('  node scripts/restore.mjs db <filename>      — restore DB file')
  console.log('  node scripts/restore.mjs json <filename>    — restore JSON export')
}
