// V29 — limpieza de datos de test
// 1. Borra registros de ENTRADA PALET con obs=TEST-V29
// 2. Restaura la config del servidor desde scripts/v29-config-backup.json
const BASE = 'http://localhost:3000'
const fs = await import('node:fs')

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const H = { 'Content-Type': 'application/json', Cookie: sess }

// 1. Borrar registros de test V29 (obs=TEST-V29)
const r = await fetch(`${BASE}/api/registros`, { headers: { Cookie: sess } })
const data = await r.json()
const tests = data.filter(x => String(x.obs || '').includes('TEST-V29'))
console.log(`Borrando ${tests.length} registros de test V29...`)
for (const t of tests) {
  await fetch(`${BASE}/api/registros?id=${t.id}`, { method: 'DELETE', headers: { Cookie: sess } })
}

// 2. Restaurar config original
const backup = JSON.parse(fs.readFileSync('scripts/v29-config-backup.json', 'utf8'))
await fetch(`${BASE}/api/almacen`, { method: 'PUT', headers: H, body: JSON.stringify({ cfg: backup }) })
console.log(`Config restaurada: ${backup.length} zona(s)`)
