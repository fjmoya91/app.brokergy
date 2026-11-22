// ─── Inicio — lo que te toca hoy (prototipo «Main») ──────────────────────────
import React from 'react';
import { Icono, iconoDeTarea, Esqueleto, AvisoError } from '../ui/piezas';
import { Destino } from './Tarea';
import { InvitacionInstalar } from '../ui/Instalar';
import mascota from '../../../assets/mascota-gota.webp';

export function InicioView({ saludo, datos, cargando, error, onReintentar, onNueva, onVerObras, onAbrirOportunidad, onAbrirAccion, onMiPagina, onPresupuesto = null, onVerPresupuestos = null, instalarComo = null, onAsistente = null }) {
    const obras = datos?.obras || [];
    const r = datos?.resumen || { total: 0, en_marcha: 0, te_toca: 0, cobradas: 0 };
    // Todas las tareas de todas las obras, en una lista (las de cada obra, en su orden).
    const tareas = obras.flatMap((o) => (o.tareas || []).map((t) => ({ ...t, obra: o })));
    const n = tareas.length;
    // Las COSAS son tareas; el número del menú y del filtro «Te toca» cuenta OBRAS.
    // Si no coinciden (una obra con dos cosas), se dicen las dos (fase 5).
    const nObras = obras.filter((o) => (o.tareas || []).length > 0).length;

    // En el PC (fase 5, 22/11/2026): lo que te toca a la izquierda, a lo ancho; los botones,
    // las cifras y tu página a la derecha. En el móvil los envoltorios no existen y `order`
    // mantiene el orden de siempre: botones, lo que te toca, tus obras, tu página.
    const O = (n) => ({ order: n });
    return (
        <div className="ia-pagina pc">
            <div className="ia-hola ia-entra">
                <h1 className="ia-display">Hola, {saludo}</h1>
                {!cargando && !error && (
                    n > 0
                        ? <p>Hoy tienes <span className="ia-mark"><b>{n} {n === 1 ? 'cosa' : 'cosas'}</b></span> que hacer{nObras && nObras !== n ? ` en ${nObras} ${nObras === 1 ? 'obra' : 'obras'}` : ''}. Lo demás lo llevamos nosotros.</p>
                        : <p>Hoy <b>no tienes nada pendiente</b>. Lo demás lo llevamos nosotros.</p>
                )}
            </div>

            <div className="ia-pc-dos">
            <div className="ia-pc-main">
            {cargando ? <div style={O(2)}><Esqueleto alto={140} n={2} /></div> : error ? <div style={O(2)}><AvisoError onReintentar={onReintentar} /></div> : n > 0 ? (
                        <section className="ia-card lista ia-entra" style={O(2)} aria-labelledby="ia-toca-tit">
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
            ) : (
                <section className="ia-card ia-solo-pc ia-entra">
                    <div className="ia-vacio" style={{ width: '100%' }}>
                        <span className="ia-baldosa v"><Icono n="ok" size={22} /></span>
                        <b>No tienes nada pendiente</b>
                        <p>Cuando una obra necesite algo de ti, te lo ponemos aquí.</p>
                    </div>
                </section>
            )}
            </div>

            <div className="ia-pc-lado">
            <button type="button" className="ia-btn ia-btn-pri ia-entra" style={O(1)} onClick={onNueva}>
                <Icono n="mas" size={22} grosor={2.4} /> Calcular la ayuda de una obra
            </button>
            {onPresupuesto && (
                <button type="button" className="ia-btn ia-btn-sec ia-entra" style={O(1)} onClick={onPresupuesto}>
                    <Icono n="factura" size={20} /> Hacer un presupuesto
                </button>
            )}
            {onVerPresupuestos && (
                <button type="button" className="ia-link" style={{ alignSelf: 'center', ...O(1) }} onClick={onVerPresupuestos}>Ver los presupuestos que has hecho</button>
            )}

            {onAsistente && (
                <section className="ia-card ia-asi-entrada ia-entra" style={O(1)} aria-labelledby="ia-asi-entrada-tit">
                    <div className="ia-asi-entrada-cab">
                        <img src={mascota} alt="" />
                        <div>
                            <b id="ia-asi-entrada-tit">Tu asistente</b>
                            <span>Pídeme un presupuesto o pregúntame cómo va una obra. Por escrito o con un audio.</span>
                        </div>
                    </div>
                    <div className="ia-asi-entrada-bts">
                        <button type="button" className="ia-btn ia-btn-sec" onClick={() => onAsistente(false)}>
                            <Icono n="chat" size={20} /> Abrir el asistente
                        </button>
                        <button type="button" className="ia-btn ia-btn-sec" onClick={() => onAsistente(true)}>
                            <Icono n="mic" size={20} /> Dictar
                        </button>
                    </div>
                </section>
            )}

            {!cargando && !error && (
                <>
                    {r.total > 0 ? (
                        <section className="ia-card ia-entra" style={O(3)} aria-labelledby="ia-obras-tit">
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
                        <section className="ia-card ia-entra" style={O(3)}>
                            <div className="ia-vacio">
                                <span className="ia-baldosa"><Icono n="obras" size={22} /></span>
                                <b>Aún no tienes obras con nosotros</b>
                                <p>Calcula la ayuda de tu primera obra: en dos minutos sabes cuánto bono le sale a tu cliente.</p>
                            </div>
                        </section>
                    )}

                    {onMiPagina && (
                        <button type="button" className="ia-card ia-tarjeta-web ia-entra" style={O(4)} onClick={onMiPagina}>
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

            <div style={O(5)}><InvitacionInstalar forzar={instalarComo} /></div>
            </div>
            </div>
        </div>
    );
}
