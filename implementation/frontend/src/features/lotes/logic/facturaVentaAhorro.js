// ─── facturaVentaAhorro.js ───────────────────────────────────────────────────
// La FACTURA de VENTA DEL AHORRO cuando el cliente es una EMPRESA (o una entidad:
// comunidad de bienes, parroquia, sociedad…). Fase 7 del lote, 04/11/2026 (Fran).
//
// Un particular nos cede el ahorro y le transferimos el bono sin más. Una empresa
// no: VENDE el ahorro a SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL, y esa
// venta se documenta con una FACTURA suya (la de la Parroquia de San José Obrero,
// 25TER100_1: «Venta de Ahorros Energéticos para la emisión de CAE», 21 % de IVA).
// Hay dos caminos y los dos acaban en lo mismo: con la factura, se le paga.
//
//   · AUTOFACTURA («facturación por el destinatario», art. 5 del Reglamento de
//     facturación, RD 1619/2012) — lo que hace Iberdrola con nosotros. La EXPEDIMOS
//     nosotros en su nombre y por su cuenta. La ley pide: (a) un ACUERDO PREVIO por
//     escrito que diga cómo acepta el proveedor cada factura, (b) que se le remita
//     para que la acepte, (c) una SERIE ESPECÍFICA (art. 6.1.a) y (d) la mención
//     «Facturación por el destinatario» (art. 6.1.m). En la app: el cliente abre su
//     enlace, ACEPTA el acuerdo (nombre y DNI de quien firma), en ese momento se
//     expide la factura, y la ACEPTA. Es el camino recomendado: no depende de que
//     el cliente sepa hacer una factura.
//   · FACTURA DEL CLIENTE — se le manda un MODELO ya relleno (sus datos, los
//     nuestros, el concepto, el importe y el IVA) para que la emita él; cuando la
//     manda, se sube en la fase 7 y queda lista para pagar.
//   · NO PROCEDE — la entidad no hace actividad empresarial (lo decide el ADMIN,
//     con su motivo): se le paga como a un particular.
//
// REGLA — la BASE es lo que se le iba a transferir: el bono VERIFICADO menos los
// honorarios si eligió descontarlos (la MISMA cuenta que la remesa), y el IVA va
// ENCIMA (como la factura de la Parroquia). Lo que se transfiere es el TOTAL de la
// factura, IVA incluido.
// REGLA — sin factura ACEPTADA o RECIBIDA (o «no procede»), una empresa NO entra
// en la remesa: es la factura la que justifica el pago.
//
// FUENTE ÚNICA de las líneas, las observaciones, el número, el acuerdo y los
// mensajes: el backend (services/facturaVentaAhorro.js) lo carga por import() y el
// popup y la página pública solo enseñan lo que les llega. Puro ESM, sin React.
// ─────────────────────────────────────────────────────────────────────────────
import { BROKERGY_EMISOR } from '../../cee-directo/logic/ofertaCee.js';
import { eurEs, FIRMA_COBRO } from '../../cobro/logic/cobroForm.js';

export const IVA_VENTA_DEFECTO = 21;
export const MODOS_VENTA = ['autofactura', 'cliente', 'no_procede'];

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const txt = (v) => (v == null ? '' : String(v).trim());

/**
 * Un importe ESCRITO por una persona: «9.820,00», «9820,00», «9820.00», «9.820 €».
 * Con coma, los puntos son de miles; sin coma, un punto con 1-2 decimales es el
 * decimal. Devuelve null si no hay número.
 */
export function leerImporte(v) {
    let t = String(v ?? '').replace(/[^\d.,-]/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Los estados y lo que significan, en una frase cada uno. */
export const ESTADOS_VENTA = {
    PEDIDA: 'Pedida al cliente',
    PENDIENTE_ACEPTACION: 'Autofactura expedida, falta que la acepte',
    ACEPTADA: 'Autofactura aceptada',
    RECHAZADA: 'El cliente dice que hay un error',
    RECIBIDA: 'Su factura recibida',
    NO_PROCEDE: 'No procede factura',
};

/** ¿Justifica ya el pago? Solo una factura aceptada o recibida, o «no procede». */
export function ventaListaParaPagar(reg) {
    return !!reg && ['ACEPTADA', 'RECIBIDA', 'NO_PROCEDE'].includes(reg.estado);
}

/**
 * La línea: UNA, la venta del ahorro, a 1 ud por la base. Con kWh y €/kWh en el
 * detalle (como la de la Parroquia) pero sin multiplicarlos: kWh × precio
 * redondeado no da al céntimo el bono verificado, y la factura tiene que cuadrar
 * con lo que se transfiere. Si se descuentan los honorarios, el detalle lo
 * cuenta (la cláusula del convenio dice que se DEDUCEN de la contraprestación)
 * y la base ya va neta: con una línea negativa aparte, el IVA por línea podía
 * no cuadrar al céntimo con el IVA de la base.
 */
export function lineasVentaAhorro({ bono, kwh = null, expediente = '', descuento = 0, ivaPct = IVA_VENTA_DEFECTO } = {}) {
    const b = r2(bono);
    const d = Number(descuento) > 0 ? r2(descuento) : 0;
    const k = Number(kwh) > 0 ? Math.round(Number(kwh)) : null;
    const precioKwh = k ? b / k : null;
    const detalle = [
        expediente ? `Expediente ${expediente}` : '',
        k ? `Ahorro verificado: ${k.toLocaleString('es-ES')} kWh × ${precioKwh.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 4 })} €/kWh = ${eurEs(b)}` : '',
        d ? `Menos ${eurEs(d)} de costes de gestión técnica y administrativa (Convenio de Cesión)` : '',
    ].filter(Boolean).join('\n');
    const iva = ivaPct != null && ivaPct !== '' && Number.isFinite(Number(ivaPct)) ? Number(ivaPct) : IVA_VENTA_DEFECTO;
    return [{
        descripcion: 'Venta de Ahorros Energéticos para la emisión de Certificados de Ahorro Energético (CAE)',
        detalle, uds: 1, precio: r2(b - d), dtoPct: 0, ivaPct: iva,
    }];
}

/**
 * Nº de la autofactura. Serie ESPECÍFICA de las expedidas por el destinatario
 * (art. 6.1.a): «AF-{año}-{nnn}», correlativa POR PROVEEDOR (por su CIF), porque
 * la serie es de SU libro de facturas emitidas, no del nuestro.
 */
export function numeroAutofactura(anio, n) {
    return `AF-${anio}-${String(n).padStart(3, '0')}`;
}

/** El siguiente n de un año, sabiendo los números que ese CIF ya tiene. */
export function siguienteNumero(numeros = [], anio) {
    const pref = `AF-${anio}-`;
    const usados = numeros.filter(x => String(x || '').startsWith(pref)).map(x => parseInt(String(x).slice(pref.length), 10)).filter(Number.isFinite);
    return numeroAutofactura(anio, (usados.length ? Math.max(...usados) : 0) + 1);
}

/** Observaciones del PDF. La AUTOFACTURA lleva las menciones que la ley exige. */
export function observacionesVenta({ modo, expediente, lote, razonSocialCliente } = {}) {
    const base = `Contraprestación por la cesión del ahorro energético del expediente ${expediente || ''}${lote ? ` (${lote})` : ''}, conforme al Convenio de Cesión de Ahorros firmado entre las partes.`;
    if (modo === 'autofactura') {
        return [
            'FACTURACIÓN POR EL DESTINATARIO (art. 5 y 6.1.m del Reglamento de facturación, RD 1619/2012).',
            `Factura expedida por ${BROKERGY_EMISOR.razonSocial} (${BROKERGY_EMISOR.cif}) en nombre y por cuenta de ${razonSocialCliente || 'el proveedor'}, según el acuerdo previo de facturación aceptado por este, quien la acepta expresamente.`,
            base,
        ].join('\n');
    }
    return base;
}

/**
 * El ACUERDO PREVIO de facturación por el destinatario (art. 5.2 RD 1619/2012).
 * Corto, para leerse en el móvil, y con lo que la ley pide: que lo expide el
 * destinatario, en nombre y por cuenta del proveedor, y CÓMO se acepta cada
 * factura (aquí: en este enlace, con nombre y DNI de quien firma; sin
 * aceptación no se paga).
 */
export function textoAcuerdo({ razonSocial, cif, representante, dniRepresentante } = {}) {
    const quien = representante
        ? `${representante}${dniRepresentante ? ` (DNI ${dniRepresentante})` : ''}, en nombre y representación de ${razonSocial || '—'} (${cif || '—'})`
        : `${razonSocial || '—'} (${cif || '—'})`;
    return [
        `${quien}, en adelante el PROVEEDOR, y ${BROKERGY_EMISOR.razonSocial} (${BROKERGY_EMISOR.cif}), en adelante el DESTINATARIO, acuerdan:`,
        '1. Que las facturas por la venta al DESTINATARIO de los ahorros energéticos cedidos por el PROVEEDOR para la emisión de Certificados de Ahorro Energético las expida materialmente el DESTINATARIO, en nombre y por cuenta del PROVEEDOR (artículo 5 del Reglamento por el que se regulan las obligaciones de facturación, RD 1619/2012).',
        '2. Que esas facturas se numeren en una serie específica («AF») y lleven la mención «Facturación por el destinatario».',
        '3. Que el DESTINATARIO remita cada factura al PROVEEDOR por medios electrónicos, y que el PROVEEDOR la acepte o señale sus errores desde el enlace que la acompaña, identificándose con su nombre y documento. Una factura no aceptada no se paga.',
        '4. Que el PROVEEDOR sigue siendo el responsable de declarar e ingresar el IVA repercutido en ellas.',
        '5. Que este acuerdo vale para las facturas de esta relación hasta que cualquiera de las partes lo revoque por escrito.',
    ];
}

const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const primerNombre = (s) => String(s || '').trim().split(/\s+/)[0] || '';

/**
 * El WhatsApp / email con el que se le pide. Con *negritas* de WhatsApp y sin
 * prometer fecha de ingreso (regla de todo el cobro).
 *   · autofactura: qué es, por qué así y el enlace (al FINAL, como el del cobro).
 *   · cliente: que nos emita la factura con el modelo adjunto y a dónde mandarla.
 */
// ── Lo que se le EXPLICA al cliente (el formulario de cobro y su página) ────
//
// Fran, 05/11/2026: «se le dan dos opciones: hazme una autofactura, y se le
// explica todo; o yo te emito la factura, y se le mandan los datos que debe
// poner. Se le debe explicar bien al cliente.» Los mismos textos en el bloque
// del formulario, en /factura-ahorro y en los mensajes: si cada sitio lo
// contase a su manera, el cliente leería dos versiones de lo mismo.

/** Por qué una empresa tiene que facturar (lo primero que se le cuenta). */
export const POR_QUE_FACTURA = 'Como sois una empresa, la ayuda no os llega como una subvención: nos vendéis el ahorro energético que habéis conseguido, y ese pago, como cualquier venta, tiene que ir con su factura a nuestro nombre. Es un trámite fiscal: no cambia lo que vais a cobrar.';

/** La autofactura, contada en cuatro pasos. */
export const PASOS_AUTOFACTURA = [
    { titulo: 'La hacemos nosotros por vosotros', texto: 'Preparamos la factura en vuestro nombre, con los datos, el concepto y el IVA bien puestos. Es lo que la ley llama «facturación por el destinatario» (art. 5 del Reglamento de facturación) y es la misma fórmula que usan las eléctricas con sus clientes.' },
    { titulo: 'Aceptáis un acuerdo, una sola vez', texto: 'La ley pide que antes nos autoricéis por escrito. Se hace en el enlace, con el nombre y el DNI de quien firma por la empresa, y veis el texto entero antes de aceptarlo.' },
    { titulo: 'Revisáis la factura y la aceptáis', texto: 'En ese momento se expide la factura con su número (serie «AF») y la veis en PDF. Si está bien, la aceptáis; si hay algo mal, nos lo decís y la corregimos.' },
    { titulo: 'La registráis como vuestra', texto: 'Es una factura emitida por vosotros: pasádsela a vuestra gestoría para que la apunte en vuestro libro de facturas emitidas y declare su IVA, como cualquier otra venta.' },
];

/** Si la emite él: lo que tiene que hacer. */
export const PASOS_CLIENTE = [
    { titulo: 'Os damos los datos exactos', texto: 'A nombre de quién, el concepto, la base, el IVA y el total, y un modelo en PDF ya relleno para copiarlo.' },
    { titulo: 'La hacéis con vuestro programa', texto: 'Con vuestro número de factura, vuestra serie y vuestra cuenta, como cualquier factura que emitís.' },
    { titulo: 'Nos la mandáis', texto: 'La subís en el enlace (o nos la mandáis por WhatsApp o a info@brokergy.es). En cuanto la recibamos y la comprobemos, os hacemos la transferencia.' },
];

/**
 * El bloque del FORMULARIO DE COBRO para una empresa: ¿quién hace la factura?
 * Obligatorio (de él depende cómo se le paga) y DESPUÉS de la forma de pago,
 * que fija la base. Lo pinta el mismo componente que las demás preguntas.
 */
export function bloqueFacturaVenta({ ivaPct = IVA_VENTA_DEFECTO } = {}) {
    return {
        id: 'factura_venta',
        icono: '🧾',
        titulo: 'La factura de la venta',
        pregunta: '¿Quién hace la factura?',
        ayuda: POR_QUE_FACTURA,
        obligatorio: true,
        iva_pct: ivaPct,
        // Lo que se cuenta de cada opción, en pasos (lo pinta la vista).
        explicacion: { autofactura: PASOS_AUTOFACTURA, cliente: PASOS_CLIENTE },
        opciones: [
            {
                value: 'autofactura',
                icono: '✍️',
                label: 'Hacédmela vosotros (autofactura)',
                sub: 'La preparamos nosotros en vuestro nombre. Solo tenéis que aceptar un acuerdo y revisar la factura en el enlace: dos minutos, sin programa de facturación y lo más rápido para cobrar.',
                corto: 'Autofactura',
                recomendada: true,
            },
            {
                value: 'cliente',
                icono: '🧾',
                label: 'La emito yo',
                sub: 'Os damos los datos exactos y un modelo para que la hagáis con vuestro programa. La transferencia sale cuando nos llegue vuestra factura.',
                corto: 'La emite el cliente',
            },
        ],
    };
}

/**
 * Lo que tiene que llevar SU factura, campo a campo (la página, el modelo y el
 * WhatsApp lo cuentan con estas mismas filas).
 */
export function datosFacturaCliente({ base, ivaPct = IVA_VENTA_DEFECTO, iva = null, total = null, kwh = null, expediente = '' } = {}) {
    const E = BROKERGY_EMISOR;
    const pct = ivaPct != null && ivaPct !== '' && Number.isFinite(Number(ivaPct)) ? Number(ivaPct) : IVA_VENTA_DEFECTO;
    const b = r2(base);
    const i = iva != null ? r2(iva) : r2(b * pct / 100);
    const t = total != null ? r2(total) : r2(b + i);
    const k = Number(kwh) > 0 ? Math.round(Number(kwh)) : null;
    return [
        { campo: 'A nombre de', valor: E.razonSocial },
        { campo: 'CIF', valor: E.cif },
        { campo: 'Dirección', valor: `${E.direccion}, ${E.cp} ${E.municipio} (${E.provincia})` },
        { campo: 'Concepto', valor: `Venta de Ahorros Energéticos para la emisión de Certificados de Ahorro Energético (CAE). Expediente ${expediente || ''}${k ? ` · ${k.toLocaleString('es-ES')} kWh de ahorro verificado` : ''}` },
        { campo: 'Base imponible', valor: eurEs(b) },
        { campo: pct > 0 ? `IVA (${pct} %)` : 'IVA', valor: pct > 0 ? eurEs(i) : 'Operación no sujeta' },
        { campo: 'Total', valor: eurEs(t), destacado: true },
        { campo: 'Forma de pago', valor: 'Transferencia a vuestra cuenta' },
    ];
}

/** Las mismas filas en texto (para copiar, o para el WhatsApp con negritas). */
export function textoDatosFactura(filas = [], { negritas = false } = {}) {
    return filas.map(f => `${negritas ? '*' : ''}${f.campo}:${negritas ? '*' : ''} ${f.valor}`).join('\n');
}

export function mensajeVentaAhorro({ modo, nombre, esTercero = false, razonSocial, total, base, ivaPct, iva = null, kwh = null, expediente, enlace } = {}) {
    const saludo = nombre && esTercero ? `¡Hola ${capital(primerNombre(nombre))}!` : '¡Hola!';
    const importe = `*Importe: ${eurEs(total)}*${base != null ? ` (${eurEs(base)}${Number(ivaPct) > 0 ? ` + ${ivaPct} % de IVA` : ''})` : ''}`;
    const quien = razonSocial ? ` de *${razonSocial}*` : '';
    const intro = `Ya tenemos el ahorro verificado del expediente *${expediente || ''}*${quien}. Como sois una empresa, la ayuda no os llega como una subvención: nos *vendéis el ahorro energético*, y ese pago tiene que ir con su factura a nuestro nombre.`;
    if (modo === 'autofactura') {
        return [
            saludo,
            '',
            intro,
            '',
            'Para que no tengáis que hacerla vosotros, la preparamos nosotros en vuestro nombre: es la *autofactura* («facturación por el destinatario», art. 5 del Reglamento de facturación), la misma fórmula que usan las eléctricas.',
            '',
            importe,
            '',
            'En el enlace:',
            '1. Aceptáis el acuerdo de facturación (una sola vez, con el nombre y el DNI de quien firma por la empresa).',
            '2. Revisáis la factura y la aceptáis, o nos decís qué hay que corregir.',
            '3. En cuanto esté aceptada, os hacemos la transferencia.',
            '',
            'Es una factura emitida por vosotros: pasádsela a vuestra gestoría para que la registre y declare su IVA.',
            '',
            ...FIRMA_COBRO,
            '',
            `👉 Revisa y acepta la factura aquí: ${enlace || ''}`,
        ].join('\n');
    }
    // REGLA — si la emite él, se le mandan los DATOS escritos, no solo un PDF:
    // es lo que va a copiar en su programa de facturación.
    const filas = datosFacturaCliente({ base, ivaPct, iva, total, kwh, expediente });
    return [
        saludo,
        '',
        intro,
        '',
        'Estos son los datos que tiene que llevar vuestra factura:',
        '',
        textoDatosFactura(filas, { negritas: true }),
        '',
        'Os adjunto además un *modelo* ya relleno: basta con pasarlo a vuestro programa, con vuestro número de factura y vuestra cuenta.',
        '',
        `Cuando la tengáis, ${enlace ? 'subidla en el enlace o ' : ''}mandádnosla por aquí o a info@brokergy.es. En cuanto la recibamos, os hacemos la transferencia.`,
        '',
        ...FIRMA_COBRO,
        ...(enlace ? ['', `👉 Sube aquí vuestra factura: ${enlace}`] : []),
    ].join('\n');
}

/** Lo que se le dice al equipo cuando el cliente acepta o señala un error. */
export function avisoEquipoVenta({ accion, expediente, razonSocial, numero, total, firmante, motivo } = {}) {
    if (accion === 'aceptada') {
        return `✅ ${expediente} · ${razonSocial || ''}: ha ACEPTADO la autofactura ${numero || ''} (${eurEs(total)})${firmante ? `, firma ${firmante}` : ''}. Ya puede entrar en la remesa.`;
    }
    if (accion === 'rechazada') {
        return `⚠ ${expediente} · ${razonSocial || ''}: dice que la autofactura ${numero || ''} tiene un error: «${txt(motivo)}». Revísala en la fase 7 del lote y rehazla.`;
    }
    if (accion === 'elegida') {
        return motivo === 'cliente'
            ? `🧾 ${expediente} · ${razonSocial || ''}: en el formulario de cobro ha elegido EMITIR ÉL la factura de venta del ahorro${total ? ` (${eurEs(total)})` : ''}. Falta que la suba en su enlace.`
            : `✍️ ${expediente} · ${razonSocial || ''}: en el formulario de cobro ha elegido la AUTOFACTURA${total ? ` (${eurEs(total)})` : ''}. Falta que acepte el acuerdo y la factura en su enlace.`;
    }
    if (accion === 'subida') {
        return `📥 ${expediente} · ${razonSocial || ''}: ha SUBIDO su factura de venta del ahorro ${numero || ''} (${eurEs(total)}). Revísala en la fase 7 del lote antes de la remesa.`;
    }
    return `📝 ${expediente} · ${razonSocial || ''}: ha aceptado el acuerdo de facturación; expedida la autofactura ${numero || ''} (${eurEs(total)}), pendiente de que la acepte.`;
}
