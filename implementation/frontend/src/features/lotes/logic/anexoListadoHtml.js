// ============================================================
// anexoListadoHtml.js — la MAQUETA del «Anexo I · Listado Cesión» del lote.
//
// Pura (solo recibe filas ya calculadas) y con imports con extensión, para que la
// mida desde Node `implementation/backend/scripts/check_anexo_listado_firmas.mjs`.
// Las filas y los totales los calcula anexoListado.js.
//
// El bloque de FIRMAS va ANCLADO al pie de la hoja (.hoja flex + `margin-top:auto`)
// y lleva DEBAJO de cada rótulo un hueco fijo para la firma. Así las casillas de
// `SIGN_BOXES.anexo_i_listado*` (signBoxes.js) son las mismas con 1 actuación que
// con 10. Antes el bloque iba detrás de la tabla, a 26px, y la casilla fija —medida
// con un lote corto— caía ENCIMA de las filas 8 y 9 en un lote de 10
// (LOTE-2026-018, 12/11/2026).
// ============================================================

const nf = (n, dec = 0) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Alto del hueco de firma bajo cada rótulo (px CSS; 0,75 pt/px). La casilla de
// signBoxes.js se recorta DENTRO de él.
export const ANEXO_LISTADO_HUECO_FIRMA_PX = 90;

export function anexoListadoHtml({ rows = [], tot = {}, soNombre = 'SUJETO OBLIGADO', convenio = '', mes = '', anio = '', ccaa = '' } = {}) {
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
      /* La hoja útil (A4 apaisado menos 2×10mm) es 190mm de alto; .hoja la llena
         (menos el padding del body) para que las firmas bajen al pie. Un pelo menos,
         o el redondeo abre una 2ª hoja. El flex va en .hoja y NO en el body: la
         vista previa de AnexoListadoModal mete este HTML con dangerouslySetInnerHTML
         y su <style> alcanza al body de la app. */
      .hoja { min-height: calc(190mm - 29px); display: flex; flex-direction: column; }
      h1 { font-size: 13px; text-align: center; margin: 0 0 10px; text-transform: uppercase; }
      .legal { font-size: 9px; margin: 2px 0; }
      .meta { width: 100%; margin: 10px 0; font-size: 9px; }
      .meta td { padding: 2px 6px; }
      .meta .k { color: #444; }
      /* table-layout:fixed + colgroup: sin esto, la tabla no puede encoger por debajo
         del min-content de sus 13 columnas (la dirección y el título descriptivo son
         largos) y se sale del papel por la derecha. */
      table.data { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
      table.data th, table.data td { border: 1px solid #999; padding: 3px 4px; font-size: 8px; text-align: center; vertical-align: middle; word-wrap: break-word; overflow-wrap: anywhere; }
      table.data th { background: #FF8F00; color: #fff; font-weight: bold; }
      table.data td.l { text-align: left; }
      table.data td.r { text-align: right; }
      .firma { margin-top: auto; padding-top: 10px; width: 100%; border-collapse: separate; border-spacing: 24px 0; }
      .firma td { width: 50%; text-align: center; vertical-align: top; }
      .firma td.rot { border-top: 1px solid #111; padding-top: 6px; font-weight: bold; }
      .firma td.hueco { height: ${ANEXO_LISTADO_HUECO_FIRMA_PX}px; }
    </style></head><body><div class="hoja">
      <h1>Formulario de Detalle de Cesión de Ahorros Energéticos</h1>
      <div class="legal">EL PROVEEDOR cede a <b>${esc(soNombre)}</b> los ahorros de las actuaciones listadas en el presente Anexo de acuerdo a las condiciones fijadas en el CONVENIO DE COMPRAVENTA DE AHORROS DE ENERGÍA firmado el ${esc(convenio)}.</div>
      <div class="legal">EL PROVEEDOR se compromete a no suscribir ningún otro Convenio CAE sobre estas actuaciones.</div>
      <div class="legal">Los firmantes se comprometen a mantener activa la medida o medidas generadoras de ahorro durante todo el tiempo de vida útil de las mismas.</div>

      <table class="meta"><tbody>
        <tr>
          <td class="k">Comunidad Autónoma:</td><td><b>${esc(ccaa)}</b></td>
          <td class="k">Nº actuaciones de eficiencia energética:</td><td><b>${tot.numActuaciones ?? rows.length}</b></td>
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

      <table class="data">
      <colgroup>
        <col style="width:3%"><col style="width:9%"><col style="width:15%"><col style="width:10%"><col style="width:8%">
        <col style="width:6%"><col style="width:6%"><col style="width:5%"><col style="width:17%">
        <col style="width:6%"><col style="width:4%"><col style="width:7%"><col style="width:4%">
      </colgroup>
      <thead><tr>
        <th>Nº</th><th>Código actuación</th><th>Dirección</th><th>Ref. catastral</th><th>Coordenadas UTM (ETRS89 · huso 30 N)</th>
        <th>Fecha inicio</th><th>Fecha fin</th><th>Código ficha</th><th>Título descriptivo de la actuación</th>
        <th>Inversión (€)</th><th>Vida útil (años)</th><th>Ahorro energ. estimado (kWh/año)</th><th>Precio (€/MWh)</th>
      </tr></thead><tbody>${filasHtml}</tbody></table>

      <table class="firma"><tbody>
        <tr><td class="rot">EL PROVEEDOR<br><span style="font-weight:normal">BROKERGY</span></td><td class="rot">${esc(soNombre)}</td></tr>
        <tr><td class="hueco"></td><td class="hueco"></td></tr>
      </tbody></table>
    </div></body></html>`;
}
