import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/tenant-context'
import { getEffectiveTenantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

// POST /api/registros/import — Import Excel file into Registros
export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const tenantId = getEffectiveTenantId(user, req)

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const mode = (formData.get('mode') as string) || 'append'

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado archivo' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return NextResponse.json({ error: 'El archivo Excel no tiene hojas' }, { status: 400 })
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (rows.length === 0) return NextResponse.json({ error: 'El archivo Excel está vacío' }, { status: 400 })

    const clientes = await db.cliente.findMany({ where: tenantId ? { tenantId } : {} })
    const catalogo = await db.catalogo.findMany({ where: tenantId ? { tenantId } : {} })

    // Look up catalog price
    function lookupPrecio(c1: string, c2: string, clienteId: string): number {
      let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId === clienteId)
      if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && !x.clienteId)
      if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
      return it ? Number(it.final) || 0 : 0
    }

    function findCol(row: Record<string, unknown>, candidates: string[]): string | null {
      for (const c of candidates) {
        for (const key of Object.keys(row)) {
          if (key.trim().toLowerCase() === c.toLowerCase()) return key
        }
      }
      return null
    }

    function parseDate(val: unknown): string {
      if (!val) return ''
      if (val instanceof Date) {
        const y = val.getFullYear()
        const m = String(val.getMonth() + 1).padStart(2, '0')
        const d = String(val.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
      }
      const s = String(val).trim()
      const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
      if (dmy) { const [, dd, mm, yyyy] = dmy; return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` }
      const ymd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
      if (ymd) { const [, yyyy, mm, dd] = ymd; return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` }
      return s
    }

    function findClienteId(nombre: string): { id: string; nombre: string } | null {
      if (!nombre) return null
      const n = nombre.trim().toLowerCase()
      const exact = clientes.find(c => c.nombre.trim().toLowerCase() === n)
      if (exact) return { id: exact.id, nombre: exact.nombre }
      const partial = clientes.find(c => c.nombre.trim().toLowerCase().includes(n) || n.includes(c.nombre.trim().toLowerCase()))
      if (partial) return { id: partial.id, nombre: partial.nombre }
      return null
    }

    const firstRow = rows[0]
    const colFecha = findCol(firstRow, ['fecha', 'date', 'fecha entrada', 'día', 'dia', 'f.entrada'])
    const colCliente = findCol(firstRow, ['cliente', 'client', 'nombre cliente', 'empresa'])
    const colC1 = findCol(firstRow, ['concepto 1', 'concepto1', 'c1', 'grupo'])
    const colC2 = findCol(firstRow, ['concepto 2', 'concepto2', 'c2', 'servicio', 'descripcion'])
    const colCant = findCol(firstRow, ['cantidad', 'cant', 'qty', 'quantity', 'unidades'])
    const colObs = findCol(firstRow, ['observaciones', 'obs', 'notas', 'nota'])
    const colClienteId = findCol(firstRow, ['clienteid', 'cliente_id', 'id cliente'])

    if (!colFecha) return NextResponse.json({ error: 'No se encuentra la columna "Fecha"' }, { status: 400 })
    if (!colC1) return NextResponse.json({ error: 'No se encuentra la columna "Concepto 1"' }, { status: 400 })
    if (!colC2) return NextResponse.json({ error: 'No se encuentra la columna "Concepto 2"' }, { status: 400 })

    const skipped: { row: number; reason: string }[] = []
    const validRows: {
      fecha: string; clienteId: string; cliente: string;
      c1: string; c2: string; cant: number; obs: string; customData: string;
      precioUnitario: number;
    }[] = []

    const coreCols = new Set([colFecha, colCliente, colC1, colC2, colCant, colObs, colClienteId].filter(Boolean))
    const customCols = Object.keys(firstRow).filter(k => !coreCols.has(k) && String(firstRow[k]) !== '')

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const fecha = parseDate(row[colFecha!])
      const c1 = String(row[colC1!] || '').trim()
      const c2 = String(row[colC2!] || '').trim()
      const cant = Number(row[colCant!]) || 1
      const obs = colObs ? String(row[colObs] || '').trim() : ''

      if (!fecha || !c1 || !c2) {
        skipped.push({ row: i + 2, reason: `Faltan datos obligatorios` })
        continue
      }

      let clienteId = ''
      let clienteNombre = ''
      if (colClienteId && row[colClienteId]) {
        const id = String(row[colClienteId]).trim()
        const found = clientes.find(c => c.id === id)
        if (found) { clienteId = found.id; clienteNombre = found.nombre }
      }
      if (!clienteId && colCliente && row[colCliente]) {
        const match = findClienteId(String(row[colCliente]))
        if (match) { clienteId = match.id; clienteNombre = match.nombre }
      }
      if (!clienteId) {
        clienteNombre = colCliente ? String(row[colCliente] || '').trim() : ''
      }

      const customData: Record<string, unknown> = {}
      for (const col of customCols) {
        if (row[col] !== undefined && row[col] !== '') customData[col] = row[col]
      }

      validRows.push({
        fecha, clienteId, cliente: clienteNombre, c1, c2, cant, obs,
        customData: Object.keys(customData).length > 0 ? JSON.stringify(customData) : '',
        precioUnitario: lookupPrecio(c1, c2, clienteId),
      })
    }

    if (validRows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas válidas', skipped }, { status: 400 })
    }

    if (mode === 'replace') {
      // When replacing, delete ALL existing registros for this tenant
      await db.registro.deleteMany({ where: tenantId ? { tenantId } : {} })
    }

    // Duplicate detection only for append mode
    let duplicates: { row: number; key: string }[] = []
    let uniqueRows = validRows

    if (mode === 'append') {
      const existingWhere: Record<string, unknown> = {}
      if (tenantId) existingWhere.tenantId = tenantId
      existingWhere.pasadoRegistro = true

      const existingRegistros = await db.registro.findMany({
        where: existingWhere,
        select: { fecha: true, clienteId: true, c1: true, c2: true, cant: true },
      })
      const existingKeys = new Set(
        existingRegistros.map(r => `${r.fecha}|${r.clienteId || ''}|${r.c1}|${r.c2}|${r.cant}`)
      )

      uniqueRows = validRows.filter((r, idx) => {
        const key = `${r.fecha}|${r.clienteId || ''}|${r.c1}|${r.c2}|${r.cant}`
        if (existingKeys.has(key)) {
          duplicates.push({ row: idx + 2, key })
          return false
        }
        existingKeys.add(key)
        return true
      })
    }

    // Use individual create() (not createMany) so nullable clienteId works
    // reliably and we get clear per-row errors if any row fails.
    let createdCount = 0
    if (uniqueRows.length > 0) {
      for (const r of uniqueRows) {
        try {
          await db.registro.create({
            data: {
              tenantId,
              fecha: r.fecha,
              clienteId: r.clienteId || null,
              cliente: r.cliente,
              c1: r.c1,
              c2: r.c2,
              cant: r.cant,
              obs: r.obs,
              precioUnitario: r.precioUnitario,
              customData: r.customData,
              pasadoRegistro: true,
            }
          })
          createdCount++
        } catch (rowErr) {
          console.error('[Import Excel] Row FAILED:', rowErr, 'Row data:', r)
          throw rowErr
        }
      }
    }
    const created = { count: createdCount }

    return NextResponse.json({
      success: true, imported: created.count, total: rows.length,
      duplicates: duplicates.length, duplicateRows: duplicates.slice(0, 50),
      skipped: skipped.length, skippedRows: skipped.slice(0, 50),
      detected: { colFecha, colCliente, colC1, colC2, colCant, colObs },
    }, { status: 201 })

  } catch (err) {
    console.error('Import Excel error:', err)
    return NextResponse.json({ error: 'Error procesando el archivo Excel: ' + String(err) }, { status: 500 })
  }
}
