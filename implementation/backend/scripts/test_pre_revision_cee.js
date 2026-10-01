#!/usr/bin/env node
/**
 * test_pre_revision_cee.js — la revisión PREVIA que ve el técnico al subir.
 *
 *   node scripts/test_pre_revision_cee.js
 *
 * Sin BD, sin Drive y sin motor: todo lo que toca fuera se sustituye en la
 * caché de `require` antes de cargar los módulos.
 *
 *   A) qué parte de la revisión ve el técnico, y con qué palabras
 *   B) lo guardado, convertido para el certificador (el detalle del expediente)
 *   C) la línea del aviso a Fran
 *   D) el freno de la ruta pública
 *   E) la revisión al subir lee el .xml de DRIVE, no el de la BD
 *   F) `preRevisar`: pide leer de Drive, marca el origen y habla al técnico
 */
const path = require('path');

let fallos = 0;
const ok = (cond, texto, extra) => {
    console.log(`  ${cond ? '✓' : '✗'} ${texto}${extra ? `  — ${extra}` : ''}`);
    if (!cond) fallos++;
};

const svc = (rel) => require.resolve(path.join(__dirname, '..', rel));
const falso = (rel, exports) => {
    const id = svc(rel);
    require.cache[id] = { id, filename: id, loaded: true, exports };
};

const T = require('../services/cee/revisionTecnico');

// ─── A) La vista del técnico ─────────────────────────────────────────────────
console.log('\nA) Qué ve el técnico');
const informe = [
    { id: 'xml', titulo: 'El .xml del certificado', estado: 'falla', dice: 'sin .xml', esperado: 'el .xml', detalle: 'Pídeselo al certificador.' },
    { id: 'demanda', titulo: 'Demanda de calefacción frente a la propuesta', estado: 'falla', dice: '80', esperado: '110 prometidos', detalle: 'bono al cliente' },
    { id: 'superficie', titulo: 'Superficie frente a la propuesta', estado: 'aviso', dice: '90', esperado: '120' },
    { id: 'rendimiento', titulo: 'Rendimiento estacional', estado: 'info', dice: '56 %' },
    { id: 'caldera_cex', titulo: 'Cómo se estima la caldera', estado: 'info', dice: 'x' },
    { id: 'medida', titulo: 'Medida de mejora', estado: 'falla', dice: 'sin medida', esperado: 'la aerotermia', detalle: 'La app puede ponerla…', accion: 'poner_medida' },
    { id: 'transmitancias', titulo: 'Transmitancias frente a la guía', estado: 'aviso', dice: '2 distintas', esperado: 'guía', detalle: '…con la que se calculó la propuesta…' },
    { id: 'acumulacion_acs', titulo: 'Acumulación de ACS', estado: 'no_comprobable', dice: 'no en el xml' },
    { id: 'fecha_certificado', titulo: 'Fecha del certificado', estado: 'ok', dice: '01/09/2026' },
    { id: 'ref_catastral', titulo: 'Referencia catastral', estado: 'ok', dice: 'RC' },
];
const v = T.vistaTecnico(informe, { conCorrectos: true });
const ids = (l) => l.map((p) => p.id);
const todos = [...v.corregir, ...v.revisar, ...v.sinComprobar];
// Decisión del usuario (2026-09-30): de la demanda y la superficie sale el ahorro
// en MWh que se puede certificar, y el email del encargo ya se las da como objetivo.
ok(ids(v.revisar).includes('demanda') && ids(v.revisar).includes('superficie'),
    've la demanda y la superficie frente a la simulación, como algo que REVISAR');
ok(!ids(todos).includes('rendimiento') && !ids(todos).includes('caldera_cex'), 'no ve lo meramente informativo');
ok(JSON.stringify(v).indexOf('bono') === -1, 'el consejo de Brokergy («bono al cliente») no viaja: va el suyo');
ok(/MWh/.test(v.revisar.find((p) => p.id === 'demanda').detalle)
    && /dilo en el mensaje/.test(v.revisar.find((p) => p.id === 'demanda').detalle),
    'la demanda: le dice por qué importa y que, si la vivienda es así, lo diga');
ok(/estancias habitables/.test(v.revisar.find((p) => p.id === 'superficie').detalle), 'la superficie: qué comprobar');
ok(v.estado === 'corregir', `con fallos visibles el estado es «corregir» (${v.estado})`);
ok(v.titular === 'Hay 2 cosas que corregir antes de enviarlo', `titular: «${v.titular}»`);
ok(!/APTO/.test(JSON.stringify(v)), 'nunca dice APTO');
ok(ids(v.corregir).join() === 'xml,medida', 'lo que corregir: el .xml y la medida');
ok(v.corregir.every((p) => !('accion' in p)), 'sin el botón de Brokergy (`accion`)');
ok(!/certificador/i.test(v.corregir[0].detalle), 'el consejo del .xml ya no habla del técnico en tercera persona', v.corregir[0].detalle);
ok(/Actualizar/.test(v.corregir[1].detalle), 'la medida que falta: le dice qué hacer en CE3X');
const tr = v.revisar.find((p) => p.id === 'transmitancias');
ok(!/propuesta/.test(tr.detalle), 'transmitancias: sin «la propuesta» en el consejo', tr.detalle);
ok(v.sinComprobar.length === 1 && /\.cex/.test(v.sinComprobar[0].detalle), 'lo no comprobable, aparte y con su consejo');
ok(v.correctos === 2, `cuenta los correctos que ve (${v.correctos})`);
ok(T.vistaTecnico(informe).correctos === null, 'sin la lista entera, los correctos no se cuentan');

const medidaSinCex = T.vistaTecnico([{ id: 'medida', titulo: 'Medida', estado: 'no_comprobable', detalle: 'x' }]);
ok(/Sube también el \.cex/.test(medidaSinCex.sinComprobar[0].detalle), 'la medida SIN .cex: pide el .cex, no que la añada');
const soloAvisos = T.vistaTecnico([{ id: 'ventilacion', titulo: 'Ventilación', estado: 'aviso' }]);
ok(soloAvisos.estado === 'revisar' && soloAvisos.titular === 'Hay 1 cosa que conviene revisar', `solo avisos: «${soloAvisos.titular}»`);
const soloDemanda = T.vistaTecnico([{ id: 'demanda', titulo: 'Demanda', estado: 'falla', detalle: 'La demanda certificada queda por debajo…' }, { id: 'x', titulo: 'x', estado: 'ok' }], { conCorrectos: true });
ok(soloDemanda.estado === 'revisar' && soloDemanda.titular === 'Hay 1 cosa que conviene revisar',
    'la demanda por debajo de la simulada NO es «corregir» para el técnico: es revisar');
const res080 = T.vistaTecnico([{ id: 'demanda', titulo: 'Demanda', estado: 'falla', detalle: 'En el CEE final de un RES080 la demanda TIENE que bajar: …' }]);
ok(res080.estado === 'corregir' && /mejoras de la envolvente/.test(res080.corregir[0].detalle),
    'la excepción: el CEE final de un RES080 cuya demanda no baja SÍ es «corregir»');
const sinSimulacion = T.vistaTecnico([{ id: 'demanda', titulo: 'Demanda', estado: 'no_comprobable', esperado: 'la oportunidad no llegó a calcular demanda' }]);
ok(sinSimulacion.estado === 'bien' && !sinSimulacion.sinComprobar.length, 'sin simulación detrás no se le enseña nada: no puede hacer nada con eso');
const okTexto = T.vistaTecnico([{ id: 'medida', titulo: 'Medida', estado: 'ok', detalle: null }], { conCorrectos: true });
ok(okTexto.correctos === 1, 'un punto correcto no recibe consejo');

// ─── B) Lo guardado, para el certificador ────────────────────────────────────
console.log('\nB) El detalle del expediente que abre el certificador');
const guardada = {
    at: '2026-09-30T08:00:00Z', por: 'Fran', origen: 'subida', veredicto: 'NO APTO',
    resumen: { ok: 9, avisos: 2, fallas: 3, no_comprobables: 1 },
    fuentes: { xml: 'a.xml (Drive)', cex: 'a.cex', cex_error: 'motor caído' },
    puntos: informe.filter((p) => p.estado !== 'ok' && p.estado !== 'info'),
};
const g = T.guardadaParaTecnico(guardada);
ok(!('veredicto' in g) && !('resumen' in g) && !('puntos' in g) && !('por' in g), 'sin el veredicto, el recuento ni los puntos de Brokergy');
ok(g.at === guardada.at && g.origen === 'subida' && g.fuentes.cex === 'a.cex' && !('cex_error' in g.fuentes), 'conserva cuándo y con qué ficheros');
ok(!JSON.stringify(g).includes('bono'), 'el texto de Brokergy no viaja');
ok(g.tecnico.estado === 'corregir' && g.tecnico.corregir.length === 2, 'lleva SU vista');
ok(T.guardadaParaTecnico(null) === null, 'sin revisión, nada');

// ─── C) El aviso a Fran ──────────────────────────────────────────────────────
console.log('\nC) La línea del aviso a Fran');
const linea = T.lineaParaStaff(guardada);
ok(linea === 'NO APTO · 3 fallos (El .xml del certificado, Demanda de calefacción frente a la propuesta, Medida de mejora) · 2 avisos · 1 sin comprobar',
    `veredicto COMPLETO, con lo que el técnico no ve: «${linea}»`);
ok(/Demanda/.test(linea), 'Fran sí ve lo de la propuesta');
ok(T.lineaParaStaff({ veredicto: 'APTO', resumen: { ok: 12 } }) === 'APTO', 'APTO a secas');
ok(T.lineaParaStaff(null) === null, 'sin revisión, sin línea');

// ─── D) El freno de la ruta pública ──────────────────────────────────────────
console.log('\nD) El freno');
const { recienteDe, recordar, ESPERA_MS } = T._freno;
recordar('E1:inicial', { v: 1 }, 1000);
ok(recienteDe('E1:inicial', 1000 + ESPERA_MS - 1)?.v === 1, 'dentro de la ventana devuelve la última');
ok(recienteDe('E1:inicial', 1000 + ESPERA_MS) === null, 'fuera de la ventana, se rehace');
recordar('E1:inicial', { v: 2 }, Date.now());
T.olvidar('E1', 'inicial');
ok(recienteDe('E1:inicial') === null, 'un fichero nuevo la olvida (si no, el .cex subido tras el .xml no se revisaría)');

// ─── E) La revisión al subir lee el .xml de DRIVE ────────────────────────────
console.log('\nE) De dónde sale el .xml');
(async () => {
    const expediente = { id: 'E2', numero_expediente: '26RES060_1', cee: { xml_inicial: 'XML-BD', xml_final: 'XML-BD-FINAL' } };
    let drive = { bytes: 'XML-DRIVE', nombre: '26RES060_1 – CEE INICIAL.xml' };
    const qb = () => {
        const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: expediente, error: null }) };
        return b;
    };
    falso('services/supabaseClient.js', { from: qb });
    falso('services/ceeUploadService.js', { resolveDriveFolderId: async () => 'F' });
    falso('services/cee/radiografiaCee.js', { radiografiaXml: (x) => ({ src: String(x) }) });
    falso('services/cee/revisionCex.js', {
        ficheroEntregado: async (ctx, fase, slot) => (slot === 'xml' && fase === 'inicial' ? drive : null),
        cexEntregado: async () => null,
    });
    const { cargarParaRevision } = require('../services/cee/cargarRevision');

    let c = await cargarParaRevision({ id: 'E2' });
    ok(c.fases.find((f) => f.fase === 'inicial').rx.src === 'XML-BD', 'la lupa de Fran sigue leyendo el de la BD');
    c = await cargarParaRevision({ id: 'E2', xmlDeDrive: 'inicial' });
    const ini = c.fases.find((f) => f.fase === 'inicial');
    ok(ini.rx.src === 'XML-DRIVE' && /\(Drive\)/.test(ini.fichero), 'al subir, el de la fase que se revisa sale de DRIVE', ini.fichero);
    ok(c.fases.find((f) => f.fase === 'final').rx.src === 'XML-BD-FINAL', 'la otra fase sigue saliendo de la BD');
    drive = null;
    c = await cargarParaRevision({ id: 'E2', xmlDeDrive: 'inicial' });
    ok(c.fases.find((f) => f.fase === 'inicial').rx.src === 'XML-BD', 'sin .xml en Drive, se cae al de la BD');

    // ─── F) preRevisar ──────────────────────────────────────────────────────
    console.log('\nF) preRevisar');
    let llamada = null;
    let lanza = null;
    const cargar = svc('services/cee/cargarRevision.js');
    require.cache[cargar].exports = {
        cargarParaRevision,
        revisarYGuardar: async (o) => {
            llamada = o;
            if (lanza) throw lanza;
            return {
                comprobaciones: informe, guardado: { at: '2026-09-30T09:00:00Z' },
                fuentes: { xml: 'x.xml (Drive)', cex: 'x.cex', cex_error: null },
            };
        },
    };
    const r = await T.preRevisar({ id: 'E3', fase: 'inicial', usuario: 'al subir · LANUZA' });
    ok(llamada.xmlDeDrive === true && llamada.origen === 'subida' && llamada.usuario === 'al subir · LANUZA',
        'pide el .xml de Drive, marca el origen «subida» y quién');
    ok(r.tecnico.estado === 'corregir' && r.tecnico.correctos === 2 && r.fuentes.cex === 'x.cex', 'devuelve la vista del técnico');
    ok(!JSON.stringify(r).includes('bono'), 'y ningún texto de Brokergy');

    llamada = null;
    const r2 = await T.preRevisar({ id: 'E3', fase: 'inicial', frenar: true });
    ok(llamada === null && r2 === r, 'con freno y dentro de la ventana, no vuelve a revisar');
    T.olvidar('E3', 'inicial');
    await T.preRevisar({ id: 'E3', fase: 'inicial', frenar: true });
    ok(llamada !== null, 'tras un fichero nuevo, sí');

    lanza = Object.assign(new Error('El técnico todavía no ha entregado el CEE inicial…'), { status: 409 });
    try {
        await T.preRevisar({ id: 'E4', fase: 'inicial' });
        ok(false, 'sin ficheros debería fallar con 409');
    } catch (e) {
        ok(e.status === 409 && /súbelos/.test(e.message) && !/El técnico/.test(e.message), 'sin ficheros: 409 dicho AL técnico', e.message);
    }

    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
