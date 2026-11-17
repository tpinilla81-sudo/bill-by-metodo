// V29.96 — Config del agente IA compartida por /interpretar y /transcribir.
// Centraliza leerConfigIa() y crearZai() para no duplicar la lógica de fallback
// (env → AppConfig → variables simples → fichero .z-ai-config local).
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { db } from '@/lib/db'

export function parseConfigIa(texto: string): any {
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
  return cfg
}

export async function leerConfigIa(): Promise<{ cfg: any; fuente: string } | null> {
  const envRaw = String(process.env.Z_AI_CONFIG || '').trim()
  if (envRaw) {
    return { cfg: parseConfigIa(envRaw), fuente: 'Z_AI_CONFIG (entorno) — OK' }
  }
  try {
    const row = await db.appConfig.findUnique({ where: { clave: 'Z_AI_CONFIG' } })
    if (row && String(row.valor || '').trim()) {
      return { cfg: parseConfigIa(String(row.valor)), fuente: 'base de datos de la app (AppConfig) — OK' }
    }
  } catch (e: any) {
    if (/Z_AI_CONFIG_(BAD_JSON|INCOMPLETE)/.test(String(e?.message || ''))) throw e
  }
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

export async function crearZai(): Promise<{ zai: ZAI; cfg: any | null }> {
  const r = await leerConfigIa()
  if (r) return { zai: new ZAI(r.cfg), cfg: r.cfg }
  return { zai: await ZAI.create(), cfg: null }
}

// Devuelve true si hay fichero .z-ai-config local (entorno dev) — para el GET estado
export function existeFicheroLocal(): boolean {
  const rutas = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
  return rutas.some(p => { try { return fs.existsSync(p) } catch { return false } })
}
