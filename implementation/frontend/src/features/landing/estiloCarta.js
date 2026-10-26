// ─────────────────────────────────────────────────────────────────────────────
// La landing PÚBLICA (/reforma, /calcula-tu-ayuda, /p/:slug) en el estilo
// «carta de pago» (regla 164).
//
// Es una PIEL y no una reescritura, a propósito: el funnel son ~4.300 líneas
// (búsqueda en el Catastro, pasos, reforma, entrega del resultado) y el MISMO
// componente es la «Nueva simulación» del CRM, que sigue oscura. Así que
// LandingFunnelView, solo en modo público, envuelve todo en `.lf .theme-light`:
//   · `.theme-light` (index.css) ya pasa a claro todas las utilidades oscuras
//     de Tailwind (text-white, bg-white/x, bkg-*…), como en el CRM de día;
//   · `.lf` pone encima el papel crema, las tarjetas blancas de 24 px, Antonio
//     en los titulares con su palabra en lima, el botón naranja y los avisos
//     en ámbar (nunca en rojo).
// Lo que se cambie aquí se ve en TODOS los pasos: se comprueba con las
// capturas de los pasos, no solo con la portada.
//
// Con partner (white-label, `.partner-accent`) el acento es SU color, en la
// variante oscurecida para papel claro (`--accent-text-claro`, partnerTheme.js);
// el lima del titular pasa a un tinte de su color.
// ─────────────────────────────────────────────────────────────────────────────

export const CSS_LANDING_CARTA = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.lf{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  --lf-acento-txt:var(--naranja-txt);--lf-acento:var(--naranja);--lf-mark:var(--lima);
  --bkg-base:250 249 247;--bkg-surface:255 255 255;--bkg-elevated:250 249 247;--bkg-deep:255 255 255;
  color-scheme:light;background:var(--crema)!important;color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.lf.partner-accent{--lf-acento-txt:var(--accent-text-claro,var(--accent));--lf-acento:var(--accent);--lf-mark:rgba(var(--accent-rgb),.22)}
.lf ::selection{background:var(--lima);color:var(--tinta)}
.lf-filete{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete);z-index:2}
.lf-halo{position:absolute;inset:0 0 auto 0;height:560px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.lf.partner-accent .lf-halo{background:radial-gradient(60% 55% at 50% 0%,rgba(var(--accent-rgb),.10),transparent 70%)}
.lf-logo{height:30px;width:auto;display:block}

/* Titulares: Antonio, y su palabra de color pasa a subrayado lima */
.lf h1,.lf h2{font-family:'Antonio','Inter',Impact,sans-serif!important;font-weight:700!important;letter-spacing:-.005em!important;color:var(--tinta)!important;line-height:1.14!important}
.lf h1{font-size:clamp(38px,9.6vw,58px)!important}
.lf h2{font-size:clamp(28px,7.2vw,40px)!important}
.lf h1 [class*="text-amber-"],.lf h2 [class*="text-amber-"]{color:var(--tinta)!important;background:linear-gradient(transparent 14%,var(--lf-mark) 14%);padding:0 .12em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.lf h3{color:var(--tinta)}

/* Acentos de texto: el naranja de lectura (o el del partner) */
.lf [class*="text-amber-"],.lf [class*="text-orange-"],.lf .text-brand,.lf [class*="text-brand-"]{color:var(--lf-acento-txt)!important}

/* Tarjetas: blancas, 24 px, sombra suave */
.lf .bg-bkg-surface,.lf [class*="bg-white/[0.0"],.lf .bg-white\\/5{background-color:#fff!important}
.lf .bg-bkg-surface,.lf .rounded-3xl,.lf [class*="rounded-[2"]{border-radius:24px!important}
.lf main .bg-bkg-surface,.lf main [class*="bg-white/[0.0"]{border-color:var(--linea)!important;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10)}
.lf [class*="border-white/"]{border-color:var(--linea)!important}
/* Las opciones del funnel (IconCard) elegidas: borde naranja y fondo cálido */
.lf [class*="border-amber-400"]{border-color:var(--lf-acento)!important}
.lf [class*="bg-amber-400/10"],.lf [class*="bg-amber-500/10"]{background-color:#fffaf0!important}
.lf.partner-accent [class*="bg-amber-400/10"],.lf.partner-accent [class*="bg-amber-500/10"]{background-color:rgba(var(--accent-rgb),.07)!important}

/* La acción principal: naranja sólido con tinta (sin degradado ni mayúsculas gritadas) */
.lf:not(.partner-accent) .from-amber-500,.lf:not(.partner-accent) .from-amber-400,.lf:not(.partner-accent) .bg-amber-500,.lf:not(.partner-accent) .bg-amber-400{
  background:var(--naranja)!important;color:#08090c!important;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)!important}
.lf button.uppercase.tracking-widest,.lf a.uppercase.tracking-widest{letter-spacing:.02em!important;text-transform:none!important;font-size:15.5px!important;font-weight:700!important}
.lf .rounded-2xl{border-radius:16px}

/* «Usar mi ubicación» (CatastroSearchBox): del esmeralda al verde de la paleta */
.lf [class*="from-emerald-500/"],.lf [class*="bg-emerald-500/"]{background:rgba(177,209,62,.12)!important;border-color:rgba(177,209,62,.55)!important}
.lf [class*="text-emerald-"]{color:#4d6b0f!important}

/* Progreso de los pasos: el filete */
.lf .h-1 > .from-amber-500{background:var(--filete)!important;box-shadow:none!important}
.lf.partner-accent .h-1 > .from-amber-500{background:var(--accent)!important}

/* Avisos: ámbar, nunca rojo */
.lf [class*="bg-red-500/"],.lf [class*="bg-rose-500/"]{background-color:#fff7e6!important}
.lf [class*="border-red-500/"],.lf [class*="border-rose-500/"]{border-color:#f6dca4!important}
.lf [class*="text-red-"],.lf [class*="text-rose-"]{color:#5c4100!important}

/* Campos: blancos, borde fino; foco en tinta */
.lf input:not([type=checkbox]):not([type=radio]),.lf select,.lf textarea{background-color:#fff!important;border-color:rgba(20,17,17,.14)!important;color:var(--tinta)!important}
.lf input::placeholder,.lf textarea::placeholder{color:#8a8d94!important}

/* El resultado estimado (LeadDeliveryView): UNA cifra protagonista */
.lf-res{position:relative;overflow:hidden;background:#fff;border:1px solid var(--linea);border-radius:24px;padding:24px 20px 20px;text-align:center;
  box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10)}
.lf-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.lf.partner-accent .lf-filete-fino{background:var(--accent)}
.lf-eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--lf-acento-txt);margin:0}
.lf-cifra{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:clamp(64px,19vw,92px);line-height:1;letter-spacing:-.01em;color:var(--tinta);margin:10px 0 0;font-variant-numeric:tabular-nums}
.lf-cifra-sub{font-size:15px;line-height:1.5;color:var(--gris);margin:10px 0 0}
.lf-mark{background:linear-gradient(transparent 14%,var(--lf-mark) 14%);color:var(--tinta);font-weight:700;padding:0 .14em;border-radius:5px}
.lf-res-dl{margin:18px 0 0;text-align:left}
.lf-res-dl div{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:12px 2px;border-top:1px solid var(--linea);font-size:14.5px}
.lf-res-dl dt{color:var(--gris)}
.lf-res-dl dd{margin:0;font-weight:800;font-size:17px;color:var(--tinta);white-space:nowrap;font-variant-numeric:tabular-nums}
.lf-res-nota{font-size:12.5px;line-height:1.5;color:#6b6e76;margin:8px 0 0}
.lf-res-nota b{color:var(--tinta)}

.lf-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b6e76;font-weight:700;margin:0}
@media (prefers-reduced-motion:reduce){.lf *{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
