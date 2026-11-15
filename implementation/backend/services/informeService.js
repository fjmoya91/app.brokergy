// ─── informeService.js ──────────────────────────────────────────────────────
// Los INFORMES técnicos ({AAAA}INF_{n}): todo lo que no es CAE ni CEE, y los
// CERTIFICADOS DE INSTALACIÓN TÉRMICA ({AAAA}CIT_{n}): el RITE suelto (Fran,
// 05/11/2026). Misma tabla y mismo circuito, cada uno con su LÍNEA
// (utils/informeEstados.js). Alta (a mano o al aceptar un presupuesto),
// documentos, firma, presentación (CIT), cobro y entrega al cliente.
//
// Lo que no se rompe (ver docs/conocimiento/informes/):
//   · El ESTADO se deriva de los sellos (utils/informeEstados.js), nunca llega
//     del navegador.
//   · Los FICHEROS los coloca el servidor: carpeta y nombre salen de la CLASE
//     del documento, nunca de una ruta que mande el cliente. Una versión nueva
//     de una clase fija archiva la anterior en OLD.
//   · Una FIRMA rota no se guarda (leerFirmasPdf), y una versión final nueva
//     deja sin efecto la firma anterior.
//   · Subir el justificante NO cobra: avisa, y una persona lo CONFIRMA con un
//     clic (Fran, 05/11/2026). Confirmar cobra la factura y lanza la entrega.
//   · La entrega es SOLO lo que dice su línea (INF: el PDF firmado; CIT: el
//     certificado oficial de eDICE), a quien PAGA, una vez (idempotente), con
//     el adjunto recomprobado al bajarlo, y con INFORME_ENTREGA_AUTO apagado en
//     local (local = producción).
//   · Al cliente no se le escribe nada más que la entrega: el resto de avisos
//     van al EQUIPO, y la factura sale por su popup con el texto a la vista.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const folders = require('./informeFolders');
const E = require('../utils/informeEstados');

const TABLA = 'informes';
const FRONTEND = () => (process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/$/, '');
const MAX_BYTES = 40 * 1024 * 1024;

const SELECT_LISTA = [
    'id, numero, anio, correlativo, linea, tipo, titulo, organismo, cliente_id, prescriptor_id, obra_ref,',
    'direccion, municipio, provincia, estado, borrador_at, final_at, firmado_at, factura_numero,',
    'factura_enviada_at, justificante_at, cobrado, cobrado_at, entregado_at, anulado_at, registrado_at,',
    'drive_folder_link, presupuesto_id, created_at, updated_at',
].join(' ');

const error = (msg, status = 400, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const txt = (v) => (v == null ? '' : String(v).trim());
const nombreCliente = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');
const contactoCliente = (c) => require('./ceeDirectoService').contactoCliente(c);
const fmtEur = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// ── Lectura ─────────────────────────────────────────────────────────────────

/** Las facturas del informe (las de `facturas_emitidas` con su `informe_id`). Sin JSONB. */
async function facturasDe(id) {
    const { data, error: e } = await supabase.from('facturas_emitidas')
        .select('id, serie, tipo, numero, estado, fecha, total, cliente_id, cliente_nombre, enviada_at, emitida_at, fecha_pago, presupuesto_id')
        .eq('informe_id', id).order('created_at', { ascending: true });
    if (e) throw error(`No se han podido leer las facturas del informe: ${e.message}`, 503);
    return data || [];
}

/** Por UUID o por número (`2026INF_1`, `2026CIT_1`): un enlace viejo con el número sigue abriendo. */
async function cargar(idONumero, { conRelaciones = true } = {}) {
    const v = txt(idONumero);
    if (!v) return null;
    const campo = /^[0-9a-f-]{36}$/i.test(v) ? 'id' : 'numero';
    const { data: row, error: e } = await supabase.from(TABLA).select('*').eq(campo, campo === 'numero' ? v.toUpperCase() : v).maybeSingle();
    if (e) throw error(`No se ha podido leer el informe: ${e.message}`, 503);
    if (!row || !conRelaciones) return row;
    const [{ data: cliente }, { data: prescriptor }, facturas] = await Promise.all([
        supabase.from('clientes').select('*').eq('id_cliente', row.cliente_id).maybeSingle(),
        row.prescriptor_id ? supabase.from('prescriptores').select('*').eq('id_empresa', row.prescriptor_id).maybeSingle() : Promise.resolve({ data: null }),
        facturasDe(row.id),
    ]);
    return { ...row, cliente: cliente || null, prescriptor: prescriptor || null, facturas };
}

async function cargarPorToken(token) {
    const t = txt(token);
    if (!/^[0-9a-f]{32}$/i.test(t)) return null;
    const { data, error: e } = await supabase.from(TABLA).select('id').eq('portal_token', t.toLowerCase()).maybeSingle();
    // Con la BD caída se calla (regla 38): un «este enlace no existe» le diría
    // al cliente que su trabajo ha desaparecido.
    if (e) throw error(`No se ha podido leer el informe: ${e.message}`, 503);
    return data ? cargar(data.id) : null;
}

/** El listado: columnas concretas (regla 22) y los nombres en UNA consulta por tabla. */
async function listar() {
    const { data, error: e } = await supabase.from(TABLA).select(SELECT_LISTA).order('created_at', { ascending: false }); // el correlativo es de cada LÍNEA (INF / CIT)
    if (e) throw error(`No se ha podido leer el listado de informes: ${e.message}`, 503);
    const filas = data || [];
    const cli = [...new Set(filas.map(r => r.cliente_id).filter(Boolean))];
    const pre = [...new Set(filas.map(r => r.prescriptor_id).filter(Boolean))];
    const [{ data: cs }, { data: ps }] = await Promise.all([
        cli.length ? supabase.from('clientes').select('id_cliente, nombre_razon_social, apellidos').in('id_cliente', cli) : Promise.resolve({ data: [] }),
        pre.length ? supabase.from('prescriptores').select('id_empresa, razon_social, acronimo').in('id_empresa', pre) : Promise.resolve({ data: [] }),
    ]);
    const mc = Object.fromEntries((cs || []).map(c => [c.id_cliente, nombreCliente(c)]));
    const mp = Object.fromEntries((ps || []).map(p => [p.id_empresa, p.acronimo || p.razon_social]));
    return filas.map(r => {
        const d = E.derivar(r);
        return {
            ...r, cliente_nombre: mc[r.cliente_id] || null, prescriptor_nombre: mp[r.prescriptor_id] || null,
            pelota: d.pelota, tipo_etiqueta: E.tipoDe(r).etiqueta, linea: E.lineaDe(r),
            // Desde cuándo está en su paso: el sello más reciente.
            desde: [r.entregado_at, r.cobrado_at, r.justificante_at, r.factura_enviada_at, r.registrado_at, r.firmado_at, r.final_at, r.borrador_at, r.created_at]
                .filter(Boolean).sort().pop() || r.created_at,
        };
    });
}

// ── Escritura ───────────────────────────────────────────────────────────────

async function anotar(id, texto, usuario = null, tipo = 'SISTEMA') {
    const { error: e } = await supabase.rpc('append_informe_historial', {
        p_id: id, p_entrada: { fecha: new Date().toISOString(), tipo, texto: String(texto).toUpperCase(), usuario: usuario || null },
    });
    if (e) console.warn('[informe historial]', e.message);
}

async function mergeDoc(id, campo, valor) {
    const { error: e } = await supabase.rpc('merge_informe_doc_json', { p_id: id, p_field: campo, p_value: valor });
    if (e) throw error(e.message, 500);
}

/**
 * Recalcula y guarda el estado (y la factura del listado) a partir de los
 * sellos y de sus facturas de verdad. Se llama tras CADA cambio: es la única
 * escritura de `estado`.
 */
async function refrescarEstado(id) {
    const row = await cargar(id, { conRelaciones: false });
    if (!row) return null;
    const facturas = await facturasDe(id);
    const vivas = E.facturasVivas(facturas);
    const ultima = vivas[vivas.length - 1] || null;
    const upd = {
        estado: E.deriveEstado(row, facturas),
        factura_numero: ultima?.numero || null,
        factura_enviada_at: vivas.map(f => f.enviada_at).filter(Boolean).sort().pop() || null,
    };
    upd.estado = E.deriveEstado({ ...row, ...upd }, facturas);
    const { data, error: e } = await supabase.from(TABLA).update(upd).eq('id', id).select('*').single();
    if (e) throw error(e.message, 500);
    return data;
}

const CAMPOS_EDITABLES = ['tipo', 'titulo', 'organismo', 'obra_ref', 'direccion', 'ref_catastral', 'ccaa', 'provincia', 'municipio', 'codigo_postal', 'notas', 'prescriptor_id'];

function sanear(datos = {}) {
    const out = {};
    for (const k of CAMPOS_EDITABLES) {
        if (!(k in datos)) continue;
        const v = datos[k];
        out[k] = v == null || v === '' ? null : String(v).trim();
    }
    if ('tipo' in out && out.tipo) out.tipo = String(out.tipo).toUpperCase();   // la línea lo valida (crear / actualizar)
    if ('titulo' in out && !out.titulo) delete out.titulo;   // el título no se vacía
    if ('titulo' in out) out.titulo = out.titulo.toUpperCase().slice(0, 160);
    if ('ref_catastral' in out && out.ref_catastral) out.ref_catastral = out.ref_catastral.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
    if ('organismo' in out && out.organismo) out.organismo = out.organismo.slice(0, 160);
    if ('notas' in out && out.notas) out.notas = out.notas.slice(0, 4000);
    return out;
}

/**
 * Alta. El número lo pone la BD (trigger `informe_numerar`, con candado en la
 * misma transacción). La carpeta no bloquea (regla 1) salvo `esperarCarpeta`.
 * @returns la fila creada (con su carpeta, si `esperarCarpeta`)
 */
async function crear(datos = {}, { usuario = null, usuarioId = null, esperarCarpeta = true, origen = 'a mano' } = {}) {
    if (!datos.cliente_id) throw error('Falta el cliente');
    const s = sanear(datos);
    // La LÍNEA (INF / CIT) la dice quien da de alta o, si no, el tipo elegido. No
    // se cambia nunca: de ella sale el número.
    const linea = E.lineaValida(datos.linea || E.TIPOS[s.tipo]?.linea);
    const tipo = E.tipoValido(s.tipo, linea);
    const fila = {
        ...s, tipo, linea,
        titulo: s.titulo || E.TIPOS[tipo].titulo,
        cliente_id: datos.cliente_id,
        cee_directo_id: datos.cee_directo_id || null,
        presupuesto_id: datos.presupuesto_id || null,
        documentacion: datos.documentacion || {},
        portal_token: crypto.randomBytes(16).toString('hex'),
        created_by: usuarioId,
        estado: 'PTE. REDACCIÓN',
    };
    const { data: creado, error: e } = await supabase.from(TABLA).insert(fila).select('*').single();
    if (e) throw error(`No se ha podido crear el informe: ${e.message}`, 500);
    await anotar(creado.id, `${E.LINEAS[linea].corto} ${creado.numero} CREADO (${origen})`, usuario);

    const carpeta = async () => {
        const { data: cli } = await supabase.from('clientes').select('nombre_razon_social, apellidos').eq('id_cliente', creado.cliente_id).maybeSingle();
        const c = await folders.crearCarpeta(creado.numero, nombreCliente(cli) || creado.titulo, linea);
        if (c?.id) {
            await supabase.from(TABLA).update({ drive_folder_id: c.id, drive_folder_link: c.link }).eq('id', creado.id);
            Object.assign(creado, { drive_folder_id: c.id, drive_folder_link: c.link, _subcarpetas: c.subcarpetas });
        }
        return c;
    };
    if (esperarCarpeta) await carpeta();
    else setImmediate(() => carpeta().catch(err => console.error('[informe carpeta]', err.message)));
    return creado;
}

/** Edición de los datos (no del circuito). El cliente solo cambia sin factura. */
async function actualizar(id, datos = {}, { usuario = null } = {}) {
    const row = await cargar(id, { conRelaciones: false });
    if (!row) throw error('Informe no encontrado', 404);
    const upd = sanear(datos);
    // El tipo se cambia DENTRO de su línea: un INF no pasa a CIT (su número es de INF).
    if ('tipo' in upd) upd.tipo = E.tipoValido(upd.tipo, E.lineaDe(row));
    if (datos.cliente_id && datos.cliente_id !== row.cliente_id) {
        if (row.factura_numero) throw error(`Ya tiene la factura ${row.factura_numero}: el cliente no se cambia`, 409);
        upd.cliente_id = datos.cliente_id;
    }
    if (!Object.keys(upd).length) return row;
    const { error: e } = await supabase.from(TABLA).update(upd).eq('id', id);
    if (e) throw error(e.message, 500);
    await anotar(id, `DATOS EDITADOS (${Object.keys(upd).join(', ')})`, usuario, 'EQUIPO');
    return refrescarEstado(id);
}

async function anular(id, { motivo = '', usuario = null } = {}) {
    const row = await cargar(id, { conRelaciones: false });
    if (!row) throw error('Informe no encontrado', 404);
    if (row.entregado_at) throw error('Ya está entregado: no se anula', 409);
    if (E.facturasVivas(await facturasDe(id)).length) throw error('Tiene una factura emitida: primero se rectifica', 409);
    await supabase.from(TABLA).update({ anulado_at: new Date().toISOString(), motivo_anulacion: txt(motivo).slice(0, 500) || null }).eq('id', id);
    await anotar(id, `ANULADO${txt(motivo) ? `: ${txt(motivo)}` : ''}`, usuario, 'EQUIPO');
    return refrescarEstado(id);
}

// ── Carpeta y documentos ────────────────────────────────────────────────────

/** La carpeta del informe; si el alta la perdió (Drive caído), se crea ahora. */
async function asegurarCarpeta(row) {
    if (row.drive_folder_id) return row.drive_folder_id;
    const cli = row.cliente || (await supabase.from('clientes').select('nombre_razon_social, apellidos').eq('id_cliente', row.cliente_id).maybeSingle()).data;
    const c = await folders.crearCarpeta(row.numero, nombreCliente(cli) || row.titulo, E.lineaDe(row));
    if (!c?.id) throw error('Drive no responde: no se ha podido crear la carpeta del informe', 502);
    await supabase.from(TABLA).update({ drive_folder_id: c.id, drive_folder_link: c.link }).eq('id', row.id);
    row.drive_folder_id = c.id;
    row.drive_folder_link = c.link;
    return c.id;
}

/** El tipo de un fichero sale de sus BYTES (como en la app de certificadores), no de su nombre. */
function tipoPorBytes(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
    const h = buf.subarray(0, 12);
    if (h.subarray(0, 4).toString('latin1') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' };
    if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
    if (h[0] === 0x89 && h.subarray(1, 4).toString('latin1') === 'PNG') return { ext: 'png', mime: 'image/png' };
    if (h.subarray(4, 8).toString('latin1') === 'ftyp') return { ext: 'heic', mime: 'image/heic' };
    if (h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
    if (h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04) return { ext: 'zip', mime: 'application/zip' };   // docx, xlsx y zip
    if (h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0) return { ext: 'doc', mime: 'application/msword' };
    return null;
}

const MIME_OFFICE = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    doc: 'application/msword', xls: 'application/vnd.ms-excel', zip: 'application/zip',
};

/**
 * Lo que dicen los bytes cuadra con lo que se dice subir. Un .docx es un zip:
 * se acepta un zip con extensión docx/xlsx/zip, y nada más.
 */
function validarFichero(clase, buffer, nombre) {
    const c = E.CLASES[clase];
    if (!c) throw error('Clase de documento desconocida');
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw error('No ha llegado el fichero');
    if (buffer.length > MAX_BYTES) throw error('El fichero es demasiado grande (máximo 40 MB)', 413);
    const real = tipoPorBytes(buffer);
    const dicha = E.extDe(nombre);
    if (!real) throw error('Ese tipo de fichero no se admite', 415);
    let ext = real.ext;
    if (real.ext === 'zip' && ['docx', 'xlsx', 'zip'].includes(dicha)) ext = dicha;
    if (real.ext === 'doc' && ['doc', 'xls'].includes(dicha)) ext = dicha;
    if (real.ext === 'jpg' && dicha === 'jpeg') ext = 'jpeg';
    if (!c.ext.includes(ext)) throw error(`Aquí va un ${c.ext.map(x => x.toUpperCase()).join(' / ')}`, 415);
    return { ext, mime: MIME_OFFICE[ext] || real.mime };
}

async function carpetaDeClase(row, clase) {
    const raiz = await asegurarCarpeta(row);
    return folders.subcarpeta(raiz, E.carpetaDeClase(clase, E.lineaDe(row)));
}

/**
 * Sube un fichero a su sitio. Ninguna ruta de carpeta llega de fuera: la pone
 * la CLASE. Las clases fijas (borrador, final, Word, firmado) archivan la
 * versión anterior en OLD; la documentación y el justificante se acumulan.
 */
async function subir(row, clase, { buffer, nombre, usuario = null, origen = 'equipo', docId = null } = {}) {
    if (row.anulado_at) throw error('El informe está anulado', 409);
    if (!E.claseDeLinea(clase, E.lineaDe(row))) throw error('Ese documento no es de este tipo de trabajo');
    const { ext, mime } = validarFichero(clase, buffer, nombre);
    const destino = await carpetaDeClase(row, clase);
    if (!destino) throw error('Drive no responde: no se ha podido abrir la carpeta', 502);
    let final = E.nombreCanonico(row, clase, nombre);
    if (!E.CLASES[clase].sufijo) {
        // Mismo nombre que otro de la documentación: se numera, no se pisa.
        final = final.replace(/\.[a-z0-9]{2,5}$/i, '') + `.${ext}`;
        const baseSinExt = final.replace(/\.[a-z0-9]{2,5}$/i, '');
        let n = 2;
        while (await driveService.findFileByName(destino, final)) final = `${baseSinExt} (${n++}).${ext}`;
    } else {
        for (const fid of await driveService.findFilesByName(destino, final)) await driveService.archiveExistingToOld(destino, fid, final);
    }
    const r = await driveService.saveFileToFolder(destino, final, mime, buffer, { throwOnError: true });
    const ahora = new Date().toISOString();

    const sellos = {};
    if (clase === 'BORRADOR_PDF') sellos.borrador_at = row.borrador_at || ahora;
    if (clase === 'FINAL_PDF') {
        sellos.final_at = ahora;
        // Una versión final NUEVA deja sin efecto la firma de la anterior.
        if (row.firmado_at) sellos.firmado_at = null;
    }
    if (clase === 'JUSTIFICANTE') sellos.justificante_at = ahora;
    // CIT: el certificado oficial de eDICE ES la presentación hecha.
    if (clase === 'CERTIFICADO_OFICIAL') sellos.registrado_at = ahora;
    if (Object.keys(sellos).length) await supabase.from(TABLA).update(sellos).eq('id', row.id);
    if (clase === 'JUSTIFICANTE') await mergeDoc(row.id, 'justificante', { at: ahora, nombre: final, drive_id: r.id, origen });
    if (clase === 'DOCUMENTACION' && docId) {
        await mergeDoc(row.id, 'docs_cliente', { [docId]: { at: ahora, nombre: final, origen } });
    }
    await anotar(row.id, `${E.CLASES[clase].etiqueta} SUBIDO: ${final}${sellos.firmado_at === null ? ' — LA FIRMA ANTERIOR DEJA DE VALER' : ''}`, usuario, origen === 'cliente' ? 'CLIENTE' : 'EQUIPO');
    const fila = await refrescarEstado(row.id);

    if (clase === 'JUSTIFICANTE') {
        avisarEquipo({
            asunto: `💶 ${row.numero}: el cliente ha subido el justificante de pago`,
            cuerpo: `💶 *${row.numero}* — ${nombreCliente(row.cliente) || 'el cliente'} ha subido el *justificante de pago* (${final}).\n\n`
                + `Míralo en el banco y confirma el cobro con un clic: al confirmarlo, ${E.LINEAS[E.lineaDe(row)].entregaEtiqueta} sale solo hacia el cliente.\n👉 ${FRONTEND()}/?informe=${row.id}&cobro=1`,
        }).catch(() => {});
    }
    if (clase === 'DOCUMENTACION' && origen === 'cliente') {
        avisarEquipo({
            asunto: `📎 ${row.numero}: documentación del cliente`,
            cuerpo: `📎 *${row.numero}* — ${nombreCliente(row.cliente) || 'el cliente'} ha subido documentación: ${final}.\n👉 ${FRONTEND()}/?informe=${row.id}`,
        }).catch(() => {});
    }
    if (clase === 'CERTIFICADO_OFICIAL') await avisarFacturar(row, fila, ahora);
    return { fichero: { id: r.id, nombre: final }, informe: fila, firmaAnulada: sellos.firmado_at === null };
}

/**
 * Los documentos del informe, por apartado, con lo ACTUAL de cada clase y las
 * versiones anteriores (OLD). Resincroniza los sellos con lo que hay de verdad
 * en Drive: un borrador dejado a mano en la carpeta también cuenta.
 * `conPago`: el apartado de presupuesto y facturas (solo ADMIN).
 */
async function documentos(row, { conPago = false } = {}) {
    if (!row.drive_folder_id) return { hay: false, informe: [], anteriores: [], documentacion: [], pago: [] };
    const sc = E.subcarpetas(E.lineaDe(row));
    const [sInf, sDoc, sFac] = await Promise.all([sc.principal, sc.docs, sc.facturas].map(n => driveService.findSubfolderByName(row.drive_folder_id, n)));
    const ver = (f, extra = {}) => ({ id: f.id, nombre: f.name, fecha: f.modifiedTime || null, mime: f.mimeType, ...extra });
    const lista = async (id) => (id ? (await driveService.listFiles(id)).filter(f => !String(f.mimeType).includes('folder')) : []);

    const enInforme = await lista(sInf);
    const actual = {};
    for (const f of enInforme) {
        const clase = E.claseDeNombre(f.name);
        if (!clase) continue;
        if (!actual[clase] || String(f.modifiedTime) > String(actual[clase].fecha)) actual[clase] = ver(f, { clase });
    }
    const oldId = sInf ? await driveService.findSubfolderByName(sInf, 'OLD') : null;
    const anteriores = (await lista(oldId)).map(f => ver(f, { clase: E.claseDeNombre(f.name.replace(/_OLD\d*(\.[a-z]+)$/i, '$1')) }))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const documentacion = (await lista(sDoc)).map(f => ver(f));
    const pago = conPago ? (await lista(sFac)).map(f => ver(f)) : [];

    // El firmado solo cuenta si es POSTERIOR a la versión final: si se regenera
    // la final, la firma vieja deja de valer y vuelve el botón de firmar.
    if (actual.FIRMADO && actual.FINAL_PDF && String(actual.FIRMADO.fecha) < String(actual.FINAL_PDF.fecha)) {
        actual.FIRMADO = { ...actual.FIRMADO, caducado: true };
    }

    // Resincroniza los sellos que se ven en Drive (nunca la firma: esa la pone
    // `guardarFirmado` tras comprobarla).
    const sellos = {};
    if (actual.BORRADOR_PDF && !row.borrador_at) sellos.borrador_at = actual.BORRADOR_PDF.fecha || new Date().toISOString();
    if (actual.FINAL_PDF && !row.final_at) sellos.final_at = actual.FINAL_PDF.fecha || new Date().toISOString();
    if (row.final_at && !actual.FINAL_PDF) sellos.final_at = null;
    if (row.firmado_at && (!actual.FIRMADO || actual.FIRMADO.caducado)) sellos.firmado_at = null;
    if (actual.CERTIFICADO_OFICIAL && !row.registrado_at) sellos.registrado_at = actual.CERTIFICADO_OFICIAL.fecha || new Date().toISOString();
    if (row.registrado_at && !actual.CERTIFICADO_OFICIAL) sellos.registrado_at = null;
    if (Object.keys(sellos).length && !row.entregado_at) {
        await supabase.from(TABLA).update(sellos).eq('id', row.id);
        await refrescarEstado(row.id);
    }
    return { hay: true, actual, anteriores, documentacion, pago, carpetas: { informe: sInf, documentacion: sDoc, pago: sFac } };
}

/**
 * Un fichero del informe, para el visor. Solo si está DENTRO de su carpeta (o
 * de la OLD de «1. INFORME»): un id de Drive cualquiera no sirve.
 * Lo del apartado de pago, solo con `conPago`.
 */
async function fichero(row, fileId, { conPago = false } = {}) {
    if (!row.drive_folder_id || !/^[\w-]{10,}$/.test(String(fileId || ''))) throw error('Fichero no encontrado', 404);
    const meta = await driveService.getFileMetadata(fileId, 'id, name, mimeType, parents');
    if (!meta) throw error('Fichero no encontrado', 404);
    const padres = meta.parents || [];
    const sc = E.subcarpetas(E.lineaDe(row));
    const [sInf, sDoc, sFac] = await Promise.all([sc.principal, sc.docs, sc.facturas].map(n => driveService.findSubfolderByName(row.drive_folder_id, n)));
    const oldInf = sInf ? await driveService.findSubfolderByName(sInf, 'OLD') : null;
    const permitidos = [sInf, oldInf, sDoc, ...(conPago ? [sFac] : [])].filter(Boolean);
    if (!padres.some(p => permitidos.includes(p))) throw error('Fichero no encontrado', 404);
    const buffer = await driveService.getFileContent(fileId);
    return { buffer, nombre: meta.name, mime: tipoPorBytes(buffer)?.mime || 'application/octet-stream' };
}

// ── Firma ───────────────────────────────────────────────────────────────────

/** La versión final que toca firmar, en base64 (FirmarConCertificadoModal). */
async function paraFirmar(row) {
    const d = await documentos(row);
    const fin = d.actual?.FINAL_PDF;
    if (!fin) throw error('Todavía no hay versión final en PDF que firmar', 409, { code: 'SIN_FINAL' });
    const buffer = await driveService.getFileContent(fin.id);
    return { nombre: fin.nombre, base64: buffer.toString('base64') };
}

/**
 * Guarda el PDF firmado. Una firma rota o ausente NO se guarda (leerFirmasPdf,
 * el mismo del CRM y de la app de certificadores).
 *   · INF: firma Fran; se avisa si el firmante no parece él.
 *   · CIT: firma el REPRESENTANTE de la empresa instaladora (regla de
 *     presentar-rite: nunca el certificado personal); no se compara con nadie,
 *     se anota quién es.
 * Después, aviso UNA vez al equipo con el paso siguiente: en un INF, emitir la
 * factura; en un CIT, presentarlo en eDICE.
 */
async function guardarFirmado(row, buffer, { usuario = null, via = 'autofirma' } = {}) {
    const { leerFirmasPdf, firmanteCoincide } = require('../utils/firmasPdf');
    if (!row.final_at) throw error('Primero tiene que estar la versión final', 409);
    const firmas = leerFirmasPdf(buffer);
    if (!firmas.esPdf) throw error('Eso no es un PDF', 400, { code: 'NO_ES_PDF' });
    if (!firmas.firmada) throw error('El PDF no lleva ninguna firma digital', 422, { code: 'SIN_FIRMA' });
    if (firmas.integridad.rota) throw error('El PDF firmado ha llegado dañado y no se ha guardado. Vuelve a firmarlo.', 422, { code: 'FIRMA_ROTA', problemas: firmas.integridad.problemas });
    const f = firmas.firmantes[firmas.firmantes.length - 1] || {};
    const cit = E.lineaDe(row) === 'CIT';
    const tecnico = process.env.INFORME_TECNICO_NOMBRE || 'FRANCISCO JAVIER MOYA';
    const coincide = cit ? {} : firmanteCoincide(f, { nombre: tecnico });

    const r = await subir(row, 'FIRMADO', { buffer, nombre: 'firmado.pdf', usuario });
    const ahora = new Date().toISOString();
    await supabase.from(TABLA).update({ firmado_at: ahora }).eq('id', row.id);
    await mergeDoc(row.id, 'firma', { at: ahora, via, fichero: r.fichero.nombre, drive_id: r.fichero.id,
        firmante: { nombre: f.nombre || f.cn || f.nombreDeclarado || null }, coincide: coincide.coincide ?? null });
    await anotar(row.id, `${cit ? 'MEMORIA' : 'INFORME'} FIRMAD${cit ? 'A' : 'O'} (${f.nombre || f.cn || 'firmante sin leer'})`, usuario, 'EQUIPO');
    const fila = await refrescarEstado(row.id);

    if (cit) {
        const doc = (await cargar(row.id, { conRelaciones: false })).documentacion || {};
        if (!doc.aviso_presentar && !fila.registrado_at) {
            await mergeDoc(row.id, 'aviso_presentar', { at: ahora });
            avisarEquipo({
                asunto: `🏛️ ${row.numero}: memoria firmada, toca presentarla en eDICE`,
                cuerpo: `🏛️ *${row.numero}* — la memoria RITE de ${nombreCliente(row.cliente) || 'el cliente'} está *firmada*.\n\n`
                    + `Toca presentarla en eDICE-Térmicas (skill presentar-rite) y subir a la ficha el *certificado oficial* (el PDF de la impresora).\n👉 ${FRONTEND()}/?informe=${row.id}`,
            }).catch(() => {});
        }
    } else {
        await avisarFacturar(row, fila, ahora);
    }
    return { informe: fila, firmante: f.nombre || f.cn || null, avisos: coincide.coincide === false ? [`La firma no parece de ${tecnico} (${coincide.motivo}).`] : [] };
}

/** «Toca emitir la factura», UNA vez: al firmar un INF o al tener el certificado de un CIT. */
async function avisarFacturar(row, fila, ahora = new Date().toISOString()) {
    const doc = (await cargar(row.id, { conRelaciones: false })).documentacion || {};
    if (doc.aviso_facturar || fila?.factura_numero || fila?.cobrado) return;
    await mergeDoc(row.id, 'aviso_facturar', { at: ahora });
    const listo = E.lineaDe(row) === 'CIT' ? 'tiene ya el *certificado oficial*' : 'está *firmado*';
    avisarEquipo({
        asunto: `🧾 ${row.numero}: toca emitir la factura`,
        cuerpo: `🧾 *${row.numero}* — ${row.titulo} de ${nombreCliente(row.cliente) || 'el cliente'} ${listo}.\n\n`
            + `Toca emitir y enviar la factura (lleva el enlace para que suba el justificante).\n👉 ${FRONTEND()}/?informe=${row.id}&facturar=1`,
    }).catch(() => {});
}

// ── Factura ─────────────────────────────────────────────────────────────────

/**
 * Prepara la factura (BORRADOR, en la pestaña Facturación) con las partidas del
 * presupuesto aceptado. Emitirla y enviarla se hace en su editor, con el texto
 * a la vista: son dos «sí» distintos (regla 166).
 */
async function facturar(row, { usuarioId = null, usuarioNombre = null, otraMas = false } = {}) {
    const fs = require('./facturaService');
    const ya = (row.facturas || await facturasDe(row.id)).filter(f => f.tipo === 'F1' && f.estado !== 'RECTIFICADA');
    if (ya.length && !otraMas) throw error(`El informe ya tiene factura: ${ya.map(f => f.numero || 'un borrador').join(', ')}`, 409, { facturas: ya });
    let r;
    if (row.presupuesto_id) {
        r = await fs.desdePresupuesto(row.presupuesto_id, { usuarioId, usuarioNombre, otraMas: true });
    } else {
        r = await fs.crear({
            serie: 'ING', cliente_id: row.cliente_id, expediente: row.numero, informe_id: row.id,
            lineas: [{ descripcion: `${E.tipoDe(row).etiqueta}: ${row.titulo}`.slice(0, 300), uds: 1, precio: 0, dtoPct: 0, ivaPct: 21 }],
        }, { usuarioId, usuarioNombre });
    }
    await supabase.from('facturas_emitidas').update({ informe_id: row.id, expediente: row.numero }).eq('id', r.id).eq('estado', 'BORRADOR');
    await anotar(row.id, 'FACTURA PREPARADA EN BORRADOR', usuarioNombre, 'EQUIPO');
    return { facturaId: r.id };
}

/**
 * El mensaje con el que sale la factura de un informe: el general de las
 * facturas (con la cuenta) + que el informe está firmado y se entrega una vez
 * abonada + el ENLACE para subir el justificante.
 */
async function envioDeFacturacion(f, { L, emisor, destino }) {
    const row = await cargar(f.informe_id);
    if (!row) return null;
    const base = L.mensajeFacturaGeneral({
        nombre: destino.nombre, esEmpresa: !!f.cliente?.es_empresa, numero: f.numero, total: Number(f.total),
        vencimiento: f.vencimiento, lineas: f.lineas || [], emisor, serie: f.serie,
    });
    const cit = E.lineaDe(row) === 'CIT';
    const listo = cit
        ? (row.registrado_at ? `Tu *${tituloCliente(row)}* (${row.numero}) ya está presentado y registrado en Industria.` : `Es la factura de tu *${tituloCliente(row)}* (${row.numero}).`)
        : (row.firmado_at ? `Tu *${tituloCliente(row)}* (${row.numero}) ya está ${concuerda(row, 'terminado y firmado')}.` : `Es la factura de tu *${tituloCliente(row)}* (${row.numero}).`);
    const pago = `Por política de empresa, ${E.LINEAS[E.lineaDe(row)].entregaEtiqueta} se envía una vez abonada la factura. Cuando hagas la transferencia, sube aquí el justificante y te lo mandamos:\n👉 ${enlaceCliente(row)}`;
    const partes = base.split('\n\n');
    // Detrás del saludo, el punto en que está; antes de la despedida, el enlace.
    const saludo = partes.shift();
    const despedidaIdx = partes.findIndex(p => /^Muchas gracias/.test(p));
    if (despedidaIdx >= 0) partes.splice(despedidaIdx, 0, pago); else partes.push(pago);
    return { destino, mensaje: [saludo, listo, ...partes].join('\n\n'), expediente: row.numero };
}

const tituloCliente = (row) => {
    if (E.lineaDe(row) === 'CIT') return E.LINEAS.CIT.etiqueta.toLowerCase();
    const tipo = E.tipoValido(row.tipo, 'INF');
    return row.organismo && tipo === 'MEMORIA_AYUNTAMIENTO' ? `memoria técnica para el ${row.organismo}` : E.TIPOS[tipo].etiqueta.toLowerCase();
};

/**
 * «terminado y firmado» → «terminada y firmada» si lo que se entrega es femenino
 * (memoria, legalización, auditoría, consultoría). 2026INF_1, 06/11/2026: «Tu
 * memoria técnica… ya está terminado y firmado».
 */
const esFemenino = (row) => /^(memoria|legalizaci|auditor|consultor)/i.test(tituloCliente(row));
const concuerda = (row, texto) => (esFemenino(row) ? texto.replace(/o\b/g, 'a') : texto);

/**
 * Lo que se ENTREGA al cobrar (Fran, 05/11/2026), con `docs` de `documentos()`:
 *   · INF: el PDF FIRMADO, si no ha caducado (una final posterior lo invalida);
 *   · CIT: el CERTIFICADO OFICIAL de eDICE.
 * Devuelve el fichero de Drive o null.
 */
function entregable(row, docs) {
    if (E.lineaDe(row) === 'CIT') return row.registrado_at ? (docs?.actual?.CERTIFICADO_OFICIAL || null) : null;
    const f = docs?.actual?.FIRMADO;
    return row.firmado_at && f && !f.caducado ? f : null;
}

// ── Cobro ───────────────────────────────────────────────────────────────────

/**
 * Lo que hace COBRADO al informe. La llama `facturaService.cobro` al marcar
 * pagada una factura suya (desde la pestaña o desde aquí): es el mismo hecho.
 * Cobrado, lanza la entrega del firmado.
 */
async function marcarCobrado(id, pagada = true, { fecha = null, usuario = null } = {}) {
    const ahora = fecha ? new Date(`${fecha}T12:00:00Z`).toISOString() : new Date().toISOString();
    const { error: e } = await supabase.from(TABLA).update({ cobrado: !!pagada, cobrado_at: pagada ? ahora : null }).eq('id', id);
    if (e) throw error(e.message, 500);
    await anotar(id, pagada ? 'COBRO CONFIRMADO' : 'COBRO DESHECHO', usuario, 'EQUIPO');
    const fila = await refrescarEstado(id);
    let entrega = null;
    if (pagada) entrega = await entregar(id, { manual: false }).catch(err => ({ enviado: false, motivo: 'ERROR', error: err.message }));
    return { informe: fila, entrega };
}

/**
 * «Confirmar cobro» de la ficha (UN clic, ADMIN). Con factura emitida, la cobra
 * en Facturación —que a su vez llama a `marcarCobrado`—; sin factura, solo marca
 * el informe.
 */
async function confirmarCobro(id, { pagada = true, fecha = null, usuario = null } = {}) {
    const fs = require('./facturaService');
    const facturas = E.facturasVivas(await facturasDe(id));
    const pendientes = facturas.filter(f => (pagada ? f.estado === 'EMITIDA' : f.estado === 'PAGADA'));
    if (!pendientes.length) return marcarCobrado(id, pagada, { fecha, usuario });
    let ultimo = null;
    for (const f of pendientes) ultimo = await fs.cobro(f.id, { pagada, fecha, usuario });
    const fila = await cargar(id, { conRelaciones: false });
    return { informe: fila, entrega: ultimo?.informe?.entrega || null };
}

// ── Entrega ─────────────────────────────────────────────────────────────────

const autoActivado = () => process.env.INFORME_ENTREGA_AUTO === 'true';

/**
 * A quien PAGA: el cliente de la última factura viva si es otro (el partner o el
 * instalador que la paga); si no, el cliente del informe con su desvío a la
 * persona de contacto.
 */
async function destinatario(row) {
    const vivas = E.facturasVivas(row.facturas || []);
    const ultima = vivas[vivas.length - 1];
    if (ultima?.cliente_id && ultima.cliente_id !== row.cliente_id) {
        const { data: otro } = await supabase.from('clientes').select('*').eq('id_cliente', ultima.cliente_id).maybeSingle();
        if (otro) { const c = contactoCliente(otro); return { ...c, nombre: c.nombre || nombreCliente(otro), paga: true, factura: ultima.numero }; }
    }
    const c = contactoCliente(row.cliente);
    return { ...c, nombre: c.nombre || nombreCliente(row.cliente), paga: false, factura: ultima?.numero || null };
}

/** ¿Se puede entregar? Lo mismo para la pantalla y para el automático. */
async function estadoEntrega(row, { sinCobro = false } = {}) {
    const d = await documentos(row);
    const firmado = entregable(row, d);
    const faltan = [];
    if (!row.cobrado && !sinCobro) faltan.push('Confirmar el cobro');
    if (!firmado) faltan.push(E.lineaDe(row) === 'CIT' ? 'Presentarlo en eDICE y subir el certificado oficial' : 'Firmar la versión final');
    const dest = await destinatario(row);
    if (!dest.email && !dest.tlf) faltan.push('El cliente no tiene ni email ni teléfono en su ficha');
    return {
        puede: !faltan.length, faltan, soloFaltaCobro: faltan.length === 1 && !row.cobrado && !sinCobro,
        yaEntregado: row.documentacion?.entrega || null, destinatario: dest,
        fichero: firmado ? firmado.nombre : null, firmadoId: firmado?.id || null, auto: autoActivado(),
    };
}

function mensajeEntrega(row, dest) {
    const p = String(dest.nombre || '').split(/\s+/)[0] || '';
    const pila = p ? ` ${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}` : '';
    if (E.lineaDe(row) === 'CIT') {
        return `¡Hola${pila}!\n\n`
            + `Te adjuntamos tu *${tituloCliente(row)}* (${row.numero}), registrado en Industria (eDICE-Térmicas).\n\n`
            + 'Guárdalo: es el certificado oficial de tu instalación, el que te pueden pedir para cualquier trámite.\n\n'
            + '¡Gracias por confiar en nosotros!\n*BROKERGY · Ingeniería Energética*';
    }
    const para = row.organismo ? ` Es el documento que tienes que presentar en el *${row.organismo}*.` : '';
    return `¡Hola${pila}!\n\n`
        + `Te adjuntamos tu *${tituloCliente(row)}* ${concuerda(row, 'firmado')} (${row.numero}).${para}\n\n`
        + `${esFemenino(row) ? 'Guárdala' : 'Guárdalo'}: es la versión con la firma electrónica del técnico, la que vale ante la Administración.\n\n`
        + '¡Gracias por confiar en nosotros!\n*BROKERGY · Ingeniería Energética*';
}

/**
 * Entrega lo que dice la línea (INF: el PDF FIRMADO; CIT: el certificado oficial;
 * solo eso: Fran, 05/11/2026) por email y WhatsApp.
 * La idempotencia se comprueba ANTES que nada: el cobro desde la pestaña y desde
 * la ficha pueden coincidir.
 */
async function entregar(id, { manual = false, reenviar = false, sinCobro = false, channels = null, mensaje = null, usuario = null } = {}) {
    const row = await cargar(id);
    if (!row) return { enviado: false, motivo: 'NO_EXISTE' };
    const sc = !!(manual && sinCobro);
    const st = await estadoEntrega(row, { sinCobro: sc });
    if (st.yaEntregado && !reenviar) return { enviado: false, motivo: 'YA_ENTREGADO', entregadoAt: st.yaEntregado.at };
    if (!st.puede) return { enviado: false, motivo: 'FALTAN_REQUISITOS', faltan: st.faltan };
    if (!manual && !autoActivado()) {
        console.log(`[informe-entrega] SIMULADO (INFORME_ENTREGA_AUTO apagado) → ${row.numero} a ${st.destinatario.email || '—'} / ${st.destinatario.tlf || '—'} con ${st.fichero}`);
        return { enviado: false, motivo: 'AUTO_DESACTIVADO', simulado: { destinatario: st.destinatario, fichero: st.fichero } };
    }
    // El adjunto se vuelve a comprobar al bajarlo: un mensaje de entrega sin el
    // documento deja al cliente esperando algo que ya consta como enviado.
    let buffer = null;
    try { buffer = await driveService.getFileContent(st.firmadoId); } catch { buffer = null; }
    const cit = E.lineaDe(row) === 'CIT';
    const valido = buffer?.length && (cit ? tipoPorBytes(buffer)?.ext === 'pdf' : require('../utils/firmasPdf').leerFirmasPdf(buffer).firmada);
    if (!valido) {
        return { enviado: false, motivo: 'ADJUNTO_NO_DESCARGABLE', faltan: [`No se ha podido descargar ${cit ? 'el certificado oficial' : 'el PDF firmado'} de Drive`] };
    }
    const emailService = require('./emailService');
    const whatsappService = require('./whatsappService');
    const cuerpo = txt(mensaje) || mensajeEntrega(row, st.destinatario);
    const usar = Array.isArray(channels) && channels.length ? channels : ['email', 'whatsapp'];
    const canales = [];
    const errores = [];
    if (st.destinatario.email && usar.includes('email')) {
        try {
            await emailService.sendMail({
                to: st.destinatario.email, subject: `${row.numero} — Tu ${tituloCliente(row)}`,
                text: cuerpo.replace(/\*/g, ''),
                html: `<pre style="font-family:inherit;white-space:pre-wrap">${cuerpo.replace(/\*/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
                attachments: [{ filename: st.fichero, content: buffer, contentType: 'application/pdf' }],
            });
            canales.push('email');
        } catch (e) { errores.push(`email: ${e.message}`); }
    }
    if (st.destinatario.tlf && usar.includes('whatsapp')) {
        try {
            // El texto PRIMERO y aparte; el PDF detrás con una etiqueta corta.
            await whatsappService.sendText(st.destinatario.tlf, cuerpo);
            await whatsappService.sendMedia(st.destinatario.tlf, { base64: buffer.toString('base64'), filename: st.fichero, mimetype: 'application/pdf' },
                { caption: cit ? 'certificado de instalación térmica' : 'documento firmado', splitCaption: false });
            canales.push('whatsapp');
        } catch (e) { errores.push(`whatsapp: ${e.message}`); }
    }
    if (!canales.length) return { enviado: false, motivo: 'ENVIO_FALLIDO', errores };
    const ahora = new Date().toISOString();
    await mergeDoc(row.id, 'entrega', {
        at: ahora, canales, fichero: st.fichero, automatica: !manual, usuario,
        destinatario: { email: st.destinatario.email || null, tlf: st.destinatario.tlf || null, ...(st.destinatario.paga ? { paga: st.destinatario.nombre } : {}) },
        ...(sc && !row.cobrado ? { sin_cobrar: true } : {}), ...(errores.length ? { errores } : {}),
    });
    await supabase.from(TABLA).update({ entregado_at: row.entregado_at || ahora }).eq('id', row.id);
    await anotar(row.id, `${cit ? 'CERTIFICADO OFICIAL' : 'INFORME FIRMADO'} ENTREGADO${st.destinatario.paga ? ` A ${st.destinatario.nombre} (QUIEN PAGA)` : ' AL CLIENTE'} POR ${canales.join(' Y ')}${sc && !row.cobrado ? ' — SIN COBRAR (DECISIÓN MANUAL)' : ''}${manual ? '' : ' (AUTOMÁTICO)'}`, usuario, 'CLIENTE');
    await refrescarEstado(row.id);
    return { enviado: true, canales, errores, fichero: st.fichero, destinatario: st.destinatario };
}

// ── El enlace del cliente ───────────────────────────────────────────────────

const enlaceCliente = (row) => `${FRONTEND()}/informe/${row.portal_token}`;

/** Lo que ve el cliente en su enlace. Sin importes del presupuesto ni enlaces de Drive. */
async function vistaCliente(row) {
    const vivas = E.facturasVivas(row.facturas || []);
    const fac = vivas[vivas.length - 1] || null;
    const docsSubidos = row.documentacion?.docs_cliente || {};
    const lista = E.docsCliente(row.tipo, E.lineaDe(row)).map(d => ({ ...d, subido: docsSubidos[d.id] ? { at: docsSubidos[d.id].at } : null }));
    const d = E.derivar(row, row.facturas);
    const cli = row.cliente || {};
    // A dónde le llegará lo que se entrega, ENMASCARADO (la página la abre un
    // enlace con token, no una sesión): «te llegará por WhatsApp al ··· 330».
    let entregaPor = null;
    try {
        const dest = await destinatario(row);
        const tlf = String(dest.tlf || '').replace(/\D/g, '');
        const [u, dom] = String(dest.email || '').split('@');
        entregaPor = {
            whatsapp: tlf.length >= 6 ? `··· ${tlf.slice(-3)}` : null,
            email: u && dom ? `${u.charAt(0)}···@${dom}` : null,
        };
    } catch { entregaPor = null; }
    return {
        numero: row.numero, titulo: row.titulo, tipo: E.tipoDe(row).etiqueta, organismo: row.organismo,
        linea: E.lineaDe(row), entregaEtiqueta: E.LINEAS[E.lineaDe(row)].entregaEtiqueta,
        inmueble: [row.direccion, row.municipio].filter(Boolean).join(', ') || null,
        cliente: { nombre: nombreCliente(cli) },
        estado: d.estado, paso: d.paso, anulado: !!row.anulado_at,
        pasos: E.pasos(row, row.facturas).map(p => ({ id: p.id, titulo: p.titulo, hecho: !!p.hecho, actual: p.actual })),
        // La documentación se sube mientras se redacta; con la versión FINAL ya
        // hecha no se le pide nada más (2026INF_1, 05/11/2026: pendiente solo de
        // la firma, la página seguía pidiendo el presupuesto del instalador).
        pideDocumentacion: !row.final_at && !row.firmado_at && !row.anulado_at,
        documentacion: lista,
        factura: fac ? { numero: fac.numero, total: Number(fac.total), pagada: fac.estado === 'PAGADA' } : null,
        justificante: row.justificante_at ? { at: row.justificante_at } : null,
        entregaPor,
        puedeSubirJustificante: !!fac && !row.cobrado && !row.anulado_at,
        cobrado: !!row.cobrado,
        entregado: row.entregado_at ? { at: row.entregado_at } : null,
        // Lo que se entrega se descarga del enlace SOLO cobrado (el candado de cobro).
        puedeDescargar: !!(row.cobrado && (E.lineaDe(row) === 'CIT' ? row.registrado_at : row.firmado_at)),
    };
}

// ── Desde un presupuesto aceptado ───────────────────────────────────────────

/**
 * Nace el informe (o el CIT) de un presupuesto aceptado que lleva un artículo con
 * `genera: 'INFORME'` (o `'CIT'`). Lo llama `ceeOfertaService.aceptar`. El PDF
 * del presupuesto se archiva en «3. PRESUPUESTO Y FACTURAS».
 */
async function desdePresupuesto(oferta, { clienteId, inmueble = {}, aceptadaPor = '', pdf = null, avisar = true } = {}) {
    const lineas = Array.isArray(oferta.lineas) ? oferta.lineas : [];
    const linea = lineas.find(l => E.lineaDeGenera(l?.genera)) || {};
    const lin = E.lineaDeGenera(linea.genera) || 'INF';
    // INF: el tipo sale del CONCEPTO de la partida («Memoria técnica para el
    // Ayuntamiento…» → MEMORIA_AYUNTAMIENTO); si no se reconoce, INFORME_TECNICO,
    // y se corrige en la ficha. CIT: solo hay uno.
    const tipo = lin === 'CIT' ? E.LINEAS.CIT.tipoDefecto : E.tipoDeConcepto(`${linea.descripcion || ''} ${linea.detalle || ''}`);
    const organismo = tipo === 'MEMORIA_AYUNTAMIENTO' && inmueble.municipio ? `Ayuntamiento de ${titleCase(inmueble.municipio)}` : null;
    const creado = await crear({
        linea: lin, cliente_id: clienteId, tipo, titulo: E.TIPOS[tipo].titulo, organismo,
        presupuesto_id: oferta.id, prescriptor_id: oferta.prescriptor_id || null,
        ...inmueble,
        documentacion: { presupuesto: { id: oferta.id, numero: oferta.numero, aceptado_at: new Date().toISOString(), aceptado_por: aceptadaPor, concepto: linea.descripcion || null } },
    }, { usuario: `Cliente (${aceptadaPor})`, origen: `al aceptar el presupuesto ${oferta.numero}` });
    if (pdf?.buffer && creado.drive_folder_id) {
        try {
            const sub = await folders.subcarpeta(creado.drive_folder_id, E.subcarpetas(lin).facturas);
            await driveService.saveFileToFolder(sub, `${creado.numero} - ${pdf.filename}`, 'application/pdf', pdf.buffer);
        } catch (e) { console.warn('[informe] PDF del presupuesto:', e.message); }
    }
    // Sin CEE, el aviso del presupuesto aceptado (ceeOfertaService.avisarSinCee) ya
    // lleva el informe: este solo sale si no lo da aquel.
    if (avisar) avisarEquipo({
        asunto: `✅ ${creado.numero}: presupuesto ${oferta.numero} aceptado`,
        cuerpo: `✅ *${creado.numero}* — ${aceptadaPor || 'el cliente'} ha aceptado el presupuesto *${oferta.numero}* (${linea.descripcion || E.TIPOS[tipo].etiqueta}).\n\nToca ${lin === 'CIT' ? 'hacer la memoria RITE' : 'redactarlo'}. Su enlace para subir la documentación ya lo tiene en la página de aceptación.\n👉 ${FRONTEND()}/?informe=${creado.id}`,
    }).catch(() => {});
    return creado;
}

const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// ── Avisos al equipo ────────────────────────────────────────────────────────

/** Al EQUIPO, nunca al cliente. `INFORME_AVISOS_EQUIPO=false` los calla (pruebas). */
async function avisarEquipo({ asunto, cuerpo }) {
    if (process.env.INFORME_AVISOS_EQUIPO === 'false') {
        console.log(`[informe aviso equipo] SIMULADO: ${asunto}`);
        return [];
    }
    return require('./ceeDirectoProceso').avisarEquipo({ asunto, cuerpo });
}

/** El panel «Procedimiento» de la ficha. */
async function proceso(row) {
    const d = E.derivar(row, row.facturas);
    return { estado: d.estado, pelota: d.pelota, paso: d.paso, pasos: E.pasos(row, row.facturas) };
}

module.exports = {
    TABLA, SELECT_LISTA, cargar, cargarPorToken, listar, crear, actualizar, anular, refrescarEstado, anotar, mergeDoc,
    asegurarCarpeta, subir, documentos, fichero, tipoPorBytes, validarFichero,
    paraFirmar, guardarFirmado, facturar, envioDeFacturacion, entregable, tituloCliente,
    marcarCobrado, confirmarCobro, estadoEntrega, entregar, mensajeEntrega, destinatario,
    enlaceCliente, vistaCliente, desdePresupuesto, avisarEquipo, proceso, facturasDe,
};
