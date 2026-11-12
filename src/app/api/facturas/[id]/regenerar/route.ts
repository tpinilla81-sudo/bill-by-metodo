import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// Normalización de strings para compararlos sin importar acentos/espacios/mayúsculas.
function normStr(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// POST /api/facturas/[id]/regenerar — regenera las líneas de una factura
// existente leyendo los registroIds guardados, en modo 'simple' (1 línea por
// registro, sin agrupar). Solo para facturas no-SMURFIT (las SMURFIT usan su
// propio modelo de tabla de liquidación y no deben regenerarse aquí).
//
// Recalcula base, ivaImp y total a partir de las nuevas líneas y el IVA existente.
// Mantiene los demás campos (numero, fecha, cliente, pedido, modo, etc.) intactos.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const { id } = await params

    const existing = await db.factura.findFirst({ where: { id, tenantId: tid, deletedAt: null } })
    if (!existing) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    // SMURFIT: no regenerar — su modelo es distinto.
    const esSmurfit = /SMURFIT/i.test(existing.clienteNombre || '')
    if (esSmurfit) {
      return NextResponse.json({ error: 'Las facturas SMURFIT no se pueden regenerar aquí — usan su propio modelo de liquidación' }, { status: 400 })
    }

    // Leer registroIds guardados en la factura
    let regIds: string[] = []
    try { regIds = JSON.parse(existing.registroIds || '[]') } catch {}
    if (regIds.length === 0) {
      return NextResponse.json({ error: 'La factura no tiene registroIds guardados — no se puede regenerar' }, { status: 400 })
    }

    // Cargar registros + catálogo
    const registros = await db.registro.findMany({ where: { id: { in: regIds }, tenantId: tid } })
    const catalogo = await db.catalogo.findMany({ where: { tenantId: tid, deletedAt: null }, select: { c1: true, c2: true, clienteId: true, final: true } })

    // precioUnit: mismo algoritmo que en prefactura-view.tsx (1:1 con catálogo).
    function precioUnit(c1Val: string, c2Val: string, cliId: string): number {
      const a = normStr(c1Val), b = normStr(c2Val)
      let it = catalogo.find(x => normStr(x.c1) === a && normStr(x.c2) === b && x.clienteId === cliId)
      if (!it) it = catalogo.find(x => normStr(x.c1) === a && normStr(x.c2) === b && !x.clienteId)
      if (!it) it = catalogo.find(x => normStr(x.c1) === a && normStr(x.c2) === b)
      return it ? Number(it.final) || 0 : 0
    }
    function getPrecio(r: typeof registros[number]): number {
      return (r as any).precioUnitario > 0 ? Number((r as any).precioUnitario) : precioUnit(r.c1, r.c2, r.clienteId)
    }

    // Modo 'simple' — 1 línea por registro, sin agrupar.
    // Orden: por fecha ascendente (igual que la pre-factura en modo simple).
    const lineas = registros
      .map(r => ({
        fecha: r.fecha,
        c1: r.c1,
        c2: r.c2,
        cant: r.cant,
        clienteId: r.clienteId,
        obs: r.obs || '',
        precioUnitario: getPrecio(r),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))

    // Recalcular totales con el IVA existente.
    const base = lineas.reduce((s, r) => s + (r.precioUnitario > 0 ? r.precioUnitario : precioUnit(r.c1, r.c2, r.clienteId)) * r.cant, 0)
    const iva = existing.iva || 0
    const ivaImp = base * iva / 100
    const total = base + ivaImp

    const factura = await db.factura.update({
      where: { id },
      data: {
        lineas: JSON.stringify(lineas),
        base,
        ivaImp,
        total,
        modoFactura: 'simple',
      },
    })

    return NextResponse.json({ factura, lineasGeneradas: lineas.length })
  } catch (err) {
    console.error('Factura regenerar error:', err)
    return NextResponse.json({ error: 'Error regenerando factura' }, { status: 500 })
  }
}
