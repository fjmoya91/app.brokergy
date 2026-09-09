/**
 * formularioOficialService — las FICHAS RES060/RES080/RES093/TER100 y el ANEXO I
 * (declaración responsable de subvenciones), rellenados sobre el PDF OFICIAL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLA — no se REPLICA el impreso: se RELLENA el oficial.
 *
 * Hasta ahora estos cinco documentos se REDIBUJABAN en HTML y se rasterizaban con
 * Puppeteer: 1.100 líneas de plantilla que imitaban el modelo del Ministerio hasta
 * los saltos de página y las notas al pie, y que había que volver a medir cada vez
 * que se tocaba una coma (`check_cifo_paginas.mjs` y sus gemelos existen por eso).
 * Con el impreso en formato FORMULARIO, escribir dentro de él es la única forma de
 * que el texto, la tipografía, los márgenes y las notas al pie sean EXACTAMENTE los
 * suyos — porque son los suyos. Y quien lo revisa compara contra el modelo oficial.
 *
 * Es el mismo camino que ya hace `anexoActuacionService` con el anexo del MITECO;
 * este servicio es su hermano para los documentos de la ficha.
 *
 * REGLA — el servicio NO decide QUÉ vale cada campo. Los valores llegan ya
 * formateados desde la fuente única de cada documento (frontend/src/features/
 * expedientes/logic/fichasFormulario.js y anexoIFormulario.js), que son las mismas
 * derivaciones que alimentan el HTML clásico y el CIFO. Aquí solo se escribe.
 *
 * REGLA — un campo que la plantilla no tiene se AVISA, no se traga en silencio.
 * Un nombre mal escrito deja el impreso con un hueco, y un hueco en un documento
 * que se presenta a la Administración cuesta un requerimiento tres semanas después.
 *
 * REGLA — no se APLANA. Igual que el modelo del Ministerio: si hay que corregir un
 * dato a mano antes de firmarlo, se puede.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFSignature, StandardFonts, TextAlignment } = require('pdf-lib');

const DIR = path.join(__dirname, '..', 'plantillas');

// Las plantillas oficiales. La clave es lo que viaja por la API: cualquier otra
// cosa se rechaza (nadie puede pedir que se rellene un fichero arbitrario).
const PLANTILLAS = {
    RES060: { fichero: 'FichaRES060.pdf', titulo: 'Ficha RES060' },
    RES080: { fichero: 'FichaRES080.pdf', titulo: 'Ficha RES080' },
    RES093: { fichero: 'FichaRES093.pdf', titulo: 'Ficha RES093' },
    TER100: { fichero: 'FichaTER100.pdf', titulo: 'Ficha TER100' },
    TER173: { fichero: 'FichaTER173.pdf', titulo: 'Ficha TER173' },
    ANEXO_I: { fichero: 'AnexoIDeclaracionResponsable.pdf', titulo: 'Anexo I · Declaración responsable' },
};

const esPlantillaValida = (p) => Object.prototype.hasOwnProperty.call(PLANTILLAS, String(p || ''));

/**
 * Las casillas de la TABLA DE RESULTADO del cálculo van CENTRADAS. Son columnas
 * estrechas de una sola cifra y el impreso relleno a mano las centra; pegadas al
 * borde izquierdo, la tabla del apartado 4 deja de leerse como una tabla. El resto
 * de campos (fechas, representante, direcciones) se quedan como los deja el
 * impreso, alineados a la izquierda.
 */
const CENTRADOS = {
    RES060: ['Fp', 'DCAL', 'S', 'DACS', 'ri i', 'SCOP', 'SCOPdhw', 'AEtotal', 'Di'],
    RES093: ['Fp', 'DCAL', 'S', 'DACS', 'ri i', 'SCOP', 'SCOPdhw', 'Cb', 'AEtotal', 'Di'],
    RES080: ['FP', 'E F', 'EFf', 'AEtotal', 'Di'],
    TER100: [
        'ni c', 'SCOP c', 'Dc c', 'S c', 'Fp c', 'AEc',
        'FP acs', 'ni acs', 'SCOPdhw acs', 'DACS', 'AEacs',
        'FP cap', 'n cap', 'SCOPpwh cap', 'DCAP', 'AEcap',
        'AEtotal', 'Di',
    ],
    // TER173: mismos tres apartados que la TER100, pero su impreso nombra las
    // casillas repetidas con el sufijo que les pone el formulario ('ni', 'ni-0',
    // 'ni-1'; 'Fp', 'Fp-0', 'FP'). Son los nombres de LA PLANTILLA: no se tocan.
    TER173: [
        'ni', 'SCOP', 'Dc', 'S', 'Fp', 'AEc',
        'ni-0', 'SCOPdhw', 'DACS', 'Fp-0', 'AEacs',
        'FP', 'ni-1', 'SCOPpwh', 'DCAP', 'AEcap',
        'AEtotal', 'Di',
    ],
    ANEXO_I: ['día', 'año'],
};

const rutaPlantilla = (p) => path.join(DIR, PLANTILLAS[p].fichero);

/**
 * La línea del "Fdo.:" del Anexo I NO es un campo del formulario: el impreso deja
 * ahí unos guiones bajos y espera que se escriba encima. Coordenadas medidas con
 * PyMuPDF sobre la propia plantilla (el texto "Fdo." arranca en x=85,07 y su línea
 * base cae en y=349,4 en coordenadas PDF de la página 4).
 *
 * Se escribe el nombre porque sin él el documento no dice QUIÉN firma, y eso es lo
 * primero que mira quien lo recibe.
 */
const FDO_ANEXO_I = { pagina: 4, x: 118, y: 349.4, size: 11 };

// ─── Tipografía ───────────────────────────────────────────────────────────────
// Los impresos declaran /Arial (las fichas) y /Helv (el Anexo I). Helvetica es
// métricamente idéntica a Arial, así que las apariencias se regeneran con ella y
// el resultado es indistinguible del impreso relleno a mano.
//
// Un carácter que Helvetica (WinAnsi) no sabe escribir REVIENTA la generación
// entera con un error que no dice de qué campo viene. Se sanea antes de escribir:
// vale más un guion normal que un documento que no sale.
const SUSTITUCIONES = [
    [/[‐-―]/g, '-'],   // guiones tipográficos (– —)
    [/[‘’‛]/g, "'"],
    [/[“”]/g, '"'],
    [/…/g, '...'],
    [/ /g, ' '],
    [/≤/g, '<='], [/≥/g, '>='],
];

// WinAnsi no es Latin-1: en el hueco 0x80-0x9F mete 27 caracteres que SÍ se pueden
// escribir y que están fuera de \x00-\xFF. El primero es el EURO, y sin esta lista
// la cuantía de una subvención salía impresa como "18.800,00 ?".
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ'
    + '‘’“”•–—˜™š›œžŸ';

function sanear(v) {
    let s = String(v ?? '');
    for (const [re, rep] of SUSTITUCIONES) s = s.replace(re, rep);
    // Lo que siga sin poder escribirse (griegas, subíndices…) se cae aquí. No debería
    // llegar nada: los valores son cifras, fechas y nombres.
    return Array.from(s)
        .map(c => (c === '\n' || c <= '\xFF' || WINANSI_EXTRA.includes(c)) ? c : '?')
        .join('');
}

// ─── Desplegables ─────────────────────────────────────────────────────────────
// El único de estos impresos es la comunidad autónoma del Anexo I, y la BD no la
// escribe como el Ministerio: guardamos "Comunidad Valenciana", "Baleares",
// "Navarra" o "CASTILLA-LA MANCHA" y el desplegable dice "Comunitat Valenciana",
// "Illes Balears", "Comunidad Foral de Navarra"… Una CCAA que no case deja el
// impreso sin ella, que es el campo por el que el Gestor Autonómico lo reparte.
const norm = (v) => String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const ALIAS_OPCION = {
    'comunidad valenciana': 'Comunitat Valenciana',
    'c valenciana': 'Comunitat Valenciana',
    'valencia': 'Comunitat Valenciana',
    'baleares': 'Illes Balears',
    'islas baleares': 'Illes Balears',
    'navarra': 'Comunidad Foral de Navarra',
    'asturias': 'Principado de Asturias',
    'ceuta': 'Ciudad de Ceuta',
    'melilla': 'Ciudad de Melilla',
    'madrid': 'Comunidad de Madrid',
    'murcia': 'Región de Murcia',
    'euskadi': 'País Vasco',
};

/** La opción del desplegable que corresponde a `valor`, o '' si ninguna. */
function resolverOpcion(valor, opciones) {
    const n = norm(valor);
    if (!n) return '';
    const exacta = opciones.find(o => norm(o) === n);
    if (exacta) return exacta;
    const alias = ALIAS_OPCION[n];
    if (alias && opciones.includes(alias)) return alias;
    // Último recurso: que una contenga a la otra ("Castilla La Mancha" ⊂
    // "Castilla-La Mancha"). Nunca una coincidencia parcial de palabra suelta.
    return opciones.find(o => norm(o).startsWith(n) || n.startsWith(norm(o))) || '';
}

// ─── Tamaño de letra ──────────────────────────────────────────────────────────
/**
 * El tamaño que declara el propio campo en su /DA (`/Helv 14 Tf`). Un 0 significa
 * "ajústalo tú", que es lo que declara la mayoría. Si el /DA no se puede leer se
 * devuelve null y se calcula: nunca se cae a un tamaño fijo inventado — un campo
 * escrito a 12pt donde caben 8 se sale de la casilla sin que nadie lo note hasta
 * abrir el PDF.
 */
const tamanoDeDA = (da) => {
    const m = String(da || '').match(/\/[^\s]+\s+([\d.]+)\s+Tf/);
    const n = m ? parseFloat(m[1]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
};

function tamanoDeclarado(field) {
    try {
        // El tamaño puede vivir en el campo o en cada casilla; manda la casilla, que
        // es lo que mira pdf-lib al pintar.
        const widgets = field.acroField.getWidgets();
        for (const w of widgets) {
            const t = tamanoDeDA(w.getDefaultAppearance?.());
            if (t) return t;
        }
        return tamanoDeDA(field.acroField.getDefaultAppearance());
    } catch { return null; }
}

/**
 * Fija el tamaño de letra DE VERDAD.
 *
 * `field.setFontSize()` solo toca el /DA del CAMPO, y pdf-lib pinta con el de la
 * CASILLA si lo tiene (`widgetFontSize ?? fieldFontSize` en su appearances.js).
 * Estos impresos lo traen en la casilla y con valor 0 —"ajústalo tú"—, así que sin
 * esto el tamaño calculado se ignoraba y pintaba el suyo: en la tabla del total de
 * la ficha TER100 salían tres cifras a 16pt junto a otras dos a 12, en un documento
 * cuyo cuerpo es de 12.
 */
function fijarTamano(field, size) {
    if (!size) return;
    try { field.setFontSize(size); } catch { /* el campo se queda con el suyo */ }
    for (const w of field.acroField.getWidgets()) {
        try {
            const da = w.getDefaultAppearance?.() || '';
            const nueva = da
                ? da.replace(/(\/[^\s]+\s+)[\d.]+(\s+Tf)/, `$1${size}$2`)
                : `/Helv ${size} Tf 0 g`;
            w.setDefaultAppearance(nueva);
        } catch { /* la casilla se queda con lo que traiga */ }
    }
}

/** Reparte el texto en líneas que caben en `ancho` a tamaño `size`. */
function lineas(texto, font, size, ancho) {
    const out = [];
    for (const parrafo of String(texto).split('\n')) {
        let linea = '';
        for (const palabra of parrafo.split(/\s+/)) {
            const cand = linea ? `${linea} ${palabra}` : palabra;
            if (linea && font.widthOfTextAtSize(cand, size) > ancho) { out.push(linea); linea = palabra; }
            else linea = cand;
        }
        out.push(linea);
    }
    return out;
}

/**
 * Lo que hace el lector de PDF con un campo de tamaño automático: el tope lo pone
 * la ALTURA de la casilla y, si el texto no cabe a lo ancho, se reduce hasta que
 * quepa. En un campo MULTILÍNEA no se encoge por el ancho —el texto se parte— sino
 * hasta que el número de líneas cabe en el alto.
 */
function autoSize(field, valor, font) {
    const widgets = field.acroField.getWidgets();
    if (!widgets.length) return null;
    // Un mismo campo puede tener VARIAS casillas: en la ficha TER100, el ahorro de
    // cada servicio sale en su apartado y otra vez en la tabla del total, y las dos
    // cajas no miden lo mismo. Se ajusta a la MÁS PEQUEÑA, o el valor se saldría de
    // esa (y sería justo la que nadie miró al comprobarlo).
    const rects = widgets.map(w => w.getRectangle());
    const alto = Math.min(...rects.map(r => Math.abs(r.height)));
    const ancho = Math.min(...rects.map(r => Math.abs(r.width))) - 4;   // 2pt de margen a cada lado
    const txt = String(valor ?? '');
    const multilinea = field instanceof PDFTextField && field.isMultiline();

    if (!txt || ancho <= 0) return Math.max(4, Math.min(12, alto * 0.65));

    if (multilinea) {
        for (let size = Math.min(11, alto * 0.65); size >= 5; size -= 0.5) {
            const n = lineas(txt, font, size, ancho).length;
            if (n * size * 1.18 <= alto - 2) return size;
        }
        return 5;
    }

    let size = Math.min(12, alto * 0.65);
    const unitario = font.widthOfTextAtSize(txt, 1);
    if (unitario > 0) size = Math.min(size, ancho / unitario);
    return Math.max(4, size);
}

/**
 * Rellena una plantilla oficial.
 *
 * @param {string} plantilla  clave de PLANTILLAS ('RES060' … 'ANEXO_I')
 * @param {object} campos     { 'nombre del campo': valor }. Una cadena rellena un
 *                            campo de texto o selecciona una opción del desplegable;
 *                            un booleano marca (o deja sin marcar) una casilla.
 * @param {object} opts       { fdo?: string }  el nombre que va en la línea "Fdo.:"
 *                            del Anexo I, que no es un campo del formulario.
 * @returns {Promise<{ pdf: Buffer, avisos: string[] }>}
 */
async function rellenar(plantilla, campos = {}, opts = {}) {
    if (!esPlantillaValida(plantilla)) throw new Error(`Plantilla desconocida: ${plantilla}`);

    const pdf = await PDFDocument.load(fs.readFileSync(rutaPlantilla(plantilla)));
    const form = pdf.getForm();
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const avisos = [];

    for (const [nombre, valorBruto] of Object.entries(campos || {})) {
        if (valorBruto === undefined || valorBruto === null) continue;
        let field;
        try { field = form.getField(nombre); }
        catch { avisos.push(`La plantilla ${plantilla} no tiene el campo "${nombre}"`); continue; }

        try {
            if (field instanceof PDFCheckBox) {
                if (valorBruto === true) field.check(); else field.uncheck();
                continue;
            }
            const valor = sanear(valorBruto);
            if (field instanceof PDFDropdown) {
                if (!valor) continue;
                // Una opción que no está en la lista NO se escribe a pelo: el impreso
                // reparte por ese valor (la CCAA decide qué Gestor Autonómico lo recibe)
                // y una cadena libre que no case con ninguna opción es peor que el hueco.
                const elegida = resolverOpcion(valor, field.getOptions());
                if (!elegida) { avisos.push(`"${valor}" no es una opción de "${nombre}"`); continue; }
                field.select(elegida);
                fijarTamano(field, tamanoDeclarado(field) || autoSize(field, valor, helv));
                continue;
            }
            if (field instanceof PDFTextField) {
                field.setText(valor);
                fijarTamano(field, tamanoDeclarado(field) || autoSize(field, valor, helv));
                if ((CENTRADOS[plantilla] || []).includes(nombre)) field.setAlignment(TextAlignment.Center);
                continue;
            }
            avisos.push(`El campo "${nombre}" es de un tipo que no se sabe rellenar`);
        } catch (e) {
            avisos.push(`No se pudo escribir "${nombre}": ${e.message}`);
        }
    }

    // El "Fdo.:" del Anexo I: no hay campo, se escribe sobre la línea de puntos.
    if (plantilla === 'ANEXO_I' && opts.fdo) {
        const pagina = pdf.getPage(FDO_ANEXO_I.pagina - 1);
        pagina.drawText(sanear(opts.fdo), {
            x: FDO_ANEXO_I.x, y: FDO_ANEXO_I.y, size: FDO_ANEXO_I.size, font: helv,
        });
    }

    form.updateFieldAppearances(helv);

    // El campo de firma del impreso viene con un sello naranja "SIGN" dibujado
    // dentro. No lo usamos —se firma con Autofirma, que crea el suyo en las
    // coordenadas de `signBoxes.js`—, así que ese marcador solo sería un adorno de
    // otra herramienta en un documento oficial. Se retira.
    //
    // `form.removeField()` no vale aquí: recorre las apariencias del widget y este
    // trae un /AP que no sabe leer ("Unexpected N type"). Se quita a mano — de la
    // lista de campos del formulario y de las anotaciones de su página.
    for (const f of form.getFields()) {
        if (!(f instanceof PDFSignature)) continue;
        try {
            for (const w of f.acroField.getWidgets()) {
                const ref = pdf.context.getObjectRef(w.dict) || w.dict;
                for (const pagina of pdf.getPages()) pagina.node.removeAnnot(ref);
            }
            form.acroForm.removeField(f.acroField);
        } catch (e) { avisos.push(`No se pudo retirar el campo de firma: ${e.message}`); }
    }

    return { pdf: Buffer.from(await pdf.save()), avisos };
}

/**
 * Puente para las rutas: acepta el `formulario` tal cual llega del navegador y
 * devuelve el PDF. Valida la plantilla; el resto de la validación es de quien
 * arma los campos (fuente única en el frontend).
 */
async function rellenarDesdePeticion(formulario) {
    const { plantilla, campos, fdo } = formulario || {};
    const { pdf, avisos } = await rellenar(plantilla, campos, { fdo });
    if (avisos.length) console.warn(`[formularioOficial] ${plantilla}:`, avisos.join(' · '));
    return pdf;
}

module.exports = {
    PLANTILLAS,
    esPlantillaValida,
    rutaPlantilla,
    rellenar,
    rellenarDesdePeticion,
    FDO_ANEXO_I,
};
