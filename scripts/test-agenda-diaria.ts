// V29.80 — Prueba del agente IA de la AGENDA DIARIA: replica la llamada del
// endpoint /api/agenda-diaria/interpretar con el vocabulario de las capturas
// del "Registro Diario" y valida que el dictado se convierte en líneas con
// tipo/carga/cliente/concepto/cantidad/unidad/importe correctos.
import ZAI from 'z-ai-web-dev-sdk'

const fechaBase = new Date().toISOString().slice(0, 10)

// Vocabulario simulado (como el que tendrá Hualsa tras unos días de uso)
const LISTA_CLIENTES = '- FLORETTE\n- MILCA\n- VEGAMAYOR\n- SMURFIT WESTROCK ESPAÑA SA'
const CLIENTES_AGENDA = '- Florette\n- Milca'
const CONCEPTOS_LOG = '- Hualsa/Milagro\n- Piking Bobinas\n- Carga Palets\n- Doypack\n- Movimiento Palets'
const CONCEPTOS_FAC = '- Milca/Milagro\n- La Boquera/Milca\n- La Balsa/Milca\n- Milagro/envases\n- Villafranca/Milca\n- Villafranca/Milagro\n- Camara Milca/Milagro'

const dictado = process.argv[2] || `Hualsa Milagro 125 euros. Piking bobinas 72 bobinas a 1,20 euros. Carga palets 3 palets a 3 euros. Doypack 2 unidades a 3 euros. Movimiento palets 19 palets a 3 euros. Nueva carga. Hualsa Milagro 125 euros. Piking bobinas 76 bobinas a 1,20. Carga palets 4 palets a 3 euros. Ahora facturación para Florette: Milca Milagro 20 euros, Milca Milagro 70 euros facturar a Vega 4 palets, La Boquera Milca 90 euros dos veces, Villafranca Milagro 180 euros`

const system = `Eres el agente de la AGENDA DIARIA de TRANSPORTES HUALSA. El usuario dicta por voz (o escribe) lo que va haciendo durante el día y TÚ rellenas su agenda.

CONCEPTO DE AGENDA: es un cuaderno diario con dos apartados:
1. LOGÍSTICA: los servicios internos del día, agrupados en CARGAS numeradas (1, 2, 3...). Ejemplo de líneas: "Hualsa/Milagro; 125€", "Piking Bobinas; 86,4€. 72b.", "Carga Palets; 9€. 3p.", "Doypack; 6€. 2p.", "Movimiento Palets; 57€. 19p."
2. FACTURACIÓN: las salidas/entregas a facturar, agrupadas por CLIENTE. Ejemplo de líneas: "Milca/Milagro; 20€", "Milca/Milagro; 70€ Facturar a Vega 4p.", "La Boquera/Milca; 90€", "Villafranca/Milagro; 180€".

Responde SOLO con un array JSON válido. Sin markdown, sin explicaciones, sin \`\`\`.
Cada elemento:
{"tipo":"logistica" o "facturacion","carga":<número o null>,"cliente":"<cliente de facturación EXACTO de las listas, o ''>","concepto":"<texto de la línea>","nota":"<nota breve opcional>","cantidad":<número o 0>,"unidad":"<b|p|u|rollos|... o ''>","importe":<número>}

REGLAS:
1. tipo "logistica": servicios con precio del día (Hualsa/Milagro, Piking Bobinas, Carga Palets, Doypack, Movimiento Palets, viajes...). La carga empieza en 1. Si dice "nueva carga", "otra carga" o "carga 2/3...", las líneas siguientes van en la carga indicada (o +1). Si no se menciona carga, usa null (se añaden a la carga en curso).
2. tipo "facturacion": entregas/salidas a facturar. cliente = a quién se factura (de la LISTA DE CLIENTES o CLIENTES DE AGENDA; corrige errores de dictado al más parecido). concepto = el destino/ruta tal como se dicta, en formato "X/Y" si lo dice así (p.ej. "Milca/Milagro"). Si menciona "facturar a X", X va en nota.
3. IMPORTES: "125 euros" → importe 125, cantidad 0. "72 bobinas a 1,20" → cantidad 72, unidad "b", importe 86.4 (cantidad × precio). "3 palets a 3 euros" → cantidad 3, unidad "p", importe 9. "19 palets, movimiento palets, 57 euros" → cantidad 19, unidad "p", importe 57. Decimales con coma o punto, intérpreta bien (1,20 = 1.20).
4. unidad: b = bobinas, p = palets/piezas, u = unidades; si dice la palabra completa ("rollos") guárdala tal cual. Si no hay cantidad, cantidad 0 y unidad "".
5. CONCEPTO: usa los nombres EXACTOS de las listas de conceptos habituales cuando encajen (corrige errores de dictado al más parecido). Si es nuevo, escríbelo limpio (primera letra mayúscula, sin muletillas).
6. Una línea por servicio/entrega. Si repite cantidades ("dos veces 90 euros") → dos líneas.
7. Todo lo dictado pertenece al día ${fechaBase} (la agenda se navega por día, ignora cualquier otra fecha).
8. Si una frase es ambigua pero se entiende el importe, guárdala con lo que sepas; no inventes importes que no se han dicho.

LISTA DE CLIENTES:
${LISTA_CLIENTES}

CLIENTES DE AGENDA (usados antes):
${CLIENTES_AGENDA}

CONCEPTOS DE LOGÍSTICA HABITUALES:
${CONCEPTOS_LOG}

CONCEPTOS DE FACTURACIÓN HABITUALES:
${CONCEPTOS_FAC}

Dictado a interpretar (puede tener errores de transcripción de voz — interpreta por contexto):`

async function main() {
  console.log('── DICTADO ──')
  console.log(dictado)
  console.log('')
  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: system },
      { role: 'user', content: dictado },
    ],
    thinking: { type: 'disabled' },
  })
  const raw = completion.choices[0]?.message?.content || ''
  console.log('── RESPUESTA RAW ──')
  console.log(raw.slice(0, 800))
  console.log('')
  const m = raw.match(/\[[\s\S]*\]/)
  if (!m) { console.error('ERROR: el LLM no devolvió un array JSON'); process.exit(1) }
  const arr = JSON.parse(m[0])

  // Validaciones esperadas (las de las capturas)
  let ok = true
  function check(cond: boolean, what: string) {
    if (!cond) { ok = false; console.log('  ✗ ' + what) }
    else console.log('  ✓ ' + what)
  }

  console.log('── LÍNEAS INTERPRETADAS ──')
  for (const l of arr) {
    console.log(`  [${l.tipo}${l.tipo === 'logistica' ? ' carga ' + l.carga : ' cliente ' + (l.cliente || '-')}] ${l.concepto}; ${l.importe}€ ${l.cantidad ? `(${l.cantidad}${l.unidad})` : ''} ${l.nota ? '· ' + l.nota : ''}`)
  }

  console.log('')
  console.log('── VALIDACIONES ──')
  const log = arr.filter((x: any) => x.tipo === 'logistica')
  const fac = arr.filter((x: any) => x.tipo === 'facturacion')
  check(log.length >= 8, `logística: ${log.length} líneas (esperadas 8: 5 de carga 1 + 3 de carga 2)`)
  check(fac.length >= 5, `facturación: ${fac.length} líneas (esperadas 5+)`)
  const c1 = log.filter((x: any) => x.carga === 1)
  const c2 = log.filter((x: any) => x.carga === 2)
  check(c1.length >= 5, `carga 1: ${c1.length} líneas`)
  check(c2.length >= 3, `carga 2: ${c2.length} líneas ("nueva carga" separa)`)
  const piking1 = c1.find((x: any) => /piking/i.test(x.concepto || ''))
  check(piking1 && Math.abs(Number(piking1.importe) - 86.4) < 0.01, `Piking carga 1: importe 86,4 (72 × 1,20) → ${piking1?.importe}`)
  const piking2 = c2.find((x: any) => /piking/i.test(x.concepto || ''))
  check(piking2 && Math.abs(Number(piking2.importe) - 91.2) < 0.01, `Piking carga 2: importe 91,2 (76 × 1,20) → ${piking2?.importe}`)
  const totLog = log.reduce((s: number, x: any) => s + Number(x.importe || 0), 0)
  check(Math.abs(totLog - 511.6) < 0.01, `Total Día logística = 511,6€ → ${totLog.toFixed(2)}`)
  const facFlorette = fac.filter((x: any) => /florette/i.test(x.cliente || ''))
  check(facFlorette.length >= 5, `facturación Florette: ${facFlorette.length} líneas`)
  const dosVeces = facFlorette.filter((x: any) => /boquera/i.test(x.concepto || ''))
  check(dosVeces.length === 2, `"La Boquera 90 euros dos veces" → 2 líneas de 90€ → ${dosVeces.length}`)
  const totFac = fac.reduce((s: number, x: any) => s + Number(x.importe || 0), 0)
  check(Math.abs(totFac - 450) < 0.01, `Total facturación = 450€ (20+70+90+90+180) → ${totFac}`)

  console.log('')
  console.log(ok ? 'TODO OK ✓' : 'HAY FALLOS ✗')
  if (!ok) process.exit(1)
}

main().catch(err => { console.error('Error:', err?.message || err); process.exit(1) })
