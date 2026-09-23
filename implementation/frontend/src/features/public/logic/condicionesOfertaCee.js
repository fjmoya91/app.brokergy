// Condiciones y autorizaciones que el cliente acepta al pulsar «Aceptar la
// oferta» en /aceptar-cee/:token (oferta de CEE directo).
//
// Mismo criterio que las de la propuesta CAE (condicionesAceptacion.js): son
// DATOS y cada retoque sube la VERSIÓN, que se sella en la oferta al aceptarla.
// Son otras porque el servicio es otro: aquí no hay ayudas, ni Anexo I, ni
// convenio de cesión — solo el certificado.

import { RESPONSABLE } from './condicionesAceptacion';

export const CONDICIONES_OFERTA_CEE_VERSION = 'cee-2026-09-23';

export const CONDICIONES_OFERTA_CEE = [
    {
        titulo: 'Aceptación del presupuesto',
        parrafos: [
            'Al pulsar «Aceptar la oferta» contratas con BROKERGY el servicio descrito en el presupuesto que has recibido, por el importe que figura en él, y aceptas su forma de pago por transferencia bancaria.',
            'El certificado se te entrega una vez registrado y abonado el importe.',
        ],
    },
    {
        titulo: 'Visita y certificado',
        parrafos: [
            'Autorizas a BROKERGY y al técnico certificador que designe a visitar el inmueble en la fecha que acordemos contigo, tomar las medidas, fotografías y datos necesarios, y emitir y presentar en el registro oficial de tu comunidad autónoma el Certificado de Eficiencia Energética (o los certificados inicial y final, si así se indica en el presupuesto).',
            'Te comprometes a que la información y los documentos que nos aportes sean veraces y correspondan al inmueble del presupuesto.',
        ],
    },
    {
        titulo: 'Protección de datos personales',
        filas: [
            ['Responsable', `${RESPONSABLE.nombre} · CIF ${RESPONSABLE.cif} · ${RESPONSABLE.email}`],
            ['Finalidad', 'Emitir y registrar tu certificado energético, facturar el servicio y comunicarnos contigo sobre él por teléfono, email o WhatsApp.'],
            ['Legitimación', 'La ejecución del servicio que contratas al aceptar este presupuesto y el cumplimiento de las obligaciones legales que se derivan de él.'],
            ['Destinatarios', 'El técnico certificador, el colaborador que te presentó el presupuesto (si lo hay), el registro autonómico de certificados energéticos y los proveedores tecnológicos que nos prestan servicio (almacenamiento, correo y mensajería) como encargados del tratamiento.'],
            ['Conservación', 'Mientras dure el servicio y, después, durante los plazos que exija la ley.'],
            ['Derechos', `Puedes acceder, rectificar, suprimir, oponerte, limitar el tratamiento o pedir la portabilidad de tus datos escribiendo a ${RESPONSABLE.email}, y reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`],
        ],
        nota: 'No usaremos tus datos para enviarte publicidad.',
    },
];
