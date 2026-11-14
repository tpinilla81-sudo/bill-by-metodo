import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'
import ZAI from 'z-ai-web-dev-sdk'

// V29.80 — AGENDA DIARIA: el agente que rellena la agenda desde el dictado.
// POST /api/agenda-diaria/interpretar  Body: { texto, fecha }
//
// El LLM convierte el dictado (voz o texto) en líneas de agenda:
//   { tipo: 'logistica'|'facturacion', carga, cliente, concepto, nota, cantidad, unidad, importe }
// y se GUARDAN directamente en la agenda del día (el agente va rellenándola).
// El prompt incluye el VOCABULARIO REAL del tenant (clientes, conceptos y
// destinos ya usados en la agenda) para reutilizar los nombres exactos y
// corregir errores de transcripción de voz.

function normStr(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// V29.82 — hoy en España (el fallback UTC daba el día anterior de madrugada)
function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function fuzzyMatch(txt: string, vocab: string[]): string {
  const t = normStr(txt)
  if (!t) return ''
  const exact = vocab.find(v => v === txt)
  if (exact) return exact
  const ci = vocab.find(v => normStr(v) === t)
  if (ci) return ci
  const parcial = vocab.find(v => normStr(v).includes(t) || t.includes(normStr(v)))
  if (parcial) return parcial
  // coincidencia por palabras (p.ej. "piking bobina" → "Piking Bobinas")
  const tp = t.split(' ').filter(w => w.length > 2)
  if (tp.length > 0) {
    let mejor = ''
    let mejorPuntos = 0
    for (const v of vocab) {
      const nv = normStr(v)
      const puntos = tp.filter(w => nv.includes(w)).length
      if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = v }
    }
    if (mejorPuntos > 0) return mejor
  }
  return txt
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const user = await getSessionUser()
    const body = await req.json()
    const texto = String(body.texto || '').trim()
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha)) ? String(body.fecha) : hoyMadrid()

    if (!texto) return NextResponse.json({ error: 'No hay texto para interpretar' }, { status: 400 })

    // ── Vocabulario real del tenant ──────────────────────────────────────────
    const clientes = await db.cliente.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { nombre: true },
      orderBy: { nombre: 'asc' },
    })
    const vocabAgenda = await db.agendaDia.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { cliente: true, concepto: true, tipo: true },
      distinct: ['cliente', 'concepto'],
      take: 400,
      orderBy: { createdAt: 'desc' },
    })
    const clientesVocab = clientes.map(c => c.nombre).filter(Boolean)
    const clientesAgenda = [...new Set(vocabAgenda.map(v => v.cliente).filter(Boolean))]
    const conceptosLog = [...new Set(vocabAgenda.filter(v => v.tipo === 'logistica').map(v => v.concepto).filter(Boolean))]
    const conceptosFac = [...new Set(vocabAgenda.filter(v => v.tipo === 'facturacion').map(v => v.concepto).filter(Boolean))]

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
7. Todo lo dictado pertenece al día ${fecha} (la agenda se navega por día, ignora cualquier otra fecha).
8. Si una frase es ambigua pero se entiende el importe, guárdala con lo que sepas; no inventes importes que no se han dicho.

LISTA DE CLIENTES:
${clientesVocab.slice(0, 60).map(c => `- ${c}`).join('\n') || '(sin clientes)'}

CLIENTES DE AGENDA (usados antes):
${clientesAgenda.slice(0, 60).map(c => `- ${c}`).join('\n') || '(ninguno aún)'}

CONCEPTOS DE LOGÍSTICA HABITUALES:
${conceptosLog.slice(0, 40).map(c => `- ${c}`).join('\n') || '(ninguno aún)'}

CONCEPTOS DE FACTURACIÓN HABITUALES:
${conceptosFac.slice(0, 60).map(c => `- ${c}`).join('\n') || '(ninguno aún)'}

Dictado a interpretar (puede tener errores de transcripción de voz — interpreta por contexto):`

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: system },
        { role: 'user', content: texto },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = completion.choices[0]?.message?.content || ''
    let arr: any[] = []
    try {
      const m = raw.match(/\[[\s\S]*\]/)
      if (m) arr = JSON.parse(m[0])
    } catch { /* parse fallo → error abajo */ }

    if (!Array.isArray(arr) || arr.length === 0) {
      return NextResponse.json({ error: 'La IA no devolvió líneas interpretables', raw: raw.slice(0, 500) }, { status: 422 })
    }

    // ── Normalizar + fuzzy match de cliente/concepto ─────────────────────────
    const vocabClientes = [...new Set([...clientesVocab, ...clientesAgenda])]
    const vocabLog = conceptosLog
    const vocabFac = conceptosFac

    // Carga en curso del día (para líneas logística sin carga explícita)
    const existentes = await db.agendaDia.findMany({
      where: { tenantId: tid, fecha, tipo: 'logistica', deletedAt: null },
      select: { carga: true, orden: true },
    })
    let cargaActual = existentes.length > 0 ? Math.max(...existentes.map(x => x.carga)) : 1
    let maxOrden = await db.agendaDia.count({ where: { tenantId: tid, fecha, deletedAt: null } })

    const creadas: any[] = []
    for (const it of arr) {
      const tipo = String(it.tipo || 'logistica') === 'facturacion' ? 'facturacion' : 'logistica'
      const conceptoTxt = String(it.concepto || '').trim().slice(0, 120)
      if (!conceptoTxt) continue

      const clienteTxt = String(it.cliente || '').trim()
      const clienteMatch = tipo === 'facturacion' ? fuzzyMatch(clienteTxt, vocabClientes) : ''

      const concepto = tipo === 'logistica' && vocabLog.length > 0 ? fuzzyMatch(conceptoTxt, vocabLog) : (tipo === 'facturacion' && vocabFac.length > 0 ? fuzzyMatch(conceptoTxt, vocabFac) : conceptoTxt)

      let carga = 0
      if (tipo === 'logistica') {
        const c = Number(it.carga)
        if (Number.isFinite(c) && c >= 1) {
          carga = Math.round(c)
          cargaActual = Math.max(cargaActual, carga)
        } else {
          carga = cargaActual
        }
      }

      const importeRaw = Number(String(it.importe ?? 0).toString().replace(',', '.'))
      const cantidadRaw = Number(String(it.cantidad ?? 0).toString().replace(',', '.'))

      const row = await db.agendaDia.create({
        data: {
          tenantId: tid,
          fecha,
          tipo,
          carga,
          cliente: clienteMatch.slice(0, 80),
          concepto,
          nota: String(it.nota || '').trim().slice(0, 160),
          cantidad: Number.isFinite(cantidadRaw) ? cantidadRaw : 0,
          unidad: String(it.unidad || '').trim().slice(0, 12),
          importe: Number.isFinite(importeRaw) ? importeRaw : 0,
          orden: ++maxOrden,
          creadoPor: user?.id || 'voz',
          viaVoz: true,
        },
      })
      creadas.push(row)
    }

    if (creadas.length === 0) {
      return NextResponse.json({ error: 'La IA no generó líneas con concepto interpretable', raw: raw.slice(0, 500) }, { status: 422 })
    }

    return NextResponse.json({ items: creadas, count: creadas.length })
  } catch (err: any) {
    console.error('Agenda diaria interpretar error:', err)
    return NextResponse.json({ error: 'Error interpretando con IA: ' + (err?.message || 'desconocido') }, { status: 500 })
  }
}
