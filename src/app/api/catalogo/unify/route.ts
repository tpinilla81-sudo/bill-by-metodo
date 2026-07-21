import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// POST /api/catalogo/unify
// Recorre todo el catálogo del tenant y fusiona los items duplicados.
// Se consideran duplicados los que tienen mismo clienteId + C1 + C2 normalizados
// (trim + colapsar espacios + case-insensitive).
// Cuando hay duplicados, se queda con el primero (por fecha de creación) y elimina
// el resto. Si los duplicados tenían precios distintos, gana el primero.
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const all = await db.catalogo.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'asc' } })

    function norm(s: string): string {
      return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
    }
    const seen = new Map<string, typeof all[number]>()
    const toDelete: string[] = []

    for (const item of all) {
      const key = `${item.clienteId || ''}||${norm(item.c1)}||${norm(item.c2)}`
      const existing = seen.get(key)
      if (!existing) {
        seen.set(key, item)
      } else {
        toDelete.push(item.id)
      }
    }

    // Normalizar C1/C2 de los items que sobreviven (trim + colapsar espacios,
    // respetando mayúsculas del primero que apareció).
    for (const item of seen.values()) {
      const c1Norm = String(item.c1).trim().replace(/\s+/g, ' ')
      const c2Norm = String(item.c2).trim().replace(/\s+/g, ' ')
      if (c1Norm !== item.c1 || c2Norm !== item.c2) {
        await db.catalogo.update({ where: { id: item.id }, data: { c1: c1Norm, c2: c2Norm } })
      }
    }

    let deleted = 0
    if (toDelete.length > 0) {
      const res = await db.catalogo.deleteMany({ where: { id: { in: toDelete }, tenantId: tid } })
      deleted = res.count
    }

    return NextResponse.json({
      ok: true,
      totalBefore: all.length,
      totalAfter: all.length - deleted,
      duplicatesRemoved: deleted,
    })
  } catch (err) {
    console.error('Catalogo unify error:', err)
    return NextResponse.json({ error: 'Error unificando catálogo' }, { status: 500 })
  }
}
