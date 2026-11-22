// ─── Los PRESUPUESTOS que el instalador hace en la app (22/11/2026) ─────────────────────
// La lista (`GET /presupuestos`) y la ficha de uno (`GET /presupuestos/:id`): su PDF de
// verdad, y tres cosas — mandárselo a su propio WhatsApp para reenviarlo, descargarlo y
// calcular el bono CAE de esa obra (la «Nueva simulación» de siempre, ya rellena).
//
// REGLA — el PDF va al WhatsApp del INSTALADOR, nunca al cliente: él lo reenvía. Por eso
// se le enseña a qué número (enmascarado, lo da el servidor) y el texto para reenviar,
// con un botón de copiar.
// REGLA — la lista recuerda la búsqueda (regla 193, `instalador-presupuestos`), nunca
// los datos.
import React, { useEffect, useState } from 'react';
import { useVistaGuardada, useGuardarVista, useScrollLista } from '../../../utils/memoriaVista';
import { Icono, Buscador, Esqueleto, AvisoError, sinTildes, nombrePropio, useHojaTeclado } from '../ui/piezas';
import { eur, mensajeParaCliente, resumenObra } from '../logic/presupuesto';
import { obraDelPresupuesto, estaLigado } from '../logic/presupuestoApp';
import { HojasPdf } from './AccionesObra';
import { useGuardado } from './PresupuestoForm';

const fechaCorta = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
};
const nombreCli = (c) => (typeof c === 'string' ? nombrePropio(c) : nombrePropio([c?.nombre, c?.apellidos].filter(Boolean).join(' '))) || 'Sin cliente';

function pasa(p, q) {
    const t = sinTildes(q);
    if (!t) return true;
    const pajar = sinTildes([p.numero, nombreCli(p.cliente), p.municipio, p.resumen].filter(Boolean).join(' '));
    return t.split(/\s+/).every((w) => pajar.includes(w));
}

export function PresupuestosView({ datos, cargando, error, onReintentar, onAbrir, onNuevo }) {
    const memoria = useVistaGuardada('instalador-presupuestos');
    const [q, setQ] = useState(memoria.q ?? '');
    useGuardarVista('instalador-presupuestos', { q });
    const todos = datos?.presupuestos || [];
    const vistos = todos.filter((p) => pasa(p, q));
    const lista = useScrollLista('instalador-presupuestos', false, !cargando && vistos.length > 0);

    return (
        <div ref={lista.ancla} className="ia-pagina estrecha">
            <div className="ia-titulo" style={{ paddingTop: 12 }}>
                <h1 className="ia-display">Presupuestos</h1>
                {todos.length > 0 && <span>{todos.length}</span>}
            </div>
            <button type="button" className="ia-btn ia-btn-pri" onClick={onNuevo}>
                <Icono n="mas" size={22} grosor={2.4} /> Nuevo presupuesto
            </button>
            {todos.length > 3 && <Buscador valor={q} onCambio={setQ} placeholder="Nº, cliente o pueblo" etiqueta="Buscar presupuesto" />}

            {cargando ? <Esqueleto alto={72} n={4} /> : error ? <AvisoError onReintentar={onReintentar} /> : !todos.length ? (
                <div className="ia-card"><div className="ia-vacio">
                    <b>Aún no has hecho ninguno</b>
                    <p>Hazlo aquí con tu plantilla y te lo mandamos a tu WhatsApp para que se lo pases a tu cliente.</p>
                </div></div>
            ) : vistos.length === 0 ? (
                <p className="ia-nada">No encuentro ninguno con eso. Prueba con el número o el apellido.</p>
            ) : (
                <section className="ia-card lista" aria-label="Tus presupuestos">
                    {vistos.map((p, i) => {
                        const anulado = p.estado === 'ANULADO';
                        const ligado = estaLigado(p);
                        return (
                            <button key={p.id} type="button" className={`ia-fila${i === 0 ? ' primera' : ''}`} style={{ minHeight: 76 }}
                                onClick={() => { lista.recordar(); onAbrir(p); }}>
                                <span className={`ia-baldosa${anulado ? ' nos' : ligado ? ' ok' : ''}`} aria-hidden="true"><Icono n="factura" size={20} /></span>
                                <span className="ia-fila-txt">
                                    <b>{nombreCli(p.cliente)}</b>
                                    <span className="corta">{[`Nº ${p.numero}`, p.municipio && nombrePropio(p.municipio), p.resumen].filter(Boolean).join(' · ')}</span>
                                    {(anulado || ligado || p.simulacion) && (
                                        <span className={anulado ? '' : 'tu'} style={anulado ? undefined : { color: 'var(--verde-txt)' }}>
                                            {anulado ? 'Anulado' : ligado ? 'Con su obra y su bono calculado' : 'Bono pedido'}
                                        </span>
                                    )}
                                </span>
                                <span className={`ia-pr-imp${anulado ? ' anulado' : ''}`}><b>{eur(p.total)}</b><span>{fechaCorta(p.fecha)}</span></span>
                            </button>
                        );
                    })}
                </section>
            )}
        </div>
    );
}

/** Confirmar ANULAR (no se borra: queda tachado y su número libre). */
function HojaAnular({ numero, onSi, onCerrar }) {
    const ref = useHojaTeclado(onCerrar);
    return (
        <div className="ia-velo" onPointerDown={(e) => { e.currentTarget.dataset.fondo = e.target === e.currentTarget ? '1' : ''; }}
            onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.fondo === '1') onCerrar(); }}>
            <div ref={ref} className="ia-hoja" role="dialog" aria-modal="true" aria-labelledby="ia-anular-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 id="ia-anular-h" className="ia-toca-h" style={{ margin: 0 }}>¿Anular el presupuesto {numero}?</h2>
                <p className="ia-pequeno" style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>No se borra: se queda en tu lista tachado. Si ya se lo pasaste a tu cliente, díselo tú.</p>
                <button type="button" className="ia-btn ia-btn-pri" onClick={onSi}>Sí, anularlo</button>
                <button type="button" className="ia-btn ia-btn-sec" onClick={onCerrar}>No, dejarlo</button>
            </div>
        </div>
    );
}

/**
 * La ficha de un presupuesto ya hecho.
 * onEditar(entrada) · onDuplicar(entrada) · onSimular({presupuesto, entrada}) · onAbrirObra(idOportunidad)
 */
export function PresupuestoFicha({ api, id, empresa, onVolver, onEditar, onDuplicar, onSimular, onAbrirObra, onCambio, recien = false }) {
    const [d, setD] = useState(null);
    const [error, setError] = useState(false);
    const [n, setN] = useState(0);
    const [wa, setWa] = useState(null);
    const [copiado, setCopiado] = useState(false);
    const [anular, setAnular] = useState(false);
    const [aviso, setAviso] = useState(null);
    const guardado = useGuardado();
    useEffect(() => {
        let vivo = true;
        setError(false);
        api.presupuestoHecho(id).then((r) => { if (vivo) setD(r); }).catch(() => { if (vivo) setError(true); });
        return () => { vivo = false; };
    }, [api, id, n]);

    if (error && !d) return <div className="ia-pagina estrecha"><Volver onVolver={onVolver} /><AvisoError onReintentar={() => setN((x) => x + 1)} /></div>;
    if (!d) return <div className="ia-pagina estrecha"><Volver onVolver={onVolver} /><Esqueleto alto={300} n={2} /></div>;

    const p = d.presupuesto || {};
    const entrada = d.entrada || null;
    const anulado = p.estado === 'ANULADO';
    const obraId = obraDelPresupuesto(p);
    const ligado = estaLigado(p);
    const cliente = p.cliente && typeof p.cliente === 'object' ? p.cliente : entrada?.cliente || {};
    const obra = p.obra && typeof p.obra === 'object' ? p.obra : entrada?.obra || {};
    // El del servidor manda (es el MISMO que va de pie en el WhatsApp, firmado con su nombre comercial).
    const texto = p.mensaje || mensajeParaCliente({ cliente, obra, total: p.total, emisor: empresa });

    const mandar = async () => {
        setAviso(null);
        try {
            const r = await guardado.correr(
                { enviando: 'Mandándotelo a tu WhatsApp…', ok: '¡Te lo hemos mandado!', icon: 'send' },
                () => api.presupuestoWhatsapp(p.id),
                {
                    subtitulo: (x) => `Míralo en tu WhatsApp${x?.a ? ` (${x.a})` : ''} y reenvíaselo tal cual a tu cliente.`,
                    alCampo: (e) => {
                        if (e?.response?.data?.code !== 'WHATSAPP_NO_DISPONIBLE' && e?.response?.status !== 409) return false;
                        setAviso(e?.response?.data?.error || 'Ahora mismo no te lo podemos mandar por WhatsApp. Descárgalo y pásaselo tú.');
                        return true;
                    },
                },
            );
            setWa(r || { ok: true });
        } catch { /* el popup o el aviso ya lo cuentan */ }
    };
    const descargar = async () => {
        setAviso(null);
        try {
            const r = await api.presupuestoDescarga(p.id);
            const url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url; a.download = r.nombre || `Presupuesto ${String(p.numero || '').replace(/\//g, '-')}.pdf`; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            setAviso('No se ha podido descargar. Inténtalo en un momento.');
        }
    };
    const copiar = async () => {
        try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sin portapapeles: se ve el texto */ }
    };
    const siAnular = async () => {
        setAnular(false);
        try {
            await guardado.correr({ enviando: 'Anulando…', ok: 'Presupuesto anulado', subtitulo: 'Se queda en tu lista, tachado.' }, () => api.anularPresupuesto(p.id));
            setN((x) => x + 1);
            onCambio?.();
        } catch { /* el popup lo cuenta */ }
    };

    const nombre = nombreCli(cliente);
    return (
        <div className="ia-pagina ancha" style={{ paddingTop: 0 }}>
            <Volver onVolver={onVolver} derecha={!anulado && onEditar && entrada
                ? <button type="button" className="ia-link" onClick={() => onEditar(entrada)}>Cambiarlo</button> : null} />
            <div className="ia-ficha-cab ia-entra">
                <p className="ia-eyebrow">Presupuesto {p.numero}{p.fecha ? ` · ${fechaCorta(p.fecha)}` : ''}</p>
                <h1 className="ia-display">{nombre}</h1>
                <p>{[resumenObra(obra), obra.municipio && nombrePropio(obra.municipio)].filter(Boolean).join(' · ')}</p>
            </div>

            <div className="ia-pr-dos">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                    {recien && !anulado && !wa && <div className="ia-aviso ia-entra" role="status" style={{ background: 'rgba(177,209,62,.18)', borderColor: 'rgba(77,107,15,.25)' }}>Guardado. Ahora mándatelo y pásaselo a tu cliente.</div>}
                    {anulado && <div className="ia-aviso tu" role="status"><b>Anulado.</b> Ya no vale; si lo necesitas, haz otro igual.</div>}

                    <section className="ia-card" aria-label="Total" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="ia-pr-totales">
                            <div className="fila"><span>Importe</span><b>{eur(p.base)}</b></div>
                            <div className="fila"><span>IVA {Number(p.iva_pct) || 21} %</span><b>{eur(p.iva)}</b></div>
                            <div className="total"><span>Total</span><b style={anulado ? { textDecoration: 'line-through', color: 'var(--gris2)' } : undefined}>{eur(p.total)}</b></div>
                        </div>

                        {!anulado && (
                            <div className="ia-pr-acciones">
                                <button type="button" className="ia-btn ia-btn-pri" onClick={mandar}>
                                    <Icono n="whatsapp" size={22} /> {wa ? 'Mandármelo otra vez' : 'Envíamelo por WhatsApp'}
                                </button>
                                <button type="button" className="ia-btn ia-btn-sec" onClick={descargar}>
                                    <Icono n="subir" size={20} style={{ transform: 'rotate(180deg)' }} /> Descargar el PDF
                                </button>
                                {ligado ? (
                                    obraId && onAbrirObra && <button type="button" className="ia-btn ia-btn-sec" onClick={() => onAbrirObra(obraId)}>
                                        <Icono n="obras" size={20} /> Ver la obra y su bono
                                    </button>
                                ) : onSimular && (
                                    <button type="button" className="ia-btn ia-btn-sec" onClick={() => onSimular({ presupuesto: p, entrada })}>
                                        <Icono n="mas" size={20} grosor={2.4} /> Calcular el bono CAE
                                    </button>
                                )}
                            </div>
                        )}
                        {aviso && <div className="ia-aviso tu" role="alert">{aviso}</div>}
                    </section>

                    {wa && (
                        <section className="ia-card ia-entra" aria-labelledby="ia-wa-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <p id="ia-wa-h" className="ia-eyebrow">Para tu cliente</p>
                            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
                                Te lo hemos mandado a tu WhatsApp{wa.a ? <> (<b>{wa.a}</b>)</> : null}. Reenvíaselo a tu cliente con este texto:
                            </p>
                            <div className="ia-pr-copiar">
                                <p>{texto}</p>
                                <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" style={{ alignSelf: 'flex-start' }} onClick={copiar} aria-live="polite">
                                    {copiado ? <><Icono n="ok" size={18} grosor={2.6} /> Copiado</> : 'Copiar el texto'}
                                </button>
                            </div>
                        </section>
                    )}

                    <section className="ia-card filas" aria-label="Más">
                        {onDuplicar && entrada && (
                            <button type="button" className="ia-fila primera sin-pad" onClick={() => onDuplicar(entrada)}>
                                <span className="ia-baldosa nos" aria-hidden="true"><Icono n="factura" size={20} /></span>
                                <span className="ia-fila-txt"><b>Hacer otro igual</b><span>Con otro número, para cambiar lo que quieras</span></span>
                                <Icono n="chevron" size={20} className="ia-chev" />
                            </button>
                        )}
                        {!anulado && (
                            <button type="button" className={`ia-fila sin-pad${onDuplicar && entrada ? '' : ' primera'}`} onClick={() => setAnular(true)}>
                                <span className="ia-baldosa nos" aria-hidden="true"><Icono n="salir" size={20} /></span>
                                <span className="ia-fila-txt"><b>Anular</b><span>Se queda tachado en tu lista</span></span>
                                <Icono n="chevron" size={20} className="ia-chev" />
                            </button>
                        )}
                    </section>
                </div>

                <div className="ia-pr-pdf" style={{ minWidth: 0 }}>
                    <p className="ia-eyebrow" style={{ padding: '4px 4px 8px' }}>Así lo ve tu cliente</p>
                    <HojasPdf clave={`ph-${p.id}-${p.updated_at || n}`} nombre={`Presupuesto ${p.numero}.pdf`} conPie={false}
                        cargar={() => api.presupuestoHechoPdf(p.id)} />
                </div>
            </div>

            {anular && <HojaAnular numero={p.numero} onSi={siAnular} onCerrar={() => setAnular(false)} />}
            {guardado.overlay}
        </div>
    );
}

function Volver({ onVolver, derecha = null }) {
    return (
        <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
            <button type="button" className="ia-volver" onClick={onVolver}><Icono n="atras" size={22} /> Presupuestos</button>
            {derecha}
        </div>
    );
}
