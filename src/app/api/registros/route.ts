import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET /api/registros?filter=entrada|registros|all
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') || 'all'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = {}
    if (filter === 'entrada') {
      where = { pasadoRegistro: false }
    } else if (filter === 'registros') {
      where = { pasadoRegistro: true }
    }

    const registros = await db.registro.findMany({ where, orderBy: { fecha: 'desc' } })
    return NextResponse.json(registros)
  } catch (err) {
    console.error('Registros GET error:', err)
    return NextResponse.json({ error: 'Error cargando registros' }, { status: 500 })
  }
}

export async function POST(req: Request) {
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
    data: { fecha, clienteId, cliente: cliente || '', c1, c2, cant: Number(cant) || 1, obs: obs || '', customData: customData || '', pasadoRegistro: false }
  })
  return NextResponse.json(registro, { status: 201 })
}

export async function PUT(req: Request) {
  const body = await req.json()

  // Batch update facturado
  if (body.batchFacturado && Array.isArray(body.ids)) {
    const ids = body.ids as string[]
    if (ids.length === 0) return NextResponse.json({ count: 0 })
    const result = await db.registro.updateMany({
      where: { id: { in: ids } },
      data: { facturado: true }
    })
    return NextResponse.json({ count: result.count })
  }

  const { id, fecha, clienteId, cliente, c1, c2, cant, obs, customData, facturado } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { fecha, clienteId, cliente: cliente || '', c1, c2, cant: Number(cant) || 1, obs: obs || '' }
  if (customData !== undefined) data.customData = customData
  if (facturado !== undefined) data.facturado = Boolean(facturado)
  const registro = await db.registro.update({ where: { id }, data })
  return NextResponse.json(registro)
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  await db.registro.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
