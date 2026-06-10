import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { promises as fs } from 'fs'
import path from 'path'

const BACKUP_DIR = path.join(process.cwd(), 'backups')

// GET: download a specific backup file (only if it belongs to this tenant)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const { filename } = await params
    // Security: only allow .json files in the backups directory
    if (!filename.endsWith('.json') || filename.includes('..') || filename.includes('/')) {
      return NextResponse.json({ error: 'Archivo no válido' }, { status: 400 })
    }

    // Verify this backup belongs to this tenant
    const prefix = `bill_backup_${tid}_`
    if (!filename.startsWith(prefix)) {
      return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 })
    }

    const filepath = path.join(BACKUP_DIR, filename)
    const content = await fs.readFile(filepath, 'utf-8')
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 })
  }
}

// DELETE: delete a specific backup file (only if it belongs to this tenant)
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

    // Verify this backup belongs to this tenant
    const prefix = `bill_backup_${tid}_`
    if (!filename.startsWith(prefix)) {
      return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 })
    }

    const filepath = path.join(BACKUP_DIR, filename)
    await fs.unlink(filepath)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Backup no encontrado' }, { status: 404 })
  }
}
