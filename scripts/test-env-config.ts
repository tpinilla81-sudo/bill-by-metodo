// V29.88 — test E2E de la configuración del agente IA por variables de entorno.
// Se ejecuta contra un server YA ARRANCADO con las variables del caso a probar:
//   bun scripts/test-env-config.ts ok       → server con Z_AI_BASE_URL + Z_AI_API_KEY
//   bun scripts/test-env-config.ts parcial  → server con SOLO Z_AI_BASE_URL
//   bun scripts/test-env-config.ts ok       → también sirve para Z_AI_CONFIG tipográfico
// Comprueba el GET de estado (sin secretos) y el POST de dictado. 1 dictado + cleanup.
const MODE = String(process.argv[2] || 'ok')
const BASE = 'http://localhost:3000'
const FECHA_TEST = '2026-01-05'

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

  // ── GET de estado (V29.88): agenteConfigurado + fuente, SIN secretos ──
  const st = await api('GET', '/api/agenda-diaria/interpretar')
  check(st.status === 200, 'GET estado 200', `status ${st.status}`)
  const stTxt = JSON.stringify(st.json || {})
  // el único secreto real que puede filtrarse es el VALOR de las claves del
  // config de esta máquina: la respuesta NO debe contenerlos (los NOMBRES de
  // variables como Z_AI_API_KEY en el texto de ayuda no son secretos)
  const fsMod = await import('fs')
  let cfgVals: string[] = []
  try {
    const cfg = JSON.parse(fsMod.readFileSync('/etc/.z-ai-config', 'utf8'))
    cfgVals = Object.values(cfg).map(v => String(v)).filter(v => v.length >= 8)
  } catch {}
  const sinSecreto = cfgVals.every(v => !stTxt.includes(v)) && !/sk-[A-Za-z0-9]{10,}/.test(stTxt) && stTxt.length < 800
  check(sinSecreto, 'GET estado NO expone valores secretos', stTxt.slice(0, 120))

  if (MODE === 'parcial') {
    check(st.json?.agenteConfigurado === false, 'GET estado: agenteConfigurado=false con solo una var', st.json?.fuente)
    check(/Solo una de las dos/i.test(String(st.json?.fuente || '')), 'GET estado: fuente detecta el caso parcial', st.json?.fuente)
    const r = await api('POST', '/api/agenda-diaria/interpretar', { texto: 'viaje daroca', fecha: FECHA_TEST })
    check(r.status === 503, 'POST → 503 en caso parcial', `status ${r.status}`)
    check(/falta una de las dos/i.test(String(r.json?.error || '')), '503 con mensaje del caso parcial', String(r.json?.error || '').slice(0, 110))
  } else {
    check(st.json?.agenteConfigurado === true, 'GET estado: agenteConfigurado=true', st.json?.fuente)

    const r = await api('POST', '/api/agenda-diaria/interpretar', { texto: 'viaje daroca', fecha: FECHA_TEST })
    check(r.status === 200, 'interpretar 200 con la nueva configuración por variables', `status ${r.status} ${(r.json?.error || '').slice(0, 100)}`)
    const c = r.json?.items?.[0] || {}
    check(/viaje\s+daroca/i.test(String(c.concepto || '')), 'concepto EXACTO del catálogo', c.concepto)
    check(Math.abs(Number(c.importe) - 585.78) < 1, 'importe = precio catálogo 585,78', c.importe)
  }

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
