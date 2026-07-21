import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// GET /api/catalogo/existe?c1=...&c2=...&clienteId=...&excludeId=...
// Comprueba si ya existe un item del catálogo con mismo C1+C2+clienteId
// (normalizado: trim + colapsar espacios + case-insensitive).
// Devuelve { existe: boolean, item?: CatalogoItem }
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { searchParams } = new URL(req.url)
    const c1 = (searchParams.get('c1') || '').trim().replace(/\s+/g, ' ')
    const c2 = (searchParams.get('c2') || '').trim().replace(/\s+/g, ' ')
    const clienteId = searchParams.get('clienteId') || ''
    const excludeId = searchParams.get('excludeId') || ''

    if (!c1 || !c2) return NextResponse.json({ existe: false })

    // Traer todos los del tenant y filtrar normalizado en JS (SQLite no soporta
    // modo case-insensitive de forma fiable con acentos).
    const all = await db.catalogo.findMany({ where: { tenantId: tid } })
    const norm = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
    const c1n = norm(c1)
    const c2n = norm(c2)
    const clin = norm(clienteId)

    const found = all.find(x =>
      norm(x.c1) === c1n &&
      norm(x.c2) === c2n &&
      norm(x.clienteId || '') === clin &&
      x.id !== excludeId
    )

    return NextResponse.json({ existe: !!found, item: found || null })
  } catch (err) {
    console.error('Catalogo existe error:', err)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
