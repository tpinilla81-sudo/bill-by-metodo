'use client'

import { useEffect } from 'react'
import { initBackupListeners } from '@/lib/trigger-backup'

// Componente cliente que inicializa los listeners de backup.
// Se monta una sola vez en el root layout.
// No renderiza nada — es solo para ejecutar initBackupListeners en el cliente.
export function BackupListeners() {
  useEffect(() => {
    initBackupListeners()
  }, [])
  return null
}
