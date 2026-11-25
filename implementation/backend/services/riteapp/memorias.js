// ─── riteapp/memorias.js — las memorias RITE sueltas de la app RITE ───────────
// rite.brokergy.es (regla 245). Alta, datos, Catastro, equipo del catálogo,
// estancias, GENERAR (con el mismo generador que una obra CAE) y DOCUMENTOS.
//
// Lo usan dos entradas, con la MISMA lógica:
//   · el instalador en su app (routes/riteapp.js, `riteappOnly`): gasta crédito.
//   · BROKERGY «hazme esta memoria» (routes/riteappAdmin.js, `staffOClaveInterna`:
//     el CRM, el MCP y el asistente): `origen: 'BROKERGY'`, NO gasta crédito y la
//     memoria aparece en los documentos de la cuenta del instalador.
//
// Drive: `39. LEGALIZACIONES RITE / 3. APP RITE / {EMPRESA} / {nº} - {TITULAR}`
// (o RITEAPP_DRIVE_FOLDER_ID como raíz). Las versiones anteriores van a «OLD»
// (`archiveExistingToOld`, como la memoria de una obra CAE). En BD solo los ids.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('../supabaseClient');
const driveService = require('../driveService');
const climateService = require('../climateService');
const { resolvePotenciasCatalogo } = require('../../utils/riteValidation');
const { generarRiteFiles } = require('../riteGenerador');
const P = require('./payload');

const TABLA = 'riteapp_memorias';
const RUTA_RAIZ = ['39. LEGALIZACIONES RITE', '3. APP RITE'];

// ── Errores con forma de contrato (status + code), y BD caída = 503 (regla 38) ──
class ErrorRite extends Error {
    constructor(status, mensaje, code, extra = null) { super(mensaje); this.status = status; this.code = code; this.extra = extra; }
}
const fallo = (status, mensaje, code, extra) => new ErrorRite(status, mensaje, code, extra);
const tablaPendiente = (e) => /Could not find the (table|function)|schema cache|relation .* does not exist|function .* does not exist|column .* does not exist/i.test(String(e?.message || e || ''));
function errorBd(error, contexto) {
    const e = fallo(503, tablaPendiente(error)
        ? 'La app RITE todavía no está instalada en la base de datos.'
        : 'No podemos leer los datos ahora mismo. Vuelve a intentarlo en unos segundos.',
    tablaPendiente(error) ? 'RITEAPP_SIN_TABLAS' : 'BD_NO_DISPONIBLE');
    e.detalle = `${contexto}: ${error?.message || error}`;
    return e;
}
function responderError(res, e, contexto = 'riteapp') {
    if (e instanceof ErrorRite) {
        if (e.status >= 500) console.error(`[riteapp] ${contexto}:`, e.detalle || e.message);
        return res.status(e.status).json({ error: e.message, code: e.code, ...(e.extra || {}) });
    }
    console.error(`[riteapp] ${contexto}:`, e?.stack || e);
    return res.status(500).json({ error: 'Algo ha fallado. Vuelve a intentarlo.', code: 'ERROR_INTERNO' });
}

const esUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const txt = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// ── Lo que ve el instalador (sin lo interno) ─────────────────────────────────
const CAMPOS_CUENTA = ['id', 'email', 'nombre', 'apellidos', 'nif', 'telefono', 'empresa', 'empresa_nif',
    'es_autonomo', 'numero_empresa_rite', 'direccion', 'municipio', 'provincia', 'codigo_postal',
    'representante_nombre', 'representante_apellidos', 'representante_nif', 'representante_cargo',
    'tecnico_firmante_distinto', 'tecnico_firmante_nombre', 'tecnico_firmante_apellidos',
    'tecnico_firmante_dni', 'tecnico_firmante_carnet_rite', 'estado', 'creditos', 'creditos_usados', 'created_at'];
const cuentaPublica = (c) => c ? Object.fromEntries(CAMPOS_CUENTA.map(k => [k, c[k] ?? null])) : null;
const CAMPOS_PERFIL = CAMPOS_CUENTA.filter(k => !['id', 'email', 'estado', 'creditos', 'creditos_usados', 'created_at'].includes(k));

/** Lo que el instalador puede cambiar de su perfil (lista blanca). */
function limpiarPerfil(body = {}) {
    const out = {};
    for (const k of CAMPOS_PERFIL) {
        if (!(k in body)) continue;
        out[k] = (k === 'es_autonomo' || k === 'tecnico_firmante_distinto') ? !!body[k] : (txt(body[k], 120) || null);
    }
    for (const k of ['empresa_nif', 'nif', 'representante_nif', 'tecnico_firmante_dni']) if (out[k]) out[k] = out[k].toUpperCase().replace(/[\s-]/g, '');
    return out;
}

// ── Los datos de la memoria (lista blanca por bloque) ────────────────────────
const SEXOS = ['H', 'M', ''];
function limpiarDatos(d = {}) {
    const t = d.titular || {}, v = d.vivienda || {}, i = d.instalacion || {}, f = d.fechas || {};
    const equipo = (u) => {
        if (!u || typeof u !== 'object') return {};
        const e = {};
        for (const k of ['marca', 'modelo', 'modelo_conjunto', 'modelo_ud_exterior', 'numero_serie', 'refrigerante', 'tipo_equipo_nuevo']) if (u[k]) e[k] = txt(u[k], 120);
        for (const k of ['potencia', 'litros_acs', 'potencia_resistencia_acs']) if (u[k] !== undefined && u[k] !== '') e[k] = Number(String(u[k]).replace(',', '.')) || null;
        if (u.aerotermia_db_id) e.aerotermia_db_id = Number(u.aerotermia_db_id) || null;
        if (Array.isArray(u.equipos_extra)) e.equipos_extra = u.equipos_extra.slice(0, 5).map(equipo);
        return e;
    };
    const fecha = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? x : null);
    return {
        titular: {
            es_empresa: !!t.es_empresa, nombre: txt(t.nombre, 120).toUpperCase(), apellidos: txt(t.apellidos, 120).toUpperCase(),
            nif: txt(t.nif, 20).toUpperCase().replace(/[\s-]/g, ''), sexo: SEXOS.includes(t.sexo) ? t.sexo : '',
            telefono: txt(t.telefono, 20), email: txt(t.email, 120).toLowerCase(),
            misma_direccion: t.misma_direccion !== false,
            direccion: txt(t.direccion, 160).toUpperCase(), municipio: txt(t.municipio, 80).toUpperCase(),
            provincia: txt(t.provincia, 60).toUpperCase(), codigo_postal: txt(t.codigo_postal, 5),
        },
        vivienda: {
            ref_catastral: txt(v.ref_catastral, 20).toUpperCase().replace(/[^A-Z0-9]/g, ''),
            direccion: txt(v.direccion, 160).toUpperCase(), municipio: txt(v.municipio, 80).toUpperCase(),
            provincia: txt(v.provincia, 60).toUpperCase(), codigo_postal: txt(v.codigo_postal, 5),
            superficie: Number(v.superficie) > 0 ? Math.round(Number(v.superficie) * 10) / 10 : null,
            plantas: Math.max(1, Math.min(4, parseInt(v.plantas, 10) || 1)),
            zona: txt(v.zona, 4).toUpperCase() || null, altitud: Number(v.altitud) || null,
            coord_x: Number(v.coord_x) || null, coord_y: Number(v.coord_y) || null,
            anio_construccion: parseInt(v.anio_construccion, 10) || null,
            es_reforma: v.es_reforma !== false,
            catastro_at: v.catastro_at || null,
        },
        instalacion: {
            tipo_emisor: P.EMISORES.includes(i.tipo_emisor) ? i.tipo_emisor : 'radiadores_convencionales',
            aerotermia_cal: equipo(i.aerotermia_cal),
            aerotermia_acs: equipo(i.aerotermia_acs),
            cambio_acs: i.cambio_acs === true || i.cambio_acs === false ? i.cambio_acs : null,
            frio_situado_en: txt(i.frio_situado_en, 40).toUpperCase(),
        },
        fechas: { pruebas: fecha(f.pruebas), firma: fecha(f.firma) },
        estancias: P.limpiarEstancias(d.estancias),
    };
}

const nombreDeLista = (d) => {
    const t = d?.titular || {};
    const n = [t.nombre, t.apellidos].filter(Boolean).join(' ').trim();
    return (n || d?.vivienda?.direccion || '').slice(0, 120) || null;
};

// ── BD ───────────────────────────────────────────────────────────────────────
const SELECT_LISTA = 'id, numero, nombre, estado, provincia, municipio, ref_catastral, generada_at, generaciones, created_at, updated_at, informe_id';

async function listar(cuentaId) {
    const { data, error } = await supabase.from(TABLA).select(SELECT_LISTA)
        .eq('cuenta_id', cuentaId).order('created_at', { ascending: false }).limit(500);
    if (error) throw errorBd(error, 'listar');
    return data || [];
}

/** La memoria SI es de la cuenta; si no, 404 (no se confirma que exista). */
async function obtener(id, cuentaId = null) {
    if (!esUuid(id)) throw fallo(404, 'No encontramos esa memoria.', 'MEMORIA_NO_ENCONTRADA');
    let q = supabase.from(TABLA).select('*').eq('id', id);
    if (cuentaId) q = q.eq('cuenta_id', cuentaId);
    const { data, error } = await q.maybeSingle();
    if (error) throw errorBd(error, 'obtener');
    if (!data) throw fallo(404, 'No encontramos esa memoria.', 'MEMORIA_NO_ENCONTRADA');
    return data;
}

/** La memoria viva de un CIT del CRM, o null. */
async function porInforme(informeId) {
    const { data, error } = await supabase.from(TABLA).select('*').eq('informe_id', informeId).neq('estado', 'ANULADA').maybeSingle();
    if (error) throw errorBd(error, 'memoria del CIT');
    return data || null;
}

async function cuentaPorId(id) {
    const { data, error } = await supabase.from('riteapp_cuentas').select('*').eq('id', id).maybeSingle();
    if (error) throw errorBd(error, 'cuenta');
    if (!data) throw fallo(404, 'No encontramos esa cuenta.', 'CUENTA_NO_ENCONTRADA');
    return data;
}

async function crear(cuenta, datos = {}, { por = 'instalador', origen = 'INSTALADOR', informeId = null } = {}) {
    const limpio = limpiarDatos(datos);
    const fila = {
        cuenta_id: cuenta.id, datos: limpio, nombre: nombreDeLista(limpio),
        origen: origen === 'BROKERGY' ? 'BROKERGY' : 'INSTALADOR', informe_id: informeId || null,
        ref_catastral: limpio.vivienda.ref_catastral || null,
        provincia: limpio.vivienda.provincia || null, municipio: limpio.vivienda.municipio || null,
        historial: [{ at: new Date().toISOString(), por, que: origen === 'BROKERGY' ? 'CREADA POR BROKERGY' : 'CREADA' }],
    };
    const { data, error } = await supabase.from(TABLA).insert(fila).select('*').single();
    if (error) {
        if (error.code === '23505' && informeId) throw fallo(409, 'Ese CIT ya tiene su memoria RITE.', 'CIT_YA_TIENE_MEMORIA');
        throw errorBd(error, 'crear');
    }
    return data;
}

async function guardarDatos(memoria, datos) {
    if (memoria.estado === 'ANULADA') throw fallo(409, 'Esta memoria está anulada.', 'MEMORIA_ANULADA');
    const limpio = limpiarDatos({ ...memoria.datos, ...datos });
    const { data, error } = await supabase.from(TABLA).update({
        datos: limpio, nombre: nombreDeLista(limpio),
        ref_catastral: limpio.vivienda.ref_catastral || null,
        provincia: limpio.vivienda.provincia || null, municipio: limpio.vivienda.municipio || null,
        updated_at: new Date().toISOString(),
    }).eq('id', memoria.id).select('*').single();
    if (error) throw errorBd(error, 'guardar');
    return data;
}

async function anotar(memoria, que, por) {
    const historial = [...(Array.isArray(memoria.historial) ? memoria.historial : []), { at: new Date().toISOString(), por, que }].slice(-200);
    await supabase.from(TABLA).update({ historial }).eq('id', memoria.id);
}

// ── Catastro: la vivienda a partir de la referencia catastral ────────────────
// UNA petición (getByRC ya va en serie y con caché de 30 días, reglas 15-17).
async function viviendaDelCatastro(rc) {
    const limpio = String(rc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{14,20}$/.test(limpio)) throw fallo(400, 'La referencia catastral no tiene el formato correcto.', 'RC_FORMATO');
    const { getByRC } = require('../catastroService');
    let d;
    try { d = await getByRC(limpio); } catch (e) {
        if (e.code === 'RC_NOT_FOUND' || e.code === 'RC_INVALID_FORMAT') throw fallo(404, 'El Catastro no encuentra esa referencia.', e.code);
        throw fallo(503, 'El Catastro no ha respondido. Vuelve a intentarlo en unos segundos.', e.code || 'CATASTRO_NO_DISPONIBLE');
    }
    if (d?.isParcela) throw fallo(422, 'Esa referencia es un edificio entero: usa la de la vivienda (20 caracteres).', 'RC_PARCELA');
    const municipio = String(d.municipality || '').toUpperCase();
    const provincia = String(d.province || '').toUpperCase();
    const clima = municipio ? climateService.getClimateByNames(provincia, municipio) : null;
    // Superficie de VIVIENDA (sin garajes ni almacenes) si el Catastro la separa.
    const supViv = Number(d.summaryByType?.VIVIENDA) || 0;
    return {
        ref_catastral: d.rc || limpio,
        direccion: String(d.street || d.address || '').toUpperCase(),
        municipio, provincia, codigo_postal: d.postalCode || '',
        superficie: supViv || Number(d.totalSurface) || null,
        plantas: Math.max(1, Math.min(4, Number(d.floors?.total) || 1)),
        zona: clima?.climateZone || null, altitud: clima?.altitude ?? null,
        coord_x: d.utm?.x || null, coord_y: d.utm?.y || null,
        anio_construccion: Number(d.yearBuilt) || null,
        uso: d.use || null,
        catastro_at: new Date().toISOString(),
    };
}

// ── Equipos del catálogo de aerotermia ───────────────────────────────────────
const SEL_EQUIPO = 'id, marca, modelo_comercial, modelo_conjunto, modelo_ud_exterior, tipo, potencia_calefaccion, potencia_frigorifica, refrigerante, litros_acs';
async function buscarEquipos(q) {
    const t = String(q || '').trim().replace(/[%,()]/g, ' ').slice(0, 60);
    if (t.length < 2) return [];
    const partes = t.split(/\s+/).filter(Boolean).slice(0, 4);
    let query = supabase.from('aerotermia').select(SEL_EQUIPO).limit(25);
    for (const p of partes) query = query.or(`marca.ilike.%${p}%,modelo_comercial.ilike.%${p}%,modelo_conjunto.ilike.%${p}%,modelo_ud_exterior.ilike.%${p}%`);
    const { data, error } = await query;
    if (error) throw errorBd(error, 'equipos');
    return (data || []).map(equipoPublico);
}
async function buscarEquiposPorId(ids) {
    const { data, error } = await supabase.from('aerotermia').select(SEL_EQUIPO).in('id', ids.map(Number).filter(Boolean));
    if (error) throw errorBd(error, 'equipos');
    return (data || []).map(equipoPublico);
}
function equipoPublico(m) {
    return ({
        id: m.id, marca: m.marca, modelo: m.modelo_comercial || m.modelo_conjunto, modelo_ud_exterior: m.modelo_ud_exterior,
        tipo: m.tipo, potencia: Number(m.potencia_calefaccion) || null, potencia_frio: Number(m.potencia_frigorifica) || null,
        refrigerante: m.refrigerante, litros_acs: m.litros_acs,
    });
}
/** Un modelo del catálogo → el bloque `aerotermia_cal` de la memoria. */
function equipoDeCatalogo(m, numero_serie = '') {
    return {
        aerotermia_db_id: m.id, marca: m.marca, modelo: m.modelo, modelo_ud_exterior: m.modelo_ud_exterior || undefined,
        potencia: m.potencia || null, refrigerante: m.refrigerante || undefined, numero_serie: numero_serie || '',
    };
}

// ── Estancias: la propuesta por superficie (la MISMA lógica del popup del CRM) ─
let _locales = null;
const logicaLocales = () => _locales || (_locales = import(pathToFileURL(path.join(__dirname, '../../../frontend/src/features/expedientes/logic/localesRite.js')).href));

/**
 * Estancias propuestas por superficie y plantas (modo rápido), o las que se den
 * por TIPO (`[{ planta, locales: [{ tipo, elementos?, m2? }] }]`) con sus m²
 * repartidos. Devuelve la forma de `datos.estancias`.
 */
async function proponerEstancias({ superficie, plantas, modo = 'rapido', w_elemento, porTipo = null }) {
    const L = await logicaLocales();
    const estado = porTipo ? { plantas: porTipo } : L.proponerLocales({ superficie, plantas });
    const r = L.resolverLocales({
        plantas: estado.plantas.map(p => ({ planta: p.planta, locales: p.locales.map(l => ({ tipo: l.tipo, manual: Number(l.m2) > 0, m2: l.m2 })) })),
    }, superficie);
    // Los elementos tecleados (modo extendido) viajan en el mismo orden.
    const planos = (estado.plantas || []).flatMap(p => p.locales || []);
    let k = 0;
    const plantasRes = L.paraGuardar(r).plantas.map(p => ({
        ...p, locales: p.locales.map(l => { const o = planos[k++] || {}; return o.elementos ? { ...l, elementos: o.elementos } : l; }),
    }));
    return P.limpiarEstancias({ modo, w_elemento, plantas: plantasRes });
}

// ── Drive ────────────────────────────────────────────────────────────────────
let _raiz = null;
async function raiz() {
    if (process.env.RITEAPP_DRIVE_FOLDER_ID) return process.env.RITEAPP_DRIVE_FOLDER_ID;
    if (_raiz) return _raiz;
    let id = 'root';
    for (const nombre of RUTA_RAIZ) {
        let sig = await driveService.findSubfolderByName(id, nombre);
        if (!sig) sig = await driveService.createSubfolder(id, nombre);
        if (!sig) return null;
        id = sig;
    }
    return (_raiz = id);
}
async function carpetaDe(memoria, cuenta) {
    if (memoria.drive_folder_id) return memoria.drive_folder_id;
    const r = await raiz();
    if (!r) throw fallo(502, 'No hemos podido preparar la carpeta de los documentos. Vuelve a intentarlo.', 'DRIVE_FALLO');
    const empresa = driveService.sanitizeWindowsSegment(String(cuenta.empresa || cuenta.email || 'SIN EMPRESA').toUpperCase());
    const deEmpresa = await driveService.getOrCreateSubfolder(r, empresa);
    const titular = driveService.sanitizeWindowsSegment(String(memoria.nombre || '').toUpperCase());
    const nombre = titular ? `${memoria.numero} - ${titular}` : memoria.numero;
    const id = await driveService.getOrCreateSubfolder(deEmpresa, nombre);
    if (!id || id === deEmpresa) throw fallo(502, 'No hemos podido preparar la carpeta de los documentos. Vuelve a intentarlo.', 'DRIVE_FALLO');
    await supabase.from(TABLA).update({ drive_folder_id: id }).eq('id', memoria.id);
    memoria.drive_folder_id = id;
    return id;
}

/** Clase de un fichero por su NOMBRE (lo pone el generador). */
const CLASES = [
    { clase: 'MEMORIA_PDF', etiqueta: 'Memoria técnica (PDF)', test: (n) => /^MEMORIA_RITE_.*\.pdf$/i.test(n) },
    { clase: 'MEMORIA_DOCX', etiqueta: 'Memoria técnica (Word)', test: (n) => /^MEMORIA_RITE_.*\.docx$/i.test(n) },
    { clase: 'BORRADOR_CERT', etiqueta: 'Borrador del certificado de la instalación', test: (n) => /^BORRADOR_CERTIFICADO_RITE_/i.test(n) },
    { clase: 'GUIA_JE6', etiqueta: 'Guía para darla de alta (JE6)', test: (n) => /^GUIA_JE6_/i.test(n) },
    { clase: 'FIRMADA', etiqueta: 'Memoria firmada', test: (n) => /_FDO\.pdf$/i.test(n) },
];
const claseDe = (nombre) => CLASES.find(c => c.test(String(nombre || '').replace(/_OLD\d*(?=\.[a-z]+$)/i, ''))) || null;

/** Los documentos de la memoria: lo actual de cada clase y, aparte, las versiones anteriores. */
async function documentos(memoria) {
    if (!memoria.drive_folder_id) return { actuales: [], anteriores: [] };
    const ficheros = await driveService.listFiles(memoria.drive_folder_id);
    const oldId = ficheros.find(f => f.mimeType === 'application/vnd.google-apps.folder' && f.name === 'OLD')?.id;
    const viejos = oldId ? await driveService.listFiles(oldId) : [];
    const fila = (f, actual) => {
        const c = claseDe(f.name);
        return c ? { id: f.id, nombre: f.name, clase: c.clase, etiqueta: c.etiqueta, fecha: f.modifiedTime, actual, pdf: /\.pdf$/i.test(f.name) } : null;
    };
    const actuales = ficheros.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').map(f => fila(f, true)).filter(Boolean)
        .sort((a, b) => CLASES.findIndex(c => c.clase === a.clase) - CLASES.findIndex(c => c.clase === b.clase));
    const anteriores = viejos.map(f => fila(f, false)).filter(Boolean).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    return { actuales, anteriores };
}

/** Bytes de un fichero SOLO si es de esta memoria (en su carpeta o en su OLD). Si no, 404. */
async function fichero(memoria, fileId) {
    const { actuales, anteriores } = await documentos(memoria);
    const f = [...actuales, ...anteriores].find(x => x.id === fileId);
    if (!f) throw fallo(404, 'No encontramos ese documento.', 'DOCUMENTO_NO_ENCONTRADO');
    const buffer = await driveService.getFileContent(fileId);
    if (!buffer?.length) throw fallo(502, 'No hemos podido descargar el documento. Vuelve a intentarlo.', 'DRIVE_FALLO');
    const mime = f.nombre.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
    return { buffer, nombre: f.nombre, mime };
}

// ── Comprobar y GENERAR ──────────────────────────────────────────────────────
async function conPotencias(memoria) {
    const d = memoria.datos || {};
    const inst = await resolvePotenciasCatalogo(d.instalacion || {}, supabase);
    return { ...memoria, datos: { ...d, instalacion: { ...(d.instalacion || {}), ...inst } } };
}

async function comprobar(memoria, cuenta) {
    return P.comprobar({ memoria: await conPotencias(memoria), cuenta });
}

/**
 * Genera la memoria y la deja en sus documentos. `origen`: 'instalador' (gasta 1
 * crédito la PRIMERA vez) o 'BROKERGY' (no gasta). Bloquea si falta algo.
 */
async function generar(memoria, cuenta, { origen = 'instalador', por = null } = {}) {
    if (memoria.estado === 'ANULADA') throw fallo(409, 'Esta memoria está anulada.', 'MEMORIA_ANULADA');
    const lista = await conPotencias(memoria);
    const r = P.comprobar({ memoria: lista, cuenta });
    if (r.faltan.length) throw fallo(422, 'Faltan datos para generar la memoria.', 'FALTAN_DATOS', { faltan: r.faltan, avisos: r.avisos });

    // Crédito: primero se gasta y, si el generador falla, se devuelve.
    let gastado = false;
    const deBrokergy = origen === 'BROKERGY' || memoria.origen === 'BROKERGY';
    if (!deBrokergy && !memoria.credito_consumido) {
        const { data: quedan, error } = await supabase.rpc('riteapp_consumir_credito_memoria', { p_memoria_id: memoria.id });
        if (error) throw errorBd(error, 'crédito');
        if (quedan === -1) throw fallo(402, 'No te quedan memorias disponibles.', 'SIN_CREDITOS');
        gastado = quedan >= 0;
    }

    let files;
    try {
        const { expPayload, instaladorPayload, fechas } = P.payloadGenerador({ memoria: lista, cuenta });
        files = await generarRiteFiles(expPayload, instaladorPayload, fechas);
        if (!Array.isArray(files) || !files.length) throw new Error('el generador no devolvió documentos');
    } catch (e) {
        if (gastado) await devolverCredito(memoria, cuenta, 'El generador falló');
        throw Object.assign(fallo(503, 'El generador de memorias no está disponible ahora mismo. Vuelve a intentarlo en unos minutos.', 'GENERADOR_NO_DISPONIBLE'),
            { detalle: e.response?.data?.detail || e.message });
    }

    const carpeta = await carpetaDe(memoria, cuenta);
    const subidos = {};
    const bytes = {};
    for (const f of files) {
        const buffer = Buffer.from(f.base64, 'base64');
        const existente = await driveService.findFileByName(carpeta, f.name);
        if (existente) await driveService.archiveExistingToOld(carpeta, existente, f.name);
        const res = await driveService.saveFileToFolder(carpeta, f.name, f.mimetype, buffer);
        if (!res) throw fallo(502, `No hemos podido guardar «${f.name}». Vuelve a intentarlo.`, 'DRIVE_FALLO');
        const c = claseDe(f.name);
        if (c) { subidos[c.clase] = { id: res.id, nombre: f.name, at: new Date().toISOString() }; bytes[c.clase] = { buffer, nombre: f.name }; }
    }
    const ahora = new Date().toISOString();
    // Una memoria NUEVA deja sin efecto la firma de la anterior.
    const { data, error } = await supabase.from(TABLA).update({
        estado: 'GENERADA', generada_at: ahora, generaciones: (memoria.generaciones || 0) + 1,
        ficheros: subidos, updated_at: ahora,
    }).eq('id', memoria.id).select('*').single();
    if (error) throw errorBd(error, 'generar');
    await anotar(data, `MEMORIA GENERADA (${lista.datos?.estancias?.modo === 'extendido' ? 'EXTENDIDA' : 'RÁPIDA'})${origen === 'BROKERGY' ? ' POR BROKERGY' : ''}`, por || origen);
    const cit = await alCit(data, bytes, por || origen);
    return { memoria: data, avisos: r.avisos, tabla: r.tabla, ficheros: subidos, cit };
}

/**
 * Una memoria de un CIT del CRM (`informe_id`): la memoria en PDF y en Word se
 * suben al CIT como su VERSIÓN FINAL (clases FINAL_PDF / FINAL_WORD de
 * informeService.subir, que archiva la anterior en OLD y deja el CIT pendiente
 * de firma). Un fallo aquí NO deshace la generación: se anota y se dice.
 */
async function alCit(memoria, bytes, por) {
    if (!memoria.informe_id) return null;
    try {
        const I = require('../informeService');
        const row = await I.cargar(memoria.informe_id, { conRelaciones: false });
        if (!row || row.anulado_at) return { ok: false, motivo: 'El CIT no existe o está anulado' };
        if (bytes.MEMORIA_PDF) await I.subir(row, 'FINAL_PDF', { ...bytes.MEMORIA_PDF, usuario: por, origen: 'equipo' });
        const fila = await I.cargar(memoria.informe_id, { conRelaciones: false });
        if (bytes.MEMORIA_DOCX) await I.subir(fila, 'FINAL_WORD', { ...bytes.MEMORIA_DOCX, usuario: por, origen: 'equipo' });
        await I.anotar(row.id, `Memoria RITE ${memoria.numero} generada en la app RITE: subida como versión final`, por);
        return { ok: true, numero: row.numero };
    } catch (e) {
        console.error('[riteapp] No se pudo pasar la memoria al CIT:', e.message);
        await anotar(memoria, `NO SE HA PODIDO PASAR AL CIT: ${e.message}`.slice(0, 300), 'sistema').catch(() => {});
        return { ok: false, motivo: e.message };
    }
}

// ── Enlace para que el INSTALADOR complete la memoria (sin cuenta) ──────────
// `/completar/:token` en rite.brokergy.es. 32 hex aleatorios, caduca a los 30 días,
// y uno nuevo anula el anterior. Solo lo crea el equipo (riteappAdmin).
const crypto = require('crypto');
const DIAS_ENLACE = 30;
const urlApp = () => String(process.env.RITEAPP_URL || 'https://rite.brokergy.es').trim().replace(/\/+$/, '');

async function crearEnlace(memoria, { por = 'BROKERGY' } = {}) {
    if (memoria.estado === 'ANULADA') throw fallo(409, 'Esta memoria está anulada.', 'MEMORIA_ANULADA');
    const token = crypto.randomBytes(16).toString('hex');
    const caduca = new Date(Date.now() + DIAS_ENLACE * 86400000).toISOString();
    const { data, error } = await supabase.from(TABLA).update({ enlace_token: token, enlace_caduca_at: caduca, completada_at: null })
        .eq('id', memoria.id).select('*').single();
    if (error) throw errorBd(error, 'enlace');
    await anotar(data, 'ENLACE PARA EL INSTALADOR CREADO', por);
    return { url: `${urlApp()}/completar/${token}`, caduca_at: caduca, memoria: data };
}

/** La memoria del enlace, o 404 (mal, caducado o anulada). Con la BD caída, 503 (regla 38). */
async function porToken(token) {
    const t = String(token || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(t)) throw fallo(404, 'Este enlace no vale.', 'ENLACE_NO_VALIDO');
    const { data, error } = await supabase.from(TABLA).select('*').eq('enlace_token', t).maybeSingle();
    if (error) throw errorBd(error, 'enlace');
    if (!data || data.estado === 'ANULADA') throw fallo(404, 'Este enlace no vale.', 'ENLACE_NO_VALIDO');
    if (data.enlace_caduca_at && new Date(data.enlace_caduca_at) < new Date()) throw fallo(410, 'Este enlace ha caducado. Pide otro a BROKERGY.', 'ENLACE_CADUCADO');
    return data;
}

async function devolverCredito(memoria, cuenta, motivo) {
    try {
        const c = await cuentaPorId(cuenta.id);
        const saldo = (c.creditos || 0) + 1;
        await supabase.from('riteapp_cuentas').update({ creditos: saldo, creditos_usados: Math.max(0, (c.creditos_usados || 1) - 1) }).eq('id', c.id);
        await supabase.from(TABLA).update({ credito_consumido: false, credito_consumido_at: null }).eq('id', memoria.id);
        await supabase.from('riteapp_movimientos').insert({ cuenta_id: c.id, memoria_id: memoria.id, tipo: 'DEVOLUCION', creditos: 1, saldo_despues: saldo, concepto: motivo, por: 'sistema' });
    } catch (e) { console.error('[riteapp] No se pudo devolver el crédito:', e.message); }
}

module.exports = {
    ErrorRite, fallo, errorBd, responderError, esUuid, cuentaPublica, limpiarPerfil, limpiarDatos,
    listar, obtener, cuentaPorId, crear, guardarDatos, anotar,
    viviendaDelCatastro, buscarEquipos, buscarEquiposPorId, equipoDeCatalogo, proponerEstancias,
    documentos, fichero, comprobar, generar, claseDe, CLASES, crearEnlace, porToken, urlApp, porInforme,
};
