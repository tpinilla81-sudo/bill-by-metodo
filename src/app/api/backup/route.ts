import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const [clientes, catalogo, registros, facturaSeq] = await Promise.all([
    db.cliente.findMany(),
    db.catalogo.findMany(),
    db.registro.findMany(),
    db.facturaSeq.findUnique({ where: { id: 'main' } })
  ])
  return NextResponse.json({ clientes, catalogo, registros, facturaSeq: facturaSeq?.seq || 1 })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { clientes, catalogo, registros, facturaSeq } = body

  // Delete all existing data
  await db.$transaction([
    db.registro.deleteMany(),
    db.catalogo.deleteMany(),
    db.cliente.deleteMany(),
    db.facturaSeq.deleteMany(),
  ])

  // Recreate
  if (clientes?.length) {
    await db.cliente.createMany({ data: clientes.map((c: Record<string, unknown>) => ({
      id: c.id as string,
      nombre: (c.nombre as string) || '',
      cif: (c.cif as string) || '',
      dir: (c.dir as string) || '',
      cp: (c.cp as string) || '',
      ciudad: (c.ciudad as string) || '',
      prov: (c.prov as string) || '',
      mail: (c.mail as string) || '',
      tel: (c.tel as string) || '',
    })) })
  }
  if (catalogo?.length) {
    await db.catalogo.createMany({ data: catalogo.map((x: Record<string, unknown>) => ({
      id: x.id as string,
      clienteId: (x.clienteId as string) || '',
      c1: (x.c1 as string) || '',
      c2: (x.c2 as string) || '',
      coste: Number(x.coste) || 0,
      inc: Number(x.inc) || 0,
      final: Number(x.final) || 0,
    })) })
  }
  if (registros?.length) {
    await db.registro.createMany({ data: registros.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      fecha: (r.fecha as string) || '',
      clienteId: (r.clienteId as string) || '',
      cliente: (r.cliente as string) || '',
      c1: (r.c1 as string) || '',
      c2: (r.c2 as string) || '',
      cant: Number(r.cant) || 1,
      obs: (r.obs as string) || '',
    })) })
  }
  await db.facturaSeq.create({ data: { id: 'main', seq: Number(facturaSeq) || 1 } })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  await db.$transaction([
    db.registro.deleteMany(),
    db.catalogo.deleteMany(),
    db.cliente.deleteMany(),
    db.facturaSeq.deleteMany(),
  ])
  await db.facturaSeq.create({ data: { id: 'main', seq: 1 } })
  return NextResponse.json({ ok: true })
}
