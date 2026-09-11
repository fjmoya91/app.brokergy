// ============================================================================
// test_ficha_consolidada.mjs — la ficha del catálogo cuando son VARIOS papeles.
// ----------------------------------------------------------------------------
//   node implementation/backend/scripts/test_ficha_consolidada.mjs
//
// No toca BD, ni Drive, ni el catálogo: comprueba las dos mitades que sí pueden
// romperse en silencio —cómo se reparten las piezas entre los equipos y qué sale
// del PDF unido— y las salvaguardas que impiden guardar en el catálogo algo que
// no es de este expediente. Lo que se guarda ahí se adjunta a TODOS los
// expedientes que lleven ese modelo, así que un fallo aquí no se queda en uno.
// ============================================================================

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PDFDocument } from 'pdf-lib';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const front = (rel) => pathToFileURL(path.join(aquí, '../../frontend/src/features/expedientes', rel)).href;

const L = await import(front('logic/fichaConsolidable.js'));
const { destinosConsolidacion, piezasSueltas, puedeConsolidar, repartoInicial,
        construirGrupos, motivoBloqueo, etiquetaCorta, payloadGrupos, resumenPartes } = L;
const { unirAnexos } = await import(pathToFileURL(path.join(aquí, '../services/pdfService.js')).href)
    .then(m => m.default || m);

let fallos = 0;
const ok = (cond, msg) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
    if (!cond) fallos++;
};
const titulo = (t) => console.log(`\n${t}`);

// ── Un PDF de N páginas, para poder contar lo que sale ──────────────────────
// Cada página lleva algo pintado a propósito: pdf-lib no sabe embeber una página
// SIN contenido ("Can't embed page with missing Contents"), y una hoja vacía no
// se parece a ninguna ficha técnica real.
async function pdfDe(n) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < n; i++) {
        doc.addPage([595, 842]).drawRectangle({ x: 40, y: 40, width: 120, height: 60 });
    }
    return Buffer.from(await doc.save());
}
const paginasDe = async (buf) => (await PDFDocument.load(buf)).getPageCount();

// ── El expediente de la captura: 25RES060_79 ────────────────────────────────
// Ficha de calefacción de 3 págs con la 1 quitada, dos PDFs sueltos (EPREL y
// etiqueta) y una ficha de ACS de OTRO modelo.
const anexo = (id, driveId, label, paginas, extra = false) => ({
    id, label, isExtra: extra,
    file: { driveId, name: `${label}.pdf`, previewPages: Array(paginas).fill('img') },
});

const LISTA = [
    anexo('aerotermia_cal', 'd_cal', 'Ficha técnica aerotermia calefacción', 3),
    anexo('extra_d_eprel', 'd_eprel', 'FICHE_673327_ES (1).pdf', 2, true),
    anexo('extra_d_label', 'd_label', 'LABEL_673327.pdf', 1, true),
    anexo('aerotermia_acs', 'd_acs', 'Ficha técnica aerotermia ACS', 1),
];
const SLOT_CAL = { id: 'aerotermia_cal', type: 'cal', label: 'Ficha técnica aerotermia calefacción', modelId: 42, modeloLabel: 'ECODAN 14' };
const SLOT_ACS = { id: 'aerotermia_acs', type: 'acs', label: 'Ficha técnica aerotermia ACS', modelId: 77, modeloLabel: 'NUOS 200' };
const DOS = [SLOT_CAL, SLOT_ACS];
const PREFS = { order: [], excluded: { d_cal: [1] } };          // la 1 de la ficha, quitada
const SIN_PREFS = { order: [], excluded: {} };

titulo('1. A quién se le puede guardar, y cuándo se ofrece');
{
    const d = destinosConsolidacion(LISTA, PREFS, DOS);
    ok(d.length === 2, 'los dos equipos con modelo del catálogo son destino');
    ok(d[0].paginas === 2 && d[0].excluidas.length === 1, 'la ficha de calefacción cuenta 2 de 3 págs');

    const sinModelo = destinosConsolidacion(LISTA, PREFS, [{ ...SLOT_CAL, modelId: null }]);
    ok(sinModelo.length === 0, 'un equipo tecleado a mano NO es destino: no hay a quién guardárselo');

    ok(puedeConsolidar(LISTA, PREFS, DOS), 'con PDFs sueltos se ofrece');
    // El caso que pidió el usuario: solo he quitado una página y quiero guardarlo.
    ok(puedeConsolidar([LISTA[0]], PREFS, [SLOT_CAL]),
       'SIN sueltos pero con la ficha RECORTADA tambien se ofrece: guardarla recortada ahorra ese trabajo a todos');
    ok(!puedeConsolidar([LISTA[0]], SIN_PREFS, [SLOT_CAL]),
       'sin sueltos y sin recorte NO se ofrece: no habria nada que cambiar');
}

titulo('2. El reparto que se propone');
{
    const dUno = destinosConsolidacion([LISTA[0], LISTA[1], LISTA[2]], PREFS, [SLOT_CAL]);
    const sUno = piezasSueltas([LISTA[0], LISTA[1], LISTA[2]], PREFS);
    const rUno = repartoInicial(dUno, sUno);
    ok(rUno.marcados.size === 1 && Object.values(rUno.asignacion).every(v => v.length === 1),
       'con UN equipo: marcado y todos los sueltos asignados — no pueden ser de otra cosa');

    const dDos = destinosConsolidacion(LISTA, PREFS, DOS);
    const sDos = piezasSueltas(LISTA, PREFS);
    const rDos = repartoInicial(dDos, sDos);
    ok(rDos.marcados.size === 1 && rDos.marcados.has('aerotermia_cal'),
       'con DOS equipos: se marca el primero (la bomba principal)');
    ok(Object.values(rDos.asignacion).every(v => v.length === 0),
       'con DOS equipos NINGUN suelto viene asignado: de cual es cada uno lo dice una persona');
}

titulo('3. Un pack POR EQUIPO — la ficha de ACS nunca entra en la de calefacción');
{
    const d = destinosConsolidacion(LISTA, PREFS, DOS);
    const g = construirGrupos(LISTA, PREFS, d, {
        marcados: new Set(['aerotermia_cal']),
        asignacion: { d_eprel: ['aerotermia_cal'], d_label: ['aerotermia_cal'] },
    });
    ok(g.length === 1, 'solo se arma el pack del equipo marcado');
    ok(!g[0].piezas.some(p => p.driveId === 'd_acs'),
       'la ficha del equipo de ACS NO entra en el pack de calefaccion');
    ok(g[0].piezas.map(p => p.driveId).join() === 'd_cal,d_eprel,d_label',
       'el ORDEN es el del gestor, que es con el que van dentro del certificado');
    ok(g[0].paginas === 5, 'la ficha del modelo quedara en 5 pags (2 recortadas + 2 + 1)');
    ok(payloadGrupos(g)[0].piezas[0].excludedPages.join() === '1',
       'el RECORTE de la ficha viaja en el payload: el catalogo guarda la version buena');
}

titulo('4. Los DOS equipos a la vez, cada uno con lo suyo');
{
    const d = destinosConsolidacion(LISTA, PREFS, DOS);
    const g = construirGrupos(LISTA, PREFS, d, {
        marcados: new Set(['aerotermia_cal', 'aerotermia_acs']),
        asignacion: { d_eprel: ['aerotermia_cal'], d_label: ['aerotermia_cal', 'aerotermia_acs'] },
    });
    ok(g.length === 2, 'se arman DOS packs');
    const cal = g.find(x => x.destino.id === 'aerotermia_cal');
    const acs = g.find(x => x.destino.id === 'aerotermia_acs');
    ok(cal.piezas.map(p => p.driveId).join() === 'd_cal,d_eprel,d_label', 'calefaccion: su ficha + los dos sueltos');
    ok(acs.piezas.map(p => p.driveId).join() === 'd_label,d_acs', 'ACS: su ficha y SOLO la etiqueta compartida');
    ok(!acs.piezas.some(p => p.driveId === 'd_cal'), 'la ficha de calefaccion no entra en la de ACS');
    ok(etiquetaCorta(acs.destino) === 'ACS' && etiquetaCorta(cal.destino) === 'calefacción',
       'cada hueco se nombra por su servicio');
}

titulo('5. Lo que no cambia nada, no se guarda');
{
    const d = destinosConsolidacion(LISTA, SIN_PREFS, DOS);
    const solo = construirGrupos(LISTA, SIN_PREFS, d, { marcados: new Set(['aerotermia_acs']), asignacion: {} });
    ok(motivoBloqueo(solo) !== null, 'un pack de UNA pieza SIN recorte se bloquea: la ficha quedaria igual');
    ok(motivoBloqueo([]) !== null, 'sin ningun equipo marcado, tampoco');

    const dR = destinosConsolidacion(LISTA, PREFS, DOS);
    const recortada = construirGrupos(LISTA, PREFS, dR, { marcados: new Set(['aerotermia_cal']), asignacion: {} });
    ok(motivoBloqueo(recortada) === null,
       'una sola pieza CON recorte si vale: es el caso de "he quitado una pagina y quiero guardarlo"');
}

titulo('6. Lo que sale del PDF unido es lo que se ha marcado');
{
    const unido = await unirAnexos([
        { buffer: await pdfDe(3), excludedPages: [1] },
        { buffer: await pdfDe(2), excludedPages: [] },
        { buffer: await pdfDe(1), excludedPages: [] },
    ]);
    ok(await paginasDe(unido) === 5, 'el recorte se aplica al unir: 2 + 2 + 1 = 5, sin hoja de arranque');

    const soloRecorte = await unirAnexos([{ buffer: await pdfDe(3), excludedPages: [1] }]);
    ok(await paginasDe(soloRecorte) === 2, 'una sola ficha recortada da sus 2 paginas buenas');
}

titulo('7. Las salvaguardas: al catálogo no puede llegar cualquier cosa');
{
    let consolidarFicha = null;
    try {
        const m = await import(pathToFileURL(path.join(aquí, '../services/fichaConsolidada.js')).href);
        consolidarFicha = (m.default || m).consolidarFicha;
    } catch (e) {
        console.log(`  · sin entorno de backend (${e.message.split('\n')[0]}) — apartado omitido`);
    }

    if (consolidarFicha) {
        const exp = {
            id: 'exp-1', oportunidad_id: 'op-1', numero_expediente: '25RES060_79',
            instalacion: { aerotermia_cal: { aerotermia_db_id: 42, marca: 'MITSUBISHI', modelo: 'ECODAN' } },
            documentacion: {
                ft_aerotermia_cal_id: 'd_cal',
                cifo_extra_annexes: [{ driveId: 'd_eprel', fileName: 'FICHE_673327_ES (1).pdf' }],
            },
        };
        const pide = (grupos) => consolidarFicha(exp, { grupos });

        ok((await pide([])).error === 'sin_grupos', 'sin grupos no hay nada que hacer');
        ok((await pide([{ type: 'cal', piezas: [{ driveId: 'd_cal' }] }])).error === 'pocas_piezas',
           'una sola pieza sin recorte no cambia nada');
        ok((await pide([{ type: 'cal', piezas: [{ driveId: 'd_cal' }, { driveId: 'd_cal' }] }])).error === 'pieza_repetida',
           'el mismo PDF dos veces se rechaza: seria el EPREL duplicado en todos los expedientes');
        ok((await pide([{ type: 'cal', piezas: [{ driveId: 'd_cal' }, { driveId: 'de_otro' }] }])).error === 'pieza_ajena',
           'un driveId que no es de este expediente se rechaza (el navegador no manda que copiar)');
        ok((await pide([{ type: 'chorizo', piezas: [{ driveId: 'd_cal' }, { driveId: 'd_eprel' }] }])).error === 'bad_type',
           'un hueco inventado se rechaza');
        ok((await pide([{ type: 'acs', piezas: [{ driveId: 'd_cal' }, { driveId: 'd_eprel' }] }])).error === 'slot_no_aplica',
           'un hueco que este expediente no pide se rechaza');
        ok((await pide([
                { type: 'cal', piezas: [{ driveId: 'd_cal' }, { driveId: 'd_eprel' }] },
                { type: 'cal', piezas: [{ driveId: 'd_cal' }, { driveId: 'd_eprel' }] },
           ])).error === 'grupo_repetido',
           'el mismo equipo dos veces se rechaza ANTES de escribir nada');
    }
}

titulo('8. Qué trae dentro la ficha, dicho en una línea');
{
    ok(resumenPartes({ paginas: 5, piezas: [{}, {}, {}] }) === 'Conjunto de 3 documentos · 5 págs',
       'el badge del gestor lo dice sin abrir el PDF');
    ok(resumenPartes({ paginas: 2, piezas: [{ recortadas: 1 }] }) === 'Ficha recortada · 2 págs',
       'una ficha guardada recortada tambien se anuncia: explica que tenga menos paginas');
    ok(resumenPartes(null) === null && resumenPartes({ piezas: [{}] }) === null,
       'una ficha suelta y entera no afirma nada');
}

console.log(fallos === 0 ? '\n✅ TODO CORRECTO' : `\n❌ ${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);
