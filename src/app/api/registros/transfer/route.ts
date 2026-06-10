import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// POST /api/registros/transfer
// Mark all un-transferred entries (pasadoRegistro=false) as transferred (pasadoRegistro=true)
// Only affects the current tenant's data
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { searchParams } = new URL(req.url)
    const before = searchParams.get('before')

    const where: { tenantId: string; pasadoRegistro: boolean; fecha?: { lt: string } } = { tenantId: tid, pasadoRegistro: false }
    if (before) {
      where.fecha = { lt: before }
    }

    const result = await db.registro.updateMany({
      where,
      data: { pasadoRegistro: true },
    })

    return NextResponse.json({ transferred: result.count })
  } catch (err) {
    console.error('Transfer error:', err)
    return NextResponse.json({ error: 'Error al transferir entradas' }, { status: 500 })
  }
}
