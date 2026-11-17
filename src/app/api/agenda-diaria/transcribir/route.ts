import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { crearZai } from '@/lib/agenda-ia'

// V29.96 — POST /api/agenda-diaria/transcribir
// Recibe audio en base64 (grabado con MediaRecorder en el navegador, formato
// webm/opus o mp4), lo transcribe con Whisper de Z.ai (audio.asr.create) y
// devuelve { texto }. Es el motor de dictado alternativo a Web Speech API:
// mejor calidad con acento y ruido de fondo, funciona en Safari/Firefox, no se
// corta por silencios. Usa la misma config del agente (crearZai) — gratis con
// la clave del usuario.
//
// Body: { audio: "<base64>", mime?: "audio/webm" }
// Sin tocar Registros ni Facturas — solo devuelve texto.

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()
    const audioB64 = String(body.audio || '').trim()
    if (!audioB64) {
      return NextResponse.json({ error: 'No se ha enviado audio' }, { status: 400 })
    }

    // El SDK espera el base64 SIN el prefijo data:audio/webm;base64,
    const b64Limpio = audioB64.startsWith('data:')
      ? audioB64.split(',', 2)[1] || ''
      : audioB64
    if (!b64Limpio) {
      return NextResponse.json({ error: 'Audio base64 vacío o mal formado' }, { status: 400 })
    }

    const { zai } = await crearZai()
    // @ts-ignore — el método asr existe en runtime aunque el tipo del SDK no lo exponga siempre
    const resp = await (zai as any).audio.asr.create({ file_base64: b64Limpio })
    const texto = String(resp?.text || '').trim()
    if (!texto) {
      return NextResponse.json({ error: 'No se ha podido transcribir el audio (Whisper no devolvió texto) — prueba a hablar más claro o más cerca del micrófono' }, { status: 422 })
    }

    return NextResponse.json({ texto })
  } catch (err: any) {
    console.error('agenda-diaria/transcribir error:', err)
    const m = String(err?.message || '')
    if (/Z_AI_CONFIG_BAD_JSON|Z_AI_CONFIG_INCOMPLETE|Z_AI_PARTIAL|Configuration file not found|\.z-ai-config/i.test(m)) {
      return NextResponse.json({ error: 'El agente IA no está configurado (necesario para transcribir con Whisper). Configúralo en CONFIG IA.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Error transcribiendo audio: ' + (m || 'desconocido') }, { status: 500 })
  }
}
