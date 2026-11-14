// V29.86 — valida las dos rutas de configuración del SDK de IA SIN exponer la apiKey:
// A) variable de entorno Z_AI_CONFIG (JSON) → new ZAI(cfg)
// B) ficheros estándar del SDK (.z-ai-config en proyecto/home//etc) → ZAI.create()
import fs from 'fs'
import ZAI from 'z-ai-web-dev-sdk'

let ok = true
function check(cond: boolean, what: string, extra = '') {
  if (!cond) { ok = false; console.log('  ✗ ' + what + (extra ? ' → ' + extra : '')) }
  else console.log('  ✓ ' + what + (extra ? ' → ' + extra : ''))
}

async function probar(zai: any, etiqueta: string) {
  const r = await zai.chat.completions.create({
    messages: [{ role: 'user', content: 'Responde exactamente: OK' }],
    thinking: { type: 'disabled' },
  })
  const txt = String(r?.choices?.[0]?.message?.content || '')
  check(/ok/i.test(txt), `chat completion via ${etiqueta}`, txt.slice(0, 40))
}

async function main() {
  // A) ruta por variable de entorno (lo que usará producción)
  const raw = fs.readFileSync('/etc/.z-ai-config', 'utf-8') // se lee pero NUNCA se imprime
  const cfg = JSON.parse(raw)
  check(!!cfg.baseUrl && !!cfg.apiKey, 'config leída de /etc/.z-ai-config (baseUrl+apiKey presentes, no se muestra)')
  check(Boolean(String(cfg.baseUrl).includes('://')), 'baseUrl con protocolo')
  const zaiEnv = new ZAI(cfg)
  await probar(zaiEnv, 'Z_AI_CONFIG (new ZAI(cfg))')

  // B) ruta por ficheros (lo que usa el sandbox local)
  const zaiFile = await ZAI.create()
  await probar(zaiFile, 'ficheros (ZAI.create())')

  console.log('')
  console.log(ok ? 'TODO OK ✓' : 'HAY FALLOS ✗')
  if (!ok) process.exit(1)
}
main().catch(err => { console.error('ERROR:', String(err?.message || err).slice(0, 200)); process.exit(1) })
