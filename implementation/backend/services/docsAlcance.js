// ============================================================================
// docsAlcance — QUÉ documentación procede pedir en CADA expediente.
// ----------------------------------------------------------------------------
// El checklist documental (`reformaUploadService.buildDocChecklist`) se computa
// sobre `oportunidades.datos_calculo`, que es lo que se sabía el día de la
// SIMULACIÓN. Pero el alcance real de la actuación lo declara el EXPEDIENTE:
// la ficha (RES060/080/093/TER100), si se toca el ACS, qué unidad terminal hay,
// qué elementos de envolvente se rehabilitan y si el CEE inicial ya está
// registrado. Nada de eso llegaba a la vista del cliente: por eso el enlace
// seguía pidiendo presupuesto, CEE anterior, vídeo y fachada a alguien cuyo CEE
// inicial ya estaba registrado, y fotos de ACS en un expediente sin ACS.
//
// REGLA: **manda el EXPEDIENTE; la oportunidad es el punto de partida.** Cada
// campo del alcance es `true`/`false` cuando el expediente lo declara y `null`
// cuando no consta — y solo entonces `deriveSelectors` cae a la simulación.
// `null` NO es `false`: un expediente que aún no ha rellenado Instalación no
// puede apagar apartados que la oportunidad sí pedía.
//
// Fuente única de las tres superficies (enlace público del cliente, panel del
// admin y barrido de "qué falta"): todas piden el checklist por aquí, así que
// las tres piden exactamente lo mismo. Antes cada una montaba su contexto por su
// cuenta y solo el barrido sabía del CEE registrado.
// ============================================================================

const supabase = require('./supabaseClient');
const { detectPrograma, esSustitucionCaldera } = require('../utils/fichas');
const { esTermoElectrico } = require('../utils/aerotermiaUnits');

/** ¿Hay valor de verdad (no null/vacío/placeholder de los migrados)? */
function present(v) {
    if (v === null || v === undefined) return false;
    const s = String(v).trim();
    return s !== '' && !/^_+$/.test(s);
}

/**
 * Familia de la unidad terminal EXISTENTE. Interesa la familia, no el modelo:
 *   · suelo_radiante → tiene ARMARIO DE COLECTORES, y esa foto no la cubre nada más.
 *   · radiadores     → NO se pide foto (decisión de negocio, 2026-08-11): el dato
 *     que justifica la temperatura de impulsión es `tipo_emisor` del expediente,
 *     que ya viaja al CIFO; la foto no añadía nada y era una casilla más que
 *     rellenar. El admin puede reactivarla con "Añadir apartado de obra".
 *   · aire_aire      → splits/conductos de un RES080: esa foto ES la de la unidad
 *     interior, que ya se pide aparte.
 */
function familiaEmisor(tipoEmisor) {
    const t = String(tipoEmisor || '').trim().toLowerCase();
    if (!t) return null;
    if (t === 'suelo_radiante') return 'suelo_radiante';
    if (t.startsWith('radiadores')) return 'radiadores';
    if (t === 'splits' || t === 'conductos') return 'aire_aire';
    return null;
}

/**
 * Elementos de envolvente que el expediente declara REHABILITADOS
 * (`documentacion.envolvente`, pestaña Envolvente de un RES080).
 * Devuelve null si la pestaña está en blanco: no consta ≠ no se hace.
 */
function envolventeDeclarada(envolvente) {
    if (!envolvente || typeof envolvente !== 'object') return null;
    const flags = {
        ventanas: envolvente.sustituye_ventanas === true,
        cubierta: envolvente.aislamiento_cubierta === true,
        fachada: envolvente.aislamiento_muros === true,
        suelo: envolvente.aislamiento_suelo === true,
    };
    // Todo a false puede ser "aún sin rellenar" o "no se toca la envolvente". Se
    // distingue por si alguna clave de envolvente existe siquiera en el JSONB.
    const declarada = ['sustituye_ventanas', 'aislamiento_cubierta', 'aislamiento_muros', 'aislamiento_suelo']
        .some(k => envolvente[k] !== undefined);
    return declarada ? flags : null;
}

/**
 * ¿El ACS entra en el alcance? Mismo criterio que el CIFO y las fichas (regla
 * 12.b): `cambio_acs !== false` **y** que el equipo nuevo no sea un termo
 * eléctrico (efecto Joule: no computa en el ahorro y no hay nada que fotografiar
 * como bomba de calor de ACS).
 * Devuelve null si el expediente no ha declarado nada todavía.
 */
function acsEnAlcance(inst) {
    if (!inst || typeof inst !== 'object') return null;
    if (inst.cambio_acs === false || String(inst.cambio_acs).toLowerCase() === 'no') return false;
    if (esTermoElectrico(inst.aerotermia_acs)) return false;
    if (inst.cambio_acs === true || String(inst.cambio_acs).toLowerCase() === 'si') return true;
    return null; // no consta → decide la simulación
}

/**
 * Alcance documental a partir del expediente (puede ser null) y su oportunidad.
 * Función PURA: los llamadores que ya tienen las filas en mano la usan directa
 * (el barrido), y `resolver()` es el envoltorio que las lee de la BD.
 */
function alcanceFromExpediente(exp, opp) {
    const e = exp || {};
    const inst = e.instalacion || {};
    const doc = e.documentacion || {};
    const seg = e.seguimiento || {};

    const ficha = detectPrograma(e, opp || {});

    // El CEE inicial está registrado si hay justificante con fecha o si el
    // seguimiento lo dice. Cualquiera de los dos basta: la fecha la sella la
    // subida del justificante de Industria y el estado lo mueve el certificador.
    const ceeIniRegistrado = present(doc.fecha_registro_cee_inicial)
        || present(e.freg_ini)
        || seg.cee_inicial === 'REGISTRADO'
        || e.seg_ini === 'REGISTRADO';

    return {
        ficha,
        // La ficha de sustitución de caldera (RES060/093/TER100) NO contempla obra
        // de envolvente: pedir fotos de ventanas o cubierta ahí es pedir material
        // que no va a ningún documento.
        esSustitucionCaldera: esSustitucionCaldera(ficha),
        cee_inicial_registrado: !!ceeIniRegistrado,
        acs: acsEnAlcance(exp ? inst : null),
        emisor: familiaEmisor(inst.tipo_emisor),
        piscina: inst.piscina?.activa === true ? true : (exp ? false : null),
        envolvente: envolventeDeclarada(doc.envolvente || e.envolvente),
        hibridacion: ficha === 'RES093' ? true : null,
        // Solo informativo (cabecera y avisos); no poda ningún slot.
        numero_expediente: e.numero_expediente || null,
        fin_obra: e.fin_obra || doc.fecha_fin_obra_comunicada || null,
    };
}

/**
 * Lee el expediente de una oportunidad y devuelve su alcance documental.
 * Nunca lanza: sin expediente (o si la consulta falla) devuelve el alcance que
 * se deduce solo de la oportunidad, que es el comportamiento de siempre.
 *
 * REGLA 22 — se piden CAMPOS CONCRETOS del JSONB, nunca `documentacion` ni `cee`
 * enteros: `cee.xml_inicial` son megas y aquí no hace ninguna falta.
 */
async function resolver(opp) {
    if (!opp?.id) return alcanceFromExpediente(null, opp);
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select([
                'numero_expediente',
                'estado',
                'instalacion',
                'seguimiento',
                'envolvente:documentacion->envolvente',
                'freg_ini:documentacion->>fecha_registro_cee_inicial',
                'fin_obra:documentacion->>fecha_fin_obra_comunicada',
            ].join(', '))
            .eq('oportunidad_id', opp.id)
            .maybeSingle();
        return alcanceFromExpediente(exp, opp);
    } catch (e) {
        console.warn('[docsAlcance] resolver:', e.message);
        return alcanceFromExpediente(null, opp);
    }
}

/**
 * `datos_calculo` ENRIQUECIDO con el alcance, listo para `buildDocChecklist`.
 * Es lo que deben usar TODAS las superficies que construyen el checklist (vista
 * pública, panel admin, POST de subida, borrado y merge): si la vista poda un
 * slot y el POST no, subir a ese slot responde "Tipo de documento no válido"
 * justo donde la casilla ya no existe — y al revés, el cliente vería una casilla
 * que la vista dice que no procede.
 */
async function enriquecer(opp) {
    const alcance = await resolver(opp);
    return { datosCalculo: conAlcance(opp?.datos_calculo, alcance), alcance };
}

/** Fusiona un alcance ya resuelto dentro de un `datos_calculo` (sin ir a la BD). */
function conAlcance(datosCalculo, alcance) {
    const dc = { ...(datosCalculo || {}), alcance };
    // Si hay expediente, la oportunidad está ACEPTADA por definición (lo garantiza
    // el trigger de BD). En los MIGRADOS la oportunidad es sintética y su
    // `datos_calculo.estado` puede no decirlo: sin esto, el checklist devuelve
    // todos los slots como opcionales y no se exige ninguna foto.
    if (alcance?.numero_expediente) dc.estado = 'ACEPTADA';
    if (alcance?.cee_inicial_registrado) dc.cee_inicial_registrado = true;
    return dc;
}

module.exports = {
    present,
    familiaEmisor,
    envolventeDeclarada,
    acsEnAlcance,
    alcanceFromExpediente,
    resolver,
    enriquecer,
    conAlcance,
};
