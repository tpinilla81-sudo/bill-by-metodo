import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperadmin } from '@/lib/auth'

// GET /api/tenants/[id] - Get tenant details (superadmin only)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSuperadmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params
    const tenant = await db.tenant.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            active: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    return NextResponse.json(tenant)
  } catch (error) {
    console.error('Tenant GET error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// PUT /api/tenants/[id] - Update tenant (superadmin only)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSuperadmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { fullName, address, city, province, cif, logo, active } = body

    const existing = await db.tenant.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    const tenant = await db.tenant.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(province !== undefined && { province }),
        ...(cif !== undefined && { cif }),
        ...(logo !== undefined && { logo }),
        ...(active !== undefined && { active }),
      },
    })

    return NextResponse.json(tenant)
  } catch (error) {
    console.error('Tenant PUT error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// DELETE /api/tenants/[id] - Deactivate tenant (superadmin only)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSuperadmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params
    const existing = await db.tenant.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    // Soft delete: deactivate instead of removing
    const tenant = await db.tenant.update({
      where: { id },
      data: { active: false },
    })

    return NextResponse.json({ ok: true, tenant })
  } catch (error) {
    console.error('Tenant DELETE error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
