// ─── representacion.js ───────────────────────────────────────────────────────
// QUIÉN comparece y firma por el titular, y con QUÉ título lo acredita. Fuente
// ÚNICA para el apartado 3 del Anexo I, el «Fdo.», el Convenio de Cesión, la
// ficha del cliente y el paquete de la actuación (envioGestorService).
//
// REGLA — un PARTICULAR sin representante firma él mismo: el apartado 3 del
// Anexo I va EN BLANCO y SIN NINGUNA CASILLA marcada (Fran, 22/10/2026). Antes
// se marcaba siempre «Otro documento: {nº} - ANEXO CESIÓN AHORRO», que declaraba
// una representación que no existe.
//
// REGLA — hay representación en dos casos y solo en dos:
//   · EMPRESA: siempre, por su representante legal (`representante_*`).
//   · PARTICULAR marcado `representado` (p. ej. un poder notarial a favor del
//     cónyuge): firma el representante, no el titular.
// El título es un PODER NOTARIAL (fecha + nº de protocolo) u OTRO documento
// (título + fecha de formalización), y su copia se ADJUNTA: va al paquete de la
// actuación como el resto del expediente que se presenta.
//
// Puro y sin dependencias: lo importan el frontend y, por ESM, el backend.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_REPRESENTACION = {
    NOTARIAL: 'Poder notarial',
    OTRO: 'Otro documento',
};

const txt = (v) => (v == null ? '' : String(v).trim());

/** "2024-05-12" → "12/05/2024". Lo que no sea una fecha ISO se devuelve tal cual. */
export function fechaEs(v) {
    const s = txt(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/**
 * Lo que la ficha del cliente MANDA al guardar (alta y edición). Sin
 * representación, todo a null: un particular que deja de estar representado no
 * se queda con el poder de antes impreso en su próximo Anexo I. El enlace de la
 * copia no viaja: lo escribe la subida (`POST /api/clientes/:id/representacion`).
 */
export function payloadRepresentacion(form, esEmpresa) {
    const f = form || {};
    const hay = !!esEmpresa || !!f.representado;
    const v = (k) => (hay ? (txt(f[k]) || null) : null);
    const tipo = txt(f.representacion_tipo).toUpperCase();
    return {
        es_empresa: !!esEmpresa,
        representado: !esEmpresa && !!f.representado,
        representante_nombre: v('representante_nombre'),
        representante_apellidos: v('representante_apellidos'),
        representante_dni: v('representante_dni'),
        representacion_tipo: hay && (tipo === 'NOTARIAL' || tipo === 'OTRO') ? tipo : null,
        representacion_fecha: v('representacion_fecha'),
        representacion_protocolo: hay && tipo === 'NOTARIAL' ? (txt(f.representacion_protocolo) || null) : null,
        representacion_documento: hay && tipo === 'OTRO' ? (txt(f.representacion_documento) || null) : null,
    };
}

/**
 * La representación de un cliente (o de un cedente de `cedentesDe`).
 *
 * @param {object} c  fila de `clientes` o cedente
 * @returns {{ hay: boolean, esEmpresa: boolean, nombre: string, dni: string,
 *   tipo: 'NOTARIAL'|'OTRO'|'', fecha: string, protocolo: string,
 *   documento: string, docLink: string, otroDocumento: string, falta: string[] }}
 *   `otroDocumento` es el texto de la casilla «Otro documento» del Anexo I
 *   (título y fecha); `falta`, lo que hay que completar para que el Anexo I y el
 *   paquete salgan bien.
 */
export function representacionDe(c) {
    const x = c || {};
    const esEmpresa = !!x.es_empresa;
    const hay = esEmpresa || !!x.representado;
    const vacia = {
        hay: false, esEmpresa, nombre: '', dni: '', tipo: '', fecha: '', protocolo: '',
        documento: '', docLink: '', otroDocumento: '', falta: [],
    };
    if (!hay) return vacia;

    const nombre = [x.representante_nombre, x.representante_apellidos].map(txt).filter(Boolean).join(' ');
    const dni = txt(x.representante_dni);
    const t = txt(x.representacion_tipo).toUpperCase();
    const tipo = t === 'NOTARIAL' || t === 'OTRO' ? t : '';
    const fecha = fechaEs(x.representacion_fecha);
    const protocolo = txt(x.representacion_protocolo);
    const documento = txt(x.representacion_documento);
    const docLink = txt(x.representacion_doc_link);
    const otroDocumento = tipo === 'OTRO'
        ? [documento, fecha ? `de ${fecha}` : ''].filter(Boolean).join(' ')
        : '';

    const quien = esEmpresa ? 'del representante legal' : 'del representante';
    const falta = [];
    if (!nombre) falta.push(`nombre ${quien}`);
    if (!dni) falta.push(`DNI ${quien}`);
    if (!tipo) falta.push('cómo se acredita la representación (poder notarial u otro documento)');
    if (tipo === 'NOTARIAL') {
        if (!fecha) falta.push('fecha del poder notarial');
        if (!protocolo) falta.push('nº de protocolo del poder notarial');
    }
    if (tipo === 'OTRO') {
        if (!documento) falta.push('título del documento que acredita la representación');
        if (!fecha) falta.push('fecha de formalización del documento');
    }
    if (!docLink) falta.push('copia del documento que acredita la representación');

    return { hay, esEmpresa, nombre, dni, tipo, fecha, protocolo, documento, docLink, otroDocumento, falta };
}
