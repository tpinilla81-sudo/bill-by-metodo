'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Save, CheckCircle, AlertCircle, Table, Zap, QrCode, Printer, Download, Upload } from 'lucide-react'
import { todayISO, type Cliente, type CatalogoItem, type Registro } from '@/lib/hualsa-utils'
import { useConfig, parseCustomData, serializeCustomData, fieldAppliesToClient, getFieldLabel, type FieldDef } from '@/lib/config'
import { triggerBackup } from '@/lib/trigger-backup'
import {
  loadAlmacenCfg, fetchAlmacenCfg, huecoOptimo, contadoresHuecos, listadoHuecos, esC2EntradaPalet, normAlm, identDeCustomValues,
  isQrAuto, setQrAuto,
  type EstanteriaCfg,
} from '@/lib/almacen'
import { QrEtiquetaDialog, type EtiquetaPalet } from '@/components/hualsa/qr-etiqueta'
import * as XLSX from 'xlsx'

interface GrillaData {
  clientes: Cliente[]
  catalogo: CatalogoItem[]
}

interface GrillaRow {
  id: string
  fecha: string
  clienteId: string
  c1: string
  c2: string
  cant: string
  obs: string
  customValues: Record<string, string>
}

function uid() { return Math.random().toString(36).slice(2, 11) }

function emptyRow(fecha = todayISO()): GrillaRow {
  return { id: uid(), fecha, clienteId: '', c1: '', c2: '', cant: '1', obs: '', customValues: {} }
}

// Lookup price from catalog for preview
function lookupPrecio(catalogo: CatalogoItem[], c1: string, c2: string, clienteId: string): number {
  if (clienteId) {
    let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId === clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && !x.clienteId)
    if (!it) it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
    return it ? Number(it.final) || 0 : 0
  }
  let it = catalogo.find(x => x.c1 === c1 && x.c2 === c2)
  return it ? Number(it.final) || 0 : 0
}

// Reverse-lookup client from catalog
function lookupCliente(catalogo: CatalogoItem[], c1: string, c2: string): string {
  const item = catalogo.find(x => x.c1 === c1 && x.c2 === c2 && x.clienteId)
  return item?.clienteId || ''
}

export function EntradaGrilla() {
  const { config } = useConfig()
  const [data, setData] = useState<GrillaData>({ clientes: [], catalogo: [] })
  // TODOS los registros (entradas + salidas) — para saber qué huecos están
  // ocupados y asignar el óptimo a cada palet nuevo.
  const [todosRegistros, setTodosRegistros] = useState<Registro[]>([])
  // Configuración de estanterías/huecos compartida con STOCK ALMACÉN ('@/lib/almacen')
  const [almacenCfg, setAlmacenCfg] = useState<EstanteriaCfg[]>([])
  // Filas con hueco asignado automáticamente (para pintarlas en teal) y
  // c2 anterior de cada fila (para asignar justo cuando pasa a ENTRADA PALET)
  const autoUbicRowsRef = useRef<Set<string>>(new Set())
  const prevC2Ref = useRef<Map<string, string>>(new Map())
  const [rows, setRows] = useState<GrillaRow[]>(() => Array.from({ length: 1 }, () => emptyRow()))
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [rowCountInput, setRowCountInput] = useState('1')

  // ─── ETIQUETA QR (desde el origen) ────────────────────────────────────
  // Tras guardar la tanda se abren las etiquetas QR de todos los palets
  // para imprimirlas y pegarlas (luego "Escanear QR" en Stock Almacén).
  const [qrOpen, setQrOpen] = useState(false)
  const [qrEtiquetas, setQrEtiquetas] = useState<EtiquetaPalet[]>([])
  // Interruptor "impresión QR al guardar" — compartido con el formulario
  // normal (misma clave de localStorage): permite apagar la apertura
  // automática de las etiquetas tras guardar la tanda.
  const [qrAuto, setQrAutoState] = useState(true)
  useEffect(() => { setQrAutoState(isQrAuto()) }, [])
  function toggleQrAuto() {
    const v = !qrAuto
    setQrAutoState(v)
    setQrAuto(v)
  }

  const fieldDefs = config?.fieldsEntrada || []
  const customFields = fieldDefs.filter(f => f.isCustom && f.visible)
  const clienteVisible = fieldDefs.some(f => f.key === 'cliente' && f.visible)

  // ── CAMPOS OBLIGATORIOS (mismo criterio que el formulario normal) ──
  // Según la configuración, todos los campos visibles son obligatorios
  // (Obs. sigue siendo opcional, como allí). filaMissing() devuelve las
  // etiquetas de lo que le falta a una fila: se usa para resaltarla en
  // ámbar y para BLOQUEAR el guardado, igual que hace el formulario.
  // Los campos exclusivos de un cliente solo se exigen en sus filas
  // (fieldAppliesToClient, con el cliente autodetectado si está oculto).
  // V29.8: cliente y observaciones NO son obligatorios (igual que en el
  // formulario normal). Los customFields solo son obligatorios si están
  // marcados como required en la configuración de campos.
  function filaMissing(r: GrillaRow): string[] {
    const missing: string[] = []
    if (!r.fecha) missing.push(getFieldLabel(fieldDefs, 'fecha'))
    if (!r.c1) missing.push(getFieldLabel(fieldDefs, 'c1'))
    if (!r.c2) missing.push(getFieldLabel(fieldDefs, 'c2'))
    if (!String(r.cant || '').trim()) missing.push(getFieldLabel(fieldDefs, 'cantidad'))
    const cliId = r.clienteId || (clienteVisible ? '' : lookupCliente(data.catalogo, r.c1, r.c2))
    for (const f of customFields) {
      if (!fieldAppliesToClient(f, cliId || null)) continue
      if (f.required && !String(r.customValues[f.key] || '').trim()) missing.push(f.label)
    }
    return missing
  }

  // Fila "en blanco" = no se ha empezado a rellenar (no tiene c1, c2, obs
  // ni ningún valor personalizado). Estas filas NO bloquean el guardado:
  // se ignoran silenciosamente (como hace el formulario normal, donde no
  // se guarda nada si no se rellena). Cualquier otra fila SÍ debe estar
  // completa para que el botón GUARDAR se habilite (requisito del usuario:
  // "no tiene que haber filas incompletas — guardar se habilita cuando
  // está completa").
  function isRowBlank(r: GrillaRow): boolean {
    if (r.c1.trim() || r.c2.trim() || r.obs.trim()) return false
    for (const v of Object.values(r.customValues)) {
      if (String(v || '').trim()) return false
    }
    return true
  }

  // Campo UBICACIÓN (mismo criterio que el motor de stock: nombre/clave con "ubicación")
  const ubicField = useMemo(
    () => customFields.find(f => /ubicac/i.test(normAlm(`${f.key} ${f.label}`))) || null,
    [customFields]
  )
  const ubicKey = ubicField?.key || ''

  // Palets por hueco (con CUENTA): el hueco óptimo respeta las ALTURAS por
  // hueco — una columna con 1/3 palets aún admite más; una llena se salta.
  const ocupadas = useMemo(() => contadoresHuecos(todosRegistros), [todosRegistros])

  // V26: huecos configurados para OFRECER en la celda UBICACIÓN (datalist
  // nativo: sugerencias al escribir, sin estorbar la edición de la celda).
  const huecosLista = useMemo(() => listadoHuecos(almacenCfg, ocupadas), [almacenCfg, ocupadas])

  const loadData = useCallback(async () => {
    const [cRes, catRes, allRes] = await Promise.all([
      fetch('/api/clientes'),
      fetch('/api/catalogo'),
      fetch('/api/registros'),
    ])
    setData({ clientes: await cRes.json(), catalogo: await catRes.json() })
    setTodosRegistros(await allRes.json())
    setAlmacenCfg(loadAlmacenCfg())
    // V25: config fresca del SERVIDOR (compartida con el móvil / otros PCs)
    fetchAlmacenCfg().then(cfg => { if (cfg.length > 0) setAlmacenCfg(cfg) }).catch(() => {})
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── HUECO ÓPTIMO AUTOMÁTICO ───────────────────────────────────────────
  // Cuando una fila pasa a ENTRADA PALET (o se crea nueva ya siendo palet) y
  // su UBICACIÓN está vacía, se le asigna el primer hueco libre — contando
  // los ya asignados a las otras filas de la tanda para no repetir ninguno.
  // Si el usuario vacía o edita la celda a mano, se respeta su valor.
  useEffect(() => {
    if (!ubicKey) {
      prevC2Ref.current = new Map(rows.map(r => [r.id, r.c2]))
      return
    }
    if (almacenCfg.length === 0) return
    const extra: string[] = []   // ubicaciones ya usadas en esta tanda
    let cambio = false
    const next = rows.map(r => {
      const prevC2 = prevC2Ref.current.get(r.id)
      const ahoraPalet = esC2EntradaPalet(r.c2)
      const antesPalet = prevC2 !== undefined ? esC2EntradaPalet(prevC2) : false
      // Asignar solo en la transición a ENTRADA PALET (o fila recién creada)
      const recienPalet = ahoraPalet && (prevC2 === undefined || (!antesPalet && ahoraPalet))
      const val = String(r.customValues[ubicKey] || '').trim()
      if (recienPalet && !val) {
        const opt = huecoOptimo(almacenCfg, ocupadas, '', extra)
        if (opt) {
          extra.push(opt.hueco)
          autoUbicRowsRef.current.add(r.id)
          cambio = true
          return { ...r, customValues: { ...r.customValues, [ubicKey]: opt.hueco } }
        }
      }
      if (val) extra.push(val)
      return r
    })
    prevC2Ref.current = new Map(rows.map(r => [r.id, r.c2]))
    if (cambio) setRows(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ubicKey, almacenCfg, ocupadas])

  // Botón manual: asigna el primer hueco libre a TODAS las filas de ENTRADA
  // PALET con la ubicación vacía (útil tras importar o editar en bloque).
  function asignarHuecosManual() {
    if (!ubicKey) return
    if (almacenCfg.length === 0) {
      showStatus('err', 'Sin estanterías configuradas — defínelas en Stock Almacén')
      return
    }
    const extra: string[] = []
    let n = 0
    const next = rows.map(r => {
      const val = String(r.customValues[ubicKey] || '').trim()
      if (val) { extra.push(val); return r }
      if (!esC2EntradaPalet(r.c2)) return r
      const opt = huecoOptimo(almacenCfg, ocupadas, '', extra)
      if (!opt) return r
      extra.push(opt.hueco)
      autoUbicRowsRef.current.add(r.id)
      n++
      return { ...r, customValues: { ...r.customValues, [ubicKey]: opt.hueco } }
    })
    if (n > 0) setRows(next)
    showStatus(n > 0 ? 'ok' : 'err', n > 0
      ? `${n} hueco(s) asignado(s) — primer hueco libre de cada tanda`
      : 'No hay filas de ENTRADA PALET sin ubicación (o el almacén está lleno)')
  }

  // Keep rowCountInput synced when rows change by other means (+5, +10, duplicate, delete, CSV import, etc.)
  useEffect(() => { setRowCountInput(String(rows.length)) }, [rows.length])

  // Build c1 option list for dropdowns (all unique c1 values from catalog)
  const c1Options = useMemo(() => {
    const all = data.catalogo.map(c => c.c1).filter(Boolean)
    return [...new Set(all)].sort()
  }, [data.catalogo])

  // C2 options depend on selected c1 (per row) - computed inline in render
  // using the helper below so each row filters its own c2 list.
  const allC2Options = useMemo(() => {
    const all = data.catalogo.map(c => c.c2).filter(Boolean)
    return [...new Set(all)].sort()
  }, [data.catalogo])

  // Per-row c2 options: filter catalog by the row's c1, then unique sort.
  // Falls back to allC2Options when no c1 is selected yet.
  function c2OptionsFor(c1: string): string[] {
    if (!c1) return allC2Options
    const set = new Set<string>()
    for (const c of data.catalogo) {
      if (c.c1 === c1 && c.c2) set.add(c.c2)
    }
    // If no matching catalog entries, fall back so user can still type a value
    return set.size > 0 ? [...set].sort() : allC2Options
  }

  function updateRow(id: string, patch: Partial<GrillaRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  // Find the last "filled" row: the last one that has c1 (and ideally c2)
  // Used as a template when adding new rows
  function lastFilledRow(): GrillaRow | null {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].c1) return rows[i]
    }
    return null
  }

  // Copia los customValues de una plantilla SIN la ubicación cuando la fila
  // es de ENTRADA PALET: cada palet nuevo recibe su propio hueco óptimo.
  function customValuesSinUbicacion(cv: Record<string, string>): Record<string, string> {
    if (!ubicKey || !(ubicKey in cv)) return cv
    const copia = { ...cv }
    delete copia[ubicKey]
    return copia
  }

  function newRowFromTemplate(): GrillaRow {
    const tpl = lastFilledRow()
    if (!tpl) return emptyRow()
    // Copy all data EXCEPT obs (usually unique per entry) and customValues? — actually keep them, user can clear
    return {
      id: uid(),
      fecha: tpl.fecha,
      clienteId: tpl.clienteId,
      c1: tpl.c1,
      c2: tpl.c2,
      cant: tpl.cant,
      obs: '',  // leave obs empty, usually each entry has its own
      customValues: esC2EntradaPalet(tpl.c2) ? customValuesSinUbicacion(tpl.customValues) : { ...tpl.customValues },
    }
  }

  function addRow() {
    setRows(prev => [...prev, newRowFromTemplate()])
  }

  function addManyRows(n: number) {
    setRows(prev => [...prev, ...Array.from({ length: n }, () => newRowFromTemplate())])
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id))
    autoUbicRowsRef.current.delete(id)
    prevC2Ref.current.delete(id)
    if (rows.length <= 1) {
      setRows([emptyRow()])
    }
  }

  function clearAll() {
    if (!confirm('¿Borrar todas las filas?')) return
    setRows([emptyRow()])
    autoUbicRowsRef.current.clear()
    prevC2Ref.current.clear()
  }

  // Set exact number of rows (add or remove from the end)
  function setRowCount(n: number) {
    const target = Math.max(1, Math.min(500, n))
    setRows(prev => {
      if (prev.length === target) return prev
      if (prev.length < target) {
        const tpl = lastFilledRow()
        const baseRow = tpl
          ? { id: '', fecha: tpl.fecha, clienteId: tpl.clienteId, c1: tpl.c1, c2: tpl.c2, cant: tpl.cant, obs: '', customValues: esC2EntradaPalet(tpl.c2) ? customValuesSinUbicacion(tpl.customValues) : { ...tpl.customValues } }
          : { id: '', fecha: todayISO(), clienteId: '', c1: '', c2: '', cant: '1', obs: '', customValues: {} }
        const newRows = Array.from({ length: target - prev.length }, () => ({ ...baseRow, id: uid() }))
        return [...prev, ...newRows]
      }
      return prev.slice(0, target)
    })
  }

  function duplicateRow(id: string) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      // Duplicar un palet = otro palet distinto: la ubicación no se copia
      // (se le asignará su propio hueco óptimo automáticamente)
      const cv = esC2EntradaPalet(prev[idx].c2) ? customValuesSinUbicacion(prev[idx].customValues) : { ...prev[idx].customValues }
      const copy = { ...prev[idx], id: uid(), customValues: cv }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  function fillDown(id: string, field: keyof GrillaRow) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      const value = prev[idx][field]
      return prev.map((r, i) => (i > idx && r[field] === '' ? { ...r, [field]: value } : r))
    })
  }

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 4000)
  }

  // Handle Enter key to move to next row's same column
  function handleKeyDown(e: React.KeyboardEvent, rowIdx: number, _field: string) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Add a new row if at the last one
      if (rowIdx === rows.length - 1) {
        addRow()
      }
      // Focus next row same column (best-effort)
      setTimeout(() => {
        const nextId = rows[rowIdx + 1]?.id || ''
        if (nextId) {
          const el = document.querySelector<HTMLElement>(`[data-row-id="${nextId}"][data-field="${_field}"]`)
          el?.focus()
        }
      }, 10)
    }
  }

  // ── V29.8: Exportar/Importar Excel ─────────────────────────────────────
  // Plantilla con las columnas visibles de la ENTRADA (mismo orden que la grilla).
  // Al importar se mapea por CABECERA (no por posición) → el usuario puede
  // reordenar/quitar columnas en su Excel y sigue funcionando. Las filas
  // vacías se ignoran. CustomFields (Lote, Ubicación, Descripcion...) van
  // como columnas adicionales con su label exacto.

  // Cabecera canónica: lista de {key, label, isCustom} para columnas visibles.
  const grillaHeaders = useMemo(() => {
    const visible = (config?.fieldsEntrada || []).filter(f => f.visible)
    return visible.map(f => ({ key: f.key, label: f.label, isCustom: !!f.isCustom }))
  }, [config?.fieldsEntrada])

  function descargarPlantillaExcel() {
    // Una fila de ejemplo (no se importa si está vacía en customValues)
    const headers = grillaHeaders.map(h => h.label)
    const ejemplo: Record<string, string> = {}
    for (const h of grillaHeaders) {
      switch (h.key) {
        case 'fecha': ejemplo[h.label] = todayISO(); break
        case 'c1': ejemplo[h.label] = 'ALMACEN'; break
        case 'c2': ejemplo[h.label] = 'ENTRADA PALET'; break
        case 'cantidad': ejemplo[h.label] = '1'; break
        case 'cliente': ejemplo[h.label] = '(opcional)'; break
        case 'observaciones': ejemplo[h.label] = '(opcional)'; break
        default: ejemplo[h.label] = h.key === ubicKey ? 'P1F1H1' : (h.key.startsWith('custom_lote') ? 'L-24001' : '')
      }
    }
    const ws = XLSX.utils.json_to_sheet([ejemplo], { header: headers })
    // Anchos de columna razonables
    const colWidths = headers.map(h => ({ wch: Math.max(12, Math.min(40, h.length + 6)) }))
    ws['!cols'] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entradas')
    XLSX.writeFile(wb, `plantilla-entradas-${todayISO()}.xlsx`)
  }

  function importarExcel(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(buffer, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        if (!sheet) { showStatus('err', 'El Excel no tiene hojas'); return }
        const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        if (json.length === 0) { showStatus('err', 'El Excel está vacío'); return }

        // Mapear cabeceras del Excel → keys de la grilla (por label exacto,
        // sin distinguir mayúsculas/minúsculas ni acentos).
        const labelToKey = new Map<string, { key: string; isCustom: boolean }>()
        for (const h of grillaHeaders) {
          labelToKey.set(normAlm(h.label), { key: h.key, isCustom: h.isCustom })
        }

        const nuevas: GrillaRow[] = []
        for (const row of json) {
          // Saltar filas vacías (todas las celdas en blanco)
          const todasVacias = Object.values(row).every(v => !String(v ?? '').trim())
          if (todasVacias) continue

          const grillaRow: GrillaRow = emptyRow()
          const cv: Record<string, string> = {}
          for (const [label, value] of Object.entries(row)) {
            const meta = labelToKey.get(normAlm(label))
            if (!meta) continue  // columna desconocida — ignorar
            const strVal = String(value ?? '').trim()
            if (!strVal) continue
            switch (meta.key) {
              case 'fecha': grillaRow.fecha = strVal; break
              case 'clienteId':
              case 'cliente': {
                // Acepta nombre del cliente o ID — busca match en la lista
                const cli = data.clientes.find(c =>
                  c.id === strVal || normAlm(c.nombre) === normAlm(strVal))
                if (cli) grillaRow.clienteId = cli.id
                break
              }
              case 'c1': grillaRow.c1 = strVal; break
              case 'c2': grillaRow.c2 = strVal; break
              case 'cant':
              case 'cantidad': grillaRow.cant = strVal; break
              case 'obs':
              case 'observaciones': grillaRow.obs = strVal; break
              default:
                if (meta.isCustom) cv[meta.key] = strVal
            }
          }
          if (Object.keys(cv).length > 0) grillaRow.customValues = cv
          // Saltar filas que no tengan al menos c1 y c2 (no son entradas válidas)
          if (!grillaRow.c1 && !grillaRow.c2) continue
          nuevas.push(grillaRow)
        }

        if (nuevas.length === 0) {
          showStatus('err', 'No se encontraron filas válidas en el Excel')
          return
        }
        setRows(nuevas)
        setRowCount(nuevas.length)
        showStatus('ok', `Importadas ${nuevas.length} filas desde Excel ✓`)
      } catch (err) {
        console.error('Error importando Excel:', err)
        showStatus('err', 'No se pudo leer el Excel — ¿es un archivo .xlsx válido?')
      }
    }
    reader.onerror = () => showStatus('err', 'No se pudo leer el archivo')
    reader.readAsArrayBuffer(file)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    // El botón solo se habilita cuando todas las filas empezadas están
    // completas (validado por `todasCompletas`); pero por seguridad
    // volvemos a comprobar aquí: si alguna fila empezada está incompleta,
    // bloqueamos y señalamos cuál/cuáles.
    if (incompleteRows.length > 0) {
      const firstIdx = rows.findIndex(r => !isRowBlank(r) && filaMissing(r).length > 0)
      const missing = firstIdx >= 0 ? filaMissing(rows[firstIdx]) : []
      showStatus('err',
        `Fila ${firstIdx + 1}: ${missing.length === 1 ? 'falta' : 'faltan'} «${missing.join('», «')}» — completa la fila antes de guardar`
      )
      return
    }
    if (completeRows.length === 0) {
      showStatus('err', 'No hay filas para guardar — rellena al menos una')
      return
    }
    const validRows = completeRows

    setSaving(true)
    try {
      const batch: {
        fecha: string
        clienteId: string
        cliente: string
        c1: string
        c2: string
        cant: number
        obs: string
        customData: string
        precioUnitario: number
      }[] = []
      const etiquetas: EtiquetaPalet[] = []
      for (const r of validRows) {
        const customDataStr = customFields.length > 0 ? serializeCustomData(r.customValues, customFields as FieldDef[]) : ''
        let clienteId = r.clienteId
        if (!clienteId && !clienteVisible) {
          clienteId = lookupCliente(data.catalogo, r.c1, r.c2)
        }
        const cliente = data.clientes.find(c => c.id === clienteId)?.nombre || ''
        const precio = lookupPrecio(data.catalogo, r.c1, r.c2, clienteId)
        batch.push({
          fecha: r.fecha,
          clienteId,
          cliente,
          c1: r.c1,
          c2: r.c2,
          cant: Number(r.cant) || 1,
          obs: r.obs,
          customData: customDataStr,
          precioUnitario: precio,
        })
        // Etiqueta QR de cada línea de ENTRADA PALET guardada
        if (esC2EntradaPalet(r.c2)) {
          etiquetas.push({
            ident: identDeCustomValues(r.customValues),
            ubicacion: ubicKey ? String(r.customValues[ubicKey] || '').trim() : '',
            cliente,
            fecha: r.fecha,
            cant: Math.max(1, Number(r.cant) || 1),
          })
        }
      }

      const res = await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch, pasadoRegistro: false }),
      })
      const result = await res.json()
      if (!res.ok) {
        // Backend now returns specific error text (which row failed and why)
        showStatus('err', result.error || 'Error al guardar')
        return
      }
      if (res.status === 207 && result.partial) {
        // Partial success: some rows saved, some failed
        showStatus('err', result.error || `Se guardaron ${result.count} de ${batch.length} filas`)
        // Keep the rows that failed so the user can fix and retry — but clear the saved ones.
        // For simplicity here we just clear all and show the error; user can re-enter.
        setRows([emptyRow()])
        autoUbicRowsRef.current.clear()
        prevC2Ref.current.clear()
        loadData()
        triggerBackup()
        return
      }
      showStatus('ok', `${result.count} entrada(s) guardada(s) ✓`)
      // Etiquetas QR de la tanda: se abren justo tras guardar (imprimibles),
      // salvo que el interruptor de impresión QR esté apagado.
      if (etiquetas.length > 0 && qrAuto) { setQrEtiquetas(etiquetas); setQrOpen(true) }
      setRows([emptyRow()])
      autoUbicRowsRef.current.clear()
      prevC2Ref.current.clear()
      // Recargar: el stock acaba de cambiar y los próximos huecos óptimos también
      loadData()
      triggerBackup()
    } catch (err) {
      console.error('Grilla save error:', err)
      showStatus('err', 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Stats — distinción entre filas en blanco (no empezadas), filas
  // completas (todas las obligatorias cubiertas) y filas incompletas
  // (empezadas pero con campos obligatorios aún vacíos). El botón
  // GUARDAR solo se habilita cuando NO hay filas incompletas.
  const blankCount = rows.filter(r => isRowBlank(r)).length
  const startedRows = rows.filter(r => !isRowBlank(r))
  const incompleteRows = startedRows.filter(r => filaMissing(r).length > 0)
  const completeRows = startedRows.filter(r => filaMissing(r).length === 0)
  const todasCompletas = startedRows.length > 0 && incompleteRows.length === 0
  const totalCant = completeRows.reduce((s, r) => s + (Number(r.cant) || 0), 0)
  const totalImporte = rows.reduce((s, r) => {
    if (!r.c1 || !r.c2) return s
    const cli = r.clienteId || (clienteVisible ? '' : lookupCliente(data.catalogo, r.c1, r.c2))
    const precio = lookupPrecio(data.catalogo, r.c1, r.c2, cli)
    return s + precio * (Number(r.cant) || 0)
  }, 0)

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3">
      {/* V26: catálogo de huecos del almacén para la celda UBICACIÓN — el
          navegador los OFRECE como sugerencias al escribir (datalist nativo,
          funciona también en móvil). Se rellena desde la config del almacén. */}
      <datalist id="hualsa-huecos">
        {huecosLista.map(h => <option key={h.hueco} value={h.hueco} />)}
      </datalist>
      {/* Status */}
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {statusMsg.text}
        </div>
      )}

      {/* Header with toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-lg px-4 py-2.5 shadow-sm border">
        <div className="flex items-center gap-2">
          <Table className="h-5 w-5 text-[#005bb5]" />
          <h2 className="text-sm font-bold text-slate-700">Entrada Masiva</h2>
          <span className="text-xs text-slate-500">
            {rows.length} filas{blankCount > 0 ? ` · ${blankCount} en blanco` : ''} · {completeRows.length} completas{incompleteRows.length > 0 ? ` · ${incompleteRows.length} incompleta(s)` : ''} · {totalCant} unidades
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {/* Interruptor: ¿abrir las etiquetas QR al guardar? (compartido con el formulario normal) */}
          <button
            type="button"
            onClick={toggleQrAuto}
            aria-pressed={qrAuto}
            title={qrAuto
              ? 'ACTIVADO: al guardar, las líneas de ENTRADA PALET abren su etiqueta QR para imprimir. Clic para desactivar.'
              : 'DESACTIVADO: no se abrirán las etiquetas QR al guardar. Clic para activar.'}
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-bold transition-colors ${
              qrAuto
                ? 'border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100'
                : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            <Printer className="h-4 w-4" /> QR al guardar: {qrAuto ? 'SÍ' : 'NO'}
          </button>
          {ubicKey && (
            <Button variant="outline" size="sm" onClick={asignarHuecosManual} title="Asignar el primer hueco libre a las filas de ENTRADA PALET sin ubicación">
              <Zap className="h-4 w-4 mr-1 text-teal-600" /> Huecos
            </Button>
          )}
          <div className="flex items-center gap-1.5 px-2 h-9 rounded-md border border-input bg-background">
            <span className="text-xs text-slate-500">Filas:</span>
            <input
              type="number"
              min={1}
              max={500}
              value={rowCountInput}
              onChange={e => setRowCountInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
              onBlur={() => setRowCount(Number(rowCountInput) || 1)}
              className="w-16 h-7 px-1 text-sm text-center border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-[#005bb5] rounded"
            />
          </div>
          <Button variant="outline" size="sm" onClick={addRow} title="Añadir una fila">
            <Plus className="h-4 w-4 mr-1" /> +1
          </Button>
          {/* V29.8: Plantilla Excel + Importar Excel — entrada masiva desde fichero */}
          <Button variant="outline" size="sm" onClick={descargarPlantillaExcel} title="Descargar plantilla Excel con las columnas de la grilla (FECHA, CONCEPTO 1, CONCEPTO 2, LOTE, UBICACIÓN…)">
            <Download className="h-4 w-4 mr-1" /> Plantilla
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} title="Subir un Excel (.xlsx) con entradas — las cabeceras deben coincidir con las columnas de la grilla. Las filas vacías se ignoran">
            <Upload className="h-4 w-4 mr-1" /> Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) importarExcel(f)
              e.target.value = ''  // reset para poder re-importar el mismo archivo
            }}
          />
          <Button variant="outline" size="sm" onClick={clearAll} title="Borrar todo">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 z-10">
            <tr className="text-left">
              <th className="px-2 py-2 w-10 text-center text-xs font-bold text-slate-500">#</th>
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[120px]">Fecha</th>
              {clienteVisible && <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[160px]">Cliente</th>}
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[140px]">Concepto 1</th>
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[140px]">Concepto 2</th>
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase w-20">Cant.</th>
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[160px]">Obs.</th>
              {customFields.map(f => (
                <th
                  key={f.key}
                  className="px-2 py-2 text-xs font-bold text-slate-600 uppercase min-w-[120px]"
                  title={f.key === ubicKey ? 'Al elegir ENTRADA PALET se asigna solo el primer hueco libre' : undefined}
                >
                  {f.label}{f.key === ubicKey ? ' ⚡' : ''}
                </th>
              ))}
              <th className="px-2 py-2 text-xs font-bold text-slate-600 uppercase w-24 text-right">Precio</th>
              <th className="px-2 py-2 w-24 text-center text-xs font-bold text-slate-500">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const detectedClienteId = !clienteVisible && !row.clienteId ? lookupCliente(data.catalogo, row.c1, row.c2) : row.clienteId
              const precio = row.c1 && row.c2 ? lookupPrecio(data.catalogo, row.c1, row.c2, detectedClienteId) : 0
              // Fila en blanco (sin empezar): sin resaltado.
              // Fila incompleta (empezada pero con campos obligatorios
              // pendientes): ámbar + tooltip de lo que falta.
              // Fila completa: sin resaltado.
              const isBlank = isRowBlank(row)
              const missing = isBlank ? [] : filaMissing(row)
              const isValid = missing.length === 0
              return (
                <tr key={row.id} title={missing.length > 0 ? `Falta: ${missing.join(', ')}` : undefined} className={`border-t hover:bg-blue-50/30 ${!isBlank && !isValid ? 'bg-amber-50/60' : ''} ${isBlank ? 'opacity-60' : ''}`}>
                  <td className="px-2 py-1 text-center text-xs text-slate-400">{idx + 1}</td>
                  <td className="px-1 py-1">
                    <input
                      type="date"
                      data-row-id={row.id}
                      data-field="fecha"
                      value={row.fecha}
                      onChange={e => updateRow(row.id, { fecha: e.target.value })}
                      onKeyDown={e => handleKeyDown(e, idx, 'fecha')}
                      className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                    />
                  </td>
                  {clienteVisible && (
                    <td className="px-1 py-1">
                      <select
                        data-row-id={row.id}
                        data-field="clienteId"
                        value={row.clienteId}
                        onChange={e => updateRow(row.id, { clienteId: e.target.value })}
                        onKeyDown={e => handleKeyDown(e, idx, 'clienteId')}
                        className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                      >
                        <option value="">—</option>
                        {data.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="px-1 py-1">
                    <CellCombo
                      value={row.c1}
                      options={c1Options}
                      rowId={row.id}
                      field="c1"
                      onChange={v => {
                        // AUTO-DESCRIPCIÓN: al poner la REFERENCIA (c1), si el
                        // catálogo tiene una única DESCRIPCIÓN (c2) para esa c1,
                        // se rellena sola (igual que el formulario normal).
                        // Si hay varias c2 distintas para esa c1, se mantiene
                        // la actual solo si sigue siendo válida; si no, se limpia.
                        const c2matches = v
                          ? [...new Set(data.catalogo.filter(x => x.c1 === v && x.c2).map(x => x.c2))].sort()
                          : []
                        const nextC2 = c2matches.length === 1
                          ? c2matches[0]
                          : (c2matches.length > 1 && c2matches.includes(row.c2) ? row.c2 : '')
                        updateRow(row.id, { c1: v, c2: nextC2 })
                      }}
                      onKeyDown={e => handleKeyDown(e, idx, 'c1')}
                      onFillDown={() => fillDown(row.id, 'c1')}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CellCombo
                      value={row.c2}
                      options={c2OptionsFor(row.c1)}
                      rowId={row.id}
                      field="c2"
                      onChange={v => updateRow(row.id, { c2: v })}
                      onKeyDown={e => handleKeyDown(e, idx, 'c2')}
                      onFillDown={() => fillDown(row.id, 'c2')}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      data-row-id={row.id}
                      data-field="cant"
                      value={row.cant}
                      onChange={e => updateRow(row.id, { cant: e.target.value })}
                      onKeyDown={e => handleKeyDown(e, idx, 'cant')}
                      className="w-full h-8 px-1 text-sm text-right bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      data-row-id={row.id}
                      data-field="obs"
                      value={row.obs}
                      onChange={e => updateRow(row.id, { obs: e.target.value })}
                      onKeyDown={e => handleKeyDown(e, idx, 'obs')}
                      className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
                    />
                  </td>
                  {customFields.map(f => {
                    const esUbic = f.key === ubicKey
                    const autoUbic = esUbic && autoUbicRowsRef.current.has(row.id)
                    return (
                      <td key={f.key} className="px-1 py-1">
                        <input
                          type="text"
                          value={row.customValues[f.key] || ''}
                          onChange={e => {
                            if (esUbic) autoUbicRowsRef.current.delete(row.id)  // editado a mano → ya no es "auto"
                            updateRow(row.id, { customValues: { ...row.customValues, [f.key]: e.target.value } })
                          }}
                          onKeyDown={e => handleKeyDown(e, idx, f.key)}
                          list={esUbic && huecosLista.length > 0 ? 'hualsa-huecos' : undefined}
                          title={esUbic ? (autoUbic ? '⚡ Hueco asignado automáticamente — primer hueco libre' : 'Ubicación del palet (hueco) — elige de la lista o escribe, p.ej. E1-04') : undefined}
                          className={`w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded ${autoUbic ? 'text-teal-700 font-semibold' : ''}`}
                        />
                      </td>
                    )
                  })}
                  <td className="px-2 py-1 text-right text-xs text-slate-600">
                    {precio > 0 ? `${precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'}
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => duplicateRow(row.id)} title="Duplicar" className="p-1 hover:bg-blue-100 rounded text-blue-600">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteRow(row.id)} title="Borrar" className="p-1 hover:bg-red-100 rounded text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-100 z-10 border-t-2 border-slate-300">
            <tr>
              <td colSpan={clienteVisible ? 5 : 4} className="px-3 py-2 text-right text-xs font-bold text-slate-600">TOTALES</td>
              <td className="px-2 py-2 text-right text-sm font-bold text-slate-700">{totalCant}</td>
              <td colSpan={customFields.length + 2} className="px-2 py-2 text-right text-sm font-bold text-[#005bb5]">
                {totalImporte.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer with save */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-lg px-4 py-2.5 shadow-sm border">
        <div className="text-xs text-slate-500">
          💡 <b>Tip:</b> Al pulsar <b>+1</b> o <b>Filas</b>, se copian los datos de la última fila rellena · Enter baja a la siguiente · botón <b>+</b> duplica fila · el precio se autodetecta del catálogo · <b>todos los campos visibles son obligatorios</b> (igual que el formulario normal){ubicKey ? <> · con <b>ENTRADA PALET</b> el <b>hueco</b> se asigna solo (⚡ primer libre)</> : null}
          <span className={`flex items-center gap-1 mt-1 ${qrAuto ? 'text-slate-500' : 'text-gray-400'}`}>
            <QrCode className={`h-3.5 w-3.5 shrink-0 ${qrAuto ? 'text-teal-600' : 'text-gray-300'}`} />
            {qrAuto
              ? <>Al guardar, las líneas de <b>ENTRADA PALET</b> abren su <b>etiqueta QR</b> lista para imprimir.</>
              : <>Etiquetas QR <b>desactivadas</b> al guardar (interruptor <b>QR al guardar: NO</b> de arriba).</>}
          </span>
          {incompleteRows.length > 0 && (
            <span className="flex items-center gap-1 mt-1 text-amber-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {incompleteRows.length} fila(s) incompleta(s) — completa los campos obligatorios para habilitar GUARDAR (las filas en blanco se ignoran).
            </span>
          )}
        </div>
        <Button onClick={handleSave} disabled={saving || !todasCompletas} className={todasCompletas ? 'bg-[#2bb24c] hover:bg-[#239a3f] text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}>
          <Save className="h-4 w-4 mr-1" /> {saving ? 'Guardando...' : todasCompletas ? `GUARDAR ${completeRows.length} entrada(s)` : 'COMPLETA LAS FILAS'}
        </Button>
      </div>

      {/* Etiquetas QR de la tanda guardada */}
      <QrEtiquetaDialog open={qrOpen} onOpenChange={setQrOpen} etiquetas={qrEtiquetas} />
    </div>
  )
}

// ─── CellCombo: an input cell with autocomplete suggestions ───
function CellCombo({
  value,
  options,
  rowId,
  field,
  onChange,
  onKeyDown,
  onFillDown,
}: {
  value: string
  options: string[]
  rowId: string
  field: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onFillDown: () => void
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const wrapperRef = useRef<HTMLTableCellElement>(null)

  const filtered = useMemo(() => {
    if (!value) return options.slice(0, 50)
    return options.filter(o => o.toLowerCase().includes(value.toLowerCase())).slice(0, 50)
  }, [value, options])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) { setOpen(false) }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDownLocal(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && filtered.length > 0) { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && open && highlight >= 0) { e.preventDefault(); onChange(filtered[highlight]); setOpen(false); setHighlight(-1) }
    else if (e.key === 'Escape') { setOpen(false); setHighlight(-1) }
    else { onKeyDown(e) }
  }

  return (
    <td ref={wrapperRef} className="relative px-1 py-1">
      <input
        type="text"
        data-row-id={rowId}
        data-field={field}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDownLocal}
        className="w-full h-8 px-1 text-sm bg-transparent border border-transparent hover:border-gray-200 focus:border-[#005bb5] focus:outline-none rounded"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 top-full mt-0.5 min-w-[180px] bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto">
          {value && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-blue-600 border-b"
              onMouseDown={e => { e.preventDefault(); onFillDown(); setOpen(false) }}
            >
              ↓ Rellenar hacia abajo
            </button>
          )}
          {filtered.map((s, i) => (
            <button
              key={s}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${i === highlight ? 'bg-[#005bb5] text-white' : 'hover:bg-gray-50'} ${s === value ? 'font-bold' : ''}`}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); setHighlight(-1) }}
              onMouseEnter={() => setHighlight(i)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </td>
  )
}
