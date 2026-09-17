'use client'

// ─── V29: Editor de CRITERIOS DE ASIGNACIÓN (ponderaciones 0–10) ────────
// Componente compartido por STOCK ALMACÉN (sección «Criterios de asignación
// por zona») y el asistente de UBICACIÓN de ENTRADAS (botón «Ajustar»).
// Los pesos son SIEMPRE de una zona concreta (nunca globales) y se guardan
// con la configuración del almacén (EstanteriaCfg.criterios).

import { CRITERIOS_DEF, PRESETS_CRITERIOS, pesosPorDefecto, type PesosCriterios, type CriterioId } from '@/lib/almacen'
import { RotateCcw, Scale } from 'lucide-react'

// ¿El peso actual coincide EXACTAMENTE con un preset? (para marcar el chip)
function presetActivoDe(pesos: PesosCriterios): string | null {
  for (const p of PRESETS_CRITERIOS) {
    const objetivo = p.pesos || pesosPorDefecto()
    if (CRITERIOS_DEF.every(c => objetivo[c.id] === pesos[c.id])) return p.id
  }
  return null
}

export function CriteriosEditor({
  pesos,
  onChange,
}: {
  pesos: PesosCriterios
  onChange: (pesos: PesosCriterios) => void
}) {
  const activo = presetActivoDe(pesos)

  function setPeso(id: CriterioId, v: number) {
    onChange({ ...pesos, [id]: Math.max(0, Math.min(10, Math.round(v))) })
  }

  return (
    <div>
      {/* Plantillas de un clic */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <Scale className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
        <span className="text-[9px] font-extrabold uppercase tracking-wider text-gray-400 shrink-0">Plantillas</span>
        {PRESETS_CRITERIOS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.pesos ? { ...p.pesos } : pesosPorDefecto())}
            title={p.id === 'general' ? 'Pesos equilibrados para uso general' : `Aplicar la plantilla «${p.nombre}» a esta zona`}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${
              activo === p.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300 hover:text-indigo-700'
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      {/* Un slider por criterio */}
      <div className="space-y-2">
        {CRITERIOS_DEF.map(c => {
          const w = pesos[c.id] || 0
          return (
            <div key={c.id} className="flex items-center gap-2.5" title={c.desc}>
              <div className="w-[7.5rem] shrink-0 leading-tight">
                <div className="text-[11px] font-bold text-gray-700">{c.nombre}</div>
                <div className="text-[9px] text-gray-400">{c.desc}</div>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={w}
                onChange={e => setPeso(c.id, Number(e.target.value))}
                className="flex-1 min-w-0 h-1.5 accent-[#005bb5] cursor-pointer"
                aria-label={`Peso de ${c.nombre}`}
              />
              <span
                className={`w-7 text-center text-xs font-extrabold font-mono rounded py-0.5 shrink-0 ${
                  w > 0 ? 'text-indigo-700 bg-indigo-50' : 'text-gray-300 bg-gray-50'
                }`}
              >
                {w}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onChange(pesosPorDefecto())}
          className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-gray-600 transition-colors"
          title="Volver a los pesos por defecto"
        >
          <RotateCcw className="h-3 w-3" /> Restablecer
        </button>
        <span className="text-[9px] text-gray-400 leading-tight">
          Familia, Rotación, Lote y Cliente solo puntúan si la entrada trae producto / nº palet / cliente.
        </span>
      </div>
    </div>
  )
}
