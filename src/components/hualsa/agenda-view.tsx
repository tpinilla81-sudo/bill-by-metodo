'use client'

// V29.79 — AGENDA IA
// El usuario dicta por voz (o teclea) los movimientos del día y el agente IA
// genera una agenda editable de líneas (fecha, cliente, concepto, cantidad).
// Después se pasan a ENTRADAS o a REGISTROS con el batch de /api/registros,
// que autodetecta cliente y precio del catálogo.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mic, MicOff, Sparkles, Trash2, Plus, Send, Loader2, Pencil } from 'lucide-react'
import type { Cliente, CatalogoItem } from '@/lib/hualsa-utils'

type AgendaItem = {
  id: string
  fecha: string
  cliente: string
  clienteId: string
  c1: string
  c2: string
  cant: number
  obs: string
}

const LS_KEY = 'hualsa-agenda-ia-draft'

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Tipos mínimos de la Web Speech API (no están en el DOM lib de TS)
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function AgendaView() {
  const [texto, setTexto] = useState('')
  const [items, setItems] = useState<AgendaItem[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([])
  const [interpretando, setInterpretando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [msg, setMsg] = useState('')
  const [directoRegistros, setDirectoRegistros] = useState(false)
  const [grabando, setGrabando] = useState(false)
  const [soportaVoz, setSoportaVoz] = useState(true)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const textoBaseRef = useRef('')

  // Cargar draft de localStorage + clientes + catálogo
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) setItems(JSON.parse(saved))
    } catch {}
    setSoportaVoz(!!getSpeechRecognition())
    fetch('/api/clientes', { cache: 'no-store' }).then(r => r.json()).then(d => setClientes(d.clientes || d || [])).catch(() => {})
    fetch('/api/catalogo', { cache: 'no-store' }).then(r => r.json()).then(setCatalogo).catch(() => {})
  }, [])

  // Persistir draft
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch {}
  }, [items])

  // ── DICTADO POR VOZ (Web Speech API, es-ES) ──────────────────────────────
  const toggleGrabar = useCallback(() => {
    if (grabando) {
      recRef.current?.stop()
      setGrabando(false)
      return
    }
    const SR = getSpeechRecognition()
    if (!SR) { setSoportaVoz(false); return }
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.continuous = true
    rec.interimResults = true
    textoBaseRef.current = texto ? texto + ' ' : ''
    rec.onresult = (e: any) => {
      let finalTxt = ''
      let interimTxt = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript
        if (e.results[i].isFinal) finalTxt += chunk + ' '
        else interimTxt += chunk
      }
      if (finalTxt) setTexto((textoBaseRef.current + finalTxt).trim())
      else if (interimTxt) setTexto((textoBaseRef.current + interimTxt).trim())
    }
    rec.onerror = (e: any) => {
      setGrabando(false)
      if (e?.error === 'not-allowed') setMsg('⚠ Permiso de micrófono denegado — actívalo en el navegador')
      else if (e?.error !== 'aborted') setMsg('⚠ Error de micrófono: ' + (e?.error || ''))
    }
    rec.onend = () => setGrabando(false)
    recRef.current = rec
    try {
      rec.start()
      setGrabando(true)
      setMsg('')
    } catch {
      setGrabando(false)
      setMsg('⚠ No se pudo iniciar el micrófono')
    }
  }, [grabando, texto])

  // ── INTERPRETAR CON IA ───────────────────────────────────────────────────
  async function handleInterpretar() {
    if (!texto.trim()) { setMsg('Escribe o dicta primero los movimientos'); return }
    setInterpretando(true)
    setMsg('')
    try {
      const res = await fetch('/api/agenda/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, fechaBase: hoyISO() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg('⚠ ' + (data.error || 'Error interpretando'))
        return
      }
      const nuevos: AgendaItem[] = (data.items || []).map((it: any, i: number) => ({
        id: `${Date.now()}-${i}`,
        fecha: it.fecha || hoyISO(),
        cliente: it.cliente || '',
        clienteId: it.clienteId || '',
        c1: it.c1 || '',
        c2: it.c2 || '',
        cant: Number(it.cant) || 1,
        obs: it.obs || '',
      }))
      setItems(prev => [...prev, ...nuevos])
      setMsg(`✓ ${nuevos.length} línea(s) interpretadas — revisa y pasa a registros`)
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    } finally {
      setInterpretando(false)
    }
  }

  // ── PASAR A REGISTROS ────────────────────────────────────────────────────
  async function handlePasar() {
    const incompletas = items.filter(it => !it.fecha || !it.c1 || !it.c2)
    if (incompletas.length > 0) {
      setMsg(`⚠ ${incompletas.length} línea(s) incompletas (falta fecha, concepto o detalle) — complétalas o bórralas`)
      return
    }
    if (items.length === 0) { setMsg('La agenda está vacía'); return }
    setCreando(true)
    setMsg('')
    try {
      const res = await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch: items.map(it => ({
            fecha: it.fecha,
            clienteId: it.clienteId,
            cliente: it.cliente,
            c1: it.c1,
            c2: it.c2,
            cant: Number(it.cant) || 1,
            obs: it.obs,
          })),
          pasadoRegistro: directoRegistros,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg('⚠ ' + (data.error || 'Error creando registros'))
        return
      }
      const n = data.count || items.length
      setMsg(`✓ ${n} registro(s) creado(s)${data.partial ? ' (algunas filas fallaron — mira el detalle)' : directoRegistros ? ' en REGISTROS' : ' en ENTRADAS'} — agenda vaciada`)
      setItems([])
      setTexto('')
    } catch (err: any) {
      setMsg('⚠ Error de conexión: ' + (err?.message || ''))
    } finally {
      setCreando(false)
    }
  }

  // ── EDICIÓN DE FILAS ─────────────────────────────────────────────────────
  function updateItem(id: string, patch: Partial<AgendaItem>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }
  function removeItem(id: string) {
    setItems(prev => prev.filter(it => it.id !== id))
  }
  function addItem() {
    setItems(prev => [...prev, { id: `${Date.now()}-manual`, fecha: hoyISO(), cliente: '', clienteId: '', c1: '', c2: '', cant: 1, obs: '' }])
  }
  function vaciar() {
    if (confirm('¿Vaciar toda la agenda?')) setItems([])
  }

  const c1Options = [...new Set(catalogo.map(x => x.c1).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const c2Options = [...new Set(catalogo.map(x => x.c2).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))

  return (
    <div className="w-full p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Agenda IA</h1>
          <p className="text-sm text-slate-500">Dicta por voz los movimientos y el agente los convierte en líneas de agenda. Revisa y pásalas a registros.</p>
        </div>
        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={vaciar} className="text-red-600 border-red-300 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-1" /> Vaciar agenda
          </Button>
        )}
      </div>

      {/* DICTADO */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={toggleGrabar}
              className={grabando ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : 'bg-[#2bb24c] hover:bg-[#239540] text-white'}
              title={soportaVoz ? (grabando ? 'Parar dictado' : 'Dictar por voz') : 'Tu navegador no soporta dictado'}
            >
              {grabando ? <><MicOff className="h-4 w-4 mr-2" /> Parar dictado…</> : <><Mic className="h-4 w-4 mr-2" /> Dictar por voz</>}
            </Button>
            {grabando && <span className="text-sm text-red-600 font-bold">● Grabando — habla claro, paréntesis entre movimientos</span>}
            {!soportaVoz && <span className="text-xs text-amber-600">Tu navegador no soporta dictado por voz (usa Chrome/Edge) — puedes escribir el texto</span>}
            <Button onClick={handleInterpretar} disabled={interpretando || !texto.trim()} className="bg-[#005bb5] hover:bg-[#003d7a] text-white ml-auto">
              {interpretando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {interpretando ? 'Interpretando…' : 'Interpretar con IA'}
            </Button>
          </div>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder={grabando ? 'Escuchando… el dictado aparece aquí' : 'Ej: «Hoy han entrado 5 palets de VEGAMAYOR, 3 salidas de FLORETTE y mañana 2 palets de SMURFIT entrada palet 10F640»'}
            rows={4}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:border-[#2bb24c] focus:outline-none resize-y"
          />
          <p className="text-xs text-slate-400">Consejo: dicta un movimiento por frase: fecha («hoy», «mañana»), cliente, entrada o salida, producto y cantidad.</p>
        </CardContent>
      </Card>

      {msg && (
        <div className={`text-sm font-bold px-3 py-2 rounded-lg ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{msg}</div>
      )}

      {/* AGENDA EDITABLE */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-bold text-slate-700">Agenda ({items.length} línea{items.length !== 1 ? 's' : ''})</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={directoRegistros} onChange={e => setDirectoRegistros(e.target.checked)} className="h-4 w-4" />
                Directo a REGISTROS (si no, van a ENTRADAS)
              </label>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4 mr-1" /> Añadir línea</Button>
              <Button size="sm" onClick={handlePasar} disabled={creando || items.length === 0} className="bg-[#2bb24c] hover:bg-[#239540] text-white">
                {creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {creando ? 'Creando…' : `Pasar a ${directoRegistros ? 'registros' : 'entradas'}`}
              </Button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">No hay líneas en la agenda. Dicta o escribe arriba y pulsa «Interpretar con IA».</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="p-2 text-left text-xs uppercase font-bold text-slate-500">Fecha</th>
                    <th className="p-2 text-left text-xs uppercase font-bold text-slate-500">Cliente</th>
                    <th className="p-2 text-left text-xs uppercase font-bold text-slate-500">Concepto (c1)</th>
                    <th className="p-2 text-left text-xs uppercase font-bold text-slate-500">Detalle (c2)</th>
                    <th className="p-2 text-right text-xs uppercase font-bold text-slate-500 w-[70px]">Cant.</th>
                    <th className="p-2 text-left text-xs uppercase font-bold text-slate-500">Obs</th>
                    <th className="p-2 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const incompleta = !it.fecha || !it.c1 || !it.c2
                    return (
                      <tr key={it.id} className={`border-b border-gray-200 ${incompleta ? 'bg-amber-50' : ''}`}>
                        <td className="p-1">
                          <Input type="date" value={it.fecha} onChange={e => updateItem(it.id, { fecha: e.target.value })} className="text-xs h-8" />
                        </td>
                        <td className="p-1">
                          <select
                            value={it.clienteId}
                            onChange={e => {
                              const cli = clientes.find(c => c.id === e.target.value)
                              updateItem(it.id, { clienteId: e.target.value, cliente: cli?.nombre || '' })
                            }}
                            className="w-full border border-gray-300 rounded text-xs h-8 px-1 focus:border-[#2bb24c] focus:outline-none"
                          >
                            <option value="">{it.cliente ? it.cliente + ' (no en lista)' : '— elegir cliente —'}</option>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                          </select>
                        </td>
                        <td className="p-1">
                          <select value={it.c1} onChange={e => updateItem(it.id, { c1: e.target.value })} className="w-full border border-gray-300 rounded text-xs h-8 px-1 focus:border-[#2bb24c] focus:outline-none">
                            <option value="">{it.c1 ? it.c1 + ' (no en catálogo)' : '— elegir concepto —'}</option>
                            {c1Options.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="p-1">
                          <select value={it.c2} onChange={e => updateItem(it.id, { c2: e.target.value })} className="w-full border border-gray-300 rounded text-xs h-8 px-1 focus:border-[#2bb24c] focus:outline-none">
                            <option value="">{it.c2 ? it.c2 + ' (no en catálogo)' : '— elegir detalle —'}</option>
                            {c2Options.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="p-1">
                          <Input type="number" min="1" value={it.cant} onChange={e => updateItem(it.id, { cant: Number(e.target.value) || 1 })} className="text-xs h-8 text-right" />
                        </td>
                        <td className="p-1">
                          <Input value={it.obs} onChange={e => updateItem(it.id, { obs: e.target.value })} className="text-xs h-8" placeholder="nota…" />
                        </td>
                        <td className="p-1">
                          <Button size="sm" variant="ghost" onClick={() => removeItem(it.id)} className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" title="Quitar línea">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {items.some(it => !it.fecha || !it.c1 || !it.c2) && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><Pencil className="h-3 w-3" /> Las filas en amarillo están incompletas: elige cliente/concepto/detalle o bórralas antes de pasar a registros.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
