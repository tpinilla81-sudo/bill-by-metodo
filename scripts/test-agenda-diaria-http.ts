// V29.81 — Test end-to-end HTTP de la AGENDA DIARIA contra el servidor real:
// login → interpretar (fecha de prueba 2026-01-01) → GET → PUT → POST manual →
// DELETE (cleanup). Verifica fuzzy-match con vocabulario REAL de la BD.
const BASE = 'http://localhost:3000'
const FECHA_TEST = '2026-01-01' // sábado pasado, no toca días reales

let cookie = ''
let tenantId = '' // V29.83: operar sobre el tenant de Hualsa (uso real + catálogo)

async function api(method: string, path: string, body?: any) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  let json: any = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

let ok = true
function check(cond: boolean, what: string, extra = '') {
  if (!cond) { ok = false; console.log('  ✗ ' + what + (extra ? ' → ' + extra : '')) }
  else console.log('  ✓ ' + what + (extra ? ' → ' + extra : ''))
}

async function main() {
  // 1. LOGIN
  console.log('── LOGIN ──')
  const login = await api('POST', '/api/auth/login', { email: 'admin@bill.es', password: 'admin123' })
  check(login.status === 200 || login.json?.user, 'login OK', `status ${login.status}`)

  // Tenant de Hualsa (catálogo y vocabulario real)
  const ts = await api('GET', '/api/tenants')
  const lista: any[] = ts.json?.tenants || ts.json?.items || ts.json || []
  const hualsa = lista.find((t: any) => /hualsa/i.test(t.name || t.nombre || ''))
  tenantId = hualsa?.id || ''
  check(!!tenantId, 'tenant Hualsa localizado', tenantId)

  // 2. INTERPRETAR (agente real: vocabulario de BD + LLM + guardado)
  console.log('── INTERPRETAR (endpoint real) ──')
  const texto = 'pikin bobinas 10 bobinas a 1,20 euros. nueva carga. viaje doypack milagro 125 euros'
  const t0 = Date.now()
  const inter = await api('POST', '/api/agenda-diaria/interpretar', { texto, fecha: FECHA_TEST })
  const dt = Date.now() - t0
  check(inter.status === 200, 'POST interpretar 200', `status ${inter.status} ${dt}ms`)
  check(Array.isArray(inter.json?.items) && inter.json.items.length >= 2, `líneas creadas: ${inter.json?.items?.length}`, JSON.stringify(inter.json?.items?.map((i: any) => `${i.tipo}/${i.carga ?? ''} ${i.concepto} ${i.importe}€`)))

  // fuzzy-match: "pikin bobinas" debe corregirse a "Piking Bobinas"
  const piking = (inter.json?.items || []).find((i: any) => /piking/i.test(i.concepto || ''))
  check(!!piking && /piking/i.test(piking.concepto), 'fuzzy-match: "pikin bobinas" → "Piking Bobinas"', piking?.concepto)
  check(piking && Math.abs(Number(piking.importe) - 12) < 0.01, 'importe 10×1,20 = 12', piking?.importe)
  check(piking && Number(piking.carga) === 1, 'primera carga = 1', piking?.carga)
  const lineaHualsa = (inter.json?.items || []).find((i: any) => /doypack/i.test(i.concepto || ''))
  check(lineaHualsa && Number(lineaHualsa.carga) === 2, '"nueva carga" → segunda línea va a carga 2', lineaHualsa?.concepto)

  // 3. GET agenda del día de prueba
  console.log('── GET agenda ──')
  const get1 = await api('GET', `/api/agenda-diaria?fecha=${FECHA_TEST}`)
  check(get1.status === 200, 'GET 200', `status ${get1.status}`)
  const items: any[] = get1.json?.items || []
  check(items.length >= 2, `líneas en agenda: ${items.length}`)
  const totLog = items.filter(i => i.tipo === 'logistica').reduce((s, i) => s + Number(i.importe || 0), 0)
  check(Math.abs(totLog - 137) < 0.01, `Total logística del día = 137€ (12+125)`, totLog)

  // 4. PUT edición (cambiar importe de la primera)
  console.log('── PUT edición ──')
  const first = items[0]
  const put = await api('PUT', `/api/agenda-diaria/${first.id}`, { importe: 15, nota: 'editada por test' })
  check(put.status === 200 && Number(put.json?.item?.importe) === 15, 'PUT cambia importe a 15', put.json?.item?.importe)

  // 5. POST manual (formato plano como la UI): añadir línea facturación sin agente
  console.log('── POST manual ──')
  const post = await api('POST', '/api/agenda-diaria', {
    fecha: FECHA_TEST,
    tipo: 'facturacion',
    cliente: 'FLORETTE',
    concepto: 'Test/Milagro',
    importe: 42,
    cantidad: 0,
    unidad: '',
  })
  check(post.status === 200, 'POST manual 200', `status ${post.status}`)
  const get2 = await api('GET', `/api/agenda-diaria?fecha=${FECHA_TEST}`)
  const items2: any[] = get2.json?.items || []
  const testFac = items2.find(i => /Test\/Milagro/i.test(i.concepto || ''))
  check(!!testFac, 'línea manual visible en agenda')
  const totFac = items2.filter(i => i.tipo === 'facturacion').reduce((s, i) => s + Number(i.importe || 0), 0)
  check(Math.abs(totFac - 42) < 0.01, `Total facturación = 42€`, totFac)

  // 6. DELETE (cleanup: dejar la fecha de prueba vacía)
  console.log('── DELETE cleanup ──')
  let borradas = 0
  for (const it of items2) {
    const del = await api('DELETE', `/api/agenda-diaria/${it.id}`)
    if (del.status === 200) borradas++
  }
  check(borradas === items2.length, `borradas ${borradas}/${items2.length} líneas de prueba`)
  const get3 = await api('GET', `/api/agenda-diaria?fecha=${FECHA_TEST}`)
  const quedan = (get3.json?.items || []).length
  check(quedan === 0, `agenda de prueba vacía tras cleanup`, `${quedan} restantes`)

  console.log('')
  console.log(ok ? 'TODO OK ✓' : 'HAY FALLOS ✗')
  if (!ok) process.exit(1)
}

main().catch(err => { console.error('ERROR:', err?.message || err); process.exit(1) })
