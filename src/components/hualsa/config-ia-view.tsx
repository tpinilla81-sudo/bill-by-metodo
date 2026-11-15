'use client'

// V29.90 — CONFIG IA: pantalla (solo admin/superadmin) para guardar el JSON de
// configuración del agente IA EN LA BASE DE DATOS de la app (POST /api/config-ia).
// Así el agente se configura desde el móvil sin acceso al panel del hosting.
// Nunca se muestra el valor guardado (contiene la apiKey): solo el estado
// (agenteConfigurado + fuente + modelo) que devuelve el GET del endpoint de
// interpretar.
// V29.91 — plantilla con "model" (la API pública de Z.ai y OpenRouter lo exigen)
// y mini-guía para conseguir la clave desde el móvil.
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Bot, ShieldCheck, ShieldAlert, Trash2, Save } from 'lucide-react'

export function ConfigIaView() {
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<{ agenteConfigurado: boolean; fuente: string; modelo?: string; arreglo?: string } | null>(null)
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargarEstado = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/agenda-diaria/interpretar', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      setEstado(json)
    } catch {
      setEstado(null)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargarEstado() }, [cargarEstado])

  async function guardar() {
    if (!valor.trim()) { setMensaje({ tipo: 'error', texto: 'Pega primero el JSON de configuración.' }); return }
    setGuardando(true)
    setMensaje(null)
    try {
      const res = await fetch('/api/config-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: valor.trim() }),
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.guardado) {
        setMensaje({ tipo: 'ok', texto: 'Configuración guardada en la base de datos. El agente IA ya está disponible.' })
        setValor('')
        await cargarEstado()
      } else {
        setMensaje({ tipo: 'error', texto: json?.error || `Error ${res.status} al guardar` })
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el servidor' })
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!confirm('¿Borrar la configuración del agente IA guardada en la base de datos?')) return
    setGuardando(true)
    setMensaje(null)
    try {
      const res = await fetch('/api/config-ia', { method: 'DELETE' })
      if (res.ok) {
        setMensaje({ tipo: 'ok', texto: 'Configuración borrada. El agente vuelve a la fuente anterior (si la hubiera).' })
        await cargarEstado()
      } else {
        setMensaje({ tipo: 'error', texto: `Error ${res.status} al borrar` })
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el servidor' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-fuchsia-500" />
        <h1 className="text-xl font-bold text-gray-800">CONFIG IA — Agente de la Agenda Diaria</h1>
      </div>

      {/* Estado actual */}
      <Card>
        <CardContent className="p-4">
          {cargando ? (
            <div className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Comprobando…</div>
          ) : (
            <div className="flex items-start gap-2">
              {estado?.agenteConfigurado
                ? <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                : <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className={`font-semibold ${estado?.agenteConfigurado ? 'text-green-700' : 'text-amber-700'}`}>
                  {estado?.agenteConfigurado ? 'Agente IA configurado y operativo' : 'El agente IA NO está configurado en este servidor'}
                </p>
                {estado?.fuente && <p className="text-xs text-gray-500 break-words">Fuente: {estado.fuente}</p>}
                {estado?.agenteConfigurado && estado?.modelo && <p className="text-xs text-gray-500">Modelo: {estado.modelo}</p>}
                {!estado?.agenteConfigurado && estado?.arreglo && <p className="text-xs text-gray-600 mt-1 break-words">{estado.arreglo}</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulario */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-gray-700">
            Pega el <b>JSON de configuración</b> de tu proveedor de IA y se guardará en la base de datos
            de la app (no hace falta tocar el hosting). Formato con clave de la plataforma pública de Z.ai:
          </p>
          <pre className="text-xs bg-gray-900 text-green-300 rounded-lg p-3 overflow-x-auto">{`{
  "baseUrl": "https://api.z.ai/api/paas/v4",
  "apiKey": "TU_CLAVE_DE_API",
  "model": "glm-4.5-flash"
}`}</pre>
          <div className="text-xs text-gray-600 space-y-1">
            <p>¿De dónde sale la clave? Pasos:</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>Entra en <b>z.ai</b> y crea una cuenta (pestaña API).</li>
              <li>En <b>API Keys</b>, crea una clave y cópiala.</li>
              <li>Pégala arriba en <b>apiKey</b> y pulsa Guardar.</li>
            </ol>
            <p>
              <b>model</b>: la API pública exige elegir modelo. <b>glm-4.5-flash</b> es GRATIS y va bien
              para el dictado; también valen glm-4.5-air (barato) o glm-4.6 (más potente).
              Si usas OpenRouter: baseUrl https://openrouter.ai/api/v1 y su modelo (p. ej. z-ai/glm-4.5-air).
            </p>
          </div>
          <textarea
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            rows={6}
            placeholder='{"baseUrl": "https://api.z.ai/api/paas/v4", "apiKey": "...", "model": "glm-4.5-flash"}'
            className="w-full text-xs font-mono rounded-lg border border-gray-300 p-3 focus:border-[#005bb5] focus:outline-none resize-y"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={guardar} disabled={guardando} className="bg-[#2bb24c] hover:bg-[#249642] text-white">
              {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Guardar configuración
            </Button>
            <Button onClick={borrar} disabled={guardando} variant="outline" className="text-red-600 border-red-300 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-1" /> Borrar
            </Button>
          </div>
          {mensaje && (
            <p className={`text-sm ${mensaje.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{mensaje.texto}</p>
          )}
          <p className="text-xs text-gray-500">
            Notas: el JSON se valida antes de guardarse (comillas tipográficas y backticks se corrigen solos).
            La clave nunca se vuelve a mostrar; para cambiarla, guarda una nueva.
            Tras guardar, el estado de arriba debe pasar a verde con Fuente «base de datos de la app (AppConfig)».
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
