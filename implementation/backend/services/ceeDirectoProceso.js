// ─── ceeDirectoProceso.js ────────────────────────────────────────────────────
// EL PROCEDIMIENTO de un CEE directo, de la oferta a la entrega (2026-10-14,
// decisión del usuario). El camino normal es SIEMPRE este:
//
//   1. Presupuesto enviado y ACEPTADO (ceeOfertaService) → nace el expediente.
//   2. El técnico entrega el CEE FIRMADO y tiene el VISTO BUENO (o es de la casa
//      y se ha mandado a presentar): te llega el aviso «toca emitir la factura»
//      (`?cee=<id>&facturar=1`). La factura se emite y se envía con el enlace
//      para que el cliente SUBA EL JUSTIFICANTE de la transferencia. En un DOBLE
//      la factura cubre los dos certificados: el final ya no se cobra aparte.
//   3. El cliente sube el justificante → te llega el aviso con el enlace a
//      «Confirmar cobro» (`?cee=<id>&cobro=1`). UN clic tuyo: se marca cobrado,
//      la factura queda PAGADA en la hoja y, con el registro subido, la entrega
//      sale sola (ceeDirectoEntrega). Subir el justificante NO marca cobrado:
//      primero se mira el banco.
//   4. Entrega del certificado: firmado + registro + etiqueta (+ tasa + guía).
//      En un DOBLE el mensaje lleva el enlace para subir la FACTURA DE LA
//      INSTALACIÓN cuando la obra esté hecha.
//   5. (DOBLE) El cliente sube esa factura → te llega «ya puedes encargar el CEE
//      final». Mientras no llega, la pelota del final es del CLIENTE.
//   6. (DOBLE) Final registrado → como ya está cobrado, la entrega sale sola.
//
// Los atajos siguen ahí y son de una persona: emitir la factura cuando quieras
// («Generar factura»), avisar de que está registrado con o sin factura («Avisar
// al cliente») y entregar sin esperar al pago («Entregar sin cobrar»).
//
// Aquí vive la definición de cada paso (la pinta el panel de la ficha, `GET
// /:id/proceso`) y los avisos al EQUIPO. Al CLIENTE este servicio no le escribe
// nunca: eso lo hace una persona desde su popup (regla «te PREGUNTA la app»).
// ─────────────────────────────────────────────────────────────────────────────

const svc = require('./ceeDirectoService');
const uploads = require('./ceeDirectoUploadService');
const estados = require('../utils/ceeDirectoEstados');

const docs = () => require('./ceeDirectoDocsService');
const FRONT = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';
const enlaceApp = (id, extra = '') => `${FRONT()}/?cee=${id}${extra}`;

const nombreCliente = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');

/** Facturas emitidas del encargo, de la más antigua a la última. */
function facturas(row) {
    return Object.values(row?.documentacion?.facturas_emitidas || {})
        .filter(f => f && typeof f === 'object')
        .sort((a, b) => String(a.emitida_at || '').localeCompare(String(b.emitida_at || '')));
}
const ultimaFactura = (row) => { const f = facturas(row); return f[f.length - 1] || null; };

/** Enlace del cliente para subir el justificante de la transferencia. */
const enlacePago = (row) => docs().enlace(row, [docs().JUSTIFICANTE_PAGO]);
/** Enlace del cliente para subir la factura de la instalación (DOBLE). */
const enlaceFacturaInstalacion = (row) => docs().enlace(row, [docs().FACTURA_INSTALACION]);

/**
 * ¿La fase tiene el CEE FIRMADO y el VISTO BUENO? El visto bueno es la fase
 * REVISADA (o ya registrada), o —certificador de la casa, que no se valida
 * aparte— el encargo de presentarlo ya hecho.
 */
function firmadoConVistoBueno(row, fase, enDrive) {
    const key = fase === 'final' ? 'cee_final' : 'cee_inicial';
    const sub = String(row.seguimiento?.[key] || '').toUpperCase();
    const presentado = !!estados.encargoPresentacion(row, fase) || !!row.cee?.presentacion?.[fase]?.registrado_at;
    return !!enDrive?.pdf && (sub === 'REVISADO' || sub === 'REGISTRADO' || presentado);
}

/**
 * ¿Toca emitir la factura? Paso 2: el CEE inicial (o el único) firmado y con
 * visto bueno, sin factura todavía y sin cobrar.
 */
async function tocaFacturar(row, enDrive = null) {
    if (!row || row.cobrado || facturas(row).length) return false;
    const scan = enDrive || (row.drive_folder_id ? await uploads.scanSection(row, 'inicial') : {});
    return firmadoConVistoBueno(row, 'inicial', scan);
}

/** Aviso al EQUIPO (WhatsApp del chat de administración + email). Best-effort.
 *  `whatsapp`: otro texto para el WhatsApp (con negritas); si no, el mismo `cuerpo`. */
async function avisarEquipo({ asunto, cuerpo, whatsapp = null }) {
    const wa = process.env.WHATSAPP_ADMIN_CHAT;
    const email = process.env.ADMIN_EMAIL;
    const canales = [];
    if (wa) {
        try { await require('./whatsappService').sendText(wa, whatsapp || cuerpo); canales.push('whatsapp'); }
        catch (e) { console.warn('[cee-proceso] WA equipo:', e.message); }
    }
    if (email) {
        try {
            await require('./emailService').sendMail({
                to: email, subject: asunto, text: cuerpo,
                html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px">${cuerpo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('\n').join('<br>')}</div>`
            });
            canales.push('email');
        } catch (e) { console.warn('[cee-proceso] email equipo:', e.message); }
    }
    return canales;
}

const deQuien = (row) => {
    const n = nombreCliente(row.cliente) || row.nombre;
    return n ? ` (${n})` : '';
};

/**
 * Paso 2 → aviso «toca emitir la factura», UNA vez por encargo
 * (`documentacion.aviso_facturar`). Se llama desde los sitios donde el CEE puede
 * quedar firmado y con visto bueno: el visto bueno, el encargo de presentarlo y
 * la subida del PDF firmado. Nunca hace fallar a quien lo llama.
 */
function revisarFacturaAsync(id, contexto = '') {
    setImmediate(async () => {
        try {
            const row = await svc.cargar(id);
            if (!row || row.documentacion?.aviso_facturar) return;
            if (!(await tocaFacturar(row))) return;
            const fase = estados.nombreFase(row, 'inicial');
            const cuerpo = `🧾 ${row.numero_expediente}${deQuien(row)} — el ${fase} está FIRMADO y con el visto bueno.\n\n`
                + 'Toca emitir la factura: sale con el enlace para que el cliente suba el justificante de la transferencia. '
                + (estados.esDoble(row) ? 'Cubre los dos certificados (el final ya no se cobra aparte). ' : '')
                + `Mientras, el certificado se presenta en el Registro.\n\nEmitir y enviar la factura:\n${enlaceApp(row.id, '&facturar=1')}`;
            const canales = await avisarEquipo({ asunto: `${row.numero_expediente} — Toca emitir la factura`, cuerpo });
            await svc.mergeDoc(row.id, 'aviso_facturar', { at: new Date().toISOString(), contexto, canales });
            await svc.anotarHistorial(row.id, {
                tipo: 'FACTURA', texto: `${fase.toUpperCase()} FIRMADO Y CON VISTO BUENO: AVISO AL EQUIPO PARA EMITIR LA FACTURA`, usuario: null
            });
        } catch (e) { console.warn(`[cee-proceso] aviso de facturar (${contexto}):`, e.message); }
    });
}

/**
 * Lo que el cliente sube por su enlace y mueve el procedimiento: el JUSTIFICANTE
 * de pago (paso 3) o la FACTURA DE LA INSTALACIÓN (paso 5). Sella, lo apunta y
 * avisa al equipo con el enlace al siguiente gesto. Best-effort y en diferido:
 * la subida del cliente ya ha ido bien y no puede fallar por esto.
 */
function alSubirCliente(id, slot, ficheros = [], { porEquipo = false } = {}) {
    const d = docs();
    if (slot !== d.JUSTIFICANTE_PAGO && slot !== d.FACTURA_INSTALACION) return;
    setImmediate(async () => {
        try {
            const row = await svc.cargar(id);
            if (!row) return;
            const at = new Date().toISOString();
            const nombres = ficheros.map(f => f.name).filter(Boolean);
            const quien = porEquipo ? 'EL EQUIPO HA SUBIDO' : 'EL CLIENTE HA SUBIDO';
            if (slot === d.JUSTIFICANTE_PAGO) {
                await svc.mergeDoc(row.id, 'justificante_pago', { at, ficheros: nombres, ...(porEquipo ? { por_equipo: true } : {}) });
                await svc.anotarHistorial(row.id, { tipo: 'COBRO', texto: `${quien} EL JUSTIFICANTE DE PAGO`, usuario: porEquipo ? null : 'Cliente' });
                // Lo ha subido alguien del equipo: ya está delante de la ficha.
                if (row.cobrado || porEquipo) return;
                const fac = ultimaFactura(row);
                const enlaces = ficheros.map(f => f.link).filter(Boolean);
                const cuerpo = `💶 ${row.numero_expediente}${deQuien(row)} — el cliente ha subido el JUSTIFICANTE DE PAGO`
                    + `${fac ? ` de la factura ${fac.numero}` : ''}.\n\n`
                    + (enlaces.length ? `${enlaces.join('\n')}\n\n` : '')
                    + 'Compruébalo en el banco y confirma el cobro: con el registro subido, el certificado le sale solo.\n\n'
                    + `Confirmar el cobro:\n${enlaceApp(row.id, '&cobro=1')}`;
                await avisarEquipo({ asunto: `${row.numero_expediente} — Justificante de pago recibido`, cuerpo });
            } else {
                const primera = !row.documentacion?.factura_instalacion;
                await svc.mergeDoc(row.id, 'factura_instalacion', { at, ficheros: nombres, ...(primera ? {} : { reenviada: true }) });
                await svc.anotarHistorial(row.id, { tipo: 'CLIENTE', texto: `${quien} LA FACTURA DE LA INSTALACIÓN: SE PUEDE EMITIR EL CEE FINAL`, usuario: porEquipo ? null : 'Cliente' });
                if (porEquipo) return;
                const cuerpo = `🔧 ${row.numero_expediente}${deQuien(row)} — el cliente ha subido la FACTURA DE LA INSTALACIÓN: la obra está terminada.\n\n`
                    + `Ya puedes encargar el CEE final${row.cobrado ? ' (está cobrado: en cuanto se registre, le sale solo)' : ''}:\n${enlaceApp(row.id)}`;
                await avisarEquipo({ asunto: `${row.numero_expediente} — Obra terminada: encargar el CEE final`, cuerpo });
            }
        } catch (e) { console.warn(`[cee-proceso] subida del cliente (${slot}):`, e.message); }
    });
}

/**
 * Lo que dice el aviso al equipo cuando una fase queda REGISTRADA (las tres
 * superficies que lo mandan: rejilla, enlace del técnico y quien presenta).
 */
function siguienteTrasRegistro(row, fase) {
    if (row.cobrado) return 'Está cobrado: la entrega al cliente sale sola.';
    const fac = ultimaFactura(row);
    if (fac) {
        const enviada = (fac.envios || []).length > 0;
        return `Falta el pago: la factura ${fac.numero} ${enviada ? 'ya se le envió' : 'está emitida, SIN ENVIAR'}. `
            + 'Cuando suba el justificante te llega el aviso para confirmar el cobro, y el certificado le sale solo.\n\n'
            + `Si quieres, avísale de que ya está registrado:\n${enlaceApp(row.id, `&avisar=${fase}`)}`;
    }
    return `Avisar al cliente y emitir la factura:\n${enlaceApp(row.id, `&avisar=${fase}`)}`;
}

/**
 * Los pasos del procedimiento con su estado, para el panel de la ficha.
 * Cada paso: { clave, titulo, estado: 'hecho'|'toca'|'espera'|'pendiente'|'na', detalle, quien }
 * `siguiente` = el primer paso que no está hecho (lo que hay que mirar hoy).
 */
async function pasos(row) {
    const doble = estados.esDoble(row);
    const [ini, fin] = await Promise.all([
        row.drive_folder_id ? uploads.scanSection(row, 'inicial') : {},
        doble && row.drive_folder_id ? uploads.scanSection(row, 'final') : {},
    ]);
    const seg = row.seguimiento || {};
    const doc = row.documentacion || {};
    const fac = ultimaFactura(row);
    const enviada = fac && (fac.envios || []).length > 0;
    const faseIni = estados.nombreFase(row, 'inicial');
    const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : '');
    const out = [];

    // 1 · Presupuesto aceptado.
    out.push(doc.oferta?.aceptada_at
        ? { clave: 'oferta', titulo: 'Presupuesto aceptado', estado: 'hecho', detalle: `${doc.oferta.numero || ''} · ${fecha(doc.oferta.aceptada_at)}` }
        : { clave: 'oferta', titulo: 'Presupuesto aceptado', estado: 'na', detalle: 'Alta directa, sin presupuesto en la app' });

    // 2 · Certificado firmado con visto bueno.
    const vbIni = firmadoConVistoBueno(row, 'inicial', ini);
    out.push({
        clave: 'firmado', titulo: `${faseIni} firmado y revisado`,
        estado: vbIni ? 'hecho' : 'espera',
        detalle: vbIni ? 'Con el visto bueno' : (ini.pdf ? 'Firmado: falta el visto bueno' : 'En manos del técnico'),
        quien: vbIni ? null : (ini.pdf ? 'BROKERGY' : 'CERTIFICADOR'),
    });

    // 3 · Factura emitida y enviada.
    out.push(fac
        ? { clave: 'factura', titulo: 'Factura enviada', estado: enviada ? 'hecho' : 'toca',
            detalle: `${fac.numero} · ${Number(fac.total || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}${enviada ? ` · enviada el ${fecha(fac.envios[fac.envios.length - 1].at)}` : ' · SIN ENVIAR'}`,
            quien: enviada ? null : 'BROKERGY', accion: enviada ? null : 'facturar' }
        : { clave: 'factura', titulo: 'Factura enviada', estado: row.cobrado ? 'na' : (vbIni ? 'toca' : 'pendiente'),
            detalle: row.cobrado ? 'Cobrado sin factura de la app' : (vbIni ? 'Toca emitirla' : 'Cuando el CEE esté firmado y revisado'),
            quien: vbIni && !row.cobrado ? 'BROKERGY' : null, accion: vbIni && !row.cobrado ? 'facturar' : null });

    // 4 · Pago.
    const just = doc.justificante_pago;
    out.push(row.cobrado
        ? { clave: 'pago', titulo: 'Cobrado', estado: 'hecho', detalle: row.cobrado_at ? `El ${fecha(row.cobrado_at)}` : '' }
        : just
            ? { clave: 'pago', titulo: 'Cobro', estado: 'toca', detalle: `Justificante subido el ${fecha(just.at)}: compruébalo y confirma`, quien: 'BROKERGY', accion: 'cobro' }
            : { clave: 'pago', titulo: 'Cobro', estado: fac && enviada ? 'espera' : 'pendiente',
                detalle: fac && enviada ? 'Esperando el justificante de la transferencia' : 'Tras enviar la factura', quien: fac && enviada ? 'CLIENTE' : null });

    // 5 · Registro del inicial (va en paralelo al cobro).
    const regIni = seg.cee_inicial === 'REGISTRADO';
    out.push({
        clave: 'registro', titulo: `${faseIni} registrado`, estado: regIni ? 'hecho' : (vbIni ? 'espera' : 'pendiente'),
        detalle: regIni ? (doc.fecha_registro_cee_inicial ? `El ${fecha(doc.fecha_registro_cee_inicial)}` : '') : (estados.encargoPresentacion(row, 'inicial') ? 'Presentándose' : ''),
        quien: regIni ? null : (estados.encargoPresentacion(row, 'inicial') ? 'PRESENTADOR' : (vbIni ? 'CERTIFICADOR' : null)),
    });

    // 6 · Entrega del inicial.
    const entIni = doc.entrega_cliente?.inicial;
    out.push({
        clave: 'entrega', titulo: `${faseIni} entregado al cliente`, estado: entIni ? 'hecho' : 'pendiente',
        detalle: entIni ? `El ${fecha(entIni.at)}${entIni.automatica ? ' · automático' : ''}` : 'Sale solo con el cobro y el registro',
    });

    if (doble) {
        // 7 · Obra terminada: la factura de la instalación.
        const fi = doc.factura_instalacion;
        const finEmpezado = seg.cee_final && seg.cee_final !== 'PTE_ENVIO_CERT';
        out.push(fi || finEmpezado
            ? { clave: 'obra', titulo: 'Obra terminada', estado: 'hecho', detalle: fi ? `Factura de la instalación subida el ${fecha(fi.at)}` : 'CEE final ya encargado' }
            : { clave: 'obra', titulo: 'Obra terminada', estado: entIni ? 'espera' : 'pendiente',
                detalle: 'Esperando la factura de la instalación', quien: entIni ? 'CLIENTE' : null });

        // 8 · CEE final registrado.
        const regFin = seg.cee_final === 'REGISTRADO';
        out.push({
            clave: 'final', titulo: 'CEE final registrado', estado: regFin ? 'hecho' : ((fi || finEmpezado) ? 'espera' : 'pendiente'),
            detalle: regFin ? '' : (finEmpezado ? estados.deriveEstado(row) : (fi ? 'Toca encargarlo' : '')),
            quien: regFin ? null : (fi && !finEmpezado ? 'BROKERGY' : (finEmpezado ? estados.responsable(row) : null)),
            accion: fi && !finEmpezado ? 'encargar_final' : null,
            firmado: !!fin.pdf,
        });

        // 9 · Entrega del final.
        const entFin = doc.entrega_cliente?.final;
        out.push({
            clave: 'entrega_final', titulo: 'CEE final entregado', estado: entFin ? 'hecho' : 'pendiente',
            detalle: entFin ? `El ${fecha(entFin.at)}${entFin.automatica ? ' · automático' : ''}`
                : row.cobrado ? 'Sale solo en cuanto se registre (ya está cobrado)' : 'Sale solo con el cobro y el registro',
        });
    }

    const siguiente = out.find(p => p.estado === 'toca') || out.find(p => p.estado === 'espera') || null;
    return { pasos: out, siguiente, doble, cobrado: !!row.cobrado, factura: fac ? { numero: fac.numero, total: fac.total, enviada: !!enviada } : null };
}

module.exports = {
    facturas,
    ultimaFactura,
    enlacePago,
    enlaceFacturaInstalacion,
    firmadoConVistoBueno,
    tocaFacturar,
    revisarFacturaAsync,
    alSubirCliente,
    siguienteTrasRegistro,
    pasos,
    avisarEquipo,
};
