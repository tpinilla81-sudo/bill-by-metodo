// V29.92 — Test E2E de las novedades OPUS ONE en la AGENDA DIARIA:
//   PRIORIDAD A/B/C en líneas (POST/PUT + normalización) y NOTAS DEL DÍA
//   (GET/PUT /api/agenda-diaria/notas con autosave). Server YA ARRANCADO.
//   bun scripts/test-agenda-opusone.ts
const BASE = 'http://localhost:3000'
const FECHA_TEST = '2026-01-02' // día de prueba, no toca días reales

let cookie = ''
let tenantId = ''

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
  const sc = res.headers.get('set-cookie')
  if (sc) cookie = sc.split(';')[0]
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
  console.log('── LOGIN + TENANT ──')
  const login = await api('POST', '/api/auth/login', { email: 'admin@bill.es', password: 'admin123' })
  check(login.status === 200 || login.json?.user, 'login OK', `status ${login.status}`)
  const ts = await api('GET', '/api/tenants')
  const lista: any[] = ts.json?.tenants || ts.json?.items || ts.json || []
  const hualsa = lista.find((t: any) => /hualsa/i.test(t.name || t.nombre || ''))
  tenantId = hualsa?.id || ''
  check(!!tenantId, 'tenant Hualsa localizado', tenantId)

  console.log('── PRIORIDAD: normalización en POST ──')
  const creadas: string[] = []
  // minúscula con espacio → B2
  const r1 = await api('POST', '/api/agenda-diaria', { fecha: FECHA_TEST, tipo: 'logistica', concepto: 'Test Opus A', importe: 5, prioridad: 'b 2' })
  check(r1.status === 200, 'POST línea con prioridad «b 2» → 200', `status ${r1.status}`)
  check(r1.json?.items?.[0]?.prioridad === 'B2', 'normalizada a B2', r1.json?.items?.[0]?.prioridad)
  creadas.push(r1.json?.items?.[0]?.id)
  // A-1 → A1
  const r2 = await api('POST', '/api/agenda-diaria', { fecha: FECHA_TEST, tipo: 'logistica', concepto: 'Test Opus B', importe: 6, prioridad: 'a-1' })
  check(r2.json?.items?.[0]?.prioridad === 'A1', '«a-1» → A1', r2.json?.items?.[0]?.prioridad)
  creadas.push(r2.json?.items?.[0]?.id)
  // inválida → ''
  const r3 = await api('POST', '/api/agenda-diaria', { fecha: FECHA_TEST, tipo: 'facturacion', cliente: 'Test Cliente', concepto: 'Test Opus C', importe: 7, prioridad: 'X9' })
  check(r3.json?.items?.[0]?.prioridad === '', '«X9» → sin prioridad', JSON.stringify(r3.json?.items?.[0]?.prioridad))
  creadas.push(r3.json?.items?.[0]?.id)

  console.log('── PRIORIDAD: edición en PUT ──')
  const put = await api('PUT', `/api/agenda-diaria/${creadas[2]}`, { prioridad: 'C3' })
  check(put.status === 200 && put.json?.item?.prioridad === 'C3', 'PUT prioridad C3', JSON.stringify(put.json?.item?.prioridad))
  const put2 = await api('PUT', `/api/agenda-diaria/${creadas[2]}`, { prioridad: 'zz' })
  check(put2.json?.item?.prioridad === '', 'PUT prioridad inválida → vacía', JSON.stringify(put2.json?.item?.prioridad))

  console.log('── GET devuelve prioridad ──')
  const get1 = await api('GET', `/api/agenda-diaria?fecha=${FECHA_TEST}`)
  const conP = (get1.json?.items || []).filter((i: any) => i.prioridad)
  check(get1.status === 200 && conP.length >= 2, `GET con prioridades (${conP.map((i: any) => i.prioridad).join(', ')})`)

  console.log('── NOTAS DEL DÍA ──')
  const n0 = await api('GET', `/api/agenda-diaria/notas?fecha=${FECHA_TEST}`)
  check(n0.status === 200 && n0.json?.fecha === FECHA_TEST, 'GET nota 200', JSON.stringify(n0.json).slice(0, 80))
  check((n0.json?.texto || '') === '' || typeof n0.json?.texto === 'string', 'GET nota devuelve texto string')
  const n1 = await api('PUT', '/api/agenda-diaria/notas', { fecha: FECHA_TEST, texto: 'Prueba Opus One: llamar al chapista a las 17:00.' })
  check(n1.status === 200 && n1.json?.ok === true, 'PUT nota 200', `status ${n1.status}`)
  const n2 = await api('GET', `/api/agenda-diaria/notas?fecha=${FECHA_TEST}`)
  check(n2.json?.texto === 'Prueba Opus One: llamar al chapista a las 17:00.', 'GET nota devuelve el texto guardado', JSON.stringify(n2.json?.texto))
  const n3 = await api('PUT', '/api/agenda-diaria/notas', { fecha: FECHA_TEST, texto: 'Segunda versión de la nota (upsert, no duplica).' })
  check(n3.status === 200, 'PUT segunda vez (upsert)')
  const n4 = await api('GET', `/api/agenda-diaria/notas?fecha=${FECHA_TEST}`)
  check(n4.json?.texto === 'Segunda versión de la nota (upsert, no duplica).', 'GET nota actualizada (sin duplicar fila)', JSON.stringify(n4.json?.texto).slice(0, 60))
  const n5 = await api('GET', '/api/agenda-diaria/notas?fecha=fecha-mala')
  check(n5.status === 400, 'GET nota con fecha inválida → 400', `status ${n5.status}`)
  const textoLargo = 'x'.repeat(5000)
  const n6 = await api('PUT', '/api/agenda-diaria/notas', { fecha: FECHA_TEST, texto: textoLargo + 'EXTRA' })
  check(n6.status === 200 && n6.json?.texto?.length === 5000, 'PUT trunca a 5000 caracteres', `len ${n6.json?.texto?.length}`)

  console.log('── CLEANUP ──')
  for (const id of creadas.filter(Boolean)) {
    const d = await api('DELETE', `/api/agenda-diaria/${id}`)
    check(d.status === 200, `DELETE línea ${id.slice(-6)}`)
  }
  const nclean = await api('PUT', '/api/agenda-diaria/notas', { fecha: FECHA_TEST, texto: '' })
  check(nclean.status === 200, 'nota de prueba vaciada')

  console.log(ok ? 'TODO OK ✓' : 'HAY FALLOS ✗')
  process.exit(ok ? 0 : 1)
}

main()
