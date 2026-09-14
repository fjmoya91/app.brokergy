#!/usr/bin/env node
/**
 * Las MEDIDAS DE MEJORA del `.cex`: cuál procede en cada fase y qué se escribe.
 *
 *   node implementation/backend/scripts/test_medidas_mejora.mjs
 *
 * Sin BD, sin Drive y sin motor: aquí vive el JUICIO —qué medida describe cada
 * certificado, cuánto autoconsumo se declara y a quién NO se le propone— y es lo
 * único que no se ve mirando el `.cex` que sale.
 *
 * El caso de referencia es 26RES060_186: el certificador tecleó **10.359
 * kWh/año** de autoconsumo sobre un máximo declarable de 11.510,48.
 */
import { pathToFileURL } from 'url';
import path from 'path';

const raiz = path.join(import.meta.dirname, '../../frontend/src/features');
const { medidasCe3x, AUTOCONSUMO_DECLARABLE, VIDA_UTIL_MEDIDA,
        faltaPorPreguntar, instalacionExistente } = await import(
    pathToFileURL(path.join(raiz, 'cee-envolvente/logic/fichaCe3x.js')).href);

let fallos = 0;
const comprueba = (que, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) { fallos++; console.log(`  MAL  ${que}\n       esperado ${JSON.stringify(esperado)}\n       salió    ${JSON.stringify(real)}`); }
    else console.log(`  ok   ${que}`);
};
const de = (cat, id) => cat.find(m => m.id === id);

//: El equipo tal y como está en 26RES060_186, y el total eléctrico del CEE final
//: del que sale el techo de autoconsumo (3.809,97 kgCO₂ ÷ 0,331 = 11.510,48).
const PANASONIC = {
    aerotermia_db_id: 447, marca: 'PANASONIC',
    modelo: 'AQUAREA HIGH PERFORMANCE SERIE M R290',
    modelo_ud_exterior: 'WH-WDG16ME5',
};
const expediente = (inst = {}, cee = {}) => ({
    numero_expediente: '26RES060_186',
    instalacion: {
        tipo_emisor: 'radiadores_convencionales', cambio_acs: true,
        misma_aerotermia_acs: false,
        aerotermia_cal: { ...PANASONIC, scop: 4.34 },
        aerotermia_acs: { ...PANASONIC, scop: 3 },
        // La potencia sale de la placa (no hay campo en el expediente): sin ella
        // la caldera no se escribe, y aquí se comprueba su depósito.
        caldera_antigua_cal: { rendimiento_id: 'solid_auto' },
        potencia_caldera_kw: 15.3, misma_caldera_acs: true,
        ...inst,
    },
    documentacion: {},
    cee: {
        cee_inicial: { superficieHabitable: 165, demandaCalefaccion: 225.42 },
        cee_final: { superficieHabitable: 165, demandaCalefaccion: 225.42,
                     emisionesTotalElectrico: 3809.97 },
        ...cee,
    },
    oportunidades: { datos_calculo: {
        inputs: { presupuesto: 11495, fuelType: 'carbon' }, zona: 'D3' } },
});

// ── 1. Qué medida describe cada fase ─────────────────────────────────────────
console.log('\n1. Cada certificado propone lo que le toca');
const ini = medidasCe3x({ expediente: expediente(), superficie: 165, fase: 'inicial' });
const fin = medidasCe3x({ expediente: expediente(), superficie: 165, fase: 'final' });
comprueba('INICIAL: se escribe la AEROTERMIA', ini.medidas.length, 1);
comprueba('  …y es la del expediente',
          ini.medidas[0].instalaciones[0].slot, 'mixto2');
comprueba('  …con la vida útil de la ficha', ini.medidas[0].vida_util, VIDA_UTIL_MEDIDA);
comprueba('  …y la inversión del presupuesto', ini.medidas[0].inversion, 11495);
comprueba('FINAL: se escribe el AUTOCONSUMO', fin.medidas.map(m => m.nombre),
          ['AUTOCONSUMO FOTOVOLTAICO']);
comprueba('  …y la aerotermia NO se ofrece (ya está puesta)',
          de(fin.catalogo, 'aerotermia').disponible, false);
comprueba('  …diciendo por qué',
          /ya está instalada/.test(de(fin.catalogo, 'aerotermia').motivo), true);

// ── 2. El autoconsumo que se declara ─────────────────────────────────────────
// Declarar el máximo supone que NADA se vierte y que la producción encaja hora a
// hora con el consumo. El certificador deja un margen: 11.510,48 → 10.359.
console.log('\n2. El autoconsumo declarable — el caso real');
const auto = fin.medidas[0].instalaciones[0];
comprueba('va al slot de contribuciones', auto.slot, 'renovable');
comprueba('10.359 kWh/año, lo que tecleó el certificador',
          auto.generacion_electrica_kwh, 10359);
comprueba('  …que es el 90 % del máximo', AUTOCONSUMO_DECLARABLE, 0.9);
comprueba('el texto es el de «Ayudas CEE»',
          /autoconsumo fotovoltaico para reducir el consumo/.test(fin.medidas[0].caracteristicas),
          true);

// ── 3. A quien YA tiene placas no se le proponen ─────────────────────────────
console.log('\n3. Con placas declaradas, esa medida no es la suya');
const conPlacas = medidasCe3x({
    expediente: expediente({ fotovoltaica: { estado: 'si', kwp: 3.5 } }),
    superficie: 165, fase: 'final' });
comprueba('no se escribe ninguna', conPlacas.medidas.length, 0);
comprueba('  …y se dice que van como instalación EXISTENTE',
          /instalación existente/.test(de(conPlacas.catalogo, 'autoconsumo').motivo), true);
const sinDeclarar = de(fin.catalogo, 'autoconsumo');
comprueba('sin declarar NO es «no»: se ofrece igual', sinDeclarar.disponible, true);
comprueba('  …avisando de que no consta',
          /no consta si la vivienda ya tiene placas/.test(sinDeclarar.nota), true);

// ── 4. Se ELIGEN: lo marcado manda sobre lo que trae la fase ─────────────────
console.log('\n4. Lo que elige el certificador');
const soloAuto = medidasCe3x({ expediente: expediente(), superficie: 165,
                               fase: 'inicial', elegidas: ['autoconsumo'] });
comprueba('en el INICIAL se puede pedir solo el autoconsumo',
          soloAuto.medidas.map(m => m.nombre), ['AUTOCONSUMO FOTOVOLTAICO']);
comprueba('  …avisando de que su texto habla de la aerotermia',
          soloAuto.avisos.some(a => /todavía no existe/.test(a)), true);
const ninguna = medidasCe3x({ expediente: expediente(), superficie: 165,
                              fase: 'inicial', elegidas: [] });
comprueba('se pueden quitar todas', ninguna.medidas.length, 0);
comprueba('  …y se dice que el .cex sale sin medidas',
          ninguna.avisos.some(a => /SIN medidas/.test(a)), true);

// ── 5. Lo que no se puede escribir, no se escribe ────────────────────────────
console.log('\n5. Lo que falta se dice, no se inventa');
const sinTecho = medidasCe3x({
    expediente: expediente({}, { cee_final: { superficieHabitable: 165 } }),
    superficie: 165, fase: 'final' });
comprueba('sin total eléctrico no hay autoconsumo que declarar',
          de(sinTecho.catalogo, 'autoconsumo').disponible, false);
comprueba('  …y se dice por qué',
          /máximo declarable/.test(de(sinTecho.catalogo, 'autoconsumo').motivo), true);
const sinEquipo = medidasCe3x({
    expediente: expediente({ aerotermia_cal: null }), superficie: 165, fase: 'inicial' });
comprueba('sin aerotermia declarada no hay medida de sustitución',
          de(sinEquipo.catalogo, 'aerotermia').disponible, false);

// ── 6. Lo que se PREGUNTA antes de generar ───────────────────────────────
// El depósito de acumulación y los litros de ACS se miden en la visita y no
// están en ningún campo del expediente. Se preguntan una vez; lo contestado se
// guarda con el trabajo y el CEE final lo hereda del fichero.
console.log('\n6. El popup previo: solo lo que falta, y una sola vez');
comprueba('sin contestar se preguntan las dos',
          faltaPorPreguntar({}).map(f => f.clave), ['acumulacion_litros', 'demanda_acs']);
comprueba('contestadas, no se vuelve a preguntar',
          faltaPorPreguntar({ acumulacion_litros: 150, demanda_acs: 140 }).length, 0);
comprueba('«0 litros» TAMBIÉN es una respuesta: no se repregunta',
          faltaPorPreguntar({ acumulacion_litros: 0 }).map(f => f.clave), ['demanda_acs']);
comprueba('en el CEE FINAL no se pregunta nada (lo hereda del inicial)',
          faltaPorPreguntar({}, { fase: 'final' }).length, 0);

comprueba('la caldera sale con su depósito',
          instalacionExistente({ expediente: expediente(), superficie: 165, litros: 150 })
              .equipo.acumulacion, { volumen: 150 });
comprueba('sin contestar, sin acumulación (como hasta ahora)',
          instalacionExistente({ expediente: expediente(), superficie: 165 })
              .equipo.acumulacion, undefined);
comprueba('y un 0 tampoco la inventa',
          instalacionExistente({ expediente: expediente(), superficie: 165, litros: 0 })
              .equipo.acumulacion, undefined);

console.log(fallos ? `\n${fallos} FALLAN` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
