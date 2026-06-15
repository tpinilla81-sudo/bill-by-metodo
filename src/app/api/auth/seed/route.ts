import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const existing = await db.user.count()
    if (existing > 0) {
      return NextResponse.json({ error: 'Ya existen usuarios' }, { status: 400 })
    }

    const passwordHash = await hashPassword('admin123')
    const user = await db.user.create({
      data: {
        email: 'admin@metodo.es',
        passwordHash,
        name: 'Administrador',
        role: 'admin',
        permissions: JSON.stringify({
          puedeDarEntradas: true,
          puedeFacturar: true,
          puedeVerRegistros: true,
          puedeGestionarClientes: true,
          puedeModificarCampos: true,
          puedeConfiguracion: true,
        }),
        tenantId: null,
      },
    })

    return NextResponse.json({
      message: 'Usuario admin creado',
      user: { id: user.id, email: user.email, role: user.role },
    }, { status: 201 })
  } catch (err) {
    console.error('Seed error:', err)
    return NextResponse.json({ error: 'Error creando usuario' }, { status: 500 })
  }
}
