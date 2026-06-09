import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuthWithTenant } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const auth = await requireAuthWithTenant(req)
    if ('error' in auth) return auth.error

    const [clientes, catalogo, registros, facturaSeq] = await Promise.all([
      db.cliente.findMany({ where: { tenantId: auth.tenantId } }),
      db.catalogo.findMany({ where: { tenantId: auth.tenantId } }),
      db.registro.findMany({ where: { tenantId: auth.tenantId } }),
      db.facturaSeq.findFirst({ where: { tenantId: auth.tenantId } })
    ])
    return NextResponse.json({ clientes, catalogo, registros, facturaSeq: facturaSeq?.seq || 1 })
  } catch (err) {
    console.error('Backup GET error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthWithTenant(req)
    if ('error' in auth) return auth.error

    const body = await req.json()
    const { clientes, catalogo, registros, facturaSeq } = body

    // Delete all existing data for this tenant
    await db.$transaction([
      db.registro.deleteMany({ where: { tenantId: auth.tenantId } }),
      db.catalogo.deleteMany({ where: { tenantId: auth.tenantId } }),
      db.cliente.deleteMany({ where: { tenantId: auth.tenantId } }),
      db.facturaSeq.deleteMany({ where: { tenantId: auth.tenantId } }),
    ])

    // Recreate
    if (clientes?.length) {
      await db.cliente.createMany({ data: clientes.map((c: Record<string, unknown>) => ({
        id: c.id as string,
        tenantId: auth.tenantId,
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
        tenantId: auth.tenantId,
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
        tenantId: auth.tenantId,
        fecha: (r.fecha as string) || '',
        clienteId: (r.clienteId as string) || '',
        cliente: (r.cliente as string) || '',
        c1: (r.c1 as string) || '',
        c2: (r.c2 as string) || '',
        cant: Number(r.cant) || 1,
        obs: (r.obs as string) || '',
      })) })
    }
    await db.facturaSeq.create({ data: { id: `seq-${auth.tenantId}`, tenantId: auth.tenantId, seq: Number(facturaSeq) || 1 } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Backup POST error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuthWithTenant(req)
    if ('error' in auth) return auth.error

    await db.$transaction([
      db.registro.deleteMany({ where: { tenantId: auth.tenantId } }),
      db.catalogo.deleteMany({ where: { tenantId: auth.tenantId } }),
      db.cliente.deleteMany({ where: { tenantId: auth.tenantId } }),
      db.facturaSeq.deleteMany({ where: { tenantId: auth.tenantId } }),
    ])
    await db.facturaSeq.create({ data: { id: `seq-${auth.tenantId}`, tenantId: auth.tenantId, seq: 1 } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Backup DELETE error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
