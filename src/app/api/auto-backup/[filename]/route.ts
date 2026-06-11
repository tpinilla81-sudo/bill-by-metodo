import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'

// GET: download a specific backup (only if it belongs to this tenant)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { filename } = await params
    // Security: only allow .json filenames
    if (!filename.endsWith('.json') || filename.includes('..') || filename.includes('/')) {
      return NextResponse.json({ error: 'Archivo no válido' }, { status: 400 })
    }

    // Find backup in database
    const backup = await db.backup.findUnique({
      where: { filename },
      select: { tenantId: true, data: true }
    })

    if (!backup || backup.tenantId !== tid) {
      return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 })
    }

    return new NextResponse(backup.data, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 })
  }
}

// DELETE: delete a specific backup (only if it belongs to this tenant)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { filename } = await params
    if (!filename.endsWith('.json') || filename.includes('..') || filename.includes('/')) {
      return NextResponse.json({ error: 'Archivo no válido' }, { status: 400 })
    }

    // Find and verify ownership
    const backup = await db.backup.findUnique({
      where: { filename },
      select: { tenantId: true }
    })

    if (!backup || backup.tenantId !== tid) {
      return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 })
    }

    await db.backup.delete({ where: { filename } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 })
  }
}
