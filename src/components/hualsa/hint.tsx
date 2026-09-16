'use client'

import { Info, Lightbulb, AlertTriangle, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Hint — mensaje aclaratorio compacto y llamativo.
 *
 * Ocupa MUY poco espacio (texto pequeño, padding mínimo) pero se ve
 * distintivo gracias al icono + tinte de color. Pensado para sustituir
 * los párrafos largos `text-xs/text-sm text-gray-500` que ocupaban mucho
 * en todas las pantallas.
 *
 * Variantes:
 *  - info     (azul)   — información neutra / ayuda
 *  - tip      (ámbar)  — consejo, truco
 *  - warning  (rojo)   — aviso importante
 *  - subtle   (slate)  — nota discreta (menos llamativa)
 */
type Variant = 'info' | 'tip' | 'warning' | 'subtle'

const STYLES: Record<Variant, { wrap: string; icon: string; Icon: typeof Info }> = {
  info:    { wrap: 'bg-blue-50/70 border-blue-200/70 text-blue-700',     icon: 'text-blue-500',     Icon: Info },
  tip:     { wrap: 'bg-amber-50/80 border-amber-200/80 text-amber-700',  icon: 'text-amber-500',    Icon: Lightbulb },
  warning: { wrap: 'bg-rose-50/80 border-rose-200/80 text-rose-700',    icon: 'text-rose-500',     Icon: AlertTriangle },
  subtle:  { wrap: 'bg-slate-50 border-slate-200 text-slate-500',         icon: 'text-slate-400',    Icon: Sparkles },
}

interface HintProps {
  children: ReactNode
  variant?: Variant
  className?: string
  /** Ocultar el icono (por defecto se muestra) */
  noIcon?: boolean
}

export function Hint({ children, variant = 'info', className = '', noIcon = false }: HintProps) {
  const s = STYLES[variant]
  const Icon = s.Icon
  return (
    <div
      className={`inline-flex items-start gap-1 text-[9px] leading-[1.15] border rounded px-1.5 py-0.5 ${s.wrap} ${className}`}
    >
      {!noIcon && <Icon className={`h-2 w-2 mt-px shrink-0 ${s.icon}`} strokeWidth={2.5} />}
      <span className="flex-1 [&_b]:font-semibold [&_strong]:font-semibold">{children}</span>
    </div>
  )
}

export default Hint
