import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuthWithTenant } from '@/lib/tenant'

// Default config values
const DEFAULT_CONFIG = {
  companyName: 'BILL by Metodo',
  companyFullName: '',
  companyAddress: '',
  companyCity: '',
  companyProvince: '',
  companyCif: '',
  logo: '',
  currency: '€',
  defaultIva: 21,
  appName: 'BILL by Metodo',
  appVersion: 'v3.0',
  labelEntrada: '',
  labelCatalogo: '',
  labelRegistros: '',
  labelFacturas: '',
  labelClientes: '',
  sectionEntrada: 'ENTRADA',
  sectionRegistros: 'REGISTROS',
  sectionClientes: 'CLIENTES',
  sectionCatalogo: 'CATÁLOGO',
  sectionFacturas: 'FACTURAS',
  sectionBackup: 'SEGURIDAD',
  transferMode: 'auto',
  transferTime: '00:00',
  fieldsEntrada: '',
  fieldsClientes: '',
  fieldsCatalogo: '',
  fieldsRegistros: '',
  fieldsFacturas: '',
}

// GET /api/config - Retrieve configuration for the effective tenant
export async function GET(req: Request) {
  try {
    const auth = await requireAuthWithTenant(req)
    if ('error' in auth) return auth.error

    // Find or create config for this tenant
    let config = await db.config.findFirst({ where: { tenantId: auth.tenantId } })
    if (!config) {
      config = await db.config.create({
        data: { tenantId: auth.tenantId, ...DEFAULT_CONFIG }
      })
    }
    return NextResponse.json(config)
  } catch (err) {
    console.error('Config GET error:', err)
    return NextResponse.json(DEFAULT_CONFIG)
  }
}

// PUT /api/config - Update configuration for the effective tenant
export async function PUT(req: Request) {
  try {
    const auth = await requireAuthWithTenant(req)
    if ('error' in auth) return auth.error

    const body = await req.json()

    // Validate numeric fields
    if (body.defaultIva !== undefined) body.defaultIva = Number(body.defaultIva) || 0

    // Find or create config for this tenant
    let config = await db.config.findFirst({ where: { tenantId: auth.tenantId } })
    if (!config) {
      config = await db.config.create({
        data: { tenantId: auth.tenantId, ...DEFAULT_CONFIG }
      })
    }

    // Update with provided fields
    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'companyName', 'companyFullName', 'companyAddress', 'companyCity', 'companyProvince',
      'companyCif', 'logo', 'currency', 'defaultIva', 'appName', 'appVersion',
      'labelEntrada', 'labelCatalogo', 'labelRegistros', 'labelFacturas', 'labelClientes',
      'sectionEntrada', 'sectionRegistros', 'sectionClientes', 'sectionCatalogo',
      'sectionFacturas', 'sectionBackup',
      'transferMode', 'transferTime',
      'fieldsEntrada', 'fieldsClientes', 'fieldsCatalogo', 'fieldsRegistros', 'fieldsFacturas',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    config = await db.config.update({
      where: { id: config.id },
      data: updateData,
    })

    return NextResponse.json(config)
  } catch (err) {
    console.error('Config PUT error:', err)
    return NextResponse.json({ error: 'Error guardando configuración' }, { status: 500 })
  }
}
