import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { leerConfigIa } from '@/lib/agenda-ia'

// V29.96 — POST /api/agenda-diaria/transcribir
// Recibe audio en base64 (grabado con MediaRecorder en el navegador, formato
// webm/opus o mp4), lo transcribe con GLM-ASR-2512 de Z.ai y devuelve { texto }.
// Es el motor de dictado alternativo a Web Speech API: mejor calidad con acento
// y ruido de fondo, funciona en Safari/Firefox, no se corta por silencios.
//
// Body: { audio: "<base64 o data URL>", mime?: "audio/webm" }
// Sin tocar Registros ni Facturas — solo devuelve texto.
//
// Nota técnica: el SDK de Z.ai (z-ai-web-dev-sdk) expone audio.asr.create() que
// apunta a /v4/audio/asr — ese endpoint NO existe en la API pública (404). El
// endpoint correcto es /v4/audio/transcriptions con modelo glm-asr-2512 (igual
// que OpenAI pero con el modelo GLM). Aquí lo llamamos directamente con fetch
// usando la misma config (baseUrl + apiKey) que el resto del agente.

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid

    const body = await req.json()
    const audioB64 = String(body.audio || '').trim()
    if (!audioB64) {
      return NextResponse.json({ error: 'No se ha enviado audio' }, { status: 400 })
    }

    // El API espera el base64 SIN el prefijo data:audio/webm;base64,
    const b64Limpio = audioB64.startsWith('data:')
      ? audioB64.split(',', 2)[1] || ''
      : audioB64
    if (!b64Limpio) {
      return NextResponse.json({ error: 'Audio base64 vacío o mal formado' }, { status: 400 })
    }

    const r = await leerConfigIa()
    if (!r) {
      return NextResponse.json({ error: 'El agente IA no está configurado (necesario para transcribir). Configúralo en CONFIG IA.' }, { status: 503 })
    }
    const baseUrl = String(r.cfg.baseUrl || '').replace(/\/$/, '')
    const apiKey = String(r.cfg.apiKey || '')
    // Construir la URL del endpoint de transcripciones
    const url = `${baseUrl}/audio/transcriptions`

    // Llamar a la API como multipart/form-data (igual que OpenAI Whisper):
    // - model=glm-asr-2512
    // - file=audio.webm (binario)
    // El base64 → Blob → FormData para no tener que decodificar a Buffer.
    const audioBuffer = Buffer.from(b64Limpio, 'base64')
    const mime = String(body.mime || 'audio/webm').trim() || 'audio/webm'
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'
    const form = new FormData()
    form.append('model', 'glm-asr-2512')
    form.append('stream', 'false')
    form.append('file', new Blob([audioBuffer], { type: mime }), `audio.${ext}`)

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // Si la config trae token (gateway interno), añadir X-Token también
        ...(r.cfg.token ? { 'X-Token': String(r.cfg.token) } : {}),
      },
      body: form,
    })
    if (!apiRes.ok) {
      const txt = await apiRes.text().catch(() => '')
      console.error('Z.ai /audio/transcriptions error:', apiRes.status, txt.slice(0, 500))
      return NextResponse.json({ error: `Z.ai transcripción falló (${apiRes.status})` }, { status: 502 })
    }
    const data = await apiRes.json()
    const texto = String(data?.text || '').trim()
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
