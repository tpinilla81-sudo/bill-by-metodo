import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'

// GET /api/facturas — list facturas for tenant (with optional filters)
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { searchParams } = new URL(req.url)
    const clienteId = searchParams.get('clienteId') || undefined
    const desde = searchParams.get('desde') || undefined
    const hasta = searchParams.get('hasta') || undefined
    const q = searchParams.get('q') || undefined

    const where: any = { tenantId: tid }
    if (clienteId) where.clienteId = clienteId
    if (desde || hasta) {
      where.fecha = {}
      if (desde) where.fecha.gte = desde
      if (hasta) where.fecha.lte = hasta
    }
    if (q) {
      where.OR = [
        { numero: { contains: q } },
        { clienteNombre: { contains: q } },
      ]
    }

    const facturas = await db.factura.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    return NextResponse.json({ facturas })
  } catch (err) {
    console.error('Facturas GET error:', err)
    return NextResponse.json({ error: 'Error listando facturas' }, { status: 500 })
  }
}

// POST /api/facturas — create a new factura from selected registros
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const session = await getSessionUser()
    const body = await req.json()
    const {
      numero = '',
      fecha,
      clienteId = '',
      clienteNombre = '',
      clienteSnap = '',
      lineas,
      iva = 21,
      base = 0,
      ivaImp = 0,
      total = 0,
      modo = 'dia',
      registroIds = [],
    } = body

    if (!fecha) return NextResponse.json({ error: 'Fecha requerida' }, { status: 400 })
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return NextResponse.json({ error: 'Lineas requeridas' }, { status: 400 })
    }

    const factura = await db.$transaction(async (tx) => {
      const f = await tx.factura.create({
        data: {
          tenantId: tid,
          numero: String(numero || ''),
          fecha: String(fecha),
          clienteId: String(clienteId || ''),
          clienteNombre: String(clienteNombre || ''),
          clienteSnap: typeof clienteSnap === 'string' ? clienteSnap : JSON.stringify(clienteSnap || {}),
          lineas: JSON.stringify(lineas),
          iva: Number(iva) || 0,
          base: Number(base) || 0,
          ivaImp: Number(ivaImp) || 0,
          total: Number(total) || 0,
          modo: String(modo || 'dia'),
          registroIds: JSON.stringify(registroIds || []),
          createdBy: session?.id || '',
        },
      })

      // mark registros as facturado
      if (Array.isArray(registroIds) && registroIds.length > 0) {
        await tx.registro.updateMany({
          where: { id: { in: registroIds }, tenantId: tid },
          data: { facturado: true },
        })
      }

      // bump seq if numero was assigned
      if (numero) {
        const seqMatch = String(numero).match(/^(\d+)/)
        if (seqMatch) {
          const newSeq = parseInt(seqMatch[1], 10)
          await tx.facturaSeq.upsert({
            where: { tenantId: tid },
            update: { seq: { increment: 1 } },
            create: { tenantId: tid, seq: newSeq },
          })
        }
      }

      return f
    })

    return NextResponse.json({ factura })
  } catch (err) {
    console.error('Facturas POST error:', err)
    return NextResponse.json({ error: 'Error creando factura' }, { status: 500 })
  }
}
