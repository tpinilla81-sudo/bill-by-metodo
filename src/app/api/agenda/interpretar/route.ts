import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import ZAI from 'z-ai-web-dev-sdk'

// V29.79 — AGENDA IA
// POST /api/agenda/interpretar
// Recibe un texto (dictado por voz o tecleado) y lo interpreta con el LLM para
// generar una agenda de líneas: { fecha, cliente, c1, c2, cant, obs }.
// El prompt incluye el VOCABULARIO REAL del tenant (clientes y conceptos del
// catálogo) para que el agente reutilice los nombres exactos.

function normStr(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const body = await req.json()
    const texto: string = String(body.texto || '').trim()
    const fechaBase: string = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fechaBase)) ? String(body.fechaBase) : new Date().toISOString().slice(0, 10)

    if (!texto) return NextResponse.json({ error: 'No hay texto para interpretar' }, { status: 400 })

    // Vocabulario real del tenant para que el agente use nombres exactos
    const clientes = await db.cliente.findMany({ where: { tenantId: tid, deletedAt: null }, select: { id: true, nombre: true } })
    const catalogo = await db.catalogo.findMany({ where: { tenantId: tid, deletedAt: null }, select: { c1: true, c2: true, clienteId: true, final: true } })
    const c1Set = [...new Set(catalogo.map(x => x.c1).filter(Boolean))]
    const c2Set = [...new Set(catalogo.map(x => x.c2).filter(Boolean))]

    const listaClientes = clientes.map(c => `- ${c.nombre}`).join('\n')
    const listaC1 = c1Set.map(x => `- ${x}`).join('\n')
    const listaC2 = c2Set.slice(0, 120).map(x => `- ${x}`).join('\n')

    const system = `Eres el agente de agenda de TRANSPORTES HUALSA. El usuario te dicta (por voz o texto) movimientos de almacén: entradas y salidas de palets/mercancía para clientes, con fechas y cantidades.

Tu trabajo: convertir ese dictado en UNA lista JSON de líneas de agenda.

REGLAS:
1. Responde SOLO con un array JSON válido. Sin markdown, sin explicaciones, sin \`\`\`.
2. Cada elemento: {"fecha":"YYYY-MM-DD","cliente":"<nombre EXACTO de la lista de clientes>","c1":"<c1 EXACTO de la lista de conceptos>","c2":"<c2 EXACTO de la lista de detalles>","cant":<número>,"obs":"<nota breve opcional>"}
3. FECHA BASE (hoy) = ${fechaBase}. "hoy"=${fechaBase}, "mañana"=${sumarDias(fechaBase, 1)}, "pasado mañana"=${sumarDias(fechaBase, 2)}. Nombres de día de la semana: calcula la fecha correcta a partir de ${fechaBase}. Si no se menciona fecha, usa ${fechaBase}.
4. CLIENTE: usa el nombre EXACTO de la LISTA DE CLIENTES (corrige errores de dictado al cliente más parecido). Si no hay uno claro, deja "" y explica en obs "cliente a confirmar".
5. CONCEPTO c1: usa uno EXACTO de la LISTA DE CONCEPTOS C1 (p.ej. entradas/salidas de palet, viajes, porte...). Si el usuario dice "entrada" usa el c1 de ENTRADA que mejor encaje; si dice "salida", el de SALIDA. Si no hay uno claro, deja "" y describe en obs.
6. DETALLE c2: usa uno EXACTO de la LISTA DE DETALLES C2 (códigos de producto, tipos de palet...). Si no hay uno claro, deja "" y describe en obs.
7. cant: cantidad numérica (1 si no se menciona). "dos palets" = 2.
8. Una línea por movimiento. Si dice "5 entradas de X" → una línea con cant=5 (NO cinco líneas).
9. obs: breve (máx 60 caracteres). Guarda ahí cualquier matiz: lote, nº palet, persona, matrícula, "a confirmar"...

LISTA DE CLIENTES:
${listaClientes || '(sin clientes)'}

LISTA DE CONCEPTOS C1:
${listaC1 || '(sin conceptos)'}

LISTA DE DETALLES C2:
${listaC2 || '(sin detalles)'}

Dictado a interpretar (puede venir con errores de transcripción de voz — interpreta por contexto):`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: system },
        { role: 'user', content: texto },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = completion.choices[0]?.message?.content || ''
    // Extraer el array JSON (tolera que el LLM envuelva en ```json o texto)
    let arr: any[] = []
    try {
      const m = raw.match(/\[[\s\S]*\]/)
      if (m) arr = JSON.parse(m[0])
    } catch { /* parse fallo → error abajo */ }

    if (!Array.isArray(arr) || arr.length === 0) {
      return NextResponse.json({ error: 'La IA no devolvió líneas interpretables', raw: raw.slice(0, 500) }, { status: 422 })
    }

    // Normalizar + fuzzy match de cliente y concepto (por si el LLM se desvía)
    const items = arr.map((it: any) => {
      const clienteTxt = String(it.cliente || '').trim()
      const cliExact = clientes.find(c => c.nombre === clienteTxt)
      const cliFuzzy = !cliExact && clienteTxt ? clientes.find(c => normStr(c.nombre).includes(normStr(clienteTxt)) || normStr(clienteTxt).includes(normStr(c.nombre))) : undefined
      const c1Txt = String(it.c1 || '').trim()
      const c1Exact = c1Set.find(x => x === c1Txt) || (!c1Txt ? '' : c1Set.find(x => normStr(x) === normStr(c1Txt)) || '')
      const c2Txt = String(it.c2 || '').trim()
      const c2Exact = c2Set.find(x => x === c2Txt) || (!c2Txt ? '' : c2Set.find(x => normStr(x) === normStr(c2Txt)) || '')
      return {
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(it.fecha)) ? String(it.fecha) : fechaBase,
        cliente: cliExact?.nombre || cliFuzzy?.nombre || clienteTxt,
        clienteId: cliExact?.id || cliFuzzy?.id || '',
        c1: c1Exact || c1Txt,
        c2: c2Exact || c2Txt,
        cant: Number(it.cant) || 1,
        obs: String(it.obs || '').slice(0, 120),
      }
    })

    return NextResponse.json({ items, count: items.length })
  } catch (err: any) {
    console.error('Agenda interpretar error:', err)
    return NextResponse.json({ error: 'Error interpretando con IA: ' + (err?.message || 'desconocido') }, { status: 500 })
  }
}
