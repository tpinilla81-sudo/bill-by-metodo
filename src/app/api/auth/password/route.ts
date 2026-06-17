import { verifyPassword, hashPassword } from '@/lib/auth'
import { getAuthUser } from '@/lib/tenant-context'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function PUT(req: Request) {
  try {
    const user = await getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { currentPassword, newPassword } = await req.json()
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Contraseña actual y nueva requeridas' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, { status: 400 })
    }

    const fullUser = await db.user.findUnique({ where: { id: user.id } })
    if (!fullUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const valid = await verifyPassword(currentPassword, fullUser.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Contraseña actual incorrecta' }, { status: 401 })
    }

    const newPasswordHash = await hashPassword(newPassword)
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Password change error:', err)
    return NextResponse.json({ error: 'Error cambiando contraseña' }, { status: 500 })
  }
}
