// Inspect DB: clientes, catalog concepts, registros structure
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const clientes = await p.cliente.findMany()
  console.log('=== CLIENTES ===')
  clientes.forEach(c => console.log(`- ${c.nombre} (id=${c.id})`))

  const catalogo = await p.catalogo.findMany({ take: 60 })
  console.log('\n=== CATALOGO (muestra) ===')
  catalogo.forEach(c => console.log(`- c1="${c.c1}" | c2="${c.c2}" | cliente=${c.clienteId || 'GENERAL'} | final=${c.final}`))

  const registros = await p.registro.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
  console.log('\n=== REGISTROS (últimos 20) ===')
  registros.forEach(r => console.log(`- fecha=${r.fecha} | cliente=${r.cliente} | c1="${r.c1}" | c2="${r.c2}" | cant=${r.cant} | customData=${r.customData || '{}'}`))
}

main().then(() => p.$disconnect()).catch(e => { console.error(e.message); process.exit(1) })
