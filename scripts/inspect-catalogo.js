// Inspeccionar fieldsCatalogo de la config del usuario (login fresco)
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const r = await fetch(`${BASE}/api/config`, { headers: { Cookie: sess } })
const d = await r.json()
let fc = d.fieldsCatalogo
if (typeof fc === 'string') fc = JSON.parse(fc || '[]')
console.log('=== fieldsCatalogo ===')
for (const f of fc) console.log(`  key=${f.key}  label=${f.label}  isCustom=${f.isCustom}`)
let fe = d.fieldsEntrada
if (typeof fe === 'string') fe = JSON.parse(fe || '[]')
console.log('\n=== fieldsEntrada ===')
for (const f of fe) console.log(`  key=${f.key}  label=${f.label}  isCustom=${f.isCustom}`)

// Y un item del catálogo con c1=ALMACEN para ver su customData
const r2 = await fetch(`${BASE}/api/catalogo`, { headers: { Cookie: sess } })
const cat = await r2.json()
console.log(`\n=== Sample catálogo (${cat.length} items) ===`)
for (const x of cat.slice(0, 3)) {
  let cd = {}
  try { cd = JSON.parse(x.customData || '{}') } catch {}
  console.log(`c1=${x.c1}  c2=${x.c2}  customData keys=${Object.keys(cd).join(',')||'(vacío)'}`)
  for (const [k,v] of Object.entries(cd)) console.log(`  ${k}: ${String(v).slice(0,80)}`)
}
