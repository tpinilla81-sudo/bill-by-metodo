// Inspeccionar los últimos registros para ver qué c1+c2 usa el usuario
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const r = await fetch(`${BASE}/api/registros`, { headers: { Cookie: sess } })
const data = await r.json()
console.log(`Total: ${data.length}`)
console.log(`\nÚltimos 8 registros:`)
for (const x of data.slice(0, 8)) {
  console.log(`  c1=${JSON.stringify(x.c1).padEnd(25)} c2=${JSON.stringify(x.c2).padEnd(20)} obs=${String(x.obs||'').slice(0,30)}`)
  if (x.customData) {
    try {
      const cd = JSON.parse(x.customData)
      console.log(`    customData keys: ${Object.keys(cd).join(', ')}`)
    } catch {}
  }
}
// Verificar c1 distintos
const c1s = [...new Set(data.map(x => x.c1))].sort()
console.log(`\nc1 distintos (${c1s.length}):`)
for (const c of c1s.slice(0, 20)) console.log(`  ${c}`)
