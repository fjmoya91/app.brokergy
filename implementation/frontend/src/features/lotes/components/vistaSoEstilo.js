// Lo que comparten la «Vista S.O.» (SujetoObligadoPanel.jsx) y la página del
// propio S.O. (features/public/views/SujetoObligadoPublicoView.jsx): formatos,
// colores de las etapas y el CSS `.so-`. Aparte del componente para que el
// fast refresh de Vite siga funcionando.

export const num = (n, d = 2) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
export const gwh = (n, d = 2) => `${num(n, d)} GWh`;
export const mwh = (kwh) => `${Math.round((Number(kwh) || 0) / 1000).toLocaleString('es-ES')} MWh`;
export const pct = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`;
export const presName = (p) => p ? (p.acronimo || p.razon_social || '—') : '—';

// Las etapas son ORDINALES (de más cerca a más lejos del CAE): un solo tono, de
// oscuro a claro. El mismo color en la barra, la leyenda y las columnas.
export const COLOR = {
    OTROS: '#8fa0b3',
    EMITIDO: '#466510', MINISTERIO: '#7b9a1c', VERIFICACION: '#b1d13e', PREPARACION: '#dce8a4',
};
// Lo disponible, también ordinal: el naranja del embudo de Facturación.
export const COLOR_OFERTA = { LISTO: 'var(--o4)', CERRANDO: 'var(--o3)', OBRA: 'var(--o2)', ANTES: 'var(--o1)' };
export const FUENTE = {
    EMITIDO: 'CAE de la resolución', FACTURA: 'de nuestra factura', VERIFICADO: 'verificado', ESTIMADO: 'estimado',
};
// Dónde está el lote en la cuenta del S.O. en el Registro Nacional de CAE
// (`cruzarRegistro`, 19/11/2026). Emitido no es liquidado: eso lo hace él.
export const SITUACION_REGISTRO = {
    EN_SU_CUENTA: { txt: 'en su cuenta', chip: 'fx-chip-ok', ayuda: 'Inscrito a su nombre en el Registro Nacional de CAE: falta que lo liquide contra su obligación' },
    PTE_RESOLUCION: { txt: 'pte. de resolución', chip: 'fx-chip-pizarra', ayuda: 'La solicitud de emisión figura en el Registro, sin resolver' },
    PRESENTADO: { txt: 'aún no figura', chip: 'fx-chip-gris', ayuda: 'Tiene nº de registro, pero no figuraba en el certificado del MITECO' },
    NO_CONSTA: { txt: 'no figura en su cuenta', chip: 'fx-chip-ambar', ayuda: 'Lo damos por emitido y no está entre sus CAE sin liquidar: o ya lo liquidó o algo no cuadra' },
};
export const fechaEs = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
export const COLOR_REGISTRO = { PTE: '#7b9a1c', PRESENTADO: '#b1d13e', CUENTA: '#466510', LIQUIDADO: '#141111' };
// La situación de cada lote en la TABLA (`SITUACIONES`, 20/11/2026): el mismo tono
// ordinal que las etapas; lo que le toca al S.O. (liquidar) en naranja; lo que no
// cuadra en ámbar; lo liquidado, en tinta.
export const COLOR_SITUACION = {
    PREPARACION: '#dce8a4', VERIFICADOR: '#b1d13e', REQ_VERIFICADOR: '#b1d13e',
    POR_PRESENTAR: '#7b9a1c', PTE_RESOLUCION: '#7b9a1c', REQ_GESTOR: '#7b9a1c',
    PTE_LIQUIDAR: '#466510', NO_CONSTA: '#e0a030', LIQ_SOLICITADA: '#ffa000', LIQUIDADO: '#141111',
};

export const chipEstado = (l) => (l.requerimiento ? 'fx-chip-ambar'
    : l.etapa === 'EMITIDO' ? 'fx-chip-ok'
        : l.etapa === 'MINISTERIO' ? 'fx-chip-pizarra' : 'fx-chip-gris');

export const CSS_SO = `
.so-tit{display:flex;align-items:center;flex-wrap:wrap;gap:10px 20px}
.so-logo{display:inline-flex;align-items:center;height:60px;padding:8px 16px;margin-top:4px;background:#fff;border:1px solid var(--linea);border-radius:16px;box-shadow:var(--sombra-baja)}
.so-logo-oscuro{background:var(--tinta);border-color:var(--tinta)}
.so-logo img{display:block;height:100%;width:auto;max-width:200px;object-fit:contain}
@container fx (max-width:639px){.so-logo{height:48px;padding:6px 12px}.so-logo img{max-width:150px}}
.so-dash{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@container fx (min-width:1080px){.so-dash{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
/* .fx-hero y .fx-kpis traen el grid-area del cuadro de Facturación: aquí van en orden */
.so-dash > .fx-hero,.so-dash > .fx-kpis{grid-area:auto}
.so-kpi .fx-kpi-v{overflow:visible;line-height:1.08}
.so-hero .fx-hero-v{display:flex;align-items:baseline;gap:8px}
.so-hero .fx-hero-v small{font-size:.36em}
.so-hero .fx-mark{font-weight:700}
.so-asegurado{margin-top:16px}
.so-asegurado-top{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--gris)}
.so-asegurado-top b{color:var(--tinta);font-variant-numeric:tabular-nums}
.so-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
@container fx (min-width:700px){.so-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
.so-kpi{cursor:default;min-height:118px}
.so-kpi:hover{border-color:var(--linea)}
.so-kpi:active{transform:none}
.so-kpi-marca{border-color:rgba(255,160,0,.45);box-shadow:0 0 0 3px rgba(255,160,0,.10)}
.so-kpi-marca .fx-kpi-k{color:var(--naranja-txt)}
.so-precio-cae{display:block;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(20,17,17,.12)}
.so-precio-cae b{color:var(--tinta,#141111)}

.so-barra{display:flex;height:38px;margin-top:16px;border-radius:12px;overflow:hidden;background:var(--hundido);border:1px solid var(--linea)}
.so-barra > i{display:block;flex:none;height:100%;background:var(--c);border-right:2px solid #fff;transform-origin:left;animation:fx-ancho .7s cubic-bezier(.2,.8,.2,1) both}
.so-barra > i:last-child{border-right:0}
.so-fondo{background:repeating-linear-gradient(45deg,#e6e1d8 0 5px,#d4cdc1 5px 10px)!important}
.so-falta{display:grid!important;place-items:center;overflow:hidden;white-space:nowrap;font:800 11.5px/1 var(--texto);font-style:normal;color:var(--vence-txt);background:repeating-linear-gradient(45deg,#fff3dc 0 6px,#ffe7bd 6px 12px)!important}
.so-ley .fx-dot.so-fondo{background:repeating-linear-gradient(45deg,#e6e1d8 0 2px,#c9c1b4 2px 4px)!important}
.so-ley .fx-dot.so-falta{background:#ffe2a3!important;box-shadow:inset 0 0 0 1px var(--vence-borde)}
.so-escala{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--gris2);font-variant-numeric:tabular-nums}

.so-seccion{margin-top:30px}
.so-seccion-cab{display:flex;align-items:flex-end;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin:0 2px 12px}
.so-seccion-cab p{margin:4px 0 0;font-size:13.5px;color:var(--gris);line-height:1.45}
.so-etapas{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@container fx (min-width:760px){.so-etapas{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container fx (min-width:1320px){.so-etapas{grid-template-columns:repeat(4,minmax(0,1fr))}}
.so-etapa-k{display:flex;align-items:center;gap:8px}
.so-etapa-v{font-size:36px;line-height:1;margin-top:10px}
.so-etapa-v small{font-size:.45em;margin-left:4px}
.so-etapa-n{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:12.5px;color:var(--gris)}
.so-lotes{list-style:none;margin:14px -8px 0;padding:0;border-top:1px solid var(--linea)}
.so-lote{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;align-items:center;padding:10px 8px;border-bottom:1px solid var(--linea);cursor:pointer;transition:background-color .15s}
.so-lote:last-child{border-bottom:0}
.so-lote:hover{background:#fcfbf8}
.so-lote:focus-visible{outline:3px solid var(--tinta);outline-offset:-3px;border-radius:10px}
.so-lote-cod{min-width:0;font:600 13px/1.2 var(--mono);color:var(--tinta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.so-lote-mwh{font-weight:700;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
.so-lote-pie{grid-column:1/-1;display:flex;align-items:center;gap:8px;min-width:0}
.so-lote-pie .fx-chip{flex:0 1 auto;min-width:0}
.so-fuente{flex:none;font-size:12px;color:var(--gris2);white-space:nowrap}
.so-anio{margin-left:auto;flex:none;width:auto;min-height:32px;padding:0 28px 0 10px;border-radius:10px;font-size:12.5px;font-weight:600;background-position:right 9px center;background-size:12px}
.so-anio-txt{margin-left:auto;flex:none;font-size:12px;color:var(--gris)}
@media (pointer:coarse){.so-anio{min-height:44px}}
.so-vacio{padding:14px 0 2px;font-size:13px;color:var(--gris2)}
.so-fuera{margin-top:14px}

.so-of{list-style:none;margin:14px -8px 0;padding:0;border-top:1px solid var(--linea)}
.so-of > li{border-bottom:1px solid var(--linea)}
.so-of > li:last-child{border-bottom:0}
.so-of-btn{appearance:none;width:100%;background:none;border:0;cursor:pointer;text-align:left;font:inherit;color:inherit;border-radius:12px;
  display:grid;grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:"ch tit v" "ch det v" ". pista pista";gap:3px 12px;align-items:center;padding:14px 8px}
.so-of-btn:hover{background:#fcfbf8}
.so-of-btn > svg{grid-area:ch;color:var(--gris);transition:transform .2s}
.so-of-btn[aria-expanded="true"] > svg{transform:rotate(90deg)}
.so-of-tit{grid-area:tit;display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;min-width:0}
.so-of-det{grid-area:det;font-size:12.5px;color:var(--gris)}
.so-of-v{grid-area:v;font-family:var(--display);font-weight:700;font-size:28px;line-height:1;white-space:nowrap}
.so-of-v small{font-size:.5em;margin-left:3px}
.so-of-pista{grid-area:pista;margin-top:8px}
.so-of-pista .fx-pista{margin-top:0;height:10px}
.so-of-pista small{display:block;margin-top:6px;font-size:12.5px;color:var(--gris);font-variant-numeric:tabular-nums}
.so-of-pista small b{color:var(--tinta);font-weight:700}
@container fx (min-width:900px){
  .so-of-btn{grid-template-columns:22px minmax(0,260px) 150px minmax(0,1fr);grid-template-areas:"ch tit v pista" "ch det v pista";gap:3px 20px}
  .so-of-v{text-align:right}
  .so-of-pista{margin-top:0}
}
.so-exps{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));padding:0 8px 16px 42px}
@container fx (max-width:639px){.so-exps{padding-left:8px}}
.so-exp{padding:9px 11px;border-radius:12px;background:var(--crema);border:1px solid var(--linea);min-width:0}
.so-exp b{display:block;font:600 12.5px/1.2 var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.so-exp small{display:block;margin-top:3px;font-size:12px;color:var(--gris);font-variant-numeric:tabular-nums}
.so-of-pie{margin-top:14px}
.so-ayuda{font-size:12px;color:var(--gris2);line-height:1.35}
.so-dos{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
.so-dos .so-ancho{grid-column:1/-1}

.so-plan{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@container fx (min-width:760px){.so-plan{grid-template-columns:repeat(2,minmax(0,1fr))}}
.so-plan .so-exps{padding:14px 0 0}
.so-exp-meta{background:#fff3dc;border-color:var(--vence-borde)}
.so-exp small.so-exp-inc{color:var(--vence-txt)}
.so-enlace{margin-top:14px;font:600 13px/1.3 var(--mono)}
.so-lote-fijo{cursor:default}
.so-lote-fijo:hover{background:none}
.so-lote-pie{flex-wrap:wrap}
.so-lote-reg{font-size:11.5px;padding:3px 8px}

/* Su cuenta en el Registro Nacional de CAE (19/11/2026) */
.so-camino{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@container fx (min-width:700px){.so-camino{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container fx (min-width:1180px){.so-camino{grid-template-columns:repeat(4,minmax(0,1fr))}}
.so-paso{position:relative;display:flex;flex-direction:column}
.so-paso-n{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:99px;font:800 12px/1 var(--texto);color:#fff;background:var(--c)}
.so-paso-quien{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gris2)}
.so-paso-suyo{border-color:rgba(255,160,0,.45);box-shadow:0 0 0 3px rgba(255,160,0,.10)}
.so-paso-suyo .so-paso-quien{color:var(--naranja-txt)}
.so-paso ul{list-style:none;margin:12px 0 0;padding:10px 0 0;border-top:1px solid var(--linea);display:grid;gap:6px}
.so-paso li{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;color:var(--gris)}
.so-paso li b{font:600 12.5px/1.2 var(--mono);color:var(--tinta)}
.so-paso li span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}
.so-reparto{margin-top:8px;font-size:12.5px;color:var(--gris);line-height:1.45}
.so-reparto b{color:var(--tinta)}
.so-venc{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.so-venc span{display:inline-flex;align-items:baseline;gap:6px;padding:6px 11px;border-radius:99px;background:var(--crema);border:1px solid var(--linea);font-size:12.5px;color:var(--gris)}
.so-venc span b{color:var(--tinta);font-variant-numeric:tabular-nums}
.so-venc span.so-venc-ya{background:#fff3dc;border-color:var(--vence-borde);color:var(--vence-txt)}
.so-tramos td{font-variant-numeric:tabular-nums;white-space:nowrap}
.so-tramos td.so-mono{font:600 12.5px/1.2 var(--mono)}
.so-tramos td.so-num{text-align:right}
.so-tramos th.so-num{text-align:right}
.so-tramos tr.so-nuestro td{background:#f7faef}
.so-tramos td.so-de{color:var(--gris)}
.so-tramos tr.so-nuestro td.so-de{color:#3c5409;font-weight:700}

/* La TABLA de lotes: dónde está cada uno, a golpe de vista (20/11/2026) */
.so-vista-seg{flex:none}
.so-res{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.so-res button{appearance:none;font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:6px 12px;border-radius:99px;background:#fff;border:1px solid var(--linea);font-size:12.5px;color:var(--gris);transition:border-color .15s,box-shadow .15s}
.so-res button:hover{border-color:rgba(20,17,17,.25)}
.so-res button[aria-pressed="true"]{border-color:var(--tinta);box-shadow:0 0 0 2px rgba(20,17,17,.08);color:var(--tinta)}
.so-res button b{color:var(--tinta);font-variant-numeric:tabular-nums}
.so-sit{display:inline-flex;align-items:center;gap:7px;font-weight:700;font-size:12.5px;color:var(--tinta);white-space:nowrap}
.so-sit i{flex:none;width:10px;height:10px;border-radius:99px;background:var(--c);box-shadow:inset 0 0 0 1px rgba(20,17,17,.12)}
.so-tabla-card{padding:0;overflow:hidden}
/* .fx-tabla-caja se esconde en el móvil (allí Facturación pinta tarjetas): esta se desliza */
.so-tabla-caja{overflow-x:auto;-webkit-overflow-scrolling:touch}
.so-tabla td{vertical-align:middle;font-variant-numeric:tabular-nums}
.so-tabla td,.so-tabla th{white-space:nowrap}
.so-tabla td.so-num,.so-tabla th.so-num{text-align:right}
/* la situación y la línea de debajo del lote pasan a dos renglones antes que ensanchar la tabla */
.so-tabla td:first-child{min-width:196px;max-width:240px;white-space:normal}
.so-tabla td:first-child .so-sit{white-space:normal;align-items:flex-start;line-height:1.3}
.so-tabla td:first-child .so-sit i{margin-top:3px}
.so-tabla td.so-cod{min-width:140px;white-space:normal}
.so-res-kwh{white-space:nowrap}
/* en el móvil caben situación, lote y MWh sin deslizar; lo demás, deslizando */
@container fx (max-width:639px){
  .so-tabla th,.so-tabla td{padding-left:8px!important;padding-right:8px!important}
  .so-tabla th:first-child,.so-tabla td:first-child{padding-left:14px!important}
  .so-tabla td:first-child{min-width:112px;max-width:130px}
  .so-tabla td:first-child .so-sit{font-size:12px}
  .so-tabla td.so-cod{min-width:118px;width:118px;font-size:11.5px}
  .so-tabla td.so-cod small{max-width:118px}
}
.so-res button{display:inline-block;max-width:100%;text-align:left;line-height:1.4}
.so-res button > *{margin-right:6px}
.so-res button .so-sit{vertical-align:-1px}
@container fx (max-width:639px){.so-tabla tfoot td{white-space:normal}}
.so-tabla td.so-cod{font:600 12.5px/1.2 var(--mono)}
.so-tabla td.so-cod small,.so-tabla td small{display:block;margin-top:3px;font:500 11.5px/1.2 var(--texto);color:var(--gris2)}
.so-tabla td.so-mono{font:600 12px/1.25 var(--mono)}
.so-tabla td.so-mono small{font-family:var(--mono)}
.so-tabla tr.so-clic{cursor:pointer}
.so-tabla tr.so-clic:hover td{background:#fcfbf8}
.so-tabla tr.so-liq td{background:#fff8ea}
.so-tabla tr.so-liq-ok td{color:var(--gris)}
.so-tabla tfoot td{font-weight:800;border-top:2px solid var(--linea)}
.so-tabla .so-liq-sel{width:auto;min-height:32px;padding:0 28px 0 10px;border-radius:10px;font-size:12.5px;font-weight:600;background-position:right 9px center;background-size:12px}
@media (pointer:coarse){.so-tabla .so-liq-sel{min-height:44px}}
.so-tabla-pie{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px 14px;margin-top:10px;font-size:12px;color:var(--gris2)}
`;

// Un logo pensado para fondo OSCURO (texto blanco sobre transparente, como el de
// Interalco) desaparece en la caja blanca: se mira la luminosidad media de sus
// píxeles opacos y, si es clara, la caja va en tinta. Los logos son data URL
// (prescriptores.logo_empresa), así que el canvas no queda «contaminado».
export function logoEsClaro(img) {
    try {
        const w = Math.min(img.naturalWidth, 120), h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        let suma = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            suma += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++;
        }
        // Un logo sin transparencia (fondo blanco propio) da n alto y luminosidad alta: se
        // reconoce porque casi no tiene píxeles transparentes, y ese va bien en blanco.
        return n > 0 && n < (w * h) * 0.9 && suma / n > 0.7;
    } catch { return false; }
}
