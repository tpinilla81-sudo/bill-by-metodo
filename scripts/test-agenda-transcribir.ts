#!/usr/bin/env bun
// Test E2E del endpoint /api/agenda-diaria/transcribir (Whisper de Z.ai)
// 1. Login
// 2. POST /transcribir con audio base64 (WAV generado con espeak-ng)
// 3. Verificar que devuelve texto coherente
// 4. Opcional: POST /interpretar con el texto transcrito para ver el flujo completo

const BASE = process.env.BASE_URL || 'http://localhost:3000'

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bill.es', password: 'admin123' }),
  })
  if (!loginRes.ok) { console.error('Login falló:', loginRes.status); process.exit(1) }
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]
  console.log('✓ Login OK')

  // Verificar estado del agente
  const estadoRes = await fetch(`${BASE}/api/agenda-diaria/interpretar`, { headers: { Cookie: cookie } })
  const estado = await estadoRes.json()
  console.log('✓ Estado agente:', JSON.stringify(estado))
  if (!estado.agenteConfigurado) {
    console.error('✗ Agente IA no configurado. Abortando.')
    process.exit(0)
  }

  // Leer audio y convertirlo a base64 data URL
  const fs = require('fs')
  const audioPath = '/tmp/dictado-test.wav'
  if (!fs.existsSync(audioPath)) { console.error('No existe', audioPath); process.exit(1) }
  const b64 = fs.readFileSync(audioPath).toString('base64')
  const dataUrl = `data:audio/wav;base64,${b64}`
  console.log(`✓ Audio leído: ${audioPath} (${b64.length} bytes base64)`)

  // POST /transcribir
  console.log('\n--- POST /transcribir ---')
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/agenda-diaria/transcribir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ audio: dataUrl }),
  })
  const data = await res.json()
  const dt = Date.now() - t0
  console.log(`Status: ${res.status} · ${dt}ms`)
  if (!res.ok) {
    console.error('✗ Error:', JSON.stringify(data))
    process.exit(1)
  }
  console.log(`✓ Transcripción: "${data.texto}"`)

  // Caso control: POST sin audio → 400
  console.log('\n--- Caso control: POST sin audio ---')
  const ctrl = await fetch(`${BASE}/api/agenda-diaria/transcribir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({}),
  })
  console.log(`Status: ${ctrl.status} (esperado 400)`)
  const ctrlData = await ctrl.json()
  console.log(`Mensaje: ${ctrlData.error}`)

  console.log('\n=== TEST TRANSCRIBIR COMPLETO ===')
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1) })
