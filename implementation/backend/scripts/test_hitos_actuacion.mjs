/**
 * Hitos de la actuación: la factura que NO abre la obra, las fechas del CIFO,
 * la aclaración propuesta y el aviso de fechas. Sin BD, sin red y sin IA.
 *
 *   node scripts/test_hitos_actuacion.mjs
 *
 * El caso de referencia es 26RES093_11 (30/09/2026): la bomba de calor se
 * facturó el 29/05/2026 —entrega de material—, el CEE inicial se visitó y firmó
 * el 01/09, la instalación se facturó el 11/09 y las pruebas del RITE son del
 * 15/09. Con el criterio de siempre el CIFO arrancaba el 29/05, antes del CEE.
 */
import { createRequire } from 'module';
import { calcCifo, motivoNoInicio } from '../../frontend/src/features/expedientes/logic/calcCifo.js';
import {
    hitosActuacion, aclaracionSugerida, fechasAjenas, ACLARACION_MAX, avisosHitos,
} from '../../frontend/src/features/expedientes/logic/hitosActuacion.js';
import { incidenciasFechasCifo } from '../../frontend/src/features/expedientes/logic/cifoFechas.js';
import { deriveCifoData, buildCifoHtml } from '../../frontend/src/features/expedientes/logic/cifoDoc.js';
import { deriveRes080Data, buildRes080Html } from '../../frontend/src/features/expedientes/logic/res080Doc.js';

const require = createRequire(import.meta.url);
const { conBorrador, facturasCitadas } = require('../services/aclaracionFechasService.js');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fallos++; };

const expediente = (docExtra = {}, cee = {}) => ({
    id: 'x', numero_expediente: '26RES093_11',
    documentacion: {
        facturas: [
            { numero_factura: '26/000417', fecha_factura: '2026-05-29', importe_sin_iva: 5785.12, partidas: ['AEROTERMIA'] },
            { numero_factura: '26/000618', fecha_factura: '2026-09-11', importe_sin_iva: 2639.88, partidas: ['AEROTERMIA', 'OBRA_CIVIL'] },
        ],
        fecha_pruebas_cert_instalacion: '2026-09-15',
        fecha_visita_cee_inicial: '2026-09-01', fecha_firma_cee_inicial: '2026-09-01',
        ...docExtra,
    },
    cee: { cee_inicial: { fechaVisita: '2026-09-01', fechaFirma: '2026-09-01' }, ...cee },
});
const conMaterial = (docExtra = {}) => {
    const e = expediente(docExtra);
    e.documentacion.facturas[0].motivo_no_inicio = 'MATERIAL';
    return e;
};

console.log('\n── calcCifo: qué factura abre la actuación');
{
    const d = expediente().documentacion;
    ok(calcCifo(d).inicio === '2026-05-29', 'sin marcar, el inicio es la primera factura (lo de siempre)');
    ok(calcCifo(d).fin === '2026-09-15', 'el fin es la última fecha (las pruebas)');
    const m = conMaterial().documentacion;
    ok(calcCifo(m).inicio === '2026-09-11', 'marcada como MATERIAL, el inicio pasa a la siguiente factura');
    ok(calcCifo(m).fin === '2026-09-15', 'y el fin no cambia');
    const min = { ...m, facturas: m.facturas.map((f, i) => i === 0 ? { ...f, motivo_no_inicio: 'material' } : f) };
    ok(calcCifo(min).inicio === '2026-09-11', 'la marca se lee sin distinguir mayúsculas (normalizeData la sube)');
    ok(motivoNoInicio({ motivo_no_inicio: 'OTRA COSA' }) === null, 'un valor desconocido NO saca la factura');
    const todas = { facturas: [{ fecha_factura: '2026-05-29', motivo_no_inicio: 'ANTICIPO' }] };
    ok(calcCifo(todas).inicio === '2026-05-29', 'si no queda ninguna que abra, se usan todas (nunca un CIFO sin inicio)');
    ok(calcCifo({ ...m, fecha_inicio_cifo_manual: '2026-09-05' }).inicio === '2026-09-05', 'la fecha a mano sigue mandando');
    ok(calcCifo({ facturas: [{ fecha_factura: '2026-09-20' }], fecha_pruebas_cert_instalacion: '2026-09-15' }).inicio === '2026-09-15',
        'las pruebas del RITE siguen contando para el inicio');
}

console.log('\n── hitosActuacion');
{
    const h = hitosActuacion(conMaterial());
    ok(h.inicio === '2026-09-11' && h.fin === '2026-09-15', 'inicio y fin');
    ok(h.inicioDe?.tipo === 'factura' && h.inicioDe.numero === '26/000618', 'el inicio sale de la factura 26/000618');
    ok(h.finDe?.tipo === 'pruebas', 'el fin sale de las pruebas del RITE');
    ok(h.primera?.numero === '26/000417' && h.primera.motivo === 'MATERIAL', 'la primera factura, con su motivo');
    ok(h.anteriores.length === 1 && h.anteriores[0].numero === '26/000417', 'una factura anterior al inicio que explicar');
    ok(h.ceeInicial.visita === '2026-09-01' && h.ceeInicial.firma === '2026-09-01', 'visita y firma del CEE inicial');
    ok(!h.ceeFinal.visita && !h.ceeFinal.firma, 'sin CEE final no se inventa nada');
    // La rejilla del CEE manda sobre lo leído del .xml (alguien pudo corregirla).
    const e = conMaterial();
    e.cee.fecha_firma_cee_inicial = '2026-09-02';
    ok(hitosActuacion(e).ceeInicial.firma === '2026-09-02', 'la fecha de la rejilla manda sobre la del .xml');
    ok(hitosActuacion(expediente()).anteriores.length === 0, 'sin marcar ni fecha a mano no hay nada anterior al inicio');
}

console.log('\n── aclaracionSugerida: solo lo que dicen los datos');
{
    const t = aclaracionSugerida(hitosActuacion(conMaterial()));
    ok(/nº 26\/000417, de fecha 29\/05\/2026, corresponde a la entrega de material/.test(t), 'nombra la factura y lo que es');
    ok(/no supone el inicio de la ejecución/.test(t), 'dice que no abre la actuación');
    ok(/se inicia el 11\/09\/2026, con posterioridad a la firma del certificado de eficiencia energética inicial \(01\/09\/2026\)/.test(t),
        'sitúa el inicio tras la firma del CEE (visita y firma el mismo día: se nombra una vez)');
    ok(t.length <= ACLARACION_MAX, `cabe en el tope (${t.length}/${ACLARACION_MAX})`);
    ok(fechasAjenas(t, hitosActuacion(conMaterial())).length === 0, 'no cita ninguna fecha que no conste');
    // Si la firma del CEE es POSTERIOR al inicio, la frase no puede decir lo contrario.
    const e = conMaterial();
    e.cee = { cee_inicial: { fechaFirma: '2026-09-12' } }; e.documentacion.fecha_firma_cee_inicial = '2026-09-12';
    const t2 = aclaracionSugerida(hitosActuacion(e));
    ok(!/posterioridad/.test(t2), 'con el CEE firmado DESPUÉS del inicio no afirma que sea posterior');
    ok(aclaracionSugerida(hitosActuacion(expediente())) === '', 'sin nada anterior al inicio no hay nada que aclarar');
    // Inicio a mano sin marcar la factura: no se le atribuye una naturaleza.
    const t3 = aclaracionSugerida(hitosActuacion(expediente({ fecha_inicio_cifo_manual: '2026-09-05' })));
    ok(/es anterior a la fecha de inicio declarada/.test(t3) && !/material|anticipo/.test(t3), 'sin marca no dice que sea material ni anticipo');
    // Dos anticipos
    const e4 = expediente();
    e4.documentacion.facturas = [
        { numero_factura: 'A1', fecha_factura: '2026-05-01', motivo_no_inicio: 'ANTICIPO' },
        { numero_factura: 'A2', fecha_factura: '2026-06-01', motivo_no_inicio: 'ANTICIPO' },
        { numero_factura: 'F3', fecha_factura: '2026-09-10' },
    ];
    ok(/Las facturas nº A1 \(01\/05\/2026\) y nº A2 \(01\/06\/2026\) corresponden a anticipos a cuenta y no suponen/.test(aclaracionSugerida(hitosActuacion(e4))),
        'plural bien concordado');
}

console.log('\n── fechasAjenas / facturasCitadas: lo que la IA no puede aportar');
{
    const h = hitosActuacion(conMaterial());
    ok(fechasAjenas('La obra empezó el 03/09/2026.', h).join() === '03/09/2026', 'detecta una fecha inventada');
    ok(fechasAjenas('Inicio el 11/09/2026 tras la firma del 01/09/2026.', h).length === 0, 'las que constan pasan');
    ok(facturasCitadas('La factura nº 26/000417 y la n.º FV-12.').join('|') === '26/000417|FV-12', 'lee los nº de factura citados');
    const b = conBorrador(expediente(), { motivos: { 0: 'material' }, fecha_inicio_cifo_manual: '' });
    ok(b.documentacion.facturas[0].motivo_no_inicio === 'MATERIAL' && b.documentacion.fecha_inicio_cifo_manual === null,
        'el borrador del popup se aplica (y solo eso)');
}

console.log('\n── Aviso de fechas del CIFO');
{
    const sin = incidenciasFechasCifo(expediente());
    const grave = sin.find(i => i.tipo === 'FECHA_ANTERIOR_CEE');
    ok(grave?.severidad === 'GRAVE' && grave.accion === 'hitos', 'sin marcar: GRAVE, con el botón que lo arregla');
    ok(/Hitos de la actuación/.test(grave?.texto || ''), 'y dice DÓNDE se arregla');
    const con = incidenciasFechasCifo(conMaterial());
    ok(!con.some(i => i.tipo === 'FECHA_ANTERIOR_CEE'), 'marcada como material: el GRAVE se apaga solo');
    const lev = con.find(i => i.tipo === 'FACTURA_ANTERIOR_INICIO');
    ok(lev?.severidad === 'LEVE' && lev.accion === 'hitos', 'queda un LEVE pidiendo la aclaración');
    const aclarado = incidenciasFechasCifo(conMaterial({ hitos_actuacion: { aclaracion: 'Texto.' } }));
    ok(!aclarado.some(i => i.tipo === 'FACTURA_ANTERIOR_INICIO'), 'con aclaración escrita, el LEVE también se apaga');
}

console.log('\n── El CIFO imprime los hitos');
{
    const results = { savingsKwh: 26078 };
    const e = conMaterial({ hitos_actuacion: { aclaracion: 'La factura <b>nº 26/000417</b> es material & no abre.' } });
    e.instalacion = { aerotermia_cal: { marca: 'LASIAN', modelo: 'AERIA HT 12', numero_serie: 'X1', scop: 5.95 },
        caldera_antigua_cal: { rendimiento_id: 'gasoleo_post98_std' } };
    e.oportunidades = { datos_calculo: { zona: 'D3' } };
    e.cee.cee_final = { fechaVisita: '2026-09-20', fechaFirma: '2026-09-22' };
    const html = buildCifoHtml({ data: deriveCifoData({ expediente: e, results }), appUrl: 'https://app.brokergy.es' });
    ok(html.includes('Hitos de la actuación'), 'lleva el bloque');
    ok(html.includes('entrega de material'), 'la primera factura dice lo que es');
    ok(html.includes('22/09/2026'), 'con CEE final, sale su fila');
    ok(html.includes('&lt;b&gt;nº 26/000417&lt;/b&gt; es material &amp; no abre'), 'la aclaración va escapada (texto de una persona)');
    ok(html.indexOf('Hitos de la actuación') < html.indexOf('Datos de la instalación de calefacción'),
        'los hitos van ANTES de la instalación');
    const paginas = (html.match(/class="doc-page"/g) || []).length;
    // Con cascada, los hitos van en su propia hoja: una hoja más, y también antes.
    const ec = JSON.parse(JSON.stringify(e));
    ec.instalacion.aerotermia_cal.equipos_extra = [{ marca: 'LASIAN', modelo: 'AERIA HT 12', numero_serie: 'X2', scop: 5.95 }];
    const htmlC = buildCifoHtml({ data: deriveCifoData({ expediente: ec, results }), appUrl: 'https://app.brokergy.es' });
    ok((htmlC.match(/class="doc-page"/g) || []).length === paginas + 1, 'con cascada, los hitos van en una hoja propia');
    ok(htmlC.indexOf('Hitos de la actuación') < htmlC.indexOf('Datos de la instalación de calefacción'),
        '… y esa hoja va antes de la de la instalación');
    // Orden del PROCESO: CEE inicial → facturas → actuación → CEE final.
    const pos = (t) => html.indexOf(t);
    ok(pos('>CEE inicial<') < pos('>Facturas<') && pos('>Facturas<') < pos('>Actuación<') && pos('>Actuación<') < pos('>CEE final<'),
        'filas en el orden del proceso: CEE inicial, facturas, actuación, CEE final');
    ok(html.includes('Última</span> <span style="font-weight:700;">11/09/2026'), 'la última factura, con su fecha');
    ok(html.includes('Pruebas RITE</span> <span style="font-weight:700;">15/09/2026'), 'la fecha de pruebas del RITE');
    // Sin CEE final todavía, su fila NO sale (y la puerta de Generar lo avisa).
    const ef = conMaterial();
    ef.instalacion = e.instalacion; ef.oportunidades = e.oportunidades;
    const htmlF = buildCifoHtml({ data: deriveCifoData({ expediente: ef, results }), appUrl: '' });
    ok(!htmlF.includes('>CEE final<') && htmlF.includes('>CEE inicial<'), 'sin CEE final, su fila NO sale');
    ok(avisosHitos(ef).some(a => a.id === 'hitos_sin_cee_final' && a.nivel === 'warn'), 'y la puerta de Generar lo avisa');
    ok(!avisosHitos(e).length, 'con todo puesto, ningún aviso');
    // Una sola factura: una casilla, sin «Primera»/«Última».
    const e1 = JSON.parse(JSON.stringify(e)); e1.documentacion.facturas = [e1.documentacion.facturas[1]];
    const html1 = buildCifoHtml({ data: deriveCifoData({ expediente: e1, results }), appUrl: '' });
    ok(html1.includes('>Factura<') && !html1.includes('Última</span>'), 'con una sola factura, una sola casilla');
    // Sin pruebas del RITE: casilla vacía (sin «—») y aviso.
    const e2 = JSON.parse(JSON.stringify(e)); delete e2.documentacion.fecha_pruebas_cert_instalacion;
    const html2 = buildCifoHtml({ data: deriveCifoData({ expediente: e2, results }), appUrl: '' });
    ok(!html2.includes('Pruebas RITE</span>') && avisosHitos(e2).some(a => a.id === 'hitos_sin_pruebas'), 'sin pruebas del RITE: no sale y se avisa');
    const bloqueF = htmlF.slice(htmlF.indexOf('Hitos de la actuación'), htmlF.indexOf('Datos de la instalación de calefacción'));
    ok(!bloqueF.includes('—'), 'el bloque nunca imprime «—»');
    // Sin ninguna fecha, no hay bloque.
    const e0 = { ...e, documentacion: {}, cee: {} };
    ok(!buildCifoHtml({ data: deriveCifoData({ expediente: e0, results }), appUrl: '' }).includes('Hitos de la actuación'),
        'sin ninguna fecha no se imprime un bloque vacío');
}

console.log('\n── El Certificado RES080 imprime el mismo bloque');
{
    const e = conMaterial({ hitos_actuacion: { aclaracion: 'Aclaración de prueba.' } });
    e.numero_expediente = '26RES080_62';
    e.instalacion = { aerotermia_cal: { marca: 'DAIKIN', modelo: 'EPRA14DW1', numero_serie: 'S1', scop: 4.12 },
        misma_aerotermia_acs: true, caldera_antigua_cal: { rendimiento_id: 'gas_post98_auto' } };
    e.oportunidades = { datos_calculo: { zona: 'D3' } };
    e.cee.cee_final = { fechaVisita: '2026-09-20', fechaFirma: '2026-09-22' };
    const data = deriveRes080Data({ expediente: e, results: { savingsKwh: 10000 } });
    const html = buildRes080Html({ data, appUrl: '' });
    ok(html.includes('Hitos de la actuación') && html.includes('Aclaración de prueba.'), 'lleva el bloque y la aclaración');
    ok(html.indexOf('Hitos de la actuación') < html.indexOf('Actuación sobre la instalación térmica'), 'antes de la instalación');
    ok(html.includes('22/09/2026'), 'con las fechas del CEE final');
    // El inicio del bloque es el de la hoja 1, aunque la vista previa lo edite.
    data.fields.fecha_inicio = '12/09/2026';
    ok(buildRes080Html({ data, appUrl: '' }).includes('Inicio</span> <span style="font-weight:700;">12/09/2026'), 'el inicio es el mismo que imprime la hoja 1');
}

console.log(fallos ? `\n${fallos} prueba(s) fallan.` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
