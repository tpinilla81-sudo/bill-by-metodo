const cookie = 'bill-session=eyJpZCI6ImNtcTZ4a2E2cDAwMDduOXFsZTV6eXd0dTYiLCJlbWFpbCI6InRyYW5zcG9ydGVzaHVhbHNhQGdtYWlsLmNvbSIsIm5hbWUiOiJBbHZhcm8gUGVyZWlyYSIsInJvbGUiOiJhZG1pbiIsInRlbmFudElkIjoiY21xNnV3dWIxMDAwMG45cWx1YWZuaTg4bSIsInBlcm1pc3Npb25zIjoiIiwiZXhwIjoxNzkwMjI3NzIyOTUxfQ.-de0i7nyiSIDYlVx7PF7GWlMqOiiakFUg9xgzas3kMo'
const today = new Date().toISOString().slice(0,10)
async function addEntry(c1, c2, ub, idt) {
  const customData = JSON.stringify({ ubicacion: ub, lote: idt })
  const r = await fetch('http://localhost:3000/api/registros', {
    method:'POST',
    headers:{'Content-Type':'application/json','Cookie':cookie},
    body: JSON.stringify({ type:'entrada', fecha:today, clienteId:'', c1, c2, cant:1, obs:'', customData })
  })
  const j = await r.json()
  console.log(`  ENTRADA ${c1}/${c2} ub=${ub} → ${r.status} ${j.id || j.error || ''}`)
}
(async () => {
  await addEntry('ENTRADA', 'PALET', 'E1-01', 'TEST-A1')
  await addEntry('ENTRADA', 'PALET', 'E1-01', 'TEST-A2')
  await addEntry('ENTRADA', 'PALET', 'E1-07', 'TEST-B1')
  await addEntry('ENTRADA', 'PALET', 'E1-07', 'TEST-B2')
  await addEntry('ENTRADA', 'PALET', 'E1-07', 'TEST-B3')
  await addEntry('ENTRADA', 'PALET', 'P1-02', 'TEST-D1')
})()
