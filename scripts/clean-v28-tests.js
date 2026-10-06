const login = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
// Borrar registros de test V28 (c1 in FRUTA/VERDURA/BOX/SUELTO de test)
const r = await fetch('http://localhost:3000/api/registros', { headers: { Cookie: sess } })
const data = await r.json()
const tests = data.filter(x => ['FRUTA','VERDURA','BOX','SUELTO'].includes(x.c1))
console.log(`Borrando ${tests.length} registros de test...`)
for (const t of tests) {
  await fetch(`http://localhost:3000/api/registros?id=${t.id}`, { method: 'DELETE', headers: { Cookie: sess } })
}
// Resetear config almacén
await fetch('http://localhost:3000/api/almacen', { method: 'PUT', headers: {'Content-Type':'application/json','Cookie':sess}, body: JSON.stringify({ cfg: [] }) })
console.log('Config de almacén reseteada a []')
