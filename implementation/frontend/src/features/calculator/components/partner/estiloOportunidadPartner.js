// ─────────────────────────────────────────────────────────────────────────────
// Piel «carta de pago» (regla 164) de la OPORTUNIDAD vista por el PARTNER
// (Fran, 16/11/2026: rediseño propuesto en Claude Design y aceptado con «las tres
// cosas»). Prefijo `.po-`. Lo comparten el resumen de arriba
// (ResumenOportunidadPartner) y el popup de requisitos del FM (RequisitosFmModal).
// El resto de la calculadora (el formulario para corregir datos) sigue como está.
// ─────────────────────────────────────────────────────────────────────────────
export const CSS_OPORTUNIDAD_PARTNER = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.po{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--lima:#c7f601;--verde:#4d6b0f;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;background:var(--crema);color:var(--tinta);font-family:'Inter',system-ui,sans-serif;font-size:14px;line-height:1.5;
  border-radius:28px;overflow:hidden;margin:0 0 32px;box-shadow:0 24px 60px -30px rgba(0,0,0,.6)}
.po *{box-sizing:border-box}
.po-filete{height:4px;background:var(--filete)}
.po-in{padding:22px 18px 24px}
@media(min-width:768px){.po-in{padding:30px 34px 34px}}
.po-eti{margin:0;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gris)}
.po-cab{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px}
.po-h1{margin:4px 0 0;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:clamp(28px,6vw,40px);line-height:1.12;color:var(--tinta)}
.po-mark{background:linear-gradient(transparent 58%,var(--lima) 58%,var(--lima) 92%,transparent 92%);padding:0 .08em}
.po-sub{margin:4px 0 0;color:var(--gris);font-size:14.5px;line-height:1.5}
.po-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.po-chip{padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.03em;background:#fff;border:1px solid var(--linea);color:var(--tinta)}
.po-chip-osc{background:var(--tinta);color:#fff;border-color:var(--tinta)}
.po-barras{display:flex;gap:4px;list-style:none;margin:18px 0 0;padding:0}
.po-barras li{flex:1;min-width:0;font-size:11px;font-weight:600;color:var(--gris);line-height:1.25}
.po-barras li span{display:block;height:6px;border-radius:999px;background:rgba(20,17,17,.1);margin-bottom:6px}
.po-barras li.hecho span{background:#6b8f12}
.po-barras li.ahora{color:var(--tinta);font-weight:800}
.po-barras li.ahora span{background:var(--tinta)}
.po-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:18px}
@media(min-width:1024px){.po-grid{grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:16px;align-items:start}.po-grid>.po-col:last-child{position:sticky;top:16px}}
/* El bono y lo que va a su lado, en DOS tarjetas paralelas (17/11/2026) */
.po-par{display:grid;grid-template-columns:1fr;gap:12px}
@media(min-width:700px){.po-par{grid-template-columns:1fr 1fr}.po-par.solo{grid-template-columns:1fr}}
.po-par>*{min-width:0}
.po-bono{display:flex;flex-direction:column}
.po-col{display:flex;flex-direction:column;gap:12px;min-width:0;container-type:inline-size}
.po-card{background:#fff;border-radius:24px;border:1px solid rgba(20,17,17,.06);box-shadow:0 12px 32px -18px rgba(20,17,17,.18);padding:22px 20px}
.po-cifra{margin:8px 0 0;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:clamp(56px,13vw,80px);line-height:1;font-variant-numeric:tabular-nums;color:var(--tinta)}
.po-cifra-sub{margin:8px 0 0;font-size:12.5px;color:var(--gris)}
.po-fila{margin-top:14px;padding-top:12px;border-top:1px solid var(--linea);display:flex;justify-content:space-between;gap:8px;font-size:13px}
.po-fila span{color:var(--gris)}
/* Las cuentas del cliente: lista en una tarjeta estrecha; a lo ancho, una fila de casillas */
.po-cuentas.ancha{container-type:inline-size}
.po-cuentas ul{list-style:none;margin:8px 0 0;padding:0}
.po-cuentas li{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;font-size:13.5px}
.po-cuentas li+li{border-top:1px dashed rgba(20,17,17,.08)}
.po-cuentas li span{color:var(--gris);min-width:0}
.po-cuentas li small{font-size:12px;color:var(--gris)}
.po-cuentas li b{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700}
.po-cuentas li.obra span{color:var(--tinta);font-weight:600}
.po-total{margin-top:10px;padding:14px 16px;border-radius:16px;background:var(--crema);display:flex;justify-content:space-between;align-items:center;gap:12px}
.po-total span{font-weight:700;font-size:13.5px;min-width:0}
.po-total small{display:block;margin-top:2px;font-weight:500;font-size:12px;color:var(--gris)}
.po-total strong{flex:none}
@container (min-width:600px){
  .po-ecuacion{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:stretch;margin-top:10px}
  .po-ecuacion ul{margin:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);border:1px solid var(--linea);border-radius:16px;overflow:hidden}
  .po-ecuacion li{flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:3px;padding:12px 14px;font-size:12.5px}
  .po-ecuacion li+li{border-top:0;border-left:1px dashed rgba(20,17,17,.12)}
  .po-ecuacion li b{order:-1;font-family:'Antonio','Inter',Impact,sans-serif;font-size:24px;line-height:1.05}
  /* La nota del IRPF ya la dice el total («tras la deducción en su declaración»). */
  .po-ecuacion li small{display:none}
  .po-ecuacion .po-total{margin:0;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;background:var(--tinta);color:#fff;width:200px;padding:12px 18px}
  .po-ecuacion .po-total strong{order:-1;font-size:34px;color:var(--lima)}
  .po-ecuacion .po-total small{color:rgba(255,255,255,.72)}
}
.po-cifra-2{font-size:clamp(40px,9vw,52px)}
.po-fm-enlugar{margin:0;font-weight:700;font-size:14px;color:var(--tinta)}
.po-total strong{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:32px;line-height:1;font-variant-numeric:tabular-nums}
.po-opcion2{padding:18px 20px}
.po-guardar{margin-top:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px 10px 16px;border-radius:16px;background:#fff3d6;border:1px solid #f0d08a;color:#5c4100;font-size:13px;font-weight:600}
.po-guardar p{margin:0}
.po-guardar .po-btn2{min-height:44px;border-color:#e0b24a}
.po-sec{display:flex;flex-wrap:wrap;justify-content:center;gap:0 18px}
.po-sec button{min-height:44px;background:none;border:0;padding:0 4px;font:inherit;font-size:13px;font-weight:600;color:var(--gris);cursor:pointer;text-decoration:underline;text-decoration-color:rgba(20,17,17,.2);text-underline-offset:3px}
.po-sec button:hover{color:var(--tinta)}
.po-sec button:focus-visible,.po-link:focus-visible{outline:3px solid var(--naranja);outline-offset:2px;border-radius:4px}
.po-fm{border-radius:24px;background:#f4f9e6;border:1px solid #dbe9b4;padding:22px 20px 18px;display:flex;flex-direction:column;gap:8px}
.po-fm-pie{margin-top:auto;padding-top:6px;display:flex;flex-direction:column;gap:8px}
.po-fm.apagado{background:#fffaf0;border-color:#f6dca4}
.po-fm-cab{display:flex;align-items:center;justify-content:space-between;gap:8px}
.po-fm-eti{margin:0;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--verde)}
.po-fm.apagado .po-fm-eti{color:#5c4100}
.po-x{padding:3px 9px;border-radius:999px;background:var(--tinta);color:var(--lima);font-size:11px;font-weight:800}
.po-fm-cifra{margin:2px 0 0;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:clamp(44px,10vw,60px);line-height:1;font-variant-numeric:tabular-nums}
.po-fm-cifra small{display:block;margin-bottom:4px;font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--verde)}
.po-fm p.t{margin:0;font-size:12.5px;color:#3f4a1f}
.po-fm.apagado p.t{color:#5c4100}
.po-aviso{margin:0;font-size:12.5px;color:#5c4100;background:#fff3d6;border:1px solid #f0d08a;border-radius:12px;padding:8px 10px}
.po-btn2{min-height:44px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:#fff;border:1px solid #c9dc95;color:var(--tinta);font:inherit;font-weight:700;font-size:13px;cursor:pointer;padding:0 14px;text-align:center}
.po-btn2:hover{border-color:var(--tinta)}
.po-btn2:disabled{opacity:.55;cursor:not-allowed}
.po-btn-ico{gap:8px}
/* «Solicitar revisión» (bono < 3.000 €, regla 161), al pie de la tarjeta del bono */
.po-rev{margin-top:auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:14px 16px;border-radius:16px;background:var(--crema);border:1px solid var(--linea)}
.po-bono .po-cifra-sub{margin-bottom:18px}
.po-rev>div{flex:1 1 210px;min-width:0}
.po-rev .po-btn2{flex:1 1 auto;border-color:rgba(20,17,17,.18)}
.po-rev-t{margin:0;font-weight:800;font-size:13.5px}
.po-rev-x{margin:2px 0 0;font-size:13.5px;color:var(--gris)}
.po-rev.pedida{flex-wrap:nowrap;align-items:flex-start;background:#f4f9e6;border-color:#dbe9b4}
.po-rev-ico{flex:none;width:34px;height:34px;border-radius:999px;background:#fff;color:var(--verde);display:inline-flex;align-items:center;justify-content:center}
.po-revisada{margin:10px 0 0;display:inline-flex;align-self:flex-start;align-items:center;gap:6px;padding:5px 10px 5px 8px;border-radius:999px;background:#eef5dc;color:var(--verde);font-size:12px;font-weight:700}
/* Popup de «Solicitar revisión» */
.po-revpasos{list-style:none;margin:0;padding:4px 16px;display:flex;flex-direction:column;background:#fff;border-radius:18px;border:1px solid rgba(20,17,17,.06)}
.po-revpasos li{display:flex;gap:12px;padding:12px 0}
.po-revpasos li+li{border-top:1px solid var(--linea)}
.po-revpasos p{margin:0}
.po-revpasos .q{font-weight:700;font-size:14.5px}
.po-revpasos .a{margin-top:3px;font-size:13.5px;color:var(--gris)}
.po-consejo{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:14px 16px;border-radius:18px;background:#fff;border:1.5px dashed rgba(20,17,17,.18)}
.po-consejo>div{flex:1 1 220px;min-width:0}
.po-consejo .po-btn2{border-color:rgba(20,17,17,.18)}
.po-cerrar:disabled{opacity:.5;cursor:not-allowed}
/* La acción, arriba a la derecha */
.po-accion-t{margin:6px 0 0;font-size:15px;font-weight:700;line-height:1.35}
.po-accion .po-sec{margin-top:6px}
/* Subir fotos o documentos: con su icono, que se vea que es un botón */
/* (un @container mira al ANTEPASADO: aquí, la columna) */
@container (min-width:560px){.po-doc{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:20px;align-items:center}.po-doc .po-subir{margin-top:0}}
.po-subir{margin-top:14px;width:100%;min-height:58px;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;background:#fff;border:1.5px dashed rgba(20,17,17,.22);color:var(--tinta);font:inherit;text-align:left;cursor:pointer}
.po-subir:hover{border-color:var(--naranja);background:#fffaf0}
.po-subir:focus-visible{outline:3px solid var(--naranja);outline-offset:2px}
.po-subir-ico{flex:none;width:38px;height:38px;border-radius:12px;background:#fff3d6;color:var(--naranja-txt);display:inline-flex;align-items:center;justify-content:center}
.po-subir b{display:block;font-size:13.5px}
.po-subir small{display:block;font-size:12px;color:var(--gris)}
.po-btn2:focus-visible,.po-btn:focus-visible,.po-op:focus-visible{outline:3px solid var(--naranja);outline-offset:2px}
.po-btn{min-height:54px;border:0;border-radius:16px;background:var(--naranja);color:#08090c;font:inherit;font-size:15.5px;font-weight:700;letter-spacing:0;cursor:pointer;padding:0 20px;box-shadow:0 10px 22px -10px rgba(255,160,0,.75);width:100%}
.po-btn:hover{background:#ffb02e}
.po-btn:disabled{cursor:not-allowed;background:#efece6;color:#6b6e75;box-shadow:none}
.po-btn[aria-busy="true"]:disabled{background:var(--naranja);color:#08090c;opacity:.85}
.po-spin{width:16px;height:16px;border-radius:999px;border:2.5px solid rgba(8,9,12,.25);border-top-color:#08090c;animation:po-gira .8s linear infinite}
@keyframes po-gira{to{transform:rotate(360deg)}}
.po-datos{padding:8px 6px}
.po-dato{display:flex;align-items:flex-start;gap:12px;padding:12px 14px}
.po-dato+.po-dato{border-top:1px solid rgba(20,17,17,.07)}
.po-dato b{display:block;font-weight:700;overflow-wrap:anywhere}
.po-docs{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.po-docs li{display:inline-flex;align-items:center;gap:6px;padding:6px 11px 6px 8px;border-radius:999px;font-size:12px;font-weight:700}
.po-docs li.ok{background:#eef5dc;color:var(--verde)}
.po-docs li.falta{background:#fff3d6;color:#5c4100}
.po-ok{padding:6px 10px;border-radius:999px;background:#eef5dc;color:var(--verde);font-size:12px;font-weight:700}
.po-falta{padding:6px 10px;border-radius:999px;background:#fff3d6;color:#5c4100;font-size:12px;font-weight:700}
.po-nota{margin:10px 0 0;font-size:12.5px;color:var(--gris)}
.po-link{display:inline-flex;align-items:center;min-height:44px;background:none;border:0;padding:0;font:inherit;font-size:13px;font-weight:700;color:var(--naranja-txt);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.po-barra-movil{position:fixed;left:0;right:0;bottom:0;z-index:100;padding:12px 16px 18px;background:linear-gradient(180deg,rgba(250,249,247,0) 0%,#faf9f7 28%)}
@media(min-width:768px){.po-barra-movil{display:none}}
.po-solo-pc{display:none}
@media(min-width:768px){.po-solo-pc{display:block}}

/* Popup de requisitos del FM */
.po-velo{position:fixed;inset:0;z-index:9998;background:rgba(20,17,17,.55);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center}
@media(min-width:640px){.po-velo{align-items:center;padding:24px}}
.po-dlg{width:100%;max-width:600px;max-height:100dvh;overflow:auto;border-radius:24px 24px 0 0;margin:0;box-shadow:0 30px 80px -20px rgba(0,0,0,.6)}
@media(min-width:640px){.po-dlg{border-radius:28px;max-height:calc(100dvh - 48px)}}
.po-dlg .po-in{display:flex;flex-direction:column;gap:14px}
.po-cerrar:focus-visible{outline:3px solid var(--naranja);outline-offset:2px}
.po-cerrar{flex:none;width:44px;height:44px;border-radius:12px;background:#fff;border:1px solid var(--linea);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--tinta)}
.po-preg{background:#fff;border-radius:18px;border:1px solid rgba(20,17,17,.06);padding:14px 16px;display:flex;gap:12px}
.po-n{flex:none;width:26px;height:26px;border-radius:999px;background:var(--tinta);color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.po-preg p{margin:0}
.po-preg .q{font-weight:700}
.po-preg .a{margin-top:4px;font-size:12.5px;color:var(--gris)}
.po-ops{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.po-op{min-height:44px;min-width:76px;padding:0 14px;border-radius:12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;background:var(--crema);border:1px solid rgba(20,17,17,.14);color:var(--tinta)}
.po-op[aria-pressed="true"].si{background:var(--tinta);border-color:var(--tinta);color:var(--lima)}
.po-op[aria-pressed="true"].no{background:#fff3d6;border-color:#e0b24a;color:#5c4100}
.po-op[aria-pressed="true"].nose{background:#ececea;border-color:#b9bbbf}
.po-ver{border-radius:18px;padding:16px 18px;background:#fff;border:1px dashed rgba(20,17,17,.2)}
.po-ver.cumple{background:#f4f9e6;border:1px solid #c9dc95}
.po-ver.no_cumple{background:#fffaf0;border:1px solid #f6dca4}
.po-ver .tit{margin:4px 0 0;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:24px;line-height:1.15}
.po-ver.cumple .tit{color:var(--verde)}
.po-ver.no_cumple .tit{color:#5c4100}
.po-ver p{margin:0}
.po-lista{margin:8px 0 0;padding-left:18px;list-style:disc;font-size:14px;color:var(--tinta)}
.po-lista li{margin:4px 0}
.po-saber{border-radius:18px;padding:14px 16px;background:#fffaf0;border:1px solid #f6dca4;font-size:13px;color:#3d2c00}
.po-acciones{position:sticky;bottom:0;z-index:2;display:grid;grid-template-columns:1fr 2fr;gap:8px;margin:0 -18px -24px;padding:12px 18px 18px;background:var(--crema);border-top:1px solid var(--linea)}
@media(min-width:768px){.po-acciones{margin:0 -34px -34px;padding:14px 34px 22px}}
.po-acciones.solo{grid-template-columns:1fr}
.po-acciones .po-btn2{border-color:rgba(20,17,17,.14);min-height:52px}
.po-err{margin:0;font-size:12.5px;color:#5c4100;background:#fff3d6;border-radius:12px;padding:8px 10px}
.po-btn.po-btn-ico{display:flex;align-items:center;justify-content:center}

/* «Corregir datos»: el formulario de siempre, en claro (.theme-light) y en su tarjeta */
.po-corregir{margin-top:16px;scroll-margin-top:16px}
/* clip y no hidden: con hidden la tarjeta es un contenedor de scroll y el pie deja de pegarse abajo */
.po.po-corregir{overflow:clip}
.po-form{margin-top:18px;border-radius:20px;background:#fff;border:1px solid rgba(20,17,17,.06);box-shadow:0 12px 32px -18px rgba(20,17,17,.18);padding:16px 14px;color:var(--tinta)}
@media(min-width:768px){.po-form{padding:22px 24px}}
/* en el móvil el formulario va directo sobre el papel: una tarjeta dentro de otra le come el ancho */
@media(max-width:767px){.po-form{margin:14px -8px 0;padding:0;background:transparent;border:0;box-shadow:none}}
/* en el móvil, «Modificar datos / Cerrar edición» sobra al lado del título: ya está la flecha */
@media(max-width:520px){.po-form h3+div>span{display:none}}
/* el contenedor del formulario ya es la tarjeta: sus cajas de dentro no repiten sombra ni fondo oscuro */
.po-form>div:first-child{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;backdrop-filter:none!important}
.po-form h2,.po-form h3{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:0;color:var(--tinta)!important}
.po-form input:not([type=checkbox]):not([type=radio]),.po-form select,.po-form textarea{background:#fff!important;border-color:rgba(20,17,17,.16)!important;color:var(--tinta)!important}
.po-form input:focus,.po-form select:focus,.po-form textarea:focus{outline:none;border-color:var(--naranja)!important;box-shadow:0 0 0 3px rgba(255,160,0,.22)!important}
.po-form label{color:#3a3d44;font-size:13px!important}
/* 16 px en los campos: con menos, iOS amplía la página al tocarlos */
.po-form input:not([type=checkbox]):not([type=radio]),.po-form select{font-size:16px!important}
.po-form span.rounded:empty{display:none}
/* Qué cambia según el titular (NotaTitular) */
.po-titular{margin-top:12px;padding:12px 14px;border-radius:14px;background:#fff;border:1px solid var(--linea)}
.po-titular-t{margin:0;font-size:13.5px;font-weight:800;color:var(--tinta)}
.po-titular ul{margin:6px 0 0;padding-left:18px;list-style:disc;font-size:13px;line-height:1.45;color:#3a3d44}
.po-titular li+li{margin-top:4px}
/* Las cajas del formulario son grises translúcidas apiladas: en claro se alternan crema y blanco
   (con .po-corregir delante: «.theme-light .bg-slate-900:not(.fixed)» pesa 0,3,0) */
.po-corregir .po-form [class*="bg-slate-9"],.po-corregir .po-form [class*="bg-slate-8"],.po-corregir .po-form [class*="bg-white/[0.0"]{background-color:var(--crema)!important;border-color:rgba(20,17,17,.08)!important}
.po-corregir .po-form [class*="bg-slate-9"] [class*="bg-slate-9"],.po-corregir .po-form [class*="bg-slate-9"] [class*="bg-slate-8"],.po-corregir .po-form [class*="bg-slate-8"] [class*="bg-slate-8"],.po-corregir .po-form [class*="bg-slate-8"] [class*="bg-slate-9"]{background-color:#fff!important}
.po-corregir .po-form [class*="bg-slate-9"] [class*="bg-slate-9"] [class*="bg-slate-9"],.po-corregir .po-form [class*="bg-slate-9"] [class*="bg-slate-9"] [class*="bg-slate-8"],.po-corregir .po-form [class*="bg-slate-9"] [class*="bg-slate-8"] [class*="bg-slate-8"]{background-color:var(--crema)!important}
/* La pestaña elegida (estimado / real): tinta con la palabra en lima, como las opciones del FM */
/* el cian del CRM (ACS elegida, «Configuración ACS») pasa al verde de la casa */
.po-corregir .po-form [class*="text-cyan-"]{color:var(--verde)!important}
.po-corregir .po-form [class*="border-cyan-"]{border-color:#9dbb4a!important}
.po-corregir .po-form button[class*="bg-cyan-"]{background-color:#eef5dc!important;box-shadow:none!important}
.po-corregir .po-form [class*="from-cyan-"][class*="h-px"],.po-corregir .po-form .h-px[class*="cyan"]{background:#dbe9b4!important}
.po-form .shadow-inner>button.bg-gradient-to-r{background:var(--tinta)!important;color:var(--lima)!important;box-shadow:none!important}
.po-corr-pie{position:sticky;bottom:0;z-index:5;margin:18px -18px -24px;padding:12px 18px 16px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;background:var(--crema);border-top:1px solid var(--linea);border-radius:0 0 24px 24px}
@media(min-width:768px){.po-corr-pie{margin:22px -34px -34px;padding:14px 34px 20px}}
.po-corr-estado{margin:0;display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--gris)}
.po-punto{width:9px;height:9px;border-radius:999px;background:var(--naranja);box-shadow:0 0 0 3px rgba(255,160,0,.22)}
.po-corr-bts{display:grid;grid-template-columns:auto 1fr;gap:8px;flex:1 1 320px;max-width:440px;margin-left:auto}
.po-corr-bts .po-btn2{min-height:54px;padding:0 22px;border-color:rgba(20,17,17,.14)}
.po-corr-bts.solo{grid-template-columns:1fr;max-width:200px}
@media(max-width:767px){.po-corr-pie{gap:6px;padding:10px 16px 14px}.po-corr-estado{font-size:12px}.po-corr-bts{flex-basis:100%;max-width:none}}
@media (prefers-reduced-motion:reduce){.po *{transition-duration:.01ms!important;animation-duration:.01ms!important}}
`;
