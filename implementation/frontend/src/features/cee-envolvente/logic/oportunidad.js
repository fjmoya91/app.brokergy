// ============================================================================
// oportunidad.js — una OPORTUNIDAD, con la FORMA de un expediente CAE.
//
// La envolvente se puede empezar antes de que exista el expediente: desde la
// calculadora (botón CE3X), con la simulación todavía abierta. La ventana, la
// ficha del `.cex` y el plano están escritos contra un expediente
// —`instalacion.ref_catastral`, `instalacion.caldera_antigua_cal`,
// `oportunidades.datos_calculo`…— y aquí esos datos viven en los `inputs` de la
// simulación.
//
// REGLA — se ADAPTA la fila, no se bifurca la lógica. Es el mismo criterio que
// `ceeDirecto.js`: la instalación se compone con los MISMOS campos que
// `expedienteService` siembra al aceptar, así que lo que se ve aquí es lo que
// el expediente va a tener cuando nazca.
//
// El trabajo que se señala (la entrada, los huecos, las fotos, las imágenes
// sustituidas) vive en `datos_calculo.envolvente_cee`, con las mismas claves
// que `expedientes.cee`, y se vuelca al expediente al aceptar.
//
// Se usa en los DOS lados —la ventana lo pinta y el backend compone con ello la
// ficha— y por eso vive aquí, cargado por `import()` ESM desde Node.
// ============================================================================

/** ¿Este «expediente» es en realidad una oportunidad sin aceptar? */
export const esOportunidad = (e) => !!e?.es_oportunidad;

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** El nodo de aerotermia, como lo siembra `expedienteService.resolveAerotermia`. */
function aerotermia(modelId, marca, modelo, scop) {
    const custom = String(modelId || '').toLowerCase() === 'custom';
    const id = custom ? null : num(modelId);
    return {
        aerotermia_db_id: Number.isFinite(id) ? id : null,
        marca: custom ? (marca || '') : '',
        modelo: custom ? (modelo || '') : '',
        numero_serie: '',
        scop: num(scop),
        metodo_scop: 'ficha',
    };
}

/**
 * Una fila de `oportunidades` (con `datos_calculo`) leída como expediente.
 * `cliente` es su ficha de `clientes`, si tiene.
 */
export function oportunidadComoExpediente(row, { cliente = null } = {}) {
    if (!row) return null;
    const dc = row.datos_calculo || {};
    const inp = dc.inputs || {};
    const cambioAcs = inp.changeAcs === true;
    const cal = aerotermia(inp.aerothermiaModel, inp.customBrandName,
                           inp.customModelName, inp.scopHeating);
    const acs = cambioAcs
        ? aerotermia(inp.aerothermiaModelAcs, inp.customBrandAcsName,
                     inp.customModelAcsName, inp.scopAcs)
        : { ...cal };
    const caldera = { marca: '', modelo: '', numero_serie: '',
                      rendimiento_id: inp.boilerId || 'default' };
    return {
        id: row.id,
        es_oportunidad: true,
        id_oportunidad: row.id_oportunidad,
        //: El «número» de esta ventana es el de la oportunidad: es lo que se lee
        //: en la cabecera y en el título de la pestaña.
        numero_expediente: row.id_oportunidad,
        oportunidad_id: row.id,
        cliente_id: row.cliente_id || null,
        clientes: cliente,
        cliente,
        ficha: row.ficha || null,
        // `buildInstalacionAddress`, la zona y el año ya saben leer de aquí.
        oportunidades: { ...row, datos_calculo: dc },
        cee: dc.envolvente_cee || {},
        documentacion: {},
        instalacion: {
            misma_direccion: true,
            ref_catastral: row.ref_catastral || inp.rc || '',
            tipo_emisor: inp.emitterType || 'suelo_radiante',
            caldera_antigua_cal: caldera,
            misma_caldera_acs: true,
            caldera_antigua_acs: { ...caldera },
            aerotermia_cal: cal,
            cambio_calefaccion: inp.changeHeating !== false,
            cambio_acs: cambioAcs,
            misma_aerotermia_acs: !cambioAcs,
            aerotermia_acs: acs,
            fotovoltaica: inp.fotovoltaica || undefined,
            hibridacion: inp.hibridacion === true,
            potencia_bomba: num(inp.potenciaBomba) || 0,
            hibridacion_metodo: String(inp.hibridacionMetodo || '').toLowerCase() === 'caldera'
                ? 'caldera' : 'demanda',
            potencia_caldera: num(inp.potenciaCaldera) || 0,
        },
    };
}

export default oportunidadComoExpediente;
