import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const catalogo = await db.catalogo.findMany({ where: { tenantId: tid }, orderBy: [{ c1: 'asc' }, { c2: 'asc' }] })
    // Cabeceras anti-caché: el catálogo puede cambiar entre pestañas y la entrada
    // debe ver los items recién creados sin necesidad de recargar la página.
    const res = NextResponse.json(catalogo)
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    res.headers.set('Pragma', 'no-cache')
    res.headers.set('Expires', '0')
    return res
  } catch (err) {
    console.error('Catalogo GET error:', err)
    return NextResponse.json({ error: 'Error cargando catálogo' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

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
          tenantId: tid,
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
    // Use empty string for generic items (no client), but null for DB if FK constraint
    const resolvedClienteId = clienteId && clienteId.trim() !== '' ? clienteId : ''
    const item = await db.catalogo.create({
      data: { tenantId: tid, clienteId: resolvedClienteId, c1, c2, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(final) || 0, customData: customData || '' }
    })
    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    console.error('Catalogo POST error:', err)
    return NextResponse.json({ error: 'Error creando artículo' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()
    const { id, clienteId, c1, c2, coste, inc, final, customData } = body
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    // Verify ownership
    const existing = await db.catalogo.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { clienteId: clienteId || '', c1, c2, coste: Number(coste) || 0, inc: Number(inc) || 0, final: Number(final) || 0 }
    if (customData !== undefined) data.customData = customData
    const item = await db.catalogo.update({ where: { id }, data })
    return NextResponse.json(item)
  } catch (err) {
    console.error('Catalogo PUT error:', err)
    return NextResponse.json({ error: 'Error actualizando artículo' }, { status: 500 })
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
    const existing = await db.catalogo.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 })

    await db.catalogo.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Catalogo DELETE error:', err)
    return NextResponse.json({ error: 'Error eliminando artículo' }, { status: 500 })
  }
}
