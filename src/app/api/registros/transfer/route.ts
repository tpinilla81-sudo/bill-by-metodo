import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// POST /api/registros/transfer
// Mark all un-transferred entries (pasadoRegistro=false) as transferred (pasadoRegistro=true)
// Optionally pass ?before=YYYY-MM-DD to only transfer entries before a certain date
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const before = searchParams.get('before')

    const where: { pasadoRegistro: boolean; fecha?: { lt: string } } = { pasadoRegistro: false }
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
