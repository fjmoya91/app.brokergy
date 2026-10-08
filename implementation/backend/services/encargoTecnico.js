// ============================================================================
// encargoTecnico.js — la PÁGINA DEL ENCARGO para el certificador (/encargo/:id)
//
// Al técnico el encargo le llegaba repartido: un email con la ficha del cliente,
// un WhatsApp con la carpeta, otro enlace para subir, otro para presentar, y las
// fotos en Drive. Delante de la vivienda, con el móvil, eso son cuatro sitios que
// buscar. Esta página lo junta TODO en una, pensada para el teléfono: qué le toca
// ahora, a quién llamar, dónde es (y cómo llegar), qué hay y qué se instala, lo
// que confirmó el cliente, las fotos que ya mandó —y cuáles faltan— y los enlaces
// para subir, firmar y presentar.
//
// Vale para los DOS negocios (expediente CAE y CEE directo): al técnico le llegan
// los dos y el gesto tiene que ser el mismo.
//
// REGLA — el enlace es de ESE técnico. La firma lleva el certificador ASIGNADO
// (`firmaEncargo`): si el encargo se pasa a otro, el enlace del anterior deja de
// enseñar el teléfono y la dirección del cliente, sin tener que invalidar nada.
// Es distinto del enlace de subida (`ceeUploadSignature`), que no caduca y no
// depende del técnico: subir un fichero no expone a nadie; esta página sí.
//
// REGLA — solo sale lo que se ELIGE (lista blanca). `instalacion` lleva también
// datos económicos (`economico_override`) y la oportunidad, el margen: nada de
// eso viaja. Y NADA que compare con la PROPUESTA (demanda, superficie simulada,
// ahorro objetivo): es la misma regla que la revisión previa del técnico
// (`cee/revisionTecnico.js`) — enseñárselo es invitarle a ajustar el modelo
// hasta que cuadre.
//
// REGLA — de las fotos, las de SU certificado: las de antes de la obra para el
// CEE inicial, las de después para el final. Nunca presupuestos ni facturas
// (llevan precios), ni el cajón de lo que no encaja en ninguna casilla (puede
// ser cualquier cosa). Las miniaturas se sirven por aquí mismo, y solo de un
// fichero que esté en esa lista (`ficheroPermitido`).
// ============================================================================

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const { buildCertClienteData } = require('./certClienteData');

const APP_BASE = process.env.FRONTEND_URL || 'https://app.brokergy.es';
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_DRIVE = /^[A-Za-z0-9_-]{10,100}$/;

const normFase = (f) => (String(f || '').toLowerCase() === 'final' ? 'final' : 'inicial');
const normNegocio = (n) => (n === 'cee' ? 'cee' : 'cae');
const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());

// ── La FIRMA del enlace ──────────────────────────────────────────────────────

function secreto() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'brokergy-encargo';
}

/** HMAC de (negocio, expediente, fase, TÉCNICO): cambia el técnico, cambia la firma. */
function firmaEncargo({ negocio, id, fase, certId }) {
    return crypto.createHmac('sha256', secreto())
        .update(`encargo:${normNegocio(negocio)}:${id}:${normFase(fase)}:${certId}`)
        .digest('hex').slice(0, 40);
}

function firmaValida(o, token) {
    if (!token || !o?.certId) return false;
    try {
        const a = Buffer.from(firmaEncargo(o));
        const b = Buffer.from(String(token));
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { return false; }
}

/** El enlace de la página del encargo, o null si no hay técnico al que dárselo. */
function enlaceEncargo({ negocio, id, fase, certId, base = APP_BASE }) {
    if (!id || !certId) return null;
    const q = new URLSearchParams({ token: firmaEncargo({ negocio, id, fase, certId }), phase: normFase(fase) });
    if (normNegocio(negocio) === 'cee') q.set('origen', 'cee');
    return `${base}/encargo/${id}?${q.toString()}`;
}

const TEXTO_ENLACE = '📋 Todo el encargo en una página (cliente, dirección, fotos y enlaces):';

/**
 * Mete el enlace de la página en un mensaje de WhatsApp al técnico. Si el
 * mensaje ya trae el de «abrir el expediente en la app», lo SUSTITUYE (la página
 * lo lleva dentro): un mensaje con cuatro enlaces no se sabe por cuál empezar.
 * Si no, va antes de la firma. Si ya lo lleva, no se toca.
 */
function conEnlaceEncargo(texto, enlace) {
    if (!enlace || !texto || texto.includes('/encargo/')) return texto;
    const bloque = `${TEXTO_ENLACE}\n${enlace}`;
    const deLaApp = /🔗 Abre el expediente directamente en la app:\n\S+/;
    if (deLaApp.test(texto)) return texto.replace(deLaApp, () => bloque);
    const firma = '\n\n*BROKERGY · Ingeniería Energética*';
    const i = texto.lastIndexOf(firma);
    return i >= 0 ? `${texto.slice(0, i)}\n\n${bloque}${texto.slice(i)}` : `${texto}\n\n${bloque}`;
}

// ── Qué le toca ahora ────────────────────────────────────────────────────────

/**
 * El paso en el que está el encargo, dicho para el técnico, a partir del
 * subestado del CEE de esa fase (`seguimiento.cee_*`).
 */
function pasoDe(subestado, { ackPendiente = false, registrado = false } = {}) {
    const s = String(subestado || '').toUpperCase();
    // Con el justificante de registro subido está registrado, diga lo que diga
    // el subestado: en los migrados se quedó en ASIGNADO y la página le pedía
    // «acepta el encargo» a un certificado ya inscrito (26RES060_100). Solo el
    // justificante: un .xml subido no prueba nada (puede haber vuelto a trabajo).
    if (s === 'REGISTRADO' || registrado) {
        return { clave: 'registrado', titulo: 'Registrado',
                 texto: 'El certificado está registrado. No te queda nada por hacer en este encargo. ¡Gracias!' };
    }
    if (s === 'REVISADO') {
        return { clave: 'presentar', titulo: 'Fírmalo y preséntalo en el Registro',
                 texto: 'Tiene nuestro visto bueno. Fírmalo, preséntalo en la sede y sube aquí el justificante de registro y la etiqueta.' };
    }
    if (s === 'PRESENTADO' || s === 'PTE_REVISION') {
        return { clave: 'revision', titulo: 'Lo estamos revisando',
                 texto: 'Ya tenemos lo que subiste. Te avisamos en cuanto tenga el visto bueno, o si hay que corregir algo.' };
    }
    if (ackPendiente) {
        return { clave: 'aceptar', titulo: 'Acepta el encargo',
                 texto: 'Confírmanos que lo coges. Después, visita la vivienda y sube el certificado.' };
    }
    return { clave: 'visita', titulo: 'Visita la vivienda y sube el certificado',
             texto: 'Cuando lo tengas, sube el .xml y el .cex: se revisan solos al subirlos y te decimos si hay algo que corregir.' };
}

// ── Dónde es ─────────────────────────────────────────────────────────────────

/**
 * UTM (ETRS89, huso 30 — el EPSG:25830 con el que la app guarda las
 * coordenadas del Catastro) a latitud/longitud. Para el «Cómo llegar»: la
 * dirección escrita no siempre la encuentra el mapa (una finca rústica, una calle
 * sin número), las coordenadas sí.
 */
function utmALatLon(x, y, huso = 30) {
    const E = Number(x), N = Number(y);
    if (!Number.isFinite(E) || !Number.isFinite(N) || E < 100000 || E > 900000 || N < 3000000 || N > 5000000) return null;
    const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const m = N / k0;
    const mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
        + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
        + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const n1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2);
    const t1 = Math.tan(p1) ** 2, c1 = ep2 * Math.cos(p1) ** 2;
    const r1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5;
    const d = (E - 500000) / (n1 * k0);
    const lat = p1 - (n1 * Math.tan(p1) / r1) * (d * d / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720);
    const lon0 = ((huso - 1) * 6 - 180 + 3) * Math.PI / 180;
    const lon = lon0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120) / Math.cos(p1);
    const r = { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
    // Fuera de España (y sus islas) es un dato mal escrito: mejor la dirección.
    return r.lat > 27 && r.lat < 44.5 && r.lon > -19 && r.lon < 5 ? r : null;
}

/**
 * «Cómo llegar» y «Ver en Catastro», con las coordenadas si se tienen.
 * El de Catastro pasa por `/api/catastro/sede/:rc` —el MISMO enlace que el icono del
 * Catastro del resto de la app (`enlaceSedeCatastro`)—, que redirige a la ficha del
 * inmueble con su delegación y su municipio: el atajo `OVCListaBienes.aspx?rc1=&rc2=`
 * depende de la sesión de la Sede del navegador y a veces contesta "No hay inmuebles".
 * Relativo a propósito: lo pinta nuestra propia página, en el mismo origen que la API.
 */
function comoLlegar({ direccion, coord_x: x, coord_y: y, rc }) {
    const p = utmALatLon(x, y);
    const destino = p ? `${p.lat.toFixed(6)},${p.lon.toFixed(6)}` : limpio(direccion);
    const ref = limpio(rc).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return {
        mapa: destino ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}` : null,
        catastro: ref.length >= 14 && ref.length <= 20 ? `/api/catastro/sede/${ref}` : null,
        conCoordenadas: !!p,
    };
}

// ── El material (fotos y documentos) ─────────────────────────────────────────

//: Nunca: lo que lleva precios, y el cajón de lo que no encaja en ninguna casilla.
const RE_FUERA = /FACTURA|PRESUPUESTO/;
const esCajon = (k) => /^OTROS/.test(String(k || ''));

function tipoDe(mime, nombre) {
    // Manda el tipo que dice Drive; la extensión, solo si Drive no lo dice.
    const m = String(mime || '').toLowerCase();
    if (m.startsWith('image/')) return 'imagen';
    if (m.startsWith('video/')) return 'video';
    if (m === 'application/pdf') return 'pdf';
    const n = String(nombre || '').toLowerCase();
    if (/\.(jpe?g|png|webp|heic|gif)$/.test(n)) return 'imagen';
    if (/\.(mp4|mov|avi|3gp|webm)$/.test(n)) return 'video';
    if (n.endsWith('.pdf')) return 'pdf';
    return 'otro';
}

/**
 * Los apartados de la vista de documentación que le sirven al técnico en ESTA
 * fase: los de ANTES de la obra para el CEE inicial, los de DESPUÉS para el
 * final. Con lo que tienen y, si falta algo, que falta — lo decide `falta(s)`
 * (por defecto, lo obligatorio sin nada). Lo que ni tiene nada ni falta, no sale.
 */
function materialDeFase(slots, fase, falta = (s) => !!s.required && !(s.items || []).length) {
    const quiere = fase === 'final' ? 'DESPUES' : 'ANTES';
    return (slots || [])
        .filter(s => s && !esCajon(s.key) && !RE_FUERA.test(String(s.key)))
        .filter(s => (s.fase || 'ANTES') === quiere)
        .map(s => ({
            clave: s.key,
            titulo: s.label || s.key,
            ayuda: s.help || null,
            falta: !!falta(s),
            ficheros: (s.items || []).filter(it => RE_DRIVE.test(String(it.driveId || ''))).map(it => ({
                id: it.driveId,
                nombre: it.name || null,
                tipo: tipoDe(it.mimeType, it.name),
                mime: it.mimeType || null,
                enlace: it.link || null,
            })),
        }))
        .filter(s => s.ficheros.length || s.falta);
}

/**
 * Qué FALTA para el CEE INICIAL, con el criterio de siempre (`utils/materialCee`,
 * fuente única con el parte diario): la vivienda por fuera —el VÍDEO, o la
 * fachada y los patios— y la caldera con su placa. Lo demás (planos, el CEE
 * anterior) ayuda pero no falta. Se mide sobre la vista ya reconciliada con Drive.
 */
function faltaParaCeeInicial(slots, instalacion) {
    const { materialCee, SLOT } = require('../utils/materialCee');
    const m = materialCee(Object.fromEntries((slots || []).map(s => [s.key, s.items || []])), instalacion);
    const falta = new Set();
    if (m.vivienda.estado === 'falta') falta.add(SLOT.FACHADA);
    if (m.caldera.aplica && !m.caldera.fotos) falta.add(SLOT.CALDERA);
    if (m.placa.aplica && !m.placa.fotos) falta.add(SLOT.PLACA);
    return (s) => falta.has(s.key);
}

/** Un teléfono que lo parece (9 cifras o más): la ficha a veces lleva otra cosa en ese campo. */
function telefono(v) {
    const t = limpio(v);
    return t.replace(/[^0-9]/g, '').length >= 9 ? t : null;
}

/**
 * El domicilio del cliente, SOLO si no es la misma cadena que la vivienda.
 * Se compara sin tildes, sin signos y sin espacios, y vale que una contenga a la
 * otra (el domicilio suele llevar además el CP y la provincia). No se afirma que
 * sea OTRA dirección —puede diferir en una errata—: la página lo rotula en neutro.
 */
function domicilioAparte(domicilio, vivienda) {
    const d = limpio(domicilio);
    if (!d) return null;
    const n = (v) => limpio(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const a = n(d), b = n(vivienda);
    if (!b) return d;
    return (a === b || a.includes(b) || b.includes(a)) ? null : d;
}

// Lo que se puede servir por la página, por encargo: se rellena al cargarla.
const PERMITIDOS_MS = 20 * 60_000;
const permitidos = new Map();   // `${negocio}:${id}:${fase}` → { at, ficheros: Map(driveId → {mime, tipo, enlace}) }

function apuntarPermitidos(clave, material) {
    const ficheros = new Map();
    for (const s of material) for (const f of s.ficheros) ficheros.set(f.id, f);
    permitidos.set(clave, { at: Date.now(), ficheros });
    if (permitidos.size > 300) {
        const viejo = permitidos.keys().next().value;
        permitidos.delete(viejo);
    }
}

// ── Cargar ───────────────────────────────────────────────────────────────────

const pick = (o, claves) => {
    if (!o || typeof o !== 'object') return null;
    const r = {};
    for (const k of claves) if (o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k];
    return Object.keys(r).length ? r : null;
};

const CALDERA = ['rendimiento_id', 'marca', 'modelo', 'anio_fabricacion', 'potencia', 'potencia_kw'];
const EQUIPO = ['marca', 'modelo', 'modelo_conjunto', 'modelo_ud_exterior', 'modelo_ud_interior'];

/** ¿El ACS lo da OTRO aparato? Por el MODELO (id del catálogo o marca+modelo), nunca por el flag. */
function acsEsOtroEquipo(inst) {
    if (inst?.misma_aerotermia_acs !== false) return false;
    const a = inst.aerotermia_acs || {}, c = inst.aerotermia_cal || {};
    if (!limpio(a.marca) && !limpio(a.modelo) && !a.aerotermia_db_id) return false;
    if (a.aerotermia_db_id && c.aerotermia_db_id) return String(a.aerotermia_db_id) !== String(c.aerotermia_db_id);
    const firma = (e) => `${limpio(e.marca)}|${limpio(e.modelo)}`.toUpperCase();
    return firma(a) !== firma(c);
}

/**
 * El OBJETIVO del certificado: la demanda de calefacción y la superficie útil de
 * la simulación (o el ahorro, en un RES080), porque de ellas sale el ahorro en
 * MWh que se puede certificar. Son las MISMAS cifras del email del encargo
 * (`objetivosEncargo`, fuente única) — la página no puede decir otra cosa que el
 * correo. Solo las cifras: ni el bono ni ningún importe.
 */
function objetivoParaTecnico(op) {
    if (!op) return null;
    const o = require('../utils/objetivoEncargo').objetivosEncargo(op);
    const r = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
    const out = {
        reforma: o.esReforma,
        demanda: r(o.demandaPerM2, 1),
        // En un RES080 el email no pide superficie mínima: manda el ahorro.
        superficie: o.esReforma ? null : r(o.superficieRef, 2),
        ahorro: o.esReforma ? r(o.ahorroObjetivo, 0) : null,
    };
    return out.demanda || out.superficie || out.ahorro ? out : null;
}

// Del expediente CAE, solo lo que la página enseña (regla 22: nunca `cee` entero,
// que lleva los XML del certificado).
const SELECT_CAE = [
    'id', 'numero_expediente', 'estado', 'cliente_id', 'oportunidad_id', 'instalacion', 'seguimiento',
    'cert_id:cee->>certificador_id',
    'ack_token:cee->>ack_token', 'ack_phase:cee->>ack_phase',
    'ack_at:cee->>ack_confirmed_at', 'ack_fase:cee->>ack_confirmed_phase',
    'carpeta:cee->>cee_folder_link',
    'fv_inicial:cee->>fecha_visita_cee_inicial', 'fv_final:cee->>fecha_visita_cee_final',
    'ff_inicial:cee->>fecha_firma_cee_inicial', 'ff_final:cee->>fecha_firma_cee_final',
    'rev_inicial:cee->revision_inicial', 'rev_final:cee->revision_final',
    'ficheros:cee->cee_files',
    'fr_inicial:documentacion->>fecha_registro_cee_inicial', 'fr_final:documentacion->>fecha_registro_cee_final',
].join(', ');

const fallo = (status, error) => Object.assign(new Error(error), { status });
const NO_ES_TUYO = 'Este enlace ya no vale: puede que el encargo se haya pasado a otro técnico. Pídenos uno nuevo si lo necesitas.';

async function certificador(certId) {
    if (!certId) return null;
    const { data } = await supabase.from('prescriptores')
        .select('id_empresa, razon_social, acronimo, nombre_responsable, apellidos_responsable, es_autonomo')
        .eq('id_empresa', certId).maybeSingle();
    return data || null;
}

function personaContacto(cli) {
    const nombre = limpio(cli?.persona_contacto_nombre);
    const tlf = telefono(cli?.persona_contacto_tlf);
    const email = limpio(cli?.persona_contacto_email);
    return nombre || tlf || email ? { nombre: nombre || null, tlf: tlf || null, email: email || null } : null;
}

async function cargarCae(id, fase, token) {
    const { data: exp, error } = await supabase.from('expedientes').select(SELECT_CAE).eq('id', id).maybeSingle();
    if (error) throw fallo(500, 'No se ha podido abrir el encargo ahora mismo.');
    if (!exp) throw fallo(404, 'Este expediente ya no existe.');
    if (!firmaValida({ negocio: 'cae', id, fase, certId: exp.cert_id }, token)) throw fallo(403, NO_ES_TUYO);

    const [{ data: op }, { data: cli }, cert] = await Promise.all([
        exp.oportunidad_id
            ? supabase.from('oportunidades')
                .select('id, id_oportunidad, referencia_cliente, ref_catastral, ficha, datos_calculo')
                .eq('id', exp.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
        exp.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
        certificador(exp.cert_id),
    ]);

    const inst = exp.instalacion || {};
    const dc = op?.datos_calculo || {};
    const { data: ficha } = buildCertClienteData(exp, op, cli);

    // Las fotos, reconciliadas con Drive (regla 20): la MISMA vista que el panel
    // de documentación, podada a las de este certificado.
    let material = [];
    if (op) {
        try {
            const vista = await require('./reformaUploadService').buildDocsView(op);
            material = materialDeFase(vista.slots, fase,
                fase === 'inicial' ? faltaParaCeeInicial(vista.slots, inst) : undefined);
            const fachada = material.find(s => s.clave === 'FOTO_FACHADA_PRINCIPAL' && s.falta);
            if (fachada) fachada.ayuda = 'La fachada desde la calle, o un vídeo de la vivienda, que la sustituye.';
        } catch (e) { console.warn('[encargo] fotos:', e.message); }
    }

    // `ack_phase` llega como 'initial', 'INITIAL' o 'final' (normalizeData):
    // `normFase` ya lo reduce a inicial/final.
    const confirmadoFase = !!exp.ack_at && normFase(exp.ack_fase) === fase;
    const ackPendiente = !!exp.ack_token && normFase(exp.ack_phase) === fase && !confirmadoFase;

    const subestado = exp.seguimiento?.[fase === 'final' ? 'cee_final' : 'cee_inicial'] || null;
    const { ceeUploadSignature } = require('./ceeUploadService');
    const subir = `${APP_BASE}/subir-cee/${id}?token=${ceeUploadSignature(id, fase)}&phase=${fase}`;
    const rev = exp[`rev_${fase}`];

    return {
        negocio: 'cae',
        clave: `cae:${id}:${fase}`,
        numero: exp.numero_expediente || op?.id_oportunidad || id,
        fase,
        faseLabel: fase === 'final' ? 'CEE final' : 'CEE inicial',
        ficha: op?.ficha || null,
        objetivo: objetivoParaTecnico(op),
        subestado,
        ack: ackPendiente ? { pendiente: true, token: exp.ack_token, fase: exp.ack_phase || 'initial' }
            : (confirmadoFase ? { aceptado: exp.ack_at } : null),
        cert,
        cliente: {
            nombre: ficha.nombre, dni: ficha.dni, tlf: telefono(ficha.tlf), email: ficha.email,
            contacto: personaContacto(cli),
            domicilio: domicilioAparte(ficha.direccionCliente, ficha.direccionInstalacion),
        },
        vivienda: {
            direccion: ficha.direccionInstalacion,
            rc: ficha.refCatastral,
            ...comoLlegar({ direccion: ficha.direccionInstalacion, coord_x: inst.coord_x, coord_y: inst.coord_y, rc: ficha.refCatastral }),
        },
        instalacion: {
            caldera: pick(inst.caldera_antigua_cal, CALDERA),
            potencia_caldera: Number(inst.potencia_caldera_kw || inst.potencia_caldera) || null,
            caldera_acs: inst.misma_caldera_acs === false ? pick(inst.caldera_antigua_acs, CALDERA) : null,
            combustible_tipo: dc.inputs?.fuelType || null,
            aerotermia: pick(inst.aerotermia_cal, EQUIPO),
            // El ACS en otra máquina solo si ES otra máquina: un conjunto guarda el
            // mismo modelo en los dos nodos con el flag en false (regla 12.c).
            aerotermia_acs: acsEsOtroEquipo(inst) ? pick(inst.aerotermia_acs, EQUIPO) : null,
            tipo_emisor: inst.tipo_emisor || null,
            cambio_acs: inst.cambio_acs !== false,
            hibridacion: inst.hibridacion === true || /093|173/.test(String(op?.ficha || '')),
            fotovoltaica: pick(inst.fotovoltaica, ['estado', 'potencia_kwp', 'potencia_desconocida']),
        },
        confirmacion: inst.confirmacion_cliente || dc.confirmacion_cliente || null,
        cuestionario: null,
        material,
        subidos: Object.fromEntries(Object.entries(exp.ficheros?.[fase] || {})
            .filter(([k]) => ['xml', 'cex', 'pdf', 'registro', 'etiqueta'].includes(k))
            .map(([k, v]) => [k, !!v])),
        revision: rev ? require('./cee/revisionTecnico').guardadaParaTecnico(rev) : null,
        fechas: { visita: exp[`fv_${fase}`] || null, firma: exp[`ff_${fase}`] || null, registro: exp[`fr_${fase}`] || null },
        enlaces: {
            subir,
            presentar: String(subestado || '').toUpperCase() === 'REVISADO' ? subir.replace('/subir-cee/', '/presentar-cee/') : null,
            envolvente: `${APP_BASE}/envolvente/${id}`,
            app: `${APP_BASE}/?exp=${id}`,
            carpeta: exp.carpeta || null,
        },
    };
}

async function cargarCeeDirecto(id, fase, token) {
    const svc = require('./ceeDirectoService');
    const estados = require('../utils/ceeDirectoEstados');
    const row = await svc.cargar(id);
    if (!row || row.id !== id) throw fallo(404, 'Este expediente ya no existe.');
    const certId = row.cee?.certificador_id || null;
    if (!firmaValida({ negocio: 'cee', id, fase, certId }, token)) throw fallo(403, NO_ES_TUYO);
    // Un encargo de un solo certificado no tiene fase final.
    const f = estados.esDoble(row) ? fase : 'inicial';

    const comoExpediente = { instalacion: { direccion: row.direccion, codigo_postal: row.codigo_postal,
                                            municipio: row.municipio, provincia: row.provincia,
                                            ref_catastral: row.ref_catastral } };
    const { data: ficha } = buildCertClienteData(comoExpediente, { ref_catastral: row.ref_catastral }, row.cliente);

    let material = [];
    try {
        const vista = await require('./ceeDirectoDocsService').vista(row);
        material = materialDeFase(vista.slots, 'inicial');
    } catch (e) { console.warn('[encargo cee] fotos:', e.message); }

    let carpeta = null;
    try { carpeta = await require('./ceeDirectoUploadService').findSectionFolderLink(row, f); }
    catch (e) { console.warn('[encargo cee] carpeta:', e.message); }

    const cee = row.cee || {};
    const ackFase = normFase(cee.ack_phase);
    const ackPendiente = !!cee.ack_token && ackFase === f;
    const subestado = row.seguimiento?.[f === 'final' ? 'cee_final' : 'cee_inicial'] || null;
    const { uploadSignature } = require('./ceeDirectoUploadService');

    return {
        negocio: 'cee',
        clave: `cee:${id}:${f}`,
        numero: row.numero_expediente || id,
        fase: f,
        faseLabel: estados.esDoble(row) ? (f === 'final' ? 'CEE final' : 'CEE inicial') : 'CEE',
        ficha: null,
        objetivo: null,  // un CEE suelto no tiene simulación detrás: no hay ahorro que certificar
        subestado,
        ack: ackPendiente
            ? { pendiente: true, token: cee.ack_token, rechazar: `${APP_BASE}/cee-ack/${id}?token=${cee.ack_token}&r=no` }
            : (cee.ack_respuesta === 'acepta' ? { aceptado: cee.ack_respuesta_at || null } : null),
        cert: await certificador(certId),
        cliente: {
            nombre: ficha.nombre, dni: ficha.dni, tlf: telefono(ficha.tlf), email: ficha.email,
            contacto: personaContacto(row.cliente),
            domicilio: domicilioAparte(ficha.direccionCliente, ficha.direccionInstalacion),
        },
        vivienda: {
            direccion: ficha.direccionInstalacion,
            rc: ficha.refCatastral,
            ...comoLlegar({ direccion: ficha.direccionInstalacion, rc: ficha.refCatastral }),
        },
        instalacion: null,
        confirmacion: null,
        cuestionario: row.documentacion?.cuestionario || null,
        material,
        subidos: Object.fromEntries(Object.entries(cee.cee_files?.[f] || {})
            .filter(([k]) => ['xml', 'cex', 'pdf', 'registro', 'etiqueta'].includes(k))
            .map(([k, v]) => [k, !!v])),
        revision: null,
        fechas: { visita: cee[`fecha_visita_cee_${f}`] || null, firma: cee[`fecha_firma_cee_${f}`] || null,
                  registro: row.documentacion?.[`fecha_registro_cee_${f}`] || null },
        enlaces: {
            subir: `${APP_BASE}/subir-cee-directo/${id}?token=${uploadSignature(id, f)}&phase=${f}`,
            presentar: null,
            envolvente: `${APP_BASE}/envolvente/${id}?origen=cee`,
            app: `${APP_BASE}/?cee=${id}`,
            carpeta,
        },
    };
}

/**
 * Lo que pinta la página, con el token ya comprobado. Lanza con `status` si el
 * enlace no vale (403) o el expediente no existe (404).
 */
async function cargarEncargo({ negocio, id, fase, token }) {
    if (!RE_UUID.test(String(id || ''))) throw fallo(404, 'Este enlace no es de ningún encargo.');
    const n = normNegocio(negocio);
    const f = normFase(fase);
    const e = n === 'cee' ? await cargarCeeDirecto(id, f, token) : await cargarCae(id, f, token);
    apuntarPermitidos(e.clave, e.material);
    const { saludoPartner } = require('./notifyContacts');
    const { cert, clave, ...resto } = e;
    return {
        ...resto,
        tecnico: cert ? (saludoPartner(cert) || cert.razon_social || null) : null,
        paso: pasoDe(e.subestado, { ackPendiente: !!e.ack?.pendiente, registrado: !!e.subidos?.registro }),
    };
}

/**
 * ¿Este fichero de Drive se puede servir por la página de ESTE encargo? Solo si
 * está entre los que la página enseña (se recarga la lista si caducó).
 * @returns {Promise<{mime, tipo, enlace}|null>}
 */
async function ficheroPermitido({ negocio, id, fase, token, driveId }) {
    if (!RE_DRIVE.test(String(driveId || ''))) return null;
    const n = normNegocio(negocio);
    let f = normFase(fase);
    // La firma se comprueba SIEMPRE, también con la lista en memoria.
    const fila = n === 'cee'
        ? (await supabase.from('cee_directos').select('cert:cee->>certificador_id, alcance').eq('id', id).maybeSingle()).data
        : (await supabase.from('expedientes').select('cert:cee->>certificador_id').eq('id', id).maybeSingle()).data;
    if (!fila?.cert || !firmaValida({ negocio: n, id, fase: f, certId: fila.cert }, token)) return null;
    if (n === 'cee' && String(fila.alcance || '').toUpperCase() !== 'DOBLE') f = 'inicial';
    const clave = `${n}:${id}:${f}`;
    let p = permitidos.get(clave);
    if (!p || Date.now() - p.at > PERMITIDOS_MS) {
        await cargarEncargo({ negocio: n, id, fase: f, token });
        p = permitidos.get(clave);
    }
    return p?.ficheros.get(driveId) || null;
}

module.exports = {
    firmaEncargo, firmaValida, enlaceEncargo, conEnlaceEncargo, TEXTO_ENLACE,
    pasoDe, utmALatLon, comoLlegar, materialDeFase, tipoDe, domicilioAparte, acsEsOtroEquipo, objetivoParaTecnico,
    cargarEncargo, ficheroPermitido,
};
