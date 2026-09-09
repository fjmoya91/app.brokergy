// ============================================================
// subvenciones.js — AYUDAS PÚBLICAS y BONO SOCIAL del expediente.
//
// Lo que el titular declara en el APARTADO 4 y en la DECLARACIÓN RESPONSABLE
// del Anexo I: si percibe bono social (y cuál) y si ha solicitado alguna ayuda
// pública para ESTA misma actuación.
//
// POR QUÉ EXISTE ESTE FICHERO
// ---------------------------
// Hasta ahora estos datos NO se guardaban en ninguna parte: vivían en el estado
// local de `AnexoIModal` y se perdían al cerrar el popup. Consecuencias medidas
// en 25RES080_28 el 08/09/2026:
//   · de los cuatro sitios que generan el Anexo I, solo el modal pasaba esos
//     datos; los otros tres (envío de anexos, convenio de cesión, regeneración)
//     llamaban a `buildAnexoIHtml` sin ellos, así que el Anexo I que SALÍA decía
//     "NO SE HA SOLICITADO" aunque el firmado por el cliente dijera lo contrario;
//   · la solicitud de verificación mandaba `SE_apoyo_programa: 'no'` fijo, y ese
//     expediente tenía declarada una ayuda del MITMA de 18.800 € en su Anexo I.
//     Se le habría declarado al verificador lo contrario de lo que firmó la
//     titular, con su propio Anexo I adjunto en el mismo envío.
//
// REGLA — la ayuda se declara UNA vez y la leen TODOS: el Anexo I, la solicitud
// de verificación y el control de sobrefinanciación. Si un consumidor vuelve a
// decidir esto por su cuenta, vuelve el mismo fallo.
//
// REGLA — por defecto NO hay nada solicitado. Es lo que declara la inmensa
// mayoría de los expedientes, y es además la única respuesta que no compromete
// al titular si nadie ha llegado a preguntárselo.
// ============================================================

// ─── Bono social ─────────────────────────────────────────────────────────────
// Las SEIS opciones del apartado 4 del Anexo I, en su orden oficial. El índice
// importa: `buildAnexoIHtml` pinta las casillas por posición. La última
// ("Ninguno de los anteriores") es la respuesta por defecto.
//
// ⚠️ El catálogo que se maneja internamente lista cuatro; el impreso oficial
// tiene CINCO más "ninguno" — el que falta es el bono social TÉRMICO. Se
// conservan los seis: quitar uno dejaría un impreso que no se puede rellenar.
export const BONO_SOCIAL_OPCIONES = [
    { id: 'electrico_vulnerable',        label: 'Bono social eléctrico para consumidores vulnerables' },
    { id: 'electrico_vulnerable_severo', label: 'Bono social eléctrico para consumidores vulnerables severos' },
    { id: 'electrico_riesgo_exclusion',  label: 'Bono social eléctrico en riesgo de exclusión social' },
    { id: 'justicia_energetica',         label: 'Bono social de justicia energética' },
    { id: 'termico',                     label: 'Bono social térmico' },
    { id: 'ninguno',                     label: 'Ninguno de los anteriores' },
];

// Etiquetas sueltas, en orden, para quien solo necesite pintarlas.
export const BONO_SOCIAL_LABELS = BONO_SOCIAL_OPCIONES.map(o => o.label);

// Se pueden marcar VARIAS a la vez (el impreso dice "Seleccionar las opciones
// que correspondan"), salvo "ninguno", que es excluyente por definición.
export const BONO_NINGUNO = 'ninguno';

// ─── Catálogo de ayudas ──────────────────────────────────────────────────────
// Al elegir una, el órgano gestor, la disposición reguladora y el año se
// rellenan solos: son propiedades del PROGRAMA, no de este expediente, y
// tecleados a mano es donde se cuelan las erratas que luego no casan entre el
// Anexo I y la solicitud de verificación.
export const CATALOGO_SUBVENCIONES = [
    {
        id: 'RD853_2021',
        denominacion: 'Programas de ayuda en materia de rehabilitación residencial y vivienda social del Plan de Recuperación, Transformación y Resiliencia.',
        organo: 'Ministerio de Transportes, Movilidad y Agenda Urbana (MITMA)',
        disposicion: 'Real Decreto 853/2021, de 5 de octubre',
        anio: '2021',
    },
    {
        id: 'RD1124_2021',
        denominacion: 'Programas de incentivos para la implantación de instalaciones de energías renovables térmicas en diferentes sectores de la economía, en el marco del Plan de Recuperación, Transformación y Resiliencia',
        organo: 'Ministerio para la Transición Ecológica y el Reto Demográfico.',
        disposicion: 'Real Decreto 1124/2021, de 21 de diciembre',
        anio: '2021',
    },
    {
        id: 'RD477_2021',
        denominacion: 'Programas de incentivos ligados al autoconsumo y almacenamiento con fuentes de energía renovable, así como a la implantación de sistemas térmicos renovables en el sector residencial, en el marco del Plan de Recuperación, Transformación y Resiliencia',
        organo: 'Ministerio para la Transición Ecológica y el Reto Demográfico.',
        disposicion: 'Real Decreto 477/2021, de 29 de junio',
        anio: '2021',
    },
    {
        id: 'RD691_2021',
        denominacion: 'Subvenciones a otorgar a actuaciones de rehabilitación energética en edificios existentes, en ejecución del programa PREE 5000, en el marco del Plan de Recuperación, Transformación y Resiliencia',
        organo: 'Ministerio para la Transición Ecológica y el Reto Demográfico.',
        disposicion: 'Real Decreto 691/2021, de 3 de agosto',
        anio: '2021',
    },
];

// Salida para una ayuda que no está en el catálogo: entonces los cuatro campos
// se escriben a mano. Sin ella, una ayuda autonómica o municipal no se podría
// declarar y acabaría sin declararse.
export const SUBVENCION_OTRA = 'OTRA';

export function subvencionDelCatalogo(id) {
    return CATALOGO_SUBVENCIONES.find(s => s.id === id) || null;
}

// ─── Estado de la concesión ──────────────────────────────────────────────────
// Los tres que contempla el Anexo I, en su orden de casillas. "PENDIENTE" es lo
// que el formulario antiguo llamaba "SOLICITADA SIN CONTESTACIÓN".
export const ESTADOS_CONCESION = [
    { id: 'OBTENIDA',  label: 'Concedida',                   anexo: 'Se ha obtenido dicha ayuda o subvención para la misma actuación.' },
    { id: 'DENEGADA',  label: 'Denegada',                    anexo: 'No se ha obtenido dicha ayuda o subvención para la misma actuación.' },
    { id: 'PENDIENTE', label: 'Solicitada sin contestación', anexo: 'Está pendiente de resolución dicha ayuda o subvención solicitada para la misma actuación.' },
];

// ─── El objeto que se guarda ─────────────────────────────────────────────────
// Vive en `documentacion.subvenciones`. Son cuatro cadenas y dos fechas: cabe de
// sobra en el JSONB y no roza el límite de la regla de tamaño.
export function subvencionesVacio() {
    return {
        bono_social: { percibe: false, tipos: [] },
        solicitada: false,
        ayuda: {
            catalogo_id: '',
            denominacion: '',
            organo: '',
            disposicion: '',
            anio: '',
            num_expediente: '',
            estado: 'PENDIENTE',
            fecha_solicitud: '',
            fecha_resolucion: '',
            cuantia_eur: '',
            fondo_nacional: 'no',
        },
    };
}

/**
 * Lee lo guardado y lo devuelve SIEMPRE completo y normalizado. Un expediente
 * anterior a esta pestaña no tiene el campo: eso NO es "no ha solicitado nada",
 * es que nadie lo ha declarado — pero se presenta como no solicitado, que es lo
 * que el Anexo I imprime por defecto y lo que ya venía haciéndose.
 */
export function leerSubvenciones(expediente) {
    const base = subvencionesVacio();
    const raw = expediente?.documentacion?.subvenciones;
    if (!raw || typeof raw !== 'object') return base;

    const bono = raw.bono_social || {};
    const tipos = Array.isArray(bono.tipos)
        ? bono.tipos.filter(t => BONO_SOCIAL_OPCIONES.some(o => o.id === t) && t !== BONO_NINGUNO)
        : [];

    return {
        bono_social: { percibe: !!bono.percibe && tipos.length > 0, tipos },
        solicitada: !!raw.solicitada,
        ayuda: { ...base.ayuda, ...(raw.ayuda || {}) },
    };
}

/**
 * Los cuatro datos del PROGRAMA. Si viene del catálogo mandan sus valores (el
 * expediente no puede contradecir al RD que lo regula); si es "otra", lo escrito
 * a mano.
 */
export function datosPrograma(sub) {
    const cat = subvencionDelCatalogo(sub?.ayuda?.catalogo_id);
    if (cat) {
        return { denominacion: cat.denominacion, organo: cat.organo, disposicion: cat.disposicion, anio: cat.anio };
    }
    const a = sub?.ayuda || {};
    return {
        denominacion: a.denominacion || '',
        organo: a.organo || '',
        disposicion: a.disposicion || '',
        anio: a.anio || '',
    };
}

/**
 * Qué falta para poder declarar la ayuda. Se comprueba antes de generar el
 * Anexo I y antes de enviar al verificador: una ayuda declarada a medias es
 * peor que ninguna, porque el verificador la ve incompleta y la pregunta.
 */
export function faltantesSubvencion(expediente) {
    const sub = leerSubvenciones(expediente);
    if (!sub.solicitada) return [];
    const p = datosPrograma(sub);
    const a = sub.ayuda;
    const falta = [];
    if (!p.denominacion) falta.push('la denominación del programa de ayuda');
    if (!p.organo) falta.push('el órgano gestor');
    if (!p.disposicion) falta.push('la disposición reguladora');
    if (!p.anio) falta.push('el año');
    if (!a.estado) falta.push('el estado de la concesión');
    if (!(Number(a.cuantia_eur) > 0)) falta.push('la cuantía solicitada u obtenida');
    return falta;
}

// dd/mm/aaaa para los documentos; se guarda en ISO.
function fechaEs(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

// Importe en formato español, que es como lo piden tanto el impreso como la API
// del verificador ("18.800,00").
export function importeEs(v) {
    const n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Traduce lo declarado a los `states` que espera `buildAnexoIHtml`: casillas del
 * bono social por posición, radio de solicitado/no solicitado, las tres casillas
 * del estado de la concesión y la tabla de datos de la ayuda.
 *
 * Es la pieza que hace que el Anexo I salga IGUAL se genere desde donde se
 * genere — del popup, del envío de anexos o del convenio de cesión.
 */
export function anexoIStates(expediente) {
    const sub = leerSubvenciones(expediente);
    const p = datosPrograma(sub);
    const a = sub.ayuda;

    const marcados = sub.bono_social.percibe ? sub.bono_social.tipos : [];
    const bonoSocial = BONO_SOCIAL_OPCIONES.map(o =>
        o.id === BONO_NINGUNO ? marcados.length === 0 : marcados.includes(o.id));

    const idxEstado = ESTADOS_CONCESION.findIndex(e => e.id === a.estado);
    const ayudaOptions = ESTADOS_CONCESION.map((_, i) => sub.solicitada && i === idxEstado);

    return {
        bonoSocial,
        noSolicitado: !sub.solicitada,
        seSolicitado: sub.solicitada,
        ayudaOptions,
        ayudaFields: sub.solicitada ? {
            denominacion: p.denominacion,
            entidad: p.organo,
            anio: p.anio,
            disposicion: p.disposicion,
            num_expediente: a.num_expediente || '',
            estado: (ESTADOS_CONCESION.find(e => e.id === a.estado) || {}).label || '',
            fecha_solicitud: fechaEs(a.fecha_solicitud),
            fecha_resolucion: fechaEs(a.fecha_resolucion),
            cuantia: a.cuantia_eur ? `${importeEs(a.cuantia_eur)} €` : '',
        } : {},
    };
}

/**
 * Los campos que la API del verificador (Marwen) espera dentro de cada
 * actuación. Con `SE_apoyo_programa: 'si'` los otros seis son OBLIGATORIOS para
 * ella, así que o van todos o no va ninguno.
 */
export function camposSolicitudVerificacion(expediente) {
    const sub = leerSubvenciones(expediente);
    if (!sub.solicitada) return { SE_apoyo_programa: 'no' };

    const p = datosPrograma(sub);
    const a = sub.ayuda;
    return {
        SE_apoyo_programa: 'si',
        SE_denominacion_programa: p.denominacion,
        SE_entidad_gestor: p.organo,
        SE_anio_solicitud: String(p.anio || ''),
        SE_disposicion_reguladora: p.disposicion,
        SE_cuantia_ayuda: importeEs(a.cuantia_eur) || '0',
        SE_fondo_nacional: a.fondo_nacional === 'si' ? 'si' : 'no',
    };
}

/**
 * Cuánto dinero público hay declarado sobre esta actuación. Lo usa el control de
 * sobrefinanciación: CAE + subvención no pueden superar la inversión.
 * Una ayuda DENEGADA no suma — no es dinero que vaya a recibir nadie.
 */
export function importeAyudaDeclarada(expediente) {
    const sub = leerSubvenciones(expediente);
    if (!sub.solicitada || sub.ayuda.estado === 'DENEGADA') return 0;
    const n = Number(String(sub.ayuda.cuantia_eur || '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}
