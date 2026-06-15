#!/usr/bin/env node
/**
 * Auto-backup script for BILL app
 * Reads all data from SQLite via Prisma and saves JSON files
 * 
 * Usage: node scripts/auto-backup.mjs
 * 
 * Backups are saved to: /home/z/my-project/backups/
 * File format: bill_backup_YYYY-MM-DD_HH-MM.json
 * Keeps last 30 backups, deletes older ones
 */

import { PrismaClient } from '@prisma/client'
import { writeFileSync, readdirSync, unlinkSync, statSync, mkdirSync } from 'fs'
import { join } from 'path'

const BACKUP_DIR = '/home/z/my-project/backups'
const MAX_BACKUPS = 30

async function runBackup() {
  const prisma = new PrismaClient()
  
  try {
    console.log(`[${new Date().toISOString()}] Starting auto-backup...`)
    
    // Ensure backup directory exists
    try { mkdirSync(BACKUP_DIR, { recursive: true }) } catch {}

    // Read all data
    const [clientes, catalogo, registros, facturaSeq, config, tenants, users] = await Promise.all([
      prisma.cliente.findMany(),
      prisma.catalogo.findMany(),
      prisma.registro.findMany(),
      prisma.facturaSeq.findUnique({ where: { id: 'main' } }),
      prisma.config.findUnique({ where: { id: 'main' } }),
      prisma.tenant.findMany(),
      prisma.user.findMany(),
    ])

    const backupData = {
      _meta: {
        version: '2.0',
        app: 'BILL',
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        counts: {
          tenants: tenants.length,
          users: users.length,
          clientes: clientes.length,
          catalogo: catalogo.length,
          registros: registros.length,
        }
      },
      tenants,
      users: users.map(u => ({ ...u, passwordHash: u.passwordHash })),
      clientes,
      catalogo,
      registros,
      facturaSeq: facturaSeq?.seq || 1,
      config,
    }

    // Save backup file
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-')
    const filename = `bill_backup_${dateStr}_${timeStr}.json`
    const filepath = join(BACKUP_DIR, filename)

    writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf-8')
    const fileSize = statSync(filepath).size
    const sizeMB = (fileSize / 1024 / 1024).toFixed(2)

    console.log(`✓ Backup saved: ${filename} (${sizeMB} MB)`)
    console.log(`  Tenants: ${tenants.length} | Users: ${users.length} | Clientes: ${clientes.length} | Catálogo: ${catalogo.length} | Registros: ${registros.length}`)

    // Clean old backups (keep last MAX_BACKUPS)
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('bill_backup_') && f.endsWith('.json'))
      .sort()
    
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(0, files.length - MAX_BACKUPS)
      for (const f of toDelete) {
        unlinkSync(join(BACKUP_DIR, f))
        console.log(`  Deleted old backup: ${f}`)
      }
    }

  } catch (err) {
    console.error('Backup failed:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runBackup()
