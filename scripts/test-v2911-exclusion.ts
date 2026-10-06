// Simulación V29.11: exclusión de entradas SOLO si están emparejadas con salidas
// de la selección. Replica el flujo de handleGenerar + procesarAlmacenajePalets
// con datos tipo SMURFIT WESTROCK (c1="SMURFIT ENTRADA/SALIDA PALET").
type Reg = { id: string; fecha: string; c1: string; c2: string; cant: number; clienteId: string; customData: string }

function normAlm(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
const isEntradaPalet = (r: Reg) => /entrada palet/.test(normAlm(`${r.c1} ${r.c2}`))
const isSalidaPalet = (r: Reg) => /salida palet/.test(normAlm(`${r.c1} ${r.c2}`))
function extractIdents(r: Reg) {
  const strong: Record<string, string> = {}
  const weak: Record<string, string> = {}
  try {
    const cd = JSON.parse(r.customData || '{}')
    for (const [k, v] of Object.entries(cd)) {
      const nk = normAlm(String(k)); const val = normAlm(String(v ?? ''))
      if (!val) continue
      if (/palet|lote/.test(nk)) strong[nk] = val
      else if (/ubicac/.test(nk)) weak[nk] = val
    }
  } catch {}
  return { strong, weak }
}
function matchIdents(a: ReturnType<typeof extractIdents>, b: ReturnType<typeof extractIdents>): boolean {
  const aS = Object.keys(a.strong).length > 0, bS = Object.keys(b.strong).length > 0
  if (aS || bS) {
    for (const k of Object.keys(a.strong)) if (b.strong[k] && b.strong[k] === a.strong[k]) return true
    return false
  }
  for (const k of Object.keys(a.weak)) if (b.weak[k] && b.weak[k] === a.weak[k]) return true
  return false
}

function procesar(sel: Reg[], all: Reg[], targetCliId: string) {
  const salidas = sel.filter(isSalidaPalet)
  if (!targetCliId || salidas.length === 0) return { entradasUsadas: [] as string[], emparejadas: 0, sinMatch: 0, lineasExtra: 0 }
  const todasEntradas = all.filter(r => isEntradaPalet(r) && r.clienteId === targetCliId).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const usados = new Set<string>()
  let emparejadas = 0, sinMatch = 0, lineasExtra = 0
  for (const s of [...salidas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const si = extractIdents(s)
    let ent = todasEntradas.find(e => !usados.has(e.id) && matchIdents(extractIdents(e), si))
    if (!ent) {
      const restantes = todasEntradas.filter(e => !usados.has(e.id))
      if (restantes.length === 1) ent = restantes[0]
    }
    if (!ent) { sinMatch++; continue }
    usados.add(ent.id)
    emparejadas++
    lineasExtra += 2 // almacenaje + porte
  }
  return { entradasUsadas: [...usados], emparejadas, sinMatch, lineasExtra }
}

function generar(sel: Reg[], all: Reg[], targetCliId: string) {
  const alm = procesar(sel, all, targetCliId)
  const haySalidas = sel.some(isSalidaPalet)
  const excluidas = haySalidas ? sel.filter(r => isEntradaPalet(r) && alm.entradasUsadas.includes(r.id)) : []
  const libres = haySalidas ? sel.filter(r => isEntradaPalet(r) && !alm.entradasUsadas.includes(r.id)) : []
  const excl = new Set(excluidas.map(r => r.id))
  const facturable = haySalidas ? sel.filter(r => !excl.has(r.id)) : sel
  return { nFactura: facturable.length, excluidas: excluidas.length, libres: libres.length, ...alm }
}

const CLI = 'smurfit'
function ent(id: string, fecha: string, lote: string): Reg { return { id, fecha, c1: 'SMURFIT ENTRADA PALET', c2: '10F1027', cant: 1, clienteId: CLI, customData: JSON.stringify({ 'Lote': lote }) } }
function sal(id: string, fecha: string, lote: string): Reg { return { id, fecha, c1: 'SMURFIT SALIDA PALET', c2: '10F1027', cant: 1, clienteId: CLI, customData: JSON.stringify({ 'Lote': lote }) } }

// Escenario 1: 10 entradas octubre (palets aún dentro) + 2 salidas de palets de septiembre
const sept = [ent('e1', '2026-09-03', 'L1'), ent('e2', '2026-09-05', 'L2')]
const octE = Array.from({ length: 10 }, (_, i) => ent(`o${i}`, `2026-10-0${(i % 9) + 1}`, `LO${i}`))
const octS = [sal('s1', '2026-10-20', 'L1'), sal('s2', '2026-10-25', 'L2')]
const all1 = [...sept, ...octE, ...octS]
const sel1 = [...octE, ...octS] // solo octubre seleccionado
const r1 = generar(sel1, all1, CLI)
console.log('E1 (10 entradas oct + 2 salidas de sept):', r1)
console.log('  esperado: factura=12 (10 entradas + 2 salidas) + 4 líneas extra, excluidas=0, libres=10',
  r1.nFactura === 12 && r1.lineasExtra === 4 && r1.excluidas === 0 && r1.libres === 10 ? '✓' : '✗ FALLO')

// Escenario 2: ciclo completo mismo mes — 2 entradas + 2 salidas emparejadas 1:1
const all2 = [ent('c1', '2026-10-01', 'A1'), ent('c2', '2026-10-02', 'A2'), sal('x1', '2026-10-28', 'A1'), sal('x2', '2026-10-29', 'A2')]
const r2 = generar(all2, all2, CLI)
console.log('E2 (2 entradas + 2 salidas mismo mes, ciclo):', r2)
console.log('  esperado: factura=2 (solo salidas) + 4 extra, excluidas=2, libres=0',
  r2.nFactura === 2 && r2.lineasExtra === 4 && r2.excluidas === 2 && r2.libres === 0 ? '✓' : '✗ FALLO')

// Escenario 3: solo entradas seleccionadas (sin salidas) — todo facturable
const sel3 = [...octE]
const r3 = generar(sel3, all1, CLI)
console.log('E3 (solo 10 entradas):', r3)
console.log('  esperado: factura=10, excluidas=0, libres=0, extra=0',
  r3.nFactura === 10 && r3.excluidas === 0 && r3.libres === 0 && r3.lineasExtra === 0 ? '✓' : '✗ FALLO')

// Escenario 4: mezcla — 3 entradas oct de ciclos + 2 entradas sueltas + 3 salidas oct
const e4 = [ent('m1', '2026-10-01', 'M1'), ent('m2', '2026-10-02', 'M2'), ent('m3', '2026-10-03', 'M3'), ent('m4', '2026-10-04', 'M4'), ent('m5', '2026-10-05', 'M5')]
const s4 = [sal('t1', '2026-10-26', 'M1'), sal('t2', '2026-10-27', 'M3')] // M2, M4, M5 siguen dentro
const r4 = generar([...e4, ...s4], [...e4, ...s4], CLI)
console.log('E4 (5 entradas + 2 salidas, 3 palets aún dentro):', r4)
console.log('  esperado: factura=8 (3 entradas + 2 salidas... wait 5-2=3 entradas +2 salidas) + 4 extra, excluidas=2, libres=3',
  r4.nFactura === 5 && r4.lineasExtra === 4 && r4.excluidas === 2 && r4.libres === 3 ? '✓' : '✗ FALLO')
