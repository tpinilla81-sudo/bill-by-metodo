import { db } from '@/lib/db'
import { NextResponse } from 'next.server'
import { requireTenantId } from '@/lib/tenant-context'

// Debounce: minimum seconds between automatic backups
// Solo aplica a reason 'cambio' (los 'manual', 'antes_de' y 'idle' siempre se guardan)
const MIN_INTERVAL_SEC = 30 // 30 seconds between auto-backups
let lastBackupTime = 0

// Extract local date from filename: bill_backup_{tid}_2026-06-10_14-30-05_cambio[_label].json
function extractDateFromFilename(filename: string): string {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})(?:-(\d{2}))?_([\w-]+)(?:_(.+))?\.json/)
  if (match) {
    return `${match[1]} ${match[2]}:${match[3]}${match[4] ? ':' + match[4] : ''}`
  }
  return ''
}

// GET: list saved backups for this tenant (from database)
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const backups = await db.backup.findMany({
      where: { tenantId: tid },
      orderBy: { createdAt: 'desc' },
      select: { filename: true, type: true, createdAt: true }
    })

    const formatted = backups.map(b => {
      // Extract date from filename (already in client timezone)
      const dateFromFilename = extractDateFromFilename(b.filename)
      // Fallback to UTC createdAt if filename parse fails
      const dateStr = dateFromFilename || (() => {
        const d = b.createdAt
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      })()
      // Extract label from filename if present: ..._reason_label.json
      const labelMatch = b.filename.match(/_\w+_([\w-]+?)\.json$/)
      const hasLabel = b.filename.includes('_manual_') || b.filename.includes('_antes_de_')
      let label = ''
      if (b.filename.includes('_manual_')) {
        label = b.filename.split('_manual_')[1]?.replace(/\.json$/, '') || ''
      } else if (b.filename.includes('_antes_de_')) {
        label = 'antes de ' + (b.filename.split('_antes_de_')[1]?.replace(/\.json$/, '').replace(/_/g, ' ') || '')
      }
      return {
        filename: b.filename,
        date: dateStr,
        type: b.type,
        label,
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
// Body options:
//   reason: 'manual' | 'cambio' | 'idle' | 'antes_de' (default 'cambio')
//   tz: timezone string (e.g. 'Europe/Madrid')
//   label: optional label (e.g. 'antes de unificar catálogo'). For 'manual' and 'antes_de' only.
//
// IMPORTANT: NUNCA se borran backups automáticamente. La retención es ilimitada.
// El usuario decide cuándo borrar manualmente desde SEGURIDAD.
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    let reason = 'cambio'
    let tz: string | undefined
    let label = ''
    try {
      const body = await req.json()
      if (body?.reason) reason = String(body.reason).slice(0, 20)
      if (body?.tz) tz = String(body.tz)
      if (body?.label) {
        // Sanitizar label: solo alfanuméricos, espacios, guiones; max 40 chars
        label = String(body.label).trim().replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').replace(/\s+/g, '_').slice(0, 40)
      }
    } catch { /* no body, default to cambio */ }

    // Get timezone-aware date parts
    const nowForTs = new Date()
    const tzOpts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz || 'UTC' }
    const tzParts = new Intl.DateTimeFormat('en-CA', tzOpts).formatToParts(nowForTs)
    const get = (t: string) => tzParts.find(p => p.type === t)?.value || '00'

    // Debounce ONLY for 'cambio' backups (los automáticos frecuentes).
    // 'manual', 'antes_de' e 'idle' SIEMPRE se guardan (no se debouncean),
    // porque son momentos críticos y no podemos permitirnos perderlos.
    const now = Date.now()
    if (reason === 'cambio') {
      if (now - lastBackupTime < MIN_INTERVAL_SEC * 1000) {
        return NextResponse.json({ ok: true, skipped: true, message: 'Debounced' })
      }
      lastBackupTime = now
    }

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
        label: label || undefined,
      },
      clientes,
      catalogo,
      registros,
      facturaSeq: facturaSeq?.seq || 1,
      config: config || null,
      users: users ? users.map(u => ({ ...u, password: undefined })) : [],
    }

    const ts = `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}_${reason}`
    // Añadir label al filename si existe
    const labelSuffix = label ? `_${label}` : ''
    const filename = `bill_backup_${tid}_${ts}${labelSuffix}.json`

    // Save backup to database
    await db.backup.create({
      data: {
        tenantId: tid,
        filename,
        type: reason,
        data: JSON.stringify(data),
      }
    })

    // NO se hace limpieza automática. La retención es ILIMITADA.
    // El usuario es el único que puede borrar backups (manualmente desde SEGURIDAD).
    // Esto garantiza que "nada se pierde" — prioridad absoluta del sistema.

    return NextResponse.json({ ok: true, filename, date: createdAtLocal })
  } catch (err) {
    console.error('Auto-backup error:', err)
    return NextResponse.json({ error: 'Error creando backup' }, { status: 500 })
  }
}
