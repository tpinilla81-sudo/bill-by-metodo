const cfg = [
  { id:'e1', nombre:'E1', tipo:'estanteria', huecos:12, orientacion:'izq', caps:[3,3,3,3,3,3,3,3,3,3,3,3] },
  { id:'p1', nombre:'P1', tipo:'pared',       huecos:8,  orientacion:'izq', caps:[3,3,3,3,3,3,3,3] }
]
fetch('http://localhost:3000/api/almacen', {
  method:'PUT',
  headers:{'Content-Type':'application/json', 'Cookie':'bill-session=eyJpZCI6ImNtcTZ4a2E2cDAwMDduOXFsZTV6eXd0dTYiLCJlbWFpbCI6InRyYW5zcG9ydGVzaHVhbHNhQGdtYWlsLmNvbSIsIm5hbWUiOiJBbHZhcm8gUGVyZWlyYSIsInJvbGUiOiJhZG1pbiIsInRlbmFudElkIjoiY21xNnV3dWIxMDAwMG45cWx1YWZuaTg4bSIsInBlcm1pc3Npb25zIjoiIiwiZXhwIjoxNzkwMjI3NzIyOTUxfQ.-de0i7nyiSIDYlVx7PF7GWlMqOiiakFUg9xgzas3kMo'},
  body: JSON.stringify({ cfg })
}).then(r => r.json()).then(j => console.log('PUT /api/almacen →', JSON.stringify(j).slice(0,200)))
  .catch(e => console.error('ERR', e))
