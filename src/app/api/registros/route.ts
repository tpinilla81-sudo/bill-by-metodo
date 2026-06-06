import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const registros = await db.registro.findMany({ orderBy: { fecha: 'desc' } })
  return NextResponse.json(registros)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { fecha, clienteId, cliente, c1, c2, cant, obs } = body
  if (!fecha || !clienteId || !c1 || !c2 || !cant) {
    return NextResponse.json({ error: 'Completa fecha, cliente, conceptos y cantidad' }, { status: 400 })
  }
  const registro = await db.registro.create({
    data: { fecha, clienteId, cliente: cliente || '', c1, c2, cant: Number(cant) || 1, obs: obs || '' }
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
