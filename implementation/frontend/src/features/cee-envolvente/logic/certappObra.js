// ============================================================================
// certappObra.js — la OBRA de un certificador externo (app de certificadores,
// `certapp_obras`, origen `ext`), con la FORMA de un expediente.
//
// La obra tiene la MISMA forma que `cee_directos` en lo que leen la envolvente
// y el generador (columnas del inmueble, `cee`, `documentacion`, alcance
// 'UNICO'), así que se presenta como un CEE suelto con el MISMO adaptador
// (`ceeDirectoComoExpediente`) y solo se compone lo que es distinto:
//
//   · el CLIENTE sale del `titular` (jsonb de la obra), con los nombres de
//     columna de `clientes`, que son los que leen `fichaCe3x`,
//     `buildInstalacionAddress` y el subtítulo de la ventana;
//   · `documentacion.cuestionario` se COMPONE desde el cuestionario de la app
//     (`aCuestionarioCee`, fuente única en `src/certificadores/logic/
//     cuestionario.js`): `fichaCe3x` lo lee con la forma de los CEE directos.
//     No se guarda: la fuente es `certapp_obras.cuestionario`;
//   · la marca `es_ext`, además de `es_cee_directo`.
//
// REGLA — el origen `ext` se ADAPTA, no se bifurca (docs/conocimiento/
// certificadores-app/00-la-app-de-certificadores.md). Y el adaptador es fuente
// única con la ventana: el backend lo carga por `import()` ESM (mismo patrón
// que `ceeDirecto.js`), por eso los imports llevan `.js` y no hay nada de React.
//
// ⚠️ Con `es_cee_directo` puesto, cualquier camino del backend que decida la
// TABLA solo con `esCeeDirecto(e)` escribiría en `cee_directos` con el uuid de
// una obra (una RPC sobre un id que no existe allí, y nada lo diría). Quien
// decide la tabla mira `es_ext` ANTES.
// ============================================================================

import { ceeDirectoComoExpediente } from './ceeDirecto.js';
import { aCuestionarioCee } from '../../../certificadores/logic/cuestionario.js';

/** ¿Este «expediente» es la obra de un certificador externo? La marca la pone el adaptador. */
export const esObraExt = (e) => !!e?.es_ext;

const txt = (v) => {
    const s = v == null ? '' : String(v).trim();
    return s || null;
};

/**
 * El TITULAR del certificado (`certapp_obras.titular`) con los nombres de
 * columna de `clientes`. Es el cliente del CERTIFICADOR, no de BROKERGY: no hay
 * ficha en `clientes` detrás ni nada que escribir en ella.
 *
 * Forma de `titular`: `{ nombre, apellidos, nif, email, telefono, direccion,
 * municipio, provincia, codigo_postal, es_empresa, representante }`.
 */
export function titularComoCliente(titular) {
    const t = titular && typeof titular === 'object' ? titular : {};
    const r = t.representante && typeof t.representante === 'object' ? t.representante : null;
    const cliente = {
        nombre_razon_social: txt(t.nombre),
        apellidos: txt(t.apellidos),
        dni: txt(t.nif),
        email: txt(t.email),
        tlf: txt(t.telefono),
        direccion: txt(t.direccion),
        municipio: txt(t.municipio),
        provincia: txt(t.provincia),
        codigo_postal: txt(t.codigo_postal),
        es_empresa: t.es_empresa === true,
        ...(r ? {
            representante_nombre: txt(r.nombre),
            representante_apellidos: txt(r.apellidos),
            representante_dni: txt(r.nif || r.dni),
        } : {}),
    };
    // Sin ningún dato no hay titular: mejor `null` (la ficha lo dice) que una
    // ficha de cliente vacía que parezca rellena.
    const alguno = Object.entries(cliente).some(([k, v]) => k !== 'es_empresa' && v);
    return alguno ? cliente : null;
}

/**
 * La CUENTA del certificador (`certapp_cuentas`) con los nombres de columna de
 * `prescriptores`, que son los que lee `tecnicoCe3x` para los once campos del
 * técnico en el `.cex`. La firma es de una PERSONA y puede ejercer en una
 * empresa (regla 48.f): sin empresa declarada es autónomo y su NIF va en las dos.
 *
 * Para el backend, que es quien compone la ficha: aquí, en la ventana, el
 * técnico llega ya compuesto en la ficha.
 */
export function cuentaComoCertificador(cuenta) {
    if (!cuenta) return null;
    const nombre = txt(cuenta.nombre);
    const apellidos = txt(cuenta.apellidos);
    const empresa = txt(cuenta.empresa);
    const persona = [nombre, apellidos].filter(Boolean).join(' ') || null;
    return {
        es_certificador_externo: true,
        nombre_responsable: nombre,
        apellidos_responsable: apellidos,
        nif_responsable: txt(cuenta.nif),
        es_autonomo: !empresa,
        razon_social: persona,
        cif: txt(cuenta.nif),
        empresa_razon_social: empresa,
        empresa_cif: empresa ? txt(cuenta.empresa_nif) : null,
        tlf: txt(cuenta.telefono),
        email: txt(cuenta.email),
        direccion: txt(cuenta.direccion),
        provincia: txt(cuenta.provincia),
        municipio: txt(cuenta.municipio),
        codigo_postal: txt(cuenta.codigo_postal),
        titulacion: txt(cuenta.titulacion),
        colegio_profesional: txt(cuenta.colegio),
        numero_colegiado: txt(cuenta.num_colegiado),
    };
}

/**
 * Una fila de `certapp_obras` leída como expediente (un CEE suelto de alcance
 * ÚNICO). Si la fila ya trae `cliente` (compuesto en el servidor), manda ese.
 */
export function certappObraComoExpediente(obra) {
    if (!obra) return null;
    const cliente = obra.cliente || titularComoCliente(obra.titular);
    const base = ceeDirectoComoExpediente({ ...obra, cliente, clientes: undefined });
    return {
        ...base,
        es_ext: true,
        //: Una obra es SIEMPRE un certificado suelto: no hay fase final que
        //: archivaría en OLD el que se acaba de generar (regla 48.i).
        alcance: 'UNICO',
        documentacion: {
            ...(obra.documentacion || {}),
            cuestionario: aCuestionarioCee(obra.cuestionario || {}),
        },
    };
}

export default certappObraComoExpediente;
