#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Las INEXACTITUDES del verificador → incidencias de cada expediente. Sin base de
 * datos, sin Drive y sin red: son funciones puras.
 *
 * Los casos son el informe real de LOTE-2025-012 (CAE-1904, 22/10/2026): seis
 * inexactitudes, dos de ellas a las cinco actuaciones. Vigila:
 *   · que cada inexactitud vaya al expediente de SU nº de actuación;
 *   · a qué documento(s) se cuelga, y que la que habla de dos salga en los dos;
 *   · que releer el mismo informe no duplique, y que un informe POSTERIOR que la
 *     repite la REABRA (y la pase a su ronda), y uno que la da por cerrada la cierre;
 *   · el nombre de la copia en la carpeta del requerimiento (con su _revN);
 *   · a qué ronda contesta lo que se volvió a pedir firmar (LOTE-2025-010, 21/10).
 *
 *   node scripts/test_inexactitudes_lote.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
const {
    documentosDeInexactitud, severidadDe, actuacionesDe, casarInexactitudes,
    rondaDeKey, planIncidencias, conRevision, rondaDelRefirmado,
} = require('../services/inexactitudesLote');

let fallos = 0;
const ok = (cond, texto) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${texto}`);
    if (!cond) fallos++;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const INFORME = [
    { n: 1, clasificacion: 'Inexactitud importante', estado: 'Abierto', actuaciones: '1,2,3,4,5', hecho: 'El Anexo I no se encuentra cumplimentado correctamente.' },
    { n: 2, clasificacion: 'Inexactitud importante', estado: 'Abierto', actuaciones: '1,2', hecho: 'No queda justificado que la T de impulsión es de 35 °C.' },
    { n: 3, clasificacion: 'Inexactitud importante', estado: 'Abierto', actuaciones: '3', hecho: 'Las coordenadas UTM y la RC no corresponden con la dirección del edificio objeto de estudio.' },
    { n: 4, clasificacion: 'Inexactitud importante', estado: 'Abierto', actuaciones: '4', hecho: 'No queda justificado el cálculo del SCOP.' },
    { n: 5, clasificacion: 'Inexactitud importante', estado: 'Abierto', actuaciones: '5', hecho: 'El nº de serie de unidad interior según el Anexo I difiere del indicado en la placa de características del equipo en el informe fotográfico.' },
    { n: 6, clasificacion: 'Inexactitud importante', estado: 'Abierto', actuaciones: '1,2,3,4,5', hecho: 'Las coordenadas UTM se encuentran incompletas en la documentación entregada.' },
];
const EXPS = [
    { id: 'e79', numero_expediente: '25RES060_79', orden_actuacion: 1 },
    { id: 'e85', numero_expediente: '25RES060_85', orden_actuacion: 2 },
    { id: 'e88', numero_expediente: '25RES060_88', orden_actuacion: 3 },
    { id: 'e100', numero_expediente: '26RES060_100', orden_actuacion: 4 },
    { id: 'e4', numero_expediente: '26RES093_4', orden_actuacion: 5 },
];
const LOTE = { id: 'lote12', codigo: 'LOTE-2025-012' };

console.log('\nA qué documento se cuelga');
ok(igual(documentosDeInexactitud(INFORME[0].hecho), ['anexo_i']), 'nº1 «el Anexo I no se encuentra cumplimentado» → Anexo I');
ok(igual(documentosDeInexactitud(INFORME[1].hecho), ['cert_cifo']), 'nº2 «T de impulsión» → CIFO (no nombra documento: va por el tema)');
ok(igual(documentosDeInexactitud(INFORME[3].hecho), ['cert_cifo']), 'nº4 «cálculo del SCOP» → CIFO');
ok(igual(documentosDeInexactitud(INFORME[4].hecho).sort(), ['anexo_fotografico', 'anexo_i']), 'nº5 Anexo I vs informe fotográfico → los DOS (no se adivina cuál se corrige)');
ok(documentosDeInexactitud(INFORME[5].hecho).includes('cert_cifo') && documentosDeInexactitud(INFORME[5].hecho).includes('anexo_cesion'),
    'nº6 «coordenadas UTM» → donde las declaramos (CIFO, Convenio de Cesión…)');
ok(igual(documentosDeInexactitud('Falta la factura de la bomba de calor y la del depósito.'), ['facturas']), '«factura» → Facturas');
ok(igual(documentosDeInexactitud('Algo que no se refiere a ningún papel concreto.'), []), 'nada reconocible → ningún documento');

console.log('\nSeveridad y actuaciones');
ok(severidadDe('Inexactitud importante') === 'GRAVE', '«importante» → GRAVE');
ok(severidadDe('Inexactitud no importante') === 'LEVE', '«no importante» → LEVE');
ok(igual(actuacionesDe('1,2,3,4,5'), [1, 2, 3, 4, 5]), '"1,2,3,4,5"');
ok(igual(actuacionesDe('1 a 3, 5'), [1, 2, 3, 5]), '"1 a 3, 5"');
ok(igual(actuacionesDe('Todas', [1, 2, 3]), [1, 2, 3]), '"Todas"');
ok(igual(actuacionesDe(null), []), 'sin actuaciones');
ok(rondaDeKey('informe_inexactitudes_2') === 2 && rondaDeKey('informe_verificacion') === null, 'ronda = nº del informe');

console.log('\nCasar con los expedientes del lote');
const { asignaciones, sin_casar } = casarInexactitudes(INFORME, EXPS);
const deExp = (id) => asignaciones.filter(a => a.exp.id === id).map(a => a.inex.n);
ok(asignaciones.length === 5 + 2 + 1 + 1 + 1 + 5, '15 incidencias en total (5 + 2 + 1 + 1 + 1 + 5)');
ok(igual(deExp('e79'), [1, 2, 6]), '25RES060_79 (E1) → nº 1, 2 y 6');
ok(igual(deExp('e88'), [1, 3, 6]), '25RES060_88 (E3) → nº 1, 3 y 6');
ok(igual(deExp('e4'), [1, 5, 6]), '26RES093_4 (E5) → nº 1, 5 y 6');
ok(sin_casar.length === 0, 'ninguna sin expediente');
const raro = casarInexactitudes([{ n: 9, actuaciones: '7', hecho: 'x' }, { n: 10, actuaciones: null, hecho: 'Falta el poder del representante.' }], EXPS);
ok(raro.asignaciones.length === 0 && raro.sin_casar.length === 2, 'una actuación que no existe y una sin actuaciones → sin casar, con su motivo');
const porNumero = casarInexactitudes([{ n: 11, actuaciones: null, hecho: 'En 26RES060_100 la factura no cuadra.' }], [...EXPS, { id: 'x', numero_expediente: '26RES060_10', orden_actuacion: null }]);
ok(porNumero.asignaciones.length === 1 && porNumero.asignaciones[0].exp.id === 'e100', 'citado por número: 26RES060_100 no se confunde con 26RES060_10');

console.log('\nRegistrar, releer, reabrir y cerrar');
const base = { lote: LOTE, cae: 'CAE-1904', ahora: '2026-10-22T10:00:00.000Z' };
const inexsE4 = asignaciones.filter(a => a.exp.id === 'e4').map(a => a.inex);
const p1 = planIncidencias({ ...base, incidencias: [{ id: 'vieja', texto: 'otra', estado: 'ABIERTA' }], inexs: inexsE4, docKey: 'informe_inexactitudes_1', ronda: 1, desde: '2026-10-22T09:00:00.000Z', label: 'Informe de inexactitudes 1' });
ok(p1.nuevas === 3 && p1.incidencias.length === 4, '3 nuevas, y la que ya había se respeta');
const n5 = p1.incidencias.find(i => i.inexactitud?.n === 5);
ok(n5.procedencia === 'VERIFICACION' && n5.severidad === 'GRAVE' && n5.tipo === 'INEXACTITUD', 'procedencia VERIFICACION, GRAVE, tipo INEXACTITUD');
ok(n5.slot === null && igual(n5.slots.sort(), ['anexo_fotografico', 'anexo_i']), 'la que habla de dos documentos: sin `slot` único, con los dos en `slots`');
ok(p1.incidencias.find(i => i.inexactitud?.n === 1).slot === 'anexo_i', 'la de un documento lleva su `slot`');
ok(/^Inexactitud nº5 del verificador \(CAE-1904\): El nº de serie/.test(n5.texto), 'el texto dice de dónde viene y copia el hecho');

const p2 = planIncidencias({ ...base, incidencias: p1.incidencias, inexs: inexsE4, docKey: 'informe_inexactitudes_1', ronda: 1, desde: '2026-10-22T09:00:00.000Z', label: 'Informe de inexactitudes 1' });
ok(p2.nuevas === 0 && p2.iguales === 3 && p2.incidencias.length === 4, 'releer el MISMO informe no duplica nada');

const subsanadas = p1.incidencias.map(i => (i.inexactitud?.n === 1 ? { ...i, estado: 'SUBSANADA', resuelta_at: 'x' } : i));
const repetido = [{ ...INFORME[0], estado: 'Abierto' }, { ...INFORME[4], estado: 'Cerrado' }];
const p3 = planIncidencias({ ...base, incidencias: subsanadas, inexs: repetido, docKey: 'informe_inexactitudes_2', ronda: 2, desde: '2026-11-05T09:00:00.000Z', label: 'Informe de inexactitudes 2' });
const n1b = p3.incidencias.find(i => i.inexactitud?.n === 1);
ok(p3.reabiertas === 1 && n1b.estado === 'ABIERTA' && n1b.inexactitud.ronda === 2, 'el informe 2 repite la nº1 ya subsanada → se REABRE y pasa a la ronda 2');
ok(n1b.inexactitud.desde === '2026-11-05T09:00:00.000Z', '…y lo corregido se mide desde el informe 2');
ok(n1b.comentarios.some(c => c.tipo === 'REAPERTURA'), '…con su REAPERTURA en el hilo');
const n5b = p3.incidencias.find(i => i.inexactitud?.n === 5);
ok(p3.cerradas === 1 && n5b.estado === 'SUBSANADA' && n5b.inexactitud.cerrada_por_verificador, 'el informe 2 da la nº5 por cerrada → se subsana sola');
ok(subsanadas.find(i => i.inexactitud?.n === 1).estado === 'SUBSANADA', 'el plan no muta la lista de entrada');

console.log('\nNombre en la carpeta del requerimiento');
ok(conRevision('E5-4-5 - 26RES093_4 - ANEXO I_fdo.pdf', '26RES093_4 - ANEXO I_rev1_fdo.pdf') === 'E5-4-5 - 26RES093_4 - ANEXO I_rev1_fdo.pdf', 'conserva el _rev1 del original, antes del _fdo');
ok(conRevision('E3-3-5 - 25RES060_88 - CERTIFICADO CIFO_fdo.pdf', '25RES060_88 - CIFO_fdo.pdf') === 'E3-3-5 - 25RES060_88 - CERTIFICADO CIFO_fdo.pdf', 'sin revisión, el nombre del paquete tal cual');
ok(conRevision('E2-3-8 - 25RES060_85 - CEE FINAL_XML.xml', 'CEE FINAL_rev2.xml') === 'E2-3-8 - 25RES060_85 - CEE FINAL_XML_rev2.xml', 'sin _fdo, la revisión va antes de la extensión');

console.log('\nA qué ronda contesta un documento vuelto a firmar');
const docsLote = [
    { key: 'informe_inexactitudes_1', uploaded_at: '2026-10-21T13:55:58.722Z' },
    { key: 'informe_inexactitudes_2', uploaded_at: '2026-11-05T10:00:00.000Z' },
    { key: 'anexo_i', rev: 1, sent_at: '2026-10-21T13:57:47.346Z', requerimiento_at: '2026-10-21T13:57:47.346Z', requerimiento_ronda: '1792591067346' },
];
ok(rondaDelRefirmado(docsLote, docsLote[2]) === 1, 'pedido 2 min después del informe 1 → ronda 1 (el informe 2 es posterior)');
ok(rondaDelRefirmado(docsLote, { requerimiento_at: '2026-11-06T09:00:00.000Z' }) === 2, 'pedido tras el informe 2 → ronda 2');
ok(rondaDelRefirmado(docsLote, { requerimiento_at: '2026-10-01T09:00:00.000Z' }) === null, 'pedido antes de cualquier informe → sin ronda (no viene de una inexactitud)');
ok(rondaDelRefirmado(docsLote, { requerimiento_ronda: '1792591067346' }) === null, 'el `requerimiento_ronda` (marca de tiempo del envío) NO es el nº de ronda');

console.log(fallos ? `\n✗ ${fallos} fallo(s)\n` : '\n✓ Todo correcto\n');
process.exit(fallos ? 1 : 0);
