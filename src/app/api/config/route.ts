import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId, getTenantId, getAuthUser } from '@/lib/tenant-context'

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

// GET /api/config - Retrieve configuration for the current tenant
export async function GET(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    let config = await db.config.findUnique({ where: { tenantId: tid } })
    if (!config) {
      config = await db.config.create({ data: { tenantId: tid, ...DEFAULT_CONFIG } })
    }
    return NextResponse.json(config)
  } catch (err) {
    console.error('Config GET error:', err)
    return NextResponse.json(DEFAULT_CONFIG)
  }
}

// PUT /api/config - Update configuration for the current tenant
// Only admin or superadmin users can update config
export async function PUT(req: Request) {
  try {
    // Check role: only admin/superadmin can modify config
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (authUser.role !== 'admin' && authUser.role !== 'superadmin') {
      return NextResponse.json({ error: 'No tienes permisos para modificar la configuración' }, { status: 403 })
    }

    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()

    // Validate numeric fields
    if (body.defaultIva !== undefined) body.defaultIva = Number(body.defaultIva) || 0

    // Ensure config row exists for this tenant
    let config = await db.config.findUnique({ where: { tenantId: tid } })
    if (!config) {
      config = await db.config.create({ data: { tenantId: tid, ...DEFAULT_CONFIG } })
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
      where: { tenantId: tid },
      data: updateData,
    })

    // Sync company data to Tenant model when admin saves
    const tenantIdForSync = await getTenantId(req)
    if (tenantIdForSync) {
      const tenantUpdate: Record<string, unknown> = {}
      if (body.companyFullName !== undefined) tenantUpdate.fullName = body.companyFullName
      if (body.companyAddress !== undefined) tenantUpdate.address = body.companyAddress
      if (body.companyCity !== undefined) tenantUpdate.city = body.companyCity
      if (body.companyProvince !== undefined) tenantUpdate.province = body.companyProvince
      if (body.companyCif !== undefined) tenantUpdate.cif = body.companyCif
      if (body.logo !== undefined) tenantUpdate.logo = body.logo

      if (Object.keys(tenantUpdate).length > 0) {
        await db.tenant.update({
          where: { id: tenantIdForSync },
          data: tenantUpdate,
        }).catch(err => console.error('Tenant sync error:', err))
      }
    }

    return NextResponse.json(config)
  } catch (err) {
    console.error('Config PUT error:', err)
    return NextResponse.json({ error: 'Error guardando configuración' }, { status: 500 })
  }
}
