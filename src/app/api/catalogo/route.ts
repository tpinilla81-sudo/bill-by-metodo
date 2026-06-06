import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const catalogo = await db.catalogo.findMany({ orderBy: [{ c1: 'asc' }, { c2: 'asc' }] })
  return NextResponse.json(catalogo)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { clienteId, c1, c2, coste, inc, final } = body
  if (!c1 || !c2) return NextResponse.json({ error: 'Grupo y servicio obligatorios' }, { status: 400 })
  const item = await db.catalogo.create({
    data: { clienteId: clienteId || '', c1, c2, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(final) || 0 }
  })
  return NextResponse.json(item, { status: 201 })
}

export async function PUT(req: Request) {
  const body = await req.json()
  const { id, clienteId, c1, c2, coste, inc, final } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const item = await db.catalogo.update({
    where: { id },
    data: { clienteId: clienteId || '', c1, c2, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(final) || 0 }
  })
  return NextResponse.json(item)
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  await db.catalogo.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
