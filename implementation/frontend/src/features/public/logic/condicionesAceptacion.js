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
