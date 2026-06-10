import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const rec = await db.facturaSeq.findUnique({ where: { tenantId: tid } })
    return NextResponse.json({ seq: rec?.seq || 1 })
  } catch (err) {
    console.error('FacturaSeq GET error:', err)
    return NextResponse.json({ seq: 1 })
  }
}

export async function PUT(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { seq } = await req.json()
    const rec = await db.facturaSeq.upsert({
      where: { tenantId: tid },
      update: { seq: Number(seq) || 1 },
      create: { tenantId: tid, seq: Number(seq) || 1 }
    })
    return NextResponse.json(rec)
  } catch (err) {
    console.error('FacturaSeq PUT error:', err)
    return NextResponse.json({ error: 'Error actualizando secuencia' }, { status: 500 })
  }
}
