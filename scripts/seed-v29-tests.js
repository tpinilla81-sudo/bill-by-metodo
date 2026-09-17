// V29 — datos de prueba para los CRITERIOS POR ZONA
// 1. Guarda la config actual del servidor (backup en scripts/v29-config-backup.json)
// 2. Pone config de test: E1 (por familia), E2 (por defecto), P1 (compactar)
// 3. Mete stock de prueba (c1='ALMACEN', c2='ENTRADA PALET', obs='TEST-V29')
const BASE = 'http://localhost:3000'

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
if (!sess) { console.error('LOGIN FALLIDO'); process.exit(1) }
const H = { 'Content-Type': 'application/json', Cookie: sess }

// 1. Backup de la config actual
const cfgRes = await fetch(`${BASE}/api/almacen`, { headers: { Cookie: sess } })
const cfgActual = (await cfgRes.json()).cfg || []
const fs = await import('node:fs')
fs.writeFileSync('scripts/v29-config-backup.json', JSON.stringify(cfgActual, null, 2))
console.log(`Backup de config guardado (${cfgActual.length} zonas) → scripts/v29-config-backup.json`)

// 2. Config de test con criterios por zona
const cfg = [
  {
    id: 'e1', nombre: 'E1', tipo: 'estanteria', huecos: 10, orientacion: 'izq',
    caps: [3, 3, 3, 3, 3, 3, 2, 2, 2, 2],
    criterios: { orden: 0, familia: 10, lote: 6, cliente: 0, antiguedad: 0, compactar: 4, espacio: 0, equilibrio: 0 },
  },
  { id: 'e2', nombre: 'E2', tipo: 'estanteria', huecos: 8, orientacion: 'izq', caps: [3, 3, 3, 3, 3, 3, 3, 3] },
  {
    id: 'p1', nombre: 'P1', tipo: 'pared', huecos: 6, orientacion: 'der',
    caps: [4, 4, 3, 3, 2, 2],
    criterios: { orden: 4, familia: 0, lote: 0, cliente: 0, antiguedad: 0, compactar: 10, espacio: 0, equilibrio: 0 },
  },
]
await fetch(`${BASE}/api/almacen`, { method: 'PUT', headers: H, body: JSON.stringify({ cfg }) })
console.log('Config de test puesta: E1 (familia 10/lote 6/compactar 4), E2 (defecto), P1 (compactar 10)')

// 3. Stock de prueba — todos con obs TEST-V29 para limpiar luego
const hoy = new Date().toISOString().slice(0, 10)
const hace = d => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
const stock = [
  { ub: 'E1-02', lote: 'L-1001', cant: 1, fecha: hace(40) },  // lote l-, producto igual, columna 1/3
  { ub: 'E1-02', lote: 'L-1002', cant: 1, fecha: hace(20) },  // → E1-02 queda 2/3
  { ub: 'E1-05', lote: 'L-2001', cant: 1, fecha: hace(5) },
  { ub: 'E2-01', lote: 'L-1001', cant: 1, fecha: hace(30) },  // mismo lote en E2
  { ub: 'E2-01', lote: 'L-1001', cant: 1, fecha: hace(28) },  // → E2-01 queda 2/3
  { ub: 'P1-02', lote: 'L-3001', cant: 1, fecha: hace(3) },   // pared con 1/4
]
for (const s of stock) {
  const res = await fetch(`${BASE}/api/registros`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      fecha: s.fecha, clienteId: '', c1: 'ALMACEN', c2: 'ENTRADA PALET',
      cant: s.cant, obs: 'TEST-V29',
      customData: JSON.stringify({ 'Ubicación': s.ub, 'Lote / Nº Palet': s.lote }),
    })
  })
  if (!res.ok) console.error('  ERROR metiendo', s.ub, await res.text())
}
console.log(`Stock de test: ${stock.length} palets (E1-02 ×2, E1-05, E2-01 ×2, P1-02)`)
console.log('Formulario de prueba → c1=ALMACEN · c2=ENTRADA PALET · Lote=L-1003')
