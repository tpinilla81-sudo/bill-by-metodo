// V29.1 — test rápido: meter 1 palet en P1-01 y comprobar que el asistente
// ofrece ALTURA 2 en P1-01 (y ALTURA 1 en los demás huecos)
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const H = { 'Content-Type': 'application/json', Cookie: sess }
const hoy = new Date().toISOString().slice(0, 10)
await fetch(`${BASE}/api/registros`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    fecha: hoy, c1: 'ALMACEN', c2: 'ENTRADA PALET', cant: 1, obs: 'TEST-V29.1',
    customData: JSON.stringify({ 'Ubicación': 'P1-01', 'Lote / Nº Palet': 'L-TEST1' })
  })
})
console.log('Palet en P1-01 (ALTURA 1) sembrado')
