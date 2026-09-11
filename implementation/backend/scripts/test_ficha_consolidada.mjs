// ============================================================================
// test_ficha_consolidada.mjs — la ficha del catálogo cuando son VARIOS papeles.
// ----------------------------------------------------------------------------
//   node implementation/backend/scripts/test_ficha_consolidada.mjs
//
// No toca BD, ni Drive, ni el catálogo: comprueba las dos mitades que sí pueden
// romperse en silencio —qué se propone marcar y qué sale del PDF unido— y las
// salvaguardas que impiden guardar en el catálogo algo que no es de este
// expediente. Lo que se guarda ahí se adjunta a TODOS los expedientes que lleven
// ese modelo, así que un fallo aquí no se queda en un expediente.
// ============================================================================

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PDFDocument } from 'pdf-lib';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const front = (rel) => pathToFileURL(path.join(aquí, '../../frontend/src/features/expedientes', rel)).href;

const { destinosConsolidacion, puedeConsolidar, piezasParaConsolidar,
        paginasDelConjunto, resumenPartes } = await import(front('logic/fichaConsolidable.js'));
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

// ── Un expediente de pantalla: la ficha del modelo + el EPREL y la etiqueta ──
const anexo = (id, driveId, label, paginas, extra = false) => ({
    id, label, isExtra: extra,
    file: { driveId, name: `${label}.pdf`, previewPages: Array(paginas).fill('img') },
});

const UN_MODELO = [
    anexo('aerotermia_cal', 'd_ficha', 'Ficha técnica aerotermia calefacción y ACS', 2),
    anexo('extra_d_label', 'd_label', 'LABEL_673322.pdf', 1, true),
    anexo('extra_d_eprel', 'd_eprel', 'FICHE_673322_ES.pdf', 2, true),
];
const SLOT_CAL = { id: 'aerotermia_cal', type: 'cal', label: 'Ficha técnica aerotermia calefacción y ACS', modelId: 42, modeloLabel: 'ECODAN 14' };
const SLOT_ACS = { id: 'aerotermia_acs', type: 'acs', label: 'Ficha técnica aerotermia ACS', modelId: 77, modeloLabel: 'NUOS 200' };
const SIN_PREFS = { order: [], excluded: {} };

titulo('1. A quién se le puede guardar el conjunto');
{
    const d = destinosConsolidacion(UN_MODELO, [SLOT_CAL]);
    ok(d.length === 1 && d[0].tieneFichero, 'el hueco con modelo del catálogo y ficha cargada es destino');

    const sinModelo = destinosConsolidacion(UN_MODELO, [{ ...SLOT_CAL, modelId: null }]);
    ok(sinModelo.length === 0, 'un equipo tecleado a mano NO es destino: no hay a quién guardárselo');

    ok(puedeConsolidar(UN_MODELO, [SLOT_CAL]), 'con ficha + PDFs sueltos se ofrece el botón');
    ok(!puedeConsolidar([UN_MODELO[0]], [SLOT_CAL]), 'sin ningún PDF suelto NO se ofrece: no hay nada que unir');
}

titulo('2. Qué se propone marcar');
{
    const p = piezasParaConsolidar(UN_MODELO, SIN_PREFS, { destinoId: 'aerotermia_cal', destinos: [SLOT_CAL] });
    ok(p.length === 3, 'entran la ficha del hueco y los dos sueltos');
    ok(p[0].id === 'aerotermia_cal' && p[1].driveId === 'd_label' && p[2].driveId === 'd_eprel',
       'el ORDEN es el del gestor, que es con el que van dentro del certificado');
    ok(p[0].fija && p[0].porDefecto, 'la ficha que se sustituye va marcada y no se puede desmarcar');
    ok(p.every(x => x.porDefecto), 'con UN solo modelo, todo viene marcado');
    ok(paginasDelConjunto(p, new Set(p.map(x => x.driveId))) === 5, 'suma de páginas: 2 + 1 + 2 = 5');

    // La regla que evita el peor fallo posible.
    const varios = [...UN_MODELO, anexo('aerotermia_acs', 'd_acs', 'Ficha técnica aerotermia ACS', 3)];
    const pv = piezasParaConsolidar(varios, SIN_PREFS, { destinoId: 'aerotermia_cal', destinos: [SLOT_CAL, SLOT_ACS] });
    ok(pv.find(x => x.esDestino).porDefecto === true, 'con varios modelos el destino sigue marcado');
    ok(pv.filter(x => !x.esDestino).every(x => !x.porDefecto),
       'con VARIOS modelos los sueltos NO vienen marcados: la app no sabe de cuál es cada uno');
    ok(!pv.some(x => x.id === 'aerotermia_acs'),
       'la ficha del OTRO modelo no se ofrece como pieza: sería meterla dentro de ésta');
}

titulo('3. El recorte de páginas viaja con la pieza');
{
    const prefs = { order: [], excluded: { d_eprel: [1] } };
    const p = piezasParaConsolidar(UN_MODELO, prefs, { destinoId: 'aerotermia_cal', destinos: [SLOT_CAL] });
    const eprel = p.find(x => x.driveId === 'd_eprel');
    ok(eprel.excluidas.length === 1 && eprel.paginas === 1, 'la pieza recortada cuenta 1 página, no 2');
    ok(paginasDelConjunto(p, new Set(p.map(x => x.driveId))) === 4, 'el conjunto queda en 4 páginas');
}

titulo('4. Lo que sale del PDF unido es lo que se ha marcado');
{
    const unido = await unirAnexos([
        { buffer: await pdfDe(2), excludedPages: [] },
        { buffer: await pdfDe(1), excludedPages: [] },
        { buffer: await pdfDe(2), excludedPages: [] },
    ]);
    ok(await paginasDe(unido) === 5, 'sin recortes: 5 páginas (y ninguna hoja en blanco de arranque)');

    const recortado = await unirAnexos([
        { buffer: await pdfDe(2), excludedPages: [] },
        { buffer: await pdfDe(1), excludedPages: [] },
        { buffer: await pdfDe(2), excludedPages: [1] },
    ]);
    ok(await paginasDe(recortado) === 4, 'con el recorte aplicado: 4 — el mismo que anuncia la pantalla');
}

titulo('5. Las salvaguardas: al catálogo no puede llegar cualquier cosa');
{
    let consolidarFicha;
    try {
        ({ consolidarFicha } = (await import(pathToFileURL(path.join(aquí, '../services/fichaConsolidada.js')).href))
            .default ?? await import(pathToFileURL(path.join(aquí, '../services/fichaConsolidada.js')).href));
    } catch (e) {
        console.log(`  · sin entorno de backend (${e.message.split('\n')[0]}) — apartado omitido`);
        consolidarFicha = null;
    }

    if (consolidarFicha) {
        const exp = {
            id: 'exp-1', oportunidad_id: 'op-1', numero_expediente: '26RES060_1',
            instalacion: { aerotermia_cal: { aerotermia_db_id: 42, marca: 'MITSUBISHI', modelo: 'ECODAN' } },
            documentacion: {
                ft_aerotermia_cal_id: 'd_ficha',
                cifo_extra_annexes: [{ driveId: 'd_eprel', fileName: 'FICHE_673322_ES.pdf' }],
            },
        };
        const pide = (piezas, type = 'cal') => consolidarFicha(exp, { type, piezas });

        ok((await pide([{ driveId: 'd_ficha' }])).error === 'pocas_piezas',
           'una sola pieza no es un conjunto');
        ok((await pide([{ driveId: 'd_ficha' }, { driveId: 'd_ficha' }])).error === 'pieza_repetida',
           'el mismo PDF dos veces se rechaza: sería el EPREL duplicado en todos los expedientes');
        ok((await pide([{ driveId: 'd_ficha' }, { driveId: 'de_otro_expediente' }])).error === 'pieza_ajena',
           'un driveId que no es de este expediente se rechaza (el navegador no manda qué copiar)');
        ok((await pide([{ driveId: 'd_ficha' }, { driveId: 'd_eprel' }], 'chorizo')).error === 'bad_type',
           'un hueco inventado se rechaza');
        ok((await pide([{ driveId: 'd_ficha' }, { driveId: 'd_eprel' }], 'acs')).error === 'slot_no_aplica',
           'un hueco que este expediente no pide se rechaza');
    }
}

titulo('6. Qué trae dentro la ficha, dicho en una línea');
{
    ok(resumenPartes({ paginas: 5, piezas: [{}, {}, {}] }) === 'Conjunto de 3 documentos · 5 págs',
       'el badge del gestor lo dice sin abrir el PDF');
    ok(resumenPartes(null) === null && resumenPartes({ piezas: [{}] }) === null,
       'una ficha suelta no afirma nada');
}

console.log(fallos === 0 ? '\n✅ TODO CORRECTO' : `\n❌ ${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);
