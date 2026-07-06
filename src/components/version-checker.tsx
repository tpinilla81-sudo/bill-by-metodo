'use client'

import { useVersionChecker } from '@/hooks/use-version-checker'

/**
 * Invisible component that activates the version checker.
 * Renders nothing — just runs the polling hook.
 * Place once in the root layout.
 */
export function VersionChecker() {
  useVersionChecker()
  return null
}
