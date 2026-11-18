// ============================================================================
// facturaWordService.js — la FACTURA DE LA OBRA en Word, rellenada SOBRE LA
// PLANTILLA DEL PROPIO INSTALADOR (Fran, 13/11/2026, 26RES060_283, beta con RCA
// INSTALACIONES: «debe ser exactamente la misma»).
//
// No se compone ninguna factura: se abre el .docx que usa el instalador (una
// factura suya anterior) y se cambia SOLO el texto de los campos de la obra,
// dejando intacto todo lo demás (cabecera, logo, NIF, cuenta, cuadros, columnas,
// tipografías, pie). Cada campo se localiza por su ROTULO en la plantilla
// («Cliente:», «Número:», «Fecha:», «CONCEPTO», «INMUEBLE:», «REF. CATASTRAL:»,
// «Observaciones:») y el texto nuevo hereda el formato del que había.
//
//   · Cliente (nombre, domicilio, NIF), concepto, inmueble, referencia catastral
//     y observaciones del IRPF → se RELLENAN.
//   · Número, fecha, importe y los totales del pie → se dejan EN BLANCO (el
//     número y la fecha conservan su subrayado, para escribir encima).
//
// El texto del concepto, el titular, el NIF y la obra salen de la MISMA fuente
// que el consejo de factura (regla 210, utils/consejoFactura.js). No escribe nada.
//
// Las plantillas de Word que convierten un PDF (como la de RCA) llevan cada
// cuadro de texto DOS veces (mc:Choice y su VML de respaldo): se cambian las dos.
// ============================================================================

const JSZip = require('jszip');

const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Texto ────────────────────────────────────────────────────────────────────

/** «NOELIA RODRIGUEZ CASTELLANOS» → «Noelia Rodriguez Castellanos» (las fichas van en MAYÚSCULAS). */
function nombrePropio(s) {
    const menores = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
    return limpio(s).toLowerCase().split(/\s+/).filter(Boolean).map((p, i) => (
        i > 0 && menores.has(p) ? p : p.replace(/^(\p{L})/u, (c) => c.toUpperCase())
    )).join(' ');
}

/** El combustible de la caldera que se retira, por su fila de rendimiento. */
function combustibleCaldera(inst) {
    const c = inst?.caldera_antigua_cal || {};
    const t = `${limpio(c.combustible)} ${limpio(c.rendimiento_id)}`.toLowerCase();
    if (/gasoil|gasoleo|gasóleo|oil/.test(t)) return 'gasóleo';
    if (/glp|propano|butano/.test(t)) return 'GLP';
    if (/carbon|carbón/.test(t)) return 'carbón';
    if (/biomasa|pellet|le[nñ]a|solid/.test(t)) return 'biomasa';
    if (/gas/.test(t)) return 'gas natural';
    return null;
}

/**
 * Las observaciones para la deducción del IRPF (DA 50.ª de la Ley 35/2006), con la
 * redacción que ya usa RCA en sus facturas (la del RDL 7/2026).
 */
function observaciones({ direccionObra, titular, nif, combustible, hibridacion, conAcs }) {
    const servicio = conAcs ? ' para calefacción y ACS' : '';
    const actuacion = hibridacion
        ? `Instalación de bomba de calor aerotérmica (energía renovable)${servicio}, en hibridación con la caldera existente${combustible ? ` de ${combustible}` : ''}.`
        : `Instalación de bomba de calor aerotérmica (energía renovable)${servicio}, en sustitución de caldera de ${combustible || '[COMBUSTIBLE]'}.`;
    return `Observaciones: Obra de mejora de la eficiencia energética ejecutada en la vivienda de ${direccionObra}, `
        + `propiedad de ${titular} (DNI:${nif}). ${actuacion} `
        + 'Factura emitida a efectos, entre otros, de la deducción por obras de mejora de la eficiencia '
        + 'energética de viviendas de la disposición adicional quincuagésima de la Ley 35/2006, de 28 de '
        + 'noviembre, del IRPF, en la redacción dada por el art. 36.Uno del Real Decreto-ley 7/2026, de 20 de marzo.';
}

// ── XML de Word ──────────────────────────────────────────────────────────────

// Párrafo MÁS INTERIOR (sin otro <w:p> dentro): los de los cuadros de texto van
// anidados en el párrafo que los ancla.
const RE_P = /<w:p(?: [^>]*)?>(?:(?!<w:p[ >])[\s\S])*?<\/w:p>/g;
const RE_RUN = /<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g;

const textoDe = (p) => (p.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
    .map(t => t.replace(/<[^>]+>/g, '')).join('');
const pPrDe = (p) => (p.match(/^<w:p(?: [^>]*)?>/)[0]) + ((p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0]);
const runsDe = (p) => p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '').match(RE_RUN) || [];
const rPrDe = (run) => (run && (run.match(/<w:rPr\/>|<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0]) || '';
// Un «\n» en el texto es un salto de línea (<w:br/>) dentro del mismo párrafo.
const run = (rPr, texto) => `<w:r>${rPr}${String(texto).split('\n')
    .map(l => `<w:t xml:space="preserve">${esc(l)}</w:t>`).join('<w:br/>')}</w:r>`;

/** Corta un texto en líneas de como mucho `ancho` caracteres, por palabras. */
function partir(texto, ancho) {
    const out = [];
    let linea = '';
    for (const palabra of limpio(texto).split(/\s+/)) {
        if (linea && (linea.length + 1 + palabra.length) > ancho) { out.push(linea); linea = palabra; }
        else linea = linea ? `${linea} ${palabra}` : palabra;
    }
    if (linea) out.push(linea);
    return out;
}

/** Cambia (o pone) la sangría derecha del párrafo. */
const conSangriaDerecha = (p, twips) => (/<w:ind\b[^>]*\sw:right="/.test(p)
    ? p.replace(/(<w:ind\b[^>]*?\sw:right=")\d+"/, `$1${twips}"`)
    : p.replace(/<w:ind\b/, `<w:ind w:right="${twips}"`));

/** El párrafo con los `n` primeros runs y, detrás, el texto nuevo con el formato del run `de`. */
function conTexto(p, texto, { conservar = 0, de = conservar } = {}) {
    const rs = runsDe(p);
    const fmt = rPrDe(rs[Math.min(de, rs.length - 1)]);
    return `${pPrDe(p)}${rs.slice(0, conservar).join('')}${texto === null ? '' : run(fmt, texto)}</w:p>`;
}

/** Índice del run que contiene `texto` (o -1). */
const runCon = (p, re) => runsDe(p).findIndex(r => re.test(textoDe(r)));

// Medido en la plantilla de RCA (Word, Calibri 11 en mayúsculas): la 1.ª línea del
// concepto comparte párrafo con «CONCEPTO» y tiene sangría derecha (≈40 caracteres);
// las demás llegan a ≈50. Se corta a menos para que Word no vuelva a partirlas: así
// cada línea es un párrafo, como las escribe Ramón, con el mismo interlineado.
const ANCHO_CONCEPTO_1 = 38;
const ANCHO_CONCEPTO = 46;
// Interlineado de las líneas del concepto: el que domina en la plantilla (285/240).
// La conversión desde PDF dejó a cada párrafo uno distinto (exacto 254, auto 276
// con 3 pt antes…); con una línea por párrafo eso salía a saltos.
const LINEA_CONCEPTO = 285;
// Alto (pt): una línea de Calibri 11 (13,4 pt) con ese interlineado; una de
// observaciones (8 pt × 1,22 × 264/240); un párrafo vacío del hueco hasta «Nº de
// cuenta» (8 pt × 1,22); y uno vacío normal de la columna IMPORTE.
const PT_LINEA_11 = 13.4;
const PT_CONCEPTO = PT_LINEA_11 * LINEA_CONCEPTO / 240;
const PT_OBSERVACIONES = 10.7;
const PT_HUECO = 9.8;
const antesPt = (p) => Number((p.match(/<w:spacing\b[^>]*\sw:before="(\d+)"/) || [])[1] || 0) / 20;
const CAR_OBSERVACIONES = 92;
const lineasObs = (texto) => Math.max(1, Math.ceil(limpio(texto).length / CAR_OBSERVACIONES));
// La sangría derecha de las observaciones de la plantilla (deja libre PRECIO e
// IMPORTE); con un poco más de margen, y la misma para «INMUEBLE:», que en la
// plantilla no la tiene porque la dirección de Ramón cabe en una línea.
const SANGRIA_COLUMNA_CONCEPTO = 3600;

/** Las líneas del concepto, ya cortadas: cada actuación empieza línea. */
function lineasConcepto(actuaciones) {
    const out = [];
    for (const a of actuaciones) {
        const primera = out.length === 0;
        const [l1, ...resto] = partir(a, primera ? ANCHO_CONCEPTO_1 : ANCHO_CONCEPTO);
        out.push(l1, ...partir(resto.join(' '), ANCHO_CONCEPTO));
    }
    return out.filter(Boolean);
}

/**
 * Rellena el document.xml. Devuelve { xml, cambios } — cada campo dice cuántas veces
 * se ha encontrado, para no dar por buena una plantilla en la que falta un rótulo.
 */
function rellenarDocumento(xml, d) {
    const ps = [];
    xml.replace(RE_P, (m, off) => { ps.push({ m, off }); return m; });
    const nuevo = new Map(); // off → xml nuevo ('' = se borra)
    const cambios = { cliente: 0, numero: 0, fecha: 0, concepto: 0, importe: 0, inmueble: 0, catastral: 0, observaciones: 0 };
    const t = (i) => textoDe(ps[i].m).trim();
    let ptDeMas = 0; // lo que crece (pt) el texto respecto a la factura de la plantilla
    const huecos = [];

    for (let i = 0; i < ps.length; i++) {
        const p = ps[i].m;
        const tx = t(i);
        if (/^Cliente:$/.test(tx) && ps[i + 2]) {
            nuevo.set(ps[i + 1].off, conTexto(ps[i + 1].m, d.clienteNombre));
            // El domicilio, en sus tres líneas (calle / CP y municipio / NIF) con saltos
            // de línea: la plantilla las partía con una sangría derecha que solo vale
            // para una calle corta; con una larga el NIF se salía del cuadro.
            nuevo.set(ps[i + 2].off, conSangriaDerecha(conTexto(ps[i + 2].m, d.clienteDomicilio), 0));
            cambios.cliente++;
        } else if (/^N[úu]mero:/.test(tx)) {
            const k = runCon(p, /N[úu]mero:/);
            nuevo.set(ps[i].off, conTexto(p, ' '.repeat(14), { conservar: k + 2, de: k + 3 }));
            cambios.numero++;
        } else if (/^Fecha:/.test(tx)) {
            const k = runCon(p, /Fecha:/);
            nuevo.set(ps[i].off, conTexto(p, ' '.repeat(34), { conservar: k + 2, de: k + 2 }));
            cambios.fecha++;
        } else if (/^CONCEPTO\b/.test(tx)) {
            // La cabecera «CONCEPTO» y la 1.ª línea van en el mismo párrafo (salto de
            // columna delante); las demás, una por párrafo hasta «PRECIO».
            const k = runCon(p, /CONCEPTO/);
            let fin = i + 1;
            while (fin < ps.length && !/PRECIO/.test(t(fin))) fin++;
            const molde = fin > i + 1 ? ps[i + 1].m : p;
            const fmt = rPrDe(runsDe(molde)[0]);
            const lineas = lineasConcepto(d.concepto);
            const [primera, ...resto] = lineas;
            // Las columnas del concepto son una sección continua: su alto es el de la
            // columna más alta, que en la plantilla puede ser IMPORTE (párrafos vacíos
            // hasta la cifra). Solo cuenta lo que el concepto nuevo pase de ese alto.
            let finSeccion = fin;
            while (finSeccion < ps.length - 1 && !/<w:sectPr/.test(ps[finSeccion].m)) finSeccion++;
            let iniUltima = fin;
            for (let j = fin; j <= finSeccion; j++) if (/<w:br w:type="column"/.test(ps[j].m)) iniUltima = j;
            let altoImporte = 0;
            for (let j = iniUltima; j <= finSeccion; j++) altoImporte += PT_LINEA_11 + antesPt(ps[j].m);
            let altoAntes = 0;
            for (let j = i; j < fin; j++) {
                const txt = textoDe(ps[j].m).replace(/^\s*CONCEPTO\s*/, '');
                altoAntes += partir(txt, ANCHO_CONCEPTO).length * PT_CONCEPTO + antesPt(ps[j].m);
            }
            const altoDespues = lineas.length * PT_CONCEPTO + antesPt(p);
            ptDeMas += Math.max(altoDespues, altoImporte) - Math.max(altoAntes, altoImporte);
            nuevo.set(ps[i].off, conTexto(p, primera, { conservar: k + 1, de: k + 1 }));
            const pPrLinea = pPrDe(molde).replace(/<w:spacing\b[^>]*\/>/, '')
                .replace(/<w:pPr>/, `<w:pPr><w:spacing w:line="${LINEA_CONCEPTO}" w:lineRule="auto"/>`)
                .replace(/(<w:pPr><w:spacing[^>]*\/>)(<w:pStyle[^>]*\/>)/, '$2$1'); // pStyle va primero
            const siguientes = resto.map(l => `${pPrLinea}${run(fmt, l)}</w:p>`).join('');
            for (let j = i + 1; j < fin; j++) nuevo.set(ps[j].off, '');
            if (fin > i + 1) nuevo.set(ps[i + 1].off, siguientes);
            else nuevo.set(ps[i].off, nuevo.get(ps[i].off) + siguientes);
            cambios.concepto++;
            i = fin - 1;
        } else if (/^[\d.]+,\d{2}\s*€$/.test(tx)) {
            nuevo.set(ps[i].off, conTexto(p, null));
            cambios.importe++;
        } else if (/^INMUEBLE:/.test(tx)) {
            const k = runCon(p, /INMUEBLE:/);
            nuevo.set(ps[i].off, conSangriaDerecha(conTexto(p, ` ${d.inmueble}`, { conservar: k + 1, de: k }), SANGRIA_COLUMNA_CONCEPTO));
            ptDeMas += (partir(`INMUEBLE: ${d.inmueble}`, 62).length - partir(tx, 62).length) * PT_LINEA_11;
            cambios.inmueble++;
        } else if (/^REF\.\s*CATASTRAL:/.test(tx)) {
            const k = runCon(p, /CATASTRAL:/);
            nuevo.set(ps[i].off, conTexto(p, ` ${d.refCatastral}`, { conservar: k + 1, de: k }));
            cambios.catastral++;
        } else if (/^Observaciones:/.test(tx)) {
            nuevo.set(ps[i].off, conSangriaDerecha(conTexto(p, d.observaciones), SANGRIA_COLUMNA_CONCEPTO));
            ptDeMas += (lineasObs(d.observaciones) - lineasObs(tx)) * PT_OBSERVACIONES;
            cambios.observaciones++;
            // Los párrafos VACÍOS que siguen (el hueco hasta «Nº de cuenta») se
            // guardan: si el texto nuevo ocupa más, se quitan los que hagan falta
            // para que la cuenta siga dentro del marco y la factura en una hoja.
            // Nunca uno que ancle un cuadro de texto o un dibujo, ni el que cierra la sección.
            for (let j = i + 1; j < ps.length && !t(j); j++) {
                if (!/<w:drawing|<mc:AlternateContent|<w:pict|<w:sectPr|<w:br w:type="(?:page|column)"/.test(ps[j].m)) huecos.push(ps[j].off);
            }
        }
    }

    // Se quitan los párrafos vacíos que cubren lo que crece el texto, más tres de
    // margen (la estimación se queda corta en ~20 pt: medido con 26RES060_283, la
    // cuenta tocaba el marco con uno solo), dejando siempre uno; si no bastan, la
    // cuenta bajaría del marco: se avisa con `cabe: false`.
    const quitar = ptDeMas > 0 ? Math.min(Math.ceil(ptDeMas / PT_HUECO) + 3, Math.max(huecos.length - 1, 0)) : 0;
    for (const off of huecos.slice(0, quitar)) nuevo.set(off, '');
    cambios.huecosQuitados = quitar;
    cambios.ptDeMas = Math.round(ptDeMas);
    cambios.cabe = ptDeMas + 3 * PT_HUECO <= (huecos.length - 1) * PT_HUECO;

    let out = '';
    let pos = 0;
    for (const { m, off } of ps) {
        if (!nuevo.has(off)) continue;
        out += xml.slice(pos, off) + nuevo.get(off);
        pos = off + m.length;
    }
    return { xml: out + xml.slice(pos), cambios };
}

// ── Plantilla con TABLA de Word (RCA, 18/11/2026) ────────────────────────────
// La primera plantilla de RCA llevaba la tabla de precios como una hoja de Excel
// INCRUSTADA: en Word no se podía escribir en ella (Fran, 17/11). La que manda
// ahora es una tabla de Word normal (CANTIDAD · CONCEPTO · PRECIO · IMPORTE y la
// de Importe factura · I.V.A. · TOTAL FACTURA): se rellena el cliente y una FILA
// por actuación (cantidad 1 y su concepto), más una última con el inmueble, la
// referencia catastral y las observaciones del IRPF. PRECIO, IMPORTE, los totales,
// el número y la fecha se quedan EN BLANCO y se pueden ESCRIBIR: sus celdas llevan
// la letra del concepto en la marca de párrafo, así lo que teclea el instalador
// sale en la misma letra y no en la Times de «Normal».

const RPR_TABLA = (sz, { bold = false } = {}) => '<w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>'
    + `${bold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="000000"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
const SZ_CONCEPTO = 19;      // 9,5 pt: las líneas largas del consejo caben en 2-3 renglones
const SZ_EXTRA = 17;         // inmueble y referencia catastral
const SZ_OBSERVACIONES = 14; // 7 pt, como las observaciones de sus facturas

/** Un párrafo de celda: alineación, espacio y el formato de lo que se escriba en él. */
const pCelda = (texto, { jc = 'left', sz = SZ_CONCEPTO, bold = false, antes = 40, despues = 40 } = {}) => {
    const rPr = RPR_TABLA(sz, { bold });
    return `<w:p><w:pPr><w:spacing w:before="${antes}" w:after="${despues}" w:line="240" w:lineRule="auto"/><w:jc w:val="${jc}"/>${rPr}</w:pPr>`
        + `${texto ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>` : ''}</w:p>`;
};

/** ¿Es la tabla de las líneas? (su cabecera dice CONCEPTO, PRECIO e IMPORTE). */
const esTablaLineas = (tbl) => ['CONCEPTO', 'PRECIO', 'IMPORTE'].every(r => textoDe(tbl).includes(r));

// Alto estimado (twips) de una fila de concepto: renglones de 9,5 pt en la columna
// CONCEPTO (~51 caracteres en mayúsculas). Ajustado con Word en 26RES060_283 hasta
// que el cuadro acaba donde en la plantilla (700 pt). Si el concepto ocupa más de
// lo estimado, Word estira la fila y los totales bajan algo: hay hoja de sobra.
const TW_RENGLON_CONCEPTO = 254;
const altoFilaConcepto = (texto) => partir(texto, 51).length * TW_RENGLON_CONCEPTO + 10;

/**
 * Las filas de la tabla, a partir de la fila de cuerpo de la plantilla (la que no
 * tiene alto exacto). Cada celda de la plantilla conserva su ancho y sus bordes;
 * entre filas se quita el borde inferior para que se lea como un solo cuadro.
 */
function filasLineas(molde, filas) {
    const celdas = molde.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    if (celdas.length < 4) throw new Error('La fila de la tabla de la plantilla no tiene sus cuatro columnas.');
    // La fila de cuerpo de la plantilla tiene un alto MÍNIMO (8800 twips en la de RCA
    // del 18/11, la que llena la hoja hasta los totales). Copiado en cada fila, cada
    // una ocuparía la hoja entera: las de concepto van sin alto y la ÚLTIMA (inmueble
    // y observaciones) se queda con lo que falte hasta ese mínimo, así el cuadro llega
    // al mismo sitio que en la plantilla. Si el texto ocupa más, Word la estira.
    const minimo = Number((molde.match(/<w:trHeight(?![^>]*w:hRule="exact")[^>]*w:val="(\d+)"/) || [])[1] || 0);
    const abrirSinAlto = molde.slice(0, molde.indexOf('<w:tc>')).replace(/<w:trPr>[\s\S]*?<\/w:trPr>/, (trPr) => {
        const sin = trPr.replace(/<w:trHeight\b[^>]*\/>/, '');
        return sin === '<w:trPr></w:trPr>' ? '' : sin;
    });
    const altoConceptos = filas.slice(0, -1).reduce((s, f) => s + (f.alto || 0), 0);
    const restante = Math.max(0, minimo - altoConceptos);
    const abrirUltima = (minimo && restante)
        ? (/<w:trPr>/.test(abrirSinAlto)
            ? abrirSinAlto.replace('<w:trPr>', `<w:trPr><w:trHeight w:val="${restante}"/>`)
            : `${abrirSinAlto}<w:trPr><w:trHeight w:val="${restante}"/></w:trPr>`)
        : abrirSinAlto;
    return filas.map((f, k) => {
        const ultima = k === filas.length - 1;
        const abrir = ultima ? abrirUltima : abrirSinAlto;
        const cs = celdas.map((c, i) => {
            let tcPr = (c.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [''])[0];
            if (!ultima) tcPr = tcPr.replace(/<w:bottom w:val="single"[^>]*\/>/, '<w:bottom w:val="nil"/>');
            if (i >= 4) return c.replace(/<w:tcPr>[\s\S]*?<\/w:tcPr>/, tcPr); // la sombra del cuadro
            const contenido = i === 1 ? f.concepto : pCelda(i === 0 ? f.cantidad : '', { jc: 'center' });
            return `<w:tc>${tcPr}${contenido}</w:tc>`;
        });
        return `${abrir}${cs.join('')}</w:tr>`;
    }).join('');
}

/**
 * Rellena una plantilla con TABLA. `d` como en rellenarDocumento. Devuelve { xml, cambios }.
 */
function rellenarDocumentoTabla(xml, d) {
    const cambios = { cliente: 0, numero: 0, fecha: 0, tabla: 0, filas: 0 };
    const [direccion = '', postal = '', nif = ''] = String(d.clienteDomicilio || '').split('\n');
    const lineasCliente = [d.clienteNombre, direccion, postal, nif];

    // Cliente: los cuatro párrafos que siguen a «Cliente:» en cada cuadro de texto
    // (la plantilla lo lleva varias veces: mc:Choice, su VML y los cuadros de la
    // sombra con el texto invisible). Cada línea conserva su formato.
    let out = xml.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, (caja) => {
        const ps = caja.match(RE_P) || [];
        if (ps.some(p => /^N[úu]mero:/.test(textoDe(p).trim()))) cambios.numero++;
        if (ps.some(p => /^Fecha:/.test(textoDe(p).trim()))) cambios.fecha++;
        // Un cuadro puede llevar el bloque más de una vez («Cliente:» y el «liente:»
        // invisible de la sombra): se cambian TODOS, o el cliente de la plantilla
        // seguiría dentro del fichero, oculto.
        const nuevo = new Map();
        ps.forEach((p, idx) => {
            if (!/^C?liente:$/.test(textoDe(p).trim())) return;
            lineasCliente.forEach((texto, k) => {
                const q = ps[idx + 1 + k];
                if (q && textoDe(q).trim()) nuevo.set(idx + 1 + k, conTexto(q, texto));
            });
            cambios.cliente++;
        });
        if (!nuevo.size) return caja;
        let i = -1;
        return caja.replace(RE_P, (p) => { i++; return nuevo.has(i) ? nuevo.get(i) : p; });
    });

    // La tabla de las líneas
    out = out.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
        if (!esTablaLineas(tbl)) return tbl;
        const filas = tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
        const molde = filas.find(f => !/<w:tblHeader\/>|w:hRule="exact"/.test(f));
        if (!molde) return tbl;
        const nuevas = d.concepto.map(l => ({ cantidad: '1', concepto: pCelda(l), alto: altoFilaConcepto(l) }));
        nuevas.push({
            cantidad: '',
            concepto: pCelda(`INMUEBLE: ${d.inmueble}`, { sz: SZ_EXTRA, antes: 160, despues: 0 })
                + pCelda(`REF. CATASTRAL: ${d.refCatastral}`, { sz: SZ_EXTRA, antes: 0, despues: 80 })
                + pCelda(d.observaciones, { sz: SZ_OBSERVACIONES, jc: 'both', antes: 0, despues: 60 }),
        });
        cambios.tabla++;
        cambios.filas = nuevas.length;
        return tbl.replace(molde, filasLineas(molde, nuevas));
    });

    // Las celdas de los TOTALES ya llevan su letra en la marca de párrafo: se escriben tal cual.
    return { xml: out, cambios };
}

/** El pie (Importe · IVA · TOTAL): las cifras, en blanco. */
function vaciarImportes(xml) {
    let n = 0;
    const out = xml.replace(RE_P, (p) => {
        if (!/^[\d.]+,\d{2}\s*€$/.test(textoDe(p).trim())) return p;
        n++;
        return conTexto(p, null);
    });
    return { xml: out, n };
}

/**
 * Rellena la plantilla del instalador.
 * @param {Buffer} plantilla  el .docx del instalador (una factura suya)
 * @param {object} d          { clienteNombre, clienteDomicilio, concepto: string[], inmueble, refCatastral, observaciones }
 * @returns {Promise<{ buffer: Buffer, cambios: object }>}
 */
async function rellenarPlantillaFactura(plantilla, d) {
    const zip = await JSZip.loadAsync(plantilla);
    const doc = await zip.file('word/document.xml').async('string');
    // Plantilla con la tabla de precios en Word (la de RCA desde el 18/11): su relleno.
    if ((doc.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).some(esTablaLineas)) {
        const { xml, cambios } = rellenarDocumentoTabla(doc, d);
        const faltan = ['cliente', 'numero', 'fecha', 'tabla'].filter(k => !cambios[k]);
        if (faltan.length) throw new Error(`La plantilla no tiene: ${faltan.join(', ')} (se buscan por su rótulo).`);
        zip.file('word/document.xml', xml);
        cambios.modo = 'tabla';
        const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        return { buffer, cambios };
    }
    const { xml, cambios } = rellenarDocumento(doc, d);
    zip.file('word/document.xml', xml);
    let pie = 0;
    for (const f of Object.keys(zip.files).filter(n => /^word\/footer\d*\.xml$/.test(n))) {
        const r = vaciarImportes(await zip.file(f).async('string'));
        zip.file(f, r.xml);
        pie += r.n;
    }
    cambios.importesPie = pie;
    const faltan = ['cliente', 'numero', 'fecha', 'concepto', 'inmueble', 'catastral', 'observaciones'].filter(k => !cambios[k]);
    if (faltan.length) throw new Error(`La plantilla no tiene: ${faltan.join(', ')} (se buscan por su rótulo).`);
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { buffer, cambios };
}

/**
 * La factura de un expediente sobre la plantilla del instalador (solo LEE la BD).
 * @param {string} expedienteId
 * @param {Buffer} plantilla
 * @returns {Promise<{ buffer, fileName, consejo, datos, cambios }>}
 */
async function generarFacturaWord(expedienteId, plantilla) {
    const supabase = require('./supabaseClient');
    const { cargarConsejoFactura } = require('../utils/consejoFactura');

    const { data: exp, error } = await supabase.from('expedientes')
        .select('id, numero_expediente, oportunidad_id, cliente_id, instalador_asociado_id, instalacion, documentacion, cee')
        .eq('id', expedienteId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!exp) throw new Error('Expediente no encontrado');

    const [opR, cliR] = await Promise.all([
        exp.oportunidad_id
            ? supabase.from('oportunidades').select('ref_catastral').eq('id', exp.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
        exp.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    const cliente = cliR.data || {};
    const r = await cargarConsejoFactura(exp, { cliente, faltaFactura: true });
    const consejo = r?.consejo;
    if (!consejo) throw new Error('Este expediente no lleva consejo de factura (RES080 o sin sustitución de caldera).');

    const inst = exp.instalacion || {};
    const conAcs = inst.cambio_acs === true || /^(si|true)$/i.test(limpio(inst.cambio_acs));
    const titular = nombrePropio(consejo.titular);
    const postal = [limpio(cliente.codigo_postal), nombrePropio(cliente.municipio),
        limpio(cliente.provincia) ? `(${nombrePropio(cliente.provincia)})` : ''].filter(Boolean).join(' ');
    const datos = {
        clienteNombre: titular,
        // Tres líneas, como en la plantilla. La nota «(En catastro figura …)» de la
        // dirección no cabe en el cuadro del cliente: se queda en «INMUEBLE:».
        clienteDomicilio: [
            limpio(cliente.direccion).replace(/\s*\(en catastro[^)]*\)/i, '').replace(/\s+/g, ' ') || '[DOMICILIO]',
            postal, `NIF: ${consejo.nif}`,
        ].join('\n'),
        // Como las escribe el instalador: en MAYÚSCULAS, una actuación por línea. El
        // termo que no entra en la obra va en su línea (debe llevar su importe).
        concepto: [...consejo.lineas, ...(consejo.aparte || [])].map(l => l.replace(/\.$/, '').toUpperCase()),
        inmueble: consejo.direccion,
        refCatastral: limpio(opR.data?.ref_catastral) || '[REFERENCIA CATASTRAL]',
        observaciones: observaciones({
            direccionObra: consejo.direccion, titular, nif: consejo.nif,
            combustible: combustibleCaldera(inst), hibridacion: consejo.hibridacion, conAcs,
        }),
    };
    const { buffer, cambios } = await rellenarPlantillaFactura(plantilla, datos);
    const fileName = `${exp.numero_expediente} - Factura para rellenar.docx`;
    return { buffer, fileName, consejo, datos, cambios };
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * El ADJUNTO que acompaña al consejo de factura (Fran, 18/11/2026: «cuando se envíe
 * el concepto, que salga también pre-rellena la factura en Word, exactamente igual
 * que la plantilla»): solo si el instalador tiene su Word en la carpeta de
 * plantillas (facturaInstaladorService.plantillaDe → `word`). Nunca tumba el envío.
 * @returns {Promise<null | { filename, content: Buffer, contentType }>}
 */
async function adjuntoFacturaWord(expedienteId, instaladorId) {
    if (!expedienteId || !instaladorId) return null;
    try {
        const pl = await require('./facturaInstaladorService').plantillaDe(instaladorId);
        if (!pl?.word) return null;
        const r = await generarFacturaWord(expedienteId, pl.word);
        return { filename: r.fileName, content: r.buffer, contentType: DOCX_MIME };
    } catch (e) {
        console.warn(`[factura-word] ${expedienteId}:`, e.message);
        return null;
    }
}

module.exports = { generarFacturaWord, adjuntoFacturaWord, DOCX_MIME, rellenarPlantillaFactura, rellenarDocumento, rellenarDocumentoTabla, observaciones, combustibleCaldera, nombrePropio };
