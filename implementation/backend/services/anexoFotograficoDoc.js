/**
 * ⚠️ ESPEJO del diseño del ANEXO FOTOGRÁFICO.
 * FUENTE HERMANA: implementation/frontend/src/features/expedientes/components/anexoFotograficoDoc.js
 *
 * Si tocas el DISEÑO (CSS/builders), actualiza AMBOS ficheros: el frontend lo usa
 * para el preview/PDF interactivo del modal (ESM) y este backend para la generación
 * AUTOMÁTICA server-side (CommonJS, endpoint + skill de Cowork). El layout debe salir
 * idéntico por los dos caminos.
 *
 * Generador del ANEXO FOTOGRÁFICO (Reportaje fotográfico de las actuaciones).
 *
 * Módulo JS PURO (sin React ni imports) para que el mismo builder sirva tanto
 * al modal del frontend (preview + PDF vía /api/pdf/*) como a un posible
 * consumo server-side por dynamic import() desde el backend.
 *
 * Diseño: handoff de Claude Design "Mejora de anexo fotográfico" (2026-07).
 * A4, tipografías Space Grotesk + Manrope (Google Fonts, con fallback Arial),
 * gradiente de marca #F39200 → #F4B81C → #A6CE39.
 *
 * Estructura del documento:
 *   1. Portada: banda degradada, logo, título, identificación de la actuación
 *      (CCAA, ref. catastral, dirección, UTM), índice de actuaciones y caja
 *      de firma del cliente (el flujo de firma sube el PDF ya firmado, no se
 *      estampa por coordenadas).
 *   2. Por cada ACTUACIÓN (aerotermia, ventanas, cubierta…): páginas de fase
 *      ANTES y DESPUÉS. La primera página de cada actuación lleva la cabecera
 *      grande (número + título + descripción); el resto, la banda de fase con
 *      la etiqueta "ACT. NN". Rejilla de 2 columnas hasta 4 fotos por página
 *      y de 3 columnas (máx. 9) a partir de 5.
 */

// ── Mapa slot → actuación ────────────────────────────────────────────────────
// Las claves son los slots canónicos de buildDocChecklist (backend). Un slot
// no listado (o una fila custom_ añadida a mano) cae en "Otras fotografías".
const ANEXO_ACTUACIONES = [
    {
        id: 'aerotermia',
        titulo: 'Sustitución de caldera por aerotermia',
        desc: 'Retirada del sistema de calefacción existente e instalación de un sistema de aerotermia de alta eficiencia energética.',
        bandAntes: 'Antes · Situación inicial',
        bandDespues: 'Después · Actuación ejecutada',
        antes: ['FOTO_CALDERA_ANTES', 'FOTO_PLACA_CALDERA_ANTES', 'FOTO_ACS_ANTES'],
        despues: ['FOTO_UNIDAD_EXTERIOR', 'FOTO_UNIDAD_EXTERIOR_PLACA', 'FOTO_UNIDAD_INTERIOR', 'FOTO_UNIDAD_INTERIOR_PLACA', 'FOTO_ACS_DEPOSITO', 'FOTO_CALDERA_DESMONTADA'],
    },
    {
        id: 'ventanas',
        titulo: 'Sustitución de ventanas',
        desc: 'Retirada de la carpintería exterior existente e instalación de ventanas nuevas de altas prestaciones térmicas.',
        bandAntes: 'Antes · Ventanas a sustituir',
        bandDespues: 'Después · Ventanas nuevas',
        antes: ['FOTO_VENTANAS_ANTES'],
        despues: ['FOTO_VENTANAS_DESPUES'],
    },
    {
        id: 'cubierta',
        titulo: 'Aislamiento de cubierta',
        desc: 'Mejora del aislamiento térmico de la cubierta o tejado del edificio.',
        bandAntes: 'Antes · Cubierta existente',
        bandDespues: 'Después · Cubierta terminada',
        antes: ['FOTO_CUBIERTA_ANTES'],
        despues: ['FOTO_CUBIERTA_DESPUES'],
    },
    {
        id: 'fachada',
        titulo: 'Aislamiento de fachada',
        desc: 'Mejora del aislamiento térmico de la envolvente mediante actuación en fachada.',
        bandAntes: 'Antes · Fachada a aislar',
        bandDespues: 'Después · Fachada terminada',
        antes: ['FOTO_FACHADA_ANTES'],
        despues: ['FOTO_FACHADA_DESPUES'],
    },
    {
        id: 'suelo',
        titulo: 'Aislamiento de suelo',
        desc: 'Mejora del aislamiento térmico del suelo de la vivienda.',
        bandAntes: 'Antes · Situación inicial',
        bandDespues: 'Después · Actuación ejecutada',
        antes: ['FOTO_SUELO_ANTES'],
        despues: ['FOTO_SUELO_DESPUES'],
    },
    {
        id: 'placas',
        titulo: 'Instalación de placas solares',
        desc: 'Instalación de paneles solares para la generación de energía.',
        bandAntes: 'Antes · Situación inicial',
        bandDespues: 'Después · Instalación ejecutada',
        antes: [],
        despues: ['FOTO_PLACAS_SOLARES'],
    },
];

const OTROS_ACTUACION = {
    id: 'otros',
    titulo: 'Otras fotografías de la actuación',
    desc: 'Documentación fotográfica adicional de la actuación realizada.',
    bandAntes: 'Antes · Situación inicial',
    bandDespues: 'Documentación adicional',
    antes: [],
    despues: [],
};

const ALL_SLOTS = ANEXO_ACTUACIONES.flatMap(a => [...a.antes, ...a.despues]);

// Deducción del slot canónico desde el id de fila `drive_FOTO_XXX[_N].ext`
// (filas guardadas antes de que la carga dinámica anotara slotKey/fase).
function slotFromRowId(rowId) {
    const base = String(rowId || '').replace(/^drive_/, '').replace(/\.[^.]+$/, '');
    let best = null;
    for (const slot of ALL_SLOTS) {
        if (base === slot || new RegExp(`^${slot}_\\d+$`).test(base)) {
            if (!best || slot.length > best.length) best = slot;
        }
    }
    return best;
}

function resolveActuacionId(row) {
    const slot = row.slotKey || slotFromRowId(row.id);
    if (slot) {
        for (const a of ANEXO_ACTUACIONES) {
            if (a.antes.includes(slot) || a.despues.includes(slot)) return { actId: a.id, slot };
        }
    }
    return { actId: 'otros', slot };
}

function resolveFase(row, slot) {
    if (row.fase === 'ANTES' || row.fase === 'DESPUES') return row.fase;
    if (slot) {
        for (const a of ANEXO_ACTUACIONES) {
            if (a.antes.includes(slot)) return 'ANTES';
            if (a.despues.includes(slot)) return 'DESPUES';
        }
        if (/_ANTES(_|$)/.test(slot)) return 'ANTES';
    }
    return 'DESPUES';
}

/**
 * Agrupa las filas del modal (solo las que tienen foto) en actuaciones
 * ordenadas: [{ num:'01', titulo, desc, bandAntes, bandDespues,
 *               fases:{ ANTES:[rows], DESPUES:[rows] } }]
 */
function groupRowsIntoActuaciones(rows) {
    const withFile = (rows || []).filter(r => r && r.file);
    const buckets = new Map(); // actId -> { ANTES: [], DESPUES: [] }
    for (const row of withFile) {
        const { actId, slot } = resolveActuacionId(row);
        const fase = resolveFase(row, slot);
        if (!buckets.has(actId)) buckets.set(actId, { ANTES: [], DESPUES: [] });
        buckets.get(actId)[fase].push(row);
    }
    const ordered = [...ANEXO_ACTUACIONES, OTROS_ACTUACION].filter(a => buckets.has(a.id));
    return ordered.map((a, i) => ({
        ...a,
        num: String(i + 1).padStart(2, '0'),
        fases: buckets.get(a.id),
    }));
}

// ── Helpers de render ────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const GRAD = 'linear-gradient(100deg,#F39200 0%,#F4B81C 50%,#A6CE39 100%)';
const GRAD135 = 'linear-gradient(135deg,#F39200,#A6CE39)';

// CSS común del documento (portada + páginas). El texto en degradado lleva
// color sólido de respaldo por si el motor de impresión no soporta
// background-clip:text.
const ANEXO_BASE_CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
    .doc-page {
        font-family: 'Manrope', Arial, Helvetica, sans-serif;
        color: #15160E;
        background: #fff;
        width: 210mm;
        height: 296mm;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
    }
    .doc-page * { box-sizing: border-box; }
    .doc-page img { display: block; }
    .af-grotesk { font-family: 'Space Grotesk', 'Manrope', Arial, sans-serif; }
    .af-grad-text {
        color: #F39200;
        background: ${GRAD135};
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    /* ── Portada ── */
    .af-cover-ring { position: absolute; left: -66mm; bottom: -66mm; width: 150mm; height: 150mm; border-radius: 50%; border: 22mm solid #F4F4EE; z-index: 0; }
    .af-cover-band { height: 13mm; background: ${GRAD}; position: relative; z-index: 2; width: 100%; }
    .af-cover-body { position: relative; flex: 1; display: flex; flex-direction: column; padding: 14mm 20mm 11mm; z-index: 1; }
    .af-cover-head { display: flex; align-items: center; justify-content: space-between; }
    .af-cover-head img { height: 9mm; object-fit: contain; }
    .af-cover-head-r { text-align: right; }
    .af-cover-head-r .t1 { font-family: 'Space Grotesk', sans-serif; font-size: 10.5px; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #15160E; }
    .af-cover-head-r .t2 { font-size: 10px; color: #9A9C90; letter-spacing: 0.05em; margin-top: 1.6mm; }
    .af-cover-title { margin-top: 13mm; }
    .af-cover-kicker { display: flex; align-items: center; gap: 4mm; margin-bottom: 6mm; }
    .af-cover-kicker .bar { width: 15mm; height: 3px; background: linear-gradient(100deg,#F39200,#A6CE39); }
    .af-cover-kicker .txt { font-weight: 700; letter-spacing: 0.2em; font-size: 11px; text-transform: uppercase; color: #8A8C80; }
    .af-cover-title h1 { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 46px; line-height: 1.02; letter-spacing: -0.025em; margin: 0; max-width: 168mm; }
    .af-sec-head { display: flex; align-items: center; gap: 5mm; margin-bottom: 4mm; }
    .af-sec-head .chip { width: 5mm; height: 5mm; border-radius: 1.4mm; background: ${GRAD135}; }
    .af-sec-head h2 { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; margin: 0; color: #15160E; }
    .af-ident { margin-top: 10mm; }
    .af-ident-card { display: flex; border-radius: 3mm; overflow: hidden; background: #F6F6F1; }
    .af-ident-card .edge { width: 4px; background: linear-gradient(#F39200,#A6CE39); }
    .af-ident-grid { flex: 1; padding: 5.5mm 9mm; display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 12mm; }
    .af-ident-grid .lbl { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #8A8C80; font-weight: 600; margin-bottom: 2mm; }
    .af-ident-grid .val { font-size: 14px; font-weight: 600; }
    .af-ident-grid .val.mono { font-family: 'Space Grotesk', sans-serif; }
    .af-index { margin-top: 9mm; }
    .af-index-title { font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase; color: #8A8C80; font-weight: 700; margin-bottom: 2mm; }
    .af-index-row { display: flex; align-items: center; gap: 7mm; padding: 3.2mm 0; border-top: 1.5px solid #E6E6DF; }
    .af-index-row:last-child { border-bottom: 1.5px solid #E6E6DF; }
    .af-index-num { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 26px; line-height: 1; min-width: 15mm; }
    .af-index-name { flex: 1; font-size: 15px; font-weight: 600; }
    .af-index-fases { font-family: 'Space Grotesk', sans-serif; font-size: 10px; color: #9A9C90; font-weight: 600; letter-spacing: 0.1em; }
    .af-firma { margin-top: auto; }
    .af-firma-box { border: 1.5px dashed #D9D9CF; border-radius: 3mm; padding: 6mm 9mm; display: flex; gap: 12mm; height: 40mm; }
    .af-firma-box .lbl { font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #8A8C80; font-weight: 700; }
    .af-firma-box .val { font-size: 12px; font-weight: 600; margin-top: 1.6mm; }
    .af-cover-footer { margin-top: 6mm; padding-top: 4mm; display: flex; align-items: flex-end; justify-content: space-between; border-top: 1px solid #EDEDE6; }
    .af-cover-footer span { font-size: 10px; color: #A0A296; letter-spacing: 0.08em; }

    /* ── Páginas de fotos ── */
    .af-page { padding: 15mm 15mm 20mm; }
    .af-act-header { display: flex; align-items: flex-start; gap: 9mm; margin-bottom: 8mm; }
    .af-act-num { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 64px; line-height: 0.8; }
    .af-act-header .meta { padding-top: 2mm; }
    .af-act-header .kicker { font-size: 10.5px; letter-spacing: 0.24em; text-transform: uppercase; color: #8A8C80; font-weight: 700; margin-bottom: 2mm; }
    .af-act-header h2 { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 24px; line-height: 1.1; margin: 0 0 2mm; letter-spacing: -0.01em; }
    .af-act-header p { margin: 0; font-size: 13px; color: #6B6E63; max-width: 150mm; line-height: 1.45; }
    .af-band { display: flex; align-items: center; gap: 5mm; margin-bottom: 6mm; }
    .af-band-pill { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; padding: 2.4mm 5mm; border-radius: 20mm; white-space: nowrap; }
    .af-band-pill.antes { color: #55574C; background: #ECECE4; }
    .af-band-pill.despues { color: #15160E; background: ${GRAD}; font-weight: 700; }
    .af-band-line { flex: 1; height: 1.5px; }
    .af-band-line.antes { background: #ECECE4; }
    .af-band-line.despues { background: linear-gradient(100deg,#F39200,#A6CE39); }
    .af-band-act { font-family: 'Space Grotesk', sans-serif; font-size: 11px; font-weight: 600; color: #8A8C80; letter-spacing: 0.1em; white-space: nowrap; }
    /* Comentario explicativo de un concepto. Solo se pinta si el usuario lo
       escribió: sin texto no hay caja (nada de recuadros vacíos en el PDF). */
    .af-comment { margin: -2mm 0 6mm; padding: 3.5mm 4.5mm; border-left: 2px solid #F39200; background: #FAFAF7; border-radius: 0 2mm 2mm 0; page-break-inside: avoid; }
    .af-comment + .af-comment { margin-top: -4mm; }
    .af-comment .lbl { font-family: 'Space Grotesk', sans-serif; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #A08A5A; display: block; margin-bottom: 1.2mm; }
    .af-comment p { font-family: 'Manrope', sans-serif; font-size: 11px; line-height: 1.5; color: #3A3C34; margin: 0; white-space: pre-wrap; }
    .af-grid { flex: 1; display: grid; grid-auto-rows: 1fr; min-height: 0; }
    .af-grid.cols-2 { grid-template-columns: 1fr 1fr; gap: 7mm; }
    .af-grid.cols-3 { grid-template-columns: 1fr 1fr 1fr; gap: 6mm; }
    .af-ph { margin: 0; display: flex; flex-direction: column; min-height: 0; position: relative; }
    .af-ph-wrap { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: #F4F4EF; border: 1px solid #E6E6DF; border-radius: 3mm; overflow: hidden; position: relative; }
    .cols-3 .af-ph-wrap { border-radius: 2.5mm; }
    .af-ph-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .af-ph figcaption { display: flex; align-items: center; gap: 3mm; margin-top: 3mm; }
    .cols-3 .af-ph figcaption { gap: 2.5mm; margin-top: 2.5mm; }
    .af-ph-num { font-family: 'Space Grotesk', sans-serif; font-size: 10px; font-weight: 600; color: #15160E; background: ${GRAD135}; padding: 1.2mm 3mm; border-radius: 1.5mm; }
    .cols-3 .af-ph-num { font-size: 9px; padding: 1mm 2.4mm; border-radius: 1.4mm; }
    .af-ph-label { font-size: 12px; font-weight: 600; }
    .cols-3 .af-ph-label { font-size: 11px; }
    .af-page-footer { position: absolute; left: 15mm; right: 15mm; bottom: 9mm; display: flex; align-items: center; justify-content: space-between; padding-top: 4mm; border-top: 1px solid #EDEDE6; }
    .af-page-footer .l { font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: #A0A296; font-weight: 600; }
    .af-page-footer .r { font-size: 9.5px; color: #A0A296; font-weight: 600; }
    .af-edit-badge { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; }
`;

// CSS de pantalla (preview dentro del modal): separación y sombra entre páginas.
const ANEXO_SCREEN_CSS = `
    ${ANEXO_BASE_CSS}
    .doc-wrap { background: #e8e8e8; width: 210mm; }
    .doc-wrap .doc-page { margin-bottom: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.18); }
`;

// CSS de impresión (PDF por Puppeteer).
const ANEXO_PRINT_CSS = `
    ${ANEXO_BASE_CSS}
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-page { page-break-after: always; }
    .doc-page:last-child { page-break-after: avoid; }
`;

// ── Builders ────────────────────────────────────────────────────────────────

function buildCoverPage(actuaciones, meta) {
    const dash = (v) => (v === null || v === undefined || String(v).trim() === '' ? '—' : v);
    const indexRows = actuaciones.map(a => {
        const fases = [a.fases.ANTES.length ? 'ANTES' : null, a.fases.DESPUES.length ? 'DESPUÉS' : null]
            .filter(Boolean).join(' · ');
        return `
            <div class="af-index-row">
                <div class="af-index-num af-grad-text">${a.num}</div>
                <div class="af-index-name">${esc(a.titulo)}</div>
                <div class="af-index-fases">${fases}</div>
            </div>`;
    }).join('');

    return `
        <div class="doc-page">
            <div class="af-cover-ring"></div>
            <div class="af-cover-band"></div>
            <div class="af-cover-body">
                <div class="af-cover-head">
                    <img src="${meta.logoSrc}" alt="Brokergy" />
                    <div class="af-cover-head-r">
                        <div class="t1">Documentación Técnica</div>
                        <div class="t2">Anexo del expediente${meta.numexpte ? ` ${esc(meta.numexpte)}` : ''}</div>
                    </div>
                </div>
                <div class="af-cover-title">
                    <div class="af-cover-kicker"><div class="bar"></div><div class="txt">Actuación de ahorro de energía</div></div>
                    <h1>Reportaje fotográfico de las actuaciones</h1>
                </div>
                <div class="af-ident">
                    <div class="af-sec-head"><div class="chip"></div><h2>Identificación de la actuación</h2></div>
                    <div class="af-ident-card">
                        <div class="edge"></div>
                        <div class="af-ident-grid">
                            <div><div class="lbl">Comunidad Autónoma</div><div class="val">${esc(dash(meta.ca))}</div></div>
                            <div><div class="lbl">Referencia Catastral</div><div class="val mono">${esc(dash(meta.refCatastral))}</div></div>
                            <div><div class="lbl">Dirección Postal</div><div class="val">${esc(dash(meta.direccion))}</div></div>
                            <div><div class="lbl">Coordenadas UTM</div><div class="val mono">X ${esc(dash(meta.utmX))} · Y ${esc(dash(meta.utmY))}</div></div>
                        </div>
                    </div>
                </div>
                <div class="af-index">
                    <div class="af-index-title">Actuaciones documentadas</div>
                    ${indexRows || '<div class="af-index-row"><div class="af-index-name" style="color:#9A9C90">Sin fotografías cargadas</div></div>'}
                </div>
                <div class="af-firma">
                    <div class="af-sec-head"><div class="chip"></div><h2>Firma del anexo fotográfico</h2></div>
                    <div class="af-firma-box">
                        <div style="flex:1">
                            <div class="lbl">Firmado por</div>
                        </div>
                    </div>
                    <div class="af-cover-footer">
                        <span>Brokergy · www.brokergy.es</span>
                        <span>Documento generado como anexo del expediente</span>
                    </div>
                </div>
            </div>
        </div>`;
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function buildFigure(row, numero, opts) {
    const size = Math.max(30, Math.min(100, (opts.photoSizes && opts.photoSizes[row.id]) || 100));
    const imgStyle = size < 100 ? ` style="max-width:${size}%;max-height:${size}%"` : '';
    const clickable = opts.preview
        ? ` style="cursor:pointer" onclick="window.__editPhoto && window.__editPhoto('${esc(row.id)}')" title="Haz clic para recortar"`
        : '';
    const badge = opts.preview ? '<div class="af-edit-badge">✂ Recortar</div>' : '';
    return `
        <figure class="af-ph"${clickable}>
            <div class="af-ph-wrap"><img src="${row.file.data}"${imgStyle} />${badge}</div>
            <figcaption><span class="af-ph-num">${String(numero).padStart(2, '0')}</span><span class="af-ph-label">${esc(row.label || '')}</span></figcaption>
        </figure>`;
}

/**
 * Comentarios explicativos de los conceptos presentes en una fase.
 * `ctx.opts.comentarios` es { <SLOT>: 'texto' }. Un concepto sin texto no
 * genera nada — el bloque solo existe si alguien escribió algo.
 */
function buildComments(rows, ctx) {
    const comentarios = (ctx.opts && ctx.opts.comentarios) || {};
    const vistos = [];
    for (const r of rows) {
        const slot = r.slotKey || slotFromRowId(r.id);
        if (slot && !vistos.includes(slot)) vistos.push(slot);
    }
    return vistos
        .filter(slot => String(comentarios[slot] || '').trim())
        .map(slot => {
            const etiqueta = (rows.find(r => (r.slotKey || slotFromRowId(r.id)) === slot) || {}).groupLabel
                || (rows.find(r => (r.slotKey || slotFromRowId(r.id)) === slot) || {}).label || '';
            return `<div class="af-comment"><span class="lbl">${esc(etiqueta)}</span><p>${esc(String(comentarios[slot]).trim())}</p></div>`;
        })
        .join('');
}

function buildFasePages(act, fase, rows, ctx) {
    if (!rows.length) return [];
    const cols = rows.length <= 4 ? 2 : 3;
    const perPage = cols === 2 ? 4 : 9;
    const pill = fase === 'ANTES'
        ? `<span class="af-band-pill antes">${esc(act.bandAntes)}</span><div class="af-band-line antes"></div>`
        : `<span class="af-band-pill despues">${esc(act.bandDespues)}</span><div class="af-band-line despues"></div>`;

    let counter = 0;
    let isFirstPageOfFase = true;
    return chunk(rows, perPage).map((pageRows) => {
        const isFirstOfAct = !ctx.actStarted;
        ctx.actStarted = true;
        const header = isFirstOfAct ? `
            <div class="af-act-header">
                <div class="af-act-num af-grad-text">${act.num}</div>
                <div class="meta">
                    <div class="kicker">Actuación</div>
                    <h2>${esc(act.titulo)}</h2>
                    ${act.desc ? `<p>${esc(act.desc)}</p>` : ''}
                </div>
            </div>` : '';
        const actTag = isFirstOfAct ? '' : `<span class="af-band-act">ACT. ${act.num}</span>`;
        // Comentarios de los conceptos de ESTA fase, solo en su primera página
        // (si no, se repetirían en cada página de la misma actuación).
        const comments = isFirstPageOfFase ? buildComments(rows, ctx) : '';
        isFirstPageOfFase = false;
        const figures = pageRows.map(r => buildFigure(r, ++counter, ctx.opts)).join('');
        const footerRight = ctx.firstPhotoPage ? (ctx.meta.refCatastral || ctx.meta.municipioLine || ctx.meta.numexpte) : (ctx.meta.municipioLine || ctx.meta.numexpte);
        ctx.firstPhotoPage = false;
        return `
            <div class="doc-page af-page">
                ${header}
                <div class="af-band">${pill}${actTag}</div>
                ${comments}
                <div class="af-grid cols-${cols}">${figures}</div>
                <div class="af-page-footer">
                    <span class="l">Reportaje fotográfico de las actuaciones</span>
                    <span class="r">${esc(footerRight || '')}</span>
                </div>
            </div>`;
    });
}

/**
 * Construye TODAS las páginas del anexo como HTML (sin <html>/<style>).
 *
 * @param rows  filas del modal [{ id, label, file:{data}, slotKey?, fase? }]
 * @param meta  { ca, direccion, refCatastral, utmX, utmY, municipioLine,
 *                numexpte, logoSrc, clienteNombre, clienteDni }
 * @param opts  { preview?: bool, photoSizes?: {rowId: 30..100},
 *                comentarios?: {SLOT: 'texto explicativo'} }
 */
function buildAnexoPages(rows, meta, opts = {}) {
    const actuaciones = groupRowsIntoActuaciones(rows);
    const pages = [buildCoverPage(actuaciones, meta)];
    const ctx = { meta, opts, firstPhotoPage: true };
    for (const act of actuaciones) {
        ctx.actStarted = false;
        pages.push(...buildFasePages(act, 'ANTES', act.fases.ANTES, ctx));
        pages.push(...buildFasePages(act, 'DESPUES', act.fases.DESPUES, ctx));
    }
    return pages.join('');
}

/** Documento HTML completo listo para /api/pdf/generate. */
function buildAnexoFullHtml(rows, meta, opts = {}) {
    const pages = buildAnexoPages(rows, meta, { ...opts, preview: false });
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${ANEXO_PRINT_CSS}</style></head><body>${pages}</body></html>`;
}

module.exports = {
    ANEXO_ACTUACIONES,
    slotFromRowId,
    groupRowsIntoActuaciones,
    ANEXO_BASE_CSS,
    ANEXO_SCREEN_CSS,
    ANEXO_PRINT_CSS,
    buildAnexoPages,
    buildAnexoFullHtml,
};
