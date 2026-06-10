import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const [clientes, catalogo, registros, facturaSeq] = await Promise.all([
      db.cliente.findMany({ where: { tenantId: tid } }),
      db.catalogo.findMany({ where: { tenantId: tid } }),
      db.registro.findMany({ where: { tenantId: tid } }),
      db.facturaSeq.findUnique({ where: { tenantId: tid } })
    ])
    return NextResponse.json({ clientes, catalogo, registros, facturaSeq: facturaSeq?.seq || 1 })
  } catch (err) {
    console.error('Backup GET error:', err)
    return NextResponse.json({ error: 'Error exportando datos' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()
    const { clientes, catalogo, registros, facturaSeq } = body

    // Delete only this tenant's data
    await db.$transaction([
      db.registro.deleteMany({ where: { tenantId: tid } }),
      db.catalogo.deleteMany({ where: { tenantId: tid } }),
      db.cliente.deleteMany({ where: { tenantId: tid } }),
      db.facturaSeq.deleteMany({ where: { tenantId: tid } }),
    ])

    // Recreate with this tenant's ID
    if (clientes?.length) {
      await db.cliente.createMany({ data: clientes.map((c: Record<string, unknown>) => ({
        id: c.id as string,
        tenantId: tid,
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
        tenantId: tid,
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
        tenantId: tid,
        fecha: (r.fecha as string) || '',
        clienteId: (r.clienteId as string) || '',
        cliente: (r.cliente as string) || '',
        c1: (r.c1 as string) || '',
        c2: (r.c2 as string) || '',
        cant: Number(r.cant) || 1,
        obs: (r.obs as string) || '',
        facturado: Boolean(r.facturado),
        pasadoRegistro: Boolean(r.pasadoRegistro),
      })) })
    }
    await db.facturaSeq.create({ data: { tenantId: tid, seq: Number(facturaSeq) || 1 } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Backup POST error:', err)
    return NextResponse.json({ error: 'Error importando datos' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    // Delete only this tenant's data
    await db.$transaction([
      db.registro.deleteMany({ where: { tenantId: tid } }),
      db.catalogo.deleteMany({ where: { tenantId: tid } }),
      db.cliente.deleteMany({ where: { tenantId: tid } }),
      db.facturaSeq.deleteMany({ where: { tenantId: tid } }),
    ])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Backup DELETE error:', err)
    return NextResponse.json({ error: 'Error borrando datos' }, { status: 500 })
  }
}
