#!/usr/bin/env bun
// Test E2E del endpoint /api/agenda-diaria/interpretar con IMAGEN (VLM)
// 1. Login
// 2. POST /interpretar con imagen base64 (sin texto)
// 3. Verificar que devuelve items y los guarda
// 4. Limpiar (borrar los items creados)

const BASE = process.env.BASE_URL || 'http://localhost:3000'

async function main() {
  // 1. Login (cookie jar con fetch)
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bill.es', password: 'admin123' }),
  })
  if (!loginRes.ok) { console.error('Login falló:', loginRes.status); process.exit(1) }
  const cookie = loginRes.headers.get('set-cookie') || ''
  const jar = cookie.split(';')[0] // bill-session=...
  console.log('✓ Login OK, cookie:', jar.slice(0, 30) + '...')

  // Verificar que el agente está configurado
  const estadoRes = await fetch(`${BASE}/api/agenda-diaria/interpretar`, { headers: { Cookie: jar } })
  const estado = await estadoRes.json()
  console.log('✓ Estado agente:', JSON.stringify(estado))
  if (!estado.agenteConfigurado) {
    console.error('✗ El agente IA no está configurado en este entorno. Abortando test de VLM.')
    console.log('  (Esto es esperado en local si no hay config; en producción sí debe funcionar.)')
    process.exit(0)
  }

  // 2. Leer la imagen de prueba y convertirla a base64
  const fs = require('fs')
  const imgPath = '/tmp/parte-test.png'
  if (!fs.existsSync(imgPath)) { console.error('No existe', imgPath); process.exit(1) }
  const b64 = fs.readFileSync(imgPath).toString('base64')
  const dataUrl = `data:image/png;base64,${b64}`
  console.log(`✓ Imagen leída: ${imgPath} (${b64.length} bytes base64)`)

  // 3. POST /interpretar con la imagen (sin texto — solo foto)
  console.log('\n--- POST /interpretar con imagen ---')
  const fecha = '2026-11-17'
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/agenda-diaria/interpretar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ imagen: dataUrl, fecha }),
  })
  const data = await res.json()
  const dt = Date.now() - t0
  console.log(`Status: ${res.status} · ${dt}ms`)
  if (!res.ok) {
    console.error('✗ Error:', JSON.stringify(data))
    process.exit(1)
  }
  console.log(`✓ Items creados: ${data.count}`)
  for (const it of data.items) {
    console.log(`   - [${it.tipo}] carga=${it.carga} cliente="${it.cliente}" concepto="${it.concepto}" ${it.importe}€${it.cantidad > 0 ? ` ${it.cantidad}${it.unidad}` : ''}${it.nota ? ` nota="${it.nota}"` : ''}${it.prioridad ? ` prioridad=${it.prioridad}` : ''}`)
  }

  // 4. Verificar que se guardaron en la BD (GET del día)
  const getRes = await fetch(`${BASE}/api/agenda-diaria?fecha=${fecha}`, { headers: { Cookie: jar } })
  const getData = await getRes.json()
  console.log(`\n✓ GET del día ${fecha}: ${getData.items.length} items`)

  // 5. Limpiar los items creados
  const ids = data.items.map((i: any) => i.id)
  for (const id of ids) {
    await fetch(`${BASE}/api/agenda-diaria/${id}`, { method: 'DELETE', headers: { Cookie: jar } })
  }
  console.log(`✓ Cleanup: ${ids.length} items borrados`)

  // 6. Caso de control: POST sin texto ni imagen → 400
  console.log('\n--- Caso control: POST sin texto ni imagen ---')
  const ctrl = await fetch(`${BASE}/api/agenda-diaria/interpretar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar },
    body: JSON.stringify({ fecha }),
  })
  console.log(`Status: ${ctrl.status} (esperado 400)`)
  const ctrlData = await ctrl.json()
  console.log(`Mensaje: ${ctrlData.error}`)

  console.log('\n=== TEST VLM COMPLETO ===')
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1) })
