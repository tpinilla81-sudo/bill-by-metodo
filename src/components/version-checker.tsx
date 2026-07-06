'use client'

import { useVersionChecker } from '@/hooks/use-version-checker'

/**
 * VersionChecker
 *
 * Mounts the useVersionChecker hook (which polls /api/version and silently
 * redirects to ?v=NEW_BUILD_ID when a new deploy is detected).
 *
 * ALSO renders a visible banner as a fallback, in case the silent redirect
 * fails (e.g. Safari's bfcache, an extension blocking location.replace,
 * or a pending beforeunload handler). The banner lets the user click to
 * force the redirect — useful for clients who "no saben actualizar".
 *
 * Place once in the root layout.
 */
export function VersionChecker() {
  const { updateAvailable, newBuildId } = useVersionChecker()

  if (!updateAvailable) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: 'linear-gradient(90deg, #16a34a 0%, #15803d 100%)',
        color: 'white',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
      }}
    >
      <span style={{ marginRight: 4 }}>
        Hay una nueva versión disponible.
      </span>
      <button
        type="button"
        onClick={() => {
          const target =
            newBuildId
              ? `${window.location.pathname}?v=${encodeURIComponent(newBuildId)}&t=${Date.now()}${window.location.hash || ''}`
              : `${window.location.pathname}?t=${Date.now()}${window.location.hash || ''}`
          window.location.replace(target)
        }}
        style={{
          background: 'white',
          color: '#15803d',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 14px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      >
        Recargar ahora
      </button>
    </div>
  )
}
