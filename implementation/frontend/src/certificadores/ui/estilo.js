// ─── estilo.js — el CSS de la app de certificadores ─────────────────────────
// Estilo «carta de pago» (regla 164; docs/conocimiento/transversal-frontend/
// estilo-carta-de-pago-lo-que-ve-el-cliente.md): los certificadores son nuestros
// CLIENTES, así que TODA la app va en claro — papel crema, tarjetas blancas de
// 24 px, tinta, Antonio 700 para titulares y cifras, Inter para el texto, UNA
// acción principal naranja por tarjeta, avisos en ÁMBAR (nunca rojo: lo que
// bloquea, en ámbar fuerte), el degradado naranja → verde solo como filete.
//
// CSS propio con prefijo `.ca-` en una constante que se inyecta con <style>: la
// app no depende del tema ni del Tailwind del CRM. Tailwind (index.css) se carga
// solo para las piezas que se reutilizan del CRM (Catastro, mapa, overlay de
// envío, la envolvente), que leen la clase `theme-light` de <html>.
//
// Los tokens van en :root (esta hoja solo se carga en certificadores.html) para
// que los lleven también las capas que se portalean a <body> (hojas, avisos,
// botones flotantes). Los nombres de las variables NO se cambian (guía de estilo).
// ─────────────────────────────────────────────────────────────────────────────

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATINEXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const inter = [400, 500, 600, 700, 800].map(w => `
@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;src:url('/fonts/Inter-${w}-latin.woff2') format('woff2');unicode-range:${LATIN}}
@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;src:url('/fonts/Inter-${w}-latinext.woff2') format('woff2');unicode-range:${LATINEXT}}`).join('');

export const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
${inter}
:root{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  --ambar-bg:#fff7e6;--ambar-borde:#f6dca4;--ambar-txt:#5c4100;
  --ambarF-bg:#ffefc4;--ambarF-borde:#eab64a;--ambarF-txt:#4a3200;
  --sombra:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);
  --ca-inf:0px;color-scheme:light}
html body{background:var(--crema)!important;color:var(--tinta)}
.ca{min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);position:relative;overflow-x:clip;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.55}
.ca *,.ca-capa *,.ca-fabs *,.ca-toast *{box-sizing:border-box}
.ca-filete-top{height:4px;background:var(--filete)}
.ca-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;z-index:0;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.ca-col{position:relative;z-index:1;max-width:480px;margin:0 auto;padding:18px 16px calc(40px + env(safe-area-inset-bottom) + var(--ca-inf))}
.ca-col-ancha{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:18px 16px calc(48px + env(safe-area-inset-bottom) + var(--ca-inf))}
/* cabecera pública */
.ca-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.ca-logo{height:26px;width:auto;display:block}
.ca-marca{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--tinta);min-width:0}
.ca-marca-txt{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px 0 9px;border-radius:999px;background:var(--tinta);color:#fff;font:800 10.5px/1 'Inter',sans-serif;letter-spacing:.11em;text-transform:uppercase;white-space:nowrap;box-shadow:0 6px 16px -8px rgba(20,17,17,.55)}
.ca-marca-txt svg{flex:none;color:var(--lima)}
.ca-pill{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em;white-space:nowrap}
/* barra de la app (con sesión) */
.ca-bar{position:sticky;top:0;z-index:40;background:rgba(250,249,247,.88);-webkit-backdrop-filter:saturate(1.4) blur(10px);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--linea);padding-top:env(safe-area-inset-top)}
.ca-bar-in{max-width:1120px;margin:0 auto;display:flex;align-items:center;gap:10px;padding:10px 16px;min-height:60px}
.ca-bar-esp{flex:1}
.ca-nav{display:flex;gap:4px}
.ca-nav a{display:inline-flex;align-items:center;min-height:40px;padding:0 12px;border-radius:12px;font:600 14px 'Inter',sans-serif;color:var(--gris);text-decoration:none}
.ca-nav a:hover{color:var(--tinta);background:rgba(20,17,17,.04)}
.ca-nav a.ca-nav-act{color:var(--tinta);background:#fff;border:1px solid var(--linea)}
.ca-creditos{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 12px 0 10px;border-radius:999px;background:#fff;border:1px solid var(--linea);font:600 13px 'Inter',sans-serif;color:var(--gris);text-decoration:none;white-space:nowrap}
.ca-creditos b{font:700 19px/1 'Antonio','Inter',sans-serif;color:var(--tinta)}
.ca-creditos-cero{border-color:var(--ambarF-borde);background:var(--ambar-bg);color:var(--ambar-txt)}
.ca-icobtn{appearance:none;flex:none;width:44px;height:44px;border-radius:999px;border:1px solid var(--linea);background:#fff;color:var(--tinta);display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ca-icobtn:hover{border-color:rgba(20,17,17,.2)}
.ca-demo{position:fixed;left:0;right:0;top:0;z-index:60;background:var(--tinta);color:var(--lima);font:800 9px/1 'Inter',sans-serif;letter-spacing:.16em;text-transform:uppercase;text-align:center;padding:3px 8px;pointer-events:none;opacity:.92}
/* tipografía */
.ca-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.ca-h1{font-size:42px;line-height:1.08;margin:6px 2px 0}
.ca-h2{font-size:30px;line-height:1.06;margin:0}
.ca-h3{font-size:24px;line-height:1.1;margin:0}
.ca-mark{background:var(--lima);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.ca-sub{font-size:15.5px;line-height:1.58;color:var(--gris);margin:10px 2px 0}
.ca-sub b,.ca-txt b{color:var(--tinta);font-weight:600}
.ca-txt{font-size:15px;line-height:1.58;color:var(--gris);margin:8px 0 0}
.ca-peq{font-size:13px;line-height:1.5;color:var(--gris2)}
.ca-hola{font-size:15px;color:var(--gris);margin:0 2px}
.ca-hola b{color:var(--tinta);font-weight:600}
.ca-eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.ca-eyebrow-verde{color:var(--verde-txt)}
.ca-eyebrow-gris{color:var(--gris)}
.ca-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.01em}
.ca-sec{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris);margin:30px 4px 10px}
/* tarjetas */
.ca-stack{margin-top:22px}
.ca-stack > * + *{margin-top:14px}
.ca-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:var(--sombra);position:relative;overflow:hidden}
.ca-pad{padding:22px 20px}
.ca-filete{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.ca-fila-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ca-crema{background:var(--crema);border:1px solid var(--linea);border-radius:16px;padding:14px}
.ca-sep{height:1px;background:var(--linea);margin:18px 0;border:0}
/* chips */
.ca-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;line-height:1}
.ca-chip-verde{background:rgba(177,209,62,.2);color:var(--verde-txt)}
.ca-chip-gris{background:var(--crema);color:var(--gris);border:1px solid var(--linea)}
.ca-chip-naranja{background:rgba(255,160,0,.16);color:#8a4b00}
.ca-chip-lima{background:var(--lima);color:var(--tinta)}
.ca-chip-tinta{background:var(--tinta);color:#fff}
.ca-chip-ambar{background:var(--ambarF-bg);color:var(--ambarF-txt);border:1px solid var(--ambarF-borde)}
.ca-punto{width:8px;height:8px;border-radius:999px;background:currentColor;flex:none}
/* botones */
.ca-btns{display:grid;gap:10px;margin-top:18px}
.ca-btns-2{grid-template-columns:1fr 1fr}
.ca-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none;text-align:center;transition:transform .12s ease,box-shadow .2s ease,background-color .2s ease,filter .2s ease,border-color .2s ease}
.ca-btn:active{transform:scale(.98)}
.ca-btn:disabled,.ca-btn[aria-disabled="true"]{opacity:.55;cursor:default;transform:none}
.ca-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.ca-btn-pri:hover{filter:brightness(1.04)}
.ca-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.ca-btn-sec:hover{border-color:rgba(20,17,17,.3)}
.ca-btn-tinta{background:var(--tinta);color:#fff;min-height:52px;font-size:15.5px}
.ca-btn-tinta:hover{filter:brightness(1.25)}
.ca-btn-ok{background:rgba(177,209,62,.22);color:var(--verde-txt);min-height:52px;font-size:15.5px}
.ca-btn-peq{min-height:44px;font-size:14px;padding:0 14px;border-radius:12px;width:auto}
.ca-btn-auto{width:auto}
.ca-link{appearance:none;background:none;border:0;cursor:pointer;min-height:44px;padding:0 2px;font:700 14px 'Inter',sans-serif;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.3);border-radius:8px;display:inline-flex;align-items:center;gap:6px}
.ca-link-gris{color:var(--gris)}
.ca-btn:focus-visible,.ca-link:focus-visible,.ca-opt:focus-visible,.ca-icobtn:focus-visible,.ca-copy:focus-visible,.ca-fila:focus-visible,.ca-faq-q:focus-visible,.ca-tab:focus-visible,.ca-input:focus-visible,.ca-obra:focus-visible,.ca-fab:focus-visible,.ca-paso-item:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.ca-copy{appearance:none;-webkit-tap-highlight-color:transparent;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;height:44px;padding:0 12px;border-radius:12px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font:700 13.5px 'Inter',sans-serif;cursor:pointer;text-decoration:none}
.ca-copy:hover{border-color:rgba(20,17,17,.3)}
.ca-copy-ok{background:rgba(177,209,62,.22);border-color:rgba(177,209,62,.6);color:var(--verde-txt)}
/* icono en baldosa */
.ca-ico-tile{flex:none;width:44px;height:44px;border-radius:14px;display:grid;place-items:center}
.ca-tile-verde{background:rgba(177,209,62,.2);color:var(--verde-txt)}
.ca-tile-naranja{background:rgba(255,160,0,.16);color:#8a4b00}
.ca-tile-crema{background:var(--crema);border:1px solid var(--linea);color:var(--tinta)}
.ca-tile-tinta{background:var(--tinta);color:#fff}
.ca-tile-ambar{background:#ffe9bd;color:#7a4b00}
/* avisos */
.ca-aviso{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:16px;font-size:14.5px;line-height:1.5}
.ca-aviso .ca-ico-tile{width:36px;height:36px;border-radius:12px}
.ca-aviso b{font-weight:700}
.ca-aviso > div{flex:1;min-width:0}
.ca-aviso-ambar{background:var(--ambar-bg);border:1px solid var(--ambar-borde);color:var(--ambar-txt)}
.ca-aviso-ambar .ca-ico-tile{background:#ffe9bd;color:#7a4b00}
.ca-aviso-fuerte{background:var(--ambarF-bg);border:1.5px solid var(--ambarF-borde);color:var(--ambarF-txt)}
.ca-aviso-fuerte .ca-ico-tile{background:#f9d488;color:#5a3a00}
.ca-aviso-ok{background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35);color:#3c5409}
.ca-aviso-ok .ca-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt)}
.ca-aviso-info{background:var(--crema);border:1px solid var(--linea);color:#3b3e45}
.ca-aviso-info .ca-ico-tile{background:#fff;border:1px solid var(--linea);color:var(--tinta)}
.ca-aviso ul{margin:6px 0 0;padding:0 0 0 18px}
/* formularios */
.ca-campo{display:block;margin-top:14px}
.ca-campo:first-child{margin-top:0}
.ca-label{display:block;font-size:13.5px;font-weight:700;color:var(--tinta);margin:0 2px 6px}
.ca-label small{font-weight:500;color:var(--gris2)}
.ca-input{display:block;width:100%;min-height:52px;padding:12px 14px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);
  font:500 16px/1.35 'Inter',sans-serif;text-transform:none!important;transition:border-color .15s ease,box-shadow .15s ease;-webkit-appearance:none;appearance:none}
.ca-input::placeholder{color:rgba(20,17,17,.38)!important}
.ca-input:focus{outline:none;border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.18)}
.ca-input-mayus{text-transform:uppercase!important;letter-spacing:.02em}
.ca-input[aria-invalid="true"]{border-color:var(--ambarF-borde);box-shadow:0 0 0 4px rgba(234,182,74,.18)}
textarea.ca-input{min-height:110px;resize:vertical}
select.ca-input{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23141111' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:44px}
.ca-sufijo{position:relative}
.ca-sufijo span{position:absolute;right:14px;top:50%;transform:translateY(-50%);font:600 14px 'Inter',sans-serif;color:var(--gris);pointer-events:none}
.ca-sufijo .ca-input{padding-right:56px}
.ca-ayuda{font-size:13px;line-height:1.5;color:var(--gris);margin:6px 2px 0}
.ca-error{font-size:13.5px;line-height:1.45;color:var(--ambarF-txt);background:var(--ambarF-bg);border:1px solid var(--ambarF-borde);border-radius:12px;padding:10px 12px;margin-top:12px}
.ca-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ca-grid2 .ca-campo{margin-top:0}
.ca-check{display:flex;gap:12px;align-items:flex-start;padding:12px 2px;cursor:pointer;font-size:14.5px;line-height:1.5;color:#3b3e45}
.ca-check input{flex:none;width:22px;height:22px;margin:1px 0 0;accent-color:var(--tinta)}
.ca-check a{color:var(--tinta);font-weight:600}
.ca-trampa{position:absolute!important;left:-10000px!important;width:1px;height:1px;overflow:hidden}
/* opciones (una pregunta) */
.ca-pregunta{font-size:28px;line-height:1.1;margin:0}
.ca-preg-ayuda{font-size:14.5px;line-height:1.55;color:var(--gris);margin:8px 0 0}
.ca-opts{display:grid;gap:10px;margin-top:18px}
.ca-opts-2{grid-template-columns:1fr 1fr}
.ca-opt{appearance:none;-webkit-tap-highlight-color:transparent;width:100%;display:flex;align-items:center;gap:14px;min-height:60px;padding:12px 14px 12px 16px;text-align:left;cursor:pointer;
  background:#fff;border:1.5px solid rgba(20,17,17,.12);border-radius:18px;color:var(--tinta);font:inherit;transition:border-color .15s ease,background-color .15s ease,transform .12s ease}
.ca-opt:hover{border-color:rgba(20,17,17,.3)}
.ca-opt:active{transform:scale(.985)}
.ca-opt b{display:block;font-size:15.5px;font-weight:700;line-height:1.3}
.ca-opt small{display:block;font-size:13px;color:var(--gris);margin-top:2px;line-height:1.4}
.ca-opt > span{flex:1;min-width:0}
.ca-opt > .ca-opt-marca,.ca-opt > .ca-opt-ico,.ca-opt > .ca-chip{flex:none}
.ca-opt-sel{border-color:var(--tinta);background:#fffdf5;box-shadow:0 0 0 3px rgba(255,160,0,.22)}
.ca-opt-marca{flex:none;width:24px;height:24px;border-radius:999px;border:2px solid rgba(20,17,17,.2);display:grid;place-items:center;color:#fff}
.ca-opt-cuad{border-radius:7px}
.ca-opt-sel .ca-opt-marca{background:var(--tinta);border-color:var(--tinta)}
.ca-opt-ico{flex:none;width:40px;height:40px;color:var(--tinta)}
.ca-opt-centro{justify-content:center;text-align:center;min-height:64px}
.ca-opt-centro b{font-size:17px}
.ca-opt-sug{margin-left:auto}
.ca-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.ca-chipbtn{appearance:none;min-height:44px;padding:0 16px;border-radius:999px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font:700 15px 'Inter',sans-serif;cursor:pointer}
.ca-chipbtn-sel{background:var(--tinta);color:#fff;border-color:var(--tinta)}
/* barra de avance */
.ca-barra{height:8px;border-radius:999px;background:#eeece8;overflow:hidden;position:relative}
.ca-barra i{position:absolute;left:0;top:0;bottom:0;background:var(--filete);border-radius:999px;transition:width .4s cubic-bezier(.2,.8,.2,1)}
.ca-avance{display:flex;align-items:baseline;gap:8px}
.ca-avance b{font:700 44px/1 'Antonio','Inter',sans-serif}
.ca-avance span{font-size:13.5px;color:var(--gris)}
/* pasos */
.ca-pasos{list-style:none;margin:0;padding:6px;background:#fff;border:1px solid var(--linea);border-radius:20px}
.ca-paso-item{appearance:none;width:100%;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 10px;border:0;background:none;border-radius:14px;cursor:pointer;text-align:left;font:inherit;color:var(--tinta)}
.ca-paso-item:hover{background:var(--crema)}
.ca-paso-item b{display:block;font-size:15px;font-weight:700;line-height:1.3}
.ca-paso-item small{display:block;font-size:12.5px;color:var(--gris);line-height:1.35;margin-top:1px}
.ca-paso-item > span:nth-child(2){flex:1;min-width:0}
.ca-paso-n{flex:none;width:30px;height:30px;border-radius:999px;display:grid;place-items:center;font-size:12.5px;font-weight:800;background:var(--crema);border:1px solid var(--linea);color:var(--tinta)}
.ca-paso-ok .ca-paso-n{background:rgba(177,209,62,.25);border-color:rgba(177,209,62,.5);color:var(--verde-txt)}
.ca-paso-falta .ca-paso-n{background:var(--ambarF-bg);border-color:var(--ambarF-borde);color:var(--ambarF-txt)}
.ca-paso-act{background:var(--crema)}
/* datos */
.ca-datos{background:#fff;border:1px solid var(--linea);border-radius:20px;overflow:hidden}
.ca-dato{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;min-height:56px}
.ca-dato + .ca-dato{border-top:1px solid var(--linea)}
.ca-dato > div{flex:1;min-width:0}
.ca-dato small{display:block;font-size:12.5px;color:var(--gris);line-height:1.35}
.ca-dato b{display:block;font-size:15px;font-weight:600;line-height:1.4;margin-top:1px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.ca-dl{margin:0}
.ca-dl > div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;font-size:14px;border-top:1px solid var(--linea)}
.ca-dl > div:first-child{border-top:0}
.ca-dl dt{color:var(--gris);flex:none;max-width:48%}
.ca-dl dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
/* filas que se tocan */
.ca-fila{appearance:none;width:100%;text-align:left;cursor:pointer;display:flex;align-items:center;gap:14px;padding:14px 14px 14px 16px;min-height:68px;background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:0 1px 2px rgba(20,17,17,.04);color:var(--tinta);font:inherit;text-decoration:none}
.ca-fila:hover{border-color:rgba(20,17,17,.18)}
.ca-fila b{display:block;font-size:15.5px;font-weight:700;line-height:1.3}
.ca-fila small{display:block;font-size:13px;color:var(--gris);margin-top:2px;line-height:1.4}
.ca-fila > span{flex:1;min-width:0}
.ca-fila > .ca-ico-tile{flex:none}
/* obras: tarjetas (móvil) y tabla (ordenador) */
.ca-obras{display:grid;gap:10px}
.ca-obra{appearance:none;width:100%;text-align:left;cursor:pointer;display:block;padding:16px;background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:0 1px 2px rgba(20,17,17,.04);color:var(--tinta);font:inherit;text-decoration:none}
.ca-obra:hover{border-color:rgba(20,17,17,.2)}
.ca-obra-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ca-obra b{display:block;font-size:16px;font-weight:700;line-height:1.3;margin-top:10px}
.ca-obra small{display:block;font-size:13.5px;color:var(--gris);line-height:1.4;margin-top:2px}
.ca-tabla-wrap{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:var(--sombra);overflow:hidden}
.ca-tabla{width:100%;border-collapse:collapse;font-size:14.5px}
.ca-tabla th{text-align:left;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);padding:14px 16px;border-bottom:1px solid var(--linea);background:#fcfbf9;white-space:nowrap}
.ca-tabla td{padding:14px 16px;border-top:1px solid var(--linea);vertical-align:middle}
.ca-tabla tr:first-child td{border-top:0}
.ca-tabla tbody tr{cursor:pointer}
.ca-tabla tbody tr:hover td{background:#fdfcfa}
.ca-tabla td.ca-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.ca-tabla .ca-trunc{max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* fotos */
.ca-slot{background:#fff;border:1px solid var(--linea);border-radius:20px;padding:14px}
.ca-slot + .ca-slot{margin-top:10px}
.ca-slot-top{display:flex;align-items:center;gap:12px}
.ca-slot-top > span{flex:1;min-width:0}
.ca-slot-top > .ca-cuenta,.ca-slot-top > .ca-ico-tile,.ca-slot-top > .ca-chip{flex:none}
.ca-slot-top b{display:block;font-size:15px;font-weight:700;line-height:1.3}
.ca-slot-top small{display:block;font-size:13px;color:var(--gris);line-height:1.4;margin-top:2px}
/* «Ahora no» en un apartado opcional, y el apartado ya plegado */
.ca-btn-ahora-no{grid-column:1/-1;background:transparent;color:var(--gris);border:1.5px dashed rgba(20,17,17,.18);min-height:40px;font-weight:600}
.ca-slot-omitido{background:transparent;border-style:dashed}
.ca-thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ca-thumb{position:relative;width:72px;height:72px;border-radius:12px;overflow:hidden;background:var(--crema);border:1px solid var(--linea);display:grid;place-items:center;color:var(--gris)}
.ca-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ca-txt-peq{font-size:13.5px}
.ca-fachada-sug-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.ca-fachada-sug-item{margin:0;border:1px solid var(--linea);border-radius:14px;overflow:hidden;background:var(--crema);display:flex;flex-direction:column}
.ca-fachada-sug-item img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
.ca-fachada-sug-item figcaption{font-size:12.5px;color:var(--gris);padding:6px 10px 0}
.ca-fachada-sug-item .ca-btn{margin:8px 10px 10px;width:auto}
.ca-thumb-x{position:absolute;top:3px;right:3px;width:26px;height:26px;border-radius:999px;border:0;background:rgba(20,17,17,.72);color:#fff;display:grid;place-items:center;cursor:pointer}
.ca-thumb-sub{border-style:dashed}
.ca-guia{border:1.5px solid var(--tinta)}
.ca-guia-n{font:700 15px 'Inter',sans-serif;color:var(--gris)}
.ca-cuenta{font:700 13px 'Inter',sans-serif;color:var(--verde-txt);white-space:nowrap}
.ca-cuenta-0{color:var(--gris2)}
.ca-subiendo{height:6px;border-radius:999px;background:#eeece8;overflow:hidden;margin-top:12px}
.ca-subiendo i{display:block;height:100%;background:var(--filete);transition:width .2s ease}
.ca-input-fichero{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
/* historial */
.ca-hist{list-style:none;margin:0;padding:0}
.ca-hist li{position:relative;padding:0 0 16px 26px;font-size:14px;line-height:1.5;color:#3b3e45}
.ca-hist li:before{content:'';position:absolute;left:6px;top:6px;width:9px;height:9px;border-radius:999px;background:var(--naranja)}
.ca-hist li:after{content:'';position:absolute;left:10px;top:18px;bottom:0;width:1px;background:var(--linea)}
.ca-hist li:last-child:after{display:none}
.ca-hist small{display:block;font-size:12.5px;color:var(--gris2)}
/* descargas */
.ca-calif{display:flex;flex-wrap:wrap;gap:8px 18px;margin:12px 0 0;font-size:14px;color:var(--gris)}
.ca-calif > span{display:inline-flex;align-items:center;gap:8px}
.ca-letra{display:inline-flex;align-items:center;justify-content:center;width:30px;height:26px;border-radius:7px 14px 14px 7px;font:900 15px/1 'Inter',sans-serif;color:#fff}
.ca-letra-A{background:#00a651}.ca-letra-B{background:#4cb848}.ca-letra-C{background:#bfd730;color:var(--tinta)}.ca-letra-D{background:#fff200;color:var(--tinta)}
.ca-letra-E{background:#fdb913;color:var(--tinta)}.ca-letra-F{background:#f37021}.ca-letra-G{background:#ed1c24}
.ca-descargas{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}
.ca-desc{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:6px;min-height:76px;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);color:var(--tinta);text-decoration:none;font:700 14.5px/1.2 'Inter',sans-serif}
.ca-desc small{font:500 12px 'Inter',sans-serif;color:var(--gris)}
.ca-desc:hover{background:#fff;border-color:rgba(20,17,17,.22)}
.ca-desc-no{opacity:.55;pointer-events:none;border-style:dashed}
/* documentos de la obra (obra/Documentos.jsx) */
.ca-docs{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.ca-doc{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border:1px solid var(--linea);border-radius:18px;background:#fff}
.ca-doc > .ca-ico-tile{flex:none}
.ca-doc-txt{flex:1;min-width:0}
.ca-doc-txt b{display:block;font-size:15px;font-weight:700;line-height:1.3}
.ca-doc-txt small{display:block;font-size:12.5px;color:var(--gris);line-height:1.4;overflow-wrap:anywhere}
.ca-doc-acc{flex:none;display:flex;gap:6px;align-items:center}
.ca-doc-acc .ca-btn{width:auto;min-height:40px;padding:0 14px;font-size:14px}
.ca-doc-chip{display:inline-flex;margin-top:4px}
.ca-docs-sub{font:700 12px 'Inter',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--gris2);margin:18px 0 0}
.ca-docs-mas{appearance:none;background:none;border:0;padding:0;margin-top:14px;font:600 14px 'Inter',sans-serif;color:var(--tinta);cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:underline;text-underline-offset:3px}
.ca-docs-old .ca-doc{background:var(--crema);padding:10px 10px 10px 12px}
@media (max-width:480px){.ca-doc{flex-wrap:wrap}.ca-doc-acc{width:100%;justify-content:flex-end}}
.ca-soltar{margin-top:10px;border:1.5px dashed rgba(20,17,17,.22);border-radius:18px;background:#fff;transition:border-color .15s,background .15s}
.ca-soltar-sobre{border-color:var(--naranja);background:#fff8ec}
.ca-soltar-ocupado{opacity:.75}
.ca-soltar-boton{appearance:none;width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;background:none;border:0;cursor:pointer;text-align:left;font:inherit;color:var(--tinta)}
.ca-soltar-boton > span:last-child{display:flex;flex-direction:column;gap:2px;min-width:0}
.ca-soltar-boton small{color:var(--gris);font-size:13px}
.ca-soltar-par{display:grid;grid-template-columns:1fr;gap:0 10px}
@media (min-width:720px){.ca-soltar-par{grid-template-columns:1fr 1fr}}
.ca-soltar-nombre{display:block;padding:0 16px 14px}
.ca-pres-avisos{margin:4px 0 0;padding-left:18px}
.ca-pres-avisos li{margin-bottom:4px}
.ca-pres-ap .ca-sec{margin-top:0}
.ca-pres-instr{margin:4px 0;font-size:14px;color:#3b3e45}
.ca-pres-campos{list-style:none;margin:8px 0 0;padding:0;border:1px solid var(--linea);border-radius:16px;overflow:hidden;background:#fff}
.ca-pres-campo{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 14px;min-height:46px}
.ca-pres-campo + .ca-pres-campo{border-top:1px solid var(--linea)}
.ca-pres-k{flex:0 0 38%;font-size:12.5px;color:var(--gris)}
.ca-pres-v{flex:1;min-width:0;font-weight:600;font-size:14.5px;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:2px}
.ca-pres-v small{font-weight:400;font-size:12.5px;color:var(--gris)}
.ca-pres-vacio .ca-pres-v{color:var(--gris2);font-weight:400}
.ca-pres-campo .ca-icobtn{width:38px;height:38px}
.ca-pres-campo span.ca-icobtn{visibility:hidden}
.ca-pres-fin{background:var(--crema);border:1px solid var(--linea);border-radius:16px;padding:14px}
@media (max-width:480px){.ca-pres-campo{flex-wrap:wrap}.ca-pres-k{flex-basis:100%;padding-top:4px}}
.ca-fila-top-der{display:flex;align-items:center;gap:10px}
.ca-btn-fotos{width:auto;min-height:36px;padding:0 12px;font-size:13.5px}
/* índice «Ir a…» fijo bajo la barra (obra/IndiceSecciones.jsx) */
.ca-indice{position:sticky;z-index:30;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-left:-16px;margin-right:-16px;padding:8px 16px;background:rgba(250,249,247,.92);-webkit-backdrop-filter:saturate(1.4) blur(10px);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--linea)}
.ca-indice::-webkit-scrollbar{display:none}
.ca-indice-chip{flex:none;appearance:none;min-height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(20,17,17,.12);background:#fff;color:var(--tinta);font:600 13.5px 'Inter',sans-serif;display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.ca-indice-chip small{font:700 11px 'Inter',sans-serif;color:var(--gris2)}
.ca-indice-hecho svg{color:var(--verde-txt)}
.ca-indice-act{background:var(--tinta);color:#fff;border-color:var(--tinta)}
.ca-indice-act small{color:rgba(255,255,255,.7)}
.ca-indice-act.ca-indice-hecho svg{color:var(--lima)}
/* visor de PDF (pantalla completa) */
.ca-visor{position:fixed;inset:0;z-index:9100;background:#3a3735;display:flex;flex-direction:column;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--tinta);animation:ca-fade .15s ease both}
.ca-visor-cab{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 12px;background:var(--crema);border-bottom:1px solid var(--linea)}
.ca-visor-cab .ca-icobtn,.ca-visor-buscar .ca-icobtn{width:38px;height:38px}
.ca-icobtn-act{background:var(--tinta);color:#fff;border-color:var(--tinta)}
.ca-visor-tit{flex:1 1 160px}
.ca-visor-tit b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ca-visor-tit small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ca-visor-herr{display:flex;align-items:center;gap:14px}
.ca-visor-grupo{display:flex;align-items:center;gap:4px}
.ca-visor-pag{display:flex;align-items:center;gap:6px;font:600 13px 'Inter',sans-serif;color:var(--gris);white-space:nowrap}
.ca-visor-pag input{width:46px;height:34px;border:1px solid var(--linea);border-radius:10px;background:#fff;text-align:center;font:700 14px 'Inter',sans-serif;color:var(--tinta)}
.ca-visor-escala{height:34px;border:1px solid var(--linea);border-radius:10px;background:#fff;padding:0 8px;font:600 13px 'Inter',sans-serif;color:var(--tinta);max-width:150px}
.ca-visor-buscar{flex:none;display:flex;align-items:center;gap:6px;padding:6px 12px;background:#fff;border-bottom:1px solid var(--linea);color:var(--gris)}
.ca-visor-buscar input{flex:1;min-width:0;height:38px;border:0;outline:none;background:transparent;font:500 16px 'Inter',sans-serif;color:var(--tinta)}
.ca-visor-cuenta{font:600 12.5px 'Inter',sans-serif;white-space:nowrap}
.ca-visor-main{flex:1;min-height:0;display:flex}
.ca-visor-mini{flex:none;width:148px;overflow-y:auto;overscroll-behavior:contain;background:#2e2c2a;padding:12px 0;display:flex;flex-direction:column;align-items:center;gap:12px}
.ca-visor-mini button{appearance:none;background:none;border:0;padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;color:#cfc9c1;font:600 11.5px 'Inter',sans-serif}
.ca-visor-mini canvas{display:block;width:104px;min-height:60px;background:#fff;border:3px solid transparent;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.ca-visor-mini .ca-mini-act canvas{border-color:var(--lima)}
.ca-visor-mini .ca-mini-act{color:#fff}
.ca-visor-lienzo{position:relative;flex:1;min-width:0}
.ca-visor-cuerpo{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain}
.ca-visor .pdfViewer{padding:16px 0 24px}
.ca-visor .pdfViewer.removePageBorders .page{margin:0 auto 14px;box-shadow:0 6px 24px -8px rgba(0,0,0,.55)}
.ca-visor .textLayer .highlight{--highlight-bg-color:rgba(255,196,0,.5);--highlight-selected-bg-color:rgba(255,106,0,.6)}
.ca-visor input,.ca-visor select{text-transform:none!important}
.ca-visor-buscar input::-webkit-search-cancel-button{display:none}
.ca-visor-estado{position:absolute;inset:0;margin:auto;height:max-content;color:#f1eee9;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;max-width:420px;padding:0 16px}
@media (max-width:699px){
  .ca-visor-solo-pc{display:none}
  .ca-visor-herr{order:3;width:100%;justify-content:space-between;gap:6px}
  .ca-visor-escala{max-width:132px}
  /* iOS amplía la página al enfocar un campo de menos de 16 px. */
  .ca-visor-pag input,.ca-visor-escala{font-size:16px}
  .ca-visor-zoom-btn{display:none}
  .ca-visor-pie .ca-btn{flex:1 1 auto;padding:0 12px}
}
.ca-visor-pie{flex:none;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;align-items:center;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--crema);border-top:1px solid var(--linea)}
.ca-visor-pie .ca-btn{width:auto;min-height:44px;padding:0 18px}
.ca-visor-pie p{flex:1 1 220px;margin:0;font-size:13px;color:var(--gris)}
/* hoja (ventana) */
.ca-capa{position:fixed;inset:0;z-index:9000;background:rgba(20,17,17,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;animation:ca-fade .2s ease both;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--tinta);font-size:15px;line-height:1.55}
.ca-sheet{outline:none;width:100%;max-height:92vh;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;background:var(--crema);color:var(--tinta);border-radius:24px 24px 0 0;box-shadow:0 -10px 40px -10px rgba(20,17,17,.25);animation:ca-sube .32s cubic-bezier(.2,.8,.2,1) both;padding-bottom:env(safe-area-inset-bottom)}
.ca-sheet-head{position:sticky;top:0;z-index:2;background:var(--crema);padding:10px 16px 12px 20px;border-bottom:1px solid var(--linea)}
.ca-asa{width:40px;height:5px;border-radius:999px;background:rgba(20,17,17,.16);margin:0 auto 10px}
.ca-sheet-tit{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ca-sheet-tit h2{font-size:26px;line-height:1.05;margin:0}
.ca-sheet-body{padding:18px 16px 28px}
.ca-sheet-body > * + *{margin-top:14px}
.ca-sheet-pie{position:sticky;bottom:0;background:var(--crema);padding:12px 16px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--linea)}
/* barra inferior fija (móvil) */
.ca-inf{position:fixed;left:0;right:0;bottom:0;z-index:45;background:rgba(250,249,247,.94);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-top:1px solid var(--linea);padding:10px 16px calc(10px + env(safe-area-inset-bottom))}
.ca-inf-in{max-width:480px;margin:0 auto;display:flex;gap:10px}
.ca-inf .ca-btn{min-height:54px}
.ca-inf .ca-btn-sec{flex:0 0 auto;width:auto;padding:0 18px}
/* Con el teclado abierto (móvil), la barra de abajo y los flotantes se quitan: en
   iOS se quedan encima del teclado y tapan el campo que se está escribiendo. */
@media (pointer:coarse){
  .ca-col:has(.ca-input:focus) > .ca-inf,body:has(.ca-input:focus) .ca-fabs{display:none}
}
/* botones flotantes */
.ca-fabs{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom) + var(--ca-inf));z-index:50;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:'Inter',sans-serif}
.ca-fab{appearance:none;-webkit-tap-highlight-color:transparent;display:inline-flex;align-items:center;gap:8px;height:52px;min-width:52px;padding:0 16px;border-radius:999px;border:1px solid var(--linea);background:#fff;color:var(--tinta);font:700 14px 'Inter',sans-serif;cursor:pointer;box-shadow:0 10px 28px -12px rgba(20,17,17,.35)}
.ca-fab-tinta{background:var(--tinta);color:#fff;border-color:var(--tinta)}
.ca-fab-peq{height:44px;min-width:44px;padding:0 12px;font-size:13px}
.ca-fab-solo{padding:0;width:52px;justify-content:center}
.ca-fab-peq.ca-fab-solo{width:44px}
/* chat del asistente */
.ca-chat{display:flex;flex-direction:column;gap:10px}
.ca-msg{max-width:88%;padding:11px 14px;border-radius:18px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.ca-msg-yo{align-self:flex-end;background:var(--tinta);color:#fff;border-bottom-right-radius:6px}
.ca-msg-ia{align-self:flex-start;background:#fff;border:1px solid var(--linea);border-bottom-left-radius:6px}
/* pestañas (admin) */
.ca-tabs{display:flex;gap:6px;overflow-x:auto;padding:4px;background:#fff;border:1px solid var(--linea);border-radius:16px;scrollbar-width:none}
.ca-tabs::-webkit-scrollbar{display:none}
.ca-tab{appearance:none;flex:none;min-height:44px;padding:0 14px;border-radius:12px;border:0;background:none;color:var(--gris);font:700 14px 'Inter',sans-serif;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:8px}
.ca-tab-act{background:var(--tinta);color:#fff}
.ca-tab .ca-badge{min-width:22px;height:22px;padding:0 6px;border-radius:999px;display:inline-grid;place-items:center;font-size:11.5px;font-weight:800;background:var(--naranja);color:#08090c}
.ca-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.ca-kpi{background:#fff;border:1px solid var(--linea);border-radius:18px;padding:14px 16px}
.ca-kpi span{display:block;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris)}
.ca-kpi b{display:block;font:700 34px/1.05 'Antonio','Inter',sans-serif;margin-top:4px}
/* landing */
.ca-hero{padding-top:8px}
.ca-pasos3{list-style:none;margin:0;padding:6px 16px;background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:var(--sombra)}
.ca-pasos3 li{display:flex;gap:14px;align-items:flex-start;padding:16px 0}
.ca-pasos3 li + li{border-top:1px solid var(--linea)}
.ca-pasos3 b{display:block;font-size:16px;font-weight:700;line-height:1.3}
.ca-pasos3 p{margin:4px 0 0;font-size:14.5px;line-height:1.55;color:var(--gris)}
.ca-num3{flex:none;width:34px;height:34px;border-radius:999px;display:grid;place-items:center;background:var(--crema);border:1px solid var(--linea);font:700 18px/1 'Antonio','Inter',sans-serif}
.ca-lista{list-style:none;margin:14px 0 0;padding:0}
.ca-lista li{display:flex;gap:12px;align-items:flex-start;padding:8px 0;font-size:14.5px;line-height:1.5;color:#3b3e45}
.ca-lista li svg{flex:none;margin-top:2px;color:var(--verde-txt)}
.ca-lista b{color:var(--tinta)}
.ca-para{display:grid;gap:10px}
.ca-faq{background:#fff;border:1px solid var(--linea);border-radius:18px;overflow:hidden}
.ca-faq + .ca-faq{margin-top:10px}
.ca-faq-q{appearance:none;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;padding:12px 14px 12px 16px;background:none;border:0;cursor:pointer;text-align:left;font:600 15.5px/1.35 'Inter',sans-serif;color:var(--tinta)}
.ca-faq-q svg{flex:none;transition:transform .2s ease;color:var(--gris)}
.ca-faq-abierta .ca-faq-q svg{transform:rotate(180deg)}
.ca-faq-a{padding:0 16px 16px;font-size:14.5px;line-height:1.6;color:#3b3e45}
/* check que se dibuja */
.ca-check-ok{flex:none;width:64px;height:64px}
.ca-check-ok circle{fill:rgba(177,209,62,.16);stroke:var(--verde);stroke-width:3;stroke-dasharray:102;stroke-dashoffset:102;animation:ca-draw .6s cubic-bezier(.65,0,.45,1) .1s forwards;transform:rotate(-90deg);transform-origin:center}
.ca-check-ok path{fill:none;stroke:var(--verde-txt);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:ca-draw .38s cubic-bezier(.65,0,.45,1) .62s forwards}
.ca-check-ok svg{display:block;animation:ca-pop .45s cubic-bezier(.2,1.4,.4,1) .55s both}
/* firma y pie */
.ca-firma{display:flex;align-items:center;gap:14px;margin:30px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.ca-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.ca-firma b{display:block;font-size:15px;font-weight:700}
.ca-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.ca-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
.ca-pie a{color:inherit}
/* aviso flotante */
.ca-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom) + var(--ca-inf));transform:translateX(-50%);z-index:10200;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:12px 16px;border-radius:14px;background:var(--tinta);color:#fff;font:600 14px/1.35 'Inter',sans-serif;box-shadow:0 12px 30px -10px rgba(20,17,17,.5);animation:ca-toast .25s cubic-bezier(.2,.8,.2,1) both}
.ca-toast svg{flex:none;color:var(--lima)}
/* esqueleto y movimiento */
.ca-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:ca-shim 1.3s linear infinite;border-radius:24px}
.ca-spin{animation:ca-rot .8s linear infinite}
.ca-in{animation:ca-up .55s cubic-bezier(.2,.8,.2,1) both}
.ca-in-2{animation-delay:.06s}.ca-in-3{animation-delay:.12s}.ca-in-4{animation-delay:.18s}
.ca-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.ca-guardado{display:inline-flex;align-items:center;gap:6px;font:600 12.5px 'Inter',sans-serif;color:var(--gris2);white-space:nowrap}
.ca-guardado-error{color:var(--ambarF-txt)}
@keyframes ca-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes ca-sube{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes ca-fade{from{opacity:0}to{opacity:1}}
@keyframes ca-toast{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes ca-shim{to{background-position:-200% 0}}
@keyframes ca-rot{to{transform:rotate(360deg)}}
@keyframes ca-draw{to{stroke-dashoffset:0}}
@keyframes ca-pop{from{transform:scale(.85)}to{transform:none}}
/* ficha de la obra: preguntas */
.ca-preg + .ca-preg{margin-top:0}
.ca-preg-tit{font:700 16.5px/1.35 'Inter',sans-serif;margin:0;color:var(--tinta)}
.ca-opcional{font-weight:500;font-size:13px;color:var(--gris2)}
.ca-q{padding-bottom:calc(220px + env(safe-area-inset-bottom))}
.ca-con-fabs{padding-bottom:calc(120px + env(safe-area-inset-bottom))}
.ca-q-top{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.ca-q-cuerpo{min-height:40vh}
.ca-ficha-cab{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:4px 2px 22px}
.ca-paso-card{scroll-margin-top:84px;transition:box-shadow .3s ease,border-color .3s ease}
.ca-resaltado{border-color:var(--naranja);box-shadow:0 0 0 4px rgba(255,160,0,.18)}
.ca-paso-cab{display:flex;align-items:center;gap:12px}
.ca-paso-cab small{display:block;margin-top:2px}
.ca-resumen summary{cursor:pointer;font:700 14px 'Inter',sans-serif;list-style:none;display:flex;justify-content:space-between;align-items:center}
.ca-resumen summary::-webkit-details-marker{display:none}
.ca-resumen summary:after{content:'+';font-size:18px;color:var(--gris)}
.ca-resumen[open] summary:after{content:'–'}
.ca-barrido{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.ca-barrido .ca-aviso{margin:0}
.ca-barrido .ca-link{display:inline-flex;align-items:center;gap:2px;margin-top:6px;font-size:14px}
.ca-barrido span{display:block}
/* fotos */
.ca-btn-off{opacity:.6;pointer-events:none}
.ca-thumb-ver{position:absolute;inset:0}
.ca-equipo{display:grid;gap:10px}
.ca-equipo .ca-slot + .ca-slot{margin-top:0}
.ca-decision{background:var(--crema);border:1px dashed rgba(20,17,17,.18);border-radius:16px;padding:12px 14px}
.ca-enlace{font-size:12.5px;word-break:break-all;background:var(--crema);border:1px solid var(--linea);border-radius:12px;padding:8px 10px;margin:0}
/* nueva obra */
.ca-sugerencias{list-style:none;margin:-6px 0 12px;padding:6px;background:#fff;border:1px solid var(--linea);border-radius:16px;box-shadow:var(--sombra)}
.ca-sugerencias button{appearance:none;width:100%;text-align:left;min-height:46px;padding:10px 12px;border:0;background:none;border-radius:10px;font:500 14.5px/1.35 'Inter',sans-serif;color:var(--tinta);cursor:pointer}
.ca-sugerencias button:hover,.ca-sugerencias button:focus-visible{background:var(--crema)}
/* panel */
.ca-panel-cab{display:grid;gap:12px}
.ca-cifra{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.ca-cifra b{font:700 64px/0.95 'Antonio','Inter',sans-serif;letter-spacing:-.01em}
.ca-cifra span{font-size:14.5px;color:var(--gris);font-weight:600}
.ca-vacio{text-align:left}
.ca-tabla-enlace{color:inherit;text-decoration:none}
.ca-tabla-scroll{overflow-x:auto}
.ca-creditos-ed{display:inline-flex;align-items:center;gap:6px}
.ca-creditos-ed .ca-icobtn{width:34px;height:34px}
.ca-creditos-ed b{min-width:24px;text-align:center;font:700 18px 'Antonio','Inter',sans-serif}
.ca-admin-slot{padding:12px 0;border-top:1px solid var(--linea)}
.ca-admin-slot:first-of-type{border-top:0}
/* incidencias (lo que nos cuenta el certificador y lo que le respondemos) */
.ca-inc-lista{display:grid;gap:10px}
.ca-inc{background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:0 1px 2px rgba(20,17,17,.04);padding:16px;scroll-margin-top:84px;transition:box-shadow .3s ease,border-color .3s ease}
.ca-inc.ca-resaltado{border-color:var(--naranja);box-shadow:0 0 0 4px rgba(255,160,0,.18)}
.ca-inc-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ca-inc-txt{margin:10px 0 0;font-size:15px;line-height:1.55;color:var(--tinta);white-space:pre-wrap;overflow-wrap:anywhere}
.ca-inc-meta{margin:4px 0 0;font-size:13px;line-height:1.5;color:var(--gris);display:flex;align-items:center;flex-wrap:wrap;gap:0 6px}
.ca-inc-obra{font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700}
.ca-inc-resp{margin-top:12px;padding:12px 14px;border-radius:16px;background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35)}
.ca-inc-resp .ca-eyebrow{margin:0}
.ca-inc-resp-txt{margin:6px 0 0;font-size:14.5px;line-height:1.55;color:#2f3a12;white-space:pre-wrap;overflow-wrap:anywhere}
.ca-inc-espera{margin:10px 0 0}
/* mis gastos (certificados que entran y salen) */
.ca-gastos-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px}
.ca-gastos-kpis .ca-kpi{padding:12px;border-radius:16px;min-width:0}
.ca-gastos-kpis .ca-kpi span{font-size:10.5px;letter-spacing:.09em;line-height:1.25}
.ca-gastos-kpis .ca-kpi b{font-size:28px;white-space:nowrap}
.ca-gastos-comprar{margin-top:12px;background:var(--crema);border-style:dashed}
.ca-gastos-comprar .ca-fila-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ca-mov-lista{list-style:none;margin:0;padding:4px 16px}
.ca-mov{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 0;border-top:1px solid var(--linea)}
.ca-mov:first-child{border-top:0}
.ca-mov-txt{min-width:0;display:grid;gap:3px}
.ca-mov-txt b{font-size:15px;line-height:1.35;color:var(--tinta);overflow-wrap:anywhere}
.ca-mov-meta{font-size:13px;line-height:1.45;color:var(--gris);overflow-wrap:anywhere}
.ca-mov-obra{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;color:var(--tinta)}
.ca-mov-num{flex:none;text-align:right;display:grid;gap:2px}
.ca-mov-num b{font:700 26px/1 'Antonio','Inter',sans-serif}
.ca-mov-num small{font-size:12px;color:var(--gris);white-space:nowrap}
.ca-mov-mas{color:var(--verde-txt)}
.ca-mov-menos{color:var(--tinta)}
/* móvil */
@media (max-width:767px){
  .ca-solo-pc{display:none!important}
  .ca-nav{display:none}
  .ca-marca-txt{display:none}
  .ca-head .ca-marca-txt{display:inline-flex;height:22px;padding:0 9px 0 7px;font-size:9.5px;letter-spacing:.08em}
}
@media (max-width:360px){.ca-h1{font-size:35px}.ca-h2{font-size:27px}.ca-pregunta{font-size:25px}.ca-avance b{font-size:38px}.ca-btns-2{grid-template-columns:1fr}}
/* ordenador */
@media (min-width:640px){
  .ca-capa{align-items:center;padding:24px}
  .ca-sheet{max-width:600px;border-radius:24px;max-height:88vh}
  .ca-sheet-body{padding:20px 24px 28px}
  .ca-sheet-head{padding:16px 18px 14px 24px}
  .ca-asa{display:none}
  .ca-sheet-pie{padding:14px 24px 18px}
}
@media (min-width:768px){
  .ca-solo-movil{display:none!important}
  .ca-col{max-width:560px;padding-top:40px}
  .ca-pad{padding:26px}
  .ca-h1{font-size:50px}
  .ca-kpis{grid-template-columns:repeat(4,1fr)}
  .ca-opts-pc2{grid-template-columns:1fr 1fr}
}
@media (min-width:1024px){
  .ca-panel-cab{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:start}
  .ca-ficha{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}
  .ca-lateral{position:sticky;top:84px}
}
/* landing a lo ancho (publico/Landing.jsx): en el móvil, la columna de siempre;
   desde 1024 px, portada a dos columnas con la maqueta y secciones en rejilla */
.ca-land-nav{display:flex;align-items:center;gap:14px}
.ca-land-nota{margin:12px 4px 0;text-align:center}
.ca-land-cta{margin-top:24px}
.ca-land-legal{margin:28px 4px 0;line-height:1.6;color:var(--gris2)}
/* el vídeo promo (9:16), en la portada: debajo del titular en el móvil, a su derecha en el PC */
.ca-land-vid{position:relative;z-index:0;margin:30px auto 6px;width:min(100%,300px)}
.ca-land-vid-fondo{position:absolute;inset:22px -16px -12px 26px;z-index:-1;border-radius:34px;background:linear-gradient(150deg,rgba(255,160,0,.22),rgba(238,228,117,.24) 50%,rgba(181,207,56,.26));transform:rotate(4deg)}
.ca-land-vid video{display:block;width:100%;height:auto;aspect-ratio:9/16;border-radius:28px;background:var(--crema);border:1px solid var(--linea);box-shadow:0 1px 2px rgba(20,17,17,.04),0 34px 70px -30px rgba(20,17,17,.4)}
/* «Activar sonido», DEBAJO del vídeo: encima tapaba la pantalla del móvil (Fran, 26/10) */
.ca-land-vid-sonido{position:relative;z-index:1;display:flex;align-items:center;gap:8px;width:fit-content;min-height:44px;margin:18px auto 0;padding:0 18px 0 15px;border:1px solid var(--linea);border-radius:999px;background:#fff;color:var(--tinta);font:600 15px/1 'Inter',sans-serif;white-space:nowrap;cursor:pointer;box-shadow:0 1px 2px rgba(20,17,17,.05),0 10px 24px -14px rgba(20,17,17,.35)}
.ca-land-vid-sonido.ca-on{background:var(--tinta);color:#fff;border-color:transparent}
.ca-land-vid-sonido:focus-visible{outline:3px solid var(--naranja);outline-offset:3px}
/* la palabra en lima, por DEBAJO del texto: si no, su fondo tapa los rabos de la línea de arriba («preparado») */
.ca-hero .ca-mark{position:relative;z-index:-1}
@media (max-width:1023px){.ca-solo-ancho{display:none!important}}
@media (min-width:1024px) and (max-width:1199px){
  .ca-land-hero{gap:44px!important}
  .ca-land .ca-pasos4{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}
@media (min-width:1024px){
  .ca-con-land .ca-halo{height:900px;background:radial-gradient(42% 55% at 80% 26%,rgba(199,246,1,.16),transparent 70%),radial-gradient(48% 50% at 18% 0%,rgba(255,160,0,.13),transparent 70%)}
  .ca-land{max-width:1200px;padding:22px 40px 56px}
  .ca-land .ca-head{margin:4px 0 0}
  .ca-land .ca-logo{height:30px}
  .ca-land-nav{gap:22px}
  .ca-land-nav .ca-btn-peq{min-height:42px;padding:0 18px}
  .ca-land-hero{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr);gap:72px;align-items:center;padding:64px 0 56px}
  .ca-land .ca-hero{padding-top:0}
  .ca-land .ca-h1{font-size:clamp(60px,5.6vw,80px);line-height:1.06;letter-spacing:-.01em;margin:16px 0 0}
  .ca-land .ca-hero .ca-sub{font-size:18px;line-height:1.62;max-width:34em;margin:24px 0 0}
  .ca-land .ca-hero .ca-btns{grid-auto-flow:column;justify-content:start;gap:12px;margin-top:32px}
  .ca-land .ca-hero .ca-btn{width:auto;padding:0 28px}
  .ca-land-nota{text-align:left;margin:16px 2px 0}
  .ca-land-vid{margin:0 auto;width:min(100%,360px)}
  .ca-land-vid video{border-radius:32px}
  /* lo que es, en una línea */
  .ca-land-hechos{list-style:none;margin:0;padding:20px 0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--linea);border-bottom:1px solid var(--linea)}
  .ca-land-hechos li{display:flex;gap:12px;align-items:flex-start;padding:2px 22px}
  .ca-land-hechos li:first-child{padding-left:4px}
  .ca-land-hechos li + li{border-left:1px solid var(--linea)}
  .ca-land-hechos svg{flex:none;margin-top:2px;color:var(--naranja-txt)}
  .ca-land-hechos span{font-size:13px;line-height:1.45;color:var(--gris)}
  .ca-land-hechos b{display:block;font-size:14.5px;color:var(--tinta)}
  /* cabecera de cada sección */
  .ca-land-cab{margin:96px 0 28px}
  .ca-land-cab .ca-sec{margin:0 2px 12px}
  .ca-land-h2{font-size:46px;line-height:1.04;margin:0;max-width:15em}
  /* cómo funciona: cuatro tarjetas */
  .ca-land .ca-pasos3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:0;background:none;border:0;box-shadow:none}
  .ca-land .ca-pasos4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .ca-land .ca-pasos3 li{position:relative;flex-direction:column;gap:20px;padding:28px 28px 30px;background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:var(--sombra)}
  .ca-land .ca-pasos3 li + li{border-top:1px solid var(--linea)}
  .ca-land .ca-num3{width:auto;height:auto;display:block;background:none;border:0;font-size:64px;line-height:.85}
  .ca-land .ca-pasos3 li > .ca-ico-tile{position:absolute;top:26px;right:26px}
  .ca-land .ca-pasos3 b{font-size:19px}
  .ca-land .ca-pasos3 p{font-size:15px;line-height:1.6;margin-top:8px}
  /* entrega y para quién, lado a lado */
  .ca-land-dos{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:40px;align-items:start}
  .ca-land-entrega{padding:30px 30px 26px}
  .ca-land-entrega .ca-lista li{font-size:15.5px;padding:12px 0}
  .ca-land-entrega .ca-lista li + li{border-top:1px solid var(--linea)}
  .ca-land .ca-para .ca-fila{min-height:78px;padding:16px 20px}
  /* dudas: título fijo a la izquierda */
  .ca-land-faq{display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:56px;align-items:start;margin-top:96px}
  .ca-land-faq > .ca-land-cab{margin:0;position:sticky;top:32px}
  .ca-land .ca-faq-q{min-height:64px;padding:16px 18px 16px 22px;font-size:16.5px}
  .ca-land .ca-faq-a{padding:0 22px 20px;font-size:15px}
  /* llamada final */
  .ca-land-cta{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:48px;align-items:center;margin-top:96px;padding:46px 50px}
  .ca-land-cta .ca-h2{font-size:52px}
  .ca-land-cta .ca-txt{font-size:16.5px;max-width:36em;margin-top:12px}
  .ca-land-cta .ca-btns{margin-top:0}
  .ca-land-cta .ca-btn{width:auto;min-height:60px;padding:0 32px}
  /* firma y pie en una fila */
  .ca-land > footer{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:56px;padding-top:24px;border-top:1px solid var(--linea)}
  .ca-land .ca-firma{margin:0;padding:0;border:0}
  .ca-land .ca-pie{margin:0}
}
/* la ficha por fases (obra/Fases.jsx) */
.ca-col-fases{position:relative;z-index:1;max-width:760px;margin:0 auto;padding:18px 16px calc(48px + env(safe-area-inset-bottom) + var(--ca-inf))}
.ca-col-fases > * + *,.ca-col > .ca-fase-plegada,.ca-col > .ca-fase{margin-top:12px}
.ca-fases-barra{list-style:none;margin:16px 0 0;padding:0;display:flex;gap:6px}
.ca-fases-barra li{flex:1;min-width:0}
.ca-fases-barra button{appearance:none;width:100%;border:0;background:none;padding:6px 0;cursor:pointer;display:flex;flex-direction:column;gap:6px;align-items:stretch;text-align:left;font:600 11.5px/1.25 'Inter',sans-serif;color:var(--gris2)}
.ca-fases-barra i{display:block;height:6px;border-radius:999px;background:#eeece8}
.ca-fases-barra .ca-fb-hecha i{background:var(--verde)}
.ca-fases-barra .ca-fb-act i{background:var(--naranja)}
.ca-fases-barra .ca-fb-act button{color:var(--tinta)}
.ca-fases-barra span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ca-fases-barra button:focus-visible{outline:3px solid var(--tinta);outline-offset:2px;border-radius:6px}
.ca-fase-plegada{appearance:none;width:100%;display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 16px;border:1px solid var(--linea);background:#fff;border-radius:18px;cursor:pointer;text-align:left;font:inherit;color:var(--tinta);box-shadow:var(--sombra)}
.ca-fase-plegada > span:nth-child(2){flex:1;min-width:0}
.ca-fase-plegada b{display:block;font-size:14.5px;font-weight:700;line-height:1.3}
.ca-fase-plegada small{display:block;font-size:12.5px;color:var(--gris);line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ca-fase-plegada .ca-link{margin:0;min-height:0}
.ca-fase-plegada:not(.ca-fase-pend) .ca-paso-n{background:rgba(177,209,62,.25);border-color:rgba(177,209,62,.5);color:var(--verde-txt)}
.ca-fase-plegada:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.ca-falta{margin:14px 0 0;color:var(--ambarF-txt);font-weight:600}
.ca-btns-nav{display:flex;gap:10px;margin-top:22px}
.ca-btns-nav .ca-btn-sec{flex:0 0 auto;width:auto;padding:0 18px}
.ca-btns-nav .ca-btn-pri{flex:1}
/* una respuesta plegada (arreglo 6) */
.ca-elegida{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--linea);border-radius:16px;background:var(--crema)}
.ca-elegida > span:nth-child(2){flex:1;min-width:0}
.ca-elegida small{display:block;font-size:12px;color:var(--gris);line-height:1.3}
.ca-elegida b{font-size:15px;line-height:1.35;margin-right:8px}
.ca-elegida .ca-link{margin:0}
.ca-origen{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;font:700 11px/1 'Inter',sans-serif;letter-spacing:.02em;white-space:nowrap;background:rgba(177,209,62,.2);color:var(--verde-txt);vertical-align:middle}
.ca-origen-supuesto{background:var(--ambar-bg);color:var(--ambar-txt);border:1px solid var(--ambar-borde)}
.ca-origen-tu{background:var(--tinta);color:#fff}
.ca-origen-no{background:#fff;color:var(--gris2);border:1px dashed rgba(20,17,17,.2)}
/* algo opcional, plegado */
.ca-plegado{border:1px solid var(--linea);border-radius:16px;background:#fff;padding:4px 14px}
.ca-plegado > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;min-height:52px}
.ca-plegado > summary::-webkit-details-marker{display:none}
.ca-plegado > summary > span{flex:1;min-width:0}
.ca-plegado > summary b{display:block;font-size:14.5px}
.ca-plegado > summary small{display:block;font-size:12.5px;color:var(--gris)}
.ca-plegado[open] > summary svg{transform:rotate(90deg)}
.ca-plegado[open]{padding-bottom:12px}
/* «Lo que ha visto la IA» */
.ca-ia-estado{display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px}
.ca-ia-estado > span:nth-of-type(2),.ca-ia-estado > span:only-of-type{flex:1 1 190px;min-width:0}
.ca-ia-estado b{display:block;font-size:14.5px;line-height:1.3}
.ca-ia-estado small{display:block;font-size:12.5px;color:var(--gris)}
.ca-ia-estado .ca-link{margin:0 0 0 auto}
.ca-ia-estado .ca-btn{width:auto;flex:none;margin-left:auto}
.ca-duda{display:flex;gap:12px;padding:14px;border-radius:16px;background:var(--ambar-bg);border:1px solid var(--ambar-borde)}
.ca-duda b{display:block;font-size:15px;line-height:1.35}
.ca-duda small{display:block;font-size:12.5px;color:var(--ambar-txt);margin-top:2px}
.ca-duda .ca-chipbtn{min-height:40px;font-size:14px}
.ca-duda-foto{flex:none;width:72px;height:72px;border-radius:12px;object-fit:cover;border:1px solid var(--linea)}
.ca-datos{list-style:none;margin:0;padding:0;border:1px solid var(--linea);border-radius:16px;background:#fff}
.ca-dato + .ca-dato{border-top:1px solid var(--linea)}
.ca-dato-fila{display:flex;align-items:center;gap:10px;padding:8px 12px;min-height:56px}
.ca-dato-txt{flex:1;min-width:0}
.ca-dato-txt small{display:block;font-size:12px;color:var(--gris);line-height:1.3}
.ca-dato-txt b{display:block;font-size:14.5px;line-height:1.35}
.ca-dato-txt em{display:block;font-style:normal;font-size:12px;color:var(--gris2);line-height:1.35;margin-top:2px}
.ca-dato-vacio{color:var(--gris2);font-weight:600}
.ca-dato .ca-link{margin:0;flex:none}
.ca-dato-preg{padding:4px 12px 14px;border-top:1px dashed var(--linea)}
@media (max-width:420px){
  .ca-dato-fila{flex-wrap:wrap}
  .ca-dato-txt{flex-basis:calc(100% - 90px)}
}
/* ── la app con MENÚ LATERAL en el PC (ui/Marco.jsx; Fran, 26/10/2026, alternativa A) ──
   Desde 1024 px: menú fijo a la izquierda y sin la barra de arriba. Por debajo, la
   barra de siempre y las partes de la obra en la barra de abajo (.ca-partes-inf). */
.ca-menu-lat{display:none}
.ca-menu-marca{padding:2px 4px}
.ca-menu-lat > .ca-marca-txt{align-self:flex-start;margin:-4px 0 2px 4px}
.ca-menu-nueva{width:100%;min-height:46px}
.ca-menu-nav{display:flex;flex-direction:column;gap:2px}
.ca-menu-it{appearance:none;border:0;background:none;width:100%;display:flex;align-items:center;gap:10px;min-height:42px;padding:0 12px;border-radius:12px;color:var(--gris);font:600 14px 'Inter',sans-serif;text-decoration:none;cursor:pointer;text-align:left}
.ca-menu-it:hover{background:rgba(20,17,17,.05);color:var(--tinta)}
.ca-menu-it svg{flex:none}
.ca-menu-act,.ca-menu-act:hover{background:var(--tinta);color:#fff}
.ca-menu-obra{margin:6px 0 8px 17px;padding-left:9px;border-left:2px solid #efece6;display:flex;flex-direction:column;gap:2px}
.ca-menu-obra-tit{margin:4px 0 6px 4px;font:800 10.5px/1.4 'Inter',sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--gris2);overflow:hidden;text-overflow:ellipsis}
.ca-menu-obra-tit span{display:block;color:var(--naranja-txt)}
.ca-menu-sub{display:flex;align-items:center;gap:10px;min-height:38px;padding:0 10px;border-radius:10px;color:var(--gris);font:500 13.5px 'Inter',sans-serif;text-decoration:none}
.ca-menu-sub:hover{background:rgba(20,17,17,.05);color:var(--tinta)}
.ca-menu-sub-act,.ca-menu-sub-act:hover{background:var(--ambar-bg);color:var(--tinta);font-weight:700;box-shadow:inset 0 0 0 1px var(--ambar-borde)}
.ca-menu-sub-txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ca-menu-sub small{flex:none;font-size:11.5px;font-weight:700;color:var(--gris2)}
.ca-menu-n{flex:none;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font:800 11px/1 'Inter',sans-serif;border:2px solid rgba(20,17,17,.16);color:var(--gris)}
.ca-menu-n-ok{background:var(--verde);border-color:var(--verde);color:var(--tinta)}
.ca-menu-n-act{background:var(--naranja);border-color:var(--naranja);color:var(--tinta)}
.ca-menu-pie{margin-top:auto;display:flex;flex-direction:column;gap:6px;padding-top:12px}
.ca-menu-creditos{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);text-decoration:none;color:var(--gris);font-size:12.5px;line-height:1.3}
.ca-menu-creditos b{font:700 30px/1 'Antonio','Inter',sans-serif;color:var(--tinta)}
.ca-menu-creditos-cero{background:var(--ambar-bg);border-color:var(--ambarF-borde);color:var(--ambar-txt)}
.ca-menu-yo{margin:4px 12px 0;font-size:12px;color:var(--gris2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ca-menu-it:focus-visible,.ca-menu-sub:focus-visible,.ca-menu-creditos:focus-visible,.ca-parte-tab:focus-visible{outline:3px solid var(--tinta);outline-offset:2px}
@media (min-width:1024px){
  .ca-shell{display:grid;grid-template-columns:264px minmax(0,1fr);align-items:start}
  .ca-menu-lat{display:flex;flex-direction:column;gap:12px;position:sticky;top:0;height:100vh;height:100dvh;overflow-y:auto;background:#fff;border-right:1px solid var(--linea);padding:18px 14px 16px;z-index:41}
  .ca-shell .ca-bar{display:none}
  .ca-sin-menu{display:none!important}
  .ca-shell .ca-panel-cab{grid-template-columns:1fr}
}
@media (max-width:1023px){.ca-solo-menu{display:none!important}}
/* la obra (ObraCerrada): cabecera y una PARTE cada vez (?parte=) */
.ca-pobra{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:18px 16px calc(48px + env(safe-area-inset-bottom) + var(--ca-inf))}
.ca-obra-cab{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 16px;margin:4px 2px 18px}
.ca-obra-cab > div:first-child{flex:1 1 300px;min-width:0}
.ca-obra-miga{margin:0 0 4px;font-size:12.5px;color:var(--gris2)}
.ca-obra-miga a{color:var(--gris2);text-decoration:none}
.ca-obra-miga a:hover{color:var(--tinta);text-decoration:underline}
.ca-obra-miga b{color:var(--naranja-txt)}
.ca-obra-tit{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.ca-obra-tit h1{margin:0;font-size:34px;line-height:1.05}
.ca-obra-cab .ca-sub{margin:4px 0 0}
.ca-obra-cab-acc{display:flex;flex-wrap:wrap;gap:10px}
.ca-obra-cab-acc .ca-btn{width:auto;padding:0 18px;min-height:46px}
.ca-parte{max-width:860px}
.ca-parte > * + *{margin-top:14px}
.ca-parte-h{margin:0 0 4px;font-size:22px}
.ca-obra-res{display:grid;gap:14px}
.ca-obra-res > *{min-width:0}
.ca-obra-atajos{display:grid;gap:10px}
.ca-col-lado{display:flex;flex-direction:column;gap:14px;min-width:0}
.ca-sig{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
.ca-sig li{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.35}
.ca-sig li small{display:block;font-size:12.5px;color:var(--gris2)}
.ca-sig i{flex:none;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:2px solid rgba(20,17,17,.18);margin-top:1px}
.ca-sig .ca-sig-ok i{background:var(--verde);border-color:var(--verde);color:var(--tinta)}
.ca-sig .ca-sig-act i{border-color:var(--naranja);box-shadow:inset 0 0 0 4px #fff,inset 0 0 0 10px var(--naranja)}
.ca-sig .ca-sig-pend{color:var(--gris)}
@media (min-width:768px){
  .ca-pobra{padding-top:28px}
  .ca-obra-cab h1{font-size:40px}
}
@media (min-width:768px) and (max-width:1023px){.ca-obra-atajos{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:1024px){
  .ca-pobra{padding:28px 32px 56px}
  .ca-obra-res{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);align-items:start}
}
/* las partes de la obra, abajo (móvil y tableta) */
.ca-partes-inf{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;justify-content:space-around;gap:4px;padding:6px 8px calc(6px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-top:1px solid var(--linea)}
.ca-parte-tab{appearance:none;border:0;background:none;flex:1 1 0;max-width:120px;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:12px;color:var(--gris2);font:600 11.5px/1.1 'Inter',sans-serif;text-decoration:none;cursor:pointer}
.ca-parte-tab-act{color:var(--tinta);background:rgba(20,17,17,.05)}
.ca-parte-tab-act svg{color:var(--naranja-txt)}
@media (max-width:1023px){:root:has(.ca-partes-inf){--ca-inf:68px}}
/* la barra de abajo de las fases (móvil): la cámara en el centro, en grande */
.ca-inf-in .ca-inf-camara{flex:0 0 auto;width:60px;min-height:60px;height:60px;margin-top:-14px;padding:0;border-radius:50%;background:var(--tinta);border-color:var(--tinta);color:var(--lima);box-shadow:0 10px 22px -8px rgba(20,17,17,.6)}
.ca-inf-in .ca-inf-camara:hover{background:#2a2626}
/* «La siguiente» de la visita (FaseFotos) */
.ca-siguiente{border-radius:20px;background:var(--tinta);color:#fff;padding:16px;display:flex;flex-direction:column;gap:12px}
.ca-siguiente-top{display:flex;gap:12px;align-items:center}
.ca-siguiente-top > span:last-child{flex:1;min-width:0}
.ca-siguiente-ico{flex:none;width:50px;height:50px;border-radius:14px;background:#2a2626;color:var(--lima);display:inline-flex;align-items:center;justify-content:center}
.ca-siguiente small{display:block;font:800 10.5px/1.3 'Inter',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--lima)}
.ca-siguiente b{display:block;font-size:17px;line-height:1.3}
.ca-siguiente em{display:block;font-style:normal;font-size:12.5px;line-height:1.4;color:#d6d2cc}
.ca-siguiente .ca-btns{margin-top:0}
.ca-siguiente .ca-btn-sec{background:transparent;color:#fff;border-color:#4a4444}
/* Mis obras: buscador y «lo siguiente» */
.ca-buscar{display:flex;align-items:center;gap:8px;min-height:46px;padding:0 14px;border-radius:14px;border:1px solid rgba(20,17,17,.14);background:#fff;color:var(--gris2)}
.ca-buscar input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:16px 'Inter',sans-serif;color:var(--tinta);text-transform:none}
.ca-buscar:focus-within{border-color:var(--tinta);box-shadow:0 0 0 3px rgba(20,17,17,.08)}
.ca-panel-obras{margin-top:26px;gap:12px}
.ca-panel-obras .ca-buscar{flex:1 1 260px;max-width:420px}
@media (min-width:1024px){.ca-shell .ca-panel-obras{margin-top:8px}}
.ca-sigtxt{font-weight:600;color:var(--gris)}
.ca-sigtxt-fuerte{color:var(--naranja-txt);font-weight:700}
@media (prefers-reduced-motion:reduce){
  .ca-in,.ca-sk,.ca-spin,.ca-sheet,.ca-capa,.ca-toast,.ca-check-ok svg{animation:none}
  .ca-check-ok circle,.ca-check-ok path{animation:none;stroke-dashoffset:0}
  .ca-btn,.ca-opt,.ca-barra i{transition:none}
}
`;
