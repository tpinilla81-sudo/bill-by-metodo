import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// POST /api/catalogo/unify
// NO destructivo: solo normaliza C1/C2 de todos los items del tenant
// (trim + colapsar espacios dobles). NO borra duplicados.
//
// Esto evita la pérdida de datos que ocurría antes cuando el unify eliminaba
// duplicados dejando solo el primero de cada grupo (perdiendo precios distintos,
// incrementos, etc.). Ahora el usuario puede revisar los duplicados manualmente
// y borrarlos si quiere.
//
// La detección de duplicados al rellenar el formulario sigue funcionando: si
// el usuario intenta crear un duplicado, se le ofrece sobrescribir el existente.
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const all = await db.catalogo.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'asc' } })

    function collapseSpaces(s: string): string {
      return String(s || '').trim().replace(/\s+/g, ' ')
    }

    let normalized = 0
    const updates: Promise<unknown>[] = []
    const seen = new Map<string, number>() // normalized key → count
    const duplicates: Array<{ c1: string; c2: string; clienteId: string; count: number; ids: string[] }> = []
    const dupMap = new Map<string, { c1: string; c2: string; clienteId: string; ids: string[] }>()

    for (const item of all) {
      // Normalize
      const c1Norm = collapseSpaces(item.c1)
      const c2Norm = collapseSpaces(item.c2)
      if (c1Norm !== item.c1 || c2Norm !== item.c2) {
        updates.push(
          db.catalogo.update({ where: { id: item.id }, data: { c1: c1Norm, c2: c2Norm } })
        )
        normalized++
      }

      // Detect duplicates (case-insensitive after normalization)
      const key = `${item.clienteId || ''}||${c1Norm.toLowerCase()}||${c2Norm.toLowerCase()}`
      seen.set(key, (seen.get(key) || 0) + 1)
      const existing = dupMap.get(key)
      if (existing) {
        existing.ids.push(item.id)
      } else {
        dupMap.set(key, { c1: c1Norm, c2: c2Norm, clienteId: item.clienteId || '', ids: [item.id] })
      }
    }

    // Apply normalizations
    if (updates.length > 0) {
      await Promise.all(updates)
    }

    // Build list of duplicate groups (only groups with > 1 item)
    for (const d of dupMap.values()) {
      if (d.ids.length > 1) {
        duplicates.push({ c1: d.c1, c2: d.c2, clienteId: d.clienteId, count: d.ids.length, ids: d.ids })
      }
    }

    return NextResponse.json({
      ok: true,
      totalItems: all.length,
      normalized,
      duplicateGroups: duplicates.length,
      duplicateItems: duplicates.reduce((s, d) => s + d.ids.length, 0),
      duplicates,
    })
  } catch (err) {
    console.error('Catalogo unify error:', err)
    return NextResponse.json({ error: 'Error unificando catálogo' }, { status: 500 })
  }
}
