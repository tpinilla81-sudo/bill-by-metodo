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

// PUT /api/tenants/mine - Update current user's tenant info (admin only, for their own company)
export async function PUT(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (user.role === 'superadmin') {
      return NextResponse.json({ error: 'El superadmin no tiene empresa propia' }, { status: 403 })
    }

    const body = await request.json()
    const { fullName, address, city, province, cif, logo } = body

    const updateData: Record<string, unknown> = {}
    if (fullName !== undefined) updateData.fullName = fullName
    if (address !== undefined) updateData.address = address
    if (city !== undefined) updateData.city = city
    if (province !== undefined) updateData.province = province
    if (cif !== undefined) updateData.cif = cif
    if (logo !== undefined) updateData.logo = logo

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 })
    }

    const tenant = await db.tenant.update({
      where: { id: user.tenantId },
      data: updateData,
    })

    return NextResponse.json(tenant)
  } catch (error) {
    console.error('Tenants mine PUT error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
