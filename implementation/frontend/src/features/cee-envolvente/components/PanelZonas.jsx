import { useEffect, useState } from 'react';
import { areaPoligono } from '../logic/geometriaPlano';
import { COLOR_CROQUIS, ETIQUETA_USO_ZONA, USOS_ZONA, textoCatastro } from '../logic/zonasFuera';
import { IconoDeshacer, IconoLapiz, IconoMovil, IconoVivienda } from './IconosCroquis';
import { estrecha, useAnchoTira } from '../logic/anchoTira';
import {
    BotonTira, ChipTira, EtiquetaTira, GrupoTira, MandoChip, SegmentoTira, Tira, TiraModo,
} from './TiraPlano';

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ ES VIVIENDA EN ESTA PLANTA — el mando que vive bajo la barra de cada plano.
//
// POR QUÉ EXISTE — 26RES080_85 (CL Sol 20, Campo de Criptana, 28/09/2026). La
// casa es UN cuerpo de dos plantas y en la planta BAJA tiene un garaje dentro,
// con la vivienda encima. Catastro no dibuja esa línea, y las dos herramientas
// que había no servían:
//   · una PARED DIBUJADA separa, pero no quita superficie («me seguía sumando
//     la superficie de suelo»);
//   · DELIMITAR LA VIVIENDA es un prisma para TODAS las plantas, así que el
//     garaje se llevaba también la primera («esa misma planta se copia en
//     planta primera»).
// El certificador lo dejó tras una hora y lo hizo a mano.
//
// Una ZONA se dibuja sobre el plano de UNA planta y el motor la resta SOLO de
// ella: la pared de la casa contra el garaje sale como partición con espacio no
// habitable, la fachada del garaje deja de ser de la vivienda y el forjado de
// la planta de arriba es un suelo sobre espacio no habitable.
//
// Delimitar la vivienda sigue aquí para lo que es —un ADOSADO dentro de una
// comunidad—, dicho con esas palabras y en segundo plano.
//
// CÓMO SE VE (2026-10-08): las piezas son las de `TiraPlano.jsx` —controles de
// 28 px como la barra del plano, ningún texto partido en dos líneas— y, con la
// tarjeta estrecha («Las dos»), las etiquetas se ACORTAN («✂ Quitar zona»,
// «Adosado», el móvil solo con su icono) con el `title` de siempre.
// ─────────────────────────────────────────────────────────────────────────────


export function ViviendaPlantaControl({
    planta, zonas = [], dibujandoZona = false, vertices = [], uso = 'GARAJE', onUso,
    onZonaModo, onZonaCerrar, onZonaCancelar, onZonaQuitar,
    // El contorno del ADOSADO: solo llega al plano en el que se ofrece.
    recorte = null, onRecorteModo = null, onRecorteQuitar = null, recorteSugerido = false,
    midiendo = false,
    // Delimitar el adosado con el DEDO en el móvil, y el contorno que se está
    // dibujando allí ahora mismo (para decirlo en la barra).
    onRecorteMovil = null, contornoMovil = null,
    // El CROQUIS a mano alzada: lo más rápido cuando se sabe DÓNDE está cada
    // cosa pero no sus medidas. Los m² los pone Catastro (`catastroPlanta`).
    croquis = [], dibujandoCroquis = false, usoCroquis = 'GARAJE', onUsoCroquis,
    onCroquisModo = null, onCroquisAjustar, onCroquisDeshacer, onCroquisBorrar,
    catastroPlanta = [],
    // PINTAR DESDE EL MÓVIL: la sesión abierta en ESTA planta (o null) y sus
    // mandos. Lo que se pinta allí aparece en este plano según se dibuja.
    croquisMovil = null, abriendoMovil = false, onCroquisMovil = null,
    onCroquisMovilQr = null, onCroquisMovilCerrar = null,
    // La PROPUESTA de croquis (ver `gis/croquis_propuesta.py` en el motor):
    // dónde está, probablemente, lo que Catastro declara que no es vivienda.
    // Se OFRECE —«Ver la propuesta» la carga como un croquis más, que se
    // corrige y se ajusta igual— y se dice por qué va cada mancha donde va.
    propuesta = null, onVerPropuesta = null, notasPropuesta = null,
}) {
    // Cerrar el enlace con manchas pintadas y sin ajustar las DESCARTA: pide
    // un segundo toque (el hook va antes de cualquier `return`).
    const [confirmaCerrar, setConfirmaCerrar] = useState(false);
    useEffect(() => {
        if (!confirmaCerrar) return undefined;
        const t = setTimeout(() => setConfirmaCerrar(false), 3000);
        return () => clearTimeout(t);
    }, [confirmaCerrar]);
    // Lo que mide la tira: con la tarjeta estrecha las etiquetas se ACORTAN en
    // vez de partirse en dos líneas. También antes de cualquier `return`.
    const [refTira, ancho] = useAnchoTira();
    const hintCatastro = textoCatastro(catastroPlanta);
    const hayRecorteMovil = Array.isArray(recorte?.poligono) && recorte.poligono.length >= 3;
    if (croquisMovil) {
        const corto = estrecha(ancho, 620);
        const minimo = estrecha(ancho, 420);
        const pintando = !!croquisMovil.enCurso;
        const cerrar = () => {
            if (croquis.length && !confirmaCerrar) { setConfirmaCerrar(true); return; }
            setConfirmaCerrar(false);
            onCroquisMovilCerrar?.();
        };
        const estado = !croquisMovil.conectado
            ? ['Esperando a que se abra el QR en el móvil…', 'Esperando al móvil…']
            : pintando ? ['Pintando en el móvil…', 'Pintando…']
                       : ['Móvil conectado: lo que pinte aparece aquí', 'Móvil conectado'];
        return (
            <TiraModo tono="violet" refTira={refTira}
                      titulo={<><IconoMovil /> Croquis desde el móvil</>}
                      acciones={<>
                          <BotonTira onClick={onCroquisMovilQr} title="Volver a enseñar el código QR">
                              {corto ? 'QR' : 'Ver QR'}
                          </BotonTira>
                          <BotonTira onClick={() => onCroquisAjustar?.(false)} disabled={!croquis.length || midiendo}
                                     title="Endereza los bordes pero respeta lo dibujado (cuando Catastro está desfasado)">
                              {corto ? 'Enderezar' : 'Solo enderezar'}
                          </BotonTira>
                          <BotonTira tono="principal" mayus onClick={() => onCroquisAjustar?.(true)}
                                     disabled={!croquis.length || midiendo}
                                     title="Lo mismo que pulsar «Ajustar a Catastro» en el móvil">
                              {midiendo ? 'Ajustando…' : minimo ? '✓ Ajustar' : '✓ Ajustar a Catastro'}
                          </BotonTira>
                          <BotonTira tono={confirmaCerrar ? 'peligro' : 'neutro'} cuadrado={!confirmaCerrar}
                                     onClick={cerrar}
                                     aria-label={confirmaCerrar ? 'Confirmar: descartar lo pintado' : 'Dejar de pintar desde el móvil'}
                                     title="Cierra el enlace del móvil (lo pintado sin ajustar se descarta)">
                              {confirmaCerrar ? (minimo ? '¿Descartar?' : '¿Descartar lo pintado?') : '✕'}
                          </BotonTira>
                      </>}
                      instruccion={contornoMovil?.pts?.length
                          ? <span className="font-bold text-emerald-300">
                                Dibujando la vivienda en el móvil · {contornoMovil.pts.length}{' '}
                                {contornoMovil.pts.length === 1 ? 'esquina' : 'esquinas'}
                                {contornoMovil.pts.length >= 3 ? ` · ≈${fmt(areaPoligono(contornoMovil.pts))} m²` : ''}
                                {contornoMovil.cerrado ? ' · cerrado' : ''}
                            </span>
                          : <span className="text-white/55">
                                {croquis.length} {croquis.length === 1 ? 'zona pintada' : 'zonas pintadas'}
                                {hintCatastro && <> · Catastro: {hintCatastro}</>}
                            </span>}
                      pie={onRecorteModo && (
                          // El ADOSADO no se esconde con el móvil conectado: es
                          // justo el caso en que hace falta (un bloque en hilera
                          // medido entero), y escondido no había forma de encontrarlo.
                          <div className="flex basis-full flex-wrap items-center gap-1.5">
                              {hayRecorteMovil ? (
                                  <ChipTira tono="emerald"
                                            title={`Adosado delimitado · ≈${fmt(recorte.area_m2 ?? 0)} m² · todas las plantas`}
                                            mandos={<>
                                                <MandoChip onClick={() => onRecorteModo(true)} disabled={midiendo}
                                                           aria-label="Redibujar el contorno">✎</MandoChip>
                                                {onRecorteQuitar && (
                                                    <MandoChip onClick={onRecorteQuitar} disabled={midiendo}
                                                               aria-label="Quitar el contorno">✕</MandoChip>
                                                )}
                                            </>}>
                                      Adosado delimitado · ≈{fmt(recorte.area_m2 ?? 0)} m² · todas las plantas
                                  </ChipTira>
                              ) : (
                                  <BotonTira onClick={() => onRecorteModo(true)} disabled={midiendo}
                                             tono={recorteSugerido ? 'ambar' : 'neutro'}
                                             title="Para un adosado dentro de una comunidad: vale para TODAS las plantas y lo de fuera es la casa de al lado (medianera)">
                                      <IconoVivienda size={12} /> Delimitar adosado
                                  </BotonTira>
                              )}
                              <span className="whitespace-nowrap text-[10.5px] text-white/50">
                                  o en el móvil, pestaña <b className="text-white/75">Vivienda</b>
                              </span>
                          </div>
                      )}>
                <span title={estado[0]}
                      className={`flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-bold
                                  ${croquisMovil.conectado ? 'text-emerald-300' : 'text-white/70'}`}>
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full
                                      ${croquisMovil.conectado ? 'bg-emerald-400' : 'animate-pulse bg-violet-400'}
                                      ${pintando ? 'animate-pulse' : ''}`} />
                    <span className="truncate">{corto ? estado[1] : estado[0]}</span>
                </span>
            </TiraModo>
        );
    }
    if (dibujandoCroquis) {
        const corto = estrecha(ancho, 640);
        const minimo = estrecha(ancho, 440);
        return (
            <TiraModo tono="violet" refTira={refTira}
                      titulo={<><IconoLapiz /> Croquis de {planta?.nombre?.toLowerCase() || 'esta planta'}</>}
                      contador={`${croquis.length} ${croquis.length === 1 ? 'zona' : 'zonas'}`}
                      acciones={<>
                          <BotonTira onClick={onCroquisDeshacer} disabled={!croquis.length || midiendo} cuadrado
                                     title="Quita la última mancha" aria-label="Quitar la última mancha">
                              <IconoDeshacer size={12} />
                          </BotonTira>
                          {onCroquisMovil && (
                              <BotonTira onClick={onCroquisMovil} disabled={midiendo || abriendoMovil}
                                         cuadrado={corto && !abriendoMovil} aria-label="Seguir en el móvil"
                                         title="Sigue pintando con el dedo en el móvil: lo que pintes allí aparece aquí">
                                  {abriendoMovil ? 'Abriendo…' : <><IconoMovil size={12} />{!corto && 'En el móvil'}</>}
                              </BotonTira>
                          )}
                          <BotonTira onClick={() => onCroquisAjustar?.(false)} disabled={!croquis.length || midiendo}
                                     title="Endereza los bordes pero respeta lo dibujado (cuando Catastro está desfasado)">
                              {corto ? 'Enderezar' : 'Solo enderezar'}
                          </BotonTira>
                          <BotonTira tono="principal" mayus onClick={() => onCroquisAjustar?.(true)}
                                     disabled={!croquis.length || midiendo}
                                     title="Endereza los bordes y ajusta cada zona a los m² de Catastro de esta planta">
                              {midiendo ? 'Ajustando…' : minimo ? '✓ Ajustar' : '✓ Ajustar a Catastro'}
                          </BotonTira>
                          <BotonTira tono="plano" cuadrado aria-label="Cancelar el croquis"
                                     onClick={() => { onCroquisBorrar?.(); onCroquisModo?.(false); }}>
                              ✕
                          </BotonTira>
                      </>}
                      instruccion={<>
                          Rodea cada zona a mano alzada (puedes pasarte por fuera de las paredes).
                          Lo que no pintes es vivienda.{' '}
                          <span className="text-white/50">
                              Las superficies las pone Catastro{hintCatastro ? `: ${hintCatastro}` : ''}.
                          </span>
                      </>}
                      pie={notasPropuesta?.length > 0 && <NotasPropuesta notas={notasPropuesta} />}>
                <PaletaUsos actual={usoCroquis} onElegir={onUsoCroquis} conColor corto={corto} />
            </TiraModo>
        );
    }
    if (dibujandoZona) {
        const corto = estrecha(ancho, 600);
        const minimo = estrecha(ancho, 420);
        const m2 = vertices.length >= 3 ? areaPoligono(vertices) : null;
        return (
            <TiraModo tono="sky" refTira={refTira}
                      titulo="✂ Dibuja lo que NO es vivienda"
                      contador={`${vertices.length} ${vertices.length === 1 ? 'vértice' : 'vértices'}${m2 ? ` · ≈${fmt(m2)} m²` : ''}`}
                      acciones={<>
                          <BotonTira tono="sky" mayus onClick={onZonaCerrar} disabled={vertices.length < 3}>
                              {minimo ? '✓ Cerrar' : '✓ Cerrar y medir'}
                          </BotonTira>
                          <BotonTira tono="plano" cuadrado onClick={onZonaCancelar} aria-label="Cancelar">✕</BotonTira>
                      </>}
                      instruccion={<>
                          Pulsa sus esquinas y cierra en el primer punto (o doble clic). Los puntos se
                          pegan a las paredes; por fuera del edificio puedes pasarte.{' '}
                          <span className="text-white/45">
                              Solo se quita de {planta?.nombre?.toLowerCase() || 'esta planta'}: la de encima no se toca.
                              Barra espaciadora + arrastrar mueve el plano. Esc cancela.
                          </span>
                      </>}>
                <PaletaUsos actual={uso} onElegir={onUso} corto={corto} />
            </TiraModo>
        );
    }

    // ── La tira en reposo ────────────────────────────────────────────────────
    // [VIVIENDA] [lo que hay: zonas fuera, el adosado, la propuesta o una
    // pista] ··· [Croquis | móvil] [✂ Quitar una zona] [Delimitar adosado | 📱]
    // Todo en UNA fila si cabe; si no, los mandos bajan a una segunda —y allí,
    // con la fila para ellos, vuelven a llevar su nombre entero si cabe—.
    const hayRecorte = Array.isArray(recorte?.poligono) && recorte.poligono.length >= 3;
    const verPropuesta = !zonas.length && !hayRecorte && propuesta?.length > 0 && !!onVerPropuesta;
    const textoPropuesta = verPropuesta
        ? `✨ Catastro declara ${textoCatastro(propuesta.map(t => ({ uso: ETIQUETA_USO_ZONA[t.uso] || t.uso,
                                                                    superficie: t.catastro_m2 || t.area_m2 })))} aquí dentro`
        : '';
    // El texto de cada zona; `compacto` sin el «fuera» (el ✂ ya lo dice, y el
    // `title` lo lleva entero) para cuando no caben enteras en la fila.
    const textoZona = (z, compacto = false) => `✂ ${ETIQUETA_USO_ZONA[z.uso] || 'No habitable'}${compacto ? '' : ' fuera'} · `
        + `${fmt(z.area_real ?? z.area_m2 ?? 0)} m²${z.aplicada ? '' : ' · no se ha aplicado'}`;
    const textoAdosado = hayRecorte ? `Adosado delimitado · ≈${fmt(recorte.area_m2 ?? 0)} m² · todas las plantas` : '';
    // Lo de en medio pide sitio para leerse ENTERO —un «✂ Garaje fuera · 1…»
    // esconde justo los m²—: si con eso no caben los mandos, los mandos bajan
    // de fila (flex-wrap). Px aproximados de la letra de 10,5 px en negrita.
    // La pista neutra no pide nada: si no cabe, no se ve. La del ADOSADO sí
    // (regla 75: 188 paredes medidas son un bloque entero, y eso se tiene que leer).
    const nChips = zonas.length + (hayRecorte ? 1 : 0);
    const anchoChip = t => Math.round(t.length * 5.6) + 30;
    const anchoChips = compacto => zonas.reduce((s, z) => s + anchoChip(textoZona(z, compacto)), 0)
        + (hayRecorte ? anchoChip(textoAdosado) + 14 : 0);
    const chipsCompactos = nChips > 0 && ancho > 0 && anchoChips(false) > ancho - 80;
    const minNominal = nChips ? anchoChips(chipsCompactos)
        : verPropuesta ? 200 : recorteSugerido ? 210 : 0;
    // …y nunca más de lo que deja la etiqueta: si no, en una tarjeta muy
    // estrecha la etiqueta se quedaba sola en su fila (y entonces trunca).
    const minMedio = Math.min(minNominal, ancho > 0 ? Math.max(ancho - 80, 0) : Infinity);
    // Cuánto ocupan los mandos con sus etiquetas largas (0), cortas (1) o
    // mínimas (2) —px aproximados, medidos con la letra de 11 px en negrita—.
    const conAdosado = !!onRecorteModo && !hayRecorte;
    const anchoMandos = (n) => 12
        + (onCroquisModo ? 80 : 0) + (onCroquisMovil ? (n === 0 ? 152 : 30) : 0)
        + (onZonaModo ? [120, 98, 62][n] : 0)
        + (conAdosado ? (n === 0 ? 124 : 92) + (onRecorteMovil ? 30 : 0) : 0);
    const ETIQUETA = 76;
    // ¿Caben en UNA fila con su nombre entero, o acortándolo? Si ni así, van a
    // su propia fila y allí se mide otra vez con todo el ancho.
    const nivel = !(ancho > 0) ? 0
        : ancho >= ETIQUETA + minNominal + anchoMandos(0) ? 0
        : ancho >= ETIQUETA + minNominal + anchoMandos(1) ? 1
        : ancho >= anchoMandos(0) ? 0
        : ancho >= anchoMandos(1) + 20 ? 1 : 2;
    const corto = nivel >= 1;
    const minimo = nivel === 2;
    // La pista, larga o corta según lo que dejan los mandos (con el truco de
    // abajo, una que no cabe no se ve a medias).
    const libre = ancho > 0 ? ancho - ETIQUETA - anchoMandos(nivel) : Infinity;
    const pista = recorteSugerido
        ? ['¿Es un adosado dentro de una comunidad? Aquí se está midiendo el bloque entero.',
           '¿Adosado? Se mide el bloque entero.']
        : ['¿Hay un garaje o un almacén dentro de esta planta?', '¿Garaje o almacén dentro?'];
    const pistaCorta = libre < (recorteSugerido ? 440 : 300);
    return (
        <Tira refTira={refTira} tono={zonas.length || hayRecorte ? 'sky' : 'neutro'}>
            <EtiquetaTira title="Qué parte de lo construido en esta planta es la vivienda que se certifica">
                Vivienda
            </EtiquetaTira>

            <div className="flex min-w-0 flex-1 items-center gap-1" style={{ minWidth: minMedio }}>
                {zonas.map(z => {
                    const texto = textoZona(z, chipsCompactos);
                    return (
                        <ChipTira key={z.indice} tono={z.aplicada ? 'sky' : 'amber'}
                                  title={`${textoZona(z)} — ${z.aplicada ? 'Se resta solo de esta planta'
                                                                         : 'El motor no la ha aplicado: mira el diagnóstico'}`}
                                  mandos={(
                                      <MandoChip onClick={() => onZonaQuitar?.(z.indice)} disabled={midiendo}
                                                 aria-label="Quitar esta zona"
                                                 title="Quitar: vuelve a contar como vivienda">✕</MandoChip>
                                  )}>
                            {texto}
                        </ChipTira>
                    );
                })}

                {hayRecorte && (
                    <ChipTira tono="emerald" title={textoAdosado}
                              mandos={<>
                                  {onRecorteModo && (
                                      <MandoChip onClick={() => onRecorteModo(true)} disabled={midiendo}
                                                 aria-label="Redibujar el contorno">✎</MandoChip>
                                  )}
                                  {onRecorteQuitar && (
                                      <MandoChip onClick={onRecorteQuitar} disabled={midiendo}
                                                 aria-label="Quitar el contorno">✕</MandoChip>
                                  )}
                              </>}>
                        {textoAdosado}
                    </ChipTira>
                )}

                {verPropuesta && (
                    <button type="button" onClick={onVerPropuesta} disabled={midiendo}
                            title={`${textoPropuesta}. Carga la propuesta como un croquis: corrígela si hace falta y pulsa «Ajustar a Catastro»`}
                            className="inline-flex h-7 min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded-md
                                       border border-violet-400/50 bg-violet-400/10 px-2 text-[11px] font-bold
                                       text-violet-200 transition hover:bg-violet-400/20 disabled:opacity-40">
                        <span className="min-w-0 truncate">{textoPropuesta}</span>
                        <span className="shrink-0">· <span className="underline">Ver dónde</span></span>
                    </button>
                )}

                {!nChips && !verPropuesta && recorteSugerido && (
                    <span title={pista[0]} className="min-w-0 truncate text-[11px] text-amber-200/90">
                        {pistaCorta ? pista[1] : pista[0]}
                    </span>
                )}
                {!nChips && !verPropuesta && !recorteSugerido && (
                    // Entera o nada: el hueco de 0 px de delante hace que una pista
                    // que no cabe salte a una segunda línea, y esa línea la corta el
                    // `overflow-hidden` — así nunca se ve un «¿Hay un gar…».
                    <span title={pista[0]} className="flex h-7 min-w-0 flex-1 flex-wrap items-center overflow-hidden">
                        <span className="h-7 w-0" />
                        <span className="whitespace-nowrap text-[11px] leading-7 text-white/50">
                            {pistaCorta ? pista[1] : pista[0]}
                        </span>
                    </span>
                )}
            </div>

            <span className="ml-auto flex shrink-0 items-center gap-1">
                {midiendo && <span className="whitespace-nowrap text-[10.5px] text-white/55">volviendo a medir…</span>}
                {/* El CROQUIS es una herramienta con dos entradas —con el ratón
                    aquí o con el dedo en el móvil—: van juntas, como un botón
                    partido. */}
                {(onCroquisModo || onCroquisMovil) && (
                    <GrupoTira tono={recorteSugerido ? 'neutro' : 'fuerte'}>
                        {onCroquisModo && (
                            <SegmentoTira onClick={() => onCroquisModo(true)} disabled={midiendo}
                                          tono={recorteSugerido ? 'neutro' : 'fuerte'}
                                          title="Pinta a mano alzada dónde está el garaje, el porche…: la app lo ajusta a los m² de Catastro">
                                <IconoLapiz size={12} /> Croquis
                            </SegmentoTira>
                        )}
                        {onCroquisMovil && (
                            <SegmentoTira onClick={onCroquisMovil} disabled={midiendo || abriendoMovil}
                                          tono={recorteSugerido ? 'neutro' : 'fuerte'}
                                          aria-label="Pintar desde el móvil"
                                          title="Enseña un QR: pinta el croquis con el dedo en el móvil y lo ves aquí según lo pintas">
                                <IconoMovil size={12} />
                                {abriendoMovil ? (corto ? '…' : 'Abriendo…') : !corto && 'Pintar desde el móvil'}
                            </SegmentoTira>
                        )}
                    </GrupoTira>
                )}
                {onZonaModo && (
                    <BotonTira onClick={() => onZonaModo(true)} disabled={midiendo}
                               tono={!recorteSugerido && !onCroquisModo ? 'fuerte' : 'neutro'}
                               aria-label="Quitar una zona"
                               title="Dibuja lo que no es vivienda: se quita SOLO de esta planta">
                        {minimo ? '✂ Zona' : corto ? '✂ Quitar zona' : '✂ Quitar una zona'}
                    </BotonTira>
                )}
                {onRecorteModo && !hayRecorte && (
                    // Dos entradas para lo mismo —con el ratón aquí o con el dedo
                    // en el móvil—: juntas, como el croquis.
                    <GrupoTira tono={recorteSugerido ? 'ambar' : 'neutro'}>
                        <SegmentoTira onClick={() => onRecorteModo(true)} disabled={midiendo}
                                      tono={recorteSugerido ? 'ambar' : 'neutro'}
                                      aria-label="Delimitar adosado"
                                      title="Para un adosado dentro de una comunidad: vale para TODAS las plantas y lo de fuera es la casa de al lado (medianera)">
                            {corto ? <><IconoVivienda size={12} /> Adosado</> : 'Delimitar adosado'}
                        </SegmentoTira>
                        {onRecorteMovil && (
                            <SegmentoTira onClick={onRecorteMovil} disabled={midiendo || abriendoMovil}
                                          tono={recorteSugerido ? 'ambar' : 'neutro'}
                                          aria-label="Delimitar el adosado en el móvil"
                                          title="Dibuja el contorno de la vivienda con el dedo en el móvil (QR)">
                                <IconoMovil size={12} />
                            </SegmentoTira>
                        )}
                    </GrupoTira>
                )}
            </span>
        </Tira>
    );
}

//: El nombre CORTO de cada uso, para la paleta en una tarjeta estrecha
//: («Otro no habitable» y «Porche abierto» eran los que la partían).
const USO_CORTO = { GARAJE: 'Garaje', ALMACEN: 'Almacén', 'ESPACIO NO HABITABLE': 'Otro', PORCHE: 'Porche' };

/**
 * Con qué uso se pinta o se dibuja: Garaje · Almacén · Otro · Porche. En el
 * croquis, cada uso con SU color (el mismo de la mancha en el plano); en la
 * zona, el azul de su modo.
 */
function PaletaUsos({ actual, onElegir, conColor = false, corto = false }) {
    return (
        <span className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Uso">
            {USOS_ZONA.map(u => {
                const activo = u === actual;
                return (
                    <button key={u} type="button" onClick={() => onElegir?.(u)}
                            role="radio" aria-checked={activo} title={ETIQUETA_USO_ZONA[u]}
                            style={activo && conColor ? { borderColor: COLOR_CROQUIS[u], color: COLOR_CROQUIS[u] } : undefined}
                            className={`inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2
                                        text-[11px] font-bold transition
                                ${activo ? (conColor ? 'bg-white/[0.08]' : 'border-sky-400/70 bg-sky-400/20 text-sky-200')
                                         : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white'}`}>
                        {conColor && (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full"
                                  style={{ background: COLOR_CROQUIS[u] }} />
                        )}
                        {corto ? USO_CORTO[u] : ETIQUETA_USO_ZONA[u]}
                    </button>
                );
            })}
        </span>
    );
}

/**
 * Por qué va cada mancha de la propuesta donde va. Es lo que separa «lo dice
 * una foto» de «es lo que queda»: con la confianza a la vista se sabe qué hay
 * que mirar dos veces.
 */
function NotasPropuesta({ notas }) {
    const tono = { alta: 'text-emerald-300', media: 'text-sky-200', baja: 'text-amber-200' };
    return (
        <div className="basis-full rounded-md border border-violet-400/25 bg-violet-400/[0.06] px-2.5 py-1.5
                        text-[11px] leading-snug text-white/75">
            <b className="text-violet-200">Propuesta</b> — corrígela si no es así y pulsa «Ajustar a Catastro»:
            <ul className="mt-0.5 space-y-0.5">
                {notas.map((n, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ background: COLOR_CROQUIS[n.uso] || COLOR_CROQUIS['ESPACIO NO HABITABLE'] }} />
                        <b className="text-white/90">{ETIQUETA_USO_ZONA[n.uso] || n.uso}</b>
                        <span>{n.por_que}</span>
                        <span className={`text-[10px] font-bold uppercase ${tono[n.confianza] || tono.baja}`}>
                            · confianza {n.confianza}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const fmt = n => (Number(n) || 0).toFixed(1).replace('.', ',');

export default ViviendaPlantaControl;
