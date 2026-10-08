// ============================================================================
// test_pulsacion_paredes.mjs — se puede PULSAR un muro muy corto.
//
// Lo contó una certificadora el 2026-10-07: «cuando un muro es muy pequeño, un
// quiebro de 30-40 cm, no me deja pincharlo; se va directamente a los
// adyacentes más grandes». La zona de pulsación de cada pared era un trazo
// invisible de 0,9 m FIJOS con extremos REDONDEADOS: las dos vecinas
// sobresalían 0,45 m por su punta, encima del quiebro, y lo tapaban entero —
// también ampliando, porque esa zona estaba en metros.
//
// Aquí se replica cómo decide el navegador qué pared hay bajo el ratón (gana
// la ÚLTIMA pintada que contiene el punto; extremo recto = rectángulo, sin
// medio círculo en las puntas) y se comprueba que el quiebro se pulsa.
//
// $ node implementation/backend/scripts/test_pulsacion_paredes.mjs
// ============================================================================

import { ordenPulsacion, tamanosDeDibujo, PULSACION }
    from '../../frontend/src/features/cee-envolvente/logic/geometriaPlano.js';

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };

// ¿Está el punto dentro de la zona de un tramo? (extremo RECTO o REDONDO)
function dentroTramo([x, y], [a, b], medio, redondo) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / L2 : 0;
    if (!redondo && (t < 0 || t > 1)) return false;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) <= medio;
}
function pulsada(muros, p, ancho, redondo) {
    let gana = null;
    for (const m of muros) {
        for (let i = 1; i < m.svg.length; i++) {
            if (dentroTramo(p, [m.svg[i - 1], m.svg[i]], ancho / 2, redondo)) { gana = m.id; break; }
        }
    }
    return gana;
}

// Una fachada con un retranqueo de 35 cm: A (6 m) — Q (0,35 m) — B (5 m).
const A = { id: 'A', svg: [[0, 0], [6, 0]] };
const Q = { id: 'Q', svg: [[6, 0], [6, 0.35]] };
const B = { id: 'B', svg: [[6, 0.35], [11, 0.35]] };
const enPlano = [Q, A, B];               // el orden en que llegan del motor
const centroQ = [6, 0.175];

// Antes: 0,9 m fijos, redondo y en el orden del motor → se pulsaba una vecina.
ok(pulsada(enPlano, centroQ, 0.9, true) !== 'Q',
    'reproducido: con lo de antes, el centro del quiebro se lo llevaba una vecina');

// Ahora: de la más larga a la más corta, la corta queda la última.
const orden = ordenPulsacion(enPlano);
ok(orden.map(m => m.id).join('') === 'ABQ', `orden de pintado ${orden.map(m => m.id).join('')} (larga → corta)`);

// En el encuadre de partida (edificio de ~20 m) la zona sigue siendo 0,9 m…
const partida = tamanosDeDibujo({ ancho: 22, alto: 14 }).pulsacion;
ok(Math.abs(partida - PULSACION.max) < 1e-9, `encuadre de partida: ${partida.toFixed(2)} m (los 0,9 de siempre)`);
ok(pulsada(orden, centroQ, partida, false) === 'Q', 'encuadre de partida: el centro del quiebro es el quiebro');

// …y ampliando ×4 se estrecha con el zoom, así que se puede afinar.
const ampliado = tamanosDeDibujo({ ancho: 5.5, alto: 3.5 }).pulsacion;
ok(ampliado < 0.3, `ampliado ×4: ${ampliado.toFixed(2)} m de zona`);
ok(pulsada(orden, [6, 0.05], ampliado, false) === 'Q', 'ampliado: también cerca de la esquina se pulsa el quiebro');

// Las largas siguen siendo pulsables en todo lo demás.
ok(pulsada(orden, [3, 0.1], partida, false) === 'A', 'la pared A se sigue pulsando en su tramo');
ok(pulsada(orden, [9, 0.3], partida, false) === 'B', 'la pared B se sigue pulsando en su tramo');

// Con un largo de Catastro desfasado (pared movida) manda el trazo dibujado.
const movida = { id: 'M', largo: 12, svg: [[0, 0], [0.3, 0]] };
ok(ordenPulsacion([movida, A]).at(-1).id === 'M', 'se ordena por el trazo pintado, no por el largo de Catastro');

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
