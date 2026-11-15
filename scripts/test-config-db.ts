// V29.89 — test E2E: la configuración del agente IA guardada EN LA BASE DE
// DATOS de la app (AppConfig) en vez de variables de entorno del hosting.
// Server YA ARRANCADO sin variables Z_AI_*. Lee el config REAL de esta máquina
// (/etc/.z-ai-config) y lo manda al endpoint — las claves NUNCA se muestran.
//   bun scripts/test-config-db.ts
const BASE = 'http://localhost:3000'
const FECHA_TEST = '2026-01-06'

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
  check(login.status === 200, 'login OK (admin)', `status ${login.status}`)

  const ts = await api('GET', '/api/tenants')
  const lista: any[] = ts.json?.tenants || ts.json?.items || ts.json || []
  const hualsa = lista.find((t: any) => /hualsa/i.test(t.name || t.nombre || ''))
  tenantId = hualsa?.id || ''
  check(!!tenantId, 'tenant Hualsa localizado', tenantId)

  // ── 1. estado ANTES de guardar (local: cae al fichero estándar del SDK) ──
  const st0 = await api('GET', '/api/agenda-diaria/interpretar')
  check(st0.status === 200, 'GET estado 200 antes de guardar', `status ${st0.status}`)
  check(/fichero|OK/.test(String(st0.json?.fuente || '')), 'estado inicial (fichero local)', st0.json?.fuente)

  // ── 2. validaciones del endpoint (sin exponer secretos) ──
  const bad = await api('POST', '/api/config-ia', { valor: 'esto no es json {' })
  check(bad.status === 400 && /NO es JSON/i.test(String(bad.json?.error || '')), 'JSON inválido → 400', String(bad.json?.error || '').slice(0, 60))
  const inc = await api('POST', '/api/config-ia', { valor: JSON.stringify({ baseUrl: 'https://x/v1' }) })
  check(inc.status === 400 && /le falta/i.test(String(inc.json?.error || '')), 'JSON sin apiKey → 400', String(inc.json?.error || '').slice(0, 60))

  // ── 3. guardar el config REAL (leído del fichero de esta máquina) ──
  const fsMod = await import('fs')
  const cfgReal = fsMod.readFileSync('/etc/.z-ai-config', 'utf8')
  const save = await api('POST', '/api/config-ia', { valor: cfgReal })
  check(save.status === 200 && save.json?.guardado === true, 'POST /api/config-ia guarda el config', `status ${save.status}`)
  const savedTxt = JSON.stringify(save.json || {})
  const cfgVals: string[] = (() => { try { return Object.values(JSON.parse(cfgReal)).map(v => String(v)).filter(v => v.length >= 8) } catch { return [] } })()
  check(cfgVals.every(v => !savedTxt.includes(v)), 'la respuesta NO devuelve valores secretos', savedTxt.slice(0, 80))

  // ── 4. el estado ahora sale de la BASE DE DATOS ──
  const st1 = await api('GET', '/api/agenda-diaria/interpretar')
  check(st1.json?.agenteConfigurado === true, 'agenteConfigurado=true tras guardar', st1.json?.fuente)
  check(/base de datos/i.test(String(st1.json?.fuente || '')), 'fuente = base de datos (AppConfig)', st1.json?.fuente)

  // ── 5. dictado REAL usando el config de la BD (sin env vars) ──
  const r = await api('POST', '/api/agenda-diaria/interpretar', { texto: 'viaje daroca', fecha: FECHA_TEST })
  check(r.status === 200, 'interpretar 200 con config de la BD', `status ${r.status} ${(r.json?.error || '').slice(0, 100)}`)
  const c = r.json?.items?.[0] || {}
  check(/viaje\s+daroca/i.test(String(c.concepto || '')), 'concepto EXACTO del catálogo', c.concepto)
  check(Math.abs(Number(c.importe) - 585.78) < 1, 'importe = precio catálogo 585,78', c.importe)

  // ── 6. borrar la config → vuelve la fuente anterior ──
  const del = await api('DELETE', '/api/config-ia')
  check(del.status === 200 && del.json?.borrado === 1, 'DELETE /api/config-ia borra 1 fila', `status ${del.status}`)
  const st2 = await api('GET', '/api/agenda-diaria/interpretar')
  check(/fichero/.test(String(st2.json?.fuente || '')), 'estado vuelve al fichero local tras borrar', st2.json?.fuente)

  // ── cleanup del dictado de prueba ──
  const get = await api('GET', `/api/agenda-diaria?fecha=${FECHA_TEST}`)
  const items: any[] = get.json?.items || []
  let borradas = 0
  for (const it of items) {
    const d = await api('DELETE', `/api/agenda-diaria/${it.id}`)
    if (d.status === 200) borradas++
  }
  check(borradas === items.length, `cleanup ${borradas}/${items.length}`)

  console.log(ok ? 'TODO OK ✓' : 'HAY FALLOS ✗')
  if (!ok) process.exit(1)
}
main().catch(err => { console.error('ERROR:', String(err?.message || err).slice(0, 200)); process.exit(1) })
