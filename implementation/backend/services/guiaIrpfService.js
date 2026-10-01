// ─── guiaIrpfService.js ──────────────────────────────────────────────────────
// La GUÍA de la deducción del IRPF, servida desde el backend, y el envío al
// cliente de sus certificados + la guía con un solo botón.
//
// QUÉ dice la guía vive en `frontend/.../logic/guiaIrpf.js` y se carga por
// import() ESM (como `borradorCeeService` con `borradorCee.js`). Aquí solo se
// reúnen los datos de los DOS negocios —el expediente CAE y el CEE directo—, se
// buscan en Drive los PDF firmados de los certificados, se rasteriza, se guarda y
// se envía. Si el popup y el envío compusieran la guía cada uno por su cuenta, el
// documento que se revisa y el que recibe el cliente podrían no ser el mismo.
//
// REGLA — se envían SOLO los PDF FIRMADOS de los certificados (slot `pdf`,
// `…_fdo.pdf`) y la guía. El `.xml` y el `.cex` son ficheros de trabajo que el
// cliente no puede abrir, y el justificante de registro no lo pide Renta Web:
// mandarlo todo hace que no sepa cuál es "su papel" (mismo criterio que
// `ceeDirectoEntrega`).
//
// REGLA — el candado de COBRO de los CEE directos también vale aquí: es otro
// camino por el que el certificado sale de la app (ver "El candado de cobro").
//
// REGLA — la guía se GUARDA en Drive cada vez que se envía o se pide guardar, y
// queda sellada en `documentacion.guia_irpf` (solo metadatos + el enlace, regla
// 21). De ahí la sirve el portal del cliente (`/mi-expediente`), así que lo que
// descarga es EXACTAMENTE lo que se le mandó. Se escribe con la RPC de MERGE y es
// CLAVE PROTEGIDA del autoguardado (la copia hidratada de la ficha la borraría).
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const pdfService = require('./pdfService');
const driveService = require('./driveService');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');

let _logica = null;
function logica() {
    if (!_logica) {
        _logica = import(pathToFileURL(
            path.join(__dirname, '../../frontend/src/features/expedientes/logic/guiaIrpf.js')
        ).href);
    }
    return _logica;
}

const CAMPO = 'guia_irpf';
const error = (status, msg) => Object.assign(new Error(msg), { status });
const txt = (v) => (v == null ? '' : String(v).trim());
const nombreDe = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');
const iso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };

/** Lo que identifica a BROKERGY como emisor de la factura de los certificados. */
const BROKERGY = { nombre: 'BROKERGY · SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL', nif: 'B19350222' };

// ─── Carga ───────────────────────────────────────────────────────────────────

async function cargarCtx(origen, id) {
    if (origen === 'cee_directo') {
        const svc = require('./ceeDirectoService');
        const row = await svc.cargar(id);
        if (!row) throw error(404, 'CEE no encontrado');
        return { origen, row, cliente: row.cliente || null, op: null, instalador: null };
    }

    // `*`: es UN expediente (regla 22) y hace falta `cee` entero (los .xml) para
    // rescatar el consumo de los certificados antiguos.
    const { data: row, error: e } = await supabase.from('expedientes').select('*').eq('id', id).maybeSingle();
    if (e) throw new Error(e.message);
    if (!row) throw error(404, 'Expediente no encontrado');

    const [{ data: cliente }, { data: op }] = await Promise.all([
        row.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', row.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
        row.oportunidad_id
            // Solo los `inputs`: `datos_calculo` entero pesa megas.
            ? supabase.from('oportunidades')
                .select('id, ref_catastral, referencia_cliente, prescriptor_id, instalador_asociado_id, inputs:datos_calculo->inputs')
                .eq('id', row.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    // Quien ha hecho la obra: el instalador de la ficha de Instalación, el del
    // expediente o el de la oportunidad. NUNCA el prescriptor a secas: puede ser
    // un distribuidor, y su NIF en la casilla de "quien ha realizado las obras"
    // sería falso.
    const insId = row.instalacion?.instalador_id || row.instalador_asociado_id || op?.instalador_asociado_id || null;
    let instalador = null;
    if (insId) {
        const { data } = await supabase.from('prescriptores')
            .select('id_empresa, razon_social, acronimo, cif, tipo_empresa').eq('id_empresa', insId).maybeSingle();
        instalador = data || null;
    }
    return { origen, row, cliente: cliente || null, op: op || null, instalador };
}

// ─── Los certificados de cada lado ──────────────────────────────────────────

/** En un CEE directo de UN solo certificado el "antes" es el que trajo el cliente. */
const esUnico = (ctx) => ctx.origen === 'cee_directo' && String(ctx.row.alcance || 'UNICO').toUpperCase() !== 'DOBLE';

function lados(ctx) {
    const { fechaFirmaCee } = require('../utils/ceeFechas');
    const cee = ctx.row.cee || {};
    if (esUnico(ctx)) {
        return {
            anterior: { cee: cee.cee_anterior || null, xml: null, fecha: iso(cee.cee_anterior?.fechaFirma), rotulo: 'CEE anterior del cliente', fase: null },
            posterior: { cee: cee.cee_inicial || null, xml: cee.xml_inicial || null, fecha: fechaFirmaCee(ctx.row, 'inicial'), rotulo: 'CEE de este encargo', fase: 'inicial' },
        };
    }
    return {
        anterior: { cee: cee.cee_inicial || null, xml: cee.xml_inicial || null, fecha: fechaFirmaCee(ctx.row, 'inicial'), rotulo: 'CEE inicial', fase: 'inicial' },
        posterior: { cee: cee.cee_final || null, xml: cee.xml_final || null, fecha: fechaFirmaCee(ctx.row, 'final'), rotulo: 'CEE final', fase: 'final' },
    };
}

/** El PDF FIRMADO de una fase en Drive: { id, name } o null. Sin crear nada. */
async function pdfFirmado(ctx, fase) {
    if (!fase) return null;
    try {
        if (ctx.origen === 'cee_directo') {
            const uploads = require('./ceeDirectoUploadService');
            const enDrive = await uploads.scanSection(ctx.row, fase);
            return enDrive.pdf?.id ? { id: enDrive.pdf.id, name: enDrive.pdf.name } : null;
        }
        const ceeUploadService = require('./ceeUploadService');
        const raiz = await ceeUploadService.resolveDriveFolderId(ctx.row);
        if (!raiz) return null;
        const ceeRoot = await driveService.findSubfolderByName(raiz, '1. CEE');
        if (!ceeRoot) return null;
        const seccion = await driveService.findSubfolderByName(ceeRoot, ceeUploadService.sectionLabel(fase));
        if (!seccion) return null;
        const files = await driveService.listFiles(seccion);
        const f = files.find(x => x.mimeType !== 'application/vnd.google-apps.folder'
            && ceeUploadService.matchSlot(x.name) === 'pdf');
        return f ? { id: f.id, name: f.name } : null;
    } catch (e) {
        console.warn(`[guia-irpf] no se pudo mirar el PDF del CEE ${fase}:`, e.message);
        return null;
    }
}

// ─── Facturas ────────────────────────────────────────────────────────────────

/**
 * Las facturas que la app ya conoce, con lo que se sabe de cada una. En el CAE,
 * las de la obra (`documentacion.facturas[]`); en un CEE directo, las que le
 * hemos emitido nosotros por los certificados: su coste también cuenta para la
 * deducción («así como la emisión de los correspondientes certificados»), pero
 * BROKERGY no "ha realizado las obras", así que no aporta NIF a esa casilla.
 */
function facturasConocidas(ctx) {
    const doc = ctx.row.documentacion || {};
    if (ctx.origen === 'cee_directo') {
        const emitidas = doc.facturas_emitidas && typeof doc.facturas_emitidas === 'object' ? Object.values(doc.facturas_emitidas) : [];
        return emitidas
            // La que se facturó al PARTNER no la pagó el cliente: no es suya.
            .filter(f => f && f.destino !== 'partner' && num(f.total) > 0)
            .map(f => ({
                id: `ing_${f.numero}`,
                numero: f.numero || '',
                fecha: iso(f.fecha),
                emisor: BROKERGY.nombre,
                nif: BROKERGY.nif,
                importe_con_iva: num(f.total),
                certificado: true,
                origen: 'certificados',
            }));
    }
    // En RES060/RES093/TER la actuación ES la bomba de calor y toda factura es
    // del instalador (lo vigila facturaIncidencias · EMISOR). En un RES080 la
    // envolvente la factura otro gremio: ahí no se le pone el NIF del instalador
    // a una factura que no lo dice.
    const porInstalador = !String(ctx.row.numero_expediente || '').toUpperCase().includes('RES080');
    const ins = ctx.instalador;
    return (Array.isArray(doc.facturas) ? doc.facturas : []).map((f, i) => {
        const emisorObj = f.emisor && typeof f.emisor === 'object' ? f.emisor : null;
        const emisor = txt(f.emisor_nombre) || txt(emisorObj?.nombre) || (typeof f.emisor === 'string' ? txt(f.emisor) : '')
            || txt(f.proveedor) || (porInstalador ? txt(ins?.razon_social) : '');
        const nif = txt(f.emisor_nif) || txt(emisorObj?.nif) || (porInstalador ? txt(ins?.cif) : '');
        return {
            id: f.drive_id || `f${i}`,
            numero: f.numero_factura || f.numero || '',
            fecha: iso(f.fecha_factura || f.fecha),
            emisor,
            nif,
            importe_con_iva: num(f.importe_con_iva) || num(f.importe_con_iva_factura) || null,
            importe_sin_iva: num(f.importe_sin_iva),
            origen: 'expediente',
        };
    });
}

/** Los ajustes del popup, saneados: nada que no sea un número o un texto corto. */
function sanearAjustes(a) {
    const out = {};
    if (!a || typeof a !== 'object') return out;
    if (['unifamiliar', 'piso', 'bloque'].includes(a.tipo)) out.tipo = a.tipo;
    const p = Math.round(num(a.propietarios) || 0);
    if (p >= 1 && p <= 10) out.propietarios = p;
    const corto = (v, n = 120) => txt(v).slice(0, n);
    const linea = (f) => ({
        incluir: f?.incluir !== false,
        ...(num(f?.importe) > 0 ? { importe: Math.round(num(f.importe) * 100) / 100 } : {}),
        ...(f?.numero != null ? { numero: corto(f.numero, 40) } : {}),
        ...(iso(f?.fecha) ? { fecha: iso(f.fecha) } : {}),
        ...(f?.emisor != null ? { emisor: corto(f.emisor) } : {}),
        ...(f?.nif != null ? { nif: corto(f.nif, 20).toUpperCase() } : {}),
    });
    if (a.facturas && typeof a.facturas === 'object' && !Array.isArray(a.facturas)) {
        out.facturas = {};
        for (const [id, f] of Object.entries(a.facturas).slice(0, 50)) out.facturas[corto(id, 80)] = linea(f);
    }
    if (Array.isArray(a.extra)) {
        out.extra = a.extra.slice(0, 20)
            .map((f, i) => ({ id: corto(f?.id, 40) || `x${i}`, ...linea(f) }))
            .filter(f => f.importe > 0);
    }
    return out;
}

/** Facturas conocidas + lo tocado en el popup + las añadidas a mano. */
function facturasConAjustes(conocidas, ajustes) {
    const tocadas = ajustes.facturas || {};
    const lista = conocidas.map(f => {
        const o = tocadas[f.id];
        if (!o) return { ...f, incluir: true };
        return {
            ...f,
            incluir: o.incluir !== false,
            ...(o.importe > 0 ? { importe_con_iva: o.importe, ivaEstimado: false } : {}),
            ...(o.numero != null ? { numero: o.numero } : {}),
            ...(o.fecha ? { fecha: o.fecha } : {}),
            ...(o.emisor != null ? { emisor: o.emisor } : {}),
            ...(o.nif != null ? { nif: o.nif } : {}),
        };
    });
    for (const x of (ajustes.extra || [])) {
        lista.push({ ...x, importe_con_iva: x.importe, origen: 'manual' });
    }
    return lista;
}

// ─── Componer ────────────────────────────────────────────────────────────────

function propietariosDe(ctx, ajustes) {
    if (ajustes.propietarios) return ajustes.propietarios;
    const cop = Array.isArray(ctx.cliente?.copropietarios) ? ctx.cliente.copropietarios.filter(Boolean) : [];
    if (cop.length) return 1 + cop.length;
    const n = Math.round(num(ctx.op?.inputs?.numOwners) || 1);
    return n > 1 ? n : 1;
}

function viviendaDe(ctx) {
    const r = ctx.row;
    if (ctx.origen === 'cee_directo') {
        const dir = [txt(r.direccion), [txt(r.codigo_postal), txt(r.municipio)].filter(Boolean).join(' '),
            txt(r.provincia) && `(${txt(r.provincia)})`].filter(Boolean).join(', ').replace(', (', ' (');
        return { direccion: dir, refCatastral: txt(r.ref_catastral), provincia: txt(r.provincia) };
    }
    const { buildCertClienteData } = require('./certClienteData');
    const op = ctx.op ? { ...ctx.op, datos_calculo: { inputs: ctx.op.inputs || {} } } : null;
    const { data } = buildCertClienteData(r, op, ctx.cliente);
    return {
        direccion: data.direccionInstalacion || data.direccion || '',
        refCatastral: txt(r.instalacion?.ref_catastral) || data.refCatastral || '',
        provincia: txt(r.instalacion?.provincia) || txt(ctx.op?.inputs?.provincia) || txt(ctx.cliente?.provincia),
    };
}

/**
 * La participación del inmueble en el CATASTRO, que es lo que decide si es un
 * piso (< 100 %: finca en división horizontal → deducción del 40 %), igual que
 * al calcular la oportunidad (`PropertySheet` → `inputs.participation`).
 *
 * En el CAE ya viene en la simulación; si no, y en un CEE directo —que no tiene
 * oportunidad—, se le pregunta al Catastro por la referencia del inmueble. Va por
 * `catastroService.getByRC`, que respeta el WAF y cachea por referencia: abrir y
 * recomponer el popup no son peticiones nuevas. Una referencia de 14 caracteres
 * es la PARCELA y no tiene participación de nadie.
 */
async function participacionDe(ctx) {
    const enSimulacion = ctx.op?.inputs?.participation;
    if (enSimulacion != null && enSimulacion !== '') return { participacion: enSimulacion };
    const rc = txt(ctx.origen === 'cee_directo' ? ctx.row.ref_catastral : (ctx.row.instalacion?.ref_catastral || ctx.op?.ref_catastral))
        .replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (rc.length !== 20) return { participacion: null };
    try {
        const r = await require('./catastroService').getByRC(rc);
        const x = Array.isArray(r) ? r[0] : r;
        return { participacion: x?.participation ?? null };
    } catch (e) {
        console.warn(`[guia-irpf] Catastro (${rc}):`, e.message);
        return { participacion: null, catastroError: e.message || 'sin respuesta' };
    }
}

/** Los datos para `componerGuia`, a partir del expediente y de los ajustes. */
async function datosGuia(ctx, ajustes) {
    const l = lados(ctx);
    const ins = ctx.instalador;
    // Si el tipo lo ha elegido una persona, el Catastro no decide nada: no se pregunta.
    const cat = ajustes.tipo ? { participacion: null } : await participacionDe(ctx);
    return {
        participacion: cat.participacion,
        catastroError: cat.catastroError || null,
        numeroExpediente: ctx.row.numero_expediente || '',
        negocio: ctx.origen === 'cee_directo' ? 'cee_directo' : 'cae',
        titular: { nombre: nombreDe(ctx.cliente), nif: txt(ctx.cliente?.dni).toUpperCase() },
        propietarios: propietariosDe(ctx, ajustes),
        vivienda: viviendaDe(ctx),
        tipoSimulacion: ctx.op?.inputs?.tipo === 'piso' ? 'piso' : (ctx.op?.inputs?.tipo === 'unifamiliar' ? 'unifamiliar' : null),
        tipoManual: ajustes.tipo || null,
        anterior: l.anterior,
        posterior: l.posterior,
        facturas: facturasConAjustes(facturasConocidas(ctx), ajustes),
        obras: ins?.cif ? [{ nif: ins.cif, nombre: ins.razon_social || ins.acronimo || '' }] : [],
        hoy: new Date().toISOString().slice(0, 10),
    };
}

/** Los ajustes que valen: los que llegan del popup o, si no llega ninguno, los guardados. */
function ajustesDe(ctx, body) {
    if (body && body.ajustes && typeof body.ajustes === 'object') return sanearAjustes(body.ajustes);
    return sanearAjustes(ctx.row.documentacion?.[CAMPO]?.ajustes);
}

async function componerCtx(ctx, ajustes) {
    const { componerGuia, buildGuiaIrpfHtml } = await logica();
    const guia = componerGuia(await datosGuia(ctx, ajustes));
    return { guia, html: guia.puede ? buildGuiaIrpfHtml(guia) : null };
}

// ─── Estado (lo que pinta el popup) ──────────────────────────────────────────

/**
 * Todo lo que el popup necesita: la guía compuesta, las facturas editables, qué
 * adjuntos hay, a quién se manda y con qué texto, y lo que impide enviar.
 */
async function estado(origen, id, body = null) {
    const ctx = await cargarCtx(origen, id);
    const ajustes = ajustesDe(ctx, body);
    const { guia } = await componerCtx(ctx, ajustes);
    const { mensajeGuiaIrpf, asuntoGuiaIrpf, facturaConIva } = await logica();

    const l = lados(ctx);
    const [pdfAnt, pdfPos] = await Promise.all([pdfFirmado(ctx, l.anterior.fase), pdfFirmado(ctx, l.posterior.fase)]);
    const adjuntos = esUnico(ctx)
        ? [{ clave: 'posterior', rotulo: 'Certificado de eficiencia energética (este encargo)', fichero: pdfPos?.name || null }]
        : [
            { clave: 'anterior', rotulo: 'CEE inicial · antes de la obra', fichero: pdfAnt?.name || null },
            { clave: 'posterior', rotulo: 'CEE final · después de la obra', fichero: pdfPos?.name || null },
        ];

    const svc = require('./ceeDirectoService');
    const contacto = svc.contactoCliente(ctx.cliente);
    // Lo último que se le mandó: si el porcentaje cambia, el mensaje es una CORRECCIÓN.
    const sello = ctx.row.documentacion?.[CAMPO] || null;
    const previa = sello?.enviada && sello?.modalidad ? { modalidad: String(sello.modalidad), at: sello.enviada.at } : null;

    const bloqueos = [];
    const avisos = [...guia.avisos];
    if (!guia.puede) bloqueos.push(guia.motivo);
    for (const a of adjuntos) if (!a.fichero) bloqueos.push(`Falta el PDF firmado del ${a.rotulo.split(' · ')[0]} en su carpeta de Drive (…_fdo.pdf).`);
    if (origen === 'cee_directo' && !ctx.row.cobrado) {
        bloqueos.push('El encargo no está cobrado: el certificado no sale de la app hasta marcarlo como cobrado.');
    }
    if (origen === 'expediente') {
        const portal = require('./portalService');
        if (!portal.certificadosLiberados(ctx.row.estado)) {
            avisos.push(`El expediente está en «${ctx.row.estado || '—'}»: hasta DOC. COMPLETA los certificados pueden volver a emitirse, y el cliente se quedaría con una versión que ya no vale.`);
        }
    }
    const seg = ctx.row.seguimiento || {};
    for (const fase of [l.anterior.fase, l.posterior.fase].filter(Boolean)) {
        if (seg[`cee_${fase}`] && seg[`cee_${fase}`] !== 'REGISTRADO') {
            avisos.push(`El CEE ${fase} no consta REGISTRADO todavía.`);
        }
    }

    const nCerts = adjuntos.length;
    // Las facturas tal cual se editan en el popup: con su importe con IVA ya
    // resuelto (y si es supuesto, marcado).
    const facturas = facturasConAjustes(facturasConocidas(ctx), ajustes).map(f => {
        const { importe, ivaEstimado } = facturaConIva(f);
        return {
            id: f.id, numero: f.numero || '', fecha: f.fecha || null, emisor: f.emisor || '', nif: f.nif || '',
            importe, ivaEstimado, base: f.importe_sin_iva ?? null, incluir: f.incluir !== false,
            origen: f.origen || 'expediente', certificado: !!f.certificado,
        };
    });

    return {
        guia,
        ajustes,
        facturas,
        adjuntos,
        bloqueos,
        // Lo que impide que haya GUÍA (no que se envíe): lo que enseña el popup
        // abierto desde la entrega, donde el cobro y los PDF los vigila la entrega.
        bloqueosGuia: guia.puede ? [] : [guia.motivo],
        avisos,
        puede: bloqueos.length === 0,
        destinatario: { nombre: contacto.nombre || nombreDe(ctx.cliente), email: contacto.email || '', tlf: contacto.tlf || '' },
        mensaje: mensajeGuiaIrpf(guia, { nombre: contacto.nombre || nombreDe(ctx.cliente), certificados: nCerts, previa }),
        asunto: asuntoGuiaIrpf(guia, { previa }),
        previa,
        guardada: ctx.row.documentacion?.[CAMPO] || null,
    };
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const nombreGuia = (numero) => `${numero || 'expediente'} – GUÍA DEDUCCIÓN IRPF.pdf`;

async function pdf(origen, id, body = null) {
    const ctx = await cargarCtx(origen, id);
    const ajustes = ajustesDe(ctx, body);
    const { guia, html } = await componerCtx(ctx, ajustes);
    if (!html) throw error(409, guia.motivo || 'Los certificados no permiten aplicar ninguna deducción.');
    const buffer = await pdfService.documentoAPdf({ html });
    return { ctx, guia, ajustes, buffer, filename: nombreGuia(ctx.row.numero_expediente) };
}

// ─── Guardar en Drive + sello ────────────────────────────────────────────────

/** La carpeta donde vive la guía: `1. CEE` en el CAE, la raíz del encargo en un CEE directo. */
async function carpetaGuia(ctx) {
    if (ctx.origen === 'cee_directo') return ctx.row.drive_folder_id || null;
    const ceeUploadService = require('./ceeUploadService');
    const raiz = await ceeUploadService.resolveDriveFolderId(ctx.row);
    if (!raiz) return null;
    return driveService.getOrCreateSubfolder(raiz, '1. CEE');
}

async function mergeSello(ctx, valor) {
    if (ctx.origen === 'cee_directo') {
        return require('./ceeDirectoService').mergeDoc(ctx.row.id, CAMPO, valor);
    }
    const { error: e } = await supabase.rpc('merge_expediente_doc_json', {
        p_expediente_id: ctx.row.id, p_field: CAMPO, p_value: valor,
    });
    if (e) throw new Error(e.message);
}

async function anotarHistorial(ctx, texto, usuario) {
    if (ctx.origen === 'cee_directo') {
        return require('./ceeDirectoService').anotarHistorial(ctx.row.id, { tipo: 'CLIENTE', texto: texto.toUpperCase(), usuario });
    }
    // Lectura FRESCA y antes del sello: el historial es un read-modify-write de
    // `documentacion`, y hecho después se llevaría por delante lo recién sellado.
    const { data } = await supabase.from('expedientes').select('documentacion').eq('id', ctx.row.id).maybeSingle();
    const doc = data?.documentacion || {};
    const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
    historial.push({ id: `${Date.now()}_guia_irpf`, tipo: 'guia_irpf', texto, fecha: new Date().toISOString(), usuario: usuario || 'SISTEMA' });
    const { error: e } = await supabase.from('expedientes')
        .update({ documentacion: { ...doc, historial }, updated_at: new Date().toISOString() }).eq('id', ctx.row.id);
    if (e) console.warn('[guia-irpf] historial:', e.message);
}

/**
 * Sube el PDF de la guía a su carpeta SUSTITUYENDO el anterior (el nuevo primero,
 * el viejo a la papelera después: nunca se queda sin ninguno) y devuelve lo que
 * hay que sellar. Mismo criterio que el borrador de presentación del CEE: es un
 * documento derivado que se rehace de un clic.
 */
async function subirGuia(ctx, buffer, filename) {
    const carpeta = await carpetaGuia(ctx);
    if (!carpeta) throw error(409, 'El expediente no tiene carpeta de Drive.');
    const previos = await driveService.findFilesByName(carpeta, filename);
    const subido = await driveService.saveFileToFolder(carpeta, filename, 'application/pdf', buffer, { throwOnError: true });
    for (const prev of previos) if (prev && prev !== subido?.id) await driveService.deleteFile(prev);
    return { drive_id: subido?.id || null, link: subido?.link || null, nombre: filename };
}

function selloDe(guia, ajustes, subido, usuario) {
    return {
        ...subido,
        generada_at: new Date().toISOString(),
        generada_por: usuario || null,
        modalidad: guia.modalidad,
        tipo: guia.tipo,
        total: guia.total,
        anio: guia.anio,
        // Con el EJEMPLO no hay estimación que guardar: sellar los 96 € que
        // saldrían de la factura de los certificados sería guardar un dato falso.
        deduccion_estimada: guia.ejemplo ? null : (guia.calendario?.porPropietario || 0),
        ejemplo: guia.ejemplo ? { importe: guia.ejemplo.importe, deduccion: guia.ejemplo.calendario?.porPropietario || 0 } : null,
        propietarios: guia.propietarios,
        ajustes,
    };
}

async function guardar(origen, id, body = null, { usuario = null } = {}) {
    const { ctx, guia, ajustes, buffer, filename } = await pdf(origen, id, body);
    const subido = await subirGuia(ctx, buffer, filename);
    await anotarHistorial(ctx, `Guía de la deducción del IRPF (${guia.modalidad} %) guardada en Drive`, usuario);
    await mergeSello(ctx, selloDe(guia, ajustes, subido, usuario));
    return { guardado: true, ...subido };
}

/**
 * Guarda SOLO los ajustes del popup (tipo de vivienda, propietarios, facturas).
 *
 * REGLA — lo que se toca en el popup se guarda solo. Antes vivía en el estado del
 * popup hasta pulsar «Guardar», y la ENTREGA del CEE directo —que sale sola al
 * marcar cobrado— usa los ajustes GUARDADOS: en 2026CEE_60 se cambió a «piso», se
 * cerró el popup sin guardar, se marcó cobrado y la clienta recibió la guía al
 * 60 %. Sin PDF ni Drive: es una escritura pequeña que el popup hace con freno.
 */
async function guardarAjustes(origen, id, body = {}, { usuario = null } = {}) {
    const ctx = await cargarCtx(origen, id);
    const ajustes = sanearAjustes(body.ajustes);
    await mergeSello(ctx, { ajustes, ajustes_at: new Date().toISOString(), ajustes_por: usuario || null });
    return { guardado: true, ajustes };
}

// ─── Enviar ──────────────────────────────────────────────────────────────────

/**
 * Manda al cliente sus certificados firmados + la guía, por email y/o WhatsApp.
 *
 * Todo o nada con los adjuntos: se preparan ANTES de enviar nada, y si falta
 * uno no sale el mensaje — anunciar dos certificados y mandar uno deja al
 * cliente buscando lo que no llegó.
 */
async function enviar(origen, id, body = {}, { usuario = null } = {}) {
    const st = await estado(origen, id, body);
    if (!st.puede) throw error(409, st.bloqueos.join(' '));

    const canales = (Array.isArray(body.canales) ? body.canales : []).filter(c => c === 'email' || c === 'whatsapp');
    if (!canales.length) throw error(400, 'Elige al menos un canal.');
    const email = txt(body.destinatario?.email ?? st.destinatario.email);
    const tlf = txt(body.destinatario?.tlf ?? st.destinatario.tlf);
    if (canales.includes('email') && !email) throw error(400, 'No hay email al que enviarlo.');
    if (canales.includes('whatsapp') && !tlf) throw error(400, 'No hay teléfono al que enviarlo.');

    const { ctx, guia, ajustes, buffer, filename } = await pdf(origen, id, body);
    const numero = ctx.row.numero_expediente || 'expediente';

    // Los certificados, con un nombre que el cliente entiende: "el de antes" y "el
    // de después", no `– CEE INICIAL_fdo.pdf`.
    const l = lados(ctx);
    const piezas = esUnico(ctx)
        ? [[l.posterior.fase, `${numero} - CERTIFICADO DE EFICIENCIA ENERGÉTICA.pdf`, 'certificado energético']]
        : [[l.anterior.fase, `${numero} - CEE ANTES DE LA OBRA.pdf`, 'certificado de ANTES de la obra'],
            [l.posterior.fase, `${numero} - CEE DESPUÉS DE LA OBRA.pdf`, 'certificado de DESPUÉS de la obra']];
    const adjuntos = [];
    for (const [fase, nombre, etiqueta] of piezas) {
        const f = await pdfFirmado(ctx, fase);
        const buf = f ? await driveService.getFileContent(f.id).catch(() => null) : null;
        if (!buf || !buf.length) throw error(409, `No se ha podido descargar de Drive el PDF del CEE ${fase}: no se envía nada.`);
        adjuntos.push({ filename: nombre, content: buf, contentType: 'application/pdf', etiqueta });
    }
    adjuntos.push({ filename: filename.replace(' – ', ' - '), content: buffer, contentType: 'application/pdf', etiqueta: 'guía para la deducción en la Renta' });

    const cuerpo = txt(body.mensaje) || st.mensaje;
    const enviados = [];
    const errores = [];

    if (canales.includes('email')) {
        try {
            const limpio = cuerpo.replace(/\*/g, '');
            const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;font-size:15px;line-height:24px">${limpio.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\r|\n/g, '<br>')}</div>`;
            await emailService.sendMail({
                to: email, subject: st.asunto, text: limpio, html,
                attachments: adjuntos.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
            });
            enviados.push('email');
        } catch (e) { errores.push(`email: ${e.message}`); }
    }
    if (canales.includes('whatsapp')) {
        try {
            // El texto PRIMERO y aparte, y cada PDF con una etiqueta corta: un texto
            // largo como pie de un adjunto hace que mucha gente no abra el fichero.
            await whatsappService.sendText(tlf, cuerpo);
            for (const a of adjuntos) {
                await whatsappService.sendMedia(tlf,
                    { base64: a.content.toString('base64'), filename: a.filename, mimetype: 'application/pdf' },
                    { caption: a.etiqueta, splitCaption: false });
            }
            enviados.push('whatsapp');
        } catch (e) { errores.push(`whatsapp: ${e.message}`); }
    }
    if (!enviados.length) throw error(502, `No se pudo enviar: ${errores.join(' · ')}`);

    // La guía que recibe el cliente es la que queda en Drive (y la del portal).
    let subido = { drive_id: null, link: null, nombre: filename };
    let errorDrive = null;
    try { subido = await subirGuia(ctx, buffer, filename); }
    catch (e) { errorDrive = e.message; console.warn('[guia-irpf] no se pudo guardar en Drive:', e.message); }

    const dest = [st.destinatario.nombre, canales.includes('email') ? email : null, canales.includes('whatsapp') ? tlf : null].filter(Boolean).join(' · ');
    await anotarHistorial(ctx, st.previa && st.previa.modalidad !== guia.modalidad
        ? `Guía de la deducción del IRPF CORREGIDA (${st.previa.modalidad} % → ${guia.modalidad} %) y certificados reenviados al cliente por ${enviados.join(' + ')} (${dest})`
        : `Certificados y guía de la deducción del IRPF (${guia.modalidad} %) enviados al cliente por ${enviados.join(' + ')} (${dest})`, usuario);
    await mergeSello(ctx, {
        ...selloDe(guia, ajustes, subido.drive_id ? subido : (ctx.row.documentacion?.[CAMPO] || subido), usuario),
        enviada: {
            at: new Date().toISOString(),
            canales: enviados,
            destinatario: { nombre: st.destinatario.nombre, email: canales.includes('email') ? email : null, tlf: canales.includes('whatsapp') ? tlf : null },
            ficheros: adjuntos.map(a => a.filename),
            usuario: usuario || null,
            ...(errores.length ? { errores } : {}),
        },
    });

    return { enviado: true, canales: enviados, errores, ficheros: adjuntos.map(a => a.filename), guardada: subido, errorDrive };
}

// ─── La guía en la ENTREGA del CEE directo ───────────────────────────────────
//
// Cuando se le entrega al cliente su certificado (`ceeDirectoEntrega`, manual o
// automática, y el "Enviar al cliente" de la rejilla), la guía viaja con él si
// los certificados la acreditan. Sin esto había que mandar el certificado y,
// aparte, la guía con el certificado otra vez: dos mensajes con el mismo PDF.
//
// REGLA — va con la fase que hace de "DESPUÉS": en un encargo ÚNICO, la suya
// (el "antes" es el CEE que trajo el cliente); en uno DOBLE, la final. Con
// cualquier otra fase, o sin certificado de antes (compraventa, alquiler), no se
// menciona.
//
// REGLA — la guía NUNCA para la entrega del certificado. Lo que el cliente ha
// comprado es el certificado; si la guía no se puede componer o rasterizar, el
// certificado sale igual, sin el párrafo de la guía, y queda dicho en el resultado.
//
// Usa los ajustes GUARDADOS de la guía (tipo, propietarios, facturas añadidas en
// el popup): revisarla y guardarla antes de entregar es lo que la deja a punto.

/**
 * ¿Va la guía con la entrega de esta fase?
 * @param {object} row   el CEE directo, tal cual lo devuelve `ceeDirectoService.cargar`
 * @param {'inicial'|'final'} fase
 * @returns {Promise<{va:boolean, comparable?:boolean, motivo?:string, modalidad?:string,
 *           ejemplo?:object|null, avisos?:string[], texto?:string, _interno?:object}>}
 */
async function guiaDeEntrega(row, fase) {
    try {
        if (!row) return { va: false };
        const ctx = { origen: 'cee_directo', row, cliente: row.cliente || null, op: null, instalador: null };
        const l = lados(ctx);
        if (!l.posterior.fase || l.posterior.fase !== fase) return { va: false };
        if (!l.anterior.cee && !l.anterior.xml) return { va: false };
        const ajustes = ajustesDe(ctx, null);
        const { guia, html } = await componerCtx(ctx, ajustes);
        if (!guia.puede) return { va: false, comparable: true, motivo: guia.motivo };
        const { textoGuiaEnEntrega } = await logica();
        return {
            va: true,
            modalidad: guia.modalidad,
            ejemplo: guia.ejemplo ? { importe: guia.ejemplo.importe, deduccion: guia.ejemplo.calendario?.porPropietario || 0 } : null,
            deduccion: guia.ejemplo ? null : (guia.calendario?.porPropietario || 0),
            avisos: guia.avisos,
            texto: textoGuiaEnEntrega(guia, { unico: esUnico(ctx) }),
            fichero: nombreGuia(row.numero_expediente).replace(' – ', ' - '),
            _interno: { ctx, guia, ajustes, html },
        };
    } catch (e) {
        console.warn('[guia-irpf] no se pudo componer la guía de la entrega:', e.message);
        return { va: false, error: e.message };
    }
}

/** Lo que de `guiaDeEntrega` se puede enseñar en pantalla (sin el contexto interno). */
const guiaDeEntregaPublica = (g) => {
    if (!g) return null;
    const { _interno, ...pub } = g;  // eslint-disable-line no-unused-vars
    return pub;
};

/** El PDF de la guía de una entrega (lanza si no se puede: el llamador decide). */
async function pdfGuiaDeEntrega(g) {
    if (!g?.va || !g._interno?.html) throw new Error('La guía no aplica a esta entrega.');
    const buffer = await pdfService.documentoAPdf({ html: g._interno.html });
    return { buffer, filename: nombreGuia(g._interno.ctx.row.numero_expediente) };
}

/**
 * Tras una entrega que llevaba la guía: la guarda en Drive (es la que sirve el
 * portal) y la sella como ENVIADA, igual que el botón de la guía. Sin historial
 * propio: la entrega ya escribe el suyo, con la guía dentro.
 */
async function sellarGuiaEntregada(g, buffer, { canales = [], destinatario = {}, ficheros = [], usuario = null, automatica = false } = {}) {
    if (!g?._interno) return;
    const { ctx, guia, ajustes } = g._interno;
    const filename = nombreGuia(ctx.row.numero_expediente);
    let subido = null;
    try { subido = await subirGuia(ctx, buffer, filename); }
    catch (e) { console.warn('[guia-irpf] entrega: no se pudo guardar en Drive:', e.message); }
    await mergeSello(ctx, {
        ...selloDe(guia, ajustes, subido || ctx.row.documentacion?.[CAMPO] || { drive_id: null, link: null, nombre: filename }, usuario),
        enviada: {
            at: new Date().toISOString(),
            canales,
            destinatario: { nombre: destinatario.nombre || null, email: destinatario.email || null, tlf: destinatario.tlf || null },
            ficheros,
            usuario: usuario || null,
            via: 'entrega',
            automatica: !!automatica,
        },
    });
}

module.exports = {
    estado, pdf, guardar, guardarAjustes, enviar, sanearAjustes, nombreGuia, CAMPO,
    guiaDeEntrega, guiaDeEntregaPublica, pdfGuiaDeEntrega, sellarGuiaEntregada,
};
