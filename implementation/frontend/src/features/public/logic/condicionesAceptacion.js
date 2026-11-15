// Condiciones y autorizaciones que el cliente acepta al pulsar
// «Confirmar y aceptar propuesta» en /firma/:id.
//
// Son DATOS, no JSX: el texto se va a retocar (lo revisa el asesor) y la
// maqueta no. Y cada retoque sube CONDICIONES_VERSION, que viaja con la
// aceptación y queda sellada en el historial de la oportunidad: meses después
// hay que poder saber QUÉ texto tenía delante el cliente cuando aceptó.
// Un cambio en el texto sin subir la versión deja ese sello mintiendo.

export const CONDICIONES_VERSION = '2026-09-23';

export const RESPONSABLE = {
    nombre: 'Soluciones Sostenibles para Eficiencia Energética, S.L. (BROKERGY)',
    cif: 'B19350222',
    email: 'info@brokergy.es',
    // El domicilio a efectos de notificaciones del Convenio de Cesión (docGenerators).
    domicilio: 'C/ Don Sergio, 12 – 1ºL, 13700 Tomelloso (Ciudad Real)',
    telefono: '623 926 179',
};

export const CONDICIONES = [
    {
        titulo: 'Aceptación de la propuesta',
        parrafos: [
            'Al pulsar «Confirmar y aceptar propuesta» aceptas la propuesta de BROKERGY que has recibido, con las condiciones que figuran en ella (vinculación de servicios, vigencia y compensación por incumplimiento).',
            'Esta aceptación NO sustituye a la firma del Anexo I ni del Convenio de Cesión de ahorros: esos documentos te los enviaremos aparte para que los firmes.',
        ],
    },
    {
        titulo: 'Certificados de Eficiencia Energética',
        parrafos: [
            'Autorizas a BROKERGY y al técnico certificador que designe a visitar la vivienda en la fecha que acordemos contigo, tomar las medidas, fotografías y datos necesarios, y emitir y presentar en el registro oficial de tu comunidad autónoma los Certificados de Eficiencia Energética (inicial y final) que exija la tramitación de las ayudas objeto de esta propuesta.',
        ],
    },
    {
        titulo: 'Tramitación del expediente de ayudas',
        parrafos: [
            'Autorizas a BROKERGY a preparar y presentar la documentación de tu expediente ante la entidad verificadora, el sujeto obligado y los organismos públicos competentes, y a solicitarte a ti o a tu instalador la documentación que falte (fotografías, facturas, certificados).',
            'Te comprometes a que la información y los documentos que nos aportes sean veraces y correspondan a la vivienda y a la actuación de esta propuesta.',
        ],
    },
    {
        titulo: 'Protección de datos personales',
        filas: [
            ['Responsable', `${RESPONSABLE.nombre} · CIF ${RESPONSABLE.cif} · ${RESPONSABLE.email}`],
            ['Finalidad', 'Gestionar tu propuesta y tu expediente de ayudas, emitir y registrar los certificados energéticos y comunicarnos contigo sobre el expediente por teléfono, email o WhatsApp.'],
            ['Legitimación', 'La ejecución del servicio que nos solicitas al aceptar esta propuesta y el cumplimiento de las obligaciones legales que se derivan de él.'],
            ['Destinatarios', 'El técnico certificador, el instalador o colaborador que te presentó la propuesta, la entidad verificadora, el sujeto obligado y los organismos públicos que tramitan las ayudas, además de los proveedores tecnológicos que nos prestan servicio (almacenamiento, correo y mensajería) como encargados del tratamiento.'],
            ['Conservación', 'Mientras dure el expediente y, después, durante los plazos que exija la ley.'],
            ['Derechos', `Puedes acceder, rectificar, suprimir, oponerte, limitar el tratamiento o pedir la portabilidad de tus datos escribiendo a ${RESPONSABLE.email}, y reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`],
        ],
        nota: 'No usaremos tus datos para enviarte publicidad.',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONDICIONES REFORZADAS («Perfil exigente», `inputs.condicionesReforzadas`).
// Solo si la versión de la propuesta que tiene delante el cliente las SELLÓ
// (`importes.reforzadas`, utils/importesPropuesta.js): GET /public/cliente las
// devuelve con la cifra y /firma las enseña con su casilla APARTE, obligatoria.
// El compromiso se cierra AL ACEPTAR, donde el cliente solo ve el dinero neto:
// el convenio, con los kWh y el precio unitario, llega después.
// Llevan su propia versión: las de siempre no cambian.
// Pendiente de revisión por el asesor (el ajuste proporcional sin kWh y la
// casilla de la compensación): docs/conocimiento/propuesta/condiciones-reforzadas-perfil-exigente.md
// ─────────────────────────────────────────────────────────────────────────────

export const CONDICIONES_REFORZADAS_VERSION = '2026-11-05-R';

// `useGrouping: 'always'`: en es-ES Intl no agrupa los miles con 4 cifras («1069,00 €»).
const eur = (v) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(Number(v) || 0)} €`;

/** El importe de la compensación tal y como se imprime («1.069,00 € + IVA», o los dos de una comparativa). */
export function textoPenalizacion({ penalizacion, penalizacion_reforma } = {}) {
    return penalizacion_reforma != null
        ? `${eur(penalizacion)} + IVA (opción 1) o ${eur(penalizacion_reforma)} + IVA (opción 2), según la opción que se ejecute`
        : `${eur(penalizacion)} + IVA`;
}

/**
 * Las condiciones con el compromiso de exclusividad y el desistimiento.
 * `reforzadas` = { pct, penalizacion, penalizacion_reforma?, tarifa }.
 */
export function condicionesReforzadas(reforzadas = {}) {
    const tarifa = eur(reforzadas.tarifa ?? 702.78);
    const [aceptacion, ...resto] = CONDICIONES;
    return [
        {
            titulo: aceptacion.titulo,
            parrafos: [
                'Al pulsar «Confirmar y aceptar propuesta» aceptas la propuesta de BROKERGY que has recibido, con las condiciones que figuran en ella, incluidos el compromiso de cesión en exclusiva y la compensación por incumplimiento que se explican abajo.',
                aceptacion.parrafos[1],
            ],
        },
        {
            titulo: 'Compromiso de cesión en exclusiva',
            parrafos: [
                'Al aceptar te comprometes a ceder a BROKERGY, en exclusiva, el ahorro energético de la actuación de esta propuesta, y a firmar el Convenio de Cesión cuando te lo presentemos. Como contraprestación recibirás el Bono Energético CAE que indica la propuesta, ajustado en la misma proporción en que el ahorro que se verifique difiera del estimado.',
                'BROKERGY adelanta los certificados energéticos y el trabajo técnico sin cobrarte nada. Por eso, una vez hecha la visita para el certificado energético, y salvo que el incumplimiento sea por causa de BROKERGY:',
                `a) Si el ahorro de esta actuación se tramita con otra empresa, o no firmas el Convenio de Cesión con BROKERGY, abonarás en 15 días naturales ${textoPenalizacion(reforzadas)}: el ${reforzadas.pct || 40} % del Bono Energético CAE estimado en la propuesta, con un mínimo de ${tarifa}. Es la liquidación anticipada de los daños y perjuicios que ese incumplimiento causa a BROKERGY (art. 1152 del Código Civil).`,
                `b) Si no sigues adelante con la obra, o no aportas la documentación en los 30 días siguientes a pedírtela por escrito, abonarás solo los servicios ya prestados, a la tarifa de la propuesta: ${tarifa} + IVA.`,
            ],
        },
        ...resto.slice(0, 2),
        {
            titulo: 'Derecho de desistimiento',
            parrafos: [
                'Tienes derecho a desistir de este contrato en un plazo de 14 días naturales desde la aceptación, sin necesidad de justificación y sin ningún coste.',
                `Para ejercerlo basta con que nos comuniques tu decisión de forma clara, por ejemplo por email a ${RESPONSABLE.email} o por WhatsApp al ${RESPONSABLE.telefono}, o por carta a ${RESPONSABLE.nombre}, ${RESPONSABLE.domicilio}. Puedes usar el modelo de abajo, aunque no es obligatorio. Para cumplir el plazo basta con enviarla antes de que venza.`,
                'Si desistes, no te cobraremos nada. Si nos has pedido que la visita y los certificados empiecen dentro del plazo de desistimiento (casilla al aceptar), nos abonarás solo la parte proporcional del servicio ya prestado hasta que nos lo comuniques, calculada sobre la tarifa de la propuesta.',
                `Modelo de formulario de desistimiento — A la atención de ${RESPONSABLE.nombre}, ${RESPONSABLE.domicilio}, ${RESPONSABLE.email}: «Por la presente le comunico que desisto del contrato de prestación del servicio de la propuesta n.º …, aceptada el …». Nombre, DNI y domicilio del cliente, firma (solo si se envía en papel) y fecha.`,
            ],
        },
        ...resto.slice(2),
    ];
}

/** El texto de la casilla obligatoria de /firma. */
export function textoCasillaCompromiso(reforzadas = {}) {
    return `Acepto el compromiso de cesión en exclusiva y, si tramito el ahorro con otra empresa o no firmo el Convenio de Cesión tras la visita del certificado energético, la compensación de ${textoPenalizacion(reforzadas)}.`;
}

/** El texto de la casilla OPCIONAL del inicio anticipado (art. 108.3 TRLGDCU). */
export const TEXTO_CASILLA_INICIO = 'Os pido que la visita y el certificado energético se hagan ya, dentro del plazo de desistimiento de 14 días. Si desisto después, abonaré solo lo ya hecho.';
