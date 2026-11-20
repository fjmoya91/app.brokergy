/**
 * La OFERTA del verificador, sola (services/ofertaVerificadorAuto.js): cuándo sale
 * sola al S.O. y cuándo se retiene, y que el mensaje es el MISMO que el del modal
 * (frontend/…/lotes/logic/mensajesDocLote.js, fuente única).
 * Sin red: no llama a beCAE, ni al buzón, ni a Gemini, ni escribe en la BD.
 *
 *   node scripts/test_oferta_verificador_auto.js
 */
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { decidirEnvio, textoAviso, activo } = require('../services/ofertaVerificadorAuto');

let fallos = 0;
const caso = async (nombre, fn) => {
    try { await fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
};

const OFERTA = { key: 'oferta_verificacion', tipo: 'oferta_verificacion', label: 'Oferta de verificación', importe: 869, sent_at: null };
const OCR_LIMPIO = { leido: true, base_imponible: 869, avisos: [] };

(async () => {
    console.log('\n¿Sale sola?');
    await caso('importe leído, sin avisos y con email del S.O. → se envía', () => {
        const d = decidirEnvio({ documento: OFERTA, ocr: OCR_LIMPIO, notifyEmail: 'so@example.com' });
        assert.deepStrictEqual(d, { enviar: true, motivos: [] });
    });
    await caso('sin importe → se retiene', () => {
        const d = decidirEnvio({ documento: { ...OFERTA, importe: undefined }, ocr: { leido: true, avisos: [] }, notifyEmail: 'so@example.com' });
        assert.strictEqual(d.enviar, false);
        assert.ok(d.motivos.some(m => /importe/.test(m)), d.motivos.join(' | '));
    });
    await caso('el lector falla → se retiene', () => {
        const d = decidirEnvio({ documento: { ...OFERTA, importe: undefined }, ocr: { leido: false, error: 'timeout' }, notifyEmail: 'so@example.com' });
        assert.strictEqual(d.enviar, false);
        assert.ok(d.motivos.some(m => /timeout/.test(m)));
    });
    await caso('avisos del lector (otro lote, otro verificador…) → se retiene', () => {
        const d = decidirEnvio({ documento: OFERTA, ocr: { ...OCR_LIMPIO, avisos: ['La factura cita otro lote'] }, notifyEmail: 'so@example.com' });
        assert.strictEqual(d.enviar, false);
        assert.ok(d.motivos.some(m => /otro lote/.test(m)));
    });
    await caso('S.O. sin email de notificaciones → se retiene', () => {
        const d = decidirEnvio({ documento: OFERTA, ocr: OCR_LIMPIO, notifyEmail: null });
        assert.strictEqual(d.enviar, false);
        assert.ok(d.motivos.some(m => /email/.test(m)));
    });
    await caso('ya enviada → nunca dos veces', () => {
        const d = decidirEnvio({ documento: { ...OFERTA, sent_at: '2026-11-17T11:32:00Z' }, ocr: OCR_LIMPIO, notifyEmail: 'so@example.com' });
        assert.strictEqual(d.enviar, false);
        assert.ok(d.motivos.some(m => /enviada/.test(m)));
    });
    await caso('importe tecleado a mano (sin OCR) y sin avisos → se envía', () => {
        assert.strictEqual(decidirEnvio({ documento: OFERTA, ocr: null, notifyEmail: 'so@example.com' }).enviar, true);
    });

    console.log('\nEl aviso al admin');
    await caso('retenida: dice el lote, por qué y dónde mandarla', () => {
        const { titulo, texto } = textoAviso({ accion: 'retenida', lote: 'LOTE-2099-001', importe: null, motivos: ['no se ha leído el importe de la oferta'] });
        assert.ok(/sin enviar/.test(titulo) && /LOTE-2099-001/.test(titulo));
        assert.ok(/NO se ha enviado/.test(texto) && /importe/.test(texto) && /fase 3/.test(texto));
    });
    await caso('enviada: dice a quién y el importe', () => {
        const { titulo, texto } = textoAviso({ accion: 'enviada', lote: 'LOTE-2099-001', importe: 869, to: 'so@example.com', cc: ['cc@example.com'], warnings: [] });
        assert.ok(/enviada/.test(titulo));
        assert.ok(/so@example\.com/.test(texto) && /cc@example\.com/.test(texto) && /869,00 €/.test(texto));
    });

    console.log('\nEl mensaje: fuente única con el modal');
    const M = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/mensajesDocLote.js')).href);
    const LOTE = {
        codigo: 'LOTE-2099-001',
        verificador: { razon_social: 'VERIFICADORA DE PRUEBA SL', acronimo: 'VDP' },
        sujeto_obligado: { contacto_notificaciones_activas: true, contactos_notificacion: [{ nombre: 'Ana María López', email: 'ana@example.com' }] },
    };
    await caso('oferta: saludo con el nombre de pila, código, verificador y las tres vías', () => {
        const t = M.mensajeDocLote(LOTE, OFERTA);
        assert.ok(t.startsWith('Hola Ana,\n\nAdjuntamos la oferta de verificación del lote LOTE-2099-001, emitida por VERIFICADORA DE PRUEBA SL'), t.slice(0, 160));
        assert.ok(/1\. Firmarla online/.test(t) && /2\. Firmarla por vuestra cuenta/.test(t) && /3\. Devolvérnosla firmada/.test(t));
        assert.ok(t.endsWith('Un saludo,\nBROKERGY · Ingeniería Energética'));
    });
    await caso('sin contacto con nombre → «Estimados,»; sin verificador → genérico', () => {
        const t = M.mensajeDocLote({ codigo: 'LOTE-2099-002' }, OFERTA);
        assert.ok(t.startsWith('Estimados,\n'));
        assert.ok(/emitida por la entidad verificadora/.test(t));
    });
    await caso('factura del verificador: su texto, con el importe', () => {
        const t = M.mensajeDocLote(LOTE, { tipo: 'factura_verificador', importe: 869 });
        assert.ok(/Os remitimos la factura de VERIFICADORA DE PRUEBA SL/.test(t), t.slice(0, 200));
        assert.ok(/869/.test(t));
    });

    console.log('\nEl interruptor');
    await caso('nace apagado: sin OFERTA_VERIFICADOR_AUTO=true no hace nada', () => {
        const antes = process.env.OFERTA_VERIFICADOR_AUTO;
        delete process.env.OFERTA_VERIFICADOR_AUTO;
        assert.strictEqual(activo(), false);
        process.env.OFERTA_VERIFICADOR_AUTO = 'true';
        assert.strictEqual(activo(), true);
        if (antes === undefined) delete process.env.OFERTA_VERIFICADOR_AUTO; else process.env.OFERTA_VERIFICADOR_AUTO = antes;
    });

    // ═══ La SOLICITUD → Anexo I + fichas + solicitud al S.O. (regla 222) ═══════
    const { decidirEnvioSo, textoAvisoSo, activoSolicitud, ESPERA_SOLICITUD_MS } = require('../services/ofertaVerificadorAuto');
    const AHORA = Date.parse('2026-11-18T12:00:00Z');
    const hace = (min) => new Date(AHORA - min * 60000).toISOString();
    const LOTE_SO = { codigo: 'LOTE-2099-001', oferta_lote: 154, expedientes: [{ id: 'e1' }, { id: 'e2' }] };
    const DOCS_SO = [
        { tipo: 'anexo_i_listado', label: 'Anexo I', html: '<p>anexo</p>' },
        { tipo: 'ficha_res', label: 'Ficha RES060', formulario: { ficha: 'RES060' } },
        { tipo: 'ficha_res', label: 'Ficha RES060', formulario: { ficha: 'RES060' } },
    ];
    const BASE = { lote: LOTE_SO, docs: DOCS_SO, totales: { numActuaciones: 2, ahorroMwh: 75.4 }, notifyEmail: 'so@example.com', solicitud: { uploaded_at: hace(90) }, solicitudOk: true, yaEnviado: false, ahora: AHORA };

    console.log('\nLa solicitud: ¿sale sola la fase 2?');
    await caso('todo listo y la solicitud llegó hace más de la espera → se envía', () => {
        assert.deepStrictEqual(decidirEnvioSo(BASE), { enviar: true, esperando: false, motivos: [] });
    });
    await caso('la solicitud acaba de llegar → ESPERA (no avisa: hay alguien delante)', () => {
        const d = decidirEnvioSo({ ...BASE, solicitud: { uploaded_at: hace(5) } });
        assert.strictEqual(d.enviar, false); assert.strictEqual(d.esperando, true); assert.deepStrictEqual(d.motivos, []);
        assert.strictEqual(ESPERA_SOLICITUD_MS, 60 * 60000);
    });
    await caso('ya enviado al S.O. → nunca dos veces', () => {
        const d = decidirEnvioSo({ ...BASE, yaEnviado: true });
        assert.strictEqual(d.enviar, false); assert.ok(d.motivos.some(m => /ya se envió/.test(m)));
    });
    await caso('sin la solicitud del verificador → no', () => {
        const d = decidirEnvioSo({ ...BASE, solicitudOk: false });
        assert.strictEqual(d.enviar, false); assert.ok(d.motivos.some(m => /solicitud/.test(m)));
    });
    await caso('S.O. sin email → se retiene', () => {
        assert.ok(decidirEnvioSo({ ...BASE, notifyEmail: '' }).motivos.some(m => /email/.test(m)));
    });
    await caso('sin Oferta lote (€/MWh) → se retiene (la columna Precio saldría vacía)', () => {
        assert.ok(decidirEnvioSo({ ...BASE, lote: { ...LOTE_SO, oferta_lote: null } }).motivos.some(m => /Precio/.test(m)));
    });
    await caso('una ficha sin contenido → se retiene y dice cuál', () => {
        const docs = [DOCS_SO[0], DOCS_SO[1], { tipo: 'ficha_res', label: 'Ficha RES093' }];
        assert.ok(decidirEnvioSo({ ...BASE, docs }).motivos.some(m => /RES093/.test(m)));
    });
    await caso('el Anexo I no cuadra con los expedientes → se retiene', () => {
        assert.ok(decidirEnvioSo({ ...BASE, totales: { numActuaciones: 1, ahorroMwh: 30 } }).motivos.some(m => /no cuadra/.test(m)));
        assert.ok(decidirEnvioSo({ ...BASE, totales: { numActuaciones: 2, ahorroMwh: 0 } }).motivos.some(m => /no cuadra/.test(m)));
    });
    await caso('aviso «enviada»: dice que el Anexo I va SIN la firma de Brokergy y cómo contrafirmar', () => {
        const { titulo, texto } = textoAvisoSo({ accion: 'enviada', lote: 'LOTE-2099-001', fichas: 2, to: 'so@example.com', cc: ['cc@example.com'] });
        assert.ok(/enviados al S\.O\./.test(titulo));
        assert.ok(/SIN tu firma/.test(texto) && /contrafirmar_anexo_i_lote/.test(texto) && /so@example\.com/.test(texto));
    });
    await caso('aviso «retenida»: el lote, los motivos y dónde mandarlo', () => {
        const { titulo, texto } = textoAvisoSo({ accion: 'retenida', lote: 'LOTE-2099-001', motivos: ['el Sujeto Obligado no tiene email de notificaciones'] });
        assert.ok(/sin enviar/.test(titulo) && /NO se ha enviado/.test(texto) && /fase 2/.test(texto));
    });
    await caso('nace apagado: sin SOLICITUD_SO_AUTO=true no hace nada (y es otro interruptor que el de la oferta)', () => {
        const antes = process.env.SOLICITUD_SO_AUTO, antesO = process.env.OFERTA_VERIFICADOR_AUTO;
        delete process.env.SOLICITUD_SO_AUTO; process.env.OFERTA_VERIFICADOR_AUTO = 'true';
        assert.strictEqual(activoSolicitud(), false);
        process.env.SOLICITUD_SO_AUTO = 'true';
        assert.strictEqual(activoSolicitud(), true);
        if (antes === undefined) delete process.env.SOLICITUD_SO_AUTO; else process.env.SOLICITUD_SO_AUTO = antes;
        if (antesO === undefined) delete process.env.OFERTA_VERIFICADOR_AUTO; else process.env.OFERTA_VERIFICADOR_AUTO = antesO;
    });

    console.log('\nLa solicitud: mensaje y documentos de la fuente única (envioSoDocs.js)');
    const ES = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/envioSoDocs.js')).href);
    await caso('el mensaje cuenta actuaciones y MWh, y cierra con la firma de siempre', () => {
        const t = ES.mensajeEnvioSo({ codigo: 'LOTE-2099-001' }, { numActuaciones: 3, ahorroMwh: 112.46, ahorroGwh: 0.11246 });
        assert.ok(t.startsWith('Estimados,\n\nAdjuntamos el Anexo I (Listado de Cesión de Ahorros) del lote LOTE-2099-001, que recoge 3 actuaciones con un ahorro total de 112,5 MWh/año (0,11 GWh/año)'), t.slice(0, 200));
        assert.ok(t.endsWith('Un saludo,\nBROKERGY · Ingeniería Energética'));
    });
    await caso('el Anexo I firmado por el Proveedor viaja como PDF; sin él, como HTML', () => {
        const d1 = ES.docsEnvioSo({ codigo: 'L', expedientes: [] }, { html: '<p/>', proveedorSigned: 'JVBERi0=' });
        assert.strictEqual(d1[0].pdfBase64, 'JVBERi0='); assert.strictEqual(d1[0].tipo, 'anexo_i_listado');
        const d2 = ES.docsEnvioSo({ codigo: 'L', expedientes: [] }, { html: '<p/>' });
        assert.strictEqual(d2[0].pdfBase64, null); assert.strictEqual(d2[0].html, '<p/>');
        assert.strictEqual(ES.mesDe(new Date('2026-11-18')), 'Noviembre');
    });

    console.log('\nLa oferta firmada → beCAE (= aceptarla, regla 223)');
    const OA = require('../services/ofertaVerificadorAuto');
    const FIRMADA = { key: 'oferta_verificacion', signed_file_id: 'f1', signed_at: '2026-11-18T07:22:45Z', original_file_name: '02. V20261827_Oferta_Estandarizada_1F.pdf' };
    const SECO = { seco: true, ficheros: [{ nombre: '02. V20261827_Oferta_Estandarizada_1F_fdo.pdf', bytes: 1 }], ya_en_becae: [], bloqueo: [], ofertas_becae: [{ id: 9, name: '02. V20261827_Oferta_Estandarizada_1F.pdf' }] };
    const MAS_TARDE = Date.parse('2026-11-18T09:00:00Z');
    await caso('la firmada es la de la oferta vigente y ya pasó la espera → se acepta', () => {
        assert.deepStrictEqual(OA.decidirAceptarOferta({ oferta: FIRMADA, seco: SECO, ahora: MAS_TARDE }), { aceptar: true, esperando: false, nada: null, motivos: [] });
    });
    await caso('recién registrada → espera (no avisa)', () => {
        const d = OA.decidirAceptarOferta({ oferta: FIRMADA, seco: SECO, ahora: Date.parse('2026-11-18T07:40:00Z') });
        assert.strictEqual(d.aceptar, false); assert.strictEqual(d.esperando, true); assert.deepStrictEqual(d.motivos, []);
    });
    await caso('Marwen emitió otra oferta después → se retiene', () => {
        const d = OA.decidirAceptarOferta({ oferta: FIRMADA, seco: { ...SECO, ofertas_becae: [...SECO.ofertas_becae, { id: 10, name: '02. V20261901_Oferta_Estandarizada_1F.pdf' }] }, ahora: MAS_TARDE });
        assert.strictEqual(d.aceptar, false); assert.ok(/vigente en beCAE es «02. V20261901/.test(d.motivos[0]), d.motivos[0]);
    });
    await caso('sin nombre original de la oferta → se retiene (no se sabe cuál se firmó)', () => {
        const d = OA.decidirAceptarOferta({ oferta: { ...FIRMADA, original_file_name: null }, seco: SECO, ahora: MAS_TARDE });
        assert.strictEqual(d.aceptar, false); assert.ok(/no consta/.test(d.motivos[0]));
    });
    await caso('ya en beCAE / sin firmar → nada', () => {
        assert.strictEqual(OA.decidirAceptarOferta({ oferta: FIRMADA, seco: { ...SECO, ya_en_becae: ['x'] } }).nada, 'en beCAE ya está la oferta firmada');
        assert.strictEqual(OA.decidirAceptarOferta({ oferta: { ...FIRMADA, signed_file_id: null }, seco: SECO }).nada, 'la oferta no ha vuelto firmada');
    });
    await caso('el nombre se compara sin «_fdo», «(1)» ni mayúsculas', () => {
        assert.strictEqual(OA.nombreOferta('02. V20261827_Oferta_Estandarizada_1F_fdo (1).PDF'), OA.nombreOferta('02. v20261827_oferta_estandarizada_1f.pdf'));
    });
    await caso('avisos: aceptada y retenida', () => {
        const a = OA.textoAvisoOfertaFirmada({ accion: 'aceptada', lote: 'LOTE-1', num_solicitud: '0035-S22', estado_solicitud: 'Oferta aceptada', ficheros: ['x.pdf'], motivos: [] });
        assert.ok(/queda ACEPTADA \(solicitud 0035-S22: Oferta aceptada\)/.test(a.texto));
        const r = OA.textoAvisoOfertaFirmada({ accion: 'retenida', lote: 'LOTE-1', motivos: ['m1'] });
        assert.ok(/NO se ha subido a beCAE/.test(r.texto) && /- m1/.test(r.texto));
    });
    await caso('nace APAGADO (OFERTA_FIRMADA_BECAE_AUTO)', () => {
        const antes = process.env.OFERTA_FIRMADA_BECAE_AUTO;
        delete process.env.OFERTA_FIRMADA_BECAE_AUTO; assert.strictEqual(OA.activoOfertaFirmada(), false);
        process.env.OFERTA_FIRMADA_BECAE_AUTO = 'true'; assert.strictEqual(OA.activoOfertaFirmada(), true);
        if (antes === undefined) delete process.env.OFERTA_FIRMADA_BECAE_AUTO; else process.env.OFERTA_FIRMADA_BECAE_AUTO = antes;
    });

    console.log('\nEl informe de inexactitudes del correo (services/inexactitudesCorreo.js, regla 224)');
    const IC = require('../services/inexactitudesCorreo');
    const L015 = { codigo: 'LOTE-2026-015', expediente_verificador: 'CAE-2035', documentos_so: [
        { key: 'informe_inexactitudes_1', tipo: 'informe_inexactitudes', original_file_name: '05. Inexactitudes_CAE-2035.pdf' },
        { key: 'informe_inexactitudes_2', tipo: 'informe_inexactitudes', original_file_name: '05. Inexactitudes_CAE-2035_v1 (1).pdf' },
    ] };
    await caso('el asunto de Marwen da versión, expediente y lote; una respuesta no cuenta', () => {
        assert.deepStrictEqual(IC.leerAsunto('Inexactitudes_v3 del expediente CAE-2035 (LOTE-2026-015)'), { version: 3, cae: 'CAE-2035', lote: 'LOTE-2026-015' });
        assert.deepStrictEqual(IC.leerAsunto('Inexactitudes del expediente CAE-1991 (LOTE-2026-014)'), { version: 0, cae: 'CAE-1991', lote: 'LOTE-2026-014' });
        assert.strictEqual(IC.leerAsunto('RE: Inexactitudes_v3 del expediente CAE-2035 (LOTE-2026-015)'), null);
        assert.strictEqual(IC.leerAsunto('Cambio de estado del expediente CAE-2035 (LOTE-2026-015)'), null);
    });
    await caso('un informe nuevo (v3 tras v0 y v1) se sube', () => {
        assert.deepStrictEqual(IC.decidirInforme({ lote: L015, nombre: '05. Inexactitudes_CAE-2035_v3.pdf', cae: 'CAE-2035', fecha: '2026-11-18T14:06:00Z' }), { subir: true, motivo: null });
    });
    await caso('el mismo (aunque venga con «(1)») o uno más viejo, no', () => {
        assert.strictEqual(IC.decidirInforme({ lote: L015, nombre: '05. Inexactitudes_CAE-2035_v1.pdf', cae: 'CAE-2035' }).subir, false);
        const L = { ...L015, documentos_so: [...L015.documentos_so, { tipo: 'informe_inexactitudes', original_file_name: '05. Inexactitudes_CAE-2035_v5.pdf' }] };
        assert.ok(/más nuevo \(v5\)/.test(IC.decidirInforme({ lote: L, nombre: '05. Inexactitudes_CAE-2035_v3.pdf', cae: 'CAE-2035' }).motivo));
    });
    await caso('otro expediente del verificador → no', () => {
        assert.ok(/no del CAE-9999/.test(IC.decidirInforme({ lote: L015, nombre: 'x_v9.pdf', cae: 'CAE-9999' }).motivo));
    });
    await caso('anterior al dictamen del lote → no (lo reabriría: LOTE-2026-014)', () => {
        const L = { ...L015, documentos_so: [...L015.documentos_so, { key: 'dictamen_favorable', tipo: 'dictamen_favorable', uploaded_at: '2026-11-13T11:49:51Z' }] };
        assert.ok(/reabriría/.test(IC.decidirInforme({ lote: L, nombre: '05. Inexactitudes_CAE-2035_v3.pdf', cae: 'CAE-2035', fecha: '2026-11-12T09:41:00Z' }).motivo));
        assert.strictEqual(IC.decidirInforme({ lote: L, nombre: '05. Inexactitudes_CAE-2035_v3.pdf', cae: 'CAE-2035', fecha: '2026-11-20T09:00:00Z' }).subir, true);
    });
    const INF = { lote: 'LOTE-2026-015', cae: 'CAE-2035', version_verificador: 3, ronda: 3, totales: { cerradas: 6 }, items: [
        { n: 1, estado: 'Cerrado', actuaciones: '1,5,9', hecho: 'caldera' },
        { n: 7, estado: 'Abierto', actuaciones: '2', hecho: 'tras RT: Para el cálculo del SCOP se considera únicamente una de las bombas' },
        { n: 8, estado: 'Abierto', actuaciones: '8', hecho: 'tras RT: ficha técnica EBVX16S18DJ6V/ERLA16DAV3' },
    ] };
    await caso('el encargo lista SOLO las abiertas, apunta a la ronda y prohíbe enviar', () => {
        const t = IC.instruccionContestacion(INF);
        assert.ok(t.includes('- nº 7 (actuación 2)') && t.includes('- nº 8 (actuación 8)') && !t.includes('- nº 1 '));
        assert.ok(t.includes('«3. REQUERIMIENTO»') && t.includes('--ronda 2'));
        assert.ok(/sin enviar nada a nadie/.test(t) && /lo firma Fran/.test(t));
    });
    await caso('el aviso a Fran dice qué ha llegado y si Claude se ha puesto', () => {
        const a = IC.textoAviso({ ...INF, encargo: { ok: true } });
        assert.ok(/Inexactitudes v3 — LOTE-2026-015 · 2 abierta/.test(a.titulo), a.titulo);
        assert.ok(/2 abierta\(s\) \(nº 7, 8\)/.test(a.texto) && /Claude se ha puesto/.test(a.texto));
        assert.ok(/no se ha puesto con la contestación \(apagado/.test(IC.textoAviso({ ...INF, encargo: { ok: false, motivo: 'apagado' } }).texto));
    });
    await caso('sin abiertas o apagado → no se encarga', async () => {
        const antes = process.env.INEXACTITUDES_AGENTE_ENABLED;
        delete process.env.INEXACTITUDES_AGENTE_ENABLED;
        assert.strictEqual((await IC.encargarContestacion(INF)).ok, false);
        process.env.INEXACTITUDES_AGENTE_ENABLED = 'true';
        assert.ok(/ninguna abierta/.test((await IC.encargarContestacion({ ...INF, items: [INF.items[0]] })).motivo));
        if (antes === undefined) delete process.env.INEXACTITUDES_AGENTE_ENABLED; else process.env.INEXACTITUDES_AGENTE_ENABLED = antes;
        assert.strictEqual(IC.activo(), String(process.env.INEXACTITUDES_CORREO_ENABLED || '') === 'true');
    });

    console.log('\nEl informe de verificación, el dictamen y la factura del correo (services/verificacionCorreo.js, regla 225)');
    const VC = require('../services/verificacionCorreo');
    await caso('los asuntos de Marwen: cierre y factura (también la antigua sin lote)', () => {
        assert.deepStrictEqual(VC.leerAsunto('Informe de verificación y Dictamen CAE-2059 (LOTE-2026-018)'), { tipo: 'cierre', cae: 'CAE-2059', lote: 'LOTE-2026-018' });
        assert.deepStrictEqual(VC.leerAsunto('Factura Expediente CAE-2059 (LOTE-2026-018)'), { tipo: 'factura', cae: 'CAE-2059', lote: 'LOTE-2026-018' });
        assert.deepStrictEqual(VC.leerAsunto('Factura expediente CAE-1834'), { tipo: 'factura', cae: 'CAE-1834', lote: null });
        for (const s of ['Modificación Plan de verificación_v1 CAE-2059 (LOTE-2026-018)', 'Inexactitudes_v5 del expediente CAE-2059 (LOTE-2026-018)', 'RE: Factura Expediente CAE-2059 (LOTE-2026-018)', 'Cambio de estado del expediente CAE-2059 (LOTE-2026-018)']) {
            assert.strictEqual(VC.leerAsunto(s), null, s);
        }
    });
    await caso('cada PDF a su slot', () => {
        assert.strictEqual(VC.slotDePdf('06. Informe de Verificacion_CAE-2059_2F.pdf', 'cierre'), 'informe_verificacion');
        assert.strictEqual(VC.slotDePdf('08. Dictamen Favorable_CAE-2059_2F.pdf', 'cierre'), 'dictamen_favorable');
        assert.strictEqual(VC.slotDePdf('FV20261486 INTERNACIONAL DE ALCOHOLES, S.A.pdf', 'factura'), 'factura_verificador');
        assert.strictEqual(VC.slotDePdf('otro.pdf', 'cierre'), null);
    });
    await caso('un slot que ya tiene documento no se toca (lo reemplazaría); otro CAE, tampoco', () => {
        const L = { codigo: 'LOTE-2026-018', expediente_verificador: 'CAE-2059', documentos_so: [{ key: 'informe_verificacion', original_file_name: 'x.pdf' }] };
        assert.strictEqual(VC.decidirDocumento({ lote: L, slot: 'informe_verificacion', cae: 'CAE-2059' }).subir, false);
        assert.deepStrictEqual(VC.decidirDocumento({ lote: L, slot: 'dictamen_favorable', cae: 'CAE-2059' }), { subir: true, motivo: null });
        assert.ok(/no del CAE-1/.test(VC.decidirDocumento({ lote: L, slot: 'dictamen_favorable', cae: 'CAE-1' }).motivo));
        assert.strictEqual(VC.decidirDocumento({ lote: null, slot: 'dictamen_favorable' }).subir, false);
    });
    await caso('el aviso dice lo leído, lo guardado solo y los MENORES que lo declarado (regla 226)', async () => {
        const a = VC.textoAviso({ lote: 'LOTE-2026-018', cae: 'CAE-2059', subidos: [
            { slot: 'informe_verificacion', ahorros: { leido: true, filas: [{ numero_expediente: '26RES060_104', expediente_id: 'e1', ahorro_kwh: 36587, inversion_eur: 5785.12, avisos: [] }], total: { suma: 36587, total: 36587, cuadra: true }, avisos: [], faltan: [],
                aplicados_solos: [{ expediente_id: 'e1', numero_expediente: '26RES060_104', ahorro_kwh: 36587 }], por_revisar: [], ya_estaban: [],
                menores: [{ numero_expediente: '26RES060_104', kwh_verificado: 36587, kwh_declarado: 40000, bono_verificado: 3658.7, bono_declarado: 4000, diferencia: 341.3 }] } },
            { slot: 'dictamen_favorable', dictamen: { numero_dictamen: 'MW-2059/26', decision: 'DICTAMEN FAVORABLE', fecha_emision: '18-11-2026', total_kwh: 36587 } },
        ] });
        assert.ok(/DICTAMEN FAVORABLE/.test(a.titulo));
        assert.ok(/cuadra con el total del informe; 1 de 1 casadas/.test(a.texto) && /- 26RES060_104: 36\.587 kWh/.test(a.texto));
        assert.ok(/Guardados solos en su expediente: 1 \(26RES060_104\)/.test(a.texto), a.texto);
        assert.ok(/Verificado MENOR que lo declarado en 1/.test(a.texto) && /−341,30 €/.test(a.texto) && /fase 7/.test(a.texto), a.texto);
        assert.ok(!/No se escriben solos/.test(a.texto));
        // El menor es un problema: va en el título y LO PRIMERO del texto (el WhatsApp no lleva título).
        assert.ok(/^⚠ REVISAR · Verificación cerrada/.test(a.titulo), a.titulo);
        assert.ok(/^⚠ HAY QUE REVISAR — LOTE-2026-018:\n- Verificado MENOR que lo declarado en 26RES060_104/.test(a.texto), a.texto);
        // Que NO cuadra: se dice arriba que no se ha guardado ninguno.
        const nc = VC.textoAviso({ lote: 'L', subidos: [{ slot: 'informe_verificacion', ahorros: { leido: true,
            filas: [{ numero_expediente: 'X_1', expediente_id: 'e1', ahorro_kwh: 100, avisos: [] }],
            total: { suma: 100, total: 160, cuadra: false }, avisos: [], faltan: [], aplicados_solos: [], por_revisar: [{ numero_expediente: 'X_1' }], menores: [],
            motivo_revisar: 'La suma de las actuaciones no cuadra con el total del informe.' } }] });
        assert.ok(/^⚠ REVISAR/.test(nc.titulo) && /^⚠ HAY QUE REVISAR — L:\n- La suma de las actuaciones \(100 kWh\) NO cuadra con el total del informe \(160 kWh\): NO se ha guardado ningún ahorro\./.test(nc.texto), nc.texto);
        // Sin leer: también arriba.
        const sl = VC.textoAviso({ lote: 'L', subidos: [{ slot: 'informe_verificacion', ahorros: { leido: false, error: 'x' } }] });
        assert.ok(/^⚠ HAY QUE REVISAR — L:\n- No se han podido leer los ahorros del informe: NO se ha guardado ninguno\./.test(sl.texto), sl.texto);
        // Todo bien: sin ⚠.
        const bien = VC.textoAviso({ lote: 'L', subidos: [{ slot: 'informe_verificacion', ahorros: { leido: true,
            filas: [{ numero_expediente: 'X_1', expediente_id: 'e1', ahorro_kwh: 100, avisos: [] }], total: { suma: 100, total: 100, cuadra: true }, avisos: [], faltan: [],
            aplicados_solos: [{ numero_expediente: 'X_1' }], por_revisar: [], menores: [] } }] });
        assert.ok(!/⚠/.test(bien.titulo) && !/HAY QUE REVISAR/.test(bien.texto), bien.texto);
        // Subido A MANO: la cabecera dice quién; sin fallos no se manda nada (no llega a enviar).
        const mano = VC.textoAviso({ lote: 'L', subido_por: 'MARÍA', subidos: [{ slot: 'informe_verificacion', ahorros: { leido: false, error: 'x' } }] });
        assert.ok(/^⚠ HAY QUE REVISAR — L \(subido a mano por MARÍA\):/.test(mano.texto), mano.texto);
        const enviados = await VC.avisarSubidaAMano({ lote: 'L', subido_por: 'MARÍA', subidos: [{ slot: 'factura_verificador', importe: 2000, ocr: null }], errores: [] });
        assert.deepStrictEqual(enviados, []);
        assert.strictEqual(VC.USUARIO, 'CORREO VERIFICADOR');
        const f = VC.textoAviso({ lote: 'L', subidos: [{ slot: 'factura_verificador', importe: 2000, ocr: { numero_factura: 'FV1', avisos: [] } }] });
        assert.ok(/Factura del verificador FV1 subida al L: base 2000,00 €/.test(f.texto), f.texto);
    });
    await caso('nace APAGADO (VERIFICACION_CORREO_ENABLED)', () => {
        const antes = process.env.VERIFICACION_CORREO_ENABLED;
        delete process.env.VERIFICACION_CORREO_ENABLED; assert.strictEqual(VC.activo(), false);
        if (antes !== undefined) process.env.VERIFICACION_CORREO_ENABLED = antes;
    });

    console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
})();
