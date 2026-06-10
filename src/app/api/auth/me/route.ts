import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Also fetch tenant info for the response
    const tenant = await db.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true, logo: true, slug: true },
    })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: tenant?.name || '',
        tenantLogo: tenant?.logo || '',
        tenantSlug: tenant?.slug || '',
      },
    })
  } catch (error) {
    console.error('Me error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
