// ─── estiloPresupuesto.js — los PASOS del presupuesto y el selector de EQUIPO (22/11/2026) ──
// Aparte de `estilo.js` a propósito: lo monta solo `PresupuestoForm` (un `<style>` suyo), y así
// el CSS general de la app no crece con lo de una pantalla. Mismos tokens (`--tinta`, `--crema`,
// `--ambar-*`…), que define `estilo.js` en `.ia-app`. Mobile first: a 360 px cada paso cerrado
// es una fila de un toque (≥ 64 px) y nada hace scroll horizontal salvo la fila de marcas.
export const CSS_PRESUPUESTO = `
.ia-ps{padding:0;display:block;scroll-margin-top:12px;transition:box-shadow .2s ease,border-color .2s ease}
.ia-ps.abierto{border-color:rgba(20,17,17,.16);box-shadow:0 10px 30px -18px rgba(20,17,17,.35)}
.ia-ps-h{margin:0;font-size:inherit}
.ia-ps-h>button{width:100%;min-height:68px;display:flex;align-items:center;gap:12px;padding:14px 16px;border:0;background:none;text-align:left;cursor:pointer;color:var(--tinta);font:inherit;border-radius:inherit}
.ia-ps-h>button:focus-visible{outline:2.5px solid var(--tinta);outline-offset:-3px}
.ia-ps-n{flex:none;width:30px;height:30px;border-radius:999px;background:var(--neutro);color:var(--tinta);display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:800}
.ia-ps.abierto .ia-ps-n{background:var(--tinta);color:#fff}
.ia-ps-n.ok{background:var(--verde);color:#1f2d05}
.ia-ps-n.falta{background:var(--ambar-bg);color:var(--ambar-txt);box-shadow:inset 0 0 0 1.5px var(--ambar-borde)}
.ia-ps-t{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-ps-t b{font-size:17.5px;line-height:1.25;font-weight:800}
.ia-ps-t small{font-size:13.5px;line-height:1.4;color:var(--gris);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.ia-ps-t small.falta{color:var(--ambar-txt);font-weight:700}
.ia-ps-cambiar{flex:none;font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px;color:var(--tinta)}
.ia-ps-h .ia-ps-flecha{flex:none;color:var(--gris);transform:rotate(-90deg)}
.ia-ps-c{display:flex;flex-direction:column;gap:14px;padding:0 16px 18px}
.ia-ps-seguir{margin-top:4px;width:100%}
.ia-ps-intro{margin:0;font-size:14px;color:var(--gris);line-height:1.45}

/* El equipo */
.ia-pe{display:flex;flex-direction:column;gap:12px;min-width:0}
.ia-pe-modos{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:4px;padding:4px;border-radius:16px;background:var(--neutro)}
.ia-pe-modos button{min-height:44px;padding:0 4px;border:0;border-radius:12px;background:none;color:var(--gris);font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ia-pe-modos button.sel{background:#fff;color:var(--tinta);box-shadow:0 1px 3px rgba(20,17,17,.14)}
.ia-pe-marcas{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -16px;padding:2px 16px 4px;scrollbar-width:none}
.ia-pe-marcas::-webkit-scrollbar{display:none}
.ia-pe-marcas .ia-filtro span{margin-left:4px;font-weight:600;opacity:.6}
.ia-pe-buscar{position:relative;display:flex;align-items:center}
.ia-pe-buscar>svg{position:absolute;left:14px;color:var(--gris);pointer-events:none}
.ia-pe-buscar input{width:100%;min-height:52px;padding:12px 44px 12px 44px;border-radius:16px;border:1.5px solid rgba(20,17,17,.14);background:#fff;font:inherit;font-size:16px;color:var(--tinta)}
.ia-pe-buscar input:focus{outline:0;border-color:var(--tinta)}
.ia-pe-buscar input::-webkit-search-cancel-button{display:none}
.ia-pe-borrar{position:absolute;right:4px;width:44px;height:44px;border:0;background:none;font-size:24px;line-height:1;color:var(--gris);cursor:pointer}
.ia-pe-lista{display:flex;flex-direction:column;border:1px solid var(--linea);border-radius:18px;overflow:hidden;background:#fff}
.ia-pe-fila{display:flex;align-items:center;gap:12px;min-height:64px;padding:8px 14px;border:0;border-top:1px solid var(--linea);background:none;text-align:left;cursor:pointer;color:var(--tinta);width:100%;font:inherit}
.ia-pe-fila:first-child{border-top:0}
.ia-pe-fila:active{background:var(--crema)}
.ia-pe-fila>svg{flex:none;color:var(--gris)}
.ia-pe-fila.sel{background:var(--crema)}
.ia-pe-fila.sel>svg{color:var(--verde-txt)}
.ia-pe-kw{flex:none;width:52px;height:44px;border-radius:12px;background:var(--baldosa);color:var(--naranja-txt);display:inline-flex;align-items:baseline;justify-content:center;padding-top:9px;font-family:'Antonio','Inter',Impact,sans-serif;font-size:20px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.ia-pe-kw small{font-family:Inter,system-ui,sans-serif;font-size:10.5px;font-weight:800;margin-left:1px}
.ia-pe-kw.grande{width:60px;height:56px;padding-top:0;align-items:center;font-size:24px}
.ia-pe-txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-pe-txt b{font-size:15.5px;line-height:1.3;overflow-wrap:anywhere}
.ia-pe-txt small{font-size:13px;color:var(--gris);line-height:1.35;overflow-wrap:anywhere}
.ia-pe-mas{min-height:52px;border:0;border-top:1px solid var(--linea);background:var(--crema);font:inherit;font-size:14.5px;font-weight:800;color:var(--tinta);cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.ia-pe-nada{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;padding:12px 14px;border-radius:18px;background:var(--crema);font-size:14.5px;color:var(--gris)}
.ia-pe-elegido{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px 12px;align-items:center;padding:14px;border-radius:18px;background:var(--crema);border:1.5px solid var(--tinta)}
.ia-pe-elegido>div:not(.ia-pe-elegido-acc){min-width:0;display:flex;flex-direction:column;gap:2px}
.ia-pe-elegido b{font-size:16.5px;line-height:1.3;overflow-wrap:anywhere}
.ia-pe-elegido small{font-size:13px;color:var(--gris);line-height:1.35;overflow-wrap:anywhere}
.ia-pe-elegido .ia-eyebrow{margin:0}
.ia-pe-elegido-acc{grid-column:1 / -1;display:flex;align-items:center;gap:8px}
.ia-pe-elegido-acc .ia-btn{flex:1 1 auto}
.ia-pe-nota{margin:0;padding:12px 14px;border-radius:16px;background:var(--crema);font-size:14.5px;line-height:1.5;color:var(--tinta)}
@media (min-width:520px){
  .ia-pe-elegido{grid-template-columns:auto minmax(0,1fr) auto}
  .ia-pe-elegido-acc{grid-column:auto}
  .ia-pe-elegido-acc .ia-btn{flex:none}
}
@media (min-width:1024px){
  .ia-ps-h>button{padding:16px 20px}
  .ia-ps-c{padding:0 20px 20px}
  .ia-pe-marcas{margin:0;padding:2px 0 4px;flex-wrap:wrap;overflow:visible}
}
`;
