#!/usr/bin/env node
/**
 * La VERSIÓN de CE3X en la app: lo que la pantalla enseña y lo que viaja al
 * motor para escribir un `.cex` de la 2.3 o de la 3.1.
 *
 *   node implementation/backend/scripts/test_version_ce3x_app.mjs
 *
 * Sin BD, sin Drive y sin motor. Dos cosas:
 *
 *  1. Que `versionCe3x.js` (el ESPEJO de la app) dice LO MISMO que
 *     `cee-engine/tools/version_ce3x.py` (el que manda al escribir): las listas
 *     se leen del fichero de Python y se comparan una a una, y las conversiones
 *     se prueban con los mismos casos que `tests/test_version_ce3x.py`. Si se
 *     separan, la pantalla enseña un valor y el fichero lleva otro — no falla:
 *     miente.
 *  2. Que la ficha manda la versión, lo que la 3.1 pide de más y la POTENCIA de
 *     cada equipo, que es lo que la 3.1 necesita para escribir el XML.
 */
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const raiz = path.join(import.meta.dirname, '../../frontend/src/features');
const V = await import(pathToFileURL(path.join(raiz, 'cee-envolvente/logic/versionCe3x.js')).href);
const F = await import(pathToFileURL(path.join(raiz, 'cee-envolvente/logic/fichaCe3x.js')).href);
const py = fs.readFileSync(
    path.join(import.meta.dirname, '../../cee-engine/tools/version_ce3x.py'), 'utf8');

let fallos = 0;
const comprueba = (que, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) {
        fallos++;
        console.log(`  MAL  ${que}\n       esperado ${JSON.stringify(esperado)}\n`
                    + `       salió    ${JSON.stringify(real)}`);
    } else console.log(`  ok   ${que}`);
};

//: Las cadenas de una tupla de Python `NOMBRE = ( ... )`, en su orden.
function tuplaPy(nombre) {
    // Se recorre desde el `(` hasta el `)` que lo cierra, saltando lo que va
    // entre comillas: «Otra(.*)» lleva paréntesis dentro, y una expresión
    // regular se cortaría ahí o se tragaría las tuplas que vienen detrás.
    const ini = py.search(new RegExp(`^${nombre} = \\(`, 'm'));
    if (ini < 0) throw new Error(`no encuentro ${nombre} en version_ce3x.py`);
    const out = [];
    let i = py.indexOf('(', ini) + 1;
    let prof = 0;
    for (; i < py.length; i++) {
        const c = py[i];
        if (c === '#') {
            i = py.indexOf('\n', i);
        } else if (c === '"') {
            const fin = py.indexOf('"', i + 1);
            out.push(py.slice(i + 1, fin));
            i = fin;
        } else if (c === '(') prof++;
        else if (c === ')') { if (prof === 0) break; prof--; }
    }
    return out;
}

// ── 1. Las listas, iguales a las del motor ───────────────────────────────────
console.log('\n1. Las listas de la 3.1 son las del motor');
comprueba('titulaciones', V.TITULACIONES_31, tuplaPy('TITULACIONES'));
comprueba('grados de protección', V.GRADOS_PROTECCION_31.map(g => g.valor),
          tuplaPy('GRADOS_PROTECCION'));
comprueba('partes protegidas', V.PARTES_PROTEGIDAS_31, tuplaPy('PARTES_PROTEGIDAS'));
comprueba('usos del residencial', V.USOS_RESIDENCIAL_31.map(u => u.valor),
          tuplaPy('USOS_RESIDENCIAL'));
comprueba('usos del terciario', V.USOS_TERCIARIO_31.map(u => u.valor),
          tuplaPy('USOS_TERCIARIO'));
//: NORMATIVAS es una tupla de pares: (valor, rótulo).
const normPy = tuplaPy('NORMATIVAS');
comprueba('normativas: valores', V.NORMATIVAS_31.map(n => n.valor),
          normPy.filter((_, i) => i % 2 === 0));
comprueba('normativas: rótulos', V.NORMATIVAS_31.map(n => n.etiqueta),
          normPy.filter((_, i) => i % 2 === 1));
comprueba('tipos de bomba de calor', V.TIPOS_BDC_31.map(t => t.etiqueta), tuplaPy('TIPOS_BDC'));

// ── 2. Las conversiones, con los casos del test del motor ────────────────────
console.log('\n2. Las mismas conversiones que el motor');
for (const [anio, norma] of [[1978, 'Anterior'], [1980, 'NBE-CT-79'], [1997, 'NBE-CT-79'],
                             [1998, 'NBE-CT-79_aPartir1998'], [2006, 'NBE-CT-79_aPartir1998'],
                             [2007, 'C.T.E.'], [2013, 'C.T.E.'], [2014, 'CTE 2013'],
                             [2020, 'CTE 2013'], [2021, 'Apartir2020']]) {
    comprueba(`normativa 3.1 de ${anio}`, V.normativa31(anio), norma);
    comprueba(`  …y de vuelta a la 2.3 cae en una que conoce`,
              V.NORMATIVAS_23.includes(V.normativa23(norma)), true);
}
for (const [texto, opcion] of [
    ['ARQUITECTO', 'Arquitectura'],
    ['GRADUADO EN INGENIERÍA DE LA EDIFICACIÓN. COLEGIADO COAATM Nº 108180',
     'Arquitectura técnica o aparejadores'],
    ['INGENIERO INDUSTRIAL', 'Ingeniería Industrial'],
    ['GRADUADO EN INGENIERÍA INDUSTRIAL. COLEGIADO COGITI ALBACETE Nº 1779',
     'Ingeniería Industrial'],
    ['INGENIERO TÉCNICO INDUSTRIAL', 'Ingeniería Técnica Industrial'],
    ['Ingeniería Industrial', 'Ingeniería Industrial'],
    ['LICENCIADO EN FÍSICA', null],
    ['', null],
]) comprueba(`titulación «${texto.slice(0, 40)}»`, V.titulacion31(texto), opcion);
comprueba('uso de una oficina', V.usoDeActividad('Administrativo en general'), 'Administrativo');
comprueba('un hotel en el terciario va a «Otro» (el terciario no ofrece residencial)',
          V.usoDeActividad('Habitaciones de hoteles,  hostales, residencias'), 'Otro');
comprueba('normativa puesta en la 3.1 al bajar a la 2.3',
          V.normativaDeVersion('NBE-CT-79_aPartir1998', '2.3'), 'NBE-CT-79');
comprueba('una de la 2.3 vale tal cual en la 3.1', V.normativaDeVersion('C.T.E.', '3.1'), 'C.T.E.');
comprueba('una que no es de ninguna, nada', V.normativaDeVersion('NBE-CT-2099', '3.1'), null);

// ── 3. Lo que la 3.1 pide de más ─────────────────────────────────────────────
console.log('\n3. Lo que la 3.1 pide de más, con lo que propone la app');
const viv = V.datosCe3x31({ superficie: 165, plantas: 1,
                            titulacion: 'ARQUITECTO TÉCNICO. COLEGIADO COAATM Nº 1' });
comprueba('una vivienda: residencial privado, una unidad, sin sótano', {
    uso: viv.valores.uso, uds: viv.valores.unidades_uso, bajo: viv.valores.plantas_bajo_rasante,
    sobre: viv.valores.plantas_sobre_rasante, sup: viv.valores.superficie_util,
    tit: viv.valores.titulacion, grado: viv.valores.grado_proteccion,
}, { uso: 'ResidencialPrivado', uds: 1, bajo: 0, sobre: 1, sup: 165,
     tit: 'Arquitectura técnica o aparejadores', grado: 'Ninguna' });
comprueba('  …sin avisos', viv.avisos, []);
const bloque = V.datosCe3x31({ tipoEdificio: 'Bloque de Viviendas', superficie: 1293 });
comprueba('un bloque sin nº de viviendas: no se inventa y se dice',
          [bloque.valores.unidades_uso, bloque.avisos.length > 0], [undefined, true]);
const mano = V.datosCe3x31({ ajustes: { ce3x31: { uso: 'ResidencialPublico',
                                                  unidades_uso: 24, plantas_bajo_rasante: 1,
                                                  grado_proteccion: 'Ambiental',
                                                  partes_protegidas: ['Fachada', 'Tejado'] } } });
comprueba('lo puesto a mano manda (y lo que no es del desplegable se cae)', {
    uso: mano.valores.uso, uds: mano.valores.unidades_uso, bajo: mano.valores.plantas_bajo_rasante,
    grado: mano.valores.grado_proteccion, partes: mano.valores.partes_protegidas,
    de: mano.de.uso,
}, { uso: 'ResidencialPublico', uds: 24, bajo: 1, grado: 'Ambiental', partes: ['Fachada'],
     de: 'puesto a mano por el certificador' });
const hotel = V.datosCe3x31({ terciario: true, ajustes: { ce3x31: { uso: 'ResidencialPublico' } },
                              actividad: 'Habitaciones de hoteles' });
comprueba('en el terciario no cabe «residencial público»', hotel.valores.uso, 'Otro');
// Manual de la 3.2, 6.6: las plantas sobre y bajo rasante son las del EDIFICIO
// entero (de Catastro), aunque se certifique un piso: su ejemplo pasa de 1 a 8.
const piso = V.datosCe3x31({ superficie: 90, plantas: 1, edificio: { sobre: 8, bajo: 1 } });
comprueba('un piso de un bloque: las plantas del EDIFICIO, de Catastro', {
    sobre: piso.valores.plantas_sobre_rasante, bajo: piso.valores.plantas_bajo_rasante,
    de: piso.de.plantas_sobre_rasante, uds: piso.valores.unidades_uso,
}, { sobre: 8, bajo: 1, de: 'las del edificio entero, de Catastro', uds: 1 });
comprueba('…y lo puesto a mano sigue mandando',
          V.datosCe3x31({ edificio: { sobre: 8, bajo: 1 },
                          ajustes: { ce3x31: { plantas_sobre_rasante: 3 } } }).valores.plantas_sobre_rasante, 3);
comprueba('las plantas del edificio salen de los BuildingPart (el máximo)',
          V.plantasDelEdificio({ modelo: { building_parts: [
              { attrs: { numberOfFloorsAboveGround: 2, numberOfFloorsBelowGround: 0 } },
              { attrs: { numberOfFloorsAboveGround: 8, numberOfFloorsBelowGround: 1 } }] } }),
          { sobre: 8, bajo: 1 });
comprueba('…y sin ellos, de los niveles medidos',
          V.plantasDelEdificio({ modelo: { floors: [{ nivel: -1 }, { nivel: 0 }, { nivel: 1 }] } }),
          { sobre: 2, bajo: 1 });
comprueba('…y sin nada, nada', V.plantasDelEdificio({}), null);
const raro = V.datosCe3x31({ titulacion: 'LICENCIADO EN FÍSICA' });
comprueba('una titulación que no casa no se manda y se avisa',
          [raro.valores.titulacion, raro.avisos.some(a => a.includes('Otra(.*)'))], [undefined, true]);

// ── 4. La potencia de cada equipo ────────────────────────────────────────────
console.log('\n4. La potencia de cada equipo (la pide la 3.1 para el XML)');
const PANASONIC = { aerotermia_db_id: 447, marca: 'PANASONIC',
                    modelo: 'AQUAREA HIGH PERFORMANCE SERIE M R290',
                    modelo_ud_exterior: 'WH-WDG16ME5' };
const exp = (inst = {}) => ({
    numero_expediente: '26RES060_186',
    instalacion: { tipo_emisor: 'radiadores_convencionales', cambio_acs: true,
                   misma_aerotermia_acs: false,
                   aerotermia_cal: { ...PANASONIC, scop: 4.34, potencia: 16 },
                   aerotermia_acs: { ...PANASONIC, scop: 3 }, ...inst },
    cee: { cee_inicial: { superficieHabitable: 165, demandaCalefaccion: 225.42 } },
    oportunidades: { datos_calculo: { inputs: {}, zona: 'D3' } },
});
const { equipo } = F.instalacionNueva({ expediente: exp(), superficie: 165 });
comprueba('aerotermia mixta: su potencia en calefacción y en ACS, aire-agua', {
    cal: equipo.potencia_calefaccion, acs: equipo.potencia_acs, tipo: equipo.tipo_bdc,
}, { cal: '16', acs: '16', tipo: 1 });
const sinPot = F.instalacionNueva({
    expediente: exp({ aerotermia_cal: { ...PANASONIC, scop: 4.34 } }), superficie: 165,
    modelos: { 447: { potencia_calefaccion: 15.5 } } }).equipo;
comprueba('sin potencia en la unidad, la del CATÁLOGO', sinPot.potencia_calefaccion, '15.5');
const split = F.instalacionNueva({
    expediente: exp({ tipo_emisor: 'splits', cambio_acs: false,
                      aerotermia_cal: { ...PANASONIC, scop: 5.1, potencia: 5.3, seer: 7.2,
                                        potencia_frio: 5 } }),
    superficie: 80 }).equipo;
comprueba('un split: calefacción y frío, aire-aire', {
    slot: split.slot, cal: split.potencia_calefaccion, frio: split.potencia_refrigeracion,
    acs: split.potencia_acs, tipo: split.tipo_bdc,
}, { slot: 'climatizacion', cal: '5.3', frio: '5', acs: undefined, tipo: 0 });

const tecleado = F.equipoConAjustes(equipo, { potencia_calefaccion: '14', tipo_bdc: 3 },
                                    { superficie: 165 }).equipo;
comprueba('lo tecleado manda sobre lo derivado',
          [tecleado.potencia_calefaccion, tecleado.potencia_acs, tecleado.tipo_bdc], ['14', '16', 3]);
const soloCal = F.equipoConAjustes(equipo, { slot: 'calefaccion' }, { superficie: 165 }).equipo;
comprueba('al dejarlo en solo calefacción se quita la potencia de ACS',
          [soloCal.potencia_calefaccion, soloCal.potencia_acs], ['16', undefined]);
const caldera = F.equipoConAjustes({ slot: 'mixto2', nombre: 'CALDERA', generador: 'Caldera Estándar',
                                     combustible: 'Gasóleo-C', potencia: '24',
                                     potencia_calefaccion: '24' }, {}, { superficie: 165 }).equipo;
comprueba('una caldera estimada no lleva el bloque de la 3.1 (la suya va en su cola)',
          [caldera.potencia, caldera.potencia_calefaccion, caldera.tipo_bdc], ['24', undefined, undefined]);
const termo = F.equipoAnadido({ slot: 'ACS', nombre: 'TERMO', potencia_acs: '1,5' },
                              { superficie: 165 }).equipo;
comprueba('un termo añadido con su potencia (coma decimal)', termo.potencia_acs, '1.5');

const eqs = F.equiposDelExpediente(exp());
comprueba('el final desde la medida recibe la potencia y el tipo de cada máquina',
          eqs.map(e => [e.servicio, e.potencia, e.tipo_bdc]),
          [['calefaccion', 16, 1], ['acs', 16, 1]]);

// ── 5. La ficha entera: versión y datos de la 3.1 ───────────────────────────
console.log('\n5. La ficha dice con qué versión se escribe');
const geo = { geometria: { modelo: { catastro: { inmueble: { antiguedad: 2001,
    direccion: 'CL MAYOR 1 13700 TOMELLOSO (CIUDAD REAL)' } } } } };
const base = { expediente: { ...exp(), instalacion: { ...exp().instalacion, zona_climatica: 'D3' } },
               geo, cliente: {} };
const f31 = F.fichaCe3x({ ...base });
comprueba('sin elegir: la 3.2 (la vigente desde el 08/10/2026), y se dice que nadie la ha elegido',
          [f31.ficha.version_ce3x, f31.version_ce3x.version, f31.version_ce3x.elegida],
          ['3.2', '3.2', false]);
const f31b = F.fichaCe3x({ ...base, ajustes: { version_ce3x: '3.1' } });
comprueba('la 3.1 se puede seguir eligiendo, con lo mismo que la 3.2',
          [f31b.ficha.version_ce3x, !!f31b.ficha.ce3x31?.uso], ['3.1', true]);
comprueba('  …con la normativa de sus tramos (2001 → 1998-2007)',
          f31.ficha.generales.normativa.valor, 'NBE-CT-79_aPartir1998');
comprueba('  …y lo que la 3.1 pide de más va al motor', !!f31.ficha.ce3x31?.uso, true);
const f23 = F.fichaCe3x({ ...base, ajustes: { version_ce3x: '2.3' } });
comprueba('con la 2.3 elegida: sin ce3x31 y la normativa de la 2.3',
          [f23.ficha.version_ce3x, f23.ficha.ce3x31, f23.ficha.generales.normativa.valor],
          ['2.3', undefined, 'NBE-CT-79']);
const fMano = F.fichaCe3x({ ...base, ajustes: { normativa: 'Otros' } });
comprueba('una normativa puesta a mano manda y llega al motor',
          [fMano.ficha.generales.normativa.valor, fMano.ficha.ce3x31.normativa], ['Otros', 'Otros']);
const fBaja = F.fichaCe3x({ ...base, ajustes: { normativa: 'Otros', version_ce3x: '2.3' } });
comprueba('  …y al bajar a la 2.3 se traduce a una que la 2.3 conoce',
          fBaja.ficha.generales.normativa.valor, 'CTE 2013');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
