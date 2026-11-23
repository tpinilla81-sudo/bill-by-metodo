import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'

// V29.80 — AGENDA DIARIA
// V29.85 — Agenda del día SOLO como la agenda que rellena el agente (sin vínculo
// con Registros ni Facturas): líneas de LOGÍSTICA agrupadas
// en cargas (1, 2, 3...) y líneas de FACTURACIÓN agrupadas por cliente.
// El usuario dicta por voz y el agente (POST /api/agenda-diaria/interpretar)
// rellena la agenda; estas rutas son el CRUD de soporte.
// V29.82 — el GET devuelve también la lista de clientes del tenant (para el
// datalist de «añadir a mano») y el fallback de fecha usa Europe/Madrid.
// V29.92 — estilo Opus One: cada línea puede llevar PRIORIDAD A/B/C (A1, A2,
// B1, B2, C1...) y existe NOTA LIBRE del día (ver /api/agenda-diaria/notas).

// Hoy en España (el fallback UTC daba el día anterior de madrugada)
function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function normFecha(f: any): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')) ? String(f) : hoyMadrid()
}

// V29.92 — prioridad estilo Opus One: letra A-C + número (A1, B2, C3...).
// Tolera «a 1», «A-1», minúsculas. Cualquier otra cosa → '' (sin prioridad).
function normPrioridad(v: any): string {
  const m = String(v || '').trim().toUpperCase().match(/^([ABC])\s*-?\s*(\d{1,2})$/)
  return m ? `${m[1]}${m[2]}` : ''
}

// GET /api/agenda-diaria?fecha=YYYY-MM-DD → líneas del día (ambos tipos)
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const url = new URL(req.url)
    const fecha = normFecha(url.searchParams.get('fecha'))
    const tipo = String(url.searchParams.get('tipo') || '')
    const where: any = { tenantId: tid, fecha, deletedAt: null }
    if (tipo === 'logistica' || tipo === 'facturacion') where.tipo = tipo
    const items = await db.agendaDia.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
    })
    // Lista de clientes del tenant para el datalist del formulario manual.
    // V29.98 — ahora también necesitamos el id para poder resolver el clienteId
    // de cada entrada del catálogo (c1/c2/clienteId → nombre de cliente).
    const clientes = await db.cliente.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    })
    // V29.83 — conceptos del CATÁLOGO para el datalist del concepto (tipear
    // manualmente también usa los nombres exactos del catálogo).
    // V29.98 — ahora también devolvemos el catálogo COMPLETO (nombre+grupo+precio+
    // cliente) para el nuevo diálogo "Del catálogo" con click directo.
    const catRaw = await db.catalogo.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { c1: true, c2: true, final: true, clienteId: true },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    })
    const clientesMap = new Map(clientes.map(c => [c.id, c.nombre]))
    const conceptosCatalogo: string[] = []
    const vistos = new Set<string>()
    // V29.98 — catálogo con todo, deduplicado por nombre
    const catalogoCompleto: { nombre: string; grupo: string; precio: number; cliente: string }[] = []
    for (const c of catRaw) {
      const n = String(c.c2 || '').trim().replace(/\s+/g, ' ')
      const k = n.toLowerCase()
      if (!n || vistos.has(k)) continue
      vistos.add(k)
      conceptosCatalogo.push(n)
      catalogoCompleto.push({
        nombre: n,
        grupo: String(c.c1 || '').trim().replace(/\s+/g, ' '),
        precio: Number(c.final) || 0,
        cliente: clientesMap.get(c.clienteId) || '',
      })
    }
    return NextResponse.json({
      items, fecha,
      clientes: clientes.map(c => c.nombre).filter(Boolean),
      conceptos: conceptosCatalogo,
      catalogo: catalogoCompleto, // V29.98 — para el diálogo "Del catálogo"
    })
  } catch (err: any) {
    console.error('Agenda diaria GET error:', err)
    return NextResponse.json({ error: 'Error cargando agenda: ' + (err?.message || '') }, { status: 500 })
  }
}

// POST /api/agenda-diaria — crea una línea (o un batch) en la agenda del día.
// Body: { fecha, tipo, carga?, cliente?, concepto, nota?, cantidad?, unidad?, importe }
//   o   { fecha, batch: [ ...líneas ] }
export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const user = await getSessionUser()
    const creadoPor = user?.id || ''
    const body = await req.json()
    const fecha = normFecha(body.fecha)

    const lineas: any[] = Array.isArray(body.batch) && body.batch.length > 0 ? body.batch : [body]
    const creadas: any[] = []

    // Nº de carga actual del día (para líneas logística sin carga explícita)
    const existentes = await db.agendaDia.findMany({
      where: { tenantId: tid, fecha, tipo: 'logistica', deletedAt: null },
      select: { carga: true, orden: true },
    })
    let cargaActual = existentes.length > 0 ? Math.max(...existentes.map(x => x.carga)) : 1
    let maxOrden = existentes.length > 0 ? Math.max(...existentes.map(x => x.orden || 0)) : 0

    for (const l of lineas) {
      const tipo = String(l.tipo || 'logistica') === 'facturacion' ? 'facturacion' : 'logistica'
      const concepto = String(l.concepto || '').trim().slice(0, 120)
      if (!concepto) continue // sin concepto no tiene sentido guardar la línea
      const importe = Number(l.importe)
      const cantidad = Number(l.cantidad) || 0
      let carga = 0
      if (tipo === 'logistica') {
        const c = Number(l.carga)
        if (Number.isFinite(c) && c >= 1) {
          carga = Math.round(c)
          cargaActual = Math.max(cargaActual, carga)
        } else {
          carga = cargaActual // sin carga explícita → se añade a la carga en curso
        }
      }
      const orden = Number.isFinite(Number(l.orden)) && Number(l.orden) > 0 ? Math.round(Number(l.orden)) : ++maxOrden
      const row = await db.agendaDia.create({
        data: {
          tenantId: tid,
          fecha,
          tipo,
          carga,
          cliente: String(l.cliente || '').trim().slice(0, 80),
          concepto,
          nota: String(l.nota || '').trim().slice(0, 160),
          cantidad,
          unidad: String(l.unidad || '').trim().slice(0, 12),
          importe: Number.isFinite(importe) ? importe : 0,
          orden,
          prioridad: normPrioridad(l.prioridad),
          creadoPor,
          viaVoz: !!l.viaVoz,
        },
      })
      creadas.push(row)
    }

    if (creadas.length === 0) {
      return NextResponse.json({ error: 'No hay líneas válidas para guardar (falta concepto)' }, { status: 400 })
    }
    return NextResponse.json({ items: creadas, count: creadas.length })
  } catch (err: any) {
    console.error('Agenda diaria POST error:', err)
    return NextResponse.json({ error: 'Error guardando línea: ' + (err?.message || '') }, { status: 500 })
  }
}
