import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// Debounce: minimum seconds between automatic backups
const MIN_INTERVAL_SEC = 30 // 30 seconds between auto-backups
let lastBackupTime = 0

// GET: list saved backups for this tenant (from database)
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const backups = await db.backup.findMany({
      where: { tenantId: tid },
      orderBy: { createdAt: 'desc' },
      select: { filename: true, type: true, createdAtLocal: true, createdAt: true }
    })

    const formatted = backups.map(b => {
      // Use createdAtLocal (client timezone) if available, fallback to UTC createdAt
      const dateStr = b.createdAtLocal || (() => {
        const d = b.createdAt
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      })()
      return {
        filename: b.filename,
        date: dateStr,
        type: b.type,
        url: `/api/auto-backup/${b.filename}`
      }
    })

    return NextResponse.json({ backups: formatted })
  } catch (err) {
    console.error('List backups error:', err)
    return NextResponse.json({ backups: [] })
  }
}

// POST: create a backup now (tenant-scoped, saved to database)
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    let reason = 'cambio'
    let tz: string | undefined
    try {
      const body = await req.json()
      if (body?.reason) reason = body.reason
      if (body?.tz) tz = body.tz
    } catch { /* no body, default to cambio */ }

    // Get timezone-aware date parts
    const nowForTs = new Date()
    const tzOpts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz || 'UTC' }
    const tzParts = new Intl.DateTimeFormat('en-CA', tzOpts).formatToParts(nowForTs)
    const get = (t: string) => tzParts.find(p => p.type === t)?.value || '00'

    // Debounce for non-manual backups
    const now = Date.now()
    if (reason !== 'manual') {
      if (now - lastBackupTime < MIN_INTERVAL_SEC * 1000) {
        return NextResponse.json({ ok: true, skipped: true, message: 'Debounced' })
      }
    }
    lastBackupTime = now

    // Only backup this tenant's data
    const [clientes, catalogo, registros, facturaSeq, config, users] = await Promise.all([
      db.cliente.findMany({ where: { tenantId: tid } }),
      db.catalogo.findMany({ where: { tenantId: tid } }),
      db.registro.findMany({ where: { tenantId: tid } }),
      db.facturaSeq.findUnique({ where: { tenantId: tid } }),
      db.config.findUnique({ where: { tenantId: tid } }),
      db.user.findMany({ where: { tenantId: tid } }),
    ])

    const createdAtLocal = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
    const data = {
      _meta: {
        version: 2,
        tenantId: tid,
        createdAt: new Date().toISOString(),
        createdAtLocal,
        timezone: tz || 'UTC',
        type: reason,
      },
      clientes,
      catalogo,
      registros,
      facturaSeq: facturaSeq?.seq || 1,
      config: config || null,
      users: users ? users.map(u => ({ ...u, password: undefined })) : [],
    }

    const ts = `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}_${reason}`
    const filename = `bill_backup_${tid}_${ts}.json`

    // Save backup to database with local time
    await db.backup.create({
      data: {
        tenantId: tid,
        filename,
        type: reason,
        createdAtLocal,
        data: JSON.stringify(data),
      }
    })

    // Cleanup: keep last 5 backups for THIS tenant
    const allBackups = await db.backup.findMany({
      where: { tenantId: tid },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    })

    if (allBackups.length > 5) {
      const toDelete = allBackups.slice(5).map(b => b.id)
      await db.backup.deleteMany({
        where: { id: { in: toDelete } }
      })
    }

    return NextResponse.json({ ok: true, filename, date: createdAtLocal })
  } catch (err) {
    console.error('Auto-backup error:', err)
    return NextResponse.json({ error: 'Error creando backup' }, { status: 500 })
  }
}
