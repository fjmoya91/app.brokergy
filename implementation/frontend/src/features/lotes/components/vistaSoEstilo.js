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
