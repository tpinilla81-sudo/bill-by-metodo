import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'

// POST /api/registros/transfer
// Mark all un-transferred entries (pasadoRegistro=false) as transferred (pasadoRegistro=true)
// Only affects the current tenant's data
// Requires 'entrada.pasarRegistros' permission for regular users
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    // Check permission: regular users need 'entrada.pasarRegistros'
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (user.role === 'user') {
      const perms = user.permissions ? (() => { try { return JSON.parse(user.permissions) } catch { return [] } })() : []
      if (Array.isArray(perms) && perms.length > 0 && !perms.includes('entrada.pasarRegistros')) {
        return NextResponse.json({ error: 'No tienes permiso para pasar entradas a registros' }, { status: 403 })
      }
    }

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
