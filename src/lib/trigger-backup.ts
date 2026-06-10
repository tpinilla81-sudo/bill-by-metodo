// Trigger an automatic backup after a data change.
// Uses debounce on the server side (1 min between auto-backups).
// Safe to call from any client component after a successful mutation.

let pendingBackup: ReturnType<typeof setTimeout> | null = null

function getClientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export function triggerBackup(reason: string = 'cambio') {
  // Debounce client-side: wait 3 seconds after the last change before backing up
  // This way rapid multiple saves only create one backup
  if (pendingBackup) clearTimeout(pendingBackup)
  pendingBackup = setTimeout(() => {
    fetch('/api/auto-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, tz: getClientTimezone() }),
    }).catch(() => {})
    pendingBackup = null
  }, 3000)
}
