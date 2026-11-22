// ============================================================================
// presupuestoInstaladorService.js — el PRESUPUESTO que el INSTALADOR hace para
// SU cliente desde su app (o pidiéndolo por WhatsApp), con la MISMA plantilla
// que su factura (Fran, 22/11/2026, beta RCA: «igual que hay simulación y
// factura, que pueda hacer un presupuesto… lo más fácil posible»).
//
// El EMISOR es el instalador (`prescriptor_id`), nunca BROKERGY: nada que ver con
// `cee_ofertas` (los presupuestos de BROKERGY). El texto predefinido y las
// cuentas viven en la lógica PURA compartida con la app y el agente de WhatsApp
// (`frontend/src/features/instalador/logic/presupuesto.js`): lo que se ve al
// teclear, lo que se guarda y lo que sale en el PDF salen de la misma función.
//
// Reglas que aquí no se rompen:
//   · el `prescriptor_id` lo pone SIEMPRE quien llama, con la SESIÓN (la ruta),
//     nunca el navegador; lo ajeno es 404 (regla 102);
//   · el PDF se compone cada vez: en la BD no se guarda ningún fichero (regla 21);
//     cuando el presupuesto se liga a una oportunidad, el PDF va a su apartado
//     «Presupuesto» en Drive y en la BD solo queda su `driveId`;
//   · los listados piden columnas y subcampos concretos (regla 22);
//   · con la BD caída, 503 (regla 38);
//   · hacia el instalador, una LISTA BLANCA (`filaParaApp`): ni enlaces de Drive
//     ni ids de fichero (regla 1), ni margen ni comisión;
//   · el teléfono al que se manda el PDF sale de la FICHA, nunca de la petición.
// Ver docs/conocimiento/instalador-app/ y el contrato del 22/11/2026.
// ============================================================================

const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');

const TABLA = 'instalador_presupuestos';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_ID = '00000000-0000-0000-0000-000000000000';
const ORIGENES = ['app', 'whatsapp', 'interno'];

// La lógica común (ESM). Se importa una vez y se queda (como presupuestoService.js).
let _logica = null;
const logica = () => (_logica ||= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/instalador/logic/presupuesto.js')).href));

const limpio = (v) => (v === null || v === undefined ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim());
const corto = (v, n) => limpio(v).slice(0, n);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sinTildes = (s) => limpio(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const nueve = (t) => String(t || '').replace(/\D/g, '').slice(-9);
const dniNorm = (d) => String(d || '').replace(/[\s.-]/g, '').toUpperCase();

/** Error con su status (400/404/409/503) y, si hace falta, un código y datos. */
function fallo(msg, status = 400, extra = {}) { return Object.assign(new Error(msg), { status, ...extra }); }
const caida = (e) => fallo(`No hemos podido leer los datos (${e?.message || 'BD'}). Vuelve a intentarlo en unos segundos.`, 503, { code: 'PRESUPUESTOS_UNAVAILABLE' });
/** Respuesta de Supabase → sus datos, o 503. */
function ok(r) { if (r?.error) throw caida(r.error); return r?.data; }

/** Hoy en Madrid, «AAAA-MM-DD» (la fecha del presupuesto es la del instalador, no la UTC). */
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

const nombrePropio = (s) => require('./facturaWordService').nombrePropio(s);

// ── El emisor y su plantilla ─────────────────────────────────────────────────

async function emisorDe(prescriptorId) {
    const e = ok(await supabase.from('prescriptores')
        .select('id_empresa, razon_social, acronimo, cif, direccion, codigo_postal, municipio, provincia, tlf, tlf_responsable, email')
        .eq('id_empresa', prescriptorId).maybeSingle());
    if (!e) throw fallo('Tu empresa no está dada de alta.', 404);
    return e;
}

/**
 * Cómo FIRMA el instalador el mensaje a su cliente: su nombre comercial (el acrónimo de la
 * ficha: «RCA INSTALACIONES» → «RCA Instalaciones») y, si no tiene, su razón social. El
 * cliente le conoce por ese nombre, no por el del NIF.
 */
function firmaDe(e) {
    const acr = limpio(e?.acronimo);
    if (!acr) return nombrePropio(e?.razon_social || '');
    return acr.split(' ').map((w, i) => (
        i === 0 && w.length <= 4 && w === w.toUpperCase() ? w   // la sigla se queda en mayúsculas
            : /^(de|del|la|las|los|y|e)$/i.test(w) ? w.toLowerCase()
                : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
}

/** Su plantilla, o null. Que no la tenga nunca es un fallo: sale la hoja genérica. */
async function plantillaDe(prescriptorId) {
    try { return await require('./facturaInstaladorService').plantillaDe(prescriptorId); }
    catch (e) { console.warn('[presupuesto-instalador] plantilla:', e.message); return null; }
}
const conPlantillaDePresupuesto = (p) => !!(p && p.fondoPresupuesto);

// ── Sus clientes (mismo criterio que GET /api/clientes) ──────────────────────

const SEL_CLI = 'id_cliente, nombre_razon_social, apellidos, dni, tlf, email, direccion, codigo_postal, municipio, provincia, prescriptor_id';

/** Los ids de cliente de SUS oportunidades. */
async function idsClientesDeSusObras(prescriptorId) {
    const filas = ok(await supabase.from('oportunidades').select('cliente_id').eq('prescriptor_id', prescriptorId)) || [];
    return [...new Set(filas.map(f => f.cliente_id).filter(Boolean))];
}

/** Un cliente, solo si es SUYO (su `prescriptor_id` o de una oportunidad suya); si no, 404. */
async function clienteSuyo(prescriptorId, clienteId) {
    if (!UUID_RE.test(String(clienteId || ''))) throw fallo('Cliente no encontrado.', 404);
    const c = ok(await supabase.from('clientes').select(SEL_CLI).eq('id_cliente', clienteId).maybeSingle());
    if (!c) throw fallo('Cliente no encontrado.', 404);
    if (String(c.prescriptor_id || '') === String(prescriptorId)) return c;
    const ids = await idsClientesDeSusObras(prescriptorId);
    if (!ids.includes(c.id_cliente)) throw fallo('Cliente no encontrado.', 404);
    return c;
}

/** Todos los suyos, en escalares (para buscar por DNI, teléfono o nombre). */
async function susClientes(prescriptorId) {
    const ids = await idsClientesDeSusObras(prescriptorId);
    const filtro = `prescriptor_id.eq.${prescriptorId}${ids.length ? `,id_cliente.in.(${ids.join(',')})` : ''}`;
    return ok(await supabase.from('clientes').select(SEL_CLI).or(filtro)) || [];
}

const nombreCompleto = (c) => limpio([c?.nombre_razon_social, c?.apellidos].filter(Boolean).join(' '));
const enmascarar = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 3 ? `···${d.slice(-3)}` : null; };

/** Lo tecleado, saneado: un cliente de la ENTRADA (`nombre`, `apellidos`, `dni`, `tlf`…). */
function clienteDeEntrada(c) {
    const x = c && typeof c === 'object' ? c : {};
    return {
        nombre: corto(x.nombre, 120), apellidos: corto(x.apellidos, 120), dni: corto(dniNorm(x.dni || x.nif), 20),
        tlf: corto(x.tlf || x.telefono, 30), email: corto(x.email, 120).toLowerCase(),
        direccion: corto(x.direccion, 200), codigo_postal: corto(x.codigo_postal, 10),
        municipio: corto(x.municipio, 80), provincia: corto(x.provincia, 80),
    };
}

/**
 * El cliente del presupuesto: el que se elige (`clienteId`, tiene que ser SUYO) o el
 * que se teclea. Lo tecleado se busca entre los SUYOS por DNI, por teléfono (9 últimos
 * dígitos) y por nombre completo sin tildes: uno → se reutiliza y se le rellenan los
 * huecos (nunca se pisa un dato); varios → `candidatos` para elegir; ninguno → se da
 * de alta a su nombre, como el alta de /api/clientes.
 * @returns {Promise<{ cliente: object|null, creado: boolean, candidatos?: object[] }>}
 */
async function resolverCliente({ prescriptorId, usuarioId = null, clienteId = null, cliente = null }) {
    if (!prescriptorId) throw fallo('Tu cuenta no tiene empresa.', 403, { code: 'SIN_EMPRESA' });
    if (clienteId) return { cliente: await clienteSuyo(prescriptorId, clienteId), creado: false };
    const t = clienteDeEntrada(cliente);
    if (!t.nombre) throw fallo('Falta el nombre del cliente.', 400, { code: 'FALTA_CLIENTE' });

    const suyos = await susClientes(prescriptorId);
    const porDni = t.dni ? suyos.filter(c => dniNorm(c.dni) === t.dni) : [];
    const porTlf = !porDni.length && nueve(t.tlf).length === 9 ? suyos.filter(c => nueve(c.tlf) === nueve(t.tlf)) : [];
    const completo = sinTildes(`${t.nombre} ${t.apellidos}`);
    const porNombre = !porDni.length && !porTlf.length ? suyos.filter(c => sinTildes(nombreCompleto(c)) === completo) : [];
    const hallados = porDni.length ? porDni : porTlf.length ? porTlf : porNombre;

    if (hallados.length > 1) {
        return {
            cliente: null, creado: false,
            candidatos: hallados.slice(0, 10).map(c => ({ id: c.id_cliente, nombre: nombreCompleto(c), municipio: c.municipio || null, tlf: enmascarar(c.tlf) })),
        };
    }
    const { normalizeCliente } = require('../utils/normalization');
    if (hallados.length === 1) {
        // Reutilizar: solo se RELLENA lo que estaba vacío; un dato que ya hay no se pisa.
        const c = hallados[0];
        const huecos = {};
        const mapa = { dni: 'dni', tlf: 'tlf', email: 'email', direccion: 'direccion', codigo_postal: 'codigo_postal', municipio: 'municipio', provincia: 'provincia' };
        for (const [k, col] of Object.entries(mapa)) if (t[k] && !limpio(c[col])) huecos[col] = t[k];
        if (!limpio(c.apellidos) && t.apellidos && sinTildes(c.nombre_razon_social) === sinTildes(t.nombre)) huecos.apellidos = t.apellidos;
        if (Object.keys(huecos).length) {
            const r = await supabase.from('clientes').update(normalizeCliente(huecos)).eq('id_cliente', c.id_cliente).select(SEL_CLI).maybeSingle();
            if (r.error?.code === '23505') return { cliente: c, creado: false }; // su DNI ya es de otra ficha: se deja como estaba
            return { cliente: ok(r) || { ...c, ...huecos }, creado: false };
        }
        return { cliente: c, creado: false };
    }

    // Nuevo. Un DNI que ya existe en la casa (de otro partner) no se duplica ni se revela de quién es.
    if (t.dni) {
        const ya = ok(await supabase.from('clientes').select('id_cliente').eq('dni', t.dni).limit(1)) || [];
        if (ya.length) throw fallo('Ese DNI ya está dado de alta en BROKERGY con otra cuenta. Escríbenos y lo vinculamos.', 409, { code: 'DNI_EXISTE' });
    }
    const payload = {
        id_usuario: usuarioId || null, nombre_razon_social: t.nombre, apellidos: t.apellidos || null, dni: t.dni || null,
        tlf: t.tlf || null, email: t.email || null, direccion: t.direccion || null, codigo_postal: t.codigo_postal || null,
        municipio: t.municipio || null, provincia: t.provincia || null, prescriptor_id: prescriptorId, copropietarios: [],
    };
    // El partner que pide que TODOS los avisos de sus clientes le lleguen a él (como el alta de siempre).
    try { const d = await require('./avisosAlPartner').desvioDelPartner(prescriptorId); if (d) Object.assign(payload, d); }
    catch (e) { console.warn('[presupuesto-instalador] desvío del partner:', e.message); }
    const r = await supabase.from('clientes').insert([normalizeCliente(payload)]).select(SEL_CLI).single();
    if (r.error?.code === '23505') throw fallo('Ese DNI ya está dado de alta en BROKERGY con otra cuenta. Escríbenos y lo vinculamos.', 409, { code: 'DNI_EXISTE' });
    const nuevo = ok(r);
    try { require('./whatsappAutoSync').programarCliente(nuevo.id_cliente, 'alta de cliente (presupuesto del instalador)'); } catch { /* opcional */ }
    return { cliente: nuevo, creado: true };
}

// ── La OBRA de la que sale (oportunidad o expediente SUYO) ───────────────────

const SEL_OP_OBRA = [
    'id, id_oportunidad, cliente_id, ref_catastral, creador_id, prescriptor_id',
    'dc_origen:datos_calculo->>origen',
    'in_direccion:datos_calculo->inputs->>direccion', 'in_address:datos_calculo->inputs->>address',
    'in_cp:datos_calculo->inputs->>codigo_postal', 'in_municipio:datos_calculo->inputs->>municipio', 'in_provincia:datos_calculo->inputs->>provincia_nombre',
    'in_aero:datos_calculo->inputs->>aerothermiaModel', 'in_marca:datos_calculo->inputs->>customBrandName', 'in_modelo:datos_calculo->inputs->>customModelName',
    'in_potencia:datos_calculo->inputs->>potenciaBomba', 'in_acs:datos_calculo->inputs->changeAcs',
    'in_fuel:datos_calculo->inputs->>fuelType', 'in_solido:datos_calculo->inputs->>combustibleSolido',
].join(',');

// El combustible de la app/expediente → la clave de COMBUSTIBLES de la lógica común.
const COMB = { gasoleo: 'gasoleo', gas_natural: 'gas', gas: 'gas', 'gas natural': 'gas', butano: 'glp', propano: 'glp', glp: 'glp', carbon: 'carbon', lena: 'lena', pellets: 'pellets', biomasa: 'pellets', electricidad: 'electrica', electrica: 'electrica' };
const combustibleDe = (v) => COMB[limpio(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] || null;
const si = (v) => v === true || /^(si|sí|true)$/i.test(String(v ?? '').trim());

/** Una oportunidad SUYA por su nº, su UUID o el nº de su expediente (`soloLoSuyo`). */
async function oportunidadSuya({ prescriptorId, usuarioId, obra }) {
    const id = corto(obra, 80);
    if (!id) return null;
    const suyo = (q) => q.or(`creador_id.eq.${usuarioId || SIN_ID},prescriptor_id.eq.${prescriptorId}`);
    let exp = null;
    let q = supabase.from('oportunidades').select(SEL_OP_OBRA);
    if (UUID_RE.test(id)) q = q.eq('id', id);
    else if (/_OP\d+$/i.test(id)) q = q.eq('id_oportunidad', id);
    else {
        // Un nº de expediente: su oportunidad (y del expediente, el equipo ya apuntado).
        exp = ok(await supabase.from('expedientes')
            .select('id, oportunidad_id, numero_expediente, estado, potencia_bomba:instalacion->>potencia_bomba, cambio_acs:instalacion->>cambio_acs, aero_marca:instalacion->aerotermia_cal->>marca, aero_modelo:instalacion->aerotermia_cal->>modelo, cal_combustible:instalacion->caldera_antigua_cal->>combustible')
            .eq('numero_expediente', id).limit(1))?.[0] || null;
        if (!exp?.oportunidad_id) return null;
        q = q.eq('id', exp.oportunidad_id);
    }
    const op = ok(await suyo(q).limit(1))?.[0] || null;
    if (!op || op.dc_origen === 'migracion_xml') return null;
    return { op, exp };
}

/** La obra para el formulario: dirección, equipo (instalado o PREVISTO) y caldera. */
async function obraDeOportunidad({ op, exp }) {
    const L = await logica();
    let marca = null, modelo = null, kw = null, acs = null, comb = null;
    if (exp && (exp.aero_marca || exp.aero_modelo)) {
        marca = exp.aero_marca || null; modelo = exp.aero_modelo || null;
        kw = Number(exp.potencia_bomba) > 0 ? Number(exp.potencia_bomba) : null;
        acs = si(exp.cambio_acs); comb = combustibleDe(exp.cal_combustible);
    } else {
        // El equipo del CÁLCULO, con la MISMA función que la ficha de la obra.
        const { equipoPrevisto } = require('../routes/instaladorApp')._internos;
        // Su fallo es la BD (BdCaida, sin status): aquí se dice 503, no un 500 mudo.
        const prev = await equipoPrevisto(op).catch((e) => { throw caida(e); });
        marca = prev.equipo?.marca || null; modelo = prev.equipo?.modelo || null;
        kw = Number(op.in_potencia) > 0 ? Number(op.in_potencia) : null;
        acs = si(op.in_acs);
        comb = combustibleDe(op.in_solido || op.in_fuel);
    }
    const obra = {
        tipo: 'aerotermia',
        direccion: limpio(op.in_direccion || op.in_address).replace(/\s*\(en catastro[^)]*\)/i, '') || '',
        codigo_postal: limpio(op.in_cp), municipio: limpio(op.in_municipio), provincia: limpio(op.in_provincia),
        ref_catastral: limpio(op.ref_catastral),
        equipo: { aerotermia_id: /^\d{1,9}$/.test(String(op.in_aero || '')) ? Number(op.in_aero) : null, marca, modelo, potencia_kw: kw },
        caldera: { combustible: comb },
        emisor: 'radiadores', acs: !!acs, descripcion: '',
        oportunidad: op.id_oportunidad,
    };
    obra.extras = L.extrasPorDefecto(obra);
    return obra;
}

// ── El número ─────────────────────────────────────────────────────────────────

/** El nº sugerido: los de su tabla, los leídos de sus presupuestos subidos y el ejemplo de su plantilla. */
async function numeroSugerido(prescriptorId, plantilla, fecha = hoyMadrid()) {
    const L = await logica();
    const propios = ok(await supabase.from(TABLA).select('numero, created_at').eq('prescriptor_id', prescriptorId).order('created_at', { ascending: false })) || [];
    // Los nº de los presupuestos que ya subió en sus obras: en producción viven en
    // `inputs.presupuestos_leidos.AEROTERMIA.numero` (y alguno en la raíz de
    // `datos_calculo`). Solo ese camino, nunca `datos_calculo` entero (regla 22).
    const leidos = ok(await supabase.from('oportunidades')
        .select('n1:datos_calculo->inputs->presupuestos_leidos->AEROTERMIA->>numero, n2:datos_calculo->presupuestos_leidos->AEROTERMIA->>numero')
        .or(`prescriptor_id.eq.${prescriptorId},instalador_asociado_id.eq.${prescriptorId}`)) || [];
    const ejemplo = plantilla?.cfg?.presupuesto?.numero?.ejemplo || null;
    const todos = [...propios.map(p => p.numero), ...leidos.flatMap(l => [l.n1, l.n2]), ejemplo].filter(Boolean);
    return L.siguienteNumero(todos, String(fecha).slice(2, 4), { ultimo: propios[0]?.numero || null });
}

/** ¿Está libre ese nº? (los ANULADOS lo liberan; `salvo` = el propio, al editar). */
async function numeroLibre(prescriptorId, numero, salvo = null) {
    const filas = ok(await supabase.from(TABLA).select('id, numero, estado').eq('prescriptor_id', prescriptorId).neq('estado', 'ANULADO')) || [];
    return !filas.some(f => f.estado !== 'ANULADO' && String(f.id) !== String(salvo) && limpio(f.numero).toLowerCase() === limpio(numero).toLowerCase());
}

// ── Lo que se abre al empezar uno nuevo ──────────────────────────────────────

/**
 * Todo lo que el formulario necesita para empezar: nº sugerido, fecha, IVA, notas y
 * validez de su plantilla, el cliente y la obra (si viene de una obra suya) y el
 * texto predefinido de los conceptos, con los catálogos.
 */
async function opcionesNuevo({ prescriptorId, usuarioId = null, obra = null, clienteId = null }) {
    if (!prescriptorId) throw fallo('Tu cuenta no tiene empresa.', 403, { code: 'SIN_EMPRESA' });
    const L = await logica();
    const [emisor, plantilla] = await Promise.all([emisorDe(prescriptorId), plantillaDe(prescriptorId)]);
    const fecha = hoyMadrid();
    const cfgP = plantilla?.cfg?.presupuesto || {};

    let laObra = null;
    let cli = null;
    if (obra) {
        const o = await oportunidadSuya({ prescriptorId, usuarioId, obra });
        if (!o) throw fallo('Obra no encontrada.', 404);
        laObra = await obraDeOportunidad(o);
        if (o.op.cliente_id && !clienteId) {
            // El cliente de SU obra: aunque la ficha la hiciera BROKERGY, es su cliente.
            cli = ok(await supabase.from('clientes').select(SEL_CLI).eq('id_cliente', o.op.cliente_id).maybeSingle());
        }
    }
    if (clienteId) cli = await clienteSuyo(prescriptorId, clienteId);
    if (!laObra) {
        laObra = { tipo: 'aerotermia', direccion: '', codigo_postal: '', municipio: '', provincia: '', ref_catastral: '',
            equipo: { aerotermia_id: null, marca: null, modelo: null, potencia_kw: null }, caldera: { combustible: 'gasoleo' },
            emisor: 'radiadores', acs: false, descripcion: '', oportunidad: null };
        laObra.extras = L.extrasPorDefecto(laObra);
    }
    // Sin dirección de la obra, la del cliente (lo normal: la obra es en su casa).
    if (cli && !laObra.direccion) Object.assign(laObra, { direccion: cli.direccion || '', codigo_postal: cli.codigo_postal || '', municipio: cli.municipio || '', provincia: cli.provincia || '' });

    return {
        numero: await numeroSugerido(prescriptorId, plantilla, fecha),
        fecha,
        iva_pct: Number(plantilla?.cfg?.iva_pct ?? 21),
        notas: cfgP.notas || '',
        validez_dias: Number(cfgP.validez_dias) > 0 ? Number(cfgP.validez_dias) : 30,
        con_plantilla: conPlantillaDePresupuesto(plantilla),
        emisor: { nombre: firmaDe(emisor) },
        cliente: cli ? {
            id: cli.id_cliente, nombre: cli.nombre_razon_social || '', apellidos: cli.apellidos || '', dni: cli.dni || '',
            tlf: cli.tlf || '', email: cli.email || '', direccion: cli.direccion || '', codigo_postal: cli.codigo_postal || '',
            municipio: cli.municipio || '', provincia: cli.provincia || '',
        } : null,
        obra: laObra,
        conceptos: L.conceptosDe(laObra),
        tipos: L.TIPOS_OBRA,
        extras: L.EXTRAS.map(e => ({ clave: e.clave, etiqueta: e.etiqueta, litros: e.litros ?? null, tipos: e.tipos || null, texto: e.texto(e.litros) })),
        combustibles: L.COMBUSTIBLES,
        // Añadido al contrato: los emisores, para no escribirlos dos veces.
        emisores: L.EMISORES,
    };
}

// ── Validar y calcular lo tecleado ───────────────────────────────────────────

/** La obra tal como se GUARDA (lista blanca de la entrada). */
function obraDeEntrada(o) {
    const x = o && typeof o === 'object' ? o : {};
    const eq = x.equipo && typeof x.equipo === 'object' ? x.equipo : {};
    const n = (v) => { const k = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(k) && k > 0 ? r2(k) : null; };
    return {
        tipo: corto(x.tipo, 20).toLowerCase() || 'aerotermia',
        direccion: corto(x.direccion, 200), codigo_postal: corto(x.codigo_postal, 10),
        municipio: corto(x.municipio, 80), provincia: corto(x.provincia, 80), ref_catastral: corto(x.ref_catastral, 25).toUpperCase(),
        equipo: {
            aerotermia_id: /^\d{1,9}$/.test(String(eq.aerotermia_id ?? '')) ? Number(eq.aerotermia_id) : null,
            marca: corto(eq.marca, 60) || null, modelo: corto(eq.modelo, 80) || null, potencia_kw: n(eq.potencia_kw),
            ...(n(eq.litros) ? { litros: Math.round(n(eq.litros)) } : {}),
        },
        caldera: { combustible: corto(x.caldera?.combustible, 20).toLowerCase() || null },
        emisor: corto(x.emisor, 20).toLowerCase() || 'radiadores',
        acs: x.acs === true || x.acs === 'true',
        extras: (Array.isArray(x.extras) ? x.extras : []).filter(e => e && typeof e === 'object').slice(0, 20).map(e => ({
            ...(e.clave ? { clave: corto(e.clave, 40) } : {}),
            ...(Number(e.litros) > 0 ? { litros: Math.round(Number(e.litros)) } : {}),
            ...(e.texto ? { texto: corto(e.texto, 300) } : {}),
        })).filter(e => e.clave || e.texto),
        descripcion: String(x.descripcion || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').slice(0, 2000),
    };
}

/**
 * Comprueba y calcula. Devuelve lo que se guardaría (sin el cliente, que se resuelve
 * aparte) y los errores. `borrador: true` (vista previa) no exige el nº.
 */
async function calcularEntrada(entrada, { borrador = false } = {}) {
    const L = await logica();
    const e = entrada && typeof entrada === 'object' ? entrada : {};
    const errores = [];
    const obra = obraDeEntrada(e.obra);
    const conceptos = Array.isArray(e.conceptos) && e.conceptos.some(c => limpio(c)) ? e.conceptos : L.conceptosDe(obra);
    const c = L.calcularPresupuesto({ conceptos, modo: e.modo, total: e.total, partidas: e.partidas, iva_pct: e.iva_pct ?? 21, con_iva: e.con_iva === true || e.con_iva === 'true' });
    errores.push(...c.errores);
    const numero = limpio(e.numero);
    if (!numero && !borrador) errores.push('Falta el número de presupuesto.');
    if (numero.length > 30) errores.push('El número de presupuesto es demasiado largo.');
    let fecha = limpio(e.fecha);
    if (!fecha) fecha = hoyMadrid();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) { errores.push('La fecha no es válida.'); fecha = hoyMadrid(); }
    const validez = Number(e.validez_dias);
    return {
        errores: [...new Set(errores)],
        fila: {
            numero: numero.slice(0, 30), fecha, obra, lineas: c.lineas, modo: c.modo,
            notas: String(e.notas || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, 1000) || null,
            validez_dias: Number.isInteger(validez) && validez > 0 && validez <= 365 ? validez : null,
            base: c.base, iva_pct: c.iva_pct, iva: c.iva, total: c.total,
        },
    };
}

/** La foto del cliente que sale IMPRESA (y se guarda en `cliente`). */
const fotoCliente = (c) => ({
    nombre: nombreCompleto(c) || null, nif: c?.dni || null, direccion: c?.direccion || null,
    codigo_postal: c?.codigo_postal || null, municipio: c?.municipio || null, provincia: c?.provincia || null, tlf: c?.tlf || null,
});

// ── Crear, actualizar, anular, leer ──────────────────────────────────────────

const SEL_LISTA = [
    'id, numero, fecha, estado, origen, base, total, created_at, oportunidad_id',
    'cli_nombre:cliente->>nombre', 'municipio:obra->>municipio', 'o_tipo:obra->>tipo', 'o_acs:obra->>acs',
    'o_marca:obra->equipo->>marca', 'o_modelo:obra->equipo->>modelo', 'o_desc:obra->>descripcion', 'sim_estado:simulacion->>estado',
].join(',');

/** El presupuesto, solo si es SUYO (404 a lo ajeno o a un id que no lo es). */
async function obtener(prescriptorId, id) {
    if (!prescriptorId || !UUID_RE.test(String(id || ''))) throw fallo('Presupuesto no encontrado.', 404);
    const f = ok(await supabase.from(TABLA).select('*').eq('id', id).eq('prescriptor_id', prescriptorId).maybeSingle());
    if (!f) throw fallo('Presupuesto no encontrado.', 404);
    return f;
}

/** Sus presupuestos, más recientes primero. Columnas concretas, nunca el JSONB entero (regla 22). */
async function listar(prescriptorId, { sinSimulacion = false } = {}) {
    if (!prescriptorId) throw fallo('Tu cuenta no tiene empresa.', 403, { code: 'SIN_EMPRESA' });
    const L = await logica();
    const filas = ok(await supabase.from(TABLA).select(SEL_LISTA).eq('prescriptor_id', prescriptorId).order('created_at', { ascending: false })) || [];
    const ops = await idsOportunidad(filas.map(f => f.oportunidad_id));
    const out = filas.map(f => ({
        id: f.id, numero: f.numero, fecha: f.fecha, estado: f.estado, origen: f.origen,
        cliente: f.cli_nombre || null, municipio: f.municipio || null,
        resumen: L.resumenObra({ tipo: f.o_tipo, acs: si(f.o_acs), equipo: { marca: f.o_marca, modelo: f.o_modelo }, descripcion: f.o_desc }),
        base: Number(f.base), total: Number(f.total),
        obra: f.oportunidad_id ? (ops.get(f.oportunidad_id) || null) : null,
        simulacion: f.sim_estado || null,
    }));
    return sinSimulacion ? out.filter(p => !p.obra && !p.simulacion) : out;
}

/** uuid de oportunidad → su nº (`26RES060_OP900`). */
async function idsOportunidad(uuids) {
    const ids = [...new Set((uuids || []).filter(Boolean))];
    const m = new Map();
    for (let i = 0; i < ids.length; i += 80) {
        const d = ok(await supabase.from('oportunidades').select('id, id_oportunidad').in('id', ids.slice(i, i + 80))) || [];
        for (const o of d) m.set(o.id, o.id_oportunidad);
    }
    return m;
}

/**
 * Crea un presupuesto: valida, resuelve el cliente (lo da de alta si hace falta),
 * calcula y comprueba que el nº está libre (409 `NUMERO_REPETIDO` con `sugerido`).
 * Si la obra viene de una oportunidad suya (`entrada.obra.oportunidad`), lo liga.
 */
async function crear({ prescriptorId, usuarioId = null, origen = 'app', entrada }) {
    if (!prescriptorId) throw fallo('Tu cuenta no tiene empresa.', 403, { code: 'SIN_EMPRESA' });
    const { errores, fila } = await calcularEntrada(entrada);
    if (errores.length) throw fallo(errores[0], 400, { code: 'NO_VALIDO', errores });
    const plantilla = await plantillaDe(prescriptorId);
    if (!(await numeroLibre(prescriptorId, fila.numero))) {
        throw fallo(`Ya tienes un presupuesto con el número ${fila.numero}.`, 409, { code: 'NUMERO_REPETIDO', sugerido: await numeroSugerido(prescriptorId, plantilla, fila.fecha) });
    }
    const rc = await resolverCliente({ prescriptorId, usuarioId, clienteId: entrada?.cliente_id || null, cliente: entrada?.cliente });
    if (!rc.cliente) throw fallo('Hay varios clientes que se parecen: elige cuál es.', 409, { code: 'CLIENTE_AMBIGUO', candidatos: rc.candidatos || [] });

    const fila2 = {
        prescriptor_id: prescriptorId, ...fila, estado: 'EMITIDO', origen: ORIGENES.includes(origen) ? origen : 'app',
        cliente_id: rc.cliente.id_cliente, cliente: fotoCliente(rc.cliente), creado_por: usuarioId || null,
    };
    const r = await supabase.from(TABLA).insert(fila2).select('*').single();
    if (r.error?.code === '23505') {
        // Otra pestaña (o el WhatsApp) ganó ese nº entre la comprobación y aquí.
        throw fallo(`Ya tienes un presupuesto con el número ${fila.numero}.`, 409, { code: 'NUMERO_REPETIDO', sugerido: await numeroSugerido(prescriptorId, plantilla, fila.fecha) });
    }
    let creada = ok(r);
    const obraOp = corto(entrada?.obra?.oportunidad, 80);
    if (obraOp) {
        // Ligarlo a SU obra. Si eso falla, el presupuesto ya está hecho: no se deshace.
        try { creada = await vincularOportunidad({ prescriptorId, usuarioId, id: creada.id, obra: obraOp, fila: creada }); }
        catch (e) { console.warn('[presupuesto-instalador] vincular al crear:', e.message); }
    }
    return { ...creada, cliente_creado: rc.creado };
}

/** Lo cambia (mismo nº o uno libre). Uno ANULADO ya no se toca. */
async function actualizar({ prescriptorId, usuarioId = null, id, entrada }) {
    const antes = await obtener(prescriptorId, id);
    if (antes.estado === 'ANULADO') throw fallo('Este presupuesto está anulado.', 409, { code: 'ANULADO' });
    const { errores, fila } = await calcularEntrada(entrada);
    if (errores.length) throw fallo(errores[0], 400, { code: 'NO_VALIDO', errores });
    if (!(await numeroLibre(prescriptorId, fila.numero, id))) {
        throw fallo(`Ya tienes un presupuesto con el número ${fila.numero}.`, 409, { code: 'NUMERO_REPETIDO', sugerido: await numeroSugerido(prescriptorId, await plantillaDe(prescriptorId), fila.fecha) });
    }
    const rc = await resolverCliente({ prescriptorId, usuarioId, clienteId: entrada?.cliente_id || (entrada?.cliente ? null : antes.cliente_id), cliente: entrada?.cliente });
    if (!rc.cliente) throw fallo('Hay varios clientes que se parecen: elige cuál es.', 409, { code: 'CLIENTE_AMBIGUO', candidatos: rc.candidatos || [] });
    // Lo que no es de la entrada (el vínculo con la oportunidad y su fichero) se conserva.
    const obra = { ...fila.obra, ...(antes.obra?.vinculo ? { vinculo: antes.obra.vinculo } : {}) };
    const r = await supabase.from(TABLA).update({
        ...fila, obra, cliente_id: rc.cliente.id_cliente, cliente: fotoCliente(rc.cliente), updated_at: new Date().toISOString(),
    }).eq('id', id).eq('prescriptor_id', prescriptorId).select('*').maybeSingle();
    if (r.error?.code === '23505') throw fallo(`Ya tienes un presupuesto con el número ${fila.numero}.`, 409, { code: 'NUMERO_REPETIDO' });
    const hecha = ok(r);
    if (!hecha) throw fallo('Presupuesto no encontrado.', 404);
    return { ...hecha, cliente_creado: rc.creado };
}

/** Lo anula (libera su nº). Idempotente. */
async function anular({ prescriptorId, id }) {
    const f = await obtener(prescriptorId, id);
    if (f.estado === 'ANULADO') return f;
    return ok(await supabase.from(TABLA).update({ estado: 'ANULADO', updated_at: new Date().toISOString() })
        .eq('id', id).eq('prescriptor_id', prescriptorId).select('*').maybeSingle()) || { ...f, estado: 'ANULADO' };
}

// ── Para reabrirlo y para enseñarlo ──────────────────────────────────────────

/** De la fila a la ENTRADA del formulario (para reabrirlo y editarlo). */
function entradaDesdeFila(fila, { idOportunidad = null } = {}) {
    const lineas = Array.isArray(fila?.lineas) ? fila.lineas : [];
    const base = Number(fila?.base) || 0;
    const pct = Number(fila?.iva_pct ?? 21);
    // Si el total guardado no sale de la base (se dijo «con IVA»), se reabre con el total
    // dicho: así el céntimo no baila al volver a calcular.
    // Y si el total es redondo y la base no (11.000 «con IVA» → 9.090,91), también se dijo
    // con IVA: se reabre con el 11.000 que tecleó, no con la base con céntimos.
    const total = r2(fila?.total);
    const conIva = r2(base + Math.round(base * pct) / 100) !== total || (Number.isInteger(total) && !Number.isInteger(r2(base)));
    const c = fila?.cliente || {};
    const { vinculo, ...obra } = fila?.obra || {};
    return {
        numero: fila?.numero || '', fecha: fila?.fecha || '',
        cliente_id: fila?.cliente_id || null,
        cliente: { nombre: c.nombre || '', apellidos: '', dni: c.nif || '', tlf: c.tlf || '', email: '',
            direccion: c.direccion || '', codigo_postal: c.codigo_postal || '', municipio: c.municipio || '', provincia: c.provincia || '' },
        obra: { ...obra, oportunidad: idOportunidad || null },
        conceptos: lineas.map(l => l.texto),
        modo: fila?.modo === 'partidas' ? 'partidas' : 'total',
        total: fila?.modo === 'partidas' ? null : (conIva ? r2(fila.total) : r2(lineas[0]?.precio ?? base)),
        con_iva: fila?.modo === 'partidas' ? false : conIva,
        partidas: lineas.map(l => ({ cantidad: l.cantidad ?? null, precio: l.precio ?? null })),
        iva_pct: pct, notas: fila?.notas || '', validez_dias: fila?.validez_dias ?? null,
    };
}

/**
 * Lo que VE el instalador de un presupuesto: lista blanca. Fuera el vínculo con
 * Drive (id del fichero), `creado_por` y la simulación entera (solo su estado).
 * `extra` = lo que se calcula fuera (nº de la oportunidad, resumen y mensaje).
 */
function filaParaApp(fila, extra = {}) {
    if (!fila) return null;
    const { vinculo, ...obra } = fila.obra || {};
    const c = fila.cliente || {};
    return {
        id: fila.id, numero: fila.numero, fecha: fila.fecha, estado: fila.estado, origen: fila.origen,
        cliente_id: fila.cliente_id || null,
        cliente: { nombre: c.nombre || null, nif: c.nif || null, direccion: c.direccion || null, codigo_postal: c.codigo_postal || null,
            municipio: c.municipio || null, provincia: c.provincia || null, tlf: c.tlf || null },
        obra: { ...obra, oportunidad: extra.idOportunidad || null },
        lineas: (Array.isArray(fila.lineas) ? fila.lineas : []).map(l => ({ texto: l.texto, cantidad: l.cantidad ?? null, precio: l.precio ?? null, importe: Number(l.importe) || 0 })),
        modo: fila.modo, notas: fila.notas || null, validez_dias: fila.validez_dias ?? null,
        base: Number(fila.base), iva_pct: Number(fila.iva_pct), iva: Number(fila.iva), total: Number(fila.total),
        simulacion: fila.simulacion?.estado || null,
        vinculado: !!fila.oportunidad_id,
        // El nº de la obra a la que está ligado (el que usa la app para abrirla), también suelto.
        id_oportunidad: extra.idOportunidad || null,
        ...(extra.resumen ? { resumen: extra.resumen } : {}),
        ...(extra.mensaje ? { mensaje: extra.mensaje } : {}),
        ...(fila.cliente_creado !== undefined ? { cliente_creado: !!fila.cliente_creado } : {}),
        created_at: fila.created_at || null, updated_at: fila.updated_at || null,
    };
}

/** `filaParaApp` con lo que necesita consultar: el nº de la obra, el resumen y el mensaje para el cliente. */
async function paraApp(prescriptorId, fila) {
    const L = await logica();
    const ops = fila.oportunidad_id ? await idsOportunidad([fila.oportunidad_id]) : new Map();
    let emisor = '';
    try { const e = await emisorDe(prescriptorId); emisor = firmaDe(e); } catch { /* sin firma */ }
    return filaParaApp(fila, {
        idOportunidad: ops.get(fila.oportunidad_id) || null,
        resumen: L.resumenObra(fila.obra || {}),
        mensaje: L.mensajeParaCliente({ cliente: fila.cliente, obra: fila.obra, total: fila.total, emisor }),
    });
}

// ── El PDF ───────────────────────────────────────────────────────────────────

/** Nombre del fichero: «Presupuesto 40-26 - Antonio González Carretero.pdf». */
function nombreFichero(fila) {
    const n = limpio(fila?.numero).replace(/[\\/:*?"<>|]+/g, '-');
    const c = nombrePropio(fila?.cliente?.nombre || '').replace(/[\\/:*?"<>|]+/g, '');
    return `Presupuesto ${n}${c ? ` - ${c}` : ''}.pdf`;
}

/** La dirección de la obra, solo si NO es la del cliente (si es la misma, ya va en su caja). */
function direccionObraAparte(fila) {
    const o = fila?.obra || {};
    const c = fila?.cliente || {};
    if (!limpio(o.direccion)) return null;
    const igual = sinTildes(o.direccion) === sinTildes(c.direccion) && (!limpio(o.municipio) || sinTildes(o.municipio) === sinTildes(c.municipio));
    if (igual) return null;
    const pueblo = [limpio(o.codigo_postal), nombrePropio(o.municipio)].filter(Boolean).join(' ');
    return [limpio(o.direccion).toUpperCase(), pueblo.toUpperCase()].filter(Boolean).join(', ');
}

/** Lo impreso que no son cuentas: el cliente, la obra, las notas y la validez. */
function datosImpresos(fila) {
    const c = fila?.cliente || {};
    const postal = [limpio(c.codigo_postal), nombrePropio(c.municipio), limpio(c.provincia) ? `(${nombrePropio(c.provincia)})` : ''].filter(Boolean).join(' ');
    return {
        clienteNombre: nombrePropio(c.nombre || '') || 'Cliente',
        clienteDomicilio: [limpio(c.direccion), postal, c.nif ? `NIF: ${c.nif}` : ''].filter(Boolean),
        direccionObra: direccionObraAparte(fila),
        notas: fila?.notas || '',
        validezDias: fila?.validez_dias || null,
    };
}

/**
 * El PDF de un presupuesto (fila guardada o borrador con la misma forma). Con su
 * plantilla y su sección `presupuesto`, en su fondo de presupuesto; si no, en la
 * hoja GENÉRICA. Nunca falla por no tener plantilla.
 * @returns {Promise<{ buffer: Buffer, desborda: boolean, numeroLargo: boolean }>}
 */
async function pdfDe(prescriptorId, presu) {
    const fis = require('./facturaInstaladorService');
    const plantilla = await plantillaDe(prescriptorId);
    const calculo = {
        numero: limpio(presu?.numero) || '—',
        fechaTxt: fis.fechaTexto(String(presu?.fecha || '').slice(0, 10), plantilla?.cfg?.fecha?.formato || 'largo'),
        lineas: (Array.isArray(presu?.lineas) ? presu.lineas : []).map(l => ({ texto: limpio(l.texto), cantidad: l.cantidad, precio: l.precio, importe: Number(l.importe) || 0 })),
        base: Number(presu?.base) || 0, iva: Number(presu?.iva) || 0, total: Number(presu?.total) || 0, ivaPct: Number(presu?.iva_pct ?? 21),
    };
    const datos = datosImpresos(presu);
    if (conPlantillaDePresupuesto(plantilla)) {
        try { return await fis.componerPdf(plantilla, datos, calculo, { tipo: 'presupuesto' }); }
        catch (e) { console.warn('[presupuesto-instalador] su plantilla falló, va la genérica:', e.message); }
    }
    const emisor = await emisorDe(prescriptorId);
    return hojaGenerica({ emisor, datos, calculo });
}

// La hoja GENÉRICA (el instalador sin plantilla): A4, Helvetica estándar. Helvetica
// va en WinAnsi: lo que no se puede escribir (emojis, comillas raras) se cambia
// antes, o pdf-lib se niega a escribir el documento entero.
const WINANSI = /[^ -~ -ÿ€‘’“”–—…•]/g;
const seguro = (t) => String(t ?? '').normalize('NFC').replace(/[‐-‒]/g, '-').replace(WINANSI, '');

/**
 * Compone la hoja genérica. Una página: si lo escrito no cabe, `desborda: true`
 * (la app pide acortar, como con la factura).
 */
async function hojaGenerica({ emisor, datos, calculo }) {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const fis = require('./facturaInstaladorService');
    const pdf = await PDFDocument.create();
    const pg = pdf.addPage([595.28, 841.89]);
    const fR = await pdf.embedFont(StandardFonts.Helvetica);
    const fB = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = pg.getWidth();
    const H = pg.getHeight();
    const M = 48;                                   // margen
    const TINTA = rgb(0.08, 0.07, 0.07);
    const GRIS = rgb(0.42, 0.42, 0.45);
    const LINEA = rgb(0.85, 0.84, 0.82);
    const FONDO = rgb(0.965, 0.96, 0.95);
    const ACENTO = rgb(0.93, 0.42, 0.13);           // un filete naranja, nada más

    const ancho = (t, s, b) => (b ? fB : fR).widthOfTextAtSize(seguro(t), s);
    // `y` medida desde ARRIBA (como en el visor) y en la línea base.
    const txt = (x, y, t, { size = 10, bold = false, col = TINTA, align = 'l' } = {}) => {
        const s = seguro(t); if (!s) return;
        const w = ancho(s, size, bold);
        pg.drawText(s, { x: align === 'r' ? x - w : align === 'c' ? x - w / 2 : x, y: H - y, size, font: bold ? fB : fR, color: col });
    };
    const partir = (t, lim, size, bold = false) => {
        const out = []; let l = '';
        for (const w of seguro(t).split(/\s+/).filter(Boolean)) {
            const c = l ? `${l} ${w}` : w;
            if (l && ancho(c, size, bold) > lim) { out.push(l); l = w; } else l = c;
            // Una palabra que sola no cabe (una referencia larga) se corta a trozos.
            while (ancho(l, size, bold) > lim && l.length > 1) {
                let k = l.length - 1; while (k > 1 && ancho(l.slice(0, k), size, bold) > lim) k--;
                out.push(l.slice(0, k)); l = l.slice(k);
            }
        }
        return l ? [...out, l] : out;
    };
    const caja = (x, yTop, w, h, color) => pg.drawRectangle({ x, y: H - yTop - h, width: w, height: h, color });
    const raya = (x1, y, x2, col = LINEA, grosor = 0.7) => pg.drawLine({ start: { x: x1, y: H - y }, end: { x: x2, y: H - y }, thickness: grosor, color: col });

    // ── Cabecera: el instalador a la izquierda, PRESUPUESTO a la derecha
    caja(0, 0, W, 5, ACENTO);
    const razon = limpio(emisor?.razon_social || emisor?.acronimo || '');
    let y = 64;
    for (const l of partir(razon.toUpperCase(), 290, 15, true).slice(0, 2)) { txt(M, y, l, { size: 15, bold: true }); y += 18; }
    const postalE = [limpio(emisor?.codigo_postal), nombrePropio(emisor?.municipio), limpio(emisor?.provincia) ? `(${nombrePropio(emisor.provincia)})` : ''].filter(Boolean).join(' ');
    const tel = limpio(emisor?.tlf || emisor?.tlf_responsable);
    for (const l of [emisor?.cif ? `CIF: ${limpio(emisor.cif)}` : '', limpio(emisor?.direccion), postalE,
        [tel ? `Tel. ${tel}` : '', limpio(emisor?.email).toLowerCase()].filter(Boolean).join('  ·  ')].filter(Boolean)) {
        for (const p of partir(l, 290, 9)) { txt(M, y, p, { size: 9, col: GRIS }); y += 12; }
    }
    const yCab = Math.max(y, 120);

    const X2 = W - M;
    txt(X2, 70, 'PRESUPUESTO', { size: 24, bold: true, align: 'r' });
    // El nº: si no cabe en su sitio, se encoge; si ni así, `numeroLargo`.
    const etiqueta = 'Nº ';
    let sN = 12;
    const hueco = 200;
    while (sN > 7 && ancho(etiqueta + calculo.numero, sN, true) > hueco) sN -= 0.5;
    const numeroLargo = ancho(etiqueta + calculo.numero, sN, true) > hueco;
    txt(X2, 92, `${etiqueta}${calculo.numero}`, { size: sN, bold: true, align: 'r' });
    if (calculo.fechaTxt) txt(X2, 108, `Fecha: ${calculo.fechaTxt}`, { size: 10, col: GRIS, align: 'r' });

    y = yCab + 8;
    raya(M, y, X2, LINEA, 0.8);
    y += 16;

    // ── El cliente, en su caja
    const lineasCli = [...partir(datos.clienteNombre, 440, 11.5, true).map(t => ({ t, b: true, s: 11.5 })),
        ...datos.clienteDomicilio.flatMap(l => partir(l, 440, 10).map(t => ({ t, b: false, s: 10 })))];
    const altoCli = 24 + lineasCli.length * 14 + 6;
    caja(M, y, X2 - M, altoCli, FONDO);
    txt(M + 14, y + 17, 'CLIENTE', { size: 8, bold: true, col: GRIS });
    let yc = y + 33;
    for (const l of lineasCli) { txt(M + 14, yc, l.t, { size: l.s, bold: l.b }); yc += 14; }
    y += altoCli + 14;
    if (datos.direccionObra) {
        txt(M, y + 4, 'DIRECCIÓN DE LA OBRA', { size: 8, bold: true, col: GRIS });
        y += 16;
        for (const l of partir(datos.direccionObra, X2 - M, 10)) { txt(M, y, l, { size: 10 }); y += 13; }
        y += 8;
    }

    // ── La tabla: CANTIDAD · CONCEPTO · PRECIO · IMPORTE, el texto partido por su ancho real
    // El concepto acaba 20 pt antes de donde empieza un precio de 6 cifras («199.999,00 €»).
    const C = { cant: M + 30, concX: M + 66, concW: 265, precio: X2 - 92, importe: X2 - 8 };
    caja(M, y, X2 - M, 22, TINTA);
    const blanco = rgb(1, 1, 1);
    txt(C.cant, y + 14.5, 'CANTIDAD', { size: 8, bold: true, col: blanco, align: 'c' });
    txt(C.concX, y + 14.5, 'CONCEPTO', { size: 8, bold: true, col: blanco });
    txt(C.precio, y + 14.5, 'PRECIO', { size: 8, bold: true, col: blanco, align: 'r' });
    txt(C.importe, y + 14.5, 'IMPORTE', { size: 8, bold: true, col: blanco, align: 'r' });
    y += 22;
    const LIMITE = H - 170;                         // por debajo empiezan los totales
    const SZ = 9.5, PITCH = 13;
    let ultimo = y;
    for (const l of calculo.lineas) {
        const trozos = partir(l.texto, C.concW, SZ);
        const yIni = y + 15;
        if (l.importe > 0) {
            const cnt = Number.isInteger(Number(l.cantidad)) ? String(Number(l.cantidad)) : String(r2(l.cantidad)).replace('.', ',');
            txt(C.cant, yIni, cnt, { size: SZ, align: 'c' });
            txt(C.precio, yIni, fis.eur(l.precio), { size: SZ, align: 'r' });
            txt(C.importe, yIni, fis.eur(l.importe), { size: SZ, bold: true, align: 'r' });
        }
        trozos.forEach((t, i) => txt(C.concX, yIni + i * PITCH, t, { size: SZ }));
        y = yIni + (trozos.length - 1) * PITCH + 9;
        ultimo = y;
        raya(M, y, X2);
    }

    // ── Notas y validez
    const pie = [
        ...String(datos.notas || '').split(/\r?\n+/).map(s => limpio(s)).filter(Boolean),
        Number(datos.validezDias) > 0 ? `Validez del presupuesto: ${Math.round(Number(datos.validezDias))} días.` : null,
    ].filter(Boolean);
    if (pie.length) {
        y += 18;
        txt(M, y, 'NOTAS', { size: 8, bold: true, col: GRIS });
        y += 14;
        for (const p of pie) { for (const t of partir(p, X2 - M, 9.5)) { txt(M, y, t, { size: 9.5 }); ultimo = y; y += 13; } y += 2; }
    }
    const desborda = ultimo > LIMITE;

    // ── Totales: Importe · IVA · TOTAL, abajo a la derecha
    const yT = H - 140;
    const xT = X2 - 230;
    raya(xT, yT, X2, LINEA, 0.8);
    txt(xT, yT + 20, 'Importe', { size: 10, col: GRIS });
    txt(X2, yT + 20, fis.eur(calculo.base), { size: 10, align: 'r' });
    const pct = String(r2(calculo.ivaPct)).replace('.', ',');
    txt(xT, yT + 38, `IVA ${pct} %`, { size: 10, col: GRIS });
    txt(X2, yT + 38, fis.eur(calculo.iva), { size: 10, align: 'r' });
    caja(xT, yT + 50, 230, 30, TINTA);
    txt(xT + 12, yT + 70, 'TOTAL PRESUPUESTO', { size: 10, bold: true, col: blanco });
    txt(X2 - 12, yT + 70.5, fis.eur(calculo.total), { size: 13, bold: true, col: blanco, align: 'r' });
    caja(0, H - 5, W, 5, ACENTO);

    pdf.setTitle(seguro(`Presupuesto ${calculo.numero}`));
    pdf.setAuthor(seguro(razon));
    pdf.setProducer('BROKERGY');
    return { buffer: Buffer.from(await pdf.save()), desborda, numeroLargo };
}

/**
 * La VISTA PREVIA: el PDF de lo que se está tecleando, sin guardar ni gastar nº ni
 * dar de alta al cliente (vale uno a medio teclear; uno elegido tiene que ser SUYO).
 * @returns {Promise<{ buffer, desborda, numeroLargo, errores }>}
 */
async function vistaPrevia({ prescriptorId, entrada }) {
    if (!prescriptorId) throw fallo('Tu cuenta no tiene empresa.', 403, { code: 'SIN_EMPRESA' });
    const { errores, fila } = await calcularEntrada(entrada, { borrador: true });
    if (!fila.lineas.length) throw fallo(errores[0] || 'Escribe al menos una línea.', 400, { code: 'NO_VALIDO', errores });
    let cliente;
    if (entrada?.cliente_id) cliente = fotoCliente(await clienteSuyo(prescriptorId, entrada.cliente_id));
    else {
        const t = clienteDeEntrada(entrada?.cliente);
        cliente = fotoCliente({ nombre_razon_social: t.nombre, apellidos: t.apellidos, dni: t.dni, direccion: t.direccion, codigo_postal: t.codigo_postal, municipio: t.municipio, provincia: t.provincia, tlf: t.tlf });
    }
    const r = await pdfDe(prescriptorId, { ...fila, numero: fila.numero || 'BORRADOR', cliente });
    return { ...r, errores };
}

// ── Mandárselo a él por WhatsApp ─────────────────────────────────────────────

/**
 * Le manda el PDF a SU teléfono (el de su ficha: el del usuario que lo pide o, si no,
 * el del responsable o la empresa; nunca uno que venga de la petición), con el
 * mensaje para su cliente en el pie del documento —reenviando el documento, el pie
 * va con él— y una burbuja corta después. El ACK lo vigila `sendMedia` (regla 39).
 * @returns {Promise<{ ok: true, a: string }>}
 */
async function enviarAlInstaladorPorWhatsapp({ prescriptorId, usuario, id }) {
    const fila = await obtener(prescriptorId, id);
    if (fila.estado === 'ANULADO') throw fallo('Este presupuesto está anulado.', 409, { code: 'ANULADO' });
    const emisor = await emisorDe(prescriptorId);
    let tlf = null;
    if (usuario?.id_usuario) {
        const u = ok(await supabase.from('usuarios').select('tlf').eq('id_usuario', usuario.id_usuario).maybeSingle());
        tlf = limpio(u?.tlf) || null;
    }
    tlf = tlf || limpio(emisor.tlf_responsable) || limpio(emisor.tlf) || null;
    if (!tlf || nueve(tlf).length < 9) throw fallo('No tenemos tu móvil en la ficha. Escríbenos y lo apuntamos.', 409, { code: 'SIN_TELEFONO' });

    const wa = require('./whatsappService');
    const listo = wa._config?.enabled !== false && (typeof wa.isReady !== 'function' || wa.isReady());
    if (!listo) throw fallo('Ahora mismo no podemos mandar WhatsApp. Descárgalo y envíaselo tú.', 409, { code: 'WHATSAPP_NO_DISPONIBLE' });

    const L = await logica();
    const { buffer } = await pdfDe(prescriptorId, fila);
    const mensaje = L.mensajeParaCliente({ cliente: fila.cliente, obra: fila.obra, total: fila.total, emisor: nombrePropio(emisor.razon_social || emisor.acronimo || '') });
    try {
        await wa.sendMedia(tlf, { base64: buffer.toString('base64'), mimetype: 'application/pdf', filename: nombreFichero(fila) }, {
            caption: mensaje, splitCaption: false, asDocument: true,
            textoDespues: 'Reenvíaselo tal cual a tu cliente.', linkPreview: false,
        });
    } catch (e) {
        if (/no listo|deshabilitado/i.test(e.message)) throw fallo('Ahora mismo no podemos mandar WhatsApp. Descárgalo y envíaselo tú.', 409, { code: 'WHATSAPP_NO_DISPONIBLE' });
        throw fallo('No hemos podido mandarte el WhatsApp. Vuelve a intentarlo o descárgalo.', 502, { code: 'WHATSAPP_FALLO', causa: e.message });
    }
    return { ok: true, a: enmascarar(tlf) };
}

// ── Ligarlo a SU oportunidad ─────────────────────────────────────────────────

/**
 * Liga el presupuesto a SU oportunidad: `oportunidad_id`, el PDF a su apartado
 * «El presupuesto del instalador» (DOC_PRESUPUESTO, por `subirFicherosASlot`, como
 * la factura) y una nota en su historial para que BROKERGY lo identifique.
 * NO toca `inputs.presupuesto` (eso recalcula la propuesta: lo hace el equipo).
 * Idempotente: ya ligado a ESA oportunidad y con su fichero, no hace nada.
 * `escribir: false` = en seco (para el script): no escribe y dice lo que haría.
 */
async function vincularOportunidad({ prescriptorId, usuarioId = null, id, obra, fila = null, escribir = true }) {
    const p = fila || await obtener(prescriptorId, id);
    if (p.estado === 'ANULADO') throw fallo('Este presupuesto está anulado.', 409, { code: 'ANULADO' });
    const o = await oportunidadSuya({ prescriptorId, usuarioId, obra });
    if (!o) throw fallo('Obra no encontrada.', 404);
    const { op } = o;
    if (String(p.oportunidad_id || '') === String(op.id) && p.obra?.vinculo?.driveId) return p;
    if (p.oportunidad_id && String(p.oportunidad_id) !== String(op.id)) {
        throw fallo('Este presupuesto ya está ligado a otra obra.', 409, { code: 'YA_LIGADO' });
    }
    const emisor = await emisorDe(prescriptorId);
    const fis = require('./facturaInstaladorService');
    const fileName = `PRESUPUESTO ${limpio(p.numero).replace(/[\\/:*?"<>|]+/g, '-')} - ${limpio(emisor.acronimo || emisor.razon_social).toUpperCase()}.pdf`;
    const nota = `📄 Presupuesto ${p.numero} de ${limpio(emisor.razon_social || emisor.acronimo).toUpperCase()} hecho en la app: ${fis.eur(p.base)} + IVA = ${fis.eur(p.total)}`;
    if (!escribir) return { enSeco: true, oportunidad: op.id_oportunidad, fileName, nota };

    // 1) El PDF a su apartado (si ya hay uno con ese nombre, no se duplica).
    const reformaUploadService = require('./reformaUploadService');
    const opp = ok(await supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo').eq('id', op.id).maybeSingle());
    if (!opp) throw fallo('Obra no encontrada.', 404);
    const ya = (Array.isArray(opp.datos_calculo?.reforma_uploads?.DOC_PRESUPUESTO) ? opp.datos_calculo.reforma_uploads.DOC_PRESUPUESTO : [])
        .find(it => it?.name === fileName && it?.driveId);
    let vinculo = ya ? { driveId: ya.driveId, nombre: fileName, at: new Date().toISOString() } : null;
    if (!vinculo) {
        const checklist = await reformaUploadService.checklistForOportunidad(opp);
        const slotDef = checklist.find(s => s.key === 'DOC_PRESUPUESTO');
        if (slotDef) {
            const { buffer } = await pdfDe(prescriptorId, p);
            const { subidas, fallidas } = await reformaUploadService.subirFicherosASlot({
                oportunidadUuid: op.id, datosCalculo: opp.datos_calculo || {}, slotDef,
                archivos: [{ buffer, mimetype: 'application/pdf', originalname: fileName }], subidoPor: 'instalador',
            });
            if (!subidas[0]) throw fallo(fallidas[0]?.error || 'No hemos podido guardar el presupuesto en la obra.', 502);
            vinculo = { driveId: subidas[0].driveId, nombre: fileName, at: new Date().toISOString() };
        } else console.warn(`[presupuesto-instalador] ${op.id_oportunidad} no tiene el apartado DOC_PRESUPUESTO: se liga sin fichero`);
    }

    // 1.b) Y como «PRESUPUESTO DE LA INSTALACIÓN.pdf» en «0. PRESUPUESTO», que es donde lo
    // buscan la acción «Tu presupuesto» de la obra y los anexos de la propuesta: sin esto
    // la obra seguía diciendo «Aún no tenemos tu presupuesto» con uno hecho en la app.
    // SOLO si ahí no hay ninguno: el que subió él (o leyó el equipo) no se pisa ni pasa a _old.
    // Que falle no impide ligarlo (la carpeta la crea la primera subida al apartado).
    if (vinculo && !p.obra?.vinculo?.anexoId) {
        try {
            const driveService = require('./driveService');
            const { data: car } = await supabase.from('oportunidades')
                .select('drive_folder_id:datos_calculo->>drive_folder_id').eq('id', op.id).maybeSingle();
            if (car?.drive_folder_id) {
                const ANEXO = 'PRESUPUESTO DE LA INSTALACIÓN.pdf';
                const sub = await driveService.getOrCreateSubfolder(car.drive_folder_id, '0. PRESUPUESTO');
                if (sub && !(await driveService.findFileByName(sub, ANEXO))) {
                    const { buffer } = await pdfDe(prescriptorId, p);
                    const f = await driveService.saveFileToFolder(sub, ANEXO, 'application/pdf', buffer);
                    if (f?.id) vinculo.anexoId = f.id;
                }
            }
        } catch (e) { console.warn('[presupuesto-instalador] anexo de la propuesta:', e.message); }
    }

    // 2) La fila.
    const hecha = ok(await supabase.from(TABLA).update({
        oportunidad_id: op.id, obra: { ...(p.obra || {}), ...(vinculo ? { vinculo } : {}) }, updated_at: new Date().toISOString(),
    }).eq('id', p.id).eq('prescriptor_id', prescriptorId).select('*').maybeSingle()) || p;

    // 3) La nota en el historial, solo la PRIMERA vez que se liga. Vive dentro de
    // `datos_calculo` y no tiene RPC: se relee justo antes de escribir (el patrón de
    // `anotarHistorial` de routes/oportunidades.js).
    if (String(p.oportunidad_id || '') !== String(op.id)) {
        try {
            const { data } = await supabase.from('oportunidades').select('datos_calculo').eq('id', op.id).maybeSingle();
            const dc = data?.datos_calculo || {};
            const hist = Array.isArray(dc.historial) ? dc.historial : [];
            hist.push({ id: `${Date.now()}_presu_inst`, tipo: 'comentario', texto: nota, fecha: new Date().toISOString(), usuario: limpio(emisor.acronimo || emisor.razon_social) || 'INSTALADOR' });
            const { error } = await supabase.from('oportunidades').update({ datos_calculo: { ...dc, historial: hist } }).eq('id', op.id);
            if (error) console.warn('[presupuesto-instalador] historial:', error.message);
        } catch (e) { console.warn('[presupuesto-instalador] historial:', e.message); }
        try {
            require('./uploadNotifier').registrarSubida({ oportunidadUuid: op.id, slotKey: 'DOC_PRESUPUESTO', slotLabel: `Presupuesto ${p.numero} (hecho en la app)`, fase: null, subidoPor: 'instalador' });
        } catch (e) { console.warn('[presupuesto-instalador] aviso:', e.message); }
    }
    return hecha;
}

/** El presupuesto hecho en la app ligado a una obra (para «Todo lo de esta obra»). Solo escalares. */
async function ligadoAObra(prescriptorId, oportunidadUuid) {
    const d = ok(await supabase.from(TABLA).select('numero, total, created_at').eq('prescriptor_id', prescriptorId)
        .eq('oportunidad_id', oportunidadUuid).neq('estado', 'ANULADO').order('created_at', { ascending: false }).limit(1)) || [];
    return d[0] ? { numero: d[0].numero, total: Number(d[0].total) } : null;
}

module.exports = {
    opcionesNuevo, resolverCliente, pdfDe, vistaPrevia, crear, actualizar, anular, obtener, listar,
    enviarAlInstaladorPorWhatsapp, vincularOportunidad, entradaDesdeFila, filaParaApp, paraApp,
    nombreFichero, ligadoAObra, numeroSugerido, hojaGenerica,
    _internos: { calcularEntrada, obraDeEntrada, datosImpresos, direccionObraAparte, seguro, oportunidadSuya, fotoCliente },
};
