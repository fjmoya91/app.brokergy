// ============================================================
// anexoListado.js — "Anexo I · Listado Cesión de Ahorros" (a nivel de LOTE)
//
// Documento que el PROVEEDOR (Brokergy) firma cediendo al Sujeto Obligado los
// ahorros de TODAS las actuaciones del lote. Una fila por expediente.
// Estructura calcada del Excel/PDF de referencia de INTERALCO.
// ============================================================
import { buildInstalacionAddress } from '../../expedientes/utils/docGenerators';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';

// Fecha del convenio de compraventa con el S.O. (fija; editable en el popup).
export const CONVENIO_FECHA_DEFAULT = '27/02/2026';

export const FICHA_TITULO = {
    RES060: 'Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico.',
    RES080: 'Rehabilitación profunda de edificios de viviendas',
    RES093: 'Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática D1, D2 o D3',
};

export const fichaDe = (numero) =>
    String(numero || '').includes('RES080') ? 'RES080'
        : String(numero || '').includes('RES093') ? 'RES093'
            : 'RES060';

const vidaUtilDe = (ficha) => (ficha === 'RES080' ? 25 : 15);

function fmtDate(d) {
    if (!d) return '';
    const s = String(d);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    return s;
}

const nf = (n, dec = 0) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Una fila por expediente del lote.
export function buildAnexoListadoRows(lote) {
    const exps = (lote && lote.expedientes) || [];
    const precio = (lote && lote.oferta_lote != null && lote.oferta_lote !== '') ? Number(lote.oferta_lote) : null;
    return exps.map((e, i) => {
        const ficha = fichaDe(e.numero_expediente);
        let addr = {};
        try { addr = buildInstalacionAddress(e) || {}; } catch { addr = {}; }
        const inst = e.instalacion || {};
        const doc = e.documentacion || {};
        const fin = computeExpedienteFinancials(e);
        // La INVERSIÓN va SIEMPRE sobre factura: suma de los importes (sin IVA) de las
        // facturas del expediente (documentacion.facturas[].importe_sin_iva).
        const facturas = (e.documentacion && e.documentacion.facturas) || [];
        const inversion = facturas.reduce((s, f) => s + (Number(f && f.importe_sin_iva) || 0), 0);
        const utm = (inst.coord_x || inst.coord_y) ? `X: ${inst.coord_x || ''}, Y: ${inst.coord_y || ''}` : '';
        return {
            n: i + 1,
            codigo: e.numero_expediente || '',
            direccion: addr.full || e.cliente_direccion || '',
            refCatastral: addr.refCatastral || inst.ref_catastral || '',
            utm,
            fechaInicio: fmtDate(doc.fecha_inicio_cifo),
            fechaFin: fmtDate(doc.fecha_fin_cifo),
            ficha,
            titulo: FICHA_TITULO[ficha] || '',
            inversion,
            vidaUtil: vidaUtilDe(ficha),
            ahorroKwh: Math.round(fin.savingsKwh || 0),
            precio,
        };
    });
}

export function buildAnexoListadoTotals(rows) {
    const ahorroKwh = rows.reduce((s, r) => s + (r.ahorroKwh || 0), 0);
    return {
        numActuaciones: rows.length,
        ahorroKwh,
        ahorroMwh: ahorroKwh / 1000,
        ahorroGwh: ahorroKwh / 1e6,
    };
}

// HTML del documento (para /api/pdf/generate y para la previsualización en pantalla).
export function buildAnexoListadoHtml(lote, opts = {}) {
    const rows = buildAnexoListadoRows(lote);
    const tot = buildAnexoListadoTotals(rows);
    const soNombre = (lote && lote.sujeto_obligado && (lote.sujeto_obligado.razon_social || lote.sujeto_obligado.acronimo)) || 'SUJETO OBLIGADO';
    const convenio = opts.convenioFecha || CONVENIO_FECHA_DEFAULT;
    const mes = opts.mes || '';
    const anio = (lote && lote.anio_actuacion) || '';
    const ccaa = (lote && lote.ccaa) || '';

    const filasHtml = rows.map(r => `
      <tr>
        <td>${r.n}</td>
        <td>${esc(r.codigo)}</td>
        <td class="l">${esc(r.direccion)}</td>
        <td>${esc(r.refCatastral)}</td>
        <td>${esc(r.utm)}</td>
        <td>${esc(r.fechaInicio)}</td>
        <td>${esc(r.fechaFin)}</td>
        <td>${esc(r.ficha)}</td>
        <td class="l">${esc(r.titulo)}</td>
        <td class="r">${nf(r.inversion)} €</td>
        <td>${r.vidaUtil}</td>
        <td class="r">${nf(r.ahorroKwh)}</td>
        <td class="r">${r.precio != null ? nf(r.precio) : ''}</td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 9px; margin: 0; padding: 14px; }
      h1 { font-size: 13px; text-align: center; margin: 0 0 10px; text-transform: uppercase; }
      .legal { font-size: 9px; margin: 2px 0; }
      .meta { width: 100%; margin: 10px 0; font-size: 9px; }
      .meta td { padding: 2px 6px; }
      .meta .k { color: #444; }
      table.data { width: 100%; border-collapse: collapse; margin-top: 6px; }
      table.data th, table.data td { border: 1px solid #999; padding: 3px 4px; font-size: 8px; text-align: center; vertical-align: middle; }
      table.data th { background: #FF8F00; color: #fff; font-weight: bold; }
      table.data td.l { text-align: left; }
      table.data td.r { text-align: right; }
      .firma { margin-top: 26px; width: 100%; }
      .firma td { width: 50%; text-align: center; padding-top: 40px; border-top: 1px solid #111; font-weight: bold; }
    </style></head><body>
      <h1>Formulario de Detalle de Cesión de Ahorros Energéticos</h1>
      <div class="legal">EL PROVEEDOR cede a <b>${esc(soNombre)}</b> los ahorros de las actuaciones listadas en el presente Anexo de acuerdo a las condiciones fijadas en el CONVENIO DE COMPRAVENTA DE AHORROS DE ENERGÍA firmado el ${esc(convenio)}.</div>
      <div class="legal">EL PROVEEDOR se compromete a no suscribir ningún otro Convenio CAE sobre estas actuaciones.</div>
      <div class="legal">Los firmantes se comprometen a mantener activa la medida o medidas generadoras de ahorro durante todo el tiempo de vida útil de las mismas.</div>

      <table class="meta"><tbody>
        <tr>
          <td class="k">Comunidad Autónoma:</td><td><b>${esc(ccaa)}</b></td>
          <td class="k">Nº actuaciones de eficiencia energética:</td><td><b>${tot.numActuaciones}</b></td>
        </tr>
        <tr>
          <td class="k">Año:</td><td><b>${esc(anio)}</b></td>
          <td class="k">Total ahorro energético:</td><td><b>${nf(tot.ahorroKwh)}</b> kWh/año</td>
        </tr>
        <tr>
          <td class="k">Mes:</td><td><b>${esc(mes)}</b></td>
          <td></td><td><b>${nf(tot.ahorroMwh, 3)}</b> MWh/año &nbsp;·&nbsp; <b>${nf(tot.ahorroGwh, 2)}</b> GWh/año</td>
        </tr>
      </tbody></table>

      <table class="data"><thead><tr>
        <th>Nº</th><th>Código actuación</th><th>Dirección</th><th>Ref. catastral</th><th>Coordenadas UTM</th>
        <th>Fecha inicio</th><th>Fecha fin</th><th>Código ficha</th><th>Título descriptivo de la actuación</th>
        <th>Inversión (€)</th><th>Vida útil (años)</th><th>Ahorro energ. estimado (kWh/año)</th><th>Precio (€/MWh)</th>
      </tr></thead><tbody>${filasHtml}</tbody></table>

      <table class="firma"><tbody><tr>
        <td>EL PROVEEDOR<br><span style="font-weight:normal">BROKERGY</span></td>
        <td>${esc(soNombre)}</td>
      </tr></tbody></table>
    </body></html>`;
}
