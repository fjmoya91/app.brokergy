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
.ia-barra-it.act{color:var(--naranja-txt);font-weight:800}
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
.ia-lat-it.act{font-weight:800;color:var(--tinta);background:var(--baldosa)}
.ia-lat-it.act svg{color:var(--naranja-txt)}
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
.ia-fila-txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-fila-txt b{font-size:15.5px;line-height:1.3}
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
.ia-ver-todas{margin-top:12px;min-height:48px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--linea);font-size:15px;font-weight:700;text-decoration:none;color:var(--tinta);background:none;border-left:0;border-right:0;border-bottom:0;width:100%;cursor:pointer;padding:0}
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

@media (max-width:359px){
  .ia-accion-cab h1{font-size:30px}
  .ia-hola h1{font-size:34px}.ia-titulo h1{font-size:32px}.ia-ficha-cab h1{font-size:30px}.ia-cifra{font-size:52px}
}
`;
