import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// GET /api/agenda-diaria/mes?mes=YYYY-MM
// V29.94 — resumen mensual para pintar marcadores en el calendario mensual
// (Opus One: punto burdeos si hay logística, punto azul si hay facturación).
// V29.99.5 — además marca si hay líneas traspasadas a Registros (logTrasp/facTrasp)
// para pintar un círculo alrededor del punto correspondiente.
// Devuelve { dias: { "2026-11-15": { log, fac, logTrasp, facTrasp }, ... } }
// Sin tocar Registros ni Facturas — solo AgendaDia del tenant.
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const url = new URL(req.url)
    const mes = (url.searchParams.get('mes') || '').trim()
    // Validar YYYY-MM
    const m = /^(\d{4})-(\d{2})$/.exec(mes)
    if (!m) return NextResponse.json({ error: 'mes inválido (esperado YYYY-MM)' }, { status: 400 })

    // Rango: del primer día del mes al último (los strings ISO se ordenan bien)
    const desde = `${mes}-01`
    const [yy, mm] = [Number(m[1]), Number(m[2])]
    const mesIdx = mm - 1
    const ultimo = new Date(yy, mesIdx + 1, 0).getDate()
    const hasta = `${mes}-${String(ultimo).padStart(2, '0')}`

    const rows = await db.agendaDia.findMany({
      where: { tenantId: tid, fecha: { gte: desde, lte: hasta }, deletedAt: null },
      select: { fecha: true, tipo: true, traspasadoAt: true },
    })

    const dias: Record<string, { log: boolean; fac: boolean; logTrasp: boolean; facTrasp: boolean }> = {}
    for (const r of rows) {
      if (!dias[r.fecha]) dias[r.fecha] = { log: false, fac: false, logTrasp: false, facTrasp: false }
      const traspasada = !!r.traspasadoAt
      if (r.tipo === 'logistica') {
        dias[r.fecha].log = true
        if (traspasada) dias[r.fecha].logTrasp = true
      } else if (r.tipo === 'facturacion') {
        dias[r.fecha].fac = true
        if (traspasada) dias[r.fecha].facTrasp = true
      }
    }
    return NextResponse.json({ dias })
  } catch (err) {
    console.error('agenda-diaria/mes error:', err)
    return NextResponse.json({ error: 'Error leyendo resumen mensual' }, { status: 500 })
  }
}

