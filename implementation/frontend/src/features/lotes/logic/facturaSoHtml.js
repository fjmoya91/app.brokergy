// ============================================================
// facturaSoHtml.js — Factura de venta de CAEs al Sujeto Obligado
//
// Recreación FIEL del rediseño de Claude Design (handoff "Rediseño de factura
// profesional"): hairline degradado superior, header con logo horizontal +
// "FACTURA" y caja de datos, bloque cliente con "Importe total" destacado,
// tabla con cabecera oscura, caja de IBAN, total en degradado, observaciones
// con barra verde y footer oscuro con eslogan (texto degradado) + logo circular.
//
// Tipografías Manrope (texto) + Archivo (display). Se construye en el frontend
// para previsualizar en vivo; el mismo HTML se envía al backend, que genera el
// PDF (Puppeteer) y lo guarda en la carpeta del lote.
// ============================================================
import { BROKERGY_MARK_DATAURI, BROKERGY_CIRCULAR_DATAURI } from './facturaLogo';

// Datos fiscales del EMISOR (Brokergy). Constantes — de la factura oficial.
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

const fmtEur = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtKwh = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-ES')}`;
const fmtPrecio = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Importes derivados (base, IVA 21%, total) a partir de unidades (kWh) y precio (€/kWh).
export function computeFacturaAmounts({ unidadesKwh, precioKwh }) {
    const u = Number(unidadesKwh) || 0;
    const p = Number(precioKwh) || 0;
    const base = Math.round(u * p * 100) / 100;
    const iva = Math.round(base * 0.21 * 100) / 100;
    const total = Math.round((base + iva) * 100) / 100;
    return { base, iva, total };
}

// Precio €/kWh por defecto a partir de la oferta del lote (€/MWh).
export function defaultPrecioKwh(lote) {
    const oferta = lote && lote.oferta_lote != null && lote.oferta_lote !== '' ? Number(lote.oferta_lote) : null;
    return oferta != null ? oferta / 1000 : 0;
}

export function buildFacturaSoHtml(lote, fields) {
    const so = (lote && lote.sujeto_obligado) || {};
    const E = BROKERGY_EMISOR;
    const {
        numero = '', fecha = '', vencimiento = '',
        caeInicial = '', caeFinal = '',
        unidadesKwh = 0, precioKwh = 0,
    } = fields || {};

    const { base, iva, total } = computeFacturaAmounts({ unidadesKwh, precioKwh });

    const soCpLine = [[so.codigo_postal, so.municipio].filter(Boolean).join(' '), so.provincia ? `(${so.provincia})` : ''].filter(Boolean).join(' ');
    const expedientes = (lote.expedientes || []).map(e => e.numero_expediente).filter(Boolean).join(', ');

    const GRAD = 'linear-gradient(90deg,#F39200 0%,#F8B019 30%,#CBD64A 70%,#9DC23B 100%)';
    const GREEN = '#9DC23B';
    const DARK = '#1a1f24';
    const GREY = '#5a636b';
    const GREY2 = '#7a838b';

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Archivo:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Manrope', 'Segoe UI', Arial, sans-serif; color: ${DARK}; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .arc { font-family: 'Archivo', 'Arial Black', Arial, sans-serif; }
</style></head>
<body>
  <div style="width:100%; min-height:297mm; display:flex; flex-direction:column; background:#fff; position:relative; overflow:hidden;">

    <!-- hairline degradado -->
    <div style="height:6px; width:100%; background:${GRAD};"></div>

    <!-- header -->
    <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:42px 56px 30px;">
      <div style="font-size:12px; line-height:1.7; color:${GREY}; max-width:320px;">
        <img src="${BROKERGY_MARK_DATAURI}" alt="BROKERGY" style="height:46px; width:auto; object-fit:contain; display:block; margin-bottom:10px;">
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
          <div style="display:flex; justify-content:space-between; gap:24px; font-size:12px; padding:3px 0;">
            <span style="color:${GREY2};">Vencimiento</span><span style="font-weight:600;">${esc(vencimiento)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- bloque cliente + importe -->
    <div style="padding:0 56px;">
      <div style="display:flex; gap:1px; background:#ececec; border:1px solid #ececec; border-radius:12px; overflow:hidden;">
        <div style="flex:1; background:#fff; padding:20px 24px;">
          <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Facturar a</div>
          <div style="font-weight:700; font-size:14px; margin-top:10px;">${esc(so.razon_social || '—')}</div>
          <div style="font-size:12px; line-height:1.65; color:${GREY}; margin-top:6px;">
            ${so.direccion ? `${esc(so.direccion)}<br>` : ''}
            ${soCpLine ? `${esc(soCpLine)}<br>` : ''}
            ${so.cif ? `CIF: ${esc(so.cif)}<br>` : ''}
            ${so.email ? `${esc(so.email)}` : ''}
          </div>
        </div>
        <div style="width:240px; background:#fbfbf9; padding:20px 24px; display:flex; flex-direction:column; justify-content:center;">
          <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREY2}; text-transform:uppercase;">Importe total</div>
          <div class="arc" style="font-weight:800; font-size:30px; margin-top:8px; color:${DARK}; line-height:1;">${fmtEur(total)}</div>
          <div style="font-size:11px; color:${GREY2}; margin-top:8px;">Vence el ${esc(vencimiento)}</div>
        </div>
      </div>
    </div>

    <!-- líneas de factura -->
    <div style="padding:34px 56px 0;">
      <div style="display:grid; grid-template-columns:1fr 110px 110px 130px; background:${DARK}; color:#fff; border-radius:8px 8px 0 0; font-size:10.5px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase;">
        <div style="padding:13px 18px;">Concepto</div>
        <div style="padding:13px 12px; text-align:right;">Unidades<br><span style="font-weight:500; opacity:.6; letter-spacing:0;">[kWh]</span></div>
        <div style="padding:13px 12px; text-align:right;">Precio<br><span style="font-weight:500; opacity:.6; letter-spacing:0;">[€/kWh]</span></div>
        <div style="padding:13px 18px; text-align:right;">Importe</div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 110px 110px 130px; border:1px solid #ececec; border-top:none; border-radius:0 0 8px 8px; align-items:center;">
        <div style="padding:18px; font-size:12px; line-height:1.55;">
          <div style="font-weight:700; color:${DARK};">Venta de Ahorros Energéticos para la emisión de Certificados de Ahorro Energético (CAE)</div>
          <div style="color:${GREY2}; margin-top:5px; font-size:11px;">Del ${esc(caeInicial)} al ${esc(caeFinal)}</div>
        </div>
        <div style="padding:18px 12px; text-align:right; font-size:12.5px; font-weight:600;">${fmtKwh(unidadesKwh)}</div>
        <div style="padding:18px 12px; text-align:right; font-size:12.5px; font-weight:600;">${fmtPrecio(precioKwh)}</div>
        <div style="padding:18px; text-align:right; font-size:13px; font-weight:700;">${fmtEur(base)}</div>
      </div>
    </div>

    <!-- pago + totales -->
    <div style="display:flex; gap:32px; padding:30px 56px 0; align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREEN}; text-transform:uppercase;">Instrucciones de pago</div>
        <div style="font-size:12px; color:${GREY}; line-height:1.6; margin-top:10px;">El pago se realizará mediante transferencia bancaria a la siguiente cuenta:</div>
        <div style="margin-top:12px; border:1px solid #ececec; border-radius:10px; padding:14px 16px; background:#fbfbf9;">
          <div style="font-size:11px; color:${GREY2}; font-weight:600;">${esc(E.banco)}</div>
          <div class="arc" style="font-size:15px; font-weight:700; letter-spacing:1px; margin-top:4px; color:${DARK};">${esc(E.iban)}</div>
        </div>
      </div>
      <div style="width:300px;">
        <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:9px 4px; color:${GREY};">
          <span>Subtotal</span><span style="font-weight:600; color:${DARK};">${fmtEur(base)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:12.5px; padding:9px 4px; color:${GREY}; border-bottom:1px solid #ececec;">
          <span>IVA (21%)</span><span style="font-weight:600; color:${DARK};">${fmtEur(iva)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; background:${GRAD}; border-radius:10px; padding:16px 18px; color:#fff;">
          <span style="font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase;">Total factura</span>
          <span class="arc" style="font-size:21px; font-weight:800;">${fmtEur(total)}</span>
        </div>
      </div>
    </div>

    <!-- observaciones -->
    ${expedientes ? `<div style="padding:30px 56px 0;">
      <div style="border-left:3px solid ${GREEN}; padding:2px 0 2px 16px;">
        <div style="font-size:10.5px; font-weight:700; letter-spacing:1.4px; color:${GREY2}; text-transform:uppercase;">Observaciones</div>
        <div style="font-size:11.5px; color:${GREY}; line-height:1.6; margin-top:6px;">Número/s de expediente BROKERGY: ${esc(expedientes)}</div>
      </div>
    </div>` : ''}

    <!-- footer eslogan (anclado al fondo de la página: margin-top:auto + min-height:100vh del contenedor) -->
    <div style="margin-top:auto; padding:24px 56px; background:${DARK}; display:flex; justify-content:space-between; align-items:center; gap:24px;">
      <div class="arc" style="font-weight:700; font-size:14px; line-height:1.35; color:#fff; letter-spacing:0.3px;">
        LA ENERGÍA NI SE CREA NI SE DESTRUYE,<br>
        <span style="background:linear-gradient(90deg,#F8B019,#CBD64A,#9DC23B); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">BROKERGY LA TRANSFORMA EN DINERO.</span>
      </div>
      <img src="${BROKERGY_CIRCULAR_DATAURI}" alt="" style="height:60px; width:60px; object-fit:contain; flex-shrink:0;">
    </div>

  </div>
</body></html>`;
}
