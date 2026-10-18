#!/usr/bin/env node
/**
 * Prueba lo DETERMINISTA de «las placas, también en la app»:
 *
 *   1. El contraste de la placa de la caldera (año y combustible) con la fila de
 *      rendimiento del expediente: solo AVISA, y con un año de margen.
 *   2. `placasInstalacion.proponerPlacas` — la lógica del botón «Leer placas»,
 *      que ahora usa también la skill `generar-cee-inicial`: solo HUECOS,
 *      conflictos a la vista, nº de serie dudoso fuera, `potencia_caldera` y la
 *      caldera de ACS rellenadas a la vez, y nada escrito en `simular`.
 *
 * Sin escribir nada: las lecturas son SOLO de caldera, así que no se consulta el
 * catálogo (eso lo cubre `test_placa_equipo.js`).
 *
 *   node implementation/backend/scripts/test_placas_instalacion.js
 */
require('dotenv').config({ quiet: true });
const { contrastarPlacaConRendimiento } = require('../utils/combustibleCaldera');

let fallos = 0;
const comprueba = (que, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) { fallos++; console.log(`  MAL  ${que}\n       esperado ${JSON.stringify(esperado)}, salió ${JSON.stringify(real)}`); }
    else console.log(`  ok   ${que}`);
};

(async () => {
    console.log('\n1. La placa frente a la fila de rendimiento');
    const n = (id, l) => contrastarPlacaConRendimiento(id, l).length;
    comprueba('1990 + gasóleo frente a «Gasóleo, de 1985 a 1997» → cuadra', n('oil_85_97', { anio: 1990, combustible: 'gasoleo' }), 0);
    comprueba('1995 frente a «Gasóleo, ≥ 1998» → avisa', n('oil_post98', { anio: 1995 }), 1);
    comprueba('1997 frente a «≥ 1998» → cuadra (un año de margen)', n('oil_post98', { anio: 1997 }), 0);
    comprueba('1999 frente a «de 1985 a 1997» → avisa', n('oil_85_97', { anio: 1999 }), 1);
    comprueba('gas natural frente a una fila de gasóleo → avisa', n('oil_85_97', { combustible: 'gas_natural' }), 1);
    comprueba('GLP frente a una fila de gas → cuadra (misma fila del Anexo VIII)', n('gas_post98_auto', { combustible: 'glp' }), 0);
    comprueba('pellets frente a sólidos → cuadra', n('solid_auto', { anio: 2012, combustible: 'pellets' }), 0);
    comprueba('año y combustible mal a la vez → dos avisos', n('gas_post98_auto', { anio: 1980, combustible: 'gasoleo' }), 2);
    comprueba('sin fila declarada → nada que comparar', n('', { anio: 1980 }), 0);
    comprueba('«Por defecto» → nada que comparar', n('default', { anio: 1980, combustible: 'gasoleo' }), 0);
    comprueba('una fila sin años (condensación) no se contrasta por año', n('oil_cond', { anio: 1970 }), 0);
    const txt = contrastarPlacaConRendimiento('oil_post98', { anio: 1995 }, 'Gasóleo, ≥ 1998, sin condensación')[0] || '';
    comprueba('el aviso nombra la fila por su rótulo', /«Gasóleo, ≥ 1998, sin condensación»/.test(txt), true);

    console.log('\n2. proponerPlacas (lógica del botón «Leer placas»)');
    const { proponerPlacas } = require('../services/placasInstalacion');
    const caldera = {
        leido: { marca: 'FERROLI', modelo: 'NGL 30', numero_serie: '1HGCE03B', anio: 1990, combustible: 'gasoleo' },
        potencia_kw: 35, fotos: [], avisos: [],
    };
    const equipos = { unidades: {}, fotos: [], avisos: [], sin_fotos: true };
    const vacia = {
        caldera_antigua_cal: { tipo: 'CALDERA', rendimiento_id: 'oil_85_97', marca: '', modelo: '', numero_serie: '' },
        caldera_antigua_acs: { tipo: 'CALDERA', rendimiento_id: 'oil_85_97', marca: '', modelo: '' },
        misma_caldera_acs: true, potencia_caldera: 0,
    };

    // a) Todo hueco → se proponen los cuatro datos; en simular no se escribe.
    const a = await proponerPlacas({ exp: { id: 'x', instalacion: vacia }, caldera, equipos, simular: true });
    comprueba('propone marca, modelo, nº de serie y potencia',
        a.propuesta.map(p => p.campo), ['marca', 'modelo', 'numero_serie', 'potencia_caldera_kw']);
    comprueba('simular: compone la instalación', !!a.instalacion, true);
    comprueba('simular: no escribe nada (escrito vacío)', a.escrito, []);
    comprueba('potencia_caldera_kw y potencia_caldera, el MISMO número',
        [a.instalacion.potencia_caldera_kw, a.instalacion.potencia_caldera], [35, 35]);
    comprueba('la caldera de ACS se rellena a la vez (misma caldera)', a.instalacion.caldera_antigua_acs.marca, 'FERROLI');
    comprueba('la fila de rendimiento NO se toca', a.instalacion.caldera_antigua_cal.rendimiento_id, 'oil_85_97');
    comprueba('el año y el combustible cuadran con la fila → sin aviso de rendimiento',
        a.avisos.filter(x => /rendimiento declarado/.test(x)).length, 0);
    comprueba('la huella guarda de dónde sale', a.instalacion.placas_ocr.caldera.marca, 'FERROLI');

    // b) Lo escrito por una persona no se pisa: sale como conflicto.
    const escrita = { ...vacia, caldera_antigua_cal: { ...vacia.caldera_antigua_cal, marca: 'ROCA' }, potencia_caldera_kw: 24 };
    const b = await proponerPlacas({ exp: { id: 'x', instalacion: escrita }, caldera, equipos, simular: true });
    comprueba('marca y potencia distintas → conflicto, no propuesta',
        b.conflictos.map(c => c.campo).sort(), ['marca', 'potencia_caldera_kw']);
    comprueba('lo escrito sigue en la instalación compuesta', b.instalacion.caldera_antigua_cal.marca, 'ROCA');
    comprueba('una potencia ya puesta no se cambia por la de la placa', b.instalacion.potencia_caldera_kw, 24);

    // c) Un cero no es una potencia puesta.
    const cero = { ...vacia, potencia_caldera_kw: 0 };
    const c = await proponerPlacas({ exp: { id: 'x', instalacion: cero }, caldera, equipos, simular: true });
    comprueba('potencia a 0 → se rellena', c.propuesta.some(p => p.campo === 'potencia_caldera_kw'), true);

    // d) Un nº de serie DUDOSO no se escribe solo.
    const dud = { ...caldera, leido: { ...caldera.leido, serie_dudosa: true,
        serie_alternativas: [{ serie: '1HGCE03B/002899' }, { serie: '1HGCE03B/002B99' }] } };
    const d = await proponerPlacas({ exp: { id: 'x', instalacion: vacia }, caldera: dud, equipos, simular: true });
    comprueba('serie dudosa → a «dudosos», no a la propuesta',
        [d.propuesta.some(p => p.campo === 'numero_serie'), d.dudosos.length], [false, 1]);

    // e) La placa contradice la fila → avisa (y no la toca).
    const e = await proponerPlacas({ exp: { id: 'x', instalacion: vacia },
        caldera: { ...caldera, leido: { ...caldera.leido, anio: 2010 } }, equipos, simular: true });
    comprueba('placa de 2010 con fila «de 1985 a 1997» → un aviso',
        e.avisos.filter(x => /rendimiento declarado/.test(x)).length, 1);

    // f) Sin `aplicar` ni `simular`: solo la propuesta.
    const f = await proponerPlacas({ exp: { id: 'x', instalacion: vacia }, caldera, equipos });
    comprueba('sin aplicar ni simular → no compone nada', f.instalacion, null);

    // g) Sustituir el EQUIPO trae los documentos del modelo NUEVO (consulta el
    //    catálogo, solo lectura). Caso 26RES060_178: la DUO AI 10 elegida al
    //    simular conservaba su EPREL y su ficha tras casar la placa con la
    //    Extensa S 10 (WOYA100KLT), y el CIFO anexaba los papeles de otra máquina.
    const supabase = require('../services/supabaseClient');
    const { data: s10 } = await supabase.from('aerotermia')
        .select('id, eprel, ficha_tecnica, url_keymark').eq('modelo_ud_exterior', 'WOYA100KLT').maybeSingle();
    if (s10) {
        const conDuo = { ...vacia, tipo_emisor: 'suelo_radiante', aerotermia_cal: {
            aerotermia_db_id: 83, marca: 'THERMOR', modelo: 'ALFEA EXTENSA DUO AI 10', scop: 5.95,
            url_eprel: 'https://eprel.ec.europa.eu/screen/product/spaceheaters/670070',
            url_ficha: 'https://drive.google.com/open?id=FICHA_DE_LA_DUO', url_keymark: 'https://keymark/DUO',
        } };
        const g = await proponerPlacas({
            exp: { id: 'x', instalacion: conDuo }, zona: 'D3', caldera: { leido: null, sin_fotos: true, fotos: [], avisos: [] },
            equipos: { unidades: { exterior: { marca: 'FUJITSU', modelo: 'WOYA100KLT', numero_serie: 'T0' } }, fotos: [], avisos: [] },
            simular: true, ponerEquipo: true,
        });
        const nodo = g.instalacion?.aerotermia_cal || {};
        comprueba('sustituir el equipo: el id es el del modelo nuevo', nodo.aerotermia_db_id, s10.id);
        comprueba('sustituir el equipo: ficha, EPREL y Keymark del modelo NUEVO',
            [nodo.url_ficha, nodo.url_eprel, nodo.url_keymark],
            [s10.ficha_tecnica || null, s10.eprel || null, s10.url_keymark || null]);
    } else {
        console.log('  --   (sin la fila WOYA100KLT en el catálogo: caso g no comprobado)');
    }

    // ── 2026-10-18: lecturas con erratas de OCR y la placa del slot «ud. interior»
    //    que es de OTRO aparato. Consultan el catálogo (solo lectura) y nunca
    //    escriben: todo va con `simular`.
    const { data: aerosun } = await supabase.from('aerotermia')
        .select('id, modelo_ud_exterior').in('id', [60, 72, 163]);
    const fila = (id) => (aerosun || []).find((x) => x.id === id);
    if (fila(60)?.modelo_ud_exterior === 'CONFORT 12 (NTII-12IIEN)' && fila(72) && fila(163)) {
        const sinCaldera = { leido: null, sin_fotos: true, fotos: [], avisos: [] };
        const conNueve = { ...vacia, aerotermia_cal: {
            aerotermia_db_id: 72, marca: 'AEROSUN', modelo: 'CONFORT 9',
            modelo_ud_exterior: 'CONFORT 9 (NTII-9IIEN)', modelo_ud_interior: '', numero_serie: '',
        } };
        const ext12 = (modelo) => ({ unidades: { exterior: {
            marca: 'AEROSUN', modelo, numero_serie: 'IN2601306006-030' } }, fotos: [], avisos: [] });

        // h) 26RES060_136: «NTI-12/1IEN» casa con la CONFORT 12 (id 60).
        const h = await proponerPlacas({ exp: { id: 'x', instalacion: conNueve }, caldera: sinCaldera,
            equipos: ext12('NTI-12/1IEN'), simular: true, ponerEquipo: false });
        comprueba('«NTI-12/1IEN» → propone la CONFORT 12 (id 60), sustituyendo a la 9',
            [h.equipo_catalogo?.id, h.equipo_catalogo?.sustituye], [60, 'CONFORT 9']);
        comprueba('sin cambiar el equipo, la serie de la 12 NO va a la CONFORT 9',
            [h.instalacion?.aerotermia_cal?.aerotermia_db_id ?? 72, h.instalacion?.aerotermia_cal?.numero_serie || ''], [72, '']);
        const h2 = await proponerPlacas({ exp: { id: 'x', instalacion: conNueve }, caldera: sinCaldera,
            equipos: ext12('NTI-12/1IEN'), simular: true, ponerEquipo: true });
        comprueba('cambiando el equipo, entran a la vez el id 60 y su serie',
            [h2.instalacion?.aerotermia_cal?.aerotermia_db_id, h2.instalacion?.aerotermia_cal?.numero_serie],
            [60, 'IN2601306006-030']);

        // i) 26RES060_196: «NT2-12IRFN» solo se PARECE → candidato, no elección.
        const i1 = await proponerPlacas({ exp: { id: 'x', instalacion: conNueve }, caldera: sinCaldera,
            equipos: ext12('NT2-12IRFN'), simular: true });
        comprueba('«NT2-12IRFN» → la 12 como candidata, sin elegirla sola',
            [i1.equipo_catalogo, i1.catalogo_candidatos.map((c) => c.id)], [null, [60]]);
        comprueba('… y la serie no entra en la CONFORT 9',
            i1.instalacion?.aerotermia_cal?.numero_serie || '', '');
        const i2 = await proponerPlacas({ exp: { id: 'x', instalacion: conNueve }, caldera: sinCaldera,
            equipos: ext12('NT2-12IRFN'), simular: true, equipoId: 60 });
        comprueba('eligiendo la candidata, entran el id 60 y la serie',
            [i2.instalacion?.aerotermia_cal?.aerotermia_db_id, i2.instalacion?.aerotermia_cal?.numero_serie],
            [60, 'IN2601306006-030']);
        const con12 = { ...vacia, aerotermia_cal: { ...conNueve.aerotermia_cal, aerotermia_db_id: 60,
            modelo: 'CONFORT 12', modelo_ud_exterior: 'CONFORT 12 (NTII-12IIEN)' } };
        const i3 = await proponerPlacas({ exp: { id: 'x', instalacion: con12 }, caldera: sinCaldera,
            equipos: ext12('NT2-12IRFN'), simular: true });
        const i4 = await proponerPlacas({ exp: { id: 'x', instalacion: con12 }, caldera: sinCaldera,
            equipos: ext12('NTI-12/1IEN'), simular: true });
        comprueba('con la 12 puesta, «NTI-12/1IEN» no sale como conflicto de modelo',
            i4.conflictos.map((c) => c.campo), []);
        const i5 = await proponerPlacas({ exp: { id: 'x', instalacion: conNueve }, caldera: sinCaldera,
            equipos: ext12('NTI-12IHN'), simular: true });
        comprueba('«NTI-12IHN» (otra lectura real de 26RES060_196) → la 12 como candidata',
            [i5.equipo_catalogo, i5.catalogo_candidatos.map((c) => c.id)], [null, [60]]);
        comprueba('con la 12 ya puesta, el parecido la deja y la serie entra',
            [i3.equipo_catalogo, i3.instalacion?.aerotermia_cal?.numero_serie], [null, 'IN2601306006-030']);

        // j) 26RES060_195: Advanced 12 MONOBLOC (163) + bomba de ACS HTW aparte.
        //    La placa del slot «ud. interior» es la HTW: va al nodo de ACS, NUNCA
        //    a la «ud. interior» de la de calefacción.
        const advanced = { ...vacia, cambio_acs: true, misma_aerotermia_acs: false,
            aerotermia_cal: { aerotermia_db_id: 163, marca: 'AEROSUN', modelo: 'ADVANCED 12',
                modelo_ud_exterior: 'HM-M1-A5', modelo_ud_interior: '', numero_serie: 'IN2601309004-053' },
            aerotermia_acs: { aerotermia_db_id: 537, marca: 'HTW', modelo: 'HTW-AT-V100MR290A',
                modelo_conjunto: 'BOMBA CALOR ACS HTW-AT-V100MR290A', modelo_ud_interior: 'HTW-AT-V100MR290A', numero_serie: '' } };
        const j = await proponerPlacas({ exp: { id: 'x', instalacion: advanced }, caldera: sinCaldera,
            equipos: { unidades: {
                exterior: { marca: 'AEROSUN', modelo: 'HM-M1-A5', numero_serie: 'IN2601309004-053' },
                interior: { marca: 'HTW', modelo: 'HTW-AT-V100MR290A', numero_serie: 'AX24031603070524088' },
            }, fotos: [], avisos: [] }, simular: true });
        comprueba('monobloc + ACS aparte: NO propone la HTW como «ud. interior» de la calefacción',
            j.propuesta.some((p) => p.nodo === 'aerotermia' && p.campo === 'modelo_ud_interior'), false);
        comprueba('… su nº de serie va al nodo de ACS',
            j.propuesta.filter((p) => p.nodo === 'acs').map((p) => [p.campo, p.valor]),
            [['numero_serie', 'AX24031603070524088']]);
        comprueba('… y la «ud. interior» de la calefacción sigue vacía',
            j.instalacion?.aerotermia_cal?.modelo_ud_interior, '');

        // k) 26RES060_196: termo CORBERÓ en el slot, ACS fuera de alcance → a ninguna parte.
        const conTermo = { ...con12, cambio_acs: false, misma_aerotermia_acs: false,
            aerotermia_cal: { ...con12.aerotermia_cal, marca: '' },
            aerotermia_acs: { aerotermia_db_id: null, marca: '', modelo: '', numero_serie: '' } };
        const termo = { marca: 'CORBERÓ', modelo: 'TERMO SE PLUS 100', numero_serie: 'CB2201234' };
        const k = await proponerPlacas({ exp: { id: 'x', instalacion: conTermo }, caldera: sinCaldera,
            equipos: { unidades: { interior: termo }, fotos: [], avisos: [] }, simular: true });
        comprueba('termo ajeno en un monobloc: ni «ud. interior», ni marca, ni ACS',
            k.propuesta.map((p) => `${p.nodo}.${p.campo}`), []);
        comprueba('… y se dice por qué',
            k.avisos.some((a) => /no es de la bomba de calor/.test(a)), true);

        // l) Con el ACS en alcance y su equipo declarado (HTW), un termo ajeno
        //    tampoco se cuela en el nodo de ACS.
        const l = await proponerPlacas({ exp: { id: 'x', instalacion: advanced }, caldera: sinCaldera,
            equipos: { unidades: { interior: termo }, fotos: [], avisos: [] }, simular: true });
        comprueba('termo ajeno con ACS HTW declarado: nada al nodo de ACS ni a la calefacción',
            l.propuesta.filter((p) => p.nodo !== 'caldera').map((p) => `${p.nodo}.${p.campo}`), []);
    } else {
        console.log('  --   (sin las filas AEROSUN 60/72/163 esperadas: casos h-l no comprobados)');
    }

    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
