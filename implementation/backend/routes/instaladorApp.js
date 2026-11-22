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
const { entregaPropuesta } = require('../utils/entregaPropuesta');

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
    // Solo metadatos (regla 25: ni el HTML ni el PDF viven aquí). Dice a quién le ha
    // llegado la propuesta y cuál es su PDF; NUNCA sale tal cual hacia el navegador
    // (lleva teléfonos y correos de los destinatarios): ver `propuestaDe`.
    'versiones:datos_calculo->propuesta_versiones',
    FIN('f', 'financials'), FIN('g', 'financialsRes080'),
].join(',').replace(/\s+/g, ' ');

// El detalle de una obra SIN expediente enseña el equipo PREVISTO (el del cálculo).
const SEL_OP_DETALLE = SEL_OP + ',' + [
    'in_aero:datos_calculo->inputs->>aerothermiaModel',
    'in_marca:datos_calculo->inputs->>customBrandName', 'in_modelo:datos_calculo->inputs->>customModelName',
    'in_potencia:datos_calculo->inputs->>potenciaBomba', 'in_acs:datos_calculo->inputs->changeAcs',
    'in_fuel:datos_calculo->inputs->>fuelType', 'in_solido:datos_calculo->inputs->>combustibleSolido',
].join(',');
const COMBUSTIBLE = { gasoleo: 'GASÓLEO', gas_natural: 'GAS NATURAL', butano: 'BUTANO', propano: 'PROPANO', glp: 'GLP', carbon: 'CARBÓN', lena: 'LEÑA', pellets: 'PELLETS', electricidad: 'ELECTRICIDAD' };

/** El equipo del CÁLCULO (aún no instalado): el del catálogo o el tecleado a mano. */
async function equipoPrevisto(op) {
    let marca = (op.in_marca || '').trim() || null;
    let modelo = (op.in_modelo || '').trim() || null;
    if (/^\d{1,9}$/.test(String(op.in_aero || ''))) {
        const { data, error } = await supabase.from('aerotermia').select('marca, modelo_comercial').eq('id', Number(op.in_aero)).maybeSingle();
        if (error) throw new BdCaida(error.message);
        if (data) { marca = data.marca || marca; modelo = data.modelo_comercial || modelo; }
    }
    const kw = num(op.in_potencia);
    const equipo = (marca || modelo || kw) ? {
        titulo: ['Aerotermia', kw ? `${String(kw).replace('.', ',')} kW` : null].filter(Boolean).join(' '),
        marca, modelo, serie: null, acs: null, con_acs: si(op.in_acs), previsto: true,
    } : null;
    const fuel = COMBUSTIBLE[String(op.in_solido || op.in_fuel || '').toLowerCase()] || null;
    return { equipo, caldera_retirada: fuel ? { combustible: fuel, marca: null, modelo: null, tipo: 'Caldera', prevista: true } : null };
}

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
 * ficha que se abre; la factura se HACE en su plantilla si su empresa la tiene en la
 * app —también en un RES080 desde el 22/11/2026 (Fran: «todo debe estar unido»): la
 * misma pantalla que le llega por email, con la aerotermia y su nº de serie— y si no,
 * se SUBE. Con plantilla, subirla ya hecha sigue a un toque en la misma pantalla.
 */
function destinoDe(tarea, { conPlantilla }) {
    if (tarea.key === 'propuesta' || tarea.key === 'cifo' || tarea.key === 'rite') return { tipo: 'accion', accion: tarea.key };
    if (tarea.key === 'factura') return { tipo: 'accion', accion: 'factura', modo: conPlantilla ? 'plantilla' : 'subir' };
    return null;
}

/**
 * La versión de la propuesta que se enseña: la que ACEPTÓ el cliente si está sellada
 * (`aceptada_at`, regla 25); si no, la vigente (la última enviada).
 */
function versionQueSeEnsena(versiones) {
    const vs = (Array.isArray(versiones) ? versiones : []).filter(v => v && v.v).sort((a, b) => Number(a.v) - Number(b.v));
    return vs.filter(v => v.aceptada_at).pop() || vs[vs.length - 1] || null;
}

/**
 * Lo que la obra enseña de su propuesta, en lista BLANCA: ni destinatarios, ni
 * teléfonos, ni correos, ni el enlace de Drive (regla 1). El PDF se pide aparte, por
 * proxy (`GET /obras/:id/propuesta/pdf`).
 */
function propuestaDe(op, { paso, conExpediente, entrega }) {
    const v = versionQueSeEnsena(op.versiones);
    return {
        estado: conExpediente || paso >= 3 ? 'aceptada' : paso === 2 ? 'enviada' : 'preparando',
        version: v ? Number(v.v) : null,
        fecha: v?.fecha || null,
        aceptada_el: v?.aceptada_at || null,
        tiene_pdf: !!v?.drive_id,
        // A quién le ha llegado (regla 136): si solo a él, le toca pasársela.
        la_tiene: !entrega ? null : entrega.cliente ? 'cliente' : entrega.instalador ? 'instalador' : entrega.enlace ? 'enlace' : 'otro',
    };
}

/** Carga sus oportunidades (y sus expedientes y clientes). `filtro` acota a una. */
async function cargarObras(user, { id = null, detalle = false } = {}) {
    let q = supabase.from('oportunidades').select(detalle ? SEL_OP_DETALLE : SEL_OP).order('updated_at', { ascending: false });
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
        const entrega = exp ? null : entregaPropuesta(op.versiones);
        const p = A.pasoDeObra({ estadoCaptacion: op.dc_estado, exp: expEsc, est, esInstaladora, entrega });
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
            obra.factura_modo = conPlantilla ? 'plantilla' : 'subir';
            if (exp) Object.assign(obra, detalleExpediente(exp, est, { esInstaladora }));
            // Sin expediente (o sin equipo apuntado aún en él): el del cálculo, dicho como PREVISTO.
            if (!obra.equipo && p.paso < 4) {
                const prev = await equipoPrevisto(op);
                obra.equipo = prev.equipo;
                if (!obra.caldera_retirada) obra.caldera_retirada = prev.caldera_retirada;
            }
            obra.propuesta = propuestaDe(op, { paso: p.paso, conExpediente: !!exp, entrega });
            // El presupuesto que hizo EN LA APP para esta obra (si lo ligó): solo nº y total,
            // y solo en la ficha — en el listado sería una consulta más por obra.
            let presupuestoApp = null;
            try { presupuestoApp = await require('../services/presupuestoInstaladorService').ligadoAObra(user.prescriptor_id, op.id); }
            catch (e) { console.warn('[instalador-app] presupuesto de la app:', e.message); }
            // TODO lo de la obra en una lista, tenga o no expediente (`caminoDeObra`).
            const camino = A.caminoDeObra({
                paso: p.paso, quien: p.quien, conExpediente: !!exp, esInstaladora,
                presupuesto: obra.presupuesto, exp: expEsc, est,
                fac: exp ? resumenFacturas(exp.facturas) : null, cobrado: !!exp?.cobro_at,
                presupuestoApp,
            });
            obra.papeles = camino.filas;
            obra.papeles_listos = camino.listos;
            obra.papeles_total = camino.total;
            // El cálculo se puede corregir mientras el cliente no haya aceptado.
            obra.se_puede_corregir = !exp && p.paso <= 2;
        }
        out.push(obra);
    }
    return out;
}

/** Lo que la ficha nueva enseña de un expediente: escalares en lista blanca. */
function detalleExpediente(e, est, { esInstaladora }) {
    const fac = resumenFacturas(e.facturas);
    const equipo = (e.aero_marca || e.aero_modelo) ? {
        titulo: ['Aerotermia', e.potencia_bomba ? `${String(e.potencia_bomba).replace('.', ',')} kW` : null].filter(Boolean).join(' '),
        marca: e.aero_marca || null, modelo: e.aero_modelo || null, serie: e.aero_serie || null,
        acs: (e.acs_marca || e.acs_modelo) && (e.acs_modelo !== e.aero_modelo) ? { marca: e.acs_marca || null, modelo: e.acs_modelo || null, serie: e.acs_serie || null } : null,
        con_acs: si(e.cambio_acs),
    } : null;
    const caldera = (e.cal_combustible || e.cal_marca || e.cal_tipo) ? {
        combustible: e.cal_combustible || null, marca: e.cal_marca || null, modelo: e.cal_modelo || null, tipo: e.cal_tipo || null,
    } : null;

    // Los papeles (qué hay hecho, qué le toca, qué llevamos nosotros) los pone
    // `caminoDeObra` (utils/appInstalador.js), para las obras con y sin expediente.

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

// ── La PROPUESTA: su PDF, por proxy ──────────────────────────────────────────
// El instalador VE la propuesta que BROKERGY ya envió (la que aceptó el cliente si
// está sellada; si no, la vigente). El fichero es el `drive_id` que consta en ESA
// versión de ESA oportunidad: del navegador no llega ningún id. Enviarla sigue
// siendo del equipo interno (regla 102): aquí solo se LEE. Lo que él hace con ella
// —pasársela a su cliente— sale de SU WhatsApp, con el enlace de aceptación de
// siempre (`/firma/:uuid`), no de nuestro número.
router.get('/obras/:id/propuesta/pdf', enforceAuth, soloBetaInstalador, obraSuya, async (req, res) => {
    try {
        const { data, error } = await supabase.from('oportunidades').select('versiones:datos_calculo->propuesta_versiones').eq('id', req.obra.op.id).maybeSingle();
        if (error) return res.status(503).json(NO_DISPONIBLE);
        const v = versionQueSeEnsena(data?.versiones);
        if (!v?.drive_id || !/^[\w-]{10,200}$/.test(String(v.drive_id))) return res.status(404).json({ error: 'Esta obra todavía no tiene la propuesta en PDF.' });
        await servirFichero(res, v.drive_id);
    } catch (e) {
        console.error('[instalador-app] propuesta/pdf:', e.message);
        if (!res.headersSent) res.status(502).json({ error: 'No hemos podido abrir la propuesta.' });
    }
});

// «Ya se la he pasado»: lo que el instalador hace con su WhatsApp no lo vemos, así
// que lo DICE él. Se apunta como un envío más de la versión vigente (modo CLIENTE,
// canal `instalador`), que es donde consta a quién le ha llegado (regla 136): la obra
// deja de «tocarle» y el listado interno pasa a «→ cliente + instalador». No cambia
// el estado ni manda nada. `propuesta_version_merge` SUSTITUYE la lista de envíos:
// va la que había más este.
router.post('/obras/:id/propuesta/pasada', enforceAuth, soloBetaInstalador, obraSuya, async (req, res) => {
    try {
        if (req.obra.exp) return res.json({ ok: true }); // ya aceptada: nada que apuntar
        const { data, error } = await supabase.from('oportunidades').select('versiones:datos_calculo->propuesta_versiones').eq('id', req.obra.op.id).maybeSingle();
        if (error) return res.status(503).json(NO_DISPONIBLE);
        const v = versionQueSeEnsena(data?.versiones);
        if (!v) return res.status(409).json({ error: 'Todavía no hay ninguna propuesta enviada en esta obra.' });
        const envios = Array.isArray(v.envios) ? v.envios : [];
        if (envios.some(e => e?.channel === 'instalador' && e?.status === 'ok')) return res.json({ ok: true });
        const nuevo = { channel: 'instalador', status: 'ok', modo: 'CLIENTE', text: 'Cliente → se la ha pasado el instalador (lo dice él, desde su app)', at: new Date().toISOString() };
        const hecho = await require('../services/propuestaVersiones').merge(req.obra.op.id, Number(v.v), { envios: [...envios, nuevo] });
        if (!hecho) return res.status(503).json(NO_DISPONIBLE);
        res.json({ ok: true });
    } catch (e) {
        console.error('[instalador-app] propuesta/pasada:', e.message);
        res.status(503).json(NO_DISPONIBLE);
    }
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

// Sin plantilla (o si prefiere subir la que ya hizo): la sube al apartado «Facturas», por el mismo
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
// El criterio es el MISMO que el de la ruta pública `reforma-thumb`: fuente única en
// utils/ficheroDeLaObra.js (en su `reforma_uploads` o, porque Drive manda —regla 20—,
// colgando de su carpeta a ≤ 4 niveles).
const ficheroDeLaObra = require('../utils/ficheroDeLaObra');
async function esFicheroDeLaObra(op, driveId) {
    try { return await ficheroDeLaObra.esFicheroDeLaObra(op.id, driveId); }
    catch (e) { if (e instanceof ficheroDeLaObra.BdNoDisponible) throw new BdCaida(e.message); throw e; }
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

// ═════════════════════════════════════════════════════════════════════════════
// FASE 3 — EL ESCAPARATE: «Tu página web» (Fran, 21/11/2026)
// ═════════════════════════════════════════════════════════════════════════════
// El instalador PROPONE fotos (de SUS obras o sueltas del móvil) y textos para su
// ficha de brokergy.es («Encuentra tu instalador»). NADA de esto publica: todo entra
// «en revisión» y lo aprueba o rechaza, con su motivo, un ADMIN
// (routes/escaparateRevision.js). Solo SU empresa: `req.user.prescriptor_id`, nunca
// un id que mande el navegador. Las miniaturas, por proxy con llave; nunca Drive.
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-3.md.
const esc = require('../services/escaparateService');
const multer = require('multer');

const NO_DISPONIBLE_PAGINA = { error: 'No hemos podido cargar tu página. Vuelve a intentarlo en unos segundos.', code: 'PAGINA_UNAVAILABLE' };
const WEB_RED = () => String(process.env.WEB_RED_BASE || 'https://brokergy.es/encuentra-tu-instalador').replace(/\/$/, '');
const MIN_OBRAS_MEDIA = 3; // como la web (red.mjs): con 1 o 2 obras la «media» sería la de un cliente
const MAX_FOTOS_PROPUESTA = 30;
const MAX_FOTOS_SUBIDA = 10;
const MAX_BYTES_FOTO = 10 * 1024 * 1024;
const ES_IMAGEN = (it) => /^image\//i.test(it?.mimeType || '') || /\.(jpe?g|png|webp|heic|heif)$/i.test(it?.name || '');
const llaveDeEscaparate = (empresaId) => llave.firmarLlave(`esc-${empresaId}`);
const miniaturaEsc = (fotoId, l) => `/api/instalador-app/escaparate/foto/${fotoId}?llave=${encodeURIComponent(l)}`;
const ESTADO_APP = { PENDIENTE: 'revision', PUBLICADA: 'publicada', NO_VALE: 'no_vale' };
const titulo = (s) => String(s || '').trim().toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/ (De|Del|La|Las|Los|Y|El|E) /g, (m) => m.toLowerCase());
const soloEmpresa = (req, res) => {
    const id = req.user?.prescriptor_id;
    if (!id) { res.status(403).json({ error: 'Tu cuenta no tiene empresa.', code: 'SIN_EMPRESA' }); return null; }
    return id;
};

/** Las fotos de una empresa, tal como las ve ella (con su estado y su motivo). */
function fotoParaApp(f, l) {
    return {
        id: f.id, origen: f.origen === 'SUELTA' ? 'suelta' : 'obra', estado: ESTADO_APP[f.estado] || 'revision',
        motivo: f.estado === 'NO_VALE' ? (f.motivo_rechazo || null) : null,
        fase: f.fase === 'ANTES' ? 'antes' : 'despues', municipio: f.municipio ? titulo(f.municipio) : null,
        propuesta_at: f.propuesta_at || f.created_at || null, revisada_at: f.revisada_at || null,
        miniatura: miniaturaEsc(f.id, l),
    };
}
const textosDe = (t) => (t ? {
    presentacion: t.presentacion || '', especialidades: Array.isArray(t.especialidades) ? t.especialidades : [],
    pueblos: Array.isArray(t.pueblos) ? t.pueblos : [],
} : null);

// GET /escaparate → su página: ficha, fotos con su estado, textos vigentes y en
// revisión, y «lo que sale solo» (de instalador_stats y sus marcas).
router.get('/escaparate', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        const [presc, fotos, textos, stats, marcas] = await Promise.all([
            supabase.from('prescriptores').select('acronimo, razon_social, municipio, descripcion_publica, especialidades, zona_trabajo_publica').eq('id_empresa', empresa).maybeSingle(),
            supabase.from('instalador_fotos_escaparate').select('id, origen, estado, motivo_rechazo, fase, municipio, propuesta_at, revisada_at, created_at, orden')
                .eq('instalador_id', empresa).order('created_at', { ascending: false }),
            supabase.from('instalador_textos_escaparate').select('id, presentacion, especialidades, pueblos, estado, motivo_rechazo, propuesto_at, revisado_at')
                .eq('instalador_id', empresa).order('propuesto_at', { ascending: false }).limit(5),
            supabase.from('instalador_stats').select('num_finalizadas, num_en_curso, num_iniciadas, ayuda_media').eq('instalador_id', empresa).maybeSingle(),
            supabase.from('instalador_marcas').select('marca_nombre').eq('instalador_id', empresa),
        ]);
        const fallo = [presc, fotos, textos, stats, marcas].find((r) => r.error);
        if (fallo) throw new BdCaida(fallo.error.message);
        const p = presc.data || {};
        // El slug y si sale en la web: si la red no carga, la página se enseña igual (sin enlace).
        let red = { slug: null, sale: false };
        try { red = await esc.slugDeInstalador(empresa); } catch (e) { console.warn('[instalador-app] escaparate red:', e.message); }
        const l = llaveDeEscaparate(empresa);
        const listaFotos = (fotos.data || []).map((f) => fotoParaApp(f, l));
        const ts = textos.data || [];
        const enRevision = ts.find((t) => t.estado === 'PENDIENTE') || null;
        const ultimoResuelto = ts.find((t) => t.estado !== 'PENDIENTE') || null;
        const s = stats.data || {};
        const obrasN = (s.num_finalizadas || 0) + (s.num_en_curso || 0) + (s.num_iniciadas || 0);
        res.json({
            ficha: {
                nombre: (p.acronimo || p.razon_social || '').trim(), municipio: p.municipio ? titulo(p.municipio) : null,
                slug: red.slug, sale_en_web: !!red.sale && !!red.slug,
                url: red.slug ? `${WEB_RED()}/${red.slug}/` : null,
            },
            fotos: listaFotos,
            resumen_fotos: {
                publicadas: listaFotos.filter((f) => f.estado === 'publicada').length,
                revision: listaFotos.filter((f) => f.estado === 'revision').length,
                no_vale: listaFotos.filter((f) => f.estado === 'no_vale').length,
            },
            textos: {
                vigentes: { presentacion: p.descripcion_publica || '', especialidades: Array.isArray(p.especialidades) ? p.especialidades : [], pueblos: Array.isArray(p.zona_trabajo_publica) ? p.zona_trabajo_publica : [] },
                en_revision: enRevision ? { ...textosDe(enRevision), propuesto_at: enRevision.propuesto_at } : null,
                // «No vale» solo si es lo ÚLTIMO que pasó (una propuesta nueva lo deja atrás).
                no_vale: !enRevision && ultimoResuelto?.estado === 'NO_VALE'
                    ? { ...textosDe(ultimoResuelto), motivo: ultimoResuelto.motivo_rechazo || null, revisado_at: ultimoResuelto.revisado_at } : null,
            },
            sale_solo: {
                obras: obrasN,
                ayuda_media: obrasN >= MIN_OBRAS_MEDIA && s.ayuda_media != null ? Math.round(Number(s.ayuda_media)) : null,
                min_obras_media: MIN_OBRAS_MEDIA,
                marcas: (marcas.data || []).map((m) => m.marca_nombre).filter(Boolean),
            },
            especialidades: esc.ESPECIALIDADES,
            limites: { presentacion: esc.MAX_PRESENTACION, pueblos: esc.MAX_PUEBLOS },
        });
    } catch (e) {
        console.error('[instalador-app] escaparate:', e.message);
        res.status(503).json(NO_DISPONIBLE_PAGINA);
    }
});

// Las obras en las que su empresa es la INSTALADORA, con su expediente vivo.
async function obrasQueInstala(user, soloObra = null) {
    let q = supabase.from('oportunidades').select('id, id_oportunidad, ficha, instalador_asociado_id, prescriptor_id, dc_origen:datos_calculo->>origen, mun:datos_calculo->inputs->>municipio');
    if (soloObra) q = UUID_RE.test(soloObra) ? q.eq('id', soloObra) : q.eq('id_oportunidad', soloObra);
    const { data: ops, error } = await soloLoSuyo(q, user);
    if (error) throw new BdCaida(error.message);
    const vivas = (ops || []).filter((o) => o.dc_origen !== 'migracion_xml');
    if (!vivas.length) return [];
    const exps = await enLotesBd(vivas.map((o) => o.id), (ids) => supabase.from('expedientes')
        .select('id, oportunidad_id, estado, created_at, instalador_asociado_id, instalador_id:instalacion->>instalador_id, inst_mun:instalacion->>municipio').in('oportunidad_id', ids));
    const expDe = new Map();
    for (const e of exps) { const prev = expDe.get(e.oportunidad_id); if (!prev || String(prev.created_at) < String(e.created_at)) expDe.set(e.oportunidad_id, e); }
    return vivas.map((op) => ({ op, exp: expDe.get(op.id) })).filter(({ op, exp }) => exp
        && !/^RECHAZ/i.test(String(exp.estado || '').trim())
        && String(instaladorIdDe({ instalador_asociado_id: exp.instalador_asociado_id, instalacion: { instalador_id: exp.instalador_id } }, op) || '') === String(user.prescriptor_id));
}
async function enLotesBd(ids, fn) {
    try { return await require('../utils/consultaLotes').enLotes(ids, fn); } catch (e) { throw new BdCaida(e.message); }
}
const QUE_OBRA = (ficha) => (/RES080/.test(ficha || '') ? 'Reforma' : /RES06|RES09|TER/.test(ficha || '') ? 'Aerotermia' : 'Obra');

// GET /escaparate/obras[?obra=] → las fotos que ya subió en SUS obras (de las que es
// la instaladora), para elegir cuáles enseñar. Solo el pueblo; el nº de la obra es suyo.
router.get('/escaparate/obras', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        const filtro = req.query.obra ? String(req.query.obra).slice(0, 80) : null;
        const obras = await obrasQueInstala(req.user, filtro);
        if (!obras.length) return res.json({ obras: [] });
        const ru = await enLotesBd(obras.map((o) => o.op.id), (ids) => supabase.from('oportunidades').select('id, ru:datos_calculo->reforma_uploads').in('id', ids));
        const ruDe = new Map(ru.map((r) => [r.id, r.ru || {}]));
        const ya = await enLotesBd(obras.map((o) => o.exp.id), (ids) => supabase.from('instalador_fotos_escaparate').select('expediente_id, drive_id, estado').in('expediente_id', ids));
        const estadoDe = new Map(ya.map((f) => [`${f.expediente_id}|${f.drive_id}`, ESTADO_APP[f.estado] || 'revision']));
        const out = [];
        for (const { op, exp } of obras) {
            const lv = llave.firmarLlave(op.id_oportunidad);
            const fotos = [];
            let ultima = null;
            for (const [slot, lista] of Object.entries(ruDe.get(op.id) || {})) {
                if (!SLOT_RE.test(slot) || !Array.isArray(lista)) continue;
                for (const it of lista) {
                    if (!it?.driveId || !ES_IMAGEN(it) || it.estado === 'rechazada') continue;
                    if (it.at && (!ultima || it.at > ultima)) ultima = it.at;
                    fotos.push({
                        slot, driveId: it.driveId, fase: esc.faseDeSlot(slot) === 'ANTES' ? 'antes' : 'despues',
                        en_pagina: estadoDe.get(`${exp.id}|${it.driveId}`) || null,
                        miniatura: `/api/instalador-app/thumb/${encodeURIComponent(op.id_oportunidad)}/${encodeURIComponent(it.driveId)}?llave=${encodeURIComponent(lv)}&sz=400`,
                    });
                }
            }
            if (!fotos.length) continue;
            const pueblo = titulo(op.mun || exp.inst_mun || '');
            out.push({ obra: op.id_oportunidad, titulo: pueblo ? `${QUE_OBRA(op.ficha)} en ${pueblo}` : QUE_OBRA(op.ficha), municipio: pueblo || null, cuando: ultima || exp.created_at || null, fotos });
        }
        out.sort((a, b) => String(b.cuando || '').localeCompare(String(a.cuando || '')));
        res.json({ obras: out });
    } catch (e) {
        console.error('[instalador-app] escaparate obras:', e.message);
        res.status(503).json(NO_DISPONIBLE_PAGINA);
    }
});

// POST /escaparate/fotos { permiso: true, fotos: [{ obra, slot, driveId }] } → las
// propone (EN REVISIÓN). Todo o nada: si una no es suya, no se escribe ninguna.
// Idempotente por foto: la que ya está propuesta o publicada no se duplica.
router.post('/escaparate/fotos', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    const { permiso, fotos } = req.body || {};
    if (permiso !== true) return res.status(400).json({ error: 'Marca que los clientes te han dicho que puedes enseñar estas fotos.', code: 'PERMISO_CLIENTE' });
    if (!Array.isArray(fotos) || !fotos.length) return res.status(400).json({ error: 'Elige alguna foto.', code: 'SIN_FOTOS' });
    if (fotos.length > MAX_FOTOS_PROPUESTA) return res.status(400).json({ error: `Como mucho ${MAX_FOTOS_PROPUESTA} fotos de una vez.`, code: 'DEMASIADAS_FOTOS' });
    try {
        // 1) Comprobar TODAS antes de escribir nada.
        const porObra = new Map();
        for (const f of fotos) {
            const obraId = String(f?.obra || '').slice(0, 80), slot = String(f?.slot || ''), driveId = String(f?.driveId || '');
            if (!obraId || !SLOT_RE.test(slot) || !/^[\w-]{10,200}$/.test(driveId)) return res.status(400).json({ error: 'Alguna foto no es válida.', code: 'FOTO_NO_VALIDA' });
            if (!porObra.has(obraId)) {
                const obra = await buscarObra(obraId, req.user);
                if (!obra || !obra.exp) return res.status(404).json({ error: 'Obra no encontrada.', code: 'OBRA_NO_ENCONTRADA' });
                const expIns = { instalador_asociado_id: obra.exp.instalador_asociado_id, instalacion: { instalador_id: obra.exp.instalador_id } };
                if (String(instaladorIdDe(expIns, obra.op) || '') !== String(empresa)) return res.status(403).json({ error: 'Solo puedes enseñar fotos de las obras que instala tu empresa.', code: 'NO_ES_INSTALADORA' });
                const { data, error } = await supabase.from('oportunidades')
                    .select('ru:datos_calculo->reforma_uploads, mun:datos_calculo->inputs->>municipio, cliente_id').eq('id', obra.op.id).maybeSingle();
                if (error) throw new BdCaida(error.message);
                porObra.set(obraId, { obra, ru: data?.ru || {}, mun: data?.mun || null, cliente_id: data?.cliente_id || null });
            }
            const { ru } = porObra.get(obraId);
            const it = (Array.isArray(ru[slot]) ? ru[slot] : []).find((x) => x?.driveId === driveId);
            if (!it || !ES_IMAGEN(it) || it.estado === 'rechazada') return res.status(404).json({ error: 'Esa foto no está en tu obra.', code: 'FOTO_NO_ES_DE_LA_OBRA' });
        }
        // 2) Escribir: una fila PENDIENTE por foto nueva.
        const ahora = new Date().toISOString();
        let propuestas = 0, yaEstaban = 0, noValen = 0;
        for (const f of fotos) {
            const { obra, mun, cliente_id } = porObra.get(String(f.obra).slice(0, 80));
            let municipio = (mun || '').trim();
            if (!municipio && cliente_id) {
                const { data: c } = await supabase.from('clientes').select('municipio').eq('id_cliente', cliente_id).maybeSingle();
                municipio = (c?.municipio || '').trim();
            }
            const { data: exist, error: eEx } = await supabase.from('instalador_fotos_escaparate').select('id, estado')
                .eq('expediente_id', obra.exp.id).eq('drive_id', f.driveId).maybeSingle();
            if (eEx) throw new BdCaida(eEx.message);
            if (exist) { if (exist.estado === 'NO_VALE') noValen++; else yaEstaban++; continue; }
            const { error } = await supabase.from('instalador_fotos_escaparate').insert({
                instalador_id: empresa, expediente_id: obra.exp.id, drive_id: f.driveId,
                fase: esc.faseDeSlot(f.slot), actuacion: esc.actuacionDeSlot(f.slot), slot: f.slot,
                municipio: municipio || null, consentimiento_cliente: false, origen: 'OBRA',
                estado: 'PENDIENTE', permiso_cliente: true, permiso_cliente_at: ahora,
                propuesta_por: req.user.id_usuario || null, propuesta_at: ahora,
            });
            if (error && error.code === '23505') { yaEstaban++; continue; } // la otra pestaña ganó: ya está
            if (error) throw new BdCaida(error.message);
            propuestas++;
        }
        if (propuestas) esc.avisoEscaparate('propuesta', { instalador_id: empresa, n: propuestas });
        res.json({ ok: true, propuestas, ya_estaban: yaEstaban, no_valen: noValen });
    } catch (e) {
        console.error('[instalador-app] escaparate proponer:', e.message);
        res.status(503).json(NO_DISPONIBLE_PAGINA);
    }
});

// POST /escaparate/fotos/subir (multipart: `fotos`, `permiso=true`) → fotos SUELTAS,
// a Drive (DRIVE_FOLDER_ESCAPARATE/<empresa>, services/driveFolders.js); en la BD solo
// el driveId (regla 21). El tipo, por sus BYTES; ≤ 10 MB cada una, ≤ 10 de una vez.
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES_FOTO, files: MAX_FOTOS_SUBIDA } });
router.post('/escaparate/fotos/subir', enforceAuth, soloBetaInstalador, (req, res, next) => {
    subida.array('fotos', MAX_FOTOS_SUBIDA)(req, res, (err) => {
        if (!err) return next();
        const grande = err.code === 'LIMIT_FILE_SIZE';
        res.status(400).json({ error: grande ? 'Alguna foto pesa más de 10 MB.' : `Como mucho ${MAX_FOTOS_SUBIDA} fotos de una vez.`, code: grande ? 'FOTO_GRANDE' : 'DEMASIADAS_FOTOS' });
    });
}, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    if (String(req.body?.permiso) !== 'true') return res.status(400).json({ error: 'Marca que los clientes te han dicho que puedes enseñar estas fotos.', code: 'PERMISO_CLIENTE' });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Elige alguna foto.', code: 'SIN_FOTOS' });
    const tipos = files.map((f) => esc.tipoImagen(f.buffer));
    if (tipos.some((t) => !t)) return res.status(400).json({ error: 'Solo se pueden subir fotos (JPG, PNG, WEBP o HEIC).', code: 'NO_ES_FOTO' });
    const raiz = require('../services/driveFolders').carpetaEscaparate();
    if (!raiz) return res.status(503).json({ error: 'Todavía no podemos guardar fotos sueltas. Escríbenos y lo activamos.', code: 'ESCAPARATE_SIN_CARPETA' });
    try {
        const drive = require('../services/driveService');
        const carpeta = await drive.getOrCreateSubfolder(raiz, String(empresa));
        const ahora = new Date().toISOString();
        const sello = ahora.slice(0, 19).replace(/[-:T]/g, '');
        let n = 0;
        for (let i = 0; i < files.length; i++) {
            const t = tipos[i];
            const g = await drive.saveFileToFolder(carpeta, `ESCAPARATE_${sello}_${i + 1}.${t.ext}`, t.mime, files[i].buffer, { throwOnError: true });
            if (!g?.id) throw new Error('Drive no devolvió el id');
            const { error } = await supabase.from('instalador_fotos_escaparate').insert({
                instalador_id: empresa, expediente_id: null, drive_id: g.id, mime_type: t.mime,
                fase: 'DESPUES', actuacion: 'obra', origen: 'SUELTA', municipio: null, consentimiento_cliente: false,
                estado: 'PENDIENTE', permiso_cliente: true, permiso_cliente_at: ahora,
                propuesta_por: req.user.id_usuario || null, propuesta_at: ahora,
            });
            if (error) throw new BdCaida(error.message);
            n++;
        }
        esc.avisoEscaparate('propuesta', { instalador_id: empresa, n });
        res.json({ ok: true, subidas: n });
    } catch (e) {
        console.error('[instalador-app] escaparate subir:', e.message);
        res.status(e instanceof BdCaida ? 503 : 502).json({ error: 'No hemos podido guardar tus fotos. Vuelve a intentarlo en un momento.', code: 'SUBIDA_FALLIDA' });
    }
});

// DELETE /escaparate/fotos/:id → la retira de su página (esté como esté). Solo la suya.
// La fila se borra; el fichero de Drive se queda (borrar en Drive no se deshace).
router.delete('/escaparate/fotos/:id', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Foto no encontrada.' });
    try {
        const { data: f, error } = await supabase.from('instalador_fotos_escaparate').select('id, instalador_id').eq('id', req.params.id).maybeSingle();
        if (error) throw new BdCaida(error.message);
        if (!f || String(f.instalador_id) !== String(empresa)) return res.status(404).json({ error: 'Foto no encontrada.' });
        const { error: e2 } = await supabase.from('instalador_fotos_escaparate').delete().eq('id', f.id).eq('instalador_id', empresa);
        if (e2) throw new BdCaida(e2.message);
        res.json({ ok: true });
    } catch (e) {
        console.error('[instalador-app] escaparate retirar:', e.message);
        res.status(503).json(NO_DISPONIBLE_PAGINA);
    }
});

// PUT /escaparate/textos { presentacion, especialidades, pueblos } → EN REVISIÓN.
// Una sola propuesta viva: la nueva sustituye a la que estuviera esperando.
router.put('/escaparate/textos', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    const v = esc.validarTextos(req.body || {});
    if (!v.ok) return res.status(400).json({ error: v.error, code: v.code, campo: v.campo });
    try {
        const fila = { ...v.valores, estado: 'PENDIENTE', motivo_rechazo: null, propuesto_por: req.user.id_usuario || null, propuesto_at: new Date().toISOString() };
        const { data: viva, error } = await supabase.from('instalador_textos_escaparate').select('id').eq('instalador_id', empresa).eq('estado', 'PENDIENTE').maybeSingle();
        if (error) throw new BdCaida(error.message);
        const r = viva
            ? await supabase.from('instalador_textos_escaparate').update(fila).eq('id', viva.id).eq('instalador_id', empresa)
            : await supabase.from('instalador_textos_escaparate').insert({ instalador_id: empresa, ...fila });
        if (r.error) throw new BdCaida(r.error.message);
        esc.avisoEscaparate('propuesta', { instalador_id: empresa, n: 1 });
        res.json({ ok: true, en_revision: textosDe(v.valores) });
    } catch (e) {
        console.error('[instalador-app] escaparate textos:', e.message);
        res.status(503).json(NO_DISPONIBLE_PAGINA);
    }
});

// GET /escaparate/foto/:id?llave= → la miniatura de una foto del escaparate (en
// cualquier estado), para <img>. ABIERTA a propósito, con LLAVE: HMAC sobre
// `esc-<empresa>` (utils/llaveObra.js, 12 h) que solo abre fotos de ESA empresa. La
// firma la da `GET /escaparate` al instalador y la cola de revisión al equipo.
router.get('/escaparate/foto/:id', async (req, res) => {
    try {
        if (!UUID_RE.test(req.params.id)) return res.status(403).end();
        const { data: f, error } = await supabase.from('instalador_fotos_escaparate').select('drive_id, instalador_id').eq('id', req.params.id).maybeSingle();
        if (error) return res.status(503).end();
        if (!f || !llave.verificarLlave(`esc-${f.instalador_id}`, req.query.llave)) return res.status(403).end();
        const sz = /^\d{2,4}$/.test(String(req.query.sz || '')) ? String(req.query.sz) : '600';
        const img = await esc.bytesDeFoto(f.drive_id, sz);
        if (!img) return res.status(404).end();
        res.set({ 'Content-Type': /^image\//.test(img.type) ? img.type : 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        return res.send(img.buf);
    } catch (e) {
        console.warn('[instalador-app] escaparate foto:', e.message);
        if (!res.headersSent) res.status(404).end();
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// FASE 4 — EL CATÁLOGO de aerotermia con TARIFAS (Fran, 21/11/2026)
// ═════════════════════════════════════════════════════════════════════════════
//   GET    /catalogo              → los equipos de SUS marcas, con tarifa y su precio
//   GET    /catalogo/:id          → la ficha de un equipo
//   GET    /catalogo/:id/ficha    → su ficha técnica (PDF por proxy, nunca un enlace)
//   PUT    /catalogo/:id/precio   → guardar SU precio { precio } (sin IVA)
//   DELETE /catalogo/:id/precio   → quitarlo (vuelve a valer la tarifa)
//   PUT    /catalogo/:id/compra   → a quién le compra ese modelo { distribuidor_id }
//   POST   /catalogo/:id/pedido   → el pedido al comercial del distribuidor (previa / enviar)
// Las marcas, las de SU ficha (`prescriptores.marca_referencia`, `marca_secundaria` e
// `instalador_marcas`), leídas en cada petición. Sin marcas NO ve ningún equipo (la
// opción conservadora: la ruta vieja le enseñaría el catálogo entero). Un equipo de
// otra marca, 404. El precio es SIEMPRE el de su empresa (`req.user.prescriptor_id`):
// nunca un id que mande el navegador, y nunca el de otro instalador. Sin márgenes.
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-4.md.
// 22/11/2026 (Fran): las marcas se leen de su FICHA, no de la sesión (que vive 5 min en
// caché: RCA no veía las que le acababan de poner); y la tarifa es POR DISTRIBUIDOR:
// ve la de cada distribuidor al que COMPRA (`instalador_proveedores`), marca a quién le
// compra cada modelo y se lo PIDE al comercial. Ver catalogo-por-distribuidor.md.
//   GET    /catalogo/:id/pedido…  ver más abajo
const CT = require('../services/catalogoTarifas');
const PD = require('../services/pedidoDistribuidor');
const SEL_EQUIPO = 'id, marca, modelo_comercial, modelo_conjunto, modelo_ud_exterior, modelo_ud_interior, tipo, potencia_calefaccion, potencia_frigorifica, refrigerante, litros_acs, deposito_acs_incluido, scop_cal_calido_35, scop_cal_calido_55, scop_cal_medio_35, scop_cal_medio_55, scop_dhw_calido, scop_dhw_medio, seer, ficha_tecnica, ficha_tecnica_partes';
const CAT_NO_DISPONIBLE = { error: 'No hemos podido cargar el catálogo. Vuelve a intentarlo en unos segundos.', code: 'CATALOGO_UNAVAILABLE' };
const enLotesCat = (ids, fn) => require('../utils/consultaLotes').enLotes(ids, fn).catch((e) => { throw new BdCaida(e.message); });

/** Sus marcas, de SU ficha (prescriptores + instalador_marcas). */
async function marcasDe(req) {
    const empresa = req.user?.prescriptor_id;
    if (!empresa) return [];
    const [f, im] = await Promise.all([
        supabase.from('prescriptores').select('marca_referencia, marca_secundaria').eq('id_empresa', empresa).maybeSingle(),
        supabase.from('instalador_marcas').select('marca_nombre').eq('instalador_id', empresa),
    ]);
    if (f.error) throw new BdCaida(f.error.message);
    // `instalador_marcas` es del escaparate; si falla, valen las de la ficha.
    return CT.marcasDeFicha(f.data, im.error ? [] : im.data);
}

/** A quién le compra: [{ id, nombre }] (solo empresas DISTRIBUIDOR). */
async function proveedoresDe(empresa) {
    const { data, error } = await supabase.from('instalador_proveedores').select('distribuidor_id').eq('instalador_id', empresa);
    if (error) throw new BdCaida(error.message);
    const ids = (data || []).map((r) => r.distribuidor_id);
    if (!ids.length) return [];
    const { data: ps, error: e2 } = await supabase.from('prescriptores').select('id_empresa, acronimo, razon_social, tipo_empresa').in('id_empresa', ids);
    if (e2) throw new BdCaida(e2.message);
    return (ps || []).filter((p) => String(p.tipo_empresa).toUpperCase() === 'DISTRIBUIDOR')
        .map((p) => ({ id: p.id_empresa, nombre: PD.nombreEmpresa(p) || 'Distribuidor' }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Tarifas de SUS distribuidores, a quién compra cada modelo y su precio propio. */
async function preciosDe(ids, empresa, proveedores) {
    const distIds = proveedores.map((p) => p.id);
    const nombre = new Map(proveedores.map((p) => [p.id, p.nombre]));
    const [tarifas, compras, propios] = await Promise.all([
        distIds.length
            ? enLotesCat(ids, (t) => supabase.from('aerotermia_tarifas').select('aerotermia_id, distribuidor_id, precio_sin_iva, vigente_desde, cargada_at').in('distribuidor_id', distIds).in('aerotermia_id', t))
            : Promise.resolve([]),
        enLotesCat(ids, (t) => supabase.from('instalador_compra_equipo').select('aerotermia_id, distribuidor_id').eq('instalador_id', empresa).in('aerotermia_id', t)),
        enLotesCat(ids, (t) => supabase.from('instalador_precios_equipo').select('aerotermia_id, precio_sin_iva').eq('instalador_id', empresa).in('aerotermia_id', t)),
    ]);
    const vig = CT.vigentesPorDistribuidor(tarifas);
    const compra = new Map(compras.filter((c) => nombre.has(c.distribuidor_id)).map((c) => [c.aerotermia_id, c.distribuidor_id]));
    const propio = new Map(propios.map((p) => [p.aerotermia_id, p]));
    return (e) => CT.equipoParaInstalador(e, {
        tarifas: [...(vig.get(e.id) || new Map()).values()].map((t) => ({ ...t, distribuidor: nombre.get(t.distribuidor_id) })),
        compro_a: compra.get(e.id) || null,
        propio: propio.get(e.id),
    });
}

/** El equipo, solo si es de una de SUS marcas (si no, null → 404). */
async function equipoSuyo(req) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    const marcas = await marcasDe(req);
    if (!marcas.length) return null;
    const { data, error } = await supabase.from('aerotermia').select(SEL_EQUIPO).eq('id', id).in('marca', marcas).maybeSingle();
    if (error) throw new BdCaida(error.message);
    return data || null;
}

/** El equipo tal como lo ve ESE instalador (con sus tarifas), o null. */
async function fichaEquipo(req) {
    const e = await equipoSuyo(req);
    if (!e) return null;
    const proveedores = await proveedoresDe(req.user.prescriptor_id);
    const ver = await preciosDe([e.id], req.user.prescriptor_id, proveedores);
    return { fila: e, dto: ver(e), proveedores };
}

/** Su catálogo entero, tal como lo ve ÉL (lo usan la pantalla y el asistente, fase 6). */
async function catalogoDe(req) {
        const marcas = await marcasDe(req);
        if (!marcas.length) return { sin_marcas: true, marcas: [], proveedores: [], equipos: [] };
        const equipos = [];
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await supabase.from('aerotermia').select(SEL_EQUIPO).in('marca', marcas)
                .order('marca', { ascending: true }).order('potencia_calefaccion', { ascending: true }).range(desde, desde + 999);
            if (error) throw new BdCaida(error.message);
            equipos.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        const proveedores = await proveedoresDe(req.user.prescriptor_id);
        const ver = await preciosDe(equipos.map((e) => e.id), req.user.prescriptor_id, proveedores);
        const lista = equipos.map(ver)
            .sort((a, b) => a.marca.localeCompare(b.marca, 'es') || (a.potencia_kw || 0) - (b.potencia_kw || 0) || a.nombre.localeCompare(b.nombre, 'es'));
        // Los logos: los de la pantalla Aerotermia del CRM (data URL; solo los de SUS marcas).
        const { data: logos } = await supabase.from('aerotermia_marcas').select('nombre, logo').in('nombre', marcas);
        const logo = new Map((logos || []).map((l) => [String(l.nombre).toUpperCase(), /^data:image\//.test(l.logo || '') ? l.logo : null]));
        const cuantos = new Map();
        for (const e of lista) cuantos.set(e.marca, (cuantos.get(e.marca) || 0) + 1);
        const tarjetas = marcas.map((m) => ({ nombre: m, logo: logo.get(m) || null, equipos: cuantos.get(m) || 0 }))
            .sort((a, b) => (b.equipos > 0) - (a.equipos > 0) || a.nombre.localeCompare(b.nombre, 'es'));
        return { sin_marcas: false, marcas: tarjetas, proveedores, equipos: lista };
}

router.get('/catalogo', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        res.json(sanear(await catalogoDe(req)));
    } catch (e) {
        console.warn('[instalador-app] catálogo:', e.message);
        res.status(e instanceof BdCaida ? 503 : 500).json(CAT_NO_DISPONIBLE);
    }
});

router.get('/catalogo/:id', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        const f = await fichaEquipo(req);
        if (!f) return res.status(404).json({ error: 'Ese equipo no está en tu catálogo.', code: 'EQUIPO_NO_ENCONTRADO' });
        res.json(sanear({ ...f.dto, proveedores: f.proveedores }));
    } catch (err) {
        console.warn('[instalador-app] equipo:', err.message);
        res.status(err instanceof BdCaida ? 503 : 500).json(CAT_NO_DISPONIBLE);
    }
});

router.get('/catalogo/:id/ficha', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        const e = await equipoSuyo(req);
        const driveId = e && CT.driveIdDe(e.ficha_tecnica);
        if (!driveId) return res.status(404).json({ error: 'Este equipo no tiene ficha técnica todavía.', code: 'SIN_FICHA' });
        await servirFichero(res, driveId);
    } catch (err) {
        console.warn('[instalador-app] ficha:', err.message);
        if (!res.headersSent) res.status(err instanceof BdCaida ? 503 : 502).json({ error: 'No hemos podido abrir la ficha. Vuelve a intentarlo.' });
    }
});

router.put('/catalogo/:id/precio', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        const precio = CT.precioDe(req.body?.precio);
        if (precio == null) return res.status(400).json({ error: 'Escribe el precio en euros, sin IVA (por ejemplo 6900).', code: 'PRECIO_NO_VALIDO' });
        const e = await equipoSuyo(req);
        if (!e) return res.status(404).json({ error: 'Ese equipo no está en tu catálogo.', code: 'EQUIPO_NO_ENCONTRADO' });
        const { error } = await supabase.from('instalador_precios_equipo').upsert({
            instalador_id: req.user.prescriptor_id, aerotermia_id: e.id, precio_sin_iva: precio,
            actualizado_por: req.user.id_usuario || null, actualizado_at: new Date().toISOString(),
        }, { onConflict: 'instalador_id,aerotermia_id' });
        if (error) throw new BdCaida(error.message);
        res.json({ ok: true, tu_precio: precio });
    } catch (err) {
        console.warn('[instalador-app] precio:', err.message);
        res.status(err instanceof BdCaida ? 503 : 500).json({ error: 'No hemos podido guardar tu precio. Vuelve a intentarlo.', code: 'PRECIO_UNAVAILABLE' });
    }
});

router.delete('/catalogo/:id/precio', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        const e = await equipoSuyo(req);
        if (!e) return res.status(404).json({ error: 'Ese equipo no está en tu catálogo.', code: 'EQUIPO_NO_ENCONTRADO' });
        const { error } = await supabase.from('instalador_precios_equipo').delete().eq('instalador_id', req.user.prescriptor_id).eq('aerotermia_id', e.id);
        if (error) throw new BdCaida(error.message);
        res.json({ ok: true, tu_precio: null });
    } catch (err) {
        console.warn('[instalador-app] quitar precio:', err.message);
        res.status(err instanceof BdCaida ? 503 : 500).json({ error: 'No hemos podido quitar tu precio. Vuelve a intentarlo.', code: 'PRECIO_UNAVAILABLE' });
    }
});

// ── A quién le compra ESE modelo: { distribuidor_id } (uno de SUS distribuidores) ──
router.put('/catalogo/:id/compra', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        const e = await equipoSuyo(req);
        if (!e) return res.status(404).json({ error: 'Ese equipo no está en tu catálogo.', code: 'EQUIPO_NO_ENCONTRADO' });
        const dist = String(req.body?.distribuidor_id || '');
        const proveedores = await proveedoresDe(req.user.prescriptor_id);
        if (!proveedores.some((p) => p.id === dist)) return res.status(400).json({ error: 'Ese distribuidor no está entre a los que compras.', code: 'DISTRIBUIDOR_NO_SUYO' });
        const { error } = await supabase.from('instalador_compra_equipo').upsert({
            instalador_id: req.user.prescriptor_id, aerotermia_id: e.id, distribuidor_id: dist,
            actualizado_por: req.user.id_usuario || null, actualizado_at: new Date().toISOString(),
        }, { onConflict: 'instalador_id,aerotermia_id' });
        if (error) throw new BdCaida(error.message);
        res.json({ ok: true, compro_a: dist });
    } catch (err) {
        console.warn('[instalador-app] compra:', err.message);
        res.status(err instanceof BdCaida ? 503 : 500).json({ error: 'No hemos podido guardarlo. Vuelve a intentarlo.', code: 'COMPRA_UNAVAILABLE' });
    }
});

// ── El PEDIDO al comercial del distribuidor ─────────────────────────────────────
//   POST /catalogo/:id/pedido  { distribuidor_id, cantidad, obra?, nota?, previa? }
//   previa: true → solo el borrador (no escribe ni envía). Sin previa → lo manda (si
//   PEDIDOS_DISTRIBUIDOR_ENABLED; si no, devuelve el borrador `en_seco` y no escribe).
router.post('/catalogo/:id/pedido', enforceAuth, soloBetaInstalador, async (req, res) => {
    try {
        const d = PD.datosDelPedido(req.body);
        if (d.error) return res.status(400).json({ error: d.error, code: d.code });
        const f = await fichaEquipo(req);
        if (!f) return res.status(404).json({ error: 'Ese equipo no está en tu catálogo.', code: 'EQUIPO_NO_ENCONTRADO' });
        if (!f.proveedores.some((p) => p.id === d.distribuidor_id)) return res.status(400).json({ error: 'Ese distribuidor no está entre a los que compras.', code: 'DISTRIBUIDOR_NO_SUYO' });
        let fichas;
        try { fichas = await PD.fichas(req.user.prescriptor_id, d.distribuidor_id); } catch (e) { throw new BdCaida(e.message); }
        if (!fichas.inst || !fichas.dist) return res.status(404).json({ error: 'No encontramos al distribuidor.', code: 'DISTRIBUIDOR_NO_ENCONTRADO' });
        const comercial = PD.comercialDe(fichas.dist);
        if (!comercial.tlf && !comercial.email) return res.status(409).json({ error: 'Ese distribuidor no tiene todavía un comercial con teléfono o correo. Avísanos y lo ponemos.', code: 'SIN_COMERCIAL' });
        const instalador = PD.contactoInstalador(fichas.inst);
        const distribuidor = PD.nombreEmpresa(fichas.dist);
        const tarifa = f.dto.tarifas.find((t) => t.distribuidor_id === d.distribuidor_id) || null;
        const texto = PD.mensajePedido({ instalador, distribuidor, comercial, equipo: f.dto, cantidad: d.cantidad, obra: d.obra, nota: d.nota, tarifa });
        // Al navegador va el NOMBRE del comercial y por dónde le llega, nunca su teléfono ni su correo.
        const borrador = { mensaje: texto, distribuidor, comercial: comercial.nombre || null, canales_posibles: [comercial.tlf && 'WhatsApp', comercial.email && 'Email'].filter(Boolean), copia_a_ti: !!instalador.tlf };
        if (req.body?.previa === true || req.body?.previa === 'true') return res.json({ previa: true, ...borrador });
        if (!PD.activo()) return res.json({ en_seco: true, ...borrador });

        const canales = await PD.enviar({ comercial, instalador, distribuidor, texto, asuntoCorreo: PD.asunto({ instalador, equipo: f.dto, cantidad: d.cantidad }) });
        const { error } = await supabase.from('instalador_pedidos').insert({
            instalador_id: req.user.prescriptor_id, distribuidor_id: d.distribuidor_id, aerotermia_id: f.fila.id,
            cantidad: d.cantidad, obra: d.obra, nota: d.nota, precio_tarifa: tarifa ? tarifa.precio : null,
            mensaje: texto, canales, estado: canales.length ? 'ENVIADO' : 'FALLIDO', creado_por: req.user.id_usuario || null,
        });
        if (error) console.warn('[instalador-app] pedido sin apuntar:', error.message); // ya salió: no se dice que falló
        if (!canales.length) return res.status(502).json({ error: 'No hemos podido mandar el pedido. Vuelve a intentarlo en un rato.', code: 'PEDIDO_NO_ENVIADO' });
        res.json({ ok: true, enviado: true, canales, ...borrador });
    } catch (err) {
        console.warn('[instalador-app] pedido:', err.message);
        res.status(err instanceof BdCaida ? 503 : 500).json({ error: 'No hemos podido preparar el pedido. Vuelve a intentarlo.', code: 'PEDIDO_UNAVAILABLE' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUS PRESUPUESTOS (22/11/2026): el que el instalador hace para SU cliente, con la
// plantilla de su factura. El emisor es SU empresa (`soloEmpresa`: la de la SESIÓN,
// nunca la del navegador); lo ajeno, 404; con la BD caída, 503; todo sale por
// `sanear`. La lógica, en services/presupuestoInstaladorService.js.
// Van antes de cualquier `/:id` que las pudiera capturar (aquí no hay ninguno suelto).
// ─────────────────────────────────────────────────────────────────────────────
const PI = () => require('../services/presupuestoInstaladorService');

/** El error del servicio → su respuesta (400/404/409/503 con su código; el resto, 500 sin detalles). */
function errorPresupuesto(res, e, que) {
    const s = Number(e?.status);
    if ([400, 403, 404, 409, 502, 503].includes(s)) {
        const extra = {};
        if (e.code) extra.code = e.code;
        if (Array.isArray(e.errores)) extra.errores = e.errores;
        if (e.sugerido) extra.sugerido = e.sugerido;
        if (Array.isArray(e.candidatos)) extra.candidatos = e.candidatos;
        return res.status(s).json(sanear({ error: e.message, ...extra }));
    }
    console.warn(`[instalador-app] presupuesto (${que}):`, e?.message);
    return res.status(500).json({ error: 'No hemos podido hacer eso con el presupuesto. Vuelve a intentarlo.', code: 'PRESUPUESTO_ERROR' });
}

/** Manda un PDF (inline salvo `?descargar=1`), sin caché: es un documento con datos del cliente. */
function mandarPdf(res, buffer, nombre, descargar) {
    const ascii = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename="${ascii.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(buffer);
}

router.get('/presupuestos', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try { res.json(sanear({ presupuestos: await PI().listar(empresa, { sinSimulacion: req.query.sin_simulacion === '1' }) })); }
    catch (e) { errorPresupuesto(res, e, 'listar'); }
});

router.get('/presupuestos/nuevo', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        res.json(sanear(await PI().opcionesNuevo({
            prescriptorId: empresa, usuarioId: req.user.id_usuario || null,
            obra: typeof req.query.obra === 'string' && req.query.obra ? req.query.obra : null,
            clienteId: typeof req.query.cliente === 'string' && req.query.cliente ? req.query.cliente : null,
        })));
    } catch (e) { errorPresupuesto(res, e, 'nuevo'); }
});

// La vista previa NO guarda, no gasta nº y no da de alta al cliente.
router.post('/presupuestos/vista-previa', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        const r = await PI().vistaPrevia({ prescriptorId: empresa, entrada: req.body || {} });
        res.setHeader('X-Presupuesto-Desborda', r.desborda ? '1' : '0');
        res.setHeader('X-Presupuesto-Numero-Largo', r.numeroLargo ? '1' : '0');
        res.setHeader('Access-Control-Expose-Headers', 'X-Presupuesto-Desborda, X-Presupuesto-Numero-Largo');
        mandarPdf(res, r.buffer, 'Presupuesto (vista previa).pdf', false);
    } catch (e) { errorPresupuesto(res, e, 'vista previa'); }
});

router.post('/presupuestos', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        // Si viene de WhatsApp lo crea el servidor (origen 'whatsapp'); desde aquí, siempre 'app'.
        const fila = await PI().crear({ prescriptorId: empresa, usuarioId: req.user.id_usuario || null, origen: 'app', entrada: req.body || {} });
        res.status(201).json(sanear({ presupuesto: await PI().paraApp(empresa, fila) }));
    } catch (e) { errorPresupuesto(res, e, 'crear'); }
});

router.get('/presupuestos/:id', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        const fila = await PI().obtener(empresa, req.params.id);
        const presupuesto = await PI().paraApp(empresa, fila);
        res.json(sanear({ presupuesto, entrada: PI().entradaDesdeFila(fila, { idOportunidad: presupuesto.obra?.oportunidad || null }) }));
    } catch (e) { errorPresupuesto(res, e, 'ver'); }
});

router.put('/presupuestos/:id', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        const fila = await PI().actualizar({ prescriptorId: empresa, usuarioId: req.user.id_usuario || null, id: req.params.id, entrada: req.body || {} });
        res.json(sanear({ presupuesto: await PI().paraApp(empresa, fila) }));
    } catch (e) { errorPresupuesto(res, e, 'actualizar'); }
});

router.post('/presupuestos/:id/anular', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try { await PI().anular({ prescriptorId: empresa, id: req.params.id }); res.json({ ok: true }); }
    catch (e) { errorPresupuesto(res, e, 'anular'); }
});

router.get('/presupuestos/:id/pdf', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        const fila = await PI().obtener(empresa, req.params.id);
        const { buffer, desborda, numeroLargo } = await PI().pdfDe(empresa, fila);
        res.setHeader('X-Presupuesto-Desborda', desborda ? '1' : '0');
        res.setHeader('X-Presupuesto-Numero-Largo', numeroLargo ? '1' : '0');
        res.setHeader('Access-Control-Expose-Headers', 'X-Presupuesto-Desborda, X-Presupuesto-Numero-Largo');
        mandarPdf(res, buffer, PI().nombreFichero(fila), req.query.descargar === '1');
    } catch (e) { errorPresupuesto(res, e, 'pdf'); }
});

// A SU teléfono, el de su ficha: el cuerpo de la petición no se lee para el destino.
router.post('/presupuestos/:id/whatsapp', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try { res.json(await PI().enviarAlInstaladorPorWhatsapp({ prescriptorId: empresa, usuario: req.user, id: req.params.id })); }
    catch (e) { errorPresupuesto(res, e, 'whatsapp'); }
});

router.post('/presupuestos/:id/vincular', enforceAuth, soloBetaInstalador, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    const obra = typeof req.body?.obra === 'string' ? req.body.obra.trim() : '';
    if (!obra) return res.status(400).json({ error: 'Dinos a qué obra va.', code: 'FALTA_OBRA' });
    try {
        const fila = await PI().vincularOportunidad({ prescriptorId: empresa, usuarioId: req.user.id_usuario || null, id: req.params.id, obra });
        res.json(sanear({ presupuesto: await PI().paraApp(empresa, fila) }));
    } catch (e) { errorPresupuesto(res, e, 'vincular'); }
});

// ═══════════════════════════════════════════════════════════════════════════
// FASE 6 — el ASISTENTE del instalador (22/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// El mismo motor del presupuesto que el grupo de WhatsApp (`presupuestoMotor.js`),
// herramientas que solo ven lo SUYO (las mismas consultas de estas pantallas) y nada
// sale a terceros: lo que se envía va por los botones de siempre de la app.
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-6.md.

const AI = require('../services/asistenteInstalador');
const nombreDePila = (u) => String(u?.perfilCompleto?.nombre || '').trim().split(/\s+/)[0] || '';

const soloConAsistente = (req, res, next) => {
    // El MISMO criterio que `asistente_instalador` de /api/usuarios/me.
    if (!A.asistenteEncendido(req.user)) return res.status(403).json({ error: 'El asistente no está disponible ahora mismo.', code: 'ASISTENTE_OFF' });
    next();
};

/** Lo que leen las herramientas: SUS obras, SU catálogo y SUS presupuestos. */
function datosDelAsistente(req) {
    return {
        obras: () => cargarObras(req.user),
        // Por el nº de la obra o por el del expediente; siempre dentro de las suyas.
        obra: async (id) => {
            const [o] = await cargarObras(req.user, { id, detalle: true });
            if (o) return o;
            const lista = await cargarObras(req.user);
            const por = lista.find(x => String(x.numero_expediente || '').toUpperCase() === id);
            return por ? ((await cargarObras(req.user, { id: por.uuid, detalle: true }))[0] || null) : null;
        },
        catalogo: () => catalogoDe(req),
        presupuestos: PI(),
    };
}

// Al abrirlo: lo preparado lo calcula el CÓDIGO (sus tareas y sus presupuestos sin bono).
router.get('/asistente', enforceAuth, soloBetaInstalador, soloConAsistente, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    try {
        const obras = await cargarObras(req.user);
        let presupuestos = [];
        try { presupuestos = await PI().listar(empresa, { sinSimulacion: true }); }
        catch (e) { console.warn('[instalador-app] asistente · presupuestos:', e.message); }
        res.json(sanear({ disponible: !!process.env.ANTHROPIC_API_KEY, ...AI.preparado({ obras, presupuestos, nombre: nombreDePila(req.user) }) }));
    } catch (e) {
        console.error('[instalador-app] asistente:', e.message);
        res.status(503).json(NO_DISPONIBLE);
    }
});

// Un mensaje: la respuesta sale según se escribe, una línea JSON por evento (NDJSON).
router.post('/asistente/mensaje', enforceAuth, soloBetaInstalador, soloConAsistente, async (req, res) => {
    const empresa = soloEmpresa(req, res); if (!empresa) return;
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const corte = new AbortController();
    res.on('close', () => { if (!res.writableEnded) corte.abort(); });
    const emitir = (ev) => { if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(sanear(ev))}\n`); };
    try {
        await AI.conversar({
            mensajes: req.body?.mensajes, memoria: req.body?.memoria,
            usuario: { id_usuario: req.user.id_usuario || null, nombre: nombreDePila(req.user) },
            empresa, nombreEmpresa: req.user.acronimo || req.user.razon_social || '',
            emitir, signal: corte.signal, deps: { datos: datosDelAsistente(req) },
        });
    } catch (e) {
        console.error('[instalador-app] asistente · mensaje:', e.message);
        emitir({ t: 'error', mensaje: 'Algo ha fallado y no he podido terminar. Vuelve a intentarlo.' });
    }
    if (!res.writableEnded) res.end();
});

// La nota de voz grabada en el navegador → texto (el MISMO transcriptor del WhatsApp).
const AUDIO_OK = /^audio\/(wav|x-wav|wave|webm|ogg|mp4|mpeg|aac|x-m4a)$/i;
router.post('/asistente/audio', enforceAuth, soloBetaInstalador, soloConAsistente,
    express.raw({ type: (r) => AUDIO_OK.test(String(r.headers['content-type'] || '').split(';')[0].trim()), limit: '8mb' }),
    async (req, res) => {
        const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!AUDIO_OK.test(tipo) || !Buffer.isBuffer(req.body) || req.body.length < 800) {
            return res.status(400).json({ error: 'No me ha llegado el audio. Grábalo otra vez.', code: 'AUDIO_VACIO' });
        }
        try {
            const texto = await require('../services/whatsappConversacion').transcribirBuffer(req.body, tipo === 'audio/x-wav' || tipo === 'audio/wave' ? 'audio/wav' : tipo);
            res.json({ texto: String(texto).slice(0, 4000) });
        } catch (e) {
            console.warn('[instalador-app] asistente · audio:', e.message);
            res.status(502).json({ error: 'No he podido escuchar el audio. ¿Me lo mandas otra vez o me lo escribes?', code: 'AUDIO_NO_TRANSCRITO' });
        }
    });

module.exports = router;
module.exports._internos = { docDe, resumenFacturas, detalleExpediente, SEL_OP, SEL_EXP, sanear, presupuestoDe, miniaturaEsc, llaveDeEscaparate, equipoPrevisto, soloLoSuyo, UUID_RE };
