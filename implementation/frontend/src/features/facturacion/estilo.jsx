/* eslint-disable react-refresh/only-export-components -- módulo de estilo compartido: exporta piezas y utilidades juntas a propósito (el fast refresh recarga la página entera al tocarlo, y da igual) */
// Facturación — el estilo «carta de pago» llevado a una pantalla de DATOS (prefijo .fx-).
// La única pantalla del CRM con este estilo (regla 164: Fran lo pidió para esta pestaña el
// 24/10/2026). Fuente: docs/conocimiento/transversal-frontend/estilo-carta-de-pago-lo-que-ve-el-cliente.md
// La vista monta <style>{CSS}</style> dentro de <div className="fx">; los portales (.fx-capa,
// .fx-pop, .fx-toast) redeclaran los tokens, así que basta con que la pestaña esté montada.
// Nada de Tailwind dentro de .fx: el tema del CRM no lo alcanza.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
/* ═══ Facturación · el estilo «carta de pago» llevado a una pantalla de DATOS · prefijo .fx- ═══ */
.fx,.fx-capa,.fx-pop,.fx-toast{
  --crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);
  --naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  /* datos */
  --papel:#fff;--hundido:#f4f2ee;--linea2:rgba(20,17,17,.14);--rejilla:#eeebe5;--eje:#cfc9bf;
  --ambar-bg:#fff7e6;--ambar-borde:#f6dca4;--ambar-txt:#5c4100;--ambar-ico:#ffe9bd;
  --vence-bg:#ffe2a3;--vence-borde:#f0b13f;--vence-txt:#5c3b00;
  --pizarra-bg:#e8eef5;--pizarra-txt:#27455f;
  --ok-bg:#eef4d8;--ok-txt:#3f5a0b;
  /* series (validadas: CVD ΔE ≥ 13 en todos los pares, ≥ 3:1 sobre blanco y crema) */
  --s-ing:#d97706;--s-fml:#4f6fd6;--s-cae:#466510;--s-prev:#8a857b;
  /* ordinal del embudo (un tono, de claro a oscuro) */
  --o1:#eaa23c;--o2:#de860f;--o3:#c56a05;--o4:#94500a;
  --spark:#c3bdb2;
  --sombra:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);
  --sombra-baja:0 1px 2px rgba(20,17,17,.04);
  --sombra-alta:0 30px 80px -24px rgba(20,17,17,.40);
  --display:'Antonio','Inter',Impact,sans-serif;
  --texto:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color-scheme:light;color:var(--tinta);font-family:var(--texto);-webkit-font-smoothing:antialiased;
}
.fx{--fx-tope:0px;position:relative;isolation:isolate;min-height:100%;background:var(--crema);container:fx/inline-size}
@media (max-width:767px){.fx{--fx-tope:56px}}
.fx *,.fx-capa *,.fx-pop *{box-sizing:border-box}
.fx :focus-visible,.fx-capa :focus-visible,.fx-pop :focus-visible{outline:3px solid var(--tinta);outline-offset:2px}
.fx-filete-top{height:4px;background:var(--filete)}
.fx-halo{position:absolute;inset:0 0 auto 0;height:420px;z-index:-1;pointer-events:none;
  background:radial-gradient(45% 60% at 18% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(35% 50% at 88% 0%,rgba(199,246,1,.10),transparent 70%)}
.fx-col{max-width:1400px;margin:0 auto;padding:18px 16px 56px}
.fx-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* ── tipografía ── */
.fx-display{font-family:var(--display);font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.fx-h1{font-size:42px;line-height:1.02;margin:4px 0 0}
.fx-h2{font-size:30px;line-height:1.05;margin:0}
.fx-h3{font-size:24px;line-height:1.08;margin:0}
.fx-eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.fx-eyebrow-gris{color:var(--gris)}
.fx-eyebrow-verde{color:var(--verde-txt)}
.fx-mark{background:var(--lima);padding:0 .12em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.fx-sub{font-size:15px;line-height:1.55;color:var(--gris);margin:8px 0 0}
.fx-sub b{color:var(--tinta);font-weight:600}
.fx-num{font-variant-numeric:tabular-nums}
.fx-mono{font-family:var(--mono);letter-spacing:.01em}
.fx-importe{font-family:var(--display);font-weight:700;letter-spacing:-.005em;display:inline-flex;align-items:baseline;white-space:nowrap;line-height:.95}
.fx-importe small{font-size:.47em;margin-left:1px}
.fx-pildora{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;background:#fff;border:1px solid var(--linea);font:600 11.5px/1 var(--mono);color:var(--gris);white-space:nowrap}
.fx-dot{display:inline-block;flex:none;width:9px;height:9px;border-radius:3px;background:var(--c,var(--gris2))}

/* ── botones ── */
.fx-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:14px;border:0;cursor:pointer;
  font:700 14.5px/1.2 var(--texto);text-decoration:none;white-space:nowrap;color:var(--tinta);background:none;
  transition:transform .12s ease,box-shadow .2s ease,background-color .2s ease,border-color .2s ease,filter .2s ease,opacity .2s ease}
.fx-btn:active{transform:scale(.98)}
.fx-btn:disabled{opacity:.5;cursor:default;transform:none}
.fx-btn svg{flex:none}
.fx-btn-pri{min-height:48px;padding:0 20px;border-radius:16px;font-size:15px;background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.fx-btn-pri:hover{filter:brightness(1.04)}
.fx-btn-pri .fx-kbd{border-color:rgba(8,9,12,.25)}
.fx-btn-sec{background:#fff;border:1.5px solid var(--linea2)}
.fx-btn-sec:hover{border-color:rgba(20,17,17,.3)}
.fx-btn-tinta{background:var(--tinta);color:#fff}
.fx-btn-tinta:hover{background:#2a2626}
.fx-btn-ok{background:var(--ok-bg);color:var(--verde-txt)}
.fx-btn-peq{min-height:36px;padding:0 12px;border-radius:12px;font-size:13px}
.fx-ico-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:inline-grid;place-items:center;flex:none;width:36px;height:36px;padding:0;border-radius:10px;border:1px solid transparent;background:none;color:var(--gris);cursor:pointer;transition:background-color .15s,color .15s,border-color .15s}
.fx-ico-btn:hover{background:var(--hundido);color:var(--tinta);border-color:var(--linea)}
.fx-ico-btn:disabled{opacity:.4;cursor:wait}
.fx-link{appearance:none;background:none;border:0;cursor:pointer;min-height:40px;padding:0 2px;display:inline-flex;align-items:center;gap:6px;font:700 14px var(--texto);color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.3);border-radius:8px}
.fx-link:hover{text-decoration-color:var(--tinta)}
.fx-kbd{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:6px;border:1px solid var(--linea2);font:600 11px/1 var(--mono);color:inherit;opacity:.75}
.fx-cerrar{flex:none;appearance:none;width:44px;height:44px;border-radius:999px;border:1px solid var(--linea);background:#fff;color:var(--tinta);display:grid;place-items:center;cursor:pointer}
.fx-cerrar:hover{border-color:var(--linea2)}
@media (pointer:coarse){.fx-btn-peq{min-height:44px}.fx-ico-btn{width:44px;height:44px}}

/* ── controles: segmentado, desplegable, campos, buscador ── */
.fx-seg{display:inline-grid;grid-auto-flow:column;gap:2px;padding:3px;border-radius:14px;background:var(--hundido);border:1px solid var(--linea)}
.fx-seg button{appearance:none;border:0;background:none;cursor:pointer;min-height:38px;padding:0 13px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;gap:7px;
  font:600 13.5px/1 var(--texto);color:var(--gris);white-space:nowrap;transition:background-color .15s,color .15s,box-shadow .15s}
.fx-seg button:hover{color:var(--tinta)}
.fx-seg button[aria-pressed="true"]{background:#fff;color:var(--tinta);font-weight:700;box-shadow:0 1px 2px rgba(20,17,17,.08),0 2px 8px -3px rgba(20,17,17,.14)}
@media (pointer:coarse){.fx-seg button{min-height:44px}.fx-link{min-height:44px}}
.fx-input,.fx-select,.fx-area{width:100%;min-height:46px;padding:0 14px;border-radius:12px;border:1.5px solid var(--linea2);background:#fff;color:var(--tinta);font:500 15px/1.3 var(--texto);transition:border-color .15s,box-shadow .15s}
.fx-area{min-height:96px;padding:12px 14px;resize:vertical}
.fx-input:focus,.fx-select:focus,.fx-area:focus{outline:none;border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.fx-input:disabled,.fx-select:disabled,.fx-area:disabled{background:var(--hundido);color:#3b3e45;border-color:var(--linea);opacity:1}
.fx-input.fx-num{text-align:right}
.fx-select{appearance:none;-webkit-appearance:none;padding-right:40px;cursor:pointer;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23141111' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 14px center}
.fx-select option{background:#fff;color:#141111}
.fx-select-peq{width:auto;min-height:44px;font-weight:700;font-size:14px}
.fx-campo{display:grid;gap:6px;min-width:0}
.fx-campo > span{font-size:12.5px;font-weight:600;color:var(--gris)}
.fx-buscar{position:relative;display:block;flex:1 1 260px;min-width:0}
.fx-buscar input{width:100%;min-height:44px;padding:0 44px 0 42px;border-radius:14px;border:1.5px solid var(--linea2);background:#fff;font:500 15px var(--texto);color:var(--tinta)}
.fx-buscar input::placeholder{color:var(--gris2)}
.fx-buscar input:focus{outline:none;border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.fx-buscar > svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--gris2);pointer-events:none}
.fx-buscar .fx-kbd{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--gris)}
@media (pointer:coarse){.fx-buscar input,.fx-input,.fx-select{font-size:16px}.fx-buscar .fx-kbd{display:none}}

/* ── cabecera de la pestaña ── */
.fx-cab{display:grid;gap:16px;align-items:end;margin:4px 0 22px}
.fx-cab-acc{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
@container fx (min-width:980px){.fx-cab{grid-template-columns:minmax(0,1fr) auto}.fx-cab-acc{justify-content:flex-end}}
@container fx (max-width:639px){
  .fx-cab-acc{display:grid;grid-template-columns:auto minmax(0,1fr)}
  .fx-cab-acc .fx-seg{grid-column:1/-1;width:100%;grid-auto-columns:1fr}
  .fx-cab-acc .fx-btn-pri{min-height:52px}
  .fx-cab-acc .fx-select-peq{min-height:52px}
  .fx-cab-acc .fx-kbd{display:none}
}

/* ── tarjeta ── */
.fx-card{position:relative;background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:var(--sombra);overflow:hidden;min-width:0}
.fx-pad{padding:20px 18px}
.fx-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.fx-card-cab{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.fx-card-cab .fx-h3{margin-top:4px}
.fx-bloque-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 10px}
@container fx (min-width:768px){.fx-col{padding:28px 40px 72px}.fx-pad{padding:22px 24px}}

/* ── cuadro de mando: rejilla ── */
.fx-dash{display:grid;gap:14px;grid-template-columns:minmax(0,1fr);grid-template-areas:"hero" "kpis" "trim" "graf" "emb"}
.fx-hero{grid-area:hero}.fx-kpis{grid-area:kpis}.fx-trim{grid-area:trim}.fx-graf{grid-area:graf}.fx-emb{grid-area:emb}
@container fx (min-width:700px){.fx-dash{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"hero hero" "kpis kpis" "graf graf" "trim emb"}}
/* en PC el trimestre ocupa dos filas a la derecha: el gráfico y el embudo van uno sobre otro a su izquierda */
@container fx (min-width:1080px){.fx-dash{grid-template-columns:repeat(12,minmax(0,1fr));
  grid-template-areas:"hero hero hero hero hero kpis kpis kpis kpis kpis kpis kpis" "graf graf graf graf graf graf graf graf trim trim trim trim" "emb emb emb emb emb emb emb emb trim trim trim trim"}}
.fx-plegado .fx-dash{display:none}
.fx-tira{display:none;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px}
.fx-tira::-webkit-scrollbar{display:none}
.fx-plegado .fx-tira{display:flex}
.fx-tira-item{flex:none;display:grid;gap:3px;padding:10px 14px;border-radius:16px;background:#fff;border:1px solid var(--linea);box-shadow:var(--sombra-baja);min-width:132px}
.fx-tira-item span{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.fx-tira-item b{font-family:var(--display);font-weight:700;font-size:22px;line-height:1}
.fx-tira-item.fx-alerta{border-color:var(--vence-borde);background:#fffaf0}

/* ── la cifra protagonista ── */
.fx-hero{padding:24px 20px 18px}
.fx-hero-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.fx-hero-v{font-size:56px;margin:14px 0 0}
.fx-hero-tit{font-family:var(--display);font-weight:700;font-size:22px;line-height:1.15;margin:12px 0 0}
.fx-hero-pie{margin:12px 0 0;font-size:13px;color:var(--gris);line-height:1.45}
.fx-hero-pie b{color:var(--tinta);font-weight:600}
@container fx (min-width:700px){.fx-hero{padding:28px 26px 20px}.fx-hero-v{font-size:72px}.fx-hero-tit{font-size:24px}}

/* ── tarjeta KPI ── */
.fx-kpis{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
@container fx (min-width:700px){.fx-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
.fx-kpi{appearance:none;font:inherit;color:inherit;text-align:left;cursor:pointer;position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;min-height:136px;padding:14px 14px 12px;
  background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:var(--sombra-baja);transition:border-color .2s ease,transform .12s ease}
.fx-kpi:hover{border-color:rgba(20,17,17,.2)}
.fx-kpi:active{transform:scale(.99)}
.fx-kpi-k{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris);line-height:1.25}
.fx-kpi-v{font-family:var(--display);font-weight:700;font-size:28px;line-height:1;letter-spacing:-.005em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-kpi-v small{font-size:.6em;margin-left:2px}
.fx-kpi-fila{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fx-kpi-nota{font-size:12.5px;color:var(--gris);line-height:1.35}
.fx-kpi-nota b{color:var(--tinta);font-weight:600}
.fx-kpi .fx-spark{margin-top:auto}
.fx-kpi-alerta{border-color:var(--vence-borde);background:linear-gradient(180deg,#fffaf0,#fff 60%);box-shadow:0 0 0 3px rgba(240,177,63,.14)}
.fx-kpi-alerta .fx-kpi-k{color:var(--vence-txt)}
.fx-kpi-apagado .fx-kpi-v{color:var(--gris2)}
@container fx (min-width:700px){.fx-kpi{padding:16px 16px 12px}.fx-kpi-v{font-size:32px}}

/* variación respecto al año anterior */
.fx-delta{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 8px 0 6px;border-radius:999px;font:700 12px/1 var(--texto);font-variant-numeric:tabular-nums;white-space:nowrap}
.fx-delta svg{width:12px;height:12px;flex:none}
.fx-delta-bien{background:var(--ok-bg);color:var(--ok-txt)}
.fx-delta-mal{background:var(--ambar-bg);color:#7a4b00;box-shadow:inset 0 0 0 1px var(--ambar-borde)}
.fx-delta-neutro{background:var(--hundido);color:var(--gris)}
.fx-delta-vs{font-size:12px;color:var(--gris2)}

/* minigráfico: línea en el tono apagado, el mes en curso en tinta */
.fx-spark{position:relative;height:30px;margin-top:4px}
.fx-spark-alta{height:56px;margin-top:16px}
.fx-spark svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fx-spark .fx-sp-l{fill:none;stroke:var(--spark);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.fx-spark .fx-sp-a{fill:rgba(20,17,17,.035);stroke:none}
.fx-spark i{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--tinta);box-shadow:0 0 0 2px #fff}
.fx-spark-ejes{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--gris2)}

/* ── gráfico de barras mensual (SVG sin librerías) ── */
.fx-graf-cab{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.fx-ley{display:flex;flex-wrap:wrap;gap:6px 16px;margin:14px 0 0;padding:0;list-style:none;font-size:13px;color:var(--gris)}
.fx-ley li{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.fx-ley b{color:var(--tinta);font-weight:700;font-variant-numeric:tabular-nums}
.fx-ley-linea{display:inline-block;width:14px;height:2px;border-radius:2px;background:var(--s-prev)}
.fx-graf-caja{position:relative;margin-top:10px}
.fx-graf-svg{display:block;width:100%;overflow:visible}
.fx-graf-svg text{font:500 11px var(--texto);fill:var(--gris2);font-variant-numeric:tabular-nums}
.fx-graf-svg .fx-g-rej{stroke:var(--rejilla);stroke-width:1;shape-rendering:crispEdges}
.fx-graf-svg .fx-g-base{stroke:var(--eje);stroke-width:1;shape-rendering:crispEdges}
.fx-graf-svg .fx-g-mes-hoy{font-weight:800;fill:var(--tinta)}
.fx-graf-svg .fx-g-futuro{fill:#a29d94}
.fx-graf-svg .fx-g-et{font-weight:700;fill:var(--tinta)}
.fx-m-ing{fill:var(--s-ing)}.fx-m-fml{fill:var(--s-fml)}.fx-m-cae{fill:var(--s-cae)}
.fx-m-prev{stroke:var(--s-prev);stroke-width:2;stroke-linecap:round}
.fx-m-prev-halo{stroke:#fff;stroke-width:6;stroke-linecap:round}
.fx-g-hit{fill:transparent;cursor:default}
.fx-g-col:focus{outline:none}
.fx-g-col:hover .fx-g-hit,.fx-g-col:focus-visible .fx-g-hit{fill:rgba(20,17,17,.045)}
.fx-graf-svg.fx-g-activo .fx-g-col:not(.fx-on) .fx-g-seg{opacity:.4}
.fx-g-seg{transform-box:fill-box;transform-origin:50% 100%;animation:fx-crece .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 35ms);transition:opacity .15s}
.fx-tip{position:absolute;z-index:3;pointer-events:none;min-width:196px;padding:10px 12px;border-radius:12px;background:var(--tinta);color:#fff;font-size:12.5px;line-height:1.45;box-shadow:0 12px 30px -10px rgba(20,17,17,.5)}
.fx-tip b{font-weight:700}
.fx-tip-t{font-weight:800;margin-bottom:4px}
.fx-tip-f{display:flex;align-items:center;justify-content:space-between;gap:14px;font-variant-numeric:tabular-nums}
.fx-tip-f span{display:inline-flex;align-items:center;gap:6px;color:rgba(255,255,255,.75)}
.fx-tip-f + .fx-tip-f{margin-top:2px}
.fx-tip-tot{border-top:1px solid rgba(255,255,255,.18);margin-top:6px;padding-top:6px}
.fx-graf-nota{margin:10px 0 0;font-size:12.5px;color:var(--gris2);line-height:1.45}

/* ── embudo de presupuestos (ordinal: un tono, de claro a oscuro) ── */
.fx-emb{container:fxemb/inline-size}
.fx-etapas{display:grid;gap:14px;margin-top:16px}
@container fxemb (min-width:600px){.fx-etapas{grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}}
.fx-etapa-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.fx-etapa-top span{font-size:13.5px;font-weight:600;color:var(--gris)}
.fx-etapa-top b{font-family:var(--display);font-weight:700;font-size:28px;line-height:1}
.fx-pista{height:12px;margin-top:8px;border-radius:999px;background:var(--hundido);overflow:hidden}
.fx-pista i{display:block;height:100%;border-radius:0 6px 6px 0;transform-origin:left;animation:fx-ancho .7s cubic-bezier(.2,.8,.2,1) both}
.fx-etapa small{display:block;margin-top:6px;font-size:12.5px;color:var(--gris);font-variant-numeric:tabular-nums}
.fx-etapa small b{color:var(--tinta);font-weight:700}
.fx-emb-pie{margin:14px 0 0;font-size:12.5px;color:var(--gris2)}

/* ── trimestre en curso ── */
.fx-trim .fx-seg{margin-top:14px;width:100%;grid-auto-columns:1fr}
.fx-trim-k{margin:16px 0 0;font-size:13px;font-weight:600;color:var(--gris)}
.fx-trim-v{font-size:52px;margin-top:6px}
.fx-filas{margin:14px 0 0;padding:0;border-top:1px solid var(--linea)}
.fx-fila{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 0;border-bottom:1px solid var(--linea);font-size:14px}
.fx-fila:last-child{border-bottom:0}
.fx-fila dt{color:var(--gris);min-width:0}
.fx-fila dt small{display:block;font-size:12px;color:var(--gris2);margin-top:1px}
.fx-fila dd{margin:0;font-weight:600;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.fx-fila-total dt{color:var(--tinta);font-weight:700}
.fx-fila-total dd{font-weight:800}
.fx-plazo{display:flex;gap:12px;align-items:center;margin-top:14px;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea)}
.fx-plazo > div{flex:1;min-width:0}
.fx-plazo-d{display:block;font-family:var(--display);font-weight:700;font-size:24px;line-height:1.05}
.fx-plazo small{display:block;font-size:12.5px;color:var(--gris);line-height:1.4;margin-top:3px}
.fx-barra{height:8px;margin-top:8px;border-radius:999px;background:#eeece8;overflow:hidden}
.fx-barra i{display:block;height:100%;border-radius:inherit;background:var(--filete);background-size:400% 100%}
.fx-trim-pie{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px}
.fx-trim-nota{font-size:12px;color:var(--gris2)}

/* ── baldosas de icono y avisos (ámbar si falta algo, nunca rojo) ── */
.fx-tile{flex:none;width:36px;height:36px;border-radius:12px;display:grid;place-items:center}
.fx-tile-l{width:48px;height:48px;border-radius:16px}
.fx-tile-crema{background:var(--crema);border:1px solid var(--linea);color:var(--tinta)}
.fx-tile-naranja{background:rgba(255,160,0,.16);color:#8a4b00}
.fx-tile-verde{background:rgba(177,209,62,.22);color:var(--verde-txt)}
.fx-tile-tinta{background:var(--tinta);color:#fff}
.fx-aviso{display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-start;padding:12px 14px;border-radius:16px;font-size:14px;line-height:1.5}
.fx-aviso b{font-weight:700}
.fx-aviso > div{flex:1 1 220px;min-width:0}
.fx-aviso > .fx-aviso-acc{flex:none;align-self:center;margin-left:auto}
.fx-aviso-crema{background:var(--crema);border:1px solid var(--linea);color:#3b3e45}
.fx-aviso-ambar{background:var(--ambar-bg);border:1px solid var(--ambar-borde);color:var(--ambar-txt)}
.fx-aviso-ambar .fx-tile{background:var(--ambar-ico);color:#7a4b00}
.fx-aviso-vence{background:#fff1d1;border:1px solid var(--vence-borde);color:var(--vence-txt)}
.fx-aviso-vence .fx-tile{background:var(--vence-bg);color:var(--vence-txt)}
.fx-aviso-ok{background:#f4f8e8;border:1px solid rgba(177,209,62,.4);color:#3c5409}
.fx-aviso-ok .fx-tile{background:rgba(177,209,62,.25);color:var(--verde-txt)}
@container fx (max-width:639px){.fx-aviso > .fx-aviso-acc{width:100%}.fx-aviso-acc .fx-btn{width:100%}}

/* ── pestañas internas ── */
.fx-tabs{position:sticky;top:var(--fx-tope);z-index:6;display:flex;gap:2px;margin:28px -16px 16px;padding:0 16px;background:var(--crema);border-bottom:1px solid var(--linea2);overflow-x:auto;scrollbar-width:none}
.fx-tabs::-webkit-scrollbar{display:none}
.fx-tab{appearance:none;background:none;border:0;cursor:pointer;position:relative;flex:none;min-height:50px;padding:0 14px;display:inline-flex;align-items:center;gap:8px;font:600 14.5px var(--texto);color:var(--gris);white-space:nowrap;transition:color .15s}
.fx-tab:hover{color:var(--tinta)}
.fx-tab[aria-selected="true"]{color:var(--tinta);font-weight:800}
.fx-tab[aria-selected="true"]::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:3px;border-radius:3px 3px 0 0;background:var(--naranja)}
.fx-tab-n{display:inline-grid;place-items:center;min-width:22px;height:20px;padding:0 7px;border-radius:999px;background:var(--hundido);color:var(--gris);font:700 11.5px/1 var(--texto);font-variant-numeric:tabular-nums}
.fx-tab[aria-selected="true"] .fx-tab-n{background:var(--tinta);color:var(--lima)}
.fx-tab-n-alerta{background:var(--vence-bg);color:var(--vence-txt)}
@container fx (min-width:768px){.fx-tabs{margin:32px -40px 18px;padding:0 40px}}

/* ── chips: de FILTRO (se pulsan) y de ESTADO (se leen) ── */
.fx-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:14px -2px 0;padding:2px 2px 4px}
.fx-chips::-webkit-scrollbar{display:none}
.fx-chip-f{appearance:none;flex:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 12px 0 14px;border-radius:999px;border:1.5px solid var(--linea2);background:#fff;color:var(--tinta);
  font:600 13.5px/1 var(--texto);white-space:nowrap;transition:background-color .15s,border-color .15s,color .15s}
.fx-chip-f:hover{border-color:rgba(20,17,17,.3)}
.fx-chip-f b{font-size:12px;font-weight:700;color:var(--gris);font-variant-numeric:tabular-nums}
.fx-chip-f[aria-pressed="true"]{background:var(--tinta);border-color:var(--tinta);color:#fff}
.fx-chip-f[aria-pressed="true"] b{color:var(--lima)}
.fx-chip-f-alerta{border-color:var(--vence-borde);background:#fffaf0}
.fx-chip-f-alerta::before{content:"";width:7px;height:7px;border-radius:50%;background:#e39a12}
@media (pointer:coarse){.fx-chip-f{min-height:44px}}
.fx-est{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px 0 7px;border-radius:999px;border:1px solid transparent;font:800 10.5px/1 var(--texto);letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
.fx-est svg{width:12px;height:12px;flex:none}
.fx-est-borrador{background:#fff;color:var(--gris);border:1px dashed rgba(20,17,17,.3)}
.fx-est-enviada{background:var(--pizarra-bg);color:var(--pizarra-txt)}
.fx-est-aceptada{background:var(--ok-bg);color:var(--ok-txt)}
.fx-est-rechazada{background:var(--hundido);color:var(--gris)}
.fx-est-emitida{background:#fff;color:var(--tinta);border-color:var(--linea2)}
.fx-est-cobrada{background:var(--verde);color:var(--tinta)}
.fx-est-vencida{background:var(--vence-bg);color:var(--vence-txt);border-color:var(--vence-borde)}
.fx-est-rectificada,.fx-est-anulada{background:var(--hundido);color:#5f626a;text-decoration:line-through;text-decoration-color:rgba(20,17,17,.35)}
.fx-tipo{display:inline-grid;place-items:center;height:18px;padding:0 6px;border-radius:6px;border:1px solid var(--linea2);font:800 10px/1 var(--texto);letter-spacing:.06em;color:var(--gris)}

/* ── listado: tabla densa (escritorio) y tarjetas (móvil) ── */
.fx-lista-cab{display:flex;align-items:flex-end;justify-content:space-between;gap:14px 20px;flex-wrap:wrap}
.fx-herr{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1 1 420px;justify-content:flex-end}
.fx-lista-res{display:flex;flex-wrap:wrap;gap:4px 16px;margin:12px 2px 0;font-size:13px;color:var(--gris)}
.fx-lista-res b{color:var(--tinta);font-weight:700;font-variant-numeric:tabular-nums}
.fx-lista > .fx-aviso{margin-top:12px}
.fx-tabla-caja{margin:14px -24px -22px;border-top:1px solid var(--linea);overflow-x:auto}
.fx-tabla{width:100%;border-collapse:separate;border-spacing:0;font-size:14px}
.fx-tabla th{padding:10px 12px;text-align:left;font-size:10.5px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris);background:var(--hundido);border-bottom:1px solid var(--linea);white-space:nowrap}
.fx-tabla th:first-child,.fx-tabla td:first-child{padding-left:24px}
.fx-tabla th:last-child,.fx-tabla td:last-child{padding-right:16px}
.fx-tabla td{padding:11px 12px;border-bottom:1px solid var(--linea);vertical-align:middle}
.fx-tabla tbody tr{cursor:pointer;transition:background-color .15s}
.fx-tabla tbody tr:hover,.fx-tabla tbody tr:focus-visible{background:#fcfbf8}
.fx-tabla tbody tr:focus-visible{outline:3px solid var(--tinta);outline-offset:-3px}
.fx-tabla tbody tr:last-child td{border-bottom:0}
.fx-t-der{text-align:right!important}
.fx-t-imp{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.fx-t-imp small{display:block;font-size:11.5px;font-weight:500;color:var(--gris2)}
.fx-t-fecha{color:var(--gris);font-variant-numeric:tabular-nums;white-space:nowrap;font-size:13px}
.fx-t-acc{width:1%;white-space:nowrap;text-align:right}
.fx-t-acc > div{display:inline-flex;align-items:center;gap:2px}
.fx-t-rapida{opacity:0;transition:opacity .15s;margin-right:4px}
.fx-tabla tr:hover .fx-t-rapida,.fx-tabla tr:focus-within .fx-t-rapida{opacity:1}
@media (hover:none){.fx-t-rapida{opacity:1}}
.fx-nro{display:inline-flex;align-items:center;gap:8px;font:600 13px/1.2 var(--mono);color:var(--tinta);white-space:nowrap}
.fx-nro-borr{font-family:var(--texto);font-style:italic;font-weight:500;color:var(--gris)}
.fx-fila-apagada .fx-nro{text-decoration:line-through;text-decoration-color:rgba(20,17,17,.35)}
.fx-fila-apagada td,.fx-fila-apagada.fx-tarjeta{color:var(--gris2)}
.fx-cli{min-width:0;max-width:420px}
/* tabla estrecha: la columna de cliente se vuelve elástica y recorta con «…» en vez de ensanchar la tabla */
@container fx (max-width:999px){.fx-t-cli{width:100%;max-width:0}.fx-t-cli .fx-cli{max-width:none}}
.fx-cli b{display:block;font-weight:600;color:var(--tinta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-cli small{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-cobro{font-size:13px;color:var(--gris);white-space:nowrap;font-variant-numeric:tabular-nums}
.fx-cobro-vence{color:var(--vence-txt);font-weight:700}
.fx-cobro-ok{color:var(--verde-txt)}
.fx-lista-pie{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin:30px 0 0;font-size:13px;color:var(--gris)}
.fx-tarjetas{display:none}
.fx-tarjeta{display:grid;gap:8px;padding:14px 12px 12px 16px;background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:var(--sombra-baja);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s ease}
.fx-tarjeta:active{transform:scale(.99)}
.fx-tarjeta-top{display:flex;align-items:center;gap:10px}
.fx-tarjeta-top .fx-t-fecha{margin-left:auto}
.fx-tarjeta .fx-cli{max-width:none}
.fx-tarjeta-pie{display:flex;align-items:center;gap:10px}
.fx-tarjeta-izq{flex:1;min-width:0;display:grid;gap:4px}
.fx-tarjeta-fila{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}
.fx-tarjeta-total{font-weight:800;font-size:16.5px;font-variant-numeric:tabular-nums}
.fx-tarjeta-pie > .fx-btn{flex:none}
.fx-cobro-bajo{display:none;margin-top:5px}
/* la tabla adelgaza antes de volverse tarjetas: fuera la fecha, el cobro pasa bajo el estado y la acción rápida se queda en el menú */
@container fx (max-width:899px){.fx-col-fecha{display:none}}
@container fx (min-width:900px){.fx-nro-fecha{display:none}}
@container fx (max-width:999px){.fx-col-cobro{display:none}.fx-cobro-bajo{display:block}.fx-t-rapida{display:none}}
@container fx (max-width:639px){
  .fx-lista{background:none;border:0;box-shadow:none;border-radius:0;padding:0;overflow:visible}
  .fx-tabla-caja{display:none}
  .fx-tarjetas{display:grid;gap:10px;margin-top:12px}
  .fx-herr{flex-basis:100%;justify-content:stretch}
  .fx-herr .fx-buscar{flex-basis:100%}
  .fx-herr .fx-btn{flex:1}
}

/* ── estados vacíos y espera ── */
.fx-vacio{display:grid;justify-items:center;text-align:center;gap:10px;padding:36px 20px}
.fx-vacio p{max-width:380px;margin:0;font-size:14.5px;color:var(--gris);line-height:1.55}
.fx-vacio .fx-btn{margin-top:6px}
.fx-vacio-peq{padding:18px 8px}
.fx-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:fx-shim 1.3s linear infinite;border-radius:12px}
.fx-sk-kpi{height:136px;border-radius:20px}
.fx-sk-linea{height:12px;border-radius:6px}
.fx-sk-cifra{height:40px;width:60%;border-radius:10px}
.fx-sk-fila{height:58px;border-radius:14px}
.fx-recargando{opacity:.5;transition:opacity .2s ease;pointer-events:none}
.fx-spin{animation:fx-rot .8s linear infinite}

/* ── capa, diálogo, panel lateral, menú y aviso flotante (van a <body> por portal) ── */
.fx-capa{position:fixed;inset:0;z-index:9000;display:flex;align-items:flex-end;justify-content:center;background:rgba(20,17,17,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:fx-fade .2s ease both}
.fx-dialogo{width:100%;max-height:92vh;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;background:var(--crema);border-radius:24px 24px 0 0;box-shadow:var(--sombra-alta);animation:fx-sube .32s cubic-bezier(.2,.8,.2,1) both;padding-bottom:env(safe-area-inset-bottom)}
.fx-asa{width:40px;height:5px;border-radius:999px;background:rgba(20,17,17,.16);margin:0 auto 10px}
.fx-dlg-cab{position:sticky;top:0;z-index:2;padding:10px 16px 12px 20px;background:var(--crema);border-bottom:1px solid var(--linea)}
.fx-dlg-tit{display:flex;align-items:center;justify-content:space-between;gap:12px}
.fx-dlg-tit h2{font-size:26px;line-height:1.05;margin:2px 0 0}
.fx-dlg-cuerpo{padding:18px 20px}
.fx-dlg-cuerpo > * + *{margin-top:14px}
.fx-dlg-pie{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1.6fr;gap:10px;padding:14px 20px 16px;background:var(--crema);border-top:1px solid var(--linea)}
.fx-dlg-cifra{padding:16px 18px;border-radius:20px;background:#fff;border:1px solid var(--linea)}
.fx-dlg-cifra .fx-importe{display:flex;font-size:46px;margin-top:10px}
.fx-dlg-cifra p{margin:8px 0 0;font-size:13.5px;color:var(--gris)}
@media (min-width:640px){
  .fx-capa{align-items:center;padding:24px}
  .fx-dialogo{max-width:480px;border-radius:24px;max-height:88vh}
  .fx-asa{display:none}
  .fx-dlg-cab{padding:16px 18px 14px 24px}
  .fx-dlg-cuerpo{padding:20px 24px}
  .fx-dlg-pie{padding:16px 24px}
}
.fx-capa-panel{align-items:stretch;justify-content:flex-end;padding:0}
.fx-panel{display:flex;flex-direction:column;width:100%;height:100%;background:var(--crema);box-shadow:var(--sombra-alta);animation:fx-sube .32s cubic-bezier(.2,.8,.2,1) both}
.fx-panel-cab{position:relative;flex:none;padding:20px 16px 14px 20px;border-bottom:1px solid var(--linea)}
.fx-panel-tit{display:flex;align-items:flex-start;gap:12px}
.fx-panel-tit > div{flex:1;min-width:0}
.fx-panel-tit .fx-est{margin-top:6px}
.fx-panel-cuerpo{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:16px 16px 28px}
.fx-panel-cuerpo > * + *{margin-top:12px}
.fx-panel-pie{flex:none;display:flex;gap:10px;justify-content:flex-end;padding:14px 16px calc(14px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--linea)}
.fx-panel-pie .fx-btn{flex:1}
@media (min-width:768px){
  .fx-capa-panel{padding:12px}
  .fx-panel{width:min(720px,100%);height:auto;border-radius:24px;overflow:hidden;animation-name:fx-lado}
  .fx-panel-cab{padding:22px 20px 16px 26px}
  .fx-panel-cuerpo{padding:20px 26px 32px}
  .fx-panel-pie{padding:16px 26px}
  .fx-panel-pie .fx-btn{flex:none}
}
.fx-seccion{background:#fff;border:1px solid var(--linea);border-radius:20px;padding:16px}
.fx-sec-tit{margin:0 0 12px;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris)}
.fx-rejilla{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.fx-lineas{border:1px solid var(--linea);border-radius:14px;overflow:hidden}
.fx-linea{display:grid;grid-template-columns:minmax(0,1fr) 56px 104px 60px 112px;gap:10px;align-items:center;padding:11px 12px;font-size:14px;border-top:1px solid var(--linea)}
.fx-linea:first-child{border-top:0;padding:8px 12px;background:var(--hundido);font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.fx-linea .fx-num{text-align:right}
.fx-linea small{display:none;font-size:12.5px;color:var(--gris);margin-top:2px}
@media (max-width:560px){
  .fx-linea{grid-template-columns:minmax(0,1fr) auto}
  .fx-linea > :nth-child(2),.fx-linea > :nth-child(3),.fx-linea > :nth-child(4){display:none}
  .fx-linea small{display:block}
}
.fx-totales{background:#fff;border:1px solid var(--linea);border-radius:20px;padding:6px 18px 16px}
.fx-total-grande{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-top:14px;margin-top:4px;border-top:1px solid var(--linea)}
.fx-total-grande span{font-size:14px;font-weight:700}
.fx-total-grande .fx-importe{font-size:42px}
.fx-pop{position:fixed;z-index:9100;width:max-content;min-width:250px;max-width:min(330px,calc(100vw - 24px));padding:6px;background:#fff;border:1px solid var(--linea);border-radius:16px;box-shadow:var(--sombra-alta);font-family:var(--texto);animation:fx-fade .14s ease both}
.fx-pop-tit{padding:9px 10px 7px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-pop-item{appearance:none;width:100%;display:flex;align-items:center;gap:10px;min-height:42px;padding:0 10px;border:0;border-radius:10px;background:none;cursor:pointer;text-align:left;font:600 14px var(--texto);color:var(--tinta)}
.fx-pop-item:hover,.fx-pop-item:focus-visible{background:var(--hundido)}
.fx-pop-item svg{flex:none;color:var(--gris)}
.fx-pop-aviso{color:#7a4b00}
.fx-pop-aviso svg{color:#7a4b00}
.fx-pop-info{display:flex;gap:8px;padding:8px 10px;font-size:12.5px;line-height:1.4;color:var(--gris)}
.fx-pop hr{border:0;border-top:1px solid var(--linea);margin:6px 4px}
@media (pointer:coarse){.fx-pop-item{min-height:48px}}
.fx-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9200;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:12px 16px;border-radius:14px;background:var(--tinta);color:#fff;font:600 14px/1.35 var(--texto);box-shadow:0 12px 30px -10px rgba(20,17,17,.5);animation:fx-toast .25s cubic-bezier(.2,.8,.2,1) both}
.fx-toast svg{flex:none;color:var(--lima)}
.fx-toast-aviso svg{color:#ffc65c}

/* ── movimiento ── */
.fx-in{animation:fx-up .55s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 60ms)}
@keyframes fx-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes fx-crece{from{transform:scaleY(0)}to{transform:none}}
@keyframes fx-ancho{from{transform:scaleX(0)}to{transform:none}}
@keyframes fx-sube{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes fx-lado{from{transform:translateX(48px);opacity:.4}to{transform:none;opacity:1}}
@keyframes fx-fade{from{opacity:0}to{opacity:1}}
@keyframes fx-toast{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes fx-shim{to{background-position:-200% 0}}
@keyframes fx-rot{to{transform:rotate(360deg)}}
@container fx (max-width:359px){.fx-h1{font-size:34px}.fx-h2{font-size:26px}.fx-h3{font-size:21px}.fx-hero-v{font-size:48px}.fx-trim-v{font-size:44px}.fx-kpi-v{font-size:24px}}
@media (prefers-reduced-motion:reduce){
  .fx-in,.fx-g-seg,.fx-pista i,.fx-sk,.fx-spin,.fx-capa,.fx-dialogo,.fx-panel,.fx-pop,.fx-toast{animation:none}
  .fx-btn,.fx-kpi,.fx-tarjeta,.fx-recargando{transition:none}
}
@media (forced-colors:active){.fx-m-ing,.fx-m-fml,.fx-m-cae{fill:CanvasText}.fx-est,.fx-chip-f{border:1px solid CanvasText}}

/* ═══ Armazón, «Hoy» y «Trimestres» (FacturacionView, components/hoy, components/trimestres) ═══ */
/* cabecera: «+ Nuevo ▾» y ⚙ */
.fx-btn-icono{padding:0;width:48px;min-height:48px;border-radius:16px}
.fx-nuevo-flecha{opacity:.7;margin-left:-4px}
@container fx (max-width:639px){
  .fx-cab-acc.fx-cab-nuevo{grid-template-columns:minmax(0,1fr) auto}
  .fx-cab-nuevo .fx-btn-icono{width:52px;min-height:52px}
}
.fx-pop-item .fx-kbd{margin-left:auto}
.fx-pop-item small{display:block;font-size:12px;font-weight:500;color:var(--gris);margin-top:1px}
.fx-pop-item > span{min-width:0}
.fx-tabpanel:focus{outline:none}
.fx-vacio-pestana{max-width:560px}

/* chips de estado genéricos (trimestres, gastos, paquete) */
.fx-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font:800 10.5px/1 var(--texto);letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.fx-chip svg{width:12px;height:12px;flex:none}
.fx-chip-ok{background:var(--ok-bg);color:var(--ok-txt)}
.fx-chip-ambar{background:var(--ambar-bg);color:#7a4b00;box-shadow:inset 0 0 0 1px var(--ambar-borde)}
.fx-chip-vence{background:var(--vence-bg);color:var(--vence-txt);box-shadow:inset 0 0 0 1px var(--vence-borde)}
.fx-chip-gris{background:var(--hundido);color:var(--gris)}
.fx-chip-tinta{background:var(--tinta);color:#fff}
.fx-chip-pizarra{background:var(--pizarra-bg);color:var(--pizarra-txt)}
.fx-chip-borde{background:#fff;color:var(--gris);border:1px dashed rgba(20,17,17,.3)}
.fx-tile-vence{background:var(--vence-bg);color:var(--vence-txt)}
.fx-tile-ambar{background:var(--ambar-ico);color:#7a4b00}
.fx-tile-gris{background:var(--hundido);color:var(--gris)}

/* ── Hoy: cabecera del cuadro ── */
.fx-hoy-cab{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 14px;margin:0 2px 12px}
.fx-hoy-ctrl{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
@container fx (max-width:639px){
  .fx-hoy-ctrl{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto}
  .fx-hoy-ctrl .fx-seg{grid-column:1/-1;width:100%;grid-auto-columns:1fr}
  .fx-hoy-ctrl .fx-select-peq{width:100%}
}
/* la lista «Para hoy» va DENTRO de la rejilla (área «hoy»): plegado, se queda sola bajo la tira */
.fx-hoy-area{grid-area:hoy}
.fx-dash{grid-template-areas:"hero" "kpis" "hoy" "trim" "graf" "emb"}
@container fx (min-width:700px){.fx-dash{grid-template-areas:"hero hero" "kpis kpis" "hoy hoy" "graf graf" "trim emb"}}
@container fx (min-width:1080px){
  .fx-dash{grid-template-areas:"hero hero hero hero hero kpis kpis kpis kpis kpis kpis kpis" "hoy hoy hoy hoy hoy hoy hoy hoy trim trim trim trim" "graf graf graf graf graf graf graf graf trim trim trim trim" "emb emb emb emb emb emb emb emb trim trim trim trim"}
  .fx-dash > .fx-trim{align-self:start}
}
.fx-plegado .fx-dash{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"hoy"}
.fx-plegado .fx-dash > :not(.fx-hoy-area){display:none}
.fx-plegado .fx-tira{margin-bottom:14px}
.fx-tira-item{appearance:none;font:inherit;color:inherit;text-align:left;cursor:pointer}
.fx-kpi-v .fx-kpi-ud{font-size:.6em;margin-left:3px}
.fx-kpi-nota + .fx-kpi-nota{margin-top:-2px}
.fx-hero-v{max-width:100%}
.fx-trim .fx-aviso{margin-top:12px}

/* ── Hoy: «Para hoy» (una fila por cosa pendiente, con UN botón) ── */
.fx-ph-lista{list-style:none;margin:14px 0 0;padding:0;border-top:1px solid var(--linea)}
.fx-ph{display:grid;grid-template-columns:36px minmax(0,1fr) auto;grid-template-areas:"tile tit imp" "tile det acc";gap:3px 12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--linea)}
.fx-ph:last-child{border-bottom:0}
.fx-ph > .fx-tile{grid-area:tile;align-self:start}
.fx-ph-tit{grid-area:tit;min-width:0;font-size:14.5px;font-weight:600;color:var(--tinta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-ph-tit .fx-mono{font-size:13px;font-weight:600}
.fx-ph-det{grid-area:det;min-width:0;font-size:12.5px;color:var(--gris);line-height:1.4}
.fx-ph-imp{grid-area:imp;justify-self:end;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:14.5px}
.fx-ph-acc{grid-area:acc;justify-self:end;align-self:end}
@container fx (min-width:640px){
  .fx-ph{grid-template-columns:36px minmax(0,1fr) auto auto;grid-template-areas:"tile tit imp acc" "tile det imp acc";gap:3px 16px}
  .fx-ph-acc{align-self:center}
  .fx-ph-acc .fx-btn{min-width:116px}
}
.fx-ph-tit{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.35}
.fx-ph-pie{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
.fx-ph-error{margin-top:10px}

/* ── Trimestres ── */
.fx-tri-cab{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px 16px}
.fx-tris{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}
@container fx (min-width:700px){.fx-tris{grid-template-columns:repeat(4,minmax(0,1fr))}}
.fx-tri{appearance:none;font:inherit;color:inherit;text-align:left;cursor:pointer;position:relative;overflow:hidden;display:grid;align-content:start;gap:6px;min-height:104px;padding:16px 14px 14px;border-radius:20px;background:#fff;border:1.5px solid var(--linea);box-shadow:var(--sombra-baja);transition:border-color .15s,box-shadow .15s,transform .12s}
.fx-tri:hover{border-color:rgba(20,17,17,.24)}
.fx-tri:active{transform:scale(.99)}
.fx-tri[aria-pressed="true"]{border-color:var(--tinta);box-shadow:0 0 0 3px rgba(255,160,0,.22)}
.fx-tri:disabled{opacity:.55;cursor:default;transform:none}
.fx-tri-n{font-family:var(--display);font-weight:700;font-size:30px;line-height:1}
.fx-tri-m{font-size:12.5px;color:var(--gris)}
.fx-tri-curso::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:var(--filete)}
.fx-tri-vistas{margin-top:18px}
.fx-tri-vistas.fx-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;width:100%;max-width:620px}
.fx-tri-vistas.fx-seg button{padding:0 8px}
.fx-pila > * + *{margin-top:14px}
.fx-dos{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@container fx (min-width:900px){.fx-dos{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fx-dos > .fx-card{align-self:start}
.fx-sub-tit{margin:20px 0 0;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris)}
.fx-cifra-m{font-size:40px;margin-top:6px}
.fx-nombre-fiscal{margin:4px 0 0;font-size:12.5px;color:var(--gris2);line-height:1.4}
.fx-plazos{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.fx-ls{list-style:none;margin:12px 0 0;padding:0}
.fx-ls-item{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--linea)}
.fx-ls-item:first-child{border-top:0}
.fx-ls-item > div{flex:1;min-width:0}
.fx-ls-item b{font-weight:600;font-size:14px}
.fx-ls-item small{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4;overflow-wrap:anywhere}
.fx-ls-imp{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.fx-ls-imp small{font-weight:500;color:var(--gris2);font-size:11.5px}
.fx-ls .fx-tile{width:32px;height:32px;border-radius:10px}
.fx-mini-tabla{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;font-variant-numeric:tabular-nums}
.fx-mini-tabla th{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gris);text-align:right;padding:6px 4px;border-bottom:1px solid var(--linea)}
.fx-mini-tabla th:first-child,.fx-mini-tabla td:first-child{text-align:left}
.fx-mini-tabla td{padding:7px 4px;border-bottom:1px solid var(--linea);text-align:right;white-space:nowrap}
.fx-mini-tabla tr:last-child td{border-bottom:0;font-weight:700}
.fx-caja-scroll{overflow-x:auto}
.fx-espera-txt{display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:14px;color:var(--gris)}

/* ── Trimestres · gastos ── */
.fx-gs-herr{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;justify-content:space-between;margin-top:14px}
.fx-gs-res{display:flex;flex-wrap:wrap;gap:6px}
.fx-gs-grupo{margin-top:22px}
.fx-gs-grupo-cab{display:flex;align-items:baseline;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;padding:0 2px 10px;border-bottom:1px solid var(--linea2)}
.fx-gs-grupo-cab h3{display:flex;align-items:center;gap:8px}
.fx-gs-grupo-cab p{margin:0;font-size:12.5px;color:var(--gris);font-variant-numeric:tabular-nums}
.fx-gs-mes{margin:14px 2px 2px;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris2)}
.fx-gs{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"prov total" "meta est" "av av" "acc acc" "ed ed";gap:4px 12px;align-items:center;padding:12px 2px;border-bottom:1px solid var(--linea)}
.fx-gs-prov{grid-area:prov;min-width:0}
.fx-gs-prov b{display:block;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-gs-prov small{display:block;font-size:12.5px;color:var(--gris);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.fx-gs-total{grid-area:total;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.fx-gs-total small{display:block;font-size:11.5px;font-weight:500;color:var(--gris2)}
.fx-gs-meta{grid-area:meta;min-width:0;font-size:12.5px;color:var(--gris);font-variant-numeric:tabular-nums;line-height:1.4}
.fx-gs-est{grid-area:est;justify-self:end}
.fx-gs-av{grid-area:av;margin:2px 0 0;padding:0;list-style:none;font-size:12.5px;line-height:1.45;color:#7a4b00}
.fx-gs-av li{display:flex;gap:6px;align-items:flex-start}
.fx-gs-av svg{flex:none;margin-top:2px}
.fx-gs-acc{grid-area:acc;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.fx-gs-ed{grid-area:ed;margin-top:8px}
@container fx (min-width:900px){
  .fx-gs{grid-template-columns:minmax(0,1fr) 230px 120px 112px auto;grid-template-areas:"prov meta total est acc" "av av av av av" "ed ed ed ed ed"}
  .fx-gs-acc{flex-wrap:nowrap}
}
.fx-gs-vecinos{margin-top:14px}
.fx-gs-ed .fx-seccion{background:var(--crema)}
.fx-gs-ed-pie{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px}
.fx-campo-aviso .fx-input{border-color:#e3b04a;background:#fffaf0}
.fx-progreso{height:10px;border-radius:999px;background:#eeece8;overflow:hidden;margin-top:12px}
.fx-progreso i{display:block;height:100%;border-radius:inherit;background:var(--filete);transition:width .3s ease}

/* ── Trimestres · paquete para la gestoría ── */
.fx-pq-res{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));margin-top:16px}
.fx-pq-dato{padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);min-width:0}
.fx-pq-dato span{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.fx-pq-dato b{display:block;font-family:var(--display);font-weight:700;font-size:30px;line-height:1.05;margin-top:4px}
.fx-pq-dato small{display:block;font-size:12px;color:var(--gris);margin-top:2px;overflow-wrap:anywhere}
.fx-pq-carpetas{margin-top:16px;border-bottom:1px solid var(--linea)}
.fx-pq-carpeta{border-top:1px solid var(--linea)}
.fx-pq-carpeta > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;min-height:48px;padding:6px 2px;font-weight:700;font-size:14px;border-radius:10px}
.fx-pq-carpeta > summary::-webkit-details-marker{display:none}
.fx-pq-carpeta > summary > span{min-width:0;overflow-wrap:anywhere}
.fx-pq-carpeta > summary .fx-pq-n{margin-left:auto;display:flex;gap:6px;flex:none}
.fx-pq-carpeta[open] > summary .fx-pq-flecha{transform:rotate(90deg)}
.fx-pq-flecha{flex:none;transition:transform .15s;color:var(--gris)}
.fx-pq-fich{list-style:none;margin:0 0 10px;padding:0 0 0 28px}
.fx-pq-fich li{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;padding:7px 0;border-top:1px dashed var(--linea)}
.fx-pq-fich li > span{min-width:0;font:500 12.5px/1.4 var(--mono);overflow-wrap:anywhere}
.fx-pq-fich li small{display:block;margin-top:2px;font:400 12px/1.4 var(--texto);color:var(--gris2)}
.fx-pq-fich li .fx-chip{flex:none}
.fx-pq-acc{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
@container fx (max-width:639px){.fx-pq-acc .fx-btn{flex:1 1 100%}}

/* ── Ajustes ── */
.fx-ajuste{appearance:none;width:100%;display:flex;align-items:center;gap:14px;min-height:64px;padding:12px 14px;border-radius:18px;border:1px solid var(--linea);background:#fff;cursor:pointer;text-align:left;font:inherit;color:var(--tinta);transition:border-color .15s}
.fx-ajuste:hover{border-color:rgba(20,17,17,.24)}
.fx-ajuste > div{flex:1;min-width:0}
.fx-ajuste b{display:block;font-size:15px;font-weight:700}
.fx-ajuste small{display:block;font-size:13px;color:var(--gris);margin-top:2px;line-height:1.4}
.fx-ajuste > svg:last-child{flex:none;color:var(--gris)}
.fx-ajuste:disabled{opacity:.55;cursor:default}
.fx-eyebrow > .fx-dot,.fx-h3 > .fx-dot{margin-right:7px;vertical-align:1px}
.fx-ajuste + .fx-ajuste{margin-top:10px}
.fx-ajuste + .fx-nombre-fiscal{margin-top:14px}
.fx-nombre-fiscal > svg{display:inline-block;vertical-align:-2px;margin-right:2px}
@media (prefers-reduced-motion:reduce){.fx-progreso i,.fx-tri,.fx-pq-flecha{transition:none}}
`;


/** Importe en euros, agrupando SIEMPRE los miles (es-ES no agrupa 4 cifras) y con el menos real. */
export function eur(n, dec = 2) {
    const v = Number(n) || 0;
    const neg = v < 0;
    const [e, c] = Math.abs(v).toFixed(dec).split('.');
    return `${neg ? '−' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? ',' + c : ''} €`;
}

/** La cifra grande, con los céntimos pequeños. */
export const Importe = ({ n, dec = 2, className = '' }) => {
    const t = eur(n, dec);
    const i = t.lastIndexOf(',');
    return i < 0
        ? <span className={`fx-importe ${className}`}>{t}</span>
        : <span className={`fx-importe ${className}`}>{t.slice(0, i)}<small>{t.slice(i)}</small></span>;
};

// Iconos de trazo 24×24, sin librería. Los que empiezan por «<» son marcado SVG; el resto, el «d» de un <path>.
export const ICO = {
    mas: 'M12 5v14M5 12h14', buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    arriba: 'M6 15l6-6 6 6', abajo: 'M6 9l6 6 6-6', derecha: 'M5 12h14M13 6l6 6-6 6',
    subeD: 'M7 17L17 7M9 7h8v8', bajaD: 'M7 7l10 10M17 9v8H9', check: 'M5 12.5l4.5 4.5L19 7.5',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
    lapiz: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4', enviar: 'M21 3L10 14 M21 3l-6.5 18-4.5-7-7-4.5z',
    rect: 'M4 8h13l-3-3M20 16H7l3 3', x: 'M6 6l12 12M18 6L6 18', pdf: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 13h6M9 17h4',
    euro: 'M17 6.5A7 7 0 1 0 17 17.5 M4 10.5h9M4 13.5h9', calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    recibo: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6M9 12h6M9 16h3', tabla: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
    borrar: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', filtro: 'M4 5h16l-6 8v6l-4-2v-4z',
    carpeta: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    mas3: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
};

/** <Ico n="check" /> — el icono por nombre (o un `d` suelto), en currentColor. */
export const Ico = ({ n, d, size = 20, sw = 2, className = '', ...p }) => {
    const v = d || ICO[n] || '';
    const marcado = v.startsWith('<');
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...p}
            {...(marcado ? { dangerouslySetInnerHTML: { __html: v } } : {})}>
            {marcado ? null : <path d={v} />}
        </svg>
    );
};

// ── Lo que comparten el armazón, «Hoy» y «Trimestres» (añadido el 24/10/2026) ──────────────

Object.assign(ICO, {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
    reintentar: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
    enlace: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    leer: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><circle cx="11.5" cy="13.5" r="2.5"/><path d="M13.3 15.3L15.5 17.5"/>',
    lista: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    banco: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
});

/** localStorage SOLO para comodidades de cada usuario (la última pestaña, el cuadro plegado): puede fallar. */
export function leerLocal(clave, porDefecto = null) {
    try { const v = window.localStorage.getItem(clave); return v == null ? porDefecto : v; } catch { return porDefecto; }
}
export function guardarLocal(clave, valor) {
    try { window.localStorage.setItem(clave, String(valor)); } catch { /* modo privado o almacenamiento bloqueado: da igual */ }
}

/** Los avisos de la API vienen con tono rojo|ambar|azul. Aquí NUNCA hay rojo: «rojo» se pinta en el ámbar fuerte (VENCIDA). */
export const tonoDeApi = (t) => (t === 'rojo' ? 'vence' : t === 'ambar' ? 'ambar' : t === 'verde' || t === 'ok' ? 'ok' : 'crema');
const ICONO_TONO = { vence: 'alerta', ambar: 'alerta', ok: 'check', crema: 'info' };

/** Una caja de aviso: icono, texto y, si hace falta, UNA acción. */
export function AvisoFx({ tono = 'ambar', icono, children, accion = null, className = '', ...p }) {
    return (
        <div className={`fx-aviso fx-aviso-${tono} ${className}`} {...p}>
            <span className="fx-tile"><Ico n={icono || ICONO_TONO[tono] || 'info'} size={18} /></span>
            <div>{children}</div>
            {accion && <div className="fx-aviso-acc">{accion}</div>}
        </div>
    );
}

/** El error de una llamada, en lo que la pantalla necesita: el código y una frase. */
export function errorDeApi(err) {
    return { status: err?.response?.status || 0, texto: err?.response?.data?.error || err?.message || 'Error desconocido' };
}

/**
 * Lo que se enseña cuando una lectura falla. Regla 38: con la BD caída (503) NUNCA una cifra a
 * cero; se dice qué pasa y se ofrece reintentar. Una ruta que aún no existe (404) se dice con calma.
 */
export function ErrorApi({ error, que = 'los datos', onReintentar, className = '' }) {
    if (!error) return null;
    const { status, texto } = error;
    let tono = 'ambar';
    let frase;
    if (status === 404) { tono = 'crema'; frase = <><b>Esta parte aún no está en el servidor.</b> Cuando se despliegue su ruta, {que} aparecerán aquí; lo demás de la pestaña funciona.</>; }
    else if (status === 503) frase = <><b>La base de datos no responde ahora mismo.</b> No enseñamos {que} para no darte un 0 que no es: tus datos siguen ahí.</>;
    else if (status === 502) frase = <><b>Google Drive no responde.</b> {texto}</>;
    else if (status === 403) frase = <><b>Esto es solo para el administrador.</b> {texto}</>;
    else if (!status) frase = <><b>Sin conexión con el servidor.</b> No se han podido traer {que}.</>;
    else frase = <><b>No se han podido traer {que}.</b> {texto}</>;
    return (
        <AvisoFx tono={tono} className={className} role="alert"
            accion={onReintentar && status !== 404 ? (
                <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={onReintentar}><Ico n="reintentar" size={16} />Reintentar</button>
            ) : null}>
            {frase}
        </AvisoFx>
    );
}

/**
 * Diálogo crema (`.fx-dialogo`): centrado en PC, hoja desde abajo en el móvil. Va por portal a
 * <body>; los tokens los redeclara `.fx-capa`. Se cierra con ✕, Esc o tocando fuera (salvo ocupado).
 */
export function DialogoFx({ titulo, antetitulo = null, children, pie = null, onClose, ocupado = false }) {
    const id = useId();
    const caja = useRef(null);
    const cerrar = useRef(onClose);
    useEffect(() => { cerrar.current = onClose; }, [onClose]);
    const ocupadoRef = useRef(ocupado);
    useEffect(() => { ocupadoRef.current = ocupado; }, [ocupado]);
    useEffect(() => {
        const previo = document.activeElement;
        const primero = caja.current?.querySelector('[data-autofoco], .fx-dlg-cuerpo button, .fx-dlg-cuerpo input, .fx-dlg-pie button, .fx-cerrar');
        primero?.focus?.();
        const h = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            if (!ocupadoRef.current) cerrar.current?.();
        };
        window.addEventListener('keydown', h, true);
        return () => { window.removeEventListener('keydown', h, true); previo?.focus?.(); };
    }, []);
    return createPortal(
        <div className="fx-capa" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado) onClose?.(); }}>
            <div className="fx-dialogo" role="dialog" aria-modal="true" aria-labelledby={id} ref={caja}>
                <div className="fx-dlg-cab">
                    <div className="fx-asa" aria-hidden="true" />
                    <div className="fx-dlg-tit">
                        <div style={{ minWidth: 0 }}>
                            {antetitulo && <div className="fx-eyebrow">{antetitulo}</div>}
                            <h2 className="fx-display" id={id}>{titulo}</h2>
                        </div>
                        <button type="button" className="fx-cerrar" aria-label="Cerrar" onClick={onClose} disabled={ocupado}><Ico n="x" /></button>
                    </div>
                </div>
                <div className="fx-dlg-cuerpo">{children}</div>
                {pie && <div className="fx-dlg-pie">{pie}</div>}
            </div>
        </div>,
        document.body,
    );
}

/** Aviso flotante (`.fx-toast`): [nodo, avisar(texto, tono)]. Se va solo a los 4 s. */
export function useToastFx() {
    const [t, setT] = useState(null);
    const reloj = useRef(null);
    useEffect(() => () => clearTimeout(reloj.current), []);
    const avisar = (texto, tono = 'ok') => {
        clearTimeout(reloj.current);
        setT({ texto, tono, k: Date.now() });
        reloj.current = setTimeout(() => setT(null), 4000);
    };
    const nodo = t ? createPortal(
        <div key={t.k} className={`fx-toast ${t.tono === 'aviso' ? 'fx-toast-aviso' : ''}`} role="status">
            <Ico n={t.tono === 'aviso' ? 'alerta' : 'check'} size={18} />{t.texto}
        </div>, document.body) : null;
    return [nodo, avisar];
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_FX = MESES_LARGOS;
export const MESES_CORTOS_FX = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** «2026-10-20» → «20/10/2026». */
export const fechaEs = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
/** Hoy en Madrid, AAAA-MM-DD (el mismo criterio que el servidor). */
export const hoyMadridFx = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
/** Días de `a` a `b` (AAAA-MM-DD). */
export const diasEntreFx = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
/** Un número entero agrupado («1.234»), para contadores y porcentajes. */
export const entero = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
