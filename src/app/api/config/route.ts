import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// Default config values
const DEFAULT_CONFIG = {
  companyName: 'HUALSA PRO',
  companyFullName: 'Transportes Hualsa 2021, S.L.',
  companyAddress: 'C/ Moret y Aleson, Nº 30',
  companyCity: '31320 Milagro',
  companyProvince: 'Navarra',
  companyCif: '',
  logo: '',
  currency: '€',
  defaultIva: 21,
  appName: 'HUALSA PRO',
  appVersion: 'v2.0',
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
}

// GET /api/config - Retrieve configuration
export async function GET() {
  try {
    let config = await db.config.findUnique({ where: { id: 'main' } })
    if (!config) {
      config = await db.config.create({ data: { id: 'main', ...DEFAULT_CONFIG } })
    }
    return NextResponse.json(config)
  } catch (err) {
    console.error('Config GET error:', err)
    return NextResponse.json(DEFAULT_CONFIG)
  }
}

// PUT /api/config - Update configuration
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()

    // Validate numeric fields
    if (body.defaultIva !== undefined) body.defaultIva = Number(body.defaultIva) || 0

    // Ensure config row exists
    let config = await db.config.findUnique({ where: { id: 'main' } })
    if (!config) {
      config = await db.config.create({ data: { id: 'main', ...DEFAULT_CONFIG } })
    }

    // Update with provided fields
    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'companyName', 'companyFullName', 'companyAddress', 'companyCity', 'companyProvince',
      'companyCif', 'logo', 'currency', 'defaultIva', 'appName', 'appVersion',
      'labelEntrada', 'labelCatalogo', 'labelRegistros', 'labelFacturas', 'labelClientes',
      'sectionEntrada', 'sectionRegistros', 'sectionClientes', 'sectionCatalogo',
      'sectionFacturas', 'sectionBackup',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    config = await db.config.update({
      where: { id: 'main' },
      data: updateData,
    })

    return NextResponse.json(config)
  } catch (err) {
    console.error('Config PUT error:', err)
    return NextResponse.json({ error: 'Error guardando configuración' }, { status: 500 })
  }
}
