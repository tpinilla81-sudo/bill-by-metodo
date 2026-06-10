import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId, getTenantId } from '@/lib/tenant-context'
import { promises as fs } from 'fs'
import path from 'path'

const BACKUP_DIR = path.join(process.cwd(), 'backups')

// Debounce: minimum seconds between automatic backups
const MIN_INTERVAL_SEC = 30 // 30 seconds between auto-backups
let lastBackupTime = 0

async function ensureDir() {
  try {
    await fs.access(BACKUP_DIR)
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true })
  }
}

// GET: list saved backups for this tenant
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    await ensureDir()
    const prefix = `bill_backup_${tid}_`
    const files = await fs.readdir(BACKUP_DIR)
    const backups = files
      .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        // Format: bill_backup_{tenantId}_2026-06-10_14-30-05_cambio.json
        const rest = f.slice(prefix.length)
        const match = rest.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})(?:-(\d{2}))?_(\w+)\.json/)
        if (match) {
          const date = `${match[1]} ${match[2]}:${match[3]}${match[4] ? ':' + match[4] : ''}`
          const type = match[5] || 'auto'
          return { filename: f, date, type, url: `/api/auto-backup/${f}` }
        }
        return { filename: f, date: rest, type: 'auto', url: `/api/auto-backup/${f}` }
      })
    return NextResponse.json({ backups })
  } catch (err) {
    console.error('List backups error:', err)
    return NextResponse.json({ backups: [] })
  }
}

// POST: create a backup now (tenant-scoped)
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    let reason = 'cambio'
    try {
      const body = await req.json()
      if (body?.reason) reason = body.reason
    } catch { /* no body, default to cambio */ }

    // Debounce for non-manual backups
    const now = Date.now()
    if (reason !== 'manual') {
      if (now - lastBackupTime < MIN_INTERVAL_SEC * 1000) {
        return NextResponse.json({ ok: true, skipped: true, message: 'Debounced' })
      }
    }
    lastBackupTime = now

    await ensureDir()

    // Only backup this tenant's data
    const [clientes, catalogo, registros, facturaSeq, config, users] = await Promise.all([
      db.cliente.findMany({ where: { tenantId: tid } }),
      db.catalogo.findMany({ where: { tenantId: tid } }),
      db.registro.findMany({ where: { tenantId: tid } }),
      db.facturaSeq.findUnique({ where: { tenantId: tid } }),
      db.config.findUnique({ where: { tenantId: tid } }),
      db.user.findMany({ where: { tenantId: tid } }),
    ])

    const data = {
      _meta: {
        version: 2,
        tenantId: tid,
        createdAt: new Date().toISOString(),
        type: reason,
      },
      clientes,
      catalogo,
      registros,
      facturaSeq: facturaSeq?.seq || 1,
      config: config || null,
      users: users ? users.map(u => ({ ...u, password: undefined })) : [],
    }

    const date = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const ts = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}_${reason}`
    const filename = `bill_backup_${tid}_${ts}.json`
    const filepath = path.join(BACKUP_DIR, filename)

    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8')

    // Cleanup: keep last 5 backups for THIS tenant
    const prefix = `bill_backup_${tid}_`
    const allFiles = (await fs.readdir(BACKUP_DIR)).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort()
    if (allFiles.length > 5) {
      const toDelete = allFiles.slice(0, allFiles.length - 5)
      await Promise.all(toDelete.map(f => fs.unlink(path.join(BACKUP_DIR, f))))
    }

    return NextResponse.json({ ok: true, filename, date: data._meta.createdAt })
  } catch (err) {
    console.error('Auto-backup error:', err)
    return NextResponse.json({ error: 'Error creando backup' }, { status: 500 })
  }
}
