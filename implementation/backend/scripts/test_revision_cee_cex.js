#!/usr/bin/env node
/**
 * test_revision_cee_cex.js — las reglas de la revisión que salen del .cex.
 * Sin BD, sin Drive y sin motor: radiografías sintéticas.
 *
 *   node scripts/test_revision_cee_cex.js
 *
 * Cada regla está calibrada sobre los 143 CEE iniciales aprobados (29/09/2026):
 * si una prueba de aquí cambia, que sea porque cambió el criterio, no el código.
 */
const assert = require('assert');
const { revisarConCex, FECHA_GUIA } = require('../services/cee/revisionCeeCex');

let fallos = 0;
const t = (nombre, fn) => {
    try { fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
};

//: Lo que devuelve la guía para 1986 D3 (getUByYear) — no se importa aquí para
//: que la prueba no dependa del bundle del frontend.
const getUByYear = () => ({ wall: 1.8, roof: 1.9, floor: 1.05 });
const getVentanaYACHByYear = () => ({ ach: 0.83 });

function inf() {
    const puntos = [];
    return { puntos, anota: (id, titulo, estado, extra = {}) => puntos.push({ id, titulo, estado, ...extra }),
             de: (id) => puntos.find((p) => p.id === id) };
}

const rxXml = { identificacion: { anio_construccion: 1986, zona_climatica: 'D3' }, envolvente: { opacos: [] }, medidas: [] };

function cex(over = {}) {
    return {
        generales: { anio: 1986, zona_he1: 'D3', ventilacion: 0.83, superficie: 132, plantas: 1, altura_planta: 2.8, demanda_acs_l_dia: 140 },
        envolvente: {
            cerramientos: [
                { nombre: 'FBS1', tipo: 'Fachada', frontera: 'aire', u: 1.8, superficie: 60, modo: 'Conocidas' },
                { nombre: 'CUB1', tipo: 'Cubierta', frontera: 'aire', u: 1.9, superficie: 132, modo: 'Conocidas' },
                { nombre: 'SUB1', tipo: 'Suelo', frontera: 'terreno', u: 0.6, superficie: 132, modo: 'Por defecto' },
                { nombre: 'MED', tipo: 'Medianera', frontera: 'edificio', u: 0, superficie: 30 },
            ],
            huecos: [{ nombre: 'V1', tipo: 'Hueco', superficie: 9, multiplicador: 1 }],
            puentes: ['Encuentro de fachada con forjado', 'Contorno de hueco', 'Pilar integrado en fachada', 'Pilar en Esquina']
                .map((tipo) => ({ tipo })),
        },
        equipos: [{ nombre: 'CALDERA', slot: 'mixto2', generador: 'Caldera Estándar', combustible: 'Gasóleo-C',
                    servicios: { acs: { pct: 100 }, calefaccion: { pct: 100 } }, rend_estacional: { acs: 56.8, calefaccion: 56.8 },
                    caldera: { rend_combustion: 85, aislamiento: 'Antigua con mal aislamiento', potencia_kw: 24 }, acumulacion: null }],
        medidas: [{
            nombre: 'AEROTERMIA X', tipo: 'Nuevas Instalaciones', calculada: true, ahorro: [0, 0, 80], desfase: [],
            equipos: [{ nombre: 'AEROTERMIA DAIKIN ERLA11DAV3', slot: 'mixto2', generador: 'Bomba de Calor - Caudal Ref. Variable',
                        servicios: { acs: { pct: 100 }, calefaccion: { pct: 100 } }, rend_estacional: { acs: 300, calefaccion: 423 } }],
        }],
        informe: { emision: '19/09/2026' },
        version: 'CEXv2.3 Residencial', version_ce3x: '2.3',
        ...over,
    };
}

const ctx = (over = {}) => ({
    fase: 'inicial', ficha: 'RES060', getUByYear, getVentanaYACHByYear,
    fechaCertificado: '2026-09-19', anioOportunidad: 1986,
    esperado: { nombre: 'AEROTERMIA DAIKIN ERLA11DAV3', modelo: 'ERLA11DAV3', scopCal: 4.23, scopAcs: 3, hayAcs: true },
    ...over,
});

console.log('Transmitancias frente a la guía');
t('todas iguales → ok', () => { const i = inf(); revisarConCex(i, rxXml, cex(), ctx()); assert.strictEqual(i.de('transmitancias').estado, 'ok'); });
t('distinta y certificado posterior a la fecha de la guía → aviso', () => {
    const c = cex(); c.envolvente.cerramientos[0].u = 2.38;
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('transmitancias').estado, 'aviso');
});
t('distinta y certificado ANTERIOR a la guía → solo info', () => {
    const c = cex(); c.envolvente.cerramientos[0].u = 2.38;
    const i = inf(); revisarConCex(i, rxXml, c, ctx({ fechaCertificado: '2025-10-01' })); assert.strictEqual(i.de('transmitancias').estado, 'info');
    assert.ok(FECHA_GUIA === '2026-04-01');
});
t('el suelo «Por defecto» y la medianera NO cuentan', () => {
    const i = inf(); revisarConCex(i, rxXml, cex(), ctx()); assert.match(i.de('transmitancias').dice, /las 2 coinciden/);
});

console.log('Medida de mejora');
t('sin medida en RES060 → falla, con la acción de ponerla', () => {
    const i = inf(); revisarConCex(i, rxXml, cex({ medidas: [] }), ctx());
    assert.strictEqual(i.de('medida').estado, 'falla'); assert.strictEqual(i.de('medida').accion, 'poner_medida');
});
t('sin medida en RES080 → aviso', () => {
    const i = inf(); revisarConCex(i, rxXml, cex({ medidas: [] }), ctx({ ficha: 'RES080' })); assert.strictEqual(i.de('medida').estado, 'aviso');
});
t('sin calcular → falla', () => {
    const c = cex(); c.medidas[0].calculada = false;
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('medida_calculada').estado, 'falla');
});
t('calculada sobre otra versión del edificio → falla', () => {
    const c = cex(); c.medidas[0].desfase = ['superficie: 213.93 → 280.0'];
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('medida_desfase').estado, 'falla');
});
t('SCOP de la medida distinto del expediente → aviso', () => {
    const c = cex(); c.medidas[0].equipos[0].rend_estacional.calefaccion = 500;
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('medida_scop').estado, 'aviso');
});
t('SCOP y equipo iguales → ok', () => {
    const i = inf(); revisarConCex(i, rxXml, cex(), ctx());
    assert.strictEqual(i.de('medida_scop').estado, 'ok'); assert.strictEqual(i.de('medida_equipo').estado, 'ok'); assert.strictEqual(i.de('medida_acs').estado, 'ok');
});
t('otra máquina en la medida → aviso', () => {
    const c = cex(); c.medidas[0].equipos[0].nombre = 'AEROTERMIA PANASONIC WH-UD09';
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('medida_equipo').estado, 'aviso');
});
t('ACS de la medida sin cubrir al 100 % → falla', () => {
    const c = cex(); c.medidas[0].equipos[0].servicios.acs.pct = 50;
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('medida_reparto_acs').estado, 'falla');
});
t('hibridación: la bomba con el C_b', () => {
    const c = cex(); c.medidas[0].equipos[0].servicios.calefaccion.pct = 79;
    const i = inf(); revisarConCex(i, rxXml, c, ctx({ esperado: { ...ctx().esperado, hibridacion: true, pctCal: 79 } }));
    assert.strictEqual(i.de('medida_cb').estado, 'ok');
});
t('en el CEE FINAL no se revisa la medida', () => {
    const i = inf(); revisarConCex(i, rxXml, cex({ medidas: [] }), ctx({ fase: 'final' })); assert.strictEqual(i.de('medida'), undefined);
});

console.log('Huecos, puentes y generales');
t('sin huecos → falla', () => {
    const c = cex(); c.envolvente.huecos = [];
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('huecos').estado, 'falla');
});
t('huecos por encima del 45 % de la fachada → aviso', () => {
    const c = cex(); c.envolvente.huecos[0].superficie = 40;
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('huecos').estado, 'aviso');
});
t('falta un puente básico → aviso', () => {
    const c = cex(); c.envolvente.puentes = c.envolvente.puentes.slice(1);
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('puentes').estado, 'aviso');
});
t('año distinto de la simulación → aviso', () => {
    const i = inf(); revisarConCex(i, rxXml, cex(), ctx({ anioOportunidad: 1990 })); assert.strictEqual(i.de('anio').estado, 'aviso');
});
t('el cliente confirmó aires y el inicial no los recoge → aviso', () => {
    const i = inf(); revisarConCex(i, rxXml, cex(), ctx({ confirmacion: { aire_acondicionado: true, num_aires: 2 } }));
    assert.strictEqual(i.de('aires').estado, 'aviso');
});
t('la caldera y el depósito se enseñan, no cuentan', () => {
    const i = inf(); revisarConCex(i, rxXml, cex(), ctx());
    assert.strictEqual(i.de('caldera_cex').estado, 'info'); assert.strictEqual(i.de('acumulacion_acs').estado, 'info');
});

console.log('La versión de CE3X');
t('2.3 emitido antes del 01/10/2026 → ok', () => {
    const i = inf(); revisarConCex(i, rxXml, cex(), ctx()); assert.strictEqual(i.de('version_ce3x').estado, 'ok');
});
t('2.3 emitido después → aviso, y dice que el final ya sale en la 3.1', () => {
    const i = inf(); revisarConCex(i, rxXml, cex({ informe: { emision: '02/10/2026' } }), ctx({ fechaCertificado: '2026-10-02' }));
    const p = i.de('version_ce3x');
    assert.strictEqual(p.estado, 'aviso'); assert.match(p.detalle, /3\.1/);
});
t('3.1 con sus datos generales → ok', () => {
    const c = cex({ version: 'CE3Xv3.1 Residencial', version_ce3x: '3.1' });
    c.generales = { ...c.generales, superficie_util: 132, unidades_uso: 1, plantas_sobre_rasante: 1 };
    const i = inf(); revisarConCex(i, rxXml, c, ctx()); assert.strictEqual(i.de('version_ce3x').estado, 'ok');
});
t('3.1 sin el nº de viviendas → aviso (la 3.1 no califica sin él)', () => {
    const c = cex({ version: 'CE3Xv3.1 Residencial', version_ce3x: '3.1' });
    c.generales = { ...c.generales, superficie_util: 132, plantas_sobre_rasante: 1 };
    const i = inf(); revisarConCex(i, rxXml, c, ctx());
    assert.strictEqual(i.de('version_ce3x').estado, 'aviso'); assert.match(i.de('version_ce3x').dice, /viviendas/);
});
t('una cabecera desconocida → aviso', () => {
    const i = inf(); revisarConCex(i, rxXml, cex({ version: 'CEXv9.9', version_ce3x: null }), ctx());
    assert.strictEqual(i.de('version_ce3x').estado, 'aviso');
});

(async () => {
    console.log('Sin .xml y la copia del borrador');
    const { revisarCee } = require('../services/cee/revisionCee');
    const res = await revisarCee({ radiografia: null, cex: cex({ medidas: [] }),
                                   expediente: { numero_expediente: '26RES060_999' }, fase: 'inicial' });
    t('solo .cex → NO APTO y dice que falta el .xml', () => {
        assert.strictEqual(res.veredicto, 'NO APTO');
        assert.strictEqual(res.comprobaciones.find((p) => p.id === 'xml').estado, 'falla');
    });
    t('y revisa igual lo que se ve en el .cex (huecos)', () => {
        assert.ok(res.comprobaciones.some((p) => p.id === 'huecos'));
    });
    const { matchSlot } = require('../services/ceeUploadService');
    t('la copia de Drive «_REVISAR (1).cex» NO es la entrega del técnico', () => {
        assert.strictEqual(matchSlot('26RES060_196 - CEE INICIAL_REVISAR (1).cex'), null);
        assert.strictEqual(matchSlot('26RES060_196 – CEE INICIAL.cex'), 'cex');
    });
    t('ni el «_REVISAR.xml» del borrador (26RES060_186 tenía los dos .xml)', () => {
        assert.strictEqual(matchSlot('26RES060_186 - CEE FINAL_REVISAR.xml'), null);
        assert.strictEqual(matchSlot('26RES060_186 - CEE FINAL_REVISAR (1).xml'), null);
        assert.strictEqual(matchSlot('26RES060_186 – CEE FINAL.xml'), 'xml');
    });
    console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo en orden.');
    process.exit(fallos ? 1 : 0);
})();
