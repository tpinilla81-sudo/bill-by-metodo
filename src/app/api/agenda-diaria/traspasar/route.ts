import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'

// V29.99.3 — POST /api/agenda-diaria/traspasar
// Traspasa las líneas de LOGÍSTICA de un día a Registros. Para cada línea:
//   1. Busca el concepto en el catálogo (match por nombre) → si encaja, usa c1
//      (grupo: MILCA, NAVE, VIAJE...) y c2 (nombre exacto del catálogo); si no
//      encaja, c1='AGENDA' y c2=concepto tal cual.
//   2. Crea un Registro con fecha=fecha de la agenda, clienteId/cliente (vacío
//      para logística), cant=cantidad de la agenda (o 1), precioUnitario=
//      importe/cant (o importe si cant=0), obs=nota de la línea, pasadoRegistro=true.
//   3. Marca traspasadoAt=now() en la línea de agenda → ya no se puede volver a
//      traspasar.
// Solo logística (Facturación va por otra vía). Solo líneas no traspasadas.
//
// Body: { fecha: "YYYY-MM-DD" }
// Devuelve: { count: <nº de líneas traspasadas>, registros: [...], yaTraspasadas: <n> }

function normStr(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const user = await getSessionUser()
    const body = await req.json()
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha)) ? String(body.fecha) : null
    if (!fecha) return NextResponse.json({ error: 'fecha inválida (YYYY-MM-DD)' }, { status: 400 })

    // Solo logística pendiente de traspasar
    const lineas = await db.agendaDia.findMany({
      where: { tenantId: tid, fecha, tipo: 'logistica', deletedAt: null, traspasadoAt: null },
      orderBy: [{ carga: 'asc' }, { orden: 'asc' }],
    })
    if (lineas.length === 0) {
      // ¿Hay ya traspasadas para informar al usuario?
      const ya = await db.agendaDia.count({ where: { tenantId: tid, fecha, tipo: 'logistica', deletedAt: null, traspasadoAt: { not: null } } })
      return NextResponse.json({ error: ya > 0 ? `No hay líneas pendientes de traspasar (las ${ya} líneas de logística ya están traspasadas)` : 'No hay líneas de logística este día para traspasar' }, { status: 400 })
    }

    // Catálogo para lookup de c1/c2/cliente por nombre
    const catRaw = await db.catalogo.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { c1: true, c2: true, clienteId: true, final: true },
    })
    const catVistos = new Set<string>()
    const catPorNombre = new Map<string, { c1: string; c2: string; clienteId: string; precio: number }>()
    for (const c of catRaw) {
      const n2 = String(c.c2 || '').trim().replace(/\s+/g, ' ')
      const k = normStr(n2)
      if (!n2 || !k || catVistos.has(k)) continue
      catVistos.add(k)
      catPorNombre.set(k, { c1: String(c.c1 || '').trim(), c2: n2, clienteId: String(c.clienteId || ''), precio: Number(c.final) || 0 })
    }

    const registrosCreados: any[] = []
    for (const l of lineas) {
      const conceptoTxt = String(l.concepto || '').trim()
      const catEntry = catPorNombre.get(normStr(conceptoTxt))
      const c1 = catEntry?.c1 || 'AGENDA'
      const c2 = catEntry?.c2 || conceptoTxt.slice(0, 120)
      const cant = Number(l.cantidad) || 0
      const importe = Number(l.importe) || 0
      // precioUnitario: si hay cantidad → importe/cant; si no → importe (precio fijo)
      const precioUnitario = cant > 0 ? Math.round((importe / cant) * 100) / 100 : importe

      const reg = await db.registro.create({
        data: {
          tenantId: tid,
          fecha, // fecha de la agenda
          clienteId: null, // logística sin cliente
          cliente: '',
          c1,
          c2,
          cant: cant > 0 ? cant : 1,
          precioUnitario,
          obs: String(l.nota || '').trim().slice(0, 200),
          pasadoRegistro: true, // ya está en Registros, no hace falta pasar por Entradas
          customData: '',
        },
      })
      // Marca la línea de agenda como traspasada
      await db.agendaDia.update({ where: { id: l.id }, data: { traspasadoAt: new Date() } })
      registrosCreados.push({ id: reg.id, c1: reg.c1, c2: reg.c2, cant: reg.cant, precio: reg.precioUnitario })
    }

    const yaTraspasadas = await db.agendaDia.count({ where: { tenantId: tid, fecha, tipo: 'logistica', deletedAt: null, traspasadoAt: { not: null } } })
    return NextResponse.json({ count: registrosCreados.length, registros: registrosCreados, yaTraspasadas })
  } catch (err: any) {
    console.error('Agenda traspasar error:', err)
    return NextResponse.json({ error: 'Error traspasando a registros: ' + (err?.message || '') }, { status: 500 })
  }
}
