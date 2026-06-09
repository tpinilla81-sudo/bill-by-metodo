import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuthWithTenant } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const auth = await requireAuthWithTenant(req)
    if ('error' in auth) return auth.error

    const rec = await db.facturaSeq.findFirst({ where: { tenantId: auth.tenantId } })
    return NextResponse.json({ seq: rec?.seq || 1 })
  } catch (err) {
    console.error('FacturaSeq GET error:', err)
    return NextResponse.json({ seq: 1 })
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAuthWithTenant(req)
    if ('error' in auth) return auth.error

    const { seq } = await req.json()

    // Find or create the seq record for this tenant
    const existing = await db.facturaSeq.findFirst({ where: { tenantId: auth.tenantId } })

    if (existing) {
      const rec = await db.facturaSeq.update({
        where: { id: existing.id },
        data: { seq: Number(seq) || 1 }
      })
      return NextResponse.json(rec)
    } else {
      const rec = await db.facturaSeq.create({
        data: { id: `seq-${auth.tenantId}`, tenantId: auth.tenantId, seq: Number(seq) || 1 }
      })
      return NextResponse.json(rec)
    }
  } catch (err) {
    console.error('FacturaSeq PUT error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
