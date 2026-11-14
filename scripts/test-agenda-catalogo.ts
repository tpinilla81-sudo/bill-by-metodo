// V29.83 — Test del agente con CATÁLOGO como fuente de verdad:
// 1) precio por unidad del catálogo × cantidad dictada (sin importe dictado)
// 2) precio fijo del catálogo (viaje, sin importe dictado)
// 3) nombre EXACTO del catálogo desde un dictado con errores de voz
// Limpieza completa al final (fecha de prueba, no toca días reales).
const BASE = 'http://localhost:3000'
const FECHA_TEST = '2026-01-03' // sábado, no toca días reales

let cookie = ''
let tenantId = '' // V29.83: operar sobre el tenant de Hualsa (donde vive el catálogo)

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

async function interpretar(texto: string): Promise<any[]> {
  const r = await api('POST', '/api/agenda-diaria/interpretar', { texto, fecha: FECHA_TEST })
  check(r.status === 200, `interpretar "${texto}" 200`, `status ${r.status} ${(r.json?.error || '').slice(0, 120)}`)
  return r.json?.items || []
}

async function main() {
  console.log('── LOGIN ──')
  const login = await api('POST', '/api/auth/login', { email: 'admin@bill.es', password: 'admin123' })
  check(login.status === 200, 'login OK', `status ${login.status}`)

  // Localizar el tenant de Hualsa (el catálogo real vive ahí)
  const ts = await api('GET', '/api/tenants')
  const lista: any[] = ts.json?.tenants || ts.json?.items || ts.json || []
  const hualsa = lista.find((t: any) => /hualsa/i.test(t.name || t.nombre || ''))
  tenantId = hualsa?.id || ''
  check(!!tenantId, 'tenant Hualsa localizado', tenantId)

  // Ver catálogo disponible (para contexto en la salida)
  const cat = await api('GET', '/api/catalogo')
  const catItems: any[] = cat.json?.items || cat.json?.data || cat.json?.catalogo || []
  const rialto = catItems.find((c: any) => /rialto/i.test(c.c2 || ''))
  const daroca = catItems.find((c: any) => /daroca/i.test(c.c2 || ''))
  const pikingM = catItems.find((c: any) => /piking\s+bobina\s+milagro/i.test(c.c2 || ''))
  console.log(`  catálogo: ${catItems.length} entradas | rialto=${rialto?.final}€ daroca=${daroca?.final}€ pikingMilagro=${pikingM?.final}€`)

  // 1) PRECIO POR UNIDAD × CANTIDAD (sin importe dictado)
  console.log('── CASO 1: "descarga rialto 5 palets" (catálogo 3€/palet) ──')
  const it1 = await interpretar('descarga rialto 5 palets')
  const c1 = it1[0] || {}
  check(/descarga\s+rialto/i.test(c1.concepto || ''), 'concepto EXACTO del catálogo "DESCARGA RIALTO"', c1.concepto)
  check(Math.abs(Number(c1.importe) - 15) < 0.01, 'importe = 5 × 3 (precio catálogo) = 15', c1.importe)
  check(Number(c1.cantidad) === 5 && String(c1.unidad) === 'p', 'cantidad 5 unidad "p"', `${c1.cantidad}${c1.unidad}`)

  // 2) PRECIO FIJO (viaje sin importe dictado)
  console.log('── CASO 2: "viaje daroca" (catálogo 585,78€) ──')
  const it2 = await interpretar('viaje daroca')
  const c2 = it2[0] || {}
  check(/viaje\s+daroca/i.test(c2.concepto || ''), 'concepto EXACTO del catálogo "VIAJE DAROCA"', c2.concepto)
  check(Math.abs(Number(c2.importe) - 585.78) < 1, 'importe = precio catálogo 585,78', c2.importe)

  // 3) NOMBRE EXACTO DESDE ERRORES DE VOZ (dictado con precio explícito: manda el dictado)
  console.log('── CASO 3: "pikin bobina milagro 10 bobinas a 1,20" (dictado con errores) ──')
  const it3 = await interpretar('pikin bobina milagro 10 bobinas a 1,20 euros')
  const c3 = it3[0] || {}
  check(/piking\s+bobina\s+milagro/i.test(c3.concepto || ''), 'concepto EXACTO del catálogo "PIKING BOBINA MILAGRO"', c3.concepto)
  check(Math.abs(Number(c3.importe) - 12) < 0.01, 'importe dictado manda: 10 × 1,20 = 12', c3.importe)
  check(Number(c3.cantidad) === 10 && String(c3.unidad) === 'b', 'cantidad 10 unidad "b"', `${c3.cantidad}${c3.unidad}`)

  // Limpieza: dejar la fecha de prueba vacía
  console.log('── CLEANUP ──')
  const get = await api('GET', `/api/agenda-diaria?fecha=${FECHA_TEST}`)
  const items: any[] = get.json?.items || []
  let borradas = 0
  for (const it of items) {
    const del = await api('DELETE', `/api/agenda-diaria/${it.id}`)
    if (del.status === 200) borradas++
  }
  check(borradas === items.length, `borradas ${borradas}/${items.length} líneas de prueba`)

  console.log('')
  console.log(ok ? 'TODO OK ✓' : 'HAY FALLOS ✗')
  if (!ok) process.exit(1)
}

main().catch(err => { console.error('ERROR:', err?.message || err); process.exit(1) })
