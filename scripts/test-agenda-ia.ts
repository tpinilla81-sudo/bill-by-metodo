// V29.79 — Prueba del agente IA de agenda: replica la llamada del endpoint
// /api/agenda/interpretar y valida que devuelve JSON estructurado.
import ZAI from 'z-ai-web-dev-sdk'

const fechaBase = hoyISO()
function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

const LISTA_CLIENTES = '- FLORETTE HORTICOLA NAVARRA SLU\n- VEGAMAYOR\n- SMURFIT WESTROCK ESPAÑA SA'
const LISTA_C1 = '- SMURFIT ENTRADA PALET\n- SMURFIT SALIDA PALET\n- VEGAMAYOR VIAJE NAVE\n- FLORETTE VIAJE CAMION'
const LISTA_C2 = '- 10F640\n- 10F1027\n- PORTE PALET\n- COSTE DIARIO PALET\n- VEGAMAYOR'

const dictado = process.argv[2] || 'Hoy han entrado 5 palets de Vegamayor por viaje de nave, y mañana salen 3 palets de Smurfit del producto 10F640'

const system = `Eres el agente de agenda de TRANSPORTES HUALSA. El usuario te dicta (por voz o texto) movimientos de almacén: entradas y salidas de palets/mercancía para clientes, con fechas y cantidades.

Tu trabajo: convertir ese dictado en UNA lista JSON de líneas de agenda.

REGLAS:
1. Responde SOLO con un array JSON válido. Sin markdown, sin explicaciones, sin \`\`\`.
2. Cada elemento: {"fecha":"YYYY-MM-DD","cliente":"<nombre EXACTO de la lista de clientes>","c1":"<c1 EXACTO de la lista de conceptos>","c2":"<c2 EXACTO de la lista de detalles>","cant":<número>,"obs":"<nota breve opcional>"}
3. FECHA BASE (hoy) = ${fechaBase}. "hoy"=${fechaBase}, "mañana"=${sumarDias(fechaBase, 1)}. Si no se menciona fecha, usa ${fechaBase}.
4. CLIENTE: usa el nombre EXACTO de la LISTA DE CLIENTES (corrige errores de dictado al cliente más parecido). Si no hay uno claro, deja "" y explica en obs "cliente a confirmar".
5. CONCEPTO c1: usa uno EXACTO de la LISTA DE CONCEPTOS C1. Si el usuario dice "entrada" usa el c1 de ENTRADA que mejor encaje; si dice "salida", el de SALIDA.
6. DETALLE c2: usa uno EXACTO de la LISTA DE DETALLES C2. Si no hay uno claro, deja "" y describe en obs.
7. cant: cantidad numérica (1 si no se menciona).
8. Una línea por movimiento. Si dice "5 entradas de X" → una línea con cant=5 (NO cinco líneas).

LISTA DE CLIENTES:
${LISTA_CLIENTES}

LISTA DE CONCEPTOS C1:
${LISTA_C1}

LISTA DE DETALLES C2:
${LISTA_C2}

Dictado a interpretar:`

async function main() {
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
  console.log(raw.slice(0, 600))
  const m = raw.match(/\[[\s\S]*\]/)
  let arr: any[] = []
  try { if (m) arr = JSON.parse(m[0]) } catch {}
  console.log('\n── LÍNEAS PARSEADAS ──')
  for (const it of arr) {
    console.log(`  ${it.fecha} | ${it.cliente} | ${it.c1} | ${it.c2} | cant=${it.cant} | obs=${it.obs}`)
  }
  console.log(`\nRESULTADO: ${arr.length > 0 ? 'TODO OK ✓ (' + arr.length + ' líneas)' : 'FALLO ✗'}`)
  if (arr.length === 0) process.exit(1)
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
