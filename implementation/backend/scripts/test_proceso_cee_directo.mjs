/**
 * Procedimiento del CEE directo (ceeDirectoProceso): pasos, pelota, apartados del
 * cliente y textos de la factura, del aviso de «registrado» y de la entrega.
 * Sin BD y sin red (Drive se sustituye por lo que «hay» en la carpeta).
 *
 *   node implementation/backend/scripts/test_proceso_cee_directo.mjs
 */
import assert from 'assert';
import { createRequire } from 'module';
import * as fac from '../../frontend/src/features/cee-directo/logic/facturaCee.js';

const require = createRequire(import.meta.url);
const estados = require('../utils/ceeDirectoEstados');
const recordatorios = require('../services/recordatorios');
const uploads = require('../services/ceeDirectoUploadService');
const proceso = require('../services/ceeDirectoProceso');
const docs = require('../services/ceeDirectoDocsService');
const entrega = require('../services/ceeDirectoEntrega');

let ok = 0;
const t = async (nombre, fn) => { await fn(); ok++; console.log('  ✓', nombre); };

const base = (extra = {}) => ({
    id: 'x', numero_expediente: '2026CEE_99', alcance: 'UNICO', cobrado: false,
    seguimiento: { cee_inicial: 'PRESENTADO' }, documentacion: {}, cee: {}, cliente: { nombre_razon_social: 'ANA', apellidos: 'PÉREZ', tlf: '600000000' },
    ...extra,
});

// Drive simulado: lo que hay en la carpeta de cada fase.
let enCarpeta = { inicial: {}, final: {} };
uploads.scanSection = async (_row, fase) => enCarpeta[fase === 'final' ? 'final' : 'inicial'] || {};

await t('firmado + visto bueno: REVISADO con el PDF; sin PDF no', async () => {
    assert.equal(proceso.firmadoConVistoBueno(base({ seguimiento: { cee_inicial: 'REVISADO' } }), 'inicial', { pdf: {} }), true);
    assert.equal(proceso.firmadoConVistoBueno(base({ seguimiento: { cee_inicial: 'REVISADO' } }), 'inicial', {}), false);
    assert.equal(proceso.firmadoConVistoBueno(base(), 'inicial', { pdf: {} }), false, 'PRESENTADO sin visto bueno');
});

await t('certificador de la casa: mandarlo a presentar cuenta como visto bueno', async () => {
    const row = base({ cee: { presentacion: { inicial: { nonce: 'n', enviado_at: '2026-10-14' } } } });
    assert.equal(proceso.firmadoConVistoBueno(row, 'inicial', { pdf: {} }), true);
});

await t('toca facturar: firmado+VB, sin factura y sin cobrar', async () => {
    const row = base({ seguimiento: { cee_inicial: 'REVISADO' }, drive_folder_id: 'f' });
    assert.equal(await proceso.tocaFacturar(row, { pdf: {} }), true);
    assert.equal(await proceso.tocaFacturar({ ...row, cobrado: true }, { pdf: {} }), false);
    assert.equal(await proceso.tocaFacturar({ ...row, documentacion: { facturas_emitidas: { '26ING_1': { numero: '26ING_1' } } } }, { pdf: {} }), false);
});

await t('pelota del final: CLIENTE hasta que sube la factura de la instalación', async () => {
    const row = base({ alcance: 'DOBLE', seguimiento: { cee_inicial: 'REGISTRADO', cee_final: 'PTE_ENVIO_CERT' } });
    assert.equal(estados.responsable(row), 'CLIENTE');
    assert.equal(estados.responsable({ ...row, documentacion: { factura_instalacion: { at: 'x' } } }), 'BROKERGY');
    assert.equal(estados.responsable({ ...row, factura_instalacion: { at: 'x' } }), 'BROKERGY', 'alias del listado');
    assert.equal(estados.responsable({ ...row, seguimiento: { cee_inicial: 'REGISTRADO', cee_final: 'ASIGNADO' } }), 'CERTIFICADOR');
});

await t('apartados del cliente: justificante solo con factura; factura de obra solo en DOBLE', async () => {
    const claves = (row) => docs.checklist(row).map(s => s.key);
    assert.ok(!claves(base()).includes('JUSTIFICANTE_PAGO'));
    assert.ok(claves(base({ documentacion: { facturas_emitidas: { a: {} } } })).includes('JUSTIFICANTE_PAGO'));
    assert.ok(!claves(base()).includes('DOC_FACTURAS'));
    assert.ok(claves(base({ alcance: 'DOBLE' })).includes('DOC_FACTURAS'));
    assert.ok(!docs.checklist().some(s => s.key === 'JUSTIFICANTE_PAGO'), 'el buzón de fotos no lo propone nunca');
    assert.ok(!docs.checklist(base({ documentacion: { facturas_emitidas: { a: {} } } })).some(s => 'subcarpeta' in s), 'la subcarpeta no viaja al navegador');
});

await t('mensaje de la factura: firmado, enlace del justificante y el final incluido', async () => {
    const lineas = [{ descripcion: 'Certificado de Eficiencia Energética inicial y final, incluida su presentación' }];
    const m = fac.mensajeFactura({ nombre: 'ANA PÉREZ', numero: '26ING_90', total: 298.98, lineas, enlacePago: 'https://app/x?need=JUSTIFICANTE_PAGO', certificado: 'firmado', doble: true });
    assert.match(m, /hecho y firmado/);
    assert.match(m, /sube aquí el justificante de pago/);
    assert.match(m, /need=JUSTIFICANTE_PAGO/);
    assert.match(m, /incluye también el \*certificado final\*/);
    // Sin contexto: el de siempre.
    const viejo = fac.mensajeFactura({ nombre: 'ANA', numero: 'N', total: 1, lineas });
    assert.match(viejo, /remítenos por aquí/);
    // DOBLE pero facturando solo el inicial: no promete el final.
    const soloIni = fac.mensajeFactura({ numero: 'N', total: 1, doble: true, lineas: [{ descripcion: 'Certificado de Eficiencia Energética inicial' }] });
    assert.doesNotMatch(soloIni, /certificado final/);
    // DOBLE con el final ya registrado (2026CEE_61): los dos hechos, nada de «cuando la instalación esté terminada».
    const ambos = fac.mensajeFactura({ numero: 'N', total: 1, lineas, enlacePago: 'https://app/x', certificado: 'registrado', doble: true, finalRegistrado: true });
    assert.match(ambos, /inicial y final\* ya están hechos/);
    assert.doesNotMatch(ambos, /cuando la instalación esté terminada/);
    assert.match(ambos, /te los mandamos/);
});

await t('aviso de registrado con la factura YA enviada: la recuerda y lleva el enlace', async () => {
    const m = recordatorios.ceeDirectoRegistradoClienteMsg({
        destinatario: 'Ana', numExp: '2026CEE_99', fase: 'unico', facturaPendiente: { numero: '26ING_90', total: 197.89 }, enlacePago: 'https://app/pago',
    });
    assert.match(m, /factura \*26ING_90\*/);
    assert.match(m, /https:\/\/app\/pago/);
    assert.doesNotMatch(m, /adjuntamos la factura/);
});

await t('entrega del INICIAL de un DOBLE: enlace para la factura de la instalación y la tasa', async () => {
    const row = base({ alcance: 'DOBLE', cobrado: true });
    const m = entrega.mensaje(row, 'inicial', { enlaceObra: 'https://app/obra', conTasa: true });
    assert.match(m, /https:\/\/app\/obra/);
    assert.match(m, /Ya está pagado/);
    assert.match(m, /justificante de la tasa/);
    const sinEnlace = entrega.mensaje(row, 'inicial', {});
    assert.match(sinEnlace, /avísanos/);
});

await t('pasos de un DOBLE recién facturado: la pelota del cobro es del cliente', async () => {
    enCarpeta = { inicial: { pdf: { name: 'x_fdo.pdf' } }, final: {} };
    const row = base({
        alcance: 'DOBLE', drive_folder_id: 'f', seguimiento: { cee_inicial: 'REVISADO' },
        documentacion: { oferta: { numero: '2026PCEE_1', aceptada_at: '2026-10-01' },
            facturas_emitidas: { '26ING_90': { numero: '26ING_90', total: 298.98, emitida_at: '2026-10-14', envios: [{ at: '2026-10-14' }] } } },
    });
    const r = await proceso.pasos(row);
    const p = Object.fromEntries(r.pasos.map(x => [x.clave, x]));
    assert.equal(p.firmado.estado, 'hecho');
    assert.equal(p.factura.estado, 'hecho');
    assert.equal(p.pago.estado, 'espera'); assert.equal(p.pago.quien, 'CLIENTE');
    assert.ok(p.obra && p.final && p.entrega_final, 'un DOBLE pinta los nueve pasos');
    // Sube el justificante → toca confirmar el cobro.
    const r2 = await proceso.pasos({ ...row, documentacion: { ...row.documentacion, justificante_pago: { at: '2026-10-15' } } });
    assert.equal(r2.siguiente.accion, 'cobro');
});

await t('aviso al equipo tras registrar: según el procedimiento', async () => {
    assert.match(proceso.siguienteTrasRegistro(base({ cobrado: true }), 'inicial'), /sale sola/);
    assert.match(proceso.siguienteTrasRegistro(base(), 'inicial'), /avisar=inicial/);
    const conFac = base({ documentacion: { facturas_emitidas: { a: { numero: '26ING_90', envios: [{}] } } } });
    assert.match(proceso.siguienteTrasRegistro(conFac, 'inicial'), /Falta el pago: la factura 26ING_90 ya se le envió/);
});

console.log(`\n${ok} comprobaciones OK`);
process.exit(0);
