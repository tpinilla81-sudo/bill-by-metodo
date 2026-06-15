#!/usr/bin/env node
/**
 * Safe backup script — copies the ENTIRE database file (binary)
 * plus exports all data as JSON (including tenants & users)
 * 
 * This should run BEFORE any rebuild, schema change, or risky operation.
 * 
 * Usage: node scripts/safe-backup.mjs [reason]
 * Example: node scripts/safe-backup.mjs "pre-rebuild"
 */

import { PrismaClient } from '@prisma/client'
import { writeFileSync, readdirSync, unlinkSync, statSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'

const BACKUP_DIR = '/home/z/my-project/backups'
const DB_BACKUP_DIR = '/home/z/my-project/backups/db'
const DB_PATH = '/home/z/my-project/db/custom.db'
const MAX_JSON_BACKUPS = 60    // Keep 60 JSON backups (~2.5 days at hourly)
const MAX_DB_BACKUPS = 30      // Keep 30 DB file backups

const reason = process.argv[2] || 'scheduled'

async function runBackup() {
  const prisma = new PrismaClient()
  const timestamp = new Date().toISOString()
  const dateStr = timestamp.slice(0, 10)
  const timeStr = timestamp.slice(11, 16).replace(':', '-')
  
  try {
    console.log(`[${timestamp}] Starting backup (reason: ${reason})...`)
    
    // Ensure directories exist
    mkdirSync(BACKUP_DIR, { recursive: true })
    mkdirSync(DB_BACKUP_DIR, { recursive: true })

    // ── 1. BINARY DB BACKUP ── Copy the entire .db file
    const dbFilename = `bill_db_${dateStr}_${timeStr}.db`
    const dbBackupPath = join(DB_BACKUP_DIR, dbFilename)
    copyFileSync(DB_PATH, dbBackupPath)
    const dbSize = statSync(dbBackupPath).size
    console.log(`✓ DB file backup: ${dbFilename} (${(dbSize / 1024).toFixed(0)} KB)`)

    // Clean old DB backups
    const dbFiles = readdirSync(DB_BACKUP_DIR)
      .filter(f => f.startsWith('bill_db_') && f.endsWith('.db'))
      .sort()
    if (dbFiles.length > MAX_DB_BACKUPS) {
      const toDelete = dbFiles.slice(0, dbFiles.length - MAX_DB_BACKUPS)
      for (const f of toDelete) {
        unlinkSync(join(DB_BACKUP_DIR, f))
        console.log(`  Deleted old DB backup: ${f}`)
      }
    }

    // ── 2. JSON DATA BACKUP ── Export all data via Prisma
    const [tenants, users, clientes, catalogo, registros, facturaSeq, config] = await Promise.all([
      prisma.tenant.findMany().catch(() => []),
      prisma.user.findMany().catch(() => []),
      prisma.cliente.findMany().catch(() => []),
      prisma.catalogo.findMany().catch(() => []),
      prisma.registro.findMany().catch(() => []),
      prisma.facturaSeq.findUnique({ where: { id: 'main' } }).catch(() => null),
      prisma.config.findUnique({ where: { id: 'main' } }).catch(() => null),
    ])

    const backupData = {
      _meta: {
        version: '2.0',
        app: 'BILL',
        timestamp,
        date: dateStr,
        reason,
        counts: {
          tenants: tenants.length,
          users: users.length,
          clientes: clientes.length,
          catalogo: catalogo.length,
          registros: registros.length,
        }
      },
      tenants,
      users,
      clientes,
      catalogo,
      registros,
      facturaSeq: facturaSeq?.seq || 1,
      config,
    }

    const jsonFilename = `bill_backup_${dateStr}_${timeStr}.json`
    const jsonPath = join(BACKUP_DIR, jsonFilename)
    writeFileSync(jsonPath, JSON.stringify(backupData, null, 2), 'utf-8')
    const jsonSize = statSync(jsonPath).size
    console.log(`✓ JSON backup: ${jsonFilename} (${(jsonSize / 1024).toFixed(0)} KB)`)
    console.log(`  Tenants: ${tenants.length} | Users: ${users.length} | Clientes: ${clientes.length} | Catálogo: ${catalogo.length} | Registros: ${registros.length}`)

    // Clean old JSON backups
    const jsonFiles = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('bill_backup_') && f.endsWith('.json'))
      .sort()
    if (jsonFiles.length > MAX_JSON_BACKUPS) {
      const toDelete = jsonFiles.slice(0, jsonFiles.length - MAX_JSON_BACKUPS)
      for (const f of toDelete) {
        unlinkSync(join(BACKUP_DIR, f))
        console.log(`  Deleted old JSON backup: ${f}`)
      }
    }

    console.log(`✓ Backup complete!`)
    return true

  } catch (err) {
    console.error('❌ Backup FAILED:', err)
    return false
  } finally {
    await prisma.$disconnect()
  }
}

runBackup().then(ok => process.exit(ok ? 0 : 1))
