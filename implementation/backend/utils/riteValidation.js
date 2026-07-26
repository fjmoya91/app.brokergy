// ============================================================================
// riteValidation.js — BARRIDO de datos faltantes para la MEMORIA RITE.
//
// FUENTE ÚNICA de las reglas: la usan tanto POST /:id/memoria-rite/generate
// (defensa en profundidad, responde 422) como GET /:id/memoria-rite/check
// (el popup "DATOS FALTANTES" del frontend, que ya no reimplementa nada).
//
// Regla de oro: aquí solo se pide lo que el generador REALMENTE necesita. Cada
// falso positivo entrena al usuario a pulsar "GENERAR DE TODOS MODOS" y vacía
// de sentido el barrido. Los tres criterios que se espejan literalmente de
// rite-generator/lib/supabase_client.py son:
//   1. Cliente EMPRESA → el titular es la sociedad, no tiene apellidos.
//   2. Técnico firmante distinto → firma el TÉCNICO, no el representante legal.
//   3. El ACS solo aporta potencia/acumulación si es un equipo DISTINTO al de
//      calefacción y no un termo eléctrico.
// Si cambia una de esas reglas en el generador, cambia también aquí.
// ============================================================================

const {
    unidadesSinSerie, countUnidades, getUnidades, esTermoElectrico
} = require('./aerotermiaUnits');

/** ¿El valor está realmente relleno? 0 y false son valores válidos; '____' no. */
const isPresent = (val) => {
    if (val === 0 || val === false) return true;
    if (!val) return false;
    if (typeof val === 'string' && (val.trim() === '' || val.includes('_____') || val === '—')) return false;
    return true;
};

/**
 * Emisores que dan FRÍO: el suelo radiante refresca en verano y las unidades
 * aire-aire (splits / conductos) climatizan por definición. Con radiadores no hay
 * modo frío en la instalación aunque el equipo sea reversible → la casilla va a 0
 * y no se pide el dato.
 * ESPEJO de `_EMISORES_FRIO` en rite-generator/lib/supabase_client.py.
 */
const EMISORES_CON_FRIO = ['suelo_radiante', 'splits', 'conductos'];

function emisorLlevaFrio(tipoEmisor) {
    return EMISORES_CON_FRIO.includes(String(tipoEmisor || '').trim().toLowerCase());
}

/** Potencia frigorífica total (kW) del bloque, inyectada desde el catálogo. */
function potenciaFrioBloque(aero) {
    return getUnidades(aero)
        .map(u => parseFloat(u && u.potencia_frio) || 0)
        .reduce((a, b) => a + b, 0);
}

/**
 * Modelos del catálogo a los que les falta la POTENCIA FRIGORÍFICA y que hacen
 * falta para este expediente (emisor con frío). Devuelve [] si no aplica.
 *
 * Alimenta el popup que la pide al generar: se teclea una vez, se guarda en el
 * catálogo del modelo (PATCH /api/aerotermia/:id/potencia-frigorifica) y ya queda
 * para todos los expedientes futuros que usen ese equipo. Incluye `ficha_tecnica`
 * para poder abrirla y buscar el dato sin salir del flujo.
 */
async function potenciaFrioPendiente(instalacion, supabase) {
    const inst = instalacion || {};
    if (!emisorLlevaFrio(inst.tipo_emisor)) return [];
    const cal = inst.aerotermia_cal || {};
    if (potenciaFrioBloque(cal) > 0) return [];

    const ids = [...new Set(getUnidades(cal).map(u => u && u.aerotermia_db_id).filter(Boolean))];
    if (!ids.length) return [];   // equipo escrito a mano: no hay ficha que completar

    const { data } = await supabase
        .from('aerotermia')
        .select('id, marca, modelo_comercial, modelo_ud_exterior, potencia_calefaccion, potencia_frigorifica, ficha_tecnica, eprel')
        .in('id', ids);
    return (data || []).filter(m => !(parseFloat(m.potencia_frigorifica) > 0));
}

/**
 * Potencia total (kW) declarada en un bloque de aerotermia = suma de TODAS las
 * unidades en cascada. `resolvePotenciasCatalogo()` ya ha rellenado las que no
 * estaban guardadas en el expediente pero sí constan en el catálogo del modelo.
 */
function potenciaBloque(aero) {
    return getUnidades(aero)
        .map(u => parseFloat(u && u.potencia) || 0)
        .reduce((a, b) => a + b, 0);
}

/**
 * ¿El ACS es un equipo PROPIO que aporta potencia y acumulación al RITE?
 * Espeja `acs_distinto` del generador: solo si el modelo de ACS es distinto al
 * de calefacción y no es un termo eléctrico (efecto Joule, que no forma parte de
 * la instalación de aerotermia que documenta el RITE).
 */
function acsEsEquipoPropio(inst) {
    const cal = (inst && inst.aerotermia_cal) || {};
    const acs = (inst && inst.aerotermia_acs) || {};
    if (inst && inst.misma_aerotermia_acs) return false;
    if (esTermoElectrico(acs)) return false;
    const calMod = String(cal.modelo || '').trim().toUpperCase();
    const acsMod = String(acs.modelo || '').trim().toUpperCase();
    return !!acsMod && acsMod !== calMod;
}

/**
 * Rellena en memoria la `potencia` de las unidades que no la tienen guardada
 * pero sí consta en el catálogo de aerotermia (`aerotermia_db_id`).
 *
 * Por qué: la potencia solo se siembra al elegir el modelo en la app, así que
 * los expedientes migrados o rellenados por script llegan sin ella (y las
 * unidades en cascada, que se crean clonando la unidad 1, llegan con 0). El
 * modelo del catálogo es la fuente de verdad: el barrido no debe pedir a mano
 * un dato que ya se conoce, y el documento no debe salir con 0 kW.
 *
 * Devuelve una copia de `instalacion`; nunca escribe en BD.
 */
async function resolvePotenciasCatalogo(instalacion, supabase) {
    const inst = JSON.parse(JSON.stringify(instalacion || {}));
    const bloques = [inst.aerotermia_cal, inst.aerotermia_acs].filter(b => b && typeof b === 'object');

    // Todas las unidades que apuntan a un modelo del catálogo. La potencia de
    // CALEFACCIÓN solo se rellena si falta (el expediente puede llevar un valor
    // corregido a mano); la FRIGORÍFICA siempre viene del catálogo, porque no se
    // guarda en el expediente.
    const unidades = [];
    for (const bloque of bloques) {
        const extras = Array.isArray(bloque.equipos_extra) ? bloque.equipos_extra : [];
        for (const u of [bloque, ...extras]) if (u && u.aerotermia_db_id) unidades.push(u);
    }
    if (!unidades.length) return inst;

    const ids = [...new Set(unidades.map(u => u.aerotermia_db_id))];
    const { data: modelos } = await supabase
        .from('aerotermia').select('id, potencia_calefaccion, potencia_frigorifica').in('id', ids);
    if (!modelos || !modelos.length) return inst;

    const porId = new Map(modelos.map(m => [String(m.id), m]));
    for (const u of unidades) {
        const m = porId.get(String(u.aerotermia_db_id));
        if (!m) continue;
        const cal = parseFloat(m.potencia_calefaccion);
        if (cal > 0 && !(parseFloat(u.potencia) > 0)) u.potencia = cal;
        const frio = parseFloat(m.potencia_frigorifica);
        if (frio > 0) u.potencia_frio = frio;
    }
    return inst;
}

/** Lista de campos que faltan para generar la Memoria RITE. Vacía = se puede generar. */
function validateMemoriaRite({ exp, cli, op, pres }) {
    const missing = [];
    const inst = exp.instalacion || {};
    const doc = exp.documentacion || {};
    const inputs = (op && op.datos_calculo && op.datos_calculo.inputs) || {};
    const cal = inst.aerotermia_cal || {};
    const acs = inst.aerotermia_acs || {};
    const P = isPresent;

    // ── Titular ──────────────────────────────────────────────────────────────
    if (!P(exp.numero_expediente)) missing.push('Número de Expediente');
    if (!P(cli && cli.nombre_razon_social)) missing.push('Nombre / Razón Social Cliente');
    // Persona jurídica: el titular es la sociedad — `nombre_razon_social` ya es su
    // razón social completa y NO tiene apellidos.
    if (!(cli && cli.es_empresa) && !P(cli && cli.apellidos)) missing.push('Apellidos Cliente');
    if (!P(cli && (cli.dni || cli.dni_nie))) missing.push('DNI / NIE Cliente');
    if (!P(cli && cli.direccion)) missing.push('Dirección Cliente');
    if (!P(cli && cli.municipio)) missing.push('Municipio Cliente');
    if (!P(cli && cli.provincia)) missing.push('Provincia Cliente');
    if (!P(cli && cli.codigo_postal)) missing.push('Código Postal Cliente');

    // ── Ubicación / cálculo ──────────────────────────────────────────────────
    if (!P(inputs.superficie)) missing.push('Superficie (Cálculo / Toma de datos)');
    if (!P(inputs.zona)) missing.push('Zona Climática (Cálculo)');
    if (!P(inputs.plantas)) missing.push('Nº de Plantas (Cálculo)');
    if (!P(inst.ref_catastral || (op && op.ref_catastral) || inputs.rc)) missing.push('Referencia Catastral (Instalación)');

    // ── Equipo de calefacción ────────────────────────────────────────────────
    if (!P(cal.marca)) missing.push('Marca Aerotermia Calefacción (Instalación)');
    if (!P(cal.modelo)) missing.push('Modelo Aerotermia Calefacción (Instalación)');
    // En cascada, TODAS las unidades deben tener nº de serie: la memoria RITE los
    // concatena en una única casilla y ninguno puede faltar.
    for (const n of unidadesSinSerie(cal)) {
        missing.push(countUnidades(cal) > 1
            ? `Nº Serie Aerotermia Calefacción — equipo ${n} (Instalación)`
            : 'Nº Serie Aerotermia Calefacción (Instalación)');
    }
    // Potencia TOTAL del bloque (suma de la cascada), ya con el valor del catálogo.
    // 0 kW no vale como potencia declarada.
    // La potencia no se teclea en el expediente: la hereda del modelo. Si falta, se
    // arregla completando la ficha del modelo en el catálogo de aerotermia. Sin
    // modelo elegido no se avisa: ya se está pidiendo el modelo justo encima.
    if (P(cal.modelo) && !(potenciaBloque(cal) > 0)) {
        missing.push(`Potencia Aerotermia Calefacción — el modelo "${cal.modelo}" no tiene potencia en el catálogo de aerotermia`);
    }

    // ── Equipo de ACS ────────────────────────────────────────────────────────
    // Solo se valida si aporta potencia propia al RITE; si no, el documento ni
    // siquiera rellena esas casillas.
    const hasAcs = inst.cambio_acs === true || inst.cambio_acs === 'si';
    if (hasAcs && acsEsEquipoPropio(inst)) {
        if (!P(acs.marca)) missing.push('Marca Aerotermia ACS (Instalación)');
        if (!P(acs.modelo)) missing.push('Modelo Aerotermia ACS (Instalación)');
        for (const n of unidadesSinSerie(acs)) {
            missing.push(countUnidades(acs) > 1
                ? `Nº Serie Aerotermia ACS — equipo ${n} (Instalación)`
                : 'Nº Serie Aerotermia ACS (Instalación)');
        }
        if (P(acs.modelo) && !(potenciaBloque(acs) > 0)) {
            missing.push(`Potencia Aerotermia ACS — el modelo "${acs.modelo}" no tiene potencia en el catálogo de aerotermia`);
        }
    }

    // ── Emisor ───────────────────────────────────────────────────────────────
    if (!P(inst.tipo_emisor)) missing.push('Tipo de Emisor (Instalación)');

    // La POTENCIA FRIGORÍFICA no se lista aquí: cuando el emisor da frío y el
    // modelo no la tiene, al generar salta un popup dedicado que la pide y la
    // guarda en el catálogo (ver `potenciaFrioPendiente`). Mismo criterio que la
    // fecha de pruebas: lo que tiene popup propio no se repite como "falta".

    // ── Instalador ───────────────────────────────────────────────────────────
    // Se valida a QUIEN FIRMA de verdad: si la ficha del partner marca "técnico
    // firmante distinto", firma el TÉCNICO habilitado con su nombre/DNI/carné y el
    // representante legal no interviene en el documento.
    if (!pres) {
        missing.push('Instalador asignado (Instalación)');
    } else {
        if (!P(pres.razon_social)) missing.push('Razón Social Instalador (ficha Partner)');
        if (!P(pres.cif)) missing.push('CIF Instalador (ficha Partner)');
        if (pres.tecnico_firmante_distinto) {
            if (!P(pres.tecnico_firmante_nombre)) missing.push('Nombre Técnico Firmante (ficha Partner)');
            if (!P(pres.tecnico_firmante_apellidos)) missing.push('Apellidos Técnico Firmante (ficha Partner)');
            if (!P(pres.tecnico_firmante_dni)) missing.push('DNI Técnico Firmante (ficha Partner)');
        } else {
            if (!P(pres.nombre_responsable)) missing.push('Nombre Responsable Técnico (ficha Partner)');
            if (!P(pres.apellidos_responsable)) missing.push('Apellidos Responsable Técnico (ficha Partner)');
            if (!P(pres.nif_responsable || pres.tecnico_firmante_dni)) missing.push('NIF Responsable Técnico (ficha Partner)');
        }
        if (!P(pres.numero_carnet_rite)) missing.push('Nº Empresa RITE (ficha Partner)');
        if (!P(pres.municipio)) missing.push('Municipio Instalador (ficha Partner)');
    }

    // ── Fecha de pruebas ─────────────────────────────────────────────────────
    // Se toma de la factura; si no hay factura, vale la introducida a mano
    // (documentacion.fecha_pruebas_cert_instalacion).
    const tieneFechaFactura = Array.isArray(doc.facturas) && doc.facturas.length
        && P(doc.facturas[0] && doc.facturas[0].fecha_factura);
    if (!tieneFechaFactura && !P(doc.fecha_pruebas_cert_instalacion)) {
        missing.push('Fecha de Factura o Fecha de Pruebas (Documentación)');
    }

    return missing;
}

module.exports = {
    isPresent, potenciaBloque, potenciaFrioBloque, emisorLlevaFrio,
    potenciaFrioPendiente, acsEsEquipoPropio, resolvePotenciasCatalogo, validateMemoriaRite
};
