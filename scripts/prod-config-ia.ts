// V29.89/90 — aprovisiona (o borra) la configuración del agente IA en
// PRODUCCIÓN contra la base de datos de la propia app (endpoint /api/config-ia,
// solo admin) y la verifica con el GET de estado + 1 dictado real con cleanup.
//   bun scripts/prod-config-ia.ts [baseUrl] [save|clear]
// Las claves viajan por HTTPS y NUNCA se muestran por pantalla.
const BASE = String(process.argv[2] || 'https://bill-by-metodo.vercel.app').replace(/\/$/, '')
const MODE = String(process.argv[3] || 'save') // 'save' | 'clear'
const EMAIL = process.env.PROD_EMAIL || 'admin@bill.es'
const PASS = process.env.PROD_PASS || 'admin123'
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
  console.log('Producción:', BASE)

  const login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASS })
  check(login.status === 200, 'login en producción OK', `status ${login.status} ${(login.json?.error || '').slice(0, 60)}`)
  if (login.status !== 200) { console.log('HAY FALLOS ✗ (credenciales)'); process.exit(1) }

  const ts = await api('GET', '/api/tenants')
  const lista: any[] = ts.json?.tenants || ts.json?.items || ts.json || []
  const hualsa = lista.find((t: any) => /hualsa/i.test(t.name || t.nombre || ''))
  tenantId = hualsa?.id || ''
  check(!!tenantId, 'tenant Hualsa localizado en producción', tenantId ? 'sí' : 'NO')
  if (!tenantId) { console.log('HAY FALLOS ✗ (tenant)'); process.exit(1) }

  // guardar el config REAL de esta máquina en la BD de producción (modo save)
  if (MODE === 'clear') {
    const del = await api('DELETE', '/api/config-ia')
    check(del.status === 200, 'config borrada de la BD de producción', `status ${del.status}`)
    const stc = await api('GET', '/api/agenda-diaria/interpretar')
    check(stc.json?.agenteConfigurado === false, 'estado honesto: agenteConfigurado=false', stc.json?.fuente)
    console.log(ok ? 'BORRADO OK ✓ — a la espera de una clave pública en CONFIG IA' : 'HAY FALLOS ✗')
    if (!ok) process.exit(1)
    return
  }
  const fsMod = await import('fs')
  const cfgReal = fsMod.readFileSync('/etc/.z-ai-config', 'utf8')
  const save = await api('POST', '/api/config-ia', { valor: cfgReal })
  check(save.status === 200 && save.json?.guardado === true, 'config del agente guardado en la BD de producción', `status ${save.status} ${(save.json?.error || '').slice(0, 80)}`)
  if (save.status !== 200) { console.log('HAY FALLOS ✗ (guardar)'); process.exit(1) }
  const savedTxt = JSON.stringify(save.json || {})
  const cfgVals: string[] = (() => { try { return Object.values(JSON.parse(cfgReal)).map(v => String(v)).filter(v => v.length >= 8) } catch { return [] } })()
  check(cfgVals.every(v => !savedTxt.includes(v)), 'la respuesta no contiene valores secretos')

  // estado: debe leer la configuración desde la BD
  const st = await api('GET', '/api/agenda-diaria/interpretar')
  check(st.json?.agenteConfigurado === true, 'agenteConfigurado=true en producción', st.json?.fuente)
  check(/base de datos/i.test(String(st.json?.fuente || '')), 'fuente = base de datos', st.json?.fuente)

  // dictado real de prueba (fecha pasada, se limpia después)
  const r = await api('POST', '/api/agenda-diaria/interpretar', { texto: 'viaje daroca', fecha: FECHA_TEST })
  check(r.status === 200, 'dictado real en producción 200', `status ${r.status} ${(r.json?.error || '').slice(0, 100)}`)
  const c = r.json?.items?.[0] || {}
  check(/viaje\s+daroca/i.test(String(c.concepto || '')), 'concepto EXACTO del catálogo', c.concepto)
  check(Math.abs(Number(c.importe) - 585.78) < 1, 'importe = precio catálogo 585,78', c.importe)

  // cleanup del dictado de prueba
  const get = await api('GET', `/api/agenda-diaria?fecha=${FECHA_TEST}`)
  const items: any[] = get.json?.items || []
  let borradas = 0
  for (const it of items) {
    const d = await api('DELETE', `/api/agenda-diaria/${it.id}`)
    if (d.status === 200) borradas++
  }
  check(borradas === items.length, `cleanup ${borradas}/${items.length}`)

  console.log(ok ? 'TODO OK ✓ — el agente IA funciona en producción' : 'HAY FALLOS ✗')
  if (!ok) process.exit(1)
}
main().catch(err => { console.error('ERROR:', String(err?.message || err).slice(0, 300)); process.exit(1) })
