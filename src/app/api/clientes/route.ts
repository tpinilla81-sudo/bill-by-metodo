import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const clientes = await db.cliente.findMany({ orderBy: { nombre: 'asc' } })
  return NextResponse.json(clientes)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { nombre, cif, dir, cp, ciudad, prov, mail, tel, customData } = body
  if (!nombre) return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 })
  const cliente = await db.cliente.create({
    data: { nombre, cif: cif || '', dir: dir || '', cp: cp || '', ciudad: ciudad || '', prov: prov || '', mail: mail || '', tel: tel || '', customData: customData || '' }
  })
  return NextResponse.json(cliente, { status: 201 })
}

export async function PUT(req: Request) {
  const body = await req.json()
  const { id, nombre, cif, dir, cp, ciudad, prov, mail, tel, customData } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { nombre, cif: cif || '', dir: dir || '', cp: cp || '', ciudad: ciudad || '', prov: prov || '', mail: mail || '', tel: tel || '' }
  if (customData !== undefined) data.customData = customData
  const cliente = await db.cliente.update({ where: { id }, data })
  return NextResponse.json(cliente)
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  await db.cliente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
