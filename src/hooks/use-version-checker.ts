'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * useVersionChecker
 *
 * Polls /api/version. If the build ID changes (i.e. a new deploy happened),
 * it forces a hard reload (bypassing cache) so the user always sees the
 * latest version without having to manually clear cache.
 *
 * Strategy:
 * - On mount: fetch /api/version immediately, store buildId in localStorage
 * - If localStorage had a different buildId from a previous session → force reload
 * - Every 60 seconds: fetch /api/version, compare with stored buildId
 * - If different: window.location.reload() — the page reloads fresh
 * - Also when the tab regains focus (visibilitychange): check immediately
 *
 * This is the standard pattern used by Gmail, Notion, Slack web, etc.
 */
export function useVersionChecker() {
  const initialBuildIdRef = useRef<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    async function checkVersion() {
      try {
        // Cache-busting query string — never use a cached response
        const ts = Date.now()
        const res = await fetch(`/api/version?t=${ts}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
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
            // Hard reload, bypassing cache
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

    // Initial check IMMEDIATELY (no delay) — important for catching deploys
    // that happened while the tab was closed
    checkVersion()

    // Poll every 60 seconds (more aggressive than 2 min — better UX for clients)
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

  return { updateAvailable }
}
