import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const rec = await db.facturaSeq.findUnique({ where: { id: 'main' } })
  return NextResponse.json({ seq: rec?.seq || 1 })
}

export async function PUT(req: Request) {
  const { seq } = await req.json()
  const rec = await db.facturaSeq.upsert({
    where: { id: 'main' },
    update: { seq: Number(seq) || 1 },
    create: { id: 'main', seq: Number(seq) || 1 }
  })
  return NextResponse.json(rec)
}
