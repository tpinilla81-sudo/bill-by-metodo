// V29.2 — limpiar item catálogo TEST
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const r = await fetch(`${BASE}/api/catalogo`, { headers: { Cookie: sess } })
const data = await r.json()
const tests = data.filter(x => x.c1 === 'TESTCAT')
console.log(`Borrando ${tests.length} items de catálogo TEST...`)
for (const t of tests) {
  await fetch(`${BASE}/api/catalogo?id=${t.id}`, { method: 'DELETE', headers: { Cookie: sess } })
}
console.log('Limpieza completa')
