// V29.86 — mini test E2E del endpoint interpretar (para validar el arranque del
// server con Z_AI_CONFIG por variable de entorno). 1 dictado + cleanup.
const BASE = 'http://localhost:3000'
const FECHA_TEST = '2026-01-04'

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
  const login = await api('POST', '/api/auth/login', { email: 'admin@bill.es', password: 'admin123' })
  check(login.status === 200, 'login OK', `status ${login.status}`)

  const ts = await api('GET', '/api/tenants')
  const lista: any[] = ts.json?.tenants || ts.json?.items || ts.json || []
  const hualsa = lista.find((t: any) => /hualsa/i.test(t.name || t.nombre || ''))
  tenantId = hualsa?.id || ''
  check(!!tenantId, 'tenant Hualsa localizado', tenantId)

  const r = await api('POST', '/api/agenda-diaria/interpretar', { texto: 'viaje daroca', fecha: FECHA_TEST })
  check(r.status === 200, 'interpretar 200 con server arrancado con Z_AI_CONFIG', `status ${r.status} ${(r.json?.error || '').slice(0, 100)}`)
  const c = r.json?.items?.[0] || {}
  check(/viaje\s+daroca/i.test(String(c.concepto || '')), 'concepto EXACTO del catálogo', c.concepto)
  check(Math.abs(Number(c.importe) - 585.78) < 1, 'importe = precio catálogo 585,78', c.importe)

  const get = await api('GET', `/api/agenda-diaria?fecha=${FECHA_TEST}`)
  const items: any[] = get.json?.items || []
  let borradas = 0
  for (const it of items) {
    const del = await api('DELETE', `/api/agenda-diaria/${it.id}`)
    if (del.status === 200) borradas++
  }
  check(borradas === items.length, `cleanup ${borradas}/${items.length}`)

  console.log(ok ? 'TODO OK ✓' : 'HAY FALLOS ✗')
  if (!ok) process.exit(1)
}
main().catch(err => { console.error('ERROR:', String(err?.message || err).slice(0, 200)); process.exit(1) })
