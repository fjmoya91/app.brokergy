// Lo que los LISTADOS y los EDITORES de Facturación añaden al sistema .fx- de estilo.jsx (que
// no se toca desde aquí). FacturacionView lo monta junto a CSS: <style>{CSS + CSS_LISTAS}</style>.
// Los editores lo inyectan también solos en <head> (useEstiloFx, PresupuestoModal.jsx): el
// presupuesto se abre igual desde CEE directos, fuera de la pestaña.
export const CSS_LISTAS = `
/* ── capas: el EDITOR va por DEBAJO de showConfirm (z 900) para que sus preguntas se vean ── */
.fx-capa.fx-capa-editor{z-index:850}
.fx-capa-editor .fx-panel{position:relative}
.fx-panel:focus{outline:none}
.fx-panel-cab .fx-eyebrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fx-panel-sub{margin:6px 0 0;font-size:13px;color:var(--gris);line-height:1.45}
.fx-panel-sub b{color:var(--tinta);font-weight:600}
.fx-cab-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
.fx-cab-chips .fx-est{margin-top:0}
.fx-panel-pie{align-items:center}
.fx-pie-mas{flex:none!important;width:48px;height:48px;border-radius:14px;border:1.5px solid var(--linea2);background:#fff;color:var(--tinta)}
.fx-pie-mas:hover{background:var(--hundido)}
.fx-panel-pie .fx-btn-pri{flex:2}
.fx-panel-pie .fx-pie-ver{flex:none;min-height:48px;padding:0 14px;border-radius:14px}
@media (max-width:479px){.fx-panel-pie .fx-pie-ver{width:48px;padding:0}.fx-pie-ver span{display:none}}
@media (min-width:768px){.fx-pie-mas{margin-right:auto}.fx-panel-pie .fx-btn-pri{flex:none;min-width:220px}}
.fx-cargando{display:grid;place-items:center;gap:12px;padding:56px 20px;color:var(--gris);font-size:14px;text-align:center}
.fx-dlg-pie > :only-child{grid-column:1/-1}
.fx-dlg-cab p{margin:4px 0 0;font-size:13px;color:var(--gris);line-height:1.4}
@media (min-width:640px){.fx-dialogo.fx-dialogo-ancho{max-width:640px}}

/* ── textos de ayuda y errores junto al campo (ámbar, nunca rojo) ── */
.fx-ayuda{margin:0;font-size:12.5px;line-height:1.45;color:var(--gris)}
.fx-ayuda b{color:var(--tinta);font-weight:600}
.fx-error{display:flex;align-items:flex-start;gap:6px;margin:0;font-size:12.5px;line-height:1.4;font-weight:600;color:var(--vence-txt)}
.fx-error svg{flex:none;margin-top:1px}
.fx-campo-mal .fx-input,.fx-campo-mal .fx-select,.fx-campo-mal .fx-area,.fx-input.fx-mal{border-color:var(--vence-borde);box-shadow:0 0 0 4px rgba(240,177,63,.16)}
.fx-seccion-mal{border-color:var(--vence-borde);box-shadow:0 0 0 3px rgba(240,177,63,.14)}
.fx-sec-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;min-height:28px}
.fx-sec-cab .fx-sec-tit{margin:0}
.fx-sec-cab .fx-link{min-height:32px;font-size:13px}
.fx-fila2{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr))}
.fx-input.fx-mono,.fx-mono .fx-input{font-family:var(--mono)}
.fx-area-msg{min-height:240px;font:500 13.5px/1.5 var(--texto)}
.fx-dato{display:grid;gap:2px;min-width:0}
.fx-dato dt{font-size:12px;color:var(--gris)}
.fx-dato dd{margin:0;font-weight:600;font-size:14px;overflow-wrap:anywhere}
.fx-datos{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));margin:0}

/* ── aviso flotante con acciones (Deshacer · Cambiar fecha) ── */
.fx-toast{flex-wrap:wrap;row-gap:4px;max-width:min(560px,calc(100vw - 32px))}
.fx-toast > span{flex:1 1 200px;min-width:0}
.fx-toast-acc{appearance:none;background:none;border:0;cursor:pointer;min-height:36px;padding:0 6px;border-radius:8px;font:700 14px var(--texto);color:var(--lima);text-decoration:underline;text-underline-offset:3px;white-space:nowrap}
.fx-toast-acc:hover{background:rgba(255,255,255,.08)}
.fx-toast-x{appearance:none;background:none;border:0;cursor:pointer;width:36px;height:36px;display:grid;place-items:center;border-radius:10px;color:rgba(255,255,255,.6)}
.fx-toast-x svg{color:inherit!important}
.fx-toast-x:hover{color:#fff;background:rgba(255,255,255,.08)}
@media (pointer:coarse){.fx-toast-acc,.fx-toast-x{min-height:44px;height:44px}}

/* ── listados: acción siguiente siempre a la vista, enlaces y «visto» ── */
.fx-t-sig{margin-right:4px}
.fx-t-sig.fx-btn-ok{background:var(--ok-bg);color:var(--verde-txt)}
.fx-t-sig.fx-btn-ok:hover{filter:brightness(.97)}
.fx-link-num{appearance:none;background:none;border:0;padding:0 2px;min-height:32px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font:600 13px/1.2 var(--mono);color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.3);border-radius:6px;white-space:nowrap}
.fx-link-num:hover{text-decoration-color:var(--tinta)}
.fx-link-num.fx-mudo{text-decoration:none;cursor:default;color:var(--gris)}
.fx-visto{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:var(--verde-txt);white-space:nowrap}
.fx-visto-no{color:var(--gris2);font-weight:500}
.fx-sub-meta{display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;margin-top:3px}
.fx-t-cli .fx-sub-meta small{display:inline}
.fx-sub-meta>*{white-space:nowrap}
.fx-meta-grupo{display:inline-flex;align-items:center;flex-wrap:wrap;gap:2px 6px}
.fx-t-est{min-width:150px}
@container fx (min-width:1000px){.fx-t-est{min-width:220px}}
.fx-herr .fx-select-peq{min-height:44px}
.fx-serie-chip{gap:7px}
.fx-serie-chip .fx-dot{width:8px;height:8px}
/* el chip de la serie se ve de 24 px, pero se toca en 44: la zona sensible crece por fuera */
button.fx-serie-chip{position:relative;overflow:visible}
button.fx-serie-chip::after{content:'';position:absolute;inset:-10px -4px}
.fx-ayuda-ico{display:flex;align-items:flex-start;gap:6px}
.fx-ayuda-ico svg{flex:none;margin-top:2px}
.fx-chip-sep{flex:none;width:1px;align-self:stretch;margin:4px 2px;background:var(--linea2)}
.fx-fila-ocupada{opacity:.6;pointer-events:none}
.fx-tarjeta-pie > .fx-btn{min-height:44px}
.fx-tarjeta .fx-sub-meta{margin-top:0}
.fx-sub-meta small{font-size:12.5px;color:var(--gris)}
.fx-t-imp small{font-weight:500}
/* la caja de la tabla sangra hasta el borde de la tarjeta: con el relleno de 18 px (< 768) */
@container fx (max-width:767px){.fx-lista .fx-tabla-caja{margin-left:-18px;margin-right:-18px;margin-bottom:-20px}.fx-lista .fx-tabla th:first-child,.fx-lista .fx-tabla td:first-child{padding-left:18px}}
.fx-nro .fx-dot{width:8px;height:8px}
/* el cliente se queda con el sitio que sobra y se corta con «…»: la tabla nunca pide scroll lateral */
.fx-lista .fx-t-cli{width:100%;max-width:0}
.fx-lista .fx-t-cli .fx-cli{max-width:none}
.fx-cobro small{display:block;margin-top:2px;font-size:12px;font-weight:500;color:var(--gris2)}
.fx-tarjeta{grid-template-columns:minmax(0,1fr)}
.fx-tarjeta .fx-cobro{white-space:normal}
.fx-tarjeta-izq{min-width:0}
.fx-lista-filtros{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px}
.fx-lista-filtros .fx-chips{margin:0;flex:1 1 auto;min-width:0}

/* ── «Te deben»: total y tramos de antigüedad ── */
.fx-deben{margin-top:14px;padding:14px 16px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.fx-deben-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px}
.fx-deben-top .fx-importe{font-size:34px}
.fx-deben-top p{margin:0;font-size:13.5px;color:var(--gris);line-height:1.45}
.fx-deben-top p b{color:var(--tinta);font-weight:600}
.fx-tramos-barra{display:flex;height:10px;margin-top:12px;border-radius:999px;overflow:hidden;background:var(--hundido)}
.fx-tramos-barra i{display:block;height:100%;transform-origin:left;animation:fx-ancho .7s cubic-bezier(.2,.8,.2,1) both}
.fx-tramos-barra i + i{box-shadow:inset 2px 0 0 #fff}
.fx-tramos{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px}
@container fx (min-width:640px){.fx-tramos{grid-template-columns:repeat(4,minmax(0,1fr))}}
.fx-tramo{display:grid;gap:2px;padding:9px 12px;border-radius:14px;background:#fff;border:1px solid var(--linea)}
.fx-tramo span{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--gris)}
.fx-tramo b{font-family:var(--display);font-weight:700;font-size:21px;line-height:1.05;font-variant-numeric:tabular-nums}
.fx-tramo small{font-size:12px;color:var(--gris2)}
.fx-tramo-alerta{background:#fffaf0;border-color:var(--vence-borde)}
.fx-tramo-alerta span{color:var(--vence-txt)}

/* ── menú «···» (fx-pop): capa transparente que lo cierra al tocar fuera ── */
.fx-pop-fondo{position:fixed;inset:0;z-index:9099}
.fx-pop-item:disabled{opacity:.45;cursor:default}
.fx-pop-item span{min-width:0;overflow:hidden;text-overflow:ellipsis}

/* ── partidas compactas: «concepto — uds × precio = importe»; se despliegan al tocarlas ── */
.fx-pl{border-top:1px solid var(--linea);background:#fff}
.fx-pl:first-child{border-top:0}
.fx-pl-res{appearance:none;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 14px;min-height:56px;padding:10px 14px;background:none;border:0;text-align:left;cursor:pointer;font:inherit;color:inherit}
.fx-pl-res:disabled{cursor:default}
.fx-pl-res:hover:not(:disabled){background:#fcfbf8}
.fx-pl-con{font-weight:600;font-size:14.5px;line-height:1.35;overflow-wrap:anywhere}
.fx-pl-cal{font-size:12.5px;color:var(--gris);font-variant-numeric:tabular-nums;line-height:1.4}
.fx-pl-cal em{font-style:normal;font-weight:700;color:var(--ambar-txt);background:var(--ambar-bg);border-radius:6px;padding:0 5px}
.fx-pl-det{font-size:12.5px;color:var(--gris2);line-height:1.4;white-space:pre-line;overflow-wrap:anywhere}
.fx-pl-imp{grid-column:2;grid-row:1/span 3;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.fx-pl-arr .fx-pl-res{padding-left:36px;position:relative}
.fx-pl-arr .fx-pl-res::before{content:"↳";position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--gris2)}
.fx-pl-arr .fx-pl-con{font-weight:500}
.fx-pl-abierta{background:#fcfbf8}
.fx-pl-abierta .fx-pl-res{background:#fcfbf8}
.fx-pl-edit{display:grid;gap:10px;padding:2px 14px 14px}
.fx-pl-nums{display:grid;gap:8px;grid-template-columns:repeat(4,minmax(0,1fr))}
.fx-pl-nums .fx-input,.fx-pl-nums .fx-select{min-height:44px;padding:0 10px;font-size:15px}
.fx-pl-nums .fx-select{padding-right:30px;background-position:right 10px center}
@media (max-width:480px){.fx-pl-nums{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fx-pl-herr{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.fx-pl-herr .fx-link{min-height:40px;font-size:13px;margin-right:auto}
.fx-pl-herr .fx-ico-btn{border:1px solid var(--linea)}
.fx-pl-quitar{color:var(--ambar-txt)!important}
.fx-lineas-vacio{padding:16px 14px;font-size:13.5px;color:var(--gris);background:#fff}

/* ── añadir partida: buscador del catálogo ── */
.fx-busca{position:relative;margin-top:10px}
.fx-input.fx-anadir{border-style:dashed;border-color:rgba(214,130,0,.55);background:#fffcf5}
.fx-input.fx-anadir::placeholder{color:#8a6a35}
.fx-busca-lista{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 6px);max-height:min(340px,50vh);overflow-y:auto;overscroll-behavior:contain;padding:6px;background:#fff;border:1px solid var(--linea);border-radius:16px;box-shadow:var(--sombra-alta)}
.fx-busca-op{appearance:none;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:46px;padding:6px 10px;border:0;border-radius:10px;background:none;cursor:pointer;text-align:left;font:500 14px/1.3 var(--texto);color:var(--tinta)}
.fx-busca-op[aria-selected="true"]{background:var(--hundido)}
.fx-busca-op b{font-weight:600}
.fx-busca-op i{font-style:normal;color:var(--naranja-txt);font-weight:600}
.fx-busca-op small{display:inline-block;margin-left:6px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gris2)}
.fx-busca-op .fx-busca-precio{flex:none;font-variant-numeric:tabular-nums;font-weight:700;color:var(--gris)}
.fx-busca-cero{color:var(--ambar-txt)!important;background:var(--ambar-bg);border-radius:6px;padding:2px 6px;font-size:12px!important}
.fx-busca-libre{border-top:1px solid var(--linea);margin-top:4px;padding-top:10px;border-radius:0 0 10px 10px}
.fx-busca-nueva{color:var(--naranja-txt)}
.fx-busca-nueva > span{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.fx-busca-nueva em{font-style:normal;font-weight:500;font-size:13px;color:var(--gris)}
/* ── «Partida nueva»: la ficha corta debajo del buscador ── */
.fx-pnueva{margin-top:10px;display:grid;gap:12px;padding:14px;border:1px dashed rgba(214,130,0,.55);border-radius:16px;background:#fffcf5}
.fx-pnueva-cab{display:flex;align-items:center;justify-content:space-between;gap:10px}
.fx-pnueva-cab b{font:800 11px/1 var(--texto);letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.fx-pnueva .fx-rejilla{grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr))}
.fx-pnueva-check{border:1px solid var(--linea);border-radius:14px;background:#fff}
.fx-pnueva-ok{justify-self:start}

/* ── el total, protagonista ── */
.fx-total-caja{padding:6px 18px 16px}
.fx-total-caja .fx-filas{border-top:0}
.fx-total-caja .fx-total-grande .fx-importe{font-size:44px}
.fx-total-nota{margin:10px 0 0;font-size:12.5px;color:var(--gris);line-height:1.45}

/* ── «Más opciones» plegado, con su resumen ── */
.fx-mas{background:#fff;border:1px solid var(--linea);border-radius:20px;overflow:hidden}
.fx-mas-cab{appearance:none;width:100%;display:flex;align-items:center;gap:12px;min-height:60px;padding:12px 16px;background:none;border:0;cursor:pointer;text-align:left;font:inherit;color:inherit}
.fx-mas-cab > div{flex:1;min-width:0}
.fx-mas-cab b{display:block;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris)}
.fx-mas-cab span{display:block;margin-top:3px;font-size:13.5px;color:var(--tinta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-mas-cab svg{flex:none;color:var(--gris);transition:transform .2s ease}
.fx-mas-cab[aria-expanded="true"] svg{transform:rotate(180deg)}
.fx-mas-cuerpo{display:grid;gap:14px;padding:4px 16px 18px;border-top:1px solid var(--linea)}
.fx-mas-cuerpo > :first-child{margin-top:12px}

/* ── cliente: tarjeta elegida y buscador ── */
.fx-ficha{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea)}
.fx-ficha > div{flex:1;min-width:0}
.fx-ficha b{display:block;font-weight:700;font-size:15px;overflow-wrap:anywhere}
.fx-ficha small{display:block;margin-top:2px;font-size:12.5px;color:var(--gris);overflow-wrap:anywhere}
.fx-ficha .fx-link{min-height:36px;font-size:13px;flex:none}
.fx-ficha-falta{color:var(--ambar-txt)!important;font-weight:600}
.fx-cp{display:grid;gap:8px}
.fx-cp-tit{display:flex;align-items:center;gap:7px;margin-top:4px;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris)}
.fx-cp-tit i{width:7px;height:7px;border-radius:50%;background:#25d366}
.fx-cp-op{appearance:none;width:100%;display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 14px;border-radius:14px;border:1px solid var(--linea);background:#fff;cursor:pointer;text-align:left;font:inherit;color:inherit;transition:border-color .15s}
.fx-cp-op:hover,.fx-cp-op:focus-visible{border-color:var(--tinta)}
.fx-cp-op > div{flex:1;min-width:0}
.fx-cp-op b{display:block;font-weight:600;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-cp-op small{display:block;font-size:12.5px;color:var(--gris);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-cp-wa{display:grid;gap:6px;padding:10px 14px;border-radius:14px;border:1px solid rgba(37,211,102,.28);background:#f3fbf5}
.fx-cp-wa-top{display:flex;align-items:center;gap:12px}
.fx-cp-wa-top > div{flex:1;min-width:0}
.fx-cp-wa b{display:block;font-weight:600;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-cp-wa small{display:block;font-size:12.5px;color:var(--gris);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-cp-wa p{margin:0;font-size:12.5px;color:var(--ambar-txt)}
.fx-cp-nuevo{border-style:dashed;border-color:rgba(214,130,0,.55);background:#fffcf5}
.fx-cp-vacio{margin:0;font-size:12.5px;color:var(--gris2)}

/* ── canales y mensaje del envío ── */
.fx-canales{display:flex;flex-wrap:wrap;gap:8px}
.fx-canal{appearance:none;-webkit-tap-highlight-color:transparent;display:inline-flex;align-items:center;gap:8px;min-height:44px;max-width:100%;padding:0 14px 0 10px;border-radius:999px;border:1.5px solid var(--linea2);background:#fff;cursor:pointer;font:700 14px/1.2 var(--texto);color:var(--tinta);transition:background-color .15s,border-color .15s,color .15s}
.fx-canal small{font-weight:500;font-size:12.5px;color:var(--gris);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.fx-canal-caja{flex:none;width:20px;height:20px;border-radius:6px;border:1.5px solid var(--linea2);display:grid;place-items:center;color:transparent}
.fx-canal[aria-pressed="true"]{background:var(--tinta);border-color:var(--tinta);color:#fff}
.fx-canal[aria-pressed="true"] small{color:rgba(255,255,255,.72)}
.fx-canal[aria-pressed="true"] .fx-canal-caja{background:var(--lima);border-color:var(--lima);color:var(--tinta)}
.fx-canal:disabled{opacity:.55;cursor:default}
.fx-msg{margin:0;padding:12px 14px;border-radius:14px;background:var(--crema);border:1px solid var(--linea);font:500 13.5px/1.5 var(--texto);color:#3b3e45;white-space:pre-wrap;overflow-wrap:anywhere}
.fx-msg-corto{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}

/* ── casillas (rectificar: qué partidas se corrigen) ── */
.fx-checks{border:1px solid var(--linea);border-radius:14px;overflow:hidden;background:#fff}
.fx-check{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:52px;padding:8px 12px;border-top:1px solid var(--linea);cursor:pointer}
.fx-check:first-child{border-top:0}
.fx-check input{width:20px;height:20px;margin:0;accent-color:var(--tinta);cursor:pointer}
.fx-check span{font-size:14px;line-height:1.35;overflow-wrap:anywhere}
.fx-check small{display:block;font-size:12px;color:var(--gris)}
.fx-check b{font-variant-numeric:tabular-nums;white-space:nowrap}
.fx-check-todas{background:var(--hundido)}
.fx-opcion{appearance:none;width:100%;display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start;padding:12px 14px;border-radius:14px;border:1.5px solid var(--linea2);background:#fff;cursor:pointer;text-align:left;font:inherit;color:inherit}
.fx-opcion[aria-pressed="true"]{border-color:var(--tinta);box-shadow:0 0 0 3px rgba(20,17,17,.06)}
.fx-opcion i{width:18px;height:18px;margin-top:1px;border-radius:50%;border:2px solid var(--linea2)}
.fx-opcion[aria-pressed="true"] i{border:6px solid var(--tinta)}
.fx-opcion b{display:block;font-size:14px}
.fx-opcion small{display:block;margin-top:2px;font-size:12.5px;color:var(--gris);line-height:1.4}

/* ── historial ── */
.fx-hist{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.fx-hist li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 12px;font-size:13px;line-height:1.4}
.fx-hist time{color:var(--gris2);font-variant-numeric:tabular-nums;white-space:nowrap}
.fx-hist span{overflow-wrap:anywhere}
.fx-hist small{grid-column:2;color:var(--gris2)}

/* ── importar de AppSheet ── */
.fx-cifras3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.fx-cifras3 > div{padding:10px 8px;border-radius:14px;background:#fff;border:1px solid var(--linea);text-align:center}
.fx-cifras3 b{display:block;font-family:var(--display);font-weight:700;font-size:26px;line-height:1}
.fx-cifras3 span{display:block;margin-top:4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gris)}
.fx-lista-mono{margin:0;padding:0;list-style:none;max-height:160px;overflow-y:auto;display:grid;gap:3px;font:500 12.5px/1.4 var(--mono);color:#3b3e45}

/* ── artículos ── */
.fx-art-grupo + .fx-art-grupo{margin-top:16px}
.fx-art-grupo-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px 10px}
.fx-art-grupo-cab h3{margin:0;font-family:var(--display);font-weight:700;font-size:22px;line-height:1.1}
.fx-art-grupo-cab small{font:700 12px var(--texto);color:var(--gris);font-variant-numeric:tabular-nums}
.fx-art-th{display:none}
.fx-art{border-top:1px solid var(--linea)}
.fx-art-fila{display:grid;grid-template-columns:40px minmax(0,1fr);gap:8px 10px;align-items:center;padding:8px 14px 10px 8px}
.fx-art-resto{grid-column:2;display:grid;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr));align-items:end}
.fx-art-resto2{grid-column:2;display:grid;gap:8px;grid-template-columns:minmax(0,1fr) auto auto;align-items:end}
.fx-art-et{display:block;margin-bottom:3px;font-size:11px;font-weight:700;color:var(--gris)}
.fx-art-inline{width:100%;min-height:40px;padding:6px 10px;border-radius:10px;border:1.5px solid transparent;background:transparent;color:var(--tinta);font:500 14.5px/1.35 var(--texto);transition:border-color .15s,background-color .15s}
.fx-art-inline:hover{border-color:var(--linea2)}
.fx-art-inline:focus{outline:none;border-color:var(--tinta);background:#fff;box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.fx-art-inline.fx-art-caja{border-color:var(--linea2);background:#fff}
textarea.fx-art-inline{resize:none;overflow:hidden;display:block;font-weight:600}
.fx-art-num{text-align:right;font-variant-numeric:tabular-nums}
.fx-art-suf{position:relative}
.fx-art-suf .fx-art-inline{padding-right:26px}
.fx-art-suf > span{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--gris2);pointer-events:none}
.fx-art .fx-select{min-height:40px;font-size:14px;padding:0 32px 0 10px;background-position:right 10px center}
.fx-art input[type="checkbox"]{width:20px;height:20px;accent-color:var(--tinta);cursor:pointer;margin:0}
.fx-art-check{display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-height:40px;justify-content:center}
.fx-art-meta{display:flex;flex-wrap:wrap;gap:4px 10px;padding:0 10px;font-size:12px;color:var(--gris)}
.fx-art-meta button{appearance:none;background:none;border:0;padding:0;cursor:pointer;font:inherit;color:inherit}
.fx-art-baja{opacity:.55}
.fx-art-resaltado{background:#fffaf0}
.fx-art-abierto{background:#fcfbf8}
.fx-art-estado{font-size:12px;font-weight:600;color:var(--gris);white-space:nowrap}
.fx-art-estado.fx-ok{color:var(--verde-txt)}
.fx-art-estado.fx-mal{color:var(--vence-txt)}
.fx-art-det{display:grid;gap:16px;padding:4px 16px 18px 50px}
.fx-art-det h4{margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris)}
.fx-art-det h4 span{text-transform:none;letter-spacing:0;font-weight:500;color:var(--gris2)}
.fx-art-sub{display:grid;gap:6px;grid-template-columns:minmax(0,1fr) 112px 40px;align-items:center}
.fx-art-cero{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;background:var(--ambar-bg);border:1px solid var(--ambar-borde);color:var(--ambar-txt);font:700 11.5px/1 var(--texto);white-space:nowrap}
.fx-art-nuevo{margin-bottom:16px}
.fx-art-nuevo .fx-rejilla{grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr))}
@container fx (min-width:900px){
  .fx-art-th{display:grid;grid-template-columns:40px minmax(0,1fr) 120px 92px 76px 180px 64px 96px;gap:10px;align-items:center;padding:10px 14px 10px 8px;background:var(--hundido);border-top:1px solid var(--linea);font-size:10.5px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris)}
  .fx-art-fila{grid-template-columns:40px minmax(0,1fr) 120px 92px 76px 180px 64px 96px;gap:10px;padding:6px 14px 6px 8px}
  .fx-art-resto,.fx-art-resto2{display:contents}
  .fx-art-et{display:none}
  .fx-art-check{align-items:center}
  .fx-art-det{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
}

/* ── componentes del CRM que se reutilizan dentro del panel (la cascada de la dirección) ── */
.fx-tw input,.fx-tw select{background:#fff!important;color:var(--tinta)!important;border:1.5px solid var(--linea2)!important;border-radius:12px!important;min-height:46px;font:500 15px/1.3 var(--texto)!important;box-shadow:none!important}
.fx-tw input:focus,.fx-tw select:focus{border-color:var(--tinta)!important;box-shadow:0 0 0 4px rgba(255,160,0,.22)!important;outline:none}
.fx-tw input::placeholder{color:var(--gris2)!important}
.fx-tw select option{background:#fff;color:var(--tinta)}
.fx-tw label{color:var(--gris)!important;font:600 12.5px var(--texto)!important;letter-spacing:0!important;text-transform:none!important}
.fx-tw p,.fx-tw span{color:var(--gris)!important}
.fx-tw button{background:#fff!important;color:var(--tinta)!important;border:1.5px solid var(--linea2)!important;border-radius:12px!important;font:700 12.5px var(--texto)!important;letter-spacing:.02em!important;min-height:46px}
@media (pointer:coarse){.fx-tw input,.fx-tw select{font-size:16px!important}}
`;
