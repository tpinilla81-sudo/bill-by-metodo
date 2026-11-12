// V29.77 — Simulación VEGAMAYOR: verificar que en modo 'simple' las líneas
// NO se agrupan (1 línea por registro) y en 'compacta' sí.
type Registro = { id: string; fecha: string; c1: string; c2: string; cant: number; clienteId: string; obs?: string }

// Datos sintéticos tipo VEGAMAYOR — varios registros el mismo día con el mismo c1+c2
const registros: Registro[] = [
  { id: '1', fecha: '2026-11-10', c1: 'VIAJE NAVE', c2: 'VEGAMAYOR', cant: 1, clienteId: 'cli-vega' },
  { id: '2', fecha: '2026-11-10', c1: 'VIAJE NAVE', c2: 'VEGAMAYOR', cant: 1, clienteId: 'cli-vega' },
  { id: '3', fecha: '2026-11-10', c1: 'VIAJE NAVE', c2: 'VEGAMAYOR', cant: 1, clienteId: 'cli-vega' },
  { id: '4', fecha: '2026-11-10', c1: 'ALMACENAJE', c2: 'PALET', cant: 2, clienteId: 'cli-vega' },
  { id: '5', fecha: '2026-11-11', c1: 'VIAJE NAVE', c2: 'VEGAMAYOR', cant: 1, clienteId: 'cli-vega' },
]

const precioUnit = (c1: string, c2: string) => 50  // simplificado

type Linea = { fecha: string; c1: string; c2: string; cant: number; obs: string; precioUnitario: number }
const lineasBase: Linea[] = registros.map(r => ({ fecha: r.fecha, c1: r.c1, c2: r.c2, cant: r.cant, obs: r.obs || '', precioUnitario: precioUnit(r.c1, r.c2) }))

function simular(modo: 'simple' | 'compacta', fModo: 'dia' | 'mes') {
  let lineas: Linea[]
  if (modo === 'compacta') {
    const map: Record<string, Linea> = {}
    lineasBase.forEach(r => {
      const pu = r.precioUnitario
      const k = r.c1 + '|' + r.c2 + '|' + pu.toFixed(2)
      if (!map[k]) map[k] = { fecha: r.fecha, c1: r.c1, c2: r.c2, cant: 0, obs: '', precioUnitario: pu }
      map[k].cant += r.cant
    })
    lineas = Object.values(map)
  } else {
    lineas = lineasBase.map(r => ({ ...r }))
  }
  console.log(`\n── MODO: ${modo.toUpperCase()} (fModo=${fModo}) — ${lineas.length} líneas ──`)
  lineas.forEach((l, i) => console.log(`  ${i + 1}. ${l.fecha} | ${l.c1} | ${l.c2} | cant=${l.cant} | ${l.precioUnitario.toFixed(2)}€ = ${(l.cant * l.precioUnitario).toFixed(2)}€`))
  return lineas
}

const simple = simular('simple', 'dia')
const compacta = simular('compacta', 'dia')

console.log('\n── VERIFICACIÓN ──')
const simpleOk = simple.length === 5  // 1 línea por registro
const compactaOk = compacta.length === 2  // agrupado: 4 VEGAMAYOR + 1 PALET
console.log(`  ${simpleOk ? '✓' : '✗'} SIMPLE = 5 líneas (1 por registro) → got: ${simple.length}`)
console.log(`  ${compactaOk ? '✓' : '✗'} COMPACTA = 2 líneas (agrupado) → got: ${compacta.length}`)
console.log(`\nRESULTADO: ${simpleOk && compactaOk ? 'TODO OK ✓' : 'FALLOS ✗'}`)
if (!(simpleOk && compactaOk)) process.exit(1)
