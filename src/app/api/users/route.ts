import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, hashPassword } from '@/lib/auth'

// GET /api/users - List all users (admin or superadmin)
export async function GET() {
  try {
    const admin = await requireAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // If superadmin, show all users; if admin, show only their tenant's users
    const where = admin.role === 'superadmin' ? {} : { tenantId: admin.tenantId }

    const users = await db.user.findMany({
      where,
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      tenantId: u.tenantId,
      tenantName: u.tenant.name,
      active: u.active,
      createdAt: u.createdAt,
    })))
  } catch (error) {
    console.error('Users GET error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// POST /api/users - Create new user (superadmin only)
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { email, password, name, role, tenantId } = body

    if (!email || !password || !tenantId) {
      return NextResponse.json({ error: 'Email, contraseña y empresa son obligatorios' }, { status: 400 })
    }

    // Only superadmin can assign superadmin role or create users for other tenants
    if (admin.role !== 'superadmin') {
      if (role === 'superadmin') {
        return NextResponse.json({ error: 'No puedes asignar el rol superadmin' }, { status: 403 })
      }
      if (tenantId !== admin.tenantId) {
        return NextResponse.json({ error: 'Solo puedes crear usuarios en tu empresa' }, { status: 403 })
      }
    }

    // Check email uniqueness
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 })
    }

    // Verify tenant exists
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 400 })
    }

    const hashedPw = await hashPassword(password)

    const user = await db.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashedPw,
        name: name || '',
        role: role || 'user',
        tenantId,
      },
      include: { tenant: { select: { name: true } } },
    })

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      active: user.active,
    }, { status: 201 })
  } catch (error) {
    console.error('Users POST error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// PUT /api/users - Update user (admin or superadmin)
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { id, email, name, role, tenantId, active, password } = body

    if (!id) {
      return NextResponse.json({ error: 'ID es obligatorio' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Non-superadmin can only edit users in their own tenant
    if (admin.role !== 'superadmin' && existing.tenantId !== admin.tenantId) {
      return NextResponse.json({ error: 'No autorizado para editar este usuario' }, { status: 403 })
    }

    // Only superadmin can assign superadmin role
    if (role === 'superadmin' && admin.role !== 'superadmin') {
      return NextResponse.json({ error: 'No puedes asignar el rol superadmin' }, { status: 403 })
    }

    // If email is being changed, check uniqueness
    if (email && email !== existing.email) {
      const dup = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
      if (dup) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 })
      }
    }

    // If tenantId is being changed, verify it exists (superadmin only)
    if (tenantId && tenantId !== existing.tenantId) {
      if (admin.role !== 'superadmin') {
        return NextResponse.json({ error: 'No puedes cambiar la empresa del usuario' }, { status: 403 })
      }
      const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) {
        return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (email !== undefined) updateData.email = email.toLowerCase().trim()
    if (name !== undefined) updateData.name = name
    if (role !== undefined) updateData.role = role
    if (tenantId !== undefined && admin.role === 'superadmin') updateData.tenantId = tenantId
    if (active !== undefined) updateData.active = active
    if (password) updateData.password = await hashPassword(password)

    const user = await db.user.update({
      where: { id },
      data: updateData,
      include: { tenant: { select: { name: true } } },
    })

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      active: user.active,
    })
  } catch (error) {
    console.error('Users PUT error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// DELETE /api/users - Deactivate user (admin or superadmin)
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es obligatorio' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Non-superadmin can only deactivate users in their own tenant
    if (admin.role !== 'superadmin' && existing.tenantId !== admin.tenantId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Don't deactivate yourself
    if (existing.id === admin.id) {
      return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 })
    }

    // Don't actually delete, just deactivate
    await db.user.update({
      where: { id },
      data: { active: false },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Users DELETE error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
