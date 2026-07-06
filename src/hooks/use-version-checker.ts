'use client'

import { useEffect, useRef } from 'react'

/**
 * useVersionChecker
 *
 * Polls /api/version every 2 minutes. If the build ID changes (i.e. a new
 * deploy happened), it forces a hard reload (bypassing cache) so the user
 * always sees the latest version without having to manually clear cache.
 *
 * Works on all browsers including iOS Safari, where aggressive caching
 * can otherwise keep serving stale JS chunks even after no-cache headers.
 *
 * Strategy:
 * - On mount: fetch /api/version, store buildId in localStorage
 * - Every 2 minutes: fetch /api/version, compare with stored buildId
 * - If different: window.location.reload() — the page reloads fresh
 * - Also when the tab regains focus (visibilitychange): check immediately
 *
 * This is the standard pattern used by Gmail, Notion, Slack web, etc.
 */
export function useVersionChecker() {
  const initialBuildIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null

    async function checkVersion() {
      try {
        const res = await fetch('/api/version', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!res.ok) return
        const data = await res.json()
        const newBuildId: string = data.buildId
        if (!newBuildId || newBuildId === 'unknown') return

        const storedKey = 'bill-build-id'
        const storedBuildId = localStorage.getItem(storedKey)

        // First run on this session — record the buildId
        if (!initialBuildIdRef.current) {
          initialBuildIdRef.current = newBuildId
          // If we already have a stored buildId from a previous session
          // and it's different from what we just fetched, it means a new
          // deploy happened while the tab was closed → force reload.
          if (storedBuildId && storedBuildId !== newBuildId) {
            localStorage.setItem(storedKey, newBuildId)
            window.location.reload()
            return
          }
          localStorage.setItem(storedKey, newBuildId)
          return
        }

        // Subsequent checks — if buildId changed since we loaded, reload
        if (initialBuildIdRef.current !== newBuildId) {
          localStorage.setItem(storedKey, newBuildId)
          // Force reload bypassing cache
          window.location.reload()
        }
      } catch (err) {
        // Network error or similar — silent fail, will retry next interval
        // eslint-disable-next-line no-console
        console.debug('Version check failed:', err)
      }
    }

    // Initial check after a short delay (so we don't block initial render)
    const initialTimer = setTimeout(checkVersion, 2000)

    // Poll every 2 minutes
    interval = setInterval(checkVersion, 2 * 60 * 1000)

    // Also check when tab regains focus (user comes back to the app)
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkVersion()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      if (initialTimer) clearTimeout(initialTimer)
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}
