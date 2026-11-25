// ─── estilo.js — lo propio de la app RITE, encima del CSS `.ca-` de cee ──────
// La base es la de la app de certificadores (certificadores/ui/estilo.js,
// estilo «carta de pago», regla 164). Aquí solo lo que no existe allí, con
// prefijo `.rt-`: el editor de estancias, la tabla de cargas y los pasos.
// ─────────────────────────────────────────────────────────────────────────────
export const CSS_RITE = `
.rt-marca-txt{display:inline-flex;align-items:center;height:26px;padding:0 11px;border-radius:999px;background:var(--tinta);color:#fff;font:800 10.5px/1 'Inter',sans-serif;letter-spacing:.11em;text-transform:uppercase;white-space:nowrap}
.rt-marca-txt i{font-style:normal;color:var(--lima);margin-right:5px}
.rt-nav{display:flex;align-items:center;gap:8px}
.rt-pasos{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -2px 14px;padding:2px}
.rt-pasos::-webkit-scrollbar{display:none}
.rt-paso{appearance:none;flex:none;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 12px 0 8px;border-radius:999px;border:1px solid var(--linea);background:#fff;color:var(--gris);font:700 13px 'Inter',sans-serif;cursor:pointer}
.rt-paso b{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;background:var(--crema);color:var(--tinta);font:700 12px 'Inter',sans-serif}
.rt-paso-act{background:var(--tinta);color:#fff;border-color:var(--tinta)}
.rt-paso-act b{background:var(--naranja);color:#08090c}
.rt-paso-ok b{background:rgba(177,209,62,.3);color:var(--verde-txt)}
.rt-planta{border:1px solid var(--linea);border-radius:20px;background:#fff;margin-top:14px;overflow:hidden}
.rt-planta-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px 12px 16px;background:#fcfbf9;border-bottom:1px solid var(--linea)}
.rt-planta-cab b{font:700 18px 'Antonio','Inter',sans-serif;letter-spacing:.01em}
.rt-local{display:grid;grid-template-columns:1fr auto;gap:8px 10px;align-items:center;padding:12px 12px 12px 16px}
.rt-local + .rt-local{border-top:1px solid var(--linea)}
.rt-local-nom b{display:block;font-size:14.5px;font-weight:700;line-height:1.25}
.rt-local-nom small{display:block;font-size:12.5px;color:var(--gris);margin-top:2px}
.rt-local-campos{grid-column:1 / -1;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.rt-mini{display:block}
.rt-mini span{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gris);margin:0 2px 4px}
.rt-mini .ca-input{min-height:44px;padding:8px 10px;font-size:15px;border-radius:12px}
.rt-anadir{display:flex;flex-wrap:wrap;gap:6px;padding:12px 12px 14px 16px;border-top:1px solid var(--linea);background:#fdfcfa}
.rt-anadir button{appearance:none;min-height:36px;padding:0 12px;border-radius:999px;border:1.5px dashed rgba(20,17,17,.22);background:#fff;color:var(--tinta);font:700 13px 'Inter',sans-serif;cursor:pointer}
.rt-anadir button:hover{border-style:solid}
.rt-cargas{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.rt-cargas th{text-align:right;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris);padding:10px 5px;border-bottom:1px solid var(--linea);white-space:nowrap}
.rt-cargas th:first-child,.rt-cargas td:first-child{text-align:left;padding-left:14px;white-space:normal}
.rt-cargas th:last-child,.rt-cargas td:last-child{padding-right:14px}
.rt-cargas td{text-align:right;padding:9px 5px;white-space:nowrap;border-top:1px solid var(--linea)}
.rt-cargas tr:first-child td{border-top:0}
.rt-cargas tfoot td{font-weight:800;border-top:1.5px solid var(--tinta);background:#fcfbf9}
.rt-cargas .rt-real{color:var(--verde-txt);font-weight:700}
.rt-equipo{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid var(--tinta);border-radius:16px;background:#fffdf5;margin-top:12px}
.rt-equipo > div{flex:1;min-width:0}
.rt-equipo b{display:block;font-size:15px}
.rt-equipo small{display:block;font-size:13px;color:var(--gris)}
.rt-resultados{display:grid;gap:8px;margin-top:10px;max-height:340px;overflow:auto}
.rt-guardado{font-size:12.5px;color:var(--gris2);font-weight:600;white-space:nowrap}
.rt-lista-faltan{margin:6px 0 0;padding:0 0 0 18px}
.rt-lista-faltan li + li{margin-top:3px}
@media (max-width:479px){.rt-solo-ancho{display:none}}
@media (min-width:700px){.rt-local{grid-template-columns:1fr 280px}.rt-local-campos{grid-column:auto}}
`;
