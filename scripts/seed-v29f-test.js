// V29.6 — sembrar 2 entradas: una ENTRADA PALET y otra servicio normal,
// para verificar que el botón QR sale en AMBAS en la columna Acciones.
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const H = { 'Content-Type': 'application/json', Cookie: sess }
const hoy = new Date().toISOString().slice(0, 10)

// 1. ENTRADA PALET (con ubicación P1F1H1)
await fetch(`${BASE}/api/registros`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    fecha: hoy, c1: 'ALMACEN', c2: 'ENTRADA PALET', cant: 1, obs: 'TEST-V29.6-palet',
    customData: JSON.stringify({ 'Ubicación': 'P1F1H1', 'Lote / Nº Palet': 'L-PALET1' })
  })
})
console.log('Palet P1F1H1 sembrado')

// 2. Servicio normal (sin lote/ubicación)
await fetch(`${BASE}/api/registros`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    fecha: hoy, c1: 'MILCA', c2: 'ALQUILER NAVE', cant: 1, obs: 'TEST-V29.6-servicio'
  })
})
console.log('Servicio MILCA/ALQUILER NAVE sembrado')
