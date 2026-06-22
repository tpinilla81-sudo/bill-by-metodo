import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'

// Lookup price from catalog for a given c1/c2/clienteId
function lookupPrecio(catalogo: { c1: string; c2: string; clienteId: string; final: number }[], c1: string, c2: string, clienteId: string): number {
  // If client selected, try exact match first
  if (clienteId) {
    let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId === clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
    return it ? Number(it.final) || 0 : 0
  }
  // No client: find any match by c1+c2
  let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
  return it ? Number(it.final) || 0 : 0
}

// Lookup client from catalog by c1+c2 (reverse lookup)
function lookupCliente(catalogo: { c1: string; c2: string; clienteId: string }[], c1: string, c2: string): string {
  const item = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId)
  return item?.clienteId || ''
}

// GET /api/registros?filter=entrada|registros|all
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') || 'all'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = { tenantId: tid }
    if (filter === 'entrada') {
      where = { tenantId: tid, pasadoRegistro: false }
    } else if (filter === 'registros') {
      where = { tenantId: tid, pasadoRegistro: true }
    }

    // Default sort: createdAt desc (most recent entry first).
    // The UI can re-sort client-side; this just gives a sensible default that
    // reflects the order in which records were entered (orden de entrada).
    const registros = await db.registro.findMany({ where, orderBy: { createdAt: 'desc' } })
    return NextResponse.json(registros)
  } catch (err) {
    console.error('Registros GET error:', err)
    return NextResponse.json({ error: 'Error cargando registros' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    // Check plan limits for maxRegistros
    const user = await getSessionUser()
    if (user) {
      const tenant = await db.tenant.findUnique({ where: { id: tid } })
      if (tenant && tenant.maxRegistros > 0) {
        const currentCount = await db.registro.count({ where: { tenantId: tid } })
        if (currentCount >= tenant.maxRegistros) {
          return NextResponse.json({
            error: `Has alcanzado el límite de registros (${tenant.maxRegistros}) para el plan "${tenant.plan}". Actualiza tu suscripción para añadir más registros.`,
          }, { status: 400 })
        }
      }
    }

    const body = await req.json()
    console.log('[POST /api/registros] Incoming body:', JSON.stringify(body).slice(0, 500))

    // Batch import
    if (body.batch && Array.isArray(body.batch)) {
      const rows = body.batch as Array<{
        fecha: string; clienteId: string; cliente: string;
        c1: string; c2: string; cant: number; obs: string; customData?: string; precioUnitario?: number;
      }>

      const validRows = rows.filter(r => r.fecha && r.c1 && r.c2)
      if (validRows.length === 0) {
        return NextResponse.json({ error: 'No hay filas válidas' }, { status: 400 })
      }

      // Lookup catalog prices for batch rows
      const catalogo = await db.catalogo.findMany({ where: { tenantId: tid }, select: { c1: true, c2: true, clienteId: true, final: true } })

      // Build a clientes name lookup so we can fill the `cliente` text field
      // when clienteId is auto-detected from the catalog (and no name was provided).
      const clientesMap = new Map<string, string>()
      const clientesRows = await db.cliente.findMany({ where: { tenantId: tid }, select: { id: true, nombre: true } })
      for (const c of clientesRows) clientesMap.set(c.id, c.nombre)

      // Respect the caller's pasadoRegistro flag.
      // Default to FALSE so a batch from the grilla lands in Entradas (not Registros).
      // Excel import explicitly sends pasadoRegistro: true to skip Entradas.
      const pasadoRegistroFlag = body.pasadoRegistro !== undefined ? Boolean(body.pasadoRegistro) : false

      // Use individual create() per row so one bad row doesn't abort the rest.
      // Collect per-row errors so the user can see WHICH row failed and WHY
      // (instead of the generic "Error creando registro" we used to throw).
      let createdCount = 0
      const failures: { row: number; c1: string; c2: string; fecha: string; reason: string }[] = []
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i]
        // Resolve client: if not provided, try to detect from catalog
        let effectiveClienteId = r.clienteId || ''
        if (!effectiveClienteId) {
          effectiveClienteId = lookupCliente(catalogo, r.c1, r.c2)
        }
        let effectiveClienteName = r.cliente || ''
        if (effectiveClienteId && !effectiveClienteName) {
          effectiveClienteName = clientesMap.get(effectiveClienteId) || ''
        }
        const createData = {
          tenantId: tid,
          fecha: r.fecha,
          // Pass null when no cliente detected (schema is String? @default(""))
          clienteId: effectiveClienteId || null,
          cliente: effectiveClienteName,
          c1: r.c1,
          c2: r.c2,
          cant: Number(r.cant) || 1,
          precioUnitario: r.precioUnitario && r.precioUnitario > 0 ? Number(r.precioUnitario) : lookupPrecio(catalogo, r.c1, r.c2, effectiveClienteId),
          obs: r.obs || '',
          customData: r.customData || '',
          pasadoRegistro: pasadoRegistroFlag,
        }
        try {
          await db.registro.create({ data: createData })
          createdCount++
        } catch (rowErr) {
          const reason = rowErr instanceof Error ? rowErr.message : String(rowErr)
          console.error(`[POST /api/registros] Row #${i + 1} FAILED:`, reason, 'Row data:', JSON.stringify(createData).slice(0, 200))
          failures.push({ row: i + 1, c1: r.c1, c2: r.c2, fecha: r.fecha, reason })
        }
      }

      // All rows succeeded
      if (failures.length === 0) {
        return NextResponse.json({ count: createdCount }, { status: 201 })
      }
      // Some succeeded, some failed — return partial success with details
      if (createdCount > 0) {
        return NextResponse.json({
          count: createdCount,
          partial: true,
          failures,
          error: `Se guardaron ${createdCount} de ${validRows.length} filas. Fallaron: ${failures.map(f => `#${f.row} (${f.c1}/${f.c2}): ${f.reason}`).join('; ')}`,
        }, { status: 207 })
      }
      // All failed — give the user the most actionable reason
      return NextResponse.json({
        error: `No se pudo guardar ninguna fila. Primera falla: ${failures[0].reason} (fila ${failures[0].row}: ${failures[0].c1}/${failures[0].c2} del ${failures[0].fecha})`,
        failures,
      }, { status: 500 })
    }

    // Single entry
    const { fecha, clienteId, cliente, c1, c2, cant, obs, customData, precioUnitario } = body
    if (!fecha || !c1 || !c2 || !cant) {
      return NextResponse.json({ error: 'Completa fecha, conceptos y cantidad' }, { status: 400 })
    }
    // Resolve client: if not provided, try to detect from catalog
    let effectiveClienteId = clienteId || ''
    let effectiveCliente = cliente || ''
    if (!effectiveClienteId && c1 && c2) {
      const catalogo = await db.catalogo.findMany({ where: { tenantId: tid }, select: { c1: true, c2: true, clienteId: true, final: true } })
      const detectedId = lookupCliente(catalogo, c1, c2)
      if (detectedId) {
        effectiveClienteId = detectedId
        const cli = await db.cliente.findUnique({ where: { id: detectedId } })
        effectiveCliente = cli?.nombre || ''
      }
    }
    // Lookup catalog price if not provided
    let pu = Number(precioUnitario) || 0
    if (!pu) {
      const catalogo = await db.catalogo.findMany({ where: { tenantId: tid }, select: { c1: true, c2: true, clienteId: true, final: true } })
      pu = lookupPrecio(catalogo, c1, c2, effectiveClienteId)
    }
    const registro = await db.registro.create({
      // Default to false (= Entrada). Caller can send pasadoRegistro: true to skip Entradas and go straight to Registros
      // (Excel import does this). Form Entrada and Grilla send false (or omit, defaulting to false).
      data: { tenantId: tid, fecha, clienteId: effectiveClienteId || null, cliente: effectiveCliente, c1, c2, cant: Number(cant) || 1, precioUnitario: pu, obs: obs || '', customData: customData || '', pasadoRegistro: body.pasadoRegistro !== undefined ? Boolean(body.pasadoRegistro) : false }
    })
    return NextResponse.json(registro, { status: 201 })
  } catch (err) {
    console.error('Registros POST error:', err)
    return NextResponse.json({ error: 'Error creando registro' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()

    // Batch update facturado
    if (body.batchFacturado && Array.isArray(body.ids)) {
      const ids = body.ids as string[]
      if (ids.length === 0) return NextResponse.json({ count: 0 })
      const result = await db.registro.updateMany({
        where: { id: { in: ids }, tenantId: tid },
        data: { facturado: true }
      })
      return NextResponse.json({ count: result.count })
    }

    // Batch quitar facturado
    if (body.batchQuitarFacturado && Array.isArray(body.ids)) {
      const ids = body.ids as string[]
      if (ids.length === 0) return NextResponse.json({ count: 0 })
      const result = await db.registro.updateMany({
        where: { id: { in: ids }, tenantId: tid },
        data: { facturado: false }
      })
      return NextResponse.json({ count: result.count })
    }

    const { id, fecha, clienteId, cliente, c1, c2, cant, obs, customData, facturado, precioUnitario } = body
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    // Verify ownership
    const existing = await db.registro.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { fecha, cliente: cliente || '', c1, c2, cant: Number(cant) || 1, obs: obs || '' }
    // Only set clienteId when a real value is provided (avoid FK violation on "")
    if (clienteId) data.clienteId = clienteId
    if (customData !== undefined) data.customData = customData
    if (facturado !== undefined) data.facturado = Boolean(facturado)
    if (precioUnitario !== undefined) data.precioUnitario = Number(precioUnitario)
    const registro = await db.registro.update({ where: { id }, data })
    return NextResponse.json(registro)
  } catch (err) {
    console.error('Registros PUT error:', err)
    return NextResponse.json({ error: 'Error actualizando registro' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    // Try body first for batch delete
    let body: { ids?: string[] } = {}
    try { body = await req.json() } catch { /* no body or invalid JSON */ }

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      // Batch delete - only delete records owned by this tenant
      const result = await db.registro.deleteMany({
        where: { id: { in: body.ids }, tenantId: tid }
      })
      return NextResponse.json({ count: result.count, ok: true })
    }

    // Single delete via query param
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    // Verify ownership
    const existing = await db.registro.findFirst({ where: { id, tenantId: tid } })
    if (!existing) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

    await db.registro.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Registros DELETE error:', err)
    return NextResponse.json({ error: 'Error eliminando registro' }, { status: 500 })
  }
}
