#!/usr/bin/env node
/**
 * La VÍA DEL FACTOR MULTIPLICADOR en el EXPEDIENTE (BOE-A-2026-23367): numeración de
 * serie propia, ficha oficial, documentos de la ficha por caso, vivienda habitual,
 * plazos de factura y el consentimiento del IRPF. Funciones puras: no toca la BD.
 *
 *   node implementation/backend/scripts/test_via_fm.mjs
 *
 * Casa además las dos copias (backend/utils/viaFm.js y su espejo del frontend) y el
 * mapa zona → ficha de la hibridación con el del motor (CB_PARALELO de res060fc.js).
 * Detalle: docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md
 */
import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const back = require('../utils/viaFm.js');
const fichas = require('../utils/fichas.js');
const { fichaDelDictamenCasa } = require('../services/loteVerificados.js');
const front = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/viaFm.js')).href);

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const claves = (docs) => docs.map((d) => d.key);

console.log('\n— Numeración: serie propia —');
ok(fichas.esNumeroFm('26RES060FM_12') && fichas.esNumeroFm('26RES093FM_3'), 'esNumeroFm reconoce RES060FM y RES093FM');
ok(!fichas.esNumeroFm('26RES060_12') && !fichas.esNumeroFm('26RES080_1') && !fichas.esNumeroFm('26TER100FM_1'), 'ni la vigente ni el terciario');
ok(fichas.esNumeroFm('26RES080FM_1') && fichas.fichaFromNumero('26RES080FM_1') === 'RES080', 'RES080_FM (09/11/2026): 26RES080FM_N, y su ficha sigue siendo RES080');
ok(fichas.fichaFromNumero('26RES060FM_12') === 'RES060' && fichas.fichaFromNumero('26RES093FM_3') === 'RES093', 'la ficha de un FM sigue siendo RES060 / RES093');
ok(fichas.serieNumeracion('RES060', true) === 'RES060FM' && fichas.serieNumeracion('RES060', false) === 'RES060', 'serieNumeracion RES060 → RES060FM solo con la vía');
ok(fichas.serieNumeracion('RES080', true) === 'RES080FM' && fichas.serieNumeracion('RES080', false) === 'RES080', 'RES080 → RES080FM solo con la vía');
ok(fichas.serieNumeracion('TER100', true) === 'TER100', 'el terciario no tiene serie FM');
{
    // RES080_FM: sus 11 documentos (los dos CEE simulados y el certificado del director, al gestor).
    const ctx080 = back.contextoFm({ numero: '26RES080FM_4', inputs: { tipo: 'unifamiliar' }, datos: { ef_sim_bc: '5800' } });
    const ks = claves(back.documentosFm(ctx080));
    ok(ctx080.rehabilitacion && ctx080.fichaOficial.codigo === 'RES080_FM' && ctx080.datos.ef_sim_bc === 5800 && ctx080.datos.ef_sim_rest === null, 'RES080_FM: ficha oficial y kWh simulados saneados');
    ok(['FM_CERT_DIRECTOR_OBRA', 'FM_CEE_PREVIO', 'FM_CEE_POSTERIOR', 'FM_CEE_SIM_REST', 'FM_CEE_SIM_BC', 'FM_VIVIENDA_HABITUAL', 'FM_ANEXO_A'].every((k) => ks.includes(k))
        && !ks.includes('FM_DECL_INSTALADOR') && !ks.includes('FM_OFERTA_MANTENIMIENTO'), 'RES080_FM: pide los cuatro CEE y el certificado del director; no lo de la RES060_FM');
    ok(back.slotsFm(ctx080).filter((x) => x.key.startsWith('FM_CEE_SIM') || x.key === 'FM_CERT_DIRECTOR_OBRA').every((x) => x.required === false && back.SLOTS_FM.includes(x.key)), 'los simulados y el certificado del director no se le reclaman al cliente, y están en SLOTS_FM');
}
ok(fichas.correlativoEnSerie('26RES060_12', '26RES060') === 12, 'correlativoEnSerie: 26RES060_12 → 12');
ok(fichas.correlativoEnSerie('26RES060FM_12', '26RES060') === null, 'un FM NO cuenta en la serie vigente (el LIKE con «_» lo casaba)');
ok(fichas.correlativoEnSerie('26RES060FM_7', '26RES060FM') === 7, 'y sí en la suya');
ok(fichas.oportunidadViaFm({ datos_calculo: { inputs: { ruta_fm: true } } }) === true, 'la oportunidad marca la vía con inputs.ruta_fm');
ok(fichas.oportunidadViaFm({ datos_calculo: { inputs: { via_fm: true } } }) === false,
    'y NO con inputs.via_fm (el capado de márgenes borra toda clave via_fm a quien no es ADMIN)');

console.log('\n— Las dos copias de viaFm.js dicen lo mismo —');
for (const n of ['26RES060FM_1', '26RES093FM_2', '26RES060_3', '26res060fm_4', ' 26RES093FM_5 ', '26RES080FM_6', '']) {
    ok(back.contextoFm({ numero: n }).activa === front.esNumeroFm(n), `esNumeroFm(${JSON.stringify(n)})`);
}
let iguales = true;
for (const hibridacion of [false, true]) for (const zona of [null, 'A3', 'B4', 'c2', 'D3', 'E1', 'X']) for (const vulnerable of [false, true]) {
    if (!igual(back.fichaOficialFm({ hibridacion, zona, vulnerable }), front.fichaOficialFm({ hibridacion, zona, vulnerable }))) {
        iguales = false;
        console.log('    distinta:', { hibridacion, zona, vulnerable });
    }
}
ok(iguales, 'fichaOficialFm: 28 combinaciones idénticas');

console.log('\n— Ficha oficial —');
ok(back.fichaOficialFm({}).codigo === 'RES060_FM' && back.fichaOficialFm({}).version === 'V1.0', 'sustitución → RES060_FM V1.0');
ok(back.fichaOficialFm({ vulnerable: true }).codigo === 'RES060_FM-S', 'vulnerable → RES060_FM-S');
ok(/vulnerables$/.test(back.fichaOficialFm({ vulnerable: true }).titulo), 'con su título de vulnerables');
const porZona = { A3: 'RES090_FM', B3: 'RES091_FM', C1: 'RES092_FM', D3: 'RES093_FM', E1: 'RES094_FM' };
for (const [z, c] of Object.entries(porZona)) ok(back.fichaOficialFm({ hibridacion: true, zona: z }).codigo === c, `hibridación en ${z} → ${c}`);
const sinZ = back.fichaOficialFm({ hibridacion: true });
ok(sinZ.codigo === 'RES093_FM' && sinZ.sinZona === true, 'hibridación sin zona → RES093_FM, avisando (sinZona)');
ok(back.fichaOficialFm({ hibridacion: true, zona: 'D2', vulnerable: true }).codigo === 'RES093_FM-S', 'hibridación vulnerable → RES093_FM-S');
ok(back.fichaOficialFm({ hibridacion: true, zona: 'D2' }).titulo.includes('factor de multiplicador'), 'el título de la hibridación es el literal del BOE (errata incluida)');

// El mapa zona → ficha, igual que el del motor (CB_PARALELO no se exporta: se lee del fuente).
const motor = fs.readFileSync(path.join(__dirname, '../../frontend/src/features/calculator/logic/res060fc.js'), 'utf8');
const bloque = motor.slice(motor.indexOf('const CB_PARALELO'), motor.indexOf('const letraZona'));
const mapaMotor = Object.fromEntries([...bloque.matchAll(/\n\s{4}([A-E]):\s*\{\s*\n\s*ficha:\s*'(RES09\d_FM)'/g)].map((m) => [m[1], m[2]]));
ok(Object.keys(mapaMotor).length === 5 && Object.entries(back.FICHA_HIBRIDACION_FM).every(([l, t]) => mapaMotor[l] === t.ficha),
    `zona → ficha de la hibridación casa con el motor (${JSON.stringify(mapaMotor)})`);

console.log('\n— El dictamen del verificador casa con el número FM —');
ok(fichaDelDictamenCasa('RES060_FM', '26RES060FM_12'), 'RES060_FM ↔ 26RES060FM_12');
ok(fichaDelDictamenCasa('RES060_FM-S', '26RES060FM_12'), 'RES060_FM-S ↔ 26RES060FM_12');
ok(fichaDelDictamenCasa('RES091_FM', '26RES093FM_4') && fichaDelDictamenCasa('RES094_FM-S', '26RES093FM_4'), 'RES091_FM / RES094_FM-S ↔ 26RES093FM_4');
ok(!fichaDelDictamenCasa('RES060_FM', '26RES060_12'), 'RES060_FM ↔ 26RES060_12 NO casa (avisa)');
ok(fichaDelDictamenCasa('RES060', '26RES060_12'), 'la vigente sigue casando');

console.log('\n— Saneado de lo que manda el panel —');
const s = back.sanearDatosFm({ tipologia: 'chalet', vulnerable: 'true', caldera_retirada: false, bt_aplica: 'si', vivienda_habitual: 'curva', otro: 1,
    facturas_luz: [{ desde: '2025-11-01', hasta: '2025-12-31', kwh: '210', cups: 'es 0021 0000 1234 5678 ab' }, { desde: 'mal' }, {}] });
ok(s.tipologia === null && s.vulnerable === false && s.caldera_retirada === false && s.bt_aplica === null, 'enums y booleanos estrictos (lo dudoso queda null/false)');
ok(!('otro' in s) && s.vivienda_habitual === 'curva', 'solo pasan las claves conocidas');
ok(s.facturas_luz.length === 1 && s.facturas_luz[0].kwh === 210 && s.facturas_luz[0].cups === 'ES00210000123456 78AB'.replace(/\s/g, '').slice(0, 22), 'facturas: kWh a número, CUPS sin espacios y en mayúsculas, vacías fuera');

console.log('\n— Vivienda habitual (punto 4) —');
ok(igual(back.inviernoPrevio('2026-11-20'), { desde: '2025-11-01', hasta: '2026-03-31' }), 'obra en nov-2026 → invierno 2025-26');
ok(igual(back.inviernoPrevio('2027-03-10'), { desde: '2025-11-01', hasta: '2026-03-31' }), 'obra en mar-2027 → el invierno ya empezado no es «previo»: 2025-26');
ok(igual(back.inviernoPrevio('2027-05-02'), { desde: '2026-11-01', hasta: '2027-03-31' }), 'obra en may-2027 → invierno 2026-27');
ok(igual(back.inviernoPrevio(null, '2026-11-07'), { desde: '2025-11-01', hasta: '2026-03-31' }), 'sin inicio, el invierno anterior a hoy');
const F = (desde, hasta, kwh, extra = {}) => ({ desde, hasta, kwh, cups: 'ES0021000012345678AB', misma_direccion: true, ...extra });
const bimestral = [F('2025-10-20', '2025-12-19', 420), F('2025-12-20', '2026-02-18', 470), F('2026-02-19', '2026-04-18', 390)];
const v1 = back.validarViviendaHabitual(bimestral, '2026-11-20');
ok(v1.ok && v1.cubierto && v1.mediaMensual > 75 && v1.cups === 'ES0021000012345678AB' && v1.avisos.length === 0, `bimestrales que cubren el invierno → OK (media ${v1.mediaMensual} kWh/mes)`);
const v2 = back.validarViviendaHabitual([bimestral[0], bimestral[2]], '2026-11-20');
ok(!v2.ok && !v2.cubierto && v2.huecos.length === 1 && v2.huecos[0].desde === '2025-12-20' && v2.huecos[0].hasta === '2026-02-18', 'falta la del medio → hueco 20/12–18/02, no OK');
const v3 = back.validarViviendaHabitual(bimestral.map((f) => ({ ...f, kwh: 100 })), '2026-11-20');
ok(!v3.ok && v3.mediaMensual <= 75 && v3.avisos.some((a) => a.includes('MÁS de 75')), `media baja (${v3.mediaMensual}) → no OK, y lo dice`);
const v4 = back.validarViviendaHabitual([bimestral[0], { ...bimestral[1], cups: 'ES0031999999999999ZZ' }, bimestral[2]], '2026-11-20');
ok(!v4.ok && v4.avisos.some((a) => a.includes('CUPS distintos')), 'dos CUPS → no OK');
const v5 = back.validarViviendaHabitual([bimestral[0], { ...bimestral[1], misma_direccion: false }, bimestral[2]], '2026-11-20');
ok(!v5.ok && v5.avisos.some((a) => a.includes('dirección catastral')), 'una factura con otra dirección → no OK');
const v6 = back.validarViviendaHabitual([bimestral[0], { ...bimestral[1], kwh: null }, bimestral[2]], '2026-11-20');
ok(!v6.ok && v6.mediaMensual === null && v6.avisos.some((a) => a.includes('Falta el consumo')), 'sin kWh en una → no se calcula la media, y se dice');
const v0 = back.validarViviendaHabitual([], '2026-11-20');
ok(!v0.ok && v0.avisos.length === 1 && v0.avisos[0].startsWith('Aún no hay facturas'), 'sin facturas → no OK, y dice que no hay ninguna (no un «hueco» igual al periodo)');
ok(v2.avisos.some((a) => a.includes('Faltan: 20/12/2025–18/02/2026')), 'con un hueco, dice qué falta');

console.log('\n— Facturas de la obra (punto 6) —');
const fuera = back.facturasFueraDePlazo([
    { numero_factura: 'A1', fecha_factura: '2026-03-22' }, { numero_factura: 'A2', fecha_factura: '2026-03-23' },
    { numero_factura: 'A3', fecha_factura: '2027-11-30' }, { numero_factura: 'A4', fecha_factura: '2027-12-01' }, { numero_factura: 'A5' },
]);
ok(igual(fuera.map((f) => f.numero), ['A1', 'A4']), 'fuera: la del 22/03/2026 (tiene que ser POSTERIOR) y la del 01/12/2027');
ok(back.facturasFueraDePlazo([{ numero: 'C1', fecha: '2027-12-15' }], { comunidad: true }).length === 0, 'una comunidad de propietarios llega al 31/12/2027');

console.log('\n— Qué documentos pide, por caso —');
const ctx = (numero, datos = {}, extra = {}) => back.contextoFm({ numero, datos, ...extra });
ok(back.documentosFm(ctx('26RES060_9')).length === 0, 'un expediente de la vía vigente no pide nada');
const uni = back.documentosFm(ctx('26RES060FM_9', {}, { inputs: { tipo: 'unifamiliar' }, zona: 'D3' }));
const base = ['FM_DECL_INSTALADOR', 'FM_ANEXO_A', 'FM_CERT_INSTALACION', 'FM_CERT_INERCIA', 'FM_VIVIENDA_HABITUAL', 'FM_FACTURAS', 'FM_FOTOS',
    'FM_OFERTA_MANTENIMIENTO', 'FM_BOLETIN_BT', 'FM_PUESTA_SERVICIO', 'FM_CEE_POSTERIOR', 'FM_CONSENTIMIENTO_IRPF', 'FM_INFORMADO_FG'];
ok(igual(claves(uni), base), 'unifamiliar en D3: los 13 puntos (BT y F/G condicionados)');
ok(uni.find((d) => d.key === 'FM_BOLETIN_BT').required === false && uni.find((d) => d.key === 'FM_INFORMADO_FG').required === false,
    'sin declarar la potencia ni el CEE F/G, BT y F/G no son obligatorios (y dicen cuándo)');
ok(back.tipologiaFm({ tipo: 'unifamiliar' }).fm === 2 && back.tipologiaFm({ tipo: 'piso' }).fm === 2.5 && back.tipologiaFm({ tipoInmueble: 'bloque' }).fm === 3, 'tipología: unifamiliar 2 · piso 2,5 · centralizado 3');
const piso = back.documentosFm(ctx('26RES060FM_9', { bt_aplica: false }, { inputs: { tipo: 'piso' }, zona: 'C2' }));
ok(!claves(piso).includes('FM_BOLETIN_BT') && !claves(piso).includes('FM_INFORMADO_FG') && piso[0].help.includes('Piso'), 'piso en C2 sin aumento de potencia: ni BT ni F/G, y la declaración dice «piso»');
const bloqueC = back.documentosFm(ctx('26RES060FM_9', {}, { inputs: { tipoInmueble: 'bloque' }, zona: 'D3' }));
ok(!claves(bloqueC).includes('FM_VIVIENDA_HABITUAL'), 'centralizado: no se justifica la vivienda habitual');
const preinst = back.documentosFm(ctx('26RES060FM_9', { caldera_retirada: false }, { zona: 'D3' }));
ok(claves(preinst).includes('FM_JUSTIF_PREINSTALACION'), 'caldera que se queda en preinstalación → su justificación (3.b)');
const inercia = uni.find((d) => d.key === 'FM_CERT_INERCIA');
ok(inercia.cubre === 'cifo' && !inercia.slot && !back.slotsFm(ctx('26RES060FM_9', {}, { zona: 'D3' })).some((s) => s.key === 'FM_CERT_INERCIA'),
    'la inercia (3.c) la cubre el CIFO: no se pide como papel aparte en el gestor');
const fg = back.documentosFm(ctx('26RES060FM_9', {}, { zona: 'E1', letrasFinal: ['G'] })).find((d) => d.key === 'FM_INFORMADO_FG');
ok(fg && fg.required === true && fg.help.includes('CEE final con G'), 'D/E con el CEE final en G → el documento informado es OBLIGATORIO');
const fgIni = back.contextoFm({ numero: '26RES060FM_9', zona: 'D2', letrasInicial: ['F'] });
ok(fgIni.letraFg === 'F' && fgIni.letraFgDe === 'inicial', 'sin final, el F del inicial ya avisa');
const hib = back.documentosFm(ctx('26RES093FM_4', { caldera_nueva: true }, { zona: 'D3' }));
ok(!claves(hib).includes('FM_CERT_INERCIA') && !claves(hib).includes('FM_INFORMADO_FG') && claves(hib).includes('FM_FICHAS_HIBRIDO'),
    'hibridación con caldera nueva: sin inercia ni F/G, con las fichas del híbrido (13)');
ok(hib.find((d) => d.key === 'FM_BOLETIN_BT').required === true, 'hibridación: el boletín BT siempre');
const vul = back.documentosFm(ctx('26RES060FM_9', { vulnerable: true, inquilino: true }, { zona: 'D3' }));
ok(['FM_VULN_BONO_SOCIAL', 'FM_VULN_ANEXO_B', 'FM_VULN_TITULO', 'FM_VULN_EMPADRONAMIENTO', 'FM_VULN_COMPROMISO'].every((k) => claves(vul).includes(k)),
    'vulnerable de alquiler: bono social, Anexo B, contrato, padrón y compromiso');
ok(vul.find((d) => d.key === 'FM_VULN_TITULO').label.includes('arrendamiento'), 'y el título es el contrato, no la nota simple');
const vulB = back.documentosFm(ctx('26RES060FM_9', { vulnerable: true, centralizado_mixto: true }, { inputs: { tipoInmueble: 'bloque' } }));
ok(claves(vulB).includes('FM_VULN_CERT_PRESIDENTE') && !claves(vulB).includes('FM_VULN_COMPROMISO'), 'centralizado con pisos de otros: el certificado del presidente');
const slots = back.slotsFm(ctx('26RES060FM_9', {}, { zona: 'D3' }));
ok(slots.every((x) => x.fase === 'DESPUES' && x.viaFm) && slots.filter((x) => x.aportaInstalador).every((x) => x.required === false && x.optionalAlways),
    'en el gestor: fase DESPUÉS, y lo del instalador no se le reclama al cliente');
ok(slots.every((x) => back.SLOTS_FM.includes(x.key)), 'todas las claves de slot están en SLOTS_FM');

console.log('\n— Los documentos que GENERA la app (Anexo A, declaración, F/G, mantenimiento, Anexo B) —');
{
    const docFm = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/documentosFm.js')).href);
    const sb = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/signBoxes.js')).href);
    const G = back.GENERADOS_FM;
    // Todo lo que la ficha dice que «genera» tiene su metadato, su slot y su maqueta.
    const todos = [
        ...back.documentosFm(ctx('26RES060FM_9', { vulnerable: true }, { zona: 'E1', letrasFinal: ['G'] })),
        ...back.documentosFm(ctx('26RES093FM_4', {}, { zona: 'D3' })),
    ];
    const genera = [...new Set(todos.filter((d) => d.genera).map((d) => d.genera))];
    ok(genera.length === 4 && genera.every((g) => G[g]), `la ficha pide generar ${genera.join(', ')} y todos están en GENERADOS_FM`);
    ok(Object.values(G).every((m) => back.SLOTS_FM.includes(m.slot)), 'cada documento generado firma en un slot de SLOTS_FM');
    ok(todos.filter((d) => d.genera).every((d) => d.slot === G[d.genera].slot), 'y es el MISMO slot que declara la ficha');
    ok(Object.keys(G).every((g) => typeof docFm.GENERADORES_FM[g] === 'function') && Object.keys(docFm.GENERADORES_FM).length === Object.keys(G).length,
        'backend (GENERADOS_FM) y frontend (GENERADORES_FM) cubren los mismos cuatro');
    ok(G.declaracion_instalador.firma === 'instalador' && ['informado_fg', 'oferta_mantenimiento', 'anexo_b'].every((g) => G[g].firma === 'cliente'),
        'la declaración la firma el instalador; los otros tres, el cliente');

    // Saneado de los datos nuevos del panel.
    const s2 = back.sanearDatosFm({ mantenimiento: 'acepta', mantenimiento_importe: '  180 €/año, IVA incluido  ' + 'x'.repeat(80), anexo_b_casilla: 'severo',
        vulnerable_persona: { nombre: ' Luis Ruiz ', nif: '00000000t', domicilio: 'CL A 1', telefono: '600', email: 'L@x.es', otro: 1 } });
    ok(s2.mantenimiento === 'acepta' && s2.anexo_b_casilla === 'severo', 'mantenimiento y casilla del Anexo B pasan si son del enum');
    ok(s2.mantenimiento_importe.length <= 60 && s2.mantenimiento_importe.startsWith('180 €/año'), 'el importe se recorta a 60 y sin espacios a los lados');
    ok(s2.vulnerable_persona && s2.vulnerable_persona.nombre === 'Luis Ruiz' && !('otro' in s2.vulnerable_persona), 'la persona vulnerable: solo sus cinco campos');
    const s3 = back.sanearDatosFm({ mantenimiento: 'ACEPTA', anexo_b_casilla: 'otra', vulnerable_persona: 'x' });
    ok(s3.mantenimiento === null && s3.anexo_b_casilla === null && s3.vulnerable_persona === null, 'lo que no es del enum (o no es un objeto) queda null');

    // Qué se le ofrece a firmar a cada uno.
    const cx = ctx('26RES060FM_9', { vulnerable: true }, { zona: 'E1', letrasFinal: ['G'] });
    const fmDocs = { informado_fg: { drive_id: 'abc', drive_at: '2026-11-07T10:00:00Z' }, declaracion_instalador: { drive_link: 'https://drive/x', drive_at: '2026-11-07T09:00:00Z' } };
    const cli = back.generadosParaFirmar(cx, { quien: 'cliente', fmDocs });
    ok(cli.length === 1 && cli[0].genera === 'informado_fg' && cli[0].firmado === false, 'al cliente, solo lo que ya tiene BORRADOR (el F/G), sin firmar');
    const ins = back.generadosParaFirmar(cx, { quien: 'instalador', fmDocs });
    ok(ins.length === 1 && ins[0].genera === 'declaracion_instalador', 'al instalador, su declaración');
    ok(back.generadosParaFirmar({ ...cx, activa: false }, { quien: 'cliente', fmDocs }).length === 0, 'fuera de la vía FM, nada');
    const subido = { FM_INFORMADO_FG: [{ name: 'x.pdf', at: '2026-11-07T11:00:00Z' }] };
    ok(back.generadosParaFirmar(cx, { quien: 'cliente', fmDocs, uploads: subido })[0].firmado === true, 'firmado después del borrador → firmado');
    ok(back.firmadoVigente([{ at: '2026-11-07T08:00:00Z' }], '2026-11-07T10:00:00Z') === false, 'borrador REGENERADO después de firmarlo → vuelve a pedir la firma');
    ok(back.firmadoVigente([{ name: 'viejo.pdf' }], '2026-11-07T10:00:00Z') === true && back.firmadoVigente([], null) === false, 'subida sin fecha cuenta; sin subidas, no');

    // Dónde se firma: el recuadro fijo de las hojas FM y el del Anexo A.
    const caja = sb.cajaFirmaFmPt(1);
    ok(caja.page === 1 && caja.llx > 0 && caja.urx <= 595 && caja.lly > 0 && caja.ury < 842 && caja.urx > caja.llx && caja.ury > caja.lly, `recuadro FM dentro de un A4 (${caja.llx},${caja.lly})–(${caja.urx},${caja.ury}) pt`);
    ok(sb.anexoISignBox(2).page === 2 && sb.anexoISignBox(4) === sb.SIGN_BOXES.anexo_i_oficial && sb.anexoISignBox(3) === sb.SIGN_BOXES.anexo_i,
        'Anexo A (2 hojas) firma en la 2; el Anexo I oficial (4) y el clásico (3), como siempre');
    ok(sb.anexoISignBoxCedente(1, 3)({ numPaginas: 6 }).page === 4 && sb.anexoISignBoxCedente(1, 3)({ numPaginas: 12 }).page === 8,
        'varios cedentes: el 2.º de 3 firma la hoja 4 del Anexo A (6 hojas) y la 8 del oficial (12)');

    // Las maquetas.
    const expFm = {
        numero_expediente: '26RES060FM_9',
        clientes: { nombre_razon_social: 'ANA', apellidos: 'PÉREZ RUIZ', dni: '00000000T', direccion: 'CL MAYOR 1', municipio: 'TOMELLOSO', provincia: 'CIUDAD REAL', codigo_postal: '13700' },
        instalacion: {}, oportunidades: { datos_calculo: { zona: 'D3', inputs: {} } }, documentacion: { via_fm: {} },
    };
    const hojas = (h) => (String(h).match(/class="fm-page"/g) || []).length;
    ok(docFm.usaAnexoA(expFm) && !docFm.usaAnexoA({ numero_expediente: '26RES060_9' }), 'usaAnexoA: solo con número FM');
    ok(hojas(docFm.buildAnexoAHtml(expFm, {})) === 2, 'Anexo A: dos hojas con un cedente');
    const dos = { ...expFm, clientes: { ...expFm.clientes, copropietarios: [{ id: 'cop0', nombre: 'LUIS', apellidos: 'GÓMEZ', dni: '11111111H', cedente: true }] } };
    ok(hojas(docFm.buildAnexoAHtml(dos, {})) === 4, 'y dos por cada cedente (dos cedentes → cuatro)');
    ok(docFm.fuenteAnexoIoA(expFm, {}, () => 'F').html && docFm.fuenteAnexoIoA({ numero_expediente: '26RES060_9' }, {}, () => 'F').formulario === 'F',
        'fuenteAnexoIoA: HTML del Anexo A en FM, el impreso oficial fuera');
    ok(docFm.nombreAnexoIoA(expFm) === 'Anexo A' && docFm.nombreAnexoIoA({ numero_expediente: '26RES093_2' }) === 'Anexo I', 'nombreAnexoIoA');
    const cxF = { tipologia: { clase: 'unifamiliar' }, zona: 'E1', letraFg: 'G' };
    for (const g of Object.keys(G)) {
        const h = docFm.GENERADORES_FM[g](expFm, cxF, { vulnerable: true, mantenimiento: 'acepta', anexo_b_casilla: 'renta' });
        ok(hojas(h) === 1 && h.includes('26RES060FM_9'), `${g}: una hoja, con el nº de expediente`);
    }
    const avis = docFm.avisosDocumentoFm('oferta_mantenimiento', expFm, cxF, {});
    ok(avis.some((t) => /acepta o desiste/.test(t)) && avis.some((t) => /Sin importe/.test(t)), 'sin decidir el mantenimiento ni el importe, el panel lo avisa');
    const avis2 = docFm.avisosDocumentoFm('oferta_mantenimiento', expFm, cxF, { mantenimiento: 'desiste', mantenimiento_importe: '150 €' });
    ok(!avis2.some((t) => /acepta o desiste|Sin importe/.test(t)), 'decidido y con importe, ya no');
}

console.log('\n— El consentimiento del IRPF (punto 12) —');
const t1 = front.textoConsentimientoFm({ codigo: 'RES060_FM' });
ok(t1.startsWith('El Cedente ha sido informado') && t1.includes('a) el incentivo') && t1.includes('IRPF') && t1.includes('b) el ahorro dependerá'), 'Convenio, un cedente: los dos puntos');
ok(front.textoConsentimientoFm({ codigo: 'X', esEmpresa: true }).includes('impuesto sobre la renta que le corresponda'), 'cliente empresa: «el impuesto que le corresponda»');
ok(front.textoConsentimientoFmVarios({ codigo: 'RES093_FM' }).startsWith('los Cedentes han sido informados') && front.textoConsentimientoFmVarios({}).includes('aceptan que'), 'varios cedentes: en plural');
ok(front.NOTA_FM_PROPUESTA.includes('IRPF') && front.NOTA_FM_PROPUESTA.includes('Convenio de Cesión'), 'nota de la propuesta');
ok(front.lineaConsentimientoFm({ tuteo: true }).includes('tu IRPF') && front.lineaConsentimientoFm({ tuteo: false }).includes('el cliente firme'), 'mensaje: tuteo al cliente, tercera persona al partner');
ok(front.lineaConsentimientoFm({ trasAviso: true }).startsWith('Si se tramita por esa vía') && front.lineaConsentimientoFm({ trasAviso: false }).includes('*Vía del factor multiplicador.*'),
    'tras el aviso del FM se apoya en él; sin aviso, se dice entera');

console.log('\n— El Convenio FM cubre las DOS fichas (Fran, 08/11/2026) —');
{
    const cfm = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/convenioFm.js')).href);
    const sb = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/signBoxes.js')).href);
    const { buildAnexoCesionHtml } = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/utils/docGenerators.js')).href);
    const R = { savingsKwh: 43268, caeBonus: 4327, res060fc: { cae: 66818 }, financialsRes060FC: { caeBonus: 6682 } };
    const exp = (n, inputs = {}) => ({ numero_expediente: n, clientes: { nombre_razon_social: 'ANA', apellidos: 'PRUEBA' }, instalacion: {}, documentacion: {},
        oportunidades: { datos_calculo: { inputs: { caePriceClient: 100, ...inputs } } } });
    const c = cfm.cifrasConvenioFm(exp('26RES060FM_9'), R, { rateMwh: 100 });
    ok(c.doble && c.fm.kwh === 66818 && c.fm.eur === 6682 && c.general.kwh === 43268 && c.general.eur === 4327 && c.mismoPrecio,
        'cifras: FM de res060fc/financialsRes060FC y la general de savingsKwh/caeBonus');
    ok(cfm.cifrasConvenioFm(exp('26RES060_9'), R, { rateMwh: 100 }) === null, 'un expediente de la vigente no tiene cifras FM');
    ok(cfm.cifrasConvenioFm(exp('26RES060FM_9'), { ...R, viaUnica: true }, { rateMwh: 100 }).doble === false, 'con requerimiento (ahorro verificado de una vía) no hay alternativa');
    const cp = cfm.cifrasConvenioFm(exp('26RES060FM_9', { cae_client_rate_fm: 105 }), { ...R, financialsRes060FC: null }, { rateMwh: 100 });
    ok(cp.fm.rateMwh === 105 && Math.round(cp.fm.eur) === Math.round(66818 * 0.105) && !cp.mismoPrecio, 'con precio FM propio, el importe FM sale a SU precio');
    ok(cfm.fichaGeneralDeFm('26RES093FM_2') === 'RES093' && cfm.fichaGeneralDeFm('26RES060FM_2') === 'RES060', 'la subsidiaria de RES093FM es RES093');
    const html = buildAnexoCesionHtml(exp('26RES060FM_9'), R, { previo: true });
    const hojas = (h) => (h.match(/class="conv-page[ "]/g) || []).length;
    ok(hojas(html) === 3 && html.includes('conv-page-firmas'), 'un cedente FM: tres hojas, la 3 de firmas');
    ok(/66\.818 kWh\/año/.test(html) && /43\.268 kWh\/año/.test(html) && /6\.682 €/.test(html) && /4\.327 €/.test(html), 'el convenio lleva las dos cifras y los dos importes');
    ok(html.includes('subsidiaria') && html.includes('sin necesidad de novar este convenio ni de suscribir uno nuevo') && html.includes('agotado el cupo'),
        'y la autorización para pasar a la ficha general sin firmar otro');
    ok(html.includes('<strong>Cuarto.</strong> Que el Cedente ha sido informado'), 'el consentimiento del IRPF va como «Cuarto» del EXPONEN');
    const vig = buildAnexoCesionHtml(exp('26RES060_9'), R, { previo: true });
    ok(hojas(vig) === 2 && !vig.includes('subsidiaria') && /43\.268 kWh\/año/.test(vig), 'la vigente no cambia: dos hojas y una cifra');
    const dosCed = { ...exp('26RES060FM_9'), clientes: { nombre_razon_social: 'ANA', apellidos: 'PRUEBA', copropietarios: [{ id: 'c1', nombre: 'LUIS', apellidos: 'G', dni: '1', cedente: true }] } };
    ok(hojas(buildAnexoCesionHtml(dosCed, R, { previo: true })) === 4, 'FM con varios cedentes: cuatro hojas');
    ok(sb.cajaConvenioCedente(0)({ numPaginas: 4 }).page === 4 && sb.cajaConvenioCesionario({ numPaginas: 4 }).page === 4, 'y la firma se busca en la 4');
    ok(sb.cajaConvenioCedente(0)({ numPaginas: 3 }).page === 3 && sb.cajaConvenioCedente(0)({ numPaginas: 2 }).page === 2, 'con 3 hojas en la 3, con 2 la de siempre');
    ok(sb.cajaConvenioCesionario({ numPaginas: 6 }).page === 3, 'un firmado a mano con los DNI detrás (≥ 5) sigue en la 3, como antes');
    // La hoja 1 no se queda a medias (08/11): la Tercera FM —autorización y tabla— cierra la 1.
    const p1 = html.split(/class="conv-page[ "]/)[1] || '';
    ok(p1.includes('Tercera. Ahorro anual de energía y ficha por la que se tramita') && p1.includes('conv-tabla-fm'), 'la Tercera FM y su tabla van en la hoja 1');
    const p3 = html.split(/class="conv-page[ "]/)[3] || '';
    ok(!p3.includes('Notificaciones') && p3.includes('conv-firmas-pie'), 'con un cedente, la hoja de firmas solo lleva el cierre, pegado a las casillas');

    console.log('\n— El aviso de ESPERAR al 15/01/2027 (panel «Vía FM») —');
    // Las dos cifras salen para CUALQUIER RES060/RES093, vaya ya por la FM o no.
    const cv = cfm.cifrasViaFm(exp('26RES060_9'), { ...R, res060fc: { cae: 66818, avisos: [{ tono: 'bloquea', texto: 'Obra fuera de plazo' }] } }, { rateMwh: 100 });
    ok(cv && cv.gana === 6682 - 4327 && cv.bloquea.length === 1, 'la vigente también tiene sus dos cifras, lo que gana el cliente y lo que lo impide');
    const m = cfm.mensajeEsperaFm({ saludo: 'ANA', numero: '26RES060_227', cifras: cv });
    ok(m.startsWith('Hola ANA,') && m.includes('15 de enero de 2027') && m.includes('6.682 €') && m.includes('4.327 €') && m.includes('*sí*'),
        'el mensaje: saludo, la fecha, las dos cifras y la pregunta');
    ok(!/[\u{1F300}-\u{1FAFF}ℹ☀-➿]/u.test(m), 'sin emojis');
    ok(cfm.mensajeEsperaFm({ saludo: 'PEDRO', numero: 'X', cifras: cv, tercero: true }).includes('tu cliente'), 'a la persona de contacto le habla de su cliente');
    const sa = back.sanearDatosFm({ aviso_espera: { at: '2026-11-08T12:00:00.000Z', a: ['ANA', '', 'x'.repeat(200)] }, espera_cliente: 'acepta' });
    ok(sa.aviso_espera?.at === '2026-11-08T12:00:00.000Z' && sa.aviso_espera.a.length === 2 && sa.aviso_espera.a[1].length === 120 && sa.espera_cliente === 'acepta',
        'via_fm guarda cuándo y a quién se propuso, y la respuesta');
    ok(back.sanearDatosFm({ aviso_espera: { at: 'ayer' }, espera_cliente: 'quizá' }).aviso_espera === null && back.sanearDatosFm({ espera_cliente: 'quizá' }).espera_cliente === null,
        'y descarta lo que no es una fecha ni una respuesta válida');
    // Sin CEE la pestaña Económico no calcula: el panel usa la cifra de la simulación.
    const expSim = { ...exp('26RES060_9'), oportunidades: { datos_calculo: { via_fm: { aplica: true, mwh_vigente: 40.3, eur_vigente: 3427, mwh_fm: 80.8, eur_fm: 6868, elegible: true, acs: 'supuesto' } } } };
    const est = cfm.cifrasViaFm(expSim, {}, { rateMwh: 85 });
    ok(est?.estimada === true && est.gana === 6868 - 3427 && est.fm.kwh === 80800 && est.acs === 'supuesto',
        'sin CEE: las dos cifras de la simulación, marcadas como estimadas');
    ok(cfm.cifrasViaFm(expSim, { ...R, res060fc: { cae: 66818 } }, { rateMwh: 100 }).estimada === false, 'con el CEE manda el cálculo del expediente');
    const expSimFm = { ...expSim, numero_expediente: '26RES060FM_9' };
    ok(!cfm.cifrasConvenioFm(expSimFm, {}, { rateMwh: 85 })?.estimada, 'el Convenio nunca firma la cifra estimada');
    const noEleg = cfm.cifrasViaFm({ ...expSim, oportunidades: { datos_calculo: { via_fm: { ...expSim.oportunidades.datos_calculo.via_fm, elegible: false, motivo: 'caldera de sólido' } } } }, {}, {});
    ok(noEleg.bloquea[0] === 'caldera de sólido', 'y si la simulación dice que no es elegible, lo dice');
    // Al desplegar ninguna oportunidad tenía `via_fm` guardado: se calcula al momento.
    const dcSinVia = {
        inputs: { provincia: '13', anio: 1995, tipo: 'unifamiliar', zona: 'D3', superficie: 150, boilerEff: 0.79, fuelType: 'gasoil', scopHeating: 3, scopAcs: 2.8, changeAcs: true, caePriceClient: 100 },
        result: { savings: { savingsKwh: 24000 }, financials: { caeBonus: 2400, finalPriceClient: 100, legalizationCost: 0, isParticular: true }, Q_net: 24000 },
    };
    const alMomento = cfm.cifrasViaFm({ ...exp('26RES060_9'), oportunidades: { datos_calculo: dcSinVia } }, {}, { rateMwh: 100 });
    ok(alMomento?.estimada && alMomento.general.eur === 2400 && alMomento.fm.kwh > 0 && alMomento.fm.eur > 0,
        'sin `via_fm` guardado, la cifra FM se calcula al momento desde la simulación', JSON.stringify(alMomento?.fm));
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo correcto');
process.exit(fallos ? 1 : 0);
