// ─── facturaCee.js ───────────────────────────────────────────────────────────
// FACTURA de un CEE directo: líneas, totales, texto del mensaje y el HTML del PDF.
//
// FUENTE ÚNICA del popup (vista previa en vivo) y del backend (el PDF que se
// archiva y se envía). Si cada uno calculara su total, lo que se ve en la vista
// previa y lo que llega al cliente podrían no ser la misma factura.
//
// Puro ESM y sin React: el backend lo carga por import() dinámico (ver
// project_backend_importa_frontend_esm). Por eso los imports llevan `.js`.
//
// El PDF es una RÉPLICA EXACTA de la factura de AppSheet ("APP PPTO Y FACTURAS",
// appsheet-factura-pdf/lib/facturaAppsheetHtml.js): mismas hojas, mismos bloques,
// misma paginación explícita por bloques. Dos cambios, y ninguno se ve:
//   · las tipografías van AUTO-ALOJADAS (regla 25.b), no pedidas a Google Fonts;
//   · los logos salen del módulo de la factura al S.O. (son los mismos).
// Las facturas de las dos apps van a la MISMA serie ({YY}ING_{n}) y a la misma
// carpeta: tienen que ser indistinguibles.
// ─────────────────────────────────────────────────────────────────────────────
import { BROKERGY_MARK_DATAURI, BROKERGY_CIRCULAR_DATAURI } from '../../lotes/logic/facturaLogo.js';
import { buildFontFaces, FUENTE_FACTURA_SO } from '../../expedientes/logic/fuentesDoc.js';
import { BROKERGY_EMISOR, alcanceDe, fmtEur } from './ofertaCee.js';

export { fmtEur };

/**
 * Artículos del catálogo de la hoja (pestaña ARTÍCULOS) que usa un CEE. Los ids
 * son los de AppSheet: la línea de la factura guarda el ID y la app de AppSheet
 * pinta la descripción de ese artículo, así que el concepto de nuestro PDF tiene
 * que ser literalmente el suyo. El catálogo vivo lo manda la hoja; esto es solo
 * el respaldo por si no se puede leer.
 */
export const ARTICULO_CEE = { DOBLE: '1', UNICO: '2', FINAL: '3' };
export const ARTICULO_TASA_POR_IMPORTE = { '16.39': '7', '29.1': '8', '14.69': '13', '56.31': '14', '10.19': '96c4da35' };

export const VENCIMIENTO_DIAS = 30;

// La de las facturas de CEE que ya se emitían (26ING_75 y anteriores).
export const OBSERVACIONES_FACTURA_CEE = 'Por políticas de empresa, hasta que no sea abonada la presente factura, no se entregarán los Certificados de Eficiencia Energética.';

const num = (n) => {
    if (typeof n === 'string') n = n.replace(/\s/g, '').replace(',', '.');
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
};
const r2 = (n) => Math.round(num(n) * 100) / 100;
const fmtUds = (n) => num(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) => `${num(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Una línea con sus importes ya calculados (lo mismo que escribe AppSheet). */
export function calcularLinea(l = {}) {
    const uds = num(l.uds ?? 1);
    const precio = r2(l.precio);
    const dtoPct = Math.min(100, Math.max(0, num(l.dtoPct)));
    const ivaPct = num(l.ivaPct);
    const bruto = r2(uds * precio);
    const descuento = r2(bruto * dtoPct / 100);
    const subtotal = r2(bruto - descuento);
    const iva = r2(subtotal * ivaPct / 100);
    return { articulo_id: l.articulo_id ?? null, descripcion: String(l.descripcion || ''), uds, precio, dtoPct, ivaPct, bruto, descuento, subtotal, iva };
}

/** Base, IVA, descuento y total. El IVA va POR LÍNEA: la tasa suma 0. */
export function totalesFactura(lineas = []) {
    const ls = lineas.map(calcularLinea);
    const neto = r2(ls.reduce((s, l) => s + l.subtotal, 0));
    const iva = r2(ls.reduce((s, l) => s + l.iva, 0));
    const descuento = r2(ls.reduce((s, l) => s + l.descuento, 0));
    return { lineas: ls, neto, iva, descuento, total: r2(neto + iva) };
}

/**
 * Líneas por defecto de un expediente. Si nació de una OFERTA aceptada, salen de
 * lo que el cliente aceptó (precio, descuento, tasas); si no, del alcance.
 */
export function lineasPorDefecto(expediente = {}, articulos = []) {
    const art = (id) => articulos.find(a => String(a.id) === String(id));
    const alcance = alcanceDe(expediente.alcance);
    const of = expediente.documentacion?.oferta || null;

    const idHon = ARTICULO_CEE[alcance];
    const aHon = art(idHon);
    const precio = of?.precio != null ? num(of.precio) : num(aHon?.importe ?? (alcance === 'DOBLE' ? 220 : 150));
    const lineas = [{
        articulo_id: idHon,
        descripcion: aHon?.nombre || (alcance === 'DOBLE'
            ? 'Realización de Certificado de Eficiencia Energética Inicial y Final'
            : 'Realización de Certificado de Eficiencia Energética Inicial'),
        uds: 1, precio, dtoPct: num(of?.dto_pct), ivaPct: aHon ? num(aHon.iva) * 100 : 21,
    }];

    const tasa = of?.tasa != null ? num(of.tasa) : 16.39;
    const nTasas = of?.num_tasas != null ? num(of.num_tasas) : (alcance === 'DOBLE' ? 2 : 1);
    if (tasa > 0 && nTasas > 0) {
        const idTasa = ARTICULO_TASA_POR_IMPORTE[String(r2(tasa))] || '7';
        const aTasa = art(idTasa);
        lineas.push({
            articulo_id: idTasa,
            descripcion: aTasa?.nombre || 'Tasa Certificado de Eficiencia Energética de Edificios Castilla La Mancha *',
            uds: nTasas, precio: tasa, dtoPct: 0, ivaPct: 0,
        });
    }
    return lineas;
}

/** `dd/mm/aaaa` en hora de Madrid (la del documento, no la del servidor). */
export function fechaEs(d = new Date()) {
    const x = d instanceof Date ? d : new Date(d);
    return x.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' });
}

/** Día de hoy en Madrid como `aaaa-mm-dd` (para el campo de fecha del popup). */
export function hoyIso() {
    const [d, m, y] = fechaEs(new Date()).split('/');
    return `${y}-${m}-${d}`;
}

export const isoAEs = (iso) => { const [y, m, d] = String(iso || '').split('-'); return y && m && d ? `${d}/${m}/${y}` : ''; };

export function sumarDias(iso, dias) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + dias));
    return x.toISOString().slice(0, 10);
}

const primerNombre = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const capital = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

/**
 * Mensaje de envío (WhatsApp con *negritas*; el email lo convierte). Dice cómo
 * se paga —es lo que se le pide— y por qué conviene: el certificado se entrega
 * con la factura abonada (candado de cobro).
 */
export function mensajeFactura({ nombre, numero, total, expediente, esEmpresa = false } = {}) {
    const saludo = nombre ? `¡Hola ${esEmpresa ? '' : capital(primerNombre(nombre))}!`.replace('¡Hola !', '¡Hola!') : '¡Hola!';
    return [
        saludo,
        '',
        `Te adjunto la factura *${numero || ''}*${expediente ? ` de tu certificado energético (expediente ${expediente})` : ''}.`,
        '',
        `💶 *Importe: ${fmtEur(total)}*`,
        '',
        'Puedes abonarla por transferencia a esta cuenta, indicando el nº de factura en el concepto:',
        `🏦 ${BROKERGY_EMISOR.banco} · *${BROKERGY_EMISOR.iban}*`,
        '',
        '📌 En cuanto recibamos el pago te enviamos el certificado registrado.',
        '',
        'Cualquier duda, estamos a tu disposición.',
        'Un saludo,',
        '*BROKERGY* · Ingeniería Energética',
    ].join('\n');
}

/**
 * HTML de la factura. Mismo payload que la plantilla de AppSheet:
 * { numero, fecha, vencimiento, cliente:{razon_social,direccion,cp,municipio,provincia,cif,tlf,email},
 *   lineas:[{descripcion,uds,precio,dtoPct,ivaPct}], expediente, observaciones }
 */
export function buildFacturaCeeHtml(payload = {}, { appUrl } = {}) {
    const E = BROKERGY_EMISOR;
    const { numero = '', fecha = '', vencimiento = '', cliente = {}, expediente = '', observaciones = '' } = payload;
    const { lineas, neto, iva, total } = totalesFactura(payload.lineas || []);

    const c = cliente || {};
    const cpLine = [[c.cp, c.municipio].filter(Boolean).join(' '), c.provincia ? `(${c.provincia})` : ''].filter(Boolean).join(' ');

    const GRAD = 'linear-gradient(90deg,#F39200 0%,#F8B019 30%,#CBD64A 70%,#9DC23B 100%)';
    const GREEN = '#9DC23B';
    const DARK = '#1a1f24';
    const GREY = '#5a636b';
    const GREY2 = '#7a838b';

    const COL_WIDTHS = ['', '70px', '104px', '70px', '64px', '116px'];
    const colgroup = COL_WIDTHS.map((w) => `<col${w ? ` style="width:${w}">` : '>'}`).join('');

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
          <div class="arc" style="font-weight:800; font-size:34px; letter-spacing:6px; color:${DARK}; line-height:1;">FACTURA</div>
          <div style="background:#f6f7f4; border:1px solid #ececec; border-radius:10px; padding:14px 18px; min-width:240px;">
            <div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; padding:3px 0;">
              <span style="color:${GREY2};">Nº de factura</span><span style="font-weight:700;">${esc(numero)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; padding:3px 0;">
              <span style="color:${GREY2};">Fecha de factura</span><span style="font-weight:600;">${esc(fecha)}</span>
            </div>
            ${vencimiento ? `<div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; padding:3px 0;"><span style="color:${GREY2};">Vencimiento</span><span style="font-weight:600;">${esc(vencimiento)}</span></div>` : ''}
            ${totalPages > 1 ? `<div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; padding:3px 0;"><span style="color:${GREY2};">Página</span><span style="font-weight:600;">1 de ${totalPages}</span></div>` : ''}
          </div>
        </div>
      </div>`;

    const clienteBlock = `
      <div style="padding:0 56px;">
        <div style="display:flex; gap:1px; background:#ececec; border:1px solid #ececec; border-radius:12px; overflow:hidden;">
          <div style="flex:1; background:#fff; padding:12px 24px;">
            <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Facturar a</div>
            <div style="font-weight:700; font-size:14px; margin-top:10px;">${esc(c.razon_social || '—')}</div>
            <div style="font-size:12px; line-height:1.65; color:${GREY}; margin-top:6px;">
              ${c.direccion ? `${esc(c.direccion)}<br>` : ''}
              ${cpLine ? `${esc(cpLine)}<br>` : ''}
              ${c.cif ? `CIF: ${esc(c.cif)}<br>` : ''}
              ${[c.tlf ? `Tlf: ${esc(c.tlf)}` : '', c.email ? esc(c.email) : ''].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style="width:240px; background:#fbfbf9; padding:12px 24px; display:flex; flex-direction:column; justify-content:center;">
            <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREY2}; text-transform:uppercase;">Importe total</div>
            <div class="arc" style="font-weight:800; font-size:30px; margin-top:8px; color:${DARK}; line-height:1;">${fmtEur(total)}</div>
            <div style="font-size:11px; color:${GREY2}; margin-top:8px;">${vencimiento ? `Vence el ${esc(vencimiento)}` : 'IVA incluido'}</div>
          </div>
        </div>
      </div>`;

    const miniHeader = (pageNum, totalPages) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:24px 56px 14px;">
        <div style="display:flex; align-items:center; gap:14px;">
          <img src="${BROKERGY_MARK_DATAURI}" alt="BROKERGY" style="height:26px; width:auto; object-fit:contain;">
          <div style="font-size:11.5px; color:${GREY2};">Factura <strong style="color:${DARK};">${esc(numero)}</strong> · continuación</div>
        </div>
        <div style="font-size:11px; color:${GREY2}; font-weight:600;">Página ${pageNum} de ${totalPages}</div>
      </div>`;

    const tableHeadRow = `
      <tr style="background:${DARK}; color:#fff; font-size:10.5px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase;">
        <th style="padding:13px 18px; text-align:left; font-weight:700;">Concepto</th>
        <th style="padding:13px 10px; text-align:right; font-weight:700;">Uds</th>
        <th style="padding:13px 10px; text-align:right; font-weight:700;">Precio</th>
        <th style="padding:13px 10px; text-align:right; font-weight:700;">% Dto</th>
        <th style="padding:13px 10px; text-align:right; font-weight:700;">IVA</th>
        <th style="padding:13px 18px; text-align:right; font-weight:700;">Importe</th>
      </tr>`;

    const rowHtml = (l) => `
      <tr>
        <td style="padding:11px 18px; font-size:12px; line-height:1.45; font-weight:600; color:${DARK}; border-top:1px solid #ececec;">${esc(l.descripcion)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; font-weight:600; border-top:1px solid #ececec;">${fmtUds(l.uds)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; font-weight:600; border-top:1px solid #ececec;">${fmtEur(l.precio)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; color:${GREY}; border-top:1px solid #ececec;">${fmtPct(l.dtoPct)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; color:${GREY}; border-top:1px solid #ececec;">${fmtPct(l.ivaPct)}</td>
        <td style="padding:11px 18px; text-align:right; font-size:12.5px; font-weight:700; border-top:1px solid #ececec;">${fmtEur(r2(l.subtotal + l.iva))}</td>
      </tr>`;

    const wrapTable = (rowsHtml, paddingTop, continua) => `
      <div style="padding:${paddingTop}px 56px 0;">
        <div style="border:1px solid #ececec; border-radius:8px; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <colgroup>${colgroup}</colgroup>
            <thead>${tableHeadRow}</thead>
            <tbody>${rowsHtml || `<tr><td colspan="6" style="padding:18px; font-size:12px; color:${GREY2};">Sin líneas</td></tr>`}</tbody>
          </table>
        </div>
        ${continua ? `<div style="font-size:10.5px; color:#9aa2a9; line-height:1.5; margin-top:10px; font-style:italic;">Continúa en la página siguiente →</div>` : ''}
      </div>`;

    const pagoTotalesHtml = `
      <div style="display:flex; gap:32px; padding:14px 56px 0; align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Instrucciones de pago</div>
          <div style="font-size:12px; color:${GREY}; line-height:1.6; margin-top:10px;">El pago se realizará mediante transferencia bancaria a la siguiente cuenta. Indique el nº de factura en el concepto.</div>
          <div style="margin-top:12px; border:1px solid #ececec; border-radius:10px; padding:14px 16px; background:#fbfbf9;">
            <div style="font-size:11px; color:${GREY2}; font-weight:600;">${esc(E.banco)}</div>
            <div class="arc" style="font-size:15px; font-weight:700; letter-spacing:1px; margin-top:4px; color:${DARK};">${esc(E.iban)}</div>
          </div>
        </div>
        <div style="width:300px;">
          <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:9px 4px; color:${GREY};">
            <span>Importe neto</span><span style="font-weight:600; color:${DARK};">${fmtEur(neto)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:9px 4px; color:${GREY}; border-bottom:1px solid #ececec;">
            <span>IVA</span><span style="font-weight:600; color:${DARK};">${fmtEur(iva)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; background:${GRAD}; border-radius:10px; padding:16px 18px; color:#fff;">
            <span style="font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase;">Total factura</span>
            <span class="arc" style="font-size:21px; font-weight:800;">${fmtEur(total)}</span>
          </div>
        </div>
      </div>`;

    const observacionesHtml = (observaciones || expediente)
        ? `<div style="padding:14px 56px 0;">
             <div style="border-left:3px solid ${GREEN}; padding:2px 0 2px 16px;">
               <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREY2}; text-transform:uppercase;">Observaciones</div>
               ${observaciones ? `<div style="font-size:11.5px; color:${GREY}; line-height:1.6; margin-top:6px;">${esc(observaciones)}</div>` : ''}
               ${expediente ? `<div style="font-size:11.5px; color:${GREY}; line-height:1.6; margin-top:${observaciones ? '4px' : '6px'};">Nº de expediente asociado: ${esc(expediente)}</div>` : ''}
             </div>
           </div>`
        : '';

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
        <span style="font-size:10.5px; color:#aab1b7;">BROKERGY · Factura ${esc(numero)}</span>
        <span style="font-size:10.5px; color:#aab1b7;">Página ${pageNum} de ${totalPages}</span>
      </div>`;

    // ── Bloques a paginar (idéntico a la plantilla de AppSheet) ──
    const CHARS_PER_LINE = 32;
    const rowH = (desc) => Math.max(1, Math.ceil(String(desc).length / CHARS_PER_LINE)) * 18 + 23;
    const blocks = [];
    lineas.forEach((l) => blocks.push({ type: 'row', h: rowH(l.descripcion), html: rowHtml(l) }));
    blocks.push({ type: 'tail', h: 150, html: pagoTotalesHtml });
    if (observaciones || expediente) {
        const obsLen = String(observaciones || '').length + (expediente ? 40 : 0);
        const obsLines = Math.max(1, Math.ceil(obsLen / 88)) + (observaciones && expediente ? 1 : 0);
        blocks.push({ type: 'tail', h: obsLines * 19 + 36, html: observacionesHtml });
    }

    const PAGE_H = 1122;
    const TOP_FIRST = 384;
    const TOP_CONT = 108;
    const FOOT_BIG = 88;
    const SAFETY = 14;

    const pages = [];
    let cur = { items: [], first: true };
    let used = 0;
    for (const b of blocks) {
        const top = cur.first ? TOP_FIRST : TOP_CONT;
        const cap = PAGE_H - top - FOOT_BIG - SAFETY;
        if (used + b.h > cap && used > 0) {
            pages.push(cur);
            cur = { items: [], first: false };
            used = 0;
        }
        cur.items.push(b);
        used += b.h;
    }
    pages.push(cur);
    const totalPages = pages.length;

    const sheets = pages.map((pg, idx) => {
        const pageNum = idx + 1;
        const isLast = idx === pages.length - 1;
        const rowItems = pg.items.filter((it) => it.type === 'row');
        const tailItems = pg.items.filter((it) => it.type === 'tail');
        const nextHasRows = !isLast && pages[idx + 1].items.some((it) => it.type === 'row');

        const top = pg.first ? (fullHeader(totalPages) + clienteBlock) : miniHeader(pageNum, totalPages);
        const tableHtml = (rowItems.length || (pg.first && lineas.length === 0))
            ? wrapTable(rowItems.map((it) => it.html).join(''), pg.first ? 18 : 0, nextHasRows)
            : '';
        const tailHtml = tailItems.map((it) => it.html).join('');
        const footer = isLast ? bigFooter : smallFooter(pageNum, totalPages);
        const breakAfter = isLast ? '' : 'break-after:page; page-break-after:always;';

        return `
    <div class="sheet" style="position:relative; width:100%; min-height:297mm; background:#fff; display:flex; flex-direction:column; overflow:hidden; ${breakAfter}">
      ${hairline}${top}${tableHtml}${tailHtml}${footer}
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
