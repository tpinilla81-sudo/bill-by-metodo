import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSuperadmin, hashPassword } from '@/lib/auth'

// GET /api/tenants - List all tenants (superadmin only)
export async function GET() {
  try {
    const admin = await requireSuperadmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado. Se requiere rol superadmin.' }, { status: 403 })
    }

    const tenants = await db.tenant.findMany({
      include: {
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(tenants.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      fullName: t.fullName,
      address: t.address,
      city: t.city,
      province: t.province,
      cif: t.cif,
      logo: t.logo,
      active: t.active,
      userCount: t._count.users,
      createdAt: t.createdAt,
    })))
  } catch (error) {
    console.error('Tenants GET error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// POST /api/tenants - Create new tenant (superadmin only)
// When creating a tenant, auto-create an admin user for that tenant
export async function POST(request: Request) {
  try {
    const admin = await requireSuperadmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado. Se requiere rol superadmin.' }, { status: 403 })
    }

    const body = await request.json()
    const { name, slug, fullName, address, city, province, cif, logo } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    if (!slug || !slug.trim()) {
      return NextResponse.json({ error: 'El slug es obligatorio' }, { status: 400 })
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')

    // Check if tenant slug already exists
    const existingSlug = await db.tenant.findUnique({ where: { slug: cleanSlug } })
    if (existingSlug) {
      return NextResponse.json({ error: 'Ya existe una empresa con ese slug' }, { status: 400 })
    }

    // Check if tenant name already exists
    const existingName = await db.tenant.findFirst({ where: { name: name.trim() } })
    if (existingName) {
      return NextResponse.json({ error: 'Ya existe una empresa con ese nombre' }, { status: 400 })
    }

    // Create tenant
    const tenant = await db.tenant.create({
      data: {
        name: name.trim(),
        slug: cleanSlug,
        fullName: fullName || '',
        address: address || '',
        city: city || '',
        province: province || '',
        cif: cif || '',
        logo: logo || '',
        active: true,
      },
    })

    // Auto-create admin user for the new tenant
    const autoEmail = `${cleanSlug}@bill.es`
    const autoPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
    const hashedPw = await hashPassword(autoPassword)

    const autoUser = await db.user.create({
      data: {
        email: autoEmail,
        password: hashedPw,
        name: `Admin ${name.trim()}`,
        role: 'admin',
        tenantId: tenant.id,
        active: true,
      },
    })

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        fullName: tenant.fullName,
        address: tenant.address,
        city: tenant.city,
        province: tenant.province,
        cif: tenant.cif,
        logo: tenant.logo,
        active: tenant.active,
        createdAt: tenant.createdAt,
      },
      autoUser: {
        id: autoUser.id,
        email: autoUser.email,
        password: autoPassword,  // Only shown once at creation time
        name: autoUser.name,
        role: autoUser.role,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Tenants POST error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// PUT /api/tenants - Update tenant (superadmin only)
export async function PUT(request: Request) {
  try {
    const admin = await requireSuperadmin()
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado. Se requiere rol superadmin.' }, { status: 403 })
    }

    const body = await request.json()
    const { id, fullName, address, city, province, cif, logo, active } = body

    if (!id) {
      return NextResponse.json({ error: 'ID es obligatorio' }, { status: 400 })
    }

    const existing = await db.tenant.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    // name and slug are NOT editable after creation
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
    console.error('Tenants PUT error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
