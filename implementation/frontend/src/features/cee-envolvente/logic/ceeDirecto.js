// ============================================================================
// ceeDirecto.js — un CEE directo, con la FORMA de un expediente CAE.
//
// La ventana de la envolvente, la ficha del `.cex` y el plano están escritos
// contra un expediente: `instalacion.ref_catastral`, `instalacion.municipio`,
// `instalacion.zona_climatica`… En `cee_directos` esos mismos datos viven en
// COLUMNAS sueltas, porque allí no hay una instalación que describir.
//
// REGLA — se ADAPTA la fila, no se bifurca la lógica. Es el mismo criterio con
// el que el módulo CEE se monta tal cual sobre las dos tablas: un `if
// (esCeeDirecto)` dentro de `fichaCe3x` o de `buildInstalacionAddress` obliga a
// mantener dos veces todo lo que se toque después, y una de las dos se queda
// atrás sin que nada lo diga.
//
// Se usa en los DOS lados —la ventana lo pinta, el backend compone con ello la
// ficha del `.cex`— y por eso vive aquí, en el frontend, cargado por `import()`
// ESM desde Node (mismo patrón que `fichaCe3x.js` y `cifoDoc.js`).
// ============================================================================

/**
 * ¿Este «expediente» es en realidad un encargo de CEE directo?
 *
 * La marca la pone el adaptador de abajo. No se mira `alcance` ni la ausencia
 * de `oportunidad_id`: deducirlo es adivinar, y de esto cuelga en qué TABLA se
 * escribe el trabajo del certificador.
 */
export const esCeeDirecto = (e) => !!e?.es_cee_directo;

/**
 * Una fila de `cee_directos` (con su cliente ya cargado) leída como expediente.
 *
 * Lo que se compone es la `instalacion`, que es el bloque del que cuelgan la
 * referencia catastral, la dirección del inmueble y la zona climática. La zona
 * NO se teclea aquí ni en ningún sitio: la deriva `ceeDirectoService` del
 * municipio cada vez que se toca la dirección, igual que el `estado`.
 */
export function ceeDirectoComoExpediente(row) {
    if (!row) return null;
    const cliente = row.cliente || row.clientes || null;
    return {
        ...row,
        es_cee_directo: true,
        alcance: String(row.alcance || 'UNICO').toUpperCase(),
        // `clientes` en plural es como lo nombra el expediente CAE, y es lo que
        // leen `buildInstalacionAddress` y el subtítulo de la ventana.
        clientes: cliente,
        cliente,
        instalacion: {
            ...(row.instalacion || {}),
            ref_catastral: row.ref_catastral || null,
            direccion: row.direccion || null,
            municipio: row.municipio || null,
            provincia: row.provincia || null,
            codigo_postal: row.codigo_postal || null,
            ccaa: row.ccaa || null,
            //: La del INMUEBLE, que es la que se certifica. Sale de la fila y no
            //: de una oportunidad, que aquí no existe.
            zona_climatica: row.zona_climatica || null,
            //: Sin dirección propia se deja que la del cliente sirva de respaldo
            //: (`buildInstalacionAddress`); con ella puesta, manda la suya — en
            //: un CEE de compraventa el titular casi nunca vive en el inmueble.
            ...(row.direccion ? { misma_direccion: false } : {}),
        },
    };
}

export default ceeDirectoComoExpediente;
