import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant-context'
import { getSessionUser } from '@/lib/auth'
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'
import os from 'os'
import path from 'path'

// V29.80 — AGENDA DIARIA: el agente que rellena la agenda desde el dictado.
// POST /api/agenda-diaria/interpretar  Body: { texto, fecha }
//
// El LLM convierte el dictado (voz o texto) en líneas de agenda:
//   { tipo: 'logistica'|'facturacion', carga, cliente, concepto, nota, cantidad, unidad, importe }
// y se GUARDAN directamente en la agenda del día (el agente va rellenándola).
// El prompt incluye el VOCABULARIO REAL del tenant (clientes, conceptos y
// destinos ya usados en la agenda) para reutilizar los nombres exactos y
// corregir errores de transcripción de voz.
// V29.83 — el CATÁLOGO del tenant es la fuente de verdad: el dictado se compara
// con él (nombres exactos, precio estándar y cliente asociado).
// V29.84 — red de seguridad en CÓDIGO: aunque el LLM olvide las reglas 10/11,
// al dictar un concepto del catálogo el código rellena el CLIENTE (facturación
// sin "facturar a X") y el IMPORTE (cantidad dictada × precio por unidad).
// V29.86 — el SDK de IA en producción no encuentra .z-ai-config (ese fichero no
// se sube al hosting): ahora la configuración puede venir por la variable de
// entorno Z_AI_CONFIG (JSON con baseUrl y apiKey) con fallback a los ficheros
// estándar del SDK (proyecto/home//etc) como en el entorno local.
// V29.87 — diagnóstico diferenciado: el 503 distingue si Z_AI_CONFIG no está
// definida, si su contenido no es JSON válido o si le falta baseUrl/apiKey.
// V29.88 — configuración MÁS FÁCIL en el hosting: además de Z_AI_CONFIG (JSON
// COMPLETO del SDK, todas las claves) se aceptan dos variables simples
// Z_AI_BASE_URL + Z_AI_API_KEY (con Z_AI_TOKEN opcional si el gateway exige
// X-Token), menos propensas a errores al pegarlas desde el móvil; se toleran
// comillas tipográficas y backticks al pegar el JSON, y hay un GET que devuelve
// el estado de la configuración (sin secretos) para verificarlo en el navegador
// tras el redeploy.
// V29.91 — soporte de "model" en la config: la API pública de Z.ai
// (api.z.ai/api/paas/v4) y OpenRouter EXIGEN el campo "model" en cada llamada
// y el SDK no lo envía nunca; si la configuración incluye "model", se añade a
// la petición. Sin él (gateway interno del entorno local) todo sigue igual.
// V29.92 — estilo Opus One: el dictado puede traer PRIORIDAD (A1, A2, B1...
// "prioridad A1", "es urgente"); el LLM la extrae y el código la normaliza.
// V29.95 — entrada por IMAGEN (foto de un parte, una hoja escrita, etc.): el POST
// acepta campo "imagen" (base64 con o sin prefijo data:). Si está presente, se
// usa chat.completions.createVision con content multimodal (texto+imagen) en
// lugar del chat normal. Reutiliza TODO el prompt, vocabulario y lógica de
// guardado — el agente lee la imagen y devuelve el mismo array JSON.

function normStr(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// V29.82 — hoy en España (el fallback UTC daba el día anterior de madrugada)
function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

// V29.92 — prioridad estilo Opus One: letra A-C + número. Cualquier otra cosa → ''.
function normPrioridad(v: any): string {
  const m = String(v || '').trim().toUpperCase().match(/^([ABC])\s*-?\s*(\d{1,2})$/)
  return m ? `${m[1]}${m[2]}` : ''
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

// V29.86/87/88 — configuración del SDK del agente IA, por orden de prioridad:
//   1) variable de entorno Z_AI_CONFIG (JSON COMPLETO del SDK)
//   2) V29.89 — tabla AppConfig de la PROPIA BASE DE DATOS (clave 'Z_AI_CONFIG'):
//      permite configurar el agente SIN acceso al panel del hosting, desde la
//      propia aplicación (POST /api/config-ia, solo admin)
//   3) variables simples Z_AI_BASE_URL + Z_AI_API_KEY (+ Z_AI_TOKEN opcional)
//   4) ficheros estándar del SDK (proyecto / home / /etc) — solo entorno local
// Errores diferenciados (prefijos Z_AI_*) para diagnosticar sin revelar nunca
// los valores (contienen la apiKey y el token).
function parseConfigIa(texto: string): any {
  let raw = String(texto || '').trim().replace(/[“”„‟]/g, '"')
  if ((raw.startsWith('`') && raw.endsWith('`')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim()
  }
  raw = raw.replace(/\}\s*[;,]+\s*$/, '}').trim()
  let cfg: any = null
  try {
    cfg = JSON.parse(raw)
  } catch {
    throw new Error('Z_AI_CONFIG_BAD_JSON')
  }
  if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
    throw new Error('Z_AI_CONFIG_INCOMPLETE')
  }
  // pasar el JSON COMPLETO al constructor: el config del SDK puede llevar más
  // claves necesarias (p.ej. token → header X-Token del gateway)
  return cfg
}

async function leerConfigIa(): Promise<{ cfg: any; fuente: string } | null> {
  // 1) variable de entorno
  const envRaw = String(process.env.Z_AI_CONFIG || '').trim()
  if (envRaw) {
    return { cfg: parseConfigIa(envRaw), fuente: 'Z_AI_CONFIG (entorno) — OK' }
  }
  // 2) V29.89 — base de datos de la app (AppConfig, clave 'Z_AI_CONFIG')
  try {
    const row = await db.appConfig.findUnique({ where: { clave: 'Z_AI_CONFIG' } })
    if (row && String(row.valor || '').trim()) {
      return { cfg: parseConfigIa(String(row.valor)), fuente: 'base de datos de la app (AppConfig) — OK' }
    }
  } catch (e: any) {
    // si el CONTENIDO guardado está roto, ese error SÍ se informa; si la tabla
    // aún no existe (deploy antiguo) o la BD no responde, seguir con el resto
    if (/Z_AI_CONFIG_(BAD_JSON|INCOMPLETE)/.test(String(e?.message || ''))) throw e
  }
  // 3) variables simples
  const bu = String(process.env.Z_AI_BASE_URL || '').trim()
  const ak = String(process.env.Z_AI_API_KEY || '').trim()
  if (bu && ak) {
    const token = String(process.env.Z_AI_TOKEN || '').trim()
    const cfg = token ? { baseUrl: bu, apiKey: ak, token } : { baseUrl: bu, apiKey: ak }
    return { cfg, fuente: 'Z_AI_BASE_URL + Z_AI_API_KEY' + (token ? ' + Z_AI_TOKEN' : '') + ' — OK' }
  }
  if (bu || ak) throw new Error('Z_AI_PARTIAL')
  return null
}

async function crearZai(): Promise<{ zai: ZAI; cfg: any | null }> {
  const r = await leerConfigIa()
  if (r) return { zai: new ZAI(r.cfg), cfg: r.cfg }
  // 4) ficheros estándar del SDK (proyecto / home / /etc) — solo entorno local
  return { zai: await ZAI.create(), cfg: null }
}

// V29.88/89 — GET /api/agenda-diaria/interpretar: estado de la configuración del
// agente IA para verificarlo desde el móvil SIN dictar nada. Nunca devuelve la
// apiKey ni el contenido de las variables, solo el origen.
export async function GET(req: Request) {
  const tid = await requireTenantId(req)
  if (typeof tid !== 'string') return tid
  let ok = false
  let fuente = ''
  try {
    const r = await leerConfigIa()
    if (r) { ok = true; fuente = r.fuente }
  } catch (e: any) {
    const m = String(e?.message || '')
    fuente = m.includes('Z_AI_CONFIG_BAD_JSON')
      ? 'Z_AI_CONFIG definida pero su contenido NO es JSON válido'
      : m.includes('Z_AI_CONFIG_INCOMPLETE')
        ? 'Z_AI_CONFIG definida pero le falta "baseUrl" y/o "apiKey"'
        : 'Solo una de las dos está definida: Z_AI_BASE_URL y Z_AI_API_KEY deben ir SIEMPRE juntas'
  }
  if (!ok && !fuente) {
    const rutas = [
      path.join(process.cwd(), '.z-ai-config'),
      path.join(os.homedir(), '.z-ai-config'),
      '/etc/.z-ai-config',
    ]
    const existeFichero = rutas.some(p => { try { return fs.existsSync(p) } catch { return false } })
    if (existeFichero) { ok = true; fuente = 'fichero .z-ai-config (solo sirve en este servidor local, NO en el hosting)' }
    else fuente = 'sin configuración del agente IA'
  }
  // V29.91 — el nombre del modelo NO es secreto y ayuda a verificar la config
  let modelo = ''
  if (ok) {
    try { modelo = String((await leerConfigIa())?.cfg?.model || '').trim() } catch { /* no romper el estado */ }
  }
  return NextResponse.json({
    agenteConfigurado: ok,
    fuente,
    ...(modelo ? { modelo } : {}),
    ...(ok ? {} : { arreglo: 'Guarda el JSON de configuración del SDK en la propia app (POST /api/config-ia como admin, o sección CONFIG IA) — no necesitas tocar el hosting. Alternativa: variables de entorno Z_AI_BASE_URL + Z_AI_API_KEY + Z_AI_TOKEN en el hosting y Redeploy.' }),
  })
}

export async function POST(req: Request) {
  try {
    const tid = await requireTenantId(req)
    if (typeof tid !== 'string') return tid
    const user = await getSessionUser()
    const body = await req.json()
    const texto = String(body.texto || '').trim()
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha)) ? String(body.fecha) : hoyMadrid()

    // V29.95 — imagen (foto) opcional en base64. Puede venir como
    // "data:image/jpeg;base64,...." (URL completa) o solo base64 crudo + mime.
    let imagenUrl = ''
    const imagenRaw = String(body.imagen || '').trim()
    if (imagenRaw) {
      if (imagenRaw.startsWith('data:')) {
        imagenUrl = imagenRaw
      } else {
        const mime = String(body.imagenMime || 'image/jpeg').trim()
        imagenUrl = `data:${mime};base64,${imagenRaw}`
      }
    }

    if (!texto && !imagenUrl) return NextResponse.json({ error: 'No hay texto ni imagen para interpretar' }, { status: 400 })

    // ── Vocabulario real del tenant ──────────────────────────────────────────
    const clientes = await db.cliente.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { id: true, nombre: true },
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

    // ── CATÁLOGO (V29.83): fuente de verdad — conceptos exactos, precio estándar
    //    y cliente asociado. El dictado se COMPARA contra este catálogo.
    const catalogoRaw = await db.catalogo.findMany({
      where: { tenantId: tid, deletedAt: null },
      select: { c1: true, c2: true, final: true, clienteId: true },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    })
    const nombreClienteId = new Map(clientes.map(c => [c.id, c.nombre]))
    const catVistos = new Set<string>()
    const catalogo: { nombre: string; grupo: string; precio: number; cliente: string }[] = []
    for (const c of catalogoRaw) {
      const nombre = String(c.c2 || '').trim().replace(/\s+/g, ' ')
      const key = normStr(nombre)
      if (!nombre || !key || catVistos.has(key)) continue
      catVistos.add(key)
      catalogo.push({
        nombre,
        grupo: String(c.c1 || '').trim().replace(/\s+/g, ' '),
        precio: Number(c.final) || 0,
        cliente: nombreClienteId.get(c.clienteId) || '',
      })
    }
    const catalogoNombres = catalogo.map(c => c.nombre)
    // V29.84 — lookup directo nombre→entrada del catálogo para las redes de seguridad
    const catPorNombre = new Map(catalogo.map(c => [normStr(c.nombre), c]))

    const fmtPrecio = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

    const system = `Eres el agente de la AGENDA DIARIA de TRANSPORTES HUALSA. El usuario dicta por voz (o escribe) lo que va haciendo durante el día y TÚ rellenas su agenda.

CONCEPTO DE AGENDA: es un cuaderno diario con dos apartados:
1. LOGÍSTICA: los servicios internos del día, agrupados en CARGAS numeradas (1, 2, 3...). Ejemplo de líneas: "Hualsa/Milagro; 125€", "Piking Bobinas; 86,4€. 72b.", "Carga Palets; 9€. 3p.", "Doypack; 6€. 2p.", "Movimiento Palets; 57€. 19p."
2. FACTURACIÓN: las salidas/entregas a facturar, agrupadas por CLIENTE. Ejemplo de líneas: "Milca/Milagro; 20€", "Milca/Milagro; 70€ Facturar a Vega 4p.", "La Boquera/Milca; 90€", "Villafranca/Milagro; 180€".

Responde SOLO con un array JSON válido. Sin markdown, sin explicaciones, sin \`\`\`.
Cada elemento:
{"tipo":"logistica" o "facturacion","carga":<número o null>,"cliente":"<cliente de facturación EXACTO de las listas, o ''>","concepto":"<texto de la línea>","nota":"<nota breve opcional>","cantidad":<número o 0>,"unidad":"<b|p|u|rollos|... o ''>","importe":<número>,"prioridad":"<A1|A2|A3|B1|B2|B3|C1|C2|C3 o ''>"}

REGLAS:
1. tipo "logistica": servicios con precio del día (Hualsa/Milagro, Piking Bobinas, Carga Palets, Doypack, Movimiento Palets, viajes...). La carga empieza en 1. Si dice "nueva carga", "otra carga" o "carga 2/3...", las líneas siguientes van en la carga indicada (o +1). Si no se menciona carga, usa null (se añaden a la carga en curso).
2. tipo "facturacion": entregas/salidas a facturar. cliente = a quién se factura (de la LISTA DE CLIENTES o CLIENTES DE AGENDA; corrige errores de dictado al más parecido). concepto = el destino/ruta tal como se dicta, en formato "X/Y" si lo dice así (p.ej. "Milca/Milagro"). Si menciona "facturar a X", X va en nota.
3. IMPORTES: "125 euros" → importe 125, cantidad 0. "72 bobinas a 1,20" → cantidad 72, unidad "b", importe 86.4 (cantidad × precio). "3 palets a 3 euros" → cantidad 3, unidad "p", importe 9. "19 palets, movimiento palets, 57 euros" → cantidad 19, unidad "p", importe 57. Decimales con coma o punto, intérpreta bien (1,20 = 1.20).
4. unidad: b = bobinas, p = palets/piezas, u = unidades; si dice la palabra completa ("rollos") guárdala tal cual. Si no hay cantidad, cantidad 0 y unidad "".
5. CONCEPTO: PRIMERO compara el dictado con el CATÁLOGO DE SERVICIOS (regla 9); si no encaja ninguno, usa los nombres EXACTOS de las listas de conceptos habituales cuando encajen (corrige errores de dictado al más parecido). Si es nuevo, escríbelo limpio (primera letra mayúscula, sin muletillas).
6. Una línea por servicio/entrega. Si repite cantidades ("dos veces 90 euros") → dos líneas.
7. Todo lo dictado pertenece al día ${fecha} (la agenda se navega por día, ignora cualquier otra fecha).
8. Si una frase es ambigua pero se entiende el importe, guárdala con lo que sepas; no inventes importes que no se han dicho (los calculados del catálogo sí valen, ver regla 10).
9. CATÁLOGO (FUENTE DE VERDAD): antes de crear cada línea, COMPÁRALA con el CATÁLOGO DE SERVICIOS de abajo comparando los NOMBRES (servicio/destino), NO los precios. Si corresponde a un concepto del catálogo (aunque el dictado traiga errores de voz o diga el nombre a medias), concepto = el nombre EXACTO del catálogo, tal cual, sin reformarlo. NO elijas una entrada del catálogo solo porque el importe coincida; si ningún nombre encaja, es un concepto nuevo (regla 5).
10. PRECIOS DEL CATÁLOGO: si el servicio está en el catálogo y el usuario NO dice importe, usa el precio del catálogo: si es precio por unidad (palets, bobinas...), importe = cantidad dictada × precio ("descarga rialto 5 palets" con precio 3 → 15, cantidad 5, unidad "p"); si es precio fijo (viajes, alquiler...), úsalo tal cual ("viaje daroca" → su precio exacto). Si el usuario SÍ dice importe, manda el dictado aunque difiera del catálogo.
11. CLIENTE DEL CATÁLOGO: si la entrada del catálogo tiene cliente asociado y es una línea de facturación y el dictado NO dice "facturar a X", usa ese cliente.
12. PRIORIDAD (estilo Opus One): si el dictado menciona una prioridad explícita para una línea ("prioridad A1", "A dos", "es una B1"), pónsela (A1-A3, B1-B3, C1-C3). "urgente" o "muy importante" → A1; "importante" → B1. Si no se menciona nada, prioridad "".

LISTA DE CLIENTES:
${clientesVocab.slice(0, 60).map(c => `- ${c}`).join('\n') || '(sin clientes)'}

CATÁLOGO DE SERVICIOS (FUENTE DE VERDAD — compara cada línea dictada con esta lista POR NOMBRE y usa el nombre EXACTO; [grupo] — precio estándar en € — cliente asociado si lo tiene):
${catalogo.slice(0, 80).map(c => `- ${c.nombre} [${c.grupo || '—'}] — ${fmtPrecio(c.precio)}€${c.cliente ? ` — cliente: ${c.cliente}` : ''}`).join('\n') || '(catálogo vacío)'}

CLIENTES DE AGENDA (usados antes):
${clientesAgenda.slice(0, 60).map(c => `- ${c}`).join('\n') || '(ninguno aún)'}

CONCEPTOS DE LOGÍSTICA HABITUALES:
${conceptosLog.slice(0, 40).map(c => `- ${c}`).join('\n') || '(ninguno aún)'}

CONCEPTOS DE FACTURACIÓN HABITUALES:
${conceptosFac.slice(0, 60).map(c => `- ${c}`).join('\n') || '(ninguno aún)'}

${imagenUrl
  ? `El usuario ha adjuntado una FOTO (parte de trabajo, hoja escrita a mano, albarán, lista de servicios del día...). Lee la imagen con atención y EXTRAe todas las líneas de logística y facturación que veas, aplicando las mismas reglas que con el dictado por voz. Si en la imagen hay texto manuscrito, interprétalo (puede tener letras mal escritas). Si el texto que acompaña aclara algo (cliente, fecha, prioridad), úsalo como contexto. Devuelve SOLO el array JSON con las líneas detectadas.`
  : 'Dictado a interpretar (puede tener errores de transcripción de voz — interpreta por contexto):'}`

    const { zai, cfg } = await crearZai()
    // V29.95 — si hay imagen, asegurarnos de usar un modelo VLM. La config del
    // usuario puede tener "glm-4.5-flash" (solo texto) — al mandar una imagen con
    // ese modelo la API fallaría. Modelos VLM de Z.ai: glm-4.5v, glm-4.6v,
    // glm-4.6v-flash (GRATIS), glm-4.7v... Si el model configurado no es VLM,
    // forzamos glm-4.6v-flash (gratis) automáticamente.
    const modelCfg = String(cfg?.model || '').trim()
    const esVlm = /-?v(-?flash|-?air)?$/i.test(modelCfg) || /vision/i.test(modelCfg)
    const modelFinal = imagenUrl && !esVlm ? 'glm-4.6v-flash' : modelCfg
    let completion: any
    if (imagenUrl) {
      // V29.95 — VLM: la API pública de Z.ai acepta imágenes en el endpoint NORMAL
      // /v4/chat/completions con content de tipo image_url — NO existe
      // /v4/chat/completions/vision (createVision del SDK apunta ahí y falla 404).
      const content: any[] = [{ type: 'text', text: system }]
      if (texto) content.push({ type: 'text', text: texto })
      content.push({ type: 'image_url', image_url: { url: imagenUrl } })
      completion = await zai.chat.completions.create({
        ...(modelFinal ? { model: modelFinal } : {}),
        messages: [
          { role: 'assistant', content: system },
          { role: 'user', content },
        ],
        thinking: { type: 'disabled' },
      })
    } else {
      completion = await zai.chat.completions.create({
        // V29.91 — la API pública exige "model"; el gateway interno usa su default
        ...(modelFinal ? { model: modelFinal } : {}),
        messages: [
          { role: 'assistant', content: system },
          { role: 'user', content: texto },
        ],
        thinking: { type: 'disabled' },
      })
    }

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
    // V29.83 — el catálogo va primero: si el dictado encaja con un concepto del
    // catálogo, el nombre guardado es el EXACTO del catálogo
    const vocabLog = [...new Set([...catalogoNombres, ...conceptosLog])]
    const vocabFac = [...new Set([...catalogoNombres, ...conceptosFac])]

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

      const concepto = tipo === 'logistica' && vocabLog.length > 0 ? fuzzyMatch(conceptoTxt, vocabLog) : (tipo === 'facturacion' && vocabFac.length > 0 ? fuzzyMatch(conceptoTxt, vocabFac) : conceptoTxt)

      const clienteTxt = String(it.cliente || '').trim()
      let clienteMatch = tipo === 'facturacion' ? fuzzyMatch(clienteTxt, vocabClientes) : ''

      // V29.84 — REGLA 11 EN CÓDIGO (red de seguridad): si es facturación, el
      // concepto encaja con una entrada del catálogo y esta tiene cliente asociado,
      // y el dictado NO dijo "facturar a X" (el LLM deja cliente vacío), el cliente
      // se rellena desde el catálogo. Si el dictado SÍ dijo cliente, manda el dictado.
      const catEntry = catPorNombre.get(normStr(concepto))
      if (tipo === 'facturacion' && !clienteTxt && catEntry?.cliente) {
        clienteMatch = catEntry.cliente
      }

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

      // V29.84 — REGLA 10 EN CÓDIGO (red de seguridad): cantidad dictada y el LLM
      // no puso importe → precio por unidad del catálogo × cantidad (el importe
      // dictado siempre manda; este caso solo dispara con importe 0/vacío).
      let importe = Number.isFinite(importeRaw) ? importeRaw : 0
      if (importe <= 0 && cantidadRaw > 0 && catEntry && catEntry.precio > 0) {
        importe = Math.round(cantidadRaw * catEntry.precio * 100) / 100
      }

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
          importe: importe,
          orden: ++maxOrden,
          prioridad: normPrioridad(it.prioridad),
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
    const m = String(err?.message || '')
    // V29.87/88 — mensaje claro y diferenciado según el problema de configuración
    if (/Z_AI_CONFIG_BAD_JSON|Z_AI_CONFIG_INCOMPLETE|Z_AI_PARTIAL|Configuration file not found|\.z-ai-config/i.test(m)) {
      const detalle = m.includes('Z_AI_CONFIG_BAD_JSON')
        ? 'la variable de entorno Z_AI_CONFIG está definida pero su contenido NO es JSON válido (debe ser { "baseUrl": "...", "apiKey": "..." })'
        : m.includes('Z_AI_CONFIG_INCOMPLETE')
          ? 'la variable de entorno Z_AI_CONFIG está definida pero le falta "baseUrl" y/o "apiKey"'
          : m.includes('Z_AI_PARTIAL')
            ? 'están definidas Z_AI_BASE_URL y Z_AI_API_KEY pero falta una de las dos (siempre las dos juntas)'
            : 'no hay configuración del agente IA: en el hosting (Vercel → Settings → Environment Variables, igual que DATABASE_URL) define Z_AI_BASE_URL y Z_AI_API_KEY (opción recomendada), o Z_AI_CONFIG con el JSON { "baseUrl", "apiKey" }'
      return NextResponse.json({ error: 'El agente IA no está disponible en este servidor: ' + detalle + '. Tras definirlas o corregirlas, haz Redeploy.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Error interpretando con IA: ' + (m || 'desconocido') }, { status: 500 })
  }
}
