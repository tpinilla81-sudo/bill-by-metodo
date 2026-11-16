import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// V29.92 — NOTAS DEL DÍA (estilo Opus One "Daily Notes"): una nota libre por
// día y tenant, aparte de las líneas de la agenda. La UI la guarda sola
// (autosave con debounce). Nunca se vincula con Registros ni Facturas.
//   GET /api/agenda-diaria/notas?fecha=YYYY-MM-DD → { fecha, texto }
//   PUT { fecha, texto } → guarda (upsert) y devuelve la fila

function normFecha(f: any): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')) ? String(f) : ''
}

export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const url = new URL(req.url)
    const fecha = normFecha(url.searchParams.get('fecha'))
    if (!fecha) return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 })
    const row = await db.agendaNota.findUnique({
      where: { tenantId_fecha: { tenantId: tid, fecha } },
    })
    return NextResponse.json({ fecha, texto: row?.texto || '' })
  } catch (err: any) {
    console.error('Agenda notas GET error:', err)
    return NextResponse.json({ error: 'Error cargando la nota: ' + (err?.message || '') }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const body = await req.json().catch(() => null)
    const fecha = normFecha(body?.fecha)
    if (!fecha) return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 })
    const texto = String(body?.texto || '').slice(0, 5000)
    const row = await db.agendaNota.upsert({
      where: { tenantId_fecha: { tenantId: tid, fecha } },
      create: { tenantId: tid, fecha, texto },
      update: { texto },
    })
    return NextResponse.json({ ok: true, fecha, texto: row.texto, updatedAt: row.updatedAt })
  } catch (err: any) {
    console.error('Agenda notas PUT error:', err)
    return NextResponse.json({ error: 'Error guardando la nota: ' + (err?.message || '') }, { status: 500 })
  }
}
