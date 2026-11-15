// ─── landingEstilo.js — el CSS de la landing de cee.brokergy.es ──────────────
// Rediseño del 06/11/2026 (Fran: «una web efecto wow, manteniendo mi estilo y mis
// colores»). Prefijo `.ln-`, inyectado por publico/Landing.jsx. Usa los tokens de
// ui/estilo.js (:root) y sus piezas `.ca-` (botones, enlaces, entradas), así que
// la marca sigue siendo UNA: papel crema, tinta, naranja, lima, el filete
// naranja → verde, Antonio 700 en los titulares e Inter en el texto.
//
// Lo que hace «wow», y solo eso (lo demás va quieto, a propósito):
//   1. La portada: el titular entra, el rotulador lima se pinta sobre «revisas»
//      y, detrás del móvil del vídeo, crece la ESCALA de calificación A → G de la
//      etiqueta energética, con los colores de la marca. En el PC el móvil se
//      inclina un poco siguiendo el ratón.
//   2. Los cuatro pasos: la línea que los une se rellena con el filete al bajar.
//   3. La entrega, en un panel tinta: las cuatro hojas (.cex, XML, PDF, croquis)
//      se abren en abanico al verse.
//   4. El cierre: «¿Lo pruebas?» enorme y el pie «Powered by BROKERGY» con la
//      marca gigante recortada.
// Con «reducir movimiento» todo aparece ya en su sitio, sin animar.
// Docs: docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────

export const CSS_LANDING = `
.ln{--ln-g:16px}
.ln-wrap{position:relative;max-width:1200px;margin:0 auto;padding:0 var(--ln-g)}
.ln-main{position:relative;z-index:1}
.ln .ca-halo{height:760px;background:radial-gradient(55% 45% at 78% 22%,rgba(199,246,1,.15),transparent 70%),radial-gradient(55% 45% at 12% 0%,rgba(255,160,0,.12),transparent 70%)}

/* ── navegación: arriba es la cabecera de siempre; al bajar, una píldora de cristal ── */
.ln-nav{position:sticky;top:0;z-index:50;padding:max(8px,env(safe-area-inset-top)) 0 8px}
.ln-nav .ca-head{margin:0;min-height:56px;padding:6px 8px 6px 10px;border-radius:999px;border:1px solid transparent;
  transition:background-color .35s ease,border-color .35s ease,box-shadow .35s ease}
.ln-nav-on .ca-head{background:rgba(250,249,247,.8);-webkit-backdrop-filter:saturate(1.6) blur(14px);backdrop-filter:saturate(1.6) blur(14px);
  border-color:var(--linea);box-shadow:0 1px 2px rgba(20,17,17,.04),0 14px 34px -20px rgba(20,17,17,.4)}
.ln-nav-der{display:flex;align-items:center;gap:14px}
.ln-nav-der .ca-btn-peq{min-height:42px;padding:0 18px;border-radius:999px}
.ln-desde-600{display:none!important}

/* ── portada ── */
.ln-hero{position:relative;padding:14px 0 0}
/* el papel cuadriculado del plano, muy tenue, que se pierde hacia los bordes */
.ln-hero::before{content:'';position:absolute;z-index:-1;top:-120px;bottom:0;left:calc(50% - 50vw);right:calc(50% - 50vw);pointer-events:none;
  background-image:linear-gradient(rgba(20,17,17,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(20,17,17,.05) 1px,transparent 1px);
  background-size:44px 44px;background-position:center top;
  -webkit-mask-image:radial-gradient(ellipse 75% 60% at 60% 30%,#000 15%,transparent 72%);mask-image:radial-gradient(ellipse 75% 60% at 60% 30%,#000 15%,transparent 72%)}
.ln-hero-grid{display:grid}
.ln-beta{display:inline-flex;align-items:center;gap:9px;height:32px;margin:0;padding:0 14px 0 12px;border-radius:999px;background:#fff;border:1px solid var(--linea);
  box-shadow:0 1px 2px rgba(20,17,17,.04),0 6px 16px -10px rgba(20,17,17,.25);font:800 10.5px/1 'Inter',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--naranja-txt)}
.ln-beta i{width:8px;height:8px;border-radius:50%;background:var(--naranja);animation:ln-pulso 2.2s ease-out infinite}
.ln-h1{position:relative;z-index:0;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:44px;line-height:1.04;letter-spacing:-.012em;color:var(--tinta);margin:18px 0 0;text-wrap:balance}
/* el rotulador lima: va por DEBAJO del texto (si no, tapa los rabos de la línea de arriba) y se pinta al entrar */
.ln-mark{position:relative;z-index:-1;white-space:nowrap;padding:0 .06em}
.ln-mark::before{content:'';position:absolute;z-index:-1;left:-.05em;right:-.05em;top:.16em;bottom:.04em;border-radius:.09em .14em .1em .16em;background:var(--lima);
  transform-origin:left center;transform:scaleX(0);animation:ln-rotulador .75s cubic-bezier(.65,0,.35,1) .85s forwards}
.ln-sub{font-size:16px;line-height:1.6;color:var(--gris);margin:18px 0 0;max-width:34em}
.ln-sub b{color:var(--tinta);font-weight:600}
.ln-btns{display:grid;gap:10px;margin-top:26px}
.ln-btns .ca-btn-pri svg{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.ln-btns .ca-btn-pri:hover svg,.ln-cta .ca-btn-pri:hover svg{transform:translateX(4px)}
/* un brillo que cruza el botón principal al pasar por encima */
.ln-brillo{position:relative;overflow:hidden;isolation:isolate}
.ln-brillo::after{content:'';position:absolute;z-index:-1;top:0;bottom:0;left:-60%;width:45%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-18deg);transition:left .7s cubic-bezier(.2,.8,.2,1)}
.ln-brillo:hover::after{left:120%}
.ln-nota{margin:14px 2px 0;font-size:13px;line-height:1.5;color:var(--gris2);text-align:center}

/* el vídeo promo, sobre la escala A → G */
.ln-vid{position:relative;width:min(100%,272px);margin:44px auto 0}
.ln-vid-escena{position:relative;isolation:isolate}
.ln-vid-in{transform:perspective(1100px) rotateY(var(--ry,0deg)) rotateX(var(--rx,0deg));transition:transform .6s cubic-bezier(.2,.8,.2,1);will-change:transform;
  animation:ln-sube 1s cubic-bezier(.2,.8,.2,1) .2s both}
.ln-vid video{display:block;width:100%;height:auto;aspect-ratio:9/16;border-radius:30px;background:var(--crema);border:1px solid var(--linea);
  box-shadow:0 0 0 7px rgba(255,255,255,.7),0 1px 2px rgba(20,17,17,.06),0 40px 80px -34px rgba(20,17,17,.55)}
.ln-escala{position:absolute;z-index:-1;top:12%;bottom:15%;left:-17%;width:134%;display:grid;grid-template-rows:repeat(7,minmax(0,1fr));gap:6px;pointer-events:none;
  transform:translate3d(var(--bx,0px),var(--by,0px),0);transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.ln-barra{position:relative;display:flex;align-items:center;padding-left:9px;width:calc(27% + var(--i) * 12.15%)}
.ln-barra::before{content:'';position:absolute;inset:0;background:var(--c);border-radius:7px 0 0 7px;
  clip-path:polygon(0 0,calc(100% - 15px) 0,100% 50%,calc(100% - 15px) 100%,0 100%);
  transform-origin:left center;animation:ln-crece .9s cubic-bezier(.2,.8,.2,1) calc(.35s + var(--i) * .08s) both}
.ln-barra b{position:relative;font:700 17px/1 'Antonio','Inter',sans-serif;color:var(--tinta);animation:ca-fade .4s ease calc(.6s + var(--i) * .08s) both}
.ln-barra:nth-child(1){--c:#9fcb2b}.ln-barra:nth-child(2){--c:#c7f601}.ln-barra:nth-child(3){--c:#e3ee4b}.ln-barra:nth-child(4){--c:#f6e05a}
.ln-barra:nth-child(5){--c:#f5c53f}.ln-barra:nth-child(6){--c:#fca508}.ln-barra:nth-child(7){--c:#ff8a00}
/* «Activar sonido», DEBAJO del vídeo: encima tapaba la pantalla del móvil (Fran, 26/10) */
.ln-sonido{position:relative;z-index:1;display:flex;align-items:center;gap:8px;width:fit-content;min-height:44px;margin:26px auto 0;padding:0 18px 0 15px;border:1px solid var(--linea);border-radius:999px;
  background:#fff;color:var(--tinta);font:600 15px/1 'Inter',sans-serif;white-space:nowrap;cursor:pointer;box-shadow:0 1px 2px rgba(20,17,17,.05),0 10px 24px -14px rgba(20,17,17,.35);
  transition:background-color .2s ease,color .2s ease,transform .12s ease}
.ln-sonido:active{transform:scale(.97)}
.ln-sonido.ca-on{background:var(--tinta);color:#fff;border-color:transparent}
.ln-sonido:focus-visible{outline:3px solid var(--naranja);outline-offset:3px}

/* lo que es, en cuatro datos */
.ln-hechos{list-style:none;margin:48px 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--linea);border-bottom:1px solid var(--linea)}
.ln-hechos li{display:flex;gap:10px;align-items:flex-start;padding:16px 12px 16px 0;font-size:12.5px;line-height:1.45;color:var(--gris)}
.ln-hechos li:nth-child(2n){padding-left:14px;border-left:1px solid var(--linea)}
.ln-hechos li:nth-child(n+3){border-top:1px solid var(--linea)}
.ln-hechos svg{flex:none;margin-top:1px;color:var(--naranja-txt)}
.ln-hechos b{display:block;font-size:14px;color:var(--tinta);margin-bottom:1px}

/* ── secciones ── */
.ln-sec{padding-top:84px}
.ln-label{display:flex;align-items:center;gap:10px;margin:0;font:800 11px/1 'Inter',sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--gris)}
.ln-label::before{content:'';flex:none;width:24px;height:3px;border-radius:3px;background:var(--filete)}
.ln-h2{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:34px;line-height:1.05;letter-spacing:-.008em;color:var(--tinta);margin:14px 0 0;text-wrap:balance}

/* cómo funciona: los pasos unidos por una línea que se rellena al bajar */
.ln-pasos{display:grid;gap:34px}
.ln-lista-pasos{list-style:none;margin:0;padding:0;position:relative}
.ln-paso{position:relative;display:grid;grid-template-columns:48px minmax(0,1fr);gap:16px;padding-bottom:34px}
.ln-paso:last-child{padding-bottom:0}
/* el tramo de línea de este paso al siguiente: el gris de fondo y, encima, el filete (--f de 0 a 1) */
.ln-paso:not(:last-child)::before,.ln-paso:not(:last-child)::after{content:'';position:absolute;left:23px;top:24px;height:100%;width:2px;border-radius:2px}
.ln-paso:not(:last-child)::before{background:rgba(20,17,17,.09)}
.ln-paso:not(:last-child)::after{background:linear-gradient(180deg,#fca508,#f5c53f 35%,#c7d54c 75%,#b5cf38);transform-origin:top;transform:scaleY(var(--f,0))}
.ln-num{position:relative;z-index:1;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--crema);border:1.5px solid rgba(20,17,17,.16);
  font:700 20px/1 'Antonio','Inter',sans-serif;color:var(--gris2);transition:background-color .4s ease,color .4s ease,border-color .4s ease,box-shadow .4s ease}
.ln-on .ln-num{background:var(--tinta);border-color:var(--tinta);color:#fff;box-shadow:0 0 0 6px rgba(199,246,1,.4)}
.ln-paso h3{margin:11px 0 0;font:700 18px/1.3 'Inter',sans-serif;color:var(--tinta)}
.ln-paso p{margin:8px 0 0;font-size:15px;line-height:1.62;color:var(--gris);max-width:36em}

/* qué te entregamos: un panel tinta, con las hojas en abanico */
.ln-panel{position:relative;overflow:hidden;margin:84px 8px 0;border-radius:28px;background:var(--tinta);color:#fff;isolation:isolate}
.ln-panel::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.ln-panel::after{content:'';position:absolute;z-index:-1;inset:0;pointer-events:none;
  background:radial-gradient(40% 45% at 88% 12%,rgba(199,246,1,.11),transparent 70%),radial-gradient(45% 50% at 6% 100%,rgba(255,160,0,.12),transparent 70%)}
.ln-panel .ln-label{color:rgba(255,255,255,.62)}
.ln-panel .ln-h2{color:#fff}
.ln-entrega{display:grid;padding-top:60px;padding-bottom:60px}
.ln-entrega-lista{list-style:none;margin:26px 0 0;padding:0}
.ln-entrega-lista li{display:flex;gap:12px;align-items:flex-start;padding:13px 0;font-size:15px;line-height:1.5;color:rgba(255,255,255,.72)}
.ln-entrega-lista li + li{border-top:1px solid rgba(255,255,255,.1)}
.ln-entrega-lista svg{flex:none;margin-top:2px;color:var(--lima)}
.ln-entrega-lista b{color:#fff;font-weight:600}
.ln-carpeta{display:flex;gap:10px;align-items:flex-start;margin:18px 0 0;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:13.5px;line-height:1.5;color:rgba(255,255,255,.68)}
.ln-carpeta svg{flex:none;margin-top:1px;color:var(--naranja)}
.ln-carpeta b{color:#fff;font-weight:600}
/* las hojas */
.ln-hojas{position:relative;height:262px;margin:34px 0 4px;--w:118px}
.ln-hoja{position:absolute;left:50%;top:50%;width:var(--w);aspect-ratio:3/4;margin:calc(var(--w) * -.66) 0 0 calc(var(--w) * -.5);padding:calc(var(--w) * .1);border-radius:12px;
  background:var(--crema);color:var(--tinta);display:flex;flex-direction:column;gap:6px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(255,255,255,.08),0 28px 50px -24px rgba(0,0,0,.75);
  translate:0 18px;rotate:calc(var(--k) * 2deg);transition:translate .9s cubic-bezier(.2,.8,.2,1) calc(var(--o) * .07s),rotate .9s cubic-bezier(.2,.8,.2,1) calc(var(--o) * .07s)}
/* la esquina doblada */
.ln-hoja::after{content:'';position:absolute;top:0;right:0;width:22%;aspect-ratio:1;background:linear-gradient(225deg,var(--tinta) 50%,#e6e1d8 50%);border-bottom-left-radius:6px}
.ln-visto .ln-hoja{translate:calc(var(--k) * var(--abre)) calc(var(--y) * 1px);rotate:calc(var(--k) * 7deg)}
.ln-hojas{--abre:64px}
/* cada hoja tapa el borde DERECHO de la anterior: lo escrito (a la izquierda) se ve en todas */
.ln-hoja:nth-child(1){--k:-1.5;--y:16;--o:0;z-index:1}
.ln-hoja:nth-child(2){--k:-.5;--y:0;--o:1;z-index:2}
.ln-hoja:nth-child(3){--k:.5;--y:2;--o:2;z-index:3}
.ln-hoja:nth-child(4){--k:1.5;--y:18;--o:3;z-index:4}
.ln-hoja-ext{font:700 calc(var(--w) * .25)/1 'Antonio','Inter',sans-serif;letter-spacing:-.01em}
.ln-hoja-ext.ln-larga{font-size:calc(var(--w) * .165);letter-spacing:.01em;padding-top:calc(var(--w) * .03)}
.ln-hoja-ext small{font-size:.55em;color:var(--gris2);margin-right:.04em}
.ln-hoja-chip{align-self:flex-start;display:inline-flex;align-items:center;height:calc(var(--w) * .13);padding:0 .55em;border-radius:999px;background:var(--lima);font:800 calc(var(--w) * .062)/1 'Inter',sans-serif;letter-spacing:.08em;text-transform:uppercase}
.ln-hoja-l{display:block;height:calc(var(--w) * .045);border-radius:3px;background:rgba(20,17,17,.1)}
.ln-hoja-l.ln-c{background:rgba(255,160,0,.45);width:30%}
.ln-hoja-l.ln-v{background:rgba(177,209,62,.6);width:24%}
.ln-hoja-cod{display:flex;gap:4px}
.ln-hoja-cod .ln-hoja-l{flex:none}
.ln-mini{display:grid;gap:3px;margin-top:2px}
.ln-mini i{display:block;height:calc(var(--w) * .055);border-radius:2px 0 0 2px;clip-path:polygon(0 0,calc(100% - 4px) 0,100% 50%,calc(100% - 4px) 100%,0 100%)}
.ln-mini i:nth-child(1){width:34%;background:#9fcb2b}.ln-mini i:nth-child(2){width:43%;background:#c7f601}.ln-mini i:nth-child(3){width:52%;background:#e3ee4b}
.ln-mini i:nth-child(4){width:61%;background:#f6e05a}.ln-mini i:nth-child(5){width:70%;background:#f5c53f}.ln-mini i:nth-child(6){width:79%;background:#fca508}.ln-mini i:nth-child(7){width:88%;background:#ff8a00}
.ln-plano{display:block;width:100%;height:auto;margin-top:auto}

/* el certificado es tuyo */
.ln-manif{margin:0;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:40px;line-height:1.04;letter-spacing:-.01em;color:var(--tinta);text-wrap:balance;max-width:15em}
.ln-manif span{color:rgba(20,17,17,.5)}
.ln-manif-sub{display:flex;align-items:center;gap:12px;margin:20px 0 0;font-size:15.5px;line-height:1.55;color:var(--gris)}
.ln-manif-sub .ca-ico-tile{width:40px;height:40px;border-radius:12px}

/* para quién es */
.ln-para{display:grid;margin-top:26px;border-top:1px solid var(--linea)}
.ln-para > div{display:grid;grid-template-columns:44px minmax(0,1fr);gap:14px;align-items:start;padding:18px 0;border-bottom:1px solid var(--linea)}
.ln-para b{display:block;font-size:16px;line-height:1.35;color:var(--tinta)}
.ln-para small{display:block;margin-top:4px;font-size:14.5px;line-height:1.55;color:var(--gris)}

/* dudas */
.ln-faq{display:grid;gap:26px}
.ln-dudas{border-top:1px solid var(--linea)}
.ln-duda{border-bottom:1px solid var(--linea)}
.ln-duda-q{appearance:none;width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;padding:14px 2px;background:none;border:0;cursor:pointer;text-align:left;
  font:600 16px/1.35 'Inter',sans-serif;color:var(--tinta);-webkit-tap-highlight-color:transparent}
.ln-duda-q:focus-visible{outline:3px solid var(--tinta);outline-offset:2px;border-radius:8px}
.ln-duda-ico{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1.5px solid rgba(20,17,17,.14);color:var(--tinta);
  transition:transform .35s cubic-bezier(.2,.8,.2,1),background-color .25s ease,border-color .25s ease}
.ln-duda-q:hover .ln-duda-ico{border-color:rgba(20,17,17,.32)}
.ln-duda-abierta .ln-duda-ico{transform:rotate(45deg);background:var(--lima);border-color:transparent}
.ln-duda-a{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s cubic-bezier(.2,.8,.2,1)}
.ln-duda-abierta .ln-duda-a{grid-template-rows:1fr}
.ln-duda-a > div{overflow:hidden;min-height:0}
.ln-duda-a p{margin:0;padding:0 46px 22px 2px;font-size:15px;line-height:1.65;color:#3b3e45}

/* el cierre: llamada, aviso legal y pie, en otro panel tinta */
.ln-final{margin-bottom:8px;text-align:center}
.ln-cta{padding:76px 0 0}
.ln-cta-h{margin:0;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:64px;line-height:1;letter-spacing:-.015em;color:#fff}
.ln-final .ln-mark{color:var(--tinta)}
.ln-final .ln-mark::before{animation:none;transform:none}
.ln-cta p{max-width:34em;margin:24px auto 0;font-size:16px;line-height:1.6;color:rgba(255,255,255,.7)}
.ln-cta .ca-btn{width:auto;margin:30px auto 0;min-height:60px;padding:0 30px;display:inline-flex}
.ln-cta .ca-btn:focus-visible{outline-color:#fff}
.ln-legal{max-width:62em;margin:64px auto 0;padding-top:24px;border-top:1px solid rgba(255,255,255,.1);font-size:12.5px;line-height:1.65;color:rgba(255,255,255,.55);text-align:left}
.ln-legal b{color:rgba(255,255,255,.85)}
.ln-pie{display:flex;flex-direction:column;align-items:center;gap:18px;margin-top:30px;padding-top:24px;border-top:1px solid rgba(255,255,255,.1)}
.ln-powered{display:inline-flex;align-items:center;gap:11px;min-height:42px;padding:0 18px 0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04);
  color:rgba(255,255,255,.62);font:800 10px/1 'Inter',sans-serif;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;
  transition:border-color .25s ease,background-color .25s ease,color .25s ease}
.ln-powered img{display:block;height:18px;width:auto}
.ln-powered:hover{border-color:rgba(199,246,1,.55);background:rgba(199,246,1,.06);color:#fff}
.ln-powered:focus-visible{outline:3px solid var(--lima);outline-offset:3px}
.ln-pie-links{display:flex;flex-wrap:wrap;justify-content:center;gap:2px 18px;margin:0;padding:0;list-style:none}
.ln-pie-links a{display:inline-flex;align-items:center;min-height:40px;font:600 14px 'Inter',sans-serif;color:rgba(255,255,255,.72);text-decoration:none}
.ln-pie-links a:hover{color:#fff;text-decoration:underline;text-underline-offset:3px}
.ln-pie-links a:focus-visible{outline:3px solid var(--lima);outline-offset:2px;border-radius:6px}
.ln-copy{margin:0;font-size:12px;letter-spacing:.06em;color:rgba(255,255,255,.42)}
/* la marca gigante, recortada contra el borde de abajo */
.ln-gigante{display:block;margin:34px 0 0;padding:0 8px;white-space:nowrap;text-align:center;user-select:none;pointer-events:none;
  font:700 14.2vw/.8 'Antonio','Inter',Impact,sans-serif;letter-spacing:-.01em;margin-bottom:-.13em;
  background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.02) 88%);-webkit-background-clip:text;background-clip:text;color:transparent}

@keyframes ln-pulso{0%{box-shadow:0 0 0 0 rgba(255,160,0,.55)}70%{box-shadow:0 0 0 9px rgba(255,160,0,0)}100%{box-shadow:0 0 0 0 rgba(255,160,0,0)}}
@keyframes ln-rotulador{to{transform:scaleX(1)}}
@keyframes ln-crece{from{transform:scaleX(.12);opacity:0}to{transform:none;opacity:1}}
@keyframes ln-sube{from{opacity:0;transform:perspective(1100px) translateY(36px) scale(.96)}to{opacity:1}}

/* ── tableta ── */
@media (min-width:600px){
  .ln-desde-600{display:inline-flex!important}
}
@media (min-width:640px){
  .ln{--ln-g:28px}
  .ln-h1{font-size:58px}
  .ln-sub{font-size:17px}
  .ln-btns{grid-auto-flow:column;justify-content:start;gap:12px}
  .ln-btns .ca-btn{width:auto;padding:0 26px}
  .ln-nota{text-align:left}
  .ln-hechos{grid-template-columns:repeat(4,minmax(0,1fr))}
  .ln-hechos li{padding:18px 14px}
  .ln-hechos li:first-child{padding-left:0}
  .ln-hechos li + li{border-left:1px solid var(--linea)}
  .ln-hechos li:nth-child(n+3){border-top:0}
  .ln-h2{font-size:44px}
  .ln-panel{margin-left:12px;margin-right:12px;border-radius:32px}
  .ln-hojas{height:340px;--w:150px;--abre:96px}
  .ln-manif{font-size:54px}
  .ln-para{grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--linea)}
  .ln-para > div{display:block;padding:24px 22px 26px 0;border-bottom:0}
  .ln-para > div + div{padding-left:22px;border-left:1px solid var(--linea)}
  .ln-para .ca-ico-tile{margin-bottom:16px}
  .ln-cta-h{font-size:96px}
  .ln-pie{flex-direction:row;flex-wrap:wrap;justify-content:space-between}
  .ln-gigante{font-size:15vw;padding:0 var(--ln-g)}
}
/* ── ordenador ── */
@media (min-width:1024px){
  .ln{--ln-g:40px}
  .ln-nav{padding-top:12px}
  .ln-hero{padding-top:20px}
  .ln-hero-grid{grid-template-columns:minmax(0,1.22fr) minmax(0,.78fr);gap:48px;align-items:center;min-height:min(760px,calc(100vh - 100px))}
  .ln-h1{font-size:clamp(58px,5vw,74px);line-height:1.03;margin-top:22px}
  .ln-sub{font-size:18.5px;line-height:1.62;margin-top:26px}
  .ln-btns{margin-top:34px}
  .ln-btns .ca-btn{min-height:58px;padding:0 30px}
  .ln-sub{max-width:30em}
  /* el móvil y su escala caben en su columna: la escala no pisa el texto ni se sale por la derecha */
  .ln-vid{width:min(100%,300px);margin:0 auto}
  .ln-vid video{border-radius:34px}
  .ln-escala{left:-20%;width:140%;gap:9px}
  .ln-barra{padding-left:14px}
  .ln-barra b{font-size:24px}
  .ln-barra::before{border-radius:9px 0 0 9px;clip-path:polygon(0 0,calc(100% - 20px) 0,100% 50%,calc(100% - 20px) 100%,0 100%)}
  .ln-hechos{margin-top:56px}
  .ln-hechos li{padding:22px 24px;font-size:13.5px}
  .ln-hechos b{font-size:15px}
  .ln-sec{padding-top:120px}
  .ln-h2{font-size:56px;line-height:1.02}
  .ln-pasos{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:80px;align-items:start}
  .ln-pasos .ln-cab{position:sticky;top:120px}
  .ln-paso{grid-template-columns:60px minmax(0,1fr);gap:26px;padding-bottom:52px}
  .ln-paso:not(:last-child)::before,.ln-paso:not(:last-child)::after{left:29px;top:30px}
  .ln-num{width:60px;height:60px;font-size:24px}
  .ln-paso h3{margin-top:14px;font-size:22px}
  .ln-paso p{font-size:16.5px;margin-top:10px}
  .ln-panel{margin:120px 16px 0;border-radius:40px}
  .ln-entrega{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center;padding-top:100px;padding-bottom:100px}
  .ln-entrega-lista li{font-size:16px;padding:15px 0}
  .ln-hojas{height:400px;margin:0;--w:150px;--abre:88px}
  .ln-hoja{border-radius:16px}
  .ln-visto .ln-hoja:hover{translate:calc(var(--k) * var(--abre)) calc(var(--y) * 1px - 18px);transition-delay:0s}
  .ln-manif{font-size:84px;line-height:1}
  .ln-manif-sub{font-size:17px;margin-top:26px}
  .ln-para{margin-top:34px}
  .ln-para > div{padding:30px 30px 34px 0}
  .ln-para > div + div{padding-left:30px}
  .ln-para b{font-size:18px}
  .ln-para small{font-size:15.5px}
  .ln-faq{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:80px;align-items:start}
  .ln-faq .ln-cab{position:sticky;top:120px}
  .ln-duda-q{min-height:76px;font-size:18px}
  .ln-duda-a p{font-size:16px;padding-bottom:26px}
  .ln-final{margin-bottom:16px}
  .ln-cta{padding-top:120px}
  .ln-cta-h{font-size:clamp(110px,11vw,168px);line-height:.95}
  .ln-cta p{font-size:18px;margin-top:32px}
  .ln-legal{margin-top:96px}
}
@media (min-width:1024px) and (max-width:1199px){
  .ln-entrega{gap:32px}
}
@media (min-width:1200px){
  .ln-hojas{height:460px;--w:184px;--abre:108px}
}
@media (min-width:1280px){
  .ln-vid{width:min(100%,338px)}
  .ln-escala{left:-24%;width:158%;gap:10px}
}

/* ── con «reducir movimiento», todo ya en su sitio ── */
@media (prefers-reduced-motion:reduce){
  .ln *,.ln *::before,.ln *::after{animation:none!important;transition:none!important}
  .ln-mark::before{transform:none}
  .ln-vid-in{transform:none}
}
`;
