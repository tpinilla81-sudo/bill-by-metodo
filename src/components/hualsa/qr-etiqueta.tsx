'use client'

// ─── ETIQUETA QR DEL PALET ──────────────────────────────────────────────
// El método QR completo, desde el origen:
//   1. ENTRADA: al guardar una ENTRADA PALET se abre esta ventana con su
//      etiqueta QR (el QR codifica el LOTE / Nº PALET — o la UBICACIÓN si
//      no hay lote) y se IMPRIME para pegarla en el palet.
//   2. STOCK ALMACÉN: el botón "Escanear QR" lee la etiqueta con la cámara
//      y localiza el palet en el mapa al instante.
// La impresión usa un iframe oculto (sin bloqueadores de pop-ups) con
// etiquetas de 100 mm listas para recortar.

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { QrCode, Printer, Package, Info } from 'lucide-react'
import { fmtDate } from '@/lib/hualsa-utils'

export interface EtiquetaPalet {
  ident: string      // lote / nº palet — es lo que codifica el QR
  ubicacion: string  // p.ej. "E1-04" — lo grande de la etiqueta
  cliente: string
  fecha: string      // ISO yyyy-mm-dd
  cant: number       // nº de palets físicos de la línea
}

// API mínima del paquete 'qrcode' (cargado dinámicamente, solo en cliente)
interface QrApi {
  toDataURL: (text: string, opts?: Record<string, unknown>) => Promise<string>
}

// ¿Qué codifica el QR de una etiqueta? El lote/nº palet si existe (identifica
// el palet en cualquier hueco); si no, la ubicación (encuentra el hueco).
function qrTexto(e: EtiquetaPalet): string {
  return String(e.ident || e.ubicacion || '').trim()
}

// ─── Impresión por iframe oculto ────────────────────────────────────────
function imprimirHtml(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) return
  doc.open()
  doc.write(html)
  doc.close()
  const lanzar = () => {
    setTimeout(() => {
      try { win.focus(); win.print() } catch { /* print cancelado */ }
      // quitar el iframe un poco después (da tiempo al diálogo de impresión)
      setTimeout(() => { try { document.body.removeChild(iframe) } catch { /* ya quitado */ } }, 3000)
    }, 250)
  }
  // esperar a que las imágenes (data-URL) estén listas antes de imprimir
  const imgs = Array.from(doc.images)
  const pend = imgs.filter(i => !i.complete)
  if (pend.length === 0) lanzar()
  else {
    let restan = pend.length
    const listo = () => { restan--; if (restan <= 0) lanzar() }
    pend.forEach(i => i.addEventListener('load', listo, { once: true }))
    // red de seguridad: imprimir a los 2s pase lo que pase
    setTimeout(() => { if (restan > 0) lanzar() }, 2000)
  }
}

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// HTML de impresión: una etiqueta por palet físico (numeradas si hay varias)
function htmlEtiquetas(
  items: { e: EtiquetaPalet; qrUrl: string; texto: string }[],
  copiasDe: Record<number, number>
): string {
  const labels: string[] = []
  for (let i = 0; i < items.length; i++) {
    const { e, qrUrl, texto } = items[i]
    const n = Math.max(1, Math.min(99, copiasDe[i] || e.cant || 1))
    for (let j = 1; j <= n; j++) {
      labels.push(`
      <div class="label">
        ${qrUrl ? `<img src="${qrUrl}" alt="QR">` : `<div class="noqr">SIN QR</div>`}
        <div class="info">
          <div class="ub">${esc(e.ubicacion || '—')}</div>
          ${e.ident ? `<div class="row"><span class="k">LOTE</span><b>${esc(e.ident)}</b></div>` : ''}
          ${e.cliente ? `<div class="row"><span class="k">CLIENTE</span>${esc(e.cliente)}</div>` : ''}
          <div class="row"><span class="k">FECHA</span>${esc(fmtDate(e.fecha))}</div>
          ${n > 1 ? `<div class="n">PALET ${j}/${n}</div>` : ''}
          ${texto ? '' : '<div class="n">⚠ sin lote ni ubicación</div>'}
        </div>
      </div>`)
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas QR palets</title><style>
    @page { margin: 6mm }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000 }
    .label { width: 100mm; border: 1px solid #000; padding: 3mm; margin: 0 auto 4mm;
             display: flex; gap: 3mm; page-break-inside: avoid; break-inside: avoid }
    .label img { width: 32mm; height: 32mm; display: block }
    .noqr { width: 32mm; height: 32mm; border: 2px dashed #999; display: flex;
            align-items: center; justify-content: center; font-size: 8pt; color: #999 }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center }
    .ub { font-size: 30pt; font-weight: bold; line-height: 1; margin-bottom: 1.5mm; overflow: hidden }
    .row { font-size: 9.5pt; margin-top: 0.8mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
    .row .k { font-size: 7pt; color: #555; display: inline-block; width: 14mm; letter-spacing: 0.3mm }
    .n { margin-top: 1.5mm; font-size: 8pt; font-weight: bold; text-align: right }
  </style></head><body>${labels.join('')}</body></html>`
}

export function QrEtiquetaDialog({
  open,
  onOpenChange,
  etiquetas,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  etiquetas: EtiquetaPalet[]
}) {
  const [qrs, setQrs] = useState<{ texto: string; url: string }[]>([])
  const [copias, setCopias] = useState<Record<number, number>>({})
  const [error, setError] = useState('')

  // Generar los QR (data-URL) al abrir — carga 'qrcode' solo cuando hace falta
  useEffect(() => {
    if (!open || etiquetas.length === 0) { setQrs([]); setCopias({}); setError(''); return }
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('qrcode')
        const api: QrApi = ((mod as unknown as { default?: QrApi }).default) ?? (mod as unknown as QrApi)
        const out: { texto: string; url: string }[] = []
        for (const e of etiquetas) {
          const texto = qrTexto(e)
          const url = texto
            ? await api.toDataURL(texto, { width: 360, margin: 1, errorCorrectionLevel: 'M' })
            : ''
          out.push({ texto, url })
        }
        if (cancelled) return
        setQrs(out)
        // copias por etiqueta = nº de palets físicos de la línea (editable)
        setCopias(Object.fromEntries(etiquetas.map((e, i) => [i, Math.max(1, Math.min(99, e.cant || 1))])))
        setError('')
      } catch (err) {
        console.error('QR generate error:', err)
        if (!cancelled) setError('No se pudo generar el QR. Revisa la conexión e inténtalo de nuevo.')
      }
    })()
    return () => { cancelled = true }
  }, [open, etiquetas])

  const listas = qrs.length === etiquetas.length && etiquetas.length > 0
  const totalEtiquetas = etiquetas.reduce((s, _e, i) => s + Math.max(1, Math.min(99, copias[i] || 1)), 0)

  function imprimir() {
    if (!listas) return
    const items = etiquetas.map((e, i) => ({ e, qrUrl: qrs[i]?.url || '', texto: qrs[i]?.texto || '' }))
    imprimirHtml(htmlEtiquetas(items, copias))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-teal-600" />
            {etiquetas.length === 1 ? 'ETIQUETA QR DEL PALET' : `ETIQUETAS QR (${etiquetas.length} líneas)`}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-800 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Pega la etiqueta impresa en el palet. Luego, en <b>STOCK ALMACÉN</b>, el botón{' '}
            <b>“Escanear QR”</b> lo lee con la cámara y localiza el palet en el mapa al instante.
          </span>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 font-semibold">{error}</div>
        )}

        {!listas && !error && (
          <div className="text-sm text-gray-400 text-center py-6">Generando código QR…</div>
        )}

        {listas && (
          <div className="space-y-3">
            {etiquetas.map((e, i) => {
              const qr = qrs[i]
              const texto = qr?.texto || ''
              return (
                <div key={i} className="rounded-xl border-2 border-gray-200 bg-white p-3 flex gap-3">
                  {/* QR (o aviso si no hay nada que codificar) */}
                  <div className="shrink-0 w-[110px] h-[110px] rounded-lg border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
                    {qr?.url ? (
                      <img src={qr.url} alt={`QR ${texto}`} className="w-full h-full" />
                    ) : (
                      <div className="text-[10px] text-gray-400 text-center px-2 leading-tight">
                        Sin lote ni ubicación:<br />no se puede generar el QR
                      </div>
                    )}
                  </div>
                  {/* Info de la etiqueta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Ubicación</span>
                      <span className="text-3xl font-extrabold text-teal-700 leading-none">{e.ubicacion || '—'}</span>
                    </div>
                    <div className="mt-1.5 space-y-0.5 text-sm text-gray-700">
                      {e.ident && <div><span className="text-[10px] font-bold text-gray-400 uppercase mr-1.5">Lote</span><b>{e.ident}</b></div>}
                      {e.cliente && <div className="truncate"><span className="text-[10px] font-bold text-gray-400 uppercase mr-1.5">Cliente</span>{e.cliente}</div>}
                      <div><span className="text-[10px] font-bold text-gray-400 uppercase mr-1.5">Fecha</span>{fmtDate(e.fecha)}</div>
                      <div><span className="text-[10px] font-bold text-gray-400 uppercase mr-1.5">QR contiene</span><span className="font-mono">{texto}</span></div>
                    </div>
                    {/* Copias = nº de etiquetas a imprimir para esta línea */}
                    <div className="mt-2 flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Etiquetas</span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={copias[i] ?? 1}
                        onChange={ev => setCopias(prev => ({ ...prev, [i]: Math.max(1, Math.min(99, parseInt(ev.target.value, 10) || 1)) }))}
                        className="h-7 w-14 rounded border border-gray-200 text-sm text-center font-bold"
                      />
                      <span className="text-[10px] text-gray-400">({Math.max(1, e.cant || 1)} palet(s) en la línea)</span>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                onClick={imprimir}
                disabled={!listas}
                className="bg-teal-600 hover:bg-teal-700 text-white h-10 px-4"
              >
                <Printer className="h-4 w-4 mr-1.5" /> IMPRIMIR {totalEtiquetas} ETIQUETA{totalEtiquetas === 1 ? '' : 'S'}
              </Button>
              <span className="text-[10px] text-gray-400">
                Etiquetas de 100 mm con borde para recortar · el QR se lee con “Escanear QR” en Stock Almacén
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
