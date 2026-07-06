'use client'

import { useEffect, useState } from 'react'

/**
 * /force-update — página especial que fuerza la actualización del navegador.
 *
 * Uso: cuando un cliente dice "no veo los cambios", simplemente dile que visite:
 *   https://bill-by-metodo.vercel.app/force-update
 *   (o la URL de producción + /force-update)
 *
 * Esta página:
 * 1. Limpia localStorage (incluido el build-id guardado)
 * 2. Desregistra cualquier service worker (si los hubiera)
 * 3. Recarga la página raíz con cache-busting (?v=timestamp)
 * 4. El navegador pide HTML nuevo → referencias a chunks nuevos → descarga todo fresh
 */
export default function ForceUpdatePage() {
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)

  function addLog(msg: string) {
    console.log('[force-update]', msg)
    setLog(prev => [...prev, msg])
  }

  useEffect(() => {
    async function run() {
      try {
        addLog('Iniciando actualización forzada...')

        // 1. Limpiar localStorage (todas las claves conocidas)
        addLog('Limpiando localStorage...')
        const keysToClear = [
          'bill-build-id',
          'bill-remember-creds',
          'bill-session',
        ]
        for (const key of keysToClear) {
          try { localStorage.removeItem(key) } catch {}
        }
        // También limpiar cualquier otra clave que empiece por 'bill-'
        const allKeys = Object.keys(localStorage)
        for (const k of allKeys) {
          if (k.startsWith('bill-')) {
            try { localStorage.removeItem(k) } catch {}
          }
        }
        addLog('✓ localStorage limpiado')

        // 2. Desregistrar service workers si existen
        addLog('Buscando service workers...')
        if ('serviceWorker' in navigator) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations()
            if (regs.length > 0) {
              addLog(`Encontrados ${regs.length} service worker(s), desregistrando...`)
              for (const reg of regs) {
                await reg.unregister()
              }
              addLog('✓ Service workers desregistrados')
            } else {
              addLog('✓ No hay service workers')
            }
          } catch (e) {
            addLog('Service worker cleanup skipped: ' + String(e))
          }
        } else {
          addLog('✓ Service workers no soportados en este navegador')
        }

        // 3. Limpiar caches de Cache API si existen
        addLog('Limpiando Cache API...')
        if ('caches' in window) {
          try {
            const cacheNames = await caches.keys()
            if (cacheNames.length > 0) {
              addLog(`Encontrados ${cacheNames.length} caches, eliminando...`)
              await Promise.all(cacheNames.map(name => caches.delete(name)))
              addLog('✓ Caches eliminados')
            } else {
              addLog('✓ No hay caches')
            }
          } catch (e) {
            addLog('Cache cleanup skipped: ' + String(e))
          }
        }

        // 4. Pequeña pausa para que el usuario vea el log
        addLog('✓ Actualización completada. Redirigiendo a la app...')
        await new Promise(r => setTimeout(r, 1200))

        // 5. Redirigir a la raíz con cache-busting
        const ts = Date.now()
        window.location.href = `/?v=${ts}`
      } catch (e) {
        addLog('ERROR: ' + String(e))
        setDone(true)
      }
    }
    run()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1a1a1a',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        background: '#262626',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '8px',
            background: '#2bb24c', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', fontWeight: 'bold',
          }}>B</div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>Actualizando BILL</div>
            <div style={{ fontSize: '12px', color: '#999' }}>No cierres esta página</div>
          </div>
        </div>

        <div style={{
          background: '#1a1a1a',
          borderRadius: '8px',
          padding: '16px',
          fontFamily: 'monospace',
          fontSize: '13px',
          minHeight: '180px',
          maxHeight: '300px',
          overflowY: 'auto',
        }}>
          {log.length === 0 && <div style={{ color: '#666' }}>Iniciando...</div>}
          {log.map((line, i) => (
            <div key={i} style={{
              color: line.startsWith('✓') ? '#2bb24c'
                : line.startsWith('ERROR') ? '#ef4444'
                : '#cccccc',
              marginBottom: '4px',
            }}>
              {line}
            </div>
          ))}
          {!done && log.length > 0 && !log[log.length - 1].includes('Redirigiendo') && (
            <div style={{ color: '#666' }}>▌</div>
          )}
        </div>

        {done && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#7f1d1d',
            borderRadius: '8px',
            color: '#fecaca',
            fontSize: '13px',
          }}>
            Hubo un error. Por favor cierra el navegador, ábrelo de nuevo y entra a la URL normal.
          </div>
        )}
      </div>
    </div>
  )
}
