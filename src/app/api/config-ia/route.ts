import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

// V29.89 — la configuración del agente IA se guarda EN LA BASE DE DATOS de la
// app (tabla AppConfig, clave 'Z_AI_CONFIG'): el hosting no necesita variables
// de entorno extra y el admin la define o la cambia desde la propia aplicación,
// sin acceso al panel del hosting.
// Solo admin/superadmin. NUNCA se devuelve el valor guardado (contiene la
// apiKey y el token del SDK).
export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado (solo admin o superadmin)' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const valor = String(body?.valor || '').trim()
  if (!valor) {
    return NextResponse.json({ error: 'Falta el valor: pega el JSON de configuración del SDK del agente IA' }, { status: 400 })
  }

  // validar ANTES de guardar — misma tolerancia que parseConfigIa del endpoint
  // de interpretar (comillas tipográficas, backticks, ; o , final)
  let raw = valor.replace(/[“”„‟]/g, '"')
  if ((raw.startsWith('`') && raw.endsWith('`')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim()
  }
  raw = raw.replace(/\}\s*[;,]+\s*$/, '}').trim()
  let cfg: any = null
  try {
    cfg = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'El contenido NO es JSON válido — revisa llaves, comillas y comas' }, { status: 400 })
  }
  if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
    return NextResponse.json({ error: 'Al JSON le falta "baseUrl" y/o "apiKey"' }, { status: 400 })
  }
  // V29.91 — "model" opcional (la API pública de Z.ai y OpenRouter lo exigen);
  // se normaliza y se descarta si viene vacío. Otras claves extra se conservan.
  if (cfg.model !== undefined) {
    const m = String(cfg.model || '').trim()
    if (m) cfg.model = m
    else delete cfg.model
  }
  if (cfg.baseUrl) cfg.baseUrl = String(cfg.baseUrl).trim()
  if (cfg.apiKey) cfg.apiKey = String(cfg.apiKey).trim()

  const valorLimpio = JSON.stringify(cfg) // normalizado, sin secretos en el log
  const row = await db.appConfig.upsert({
    where: { clave: 'Z_AI_CONFIG' },
    create: { clave: 'Z_AI_CONFIG', valor: valorLimpio },
    update: { valor: valorLimpio },
  })
  return NextResponse.json({ ok: true, guardado: true, clave: row.clave, updatedAt: row.updatedAt })
}

// Borrar la configuración guardada (vuelve a la fuente anterior: env/ficheros)
export async function DELETE(req: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado (solo admin o superadmin)' }, { status: 403 })
  const res = await db.appConfig.deleteMany({ where: { clave: 'Z_AI_CONFIG' } })
  return NextResponse.json({ ok: true, borrado: res.count })
}
