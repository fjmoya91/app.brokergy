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
 * Modelos del catálogo a los que les falta alguna POTENCIA necesaria para este
 * expediente. Devuelve [] si no falta nada.
 *
 * TODAS las potencias del RITE son datos del MODELO, no del expediente, y todas
 * salen de la ficha técnica del fabricante: térmica (calefacción o ACS),
 * frigorífica y absorbida por los compresores. Por eso se piden igual —en el
 * popup previo a generar, con enlace a la ficha— y se guardan igual —en el
 * catálogo, una sola vez por equipo—. Antes solo se pedían así las del frío y
 * las térmicas se listaban como "dato faltante", que no era accionable: el
 * usuario veía el aviso pero no tenía dónde escribir el valor.
 *
 * Qué se exige de cada bloque:
 *   · calefacción → potencia térmica siempre; frigorífica y compresores solo si
 *     el emisor da frío (suelo radiante, splits, conductos).
 *   · ACS → potencia térmica solo si es un equipo propio (modelo distinto al de
 *     calefacción y no un termo eléctrico).
 */
async function potenciasCatalogoPendientes(instalacion, supabase) {
    const inst = instalacion || {};
    const cal = inst.aerotermia_cal || {};
    const acs = inst.aerotermia_acs || {};
    const conFrio = emisorLlevaFrio(inst.tipo_emisor);

    // Qué campos hace falta conocer de los modelos de cada bloque.
    const necesidades = new Map();   // id modelo → { bloque, campos:Set }
    const anotar = (aero, bloque, campos) => {
        for (const u of getUnidades(aero)) {
            if (!u || !u.aerotermia_db_id) continue;   // escrito a mano: sin ficha que completar
            const prev = necesidades.get(u.aerotermia_db_id) || { bloque, campos: new Set() };
            campos.forEach(c => prev.campos.add(c));
            necesidades.set(u.aerotermia_db_id, prev);
        }
    };
    // Con frío se declara además el refrigerante, que es texto (R32, R290…).
    anotar(cal, 'calefaccion', conFrio
        ? ['potencia_calefaccion', 'potencia_frigorifica', 'potencia_compresores', 'refrigerante']
        : ['potencia_calefaccion']);
    if (acsEsEquipoPropio(inst)) anotar(acs, 'acs', ['potencia_calefaccion']);

    if (!necesidades.size) return [];
    const { data } = await supabase
        .from('aerotermia')
        .select('id, marca, modelo_comercial, modelo_ud_exterior, potencia_calefaccion, potencia_frigorifica, potencia_compresores, refrigerante, ficha_tecnica, eprel')
        .in('id', [...necesidades.keys()]);

    const pendientes = [];
    for (const m of (data || [])) {
        const need = necesidades.get(m.id) || necesidades.get(Number(m.id));
        if (!need) continue;
        // El refrigerante es texto; el resto, números que deben ser > 0.
        const faltan = [...need.campos].filter(c => c === 'refrigerante'
            ? !isPresent(m.refrigerante)
            : !(parseFloat(m[c]) > 0));
        if (faltan.length) pendientes.push({ ...m, bloque: need.bloque, faltan });
    }
    return pendientes;
}

/** Opciones de "SITUADO EN" del generador de frío (casilla del RITE). */
const SITUADO_EN_OPCIONES = ['CUBIERTA', 'FACHADA', 'SUELO'];

/**
 * ¿Hay que preguntar dónde está situado el generador de frío? Solo si la
 * instalación da frío y aún no se ha elegido. Se guarda por EXPEDIENTE
 * (documentacion.frio_situado_en), no en el catálogo: depende de la obra.
 */
function situadoEnPendiente(exp) {
    const inst = exp.instalacion || {};
    if (!emisorLlevaFrio(inst.tipo_emisor)) return false;
    return !isPresent((exp.documentacion || {}).frio_situado_en);
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
        .from('aerotermia')
        .select('id, potencia_calefaccion, potencia_frigorifica, potencia_compresores, refrigerante, seer, tipo')
        .in('id', ids);
    if (!modelos || !modelos.length) return inst;

    const porId = new Map(modelos.map(m => [String(m.id), m]));
    for (const u of unidades) {
        const m = porId.get(String(u.aerotermia_db_id));
        if (!m) continue;
        const cal = parseFloat(m.potencia_calefaccion);
        if (cal > 0 && !(parseFloat(u.potencia) > 0)) u.potencia = cal;
        // Datos del GENERADOR DE FRÍO: siempre del catálogo (no se guardan en el
        // expediente). `tipo_catalogo` decide compacto (monoblock) vs partido.
        const frio = parseFloat(m.potencia_frigorifica);
        if (frio > 0) u.potencia_frio = frio;
        const compresores = parseFloat(m.potencia_compresores);
        if (compresores > 0) u.potencia_compresores = compresores;
        if (parseFloat(m.seer) > 0) u.seer = parseFloat(m.seer);
        if (m.tipo) u.tipo_catalogo = m.tipo;
        if (m.refrigerante) u.refrigerante = m.refrigerante;
    }
    return inst;
}

/**
 * Lista de campos que faltan para generar la Memoria RITE. Vacía = se puede generar.
 *
 * `pres` es SIEMPRE la ficha que firma (ya resuelta por `resolveInstaladorFirmante`);
 * `presReal` es el instalador asignado al expediente. Coinciden salvo delegación.
 */
function validateMemoriaRite({ exp, cli, op, pres, presReal }) {
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
    // La POTENCIA no se lista aquí: es un dato del MODELO y la pide el popup
    // previo a generar (`potenciasCatalogoPendientes`), que además la guarda en el
    // catálogo. Listarla como "falta" no era accionable — no hay dónde escribirla.

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
        // Igual que en calefacción: la potencia del equipo de ACS la pide el popup.
    }

    // ── Emisor ───────────────────────────────────────────────────────────────
    if (!P(inst.tipo_emisor)) missing.push('Tipo de Emisor (Instalación)');

    // La POTENCIA FRIGORÍFICA no se lista aquí: cuando el emisor da frío y el
    // modelo no la tiene, al generar salta un popup dedicado que la pide y la
    // guarda en el catálogo (ver `potenciasCatalogoPendientes`). Mismo criterio que la
    // fecha de pruebas: lo que tiene popup propio no se repite como "falta".

    // ── Instalador ───────────────────────────────────────────────────────────
    // Se valida a QUIEN FIRMA de verdad: si la ficha del partner marca "técnico
    // firmante distinto", firma el TÉCNICO habilitado con su nombre/DNI/carné y el
    // representante legal no interviene en el documento.
    if (!pres) {
        missing.push('Instalador asignado (Instalación)');
    } else {
        // Un instalador no habilitado en Industria no puede constar como empresa
        // instaladora: tiene que delegar la firma en uno habilitado. Si la ficha no
        // lo tiene asignado (o el asignado tampoco está habilitado), el documento
        // saldría a nombre de quien no puede firmarlo.
        if (!pres.tiene_carnet_rite) {
            const quien = (presReal && presReal.id_empresa !== pres.id_empresa)
                ? `"${pres.razon_social || 'el instalador firmante'}"`
                : `"${pres.razon_social || 'el instalador asignado'}"`;
            missing.push(`Instalador habilitado que firma — ${quien} no está habilitado en Industria (asígnale uno en su ficha de la Red de Prescriptores)`);
        }
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
    potenciasCatalogoPendientes, situadoEnPendiente, SITUADO_EN_OPCIONES,
    acsEsEquipoPropio, resolvePotenciasCatalogo, validateMemoriaRite
};
