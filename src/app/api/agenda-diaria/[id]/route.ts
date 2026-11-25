import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// V29.80 — AGENDA DIARIA: edición y borrado (soft delete) de una línea.
// V29.92 — el PUT acepta también la prioridad estilo Opus One (A1, A2, B1...).

// Prioridad estilo Opus One: letra A-C + número. Cualquier otra cosa → ''.
function normPrioridad(v: any): string {
  const m = String(v || '').trim().toUpperCase().match(/^([ABC])\s*-?\s*(\d{1,2})$/)
  return m ? `${m[1]}${m[2]}` : ''
}

// V29.99.18 — marcador tipo fosforito: '', 'amarillo', 'rojo', 'verde'.
function normMarcador(v: any): string {
  const m = String(v || '').trim().toLowerCase()
  return ['amarillo', 'rojo', 'verde'].includes(m) ? m : ''
}

// PUT /api/agenda-diaria/[id] — actualiza los campos editables de la línea.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const { id } = await params

    const existing = await db.agendaDia.findFirst({ where: { id, tenantId: tid, deletedAt: null } })
    if (!existing) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })

    const body = await req.json()
    const data: any = {}
    if (body.tipo !== undefined) data.tipo = String(body.tipo) === 'facturacion' ? 'facturacion' : 'logistica'
    if (body.carga !== undefined) data.carga = Math.max(1, Math.round(Number(body.carga) || 1))
    if (body.cliente !== undefined) data.cliente = String(body.cliente || '').trim().slice(0, 80)
    if (body.concepto !== undefined) data.concepto = String(body.concepto || '').trim().slice(0, 120)
    if (body.nota !== undefined) data.nota = String(body.nota || '').trim().slice(0, 160)
    if (body.cantidad !== undefined) data.cantidad = Number(body.cantidad) || 0
    if (body.unidad !== undefined) data.unidad = String(body.unidad || '').trim().slice(0, 12)
    if (body.importe !== undefined) data.importe = Number(body.importe) || 0
    if (body.orden !== undefined) data.orden = Math.round(Number(body.orden) || 0)
    if (body.prioridad !== undefined) data.prioridad = normPrioridad(body.prioridad)
    if (body.marcador !== undefined) data.marcador = normMarcador(body.marcador)

    const updated = await db.agendaDia.update({ where: { id }, data })
    return NextResponse.json({ item: updated })
  } catch (err: any) {
    console.error('Agenda diaria PUT error:', err)
    return NextResponse.json({ error: 'Error actualizando línea: ' + (err?.message || '') }, { status: 500 })
  }
}

// DELETE /api/agenda-diaria/[id] — soft delete (la línea deja de mostrarse).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const { id } = await params

    const existing = await db.agendaDia.findFirst({ where: { id, tenantId: tid, deletedAt: null } })
    if (!existing) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })

    await db.agendaDia.update({ where: { id }, data: { deletedAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Agenda diaria DELETE error:', err)
    return NextResponse.json({ error: 'Error borrando línea: ' + (err?.message || '') }, { status: 500 })
  }
}
