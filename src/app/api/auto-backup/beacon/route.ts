import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// POST /api/auto-backup/beacon
// Endpoint especial para navigator.sendBeacon() — se llama cuando el usuario
// cierra la pestaña o navega fuera. sendBeacon envía un Blob con Content-Type
// 'application/json', el body NO está parsed.
//
// Este endpoint SIEMPRE guarda el backup (sin debounce) porque es el último
// momento para capturar los cambios pendientes.
//
// Body: { reason?: 'idle' | 'cambio' | 'antes_de', tz?: string, dirty?: boolean }
// Si dirty === false, no se hace nada (no hay cambios que guardar).
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    let body: { reason?: string; tz?: string; dirty?: boolean } = {}
    try {
      body = await req.json()
    } catch {
      // sendBeacon puede enviar texto vacío en algunos casos
    }

    // Si no hay cambios pendientes, no creamos backup vacío
    if (body.dirty === false) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_dirty' })
    }

    const reason = body.reason === 'idle' ? 'idle' : 'cambio'
    const tz = body.tz

    // Get timezone-aware date parts
    const nowForTs = new Date()
    const tzOpts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz || 'UTC' }
    const tzParts = new Intl.DateTimeFormat('en-CA', tzOpts).formatToParts(nowForTs)
    const get = (t: string) => tzParts.find(p => p.type === t)?.value || '00'

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
        label: 'salida',
      },
      clientes,
      catalogo,
      registros,
      facturaSeq: facturaSeq?.seq || 1,
      config: config || null,
      users: users ? users.map(u => ({ ...u, password: undefined })) : [],
    }

    const ts = `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}_${reason}_salida`
    const filename = `bill_backup_${tid}_${ts}.json`

    await db.backup.create({
      data: {
        tenantId: tid,
        filename,
        type: reason,
        data: JSON.stringify(data),
      }
    })

    // Sin limpieza automática — retención ilimitada
    return NextResponse.json({ ok: true, filename })
  } catch (err) {
    console.error('Beacon backup error:', err)
    return NextResponse.json({ error: 'Error en beacon backup' }, { status: 500 })
  }
}
