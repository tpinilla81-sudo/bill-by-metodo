// Direct test that mimics the production code path
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function test() {
  const tid = 'cmq6uwub10000n9qluafni88m'
  
  console.log('=== Test 1: clienteId as null with empty string fallback ===')
  try {
    const catalogo = await prisma.catalogo.findMany({ 
      where: { tenantId: tid }, 
      select: { c1: true, c2: true, clienteId: true, final: true } 
    })
    console.log('Catalogo entries:', catalogo.length)
    
    // Mimic lookupCliente
    function lookupCliente(catalogo, c1, c2) {
      const item = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId)
      return item?.clienteId || ''
    }
    
    const rows = [
      { fecha: '2026-06-17', clienteId: null, c1: 'MILCA', c2: 'ALQUILER NAVE', cant: 1, obs: 'borrar', customData: '', precioUnitario: 0 }
    ]
    
    const data = rows.map(r => {
      let a = r.clienteId || ''
      if (!a) a = lookupCliente(catalogo, r.c1, r.c2)
      return {
        tenantId: tid,
        fecha: r.fecha,
        clienteId: a || null,
        cliente: '',
        c1: r.c1,
        c2: r.c2,
        cant: Number(r.cant) || 1,
        precioUnitario: r.precioUnitario && r.precioUnitario > 0 ? Number(r.precioUnitario) : 0,
        obs: r.obs || '',
        customData: r.customData || '',
        pasadoRegistro: false
      }
    })
    
    console.log('Data to send to createMany:', JSON.stringify(data, null, 2))
    
    const result = await prisma.registro.createMany({ data })
    console.log('SUCCESS:', result)
  } catch (err) {
    console.error('ERROR:', err.message)
    console.error('FULL:', err)
  } finally {
    await prisma.$disconnect()
  }
}

test()
