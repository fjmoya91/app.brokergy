// ─── App del INSTALADOR — fase 1, SOLO LECTURA ───────────────────────────────
//
//   GET /api/instalador-app/obras       → sus obras ya resueltas + el recuento
//   GET /api/instalador-app/obras/:id   → una obra (nº de oportunidad o su UUID)
//
// Una «obra» es la oportunidad y, si ya se aceptó, su expediente (Fran, 21/11/2026).
// Guardián: `enforceAuth` + `soloBetaInstalador` (utils/appInstalador.js). Lo suyo,
// con el MISMO criterio que `soloLoSuyo` / `suyaSiPartner` de routes/oportunidades.js
// (lo que creó él o lo de su empresa); lo ajeno responde 404, no 403. BD caída → 503
// (regla 38), nunca una lista vacía con pinta de buena.
//
// LISTA BLANCA de salida: nunca margen, comisión, `via_fm`, notas internas,
// comisionista ni enlaces de Drive. Del JSONB se piden SOLO escalares o subcampos
// concretos (regla 22), también en el detalle.
const express = require('express');
const path = require('path');
const { pathToFileURL } = require('url');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { enforceAuth } = require('../middleware/auth');
const { instaladorIdDe } = require('../utils/consejoFactura');
const A = require('../utils/appInstalador');

// Los dos módulos ESM del frontend que deciden por todos: qué le falta al
// instalador (`estadoInstalador`) y qué economía se aceptó (`propuestaGuardada`).
const _esm = {};
const esm = (rel) => (_esm[rel] ||= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic', rel)).href));

/** La app nueva solo responde a quien está en la beta (403 al resto: su app es la de siempre). */
const soloBetaInstalador = (req, res, next) => {
    if (!A.enBetaInstalador(req.user)) return res.status(403).json({ error: 'Esta parte de la app aún no está disponible para tu cuenta.', code: 'APP_INSTALADOR_OFF' });
    next();
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_ID = '00000000-0000-0000-0000-000000000000';
const NO_DISPONIBLE = { error: 'No hemos podido cargar tus obras. Vuelve a intentarlo en unos segundos.', code: 'OBRAS_UNAVAILABLE' };
class BdCaida extends Error {}

// Lo SUYO: el mismo `or` que `soloLoSuyo`. Aquí nunca entra el equipo interno
// (la beta es solo de INSTALADOR), así que el filtro se aplica siempre.
function soloLoSuyo(query, user) {
    const userId = user?.id_usuario || SIN_ID;
    const empresaId = user?.prescriptor_id;
    return empresaId ? query.or(`creador_id.eq.${userId},prescriptor_id.eq.${empresaId}`) : query.eq('creador_id', userId);
}

const FIN = (alias, rama) => ['caeBonus', 'presupuestoTotal', 'presupuesto', 'irpfDeduction', 'irpfCaeAmount', 'caeMaintenanceCost']
    .map(k => `${alias}_${k}:datos_calculo->result->${rama}->>${k}`).join(',');

const SEL_OP = [
    'id, id_oportunidad, ficha, created_at, updated_at, cliente_id, prescriptor_id, instalador_asociado_id',
    'dc_estado:datos_calculo->>estado', 'dc_origen:datos_calculo->>origen',
    'in_nombre:datos_calculo->inputs->>nombre', 'in_apellidos:datos_calculo->inputs->>apellidos',
    'in_razon_social:datos_calculo->inputs->>razon_social',
    'in_direccion:datos_calculo->inputs->>direccion', 'in_address:datos_calculo->inputs->>address',
    'in_municipio:datos_calculo->inputs->>municipio', 'in_provincia:datos_calculo->inputs->>provincia_nombre',
    'in_isReforma:datos_calculo->inputs->isReforma', 'in_comparativa:datos_calculo->inputs->comparativaReforma',
    'in_hibridacion:datos_calculo->inputs->hibridacion',
    'in_presu:datos_calculo->inputs->>presupuesto', 'in_presu_est:datos_calculo->inputs->presupuestoEstimado',
    'kwh080:datos_calculo->result->res080->>ahorroEnergiaFinalTotal',
    FIN('f', 'financials'), FIN('g', 'financialsRes080'),
].join(',').replace(/\s+/g, ' ');

const DOC = (k) => `${k}:documentacion->>${k}`;
const SEL_EXP = [
    'id, oportunidad_id, numero_expediente, estado, created_at, instalador_asociado_id',
    'instalador_id:instalacion->>instalador_id', 'certificador_id:cee->>certificador_id',
    'seg_cee_ini:seguimiento->>cee_inicial', 'seg_cee_fin:seguimiento->>cee_final',
    'fin_obra:documentacion->>fecha_fin_obra_comunicada',
    'fecha_reg_ini:documentacion->>fecha_registro_cee_inicial',
    'fecha_reg_fin:documentacion->>fecha_registro_cee_final',
    'facturas:documentacion->facturas',
    // Lo que lee `estadoInstalador` (los enlaces NO salen de aquí: solo se mira si existen).
    ...['cert_cifo_signed_link', 'cert_cifo_sent_at', 'cert_cifo_drive_at', 'cert_cifo_refirma_at', 'cert_cifo_signed_at',
        'cert_cifo_drive_link', 'cert_rite_signed_link', 'cert_rite_drive_link', 'cert_rite_aportado_at',
        'memoria_rite_docx_link', 'borrador_cert_rite_link', 'borrador_cert_sent_at'].map(DOC),
    'rechazo_cifo:documentacion->docs_rechazados->cert_cifo_signed_link',
    'anexo_i_sent:documentacion->>anexo_i_sent_at', 'anexo_i_signed:documentacion->>anexo_i_signed_link',
    'anexo_cesion_sent:documentacion->>anexo_cesion_sent_at', 'anexo_cesion_signed:documentacion->>anexo_cesion_signed_link',
    'cobro_at:documentacion->cobro->transferencia->>at',
].join(',');

// El detalle añade el equipo (subcampos concretos de `instalacion`).
const SEL_EXP_DETALLE = SEL_EXP + ',' + [
    'potencia_bomba:instalacion->>potencia_bomba', 'cambio_acs:instalacion->>cambio_acs',
    'aero_marca:instalacion->aerotermia_cal->>marca', 'aero_modelo:instalacion->aerotermia_cal->>modelo',
    'aero_serie:instalacion->aerotermia_cal->>numero_serie',
    'acs_marca:instalacion->aerotermia_acs->>marca', 'acs_modelo:instalacion->aerotermia_acs->>modelo',
    'acs_serie:instalacion->aerotermia_acs->>numero_serie',
    'cal_marca:instalacion->caldera_antigua_cal->>marca', 'cal_modelo:instalacion->caldera_antigua_cal->>modelo',
    'cal_combustible:instalacion->caldera_antigua_cal->>combustible', 'cal_tipo:instalacion->caldera_antigua_cal->>tipo_equipo',
].join(',');

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const finDe = (o, a) => {
    const f = {};
    for (const k of ['caeBonus', 'presupuestoTotal', 'presupuesto', 'irpfDeduction', 'irpfCaeAmount', 'caeMaintenanceCost']) {
        const v = num(o[`${a}_${k}`]); if (v != null) f[k] = v;
    }
    return Object.keys(f).length ? f : null;
};
const si = (v) => v === true || /^(si|sí|true)$/i.test(String(v ?? '').trim());
const esRes080 = (op) => op.ficha === 'RES080' || /RES080/.test(op.id_oportunidad || '');

/** El documento mínimo que `estadoInstalador` necesita, rehecho desde los escalares. */
function docDe(e) {
    const d = {};
    for (const k of ['cert_cifo_signed_link', 'cert_cifo_sent_at', 'cert_cifo_drive_at', 'cert_cifo_refirma_at', 'cert_cifo_signed_at',
        'cert_cifo_drive_link', 'cert_rite_signed_link', 'cert_rite_drive_link', 'cert_rite_aportado_at',
        'memoria_rite_docx_link', 'borrador_cert_rite_link', 'borrador_cert_sent_at']) if (e[k]) d[k] = e[k];
    if (e.rechazo_cifo) d.docs_rechazados = { cert_cifo_signed_link: e.rechazo_cifo };
    return d;
}

function resumenFacturas(facturas) {
    const fs = Array.isArray(facturas) ? facturas.filter(Boolean) : [];
    return { n: fs.length, validadas: fs.filter(f => f.validada === true).length, generada: fs.some(f => f.generada) };
}

const nombreDe = (op, cli) => {
    if (cli) return [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' ').trim();
    return (op.in_razon_social || [op.in_nombre, op.in_apellidos].filter(Boolean).join(' ')).trim();
};

/**
 * Destino de una tarea. Fase 2 (21/11/2026): TODO se hace DENTRO de la obra, con
 * sesión — ni enlaces con token ni pestañas aparte. `accion` es la pantalla de la
 * ficha que se abre; la factura va con su plantilla si su empresa la tiene en la app
 * y la obra no es un RES080 (el mismo criterio que la página del consejo), y si no,
 * se SUBE.
 */
function destinoDe(tarea, { op, conPlantilla }) {
    if (tarea.key === 'propuesta') return { tipo: 'oportunidad', id: op.id_oportunidad };
    if (tarea.key === 'cifo' || tarea.key === 'rite') return { tipo: 'accion', accion: tarea.key };
    if (tarea.key === 'factura') return { tipo: 'accion', accion: 'factura', modo: conPlantilla && !esRes080(op) ? 'plantilla' : 'subir' };
    return null;
}

/** Carga sus oportunidades (y sus expedientes y clientes). `filtro` acota a una. */
async function cargarObras(user, { id = null, detalle = false } = {}) {
    let q = supabase.from('oportunidades').select(SEL_OP).order('updated_at', { ascending: false });
    if (id) q = UUID_RE.test(id) ? q.eq('id', id) : q.eq('id_oportunidad', id);
    const { data: ops, error } = await soloLoSuyo(q, user);
    if (error) throw new BdCaida(error.message);
    const visibles = (ops || []).filter(o => o.dc_origen !== 'migracion_xml');
    if (!visibles.length) return [];

    // Expedientes por lotes (.in() con muchos ids revienta la cabecera).
    const ids = visibles.map(o => o.id);
    const exps = [];
    for (let i = 0; i < ids.length; i += 80) {
        const { data, error: e2 } = await supabase.from('expedientes').select(detalle ? SEL_EXP_DETALLE : SEL_EXP).in('oportunidad_id', ids.slice(i, i + 80));
        if (e2) throw new BdCaida(e2.message);
        exps.push(...(data || []));
    }
    const expDe = new Map();
    for (const e of exps.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) expDe.set(String(e.oportunidad_id), e);

    const cliIds = [...new Set(visibles.map(o => o.cliente_id).filter(Boolean))];
    const clientes = new Map();
    for (let i = 0; i < cliIds.length; i += 80) {
        const { data, error: e3 } = await supabase.from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos, tlf, municipio, provincia, direccion, codigo_postal')
            .in('id_cliente', cliIds.slice(i, i + 80));
        if (e3) throw new BdCaida(e3.message);
        for (const c of data || []) clientes.set(c.id_cliente, c);
    }

    const [{ estadoInstalador }, { propuestaGuardada }] = await Promise.all([esm('instaladorPendientes.js'), esm('propuestaGuardada.js')]);

    // ¿Tiene su plantilla de factura en la app? Una consulta para todas sus obras.
    let conPlantilla = false;
    try { conPlantilla = !!(await require('../services/facturaInstaladorService').plantillaDe(user.prescriptor_id)); }
    catch (e) { console.warn('[instalador-app] plantilla:', e.message); }

    const out = [];
    for (const op of visibles) {
        const exp = expDe.get(String(op.id)) || null;
        const cli = op.cliente_id ? clientes.get(op.cliente_id) : null;
        const esInstaladora = !!exp && String(instaladorIdDe(exp, op) || '') === String(user.prescriptor_id);
        let est = null;
        let expEsc = null;
        if (exp) {
            const fac = resumenFacturas(exp.facturas);
            est = estadoInstalador(docDe(exp));
            expEsc = {
                ...exp, n_facturas: fac.n,
                cifo_enviado: exp.cert_cifo_sent_at, cifo_borrador: exp.cert_cifo_drive_link,
                rite_recibido: est.rite.recibido,
            };
        }
        const p = A.pasoDeObra({ estadoCaptacion: op.dc_estado, exp: expEsc, est, esInstaladora });
        if (!p) continue;

        const f = A.financialsDeLaObra({
            fin: finDe(op, 'f'), fin080: finDe(op, 'g'), kwh080: num(op.kwh080),
            isReforma: op.in_isReforma === true, comparativaReforma: op.in_comparativa,
            conExpediente: !!exp, esRes080: esRes080(op), propuestaGuardada,
        });
        const bono = num(f.caeBonus);
        const calle = (cli?.direccion || op.in_direccion || op.in_address || '').replace(/\s*\(en catastro[^)]*\)/i, '').trim();
        const municipio = cli?.municipio || op.in_municipio || '';
        const tareas = p.tareas.map(t => ({ ...t, destino: destinoDe(t, { op, conPlantilla }) }));

        const obra = {
            id: op.id_oportunidad,
            uuid: op.id,
            numero_expediente: exp?.numero_expediente || null,
            con_expediente: !!exp,
            cliente: nombreDe(op, cli) || 'Sin nombre',
            cliente_id: op.cliente_id || null,
            direccion: calle || null,
            municipio: municipio || null,
            provincia: cli?.provincia || op.in_provincia || null,
            bono: bono != null ? Math.round(bono) : null,
            paso: p.paso,
            fase: p.fase,
            quien: p.quien,
            tareas,
            tipo: esRes080(op) ? 'Reforma con aerotermia' : op.in_hibridacion === true ? 'Aerotermia · hibridación' : 'Aerotermia · cambio de caldera',
            actualizada: op.updated_at,
        };

        if (detalle) {
            obra.telefono = cli?.tlf || null;
            obra.direccion_completa = [calle, [cli?.codigo_postal, municipio].filter(Boolean).join(' '), (cli?.provincia ? `(${cli.provincia})` : '')].filter(Boolean).join(' · ') || null;
            obra.cuentas = A.cuentasCliente(f);
            const presu = num(op.in_presu);
            obra.presupuesto = { importe: presu && presu > 0 ? Math.round(presu) : null, estimado: op.in_presu_est === true };
            obra.es_instaladora = esInstaladora;
            obra.factura_modo = conPlantilla && !esRes080(op) ? 'plantilla' : 'subir';
            if (exp) Object.assign(obra, detalleExpediente(exp, est, { esInstaladora }));
        }
        out.push(obra);
    }
    return out;
}

/** Lo que la ficha nueva enseña de un expediente: escalares en lista blanca. */
function detalleExpediente(e, est, { esInstaladora }) {
    const fac = resumenFacturas(e.facturas);
    const cifo = est?.cifo || {};
    const rite = est?.rite || {};
    const equipo = (e.aero_marca || e.aero_modelo) ? {
        titulo: ['Aerotermia', e.potencia_bomba ? `${String(e.potencia_bomba).replace('.', ',')} kW` : null].filter(Boolean).join(' '),
        marca: e.aero_marca || null, modelo: e.aero_modelo || null, serie: e.aero_serie || null,
        acs: (e.acs_marca || e.acs_modelo) && (e.acs_modelo !== e.aero_modelo) ? { marca: e.acs_marca || null, modelo: e.acs_modelo || null, serie: e.acs_serie || null } : null,
        con_acs: si(e.cambio_acs),
    } : null;
    const caldera = (e.cal_combustible || e.cal_marca || e.cal_tipo) ? {
        combustible: e.cal_combustible || null, marca: e.cal_marca || null, modelo: e.cal_modelo || null, tipo: e.cal_tipo || null,
    } : null;

    const papeles = [];
    if (esInstaladora) {
        papeles.push({
            key: 'cifo', nombre: 'Certificado de la instalación',
            estado: cifo.recibido ? 'Firmado' : cifo.bloqueado ? 'Lo estamos corrigiendo' : (cifo.borrador && (cifo.sentAt || cifo.refirma)) ? 'Falta tu firma' : 'Lo preparamos nosotros',
            tono: cifo.recibido ? 'ok' : (cifo.borrador && (cifo.sentAt || cifo.refirma) && !cifo.bloqueado) ? 'tu' : 'nos',
        });
        papeles.push({
            key: 'rite', nombre: 'Legalización RITE',
            estado: rite.recibido ? 'Recibida' : (rite.sentAt || cifo.sentAt) ? 'Falta que la subas' : 'Aún no toca',
            tono: rite.recibido ? 'ok' : (rite.sentAt || cifo.sentAt) ? 'tu' : 'nos',
        });
    }
    papeles.push({
        key: 'factura', nombre: 'Factura de la obra',
        estado: fac.n ? (fac.validadas === fac.n ? `${fac.n === 1 ? 'Revisada' : `${fac.n} revisadas`}` : 'Subida · la estamos revisando') : (A.ceeInicialRegistrado(e) ? 'Todavía no está hecha' : 'Aún no toca'),
        tono: fac.n ? (fac.validadas === fac.n ? 'ok' : 'nos') : (A.ceeInicialRegistrado(e) && esInstaladora ? 'tu' : 'nos'),
    });
    papeles.push({
        key: 'cee_ini', nombre: 'Certificado energético inicial',
        estado: (e.fecha_reg_ini || e.seg_cee_ini === 'REGISTRADO') ? 'Registrado' : 'Lo hacemos nosotros', tono: (e.fecha_reg_ini || e.seg_cee_ini === 'REGISTRADO') ? 'ok' : 'nos',
    });
    papeles.push({
        key: 'cee_fin', nombre: 'Certificado energético final',
        estado: (e.fecha_reg_fin || e.seg_cee_fin === 'REGISTRADO') ? 'Registrado' : 'Lo hacemos nosotros', tono: (e.fecha_reg_fin || e.seg_cee_fin === 'REGISTRADO') ? 'ok' : 'nos',
    });

    // Las facturas, para verlas desde la obra: una referencia opaca (la MISMA de
    // `refFactura`, la del «sustituye a…» de la factura en la app), nunca el enlace.
    const { refFactura } = require('../services/facturaInstaladorService');
    const facturas = (Array.isArray(e.facturas) ? e.facturas : []).filter(f => f && f.drive_id).map(f => ({
        ref: refFactura(f), numero: f.numero_factura || null, fecha: f.fecha_factura || null,
        total: num(f.importe_con_iva), revisada: f.validada === true, hecha_en_app: !!f.generada,
    }));

    return {
        factura: { n: fac.n, validadas: fac.validadas, hecha_en_app: fac.generada },
        facturas,
        equipo, caldera_retirada: caldera,
        papeles, papeles_listos: papeles.filter(p => p.tono === 'ok').length,
        cobrado: !!e.cobro_at,
    };
}

function resumen(obras) {
    return {
        total: obras.length,
        en_marcha: obras.filter(o => o.paso < 5).length,
        te_toca: obras.filter(o => o.quien === 'tu').length,
        cobradas: obras.filter(o => o.paso === 5).length,
        tareas: obras.reduce((n, o) => n + o.tareas.length, 0),
    };
}

router.get('/obras', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        const obras = await cargarObras(req.user);
        res.json({ obras, resumen: resumen(obras) });
    } catch (e) {
        console.error('[instalador-app] obras:', e.message);
        res.status(503).json(NO_DISPONIBLE);
    }
});

router.get('/obras/:id', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        const id = String(req.params.id || '').slice(0, 80);
        const [obra] = await cargarObras(req.user, { id, detalle: true });
        if (!obra) return res.status(404).json({ error: 'Obra no encontrada.' });
        res.json({ obra });
    } catch (e) {
        console.error('[instalador-app] obra:', e.message);
        res.status(503).json(NO_DISPONIBLE);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 2 — lo que el instalador HACE en su obra, con sesión (21/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// REGLA — no se reescribe NADA de lo que ya hace una ruta pública. Cada acción se
// DESPACHA, dentro del servidor, a la MISMA ruta que usa hoy el enlace por token
// (`despachar`): firmar el CIFO y subir el RITE (`routes/public.js`), la factura en
// su plantilla (`routes/facturaInstalador.js`), las fotos y papeles (`reforma-docs`
// de `routes/public.js`, que llaman a `reformaUploadService` y sus RPC de merge) y el
// presupuesto («0. PRESUPUESTO», los anexos de `routes/oportunidades.js`). Así la
// ruta pública y la nueva no pueden decidir distinto: es el mismo código.
//
// Lo que añade esta capa, y nada más:
//   · el guardián: `enforceAuth` + la beta + «la obra es suya» (404 a lo ajeno) y,
//     para firmar, el RITE y la factura, «su empresa es la INSTALADORA» (403);
//   · la credencial: el `upload_token` lo pone el SERVIDOR y no viaja al navegador;
//   · la salida, SANEADA (`sanear`): fuera claves de enlace o token y cualquier
//     cadena con un enlace de Drive (regla 1). Los ficheros, por proxy.
//
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-2.md.

const llave = require('../utils/llaveObra');
const { estadoDesdeExpediente } = require('../utils/estadoOportunidad');

// Los routers de siempre, cargados al primer uso (son grandes).
const ROUTERS = {
    public: () => require('./public'),
    factura: () => require('./facturaInstalador'),
    oportunidades: () => require('./oportunidades'),
};

const CLAVE_FUERA = /(link|links|url)$|^webViewLink$|token/i;
const ENLACE_DRIVE = /drive\.google|docs\.google|googleusercontent/i;
/** Quita enlaces de Drive y tokens de una respuesta, a cualquier profundidad. */
function sanear(v) {
    if (Array.isArray(v)) return v.map(sanear);
    if (v && typeof v === 'object') {
        const o = {};
        for (const [k, x] of Object.entries(v)) if (!CLAVE_FUERA.test(k)) o[k] = sanear(x);
        return o;
    }
    if (typeof v === 'string' && ENLACE_DRIVE.test(v)) return null;
    return v;
}

/**
 * Pasa la petición a la ruta de siempre (`ruta`, relativa a su router) con la
 * credencial del servidor. Lo que llegue del navegador como `token` se ignora.
 * `transformar(cuerpo)` cambia una respuesta buena antes de sanearla.
 */
function despachar(req, res, cual, ruta, { query = {}, transformar = null } = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
        if (!/token|llave/i.test(k) && v != null && typeof v !== 'object') q.set(k, String(v));
    }
    for (const [k, v] of Object.entries(query)) if (v != null) q.set(k, String(v));
    const json = res.json.bind(res);
    res.json = (cuerpo) => {
        let c = cuerpo;
        if (transformar && res.statusCode < 400) {
            try { c = transformar(cuerpo); } catch (e) { console.error('[instalador-app] transformar:', e.message); res.status(500); c = { error: 'No hemos podido completar la operación.' }; }
        }
        return json(sanear(c));
    };
    const qs = q.toString();
    req.url = ruta + (qs ? `?${qs}` : '');
    ROUTERS[cual]()(req, res, (err) => {
        if (err) console.error(`[instalador-app] ${cual}${ruta}:`, err.message || err);
        if (!res.headersSent) res.status(err ? 500 : 404).json({ error: err ? 'No hemos podido completar la operación.' : 'No encontrado.' });
    });
}

const SEL_OBRA = [
    'id, id_oportunidad, ficha, creador_id, prescriptor_id, instalador_asociado_id, cliente_id',
    'dc_estado:datos_calculo->>estado', 'dc_origen:datos_calculo->>origen',
    'upload_token:datos_calculo->>upload_token',
    'in_presu:datos_calculo->inputs->>presupuesto', 'in_presu_est:datos_calculo->inputs->presupuestoEstimado',
].join(',');
const SEL_EXP_OBRA = 'id, numero_expediente, estado, created_at, instalador_asociado_id, instalador_id:instalacion->>instalador_id, certificador_id:cee->>certificador_id';

/** La oportunidad y su expediente (el más reciente). `user` null = sin filtro (solo la llave). */
async function buscarObra(id, user) {
    let q = supabase.from('oportunidades').select(SEL_OBRA);
    q = UUID_RE.test(id) ? q.eq('id', id) : q.eq('id_oportunidad', id);
    const { data, error } = await (user ? soloLoSuyo(q, user) : q).limit(1);
    if (error) throw new BdCaida(error.message);
    const op = data?.[0];
    if (!op || op.dc_origen === 'migracion_xml') return null;
    const { data: exps, error: e2 } = await supabase.from('expedientes').select(SEL_EXP_OBRA).eq('oportunidad_id', op.id);
    if (e2) throw new BdCaida(e2.message);
    const exp = (exps || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).pop() || null;
    // Lo que la app no enseña (RECHAZADA) tampoco se toca por aquí.
    if (exp ? estadoDesdeExpediente({ estado: exp.estado, cee: { certificador_id: exp.certificador_id } }) === 'RECHAZADA'
        : !A.CAPTACION[String(op.dc_estado || 'PTE ENVIAR').toUpperCase()]) return null;
    return { op, exp };
}

/** Guardián: la obra `:id` es SUYA. Deja `req.obra = { op, exp, esInstaladora }`. */
async function obraSuya(req, res, next) {
    try {
        const id = String(req.params.id || '').slice(0, 80);
        const obra = id ? await buscarObra(id, req.user) : null;
        if (!obra) return res.status(404).json({ error: 'Obra no encontrada.' });
        const { op, exp } = obra;
        const expIns = exp ? { instalador_asociado_id: exp.instalador_asociado_id, instalacion: { instalador_id: exp.instalador_id } } : null;
        req.obra = { op, exp, esInstaladora: !!exp && String(instaladorIdDe(expIns, op) || '') === String(req.user.prescriptor_id) };
        next();
    } catch (e) {
        console.error('[instalador-app] obra:', e.message);
        res.status(503).json(NO_DISPONIBLE);
    }
}

/** Firmar, el RITE y la factura son de la empresa que INSTALA (no de quien trae la obra). */
function soloInstaladora(req, res, next) {
    if (!req.obra.exp) return res.status(404).json({ error: 'Esta obra todavía no tiene expediente.' });
    if (!req.obra.esInstaladora) return res.status(403).json({ error: 'Esto lo hace la empresa que instala la obra.', code: 'NO_ES_INSTALADORA' });
    next();
}

const conToken = (req, res) => {
    const t = req.obra.op.upload_token;
    if (!t) { res.status(409).json({ error: 'Esta obra aún no está preparada para subir documentos. Escríbenos y lo activamos.' }); return null; }
    return t;
};


// ── El presupuesto («0. PRESUPUESTO») ────────────────────────────────────────
// El vigente; el anterior queda como `…_old.pdf` y no cuenta.
const ES_PRESUPUESTO = /^PRESUPUESTO DE LA INSTALACI[OÓ]N(_[A-Z0-9]+)?\.pdf$/;
function presupuestoDe(ficheros, op) {
    const lista = (Array.isArray(ficheros) ? ficheros : []).filter(f => ES_PRESUPUESTO.test(f?.name || ''));
    const presu = num(op.in_presu);
    return {
        estado: lista.length ? 'subido' : op.in_presu_est === true ? 'estimado' : 'falta',
        importe: presu && presu > 0 ? Math.round(presu) : null,
        ficheros: lista.map(f => ({ id: f.id, nombre: f.name, fecha: f.modifiedTime || null })),
    };
}

router.get('/obras/:id/presupuesto', enforceAuth, soloBetaInstalador, obraSuya, (req, res) =>
    despachar(req, res, 'oportunidades', `/${encodeURIComponent(req.obra.op.id_oportunidad)}/anexos`, { transformar: (f) => presupuestoDe(f, req.obra.op) }));

router.get('/obras/:id/presupuesto/:fileId', enforceAuth, soloBetaInstalador, obraSuya, (req, res) => {
    if (!/^[\w-]{10,200}$/.test(req.params.fileId)) return res.status(404).end();
    despachar(req, res, 'oportunidades', `/${encodeURIComponent(req.obra.op.id_oportunidad)}/anexos/${req.params.fileId}`);
});

// Subir uno nuevo: el MISMO POST de la calculadora, como presupuesto de la
// aerotermia (el anterior pasa a `_old`). Del navegador solo se aceptan el nombre,
// el tipo y el contenido: la carpeta la pone el servidor.
router.post('/obras/:id/presupuesto', enforceAuth, soloBetaInstalador, obraSuya, (req, res) => {
    const { fileName, mimeType, base64 } = req.body || {};
    if (!base64 || !/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i.test(String(mimeType || ''))) {
        return res.status(400).json({ error: 'Sube el presupuesto en PDF o en foto.' });
    }
    if (String(base64).length > 28 * 1024 * 1024) return res.status(413).json({ error: 'El archivo es demasiado grande (máximo 20 MB).' });
    req.body = { fileName: String(fileName || 'presupuesto.pdf').slice(0, 120), mimeType, base64, isBudget: true, budgetSlot: 'AEROTERMIA' };
    despachar(req, res, 'oportunidades', `/${encodeURIComponent(req.obra.op.id_oportunidad)}/anexos`, { transformar: () => ({ ok: true }) });
});

// ── La factura: en su plantilla (routes/facturaInstalador.js) o subida ───────
const facturaA = (sub) => (req, res) => {
    const t = conToken(req, res); if (!t) return;
    despachar(req, res, 'factura', `/${req.obra.exp.id}${sub}`, { query: { token: t } });
};
router.get('/obras/:id/factura', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, facturaA(''));
router.get('/obras/:id/factura/word', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, facturaA('/word'));
router.post('/obras/:id/factura/vista-previa', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, facturaA('/vista-previa'));
router.post('/obras/:id/factura/generar', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, facturaA('/generar'));

// Sin plantilla (o en un RES080): la sube al apartado «Facturas», por el mismo
// camino que el enlace (crea la fila en `documentacion.facturas` y la lee el OCR).
router.post('/obras/:id/factura/subir', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, (req, res) => {
    const t = conToken(req, res); if (!t) return;
    despachar(req, res, 'public', `/reforma-docs/${req.obra.op.id}/DOC_FACTURAS/batch`, { query: { token: t } });
});

// Ver una factura de la obra: proxy del fichero, por su referencia opaca.
router.get('/obras/:id/factura/fichero/:ref', enforceAuth, soloBetaInstalador, obraSuya, async (req, res) => {
    try {
        if (!req.obra.exp || !/^[0-9a-f]{12}$/.test(req.params.ref)) return res.status(404).json({ error: 'Factura no encontrada.' });
        const { data, error } = await supabase.from('expedientes').select('facturas:documentacion->facturas').eq('id', req.obra.exp.id).maybeSingle();
        if (error) return res.status(503).json(NO_DISPONIBLE);
        const { refFactura } = require('../services/facturaInstaladorService');
        const f = (Array.isArray(data?.facturas) ? data.facturas : []).find(x => x?.drive_id && refFactura(x) === req.params.ref);
        if (!f) return res.status(404).json({ error: 'Factura no encontrada.' });
        await servirFichero(res, f.drive_id);
    } catch (e) {
        console.error('[instalador-app] factura/fichero:', e.message);
        if (!res.headersSent) res.status(502).json({ error: 'No hemos podido abrir la factura.' });
    }
});

// ── Firmar el certificado de la instalación (CIFO) y subir el RITE ───────────
// Lo que pinta /instalador/:id (tareas, re-firma, rechazo y bloqueo) sale de SU ruta.
const publicoExp = (ruta) => (req, res) => despachar(req, res, 'public', ruta(req.obra.exp.id));
router.get('/obras/:id/instalador', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, publicoExp(id => `/instalador/${id}`));
router.get('/obras/:id/cifo/pdf', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, publicoExp(id => `/cifo-upload/${id}/pdf`));
router.post('/obras/:id/cifo', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, publicoExp(id => `/cifo-upload/${id}`));
router.post('/obras/:id/rite', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, publicoExp(id => `/rite-upload/${id}`));
router.get('/obras/:id/fm-declaracion/pdf', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, publicoExp(id => `/instalador/${id}/fm-declaracion/pdf`));
router.post('/obras/:id/fm-declaracion', enforceAuth, soloBetaInstalador, obraSuya, soloInstaladora, publicoExp(id => `/instalador/${id}/fm-declaracion`));

// ── Fotos y papeles: el canal `reforma-docs` de siempre (DocsManager) ────────
// El gestor llama a `${base}/${id}` y `${base}/${id}/${slot}…`, así que aquí `:id`
// es el nº de la obra. Sin validar ni rechazar: eso es del equipo interno (lo
// decide `isStaff` dentro de la ruta pública, y aquí nunca entra el staff).
const SLOT_RE = /^[A-Z0-9_]{2,60}$/i;
const docsA = (sub) => (req, res) => {
    if (req.params.slot && !SLOT_RE.test(req.params.slot)) return res.status(400).json({ error: 'Tipo de documento no válido' });
    const t = conToken(req, res); if (!t) return;
    const ruta = `/reforma-docs/${req.obra.op.id}${typeof sub === 'function' ? sub(req) : sub}`;
    // La vista lleva la llave de las miniaturas (no el token): ver utils/llaveObra.js.
    const transformar = sub === '' ? (v) => ({ ...v, llave: llave.firmarLlave(req.obra.op.id_oportunidad) }) : null;
    despachar(req, res, 'public', ruta, { query: { token: t }, transformar });
};
router.get('/docs/:id', enforceAuth, soloBetaInstalador, obraSuya, docsA(''));
router.post('/docs/:id/fin-obra', enforceAuth, soloBetaInstalador, obraSuya, (req, res) => { req.body = { ...(req.body || {}), rol: 'instalador' }; docsA('/fin-obra')(req, res); });
router.patch('/docs/:id/ventanas', enforceAuth, soloBetaInstalador, obraSuya, docsA('/ventanas'));
router.post('/docs/:id/:slot', enforceAuth, soloBetaInstalador, obraSuya, docsA(r => `/${r.params.slot}`));
router.post('/docs/:id/:slot/batch', enforceAuth, soloBetaInstalador, obraSuya, docsA(r => `/${r.params.slot}/batch`));
router.post('/docs/:id/:slot/merge-pdf', enforceAuth, soloBetaInstalador, obraSuya, docsA(r => `/${r.params.slot}/merge-pdf`));
// Borrar: la ruta pública borra en Drive el `driveId` que le llegue. Aquí solo se
// deja si ese fichero está apuntado en ESE apartado de ESTA obra.
router.delete('/docs/:id/:slot', enforceAuth, soloBetaInstalador, obraSuya, async (req, res) => {
    try {
        if (!SLOT_RE.test(req.params.slot)) return res.status(400).json({ error: 'Tipo de documento no válido' });
        const { driveId, name } = req.query;
        const { data, error } = await supabase.from('oportunidades').select(`lista:datos_calculo->reforma_uploads->${req.params.slot}`).eq('id', req.obra.op.id).maybeSingle();
        if (error) return res.status(503).json(NO_DISPONIBLE);
        const lista = Array.isArray(data?.lista) ? data.lista : [];
        if (!lista.some(it => (driveId ? it?.driveId === driveId : (name && it?.name === name)))) return res.status(404).json({ error: 'Archivo no encontrado' });
        docsA(r => `/${r.params.slot}`)(req, res);
    } catch (e) {
        console.error('[instalador-app] borrar doc:', e.message);
        res.status(503).json(NO_DISPONIBLE);
    }
});

// ── Miniaturas y ficheros para <img> y <a> (sin cabecera de sesión) ──────────
// ABIERTAS a propósito, con LLAVE: firma HMAC sobre el nº de la obra que caduca a
// las 12 h (utils/llaveObra.js) y que solo vale para un fichero de ESA obra.
const _suyos = new Map(); // `${op.id}|${driveId}` → true (solo lo confirmado)
async function esFicheroDeLaObra(op, driveId) {
    const k = `${op.id}|${driveId}`;
    if (_suyos.has(k)) return true;
    const { data, error } = await supabase.from('oportunidades').select('ru:datos_calculo->reforma_uploads, carpeta:datos_calculo->>drive_folder_id, carpeta2:datos_calculo->inputs->>drive_folder_id').eq('id', op.id).maybeSingle();
    if (error) throw new BdCaida(error.message);
    let ok = JSON.stringify(data?.ru || {}).includes(`"${driveId}"`);
    // Drive manda (regla 20): un fichero que está en Drive y no en la BD también se
    // enseña. Se sube por sus carpetas hasta la de la obra (4 niveles como mucho).
    const carpeta = data?.carpeta || data?.carpeta2;
    if (!ok && carpeta) {
        const driveService = require('../services/driveService');
        let ids = [driveId];
        for (let i = 0; i < 4 && !ok && ids.length; i++) {
            const meta = await driveService.getFileMetadata(ids[0], 'id, parents');
            ids = meta?.parents || [];
            ok = ids.includes(carpeta);
        }
    }
    if (ok) { if (_suyos.size > 5000) _suyos.clear(); _suyos.set(k, true); }
    return ok;
}

async function porLlave(req, res) {
    const { id, driveId } = req.params;
    if (!/^[\w-]{3,80}$/.test(id) || !/^[\w-]{10,200}$/.test(driveId) || !llave.verificarLlave(id, req.query.token || req.query.llave)) { res.status(403).end(); return null; }
    const obra = await buscarObra(id, null);
    if (!obra || !obra.op.upload_token || !(await esFicheroDeLaObra(obra.op, driveId))) { res.status(404).end(); return null; }
    return obra;
}

const MIME_FICHERO = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif))$/i;
async function servirFichero(res, driveId) {
    const driveService = require('../services/driveService');
    const meta = await driveService.getFileMetadata(driveId, 'id, name, mimeType');
    if (!meta || !MIME_FICHERO.test(meta.mimeType || '')) return res.status(404).json({ error: 'Archivo no encontrado' });
    const buf = await driveService.getFileContent(driveId);
    if (!buf || !buf.length) return res.status(502).json({ error: 'No hemos podido abrir el archivo.' });
    res.set({
        'Content-Type': meta.mimeType, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    });
    return res.send(Buffer.from(buf));
}

router.get('/thumb/:id/:driveId', async (req, res) => {
    try {
        const obra = await porLlave(req, res); if (!obra) return;
        despachar(req, res, 'public', `/reforma-thumb/${obra.op.id}/${req.params.driveId}`, { query: { token: obra.op.upload_token, sz: req.query.sz } });
    } catch (e) { console.warn('[instalador-app] thumb:', e.message); if (!res.headersSent) res.status(e instanceof BdCaida ? 503 : 404).end(); }
});

router.get('/fichero/:id/:driveId', async (req, res) => {
    try {
        const obra = await porLlave(req, res); if (!obra) return;
        await servirFichero(res, req.params.driveId);
    } catch (e) { console.warn('[instalador-app] fichero:', e.message); if (!res.headersSent) res.status(e instanceof BdCaida ? 503 : 404).end(); }
});

module.exports = router;
module.exports._internos = { docDe, resumenFacturas, detalleExpediente, SEL_OP, SEL_EXP, sanear, presupuestoDe };
