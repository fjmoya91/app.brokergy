// ─── Inicio — lo que te toca hoy (prototipo «Main») ──────────────────────────
import React from 'react';
import { Icono, iconoDeTarea, Esqueleto, AvisoError } from '../ui/piezas';
import { Destino } from './Tarea';
import { InvitacionInstalar } from '../ui/Instalar';

export function InicioView({ saludo, datos, cargando, error, onReintentar, onNueva, onVerObras, onAbrirOportunidad, onAbrirAccion, onMiPagina, instalarComo = null }) {
    const obras = datos?.obras || [];
    const r = datos?.resumen || { total: 0, en_marcha: 0, te_toca: 0, cobradas: 0 };
    // Todas las tareas de todas las obras, en una lista (las de cada obra, en su orden).
    const tareas = obras.flatMap((o) => (o.tareas || []).map((t) => ({ ...t, obra: o })));
    const n = tareas.length;
    // Las COSAS son tareas; el número del menú y del filtro «Te toca» cuenta OBRAS.
    // Si no coinciden (una obra con dos cosas), se dicen las dos (fase 5).
    const nObras = obras.filter((o) => (o.tareas || []).length > 0).length;

    return (
        <div className="ia-pagina estrecha">
            <div className="ia-hola ia-entra">
                <h1 className="ia-display">Hola, {saludo}</h1>
                {!cargando && !error && (
                    n > 0
                        ? <p>Hoy tienes <span className="ia-mark"><b>{n} {n === 1 ? 'cosa' : 'cosas'}</b></span> que hacer{nObras && nObras !== n ? ` en ${nObras} ${nObras === 1 ? 'obra' : 'obras'}` : ''}. Lo demás lo llevamos nosotros.</p>
                        : <p>Hoy <b>no tienes nada pendiente</b>. Lo demás lo llevamos nosotros.</p>
                )}
            </div>

            <button type="button" className="ia-btn ia-btn-pri ia-entra" onClick={onNueva}>
                <Icono n="mas" size={22} grosor={2.4} /> Calcular la ayuda de una obra
            </button>

            {cargando ? <Esqueleto alto={140} n={2} /> : error ? <AvisoError onReintentar={onReintentar} /> : (
                <>
                    {n > 0 && (
                        <section className="ia-card lista ia-entra" aria-labelledby="ia-toca-tit">
                            <p id="ia-toca-tit" className="ia-eyebrow n" style={{ padding: '0 12px 6px' }}>Te toca a ti</p>
                            {tareas.map((t, i) => (
                                <Destino key={`${t.obra.id}-${t.key}`} destino={t.destino} onAbrirOportunidad={onAbrirOportunidad}
                                    onAccion={onAbrirAccion ? (d) => onAbrirAccion(t.obra, d) : undefined}
                                    className={`ia-fila${i === 0 ? ' primera' : ''}`}>
                                    <span className="ia-baldosa"><Icono n={iconoDeTarea(t.key)} size={22} /></span>
                                    <span className="ia-fila-txt">
                                        <b>{t.que}</b>
                                        <span className="corta">{[t.obra.cliente, t.obra.municipio].filter(Boolean).join(' · ')}</span>
                                    </span>
                                    <Icono n="chevron" size={20} className="ia-chev" />
                                </Destino>
                            ))}
                        </section>
                    )}

                    {r.total > 0 ? (
                        <section className="ia-card ia-entra" aria-labelledby="ia-obras-tit">
                            <p id="ia-obras-tit" className="ia-eyebrow" style={{ marginBottom: 14 }}>Tus obras</p>
                            <div className="ia-cifras">
                                <div><b>{r.en_marcha}</b><span>en marcha</span></div>
                                <div><b style={{ color: r.te_toca ? 'var(--naranja-txt)' : undefined }}>{r.te_toca}</b><span>{r.te_toca === 1 ? 'te espera' : 'te esperan'}</span></div>
                                <div><b style={{ color: r.cobradas ? 'var(--verde-txt)' : undefined }}>{r.cobradas}</b><span>cobradas</span></div>
                            </div>
                            <button type="button" className="ia-ver-todas" onClick={onVerObras}>
                                Ver todas las obras <Icono n="chevron" size={20} className="ia-chev" />
                            </button>
                        </section>
                    ) : (
                        <section className="ia-card ia-entra">
                            <div className="ia-vacio">
                                <span className="ia-baldosa"><Icono n="obras" size={22} /></span>
                                <b>Aún no tienes obras con nosotros</b>
                                <p>Calcula la ayuda de tu primera obra: en dos minutos sabes cuánto bono le sale a tu cliente.</p>
                            </div>
                        </section>
                    )}

                    {onMiPagina && (
                        <button type="button" className="ia-card ia-tarjeta-web ia-entra" onClick={onMiPagina}>
                            <span className="ia-baldosa v"><Icono n="web" size={22} /></span>
                            <div>
                                <b>Tu página web</b>
                                <span>Enseña tus obras con fotos de antes y después. Las miramos antes de publicarlas.</span>
                            </div>
                            <Icono n="chevron" size={20} className="ia-chev" />
                        </button>
                    )}
                </>
            )}

            <InvitacionInstalar forzar={instalarComo} />
        </div>
    );
}
