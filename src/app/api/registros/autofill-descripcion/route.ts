import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    // 1) Cargar catálogo con descripciones
    const catalogo = await db.catalogo.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { c1: true, c2: true, clienteId: true, customData: true },
    })

    // Construir mapa c1+c2 → descripcion
    const descMap = new Map<string, string>()
    for (const c of catalogo) {
      try {
        const cd = JSON.parse(c.customData || '{}')
        for (const [k, v] of Object.entries(cd)) {
          if (/descripcion/i.test(k) && String(v || '').trim()) {
            descMap.set(`${c.c1}|${c.c2}`, String(v).trim())
            break
          }
        }
      } catch {}
    }

    // 2) Recorrer registros y rellenar custom_descripcion si está vacío
    const regs = await db.registro.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { id: true, c1: true, c2: true, clienteId: true, customData: true },
    })

    let actualizados = 0
    for (const r of regs) {
      let cd: Record<string, unknown> = {}
      try { cd = JSON.parse(r.customData || '{}') } catch {}
      const descActual = String(cd['custom_descripcion'] || '').trim()
      if (descActual) continue

      // Buscar en catálogo (primero por clienteId, luego general)
      let desc = descMap.get(`${r.c1}|${r.c2}`) || ''
      if (!desc) {
        const item = catalogo.find(c => c.c1 === r.c1 && c.c2 === r.c2)
        if (item) {
          try {
            const cdCat = JSON.parse(item.customData || '{}')
            for (const [k, v] of Object.entries(cdCat)) {
              if (/descripcion/i.test(k) && String(v || '').trim()) { desc = String(v).trim(); break }
            }
          } catch {}
        }
      }

      // Si no hay en catálogo, usar c2
      if (!desc) desc = r.c2 || ''

      if (desc) {
        cd['custom_descripcion'] = desc
        await db.registro.update({
          where: { id: r.id },
          data: { customData: JSON.stringify(cd) },
        })
        actualizados++
      }
    }

    return NextResponse.json({ ok: true, actualizados, total: regs.length })
  } catch (err) {
    console.error('Autofill descripcion error:', err)
    return NextResponse.json({ error: 'Error al autorellenar descripciones' }, { status: 500 })
  }
}
