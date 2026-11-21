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
    'upload_token:datos_calculo->>upload_token',
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

/** Destino de una tarea: siempre a lo que YA existe (fase 1). */
function destinoDe(tarea, { op, exp, conPlantilla }) {
    if (tarea.key === 'propuesta') return { tipo: 'oportunidad', id: op.id_oportunidad };
    if (tarea.key === 'cifo' || tarea.key === 'rite') return { tipo: 'enlace', url: `/instalador/${exp.id}` };
    if (tarea.key === 'factura') {
        const tok = op.upload_token ? encodeURIComponent(op.upload_token) : null;
        if (!tok) return null;
        // Con su plantilla en la app (y una ficha con factura recomendada), la hace ahí;
        // si no, la sube por su enlace de siempre.
        if (conPlantilla && !esRes080(op)) return { tipo: 'enlace', url: `/factura-obra/${exp.id}?token=${tok}` };
        return { tipo: 'enlace', url: `/subir-docs/${op.id}?token=${tok}&rol=instalador` };
    }
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
        const tareas = p.tareas.map(t => ({ ...t, destino: destinoDe(t, { op, exp, conPlantilla }) }));

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

    return {
        factura: { n: fac.n, validadas: fac.validadas, hecha_en_app: fac.generada },
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

module.exports = router;
module.exports._internos = { docDe, resumenFacturas, detalleExpediente, SEL_OP, SEL_EXP };
