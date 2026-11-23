import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'

// V29.99.3 — POST /api/agenda-diaria/traspasar
// Traspasa las líneas de LOGÍSTICA de un día a Registros. Para cada línea:
//   1. Busca el concepto en el catálogo (match por nombre) → si encaja, usa c1
//      (grupo: MILCA, NAVE, VIAJE...) y c2 (nombre exacto del catálogo); si no
//      encaja, c1='AGENDA' y c2=concepto tal cual.
//   2. Crea un Registro con los MISMOS campos que rellenaría Entrada:
//      - fecha = fecha de la agenda
//      - clienteId + cliente = detectado del catálogo (lookupCliente por c1/c2)
//        o el cliente de la línea si lo trae (vacío para logística)
//      - c1, c2 = del catálogo
//      - cant = cantidad de la agenda (o 1 si no tiene)
//      - precioUnitario = importe/cant (si hay cantidad) o importe (precio fijo);
//        si el importe viene a 0, lookup del catálogo (igual que Entrada)
//      - obs = nota de la línea
//      - pasadoRegistro = true (ya está en Registros)
//   3. Marca traspasadoAt=now() en la línea de agenda → ya no se puede volver a
//      traspasar.
// Solo logística (Facturación va por otra vía). Solo líneas no traspasadas.
//
// Body: { fecha: "YYYY-MM-DD" }
// Devuelve: { count: <nº de líneas traspasadas>, registros: [...], yaTraspasadas: <n> }

function normStr(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Lookup de clienteId por c1+c2 en el catálogo (igual que /api/registros/route.ts)
function lookupCliente(catalogo: { c1: string; c2: string; clienteId: string }[], c1: string, c2: string): string {
  const item = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId)
  return item?.clienteId || ''
}

// Lookup de precio por c1+c2 (+clienteId si lo hay) en el catálogo
function lookupPrecio(catalogo: { c1: string; c2: string; clienteId: string; final: number }[], c1: string, c2: string, clienteId: string): number {
  if (clienteId) {
    let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId === clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
    return it ? Number(it.final) || 0 : 0
  }
  let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
  return it ? Number(it.final) || 0 : 0
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
      const ya = await db.agendaDia.count({ where: { tenantId: tid, fecha, tipo: 'logistica', deletedAt: null, traspasadoAt: { not: null } } })
      return NextResponse.json({ error: ya > 0 ? `No hay líneas pendientes de traspasar (las ${ya} líneas de logística ya están traspasadas)` : 'No hay líneas de logística este día para traspasar' }, { status: 400 })
    }

    // Catálogo completo para lookup de c1/c2/clienteId/precio por nombre
    const catRaw = await db.catalogo.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { c1: true, c2: true, clienteId: true, final: true },
    })
    const catPorNombre = new Map<string, { c1: string; c2: string; clienteId: string; precio: number }>()
    const catVistos = new Set<string>()
    for (const c of catRaw) {
      const n2 = String(c.c2 || '').trim().replace(/\s+/g, ' ')
      const k = normStr(n2)
      if (!n2 || !k || catVistos.has(k)) continue
      catVistos.add(k)
      catPorNombre.set(k, { c1: String(c.c1 || '').trim(), c2: n2, clienteId: String(c.clienteId || ''), precio: Number(c.final) || 0 })
    }
    // Catálogo "raw" para lookupPrecio/lookupCliente (igual que /api/registros)
    const catRawLookup = catRaw.map(c => ({ c1: String(c.c1 || ''), c2: String(c.c2 || ''), clienteId: String(c.clienteId || ''), final: Number(c.final) || 0 }))

    // Clientes del tenant para resolver nombre del clienteId
    const clientesRows = await db.cliente.findMany({ where: { tenantId: tid, deletedAt: null }, select: { id: true, nombre: true } })
    const clientesMap = new Map<string, string>()
    for (const c of clientesRows) clientesMap.set(c.id, c.nombre)

    const registrosCreados: any[] = []
    for (const l of lineas) {
      const conceptoTxt = String(l.concepto || '').trim()
      const catEntry = catPorNombre.get(normStr(conceptoTxt))
      const c1 = catEntry?.c1 || 'AGENDA'
      const c2 = catEntry?.c2 || conceptoTxt.slice(0, 120)
      const cant = Number(l.cantidad) || 0
      const importe = Number(l.importe) || 0

      // V29.99.6 — Cliente: si la línea de agenda trae cliente, usarlo; si no,
      // intentar detectarlo del catálogo por c1/c2 (igual que Entrada).
      let effectiveClienteId = String(l.cliente || '').trim() // agenda guarda nombre en l.cliente
        ? (clientesRows.find(c => c.nombre === String(l.cliente || '').trim())?.id || '')
        : ''
      if (!effectiveClienteId) {
        effectiveClienteId = lookupCliente(catRawLookup, c1, c2)
      }
      const effectiveClienteName = effectiveClienteId ? (clientesMap.get(effectiveClienteId) || '') : (String(l.cliente || '').trim())

      // precioUnitario: si la línea tiene importe, lo descomponemos (importe/cant
      // o importe si no hay cant). Si el importe es 0, hacemos lookup del catálogo
      // (igual que Entrada).
      let precioUnitario = 0
      if (importe > 0) {
        precioUnitario = cant > 0 ? Math.round((importe / cant) * 100) / 100 : importe
      } else {
        precioUnitario = lookupPrecio(catRawLookup, c1, c2, effectiveClienteId)
      }

      const reg = await db.registro.create({
        data: {
          tenantId: tid,
          fecha, // fecha de la agenda
          clienteId: effectiveClienteId || null, // null si no hay (igual que Entrada)
          cliente: effectiveClienteName,
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
      registrosCreados.push({
        id: reg.id, c1: reg.c1, c2: reg.c2, cant: reg.cant, precio: reg.precioUnitario,
        clienteId: reg.clienteId, cliente: reg.cliente,
      })
    }

    const yaTraspasadas = await db.agendaDia.count({ where: { tenantId: tid, fecha, tipo: 'logistica', deletedAt: null, traspasadoAt: { not: null } } })
    return NextResponse.json({ count: registrosCreados.length, registros: registrosCreados, yaTraspasadas })
  } catch (err: any) {
    console.error('Agenda traspasar error:', err)
    return NextResponse.json({ error: 'Error traspasando a registros: ' + (err?.message || '') }, { status: 500 })
  }
}
