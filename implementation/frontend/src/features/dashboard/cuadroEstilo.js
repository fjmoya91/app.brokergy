// El cuadro de mando de dirección: lo PROPIO, encima del kit crema de Facturación
// (estilo «carta de pago», regla 164; `CSS` de features/facturacion/estilo.jsx).
// Prefijo .cm- · móvil primero · consultas al contenedor `fx` (lo declara .fx).
// Nada de Tailwind aquí dentro: el tema del CRM no alcanza el .fx.
export const CSS_CUADRO = `
/* las áreas de rejilla del cuadro de Facturación no valen aquí */
.cm .fx-hero,.cm .fx-kpis,.cm .fx-trim,.cm .fx-graf,.cm .fx-emb{grid-area:auto}

/* ── cabecera ── */
.cm-cab{display:grid;gap:14px;align-items:end;margin:6px 0 4px}
.cm-cab .fx-sub{max-width:720px}
.cm-cab-acc{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cm-cab-acc .fx-btn{min-height:44px}
@container fx (min-width:980px){.cm-cab{grid-template-columns:minmax(0,1fr) auto}.cm-cab-acc{justify-content:flex-end}}
@container fx (max-width:639px){.cm-cab-acc{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(0,1fr)}.cm-cab-acc .fx-btn{padding:0 10px}}
@container fx (max-width:479px){.cm-solo-ancho{display:none}}
.cm-act{font-size:12.5px;color:var(--gris2);margin:6px 0 0}

/* navegación por secciones: la tira de pestañas del kit, pero son anclas */
.cm-nav{margin-top:18px}
.cm-nav .fx-tab[aria-current="true"]{color:var(--tinta);font-weight:800}
.cm-nav .fx-tab[aria-current="true"]::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:3px;border-radius:3px 3px 0 0;background:var(--naranja)}

/* ── secciones ── */
.cm-sec{scroll-margin-top:calc(var(--fx-tope) + 64px);margin-top:30px}
.cm-sec:first-of-type{margin-top:8px}
.cm-sec-cab{display:flex;align-items:flex-end;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin:0 2px 14px}
.cm-sec-cab > div{min-width:0;flex:1 1 320px}
.cm-sec-cab p{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--gris);max-width:720px}
.cm-sec-cab p b{color:var(--tinta);font-weight:600}
.cm-rej{display:grid;gap:14px;grid-template-columns:minmax(0,1fr);align-content:start}
@container fx (min-width:900px){.cm-rej-2{grid-template-columns:repeat(2,minmax(0,1fr))}.cm-rej-75{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}.cm-rej-57{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
.cm-rej > .fx-card{align-self:start}
.cm-estira > .fx-card{align-self:stretch}

/* ── arriba: el EBITDA y las seis cifras ── */
.cm-top{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@container fx (min-width:1080px){.cm-top{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
.cm-hero-sub{display:flex;flex-wrap:wrap;gap:6px 14px;margin:12px 0 0;font-size:14px;color:var(--gris)}
.cm-hero-sub b{color:var(--tinta);font-weight:700;font-variant-numeric:tabular-nums}
.cm-hero .fx-aviso{margin-top:14px}
.cm-ec{list-style:none;margin:14px 0 0;padding:12px 0 0;border-top:1px solid var(--linea);display:grid;gap:6px;font-size:13px;color:var(--gris);font-variant-numeric:tabular-nums}
.cm-ec li{display:flex;justify-content:space-between;gap:10px}
.cm-ec li b{color:var(--tinta);font-weight:700;white-space:nowrap}
.cm-ec li.cm-ec-tot{border-top:1px dashed var(--linea2);padding-top:6px;color:var(--tinta);font-weight:700}
.cm-kpis{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start}
@container fx (min-width:700px){.cm-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
.cm-kpis .fx-kpi{min-height:128px}
.cm-kpi-mas{font-size:.62em;margin-left:3px;color:var(--gris)}

/* ── tono de un indicador: bien (verde), vigilar (ámbar), informativo (gris). Nunca rojo. ── */
.cm-salud{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
@container fx (min-width:760px){.cm-salud{grid-template-columns:repeat(4,minmax(0,1fr))}}
.cm-ind{position:relative;display:grid;gap:6px;align-content:start;min-width:0;padding:14px 14px 13px;background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:var(--sombra-baja)}
.cm-ind::before{content:"";position:absolute;left:14px;right:14px;top:0;height:3px;border-radius:0 0 3px 3px;background:var(--hundido)}
.cm-ind-ok::before{background:var(--verde)}
.cm-ind-ambar::before{background:#f0b13f}
.cm-ind-k{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris);line-height:1.25}
.cm-ind-v{font-family:var(--display);font-weight:700;font-size:30px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-ind-v small{font:700 13px var(--texto);margin-left:4px;color:var(--gris)}
.cm-ind-n{font-size:12.5px;color:var(--gris);line-height:1.38;overflow-wrap:anywhere}
.cm-ind .fx-chip{justify-self:start}

/* ── cuenta de resultados ── */
.cm-pyg .fx-filas{margin-top:12px}
.cm-pyg .fx-fila{align-items:flex-start}
.cm-fila-sub dt{padding-left:14px}
.cm-fila-sub dt,.cm-fila-sub dd{font-size:13px}
.cm-fila-res{background:var(--crema);margin:0 -10px;padding:11px 10px!important;border-radius:12px;border-bottom:0!important}
.cm-fila-res dt{color:var(--tinta);font-weight:800}
.cm-fila-res dd{font-weight:800;font-size:15.5px}
.cm-fila-ebitda{background:var(--tinta);margin:6px -10px 0;padding:13px 10px!important;border-radius:14px}
.cm-fila-ebitda dt{color:#fff;font-weight:800}
.cm-fila-ebitda dt small{color:rgba(255,255,255,.7)}
.cm-fila-ebitda dd{color:var(--lima);font-family:var(--display);font-size:24px;font-weight:700}
.cm-menos{color:var(--gris)}
.cm-como{margin-top:14px;border-top:1px solid var(--linea);padding-top:4px}
.cm-como > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;min-height:44px;font-weight:700;font-size:14px}
.cm-como > summary::-webkit-details-marker{display:none}
.cm-como[open] > summary svg{transform:rotate(180deg)}
.cm-como > summary svg{transition:transform .15s;color:var(--gris)}
.cm-como ul{margin:4px 0 6px;padding-left:18px;font-size:13px;line-height:1.55;color:var(--gris)}
.cm-como li + li{margin-top:6px}
.cm-como b{color:var(--tinta);font-weight:600}

/* barras del EBITDA de cada mes */
.cm-barras{display:block;width:100%;overflow:visible;margin-top:12px}
.cm-barras text{font:500 11px var(--texto);fill:var(--gris2);font-variant-numeric:tabular-nums}
.cm-barras .cm-b-pos{fill:var(--s-cae)}
.cm-barras .cm-b-neg{fill:var(--o1)}
.cm-barras .cm-b-fut{fill:var(--hundido)}
.cm-barras .cm-b-cero{stroke:var(--eje);stroke-width:1;shape-rendering:crispEdges}
.cm-barras .cm-b-hoy{font-weight:800;fill:var(--tinta)}
.cm-barras rect{transform-box:fill-box;transform-origin:50% 100%;animation:fx-crece .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 35ms)}

/* ── caja ── */
.cm-caja-v{font-size:52px;margin-top:8px}
.cm-mini{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}
.cm-mini > div{padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);min-width:0}
.cm-mini span{display:block;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.cm-mini b{display:block;font-family:var(--display);font-weight:700;font-size:26px;line-height:1.05;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-mini small{display:block;font-size:12px;color:var(--gris);margin-top:3px;line-height:1.35}

/* ── listas de una fila por cosa (atención, vencidas, lotes) ── */
.cm-ls{list-style:none;margin:10px 0 0;padding:0}
.cm-ls > li{display:grid;grid-template-columns:36px minmax(0,1fr) auto;grid-template-areas:"tile tit imp" "tile det acc";gap:3px 12px;align-items:center;padding:12px 0;border-top:1px solid var(--linea)}
.cm-ls > li:first-child{border-top:0}
.cm-ls .fx-tile{grid-area:tile;align-self:start}
.cm-ls-tit{grid-area:tit;min-width:0;font-size:14.5px;font-weight:600;line-height:1.35}
.cm-ls-det{grid-area:det;min-width:0;font-size:12.5px;color:var(--gris);line-height:1.4}
.cm-ls-imp{grid-area:imp;justify-self:end;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:14.5px}
.cm-ls-acc{grid-area:acc;justify-self:end}
.cm-ls-sin-tile > li{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"tit imp" "det acc"}
.cm-ls-fila > li{grid-template-columns:36px minmax(0,1fr) auto auto;grid-template-areas:"tile tit imp acc";padding:8px 0}
.cm-ls-fila .cm-ls-tit{align-self:center}
.cm-ls-fila .fx-tile{align-self:center}
@media (max-width:520px){.cm-ls-fila .cm-ls-acc span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}}
a.fx-link{text-decoration:underline}
.cm-mas{margin-top:6px}

/* ── escalera de la previsión y tubería del negocio ── */
.cm-esc{list-style:none;margin:12px 0 0;padding:0}
.cm-tramo{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;padding:13px 0 12px;border-top:1px solid var(--linea)}
.cm-tramo:first-child{border-top:0}
.cm-tramo-tit{min-width:0;font-weight:700;font-size:14.5px;line-height:1.3;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cm-tramo-tit .fx-chip{font-size:9.5px;height:20px}
.cm-tramo-v{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:15px}
.cm-tramo-v small{display:block;font-size:11.5px;font-weight:500;color:var(--gris2);margin-top:1px}
.cm-tramo-n{grid-column:1/-1;font-size:12.5px;color:var(--gris);line-height:1.4}
.cm-tramo-n b{color:var(--tinta);font-weight:600}
.cm-pista{grid-column:1/-1;position:relative;height:10px;border-radius:999px;background:var(--hundido);overflow:hidden;margin-top:3px}
.cm-pista i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;transform-origin:left;animation:fx-ancho .7s cubic-bezier(.2,.8,.2,1) both}
.cm-pista .cm-p-bruto{background:#e4ded2}
.cm-pista .cm-p-pond{background:var(--c,var(--s-cae))}
.cm-ley{display:flex;flex-wrap:wrap;gap:6px 16px;margin:10px 0 0;padding:0;list-style:none;font-size:12.5px;color:var(--gris)}
.cm-ley li{display:inline-flex;align-items:center;gap:7px}
.cm-ley i{display:inline-block;width:14px;height:8px;border-radius:4px;background:var(--c)}
.cm-cierre{display:grid;gap:4px;margin-top:6px}
.cm-cierre-v{font-size:46px;margin-top:6px}
.cm-cierre-barra{position:relative;height:14px;border-radius:999px;background:var(--hundido);overflow:hidden;margin-top:12px}
.cm-cierre-barra i{position:absolute;top:0;bottom:0;left:0}
.cm-tubo-grupo{margin:16px 2px 2px;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris2)}
.cm-tubo-grupo:first-child{margin-top:4px}

/* ── lotes ── */
.cm-lotes{list-style:none;margin:12px 0 0;padding:0}
.cm-lote{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"cod imp" "est imp" "det det";gap:6px 12px;align-items:center;padding:12px 0;border-top:1px solid var(--linea)}
.cm-lote:first-child{border-top:0}
.cm-lote-cod{grid-area:cod;min-width:0;font:600 13.5px/1.25 var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-lote-cod a{color:inherit}
.cm-lote-det{grid-area:det;min-width:0;font-size:12.5px;color:var(--gris);line-height:1.4}
.cm-lote-imp{grid-area:imp;align-self:start;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.cm-lote-imp small{display:block;font-size:11.5px;font-weight:500;color:var(--gris2)}
.cm-lote-est{grid-area:est;justify-self:start}

/* ── otros servicios ── */
.cm-grupos{display:grid;gap:12px;margin-top:14px}
.cm-grupo-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:13.5px;color:var(--gris);font-weight:600}
.cm-grupo-top b{font-family:var(--display);font-size:22px;color:var(--tinta);line-height:1}
.cm-grupo .fx-pista{height:10px;margin-top:6px}
.cm-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}

/* ── análisis de la cartera ── */
.cm-plegable{appearance:none;width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border-radius:20px;border:1px solid var(--linea);background:#fff;box-shadow:var(--sombra-baja);cursor:pointer;text-align:left;font:inherit;color:var(--tinta)}
.cm-plegable:hover{border-color:rgba(20,17,17,.22)}
.cm-plegable small{display:block;font-size:13px;color:var(--gris);margin-top:3px;line-height:1.4}
.cm-plegable svg{flex:none;color:var(--gris)}
.cm-filtros{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}
@container fx (min-width:900px){.cm-filtros{grid-template-columns:repeat(6,minmax(0,1fr))}}
.cm-filtros .fx-select{min-height:44px;font-size:14px}
.cm-precio{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea)}
.cm-precio .fx-input{width:110px;min-height:44px;text-align:right;font-weight:700}
.cm-precio > span{font-size:13.5px;color:var(--gris)}
.cm-precio > span b{color:var(--tinta)}
.cm-rank{list-style:none;margin:12px 0 0;padding:0}
.cm-rank li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:10px 0;border-top:1px solid var(--linea)}
.cm-rank li:first-child{border-top:0}
.cm-rank-n{min-width:0;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-rank-v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:14px}
.cm-rank-d{grid-column:1/-1;font-size:12px;color:var(--gris);font-variant-numeric:tabular-nums}
.cm-rank .fx-pista{grid-column:1/-1;height:8px;margin-top:4px}
.cm-seg-scroll{max-width:100%;overflow-x:auto;scrollbar-width:none}
.cm-seg-scroll::-webkit-scrollbar{display:none}

/* esqueleto */
.cm-sk-hero{min-height:300px}
@container fx (max-width:479px){.cm-mini b{font-size:21px}.cm-mini > div{padding:11px 12px}}
@container fx (max-width:359px){.cm-caja-v,.cm-cierre-v{font-size:40px}.cm-ind-v{font-size:25px}}
@media (prefers-reduced-motion:reduce){.cm-pista i,.cm-barras rect{animation:none}}
`;
