// La FICHA DEL LOTE con el estilo de Facturación (regla 164: Fran lo pidió el
// 12/11/2026, «toma como referencia lo que has creado para el visor del Sujeto
// Obligado… el nuevo kit de marca»). Se monta junto al CSS `.fx-` de
// facturacion/estilo.jsx; aquí va solo lo propio, con prefijo `.lt-`.
// Ver docs/conocimiento/lotes/la-ficha-del-lote-en-crema.md.
//
// `.lt-piel` es la RED DE SEGURIDAD para los paneles que aún pintan con las
// utilidades oscuras de Tailwind (el cobro a los clientes): las traduce al papel
// crema sin reescribirlos. Lo nuevo se escribe con `.fx-`/`.lt-`, no con la piel.

export const CSS_LT = `
/* ═══ Ficha del lote · prefijo .lt- ═══ */
.lt-capa{position:fixed;inset:0;z-index:310;display:flex;justify-content:center;align-items:flex-start;overflow-y:auto;overscroll-behavior:contain;
  background:rgba(20,17,17,.58);animation:fx-fade .2s ease both}
.lt-hoja{--fx-tope:0px;width:100%;min-height:100%;overflow:clip;animation:fx-sube .32s cubic-bezier(.2,.8,.2,1) both}
@media (min-width:768px){
  .lt-capa{padding:28px 20px}
  .lt-hoja{max-width:1000px;min-height:0;border-radius:28px;box-shadow:var(--sombra-alta)}
}
.lt-in{padding:0 16px}
@container fx (min-width:768px){.lt-in{padding:0 30px}}

/* ── cabecera ── */
.lt-cab{padding-top:16px;padding-bottom:4px}
.lt-cab-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.lt-cab-top .fx-eyebrow{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lt-cab-acc{display:flex;align-items:center;gap:6px;flex:none}
.lt-tit{font-size:40px;line-height:1;margin:8px 0 0;word-break:break-word}
.lt-sub{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:12px 0 0}
.lt-estado{display:grid;gap:10px;margin-top:16px;padding:12px;border-radius:20px;background:#fff;border:1px solid var(--linea);box-shadow:var(--sombra-baja)}
.lt-estado-k{font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--gris)}
.lt-estado-v{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px}
.lt-estado-v b{font-family:var(--display);font-weight:700;font-size:22px;line-height:1.05}
.lt-estado .fx-select{min-height:44px;font-weight:600}
@container fx (min-width:700px){.lt-tit{font-size:52px}.lt-estado{grid-template-columns:minmax(0,1fr) minmax(220px,300px);align-items:center;padding:14px 16px}}

/* ── los pasos del trámite (se pulsan: llevan a su fase) ── */
.lt-pasos{list-style:none;margin:16px 0 0;padding:0;display:grid;grid-template-columns:repeat(var(--n,7),minmax(0,1fr));gap:4px}
.lt-paso{position:relative}
.lt-paso button{appearance:none;width:100%;background:none;border:0;cursor:pointer;padding:4px 2px 6px;display:grid;justify-items:center;gap:6px;border-radius:12px;color:var(--gris);font:600 11.5px/1.2 var(--texto);text-align:center}
.lt-paso button:hover{background:rgba(20,17,17,.04);color:var(--tinta)}
.lt-paso::before{content:"";position:absolute;top:19px;left:calc(-50% + 18px);right:calc(50% + 18px);height:2px;border-radius:2px;background:var(--linea2)}
.lt-paso:first-child::before{display:none}
.lt-paso.lt-hecho::before,.lt-paso.lt-actual::before{background:var(--filete)}
.lt-bola{width:30px;height:30px;border-radius:999px;display:grid;place-items:center;font:800 12.5px/1 var(--texto);background:#fff;border:1.5px solid var(--linea2);color:var(--gris);font-variant-numeric:tabular-nums}
.lt-hecho .lt-bola{background:var(--ok-bg);border-color:rgba(177,209,62,.55);color:var(--verde-txt)}
.lt-actual .lt-bola{background:var(--tinta);border-color:var(--tinta);color:var(--lima);box-shadow:0 0 0 4px rgba(255,160,0,.25)}
.lt-actual button{color:var(--tinta);font-weight:800}
.lt-paso-et{display:none;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@container fx (min-width:640px){.lt-paso-et{display:block}}

/* ── pestañas (sticky dentro de la hoja) ── */
.lt-tabs{position:sticky;top:0;z-index:6;display:flex;gap:2px;margin-top:14px;padding:0 16px;background:var(--crema);border-bottom:1px solid var(--linea2);overflow-x:auto;scrollbar-width:none}
.lt-tabs::-webkit-scrollbar{display:none}
@container fx (min-width:768px){.lt-tabs{padding:0 30px}}
/* A 375 px las tres pestañas caben sin desplazar: menos aire entre ellas. */
@container fx (max-width:479px){.lt-tabs{padding:0 6px;gap:0}.lt-tabs .fx-tab{padding:0 7px;font-size:14px;gap:5px}}
.lt-cuerpo{padding:18px 16px 40px}
@container fx (min-width:768px){.lt-cuerpo{padding:22px 30px 48px}}
.lt-pila > * + *{margin-top:14px}
@container fx (min-width:820px){.lt-dos{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* ── «lo siguiente» ── */
.lt-sig{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.lt-sig > div{flex:1 1 260px;min-width:0}
.lt-sig h3{margin:6px 0 0}
.lt-sig p{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--gris)}
.lt-sig .fx-btn{align-self:center}
@container fx (max-width:639px){.lt-sig .fx-btn{width:100%}}

/* ── cifras ── */
.lt-kpis{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
@container fx (min-width:700px){.lt-kpis{grid-template-columns:repeat(var(--n,3),minmax(0,1fr))}}
.lt-kpi{display:flex;flex-direction:column;gap:6px;min-width:0;padding:14px 14px 12px;background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:var(--sombra-baja)}
.lt-kpi-v{font-family:var(--display);font-weight:700;font-size:28px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lt-kpi-v small{font-size:.55em;margin-left:3px}
.lt-kpi-verif{font-size:12.5px;font-weight:700;color:var(--verde-txt)}
@container fx (min-width:700px){.lt-kpi-v{font-size:32px}}
.lt-cobro{display:flex;gap:14px 18px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}
.lt-cobro > div{min-width:0}
.lt-cobro .fx-importe{font-size:44px;margin-top:8px}
.lt-cobro-acc{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.lt-cobro-acc .fx-input{width:auto;min-height:44px}
@container fx (max-width:639px){.lt-cobro-acc{width:100%}.lt-cobro-acc .fx-input{flex:1}.lt-cobro .fx-importe{font-size:38px}}
.lt-mwh{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px}
@container fx (min-width:640px){.lt-mwh{grid-template-columns:repeat(4,minmax(0,1fr))}}
.lt-mwh > div{padding:10px 12px;border-radius:14px;background:var(--crema);border:1px solid var(--linea);min-width:0}
.lt-mwh span{display:block;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.lt-mwh b{display:block;font-family:var(--display);font-weight:700;font-size:22px;line-height:1.1;margin-top:3px}
.lt-mwh b small{font:600 11px var(--texto);color:var(--gris);margin-left:3px}
.lt-mwh i{display:block;font-style:normal;font-size:11.5px;color:var(--gris2);margin-top:1px}
.lt-mwh .lt-margen b{color:var(--verde-txt)}
.lt-nota{margin:10px 0 0;font-size:12.5px;line-height:1.5;color:var(--gris)}
.lt-nota b{color:var(--tinta);font-weight:700}
.lt-campos{display:grid;gap:14px;grid-template-columns:minmax(0,1fr);margin-top:14px;align-items:start}
.lt-campos > .fx-campo{align-content:start}
.lt-campos .fx-num{text-align:left}
.lt-campo-et{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:24px}
.lt-campos > .fx-campo > span:first-child{min-height:24px;display:flex;align-items:center}
.lt-campos .lt-ayuda{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@container fx (min-width:640px){.lt-campos{grid-template-columns:repeat(2,minmax(0,1fr))}}
.lt-ayuda{display:block;font-size:12px;line-height:1.45;color:var(--gris2)}
.lt-ayuda b{color:var(--tinta);font-weight:700}
.lt-ok-txt{color:var(--verde-txt)!important}
.lt-ambar-txt{color:#7a4b00!important}
.lt-datos{display:flex;flex-wrap:wrap;gap:12px 26px;margin-top:12px}
.lt-datos > div{min-width:0}
.lt-datos span{display:block;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.lt-datos b{display:block;font-size:15px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}

/* ── las partes del lote (S.O. y verificador) ── */
.lt-partes{padding:4px 20px}
@container fx (min-width:768px){.lt-partes{padding:4px 28px}}
.lt-parte + .lt-parte{border-top:1px solid var(--linea)}
/* Las dos filas con el MISMO esqueleto: logo · texto · acciones, a la misma altura. */
.lt-parte-fila{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:14px;align-items:center;min-height:76px;padding:12px 0}
.lt-parte-fila .lt-logo{width:44px;height:44px;border-radius:12px}
.lt-parte-txt{min-width:0;display:grid;gap:2px}
.lt-parte-txt b{font-family:var(--display);font-weight:700;font-size:21px;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lt-parte-txt .fx-eyebrow{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lt-parte-txt small{font-size:12.5px;color:var(--gris2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lt-parte-acc{display:flex;align-items:center;gap:2px}
.lt-mas{border-color:var(--linea);background:#fff;color:var(--tinta)}
.lt-mas svg{transition:transform .2s}
.lt-mas-abierto svg{transform:rotate(45deg)}
.lt-parte-mas{display:grid;gap:14px;padding:0 0 16px 58px}
@container fx (max-width:519px){.lt-parte-acc > a{display:none}.lt-parte-mas{padding-left:0}.lt-parte-fila{grid-template-columns:40px minmax(0,1fr) auto;gap:10px}.lt-parte-fila .lt-logo{width:40px;height:40px}.lt-parte-txt b{font-size:19px}}
.lt-logo{flex:none;width:48px;height:48px;border-radius:14px;background:var(--crema);border:1px solid var(--linea);display:grid;place-items:center;overflow:hidden}
.lt-personas{display:grid;gap:10px;grid-template-columns:minmax(0,1fr);margin-top:14px}
@container fx (min-width:560px){.lt-personas{grid-template-columns:repeat(2,minmax(0,1fr))}}
.lt-persona{min-width:0;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea)}
.lt-persona > b{display:block;font-size:15px;font-weight:700;margin-top:3px;line-height:1.25;overflow-wrap:anywhere}
.lt-contacto{display:flex;align-items:center;gap:7px;min-height:30px;font-size:13.5px;color:var(--tinta);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
a.lt-contacto:hover{text-decoration:underline;text-underline-offset:3px}
.lt-contacto svg{flex:none;color:var(--gris)}
.lt-contacto-no{color:var(--gris2)}
@media (pointer:coarse){.lt-contacto{min-height:40px}}

/* ── expedientes ── */
.lt-exps{display:grid;gap:8px;margin-top:12px}
.lt-exp{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;background:#fff;border:1px solid var(--linea);border-radius:18px;box-shadow:var(--sombra-baja);min-width:0}
.lt-exp-cuerpo{appearance:none;flex:1;min-width:0;display:grid;gap:3px;background:none;border:0;padding:0;text-align:left;font:inherit;color:inherit}
button.lt-exp-cuerpo{cursor:pointer}
button.lt-exp-cuerpo:hover .lt-exp-n{text-decoration:underline;text-underline-offset:3px}
.lt-exp-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.lt-exp-n{font:700 14px/1.2 var(--mono);color:var(--tinta)}
.lt-e{display:inline-grid;place-items:center;min-width:30px;height:22px;padding:0 6px;border-radius:7px;background:var(--tinta);color:var(--lima);font:800 11px/1 var(--texto)}
.lt-exp-cli{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lt-exp-dir{font-size:12.5px;color:var(--gris);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lt-exp-cifras{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:3px;font-size:12.5px;color:var(--gris);font-variant-numeric:tabular-nums}
.lt-exp-cifras b{color:var(--tinta);font-weight:700}
.lt-exp-cifras .lt-verif b{color:var(--verde-txt)}
.lt-exp-extra{font-size:12.5px;color:var(--gris);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lt-exp-acc{display:flex;align-items:center;gap:4px;flex:none}
@container fx (max-width:519px){.lt-exp{align-items:flex-start}.lt-exp-acc{flex-direction:column-reverse;align-items:flex-end}}
.lt-filtros{display:grid;gap:8px;grid-template-columns:minmax(0,1fr);margin-top:12px}
@container fx (min-width:640px){.lt-filtros{grid-template-columns:repeat(2,minmax(0,1fr))}.lt-filtros .lt-ancho{grid-column:1/-1}}
.lt-elegibles{max-height:420px;overflow-y:auto;overscroll-behavior:contain;margin:12px -4px 0;padding:2px 4px}
.lt-elegibles .lt-exps{margin-top:0}
.lt-prop{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);min-width:0}
.lt-prop > div{flex:1;min-width:0}
.lt-prop b{display:block;font-size:14px;font-weight:700;line-height:1.35}
.lt-prop small{display:block;font-size:12.5px;color:var(--gris);line-height:1.4;margin-top:2px;overflow-wrap:anywhere}
@container fx (max-width:519px){.lt-prop{flex-wrap:wrap}.lt-prop .fx-btn{width:100%}}
.lt-sugs{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}

/* ── documentación: las fases ── */
.lt-fases-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 2px 12px}
.lt-fases-cab p{margin:0;font-size:13.5px;color:var(--gris)}
.lt-fases-cab p b{color:var(--tinta)}
.lt-fase{position:relative;background:#fff;border:1px solid var(--linea);border-radius:22px;box-shadow:var(--sombra-baja);transition:border-color .15s,box-shadow .15s;scroll-margin-top:80px}
.lt-fase + .lt-fase{margin-top:10px}
.lt-fase:hover{border-color:rgba(20,17,17,.18)}
.lt-fase-actual{border-color:rgba(255,160,0,.55);box-shadow:0 0 0 3px rgba(255,160,0,.14),var(--sombra-baja)}
.lt-fase-actual::before{content:"";position:absolute;top:0;left:18px;right:18px;height:3px;border-radius:0 0 3px 3px;background:var(--filete)}
.lt-fase-hecha{background:#fcfdf8}
.lt-fase-suelta{border-style:dashed;border-color:var(--naranja);background:#fffaf0}
.lt-fase-cab{appearance:none;width:100%;display:flex;align-items:center;gap:12px;min-height:60px;padding:12px 14px 12px 16px;background:none;border:0;cursor:pointer;text-align:left;font:inherit;color:inherit;border-radius:22px}
.lt-fase-cab .lt-bola{flex:none;width:32px;height:32px}
.lt-fase-hecha .lt-fase-cab .lt-bola{background:var(--ok-bg);border-color:rgba(177,209,62,.55);color:var(--verde-txt)}
.lt-fase-actual .lt-fase-cab .lt-bola{background:var(--tinta);border-color:var(--tinta);color:var(--lima)}
.lt-fase-tit{flex:1;min-width:0;font-size:15.5px;font-weight:700;line-height:1.3}
.lt-fase-bloq .lt-fase-tit{color:var(--gris)}
.lt-fase-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.lt-flecha{flex:none;color:var(--gris);transition:transform .15s}
.lt-fase-cab[aria-expanded="true"] .lt-flecha{transform:rotate(180deg)}
/* En el móvil el título no se estruja entre los chips: los chips bajan a su fila. */
@container fx (max-width:519px){.lt-fase-cab{display:grid;grid-template-columns:32px minmax(0,1fr) auto;column-gap:12px;row-gap:6px}.lt-fase-cab .lt-flecha{grid-column:3;grid-row:1}.lt-fase-chips{grid-column:2/4;grid-row:2;justify-content:flex-start}.lt-fase-chips:empty{display:none}}
.lt-fase-cuerpo{padding:0 16px 16px}
.lt-fase-cuerpo > * + *{margin-top:14px}
@container fx (min-width:700px){.lt-fase-cuerpo{padding:0 20px 18px 60px}}
.lt-sec{margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris)}
.lt-tareas{display:flex;flex-wrap:wrap;gap:8px}
@container fx (max-width:519px){.lt-tareas .fx-btn{width:100%}}
.lt-docs{display:grid;gap:8px}
.lt-bloqueo{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:14px;background:var(--hundido);font-size:13px;line-height:1.5;color:#3b3e45}
.lt-bloqueo svg{flex:none;margin-top:2px;color:var(--gris)}
.lt-tile-azul{background:var(--pizarra-bg);color:var(--pizarra-txt)}
/* sin backdrop-filter en la capa: un filtro ancla los position:fixed de los popups
   que se abren dentro a la capa que hace scroll (regla 29.b) */

/* un documento */
.lt-doc{border:1px solid var(--linea);border-radius:16px;background:#fff;min-width:0}
.lt-doc-ok{border-color:rgba(177,209,62,.45);background:#fbfdf4}
.lt-doc-recibido{border-color:#c5d3e2;background:#f7f9fc}
.lt-doc-fila{display:flex;align-items:center;gap:12px;padding:10px 10px 10px 12px;flex-wrap:wrap}
.lt-doc-txt{flex:1 1 200px;min-width:0}
.lt-doc-txt b{display:block;font-size:14px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.lt-doc-txt small{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.lt-doc-der{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:none;margin-left:auto}
/* Los botones de cada fila, en columnas FIJAS: Ver · sustituir · quitar. El chip queda
   alineado por la derecha y los botones caen en el mismo sitio en todas las filas. */
.lt-doc-btns{display:grid;grid-template-columns:58px 40px 40px;gap:2px;align-items:center;width:144px}
.lt-doc-btns .lt-c-ver{grid-column:1;justify-content:center;width:100%}
.lt-doc-btns .lt-c-rep{grid-column:2}
.lt-doc-btns .lt-c-del{grid-column:3}
.lt-doc-btns .fx-ico-btn{width:40px;height:40px}
.lt-doc-btns > .lt-subir.fx-btn{grid-column:1/-1;justify-content:center;width:100%}
.lt-doc-sub{margin:0 10px 10px;padding:8px 10px;border-radius:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px}
.lt-doc-sub-ok{background:var(--ok-bg);color:var(--ok-txt)}
.lt-doc-sub-azul{background:var(--pizarra-bg);color:var(--pizarra-txt)}
.lt-doc-sub b{font-weight:800;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.lt-doc-extra{margin:0 10px 10px}
.lt-doc-extra > * + *{margin-top:6px}
/* Lo que cuelga de un hueco empieza donde su título, no en el borde. */
.lt-doc-acc{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:0 10px 10px 60px}
.lt-hueco{border:1.5px dashed var(--linea2);border-radius:16px;background:transparent;transition:border-color .15s,background-color .15s}
.lt-hueco:hover{border-color:rgba(20,17,17,.3)}
.lt-hueco-sig{border-color:#e3b04a;background:#fffaf0}
.lt-hueco-sig .lt-doc-txt b{color:var(--tinta)}
.lt-hueco .lt-doc-txt b{color:#3b3e45}
.lt-hueco-peq .lt-doc-fila{padding:6px 10px 6px 12px}
.lt-resalte{border-color:var(--naranja)!important;background:#fff4dc!important;box-shadow:0 0 0 3px rgba(255,160,0,.25)!important}
.lt-dato{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:12px;background:var(--crema);border:1px solid var(--linea);font-size:12.5px;color:var(--gris);line-height:1.4}
.lt-dato > b{color:var(--tinta);font-weight:700}
.lt-dato-ok{background:#f4f8e8;border-color:rgba(177,209,62,.4)}
.lt-dato-ok > b{color:var(--ok-txt)}
.lt-dato-ambar{background:var(--ambar-bg);border-color:var(--ambar-borde)}
.lt-dato-ambar > b{color:#7a4b00}
.lt-dato .lt-empuja{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
@container fx (max-width:519px){.lt-dato .lt-empuja{width:100%;margin-left:0;display:grid;gap:6px}.lt-dato .lt-empuja .fx-btn{width:100%;justify-content:center}}
.lt-dato-lista{margin:4px 0 0;padding:0;list-style:none;font-size:12px;color:var(--gris);line-height:1.45}
.lt-dato-lista b{color:var(--tinta)}
.lt-pista{display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 14px;border-radius:16px;border:1.5px dashed var(--linea2);cursor:pointer;font-size:13.5px;color:var(--gris);transition:border-color .15s,background-color .15s}
.lt-pista:hover{border-color:rgba(20,17,17,.3);color:var(--tinta)}
.lt-pista span{flex:1;min-width:0}
.lt-pista u{flex:none;font-weight:700;color:var(--tinta);text-underline-offset:3px}
.lt-pista-activa{border-color:var(--naranja);background:#fff4dc;color:var(--tinta)}
.lt-input-peq{width:150px!important;min-height:38px!important;font-size:13.5px!important}
.lt-subir{position:relative;overflow:hidden}
.lt-subir input{position:absolute;inset:0;opacity:0;cursor:pointer;font-size:0}
.lt-subir[aria-disabled="true"]{opacity:.5;pointer-events:none}

/* ── beCAE en vivo ── */
.lt-becae{padding:14px 16px;border-radius:20px;background:#fff;border:1px solid #c5d3e2;box-shadow:var(--sombra-baja)}
.lt-becae-cab{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lt-becae-cab .fx-eyebrow{color:var(--pizarra-txt)}
.lt-becae-chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 10px;border-radius:10px;font-size:12.5px;font-weight:700}
.lt-becae-chip i{font-style:normal;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
.lt-becae-chip span{font-family:var(--mono);font-size:12px}
.lt-becae > * + *{margin-top:10px}
.lt-becae-docs{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.lt-becae-docs > span{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.lt-becae-docs .fx-btn{max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:left;height:auto;min-height:36px}
.lt-msg{margin:0;font-size:13px;line-height:1.5;white-space:pre-line}
.lt-msg-ok{color:var(--ok-txt)}
.lt-msg-ambar{color:#7a4b00}

/* ═══ PIEL: utilidades oscuras de Tailwind → papel crema (paneles sin migrar) ═══ */
.lt-piel{color:var(--tinta)}
.lt-piel [class*="text-white"]{color:var(--tinta)}
.lt-piel [class*="text-white/"]{color:var(--gris)}
.lt-piel [class*="text-white/8"],.lt-piel [class*="text-white/9"],.lt-piel [class*="text-white/7"]{color:#2b2d31}
.lt-piel [class*="text-white/2"],.lt-piel [class*="text-white/3"]{color:var(--gris2)}
.lt-piel [class*="text-emerald"],.lt-piel [class*="text-green"],.lt-piel [class*="text-lime"]{color:var(--verde-txt)}
.lt-piel [class*="text-amber"],.lt-piel [class*="text-yellow"],.lt-piel [class*="text-orange"]{color:#7a4b00}
.lt-piel [class*="text-red"],.lt-piel [class*="text-rose"]{color:var(--vence-txt)}
.lt-piel [class*="text-cyan"],.lt-piel [class*="text-sky"],.lt-piel [class*="text-blue"]{color:var(--pizarra-txt)}
.lt-piel [class*="text-fuchsia"],.lt-piel [class*="text-violet"],.lt-piel [class*="text-purple"]{color:#5b3b8c}
.lt-piel [class*="text-brand"]{color:var(--naranja-txt)}
.lt-piel [class*="text-black"]{color:#08090c}
.lt-piel [class*="bg-bkg"],.lt-piel [class*="bg-black/"]{background-color:#fff}
.lt-piel [class*="bg-white/"]{background-color:var(--crema)}
.lt-piel [class*="bg-emerald-"],.lt-piel [class*="bg-green-"]{background-color:#f4f8e8}
.lt-piel [class*="bg-amber-"],.lt-piel [class*="bg-yellow-"]{background-color:var(--ambar-bg)}
.lt-piel [class*="bg-red-"],.lt-piel [class*="bg-rose-"]{background-color:#fff1d1}
.lt-piel [class*="bg-cyan-"],.lt-piel [class*="bg-sky-"],.lt-piel [class*="bg-blue-"]{background-color:#f3f6fa}
.lt-piel [class*="bg-fuchsia-"],.lt-piel [class*="bg-violet-"]{background-color:#f6f1fb}
.lt-piel [class*="bg-brand/"]{background-color:#fff4dc}
.lt-piel [class~="bg-brand"],.lt-piel [class~="bg-emerald-400"],.lt-piel [class~="bg-emerald-500"]{background-color:var(--naranja);color:#08090c}
.lt-piel [class*="border-white"]{border-color:var(--linea2)}
.lt-piel [class*="border-emerald"]{border-color:rgba(177,209,62,.5)}
.lt-piel [class*="border-amber"]{border-color:var(--ambar-borde)}
.lt-piel [class*="border-red"]{border-color:var(--vence-borde)}
.lt-piel [class*="border-cyan"],.lt-piel [class*="border-sky"],.lt-piel [class*="border-blue"]{border-color:#c5d3e2}
.lt-piel [class*="border-fuchsia"]{border-color:#d9c8ef}
.lt-piel [class*="border-brand"]{border-color:rgba(255,160,0,.5)}
.lt-piel input,.lt-piel select,.lt-piel textarea{background-color:#fff;color:var(--tinta);border-color:var(--linea2);color-scheme:light}
.lt-piel input::placeholder,.lt-piel textarea::placeholder{color:var(--gris2)}
.lt-piel select option{background:#fff;color:#141111}
.lt-piel a{color:inherit}
.lt-piel [class*="text-[8px]"],.lt-piel [class*="text-[9px]"]{font-size:11px!important}
.lt-piel [class*="text-[10px]"]{font-size:12px!important}
.lt-piel [class*="text-[11px]"]{font-size:12.5px!important}
.lt-piel [class*="text-[12px]"]{font-size:13.5px!important}
@media (prefers-reduced-motion:reduce){.lt-capa,.lt-hoja{animation:none}.lt-flecha{transition:none}}
`;
