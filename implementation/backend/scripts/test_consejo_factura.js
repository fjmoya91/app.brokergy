// Pruebas del CONSEJO DE FACTURA al instalador (utils/consejoFactura.js): el texto
// de sustitución y de hibridación, los huecos entre corchetes, RES080 sin consejo y
// la regla de cuándo se manda (falta la factura · GRAVE que tumba · LEVE no). Sin red.
//   node scripts/test_consejo_factura.js
const assert = require('assert');
const cf = require('../utils/consejoFactura');

let ok = 0;
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

const CLIENTE = { nombre_razon_social: 'ARSENIO EVARISTO', apellidos: 'GÓMEZ DÍAZ', dni: '05638207X' };
const expSustitucion = (extra = {}) => ({
    numero_expediente: '26RES060_194',
    instalacion: {
        hibridacion: false, cambio_acs: false, tipo_emisor: 'radiadores_convencionales',
        aerotermia_cal: { marca: 'HAIER', modelo: 'MONO GT 16kW', numero_serie: 'AE1F58', potencia: 16 },
        caldera_antigua_cal: { marca: 'RIMA', modelo: 'SF-05', numero_serie: '98450' },
        ...extra,
    },
    documentacion: { fecha_registro_cee_inicial: '2026-10-11' },
});
const expHibridacion = () => ({
    numero_expediente: '26RES093_15',
    instalacion: {
        hibridacion: true, cambio_acs: false, tipo_emisor: 'radiadores_convencionales',
        aerotermia_cal: { marca: 'SH', modelo: 'MASTER 14', numero_serie: 'GF003SM00004TS6FWB6U', potencia: 14 },
        caldera_antigua_cal: { marca: 'DOMUSA', modelo: 'D-4', numero_serie: '125748' },
    },
    documentacion: { fecha_registro_cee_inicial: '2026-10-19' },
});
const base = { cliente: CLIENTE, instalador: 'FEDERICO ROMERO INSTALACIONES, SL', direccionObra: 'CL PINTOR YAÑEZ 55, 13328 ALMEDINA (CIUDAD REAL)' };

prueba('SUSTITUCIÓN: las tres líneas aprobadas, con equipo, caldera y emisor', () => {
    const c = cf.construirConsejoFactura({ exp: expSustitucion(), ...base });
    assert.strictEqual(c.hibridacion, false);
    assert.strictEqual(c.lineas.length, 3);
    assert.strictEqual(c.lineas[0], 'Suministro e instalación de bomba de calor aire-agua (aerotermia) marca HAIER, modelo MONO GT 16kW, nº de serie AE1F58, de 16 kW, para calefacción, en sustitución de la caldera existente RIMA SF-05 (nº de serie 98450), conectada a los radiadores existentes de la vivienda.');
    assert.strictEqual(c.lineas[1], 'Desmontaje y retirada de la caldera existente.');
    assert.strictEqual(c.lineas[2], 'Material auxiliar, conexionado hidráulico y eléctrico, puesta en marcha y pruebas.');
    assert.strictEqual(c.aviso, null);
    assert.strictEqual(c.titular, 'ARSENIO EVARISTO GÓMEZ DÍAZ');
    assert.strictEqual(c.nif, '05638207X');
    assert.match(c.reglas[0], /La emite \*FEDERICO ROMERO INSTALACIONES, SL\*, la misma empresa que firma el certificado de la instalación, con fecha posterior al 11\/10\/2026\./);
    assert.strictEqual(c.reglas.length, 5);
    assert.strictEqual(c.conHuecos, false);
    assert.strictEqual(c.pie, 'Cada línea con su importe; base imponible e IVA desglosados.');
});

prueba('Dirección de la obra: no repite CP, municipio ni provincia que ya trae la calle', () => {
    assert.strictEqual(cf.componerDireccion('CL PINTOR YAÑEZ 55 13328 ALMEDINA (CIUDAD REAL)', '13328', 'ALMEDINA', 'CIUDAD REAL'),
        'CL PINTOR YAÑEZ 55 13328 ALMEDINA (CIUDAD REAL)');
    assert.strictEqual(cf.componerDireccion('CL EMILIO CASTELAR 13240 LA SOLANA (CIUDAD REAL)', null, 'LA SOLANA', 'Ciudad Real'),
        'CL EMILIO CASTELAR 13240 LA SOLANA (CIUDAD REAL)');
    assert.strictEqual(cf.componerDireccion('CL MAYOR 1', '13000', 'Ciudad Real', 'Ciudad Real'), 'CL MAYOR 1, 13000 Ciudad Real');
    assert.strictEqual(cf.componerDireccion('CL MAYOR 1', '13000', 'Almagro', 'Ciudad Real'), 'CL MAYOR 1, 13000 Almagro (CIUDAD REAL)');
    assert.strictEqual(cf.componerDireccion('', null, null, null), null);
});

prueba('SUSTITUCIÓN con ACS y suelo radiante: «para calefacción y ACS» y el emisor que es', () => {
    const c = cf.construirConsejoFactura({ exp: expSustitucion({ cambio_acs: 'SI', tipo_emisor: 'suelo_radiante' }), ...base });
    assert.match(c.lineas[0], /para calefacción y ACS, en sustitución/);
    assert.match(c.lineas[0], /conectada al suelo radiante existente de la vivienda\.$/);
});

prueba('HIBRIDACIÓN: la caldera se queda, regulación y control, y el aviso', () => {
    const c = cf.construirConsejoFactura({ exp: expHibridacion(), ...base });
    assert.strictEqual(c.hibridacion, true);
    assert.strictEqual(c.lineas[0], 'Suministro e instalación de bomba de calor aire-agua (aerotermia) marca SH, modelo MASTER 14, nº de serie GF003SM00004TS6FWB6U, de 14 kW, para calefacción, en HIBRIDACIÓN con la caldera existente DOMUSA D-4 (nº de serie 125748), que se mantiene como apoyo, conectada a los radiadores existentes de la vivienda.');
    assert.strictEqual(c.lineas[1], 'Regulación y control para el funcionamiento conjunto de la bomba de calor y la caldera.');
    assert.strictEqual(c.lineas[2], 'Material auxiliar, conexionado hidráulico y eléctrico a la instalación existente, puesta en marcha y pruebas.');
    assert.ok(!c.lineas.some(l => /sustitución|desmontaje/i.test(l)), 'nada de sustitución ni desmontaje');
    assert.match(c.aviso, /no pongas «sustitución» ni «desmontaje de la caldera»/);
    assert.match(c.reglas[0], /posterior al 19\/10\/2026/);
});

prueba('lo que no se sabe va ENTRE CORCHETES; sin fecha de registro no hay cláusula de fecha', () => {
    const exp = expSustitucion({ aerotermia_cal: {}, potencia_bomba: null, caldera_antigua_cal: { marca: 'RIMA', modelo: 'SF-05' } });
    exp.documentacion = {};
    const c = cf.construirConsejoFactura({ exp, cliente: null, instalador: null, direccionObra: null });
    assert.match(c.lineas[0], /marca \[MARCA\], modelo \[MODELO\], nº de serie \[Nº DE SERIE\], de \[XX\] kW/);
    assert.match(c.lineas[0], /caldera existente RIMA SF-05, conectada/, 'sin serie de la caldera vieja, sin paréntesis');
    assert.strictEqual(c.conHuecos, true);
    assert.strictEqual(c.titular, '[TITULAR DEL EXPEDIENTE]');
    assert.strictEqual(c.instalador, '[EMPRESA INSTALADORA]');
    assert.ok(!/posterior al/.test(c.reglas[0]), 'sin fecha, sin cláusula');
    assert.match(c.reglas[0], /firma el certificado de la instalación\.$/);
    const [m1] = cf.textosWhatsapp(c, { motivo: 'FALTA' });
    assert.match(m1, /entre corchetes, complétalo/);
});

prueba('la potencia sale de potencia_bomba si el equipo no la trae', () => {
    const c = cf.construirConsejoFactura({ exp: expSustitucion({ aerotermia_cal: { marca: 'A', modelo: 'B', numero_serie: 'S' }, potencia_bomba: 8.5 }), ...base });
    assert.match(c.lineas[0], /de 8,5 kW/);
});

prueba('RES080 → null (fuera de alcance)', () => {
    const exp = { ...expSustitucion(), numero_expediente: '26RES080_90' };
    assert.strictEqual(cf.construirConsejoFactura({ exp, ...base }), null);
    const op = { datos_calculo: { inputs: { isReforma: true } } };
    assert.strictEqual(cf.construirConsejoFactura({ exp: { ...expSustitucion(), numero_expediente: null }, op, ...base }), null);
});

prueba('REGLA: falta la factura → sí', () => {
    assert.deepStrictEqual(cf.decidirConsejoFactura({ faltaFactura: true }), { mandar: true, motivo: 'FALTA', graves: [] });
});

prueba('REGLA: factura con LEVE (o GRAVE subsanada, o GRAVE que no tumba) → no', () => {
    const incidencias = [
        { severidad: 'LEVE', estado: 'ABIERTA', slot: 'facturas', tipo: 'SIN_EQUIPO' },
        { severidad: 'GRAVE', estado: 'SUBSANADA', slot: 'facturas', tipo: 'TITULAR' },
        { severidad: 'GRAVE', estado: 'ABIERTA', slot: 'facturas', tipo: 'SOBREFINANCIACION' },
        { severidad: 'GRAVE', estado: 'ABIERTA', slot: 'facturas', tipo: 'INEXACTITUD' },
        { severidad: 'GRAVE', estado: 'ABIERTA', slot: 'anexo_fotografico', tipo: 'FECHA' },
        { severidad: 'GRAVE', estado: 'ABIERTA' }, // sin tipo (las del Anexo Fotográfico)
    ];
    assert.deepStrictEqual(cf.decidirConsejoFactura({ faltaFactura: false, incidencias }), { mandar: false, motivo: null, graves: [] });
});

prueba('REGLA: factura con GRAVE que tumba → sí, con qué corregir', () => {
    const incidencias = [
        { severidad: 'GRAVE', estado: 'ABIERTA', slot: 'facturas', tipo: 'UNIDADES_TERMINALES', ref: 'drv1', ref_label: 'Factura F260545' },
        { severidad: 'GRAVE', estado: 'ABIERTA', slot: 'facturas', tipo: 'UNIDADES_TERMINALES', ref: 'drv1', ref_label: 'Factura F260545' },
        { severidad: 'grave', estado: 'abierta', slot: 'facturas', tipo: 'emisor', ref: 'drv1', ref_label: 'Factura F260545' },
    ];
    const d = cf.decidirConsejoFactura({ faltaFactura: false, incidencias });
    assert.strictEqual(d.mandar, true);
    assert.strictEqual(d.motivo, 'GRAVE');
    assert.deepStrictEqual(d.graves.map(g => g.codigo), ['UNIDADES_TERMINALES', 'EMISOR'], 'sin repetir la misma');
    const c = cf.construirConsejoFactura({ exp: expSustitucion(), ...base });
    const grupos = cf.correccionesPorFactura(d, c);
    assert.strictEqual(grupos.length, 1);
    assert.strictEqual(grupos[0].factura, 'Factura F260545');
    assert.match(grupos[0].puntos[1], /La tiene que emitir \*FEDERICO ROMERO INSTALACIONES, SL\*/);
    const [m1] = cf.textosWhatsapp(c, d, { url: 'https://x/consejo-factura/1?token=t' });
    assert.match(m1, /^Sobre la factura F260545 que nos mandaste: tal como está no pasaría la auditoría del CAE\. Hay que corregir:/);
    assert.match(m1, /Para rehacerla/);
    const html = cf.htmlEmailConsejo(c, d, { url: 'https://x' });
    assert.match(html, /La factura F260545 que nos mandaste no pasaría la auditoría del CAE/);
});

prueba('WHATSAPP: dos mensajes, el segundo SOLO el concepto; sin emojis', () => {
    const c = cf.construirConsejoFactura({ exp: expHibridacion(), ...base });
    const msgs = cf.textosWhatsapp(c, { motivo: 'FALTA' }, { url: 'https://app.brokergy.es/consejo-factura/E?token=T' });
    assert.strictEqual(msgs.length, 2);
    assert.strictEqual(msgs[1], c.lineas.join('\n'));
    assert.match(msgs[0], /\*A nombre de:\* ARSENIO EVARISTO GÓMEZ DÍAZ/);
    assert.match(msgs[0], /\*Para que no la rechacen:\*/);
    assert.match(msgs[0], /\*Importante:\* no pongas/);
    assert.match(msgs[0], /botón para copiarlo:\nhttps:\/\/app\.brokergy\.es\/consejo-factura\/E\?token=T/);
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    assert.ok(!emoji.test(msgs[0]) && !emoji.test(msgs[1]), 'sin emojis');
    assert.ok(!/BROKERGY|Soy |Hola/.test(msgs[0]), 'sin presentarse ni saludar');
});

prueba('EMAIL: recuadro «Texto recomendado para la factura», botón de copiar y la frase en el texto', () => {
    const c = cf.construirConsejoFactura({ exp: expSustitucion(), ...base });
    const html = cf.htmlEmailConsejo(c, { motivo: 'FALTA' }, { url: 'https://app.brokergy.es/consejo-factura/E?token=T' });
    assert.match(html, /Texto recomendado para la factura/);
    assert.match(html, /Concepto para copiar/);
    assert.match(html, /href="https:\/\/app\.brokergy\.es\/consejo-factura\/E\?token=T"[^>]*>Copiar el concepto</);
    assert.match(html, /<strong>FEDERICO ROMERO INSTALACIONES, SL<\/strong>/);
    const txt = cf.anunciarEnTexto('Hola Federico,\n\nObra de X\nExpediente Y\n\nNecesitamos lo siguiente:\n\nGracias.');
    assert.strictEqual(txt.split('\n\n')[2], cf.FRASE_EMAIL, 'tras el primer párrafo de contenido');
    assert.strictEqual(cf.anunciarEnTexto(txt), txt, 'no se repite');
});

prueba('facturas aportadas: registradas + subidas por el enlace, sin contar dos veces', () => {
    assert.strictEqual(cf.facturasAportadas({}, {}), 0);
    assert.strictEqual(cf.facturasAportadas({ facturas: [{ drive_id: 'a' }] }, { DOC_FACTURAS: [{ driveId: 'a' }, { driveId: 'b' }] }), 2);
});

prueba('INTERACUMULADOR calentado por la bomba: dentro de la actuación, «calefacción y ACS» y su línea (26RES060_283)', () => {
    const c = cf.construirConsejoFactura({ exp: expSustitucion({
        cambio_acs: true, misma_aerotermia_acs: false,
        aerotermia_acs: { tipo_equipo_nuevo: 'acumulador', marca: 'ARISTON', modelo: 'PRO1 R 100', numero_serie: 'S1', litros: 100 },
    }), ...base });
    assert.match(c.lineas[0], /para calefacción y ACS/);
    assert.strictEqual(c.lineas[1], 'Suministro e instalación de interacumulador de ACS de 100 litros marca ARISTON, modelo PRO1 R 100, nº de serie S1, calentado por la bomba de calor.');
    assert.deepStrictEqual(c.aparte, []);
});

prueba('TERMO eléctrico nuevo con el ACS fuera: no entra en el concepto, va APARTE con su importe', () => {
    const c = cf.construirConsejoFactura({ exp: expSustitucion({
        cambio_acs: false,
        aerotermia_acs: { tipo_equipo_nuevo: 'termo_electrico', marca: 'ARISTON', modelo: 'PRO1', numero_serie: 'S2', litros: 80 },
    }), ...base });
    assert.strictEqual(c.lineas.length, 3);
    assert.match(c.lineas[0], /para calefacción, en sustitución/);
    assert.deepStrictEqual(c.aparte, ['Suministro e instalación de termo eléctrico para ACS marca ARISTON, modelo PRO1, nº de serie S2, de 80 litros.']);
    assert.ok(!cf.textoConcepto(c).includes('termo'));
});

prueba('enlace: con el token de subida, y sin token no hay enlace', () => {
    assert.match(cf.enlaceConsejo('E', 'T'), /\/consejo-factura\/E\?token=T$/);
    assert.strictEqual(cf.enlaceConsejo('E', null), null);
});

(async () => {
    for (const [nombre, fn] of pruebas) {
        try { await fn(); ok++; console.log(`  ✓ ${nombre}`); }
        catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
    }
    console.log(`\n${ok}/${pruebas.length} pruebas OK`);
})();
