// ─── Elegir fotos de mis obras (fase 3, prototipo «ElegirFotos») ─────────────
// Las fotos que el instalador YA subió en cada obra que instala su empresa, para
// marcar las que quiere enseñar en su página. Nada se publica: van «en revisión» y
// las mira BROKERGY. Para enviarlas hay que marcar que los clientes dieron permiso.
// En pantalla, de cada obra solo sale el pueblo (nunca el nombre ni la calle).
// `obra`: si llega, solo esa obra (desde «Fotos y papeles» de la obra).
import React, { useEffect, useMemo, useState } from 'react';
import { Icono, Esqueleto, AvisoError } from '../ui/piezas';

const CHIP_EN_PAGINA = { revision: ['En revisión', 'rev'], publicada: ['Publicada', 'pub'], no_vale: ['No vale', 'no'] };
const mes = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    const t = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
};

// `incrustado`: dentro de «Fotos y papeles» de la obra, que ya pone su cabecera: aquí
// solo un subtítulo y la vuelta a las fotos (sin un segundo título grande).
export function ElegirFotosView({ api, obra = null, alSubir, onVolver, onHecho, volverTexto = 'Tu página web', incrustado = false }) {
    const [estado, setEstado] = useState({ datos: null, error: false });
    const [intento, setIntento] = useState(0);
    const [sel, setSel] = useState(() => new Set());
    const [permiso, setPermiso] = useState(false);
    useEffect(() => {
        let vivo = true;
        setEstado((s) => ({ ...s, error: false }));
        api.escaparateObras(obra).then((d) => { if (vivo) setEstado({ datos: d, error: false }); })
            .catch(() => { if (vivo) setEstado((s) => ({ datos: s.datos, error: true })); });
        return () => { vivo = false; };
    }, [api, obra, intento]);

    const obras = estado.datos?.obras || [];
    const clave = (o, f) => `${o.obra}|${f.slot}|${f.driveId}`;
    const elegidas = useMemo(() => obras.flatMap((o) => o.fotos.filter((f) => sel.has(clave(o, f)))
        .map((f) => ({ obra: o.obra, slot: f.slot, driveId: f.driveId }))), [obras, sel]);
    const n = elegidas.length;
    const conmutar = (k) => setSel((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
    const listo = n > 0 && permiso;

    const enviar = async () => {
        if (!listo) return;
        try {
            await alSubir({
                enviando: n === 1 ? 'Enviando tu foto…' : `Enviando ${n} fotos…`,
                ok: n === 1 ? '¡Foto enviada a revisión!' : '¡Fotos enviadas a revisión!',
                subtitulo: 'Las miramos nosotros antes de publicarlas: que no salga nadie, ni una matrícula, ni la dirección de la casa. Tarda un día.',
            })(() => api.proponerFotos({ permiso: true, fotos: elegidas }));
            setSel(new Set());
            setPermiso(false);
            onHecho?.();
        } catch { /* el popup ya dice qué ha pasado */ }
    };

    let cuerpo;
    if (!estado.datos && !estado.error) cuerpo = <Esqueleto alto={180} n={2} />;
    else if (estado.error && !estado.datos) cuerpo = <AvisoError onReintentar={() => setIntento((k) => k + 1)} texto="Es un fallo nuestro y pasajero. Tus fotos siguen en cada obra: vuelve a intentarlo en un momento." />;
    else if (!obras.length) {
        cuerpo = (
            <section className="ia-card">
                <div className="ia-vacio">
                    <span className="ia-baldosa"><Icono n="camara" size={22} /></span>
                    <b>{obra ? 'Esta obra aún no tiene fotos' : 'Aún no hay fotos en tus obras'}</b>
                    <p>Cuando subas las fotos de una obra (en «Fotos y papeles»), podrás elegir aquí cuáles enseñar.</p>
                </div>
            </section>
        );
    } else {
        cuerpo = obras.map((o) => (
            <section key={o.obra} className="ia-card ia-ef-obra ia-entra" aria-label={o.titulo}>
                <div className="ia-ef-cab">
                    <b>{o.titulo}</b>
                    {o.cuando && <span>{mes(o.cuando)}</span>}
                </div>
                <div className="ia-rejilla">
                    {o.fotos.map((f) => {
                        const k = clave(o, f);
                        const ya = f.en_pagina ? CHIP_EN_PAGINA[f.en_pagina] : null;
                        const marcada = sel.has(k);
                        return (
                            <button key={k} type="button" className={`ia-foto${marcada ? ' sel' : ''}${ya ? ' ya' : ''}`}
                                aria-pressed={ya ? undefined : marcada} disabled={!!ya} onClick={() => conmutar(k)}
                                aria-label={`Foto ${f.fase === 'antes' ? 'de antes' : 'de después'}${ya ? `, ${ya[0].toLowerCase()}` : marcada ? ', elegida' : ''}`}>
                                <img src={f.miniatura} alt="" loading="lazy" />
                                <span className="ia-foto-fase">{f.fase === 'antes' ? 'Antes' : 'Después'}</span>
                                {ya ? <span className={`ia-foto-chip ${ya[1]}`}>{ya[0]}</span>
                                    : <span className="ia-foto-check" aria-hidden="true">{marcada && <Icono n="ok" size={16} grosor={3} />}</span>}
                            </button>
                        );
                    })}
                </div>
            </section>
        ));
    }

    return (
        <div className={incrustado ? 'ia-ef ia-ef-inc' : 'ia-pagina estrecha ia-ef'}>
            {!incrustado && (
                <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
                    <button type="button" className="ia-volver" onClick={onVolver}><Icono n="atras" size={22} /> {volverTexto}</button>
                </div>
            )}
            <div className="ia-accion-cab ia-entra">
                {incrustado
                    ? <h2 className="ia-display" style={{ margin: 0, fontSize: 26, lineHeight: 1.15 }}>Elige las fotos que quieres enseñar</h2>
                    : <h1 className="ia-display">Elige las fotos que quieres enseñar</h1>}
                <p>{incrustado ? 'Son las que ya subiste en esta obra.' : 'Son las que ya subiste en cada obra.'} En la web solo sale el pueblo, nunca el nombre ni la calle del cliente.</p>
                {incrustado && <button type="button" className="ia-link" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={onVolver}>Volver a {volverTexto.toLowerCase()}</button>}
            </div>
            {cuerpo}
            {obras.length > 0 && (
                <div className="ia-ef-pie">
                    <label className="ia-permiso">
                        <input type="checkbox" checked={permiso} onChange={(e) => setPermiso(e.target.checked)} />
                        <span>Los clientes me han dicho que <b>puedo enseñar</b> estas fotos.</span>
                    </label>
                    <button type="button" className={`ia-btn ${listo ? 'ia-btn-pri' : 'ia-btn-sec'}`} disabled={!listo} onClick={enviar}>
                        {n === 0 ? 'Elige alguna foto' : !permiso ? 'Marca que tienes permiso' : `Enviar ${n} ${n === 1 ? 'foto' : 'fotos'} a revisión`}
                    </button>
                </div>
            )}
        </div>
    );
}
