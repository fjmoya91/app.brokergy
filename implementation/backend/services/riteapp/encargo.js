// ─── riteapp/encargo.js — «hazme esta memoria» (BROKERGY → app RITE) ──────────
// Fran, 25/11/2026: «que yo te diga "haz esta memoria" y automáticamente seas
// capaz de hacerla y que ya aparezca en los documentos». Una sola llamada:
//
//   instalador (cuenta de la app, email, CIF o ficha de partner)
//   + referencia catastral (el Catastro pone dirección, superficie, plantas y zona)
//   + titular + equipo (del catálogo, por id o por texto) + fecha de pruebas
//   + estancias (rápido: propuesta por superficie; extendido: las que se den, con elementos)
//   → memoria creada en la cuenta del instalador y, si no falta nada, GENERADA y en
//     sus Documentos. Si falta algo, queda en BORRADOR y se devuelve qué falta.
//
// Lo de BROKERGY NO gasta créditos del instalador (como los encargos de la app
// de certificadores). Lo llaman `routes/riteappAdmin.js` (staffOClaveInterna: el
// CRM, el MCP `memoria_rite` y el asistente) y nada más.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../supabaseClient');
const M = require('./memorias');
const { resolveInstaladorFirmante } = require('../../utils/instaladorFirmante');

const norm = (s) => String(s || '').trim();

/** La ficha de partner que firma → los campos de firma de `riteapp_cuentas`. */
function camposDePrescriptor(p) {
    const rep = p.representante_distinto;
    return {
        empresa: p.razon_social || null, empresa_nif: (p.cif || '').toUpperCase() || null,
        es_autonomo: !!p.es_autonomo, numero_empresa_rite: p.numero_carnet_rite || null,
        municipio: p.municipio || null, provincia: p.provincia || null, direccion: p.direccion || null,
        codigo_postal: p.codigo_postal || null,
        representante_nombre: (rep ? p.representante_nombre : p.nombre_responsable) || null,
        representante_apellidos: (rep ? p.representante_apellidos : p.apellidos_responsable) || null,
        representante_nif: (rep ? p.representante_dni : (p.nif_responsable || p.tecnico_firmante_dni)) || null,
        representante_cargo: p.cargo || null,
        tecnico_firmante_distinto: !!p.tecnico_firmante_distinto,
        tecnico_firmante_nombre: p.tecnico_firmante_nombre || null,
        tecnico_firmante_apellidos: p.tecnico_firmante_apellidos || null,
        tecnico_firmante_dni: p.tecnico_firmante_dni || null,
        tecnico_firmante_carnet_rite: p.tecnico_firmante_carnet_rite || null,
        prescriptor_id: p.id_empresa,
    };
}

/**
 * La cuenta de la app del instalador. Por id, email o CIF; si no tiene cuenta pero
 * es PARTNER (prescriptor), se le crea una PENDIENTE con los datos de su ficha (la
 * de quien FIRMA de verdad, `resolveInstaladorFirmante`): cuando entre con ese
 * email, la encuentra con sus memorias dentro.
 */
async function resolverCuenta({ cuenta_id, email, cif, prescriptor_id } = {}) {
    const q = () => supabase.from('riteapp_cuentas').select('*');
    if (cuenta_id) return M.cuentaPorId(cuenta_id);
    if (email) {
        const { data, error } = await q().ilike('email', norm(email)).maybeSingle();
        if (error) throw M.errorBd(error, 'cuenta por email');
        if (data) return data;
    }
    if (cif) {
        const { data, error } = await q().eq('empresa_nif', norm(cif).toUpperCase()).limit(2);
        if (error) throw M.errorBd(error, 'cuenta por CIF');
        if (data?.length === 1) return data[0];
    }
    // ¿Es partner?
    let pq = supabase.from('prescriptores').select('*');
    if (prescriptor_id) pq = pq.eq('id_empresa', prescriptor_id);
    else if (cif) pq = pq.eq('cif', norm(cif).toUpperCase());
    else if (email) pq = pq.ilike('email', norm(email));
    else throw M.fallo(400, 'Dime de qué instalador es la memoria (su email, su CIF o su ficha).', 'FALTA_INSTALADOR');
    const { data: ps, error } = await pq.limit(3);
    if (error) throw M.errorBd(error, 'prescriptor');
    if (!ps?.length) throw M.fallo(404, 'Ese instalador no tiene cuenta en la app RITE ni ficha de partner. Dale de alta primero.', 'INSTALADOR_NO_ENCONTRADO');
    if (ps.length > 1) throw M.fallo(409, 'Hay varios instaladores con ese dato: dime cuál.', 'INSTALADOR_AMBIGUO', { opciones: ps.map(p => ({ prescriptor_id: p.id_empresa, razon_social: p.razon_social, cif: p.cif })) });
    const p = ps[0];
    const { data: ya } = await supabase.from('riteapp_cuentas').select('*').eq('prescriptor_id', p.id_empresa).maybeSingle();
    if (ya) return ya;
    const { firmante } = await resolveInstaladorFirmante(p, supabase);
    const mail = norm(p.email || email).toLowerCase();
    if (!mail) throw M.fallo(422, `La ficha de ${p.razon_social || 'ese instalador'} no tiene email: hace falta para su cuenta de la app.`, 'INSTALADOR_SIN_EMAIL');
    const fila = { email: mail, nombre: p.nombre_responsable || null, apellidos: p.apellidos_responsable || null,
        telefono: p.tlf || null, estado: 'PENDIENTE', creditos: 0, ...camposDePrescriptor(firmante || p) };
    fila.prescriptor_id = p.id_empresa;
    const { data: nueva, error: e2 } = await supabase.from('riteapp_cuentas').insert(fila).select('*').single();
    if (e2) throw M.errorBd(e2, 'crear cuenta del partner');
    return nueva;
}

/**
 * El equipo: por id del catálogo, por texto (si hay UN modelo que case) o a mano.
 * Devuelve `{ equipo, opciones }`: con varias coincidencias, `equipo` es null y
 * `opciones` la lista para preguntar.
 */
async function resolverEquipo(e = {}) {
    if (!e || (!e.aerotermia_id && !e.texto && !e.marca)) return { equipo: null, opciones: [] };
    if (e.aerotermia_id) {
        const [m] = (await M.buscarEquiposPorId([e.aerotermia_id]));
        if (!m) throw M.fallo(404, 'Ese equipo no está en el catálogo.', 'EQUIPO_NO_ENCONTRADO');
        return { equipo: { ...M.equipoDeCatalogo(m, e.numero_serie), ...(e.potencia ? { potencia: e.potencia } : {}) }, opciones: [] };
    }
    if (e.texto) {
        const lista = await M.buscarEquipos(e.texto);
        if (lista.length === 1) return { equipo: { ...M.equipoDeCatalogo(lista[0], e.numero_serie), ...(e.potencia ? { potencia: e.potencia } : {}) }, opciones: [] };
        if (lista.length > 1) return { equipo: null, opciones: lista.slice(0, 10) };
    }
    if (e.marca && e.modelo) return { equipo: { marca: e.marca, modelo: e.modelo, numero_serie: e.numero_serie || '', potencia: e.potencia || null }, opciones: [] };
    return { equipo: null, opciones: [] };
}

/**
 * «Hazme esta memoria». `generar: false` la deja preparada sin generar.
 * Devuelve `{ memoria, generada, faltan, avisos, opciones_equipo, documentos }`.
 */
async function hazMemoria(input = {}, { por = 'BROKERGY' } = {}) {
    const cuenta = await resolverCuenta(input.instalador || {});

    // La vivienda: el Catastro, y encima lo que se haya dicho a mano.
    let vivienda = {};
    if (input.ref_catastral) vivienda = await M.viviendaDelCatastro(input.ref_catastral);
    vivienda = { ...vivienda, ...(input.vivienda || {}) };

    const { equipo, opciones } = await resolverEquipo(input.equipo);
    const { equipo: equipoAcs } = await resolverEquipo(input.equipo_acs);

    const e = input.estancias || {};
    const estancias = await M.proponerEstancias({
        superficie: vivienda.superficie, plantas: vivienda.plantas,
        modo: e.modo === 'extendido' ? 'extendido' : 'rapido', w_elemento: e.w_elemento,
        porTipo: Array.isArray(e.plantas) && e.plantas.length ? e.plantas : null,
    });

    const datos = {
        titular: input.titular || {},
        vivienda,
        instalacion: {
            tipo_emisor: input.tipo_emisor || 'radiadores_convencionales',
            aerotermia_cal: equipo || {},
            aerotermia_acs: equipoAcs || {},
            cambio_acs: input.acs === true ? true : input.acs === false ? false : null,
            frio_situado_en: input.frio_situado_en || '',
        },
        fechas: { pruebas: input.fecha_pruebas || null, firma: input.fecha_firma || null },
        estancias,
    };
    let memoria = await M.crear(cuenta, datos, { por });
    return terminar(memoria, cuenta, { generar: input.generar !== false, opciones, por });
}

/** Completa una memoria YA creada (lo que faltaba) y la intenta generar. */
async function completar(memoriaId, cambios = {}, { por = 'BROKERGY', generar = true } = {}) {
    let memoria = await M.obtener(memoriaId);
    const cuenta = await M.cuentaPorId(memoria.cuenta_id);
    const d = memoria.datos || {};
    const nuevo = { ...d };
    if (cambios.titular) nuevo.titular = { ...d.titular, ...cambios.titular };
    if (cambios.ref_catastral && cambios.ref_catastral !== d.vivienda?.ref_catastral) nuevo.vivienda = await M.viviendaDelCatastro(cambios.ref_catastral);
    if (cambios.vivienda) nuevo.vivienda = { ...nuevo.vivienda, ...cambios.vivienda };
    let opciones = [];
    if (cambios.equipo) {
        const r = await resolverEquipo(cambios.equipo);
        opciones = r.opciones;
        if (r.equipo) nuevo.instalacion = { ...nuevo.instalacion, aerotermia_cal: r.equipo };
    }
    if (cambios.numero_serie) nuevo.instalacion = { ...nuevo.instalacion, aerotermia_cal: { ...(nuevo.instalacion?.aerotermia_cal || {}), numero_serie: cambios.numero_serie } };
    if (cambios.tipo_emisor) nuevo.instalacion = { ...nuevo.instalacion, tipo_emisor: cambios.tipo_emisor };
    if (cambios.fecha_pruebas) nuevo.fechas = { ...nuevo.fechas, pruebas: cambios.fecha_pruebas };
    if (cambios.estancias) {
        const e = cambios.estancias;
        nuevo.estancias = await M.proponerEstancias({
            superficie: nuevo.vivienda?.superficie, plantas: nuevo.vivienda?.plantas,
            modo: e.modo === 'extendido' ? 'extendido' : 'rapido', w_elemento: e.w_elemento,
            porTipo: Array.isArray(e.plantas) && e.plantas.length ? e.plantas : null,
        });
    } else if (cambios.ref_catastral || cambios.vivienda) {
        // La superficie ha cambiado: las estancias rápidas se vuelven a repartir.
        if ((nuevo.estancias?.modo || 'rapido') === 'rapido') {
            nuevo.estancias = await M.proponerEstancias({ superficie: nuevo.vivienda?.superficie, plantas: nuevo.vivienda?.plantas });
        }
    }
    memoria = await M.guardarDatos(memoria, nuevo);
    return terminar(memoria, cuenta, { generar, opciones, por });
}

async function terminar(memoria, cuenta, { generar, opciones, por }) {
    const r = await M.comprobar(memoria, cuenta);
    const base = { memoria: resumen(memoria), cuenta: { empresa: cuenta.empresa, email: cuenta.email, estado: cuenta.estado },
        faltan: r.faltan, avisos: r.avisos, tabla: r.tabla, opciones_equipo: opciones };
    if (!generar || r.faltan.length) return { ...base, generada: false };
    const g = await M.generar(memoria, cuenta, { origen: 'BROKERGY', por });
    const docs = await M.documentos(g.memoria);
    return { ...base, memoria: resumen(g.memoria), generada: true, avisos: g.avisos, documentos: docs.actuales };
}

const resumen = (m) => ({ id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, generada_at: m.generada_at, modo: m.datos?.estancias?.modo || 'rapido' });

module.exports = { hazMemoria, completar, resolverCuenta, resolverEquipo, camposDePrescriptor };
