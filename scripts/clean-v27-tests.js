const cookie = 'bill-session=eyJpZCI6ImNtcTZ4a2E2cDAwMDduOXFsZTV6eXd0dTYiLCJlbWFpbCI6InRyYW5zcG9ydGVzaHVhbHNhQGdtYWlsLmNvbSIsIm5hbWUiOiJBbHZhcm8gUGVyZWlyYSIsInJvbGUiOiJhZG1pbiIsInRlbmFudElkIjoiY21xNnV3dWIxMDAwMG45cWx1YWZuaTg4bSIsInBlcm1pc3Npb25zIjoiIiwiZXhwIjoxNzkwMjI3NzIyOTUxfQ.-de0i7nyiSIDYlVx7PF7GWlMqOiiakFUg9xgzas3kMo'
async function clean() {
  const r = await fetch('http://localhost:3000/api/registros', { headers: { Cookie: cookie } })
  const data = await r.json()
  const tests = data.filter(x => x.c1 === 'ENTRADA' && x.c2 === 'PALET' && (x.customData||'').includes('TEST-'))
  console.log(`Found ${tests.length} TEST records to delete`)
  for (const t of tests) {
    await fetch(`http://localhost:3000/api/registros?id=${t.id}`, { method: 'DELETE', headers: { Cookie: cookie } })
    console.log(`  deleted ${t.id}`)
  }
  // Reset almacen config
  await fetch('http://localhost:3000/api/almacen', { method: 'PUT', headers: {'Content-Type':'application/json','Cookie':cookie}, body: JSON.stringify({ cfg: [] }) })
  console.log('Reset almacen config to []')
}
clean()
