// ─── certapp/crm.js — los ENCARGOS del CRM (app.brokergy.es) en la app ───────
// Lo pidió Fran (29/10/2026): «que le pueda asignar al certificador un expediente
// y que le aparezca en su panel… que lo pueda aceptar o declinar… todos los datos
// del cliente rellenos… y que lo que haga en la app me aparezca en la de BROKERGY».
//
//   CRM: encargar el CEE (notify-certificador, CAE o CEE directo)
//     └─ si el técnico tiene cuenta en la app (MISMO email que su ficha del CRM)
//          → obra nueva en su panel, con titular, inmueble y fotos del CRM puestos
//          → el enlace del email/WhatsApp lleva a la app (/encargo/:negocio/:id/:fase)
//   APP: Aceptar → el acuse del CRM (cert-ack / cee-ack) · Rechazar → se le retira
//        y el CEE vuelve a «pendiente de encargar», con aviso al equipo
//   APP → CRM: las fotos van DIRECTAS al expediente (12. DOCUMENTOS PARA CEE en el
//        CAE, 4. DOCUMENTACIÓN PARA CEE en el CEE directo), apuntadas en los dos
//        sitios con el MISMO driveId: no hay copia. Al FIRMAR, el PDF firmado y el
//        XML y el .cex de la entrega suben al expediente por la misma puerta que el
//        enlace del técnico (subidaCeePublica) y se pide la revisión; el
//        justificante de registro y la etiqueta, igual (el justificante lo marca
//        REGISTRADO con la fecha leída).
//
// REGLA — la obra lleva `seguimiento.crm = { negocio, id, fase, numero, cert_id,
//   encargo: { estado: PENDIENTE|ACEPTADO|RECHAZADO, at, motivo } }`. Sin columnas
//   nuevas: la obra se busca por esas claves (`seguimiento->crm->>id`).
// REGLA — un encargo de BROKERGY NO gasta los créditos del técnico, y no se borra:
//   se RECHAZA (así el CRM se entera).
// REGLA — lo que vuelve al CRM es best-effort y NUNCA tumba lo que hace el técnico
//   en la app: si falla, queda el evento CRM_FALLO en la obra y el aviso al equipo.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const supabase = require('../supabaseClient');
const climateService = require('../climateService');
const { fallo, errorBd, texto, evento, certappUrl, tokenCorto, nombreCompleto } = require('./comun');
const { limpiarRc } = require('./catastro');

const NEGOCIOS = ['cae', 'cee'];
const normFase = (f) => (String(f || '').toLowerCase() === 'final' ? 'final' : 'inicial');
const normNegocio = (n) => (n === 'cee' ? 'cee' : 'cae');
const esDeCrm = (obra) => !!obra?.seguimiento?.crm?.id;
const crmDe = (obra) => obra?.seguimiento?.crm || null;
const faseLabel = (fase) => (normFase(fase) === 'final' ? 'CEE final' : 'CEE inicial');

/** El enlace estable de la app para un encargo (lo resuelve GET /api/certapp/encargo/…). */
const urlEncargo = ({ negocio, id, fase }) =>
    `${certappUrl()}/encargo/${normNegocio(negocio)}/${encodeURIComponent(id)}/${normFase(fase)}`;

// Las llamadas al propio backend (acuse, revisión): mismas que hace el parte diario.
const API = () => `http://127.0.0.1:${process.env.PORT_EFECTIVO || process.env.PORT || 3000}/api`;
const cabeceraInterna = () => ({ 'x-internal-key': process.env.INTERNAL_API_KEY || '' });

// ── Los apartados de fotos: app ↔ CRM ───────────────────────────────────────
// Lo que no tiene casilla propia en el CRM va a «Otros» con el nombre del
// apartado de la app (VENTANAS POR DENTRO, CUBIERTA O TEJADO…).
const OTROS_CRM = 'OTROS_ANTES';
const APP_A_CAE = {
    FOTO_CALDERA: 'FOTO_CALDERA_ANTES',
    FOTO_PLACA_CALDERA: 'FOTO_PLACA_CALDERA_ANTES',
    FOTO_TERMO: 'FOTO_ACS_ANTES',
    FOTO_PLACA_TERMO: 'FOTO_ACS_ANTES',
    FOTO_FACHADA_PRINCIPAL: 'FOTO_FACHADA_PRINCIPAL',
    FOTO_PATIOS_INTERIORES: 'FOTO_PATIOS_INTERIORES',
    VIDEO_VIVIENDA: 'VIDEO_VIVIENDA',
    DOC_PLANOS: 'DOC_PLANOS',
    DOC_CEE_EXISTENTE: 'DOC_CEE_EXISTENTE',
};
const APP_A_CEE = {
    FOTO_FACHADA_PRINCIPAL: 'FOTO_FACHADA_PRINCIPAL',
    FOTO_PATIOS_INTERIORES: 'FOTO_PATIOS_INTERIORES',
    VIDEO_VIVIENDA: 'VIDEO_VIVIENDA',
    DOC_PLANOS: 'DOC_PLANOS',
    DOC_CEE_EXISTENTE: 'DOC_CEE_EXISTENTE',
};
// Y al revés, para traer a la obra lo que ya hay en el CRM al encargar.
const CRM_A_APP = {
    FOTO_CALDERA_ANTES: 'FOTO_CALDERA',
    FOTO_PLACA_CALDERA_ANTES: 'FOTO_PLACA_CALDERA',
    FOTO_ACS_ANTES: 'FOTO_TERMO',
    FOTO_FACHADA_PRINCIPAL: 'FOTO_FACHADA_PRINCIPAL',
    FOTO_PATIOS_INTERIORES: 'FOTO_PATIOS_INTERIORES',
    VIDEO_VIVIENDA: 'VIDEO_VIVIENDA',
    DOC_PLANOS: 'DOC_PLANOS',
    DOC_CEE_EXISTENTE: 'DOC_CEE_EXISTENTE',
    FOTO_EMISORES_ANTES: 'OTROS',
    OTROS_ANTES: 'OTROS',
};
// Apartados de UN solo archivo en la app (de una lista del CRM se trae el último).
const APP_UNICOS = new Set(['FOTO_CALDERA', 'FOTO_PLACA_CALDERA', 'FOTO_TERMO', 'FOTO_PLACA_TERMO', 'FOTO_AEROTERMIA', 'FOTO_PLACA_AEROTERMIA']);

const slotCrmDe = (negocio, slotApp) => (normNegocio(negocio) === 'cee' ? APP_A_CEE : APP_A_CAE)[slotApp] || OTROS_CRM;

const MIME_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf', xml: 'application/xml',
};
const mimeDeNombre = (n) => MIME_EXT[String(n || '').split('.').pop().toLowerCase()] || null;

// ── La cuenta del técnico ───────────────────────────────────────────────────
/**
 * La cuenta de la app de un certificador del CRM: la del MISMO email que su
 * ficha (`prescriptores.email`). Solo ACTIVA o PENDIENTE (bloqueada, no). null si no tiene.
 */
async function cuentaDe(cert) {
    const email = String(cert?.email || '').trim().toLowerCase();
    if (!email) return null;
    const { data, error } = await supabase.from('certapp_cuentas').select('*')
        .eq('email', email).in('estado', ['ACTIVA', 'PENDIENTE']).limit(1);
    if (error) throw errorBd(error, 'buscar la cuenta del certificador');
    return data?.[0] || null;
}

/** La obra de un encargo en una cuenta (la última, archivada incluida), o null. */
async function obraDelEncargo(cuentaId, { negocio, id, fase }) {
    const { data, error } = await supabase.from('certapp_obras').select('*')
        .eq('cuenta_id', cuentaId)
        .eq('seguimiento->crm->>negocio', normNegocio(negocio))
        .eq('seguimiento->crm->>id', String(id))
        .eq('seguimiento->crm->>fase', normFase(fase))
        .order('created_at', { ascending: false }).limit(1);
    if (error) throw errorBd(error, 'buscar el encargo');
    return data?.[0] || null;
}

// ── Lo que se trae del CRM ──────────────────────────────────────────────────
async function cargarCae(id) {
    const { data: exp, error } = await supabase.from('expedientes')
        .select('id, numero_expediente, estado, cliente_id, oportunidad_id, instalacion, cee, seguimiento')
        .eq('id', id).maybeSingle();
    if (error) throw errorBd(error, 'leer el expediente');
    if (!exp) return null;
    const [{ data: op }, { data: cli }] = await Promise.all([
        exp.oportunidad_id
            ? supabase.from('oportunidades').select('id, id_oportunidad, ref_catastral, referencia_cliente, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
        exp.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    return { exp, op: op || null, cli: cli || null };
}

async function cargarCee(id) {
    return require('../ceeDirectoService').cargar(id);
}

const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());
const provinciaNombre = (p) => (/^\d+$/.test(limpio(p)) ? '' : limpio(p));

function titularDe(cli) {
    if (!cli) return {};
    const { sanearTitular } = require('./obras');
    return sanearTitular({
        nombre: cli.nombre_razon_social, apellidos: cli.apellidos, nif: cli.dni, email: cli.email,
        telefono: cli.tlf || cli.telefono, direccion: cli.direccion, municipio: cli.municipio,
        provincia: provinciaNombre(cli.provincia), codigo_postal: cli.codigo_postal,
    });
}

/** Titular, inmueble y fotos de un expediente CAE (la dirección es la de la INSTALACIÓN). */
function prellenadoCae({ exp, op, cli }) {
    const inst = exp.instalacion || {};
    const inputs = op?.datos_calculo?.inputs || {};
    // Espejo de buildCertClienteData: con «misma dirección» manda la ficha del cliente.
    const md = limpio(inst.misma_direccion).toUpperCase();
    const usaCli = !(inst.misma_direccion === false || md === 'NO' || md === 'FALSE') && limpio(cli?.direccion);
    const dir = usaCli
        ? { direccion: cli.direccion, codigo_postal: cli.codigo_postal, municipio: cli.municipio, provincia: cli.provincia }
        : {
            direccion: inst.direccion || inputs.direccion || inputs.address,
            codigo_postal: inst.codigo_postal || inputs.cp,
            municipio: inst.municipio || inputs.municipio,
            provincia: inst.provincia || inputs.provincia,
        };
    return {
        numero: exp.numero_expediente || null,
        titular: titularDe(cli),
        rc: limpio(op?.ref_catastral) || limpio(inst.ref_catastral) || limpio(inputs.rc) || limpio(inputs.referencia_catastral),
        dir,
        uploads: op?.datos_calculo?.reforma_uploads || {},
    };
}

function prellenadoCee(row) {
    return {
        numero: row.numero_expediente || null,
        titular: titularDe(row.cliente),
        rc: limpio(row.ref_catastral),
        dir: { direccion: row.direccion, codigo_postal: row.codigo_postal, municipio: row.municipio, provincia: row.provincia },
        uploads: row.documentacion?.reforma_uploads || {},
    };
}

// ── Lo que el CRM ya sabe de la instalación → el cuestionario de la app ─────
// Fran (30/10/2026, 26RES060_254): «cuando se ha rellenado la oportunidad ya se
// había dicho cómo era la caldera y el ACS, y la app lo ha vuelto a preguntar».
// Va con origen BROKERGY: el técnico lo ve marcado y lo cambia si en la visita
// es otra cosa. Solo lo que CONSTA; lo que no, se queda sin contestar.
const CAL_DE_FUEL = { gas_natural: 'gas', gas: 'gas', glp: 'glp', propano: 'glp', butano: 'glp', gasoleo: 'gasoleo',
    electricidad: 'electrica', carbon: 'carbon', pellets: 'biomasa', biomasa: 'biomasa', lena: 'biomasa', hueso: 'biomasa', astilla: 'biomasa' };
const CAL_DE_LABEL = { gas: 'gas', gasoil: 'gasoleo', termo: 'electrica', butano: 'glp', propano: 'glp', carbon: 'carbon',
    biomasa: 'biomasa', 'no tiene calefacción': 'no_tiene' };
const CAL_DE_FUNNEL = { gas: 'gas', gasoleo: 'gasoleo', electrica: 'electrica', carbon: 'carbon', biomasa: 'biomasa',
    ninguno: 'no_tiene', sin_calefaccion: 'no_tiene' };
// `no_tengo` es «no tengo / no lo sé»: no se afirma nada.
const ACS_DE_FUNNEL = { misma_caldera: 'misma_caldera', termo: 'termo', butano: 'calentador', gas: 'calentador', solar: 'solar' };
const ACS_DE_INPUTS = { termo: 'termo', butano: 'calentador', gas: 'calentador' };
const CALDERAS = ['gas', 'glp', 'gasoleo', 'biomasa', 'carbon'];
const minus = (v) => limpio(v).toLowerCase();

function emisorApp(tipo) {
    const t = minus(tipo);
    if (t.includes('suelo')) return 'SUELO_RADIANTE';
    if (t.includes('radiador')) return 'RADIADORES';
    if (t.includes('fancoil')) return 'FANCOILS';
    return '';
}

function placasApp(estado) {
    const e = minus(estado);
    return e === 'si' ? 'SI' : (e === 'no' || e === 'futuro' ? 'NO' : '');
}

/**
 * La instalación de un expediente CAE en las claves del cuestionario. Pura.
 * Calefacción: la simulación (`fuelType`, `boilerHeatingType`) y, sin ella, el
 * funnel. ACS: el MISMO criterio que la foto del ACS inicial (`deriveSelectors`):
 * el toggle del expediente solo cuenta en `false`, luego el funnel
 * (`boiler_acs_type`), luego el par de la calculadora (`tipoAcsDesdeInputs`).
 * @param {{ exp, op, emisor?: string, confirmacion?: object, tipoAcsInputs?: string }} d
 */
function instalacionCae({ exp, op, emisor = '', confirmacion = null, tipoAcsInputs = '' }) {
    const inst = exp?.instalacion || {};
    const dc = op?.datos_calculo || {};
    const inputs = dc.inputs || {};
    const funnel = dc.landing_funnel || {};
    const v = {};

    const sinCal = minus(inputs.boilerHeatingType) === 'no tiene calefacción' || CAL_DE_FUNNEL[funnel.combustible_actual] === 'no_tiene';
    const boilerId = minus(inst.caldera_antigua_cal?.rendimiento_id || inputs.boilerId);
    v.calefaccion = sinCal ? 'no_tiene'
        : boilerId === 'electric' ? 'electrica'
        : CAL_DE_FUEL[minus(inputs.fuelType)] || CAL_DE_LABEL[minus(inputs.boilerHeatingType)] || CAL_DE_FUNNEL[funnel.combustible_actual] || '';

    if (CALDERAS.includes(v.calefaccion)) {
        if (['gas', 'glp', 'gasoleo'].includes(v.calefaccion) && (boilerId.includes('cond') || funnel.condensacion === 'si')) v.tipo_caldera = 'CONDENSACION';
        const cal = inst.caldera_antigua_cal || {};
        const mm = [limpio(cal.marca), limpio(cal.modelo)].filter(Boolean).join(' ');
        if (mm) v.marca_modelo_calefaccion = mm.slice(0, 120);
        const kw = Number(inst.potencia_caldera_kw || inst.potencia_caldera);
        if (kw > 0) v.potencia_kw = String(Math.round(kw * 10) / 10);
    }
    if (CALDERAS.includes(v.calefaccion) || v.calefaccion === 'aerotermia') v.emisor = emisorApp(emisor || funnel.emisor_tipo);

    let acs = '';
    if (inst.misma_caldera_acs === false) {
        const idAcs = minus(inst.caldera_antigua_acs?.rendimiento_id);
        acs = idAcs === 'electric' ? 'termo'
            : (ACS_DE_FUNNEL[funnel.boiler_acs_type] !== 'misma_caldera' && ACS_DE_FUNNEL[funnel.boiler_acs_type]) || ACS_DE_INPUTS[tipoAcsInputs] || '';
    } else if (ACS_DE_FUNNEL[funnel.boiler_acs_type]) {
        acs = ACS_DE_FUNNEL[funnel.boiler_acs_type];
    } else if (tipoAcsInputs) {
        acs = ACS_DE_INPUTS[tipoAcsInputs] || '';
    } else if (limpio(inputs.boilerAcsType) && limpio(inputs.boilerHeatingType)) {
        acs = 'misma_caldera';                        // los dos iguales: la misma caldera
    }
    if (acs === 'misma_caldera' && !CALDERAS.includes(v.calefaccion)) acs = '';
    v.acs = acs;

    v.placas_fv = placasApp(inst.fotovoltaica?.estado) || placasApp(funnel.placas_estado);
    if (v.placas_fv === 'SI' && Number(inst.fotovoltaica?.potencia_kwp) > 0) v.kwp = String(inst.fotovoltaica.potencia_kwp);
    if (confirmacion && typeof confirmacion.aire_acondicionado === 'boolean') {
        v.aire_acondicionado = confirmacion.aire_acondicionado;
        if (confirmacion.aire_acondicionado && Number(confirmacion.num_aires) > 0) v.num_aires = String(confirmacion.num_aires);
    }
    return v;
}

/** La instalación de un CEE directo: lo que contestó el cliente en su cuestionario. Pura. */
function instalacionCee(row) {
    const c = row?.documentacion?.cuestionario || {};
    const v = {};
    // «Gas natural o butano» del cliente → gas natural, lo normal; la placa lo corrige.
    const cal = { gas: 'gas', gasoleo: 'gasoleo', electrica: 'electrica', aerotermia: 'aerotermia', biomasa: 'biomasa',
        carbon: 'carbon', no_tiene: 'no_tiene' }[c.calefaccion];
    if (cal) v.calefaccion = cal;
    const acs = { misma_caldera: 'misma_caldera', termo: 'termo', butano: 'calentador', aerotermia: 'aerotermia', solar: 'solar' }[c.acs];
    if (acs && !(acs === 'misma_caldera' && !CALDERAS.includes(v.calefaccion))) v.acs = acs;
    if (v.acs === 'misma_caldera' && typeof c.termo_extra === 'boolean') v.termo_extra = c.termo_extra;
    if (typeof c.aire_acondicionado === 'boolean') {
        v.aire_acondicionado = c.aire_acondicionado;
        if (c.aire_acondicionado && Number(c.num_aires) > 0) v.num_aires = String(c.num_aires);
    }
    const fv = placasApp(c.placas);
    if (fv) v.placas_fv = fv;
    return v;
}

/**
 * Mete en el cuestionario lo que sabe el CRM, con origen BROKERGY, SIN pisar lo
 * que contestó el técnico (valor sin origen) ni lo visto en una foto o leído en
 * una placa (origen fiable). Pura: devuelve el cuestionario nuevo y qué cambió.
 */
function conInstalacionDelCrm(cuestionario = {}, valores = {}) {
    const c = { ...cuestionario, origen: { ...(cuestionario.origen || {}) } };
    const cambiadas = [];
    const vacio = (x) => x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length);
    for (const [k, val] of Object.entries(valores)) {
        if (vacio(val)) continue;
        const o = c.origen[k];
        const suyo = !vacio(c[k]) && !o;                              // lo contestó él
        const mejor = !vacio(c[k]) && o && o !== 'BROKERGY' && ['FOTO', 'PLACA', 'CATASTRO'].includes(o);
        if (suyo || mejor) continue;
        if (c[k] === val && o === 'BROKERGY') continue;
        c[k] = val;
        c.origen[k] = 'BROKERGY';
        cambiadas.push(k);
    }
    return { cuestionario: c, cambiadas };
}

/** Lo que sabe el CRM de la instalación de ESE expediente, en claves de la app. */
async function instalacionDelCrm(negocio, datos) {
    if (normNegocio(negocio) === 'cee') return instalacionCee(datos);
    const { pathToFileURL } = require('url');
    const path = require('path');
    const logic = (f) => import(pathToFileURL(path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'features', 'expedientes', 'logic', f)).href);
    let emisor = '', confirmacion = null;
    try { emisor = (await logic('emisores.js')).emisorInicial(datos.exp) || ''; } catch (e) { console.warn('[certapp crm] emisor inicial:', e.message); }
    try {
        const inst = datos.exp?.instalacion || {};
        const dc = datos.op?.datos_calculo || {};
        confirmacion = (await logic('confirmacionCliente.js'))
            .conAiresDeOportunidad(inst.confirmacion_cliente || dc.confirmacion_cliente || null, inst.aires || dc.inputs?.aires);
    } catch (e) { console.warn('[certapp crm] confirmación del cliente:', e.message); }
    const tipoAcsInputs = require('../reformaUploadService').tipoAcsDesdeInputs(datos.op?.datos_calculo?.inputs || {});
    return instalacionCae({ ...datos, emisor, confirmacion, tipoAcsInputs });
}

/** Las fotos del CRM como entradas de la obra (mismo driveId: no se copia nada). */
function fotosDelCrm(uploads) {
    const out = {};
    for (const [slotCrm, slotApp] of Object.entries(CRM_A_APP)) {
        const lista = (Array.isArray(uploads?.[slotCrm]) ? uploads[slotCrm] : []).filter(e => e?.driveId && e.estado !== 'rechazada');
        if (!lista.length) continue;
        const entradas = lista.map(e => {
            const nombre = e.name || e.nombre || null;
            const mime = e.mimeType || e.mime || mimeDeNombre(nombre);
            return {
                driveId: e.driveId, nombre, mime, link: e.link || null, subido_at: e.at || e.subido_at || null, por: 'BROKERGY',
                name: nombre, at: e.at || null, subido_por: 'BROKERGY', mimeType: mime, estado: 'subida', crm_slot: slotCrm,
            };
        });
        out[slotApp] = APP_UNICOS.has(slotApp) ? entradas.slice(-1) : [...(out[slotApp] || []), ...entradas];
    }
    return out;
}

// ── Encargar: crear (o reabrir) la obra en el panel del técnico ─────────────
/**
 * El encargo del CRM llega a la app. Si el técnico no tiene cuenta, null (el
 * CRM sigue como siempre). Idempotente: un segundo encargo de lo mismo reabre o
 * refresca la misma obra.
 * @returns {Promise<null|{ obra: object, nueva: boolean, url: string }>}
 */
async function encargar({ negocio, id, fase, cert, cuenta = undefined }) {
    negocio = normNegocio(negocio);
    fase = normFase(fase);
    const c = cuenta === undefined ? await cuentaDe(cert) : cuenta;
    if (!c) return null;

    const datos = negocio === 'cee' ? await cargarCee(id) : await cargarCae(id);
    if (!datos) throw fallo(404, 'Expediente no encontrado', 'EXPEDIENTE_NO_ENCONTRADO');
    const pre = negocio === 'cee' ? prellenadoCee(datos) : prellenadoCae(datos);
    const ahora = new Date().toISOString();
    const crm = {
        negocio, id: String(id), fase, numero: pre.numero, cert_id: cert?.id_empresa ? String(cert.id_empresa) : null,
        encargado_at: ahora, encargo: { estado: 'PENDIENTE', at: ahora },
    };
    const url = urlEncargo({ negocio, id, fase });

    const previa = await obraDelEncargo(c.id, { negocio, id, fase });
    if (previa) {
        // Reencargo: si lo había rechazado, vuelve a su panel como encargo nuevo;
        // si estaba en marcha, se queda como está (no se le vuelve a preguntar).
        const prevCrm = crmDe(previa) || {};
        const rechazada = previa.estado === 'ARCHIVADA' || prevCrm.encargo?.estado === 'RECHAZADO';
        const patch = { seguimiento: { ...(previa.seguimiento || {}), crm: { ...prevCrm, ...crm,
            encargo: rechazada ? crm.encargo : (prevCrm.encargo || crm.encargo) } } };
        if (rechazada) patch.estado = previa.credito_consumido || previa.pedido_at ? 'EN_PREPARACION' : 'BORRADOR';
        // Lo que sepa ya el CRM de la instalación, sin pisar lo que contestó él.
        const instalacion = await instalacionDelCrm(negocio, datos).catch((e) => {
            console.warn('[certapp crm] instalación del CRM:', e.message);
            return {};
        });
        const conCrm = conInstalacionDelCrm(previa.cuestionario || {}, instalacion);
        if (conCrm.cambiadas.length) {
            const { cuestionario: logica } = require('./logica');
            patch.cuestionario = (await logica()).sanearCuestionario(conCrm.cuestionario);
        }
        const { data, error } = await supabase.from('certapp_obras').update(patch).eq('id', previa.id).select('*').single();
        if (error) throw errorBd(error, 'reabrir el encargo');
        await anadirFotosNuevas(data, pre.uploads);
        await evento(previa.id, c.id, 'ENCARGO', `BROKERGY te ${rechazada ? 'vuelve a encargar' : 'recuerda'} el ${faseLabel(fase)} del expediente ${pre.numero || id}`, 'BROKERGY');
        return { obra: data, nueva: false, url };
    }

    // Obra nueva, con lo que ya sabe el CRM.
    const { siguienteCorrelativo, nombreDeTitular } = require('./obras');
    const { cuestionario: logica } = require('./logica');
    const { sanearCuestionario } = await logica();
    const rc = limpiarRc(pre.rc || '') || null;
    const muni = texto(pre.dir.municipio, 80);
    const prov = texto(provinciaNombre(pre.dir.provincia), 60);
    const clima = muni ? climateService.getClimateByNames(prov, muni) : null;
    // La calefacción, el agua caliente, los aires y las placas que ya constan.
    const instalacion = await instalacionDelCrm(negocio, datos).catch((e) => {
        console.warn('[certapp crm] instalación del CRM:', e.message);
        return {};
    });
    const fila = {
        cuenta_id: c.id,
        nombre: nombreDeTitular(pre.titular) || rc || pre.numero || null,
        ref_catastral: rc && [14, 18, 20].includes(rc.length) ? rc : null,
        titular: pre.titular,
        direccion: texto(pre.dir.direccion, 200),
        municipio: muni,
        provincia: prov,
        codigo_postal: texto(pre.dir.codigo_postal, 10),
        zona_climatica: clima?.climateZone ?? null,
        altitud: clima?.altitude ?? null,
        proposito: 'AYUDAS',
        cuestionario: sanearCuestionario(conInstalacionDelCrm({ propositos: ['AYUDAS'] }, instalacion).cuestionario),
        seguimiento: { crm },
        documentacion: { reforma_uploads: fotosDelCrm(pre.uploads) },
        estado: 'BORRADOR',
        portal_token: tokenCorto(),
        portal_token_at: ahora,
    };
    let obra = null;
    for (let intento = 0; ; intento++) {
        const correlativo = await siguienteCorrelativo();
        const { data, error } = await supabase.from('certapp_obras').insert({ ...fila, correlativo }).select('*').single();
        if (!error) { obra = data; break; }
        if (error.code !== '23505' || intento >= 4) throw errorBd(error, 'crear la obra del encargo');
    }
    await evento(obra.id, c.id, 'ENCARGO', `Encargo de BROKERGY: ${faseLabel(fase)} del expediente ${pre.numero || id}`, 'BROKERGY',
        { negocio, id: String(id), fase });
    // El Catastro completa superficie, año y coordenadas, de fondo: el encargo no
    // espera a un servicio lento ni se cae si no responde.
    if (obra.ref_catastral) setImmediate(() => completarCatastro(obra).catch(() => {}));
    return { obra, nueva: true, url };
}

async function completarCatastro(obra) {
    const { datosDelCatastro } = require('./catastro');
    const obras = require('./obras');
    try {
        const patch = await datosDelCatastro(obra.ref_catastral);
        await obras.aplicarCatastro(obra, patch);
    } catch (e) {
        console.warn(`[certapp crm] Catastro de ${obra.numero_expediente}: ${e.message}`);
    }
}

/** Reencargo: lo que el CRM tiene ahora y la obra no, se añade (por driveId). */
async function anadirFotosNuevas(obra, uploads) {
    const ya = new Set();
    for (const lista of Object.values(obra.documentacion?.reforma_uploads || {})) {
        for (const e of (Array.isArray(lista) ? lista : [])) if (e?.driveId) ya.add(e.driveId);
    }
    for (const [slotApp, entradas] of Object.entries(fotosDelCrm(uploads))) {
        for (const e of entradas) {
            if (ya.has(e.driveId)) continue;
            const { error } = await supabase.rpc('certapp_docs_append', { p_id: obra.id, p_slot: slotApp, p_entry: e, p_multiple: !APP_UNICOS.has(slotApp) });
            if (error) console.warn('[certapp crm] foto del CRM sin apuntar:', error.message);
        }
    }
}

// ── Lo que ve el técnico del encargo ────────────────────────────────────────
/**
 * El resumen del encargo para la ficha de la obra, con el estado VIVO del CRM
 * (revisión, visto bueno, registro). null si la obra no es de un encargo.
 */
async function resumen(obra) {
    const crm = crmDe(obra);
    if (!crm) return null;
    const out = {
        negocio: crm.negocio, numero: crm.numero || null, fase: crm.fase, fase_label: faseLabel(crm.fase),
        encargo: { estado: crm.encargo?.estado || 'PENDIENTE', at: crm.encargo?.at || null, motivo: crm.encargo?.motivo || null },
        enviado_at: crm.cee_enviado_at || null, revision: null,
    };
    try {
        const key = crm.fase === 'final' ? 'cee_final' : 'cee_inicial';
        let seg = null;
        if (crm.negocio === 'cee') {
            const { data } = await supabase.from('cee_directos').select('seguimiento').eq('id', crm.id).maybeSingle();
            seg = data?.seguimiento || null;
        } else {
            const { data } = await supabase.from('expedientes').select('seguimiento').eq('id', crm.id).maybeSingle();
            seg = data?.seguimiento || null;
        }
        const sub = String(seg?.[key] || '').toUpperCase();
        out.revision = sub === 'REGISTRADO' ? 'REGISTRADO'
            : sub === 'REVISADO' ? 'VISTO_BUENO'
                : ['PTE_REVISION', 'PRESENTADO'].includes(sub) ? 'EN_REVISION' : null;
    } catch (e) { /* sin el estado del CRM se enseña lo de la obra */ }
    return out;
}

// ── Aceptar y rechazar ──────────────────────────────────────────────────────
async function guardarEncargo(obra, encargo, extra = {}) {
    const crm = { ...crmDe(obra), encargo };
    const { data, error } = await supabase.from('certapp_obras')
        .update({ seguimiento: { ...(obra.seguimiento || {}), crm }, ...extra }).eq('id', obra.id).select('*').single();
    if (error) throw errorBd(error, 'guardar la respuesta al encargo');
    return data;
}

/** ¿Sigue siendo SUYO en el CRM? (se le pudo reasignar a otro entre medias) */
function sigueSiendoSuyo(crm, cee) {
    return !crm.cert_id || String(cee?.certificador_id || '') === String(crm.cert_id);
}

async function aceptar(obra, cuenta) {
    const crm = crmDe(obra);
    if (!crm) throw fallo(400, 'Esta obra no es un encargo de BROKERGY.', 'NO_ES_ENCARGO');
    if (crm.encargo?.estado === 'ACEPTADO') return { ok: true, ya: true, obra };
    if (crm.encargo?.estado === 'RECHAZADO' || obra.estado === 'ARCHIVADA') {
        throw fallo(409, 'Este encargo ya lo rechazaste. Si quieres cogerlo, escríbenos.', 'ENCARGO_RECHAZADO');
    }

    if (crm.negocio === 'cee') {
        const row = await cargarCee(crm.id);
        if (!row) throw fallo(404, 'El expediente ya no existe en BROKERGY.', 'EXPEDIENTE_NO_ENCONTRADO');
        if (!sigueSiendoSuyo(crm, row.cee)) await retirada(obra);
        if (row.cee?.ack_token) {
            await axios.post(`${API()}/public/cee-ack/${crm.id}`, { token: row.cee.ack_token, respuesta: 'acepta' }, { timeout: 30000 })
                .catch(e => { throw fallo(502, 'No he podido avisar a BROKERGY. Vuelve a intentarlo en un momento.', 'CRM_FALLO', { detalle: e.response?.data?.error || e.message }); });
        }
    } else {
        const { data: exp, error } = await supabase.from('expedientes').select('id, cee').eq('id', crm.id).maybeSingle();
        if (error) throw errorBd(error, 'leer el expediente');
        if (!exp) throw fallo(404, 'El expediente ya no existe en BROKERGY.', 'EXPEDIENTE_NO_ENCONTRADO');
        if (!sigueSiendoSuyo(crm, exp.cee)) await retirada(obra);
        // El acuse de siempre (cert-ack): pasa la fase a EN TRABAJO, lo apunta en
        // el historial y avisa al equipo. Sin token (ya se contestó por el enlace
        // del email), no hay nada que acusar: se da por aceptado.
        if (exp.cee?.ack_token) {
            await axios.post(`${API()}/expedientes/${crm.id}/cert-ack`, { token: exp.cee.ack_token }, { timeout: 30000 })
                .catch(e => { throw fallo(502, 'No he podido avisar a BROKERGY. Vuelve a intentarlo en un momento.', 'CRM_FALLO', { detalle: e.response?.data?.error || e.message }); });
        }
    }
    const nueva = await guardarEncargo(obra, { estado: 'ACEPTADO', at: new Date().toISOString() });
    await evento(obra.id, obra.cuenta_id, 'ENCARGO_ACEPTADO', `Has aceptado el encargo (${crm.numero || ''})`.replace(' ()', ''), 'certificador');
    console.log(`[certapp crm] ${nombreCompleto(cuenta) || cuenta.email} acepta ${crm.numero} (${crm.fase})`);
    return { ok: true, obra: nueva };
}

/** Se le reasignó a otro en el CRM: la obra se archiva y se le dice. */
async function retirada(obra) {
    await guardarEncargo(obra, { ...(crmDe(obra).encargo || {}), estado: 'RETIRADO', at: new Date().toISOString() }, { estado: 'ARCHIVADA' });
    await evento(obra.id, obra.cuenta_id, 'ENCARGO_RETIRADO', 'BROKERGY ha pasado este encargo a otro técnico', 'BROKERGY');
    throw fallo(409, 'Este encargo ya no es tuyo: BROKERGY se lo ha pasado a otro técnico.', 'ENCARGO_RETIRADO');
}

async function anotarCae(id, entrada) {
    const { data } = await supabase.from('expedientes').select('documentacion').eq('id', id).maybeSingle();
    const doc = data?.documentacion || {};
    const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
    historial.push(entrada);
    const { error } = await supabase.from('expedientes')
        .update({ documentacion: { ...doc, historial }, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) console.warn(`[certapp crm] historial de ${id}: ${error.message}`);
}

/**
 * NO PUEDE: se le retira del expediente y la fase vuelve a «pendiente de
 * encargar» (como el «No puedo» del CEE directo), con aviso al equipo.
 */
async function rechazar(obra, cuenta, motivoRaw) {
    const crm = crmDe(obra);
    if (!crm) throw fallo(400, 'Esta obra no es un encargo de BROKERGY.', 'NO_ES_ENCARGO');
    if (crm.encargo?.estado === 'RECHAZADO') return { ok: true, ya: true, obra };
    if (crm.encargo?.estado === 'ACEPTADO') {
        throw fallo(409, 'Ya lo aceptaste. Si al final no puedes hacerlo, escríbenos y lo pasamos a otro técnico.', 'ENCARGO_ACEPTADO');
    }
    const motivo = texto(motivoRaw, 500);
    const quien = nombreCompleto(cuenta) || cuenta.email;
    const key = crm.fase === 'final' ? 'cee_final' : 'cee_inicial';

    if (crm.negocio === 'cee') {
        const row = await cargarCee(crm.id);
        if (row && sigueSiendoSuyo(crm, row.cee)) {
            if (row.cee?.ack_token) {
                await axios.post(`${API()}/public/cee-ack/${crm.id}`, { token: row.cee.ack_token, respuesta: 'rechaza', motivo }, { timeout: 30000 })
                    .catch(e => { throw fallo(502, 'No he podido avisar a BROKERGY. Vuelve a intentarlo en un momento.', 'CRM_FALLO', { detalle: e.response?.data?.error || e.message }); });
            } else {
                const svc = require('../ceeDirectoService');
                const cee = { ...(row.cee || {}), certificador_id: null, ack_token: null, ack_respuesta: 'rechaza', ack_respuesta_at: new Date().toISOString(),
                    rechazos: [...(Array.isArray(row.cee?.rechazos) ? row.cee.rechazos : []),
                        { certificador_id: crm.cert_id, nombre: quien, motivo, fecha: new Date().toISOString(), fase: crm.fase }] };
                await svc.guardar(row.id, { cee, seguimiento: { ...(row.seguimiento || {}), [key]: 'PTE_ENVIO_CERT', [`${key}_last_contacto_at`]: null } },
                    { seguimientoPrev: row.seguimiento });
                await svc.anotarHistorial(row.id, { tipo: 'CERTIFICADOR', texto: `${quien.toUpperCase()} HA RECHAZADO EL ENCARGO DESDE LA APP${motivo ? ` — ${motivo.toUpperCase()}` : ''}`, usuario: quien });
            }
        }
    } else {
        const { data: exp, error } = await supabase.from('expedientes').select('id, numero_expediente, estado, cee, seguimiento').eq('id', crm.id).maybeSingle();
        if (error) throw errorBd(error, 'leer el expediente');
        if (exp && sigueSiendoSuyo(crm, exp.cee)) {
            const ahora = new Date().toISOString();
            const cee = { ...(exp.cee || {}), certificador_id: null, ack_token: null,
                rechazos: [...(Array.isArray(exp.cee?.rechazos) ? exp.cee.rechazos : []),
                    { certificador_id: crm.cert_id, nombre: quien, motivo, fecha: ahora, fase: crm.fase, via: 'app' }] };
            const seguimiento = { ...(exp.seguimiento || {}) };
            const { rankSubestado } = require('../../utils/ceeDirectoEstados');
            // Solo si aún no había nada entregado: lo entregado existe, lo haya hecho quien lo haya hecho.
            if (rankSubestado(seguimiento[key]) < rankSubestado('PRESENTADO')) {
                seguimiento[key] = 'PTE_ENVIO_CERT';
                seguimiento[`${key}_last_contacto_at`] = null;
            }
            // El estado «EN CERTIFICADOR» vuelve a «PTE.»: la pelota ya no la tiene el técnico.
            const vuelta = { 'EN CERTIFICADOR CEE INICIAL': 'PTE. CEE INICIAL', 'EN CERTIFICADOR CEE FINAL': 'PTE. CEE FINAL' }[exp.estado];
            const { error: errUpd } = await supabase.from('expedientes')
                .update({ cee, seguimiento, ...(vuelta ? { estado: vuelta } : {}), updated_at: ahora }).eq('id', exp.id);
            if (errUpd) throw errorBd(errUpd, 'retirar al técnico del expediente');
            await anotarCae(exp.id, {
                id: `${Date.now()}_certapp_rechazo`, tipo: 'certificador_rechaza',
                texto: `El certificador ${quien} ha RECHAZADO desde la app el encargo del ${faseLabel(crm.fase)}${motivo ? `: «${motivo}»` : ''}. Se le retira y el CEE vuelve a pendiente de encargar.`,
                fecha: ahora, usuario: quien,
            });
        }
        // Aviso al equipo (el del CEE directo lo manda su propia ruta de acuse).
        const avisos = require('./avisos');
        await avisos.avisarEquipo({
            asunto: `${crm.numero || crm.id} — ${quien} NO puede hacer el ${faseLabel(crm.fase)}`,
            cuerpo: `⚠️ ${quien} ha rechazado desde la app el encargo del ${faseLabel(crm.fase)} de ${crm.numero || crm.id}${motivo ? `.\nMotivo: ${motivo}` : '.'}\n`
                + `Se le ha retirado y vuelve a «pendiente de encargar».\n${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${crm.id}`,
        });
    }

    const nueva = await guardarEncargo(obra, { estado: 'RECHAZADO', at: new Date().toISOString(), motivo }, { estado: 'ARCHIVADA' });
    await evento(obra.id, obra.cuenta_id, 'ENCARGO_RECHAZADO', `Has rechazado el encargo${motivo ? `: ${motivo}` : ''}`, 'certificador');
    return { ok: true, obra: nueva };
}

// ── Fotos: directas al expediente ───────────────────────────────────────────
/**
 * Sube una tanda de la app al expediente del CRM y devuelve las entradas para
 * la obra, con la forma de `docs.subir` (`[{ ok, entry } | { ok: false, nombre, error }]`).
 * @param {object} slot  el apartado de la app (SLOTS)
 * @param {{ f: object, tipo: { ext, mime } }[]} validos lo que ya ha pasado `revisarFichero`
 */
async function subirFotos(obra, slot, validos, { por = 'certificador' } = {}) {
    const crm = crmDe(obra);
    const slotCrm = slotCrmDe(crm.negocio, slot.id);
    const named = slotCrm === OTROS_CRM;
    const archivos = validos.map(({ f, tipo }) => ({
        originalname: `${slot.id}.${tipo.ext}`, mimetype: tipo.mime, buffer: f.buffer, size: f.size,
    }));
    const label = named ? slot.label.toUpperCase() : null;
    let r;
    if (crm.negocio === 'cee') {
        const row = await cargarCee(crm.id);
        if (!row) throw fallo(404, 'El expediente ya no existe en BROKERGY.', 'EXPEDIENTE_NO_ENCONTRADO');
        r = await require('../ceeDirectoDocsService').subir(row, slotCrm, archivos, { label, subidoPor: 'certificador' });
    } else {
        const { data: exp } = await supabase.from('expedientes').select('oportunidad_id').eq('id', crm.id).maybeSingle();
        if (!exp?.oportunidad_id) throw fallo(409, 'Este expediente no tiene oportunidad en BROKERGY: escríbenos.', 'SIN_OPORTUNIDAD');
        const { data: op } = await supabase.from('oportunidades').select('id, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle();
        r = await require('../reformaUploadService').subirFicherosASlot({
            oportunidadUuid: op.id, datosCalculo: op.datos_calculo || {},
            slotDef: { key: slotCrm, multiple: true, named }, archivos, label, subidoPor: 'certificador',
        });
    }
    const at = new Date().toISOString();
    const subidos = (r.subidas || []).map((s, i) => {
        const mime = validos[i]?.tipo?.mime || mimeDeNombre(s.name);
        return { ok: true, entry: {
            driveId: s.driveId, nombre: s.name, mime, link: s.link || null, size: validos[i]?.f?.size || null, subido_at: at, por,
            name: s.name, at, subido_por: por, mimeType: mime, estado: 'subida', crm_slot: slotCrm,
        } };
    });
    const fallidas = (r.fallidas || []).map(x => ({ ok: false, nombre: x.originalname, error: x.error }));
    return [...subidos, ...fallidas];
}

/**
 * Quitar de la app un fichero de un encargo. Lo que subió el técnico desde la
 * app se quita también del expediente y va a la papelera; lo que vino del CRM
 * solo se desengancha de la obra (es de BROKERGY: no se borra desde aquí).
 * @returns {Promise<boolean>} si hay que mandarlo a la papelera
 */
async function quitarFoto(obra, entrada) {
    const crm = crmDe(obra);
    if (!entrada?.crm_slot || (entrada.por || entrada.subido_por) === 'BROKERGY') return false;
    try {
        if (crm.negocio === 'cee') {
            const row = await cargarCee(crm.id);
            const lista = Array.isArray(row?.documentacion?.reforma_uploads?.[entrada.crm_slot]) ? row.documentacion.reforma_uploads[entrada.crm_slot] : [];
            await supabase.rpc('cee_directo_docs_replace_slot', { p_id: crm.id, p_slot: entrada.crm_slot, p_array: lista.filter(e => e?.driveId !== entrada.driveId) });
        } else {
            const { data: exp } = await supabase.from('expedientes').select('oportunidad_id').eq('id', crm.id).maybeSingle();
            if (!exp?.oportunidad_id) return true;
            const { data: op } = await supabase.from('oportunidades')
                .select(`lista:datos_calculo->reforma_uploads->${entrada.crm_slot}`).eq('id', exp.oportunidad_id).maybeSingle();
            const lista = Array.isArray(op?.lista) ? op.lista : [];
            await supabase.rpc('reforma_replace_slot', { p_id: exp.oportunidad_id, p_slot: entrada.crm_slot, p_array: lista.filter(e => e?.driveId !== entrada.driveId) });
        }
    } catch (e) {
        console.warn(`[certapp crm] quitar ${entrada.driveId} del CRM: ${e.message}`);
    }
    return true;
}

// ── El CEE, de vuelta al expediente ─────────────────────────────────────────
const QUIEN = (cuenta) => ({ texto: `el certificador (${nombreCompleto(cuenta) || cuenta?.email || 'app'}, desde la app)`, usuario: 'CERTIFICADOR' });

async function leerDrive(driveId) {
    const drive = require('./drive');
    const f = await drive.abrirFichero(driveId);
    if (!f) return null;
    const trozos = [];
    for await (const t of f.stream) trozos.push(t);
    return Buffer.concat(trozos);
}

async function alCrm(crm, cuenta, slot, buffer, mimetype) {
    const { subirCae, subirCeeDirecto } = require('../cee/subidaCeePublica');
    return crm.negocio === 'cee'
        ? subirCeeDirecto({ id: crm.id, fase: crm.fase, slot, buffer, mimetype, quien: QUIEN(cuenta) })
        : subirCae({ expedienteId: crm.id, fase: crm.fase, slot, buffer, mimetype, quien: QUIEN(cuenta) });
}

/** PTE_REVISION en el CRM, con su aviso al equipo (la misma ruta que usa el técnico). */
async function pedirRevision(crm, cuenta, obra) {
    const quien = nombreCompleto(cuenta) || cuenta?.email || 'El técnico';
    const nota = `Subido desde la app de certificadores (${obra.numero_expediente}).`;
    if (crm.negocio === 'cee') {
        const svc = require('../ceeDirectoService');
        const row = await svc.cargar(crm.id);
        if (!row) return;
        const key = crm.fase === 'final' ? 'cee_final' : 'cee_inicial';
        if (['REVISADO', 'REGISTRADO'].includes(String(row.seguimiento?.[key] || '').toUpperCase())) return;
        await svc.guardar(row.id, { seguimiento: { ...(row.seguimiento || {}), [key]: 'PTE_REVISION' } }, { seguimientoPrev: row.seguimiento });
        await svc.anotarHistorial(row.id, { tipo: 'CERTIFICADOR', texto: `${faseLabel(crm.fase).toUpperCase()} ENTREGADO POR ${quien.toUpperCase()} DESDE LA APP — PENDIENTE DE REVISIÓN`, usuario: quien });
        await require('./avisos').avisarEquipo({
            asunto: `${row.numero_expediente} — ${faseLabel(crm.fase)} pendiente de revisar`,
            cuerpo: `📋 ${quien} ha entregado desde la app el ${faseLabel(crm.fase)} de ${row.numero_expediente}.\n${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?cee=${row.id}`,
        });
        return;
    }
    await axios.post(`${API()}/expedientes/${crm.id}/notify-review`,
        { phase: crm.fase, techMessage: nota, quien }, { headers: cabeceraInterna(), timeout: 60000 });
}

/**
 * Al FIRMAR en la app: el PDF firmado y el XML y el .cex de la entrega suben al
 * expediente y se pide la revisión. De fondo: el técnico no espera a esto.
 */
function enviarCeeAsync(obra, cuenta, { firmado }) {
    const crm = crmDe(obra);
    if (!crm) return;
    setImmediate(async () => {
        const hechos = [];
        try {
            const drive = require('./drive');
            const { elegirFicheros } = require('./entrega');
            const carpeta = await drive.carpetaCeeSiExiste(obra);
            const lista = carpeta ? await drive.listar(carpeta) : [];
            const el = elegirFicheros(lista, obra.numero_expediente);
            await alCrm(crm, cuenta, 'pdf', firmado, 'application/pdf');
            hechos.push('PDF firmado');
            for (const [slot, f, mime] of [['xml', el.xml, 'application/xml'], ['cex', el.cex, 'application/octet-stream']]) {
                if (!f) continue;
                const bytes = await leerDrive(f.id);
                if (bytes?.length) { await alCrm(crm, cuenta, slot, bytes, mime); hechos.push(slot === 'xml' ? 'XML' : '.cex'); }
            }
            await pedirRevision(crm, cuenta, obra);
            const ahora = new Date().toISOString();
            const fresca = await require('./obras').cargar(obra.id);
            if (fresca) {
                await supabase.from('certapp_obras').update({ seguimiento: { ...(fresca.seguimiento || {}), crm: { ...crmDe(fresca), cee_enviado_at: ahora } } }).eq('id', obra.id);
            }
            await evento(obra.id, obra.cuenta_id, 'CRM_ENVIADO', `Enviado a BROKERGY para su visto bueno (${hechos.join(', ')})`, 'BROKERGY');
        } catch (e) {
            console.error(`[certapp crm] ${obra.numero_expediente} → ${crm.numero}: ${e.message}`);
            await evento(obra.id, obra.cuenta_id, 'CRM_FALLO', `No se ha podido enviar a BROKERGY${hechos.length ? ` (sí: ${hechos.join(', ')})` : ''}`, 'BROKERGY',
                null, { notaInterna: texto(e?.response?.data?.error || e.message, 500) });
            await require('./avisos').avisarEquipo({
                asunto: `${crm.numero} — el CEE firmado en la app no ha llegado entero`,
                cuerpo: `❗ ${obra.numero_expediente} (${crm.numero}): ${e.message}${hechos.length ? `\nSí llegó: ${hechos.join(', ')}` : ''}`,
            }).catch(() => {});
        }
    });
}

/** Lo definitivo que sube el técnico (XML o PDF sin firmar) → su casilla del expediente. */
function enviarDefinitivoAsync(obra, cuenta, { tipo, buffer }) {
    const crm = crmDe(obra);
    if (!crm || !['xml'].includes(tipo)) return;
    setImmediate(() => alCrm(crm, cuenta, 'xml', buffer, 'application/xml')
        .then(() => evento(obra.id, obra.cuenta_id, 'CRM_ENVIADO', 'XML definitivo enviado a BROKERGY', 'BROKERGY'))
        .catch(e => console.error(`[certapp crm] XML de ${obra.numero_expediente}: ${e.message}`)));
}

/** El justificante de registro y la etiqueta → el expediente (el justificante lo marca REGISTRADO). */
function enviarRegistroAsync(obra, cuenta, { clase, buffer, mime }) {
    const crm = crmDe(obra);
    if (!crm || !['justificante', 'etiqueta'].includes(clase)) return;
    const slot = clase === 'justificante' ? 'registro' : 'etiqueta';
    setImmediate(() => alCrm(crm, cuenta, slot, buffer, mime)
        .then(r => evento(obra.id, obra.cuenta_id, 'CRM_ENVIADO',
            clase === 'justificante' ? `Justificante enviado a BROKERGY${r?.registrado ? ' (registrado)' : ''}` : 'Etiqueta enviada a BROKERGY', 'BROKERGY'))
        .catch(async (e) => {
            console.error(`[certapp crm] ${clase} de ${obra.numero_expediente}: ${e.message}`);
            await evento(obra.id, obra.cuenta_id, 'CRM_FALLO', `No se ha podido enviar a BROKERGY: ${clase}`, 'BROKERGY', null, { notaInterna: texto(e.message, 500) });
        }));
}

// ── El texto que sale al técnico ────────────────────────────────────────────
const TEXTO_ENLACE_APP = '📲 Ábrelo en tu app de certificadores (acéptalo o recházalo ahí):';

/**
 * El mensaje del encargo con el enlace de la APP en lugar de la página del
 * encargo del CRM: un técnico con cuenta lo hace todo desde la app.
 */
function conEnlaceApp(textoMsg, url) {
    if (!url || !textoMsg || textoMsg.includes(url)) return textoMsg;
    const bloque = `${TEXTO_ENLACE_APP}\n${url}`;
    const pagina = /📋 Todo el encargo en una página[^\n]*\n\S+/;
    if (pagina.test(textoMsg)) return textoMsg.replace(pagina, () => bloque);
    const urlPagina = /https?:\/\/\S+\/encargo\/\S+/;
    if (urlPagina.test(textoMsg)) return textoMsg.replace(urlPagina, () => url);
    const firma = '\n\n*BROKERGY · Ingeniería Energética*';
    const i = textoMsg.lastIndexOf(firma);
    return i >= 0 ? `${textoMsg.slice(0, i)}\n\n${bloque}${textoMsg.slice(i)}` : `${textoMsg}\n\n${bloque}`;
}

/**
 * El texto del popup con UN enlace al encargo, el que de verdad vale: el de la
 * app si la obra está allí, o la página del encargo si no (el popup pudo
 * enseñar el de la app y la obra no llegar a crearse). Para el WhatsApp, el
 * EMAIL y el historial: antes solo el WhatsApp lo cambiaba y el email salía
 * con la página del CRM en el texto y la app en el botón.
 */
function textoParaTecnico(textoMsg, { urlApp = null, urlPagina = null } = {}) {
    if (!textoMsg) return textoMsg;
    if (urlApp) return conEnlaceApp(textoMsg, urlApp);
    const app = /📲 Ábrelo en tu app de certificadores[^\n]*\n\S+/;
    if (!app.test(textoMsg)) return textoMsg;
    if (!urlPagina) return textoMsg.replace(new RegExp(`\\n*${app.source}`), '');
    const { TEXTO_ENLACE } = require('../encargoTecnico');
    return textoMsg.replace(app, () => `${TEXTO_ENLACE}\n${urlPagina}`);
}

/**
 * El enlace de la app que llevará el mensaje al técnico, para que el popup lo
 * ENSEÑE antes de enviarlo (lo que se ve es lo que sale). Mismo criterio que
 * `notify-certificador`: `encargo` si tiene cuenta (al salir se crea la obra);
 * `recordatorio` si la obra ya existe sin archivar. En el CEE directo cada aviso
 * pasa por `encargar`, así que los dos son el de la app. null: la página de siempre.
 */
async function enlaceAppPrevisto({ negocio, id, fase, certId }) {
    if (!id || !certId) return null;
    const { data: cert, error } = await supabase.from('prescriptores').select('*')
        .eq('id_empresa', certId).maybeSingle();
    if (error) throw errorBd(error, 'leer el certificador');
    if (!cert || require('../agenteIa').esAgenteIa(cert)) return null;
    const cuenta = await cuentaDe(cert);
    if (!cuenta) return null;
    const url = urlEncargo({ negocio, id, fase });
    if (normNegocio(negocio) === 'cee') return { encargo: url, recordatorio: url };
    const obra = await obraDelEncargo(cuenta.id, { negocio, id, fase });
    return { encargo: url, recordatorio: obra && obra.estado !== 'ARCHIVADA' ? url : null };
}

module.exports = {
    NEGOCIOS, normFase, normNegocio, esDeCrm, crmDe, urlEncargo, slotCrmDe, faseLabel,
    cuentaDe, obraDelEncargo, encargar, resumen, aceptar, rechazar,
    subirFotos, quitarFoto, enviarCeeAsync, enviarDefinitivoAsync, enviarRegistroAsync, pedirRevision,
    conEnlaceApp, textoParaTecnico, enlaceAppPrevisto, fotosDelCrm,
    instalacionCae, instalacionCee, conInstalacionDelCrm, instalacionDelCrm, cargarCae, cargarCee, prellenadoCae, prellenadoCee, TEXTO_ENLACE_APP, APP_UNICOS,
};
