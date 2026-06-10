'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Upload, Trash2, Database, Clock, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { useConfig } from '@/lib/config'

interface SavedBackup {
  filename: string
  date: string
  type: string
  url: string
}

export function BackupView() {
  const { config } = useConfig()
  const [status, setStatus] = useState('')
  const [backups, setBackups] = useState<SavedBackup[]>([])
  const [loadingBackups, setLoadingBackups] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true)
    try {
      const res = await fetch('/api/auto-backup')
      const data = await res.json()
      setBackups(data.backups || [])
    } catch {
      setBackups([])
    }
    setLoadingBackups(false)
  }, [])

  useEffect(() => {
    loadBackups()
  }, [loadBackups])

  // Manual export (download JSON)
  async function handleExport() {
    if (!confirm('¿Descargar copia de seguridad completa (JSON)?')) return
    try {
      const res = await fetch('/api/backup')
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const localDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      a.download = `${(config?.appName || 'BILL').toLowerCase()}_backup_${localDate}.json`
      a.click()
      setStatus('Exportado correctamente')
    } catch (err) {
      setStatus('Error exportando: ' + String(err))
    }
  }

  // Manual import (upload JSON file)
  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Esto REEMPLAZARÁ todos los datos actuales. ¿Continuar?')) return
      if (!confirm('Confirmación final: ¿seguro que quieres importar y sobrescribir?')) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        setStatus(`Importado: ${data.registros?.length || 0} reg · ${data.clientes?.length || 0} cli · ${data.catalogo?.length || 0} cat`)
      } catch (err) {
        setStatus('JSON inválido: ' + String(err))
      }
    }
    input.click()
  }

  // Create backup now (save to server)
  async function handleCreateBackup() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await fetch('/api/auto-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'manual', tz }) })
      const data = await res.json()
      if (data.ok) {
        setStatus(`Backup guardado: ${data.filename}`)
        loadBackups()
      } else {
        setStatus('Error: ' + (data.error || 'No se pudo crear'))
      }
    } catch (err) {
      setStatus('Error creando backup: ' + String(err))
    }
  }

  // Restore a saved backup
  async function handleRestore(filename: string) {
    if (!confirm(`¿Restaurar desde "${filename}"? Esto REEMPLAZARÁ todos los datos actuales.`)) return
    if (!confirm('Confirmación final: ¿seguro que quieres sobrescribir los datos?')) return
    setRestoring(filename)
    try {
      const res = await fetch('/api/auto-backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      })
      const data = await res.json()
      if (data.ok) {
        setStatus(`Restaurado desde ${filename}`)
      } else {
        setStatus('Error: ' + (data.error || 'No se pudo restaurar'))
      }
    } catch (err) {
      setStatus('Error restaurando: ' + String(err))
    }
    setRestoring(null)
  }

  // Delete a saved backup
  async function handleDeleteBackup(filename: string) {
    if (!confirm(`¿Eliminar el backup "${filename}"?`)) return
    try {
      await fetch(`/api/auto-backup/${encodeURIComponent(filename)}`, { method: 'DELETE' })
      setStatus('Backup eliminado')
      loadBackups()
    } catch {
      setStatus('Error eliminando backup')
    }
  }

  // Wipe everything
  async function handleWipe() {
    if (!confirm('Esto BORRA TODO el sistema. ¿Continuar?')) return
    if (!confirm('Última confirmación: ¿SEGURO que quieres borrar todo definitivamente?')) return
    await fetch('/api/backup', { method: 'DELETE' })
    setStatus('Todo borrado')
  }

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      {/* Acciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[#005bb5]" />
            Copia de Seguridad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleCreateBackup} className="bg-[#2bb24c] hover:bg-[#239a3f] text-white">
              <Save className="h-4 w-4 mr-1" /> GUARDAR COPIA
            </Button>
            <Button onClick={handleExport} className="bg-[#005bb5] hover:bg-[#003d7a] text-white">
              <Download className="h-4 w-4 mr-1" /> DESCARGAR JSON
            </Button>
            <Button onClick={handleImport} variant="default" className="bg-slate-600 hover:bg-slate-700 text-white">
              <Upload className="h-4 w-4 mr-1" /> IMPORTAR JSON
            </Button>
            <Button onClick={handleWipe} variant="destructive">
              <Trash2 className="h-4 w-4 mr-1" /> BORRAR TODO
            </Button>
          </div>
          <p className="text-sm text-gray-500">
            Se guarda una copia de seguridad automática con cada cambio que hagas (entradas, clientes, catálogo, facturas, configuración). Solo se guardan cambios reales — si no hay actividad, no se crean copias. Se conservan las últimas 5 copias.
          </p>
          {status && (
            <div className="text-sm font-bold text-green-600">{status}</div>
          )}
        </CardContent>
      </Card>

      {/* Backups guardados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#2bb24c]" />
              Copias Guardadas ({backups.length})
            </span>
            <Button variant="ghost" size="sm" onClick={loadBackups} disabled={loadingBackups}>
              <RefreshCw className={`h-4 w-4 ${loadingBackups ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length === 0 && !loadingBackups ? (
            <p className="text-sm text-gray-400 py-4 text-center">No hay copias guardadas todavía</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {backups.map(b => (
                <div key={b.filename} className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-700">{b.date}</p>
                      {b.type === 'manual' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">MANUAL</span>}
                      {b.type === 'cambio' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">AUTO</span>}
                      {b.type === 'auto' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">AUTO</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{b.filename}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(b.filename)}
                      disabled={restoring === b.filename}
                      className="text-[#005bb5] border-[#005bb5]/30 hover:bg-[#005bb5]/10 text-xs h-7"
                    >
                      {restoring === b.filename ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3 mr-1" />
                      )}
                      Restaurar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { window.open(b.url, '_blank') }}
                      className="text-gray-400 hover:text-[#005bb5] h-7 w-7 p-0"
                      title="Descargar"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteBackup(b.filename)}
                      className="text-gray-400 hover:text-red-500 h-7 w-7 p-0"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
