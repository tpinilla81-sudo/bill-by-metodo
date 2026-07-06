'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * useVersionChecker
 *
 * Polls /api/version every 60 seconds (and on tab focus). If the server's
 * BUILD_ID differs from the one stamped in the currently-loaded HTML
 * (window.__BUILD_ID__), we:
 *
 *   1) Try a SILENT redirect to the same path with ?v=NEW_BUILD_ID
 *      → different URL = browser fetches fresh HTML = fresh JS chunks.
 *      This works for ~95% of cases.
 *
 *   2) Set `updateAvailable = true` so the visible banner can show as
 *      a fallback. If the silent redirect was blocked (e.g. by Safari's
 *      bfcache, an extension, or an unbeforeunload handler), the user
 *      can click "Recargar ahora" to force the redirect.
 *
 * This is more robust than window.location.reload() because Safari on
 * iOS frequently serves the cached HTML on reload() without revalidating.
 * Redirecting to a NEW URL with a different query string forces a true
 * cache miss.
 */
export function useVersionChecker() {
  const initialBuildIdRef = useRef<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [newBuildId, setNewBuildId] = useState<string | null>(null)
  const redirectedRef = useRef(false)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    /**
     * Build the cache-busting redirect URL.
     * Preserves the pathname (multi-tenant routes!) and hash.
     * Replaces the entire query string with just ?v=NEW&t=NOW.
     */
    function buildRedirectUrl(serverBuildId: string): string {
      const newUrl =
        window.location.pathname +
        '?v=' + encodeURIComponent(serverBuildId) +
        '&t=' + Date.now() +
        (window.location.hash || '')
      return newUrl
    }

    /**
     * Try silent redirect. If it doesn't trigger a navigation within
     * ~3 seconds, the banner will already be visible (we set
     * updateAvailable = true synchronously) so the user has a manual
     * fallback.
     */
    function triggerUpdate(serverBuildId: string) {
      if (redirectedRef.current) return // already triggered, don't double-fire
      redirectedRef.current = true
      setUpdateAvailable(true)
      setNewBuildId(serverBuildId)
      try {
        window.location.replace(buildRedirectUrl(serverBuildId))
      } catch (err) {
        console.warn('Silent redirect failed, banner is shown as fallback:', err)
      }
    }

    async function checkVersion() {
      try {
        const ts = Date.now()
        const res = await fetch(`/api/version?t=${ts}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        })
        if (!res.ok) return
        const data = await res.json()
        const serverBuildId: string = data.buildId
        if (!serverBuildId || serverBuildId === 'unknown') return

        // The BUILD_ID stamped into the currently-loaded HTML by layout.tsx
        const currentBuildId =
          (window as unknown as { __BUILD_ID__?: string }).__BUILD_ID__ || null
        if (!currentBuildId || currentBuildId === 'unknown') return

        // First run — record what we have. No redirect yet.
        if (!initialBuildIdRef.current) {
          initialBuildIdRef.current = currentBuildId
          // But if the HTML we loaded has an OLD build stamped in (because
          // the browser served cached HTML), we still need to redirect.
          if (currentBuildId !== serverBuildId) {
            triggerUpdate(serverBuildId)
          }
          return
        }

        // Subsequent checks — if the server's buildId differs from the
        // one stamped in the currently-loaded HTML, redirect.
        if (currentBuildId !== serverBuildId) {
          triggerUpdate(serverBuildId)
        }
      } catch (err) {
        // Network error or similar — silent fail, will retry next interval
        // eslint-disable-next-line no-console
        console.debug('Version check failed:', err)
      }
    }

    // Initial check IMMEDIATELY (no delay)
    checkVersion()

    // Poll every 60 seconds
    interval = setInterval(checkVersion, 60 * 1000)

    // Also check when tab regains focus (user comes back to the app)
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkVersion()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return { updateAvailable, newBuildId }
}
