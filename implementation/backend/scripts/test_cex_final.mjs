#!/usr/bin/env node
/**
 * El generador del CEE FINAL: qué equipo se escribe y cuál NO.
 *
 *   node implementation/backend/scripts/test_cex_final.mjs
 *
 * Sin BD, sin Drive y sin motor: aquí vive el JUICIO —qué es un solo equipo
 * mixto, cuándo el rendimiento es conocido, qué se niega a escribir— y es lo
 * único que no se ve mirando el `.cex` que sale.
 *
 * El caso de referencia es 26RES060_186, comparado campo a campo contra el
 * `.cex` que el certificador guardó a mano desde CE3X: de los 10 campos del
 * registro coinciden 9 (el décimo es el depósito de ACS, que el expediente no
 * declara y por eso sale sin acumulación, avisando).
 */
import { pathToFileURL } from 'url';
import path from 'path';

const raiz = path.join(import.meta.dirname, '../../frontend/src/features');
const { instalacionNueva } = await import(
    pathToFileURL(path.join(raiz, 'cee-envolvente/logic/fichaCe3x.js')).href);
const { acsMismoEquipo, mismaMaquina } = await import(
    pathToFileURL(path.join(raiz, 'expedientes/logic/aerotermiaUnits.js')).href);

let fallos = 0;
const comprueba = (que, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) { fallos++; console.log(`  MAL  ${que}\n       esperado ${JSON.stringify(esperado)}\n       salió    ${JSON.stringify(real)}`); }
    else console.log(`  ok   ${que}`);
};

//: El equipo tal y como está en 26RES060_186: la MISMA máquina del catálogo
//: (id 447) en los dos nodos, con su SCOP de calefacción y su SCOP_dhw.
const PANASONIC = {
    aerotermia_db_id: 447, marca: 'PANASONIC',
    modelo: 'AQUAREA HIGH PERFORMANCE SERIE M R290',
    modelo_ud_exterior: 'WH-WDG16ME5',
};
const expediente = (inst = {}) => ({
    numero_expediente: '26RES060_186',
    instalacion: {
        tipo_emisor: 'radiadores_convencionales',
        cambio_acs: true,
        misma_aerotermia_acs: false,
        aerotermia_cal: { ...PANASONIC, scop: 4.34 },
        aerotermia_acs: { ...PANASONIC, scop: 3 },
        ...inst,
    },
    cee: { cee_inicial: { superficieHabitable: 165, demandaCalefaccion: 225.42 } },
    oportunidades: { datos_calculo: { inputs: {}, zona: 'D3' } },
});

// ── 1. El caso real, campo a campo ───────────────────────────────────────────
console.log('\n1. 26RES060_186 — contra el .cex que hizo el certificador');
const { equipo, avisos } = instalacionNueva({ expediente: expediente(), superficie: 165 });
comprueba('slot: UNA sola máquina es un equipo MIXTO', equipo.slot, 'mixto2');
comprueba('nombre con su unidad exterior', equipo.nombre,
          'AEROTERMIA PANASONIC AQUAREA HIGH PERFORMANCE SERIE M R290 (WH-WDG16ME5)');
comprueba('generador', equipo.generador, 'Bomba de Calor - Caudal Ref. Variable');
comprueba('combustible', equipo.combustible, 'Electricidad');
comprueba('el rendimiento va como CONOCIDO', equipo.rendimiento, 'conocido');
comprueba('SCOP de calefacción → 434 %', equipo.rend_calefaccion, '434');
comprueba('SCOP_dhw → 300 %, no el de calefacción', equipo.rend_acs, '300');
comprueba('superficie de calefacción', equipo.superficie_calefaccion, 165);
comprueba('superficie de ACS', equipo.superficie_acs, 165);
comprueba('cubre el 100 % de la demanda', equipo.pct_calefaccion, '100');
comprueba('sin litros declarados, SIN acumulación', equipo.acumulacion, undefined);
comprueba('  …y se dice, porque es una casilla de CE3X',
          avisos.some(a => a.includes('depósito')), true);

// ── 2. El flag no puede partir una máquina en dos ────────────────────────────
// 41 expedientes tienen el mismo modelo en los dos nodos con el flag en false:
// son los que declaraban DOS equipos en CE3X para una sola bomba de calor.
console.log('\n2. Una máquina es un equipo, diga lo que diga el flag');
comprueba('mismo id → la misma máquina',
          mismaMaquina({ aerotermia_db_id: 447 }, { aerotermia_db_id: 447 }), true);
comprueba('otro id → otra máquina',
          mismaMaquina({ aerotermia_db_id: 447 }, { aerotermia_db_id: 9 }), false);
comprueba('sin catálogo, por marca+modelo',
          mismaMaquina({ marca: 'x', modelo: 'y' }, { marca: 'X', modelo: 'Y' }), true);
comprueba('dos nodos EN BLANCO no son «el mismo equipo»',
          mismaMaquina({}, {}), false);
comprueba('flag false + mismo modelo → mismo equipo',
          acsMismoEquipo(expediente().instalacion), true);
comprueba('flag false + OTRA máquina → equipos distintos',
          acsMismoEquipo({ ...expediente().instalacion,
                           aerotermia_acs: { aerotermia_db_id: 9, marca: 'OTRA', modelo: 'Z', scop: 3 } }),
          false);

// ── 3. Lo que NO se escribe ──────────────────────────────────────────────────
console.log('\n3. Lo que se niega a escribir, y lo dice');
const sinEquipo = instalacionNueva({ expediente: expediente({ aerotermia_cal: null }), superficie: 165 });
comprueba('sin aerotermia declarada, no hay instalación', sinEquipo.equipo, null);
comprueba('  …y se dice', sinEquipo.avisos.length > 0, true);

const hibrido = instalacionNueva({
    expediente: expediente({ hibridacion: true, potencia_bomba: 8 }), superficie: 165 });
comprueba('HIBRIDACIÓN: la caldera se queda, no se escribe', hibrido.equipo, null);
comprueba('  …diciendo que son dos generadores',
          hibrido.avisos.some(a => a.toUpperCase().includes('HIBRID')), true);

const sinScop = instalacionNueva({
    expediente: expediente({ aerotermia_cal: { ...PANASONIC, scop: 0 } }), superficie: 165 });
comprueba('sin SCOP no se declara rendimiento', sinScop.equipo, null);

// ── 4. Cuando el ACS lo hace OTRA máquina ────────────────────────────────────
console.log('\n4. El ACS con otro equipo: solo calefacción, y avisando');
const otroAcs = instalacionNueva({
    expediente: expediente({
        aerotermia_acs: { aerotermia_db_id: 9, marca: 'OTRA', modelo: 'Z', scop: 3 },
    }), superficie: 165 });
comprueba('slot de SOLO calefacción', otroAcs.equipo.slot, 'calefaccion');
comprueba('sin rendimiento de ACS', otroAcs.equipo.rend_acs, undefined);
comprueba('sin superficie de ACS', otroAcs.equipo.superficie_acs, undefined);
comprueba('se dice que el ACS va aparte',
          otroAcs.avisos.some(a => a.includes('OTRO equipo')), true);

// ── 5. Lo que decide el MOTOR al copiar el .cex inicial ──────────────────────
// (`slots_a_retirar` y `heredar_del_base` viven en Python; aquí se comprueba que
//  la vista les manda lo que esperan y que el contrato no se ha movido.)
console.log('\n5. El contrato con el motor');
comprueba('el slot que se manda es uno de los que sabe escribir',
          ['mixto2', 'calefaccion'].includes(equipo.slot), true);
comprueba('el rendimiento es el modo, no un número', equipo.rendimiento, 'conocido');
comprueba('los rendimientos van como TEXTO en %',
          [typeof equipo.rend_calefaccion, typeof equipo.rend_acs], ['string', 'string']);
comprueba('NO se manda acumulación inventada: la hereda el motor del .cex',
          'acumulacion' in equipo, false);

console.log(fallos ? `\n${fallos} FALLAN` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
