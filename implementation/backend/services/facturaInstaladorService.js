// ============================================================================
// facturaInstaladorService.js — la FACTURA DE LA OBRA hecha por la app, en la
// PLANTILLA DEL INSTALADOR, «como si fuese su ERP» (Fran, 16/11/2026,
// 26RES060_283, beta con RCA INSTALACIONES).
//
// El instalador abre un enlace, ve SU factura ya escrita (su cabecera, su pie,
// su tipografía; el cliente, el concepto con marca, modelo y nº de serie, el
// inmueble, la referencia catastral y las observaciones del IRPF) y solo teclea
// el nº de factura, la fecha y la cantidad y el precio de cada línea. La app
// compone el PDF y lo GUARDA como si lo hubiera subido él al apartado
// «Facturas» (DOC_FACTURAS): misma carpeta «5. FACTURAS», misma fila en
// `documentacion.facturas[]`, mismo aviso al equipo. La única diferencia con una
// subida es que la fila no la rellena el OCR: lleva los datos EXACTOS con los
// que se ha compuesto (nº, fecha, base, IVA, total, emisor, partidas y
// desglose), con `origen: 'generada'`.
//
// La plantilla de cada instalador NO va en el repo (es pública y la plantilla
// lleva sus datos fiscales y su cuenta; la tipografía es la suya): un fondo PDF
// con la factura en blanco, un `plantilla.json` con dónde va cada cosa y las
// fuentes. Se buscan en PLANTILLAS_FACTURA_DIR/<id del instalador>/ (local) o en
// la carpeta de Drive DRIVE_FOLDER_PLANTILLAS_FACTURA/<id del instalador>/.
// El concepto sale de la MISMA fuente que el consejo de factura (regla 210).
// ============================================================================

const fs = require('fs');
const path = require('path');

const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Plantillas ───────────────────────────────────────────────────────────────

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // prescriptorId → { at, plantilla | null }

async function leerDeDisco(dir, id) {
    const base = path.join(dir, String(id));
    const cfgPath = path.join(base, 'plantilla.json');
    if (!fs.existsSync(cfgPath)) return null;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const leer = (f) => fs.readFileSync(path.join(base, f));
    return {
        cfg, fondo: leer(cfg.fondo), fuentes: Object.fromEntries(Object.entries(cfg.fuentes || {}).map(([k, f]) => [k, leer(f)])),
        // Su factura en WORD (opcional): la que va pre-rellena con el concepto (facturaWordService).
        word: cfg.word ? leer(cfg.word) : null,
        // Su PRESUPUESTO (opcional, 22/11/2026): el mismo Word titulado «PRESUPUESTO»,
        // exportado en blanco. Sin sección `presupuesto`, el presupuesto sale en la
        // hoja genérica (presupuestoInstaladorService), nunca en el fondo de la factura.
        fondoPresupuesto: cfg.presupuesto?.fondo ? leer(cfg.presupuesto.fondo) : null,
    };
}

async function leerDeDrive(carpeta, id) {
    const driveService = require('./driveService');
    const sub = await driveService.findSubfolderByName(carpeta, String(id));
    if (!sub) return null;
    const files = await driveService.listFiles(sub);
    const porNombre = new Map(files.map(f => [f.name, f.id]));
    const bajar = async (n) => {
        const fid = porNombre.get(n);
        const buf = fid ? await driveService.getFileContent(fid) : null;
        if (!buf) throw new Error(`Plantilla de factura de ${id}: falta «${n}» en Drive`);
        return buf;
    };
    if (!porNombre.has('plantilla.json')) return null;
    const cfg = JSON.parse((await bajar('plantilla.json')).toString('utf8'));
    const fuentes = {};
    for (const [k, f] of Object.entries(cfg.fuentes || {})) fuentes[k] = await bajar(f);
    return {
        cfg, fondo: await bajar(cfg.fondo), fuentes, word: cfg.word ? await bajar(cfg.word) : null,
        fondoPresupuesto: cfg.presupuesto?.fondo ? await bajar(cfg.presupuesto.fondo) : null,
    };
}

/** La plantilla de factura de un instalador, o null si no la tiene. */
async function plantillaDe(prescriptorId) {
    if (!prescriptorId) return null;
    const hit = cache.get(prescriptorId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.plantilla;
    let plantilla = null;
    if (process.env.PLANTILLAS_FACTURA_DIR) plantilla = await leerDeDisco(process.env.PLANTILLAS_FACTURA_DIR, prescriptorId);
    else if (process.env.DRIVE_FOLDER_PLANTILLAS_FACTURA) plantilla = await leerDeDrive(process.env.DRIVE_FOLDER_PLANTILLAS_FACTURA, prescriptorId);
    cache.set(prescriptorId, { at: Date.now(), plantilla });
    return plantilla;
}

// ── Formatos ─────────────────────────────────────────────────────────────────

/** 6300.5 → «6.300,50» (y « €» si `simbolo`). */
function eur(x, simbolo = true) {
    const [ent, dec] = Math.abs(r2(x)).toFixed(2).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${x < 0 ? '-' : ''}${miles},${dec}${simbolo ? ' €' : ''}`;
}
/** Cantidad: «1», «2,5». */
const cant = (x) => (Number.isInteger(Number(x)) ? String(Number(x)) : String(r2(x)).replace('.', ','));

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «2026-11-16» → «16 de noviembre de 2026» (largo) o «16/11/2026» (corto). */
function fechaTexto(iso, formato = 'largo') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpio(iso));
    if (!m) return '';
    const [, a, mm, d] = m;
    return formato === 'corto' ? `${d}/${mm}/${a}` : `${Number(d)} de ${MESES[Number(mm) - 1]} de ${a}`;
}

// ── Datos de la factura ──────────────────────────────────────────────────────

/** La partida (enum del OCR) de cada línea del consejo: la 1.ª es siempre la bomba de calor. */
function partidaDe(texto, i) {
    if (i === 0) return 'AEROTERMIA';
    const t = limpio(texto).toLowerCase();
    if (/interacumulador|producci[oó]n de acs|termo|acs\b/.test(t)) return 'ACS';
    if (/suministro.*(radiador|suelo radiante|fancoil)/.test(t)) return 'EMISORES';
    return 'OBRA_CIVIL';
}

/**
 * Todo lo que la factura lleva impreso además de los precios. Solo LEE.
 * @returns {Promise<null | { exp, op, token, consejo, instalador, plantilla, datos, lineas, fechaMinima, generada }>}
 */
async function datosFactura(expedienteId) {
    const supabase = require('./supabaseClient');
    const { cargarConsejoFactura, instaladorIdDe } = require('../utils/consejoFactura');
    const { observaciones, combustibleCaldera, nombrePropio } = require('./facturaWordService');
    const { fechaRegistroCee } = require('../utils/ceeFechas');

    const { data: exp, error } = await supabase.from('expedientes')
        .select('id, numero_expediente, oportunidad_id, cliente_id, instalador_asociado_id, instalacion, documentacion, cee')
        .eq('id', expedienteId).maybeSingle();
    if (error) { const e = new Error(error.message); e.status = 503; throw e; }
    if (!exp) return null;

    const [opR, cliR] = await Promise.all([
        exp.oportunidad_id
            ? supabase.from('oportunidades')
                .select('id, ficha, ref_catastral, instalador_asociado_id, prescriptor_id, upload_token:datos_calculo->>upload_token, inputs:datos_calculo->inputs')
                .eq('id', exp.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
        exp.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    if (opR.error || cliR.error) { const e = new Error((opR.error || cliR.error).message); e.status = 503; throw e; }
    const op = opR.data || {};
    const cliente = cliR.data || {};

    const insId = instaladorIdDe(exp, op);
    const plantilla = await plantillaDe(insId);
    const { data: instalador } = insId
        ? await supabase.from('prescriptores').select('id_empresa, razon_social, acronimo, cif').eq('id_empresa', insId).maybeSingle()
        : { data: null };

    const r = await cargarConsejoFactura(exp, { cliente, faltaFactura: true });
    const consejo = r?.consejo || null;

    const inst = exp.instalacion || {};
    const conAcs = inst.cambio_acs === true || /^(si|true)$/i.test(limpio(inst.cambio_acs));
    let datos = null;
    let lineas = [];
    if (consejo) {
        const titular = nombrePropio(consejo.titular);
        const postal = [limpio(cliente.codigo_postal), nombrePropio(cliente.municipio),
            limpio(cliente.provincia) ? `(${nombrePropio(cliente.provincia)})` : ''].filter(Boolean).join(' ');
        datos = {
            clienteNombre: titular,
            clienteDomicilio: [
                limpio(cliente.direccion).replace(/\s*\(en catastro[^)]*\)/i, '').replace(/\s+/g, ' ') || '[DOMICILIO]',
                postal, `NIF: ${consejo.nif}`,
            ],
            inmueble: consejo.direccion,
            refCatastral: limpio(op.ref_catastral) || '[REFERENCIA CATASTRAL]',
            observaciones: observaciones({
                direccionObra: consejo.direccion, titular, nif: consejo.nif,
                combustible: combustibleCaldera(inst), hibridacion: consejo.hibridacion, conAcs,
            }),
        };
        lineas = [...consejo.lineas, ...(consejo.aparte || [])].map((l, i) => ({
            texto: l.replace(/\.$/, '').toUpperCase(),
            partida: partidaDe(l, i),
        }));
    }

    const facturas = Array.isArray(exp.documentacion?.facturas) ? exp.documentacion.facturas : [];
    const generada = facturas.find(f => f && f.generada) || null;
    const subidas = facturas.filter(f => f && !f.generada);
    return {
        exp, op, token: op.upload_token || null, consejo, instalador, plantilla, datos, lineas,
        fechaMinima: fechaRegistroCee(exp, 'inicial') || null,
        generada, subidas, otrasFacturas: subidas.length,
    };
}

// ── Precios: validar y calcular ──────────────────────────────────────────────

/** Como `leerNum` de FacturaObraView: con coma, coma decimal; sin ella, «6.000» son miles y «6000.5», decimal. */
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const t = String(v).trim().replace(/\s|€/g, '');
    if (!t) return null;
    const norm = /,/.test(t) ? t.replace(/\./g, '').replace(',', '.')
        : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
    const n = Number(norm);
    return Number.isFinite(n) ? n : NaN;
};

// Los CONCEPTOS se pueden editar en la página (Fran, 18/11/2026): una línea de más,
// una menos o el texto corregido. Límites para que nadie meta un libro.
const MAX_LINEAS = 12;
const MAX_CONCEPTO = 700;
/** Texto de un concepto tecleado: sin caracteres de control y sin espacios de más. */
const textoConcepto = (v) => limpio(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ');

/**
 * Las líneas con las que se compone: las del consejo, o las que ha editado el
 * instalador (`entrada.conceptos`). Cada línea editada conserva la PARTIDA de la
 * del consejo en su sitio (la 1.ª, la bomba de calor); las añadidas, la que diga su
 * texto. Una línea vaciada se quita, salvo la primera, que es obligatoria.
 */
function lineasDe(entrada, lineas, errores) {
    if (!Array.isArray(entrada?.conceptos)) return lineas.map(l => ({ ...l, editada: false }));
    const crudos = entrada.conceptos.slice(0, MAX_LINEAS + 1);
    if (crudos.length > MAX_LINEAS) errores.push(`Como mucho ${MAX_LINEAS} líneas.`);
    const out = [];
    crudos.slice(0, MAX_LINEAS).forEach((c, i) => {
        const texto = textoConcepto(c);
        if (texto.length > MAX_CONCEPTO) errores.push(`Línea ${i + 1}: el concepto es demasiado largo (máximo ${MAX_CONCEPTO} caracteres).`);
        if (!texto) { if (i === 0) errores.push('La primera línea (la bomba de calor) no puede ir vacía.'); return; }
        const original = lineas[i];
        out.push({
            texto: texto.slice(0, MAX_CONCEPTO),
            idx: i, // su sitio en lo tecleado: los precios van por él aunque se quite una línea vacía
            partida: original ? original.partida : partidaDe(texto, i),
            editada: !original || original.texto !== texto,
        });
    });
    if (!out.length) out.push(...lineas.map(l => ({ ...l, editada: false })));
    return out;
}

/**
 * Comprueba lo tecleado y calcula importes y totales.
 * @param {{ numero, fecha, modo?: 'partidas'|'total', partidas: [{ cantidad, precio }], total?, conceptos?: string[] }} entrada
 *   `modo: 'total'` = un solo precio para toda la obra (sin partidas): va en la 1.ª línea
 *   con cantidad 1 y el resto sale sin importe (Fran, 18/11/2026: la factura que RCA
 *   subió de 26RES060_283 iba así).
 * @returns {{ errores: string[], calculo: { numero, fecha, fechaTxt, modo, lineas, base, ivaPct, iva, total } }}
 */
function calcular(entrada, { lineas: lineasConsejo, cfg, fechaMinima, hoy = new Date().toISOString().slice(0, 10) }) {
    const errores = [];
    const lineas = lineasDe(entrada, lineasConsejo, errores);
    const modo = entrada?.modo === 'total' ? 'total' : 'partidas';
    const numero = limpio(entrada?.numero);
    const fecha = limpio(entrada?.fecha);
    if (!numero) errores.push('Falta el número de factura.');
    else if (numero.length > 30) errores.push('El número de factura es demasiado largo.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push('Falta la fecha de la factura.');
    else {
        if (fecha > hoy) errores.push('La fecha de la factura no puede ser posterior a hoy.');
        if (fechaMinima && fecha <= String(fechaMinima).slice(0, 10)) {
            errores.push(`La fecha tiene que ser posterior al ${fechaTexto(String(fechaMinima).slice(0, 10), 'corto')}, el día que se registró el certificado energético inicial.`);
        }
    }
    let out;
    if (modo === 'total') {
        const t = num(entrada?.total);
        if (Number.isNaN(t) || (t !== null && t < 0)) errores.push('El precio total no es válido.');
        const conPrecio = Number.isFinite(t) && t > 0;
        if (!conPrecio) errores.push('Pon el precio total de la obra.');
        out = lineas.map((l, i) => (i === 0 && conPrecio
            ? { ...l, cantidad: 1, precio: r2(t), importe: r2(t) }
            : { ...l, cantidad: null, precio: null, importe: 0 }));
    } else {
        const ent = Array.isArray(entrada?.partidas) ? entrada.partidas : [];
        out = lineas.map((l, i) => {
            const e = ent[l.idx ?? i];
            const c = num(e?.cantidad);
            const p = num(e?.precio);
            if (Number.isNaN(c) || (c !== null && c <= 0)) errores.push(`Línea ${i + 1}: la cantidad no es válida.`);
            if (Number.isNaN(p) || (p !== null && p < 0)) errores.push(`Línea ${i + 1}: el precio no es válido.`);
            const conPrecio = Number.isFinite(p) && p > 0;
            const cantidad = conPrecio ? (Number.isFinite(c) && c > 0 ? c : 1) : null;
            return { ...l, cantidad, precio: conPrecio ? r2(p) : null, importe: conPrecio ? r2(cantidad * p) : 0 };
        });
        if (!out.some(l => l.importe > 0)) errores.push('Pon el precio de al menos una línea.');
        if (!out[0] || !(out[0].importe > 0)) errores.push('La bomba de calor (la primera línea) tiene que llevar su precio.');
    }
    const base = r2(out.reduce((s, l) => s + l.importe, 0));
    const ivaPct = Number(cfg?.iva_pct ?? 21);
    // round(base × pct) / 100, igual que la página: `base * pct / 100` da 1.491,1049… con
    // 7.100,50 € y redondeaba al céntimo de abajo (1.491,10 en el PDF, 1.491,11 en pantalla).
    const iva = Math.round(base * ivaPct) / 100;
    return {
        errores: [...new Set(errores)],
        calculo: { numero, fecha, fechaTxt: fechaTexto(fecha, cfg?.fecha?.formato), modo, lineas: out,
            conceptosCambiados: out.some(l => l.editada) || out.length !== lineasConsejo.length, base, ivaPct, iva, total: r2(base + iva) },
    };
}

// ── El PDF ───────────────────────────────────────────────────────────────────

/**
 * Compone la factura sobre el fondo de la plantilla. Posiciones en puntos PDF,
 * `y` medida DESDE ARRIBA (como en el visor) y en la LÍNEA BASE del texto.
 * `numeroLargo`: el nº de factura no cabe en su casilla ni encogido (con `numero.zona`).
 *
 * `opciones.tipo === 'presupuesto'` (22/11/2026, Fran: «el presupuesto con la MISMA
 * plantilla que su factura»): el fondo de presupuesto (`plantilla.fondoPresupuesto`), las
 * MISMAS posiciones con lo que `cfg.presupuesto` sobreescriba (`numero`, `fecha`, `tabla`,
 * `totales`) y, bajo las líneas, en lugar de INMUEBLE / REF. CATASTRAL / observaciones
 * del IRPF (que son de la factura de la obra ya hecha), la DIRECCIÓN DE LA OBRA si es
 * otra que la del cliente (`datos.direccionObra`), las notas (`datos.notas`) y la
 * validez (`datos.validezDias`). Sin `opciones`, la factura de siempre, byte a byte.
 * @returns {Promise<{ buffer: Buffer, desborda: boolean, numeroLargo: boolean }>}
 */
async function componerPdf(plantilla, datos, calculo, opciones = {}) {
    const { PDFDocument, rgb } = require('pdf-lib');
    const fontkit = require('@pdf-lib/fontkit');
    const esPresupuesto = opciones?.tipo === 'presupuesto';
    const cfg = esPresupuesto ? cfgPresupuesto(plantilla.cfg) : plantilla.cfg;
    const pdf = await PDFDocument.load(esPresupuesto ? (plantilla.fondoPresupuesto || plantilla.fondo) : plantilla.fondo);
    pdf.registerFontkit(fontkit);
    const fR = await pdf.embedFont(plantilla.fuentes.normal, { subset: true });
    const fB = plantilla.fuentes.negrita ? await pdf.embedFont(plantilla.fuentes.negrita, { subset: true }) : fR;
    const pg = pdf.getPage(0);
    const H = pg.getHeight();
    const color = (c) => rgb(...(Array.isArray(c) ? c : [0, 0, 0]));

    const ancho = (t, size, bold) => (bold ? fB : fR).widthOfTextAtSize(t, size);
    // `zona: [xmin, xmax]` (opcional, de plantilla.json): el hueco libre del campo. Un texto que
    // se saldría se corre dentro y, si aun así no cabe, se encoge (hasta 6,5 pt). Sin ella, el
    // nº «PRUEBA 1» centrado pisaba la etiqueta «Número:» (RCA, 18/11/2026).
    // Devuelve false si ni encogido cabe (entonces la página pide acortarlo y no se guarda).
    function txt(x, y, t, { size = 11, bold = false, col = null, align = 'l', zona = null } = {}) {
        if (!t) return true;
        let s = size;
        let w = ancho(t, s, bold);
        let x0 = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x;
        let cabe = true;
        if (Array.isArray(zona) && zona.length === 2) {
            const [a, b] = zona;
            if (w > b - a) { s = Math.max(6.5, s * (b - a) / w); w = ancho(t, s, bold); }
            cabe = w <= b - a + 0.5;
            x0 = Math.min(Math.max(x0, a), Math.max(a, b - w));
        }
        pg.drawText(t, { x: x0, y: H - y, size: s, font: bold ? fB : fR, color: color(col) });
        return cabe;
    }
    function partir(t, lim, size) {
        const out = [];
        let l = '';
        for (const w of limpio(t).split(/\s+/)) {
            const c = l ? `${l} ${w}` : w;
            if (l && ancho(c, size, false) > lim) { out.push(l); l = w; } else l = c;
        }
        return l ? [...out, l] : out;
    }

    // Cliente, número y fecha
    const cl = cfg.cliente;
    txt(cl.x, cl.y, datos.clienteNombre, { size: cl.size, bold: cl.nombreNegrita !== false });
    datos.clienteDomicilio.forEach((l, i) => txt(cl.x, cl.y + cl.pitch * (i + 1), l, { size: cl.size }));
    const numeroCabe = txt(cfg.numero.x, cfg.numero.y, calculo.numero, { size: cfg.numero.size, align: cfg.numero.align, zona: cfg.numero.zona });
    txt(cfg.fecha.x, cfg.fecha.y, calculo.fechaTxt, { size: cfg.fecha.size, align: cfg.fecha.align, zona: cfg.fecha.zona });

    // Líneas: la primera de cada partida lleva cantidad, precio e importe
    const tb = cfg.tabla;
    let y = tb.y;
    for (const l of calculo.lineas) {
        if (l.importe > 0) {
            txt(tb.cantidad.x, y, cant(l.cantidad), { size: tb.size, align: tb.cantidad.align });
            txt(tb.precio.x, y, eur(l.precio, tb.precio.simbolo === true), { size: tb.size, align: tb.precio.align });
            txt(tb.importe.x, y, eur(l.importe, tb.importe.simbolo !== false), { size: tb.size, align: tb.importe.align });
        }
        for (const t of partir(l.texto, tb.concepto.ancho, tb.size)) { txt(tb.concepto.x, y, t, { size: tb.size }); y += tb.pitch; }
        y += tb.separacion ?? 4;
    }
    const ex = cfg.extra;
    y += ex.antes ?? 2;
    let desborda;
    if (esPresupuesto) {
        // Lo que acompaña al presupuesto, con la letra del INMUEBLE de la factura.
        const pie = [
            datos.direccionObra ? `DIRECCIÓN DE LA OBRA: ${datos.direccionObra}` : null,
            ...String(datos.notas || '').split(/\r?\n+/).map(s => textoConcepto(s).toUpperCase()).filter(Boolean),
            Number(datos.validezDias) > 0 ? `VALIDEZ DEL PRESUPUESTO: ${Math.round(Number(datos.validezDias))} DÍAS` : null,
        ].filter(Boolean);
        let ultimo = y;
        for (const p of pie) {
            for (const t of partir(p, tb.concepto.ancho, ex.size)) { txt(tb.concepto.x, y, t, { size: ex.size }); ultimo = y; y += ex.pitch; }
            y += 2;
        }
        desborda = ultimo > tb.fondo;
    } else {
        for (const t of partir(`INMUEBLE: ${datos.inmueble}`, tb.concepto.ancho, ex.size)) { txt(tb.concepto.x, y, t, { size: ex.size }); y += ex.pitch; }
        txt(tb.concepto.x, y, `REF. CATASTRAL: ${datos.refCatastral}`, { size: ex.size }); y += ex.pitch + 2;
        for (const t of partir(datos.observaciones, tb.concepto.ancho, ex.obsSize)) { txt(tb.concepto.x, y, t, { size: ex.obsSize }); y += ex.obsPitch; }
        desborda = y - ex.obsPitch > tb.fondo;
    }

    // Totales
    const to = cfg.totales;
    txt(to.base.x, to.base.y, eur(calculo.base), { size: to.base.size, align: to.base.align, bold: to.base.bold });
    txt(to.iva.x, to.iva.y, eur(calculo.iva), { size: to.iva.size, align: to.iva.align, bold: to.iva.bold });
    txt(to.total.x, to.total.y, eur(calculo.total), { size: to.total.size, align: to.total.align, bold: to.total.bold, col: to.total.color });

    pdf.setTitle(`${esPresupuesto ? 'Presupuesto' : 'Factura'} ${calculo.numero}`);
    pdf.setProducer('BROKERGY');
    return { buffer: Buffer.from(await pdf.save()), desborda, numeroLargo: !numeroCabe };
}

/**
 * Las posiciones del PRESUPUESTO: las de la factura, con lo que `cfg.presupuesto`
 * sobreescriba campo a campo (en `tabla` y `totales`, también un nivel más abajo:
 * `{ tabla: { y: 260 } }` no borra las columnas). Lo demás de `cfg.presupuesto`
 * (fondo, ejemplo, notas, validez) no son posiciones y aquí no se miran.
 */
function cfgPresupuesto(cfg) {
    const p = cfg?.presupuesto || {};
    const fundir = (a, b) => {
        if (!b || typeof b !== 'object' || Array.isArray(b)) return a;
        const o = { ...(a || {}) };
        for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' ? { ...a[k], ...v } : v;
        return o;
    };
    return {
        ...cfg,
        numero: fundir(cfg.numero, p.numero), fecha: fundir(cfg.fecha, p.fecha),
        tabla: fundir(cfg.tabla, p.tabla), totales: fundir(cfg.totales, p.totales),
        extra: fundir(cfg.extra, p.extra),
    };
}

// ── Guardar: lo mismo que una factura subida al apartado ─────────────────────

/** La fila de `documentacion.facturas[]`, con los campos que rellena el OCR (facturaAutoOcr.buildPatch). */
function patchFila(calculo, { exp, op, instalador }) {
    const { buildPatch } = require('./facturaAutoOcr');
    const ocrLike = {
        numero_factura: calculo.numero,
        fecha_factura: calculo.fecha,
        totales: { base_imponible: calculo.base, total: calculo.total, iva_pct: calculo.ivaPct },
        emisor: { nombre: instalador?.razon_social || '', nif: instalador?.cif || '' },
        lineas: calculo.lineas.map(l => ({ descripcion: l.texto, partida: l.partida, importe_total: l.importe })),
    };
    const expAlcance = { ...exp, documentacion: { envolvente: exp.documentacion?.envolvente || {} } };
    const patch = buildPatch(ocrLike, { exp: expAlcance, op: { ficha: op.ficha, datos_calculo: { inputs: op.inputs || {} } } }) || {};
    patch.origen = 'generada';
    patch.ocr_pendiente_revision = false;
    patch.concepto = calculo.lineas[0]?.texto || '';
    patch.generada = {
        at: new Date().toISOString(),
        por: 'instalador',
        modo: calculo.modo || 'partidas',
        partidas: calculo.lineas.map(l => ({ cantidad: l.cantidad, precio: l.precio })),
        // Los conceptos con los que salió, solo si se cambió alguno: para volver a abrirla igual.
        ...(calculo.conceptosCambiados ? { conceptos: calculo.lineas.map(l => l.texto) } : {}),
        ...(calculo.sustituye?.length ? { sustituye: calculo.sustituye } : {}),
    };
    return patch;
}

/** Referencia de una factura del expediente para la página: nunca su enlace de Drive (regla 1). */
const refFactura = (f) => require('crypto').createHash('sha256').update(String(f?.drive_id || '')).digest('hex').slice(0, 12);

/**
 * Las facturas que la nueva puede SUSTITUIR (Fran, 18/11/2026: «que se pueda editar la factura a
 * través de la app; si se valida, que se sustituya la existente: puede darse el caso de errores»):
 * la que ya hizo aquí (siempre, revisada o no) y la que el instalador elija de las que subió.
 */
function aSustituir(ctx, ref) {
    const out = [];
    if (ctx.generada?.drive_id) out.push(ctx.generada);
    if (ref) {
        const f = (ctx.subidas || []).find(x => refFactura(x) === ref);
        if (f && !out.includes(f)) out.push(f);
    }
    return out;
}

/**
 * Guarda la factura generada como una subida del instalador a DOC_FACTURAS.
 * SUSTITUYE (fichero a la papelera de Drive, entrada del apartado y fila) a la que ya
 * hizo aquí —aunque estuviera revisada: la nueva vuelve a revisión— y, si la elige
 * (`sustituir` = su referencia), a una de las que subió.
 * `escribir: false` = en seco: no toca Drive ni la BD y devuelve lo que haría.
 */
async function guardarFactura({ ctx, calculo, buffer, escribir = true, sustituir = null }) {
    const supabase = require('./supabaseClient');
    const reformaUploadService = require('./reformaUploadService');
    const driveService = require('./driveService');
    const { exp } = ctx;
    const uuid = exp.oportunidad_id;
    const retirar = aSustituir(ctx, sustituir);
    const sustituye = retirar.map(f => ({
        numero: f.numero_factura || null, fecha: f.fecha_factura || null,
        origen: f.generada ? 'generada' : (f.origen || 'subida'), validada: f.validada === true,
    }));
    const patch = patchFila({ ...calculo, sustituye }, ctx);
    const fileName = `${exp.numero_expediente} - Factura ${calculo.numero.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;
    if (!escribir) return { enSeco: true, fileName, patch, sustituye };

    // Una sola fila: aquí sí hace falta `datos_calculo` (lo pide el checklist), como en resolverDestinoSubida.
    const { data: opp, error } = await supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo').eq('id', uuid).maybeSingle();
    if (error || !opp) { const e = new Error(error?.message || 'Oportunidad no encontrada'); e.status = 503; throw e; }
    // El MISMO checklist que la subida pública: si el apartado no está, aquí tampoco.
    const checklist = await reformaUploadService.checklistForOportunidad(opp);
    const slotDef = checklist.find(s => s.key === 'DOC_FACTURAS');
    if (!slotDef) throw new Error('Este expediente no tiene el apartado de facturas.');

    const { subidas, fallidas } = await reformaUploadService.subirFicherosASlot({
        oportunidadUuid: uuid, datosCalculo: opp.datos_calculo || {}, slotDef,
        archivos: [{ buffer, mimetype: 'application/pdf', originalname: fileName }],
        subidoPor: 'instalador',
    });
    const s = subidas[0];
    if (!s) throw new Error(fallidas[0]?.error || 'No se pudo guardar la factura en Drive.');

    await reformaUploadService.addFacturaToExpediente(uuid, s.link, s.driveId);
    const { error: e2 } = await supabase.rpc('update_expediente_factura_by_driveid', {
        p_oportunidad_id: uuid, p_drive_id: s.driveId, p_patch: patch,
    });
    if (e2) console.warn('[facturaInstalador] rpc update:', e2.message);

    // Las que sustituye se retiran DESPUÉS de guardar la nueva (si la subida falla, la de
    // antes sigue en su sitio): fichero a la papelera de Drive (se puede recuperar), su
    // entrada del apartado —leída otra vez, que ya lleva la nueva— y su fila.
    if (retirar.length) {
        const ids = new Set(retirar.map(f => f.drive_id).filter(id => id && id !== s.driveId));
        for (const id of ids) {
            try { await driveService.deleteFile(id); } catch (e) { console.warn('[facturaInstalador] retirar anterior:', e.message); }
        }
        const { data: ahora } = await supabase.from('oportunidades')
            .select('slot:datos_calculo->reforma_uploads->DOC_FACTURAS').eq('id', uuid).maybeSingle();
        const list = Array.isArray(ahora?.slot) ? ahora.slot : [];
        if (list.some(it => ids.has(it.driveId))) {
            const { error: e1 } = await supabase.rpc('reforma_replace_slot', {
                p_id: uuid, p_slot: 'DOC_FACTURAS', p_array: list.filter(it => !ids.has(it.driveId)),
            });
            if (e1) console.warn('[facturaInstalador] reforma_replace_slot:', e1.message);
        }
        for (const id of ids) await reformaUploadService.removeFacturaFromExpediente(uuid, id);
    }

    try {
        require('./uploadNotifier').registrarSubida({
            oportunidadUuid: uuid, slotKey: 'DOC_FACTURAS',
            slotLabel: `${slotDef.label} (hecha en la app${sustituye.length ? `, sustituye a la ${sustituye.map(f => f.numero || 'sin número').join(' y la ')}` : ''})`,
            fase: slotDef.fase || null, subidoPor: 'instalador',
        });
    } catch (e) { console.warn('[facturaInstalador] aviso:', e.message); }

    return { fileName, link: s.link, driveId: s.driveId, patch, sustituye };
}

module.exports = { plantillaDe, datosFactura, calcular, componerPdf, cfgPresupuesto, guardarFactura, patchFila, aSustituir, refFactura, eur, fechaTexto, partidaDe };
