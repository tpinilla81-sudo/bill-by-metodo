import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const catalogo = await db.catalogo.findMany({ orderBy: [{ c1: 'asc' }, { c2: 'asc' }] })
  return NextResponse.json(catalogo)
}

export async function POST(req: Request) {
  const body = await req.json()

  // Batch import
  if (body.batch && Array.isArray(body.batch)) {
    const rows = body.batch as Array<{
      clienteId: string; c1: string; c2: string;
      coste: number; inc: number; final: number; customData?: string;
    }>

    const validRows = rows.filter(r => r.c1 && r.c2)
    if (validRows.length === 0) {
      return NextResponse.json({ error: 'No hay filas válidas' }, { status: 400 })
    }

    const created = await db.catalogo.createMany({
      data: validRows.map(r => ({
        clienteId: r.clienteId || '',
        c1: r.c1,
        c2: r.c2,
        coste: Number(r.coste) || 0,
        inc: Number(r.inc) || 0,
        final: Number(r.final) || 0,
        customData: r.customData || '',
      }))
    })

    return NextResponse.json({ count: created.count }, { status: 201 })
  }

  // Single entry
  const { clienteId, c1, c2, coste, inc, final, customData } = body
  if (!c1 || !c2) return NextResponse.json({ error: 'Grupo y servicio obligatorios' }, { status: 400 })
  const item = await db.catalogo.create({
    data: { clienteId: clienteId || '', c1, c2, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(final) || 0, customData: customData || '' }
  })
  return NextResponse.json(item, { status: 201 })
}

export async function PUT(req: Request) {
  const body = await req.json()
  const { id, clienteId, c1, c2, coste, inc, final, customData } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { clienteId: clienteId || '', c1, c2, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(final) || 0 }
  if (customData !== undefined) data.customData = customData
  const item = await db.catalogo.update({ where: { id }, data })
  return NextResponse.json(item)
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  await db.catalogo.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
