#!/usr/bin/env node
// ============================================================================
// test_video_envolvente.js — lo DETERMINISTA de la lectura de un vídeo de la
// vivienda (skill `generar-cee-inicial`, orden `video` y `pedir-fotos`).
//
//   node implementation/backend/scripts/test_video_envolvente.js
//
// Sin red, sin BD y sin modelo: se prueban las reglas que deciden a qué pared va
// cada ventana, cuándo NO se decide, y el mensaje que se le manda al propietario.
// Los casos salen de lo medido en 26RES060_197 y _199 (06/10/2026).
// ============================================================================
const assert = require('assert');
const v = require('../services/videoEnvolventeService');
const u = require('../utils/videoEnvolvente');
const rec = require('../services/recordatorios');

let ok = 0, mal = 0;
function prueba(nombre, fn) {
    try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
    catch (e) { mal++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
}

// ─── Un plano de mentira, con la forma de `geo.plantas[].muros` ─────────────
// Casa rectangular de 11 × 7 m girada 45° (como la de 26RES060_197): calle al
// SO, patio al SE, espacio libre al NO, medianera al NE en planta baja y calle
// al NE en la primera. Coordenadas del LIENZO (la Y hacia abajo).
const muro = (id, nivel, tipo, subtipo, orientacion, largo, svg) =>
    ({ id, nivel, planta: nivel ? `P${nivel}` : 'PB', tipo, subtipo, orientacion, largo, alto: 2.8, svg });
// En el mundo: SO va de (0,0) a (8,-8)… se dan ya en lienzo (y invertida).
const A = [0, 0], B = [7.8, 7.8], C = [12.7, 2.9], D = [4.9, -4.9];
const MUROS = [
    muro('FBSO1', 0, 'FACHADA', 'CALLE', 'SO', 11.0, [A, B]),
    muro('FBSE1', 0, 'FACHADA', 'PATIO', 'SE', 6.9, [B, C]),
    muro('MBNE1', 0, 'MEDIANERA', 'EDIFICIO_COLINDANTE', 'NE', 11.0, [C, D]),
    muro('FBNO1', 0, 'FACHADA', 'ESPACIO_LIBRE_PARCELA', 'NO', 6.9, [D, A]),
    muro('F1SO1', 1, 'FACHADA', 'CALLE', 'SO', 11.0, [A, B]),
    muro('F1SE1', 1, 'FACHADA', 'PATIO', 'SE', 6.9, [B, C]),
    muro('F1NE1', 1, 'FACHADA', 'CALLE', 'NE', 11.0, [C, D]),
    muro('F1NE2', 1, 'FACHADA', 'CALLE', 'NE', 0.12, [D, [4.85, -4.95]]),
    muro('F1NO1', 1, 'FACHADA', 'ESPACIO_LIBRE_PARCELA', 'NO', 6.9, [D, A]),
];

console.log('\nMarcas de tiempo');
prueba('«MM:SS» y «MM:SS.s» se leen en segundos', () => {
    assert.strictEqual(v.segundosDe('01:07'), 67);
    assert.strictEqual(v.segundosDe('01:07.5'), 67.5);
    assert.strictEqual(v.segundosDe('0:01:07'), 67);
});
prueba('un «352» en un vídeo de 236 s es 3:52, no 352 s (el error medido en OP208)', () => {
    assert.strictEqual(v.segundosDe('352', 236), 232);
    assert.strictEqual(v.segundosDe(120, 236), 120);
    assert.strictEqual(v.segundosDe('999', 236), null);
});

console.log('\nNormalizar la lectura');
const lecturaBruta = {
    tipo_recorrido: 'interior',
    estancias: [{ id: 'E1', nombre: 'salón', planta: 0, video: 1, t_desde: '00:00', t_hasta: '00:20' },
                { id: 'E2', nombre: 'garaje', planta: 0, video: 1, t_desde: '03:30', t_hasta: '03:56' }],
    huecos: [
        { id: 'H1', video: 1, t: '00:03', desde: 'interior', estancia: 'E1', planta: 0, tipo: 'ventana',
          da_a: 'calle', ancho_m: 1.2, alto_m: 1.2, medida_referencia: 'radiador de 15 elementos debajo' },
        { id: 'H2', video: 1, t: '00:05', tipo: 'ventana', planta: 0, da_a: 'interior' },
        { id: 'H3', video: 1, t: '00:06', tipo: 'ventana', planta: 0, repetido_de: 'H1' },
        { id: 'H4', video: 1, t: '00:30', tipo: 'balconera', planta: 1, ancho_m: 1.4, alto_m: 2.0 },
        { id: 'H5', video: 1, t: '00:40', tipo: 'ventana', planta: 1, ancho_m: 7, alto_m: 1, medida_referencia: 'x' },
        { id: 'H6', video: 1, t: '09:00', tipo: 'ventana', planta: 0 },
    ],
    narracion: [{ video: 1, t: '00:01', texto: 'este es el salón' }],
};
const norm = v.normalizar(lecturaBruta, [{ duracion_s: 236 }]);
prueba('una repetición y lo que da a un espacio interior no son huecos', () => {
    assert.deepStrictEqual(norm.huecos.map(h => h.id), ['H1', 'H4', 'H5', 'H6']);
    assert.ok(norm.avisos.some(a => /H2.*interior/.test(a)));
});
prueba('una medida sin REFERENCIA no vale (es un tamaño «típico» con apariencia de medida)', () => {
    const h4 = norm.huecos.find(h => h.id === 'H4');
    assert.strictEqual(h4.ancho, null);
    assert.ok(norm.avisos.some(a => /H4.*referencia/.test(a)));
});
prueba('una medida implausible no vale aunque traiga referencia', () => {
    assert.strictEqual(norm.huecos.find(h => h.id === 'H5').ancho, null);
});
prueba('la medida con referencia y plausible se conserva', () => {
    const h1 = norm.huecos.find(h => h.id === 'H1');
    assert.deepStrictEqual([h1.ancho, h1.alto], [1.2, 1.2]);
});
prueba('un segundo que se pasa del final no se recorta: se descarta y se dice', () => {
    assert.strictEqual(norm.huecos.find(h => h.id === 'H6').t, null);
    assert.ok(norm.avisos.some(a => /H6.*segundo/.test(a)));
});

console.log('\nLas dos lecturas (vídeo y fotograma)');
const base = [
    { id: 'A', da_a: 'patio' }, { id: 'B', da_a: 'calle' }, { id: 'C', da_a: null },
    { id: 'D', da_a: 'calle' }, { id: 'E', da_a: 'patio' }, { id: 'F', da_a: 'patio' },
];
const lect = {
    A: { se_ve_el_hueco: true, es_hueco_exterior: true, se_ve_el_exterior: true, da_a: 'patio' },
    B: { se_ve_el_hueco: true, es_hueco_exterior: true, se_ve_el_exterior: false, da_a: null },
    C: { se_ve_el_hueco: true, es_hueco_exterior: true, se_ve_el_exterior: true, da_a: 'calle' },
    D: { se_ve_el_hueco: true, es_hueco_exterior: true, se_ve_el_exterior: true, da_a: 'patio' },
    E: { se_ve_el_hueco: true, es_hueco_exterior: false, se_ve_el_exterior: false, da_a: null },
};
const r = v.reconciliar(base, lect);
const de = id => r.huecos.find(h => h.id === id);
prueba('las dos de acuerdo → se queda, «las dos lecturas»', () => {
    assert.strictEqual(de('A').da_a, 'patio'); assert.strictEqual(de('A').da_a_fuente, 'las dos lecturas');
});
prueba('persiana bajada en el fotograma → lo que dijo el vídeo NO se sostiene (26RES060_197, el salón)', () => {
    assert.strictEqual(de('B').da_a, null); assert.strictEqual(de('B').da_a_fuente, 'no se ve el exterior');
});
prueba('el vídeo no sabe y el fotograma sí → se queda el del fotograma', () => {
    assert.strictEqual(de('C').da_a, 'calle'); assert.strictEqual(de('C').da_a_fuente, 'el fotograma');
});
prueba('dicen cosas distintas → no se decide', () => {
    assert.strictEqual(de('D').da_a, null); assert.strictEqual(de('D').da_a_fuente, 'discrepan');
});
prueba('el fotograma dice que no es un hueco de fachada → fuera', () => {
    assert.strictEqual(de('E'), undefined);
});
prueba('sin fotograma → lo del vídeo, marcado «solo el vídeo»', () => {
    assert.strictEqual(de('F').da_a_fuente, 'solo el vídeo');
});

console.log('\nLados del plano');
const lados = u.ladosDePlano(MUROS);
const ladoDe = id => lados.find(l => l.muros.some(m => m.id === id));
prueba('las plantas apiladas son el MISMO lado; la medianera no es lado', () => {
    assert.strictEqual(ladoDe('FBSO1').id, ladoDe('F1SO1').id);
    assert.strictEqual(ladoDe('FBSE1').id, ladoDe('F1SE1').id);
    assert.strictEqual(ladoDe('MBNE1'), undefined);
    assert.strictEqual(lados.length, 4);
});
prueba('un quiebro de 12 cm va con su lado y nunca recibe huecos', () => {
    assert.strictEqual(ladoDe('F1NE2').id, ladoDe('F1NE1').id);
    assert.strictEqual(u.muroEnNivel(ladoDe('F1NE1'), 1).id, 'F1NE1');
});

console.log('\nA qué pared va cada hueco');
const H = (id, extra) => ({ id, tipo: 'ventana', desde: 'interior', da_a_fuente: 'las dos lecturas', ...extra });
const asig = u.asignarHuecos({ huecos: [
    H('C0', { planta: 0, da_a: 'calle' }),
    H('P0', { planta: 0, da_a: 'patio' }),
    H('N0', { planta: 0, da_a: null }),
    H('C1', { planta: 1, da_a: 'calle' }),
    H('E0', { planta: 0, tipo: 'puerta_entrada', da_a: null }),
    H('G0', { planta: 0, estancia: 'E2', da_a: 'patio' }),
    H('X1', { planta: 0, da_a: 'calle', da_a_fuente: 'solo el vídeo' }),
    { id: 'L1', tipo: 'lucernario', planta: 1 },
    { id: 'PG', tipo: 'puerta_garaje', planta: 0 },
] }, lados, { niveles: [0, 1], entrada: 'FBSE1', estancias: [{ id: 'E2', nombre: 'garaje' }] });
const a = id => asig.huecos.find(h => h.id === id);
prueba('la única fachada de la planta que da a la calle → esa, con las dos lecturas «alta»', () => {
    assert.strictEqual(a('C0').estado, 'asignado'); assert.strictEqual(a('C0').pared, 'FBSO1');
    assert.strictEqual(a('C0').confianza, 'alta');
});
prueba('PATIO y ESPACIO LIBRE valen lo mismo: con los dos posibles NO se elige (26RES060_197)', () => {
    assert.strictEqual(a('P0').estado, 'dudoso');
    assert.deepStrictEqual(a('P0').candidatas.map(c => c.pared).sort(), ['FBNO1', 'FBSE1']);
});
prueba('sin saber a qué da y con varias fachadas → dudoso', () => {
    assert.strictEqual(a('N0').estado, 'dudoso');
});
prueba('en la primera hay DOS fachadas a la calle → dudoso', () => {
    assert.strictEqual(a('C1').estado, 'dudoso');
});
prueba('la puerta de entrada va a la pared señalada como entrada', () => {
    assert.strictEqual(a('E0').pared, 'FBSE1'); assert.strictEqual(a('E0').confianza, 'alta');
});
prueba('lo que se ve desde el garaje no se pone, y la puerta del garaje tampoco', () => {
    assert.ok(asig.descartados.some(d => d.id === 'G0'));
    assert.ok(asig.descartados.some(d => d.id === 'PG'));
});
prueba('lo que dice uno solo de los dos modelos se pone, pero con confianza MEDIA', () => {
    assert.strictEqual(a('X1').estado, 'asignado'); assert.strictEqual(a('X1').confianza, 'media');
});
prueba('el lucernario va a la cubierta, no a una pared', () => {
    assert.ok(asig.lucernarios.some(l => l.id === 'L1' && l.nivel === 1));
});

prueba('el vídeo ve una planta que el plano no tiene → la más cercana, todo «media» y se avisa', () => {
    const r2 = u.asignarHuecos({ huecos: [H('Z', { planta: 2, da_a: 'calle' }), H('Y', { planta: 0, da_a: 'calle' })] },
                               lados, { niveles: [0, 1] });
    assert.strictEqual(r2.huecos.find(h => h.id === 'Z').nivel, 1);
    assert.strictEqual(r2.huecos.find(h => h.id === 'Y').confianza, 'media');
    assert.ok(r2.avisos.some(x => /plantas/.test(x)));
});
prueba('un hueco visto desde fuera en una fachada ya identificada hereda su pared', () => {
    const r3 = u.asignarHuecos({ huecos: [H('F', { planta: 1, desde: 'exterior', fachada: 'F9', da_a: null })] },
                               lados, { niveles: [0, 1], fachadas: { F9: ladoDe('F1NO1').id } });
    assert.strictEqual(r3.huecos[0].pared, 'F1NO1');
});

console.log('\nQué se pide');
const est = u.estadoDeLados(lados, asig);
prueba('lo que tiene huecos dudosos o no se ve se pide; lo resuelto, no', () => {
    const pedidos = est.pedir.map(l => l.id);
    assert.ok(pedidos.includes(ladoDe('FBSE1').id));     // dudoso
    assert.ok(pedidos.includes(ladoDe('F1NE1').id));     // sin ver
});
prueba('lo asignado solo con confianza media queda «por confirmar», no se pide solo', () => {
    const solo = u.estadoDeLados(lados, { huecos: [{ id: 'X', estado: 'asignado', pared: 'FBSO1', confianza: 'media' }] });
    assert.strictEqual(solo.lados.find(l => l.id === ladoDe('FBSO1').id).estado, 'por_confirmar');
    assert.ok(!solo.pedir.some(l => l.id === ladoDe('FBSO1').id));
    assert.ok(solo.confirmar.some(l => l.id === ladoDe('FBSO1').id));
});
prueba('si los huecos no caben en la pared, se dice y se pide', () => {
    const lleno = { huecos: [1, 2, 3, 4, 5, 6].map(i => ({ id: `W${i}`, estado: 'asignado', pared: 'FBSE1', tipo: 'ventana', confianza: 'alta' })) };
    assert.ok(u.capacidad(lleno.huecos, lados).some(c => c.pared === 'FBSE1'));
    assert.strictEqual(u.estadoDeLados(lados, lleno).lados.find(l => l.id === ladoDe('FBSE1').id).estado, 'no_caben');
});

prueba('una pared de menos de 1,5 m no se pide aunque esté en duda (26RES060_OP260: 0,98 m)', () => {
    const corto = u.ladosDePlano([
        muro('FBN1', 0, 'FACHADA', 'CALLE', 'N', 9.9, [[0, 0], [9.9, 0]]),
        muro('FBE1', 0, 'FACHADA', 'CALLE', 'E', 0.98, [[9.9, 0], [9.9, 0.98]]),
    ]);
    const e = u.estadoDeLados(corto, { huecos: [{ id: 'Q', estado: 'dudoso',
        candidatas: corto.map(l => ({ lado: l.id, pared: l.muros[0].id })) }] });
    assert.deepStrictEqual(e.pedir.map(l => l.muros[0].id), ['FBN1']);
    assert.deepStrictEqual(e.sinPedir.map(l => l.muros[0].id), ['FBE1']);
});
prueba('una pared más estrecha que la ventana no es candidata', () => {
    const corto = u.ladosDePlano([
        muro('FBN1', 0, 'FACHADA', 'CALLE', 'N', 9.9, [[0, 0], [9.9, 0]]),
        muro('FBE1', 0, 'FACHADA', 'CALLE', 'E', 0.98, [[9.9, 0], [9.9, 0.98]]),
    ]);
    const r4 = u.asignarHuecos({ huecos: [H('W', { planta: 0, da_a: 'calle', ancho: 1.4, alto: 1.2 })] }, corto, { niveles: [0] });
    assert.strictEqual(r4.huecos[0].estado, 'asignado');
    assert.strictEqual(r4.huecos[0].pared, 'FBN1');
});
prueba('UNA petición por lado, no por planta (26RES060_197: 4 lados, no 7 tomas)', () => {
    const plan = { tomas: [
        { id: 'T01', titulo: 'Tu casa vista desde la calle', muros: ['FBSO1'], plano_datos: 'data:image/png;base64,QUJD' },
        { id: 'T02', titulo: 'La pared de fuera que da al Suroeste', muros: ['F1SO1'], plano_datos: 'data:image/png;base64,REVG' },
        { id: 'T03', titulo: 'Patio 1', muros: ['F1SE1'], plano_datos: 'data:image/png;base64,R0hJ' },
    ] };
    const pet = u.peticionesPorLado(est.pedir, plan, { direccion: 'CL MAYOR 1' });
    assert.strictEqual(pet.length, est.pedir.length);
    const sp = pet.find(p => p.muros.includes('FBSE1'));
    assert.ok(/patio/.test(sp.titulo) && /Sureste/.test(sp.titulo));
    assert.ok(/2 plantas/.test(sp.subtitulo));
    assert.strictEqual(sp.toma, 'T03');                     // el plano de su tramo más largo con toma
    assert.strictEqual(sp.slot, 'FOTO_PATIOS_INTERIORES');
});

console.log('\nLa propuesta para el plan');
prueba('solo lo ASIGNADO, con su fotograma, su caja y nace dudoso', () => {
    const plan = u.huecosParaPlan({ huecos: [
        { id: 'H1', estado: 'asignado', pared: 'FBSO1', tipo: 'ventana', t: 3, ancho: 1.2, alto: 1.2,
          medida_referencia: 'radiador', motivo: 'm', box: { x: 0.1, y: 0.1, ancho: 0.3, alto: 0.4 }, persiana: true },
        { id: 'H2', estado: 'dudoso', pared: null, tipo: 'ventana' },
        { id: 'H3', estado: 'asignado', pared: 'FBSE1', tipo: 'puerta_patio', t: 65, motivo: 'm' },
    ] });
    assert.deepStrictEqual(Object.keys(plan).sort(), ['FBSE1', 'FBSO1']);
    assert.strictEqual(plan.FBSO1[0].foto, 'frame:H1');
    assert.ok(plan.FBSO1[0].box);
    assert.strictEqual(plan.FBSE1[0].tipo, 'puerta');
    assert.strictEqual(plan.FBSE1[0].porc_marco, 35);
    assert.deepStrictEqual([plan.FBSE1[0].ancho, plan.FBSE1[0].alto], [0.9, 2.1]);  // por defecto
    assert.ok(/1:05/.test(plan.FBSE1[0].por_que));
});

// ─── Lo que DICE quien graba (el audio transcrito) ──────────────────────────
// Caso de 26RES060_226 (09/10/2026): la propietaria graba los patios por fuera
// y dice «y este sería un patio de luces… con dos ventanas, que son dos baños».
console.log('\nEl AUDIO: la transcripción');
const transcrita = v.normalizarTranscripcion({ frases: [
    { t: '00:40', t_fin: '00:42.5', texto: 'Y este sería un patio de luces', menciona: { da_a: 'patio' } },
    { t: '00:44', t_fin: '00:48', texto: 'con dos ventanas, que son dos baños', menciona: { cuantos: 2, huecos: ['ventana'] } },
    { t: '00:37', texto: 'Lo que da a la terraza.', menciona: { da_a: 'terraza' } },
    { t: '00:50', texto: '[inaudible]' },
    { t: '02:10', texto: 'esto no cabe en el vídeo' },
    { t: '00:55', texto: 'da al salón', menciona: { da_a: 'interior' } },
] }, 60);
prueba('ordena por segundo, quita lo inaudible y lo que se sale del vídeo', () => {
    assert.deepStrictEqual(transcrita.frases.map(f => f.t), [37, 40, 44, 55]);
    assert.strictEqual(transcrita.sin_voz, false);
});
prueba('sin final, se estima lo que se tarda en decirla; el «da a» va de la lista cerrada', () => {
    const t = transcrita.frases.find(f => f.t === 37);
    assert.ok(t.t_fin > 37 && t.t_fin <= 43);
    assert.strictEqual(transcrita.frases.find(f => f.t === 55).menciona.da_a, null);   // «interior» no es exterior
    assert.strictEqual(transcrita.frases.find(f => f.t === 40).menciona.da_a, 'patio');
});
prueba('sin voz: lista vacía y se dice', () => {
    assert.strictEqual(v.normalizarTranscripcion({ frases: [] }, 30).sin_voz, true);
});

console.log('\nEl AUDIO junto a cada hueco');
const frases = transcrita.frases.map(f => ({ ...f, video: 1 }));
prueba('lo que se oye de 6 s antes a 4 s después del segundo del hueco', () => {
    assert.deepStrictEqual(u.frasesCerca(frases, 46, { video: 1 }).map(f => f.t), [40, 44]);
    assert.deepStrictEqual(u.frasesCerca(frases, 46, { video: 2 }), []);       // otro vídeo, nada
    assert.deepStrictEqual(u.frasesCerca(frases, 20, { video: 1 }), []);
});
prueba('persiana bajada (no se ve) + lo dice quien graba → vale lo dicho, sin ser firme', () => {
    const r = u.conLoDicho([{ id: 'H8', t: 46, video: 1, da_a: null, da_a_fuente: 'no se ve el exterior' }], frases);
    assert.strictEqual(r.huecos[0].da_a, 'patio');
    assert.strictEqual(r.huecos[0].da_a_fuente, 'lo dice quien graba');
    assert.ok(/patio de luces/.test(r.huecos[0].dice));
    assert.strictEqual(u.daAFirme(r.huecos[0]), false);
});
prueba('lo visto y lo dicho COINCIDEN (patio = jardín) → firme', () => {
    const r = u.conLoDicho([{ id: 'H9', t: 46, video: 1, da_a: 'jardin', da_a_fuente: 'solo el vídeo' }], frases);
    assert.strictEqual(r.huecos[0].dicho_coincide, true);
    assert.strictEqual(u.daAFirme(r.huecos[0]), true);
    assert.ok(/lo dice quien graba/.test(r.huecos[0].da_a_fuente));
});
prueba('lo dicho CONTRADICE lo visto → no se decide y se avisa', () => {
    const r = u.conLoDicho([{ id: 'H2', t: 46, video: 1, da_a: 'calle', da_a_fuente: 'las dos lecturas' }], frases);
    assert.strictEqual(r.huecos[0].da_a, null);
    assert.strictEqual(r.avisos.length, 1);
});
prueba('dos cosas distintas nombradas cerca del hueco → solo se enseña, no decide', () => {
    const r = u.conLoDicho([{ id: 'H3', t: 39, video: 1, da_a: null }], frases);   // «terraza» y «patio»
    assert.strictEqual(r.huecos[0].da_a, null);
    assert.ok(r.huecos[0].dice);
    assert.strictEqual(r.avisos.length, 1);
});
prueba('sin frases cerca, el hueco no cambia', () => {
    const h = { id: 'H1', t: 5, video: 1, da_a: 'calle', da_a_fuente: 'las dos lecturas' };
    assert.strictEqual(u.conLoDicho([h], frases).huecos[0], h);
});
prueba('asignarHuecos: lo visto + lo dicho de acuerdo da confianza ALTA', () => {
    // Planta baja del plano de mentira: una sola fachada a la CALLE (FBSO1).
    const dichas = [{ video: 1, t: 10, t_fin: 12, texto: 'esta es la del salón, que da a la calle',
                      menciona: { da_a: 'calle' } }];
    const solo = u.asignarHuecos({ huecos: [{ id: 'H5', t: 12, video: 1, planta: 0, tipo: 'ventana', da_a: 'calle',
                                              da_a_fuente: 'solo el vídeo' }] }, lados);
    assert.strictEqual(solo.huecos[0].confianza, 'media');            // un solo modelo: por confirmar
    const { huecos } = u.conLoDicho([{ id: 'H5', t: 12, video: 1, planta: 0, tipo: 'ventana', da_a: 'calle',
                                      da_a_fuente: 'solo el vídeo' }], dichas);
    const a = u.asignarHuecos({ huecos }, lados);
    assert.strictEqual(a.huecos[0].pared, 'FBSO1');
    assert.strictEqual(a.huecos[0].estado, 'asignado');
    assert.strictEqual(a.huecos[0].confianza, 'alta');
});
prueba('el porqué del plan lleva lo que se dice', () => {
    const plan = u.huecosParaPlan({ huecos: [{ id: 'H8', estado: 'asignado', pared: 'FBSE1', tipo: 'ventana', t: 46,
                                               motivo: 'm', dice: 'Y este sería un patio de luces' }] });
    assert.ok(/dice: «Y este sería un patio de luces»/.test(plan.FBSE1[0].por_que));
});

console.log('\nEl mensaje al propietario');
const paredes = [{ titulo: 'Tu casa vista desde la calle', subtitulo: 'Ponte en la acera.' },
                 { titulo: 'La pared que da al patio', subtitulo: 'Mide unos 7 m.' }];
const msg = rec.paredesFotosMsg({ destinatario: 'ANA GARCÍA', numExp: '26RES060_1',
    obra: { cliente: 'ANA GARCÍA', direccion: 'CL MAYOR 1, ALMAGRO' }, paredes, url: 'https://x/subir' });
prueba('numera las paredes y pide decir el NÚMERO de cada foto (si no, no se sabe cuál es cuál)', () => {
    assert.ok(/1\. \*Tu casa vista desde la calle\*/.test(msg));
    assert.ok(/2\. \*La pared que da al patio\*/.test(msg));
    assert.ok(/diciendo el número/.test(msg));
});
prueba('«no tiene ventanas» es una respuesta válida, y se dice', () => {
    assert.ok(/no tiene ventanas ni puertas/.test(msg));
});
prueba('dice por qué (el vídeo) y lleva la firma de la casa', () => {
    assert.ok(/vídeo que nos mandaste/.test(msg));
    assert.ok(msg.trim().endsWith(rec.FIRMA));
});
prueba('a la persona de contacto se le habla de la vivienda del titular', () => {
    const m2 = rec.paredesFotosMsg({ destinatario: 'JUAN', tercero: true,
        obra: { cliente: 'ANA GARCÍA', direccion: 'CL MAYOR 1' }, paredes: paredes.slice(0, 1) });
    assert.ok(/vivienda de \*Ana García\*/.test(m2));
    assert.ok(/Mándanosla por este mismo WhatsApp\./.test(m2));
});

console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
