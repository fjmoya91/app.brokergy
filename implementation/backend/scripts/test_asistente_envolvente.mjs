/**
 * El ASISTENTE de la envolvente: lo que hace el NAVEGADOR con lo que devuelve
 * Claude (resumen, validar, aplicar). Sin red y sin Claude: las operaciones van
 * escritas como las devuelve la ruta (`services/asistenteEnvolvente.js`, ya
 * limpias).
 *
 * Una casa de 12 × 9 m en el lienzo (la Y crece hacia el SUR): FBE1 al norte
 * con V1 y V3, FBE2 al este, FBE3 al sur con P1, MBE1 (medianera) al oeste, y
 * un garaje Z1 de 5 × 4 m en la esquina suroeste. Los tres ejemplos del encargo:
 *   «La V3 no va en la FB1 sino en la FB3, y es de PC»
 *   «El garaje llega hasta el final de la vivienda» (por el este)
 *   «Quita la aerotermia y pon el autoconsumo»
 *
 *   node implementation/backend/scripts/test_asistente_envolvente.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');
const A = await import(pathToFileURL(path.join(LOGIC, 'asistenteEnvolvente.js')).href);
const { _limpiarOperaciones: limpiar } = await import(pathToFileURL(path.join(AQUI, '../services/asistenteEnvolvente.js')).href);

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};
const cerca = (a, b, tol = 0.05, que = '') => assert.ok(Math.abs(a - b) <= tol, `${que} ${a} ≠ ${b}`);

const T = { dx: 400000, y0: 4400000 };                    // lienzo → mundo
const mundo = ([x, y]) => [x + T.dx, T.y0 - y];
const hueco = (uid, nombre, tipo, ancho, alto) => ({ uid, nombre, tipo, ancho, alto, estado: 'medido' });

const PLANO = () => {
    const lista = [
        { id: 'FBE1', tipo: 'FACHADA', orientacion: 'N', largo: 12, svg: [[0, 0], [12, 0]],
          huecos: [hueco('u1', 'V1', 'ventana', 1.2, 1.2), hueco('u3', 'V3', 'ventana', 1.3, 1.3)] },
        { id: 'FBE2', tipo: 'FACHADA', orientacion: 'E', largo: 9, svg: [[12, 0], [12, 9]], huecos: [] },
        { id: 'FBE3', tipo: 'FACHADA', orientacion: 'S', largo: 12, svg: [[12, 9], [0, 9]],
          huecos: [hueco('p1', 'P1', 'puerta', 0.9, 2.05)] },
        { id: 'MBE1', tipo: 'MEDIANERA', largo: 9, svg: [[0, 9], [0, 0]], huecos: [] },
    ];
    const muros = Object.fromEntries(lista.map(m => [m.id, m]));
    const zonas = [{ nivel: 0, planta: 'pb', uso: 'GARAJE', area_m2: 20,
                     poligono: [[0, 5], [5, 5], [5, 9], [0, 9]].map(mundo) }];
    const catalogo = [
        { id: 'aerotermia', titulo: 'Aerotermia', disponible: true, porDefecto: true },
        { id: 'autoconsumo', titulo: 'Autoconsumo', disponible: true },
        { id: 'ventanas', titulo: 'Cambio de ventanas', disponible: false, motivo: 'no hay presupuesto de ventanas' },
    ];
    return { plantas: [{ id: 'pb', nivel: 0, nombre: 'Planta baja', muros: lista }],
             muros, zonas, t: T, catalogo, elegidas: null, fase: 'inicial', defecto: null, sel: 'FBE1' };
};

console.log('Resumen');
prueba('lleva paredes, huecos, la zona con lo que le falta y las medidas', () => {
    const r = A.resumenCompacto(PLANO());
    assert.match(r, /FBE1 FACHADA N 12\.00m P0: V1 ventana 1\.20×1\.20/);
    assert.match(r, /MBE1 MEDIANERA/);
    assert.match(r, /Z1 GARAJE P0 20\.0m² caja 5\.0×4\.0 m/);
    // Al garaje le faltan 7 m por el este y 5 por el norte; 0 al sur y al oeste.
    assert.match(r, /E 7\.0 m/); assert.match(r, /N 5\.0 m/); assert.match(r, /S 0\.0 m/); assert.match(r, /O 0\.0 m/);
    assert.match(r, /\[x\] aerotermia/); assert.match(r, /\[ \] autoconsumo/);
    assert.match(r, /\(no disponible\) ventanas .*: no hay presupuesto/);
    assert.match(r, /PARED SELECCIONADA: FBE1/);
    assert.ok(r.length < 2000, `el resumen pesa ${r.length} caracteres`);
});

console.log('Ejemplo 1: «la V3 va en la FB3 y es de PC»');
prueba('mover y cambiar el marco: dos pasos, en palabras, y se aplican', () => {
    const ctx = PLANO();
    const ops = limpiar([
        { op: 'mover_hueco', hueco: 'V3', pared: 'FB3' },
        { op: 'carpinteria', hueco: 'V3', marco: 'PC', vidrio: 'igual', persiana: 'igual' },
    ]);
    const { pasos, errores } = A.validarOperaciones(ops, ctx);
    assert.deepEqual(errores, []);
    assert.equal(pasos.length, 2);
    assert.match(pasos[0].texto, /V3: FBE1 → FBE3 \(has dicho «FB3»\)/);
    assert.match(pasos[1].texto, /V3 \(FBE3\): marco .* → PVC/);
    const v = A.transformarMuros(ctx.muros, pasos);
    assert.deepEqual(v.FBE1.huecos.map(h => h.nombre), ['V1']);
    const v3 = v.FBE3.huecos.find(h => h.uid === 'u3');
    assert.equal(v3.marco, 'PVC');
    assert.equal(v3.ancho, 1.3);                    // con sus medidas
    assert.equal(ctx.muros.FBE1.huecos.length, 2);  // el original no se toca
});
prueba('un hueco a una MEDIANERA la pasa a exterior, con el rumbo de fuera, y lo dice', () => {
    const ctx = PLANO();
    const { pasos, errores } = A.validarOperaciones([{ op: 'mover_hueco', hueco: 'V3', pared: 'MBE1' }], ctx);
    assert.deepEqual(errores, []);
    assert.deepEqual(pasos.map(p => p.op), ['cambiar_pared', 'mover_hueco']);
    assert.equal(pasos[0].cambios.tipo, 'FACHADA');
    assert.equal(pasos[0].cambios.rumbo, 'O');
    assert.match(pasos[0].texto, /al vecino → al exterior/);
    const v = A.transformarMuros(ctx.muros, pasos);
    assert.equal(v.MBE1.tipo_manual, 'FACHADA');
    assert.equal(v.MBE1.huecos.length, 1);
});
prueba('«E2» es FBE2 (sin las dos letras de delante), y «cambiar_pared + anadir» no la cambia dos veces', () => {
    const { pasos, errores } = A.validarOperaciones([
        { op: 'cambiar_pared', pared: 'MBE1', tipo: 'FACHADA' },
        { op: 'anadir_hueco', pared: 'MBE1', tipo: 'puerta' },
        { op: 'anadir_hueco', pared: 'E2', tipo: 'ventana' },
    ], PLANO());
    assert.deepEqual(errores, []);
    assert.deepEqual(pasos.map(p => p.op), ['cambiar_pared', 'anadir_hueco', 'anadir_hueco']);
    assert.equal(pasos[2].pared, 'FBE2');
});
prueba('a una pared APARTADA no se mueve, y lo dice', () => {
    const ctx = PLANO();
    ctx.muros.MBE1 = { ...ctx.muros.MBE1, excluida: true };
    const { pasos, errores } = A.validarOperaciones([{ op: 'mover_hueco', hueco: 'V3', pared: 'MBE1' }], ctx);
    assert.equal(pasos.length, 0);
    assert.match(errores[0], /apartada/);
});
prueba('una pared que no existe no se inventa', () => {
    const { pasos, errores } = A.validarOperaciones([{ op: 'mover_hueco', hueco: 'V3', pared: 'FBE9' }], PLANO());
    assert.equal(pasos.length, 0);
    assert.match(errores[0], /no hay ninguna pared «FBE9»/);
});

console.log('Ejemplo 2: «el garaje llega hasta el final de la vivienda»');
prueba('por el este, hasta el borde: 12 × 4 m, en el mundo', () => {
    const ctx = PLANO();
    const { pasos, errores } = A.validarOperaciones(limpiar([
        { op: 'ajustar_zona', zona: 'Z1', lado: 'E', hasta_borde: true, metros: 0 }]), ctx);
    assert.deepEqual(errores, []);
    assert.match(pasos[0].texto, /por el E hasta el borde .* 20\.0 → 48\.0 m²/);
    const zonas = A.zonasAjustadas(ctx.zonas, pasos);
    assert.equal(zonas.length, 1);
    const xs = zonas[0].poligono.map(p => p[0] - T.dx), ys = zonas[0].poligono.map(p => T.y0 - p[1]);
    cerca(Math.min(...xs), 0); cerca(Math.max(...xs), 12); cerca(Math.min(...ys), 5); cerca(Math.max(...ys), 9);
    assert.equal(zonas[0].uso, 'GARAJE');
    assert.equal(A.tocaMuros(pasos), false);
});
prueba('y avisa ANTES de la pared con huecos que se queda debajo (FBE3, con P1)', () => {
    const { avisos } = A.validarOperaciones([{ op: 'ajustar_zona', zona: 'Z1', lado: 'E', hasta_borde: true }], PLANO());
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /FBE3 \(1 hueco\)/);
    const r = A.validarOperaciones([{ op: 'ajustar_zona', zona: 'Z1', lado: 'E', metros: 2 }], PLANO());
    assert.deepEqual(r.avisos, []);
});
prueba('por metros, y encoger', () => {
    const { pasos } = A.validarOperaciones([{ op: 'ajustar_zona', zona: 'Z1', lado: 'N', metros: -1 }], PLANO());
    assert.match(pasos[0].texto, /20\.0 → 15\.0 m²/);
});
prueba('nueva zona pegada al sur, y quitarla', () => {
    const ctx = PLANO();
    const { pasos } = A.validarOperaciones([{ op: 'nueva_zona', planta: 'P0', uso: 'PORCHE', lado: 'S', fondo: 2 },
                                            { op: 'quitar_zona', zona: 'Z1' }], ctx);
    const zonas = A.zonasAjustadas(ctx.zonas, pasos);
    assert.deepEqual(zonas.map(z => z.uso), ['PORCHE']);
    cerca(zonas[0].area_m2, 24, 0.1);
});

console.log('Ejemplo 3: «quita la aerotermia y pon el autoconsumo»');
prueba('las medidas cambian, y la no disponible no se pone', () => {
    const { pasos, errores } = A.validarOperaciones([{ op: 'medidas', fase: 'inicial',
        poner: ['autoconsumo', 'ventanas'], quitar: ['aerotermia'] }], PLANO());
    assert.match(errores[0], /Cambio de ventanas.*no hay presupuesto/);
    const med = A.medidasCambiadas(pasos);
    assert.deepEqual(med.elegidas, ['autoconsumo']);
    assert.match(med.texto, /\+ Autoconsumo · − Aerotermia/);
});

console.log('Lo demás');
prueba('los EJEMPLOS del panel llevan los nombres de este plano', () => {
    const conPared = A.ejemplosPara(PLANO());                     // FBE1 abierta
    assert.equal(conPared[0], 'Las ventanas de FBE1 son de PVC con persiana');
    assert.equal(conPared[1], 'FBE1 da al vecino: es medianera');
    assert.equal(conPared[2], 'El garaje llega hasta el fondo de la casa');
    assert.equal(conPared[3], 'Pon también la medida de autoconsumo');
    const sinPared = A.ejemplosPara({ ...PLANO(), sel: null, zonas: [] });
    assert.match(sinPared[0], /^La V1 no va en FBE1 sino en FBE2, y es de PVC$/);
    assert.match(sinPared[1], /Hay un garaje/);
    assert.ok(A.ejemplosPara(PLANO()).every(f => !/ventanas»|cambio de ventanas/i.test(f)));   // la no disponible, no
});
prueba('«FB1» con FBE1 y FBO1 a la vez: se avisa de cuál se ha elegido', () => {
    const muros = { ...PLANO().muros, FBO1: { id: 'FBO1', tipo: 'FACHADA', svg: [], huecos: [] } };
    const avisos = A.paredesAmbiguas('la V3 va en la FB1, y es de PC', muros);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /«FB1».*FBE1 o FBO1/);
    assert.deepEqual(A.paredesAmbiguas('la V3 va en la FBE1', muros), []);
});
prueba('lo que le falta a una zona por debajo de medio metro se dice 0', () => {
    const ctx = PLANO();
    ctx.zonas[0].poligono = [[0.3, 5], [5, 5], [5, 9], [0.3, 9]].map(mundo);
    assert.match(A.resumenCompacto(ctx), /O 0\.0 m/);
});
prueba('pasar a medianera una pared con huecos avisa; el nombre cambia de inicial', () => {
    const ctx = PLANO();
    const { pasos, errores } = A.validarOperaciones(limpiar([
        { op: 'cambiar_pared', pared: 'FBE2', tipo: 'MEDIANERA', rumbo: 'igual', apartar: 'igual' }]), ctx);
    assert.deepEqual(errores, []);
    const v = A.transformarMuros(ctx.muros, pasos);
    assert.equal(v.FBE2.tipo_manual, 'MEDIANERA');
    assert.equal(v.FBE2.nombre_manual, 'MBE2');
    const r = A.validarOperaciones([{ op: 'cambiar_pared', pared: 'FBE1', tipo: 'MEDIANERA' }], ctx);
    assert.match(r.errores[0], /tiene 2 hueco/);
});
prueba('medida dicha = medida confirmada', () => {
    const ctx = PLANO();
    const { pasos } = A.validarOperaciones(limpiar([{ op: 'medida_hueco', hueco: 'P1', ancho: 1, alto: 0 }]), ctx);
    const v = A.transformarMuros({ ...ctx.muros, FBE3: { ...ctx.muros.FBE3, huecos: [{ ...ctx.muros.FBE3.huecos[0], estado: 'dudoso' }] } }, pasos);
    assert.equal(v.FBE3.huecos[0].ancho, 1);
    assert.equal(v.FBE3.huecos[0].alto, 2.05);
    assert.equal(v.FBE3.huecos[0].estado, 'medido');
});
prueba('añadir sin medidas nace por confirmar, con nombre libre', () => {
    const { pasos } = A.validarOperaciones(limpiar([
        { op: 'anadir_hueco', pared: 'FBE2', tipo: 'ventana', ancho: 0, alto: 0, marco: 'igual' }]), PLANO());
    assert.equal(pasos[0].hueco.nombre, 'V2');
    assert.equal(pasos[0].hueco.estado, 'dudoso');
});
prueba('una ventana que no cabe en su pared se avisa ANTES', () => {
    const ctx = PLANO();
    ctx.muros.FBE2 = { ...ctx.muros.FBE2, largo: 0.16 };
    const { pasos, avisos } = A.validarOperaciones([{ op: 'anadir_hueco', pared: 'FBE2', tipo: 'ventana', ancho: 1.2, alto: 1.1 }], ctx);
    assert.equal(pasos.length, 1);
    assert.match(avisos[0], /FBE2 mide 0\.16 m .* 1\.20 m .* no caben/);
    assert.deepEqual(A.validarOperaciones([{ op: 'mover_hueco', hueco: 'V1', pared: 'FBE3' }], PLANO()).avisos, []);
    assert.ok(!A.ejemplosPara({ ...ctx, sel: 'FBE2' }).some(f => /falta una ventana/.test(f)));
});
prueba('lo que «ya está así» no es un paso', () => {
    const { pasos, errores } = A.validarOperaciones([{ op: 'cambiar_hueco', hueco: 'V1', ancho: 1.2 }], PLANO());
    assert.equal(pasos.length, 0);
    assert.match(errores[0], /ya está así/);
});

// ── Con Claude de verdad (cuesta ~0,0002 $ por frase): `--en-vivo` ───────────
if (process.argv.includes('--en-vivo')) {
    const { interpretar } = (await import(pathToFileURL(path.join(AQUI, '../services/asistenteEnvolvente.js')).href)).default;
    const ops = (p, op) => p.filter(x => x.op === op);
    const FRASES = [
        ['La ventana V3 no va en la fachada FB1 sino en la FB3, y es de PC',
         (p) => p.some(x => x.op === 'mover_hueco' && x.destino === 'FBE3') && p.some(x => x.cambios?.marco === 'PVC')],
        // Clara: NO se pide confirmación (la da el «Sí» de la pantalla).
        ['La V3 va en la FBE3', (p, r) => !r.pregunta && p.some(x => x.op === 'mover_hueco' && x.destino === 'FBE3')],
        ['El garaje llega hasta el final de la vivienda',
         (p, r) => (r.pregunta && !p.length) || p.some(x => x.op === 'ajustar_zona')],
        // La respuesta a esa pregunta, como la manda el panel.
        [null, (p) => p.some(x => x.op === 'ajustar_zona' && /por el E hasta el borde/.test(x.texto))],
        ['Cambia las medidas de mejora: quita la aerotermia y pon el autoconsumo',
         (p) => JSON.stringify(A.medidasCambiadas(p)?.elegidas) === '["autoconsumo"]'],
        ['Pon las placas y quita la bomba de calor',
         (p) => JSON.stringify(A.medidasCambiadas(p)?.elegidas) === '["autoconsumo"]'],
        ['Las ventanas de FBE1 tienen persiana y son de aluminio con rotura de puente térmico',
         (p) => ops(p, 'cambiar_hueco').length === 2
             && ops(p, 'cambiar_hueco').every(x => x.cambios.marco === 'Metálico con RPT' && x.cambios.persiana === true)],
        ['Falta una ventana de ciento veinte por ciento diez en la FBE2',
         (p) => p.some(x => x.op === 'anadir_hueco' && x.hueco.ancho === 1.2 && x.hueco.alto === 1.1)],
        ['La FBE2 da a la cochera, que no tiene calefacción',
         (p) => p.some(x => x.op === 'cambiar_pared' && x.cambios.tipo === 'PARTICION_VERTICAL')],
    ];
    let coste = 0;
    let anterior = null;   // { pedido, pregunta } para la respuesta
    console.log('\nCon Claude');
    for (const [frase, bien] of FRASES) {
        const texto = frase ?? `LO QUE PIDIÓ: «${anterior?.pedido}»\nTU PREGUNTA: «${anterior?.pregunta}»\nSU RESPUESTA: por el este`;
        const ctx = PLANO();
        const r = await interpretar({ texto, resumen: A.resumenCompacto(ctx), quien: 'test', obra: 'test' });
        if (!r.ok) { console.error(`  ✗ «${texto}»: ${r.error}`); process.exitCode = 1; continue; }
        const v = A.validarOperaciones(r.operaciones, ctx);
        coste += r.coste_usd || 0;
        anterior = r.pregunta ? { pedido: texto, pregunta: r.pregunta } : null;
        const vale = bien(v.pasos, r);
        console.log(`  ${vale ? '✓' : '✗'} «${texto.replace(/\n/g, ' · ')}» → ${r.modelo} ${r.coste_usd?.toFixed(5)} $ `
            + `· in ${r.uso?.entrada} + caché ${r.uso?.cache_lectura ?? 0}/${r.uso?.cache_escritura ?? 0} · out ${r.uso?.salida}`);
        for (const p of v.pasos) console.log(`      · ${p.texto}`);
        for (const e of [...v.errores, ...v.avisos]) console.log(`      ⚠ ${e}`);
        if (r.pregunta) console.log(`      ? ${r.pregunta}`);
        if (!vale) process.exitCode = 1;
    }
    console.log(`  Total: ${coste.toFixed(5)} $`);
}

console.log(`\n${ok} pruebas bien${process.exitCode ? ', ALGUNA MAL' : ''}.`);
