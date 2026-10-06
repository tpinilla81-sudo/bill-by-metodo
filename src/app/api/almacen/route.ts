import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId, getAuthUser } from '@/lib/tenant-context'
import { saneaCriterios, type EstanteriaCfg } from '@/lib/almacen'

// /api/almacen — configuración del almacén (zonas/estanterías/paredes) POR EMPRESA.
// V25: antes vivía solo en localStorage del navegador → el móvil no veía el
// mapa configurado en el PC. Ahora se guarda en el servidor (Config.almacenCfg)
// y todos los dispositivos de la empresa ven el mismo mapa.

// Sanea la configuración recibida (mismas reglas que loadAlmacenCfg)
function sanitize(arr: unknown): EstanteriaCfg[] {
  if (!Array.isArray(arr)) return []
  return arr
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && String((e as Record<string, unknown>).nombre || '').trim() !== '')
    .map(e => ({
      id: typeof e.id === 'string' && e.id ? e.id : Math.random().toString(36).slice(2, 9),
      nombre: String(e.nombre).trim().toUpperCase(),
      tipo: e.tipo === 'pared' ? ('pared' as const) : ('estanteria' as const),
      orientacion: e.orientacion === 'der' ? ('der' as const) : ('izq' as const),
      huecos: Math.max(0, Math.min(200, Number(e.huecos) || 0)),
      cap: Math.max(0, Number(e.cap) || 0),
      caps: Array.isArray(e.caps)
        ? (e.caps as unknown[]).map(c => Math.max(0, Math.min(20, Number(c) || 0))).slice(0, 200)
        : undefined,
      alias: Array.isArray(e.alias)
        ? (e.alias as unknown[]).map(a => String(a || '').trim().toUpperCase()).filter(Boolean).slice(0, 10)
        : [],
      criterios: saneaCriterios(e.criterios),  // V29: pesos 0–10 por zona
    }))
    .filter(e => e.nombre)
}

// GET /api/almacen — configuración del almacén de la empresa actual.
// Devuelve { cfg: EstanteriaCfg[] } (vacío si nunca se configuró).
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const config = await db.config.findUnique({ where: { tenantId: tid }, select: { almacenCfg: true } })
    if (!config || !config.almacenCfg) return NextResponse.json({ cfg: [] })

    try {
      const parsed = JSON.parse(config.almacenCfg)
      return NextResponse.json({ cfg: sanitize(parsed) })
    } catch {
      return NextResponse.json({ cfg: [] })
    }
  } catch (err) {
    console.error('Almacen GET error:', err)
    return NextResponse.json({ cfg: [] })
  }
}

// PUT /api/almacen — guarda la configuración del almacén de la empresa.
// Cualquier usuario autenticado de la empresa puede guardar (la config se
// edita desde STOCK ALMACÉN, que ya requiere permiso 'stock').
export async function PUT(req: Request) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()
    const cfg = sanitize(body?.cfg)
    const json = JSON.stringify(cfg)

    // Ensure config row exists for this tenant
    let config = await db.config.findUnique({ where: { tenantId: tid } })
    if (!config) {
      config = await db.config.create({ data: { tenantId: tid } })
    }

    await db.config.update({
      where: { tenantId: tid },
      data: { almacenCfg: json },
    })

    return NextResponse.json({ ok: true, count: cfg.length })
  } catch (err) {
    console.error('Almacen PUT error:', err)
    return NextResponse.json({ error: 'Error guardando configuración del almacén' }, { status: 500 })
  }
}
