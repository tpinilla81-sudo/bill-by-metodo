// V29.2 — sembrar item catálogo TEST con customData.descripcion
// Para probar que al elegir c1+c2 en ENTRADAS, DESCRIPCION se rellena con la
// descripción del customData del catálogo (no con c2)
const BASE = 'http://localhost:3000'
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'transporteshualsa@gmail.com', password: 'hualsa2024' })
})
const sess = (login.headers.get('set-cookie') || '').split(';')[0]
const H = { 'Content-Type': 'application/json', Cookie: sess }

// Buscar un cliente para asociar (FLORETTE)
const cr = await fetch(`${BASE}/api/clientes`, { headers: { Cookie: sess } })
const clientes = await cr.json()
const flo = clientes.find(c => /FLORETTE/i.test(c.nombre))
console.log(`Cliente FLORETTE: ${flo?.id} (${flo?.nombre})`)

// Crear item TEST-V29.2: c1=TESTCAT, c2=10F1027, customData.descripcion="CAJA ALDI ROMA AUT..."
const r = await fetch(`${BASE}/api/catalogo`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    clienteId: flo?.id || '',
    c1: 'TESTCAT',
    c2: '10F1027',
    coste: 0, inc: 0, final: 0,
    customData: JSON.stringify({
      'DESCRIPCION': 'CAJA ALDI ROMA AUT (B+S) 40X20X21.4 VERDE ESQUINAS TROQUELADAS',
    }),
  })
})
console.log('Create status:', r.status, await r.text())
