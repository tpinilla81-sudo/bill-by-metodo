#!/usr/bin/env python3
# Refactor quirúrgico de stock-almacen-view.tsx:
#  · elimina las funciones/tipos que ahora viven en src/lib/almacen.ts
#  · añade el import de la lib
#  · el useState de config pasa a usar loadAlmacenCfg() / saveAlmacenCfg()
# Verifica cada reemplazo y falla si algo no encaja.
import re, sys

P = '/home/z/my-project/src/components/hualsa/stock-almacen-view.tsx'
src = open(P).read()

# ── 1) Eliminar líneas 27..301 (bloque de tipos + funciones puras) ──────
lines = src.split('\n')
assert lines[26].startswith('// ─── STOCK ALMACÉN'), f'línea 27 inesperada: {lines[26][:80]!r}'
assert lines[300] == '}', f'línea 301 inesperada: {lines[300][:80]!r}'
assert lines[302].startswith('function colorPorDias'), f'línea 303 inesperada: {lines[302][:80]!r}'
new_block = [
    '// ─── STOCK ALMACÉN ─────────────────────────────────────────────────────',
    '// Control del stock en almacén a partir de los registros de palets:',
    '// ENTRADA PALET suma, SALIDA PALET resta (lote → ubicación → FIFO).',
    '// El motor de stock, la configuración de estanterías/huecos y el cálculo',
    "// del hueco óptimo viven en '@/lib/almacen' — compartidos con ENTRADA,",
    '// que asigna el hueco automáticamente al meter palets nuevos.',
]
lines = lines[:26] + new_block + lines[301:]
src = '\n'.join(lines)

# ── 2) Añadir import de la lib compartida ──────────────────────────────
anchor = "import { fmtDate, type Cliente, type Registro } from '@/lib/hualsa-utils'"
imp = ("import {\n"
       "  normAlm, isEntradaPalet, isSalidaPalet, getUbicacion, getIdent, splitUbicacion,\n"
       "  diasEnAlmacen, buildStock, buildRacks, nombresHuecos, detectarEstanterias,\n"
       "  loadAlmacenCfg, saveAlmacenCfg, type EstanteriaCfg, type LoteStock,\n"
       "} from '@/lib/almacen'")
assert src.count(anchor) == 1, 'anchor del import no único'
src = src.replace(anchor, anchor + '\n' + imp, 1)

# ── 3) useState de configuración → loadAlmacenCfg() ────────────────────
pat = re.compile(
    r"  // Configuración del almacén: lista de estanterías.*?"
    r"const \[showCfgEditor, setShowCfgEditor\] = useState\(false\)",
    re.S)
m = pat.search(src)
assert m, 'no se encontró el bloque del useState de configuración'
repl = (
    "  // Configuración del almacén: lista de estanterías con su nº de huecos.\n"
    "  // Cada hueco se nombra automáticamente y el mapa se dibuja a partir de\n"
    "  // esta lista. Compartida con ENTRADA (hueco óptimo automático) vía\n"
    "  // '@/lib/almacen': persistida en localStorage ('stock-config-v2') con\n"
    "  // migración de las claves antiguas 'stock-config' y 'stock-capacidades'.\n"
    "  const [almacenCfg, setAlmacenCfg] = useState<EstanteriaCfg[]>(() => loadAlmacenCfg())\n"
    "  const [showCfgEditor, setShowCfgEditor] = useState(false)")
src = src[:m.start()] + repl + src[m.end():]

# ── 4) Efecto de guardado → saveAlmacenCfg() ───────────────────────────
old_save = ("  useEffect(() => {\n"
            "    try { localStorage.setItem('stock-config-v2', JSON.stringify(almacenCfg)) } catch { /* quota */ }\n"
            "  }, [almacenCfg])")
assert src.count(old_save) == 1, 'efecto de guardado no único'
src = src.replace(old_save, "  useEffect(() => { saveAlmacenCfg(almacenCfg) }, [almacenCfg])", 1)

# ── Comprobaciones finales ─────────────────────────────────────────────
for sym in ['function buildStock', 'function buildRacks', 'function normHuecoKey',
            'interface EstanteriaCfg', 'interface LoteStock', 'function extractIdents',
            'localStorage.getItem(\'stock-config-v2\')']:
    assert sym not in src, f'símbolo residual: {sym}'
for sym in ['loadAlmacenCfg()', 'saveAlmacenCfg(almacenCfg)', 'colorPorDias', 'detectarEstanterias(registros)']:
    assert sym in src, f'símbolo esperado ausente: {sym}'

open(P, 'w').write(src)
print('OK — refactor aplicado. Líneas totales:', src.count('\n') + 1)
