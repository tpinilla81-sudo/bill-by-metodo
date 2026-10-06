// Smoke test V29.10: PATCH de ubicación (drag & drop del mapa de STOCK ALMACÉN)
// Crea un registro temporal (Sistema tenant), le cambia la ubicación con PATCH,
// verifica y lo borra. No toca datos reales.
const BASE = 'http://localhost:3000'
async function main() {
  // 1. Login superadmin
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bill.es', password: 'admin123' }),
  })
  if (!login.ok) { console.log('login status:', login.status); process.exit(1) }
  const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  console.log('login OK')

  // 2. Crear registro temporal ENTRADA PALET con ubicación inicial
  const create = await fetch(BASE + '/api/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      fecha: new Date().toISOString().slice(0, 10),
      c1: 'PRUEBA',
      c2: 'ENTRADA PALET',
      cant: 3,
      customData: JSON.stringify({ 'Lote': 'SMOKE-V2910', 'Ubicación': 'E1F1H1' }),
      pasadoRegistro: true,
    }),
  })
  console.log('create status:', create.status)
  if (!create.ok) { console.log(await create.text()); process.exit(1) }
  const reg = await create.json()
  const id = reg.id || reg[0]?.id
  console.log('registro temporal:', id)

  // 3. PATCH a nueva ubicación (formato motor V29.4) — simula el drag & drop
  const patch = await fetch(BASE + '/api/registros', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ id, ubicacion: 'E9F9H9' }),
  })
  console.log('PATCH status:', patch.status)
  if (!patch.ok) { console.log(await patch.text()); process.exit(1) }

  // 4. Verificar customData
  const regs = await (await fetch(BASE + '/api/registros', { headers: { cookie } })).json()
  const ent = regs.find((r: { id: string }) => r.id === id)
  const cd = JSON.parse(ent.customData || '{}')
  const k = Object.keys(cd).find(kk => /ubicac/i.test(kk))
  const ok = k && String(cd[k]) === 'E9F9H9' && cd['Lote'] === 'SMOKE-V2910'
  console.log('tras PATCH →', k, '=', cd[k], '· Lote intacto:', cd['Lote'], ok ? '✓' : '✗ FALLO')

  // 5. Limpiar
  const del = await fetch(BASE + '/api/registros', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ ids: [id] }),
  })
  console.log('delete status:', del.status, del.ok ? '(limpiado)' : '(¡revisar!)')
  process.exit(ok && del.ok ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
