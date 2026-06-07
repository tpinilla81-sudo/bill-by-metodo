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
      // Only entries NOT yet passed to registro
      where = { pasadoRegistro: false }
    } else if (filter === 'registros') {
      // Only entries already passed to registro
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
      c1: string; c2: string; cant: number; obs: string;
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
        pasadoRegistro: true, // Batch imports go directly to registros
      }))
    })

    return NextResponse.json({ count: created.count }, { status: 201 })
  }

  // Single entry — always created as NOT passed to registro (stays in Entrada)
  const { fecha, clienteId, cliente, c1, c2, cant, obs } = body
  if (!fecha || !clienteId || !c1 || !c2 || !cant) {
    return NextResponse.json({ error: 'Completa fecha, cliente, conceptos y cantidad' }, { status: 400 })
  }
  const registro = await db.registro.create({
    data: { fecha, clienteId, cliente: cliente || '', c1, c2, cant: Number(cant) || 1, obs: obs || '', pasadoRegistro: false }
  })
  return NextResponse.json(registro, { status: 201 })
}

export async function PUT(req: Request) {
  const body = await req.json()
  const { id, fecha, clienteId, cliente, c1, c2, cant, obs } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const registro = await db.registro.update({
    where: { id },
    data: { fecha, clienteId, cliente: cliente || '', c1, c2, cant: Number(cant) || 1, obs: obs || '' }
  })
  return NextResponse.json(registro)
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  await db.registro.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
