// V29.1 — limpieza de datos de test
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const r = await fetch(`${BASE}/api/registros`, { headers: { Cookie: sess } })
const data = await r.json()
const tests = data.filter(x => String(x.obs || '').includes('TEST-V29'))
console.log(`Borrando ${tests.length} registros de test V29/V29.1...`)
for (const t of tests) {
  await fetch(`${BASE}/api/registros?id=${t.id}`, { method: 'DELETE', headers: { Cookie: sess } })
}
console.log('Limpieza completa')
