import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// GET /api/registros?filter=entrada|registros|all
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') || 'all'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = { tenantId: tid }
    if (filter === 'entrada') {
      where = { tenantId: tid, pasadoRegistro: false }
    } else if (filter === 'registros') {
      where = { tenantId: tid, pasadoRegistro: true }
    }

    const registros = await db.registro.findMany({ where, orderBy: { fecha: 'desc' } })
    return NextResponse.json(registros)
  } catch (err) {
    console.error('Registros GET error:', err)
    return NextResponse.json({ error: 'Error cargando registros' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()

    // Batch import
    if (body.batch && Array.isArray(body.batch)) {
      const rows = body.batch as Array<{
        fecha: string; clienteId: string; cliente: string;
        c1: string; c2: string; cant: number; obs: string; customData?: string;
      }>

      const validRows = rows.filter(r => r.fecha && r.clienteId && r.c1 && r.c2)
      if (validRows.length === 0) {
        return NextResponse.json({ error: 'No hay filas válidas' }, { status: 400 })
      }

      const created = await db.registro.createMany({
        data: validRows.map(r => ({
          tenantId: tid,
          fecha: r.fecha,
          clienteId: r.clienteId,
          cliente: r.cliente || '',
          c1: r.c1,
          c2: r.c2,
          cant: Number(r.cant) || 1,
          obs: r.obs || '',
          customData: r.customData || '',
          pasadoRegistro: true,
        }))
      })

      return NextResponse.json({ count: created.count }, { status: 201 })
    }

    // Single entry
    const { fecha, clienteId, cliente, c1, c2, cant, obs, customData } = body
    if (!fecha || !clienteId || !c1 || !c2 || !cant) {
      return NextResponse.json({ error: 'Completa fecha, cliente, conceptos y cantidad' }, { status: 400 })
    }
    const registro = await db.registro.create({
      data: { tenantId: tid, fecha, clienteId, cliente: cliente || '', c1, c2, cant: Number(cant) || 1, obs: obs || '', customData: customData || '', pasadoRegistro: false }
    })
    return NextResponse.json(registro, { status: 201 })
  } catch (err) {
    console.error('Registros POST error:', err)
    return NextResponse.json({ error: 'Error creando registro' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()

    // Batch update facturado
    if (body.batchFacturado && Array.isArray(body.ids)) {
      const ids = body.ids as string[]
      if (ids.length === 0) return NextResponse.json({ count: 0 })
      const result = await db.registro.updateMany({
        where: { id: { in: ids }, tenantId: tid },
        data: { facturado: true }
      })
      return NextResponse.json({ count: result.count })
    }

    // Batch quitar facturado
    if (body.batchQuitarFacturado && Array.isArray(body.ids)) {
      const ids = body.ids as string[]
      if (ids.length === 0) return NextResponse.json({ count: 0 })
      const result = await db.registro.updateMany({
        where: { id: { in: ids }, tenantId: tid },
        data: { facturado: false }
      })
      return NextResponse.json({ count: result.count })
    }

    const { id, fecha, clienteId, cliente, c1, c2, cant, obs, customData, facturado } = body
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    // Verify ownership
    const existing = await db.registro.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { fecha, clienteId, cliente: cliente || '', c1, c2, cant: Number(cant) || 1, obs: obs || '' }
    if (customData !== undefined) data.customData = customData
    if (facturado !== undefined) data.facturado = Boolean(facturado)
    const registro = await db.registro.update({ where: { id }, data })
    return NextResponse.json(registro)
  } catch (err) {
    console.error('Registros PUT error:', err)
    return NextResponse.json({ error: 'Error actualizando registro' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    // Try body first for batch delete
    let body: { ids?: string[] } = {}
    try { body = await req.json() } catch { /* no body or invalid JSON */ }

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      // Batch delete - only delete records owned by this tenant
      const result = await db.registro.deleteMany({
        where: { id: { in: body.ids }, tenantId: tid }
      })
      return NextResponse.json({ count: result.count, ok: true })
    }

    // Single delete via query param
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    // Verify ownership
    const existing = await db.registro.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

    await db.registro.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Registros DELETE error:', err)
    return NextResponse.json({ error: 'Error eliminando registro' }, { status: 500 })
  }
}
