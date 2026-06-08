import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// GET /api/tenants/mine - Get current user's tenant info
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const tenant = await db.tenant.findUnique({
      where: { id: user.tenantId },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    return NextResponse.json(tenant)
  } catch (error) {
    console.error('Tenants mine error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
