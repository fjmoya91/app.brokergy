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
// aceptación y pie oscuro con eslogan. Una oferta tiene dos líneas como mucho,
// así que cabe SIEMPRE en una hoja y no necesita la paginación de aquel.
// ─────────────────────────────────────────────────────────────────────────────
import { BROKERGY_MARK_DATAURI, BROKERGY_CIRCULAR_DATAURI } from '../../lotes/logic/facturaLogo.js';
// Tipografías AUTO-ALOJADAS (regla 25.b): mismas familias y pesos que el
// presupuesto de AppSheet y la factura al S.O. (Manrope + Archivo).
import { buildFontFaces, FUENTE_FACTURA_SO } from '../../expedientes/logic/fuentesDoc.js';

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

/** Dirección del inmueble en una línea ("C/ Mayor 3, 13700 Tomelloso (Ciudad Real)"). */
export function direccionInmueble(o = {}) {
    const cpMuni = [o.codigo_postal, o.municipio].filter(Boolean).join(' ');
    const prov = o.provincia && o.provincia !== o.municipio ? ` (${o.provincia})` : '';
    return [o.direccion, cpMuni ? cpMuni + prov : ''].filter(Boolean).join(', ');
}

/** Qué se ofrece, dicho como lo lee el cliente. */
export function conceptoOferta(o = {}) {
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
    const lineas = lineasOferta(o);
    const neto = r2(lineas.reduce((s, l) => s + l.subtotal, 0));
    const iva = r2(lineas.reduce((s, l) => s + l.subtotal * (l.ivaPct / 100), 0));
    return { lineas, neto, iva, total: r2(neto + iva), tasas: r2(lineas.filter(l => l.ivaPct === 0).reduce((s, l) => s + l.subtotal, 0)) };
}

// Las de los presupuestos que ya se mandaban (P-26ING_39).
export function observacionesDefecto() {
    return 'Por política de empresa, los informes y documentación técnica ofertados no se entregarán hasta que el presente presupuesto haya sido formalmente aceptado y se haya abonado íntegramente la factura asociada al mismo.';
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
export function mensajeOferta({ nombre, numero, alcance, total, url, inmueble, tasas = 1 } = {}) {
    const saludo = nombre ? `¡Hola ${capital(primerNombre(nombre))}!` : '¡Hola!';
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
    const observaciones = o.observaciones ?? observacionesDefecto(o.alcance);

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

    const rowHtml = (l) => `
      <tr>
        <td style="padding:11px 18px; font-size:12px; line-height:1.45; font-weight:600; color:${DARK}; border-top:1px solid #ececec;">${esc(l.descripcion)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; font-weight:600; border-top:1px solid #ececec;">${fmtUds(l.uds)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; font-weight:600; border-top:1px solid #ececec;">${fmtEur(l.precio)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; color:${GREY}; border-top:1px solid #ececec;">${fmtPct(l.dtoPct || 0)}</td>
        <td style="padding:11px 10px; text-align:right; font-size:12px; color:${GREY}; border-top:1px solid #ececec;">${fmtPct(l.ivaPct)}</td>
        <td style="padding:11px 18px; text-align:right; font-size:12.5px; font-weight:700; border-top:1px solid #ececec;">${fmtEur(r2(l.subtotal * (1 + l.ivaPct / 100)))}</td>
      </tr>`;

    const btnFirma = firmaUrl
        ? `<a href="${esc(firmaUrl)}" style="text-decoration:none; display:flex; align-items:center; gap:10px; background:${DARK}; color:#fff; border-radius:10px; padding:14px 22px; font-weight:700; font-size:12.5px; letter-spacing:0.5px; white-space:nowrap;"><span class="arc">ACEPTAR LA OFERTA</span></a>`
        : `<div style="display:flex; align-items:center; gap:10px; background:${DARK}; color:#fff; border-radius:10px; padding:14px 22px; font-weight:700; font-size:12.5px; letter-spacing:0.5px; white-space:nowrap;"><span class="arc">ACEPTAR LA OFERTA</span></div>`;

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
<body>
  <div class="sheet" style="position:relative; width:100%; min-height:297mm; background:#fff; display:flex; flex-direction:column; overflow:hidden;">
    <div style="height:6px; width:100%; background:${GRAD};"></div>

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
        </div>
      </div>
    </div>

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
    </div>

    <div style="padding:18px 56px 0;">
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
          <tbody>${lineas.map(rowHtml).join('')}</tbody>
        </table>
      </div>
    </div>

    ${hayExentas ? `<div style="padding:10px 56px 0; font-size:10.5px; color:#9aa2a9; line-height:1.55; font-style:italic;">*La tasa de registro no lleva IVA: se abona a la Administración en nombre del cliente como suplido (art. 78.Tres.3º de la Ley 37/1992, del Impuesto sobre el Valor Añadido).</div>` : ''}

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
    </div>

    ${observaciones ? `
    <div style="padding:14px 56px 0;">
      <div style="border-left:3px solid ${GREEN}; padding:2px 0 2px 16px;">
        <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREY2}; text-transform:uppercase;">Observaciones adicionales</div>
        <div style="font-size:11.5px; color:${GREY}; line-height:1.65; margin-top:6px; white-space:pre-line;">${esc(observaciones)}</div>
      </div>
    </div>` : ''}

    <div style="padding:14px 56px 0;">
      <div style="display:flex; gap:24px; align-items:center; background:#f6f7f4; border:1px solid #ececec; border-radius:12px; padding:14px 24px;">
        <div style="flex:1;">
          <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Aceptación del presupuesto</div>
          <div style="font-size:11.5px; color:${GREY}; line-height:1.6; margin-top:8px;">En BROKERGY cuidamos del planeta y de ti. Con el objetivo de ahorrar papel y facilitarte los trámites, puedes aceptar este presupuesto de forma digital pulsando el botón:</div>
        </div>
        ${btnFirma}
      </div>
    </div>

    <div style="margin-top:auto; padding:14px 56px; background:${DARK}; display:flex; justify-content:space-between; align-items:center; gap:24px;">
      <div class="arc" style="font-weight:700; font-size:14px; line-height:1.35; color:#fff; letter-spacing:0.3px;">
        LA ENERGÍA NI SE CREA NI SE DESTRUYE,<br>
        <span style="background:linear-gradient(90deg,#F8B019,#CBD64A,#9DC23B); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">BROKERGY LA TRANSFORMA EN DINERO.</span>
      </div>
      <img src="${BROKERGY_CIRCULAR_DATAURI}" alt="" style="height:52px; width:52px; object-fit:contain; flex-shrink:0;">
    </div>
  </div>
</body></html>`;
}
