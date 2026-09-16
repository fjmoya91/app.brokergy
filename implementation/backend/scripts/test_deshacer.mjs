/**
 * DESHACER en la ventana de la envolvente.
 *
 * Ahí no hay botón de guardar: se guarda solo. Y la otra cara de eso es que un
 * error también se guarda solo — apartar la pared equivocada o borrar una
 * ventana que costó medir se persistía antes de darte cuenta.
 *
 * Lo que se comprueba aquí es la MECÁNICA de la pila, que es lo único que puede
 * romperse en silencio: un bucle (apuntar lo que acabas de restaurar, y otra
 * vez, y otra) o lo contrario, no apuntar nunca. El resto del hook —el freno de
 * 700 ms y el atajo de teclado— es cableado de React y se ve usándolo.
 *
 *   node implementation/backend/scripts/test_deshacer.mjs
 */
import { apuntar, esNuevo, huella }
    from '../../frontend/src/features/cee-envolvente/logic/useDeshacer.js';

let fallos = 0;
const ok = (cond, que) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${que}`);
    if (!cond) fallos++;
};

//: Un pequeño gemelo del hook, sin React: apunta cuando el estado es nuevo y
//: se mueve por la pila. Es la MISMA secuencia de llamadas que hace el efecto.
function editor() {
    let pila = [];
    let pos = -1;
    return {
        get pos() { return pila[pos]?.estado; },
        get pasos() { return pila.length; },
        //: Lo que hace el efecto: si el estado es nuevo, se apunta.
        cambia(estado) {
            const h = huella(estado, {});
            if (!esNuevo(pila, pos, h)) return false;
            ({ pila, pos } = apuntar(pila, pos, { h, estado }));
            return true;
        },
        deshace() { if (pos > 0) pos--; return pila[pos]?.estado; },
        rehace() { if (pos < pila.length - 1) pos++; return pila[pos]?.estado; },
        puedeDeshacer() { return pos > 0; },
        puedeRehacer() { return pos >= 0 && pos < pila.length - 1; },
    };
}

// ── 1. Lo que pasa al trabajar ──────────────────────────────────────────────
console.log('\n1. Apuntar pasos');
{
    const e = editor();
    ok(e.cambia({ n: 0 }), 'el primer estado se apunta: es la línea de partida');
    ok(!e.puedeDeshacer(), 'y desde ahí no hay nada que deshacer');
    e.cambia({ n: 1 });
    e.cambia({ n: 2 });
    ok(e.pasos === 3, `tres pasos (hay ${e.pasos})`);
    ok(e.puedeDeshacer() && !e.puedeRehacer(), 'se puede deshacer, no rehacer');
}

// ── 2. El BUCLE, que es lo que de verdad puede romperse ─────────────────────
console.log('\n2. Restaurar NO se apunta a sí mismo');
{
    const e = editor();
    e.cambia({ n: 0 }); e.cambia({ n: 1 }); e.cambia({ n: 2 });
    const antes = e.pasos;
    e.deshace();
    // Esto es lo que ocurre al restaurar: la vista cambia de estado y el efecto
    // se vuelve a disparar con el estado RESTAURADO. No puede apuntarlo.
    ok(!e.cambia({ n: 1 }), 'el estado al que acabas de volver no crea un paso nuevo');
    ok(e.pasos === antes, `la pila no crece (${e.pasos})`);
    // Y aunque el efecto se dispare cien veces con el mismo estado:
    for (let i = 0; i < 100; i++) e.cambia({ n: 1 });
    ok(e.pasos === antes, 'ni disparándose cien veces — no hay bucle');
}

// ── 3. Ir y volver ──────────────────────────────────────────────────────────
console.log('\n3. Deshacer y rehacer');
{
    const e = editor();
    e.cambia({ n: 0 }); e.cambia({ n: 1 }); e.cambia({ n: 2 });
    ok(e.deshace().n === 1 && e.deshace().n === 0, 'se retrocede paso a paso');
    ok(!e.puedeDeshacer(), 'y en el primero se para: no se sale de la pila');
    ok(e.deshace().n === 0, 'insistir no rompe nada');
    ok(e.rehace().n === 1 && e.rehace().n === 2, 'y se vuelve hacia delante');
    ok(!e.puedeRehacer(), 'hasta el último');
}

// ── 4. Tocar algo tras deshacer ABANDONA el camino ──────────────────────────
console.log('\n4. El camino abandonado se tira');
{
    const e = editor();
    e.cambia({ n: 0 }); e.cambia({ n: 1 }); e.cambia({ n: 2 });
    e.deshace(); e.deshace();          // estamos en 0
    e.cambia({ n: 9 });                 // y se toca otra cosa
    ok(e.pos.n === 9, 'el paso nuevo queda puesto');
    ok(!e.puedeRehacer(), 'y ya no se puede rehacer hacia el 1 y el 2');
    ok(e.pasos === 2, `la pila se trunca (${e.pasos} pasos: el 0 y el 9)`);
}

// ── 5. La SELECCIÓN no es un cambio ─────────────────────────────────────────
console.log('\n5. Pulsar una pared no gasta un paso');
{
    const e = editor();
    e.cambia({ entrada: 'FBN1', sel: 'FBN1' });
    ok(!e.cambia({ entrada: 'FBN1', sel: 'FBS2' }),
       'mirar otra pared no crea un paso: si no, deshacer devolvería la selección');
    ok(e.cambia({ entrada: 'FBS2', sel: 'FBS2' }), 'y cambiar la entrada sí');
}

// ── 6. El tope no deja crecer la memoria ────────────────────────────────────
console.log('\n6. El histórico está acotado');
{
    let pila = [], pos = -1;
    for (let i = 0; i < 200; i++) ({ pila, pos } = apuntar(pila, pos, { h: `x${i}` }, 5));
    ok(pila.length === 5, `se queda en el tope (${pila.length})`);
    ok(pos === 4, 'y la posición apunta al último');
    ok(pila[0].h === 'x195', 'lo que se tira es lo MÁS VIEJO, no lo último');
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)\n` : '\n✓ Todo correcto\n');
process.exit(fallos ? 1 : 0);
