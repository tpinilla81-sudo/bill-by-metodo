import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// POST: restore a saved backup by filename (tenant-scoped, from database)
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { filename } = await req.json()
    if (!filename || !filename.endsWith('.json') || filename.includes('..') || filename.includes('/')) {
      return NextResponse.json({ error: 'Archivo no válido' }, { status: 400 })
    }

    // Find backup in database
    const backup = await db.backup.findUnique({
      where: { filename },
      select: { tenantId: true, data: true }
    })

    if (!backup || backup.tenantId !== tid) {
      return NextResponse.json({ error: 'Backup no pertenece a esta empresa' }, { status: 403 })
    }

    const data = JSON.parse(backup.data)
    const { clientes, catalogo, registros, facturaSeq } = data

    // Delete only this tenant's data
    await db.$transaction([
      db.registro.deleteMany({ where: { tenantId: tid } }),
      db.catalogo.deleteMany({ where: { tenantId: tid } }),
      db.cliente.deleteMany({ where: { tenantId: tid } }),
      db.facturaSeq.deleteMany({ where: { tenantId: tid } }),
    ])

    // Recreate from backup with this tenant's ID
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
        customData: (c.customData as string) || '',
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
        customData: (x.customData as string) || '',
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
        precioUnitario: Number(r.precioUnitario) || 0,
        obs: (r.obs as string) || '',
        facturado: Boolean(r.facturado),
        pasadoRegistro: Boolean(r.pasadoRegistro),
        customData: (r.customData as string) || '',
      })) })
    }
    await db.facturaSeq.create({ data: { tenantId: tid, seq: Number(facturaSeq) || 1 } })

    return NextResponse.json({ ok: true, message: `Restaurado desde ${filename}` })
  } catch (err) {
    console.error('Restore backup error:', err)
    return NextResponse.json({ error: 'Error restaurando backup' }, { status: 500 })
  }
}
