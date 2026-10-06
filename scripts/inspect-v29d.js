// Inspeccionar registros TEST-V29.3 + estado del stock
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const r = await fetch(`${BASE}/api/registros`, { headers: { Cookie: sess } })
const data = await r.json()
console.log(`Total registros: ${data.length}`)
for (const x of data) {
  if (String(x.obs || '').includes('TEST-V29')) {
    let cd = {}
    try { cd = JSON.parse(x.customData || '{}') } catch {}
    console.log(`  id=${x.id} c1=${x.c1} c2=${x.c2} obs=${x.obs}`)
    console.log(`    customData:`, cd)
  }
}
// Ver el almacén
const r2 = await fetch(`${BASE}/api/almacen`, { headers: { Cookie: sess } })
const cfg = await r2.json()
console.log(`\nConfig almacén: ${cfg.cfg?.length || 0} zonas`)
for (const e of (cfg.cfg || [])) {
  console.log(`  ${e.nombre} tipo=${e.tipo} huecos=${e.huecos} caps=${e.caps?.join(',')}`)
}
