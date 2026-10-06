// V29.3 — sembrar 1 palet en P1F1H1 (nueva nomenclatura) y comprobar que:
//   1. El motor de stock cuenta P1F1H1 como ocupación en columna P1-1
//   2. Al meter otro palet, el sistema propone P1-1-2 (siguiente altura)
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const H = { 'Content-Type': 'application/json', Cookie: sess }
const hoy = new Date().toISOString().slice(0, 10)

// 1 palet en P1F1H1 (suelo de la columna 1 de la pared P1)
const r = await fetch(`${BASE}/api/registros`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    fecha: hoy, c1: 'ALMACEN', c2: 'ENTRADA PALET', cant: 1, obs: 'TEST-V29.3',
    customData: JSON.stringify({ 'Ubicación': 'P1F1H1', 'Lote / Nº Palet': 'L-TEST1' })
  })
})
console.log('Palet en P1F1H1 sembrado:', r.status)
