// ─── Instalar.jsx — «Ponla en tu pantalla de inicio» (fase 5) ────────────────
// Una tarjeta discreta al final de Inicio, solo en el MÓVIL y solo si la app no
// está ya instalada. Se descarta con «Ahora no» y no vuelve en ese navegador
// (localStorage: es una comodidad de quien la mira; si falla, simplemente vuelve).
// En Android con el aviso de Chrome, un botón la instala; si no, las instrucciones
// que tocan: iPhone (Safari → Compartir → «Añadir a pantalla de inicio») o
// Android (menú ⋮ → «Instalar aplicación» / «Añadir a pantalla de inicio»).
import React, { useState } from 'react';
import { Icono } from './piezas';
import { esAppInstalada, sistemaDelMovil, useAvisoInstalar } from './cabeceraApp';

const CLAVE = 'ia-instalar-descartada';
const leer = () => { try { return window.localStorage.getItem(CLAVE) === '1'; } catch { return false; } };
const guardar = () => { try { window.localStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento */ } };
const esMovil = () => {
    try { return window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 1023px)').matches; } catch { return false; }
};

export function InvitacionInstalar({ forzar = null }) {
    const [descartada, setDescartada] = useState(leer);
    const [abierta, setAbierta] = useState(false);
    const [hecho, setHecho] = useState(false);
    const aviso = useAvisoInstalar();
    const sistema = forzar || sistemaDelMovil();
    // iPhone no tiene el aviso de instalar de Chrome: allí siempre las instrucciones.
    const puede = aviso.puede && sistema !== 'iphone';
    if (!forzar && (descartada || esAppInstalada() || !esMovil())) return null;
    if (forzar && descartada) return null;

    const ahoraNo = () => { guardar(); setDescartada(true); };
    const instalar = async () => {
        if (puede) { const r = await aviso.instalar(); if (r === 'ok') { setHecho(true); guardar(); } return; }
        setAbierta((a) => !a);
    };

    if (hecho) {
        return (
            <section className="ia-card ia-instalar ia-entra" role="status">
                <span className="ia-baldosa v"><Icono n="ok" size={22} /></span>
                <div><b>Ya la tienes en tu pantalla de inicio</b><span>Ábrela desde su icono, como cualquier otra app.</span></div>
            </section>
        );
    }
    return (
        <section className="ia-card ia-instalar-card ia-entra" aria-labelledby="ia-instalar-tit">
            <div className="ia-instalar">
                <span className="ia-baldosa"><Icono n="movil" size={22} /></span>
                <div>
                    <b id="ia-instalar-tit">Ponla en tu pantalla de inicio</b>
                    <span>Así la abres de un toque, como el WhatsApp.</span>
                </div>
            </div>
            {abierta && (
                <ol className="ia-instalar-pasos">
                    {sistema === 'iphone' ? (
                        <>
                            <li>Ábrela en <b>Safari</b> (la brújula azul).</li>
                            <li>Toca <b>Compartir</b>: el cuadrado con la flecha hacia arriba, abajo en el centro.</li>
                            <li>Baja y toca <b>«Añadir a pantalla de inicio»</b>. Luego, <b>«Añadir»</b>.</li>
                        </>
                    ) : sistema === 'android' ? (
                        <>
                            <li>Ábrela en <b>Chrome</b>.</li>
                            <li>Toca los <b>tres puntos ⋮</b>, arriba a la derecha.</li>
                            <li>Toca <b>«Instalar aplicación»</b> o <b>«Añadir a pantalla de inicio»</b>.</li>
                        </>
                    ) : (
                        <li>En el móvil: en el menú del navegador, <b>«Añadir a pantalla de inicio»</b>.</li>
                    )}
                </ol>
            )}
            <div className="ia-dos">
                <button type="button" className="ia-btn ia-btn-sec" onClick={ahoraNo}>Ahora no</button>
                <button type="button" className="ia-btn ia-btn-tinta" onClick={instalar} aria-expanded={puede ? undefined : abierta}>
                    {puede ? 'Ponerla' : abierta ? 'Ocultar cómo' : 'Ver cómo'}
                </button>
            </div>
        </section>
    );
}
