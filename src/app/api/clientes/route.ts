import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const clientes = await db.cliente.findMany({ where: { tenantId: tid }, orderBy: { nombre: 'asc' } })
    return NextResponse.json(clientes)
  } catch (err) {
    console.error('Clientes GET error:', err)
    return NextResponse.json({ error: 'Error cargando clientes' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()
    const { nombre, cif, dir, cp, ciudad, prov, mail, tel, customData } = body
    if (!nombre) return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 })
    const cliente = await db.cliente.create({
      data: { tenantId: tid, nombre, cif: cif || '', dir: dir || '', cp: cp || '', ciudad: ciudad || '', prov: prov || '', mail: mail || '', tel: tel || '', customData: customData || '' }
    })
    return NextResponse.json(cliente, { status: 201 })
  } catch (err) {
    console.error('Clientes POST error:', err)
    return NextResponse.json({ error: 'Error creando cliente' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()
    const { id, nombre, cif, dir, cp, ciudad, prov, mail, tel, customData } = body
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    // Verify ownership
    const existing = await db.cliente.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { nombre, cif: cif || '', dir: dir || '', cp: cp || '', ciudad: ciudad || '', prov: prov || '', mail: mail || '', tel: tel || '' }
    if (customData !== undefined) data.customData = customData
    const cliente = await db.cliente.update({ where: { id }, data })
    return NextResponse.json(cliente)
  } catch (err) {
    console.error('Clientes PUT error:', err)
    return NextResponse.json({ error: 'Error actualizando cliente' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    // Verify ownership
    const existing = await db.cliente.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    await db.cliente.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Clientes DELETE error:', err)
    return NextResponse.json({ error: 'Error eliminando cliente' }, { status: 500 })
  }
}
