import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// GET /api/facturas/[id] — get one factura
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const { id } = await params

    const factura = await db.factura.findFirst({
      where: { id, tenantId: tid },
    })
    if (!factura) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    return NextResponse.json({ factura })
  } catch (err) {
    console.error('Factura GET error:', err)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}

// PUT /api/facturas/[id] — update editable fields (numero, fecha, clienteId)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const { id } = await params
    const body = await req.json()

    // only allow editing numero (and a few safe fields) per spec
    const allowed: any = {}
    if (typeof body.numero === 'string') allowed.numero = body.numero
    if (typeof body.fecha === 'string' && body.fecha) allowed.fecha = body.fecha
    if (typeof body.clienteId === 'string') allowed.clienteId = body.clienteId
    if (typeof body.clienteNombre === 'string') allowed.clienteNombre = body.clienteNombre
    if (typeof body.impresa === 'boolean') allowed.impresa = body.impresa
    // Edición de líneas (precios/cantidades) en el último paso de factura.
    // Recibe lineas (JSON string) + totales recalculados en el frontend.
    if (typeof body.lineas === 'string') allowed.lineas = body.lineas
    if (typeof body.base === 'number' && isFinite(body.base)) allowed.base = body.base
    if (typeof body.ivaImp === 'number' && isFinite(body.ivaImp)) allowed.ivaImp = body.ivaImp
    if (typeof body.total === 'number' && isFinite(body.total)) allowed.total = body.total

    const existing = await db.factura.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    const factura = await db.factura.update({
      where: { id },
      data: allowed,
    })

    return NextResponse.json({ factura })
  } catch (err) {
    console.error('Factura PUT error:', err)
    return NextResponse.json({ error: 'Error actualizando' }, { status: 500 })
  }
}

// DELETE /api/facturas/[id] — delete factura and un-mark registros
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const { id } = await params

    const existing = await db.factura.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    await db.$transaction(async (tx) => {
      await tx.factura.delete({ where: { id } })
      // un-mark registros
      let regIds: string[] = []
      try { regIds = JSON.parse(existing.registroIds || '[]') } catch {}
      if (regIds.length > 0) {
        await tx.registro.updateMany({
          where: { id: { in: regIds }, tenantId: tid },
          data: { facturado: false },
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Factura DELETE error:', err)
    return NextResponse.json({ error: 'Error eliminando' }, { status: 500 })
  }
}
