// Sistema de backups no destructivo.
//
// MODELO ANTERIOR (problemático):
//   Cada cambio → fetch POST /api/auto-backup con debounce 3s → se llenaba
//   la lista con backups pequeños y los grandes se perdían.
//
// MODELO NUEVO ("nada se borra nunca"):
//   - markDirty(): marca que hay cambios pendientes en memoria. NO lanza backup.
//   - flushBackup(): si hay dirty, lanza un backup con todos los cambios.
//   - Disparadores de flushBackup:
//     * visibilitychange → hidden (cambiar de pestaña / minimizar)
//     * window blur (hacer clic fuera)
//     * idle 5 min (sin teclado/ratón)
//     * pagehide / beforeunload (cerrar pestaña, navegar fuera) → sendBeacon
//     * periódico cada 30 min (red de seguridad)
//   - backUpNow(): backup EXPLÍCITO con reason (manual, antes_de) — siempre se guarda.
//
// La retención es ILIMITADA en el servidor. El usuario es el único que borra.

let dirty = false
let idleTimer: ReturnType<typeof setTimeout> | null = null
let periodicTimer: ReturnType<typeof setInterval> | null = null
let lastFlushAt = 0

const IDLE_MS = 5 * 60 * 1000      // 5 minutos sin actividad
const PERIODIC_MS = 30 * 60 * 1000 // 30 min entre backups periódicos
const MIN_FLUSH_MS = 10 * 1000     // mínimo 10s entre flush (evita spam)

function getClientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

// Marca que hay cambios pendientes. NO lanza backup — se lanzará al irse.
export function markDirty() {
  dirty = true
  resetIdleTimer()
}

// Resetea el timer de inactividad. Se llama en cada markDirty y en cada
// actividad del usuario (mouse/teclado) vía los listeners.
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    // 5 min de inactividad → flushear
    flushBackup('idle')
  }, IDLE_MS)
}

// Lanza un backup si hay cambios pendientes.
// reason puede ser 'cambio' | 'idle' | 'manual' | 'antes_de'
// Si reason es 'manual' o 'antes_de', SIEMPRE se lanza (no requiere dirty).
export async function flushBackup(reason: 'cambio' | 'idle' | 'manual' | 'antes_de' = 'cambio', label?: string) {
  // Evitar spam de flush
  const now = Date.now()
  if (reason !== 'manual' && reason !== 'antes_de') {
    if (!dirty) return
    if (now - lastFlushAt < MIN_FLUSH_MS) return
  }

  const tz = getClientTimezone()
  try {
    await fetch('/api/auto-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, tz, label, dirty }),
    })
    dirty = false
    lastFlushAt = now
  } catch (err) {
    console.error('flushBackup error:', err)
    // No reseteamos dirty — siguiente intento lo capturará
  }
}

// Backup EXPLÍCITO con reason='manual' o 'antes_de' — siempre se guarda,
// no requiere dirty, no se debouncea. Devuelve Promise<void>.
export function backUpNow(reason: 'manual' | 'antes_de' = 'manual', label?: string) {
  return flushBackup(reason, label)
}

// Versión fire-and-forget del backup explícito.
// Útil para llamar antes de operaciones destructivas sin esperar respuesta.
export function triggerBackup(label?: string) {
  // Compat hacia atrás: si pasan un string, lo tratan como label para 'manual'
  // o como 'cambio' si no hay label. Las llamadas existentes `triggerBackup()`
  // siguen funcionando como antes (lanzaban un 'cambio' debounced).
  //
  // Pero como ahora queremos preservar TODOS los cambios, marcamos dirty
  // y dejamos que el flush periódico / al-irse lo capture. Si el usuario
  // quiere un backup EXPLÍCITO ahora, debe llamar backUpNow('manual', label).
  if (label) {
    backUpNow('manual', label)
  } else {
    markDirty()
  }
}

// Inicializa los listeners globales para detectar cuándo el usuario "se va".
// Se llama UNA sola vez desde un componente raíz (layout o page).
let initialized = false
export function initBackupListeners() {
  if (initialized) return
  if (typeof window === 'undefined') return
  initialized = true

  // 1. Cambiar de pestaña / minimizar navegador
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushBackup('cambio')
    }
  })

  // 2. Perder foco de la ventana (clic en otra app)
  window.addEventListener('blur', () => {
    // Pequeño delay para descartar clicks dentro de la misma app
    setTimeout(() => {
      if (!document.hasFocus()) {
        flushBackup('cambio')
      }
    }, 200)
  })

  // 3. Inactividad (5 min sin mouse/teclado)
  const onActivity = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      flushBackup('idle')
    }, IDLE_MS)
  }
  ;['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, onActivity, { passive: true })
  })
  // Arrancar el primer idle timer
  onActivity()

  // 4. Cerrar pestaña / navegar fuera → sendBeacon (que SÍ llega a pesar de cerrar)
  //    pagehide es más fiable que beforeunload en iOS Safari.
  window.addEventListener('pagehide', () => {
    if (!dirty) return
    const tz = getClientTimezone()
    const payload = JSON.stringify({ reason: 'cambio', tz, dirty: true })
    try {
      const blob = new Blob([payload], { type: 'application/json' })
      // sendBeacon NO bloquea la descarga de la página
      navigator.sendBeacon('/api/auto-backup/beacon', blob)
      dirty = false
    } catch (err) {
      console.error('sendBeacon backup error:', err)
    }
  })

  // 5. Backup periódico cada 30 min (red de seguridad)
  periodicTimer = setInterval(() => {
    if (dirty) {
      flushBackup('cambio')
    }
  }, PERIODIC_MS)
}
