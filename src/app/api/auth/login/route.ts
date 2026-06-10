import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, hashPassword, createSession, setSessionCookie } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña son obligatorios' }, { status: 400 })
    }

    // Auto-seed: if no users exist, create the system tenant + superadmin user
    // The system tenant is NOT a real company — it's just the platform admin account.
    // The superadmin creates real companies from the ADMIN panel.
    const userCount = await db.user.count()
    if (userCount === 0) {
      const tenant = await db.tenant.create({
        data: {
          name: 'Sistema',
          slug: 'sistema',
          fullName: 'Administración de la Plataforma',
          active: true,
        },
      })
      const hashedPw = await hashPassword('admin123')
      await db.user.create({
        data: {
          email: 'admin@bill.es',
          password: hashedPw,
          name: 'SuperAdmin',
          role: 'superadmin',
          tenantId: tenant.id,
          active: true,
        },
      })
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { tenant: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    if (!user.active) {
      return NextResponse.json({ error: 'Cuenta desactivada. Contacta al administrador.' }, { status: 403 })
    }

    // Also check if tenant is active (except for superadmins)
    if (user.role !== 'superadmin' && user.tenant && !user.tenant.active) {
      return NextResponse.json({ error: 'La empresa está desactivada. Contacta al administrador.' }, { status: 403 })
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    // Create session
    const token = await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    })

    await setSessionCookie(token)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name || '',
        tenantLogo: user.tenant?.logo || '',
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
