// ─── estilo.js — el CSS de la app del INSTALADOR (prefijo `.ia-`) ────────────
// Estilo «carta de pago» (regla 164): papel crema, tarjetas blancas de 24 px, tinta,
// Antonio 700 auto-alojada para titulares y cifras, Inter para el texto, el filete
// naranja→verde, UNA acción naranja por tarjeta y avisos en ámbar, nunca en rojo.
// Medidas y colores copiados del prototipo aprobado (Claude Design, 21/11/2026:
// Main, Obras, Obra, Clientes, Cliente, PC y Barra). SIN modo oscuro: el instalador
// ve siempre papel, pase lo que pase con el tema del CRM.
// Lo comparten las fases 2 y 3 (presupuesto, factura, catálogo): las piezas nuevas
// se añaden aquí, con el mismo prefijo.
export const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
@font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;src:url('/fonts/Inter-400-latin.woff2') format('woff2')}
@font-face{font-family:'Inter';font-style:normal;font-weight:600;font-display:swap;src:url('/fonts/Inter-600-latin.woff2') format('woff2')}
@font-face{font-family:'Inter';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Inter-700-latin.woff2') format('woff2')}
@font-face{font-family:'Inter';font-style:normal;font-weight:800;font-display:swap;src:url('/fonts/Inter-800-latin.woff2') format('woff2')}
.ia-app{
  --crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);
  --naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --marca:var(--naranja-txt);--marca-fondo:var(--baldosa);
  --ambar-bg:#fff7e6;--ambar-borde:#f6dca4;--ambar-txt:#5c4100;--baldosa:#fff3dc;--neutro:#f1efeb;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  --sombra:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);
  color-scheme:light;position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;overflow:hidden;
  background:var(--crema);color:var(--tinta);
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  font-size:15px;line-height:1.5;text-align:left
}
.ia-app *,.ia-app *::before,.ia-app *::after{box-sizing:border-box}
.ia-app a{color:var(--tinta)}
/* :where() deja este reinicio SIN especificidad: con «.ia-app button» (0,1,1) ganaba a
   «.ia-btn» (0,1,0) y el botón naranja salía en 400 en vez de 700 (fase 2, arreglo b). */
:where(.ia-app) button{font:inherit;color:inherit}
.ia-app :focus-visible{outline:3px solid var(--tinta);outline-offset:2px;border-radius:12px}
.ia-filete{height:4px;flex:none;background:var(--filete)}
.ia-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em}
.ia-eyebrow{margin:0;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris)}
.ia-eyebrow.n{color:var(--naranja-txt)}.ia-eyebrow.v{color:var(--verde-txt)}
.ia-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .14em;border-radius:5px;color:var(--tinta)}
.ia-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* ── Cáscara: móvil (cabecera + barra abajo) ── */
.ia-cuerpo{flex:1 1 auto;min-height:0;display:flex}
.ia-col{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;min-height:0}
.ia-cab{flex:none;display:flex;align-items:center;justify-content:space-between;padding:14px 20px 8px}
.ia-logo{height:26px;width:auto;display:block}
.ia-avatar{width:44px;height:44px;border-radius:999px;background:#fff;border:1px solid rgba(20,17,17,.12);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;text-decoration:none;color:var(--tinta);cursor:pointer;padding:0;overflow:hidden}
.ia-avatar img{width:100%;height:100%;object-fit:cover}
.ia-main{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.ia-pagina{padding:6px 16px 24px;display:flex;flex-direction:column;gap:14px;max-width:560px;margin:0 auto;width:100%}
.ia-barra{flex:none;background:#fff;border-top:1px solid var(--linea);display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:start;padding:8px 6px calc(10px + env(safe-area-inset-bottom))}
.ia-barra-it{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:56px;text-decoration:none;font-size:12px;font-weight:600;color:var(--gris);background:none;border:0;cursor:pointer;padding:0}
.ia-barra-it.act{color:var(--marca);font-weight:800}
.ia-barra-nueva{gap:2px;font-weight:700;color:var(--tinta)}
.ia-barra-mas{width:56px;height:56px;margin-top:-24px;border-radius:20px;background:var(--naranja);color:#08090c;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 22px -10px rgba(255,160,0,.75),0 0 0 5px var(--crema)}

/* ── Cáscara: ordenador (menú lateral, desde 1024 px) ── */
.ia-lat{display:none}
@media (min-width:1024px){
  .ia-app{flex-direction:column}
  .ia-cab,.ia-barra{display:none}
  .ia-lat{display:flex;flex:none;width:260px;background:#fff;border-right:1px solid var(--linea);padding:22px 16px;flex-direction:column;gap:18px;overflow-y:auto}
  .ia-lat .ia-logo{height:28px;align-self:flex-start;margin-left:6px}
  .ia-pagina{padding:28px 28px 32px;max-width:none}
  .ia-pagina.estrecha{max-width:720px;margin:0}
}
.ia-lat-nav{display:flex;flex-direction:column;gap:4px}
.ia-lat-it{min-height:48px;padding:0 12px;border-radius:14px;display:flex;align-items:center;gap:12px;font-size:15.5px;font-weight:600;text-decoration:none;color:var(--gris);background:none;border:0;cursor:pointer;text-align:left;width:100%}
.ia-lat-it.act{font-weight:800;color:var(--tinta);background:var(--marca-fondo)}
.ia-lat-it.act svg{color:var(--marca)}
.ia-lat-n{margin-left:auto;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:var(--naranja);color:#08090c;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800}
.ia-lat-pie{margin-top:auto;padding:14px 12px 0;border-top:1px solid var(--linea);display:flex;flex-direction:column;gap:4px}
.ia-lat-pie b{font-size:14.5px}

/* ── Botones ── */
.ia-btn{min-height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:16.5px;font-weight:700;text-decoration:none;border:0;cursor:pointer;padding:0 18px;transition:transform .12s ease;text-align:center}
.ia-btn:active{transform:scale(.98)}
.ia-btn-pri{background:var(--naranja);color:#08090c !important;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.ia-btn-sec{min-height:52px;background:#fff;border:1.5px solid rgba(20,17,17,.14);color:var(--tinta);font-size:15.5px}
.ia-btn-tinta{background:var(--tinta);color:#fff !important}
.ia-btn-peq{flex:none;min-height:48px;padding:0 16px;border-radius:14px;font-size:15px}
.ia-btn-lat{min-height:52px;font-size:15.5px;gap:8px}
.ia-link{min-height:44px;padding:0 8px;display:inline-flex;align-items:center;font-size:14.5px;font-weight:700;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;background:none;border:0;cursor:pointer}
.ia-volver{min-height:44px;padding:0 10px 0 4px;display:inline-flex;align-items:center;gap:4px;font-size:15.5px;font-weight:700;text-decoration:none;color:var(--tinta);background:none;border:0;cursor:pointer}
.ia-dos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}

/* ── Tarjetas y filas ── */
.ia-card{background:#fff;border:1px solid var(--linea);border-radius:24px;padding:20px;box-shadow:var(--sombra)}
.ia-card.lista{padding:18px 8px 6px}
.ia-card.filas{padding:20px 20px 8px}
.ia-card.toca{position:relative;overflow:hidden;border-color:var(--ambar-borde);padding:22px 20px 18px;display:flex;flex-direction:column;gap:12px}
.ia-card.toca::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:var(--naranja)}
.ia-fila{display:flex;align-items:center;gap:12px;min-height:68px;padding:8px 10px 8px 12px;text-decoration:none;color:var(--tinta);border-top:1px solid var(--linea);background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left;cursor:pointer}
.ia-fila.primera{border-top-color:transparent}
.ia-fila.sin-pad{padding-left:0;padding-right:0}
.ia-baldosa{flex:none;width:44px;height:44px;border-radius:14px;background:var(--baldosa);color:var(--naranja-txt);display:flex;align-items:center;justify-content:center}
.ia-baldosa.v{background:rgba(177,209,62,.18);color:var(--verde-txt)}
.ia-baldosa.c{width:36px;height:36px;border-radius:999px}
.ia-baldosa.ok{background:rgba(177,209,62,.22);color:var(--verde-txt)}
.ia-baldosa.nos{background:var(--neutro);color:var(--gris)}
.ia-baldosa.luego{background:transparent;border:1.5px dashed rgba(20,17,17,.22);color:var(--gris2)}
.ia-fila-txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-fila-txt b{font-size:15.5px;line-height:1.3}
.ia-fila-txt b.luego{color:var(--gris);font-weight:600}
.ia-todo-cab{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:0 12px 6px}
.ia-todo-cab span{font-size:13px;color:var(--gris);white-space:nowrap}
.ia-corregir{display:flex;align-items:center;gap:12px;min-height:56px;width:100%;text-align:left;font-family:inherit;cursor:pointer;border-style:dashed}
.ia-fila-txt span{font-size:13.5px;color:var(--gris);line-height:1.35}
.ia-fila-txt span.corta{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ia-fila-txt span.tu{color:var(--ambar-txt)}
.ia-chev{flex:none;color:var(--gris2)}
.ia-dl{margin:0}
.ia-dl>div{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:12px 0;border-top:1px solid var(--linea);font-size:15px}
.ia-dl>div.primera{border-top:0}
.ia-dl dt{color:var(--gris);flex:none}
.ia-dl dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums;text-align:right;min-width:0;overflow-wrap:anywhere}
.ia-dl dd.v{color:var(--verde-txt)}
.ia-dl dd.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13.5px}
.ia-dl>div.total{border-top:1.5px solid var(--tinta);padding:14px 0 6px;font-size:15.5px}
.ia-dl>div.total dt{font-weight:800;color:var(--tinta);flex:1 1 auto}
.ia-dl>div.total dd{font-weight:800;font-size:18px}
.ia-nota{font-size:12.5px;color:var(--gris);margin:4px 0 6px}

/* ── Chips y pasos ── */
.ia-chip{flex:none;min-height:26px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border:1px solid rgba(20,17,17,.12);background:var(--crema);color:var(--gris);white-space:nowrap}
.ia-chip.tu{background:var(--ambar-bg);color:var(--ambar-txt);border-color:var(--ambar-borde)}
.ia-chip.fin{background:rgba(177,209,62,.18);color:var(--verde-txt);border-color:rgba(77,107,15,.25)}
.ia-pasos{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.ia-pasos span{height:6px;border-radius:99px;background:var(--linea)}
.ia-pasos.g span{height:8px}
.ia-pasos-txt{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;font-size:11.5px;color:var(--gris)}
.ia-pasos-txt b{color:var(--tinta)}

/* ── Inicio ── */
.ia-hola{padding:0 4px}
.ia-hola h1{margin:0;font-size:38px;line-height:1.1}
.ia-hola p{margin:6px 0 0;font-size:16px;line-height:1.5;color:var(--gris)}
.ia-hola p b{color:var(--tinta)}
.ia-cifras{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.ia-cifras div{display:flex;flex-direction:column;gap:2px;min-width:0}
.ia-cifras b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:34px;line-height:1;font-variant-numeric:tabular-nums}
.ia-cifras span{font-size:13px;color:var(--gris)}
.ia-ver-todas{margin-top:12px;margin-bottom:-10px;min-height:48px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--linea);font-size:15px;font-weight:700;text-decoration:none;color:var(--tinta);background:none;border-left:0;border-right:0;border-bottom:0;width:100%;cursor:pointer;padding:0}
.ia-vacio{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:14px 12px 16px}
.ia-vacio p{margin:0;font-size:15px;line-height:1.55;color:var(--gris)}
.ia-vacio b{font-size:16px;color:var(--tinta)}

/* ── Listas: buscador, filtros, tarjeta de obra ── */
.ia-lista-cab{flex:none;display:flex;flex-direction:column;gap:12px;padding:18px 20px 10px}
.ia-titulo{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.ia-titulo h1{margin:0;font-size:36px;line-height:1.1}
.ia-titulo>span{font-size:14px;color:var(--gris)}
.ia-buscar{display:flex;align-items:center;gap:10px;min-height:52px;padding:0 16px;background:#fff;border:1.5px solid rgba(20,17,17,.14);border-radius:16px}
.ia-buscar input{flex:1 1 auto;align-self:stretch;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:16px;color:var(--tinta)}
.ia-buscar input::-webkit-search-cancel-button{cursor:pointer}
.ia-filtros{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -20px;padding:0 20px 2px}
.ia-filtros::-webkit-scrollbar{display:none}
.ia-filtro{flex:none;min-height:44px;padding:0 16px;border-radius:999px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font-size:14.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.ia-filtro[aria-pressed="true"]{background:var(--tinta);color:#fff;border-color:var(--tinta)}
.ia-filtro .n{font-weight:800;opacity:.55;margin-left:2px}
.ia-filtro[aria-pressed="true"] .n{opacity:.8}
.ia-filtros-todo{display:flex;flex-direction:column;gap:10px;min-width:0}
.ia-filtros-2{align-items:center}
.ia-filtro.peq{min-height:40px;padding:0 13px;font-size:13.5px;font-weight:700;border-width:1px}
.ia-filtro.peq.tu:not([aria-pressed="true"]){background:var(--ambar-bg);border-color:var(--ambar-borde);color:var(--ambar-txt)}
.ia-desple{position:relative;flex:none;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px 0 14px;border-radius:999px;border:1px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font-size:13.5px;font-weight:700;white-space:nowrap;cursor:pointer}
.ia-desple svg{transform:rotate(90deg);opacity:.6}
.ia-desple.puesto{background:var(--tinta);color:#fff;border-color:var(--tinta)}
.ia-desple select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:16px}
.ia-desple .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.ia-desple:focus-within{outline:2px solid var(--naranja);outline-offset:2px}
.ia-quitar{flex:none;min-height:40px;padding:0 6px;background:none;border:0;color:var(--naranja-txt);font-size:13.5px;font-weight:700;text-decoration:underline;cursor:pointer;white-space:nowrap}
.ia-nada .ia-btn{margin-top:10px}
.ia-obras{display:flex;flex-direction:column;gap:12px;padding:4px 16px 18px}
.ia-obra{flex:none;display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid var(--linea);border-radius:22px;padding:16px 18px;text-decoration:none;color:var(--tinta);box-shadow:var(--sombra);text-align:left;cursor:pointer;width:100%;font:inherit}
.ia-obra[aria-pressed="true"]{border:1.5px solid var(--tinta)}
.ia-obra-a{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ia-obra-a>span:first-child{min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-obra-a b{font-size:16.5px;line-height:1.25}
.ia-obra-a .donde{font-size:13.5px;line-height:1.35;color:var(--gris);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ia-obra-bono{flex:none;text-align:right;display:flex;flex-direction:column;gap:1px}
.ia-obra-bono b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:22px;line-height:1.1;font-variant-numeric:tabular-nums}
.ia-obra-bono span{font-size:12px;color:var(--gris)}
.ia-obra-c{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ia-obra-c>span:first-child{font-size:13.5px;color:var(--gris);min-width:0}
.ia-obra-c>span:first-child b{color:var(--tinta)}
.ia-obra-accion{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:10px;border-top:1px solid var(--linea);font-size:15px;font-weight:700}
.ia-obra-accion svg{color:var(--naranja-txt);flex:none}
.ia-nada{margin:24px 8px;font-size:15.5px;line-height:1.55;color:var(--gris);text-align:center}

/* ── Ficha de la obra / cliente ── */
.ia-ficha-top{display:flex;align-items:center;justify-content:space-between;padding:8px 16px 0 8px}
.ia-pildora{padding:6px 10px;border-radius:999px;background:#fff;border:1px solid rgba(20,17,17,.10);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;color:var(--gris)}
.ia-ficha-cab{padding:0 4px;display:flex;flex-direction:column;gap:6px}
.ia-ficha-cab h1{margin:0;font-size:34px;line-height:1.12;overflow-wrap:anywhere}
.ia-ficha-cab p{margin:0;font-size:15px;line-height:1.5;color:var(--gris)}
.ia-ficha-cab .ia-dos{margin-top:8px}
.ia-paso h2{margin:0;font-size:28px;line-height:1.1}
.ia-paso{display:flex;flex-direction:column;gap:10px}
.ia-paso p.txt{margin:4px 0 0;font-size:15px;line-height:1.55;color:var(--gris)}
.ia-paso p.txt b{color:var(--tinta)}
.ia-toca-h{margin:0;font-size:18px;line-height:1.3;font-weight:800}
.ia-toca-p{margin:0;font-size:15px;line-height:1.55;color:var(--gris)}
.ia-toca-otra{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;border-top:1px solid var(--linea)}
.ia-toca-otra>div{min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-toca-otra b{font-size:15.5px;line-height:1.3}
.ia-toca-otra span{font-size:13.5px;color:var(--gris)}
.ia-cifra{margin:10px 0 0;font-size:60px;line-height:.95;font-variant-numeric:tabular-nums}
.ia-cifra small{font-size:30px}
.ia-cifra-p{margin:8px 0 0;font-size:15px;color:var(--gris)}
.ia-aviso{padding:16px 18px;border-radius:18px;background:var(--crema);border:1px solid rgba(20,17,17,.10);font-size:15px;line-height:1.5;color:var(--gris)}
.ia-aviso.tu{background:var(--ambar-bg);border-color:var(--ambar-borde);color:var(--ambar-txt)}
.ia-sec-tit{margin:6px 4px 0}
.ia-pequeno{font-size:13px;color:var(--gris)}

/* ── PC: lista a la izquierda, obra a la derecha ── */
.ia-pc-cab{display:none}
@media (min-width:1024px){
  .ia-lista-cab.con-pc{display:none}
  .ia-pc-cab{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding:28px 28px 0}
  .ia-pc-cab h1{margin:0;font-size:40px;line-height:1.1}
  .ia-pc-cab .ia-buscar{flex:0 1 340px;min-height:48px}
  .ia-pc-filtros{flex-basis:100%;display:flex;gap:8px}
  .ia-pc-filtros .ia-filtros{margin:0;padding:0;flex-wrap:wrap;overflow:visible}
  .ia-split{display:flex;gap:18px;align-items:flex-start;padding:18px 28px 32px}
  .ia-split .ia-obras{flex:1 1 340px;max-width:440px;min-width:0;padding:0;gap:10px}
  .ia-split .ia-obra{border-radius:20px;padding:14px 16px;gap:8px;box-shadow:0 1px 2px rgba(20,17,17,.04)}
  .ia-split .ia-obra .ia-obra-accion{display:none}
  .ia-panel{flex:2 1 440px;min-width:0;position:sticky;top:18px}
}
.ia-panel{display:none}
@media (min-width:1024px){.ia-panel{display:block}}
.ia-panel-card{position:relative;overflow:hidden;padding:28px 26px 24px;display:flex;flex-direction:column;gap:18px}
.ia-panel-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.ia-panel-cab{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:14px}
.ia-panel-cab>div:first-child{flex:1 1 240px;min-width:0;display:flex;flex-direction:column;gap:4px}
.ia-panel-cab h2{margin:0;font-size:32px;line-height:1.12}
.ia-panel-cab p{margin:0;font-size:15px;color:var(--gris)}
.ia-panel-bono{flex:none;text-align:right;display:flex;flex-direction:column;gap:2px}
.ia-panel-bono b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:44px;line-height:1;font-variant-numeric:tabular-nums}
.ia-panel-bono span{font-size:13px;color:var(--gris)}
.ia-panel-toca{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border-radius:18px;background:var(--ambar-bg);border:1px solid var(--ambar-borde)}
.ia-panel-toca>div{min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-panel-toca span{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--ambar-txt)}
.ia-panel-toca b{font-size:17px;line-height:1.3}
.ia-tres{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.ia-tres>div{padding:14px 16px;border-radius:16px;background:var(--crema);display:flex;flex-direction:column;gap:4px;min-width:0}
.ia-tres span{font-size:13px;color:var(--gris)}
.ia-tres b{font-size:18px;line-height:1.25}

/* ── Esperas, errores y la hoja del perfil ── */
@keyframes ia-brillo{0%{background-position:-400px 0}100%{background-position:400px 0}}
.ia-esqueleto{border-radius:22px;background:linear-gradient(90deg,#f1efeb 0,#f8f6f2 50%,#f1efeb 100%);background-size:800px 100%;animation:ia-brillo 1.4s linear infinite}
@keyframes ia-entra{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.ia-entra{animation:ia-entra .55s cubic-bezier(.2,.8,.2,1) both}
.ia-entra:nth-child(2){animation-delay:.05s}.ia-entra:nth-child(3){animation-delay:.1s}.ia-entra:nth-child(4){animation-delay:.15s}
@media (prefers-reduced-motion:reduce){.ia-entra,.ia-esqueleto{animation:none}}
/* ── Fase 5: marca, teclado, sin conexión, número en la barra, instalar ── */
.ia-marca{display:flex;align-items:center;gap:10px;min-width:0}
.ia-marca-logo{height:36px;width:auto;max-width:96px;object-fit:contain;display:block;border-radius:8px}
.ia-marca-txt{display:flex;flex-direction:column;min-width:0;line-height:1.15}
.ia-marca-txt b{font-size:14.5px;font-weight:800;color:var(--tinta);line-height:1.2;max-width:58vw;overflow-wrap:anywhere}
.ia-marca-txt small{font-size:11.5px;font-weight:600;color:var(--gris)}
.ia-marca-txt small span{font-weight:800;letter-spacing:.04em;color:var(--tinta)}
.ia-lat .ia-marca{margin-left:6px}
.ia-lat .ia-marca-txt b{max-width:150px}
.ia-saltar{position:absolute;left:12px;top:-60px;z-index:60;padding:12px 16px;border-radius:12px;background:var(--tinta);color:#fff !important;font-weight:700;text-decoration:none}
.ia-saltar:focus{top:10px}
.ia-main:focus{outline:none}
.ia-sinred{flex:none;display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--ambar-bg);border-bottom:1px solid var(--ambar-borde);color:var(--ambar-txt);font-size:14px;font-weight:600;margin-bottom:14px}
.ia-barra-ico{position:relative;display:inline-flex}
.ia-barra-n{position:absolute;top:-6px;left:15px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:var(--naranja);color:#08090c;font-size:11.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff}
.ia-aviso-fila{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.ia-instalar-card{display:flex;flex-direction:column;gap:14px}
.ia-instalar{display:flex;align-items:center;gap:12px}
.ia-instalar>div{display:flex;flex-direction:column;gap:2px;min-width:0}
.ia-instalar b{font-size:15.5px;line-height:1.3}
.ia-instalar span:not(.ia-baldosa){font-size:14px;color:var(--gris);line-height:1.45}
.ia-instalar-pasos li{display:list-item;padding-left:2px}
.ia-instalar-pasos li::marker{font-weight:800;color:var(--naranja-txt)}
.ia-instalar-pasos{margin:0;padding:0 0 0 24px;list-style:decimal;display:flex;flex-direction:column;gap:8px;font-size:15px;line-height:1.5;color:var(--tinta)}

.ia-velo{position:fixed;inset:0;z-index:300;background:rgba(20,17,17,.42);display:flex;align-items:flex-end;justify-content:center}
.ia-hoja{width:100%;max-width:440px;background:#fff;border-radius:24px 24px 0 0;padding:10px 16px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -8px 32px rgba(20,17,17,.18);font-family:'Inter',system-ui,sans-serif;color:var(--tinta)}
@media (min-width:768px){.ia-velo{align-items:center}.ia-hoja{border-radius:24px;padding:16px}}
.ia-hoja-asa{width:40px;height:4px;border-radius:99px;background:rgba(20,17,17,.16);margin:0 auto 10px}

/* ── Una pantalla del CRM de siempre dentro de la cáscara (la oportunidad) ── */
.ia-externo-barra{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--crema);border-bottom:1px solid var(--linea)}
.ia-externo{min-height:100%;background:var(--app-bg,#0c0e12);color:#fff;color-scheme:dark;font-family:var(--font-family,'Inter',system-ui,sans-serif);font-size:16px;line-height:1.5;text-align:initial}
.theme-light .ia-externo{color:#141111;color-scheme:light}

/* ── Fase 2: lo que se hace DENTRO de la obra ── */
.ia-accion-cab{display:flex;flex-direction:column;gap:6px;padding:4px 2px 0}
.ia-accion-cab h1{font-size:34px;line-height:1.1;margin:0}
.ia-accion-cab p{margin:0;font-size:15px;line-height:1.5;color:var(--gris)}
.ia-estado{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:var(--neutro);color:var(--gris);align-self:flex-start}
.ia-estado.ok{background:rgba(177,209,62,.22);color:var(--verde-txt)}
.ia-estado.tu{background:var(--ambar-bg);color:var(--ambar-txt)}
.ia-hojas{display:flex;flex-direction:column;gap:10px;background:var(--neutro);border-radius:18px;padding:10px;min-height:120px}
.ia-hojas canvas{display:block;width:100%;height:auto;background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(20,17,17,.12)}
.ia-hojas-estado{display:flex;align-items:center;justify-content:center;gap:10px;min-height:120px;font-size:14.5px;color:var(--gris);text-align:center;padding:12px}
.ia-subir{display:flex;flex-direction:column;gap:12px}
.ia-subir input[type=file]{display:none}
.ia-zona{display:flex;align-items:center;gap:14px;min-height:76px;padding:14px 16px;border-radius:18px;border:1.5px dashed rgba(20,17,17,.22);background:var(--crema);cursor:pointer;width:100%;text-align:left;color:var(--tinta)}
.ia-zona.sel{border-style:solid;border-color:var(--naranja);background:#fff}
.ia-zona b{display:block;font-size:15.5px;overflow-wrap:anywhere}
.ia-zona span{display:block;font-size:13.5px;color:var(--gris)}
/* Las tarjetas de las páginas públicas (FirmarCifoCard, SubirRiteCard) dentro de la
   app: su papel crema ya lo pone la cáscara, así que el «.in» no ocupa la pantalla. */
.in.ia-in{min-height:0;background:transparent;overflow:visible;position:static}
.in.ia-in .in-stack{margin-top:0}
.ia-docs{border-radius:24px;overflow:hidden}
.ia-docs > .theme-light{background:transparent}
/* El paso guiado del gestor trae botones de 42 px y un «Ver todos» de texto: en la app
   (dedo, no ratón) llegan a 44 px sin tocar el gestor que usan las demás pantallas. */
.ia-docs button.py-3{min-height:44px}
.ia-docs button.underline{min-height:44px;display:inline-flex;align-items:center}

/* ── Fase 3: «Tu página web» y «Elegir fotos de mis obras» ── */
.ia-pg-ficha{display:flex;flex-direction:column;gap:14px}
.ia-pg-quien{display:flex;align-items:center;gap:12px}
.ia-pg-quien>div{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-pg-quien b{font-size:17px;line-height:1.25;overflow-wrap:anywhere}
.ia-pg-quien span:not(.ia-chip):not(.ia-foto-chip){font-size:13.5px;color:var(--gris)}
.ia-pg-ini{font-weight:800;font-size:15px}
.ia-pg-url{margin:0;padding:10px 12px;border-radius:12px;background:var(--crema);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:var(--gris);overflow-wrap:anywhere}
.ia-pg-ficha .ia-btn-peq{white-space:nowrap;padding:0 10px;gap:8px}
.ia-pg-sec{display:flex;flex-direction:column;gap:12px}
.ia-pg-tit{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.ia-pg-tit>span{font-size:13px;color:var(--gris);text-align:right}
.ia-rejilla{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ia-foto{position:relative;display:block;aspect-ratio:1/1;border-radius:14px;overflow:hidden;background:var(--neutro);border:0;padding:0;cursor:pointer;min-width:0}
.ia-foto img{width:100%;height:100%;object-fit:cover;display:block}
.ia-foto.sel{box-shadow:0 0 0 3px var(--naranja)}
.ia-foto.ya{cursor:default}
.ia-foto.ya img{opacity:.55}
.ia-foto-chip{position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);min-height:22px;padding:3px 6px;border-radius:9px;display:inline-flex;align-items:center;font-size:10px;line-height:1.15;font-weight:800;letter-spacing:.02em;text-transform:uppercase;white-space:normal;overflow-wrap:normal;background:#fff;color:var(--verde-txt)}
.ia-foto-chip.rev{background:var(--ambar-bg);color:var(--ambar-txt)}
.ia-foto-chip.no{background:var(--tinta);color:#fff}
.ia-foto-chip.est{position:static;flex:none}
.ia-foto-fase{position:absolute;left:6px;top:6px;min-height:22px;padding:0 7px;border-radius:999px;display:inline-flex;align-items:center;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;background:rgba(255,255,255,.92);color:var(--tinta)}
.ia-foto-check{position:absolute;right:6px;top:6px;width:26px;height:26px;border-radius:999px;border:2px solid #fff;background:rgba(20,17,17,.25);display:flex;align-items:center;justify-content:center;color:#08090c}
.ia-foto.sel .ia-foto-check{background:var(--naranja);border-color:var(--naranja)}
.ia-ef-obra{display:flex;flex-direction:column;gap:12px;padding:16px}
.ia-ef-cab{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:0 2px}
.ia-ef-cab b{font-size:16px;line-height:1.3;min-width:0;overflow-wrap:anywhere}
.ia-ef-cab span{flex:none;font-size:13px;color:var(--gris)}
.ia-ef{padding-bottom:0}
.ia-ef-inc{display:flex;flex-direction:column;gap:14px}
.ia-ef-pie{position:sticky;bottom:0;z-index:4;margin:4px -16px 0;padding:14px 16px calc(14px + env(safe-area-inset-bottom));background:rgba(250,249,247,.96);border-top:1px solid var(--linea);display:flex;flex-direction:column;gap:10px;backdrop-filter:blur(6px)}
@media (min-width:1024px){.ia-ef-pie{margin:4px 0 0;padding:14px 0 18px}}
.ia-permiso{display:flex;align-items:flex-start;gap:12px;min-height:44px;font-size:15px;line-height:1.45;cursor:pointer}
.ia-permiso input{flex:none;width:24px;height:24px;margin:1px 0 0;accent-color:var(--naranja);cursor:pointer}
.ia-btn:disabled{cursor:default;opacity:.7;transform:none}
.ia-campo{display:flex;flex-direction:column;gap:6px;border:0;margin:0;padding:0;min-width:0}
.ia-campo>span,.ia-campo legend{font-size:14px;font-weight:700;color:var(--tinta);padding:0;margin-bottom:6px}
.ia-campo textarea,.ia-campo input[type=text],.ia-campo input[type=date]{width:100%;min-height:52px;padding:12px 14px;border-radius:16px;border:1.5px solid rgba(20,17,17,.14);background:#fff;font:inherit;font-size:16px;line-height:1.45;color:var(--tinta);resize:vertical;text-transform:none}
.ia-campo textarea:focus,.ia-campo input[type=text]:focus{outline:0;border-color:var(--tinta)}
.ia-campo small{font-size:12.5px;color:var(--gris)}
.ia-campo small.mal{color:var(--ambar-txt);font-weight:700}
.ia-chips{display:flex;flex-wrap:wrap;gap:8px}
.ia-hoja-foto{border-radius:16px;overflow:hidden;background:var(--neutro);aspect-ratio:4/3}
.ia-hoja-foto img{width:100%;height:100%;object-fit:cover;display:block}
.ia-tarjeta-web{display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;width:100%;font:inherit;color:var(--tinta)}
.ia-tarjeta-web>div{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-tarjeta-web b{font-size:16px;line-height:1.3}
.ia-tarjeta-web span{font-size:13.5px;color:var(--gris);line-height:1.4}
.ia-docs-web{display:flex;flex-direction:column;gap:10px}
.ia-docs-web p{margin:0;font-size:14.5px;line-height:1.5;color:var(--gris)}

/* ── Fase 4: el Catálogo y la ficha de un equipo (prototipo Catalogo y Modelo) ── */
.ia-eq{flex:none;display:flex;flex-direction:column;gap:12px;background:#fff;border:1px solid var(--linea);border-radius:22px;padding:16px 18px;text-decoration:none;color:var(--tinta);box-shadow:var(--sombra);text-align:left;cursor:pointer;width:100%;font:inherit}
.ia-eq-a{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ia-eq-a>span:first-child{min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-eq-a b{font-size:17px;line-height:1.25;overflow-wrap:anywhere}
.ia-eq-ref{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;color:var(--gris);overflow-wrap:anywhere}
.ia-eq-tarifa{flex:none;text-align:right;display:flex;flex-direction:column;gap:1px;max-width:46%}
.ia-eq-tarifa b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:24px;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.ia-eq-tarifa span{font-size:12px;color:var(--gris)}
.ia-eq-tarifa .sin{font-size:13.5px;font-weight:700;color:var(--gris);line-height:1.3}
.ia-eq-chips{display:flex;flex-wrap:wrap;gap:6px}
.ia-eq-chip{min-height:28px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;font-size:12.5px;font-weight:700;background:var(--neutro);color:var(--tinta)}
.ia-eq-chip.v{background:rgba(177,209,62,.18);color:var(--verde-txt)}
.ia-eq-chip.n{background:var(--baldosa);color:var(--naranja-txt)}
.ia-eq-cab{padding:0 4px;display:flex;flex-direction:column;gap:6px}
.ia-eq-cab h1{margin:0;font-size:34px;line-height:1.12;overflow-wrap:anywhere}
.ia-eq-cab p.ref{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13.5px;color:var(--gris);overflow-wrap:anywhere}
.ia-eq-precio{position:relative;overflow:hidden;padding:24px 20px 8px}
.ia-eq-precio::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.ia-eq-sin{margin:10px 0 0;font-size:34px;line-height:1.05}
.ia-eq-tuyo{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:68px;border-top:1px solid var(--linea);margin-top:14px}
.ia-eq-tuyo>div{min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-eq-tuyo span{font-size:13.5px;color:var(--gris)}
.ia-eq-tuyo b{font-size:18px;font-variant-numeric:tabular-nums}
.ia-eq-tuyo b.falta{font-size:15.5px;color:var(--gris)}
.ia-eq-papel{display:flex;align-items:center;gap:12px;min-height:60px;width:100%;background:none;border:0;border-top:1px solid var(--linea);padding:6px 0;text-align:left;cursor:pointer;color:var(--tinta)}
.ia-eq-papel.primera{border-top-color:transparent}
.ia-eq-papel>span.ico{flex:none;width:40px;height:40px;border-radius:12px;background:var(--neutro);display:flex;align-items:center;justify-content:center}
.ia-eq-papel>span.txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-eq-papel b{font-size:15.5px}
.ia-eq-papel small{font-size:13px;color:var(--gris);line-height:1.35}
.ia-eq-papel>span.ver{flex:none;font-size:14.5px;font-weight:700;text-decoration:underline;text-underline-offset:3px}
/* ── 22/11/2026: marcas por LOGO, precio por distribuidor y el pedido ── */
.ia-mc-rejilla{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media (min-width:560px){.ia-mc-rejilla{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:1024px){.ia-mc-rejilla{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.ia-mc-logo{height:88px}}
.ia-mc{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid var(--linea);border-radius:22px;padding:14px;box-shadow:var(--sombra);cursor:pointer;text-align:left;color:var(--tinta);font:inherit;min-width:0}
.ia-mc-logo{display:flex;align-items:center;justify-content:center;height:72px;border-radius:14px;background:var(--crema);padding:10px;overflow:hidden}
.ia-mc-logo img{max-width:100%;max-height:100%;object-fit:contain}
.ia-mc-logo>span{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:20px;letter-spacing:.02em;text-align:center;overflow-wrap:anywhere;line-height:1.1}
.ia-mc-logo.g{flex:none;width:64px;height:48px;padding:6px;border-radius:12px;background:#fff;border:1px solid var(--linea)}
.ia-mc-logo.g>span{font-size:13px}
.ia-mc-pie{display:flex;flex-direction:column;gap:1px;min-width:0}
.ia-mc-pie b{font-size:15.5px;line-height:1.25;overflow-wrap:anywhere}
.ia-mc-pie small{font-size:13px;color:var(--gris)}
.ia-mc-cab{display:flex;align-items:center;gap:12px;min-width:0}
.ia-mc-cab h1{min-width:0;overflow-wrap:anywhere}
.ia-dist{display:flex;flex-direction:column;margin-top:4px}
.ia-dist-f{display:flex;align-items:center;gap:12px;min-height:64px;width:100%;padding:8px 2px;background:none;border:0;border-top:1px solid var(--linea);text-align:left;cursor:pointer;color:var(--tinta);font:inherit}
.ia-dist-f.primera{border-top-color:transparent}
.ia-dist-f:disabled{cursor:progress}
.ia-dist-o{flex:none;width:26px;height:26px;border-radius:999px;border:2px solid rgba(20,17,17,.28);display:flex;align-items:center;justify-content:center;color:#fff}
.ia-dist-f.si .ia-dist-o{background:var(--tinta);border-color:var(--tinta)}
.ia-dist-n{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
.ia-dist-n b{font-size:16px;line-height:1.25;overflow-wrap:anywhere}
.ia-dist-n small{font-size:13px;color:var(--gris);line-height:1.35}
.ia-dist-f.si .ia-dist-n small{color:var(--verde-txt);font-weight:700}
.ia-dist-p{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.ia-dist-p b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:24px;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.ia-dist-p .sin{font-size:15px;color:var(--gris2)}
.ia-hoja-alta{max-height:calc(100dvh - 24px);overflow-y:auto}
.ia-cant{display:flex;align-items:center;gap:12px}
.ia-cant .ia-btn{flex:none;width:56px;min-height:52px;padding:0;font-size:24px}
.ia-cant .ia-btn:disabled{opacity:.4;cursor:default}
.ia-cant output{min-width:48px;text-align:center;font-family:'Antonio','Inter',Impact,sans-serif;font-size:30px;font-variant-numeric:tabular-nums}
.ia-wa{background:#e7f6dc;border-radius:16px 16px 16px 4px;padding:12px 14px;font-size:14.5px;line-height:1.45;color:#141111;overflow-wrap:anywhere;max-height:44vh;overflow-y:auto}
.ia-wa p{margin:0}
.ia-campo input[type=text].ia-precio{font-family:'Antonio','Inter',Impact,sans-serif;font-size:30px!important;font-variant-numeric:tabular-nums;min-height:60px}

/* ── Presupuestos que hace el instalador (22/11/2026) ── */
.ia-pr-imp{flex:none;text-align:right;display:flex;flex-direction:column;gap:1px}
.ia-pr-imp b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:20px;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.ia-pr-imp span{font-size:12px;color:var(--gris)}
.ia-pr-imp.anulado b{color:var(--gris2);text-decoration:line-through}
.ia-pr-sec{display:flex;flex-direction:column;gap:14px}
.ia-pr-sec>h2{margin:0;display:flex;align-items:center;gap:10px;font-size:19px;line-height:1.25;font-weight:800}
.ia-pr-n{flex:none;width:28px;height:28px;border-radius:999px;background:var(--tinta);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:800}
.ia-pr-sec>h2 .ok{margin-left:auto;color:var(--verde-txt)}
.ia-campo input[type=tel],.ia-campo input[type=email],.ia-campo input[type=number],.ia-campo input[type=search],.ia-campo select{width:100%;min-height:52px;padding:12px 14px;border-radius:16px;border:1.5px solid rgba(20,17,17,.14);background:#fff;font:inherit;font-size:16px;line-height:1.45;color:var(--tinta)}
.ia-campo input:focus,.ia-campo select:focus{outline:0;border-color:var(--tinta)}
.ia-campo.mal input,.ia-campo.mal textarea{border-color:var(--ambar-borde);background:var(--ambar-bg)}
.ia-pr-fila2{display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr);gap:10px}
.ia-pr-fila2.mitad{grid-template-columns:repeat(2,minmax(0,1fr))}
.ia-pr-elegido{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.ia-pr-elegido>div{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-pr-elegido b{font-size:16px;line-height:1.3;overflow-wrap:anywhere}
.ia-pr-elegido span{font-size:13.5px;color:var(--gris);line-height:1.4}
.ia-pr-lista{display:flex;flex-direction:column;border:1px solid var(--linea);border-radius:18px;overflow:hidden;background:#fff}
.ia-pr-lista button{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 14px;border:0;border-top:1px solid var(--linea);background:none;text-align:left;cursor:pointer;color:var(--tinta);width:100%}
.ia-pr-lista button:first-child{border-top:0}
.ia-pr-lista button>span{min-width:0;display:flex;flex-direction:column;gap:1px}
.ia-pr-lista button b{font-size:15.5px}
.ia-pr-lista button small{font-size:13px;color:var(--gris)}
.ia-pr-lista button.nuevo{font-weight:800;color:var(--naranja-txt)}
.ia-pr-extra{display:inline-flex;align-items:center;gap:6px}
.ia-pr-litros{display:inline-flex;align-items:center;gap:4px;font-size:13.5px;color:var(--gris);font-weight:700}
.ia-pr-litros input{width:64px;min-height:40px;padding:0 8px;border-radius:12px;border:1.5px solid rgba(20,17,17,.14);font:inherit;font-size:16px;text-align:right;background:#fff;color:var(--tinta)}
.ia-pr-linea{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.ia-pr-linea textarea{width:100%;min-height:64px;padding:10px 12px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;font:inherit;font-size:15px;line-height:1.45;color:var(--tinta);resize:vertical;text-transform:uppercase}
.ia-pr-linea textarea:focus{outline:0;border-color:var(--tinta)}
.ia-pr-linea-pie{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.ia-pr-linea-pie>span{font-size:12.5px;color:var(--gris);font-weight:700}
.ia-pr-partida{display:flex;align-items:center;gap:8px}
.ia-pr-partida input{min-height:44px;padding:0 10px;border-radius:12px;border:1.5px solid rgba(20,17,17,.14);font:inherit;font-size:16px;background:#fff;color:var(--tinta);text-align:right;font-variant-numeric:tabular-nums}
.ia-pr-partida input.c{width:64px}.ia-pr-partida input.p{width:120px}
.ia-pr-partida label{font-size:12.5px;color:var(--gris);font-weight:700}
.ia-pr-totales{display:flex;flex-direction:column;gap:4px;padding:16px 18px;border-radius:18px;background:var(--crema)}
.ia-pr-totales .fila{display:flex;justify-content:space-between;gap:12px;font-size:15px;color:var(--gris);font-variant-numeric:tabular-nums}
.ia-pr-totales .fila b{color:var(--tinta)}
.ia-pr-totales .total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:6px;padding-top:10px;border-top:1.5px solid var(--tinta)}
.ia-pr-totales .total span{font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.ia-pr-totales .total b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:40px;line-height:1;font-variant-numeric:tabular-nums}
.ia-pr-guardar{position:sticky;bottom:0;z-index:4;margin:0 -16px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(250,249,247,.96);border-top:1px solid var(--linea);display:flex;flex-direction:column;gap:8px;backdrop-filter:blur(6px)}
.ia-pr-guardar .fila{display:flex;align-items:center;gap:10px}
.ia-pr-guardar .fila .ia-btn{flex:1 1 auto}
.ia-pr-ver{flex:none;min-height:56px;padding:0 14px;border-radius:16px;border:0;background:var(--tinta);color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.15}
.ia-pr-ver b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:16px;color:var(--lima)}
.ia-pr-dos{display:block}
.ia-pr-lado{display:none}
.ia-app .fo-previa{background:#fff;border:1px solid var(--linea);border-radius:18px;overflow:hidden;position:relative;min-height:200px}
.ia-app .fo-previa canvas{display:block;width:100%;height:auto}
.ia-app .fo-previa .cargando{position:absolute;top:10px;right:10px;font-size:11.5px;font-weight:700;color:var(--gris);background:rgba(255,255,255,.92);border:1px solid var(--linea);border-radius:999px;padding:5px 10px}
.ia-pr-hoja{max-width:640px;max-height:92vh;display:flex;flex-direction:column;padding:10px 12px calc(14px + env(safe-area-inset-bottom))}
.ia-pr-hoja-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 4px 10px}
.ia-pr-hoja-cab b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:22px}
.ia-pr-hoja-cuerpo{overflow:auto;-webkit-overflow-scrolling:touch;min-height:0}
.ia-pr-copiar{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.ia-pr-copiar p{margin:0;white-space:pre-line;font-size:15px;line-height:1.5}
.ia-pr-acciones{display:flex;flex-direction:column;gap:10px}
.ia-pr-pdf{margin-top:14px}
@media (min-width:1024px){
  .ia-pr-pdf{margin-top:0;position:sticky;top:18px}
  .ia-pr-dos{display:grid;grid-template-columns:minmax(0,560px) minmax(0,1fr);gap:24px;align-items:start}
  .ia-pr-lado{display:block;position:sticky;top:18px}
  .ia-pr-lado .fo-previa{display:flex;justify-content:center}
  .ia-pr-lado .fo-previa canvas{width:auto;max-width:100%;max-height:calc(100vh - 120px)}
  .ia-pr-ver{display:none}
  .ia-pr-guardar{margin:0;padding:14px 0 18px}
  .ia-pagina.ancha{max-width:1180px;margin:0}
}
/* La factura en su plantilla va en la página ANCHA (la vista previa al lado, como la del email);
   lo demás de la acción conserva el ancho de siempre. El «Súbela», bajo la columna del formulario. */
.ia-fac-estrecha{width:100%;max-width:720px}
.ia-link.ia-fac-subela{align-self:center}
@media (min-width:1024px){.ia-pagina.ancha .ia-link.ia-fac-subela{align-self:flex-start;width:100%;max-width:460px;justify-content:center}}

/* ── Fase 5 · el PC aprovecha la pantalla (22/11/2026) ──
   Fran: «en la vista PC no se está aprovechando toda la pantalla y se tiene que hacer demasiado
   scroll». Las fichas van en DOS columnas (lo que se hace a la izquierda, las cifras a la derecha)
   y las listas en REJILLA. En el móvil los envoltorios no existen (display: contents): el orden
   y el aspecto son los de siempre. Medido a 1366, 1536 (16") y 1920. */
.ia-pc-dos,.ia-pc-main,.ia-pc-lado,.ia-of-arriba,.ia-of-filas,.ia-pc-barra{display:contents}
.ia-pc-cabecera-txt{display:flex;flex-direction:column;gap:6px;min-width:0}
.ia-eq-rejilla,.ia-cl-obras{display:flex;flex-direction:column;gap:12px}
.ia-solo-pc{display:none}
@media (min-width:1024px){
  .ia-pagina.pc{max-width:1440px;margin:0}
  .ia-pagina.pc.medio{max-width:1180px}
  .ia-pc-barra{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
  .ia-pc-barra>.ia-btn{width:auto;flex:none;padding-left:24px;padding-right:24px}
  .ia-pc-barra>.ia-pc-buscar{flex:1 1 380px}
  .ia-pc-cabecera{flex-direction:row;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px 24px}
  .ia-pc-cabecera-txt{flex:1 1 420px}
  .ia-pc-cabecera .ia-dos{margin-top:0;flex:0 1 360px}
  .ia-pc-cabecera .ia-btn-sec{min-height:48px}
  .ia-pc-dos{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,400px);gap:18px;align-items:start}
  .ia-pc-main,.ia-pc-lado,.ia-of-arriba{display:flex;flex-direction:column;gap:14px;min-width:0}
  .ia-of-filas{display:block}
  .ia-solo-pc{display:flex}
  .ia-eq-rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;align-items:start}
  .ia-pc-buscar{max-width:620px}
  /* Listas de filas (clientes, presupuestos): cada fila, una tarjeta en rejilla. */
  .ia-card.lista.ia-rejilla-filas{background:none;border:0;box-shadow:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px}
  .ia-rejilla-filas>.ia-fila{background:#fff;border:1px solid var(--linea);border-radius:18px;box-shadow:0 1px 2px rgba(20,17,17,.04);padding:10px 14px}
  .ia-rejilla-filas>.ia-fila.primera{border-top-color:var(--linea)}
  .ia-rejilla-filas>.ia-fila:hover{border-color:rgba(20,17,17,.24)}
  .ia-eq:hover,.ia-obra:hover{border-color:rgba(20,17,17,.24)}
}
@media (min-width:1280px){
  .ia-of-filas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:18px}
  .ia-of-filas>:nth-child(2){border-top-color:transparent}
}
@media (min-width:1500px){
  .ia-pagina.pc{max-width:1560px}
  .ia-pagina.pc.medio{max-width:1240px}
  .ia-pc-dos{grid-template-columns:minmax(0,1fr) 420px;gap:20px}
  .ia-of-arriba.dos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}
}

/* ── Fase 6: «Tu asistente» (prefijo .ia-asi-) ──
   En el móvil ocupa la pantalla: la cabecera y la barra de la app se esconden y lleva
   la suya con atrás; el compositor va pegado abajo. Desde 1024 px: el chat en el centro
   y lo preparado a la derecha. */
.ia-visual-oculto{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:1023px){
  .ia-app.con-asistente .ia-cab,.ia-app.con-asistente .ia-barra{display:none}
  .ia-app.con-gota .ia-main::after{content:'';display:block;height:72px}
}
.ia-asi{display:flex;flex-direction:column;min-height:100%;width:100%}
.ia-asi-cab{position:sticky;top:0;z-index:5;background:var(--crema);display:flex;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top)) 14px 10px 6px;border-bottom:1px solid var(--linea)}
.ia-asi-atras{flex:none;width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:none;border:0;color:var(--tinta);cursor:pointer}
.ia-asi-cara{flex:none;width:34px;height:34px;object-fit:contain}
.ia-asi-cara.g{width:44px;height:44px}
.ia-asi-cab-txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.ia-asi-cab-txt h1{margin:0;font-size:24px;line-height:1.05}
.ia-asi-cab-txt span{font-size:13px;color:var(--gris);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ia-asi-cero{margin-left:auto;font-size:13.5px;flex:none}
.ia-asi-dos{flex:1 1 auto;padding:14px 16px 6px}
.ia-asi-chat{display:flex;flex-direction:column;gap:12px;max-width:760px;margin:0 auto;width:100%}
.ia-asi-solo-movil{display:flex;flex-direction:column;gap:12px}
.ia-asi-lado{display:none}
.ia-asi-yo-no{display:flex;gap:8px;align-items:flex-end}
.ia-asi-burbuja{max-width:88%;padding:12px 14px;border-radius:20px;font-size:15.5px;line-height:1.5;overflow-wrap:anywhere}
.ia-asi-burbuja p{margin:0}
.ia-asi-burbuja p+p,.ia-asi-burbuja p+.ia-aviso{margin-top:8px}
.ia-asi-burbuja.el{background:#fff;border:1px solid var(--linea);border-bottom-left-radius:6px;box-shadow:var(--sombra);color:var(--tinta)}
.ia-asi-burbuja.yo{align-self:flex-end;background:var(--tinta);color:#fff;border-bottom-right-radius:6px;white-space:pre-wrap}
.ia-asi-saludo{font-size:24px;line-height:1.1;margin-bottom:6px !important}
.ia-asi-paso{color:var(--gris);font-size:14px}
.ia-asi-pensando{color:var(--gris)}
.ia-asi-pensando span{animation:ia-asi-punto 1.2s infinite}
.ia-asi-pensando span:nth-child(2){animation-delay:.2s}.ia-asi-pensando span:nth-child(3){animation-delay:.4s}
@keyframes ia-asi-punto{0%,80%,100%{opacity:.2}40%{opacity:1}}
.ia-asi-turno{display:flex;flex-direction:column;gap:10px}
.ia-asi-chips{display:flex;flex-wrap:wrap;gap:8px}
.ia-asi-chip{min-height:44px;padding:0 16px;border-radius:999px;background:#fff;border:1.5px solid rgba(20,17,17,.14);font:inherit;font-size:14.5px;font-weight:700;color:var(--tinta);cursor:pointer;text-align:left}
.ia-asi-chip:active{transform:scale(.98)}
.ia-asi-chip:disabled{opacity:.5;cursor:default}
.ia-asi-otra{margin:4px 0 0;font-size:13px;font-weight:700;color:var(--gris)}
@media (min-width:480px){
  .ia-asi-turno>.ia-card,.ia-asi-chips,.ia-asi-otra,.ia-asi-solo-movil{margin-left:42px}
}
/* Lo preparado */
.ia-asi-prep{padding:16px 8px 8px}
.ia-asi-cosa{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px 12px;align-items:center;padding:12px;border-top:1px solid var(--linea)}
.ia-asi-cosa.primera{border-top:0}
.ia-asi-cosa .ia-btn{grid-column:2;justify-self:start}
@media (min-width:560px){
  .ia-asi-cosa{grid-template-columns:44px minmax(0,1fr) auto}
  .ia-asi-cosa .ia-btn{grid-column:auto}
}
.ia-asi-lado .ia-asi-cosa{grid-template-columns:44px minmax(0,1fr)}
.ia-asi-lado .ia-asi-cosa .ia-btn{grid-column:2}
/* Las tarjetas (un presupuesto, una obra) */
.ia-asi-tarjeta{display:flex;flex-direction:column;gap:12px}
.ia-asi-tarjeta-cab{display:flex;gap:12px;align-items:flex-start}
.ia-asi-tarjeta-cab>div{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-asi-tarjeta-cab b{font-size:16.5px;line-height:1.3}
.ia-asi-tarjeta-cab span{font-size:13.5px;color:var(--gris);line-height:1.35}
.ia-asi-resumen{margin:0;font-size:14.5px;line-height:1.45;color:var(--gris)}
.ia-asi-total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:1.5px solid var(--tinta);padding-top:12px}
.ia-asi-total span{font-size:14px;color:var(--gris)}
.ia-asi-total b{font-size:36px;line-height:1}
.ia-asi-base{margin:-6px 0 0;text-align:right;font-size:13px;color:var(--gris)}
.ia-asi-bts{display:flex;flex-direction:column;gap:8px}
@media (min-width:600px){.ia-asi-bts{flex-direction:row;flex-wrap:wrap}.ia-asi-bts .ia-btn{flex:1 1 auto;min-height:52px;font-size:15px;padding:0 16px;white-space:nowrap}}
.ia-asi-filas{display:flex;flex-direction:column}
.ia-asi-fila{display:grid;grid-template-columns:112px minmax(0,1fr);gap:12px;padding:10px 0;border-top:1px solid var(--linea);font-size:14.5px;line-height:1.4}
.ia-asi-fila span{color:var(--gris)}
.ia-asi-fila b{font-weight:600}
.ia-asi-fila.tu b{color:var(--naranja-txt);font-weight:700}
.ia-asi-fila.ok b{color:var(--verde-txt)}
/* La casa y el bono tras el presupuesto: foto de la fachada, respuestas como botones */
.ia-asi-fachada{display:block;width:100%;max-height:260px;object-fit:cover;border-radius:16px;background:#f1efeb}
.ia-asi-opciones{display:grid;grid-template-columns:1fr;gap:8px}
@media (min-width:600px){.ia-asi-opciones{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ia-asi-opcion{min-height:52px;padding:10px 16px;border-radius:14px;background:#fff;border:1.5px solid rgba(20,17,17,.16);font:inherit;font-size:15px;font-weight:700;color:var(--tinta);cursor:pointer;text-align:left;line-height:1.3}
.ia-asi-opcion:hover{border-color:var(--tinta)}
.ia-asi-opcion:active{transform:scale(.99)}
.ia-asi-opcion:disabled{opacity:.55;cursor:default}
.ia-asi-opcion.sec{background:transparent;color:var(--gris);font-weight:600}
.ia-asi-otro{display:flex;flex-direction:column;gap:8px}
.ia-asi-otro label{display:flex;flex-direction:column;gap:6px;font-size:13.5px;color:var(--gris);font-weight:600}
.ia-asi-otro input{min-height:52px;padding:0 14px;border-radius:14px;border:1.5px solid rgba(20,17,17,.18);font:inherit;font-size:16px;color:var(--tinta);background:#fff}
.ia-asi-otro input:focus{outline:2px solid var(--tinta);outline-offset:1px}
@media (min-width:600px){.ia-asi-otro{flex-direction:row;align-items:flex-end}.ia-asi-otro label{flex:1 1 auto}.ia-asi-otro .ia-btn{min-height:52px;padding:0 22px}}
.ia-asi-enlace{background:none;border:0;padding:0;font:inherit;font-weight:700;color:inherit;text-decoration:underline;cursor:pointer}
.ia-asi-ayuda ul{margin:10px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:8px;font-size:14px;color:var(--gris);line-height:1.4}
.ia-asi-ayuda b{color:var(--tinta);font-weight:600}
/* El compositor */
.ia-asi-pie{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:14px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(rgba(250,249,247,0),var(--crema) 14px);max-width:792px;margin:0 auto;width:100%}
.ia-asi-aviso{flex-basis:100%;padding:12px 14px;font-size:14px}
.ia-asi-campo{flex:1 1 auto;min-width:0}
.ia-asi-campo input{width:100%;min-height:52px;border-radius:999px;border:1.5px solid rgba(20,17,17,.14);background:#fff;padding:0 18px;font:inherit;font-size:16px;color:var(--tinta);box-shadow:var(--sombra)}
.ia-asi-campo input::placeholder{color:var(--gris2)}
.ia-asi-boton{flex:none;width:52px;height:52px;border-radius:999px;border:0;background:var(--naranja);color:#08090c;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 10px 22px -10px rgba(255,160,0,.75)}
.ia-asi-boton.sec{background:#fff;border:1.5px solid rgba(20,17,17,.14);box-shadow:none;color:var(--tinta)}
.ia-asi-boton.grabando{background:var(--tinta);color:#fff;animation:ia-asi-latido 1.4s ease-in-out infinite}
.ia-asi-boton:disabled{opacity:.5;cursor:default}
.ia-asi-grabando{flex:1 1 auto;min-width:0;min-height:52px;border-radius:999px;background:var(--ambar-bg);border:1px solid var(--ambar-borde);display:flex;align-items:center;gap:10px;padding:0 18px;color:var(--ambar-txt);font-size:15px}
.ia-asi-grabando>span:last-child{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ia-asi-punto{flex:none;width:10px;height:10px;border-radius:50%;background:var(--naranja);animation:ia-asi-punto 1.2s infinite}
@keyframes ia-asi-latido{0%,100%{box-shadow:0 0 0 0 rgba(20,17,17,.28)}50%{box-shadow:0 0 0 9px rgba(20,17,17,0)}}
/* La gota flotante de las listas (solo móvil) */
.ia-asi-gota{position:fixed;right:16px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:60;width:60px;height:60px;border-radius:999px;background:#fff;border:1px solid var(--linea);box-shadow:0 10px 24px -8px rgba(20,17,17,.30);padding:6px;cursor:pointer}
.ia-asi-gota img{width:100%;height:100%;object-fit:contain;display:block}
/* La tarjeta de Inicio */
.ia-asi-entrada{display:flex;flex-direction:column;gap:14px}
.ia-asi-entrada-cab{display:flex;gap:12px;align-items:center}
.ia-asi-entrada-cab img{flex:none;width:52px;height:52px;object-fit:contain}
.ia-asi-entrada-cab div{display:flex;flex-direction:column;gap:2px;min-width:0}
.ia-asi-entrada-cab b{font-size:16px;line-height:1.3}
.ia-asi-entrada-cab span{font-size:13.5px;color:var(--gris);line-height:1.4}
.ia-asi-entrada-bts{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.ia-asi-entrada-bts .ia-btn{min-height:48px;font-size:15px;padding:0 14px}
@media (min-width:1024px){
  .ia-asi-gota{display:none}
  .ia-asi{display:grid;grid-template-columns:minmax(0,1fr) 360px;grid-template-rows:auto 1fr auto;column-gap:24px;padding:0 28px;max-width:1280px}
  .ia-asi-cab{grid-column:1/-1;padding:22px 0 12px;border-bottom:0}
  .ia-asi-atras{display:none}
  .ia-asi-dos{display:contents}
  .ia-asi-chat{grid-column:1;grid-row:2;max-width:none;padding-top:4px;align-self:start}
  .ia-asi-solo-movil{display:none}
  .ia-asi-lado{display:flex;flex-direction:column;gap:14px;grid-column:2;grid-row:2 / span 2;align-self:start;position:sticky;top:92px;max-height:calc(100vh - 104px);overflow-y:auto;padding:2px 2px 20px;scrollbar-width:thin}
  .ia-asi-pie{grid-column:1;grid-row:3;padding:12px 0 20px;max-width:none}
}
@media (min-width:1500px){.ia-asi{grid-template-columns:minmax(0,1fr) 420px;max-width:1440px}}
@media (prefers-reduced-motion:reduce){.ia-asi-pensando span,.ia-asi-punto,.ia-asi-boton.grabando{animation:none}}

@media (max-width:359px){
  .ia-pr-totales .total b{font-size:34px}
  .ia-pr-partida input.p{width:100px}
  .ia-eq-cab h1{font-size:30px}
  .ia-accion-cab h1{font-size:30px}
  .ia-hola h1{font-size:34px}.ia-titulo h1{font-size:32px}.ia-ficha-cab h1{font-size:30px}.ia-cifra{font-size:52px}
}
`;
