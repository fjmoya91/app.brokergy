// ============================================================
// anexoIFormulario.js — el ANEXO I (declaración responsable de ayudas públicas)
// sobre el IMPRESO OFICIAL en formato formulario.
//
// Hermano de fichasFormulario.js: aquí solo se dice QUÉ CASILLA del impreso ocupa
// cada dato. Los datos salen de `deriveAnexoI` (docGenerators.js), que es la misma
// fuente que alimenta el HTML clásico; y lo que se declara sobre bono social y
// ayudas, de la pestaña SUBVENCIONES vía `anexoIStates` (logic/subvenciones.js).
//
// REGLA — las casillas del bono social y del estado de la concesión se marcan POR
// POSICIÓN, igual que en el HTML. El orden de `BONO_SOCIAL_OPCIONES` y de
// `ESTADOS_CONCESION` ES el del impreso; dos listas paralelas se desalinearían en
// cuanto una cambiara, y una casilla mal marcada es una declaración responsable
// falsa firmada por el cliente.
//
// REGLA — los nombres de campo son los de la PLANTILLA, tal cual: el impreso los
// trunca a 50 caracteres ("Dirección postal de la instalación en que se ejecu") y
// numera los repetidos con sufijos (-0 el beneficiario, -1 el representante).
// ============================================================
import { deriveAnexoI } from '../utils/docGenerators.js';

/**
 * Las seis casillas del bono social (apartado 4), en el orden del impreso.
 * Coinciden una a una con `BONO_SOCIAL_OPCIONES` de logic/subvenciones.js.
 */
const CASILLAS_BONO = [
    'Bono social eléctrico para consumidores vulnerable',      // vulnerables
    'Bono social eléctrico para consumidores vulnerable-0',    // vulnerables severos
    'Bono social eléctrico en riesgo de exclusión socia',
    'Bono social de justicia energética',
    'Bono social térmico',
    'Ninguno de los anteriores',
];

/** Las tres casillas del estado de la ayuda, en el orden de `ESTADOS_CONCESION`. */
const CASILLAS_ESTADO_AYUDA = [
    'Se ha obtenido dicha ayuda',
    'No se ha obtenido dicha ayuda',
    'Está pendiente de resolución dicha ayuda',
];

/** Los nueve datos de la ayuda, en el orden del impreso. */
const CAMPOS_AYUDA = {
    denominacion: 'Denominación del programa de ayuda',
    entidad: 'Entidad u órgano gestor',
    anio: 'Año',
    disposicion: 'Disposición reguladora',
    num_expediente: 'Número de expediente',
    estado: 'Estado de la concesión',
    fecha_solicitud: 'Fecha de solicitud',
    fecha_resolucion: 'Fecha de la resolución deconcesión',
    cuantia: 'Cuantía de la ayuda esperada obtenida',
};

/**
 * El `formulario` del Anexo I: `{ plantilla: 'ANEXO_I', campos, fdo }`.
 *
 * `fdo` es el nombre que va sobre la línea "Fdo.: ____" del final, que NO es un
 * campo del formulario —el impreso deja ahí unos guiones bajos— y lo escribe el
 * backend sobre la página.
 *
 * @param {object} expediente
 * @param {object} results   para el ahorro/importe (lo pasa la vista que genera)
 * @param {object} states    edición en vivo del popup; por defecto, lo declarado
 *                           en la pestaña Subvenciones
 */
export function anexoIFormulario(expediente, results, states = {}) {
    // dash vacío: en un impreso oficial un dato que falta se ve como una casilla
    // en blanco, no como una fila de guiones bajos (que ahí es lo que trae impreso
    // el propio modelo).
    const d = deriveAnexoI(expediente, results, states, { dash: '', sep: '\n' });

    const campos = {
        // 1. Identificación de la actuación
        'Nombre de la actuación': d.nombreActuacion,
        'Código y nombre de la ficha': d.codigoFicha,
        'CC AA': d.ccaa,
        'Dirección postal de la instalación en que se ejecu': d.dirActuacion,
        'Referencia catastral de la localización de laactua': d.refCatastral,
        'n serie de equipos': d.serialsLineas.join('\n'),

        // 2. Propietario inicial del ahorro
        'Prop inicial de ahorro': d.nombrePropietario,
        'NIFNIE': d.nif,
        'Domicilio': d.domicilio,
        'Teléfono': d.telefono,
        'Correo electrónico': d.email,

        // El BENEFICIARIO del ahorro se deja en blanco: solo se rellena cuando NO
        // coincide con el propietario, y el expediente no distingue esa figura —
        // rellenarlo con el propietario diría que son dos personas distintas.

        // 3. Representante (solo si el titular es una persona jurídica: entonces
        // quien comparece y firma es su representante legal).
        'Representante': d.esEmpresa ? d.nombreRepresentante : '',
        'NIFNIE-1': d.esEmpresa ? d.dniRepresentante : '',

        // Título que acredita la representación. Es siempre el convenio de cesión
        // de este expediente, que es lo que de verdad se adjunta.
        'Poder Notarial de fecha': false,
        'Otro': true,
        'Otro documento': d.otroDocumento,

        // 4. Bono social
        ...Object.fromEntries(CASILLAS_BONO.map((c, i) => [c, !!d.bonoSocial[i]])),

        // Declaración responsable de ayudas
        'No se ha solicitado ayuda o subvención': !!d.noSolicitado,
        'Se ha solicitado ayuda o subvención': !!d.seSolicitado,
        ...Object.fromEntries(CASILLAS_ESTADO_AYUDA.map((c, i) => [c, !!d.ayudaOptions[i]])),
        ...Object.fromEntries(Object.entries(CAMPOS_AYUDA)
            .map(([clave, campo]) => [campo, d.ayudaFields?.[clave] || ''])),

        // La segunda tabla de ayuda (página 4) se queda vacía: el expediente
        // declara UNA ayuda. El día que haga falta declarar dos, sus campos son
        // los mismos con el sufijo "-0".

        // Lugar y fecha de la firma
        'localidad': d.municipioFirma,
        'día': d.fechaPartes.dia,
        'mes': d.fechaPartes.mes,
        'año': d.fechaPartes.anio2,
    };

    return { plantilla: 'ANEXO_I', campos, fdo: d.firmante };
}

export { CASILLAS_BONO, CASILLAS_ESTADO_AYUDA, CAMPOS_AYUDA };
