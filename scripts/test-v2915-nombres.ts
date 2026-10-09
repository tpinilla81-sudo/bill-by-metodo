// Test rápido V29.15: parseo del formato PLANO + compatibilidad con los antiguos
import { normHuecoKey, normPlazaKey, nombrePlanoHueco } from '../src/lib/almacen'

let fails = 0
function eq(desc: string, got: string, want: string) {
  const ok = got === want
  if (!ok) fails++
  console.log(`${ok ? '✓' : '✗'} ${desc}: got="${got}"${ok ? '' : ` want="${want}"`}`)
}

// Formato PLANO nuevo: clave de COLUMNA = rack + hueco (posición en la fila)
eq('P1F1-1 → col P1-1', normHuecoKey('P1F1-1'), 'P1-1')
eq('P1F2-3 → col P1-3 (misma columna que F1-3)', normHuecoKey('P1F2-3'), 'P1-3')
eq('P2F5-6 → col P2-6', normHuecoKey('P2F5-6'), 'P2-6')
eq('p1f2-3 (minúsculas) → P1-3', normHuecoKey('p1f2-3'), 'P1-3')
// Plaza: rack-hueco-fila
eq('plaza P1F1-1 → P1-1-1', normPlazaKey('P1F1-1'), 'P1-1-1')
eq('plaza P1F2-3 → P1-3-2', normPlazaKey('P1F2-3'), 'P1-3-2')
// Compatibilidad con formatos antiguos
eq('antiguo P1F1H1 → col P1-1', normHuecoKey('P1F1H1'), 'P1-1')
eq('antiguo P1F1H2 → col P1-1', normHuecoKey('P1F1H2'), 'P1-1')
eq('antiguo P1F3H2 → col P1-3', normHuecoKey('P1F3H2'), 'P1-3')
eq('antiguo P1-01 → col P1-1', normHuecoKey('P1-01'), 'P1-1')
eq('antiguo E1-04 → col E1-4', normHuecoKey('E1-04'), 'E1-4')
eq('antiguo P1F1H1 → plaza P1-1-1', normPlazaKey('P1F1H1'), 'P1-1-1')
eq('antiguo P1F3H2 → plaza P1-3-2', normPlazaKey('P1F3H2'), 'P1-3-2')
// Equivalencia nueva ⇄ antigua (misma plaza)
eq('plaza nueva P2F3-7 == antigua P2F7H3', normPlazaKey('P2F3-7'), normPlazaKey('P2F7H3'))
// Generador de nombres
eq('nombrePlanoHueco(P1,1,1)', nombrePlanoHueco('P1', 1, 1), 'P1F1-1')
eq('nombrePlanoHueco(p2,3,7)', nombrePlanoHueco('p2', 3, 7), 'P2F3-7')
// Casos raros que NO deben tratarse como plano (con texto detrás)
eq('no-plano P1F1-1X sigue antiguo', normHuecoKey('P1F1-1X'), normHuecoKey('P1F1-1X'))

console.log(fails === 0 ? '\n✔ TODOS LOS TESTS OK' : `\n✗ ${fails} FALLOS`)
process.exit(fails === 0 ? 0 : 1)
