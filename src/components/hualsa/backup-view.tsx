'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Upload, Trash2, Database } from 'lucide-react'
import { useConfig } from '@/lib/config'

export function BackupView() {
  const { config } = useConfig()
  const [status, setStatus] = useState('')

  async function handleExport() {
    if (!confirm('¿Descargar copia de seguridad completa (JSON)?')) return
    try {
      const res = await fetch('/api/backup')
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(config?.appName || 'HUALSA').toLowerCase()}_backup_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setStatus('Exportado correctamente')
    } catch (err) {
      setStatus('Error exportando: ' + String(err))
    }
  }

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

  async function handleWipe() {
    if (!confirm('Esto BORRA TODO el sistema. ¿Continuar?')) return
    if (!confirm('Última confirmación: ¿SEGURO que quieres borrar todo definitivamente?')) return
    await fetch('/api/backup', { method: 'DELETE' })
    setStatus('Todo borrado')
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[#005bb5]" />
            Copia de Seguridad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white">
              <Download className="h-4 w-4 mr-1" /> EXPORTAR JSON
            </Button>
            <Button onClick={handleImport} variant="default" className="bg-[#005bb5] hover:bg-[#003d7a] text-white">
              <Upload className="h-4 w-4 mr-1" /> IMPORTAR JSON
            </Button>
            <Button onClick={handleWipe} variant="destructive">
              <Trash2 className="h-4 w-4 mr-1" /> BORRAR TODO
            </Button>
          </div>
          <p className="text-sm text-gray-500">
            Los datos se almacenan en la base de datos local SQLite. Utiliza la exportación para crear copias de seguridad y la importación para restaurar datos desde un archivo JSON previamente exportado.
          </p>
          {status && (
            <div className="text-sm font-bold text-green-600">{status}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
