// ─── ofertaCee.js ────────────────────────────────────────────────────────────
// OFERTA de Certificado de Eficiencia Energética (CEE directo): importes, líneas,
// texto del mensaje y el HTML del PDF.
//
// FUENTE ÚNICA de las tres superficies que la tocan: el popup de envío (vista
// previa y total en vivo), el backend (genera el PDF que viaja por email y
// WhatsApp, y el que se archiva al aceptar) y la página pública de aceptación
// (enseña el importe). Si cada una calculara su total, el cliente podría aceptar
// en pantalla una cifra distinta de la del PDF que tiene delante.
//
// Puro ESM y sin React: el backend lo carga por import() dinámico, como cifoDoc
// (ver project_backend_importa_frontend_esm). Por eso los imports llevan `.js`.
//
// El PDF es una RÉPLICA del presupuesto de AppSheet ("APP PPTO Y FACTURAS",
// appsheet-factura-pdf/lib/presupuestoAppsheetHtml.js): hairline degradado,
// cabecera con logo y caja de datos, cliente + importe destacado, tabla oscura,
// caja de IBAN, total en degradado, observaciones con barra verde, bloque de
// aceptación y pie oscuro con eslogan. Desde el 25/10/2026 las observaciones
// son SOLO el texto libre para el cliente, y la política de entrega
// (`CONDICIONES_PRESUPUESTO`) sale siempre aparte, en letra pequeña.
//
// Desde el 24/10/2026 es la plantilla de TODOS los presupuestos (pestaña
// Facturación), no solo de los de CEE: una fila con `lineas` (las partidas del
// catálogo, ver `facturacion/logic/presupuesto.js`) se calcula y se pinta con
// ellas; una oferta antigua, sin `lineas`, con sus columnas de siempre
// (alcance, precio, tasa). Con N partidas el PDF PAGINA por bloques, igual que
// la factura (`facturaCee.js`).
// ─────────────────────────────────────────────────────────────────────────────
import { BROKERGY_MARK_DATAURI, BROKERGY_CIRCULAR_DATAURI } from '../../lotes/logic/facturaLogo.js';
// Tipografías AUTO-ALOJADAS (regla 25.b): mismas familias y pesos que el
// presupuesto de AppSheet y la factura al S.O. (Manrope + Archivo).
import { buildFontFaces, FUENTE_FACTURA_SO } from '../../expedientes/logic/fuentesDoc.js';
import { totalesLineas, alcanceDeLineas, partidasDe } from '../../facturacion/logic/presupuesto.js';

/** ¿Es un presupuesto de partidas (pestaña Facturación) y no una oferta antigua? */
export const tieneLineas = (o = {}) => Array.isArray(o?.lineas);

/** Datos fiscales del EMISOR. Los mismos del presupuesto y de la factura al S.O. */
export const BROKERGY_EMISOR = {
    razonSocial: 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL',
    direccion: 'C/ Don Sergio 12, 1º E',
    cp: '13700',
    municipio: 'Tomelloso',
    provincia: 'Ciudad Real',
    cif: 'B19350222',
    tlf: '695 615 330',
    email: 'info@brokergy.es',
    banco: 'BBVA',
    iban: 'ES10 0182 0394 3002 0175 3286',
};

/**
 * Precios por defecto. El HONORARIO va SIN IVA; la tasa de registro es la de
 * Castilla-La Mancha y va UNA POR CERTIFICADO (un encargo inicial + final
 * registra dos). Todo editable en el popup.
 */
export const PRECIO_DEFECTO = { UNICO: 150, DOBLE: 220 };
export const TASA_REGISTRO_CLM = 16.39;
export const IVA_DEFECTO = 21;

export const ALCANCES = {
    UNICO: {
        titulo: 'Certificado energético',
        sub: 'Un solo certificado (compraventa, alquiler…)',
        certificados: 1,
    },
    DOBLE: {
        titulo: 'CEE inicial y final',
        sub: 'Antes y después de la obra',
        certificados: 2,
    },
};

export const alcanceDe = (a) => (String(a || '').toUpperCase() === 'DOBLE' ? 'DOBLE' : 'UNICO');
export const numTasasDe = (alcance) => ALCANCES[alcanceDe(alcance)].certificados;

const num = (n) => {
    if (typeof n === 'string') n = n.replace(/\s/g, '').replace(',', '.');
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
};
const r2 = (n) => Math.round(num(n) * 100) / 100;

export const fmtEur = (n) => `${num(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtUds = (n) => num(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) => `${num(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Cuántas líneas ocupa un texto en el PDF (para paginar sin dejar huecos) ──
// Anchos de Manrope 600 en em, MEDIDOS con canvas a 1000 px (25/10/2026). Contar
// caracteres a 32 por línea daba a una partida de una línea dos, y un presupuesto
// de cuatro partidas saltaba de hoja con 100 px libres. La suma de las letras ya
// queda por ENCIMA de lo que pinta Chrome (el kerning la acorta: «Legalización de
// instalación de aerotermia», 237,6 sumado y 236,2 pintado en una caja de 238), y
// los pesos 400/500 son más estrechos: el error cae del lado bueno sin más margen.
const ANCHO_EM = {};
for (const [w, cs] of [[0.2, ' '], [0.245, "'"], [0.265, 'ilIíÍ'], [0.276, 'j'], [0.285, '|'], [0.287, '.'], [0.291, ','],
    [0.318, 'ª'], [0.328, ':'], [0.331, ';'], [0.345, '¡!'], [0.349, 'º'], [0.371, 'f'], [0.387, 'r'], [0.418, '/[]'],
    [0.42, '-'], [0.422, '1'], [0.423, 't'], [0.442, '"'], [0.444, '()'], [0.456, '*'], [0.489, 'J'], [0.517, 'F'],
    [0.523, '7'], [0.524, 'k'], [0.526, 'L'], [0.533, 'z'], [0.536, 's'], [0.538, 'v'], [0.54, '–'], [0.544, '¿?'],
    [0.545, 'x'], [0.549, 'y'], [0.569, 'cç'], [0.57, 'aá«»'], [0.572, '3'], [0.574, '+'], [0.58, 'EÉ'], [0.584, '5'],
    [0.587, '2'], [0.593, 'Y'], [0.597, 'eé'], [0.602, '8'], [0.603, '4'], [0.604, 'T'], [0.608, 'bgp'], [0.609, 'dq'],
    [0.61, 'oó'], [0.615, 'hnuúüñ'], [0.622, '69'], [0.625, 'B'], [0.627, 'P'], [0.629, 'V'], [0.63, 'K<>'], [0.639, 'X'],
    [0.642, '0'], [0.644, 'S'], [0.647, 'Z'], [0.651, 'R'], [0.659, 'AÁ'], [0.66, '_'], [0.663, '&'], [0.672, '€'],
    [0.691, 'D'], [0.707, 'NÑ'], [0.71, 'H'], [0.714, 'UÚÜ'], [0.723, 'G'], [0.731, 'CÇ'], [0.741, 'OQÓ'], [0.75, '='],
    [0.78, '—'], [0.791, 'w'], [0.851, 'M'], [0.882, 'm'], [0.901, '%'], [0.911, '@'], [0.928, '#'], [0.963, 'W']]) {
    for (const ch of cs) ANCHO_EM[ch] = w;
}
const anchoTexto = (t, px) => [...t].reduce((s, ch) => s + (ANCHO_EM[ch] ?? 0.7), 0) * px;

/** Líneas que ocupa `texto` en una caja de `anchoPx` a `px` de letra (corte por palabras, como el navegador). */
export function lineasTexto(texto, anchoPx, px, { preLine = false } = {}) {
    const parrafos = preLine ? String(texto ?? '').split('\n') : [String(texto ?? '').replace(/\s+/g, ' ')];
    const espacio = anchoTexto(' ', px);
    return parrafos.reduce((n, parrafo) => {
        let lineas = 1;
        let usado = 0;
        for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
            const w = anchoTexto(palabra, px);
            if (usado === 0) { usado = w; } else if (usado + espacio + w <= anchoPx) { usado += espacio + w; } else { lineas++; usado = w; }
            // Una palabra más larga que la caja: de más, nunca de menos.
            if (usado > anchoPx) { lineas += Math.ceil(usado / anchoPx) - 1; usado = usado % anchoPx; }
        }
        return n + lineas;
    }, 0);
}

/** Dirección del inmueble en una línea ("C/ Mayor 3, 13700 Tomelloso (Ciudad Real)"). */
export function direccionInmueble(o = {}) {
    const cpMuni = [o.codigo_postal, o.municipio].filter(Boolean).join(' ');
    const prov = o.provincia && o.provincia !== o.municipio ? ` (${o.provincia})` : '';
    return [o.direccion, cpMuni ? cpMuni + prov : ''].filter(Boolean).join(', ');
}

/** Qué se ofrece, dicho como lo lee el cliente. */
export function conceptoOferta(o = {}) {
    if (tieneLineas(o)) {
        // Solo certificados (y sus tasas): la frase de siempre. Con otras
        // partidas, la lista de lo que contrata.
        const cobrables = o.lineas.filter(l => !l.suplido);
        const alc = alcanceDeLineas(o.lineas);
        if (alc && cobrables.length && cobrables.every(l => l.genera)) return conceptoOferta({ alcance: alc });
        const lista = partidasDe(o.lineas).map(p => p.charAt(0).toLowerCase() + p.slice(1));
        if (!lista.length) return 'los trabajos presupuestados';
        return lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
    }
    const alcance = alcanceDe(o.alcance);
    return alcance === 'DOBLE'
        ? 'los certificados de eficiencia energética inicial y final'
        : 'el certificado de eficiencia energética';
}

/**
 * Líneas de la oferta. La tasa sale en su propia línea y SIN IVA: es un suplido
 * que se paga a la administración en nombre del cliente. Con tasa 0 (otra
 * comunidad, o la paga el cliente) no se pinta.
 */
export function lineasOferta(o = {}) {
    if (tieneLineas(o)) return totalesLineas(o.lineas).lineas;
    const alcance = alcanceDe(o.alcance);
    const precio = r2(o.precio ?? PRECIO_DEFECTO[alcance]);
    const ivaPct = num(o.iva_pct ?? IVA_DEFECTO);
    const tasa = r2(o.tasa ?? TASA_REGISTRO_CLM);
    const numTasas = Math.max(0, Math.round(num(o.num_tasas ?? numTasasDe(alcance))));

    // Conceptos CORTOS, como en los presupuestos que ya se mandaban
    // (P-26ING_39): el cliente lee qué compra, no el procedimiento.
    const honorario = alcance === 'DOBLE'
        ? 'Certificado de Eficiencia Energética inicial y final, incluida su presentación en Industria'
        : 'Certificado de Eficiencia Energética, incluida su presentación en Industria';

    // El DESCUENTO va sobre los honorarios y nunca sobre la tasa: esa es un
    // suplido que se paga a la Administración tal cual.
    const dtoPct = Math.min(100, Math.max(0, num(o.dto_pct)));
    const lineas = [{ descripcion: honorario, uds: 1, precio, dtoPct, ivaPct, subtotal: r2(precio * (1 - dtoPct / 100)) }];
    if (tasa > 0 && numTasas > 0) {
        lineas.push({
            // El rótulo de Castilla-La Mancha solo con SU importe: con otra tasa
            // es de otra comunidad y no se le puede poner ese nombre.
            descripcion: tasa === TASA_REGISTRO_CLM
                ? 'Tasa Certificado de Eficiencia Energética de Edificios Castilla-La Mancha*'
                : 'Tasa de registro del Certificado de Eficiencia Energética*',
            uds: numTasas, precio: tasa, dtoPct: 0, ivaPct: 0, subtotal: r2(tasa * numTasas),
        });
    }
    return lineas;
}

/** Base, IVA y total. El IVA se calcula POR LÍNEA: la tasa suma 0. */
export function totalesOferta(o = {}) {
    if (tieneLineas(o)) {
        // El IVA se redondea POR LÍNEA, como AppSheet y como la factura.
        const t = totalesLineas(o.lineas);
        return { lineas: t.lineas, neto: t.neto, iva: t.iva, total: t.total, tasas: t.suplidos };
    }
    const lineas = lineasOferta(o);
    const neto = r2(lineas.reduce((s, l) => s + l.subtotal, 0));
    const iva = r2(lineas.reduce((s, l) => s + l.subtotal * (l.ivaPct / 100), 0));
    return { lineas, neto, iva, total: r2(neto + iva), tasas: r2(lineas.filter(l => l.ivaPct === 0).reduce((s, l) => s + l.subtotal, 0)) };
}

// La política de entrega de los presupuestos que ya se mandaban (P-26ING_39).
// Sale en TODOS los PDF, aparte de las observaciones.
export const CONDICIONES_PRESUPUESTO = 'Por política de empresa, los informes y documentación técnica ofertados no se entregarán hasta que el presente presupuesto haya sido formalmente aceptado y se haya abonado íntegramente la factura asociada al mismo.';

/**
 * Las observaciones PARA EL CLIENTE (texto libre; '' si no hay). Hasta el
 * 25/10/2026 la columna guardaba por defecto la política de entrega, que ahora
 * sale siempre aparte: esas filas se leen sin observaciones, o saldría dos veces.
 */
export function observacionesCliente(texto) {
    const t = String(texto ?? '').trim();
    return t === CONDICIONES_PRESUPUESTO ? '' : t;
}

/** Fecha en `dd/mm/aaaa`, en hora de Madrid (la del documento, no la del servidor). */
export function fechaOferta(iso) {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' });
}

const nombreDe = (c = {}) => `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim();
const primerNombre = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const capital = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

/**
 * Mensaje de envío (WhatsApp con *negritas*; el email lo convierte). Lleva el
 * enlace de aceptación: es la acción que se le pide.
 */
export function mensajeOferta({ nombre, numero, alcance, total, url, inmueble, tasas = 1, partidas = null, abreCee = false } = {}) {
    const saludo = nombre ? `¡Hola ${capital(primerNombre(nombre))}!` : '¡Hola!';
    if (Array.isArray(partidas)) {
        // Presupuesto de partidas: se le dice QUÉ se le presupuesta, una por
        // línea (las tasas no: van dentro del total).
        return [
            saludo,
            '',
            `Te adjunto el presupuesto *${numero || ''}*${inmueble ? ` (${inmueble})` : ''}:`,
            ...partidas.map(p => `• ${p}`),
            '',
            `💶 *Importe total: ${fmtEur(total)}* (${num(tasas) > 0 ? 'IVA y tasas incluidos' : 'IVA incluido'}).`,
            '',
            'Para aceptarlo y completar tus datos, entra aquí:',
            `👉 ${url || ''}`,
            '',
            abreCee
                ? 'En cuanto lo aceptes abrimos tu expediente y el técnico se pondrá en contacto contigo para concertar la visita.'
                : 'En cuanto lo aceptes nos ponemos en marcha y te contamos los siguientes pasos.',
            '',
            '📌 Por nuestra política de calidad, no podemos iniciar ningún trabajo hasta que el presupuesto esté aceptado.',
            '',
            'Cualquier duda, estamos a tu disposición.',
            'Un saludo,',
            '*BROKERGY* · Ingeniería Energética',
        ].join('\n');
    }
    const donde = inmueble ? ` de tu vivienda en ${inmueble}` : '';
    return [
        saludo,
        '',
        `Te adjunto la oferta *${numero || ''}* para ${conceptoOferta({ alcance })}${donde}.`,
        '',
        `💶 *Importe total: ${fmtEur(total)}* (${num(tasas) > 0 ? (alcanceDe(alcance) === 'DOBLE' ? 'IVA y tasas de registro incluidos' : 'IVA y tasa de registro incluidos') : 'IVA incluido'}).`,
        '',
        'Para aceptarla y completar tus datos, entra aquí:',
        `👉 ${url || ''}`,
        '',
        'En cuanto la aceptes abrimos tu expediente y el técnico se pondrá en contacto contigo para concertar la visita.',
        '',
        '📌 Por nuestra política de calidad, no podemos iniciar ningún trabajo hasta que la oferta esté aceptada y tu número de expediente generado.',
        '',
        'Cualquier duda, estamos a tu disposición.',
        'Un saludo,',
        '*BROKERGY* · Ingeniería Energética',
    ].join('\n');
}

/**
 * HTML del PDF de la oferta.
 * @param {object} o        fila de `cee_ofertas` (o el borrador del popup)
 * @param {object} opts     { cliente, firmaUrl, appUrl }
 */
export function buildOfertaCeeHtml(o = {}, { cliente = {}, firmaUrl = '', appUrl } = {}) {
    const E = BROKERGY_EMISOR;
    const { lineas, neto, iva, total } = totalesOferta(o);
    const hayExentas = lineas.some(l => l.ivaPct === 0 && l.subtotal > 0);
    const numero = o.numero || 'BORRADOR';
    const fecha = fechaOferta(o.created_at);
    const observaciones = observacionesCliente(o.observaciones);

    const c = cliente || {};
    const nombreCli = nombreDe(c) || '—';
    const cpLine = [[c.codigo_postal, c.municipio].filter(Boolean).join(' '), c.provincia ? `(${c.provincia})` : ''].filter(Boolean).join(' ');
    const tlfCli = c.tlf || c.telefono || '';

    const GRAD = 'linear-gradient(90deg,#F39200 0%,#F8B019 30%,#CBD64A 70%,#9DC23B 100%)';
    const GREEN = '#9DC23B';
    const DARK = '#1a1f24';
    const GREY = '#5a636b';
    const GREY2 = '#7a838b';

    const colgroup = ['', '62px', '100px', '64px', '64px', '116px'].map(w => `<col${w ? ` style="width:${w}">` : '>'}`).join('');

    // Un suplido lleva su asterisco: es lo que remite a la nota de debajo.
    const conAsterisco = (l) => (l.ivaPct === 0 && l.subtotal > 0 && !/\*\s*$/.test(l.descripcion) ? `${l.descripcion}*` : l.descripcion);

    const rowHtml = (l) => `
      <tr>
        <td style="padding:11px 18px; font-size:12px; line-height:1.45; font-weight:600; color:${DARK}; border-top:1px solid #ececec;">${esc(conAsterisco(l))}${l.detalle ? `<div style="font-size:11px; font-weight:500; color:${GREY}; line-height:1.45; margin-top:3px; white-space:pre-line;">${esc(l.detalle)}</div>` : ''}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; font-weight:600; border-top:1px solid #ececec;">${fmtUds(l.uds)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; font-weight:600; border-top:1px solid #ececec;">${fmtEur(l.precio)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; color:${GREY}; border-top:1px solid #ececec;">${fmtPct(l.dtoPct || 0)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; color:${GREY}; border-top:1px solid #ececec;">${fmtPct(l.ivaPct)}</td>
        <td style="padding:11px 18px; text-align:right; font-size:12.5px; font-weight:700; border-top:1px solid #ececec;">${fmtEur(r2(l.subtotal + (l.iva ?? r2(l.subtotal * l.ivaPct / 100))))}</td>
      </tr>`;

    const btnFirma = firmaUrl
        ? `<a href="${esc(firmaUrl)}" style="text-decoration:none; display:flex; align-items:center; gap:10px; background:${DARK}; color:#fff; border-radius:10px; padding:14px 22px; font-weight:700; font-size:12.5px; letter-spacing:0.5px; white-space:nowrap;"><span class="arc">ACEPTAR LA OFERTA</span></a>`
        : `<div style="display:flex; align-items:center; gap:10px; background:${DARK}; color:#fff; border-radius:10px; padding:14px 22px; font-weight:700; font-size:12.5px; letter-spacing:0.5px; white-space:nowrap;"><span class="arc">ACEPTAR LA OFERTA</span></div>`;

    const hairline = `<div style="height:6px; width:100%; background:${GRAD};"></div>`;

    const fullHeader = (totalPages) => `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:24px 56px 12px;">
      <div style="font-size:12px; line-height:1.65; color:${GREY}; max-width:340px;">
        <img src="${BROKERGY_MARK_DATAURI}" alt="BROKERGY" style="height:42px; width:auto; object-fit:contain; display:block; margin-bottom:8px;">
        <div style="font-weight:700; color:${DARK}; font-size:12.5px; letter-spacing:0.2px;">${esc(E.razonSocial)}</div>
        <div style="margin-top:6px;">${esc(E.direccion)} · ${esc(E.cp)} ${esc(E.municipio)} (${esc(E.provincia)})</div>
        <div>CIF: ${esc(E.cif)} · Tlf: ${esc(E.tlf)}</div>
        <div>${esc(E.email)}</div>
      </div>
      <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:14px;">
        <div class="arc" style="font-weight:800; font-size:30px; letter-spacing:4px; color:${DARK}; line-height:1;">PRESUPUESTO</div>
        <div style="background:#f6f7f4; border:1px solid #ececec; border-radius:10px; padding:14px 18px; min-width:240px;">
          <div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; padding:3px 0;">
            <span style="color:${GREY2};">Nº de presupuesto</span><span style="font-weight:700;">${esc(numero)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; padding:3px 0;">
            <span style="color:${GREY2};">Fecha</span><span style="font-weight:600;">${esc(fecha)}</span>
          </div>
          ${totalPages > 1 ? `<div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; padding:3px 0;"><span style="color:${GREY2};">Página</span><span style="font-weight:600;">1 de ${totalPages}</span></div>` : ''}
        </div>
      </div>
    </div>`;

    const clienteBlock = `
    <div style="padding:0 56px;">
      <div style="display:flex; gap:1px; background:#ececec; border:1px solid #ececec; border-radius:12px; overflow:hidden;">
        <div style="flex:1; background:#fff; padding:12px 24px;">
          <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Cliente</div>
          <div style="font-weight:700; font-size:14px; margin-top:10px;">${esc(nombreCli)}</div>
          <div style="font-size:12px; line-height:1.65; color:${GREY}; margin-top:6px;">
            ${c.direccion ? `${esc(c.direccion)}<br>` : ''}
            ${cpLine ? `${esc(cpLine)}<br>` : ''}
            ${c.dni ? `NIF: ${esc(c.dni)}<br>` : ''}
            ${[tlfCli ? `Tlf: ${esc(tlfCli)}` : '', c.email ? esc(c.email) : ''].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style="width:240px; background:#fbfbf9; padding:12px 24px; display:flex; flex-direction:column; justify-content:center;">
          <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREY2}; text-transform:uppercase;">Importe total</div>
          <div class="arc" style="font-weight:800; font-size:30px; margin-top:8px; color:${DARK}; line-height:1;">${fmtEur(total)}</div>
          <div style="font-size:11px; color:${GREY2}; margin-top:8px;">IVA incluido</div>
        </div>
      </div>
    </div>`;

    const miniHeader = (pageNum, totalPages) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:24px 56px 14px;">
      <div style="display:flex; align-items:center; gap:14px;">
        <img src="${BROKERGY_MARK_DATAURI}" alt="BROKERGY" style="height:26px; width:auto; object-fit:contain;">
        <div style="font-size:11.5px; color:${GREY2};">Presupuesto <strong style="color:${DARK};">${esc(numero)}</strong> · continuación</div>
      </div>
      <div style="font-size:11px; color:${GREY2}; font-weight:600;">Página ${pageNum} de ${totalPages}</div>
    </div>`;

    const wrapTable = (rowsHtml, paddingTop, continua) => `
    <div style="padding:${paddingTop}px 56px 0;">
      <div style="border:1px solid #ececec; border-radius:8px; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
          <colgroup>${colgroup}</colgroup>
          <thead>
            <tr style="background:${DARK}; color:#fff; font-size:10.5px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase;">
              <th style="padding:13px 18px; text-align:left; font-weight:700;">Descripción</th>
              <th style="padding:13px 10px; text-align:right; font-weight:700;">Uds</th>
              <th style="padding:13px 10px; text-align:right; font-weight:700;">Precio</th>
              <th style="padding:13px 10px; text-align:right; font-weight:700;">% Dto</th>
              <th style="padding:13px 10px; text-align:right; font-weight:700;">IVA</th>
              <th style="padding:13px 18px; text-align:right; font-weight:700;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || `<tr><td colspan="6" style="padding:18px; font-size:12px; color:${GREY2};">Sin partidas</td></tr>`}</tbody>
        </table>
      </div>
      ${continua ? `<div style="font-size:10.5px; color:#9aa2a9; line-height:1.5; margin-top:10px; font-style:italic;">Continúa en la página siguiente →</div>` : ''}
    </div>`;

    const notaSuplidos = hayExentas ? `<div style="padding:10px 56px 0; font-size:10.5px; color:#9aa2a9; line-height:1.55; font-style:italic;">${tieneLineas(o)
        ? '*Las partidas con asterisco no llevan IVA: son tasas que se abonan a la Administración en nombre del cliente, como suplido'
        : '*La tasa de registro no lleva IVA: se abona a la Administración en nombre del cliente como suplido'} (art. 78.Tres.3º de la Ley 37/1992, del Impuesto sobre el Valor Añadido).</div>` : '';

    const pagoTotales = `
    <div style="display:flex; gap:32px; padding:12px 56px 0; align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Condiciones generales</div>
        <div style="font-size:12px; color:${GREY}; line-height:1.6; margin-top:10px;">La forma de pago será por transferencia bancaria a la cuenta indicada a continuación:</div>
        <div style="margin-top:12px; border:1px solid #ececec; border-radius:10px; padding:14px 16px; background:#fbfbf9;">
          <div style="font-size:11px; color:${GREY2}; font-weight:600;">${esc(E.banco)}</div>
          <div class="arc" style="font-size:15px; font-weight:700; letter-spacing:1px; margin-top:4px; color:${DARK};">${esc(E.iban)}</div>
        </div>
      </div>
      <div style="width:300px;">
        <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:9px 4px; color:${GREY};">
          <span>Base imponible</span><span style="font-weight:600; color:${DARK};">${fmtEur(neto)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:9px 4px; color:${GREY}; border-bottom:1px solid #ececec;">
          <span>IVA</span><span style="font-weight:600; color:${DARK};">${fmtEur(iva)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; background:${GRAD}; border-radius:10px; padding:16px 18px; color:#fff;">
          <span style="font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase;">Total IVA incl.</span>
          <span class="arc" style="font-size:21px; font-weight:800;">${fmtEur(total)}</span>
        </div>
      </div>
    </div>`;

    const observacionesHtml = observaciones ? `
    <div style="padding:14px 56px 0;">
      <div style="border-left:3px solid ${GREEN}; padding:2px 0 2px 16px;">
        <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Observaciones</div>
        <div style="font-size:11.5px; color:${DARK}; line-height:1.65; margin-top:6px; white-space:pre-line;">${esc(observaciones)}</div>
      </div>
    </div>` : '';

    const condiciones = `<div style="padding:12px 56px 0; font-size:10.5px; color:#9aa2a9; line-height:1.55;">${esc(CONDICIONES_PRESUPUESTO)}</div>`;

    const aceptacion = `
    <div style="padding:14px 56px 0;">
      <div style="display:flex; gap:24px; align-items:center; background:#f6f7f4; border:1px solid #ececec; border-radius:12px; padding:14px 24px;">
        <div style="flex:1;">
          <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Aceptación del presupuesto</div>
          <div style="font-size:11.5px; color:${GREY}; line-height:1.6; margin-top:8px;">En BROKERGY cuidamos del planeta y de ti. Con el objetivo de ahorrar papel y facilitarte los trámites, puedes aceptar este presupuesto de forma digital pulsando el botón:</div>
        </div>
        ${btnFirma}
      </div>
    </div>`;

    const bigFooter = `
    <div style="margin-top:auto; padding:14px 56px; background:${DARK}; display:flex; justify-content:space-between; align-items:center; gap:24px;">
      <div class="arc" style="font-weight:700; font-size:14px; line-height:1.35; color:#fff; letter-spacing:0.3px;">
        LA ENERGÍA NI SE CREA NI SE DESTRUYE,<br>
        <span style="background:linear-gradient(90deg,#F8B019,#CBD64A,#9DC23B); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">BROKERGY LA TRANSFORMA EN DINERO.</span>
      </div>
      <img src="${BROKERGY_CIRCULAR_DATAURI}" alt="" style="height:52px; width:52px; object-fit:contain; flex-shrink:0;">
    </div>`;

    const smallFooter = (pageNum, totalPages) => `
    <div style="margin-top:auto; padding:16px 56px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f1f1;">
      <span style="font-size:10.5px; color:#aab1b7;">BROKERGY · Presupuesto ${esc(numero)}</span>
      <span style="font-size:10.5px; color:#aab1b7;">Página ${pageNum} de ${totalPages}</span>
    </div>`;

    // ── Bloques a paginar (mismo método que la factura, `facturaCee.js`) ──
    // Los altos se CALCULAN con lo medido en Chrome (25/10/2026), no a ojo: el
    // texto, con `lineasTexto` (anchos reales de Manrope); el resto, el alto de
    // cada bloque. Con caracteres por línea y altos «por lo alto» la aceptación
    // saltaba sola a una segunda hoja con cuatro partidas y ~100 px libres.
    // Una partida y cada bloque del final no se parten. `check_presupuesto_paginas.mjs`.
    const ANCHO_DESC = 238;   // columna de descripción: 274 − 36 de relleno (medido)
    const rowH = (l) => lineasTexto(conAsterisco(l), ANCHO_DESC, 12) * 17.4 + 23
        + (l.detalle ? 3 + lineasTexto(l.detalle, ANCHO_DESC, 11, { preLine: true }) * 16 : 0);
    const blocks = lineas.map(l => ({ type: 'row', h: rowH(l), html: rowHtml(l) }));
    if (notaSuplidos) blocks.push({ type: 'tail', h: 43, html: notaSuplidos });
    blocks.push({ type: 'tail', h: 152, html: pagoTotales });
    if (observacionesHtml) {
        blocks.push({ type: 'tail', h: 39 + lineasTexto(observaciones, 663, 11.5, { preLine: true }) * 19, html: observacionesHtml });
    }
    blocks.push({ type: 'tail', h: 45, html: condiciones });
    blocks.push({ type: 'tail', h: 122, html: aceptacion });

    // La cabecera del cliente crece con su nombre y su dirección (columna de ~391 px).
    const lineasCli = [c.direccion, cpLine, c.dni ? `NIF: ${c.dni}` : '',
        [tlfCli ? `Tlf: ${tlfCli}` : '', c.email || ''].filter(Boolean).join(' · ')]
        .filter(Boolean).reduce((n, t) => n + lineasTexto(t, 391, 12), 0);
    const clienteH = 2 + Math.max(100, 54 + lineasTexto(nombreCli, 391, 14 * 1.04) * 19.2 + lineasCli * 19.8);

    const PAGE_H = 1122;
    const TOP_FIRST = 6 + 193 + clienteH;   // filete + cabecera + cliente
    const TOP_CONT = 6 + 64;                // filete + cabecera de continuación
    const TABLA = 43;                       // cabecera de la tabla y sus bordes
    const TABLA_FIRST = 18 + TABLA;         // en la primera hoja, con su margen
    const NOTA_CONTINUA = 26;               // «Continúa en la página siguiente →»
    const FOOT = 80;                        // el pie grande (el de las demás hojas mide 47)
    const SAFETY = 8;

    const pages = [];
    let cur = { items: [], first: true };
    let used = TABLA_FIRST + (lineas.length ? 0 : 52);   // «Sin partidas»
    const ultimaFila = blocks.filter(b => b.type === 'row').length - 1;
    let fila = -1;
    for (const b of blocks) {
        if (b.type === 'row') fila++;
        const cap = PAGE_H - (cur.first ? TOP_FIRST : TOP_CONT) - FOOT - SAFETY;
        // En una hoja sin tabla, la primera fila trae la cabecera de la tabla; y
        // una fila con más detrás reserva el aviso de que la tabla continúa.
        const extra = (b.type === 'row' && !cur.items.some(it => it.type === 'row') && !cur.first ? TABLA : 0)
            + (b.type === 'row' && fila < ultimaFila ? NOTA_CONTINUA : 0);
        if (used + extra + b.h > cap && cur.items.length > 0) {
            pages.push(cur);
            cur = { items: [], first: false };
            used = 0;
        }
        if (b.type === 'row' && !cur.items.some(it => it.type === 'row') && !cur.first) used += TABLA;
        cur.items.push(b);
        used += b.h;
    }
    pages.push(cur);
    const totalPages = pages.length;

    const sheets = pages.map((pg, idx) => {
        const pageNum = idx + 1;
        const isLast = idx === pages.length - 1;
        const rows = pg.items.filter(it => it.type === 'row');
        const tails = pg.items.filter(it => it.type === 'tail');
        const nextHasRows = !isLast && pages[idx + 1].items.some(it => it.type === 'row');
        const top = pg.first ? (fullHeader(totalPages) + clienteBlock) : miniHeader(pageNum, totalPages);
        const tableHtml = (rows.length || (pg.first && lineas.length === 0))
            ? wrapTable(rows.map(it => it.html).join(''), pg.first ? 18 : 0, nextHasRows)
            : '';
        const footer = isLast ? bigFooter : smallFooter(pageNum, totalPages);
        const breakAfter = isLast ? '' : 'break-after:page; page-break-after:always;';
        return `
  <div class="sheet" style="position:relative; width:100%; height:297mm; background:#fff; display:flex; flex-direction:column; overflow:hidden; ${breakAfter}">
    ${hairline}${top}${tableHtml}${tails.map(it => it.html).join('')}${footer}
  </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
  ${buildFontFaces(appUrl, FUENTE_FACTURA_SO)}
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Manrope', 'Segoe UI', Arial, sans-serif; color: ${DARK}; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .arc { font-family: 'Archivo', 'Arial Black', Arial, sans-serif; }
</style></head>
<body>${sheets}
</body></html>`;
}
