import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'

// V29.99.3 — POST /api/agenda-diaria/traspasar
// Traspasa las líneas (logística O facturación) de un día a Entradas (Registros
// con pasadoRegistro=false, donde el usuario los revisa antes de consolidarlos).
// V29.99.9 — ahora soporta también facturación (igual que logística):
// mismo botón, misma confirmación, misma marca visual en calendario (círculo azul).
// V29.99.15 — las líneas van a ENTRADA (pasadoRegistro=false), no directamente
// a Registros. En ENTRADA el usuario puede revisar y, con el botón "Pasar al
// registro", consolidarlas en Registros.
//
// Para cada línea:
//   1. Busca el concepto en el catálogo (match por nombre) → si encaja, usa c1
//      (grupo: MILCA, NAVE, VIAJE...) y c2 (nombre exacto del catálogo); si no
//      encaja, c1='AGENDA' y c2=concepto tal cual.
//   2. Crea un Registro con los MISMOS campos que rellenaría Entrada:
//      - fecha = fecha de la agenda
//      - clienteId + cliente = de la línea si lo trae; si no, del catálogo
//        (lookupCliente por c1/c2, igual que Entrada)
//      - c1, c2 = del catálogo
//      - cant = cantidad de la agenda (o 1 si no tiene)
//      - precioUnitario = importe/cant (si hay cantidad) o importe (precio fijo);
//        si el importe viene a 0, lookup del catálogo (igual que Entrada)
//      - obs = nota de la línea
//      - customData = { custom_descripcion: "..." } (descripción del catálogo)
//      - pasadoRegistro = false (va a ENTRADA para revisión; luego el usuario
//        pulsa "Pasar al registro" para consolidar)
//   3. Marca traspasadoAt=now() en la línea de agenda → ya no se puede volver a
//      traspasar.
//
// Body: { fecha: "YYYY-MM-DD", tipo: "logistica" | "facturacion" }
// Devuelve: { count, registros, yaTraspasadas, tipo }

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
    // V29.99.9 — tipo: logística o facturación (por defecto logística para
    // mantener compatibilidad con los llamadas existentes)
    const tipo = String(body.tipo || 'logistica') === 'facturacion' ? 'facturacion' : 'logistica'
    const tipoLabel = tipo === 'facturacion' ? 'facturación' : 'logística'

    // Solo líneas pendientes de traspasar del tipo indicado
    const lineas = await db.agendaDia.findMany({
      where: { tenantId: tid, fecha, tipo, deletedAt: null, traspasadoAt: null },
      orderBy: [{ carga: 'asc' }, { orden: 'asc' }],
    })
    if (lineas.length === 0) {
      const ya = await db.agendaDia.count({ where: { tenantId: tid, fecha, tipo, deletedAt: null, traspasadoAt: { not: null } } })
      return NextResponse.json({ error: ya > 0 ? `No hay líneas pendientes de traspasar (las ${ya} líneas de ${tipoLabel} ya están traspasadas)` : `No hay líneas de ${tipoLabel} este día para traspasar` }, { status: 400 })
    }

    // Catálogo completo para lookup de c1/c2/clienteId/precio por nombre.
    // V29.99.8 — incluimos customData para rellenar la DESCRIPCION del registro
    // igual que Entrada: 1) descripción larga del catálogo (campo customData
    // del catálogo con clave que contenga "descripcion"); 2) si no, cae al c2.
    const catRaw = await db.catalogo.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { c1: true, c2: true, clienteId: true, final: true, customData: true },
    })
    const catPorNombre = new Map<string, { c1: string; c2: string; clienteId: string; precio: number; customData: string }>()
    const catVistos = new Set<string>()
    for (const c of catRaw) {
      const n2 = String(c.c2 || '').trim().replace(/\s+/g, ' ')
      const k = normStr(n2)
      if (!n2 || !k || catVistos.has(k)) continue
      catVistos.add(k)
      catPorNombre.set(k, {
        c1: String(c.c1 || '').trim(),
        c2: n2,
        clienteId: String(c.clienteId || ''),
        precio: Number(c.final) || 0,
        customData: String(c.customData || ''),
      })
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

      // V29.99.6 — Cliente: si la línea de agenda trae cliente (nombre), usarlo;
      // si no, intentar detectarlo del catálogo por c1/c2 (igual que Entrada).
      let effectiveClienteId = ''
      const clienteEnLinea = String(l.cliente || '').trim()
      if (clienteEnLinea) {
        effectiveClienteId = clientesRows.find(c => c.nombre === clienteEnLinea)?.id || ''
      }
      if (!effectiveClienteId) {
        effectiveClienteId = lookupCliente(catRawLookup, c1, c2)
      }
      const effectiveClienteName = effectiveClienteId
        ? (clientesMap.get(effectiveClienteId) || '')
        : clienteEnLinea

      // precioUnitario: si la línea tiene importe, lo descomponemos (importe/cant
      // o importe si no hay cant). Si el importe es 0, hacemos lookup del catálogo
      // (igual que Entrada).
      let precioUnitario = 0
      if (importe > 0) {
        precioUnitario = cant > 0 ? Math.round((importe / cant) * 100) / 100 : importe
      } else {
        precioUnitario = lookupPrecio(catRawLookup, c1, c2, effectiveClienteId)
      }

      // V29.99.8 — DESCRIPCIÓN (customData del registro, clave custom_descripcion):
      // rellenar igual que Entrada. 1) si el catálogo tiene customData con una
      // clave que contenga "descripcion", usar su valor; 2) si no, caer al c2
      // (que es el "nombre" del producto en el catálogo).
      let descripcionCanon = c2
      if (catEntry?.customData) {
        try {
          const cd = JSON.parse(catEntry.customData) as Record<string, unknown>
          for (const [k, v] of Object.entries(cd)) {
            if (!/descripcion/i.test(k)) continue
            const txt = String(v ?? '').trim()
            if (txt) { descripcionCanon = txt; break }
          }
        } catch { /* customData corrupto — usar c2 */ }
      }
      // customData del registro: { custom_descripcion: "..." } (igual que Entrada)
      const customDataRegistro = JSON.stringify({ custom_descripcion: descripcionCanon })

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
          // V29.99.15 — pasadoRegistro=false: las líneas van a ENTRADA (no a
          // Registros directamente). El usuario las revisa allí y pulsa el botón
          // "Pasar al registro" para consolidarlas en Registros. Así no se
          // mezclan con todo lo demás sin revisión.
          pasadoRegistro: false,
          customData: customDataRegistro,
        },
      })
      // Marca la línea de agenda como traspasada
      await db.agendaDia.update({ where: { id: l.id }, data: { traspasadoAt: new Date() } })
      registrosCreados.push({
        id: reg.id, c1: reg.c1, c2: reg.c2, cant: reg.cant, precio: reg.precioUnitario,
        clienteId: reg.clienteId, cliente: reg.cliente,
        descripcion: descripcionCanon,
      })
    }

    const yaTraspasadas = await db.agendaDia.count({ where: { tenantId: tid, fecha, tipo, deletedAt: null, traspasadoAt: { not: null } } })
    return NextResponse.json({ count: registrosCreados.length, registros: registrosCreados, yaTraspasadas, tipo })
  } catch (err: any) {
    console.error('Agenda traspasar error:', err)
    return NextResponse.json({ error: 'Error traspasando a registros: ' + (err?.message || '') }, { status: 500 })
  }
}
