// ─── Tu página web (fase 3, prototipo «MiPagina») ────────────────────────────
// La ficha del instalador en brokergy.es («Encuentra tu instalador»): sus fotos con
// su estado (publicada · en revisión · «no vale» con su motivo), sus textos (los
// vigentes y los que esperan revisión) y lo que sale solo (obras, ayuda media,
// marcas). NADA se publica desde aquí: lo propone y lo revisa BROKERGY.
// Los envíos, con el popup de la casa (`alSubir` → SendActionOverlay).
import React, { useEffect, useRef, useState } from 'react';
import { Icono, Esqueleto, AvisoError, eur, iniciales } from '../ui/piezas';
import { useEnvio } from './AccionesObra';
import { ElegirFotosView } from './ElegirFotosView';

const CHIP_FOTO = { publicada: ['Publicada', 'pub'], revision: ['En revisión', 'rev'], no_vale: ['No vale', 'no'] };
const AVISO_REVISION = 'Antes de publicarlas las miramos nosotros: que no salga nadie, ni una matrícula, ni la dirección de la casa. Tarda un día.';

export function MiPaginaView({ api, onCambio, vistaInicial = 'pagina' }) {
    const [estado, setEstado] = useState({ datos: null, error: false });
    const [intento, setIntento] = useState(0);
    const [vista, setVista] = useState(vistaInicial); // 'pagina' | 'elegir'
    const [foto, setFoto] = useState(null);       // la foto abierta en la hoja
    const [subida, setSubida] = useState(null);   // ficheros elegidos del móvil, esperando el permiso
    const envio = useEnvio();
    useEffect(() => {
        let vivo = true;
        api.escaparate().then((d) => { if (vivo) setEstado({ datos: d, error: false }); })
            .catch(() => { if (vivo) setEstado((s) => ({ datos: s.datos, error: !s.datos })); });
        return () => { vivo = false; };
    }, [api, intento]);
    const recargar = () => { setIntento((k) => k + 1); onCambio?.(); };
    const arriba = () => document.getElementById('ia-main')?.scrollTo?.(0, 0);

    if (vista === 'elegir') {
        return (
            <>
                <ElegirFotosView api={api} alSubir={envio.alSubir} onVolver={() => { setVista('pagina'); arriba(); }}
                    onHecho={() => { recargar(); setVista('pagina'); arriba(); }} />
                {envio.overlay}
            </>
        );
    }

    const d = estado.datos;
    return (
        <div className="ia-pagina estrecha">
            <div className="ia-hola ia-entra">
                <h1 className="ia-display">Tu <span className="ia-mark">página web</span></h1>
                <p>Lo que ven tus futuros clientes en brokergy.es. Tú propones y nosotros lo miramos antes de publicarlo.</p>
            </div>
            {!d ? (estado.error ? <AvisoError onReintentar={() => setIntento((k) => k + 1)} texto="Es un fallo nuestro y pasajero. Tu página sigue en la web: vuelve a intentarlo en un momento." /> : <Esqueleto alto={160} n={3} />) : (
                <>
                    <Ficha ficha={d.ficha} />
                    <Fotos d={d} onAbrir={setFoto} onElegir={() => { setVista('elegir'); arriba(); }} onSubir={setSubida} />
                    <Textos key={`${intento}-${d.textos?.en_revision?.propuesto_at || ''}`} d={d} api={api} alSubir={envio.alSubir} onHecho={recargar} />
                    <SaleSolo s={d.sale_solo} />
                </>
            )}
            {foto && <HojaFoto foto={foto} api={api} alSubir={envio.alSubir} onCerrar={() => setFoto(null)} onHecho={() => { setFoto(null); recargar(); }} />}
            {subida && <HojaSubida ficheros={subida} api={api} alSubir={envio.alSubir} onCerrar={() => setSubida(null)} onHecho={() => { setSubida(null); recargar(); }} />}
            {envio.overlay}
        </div>
    );
}

// ── La ficha: nombre, URL, Ver mi página y Compartir ─────────────────────────
function Ficha({ ficha }) {
    const [copiado, setCopiado] = useState(false);
    const url = ficha?.url;
    const compartir = async () => {
        if (!url) return;
        try {
            if (navigator.share) { await navigator.share({ title: ficha.nombre, text: `${ficha.nombre} en BROKERGY`, url }); return; }
        } catch (e) { if (e?.name === 'AbortError') return; }
        try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sin portapapeles */ }
    };
    return (
        <section className="ia-card ia-pg-ficha ia-entra" aria-label="Tu ficha en la web">
            <div className="ia-pg-quien">
                <span className="ia-baldosa ia-pg-ini" aria-hidden="true">{iniciales(ficha?.nombre)}</span>
                <div>
                    <b>{ficha?.nombre || 'Tu empresa'}</b>
                    <span>{ficha?.municipio ? `Instalador en ${ficha.municipio}` : 'Instalador'}</span>
                </div>
                {url && <span className={`ia-chip${ficha.sale_en_web ? ' fin' : ''}`}>{ficha.sale_en_web ? 'Publicada' : 'Oculta'}</span>}
            </div>
            {url ? (
                <>
                    <p className="ia-pg-url">{url.replace(/^https?:\/\//, '')}</p>
                    {!ficha.sale_en_web && <div className="ia-aviso tu">Tu página está <b>oculta</b>: no sale en el buscador de la web. Si quieres que salga, dínoslo.</div>}
                    <div className="ia-dos">
                        <button type="button" className="ia-btn ia-btn-tinta ia-btn-peq" onClick={() => window.open(url, '_blank', 'noopener')}>
                            <Icono n="web" size={20} /> Ver mi página
                        </button>
                        <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" onClick={compartir}>
                            <Icono n="compartir" size={20} /> {copiado ? 'Enlace copiado' : 'Compartir'}
                        </button>
                    </div>
                    <span className="ia-sr" role="status">{copiado ? 'Enlace copiado' : ''}</span>
                </>
            ) : (
                <div className="ia-aviso">Tu página sale en la web en cuanto tengas <b>tu primera obra</b> con nosotros. Mientras, ya puedes preparar tus fotos y tus textos.</div>
            )}
        </section>
    );
}

// ── Tus fotos ────────────────────────────────────────────────────────────────
function Fotos({ d, onAbrir, onElegir, onSubir }) {
    const input = useRef(null);
    const fotos = d.fotos || [];
    const r = d.resumen_fotos || {};
    const noValen = fotos.filter((f) => f.estado === 'no_vale');
    return (
        <section className="ia-card ia-pg-sec ia-entra" aria-labelledby="ia-pg-fotos">
            <div className="ia-pg-tit">
                <p id="ia-pg-fotos" className="ia-eyebrow">Tus fotos</p>
                {fotos.length > 0 && <span>{[r.publicadas && `${r.publicadas} ${r.publicadas === 1 ? 'publicada' : 'publicadas'}`, r.revision && `${r.revision} en revisión`].filter(Boolean).join(' · ') || (fotos.length === 1 ? '1 foto' : `${fotos.length} fotos`)}</span>}
            </div>
            {fotos.length ? (
                <div className="ia-rejilla">
                    {fotos.map((f) => {
                        const c = CHIP_FOTO[f.estado] || CHIP_FOTO.revision;
                        return (
                            <button key={f.id} type="button" className="ia-foto" onClick={() => onAbrir(f)}
                                aria-label={`Foto ${f.fase === 'antes' ? 'de antes' : 'de después'}${f.municipio ? ` en ${f.municipio}` : ''}: ${c[0].toLowerCase()}`}>
                                <img src={f.miniatura} alt="" loading="lazy" />
                                <span className={`ia-foto-chip ${c[1]}`}>{c[0]}</span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="ia-vacio" style={{ padding: '6px 8px 4px' }}>
                    <span className="ia-baldosa"><Icono n="camara" size={22} /></span>
                    <b>Aún no tienes fotos en tu página</b>
                    <p>Las obras con fotos de antes y después son las que más llaman. Elige las de tus obras o sube otras del móvil.</p>
                </div>
            )}
            {noValen.length > 0 && (
                <div className="ia-aviso tu" role="status">
                    <b>{noValen.length === 1 ? 'Una foto no vale' : `${noValen.length} fotos no valen`}.</b> Tócala para ver por qué{noValen[0].motivo ? `: «${noValen[0].motivo}»` : ''}.
                </div>
            )}
            <button type="button" className="ia-btn ia-btn-pri" onClick={onElegir}><Icono n="obras" size={22} /> Elegir fotos de mis obras</button>
            <button type="button" className="ia-btn ia-btn-sec" onClick={() => input.current?.click()}><Icono n="camara" size={20} /> Subir fotos del móvil</button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden
                onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) onSubir(fs); }} />
            <div className="ia-aviso tu">{AVISO_REVISION}</div>
        </section>
    );
}

// ── La hoja de una foto: grande, su estado, su motivo y «Quitar» ─────────────
function HojaFoto({ foto, api, alSubir, onCerrar, onHecho }) {
    const c = CHIP_FOTO[foto.estado] || CHIP_FOTO.revision;
    const quitar = async () => {
        try {
            await alSubir({ enviando: 'Quitando la foto…', ok: 'Foto quitada', subtitulo: foto.estado === 'publicada' ? 'Ya no sale en tu página.' : 'Ya no la revisamos.' })(() => api.retirarFoto(foto.id));
            onHecho();
        } catch { /* el popup lo dice */ }
    };
    return (
        <div className="ia-velo" onPointerDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div className="ia-hoja" role="dialog" aria-modal="true" aria-label="Tu foto">
                <div className="ia-hoja-asa" />
                <div className="ia-hoja-foto"><img src={foto.miniatura} alt="" /></div>
                <div className="ia-pg-quien" style={{ padding: '12px 2px 10px' }}>
                    <div><b>{foto.fase === 'antes' ? 'Antes' : 'Después'}{foto.municipio ? ` · ${foto.municipio}` : ''}</b>
                        <span>{foto.origen === 'suelta' ? 'Subida del móvil' : 'De una de tus obras'}</span></div>
                    <span className={`ia-foto-chip ${c[1]} est`}>{c[0]}</span>
                </div>
                {foto.estado === 'no_vale' && <div className="ia-aviso tu" style={{ marginBottom: 10 }}><b>Por qué no vale:</b> {foto.motivo || 'no nos ha servido para publicarla.'}</div>}
                {foto.estado === 'revision' && <p className="ia-pequeno" style={{ margin: '0 2px 10px' }}>La estamos mirando. Tarda un día.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button type="button" className="ia-btn ia-btn-sec" onClick={quitar}>Quitar de mi página</button>
                    <button type="button" className="ia-btn ia-btn-sec" onClick={onCerrar}>Volver</button>
                </div>
            </div>
        </div>
    );
}

// ── Subir del móvil: el permiso antes de enviar ──────────────────────────────
function HojaSubida({ ficheros, api, alSubir, onCerrar, onHecho }) {
    const [permiso, setPermiso] = useState(false);
    const n = ficheros.length;
    const grandes = ficheros.filter((f) => f.size > 10 * 1024 * 1024).length;
    const enviar = async () => {
        try {
            await alSubir({
                enviando: n === 1 ? 'Subiendo tu foto…' : `Subiendo ${n} fotos…`, ok: '¡Fotos enviadas a revisión!', subtitulo: AVISO_REVISION,
            })(() => api.subirFotos(ficheros));
            onHecho();
        } catch { /* el popup lo dice */ }
    };
    const listo = permiso && !grandes && n <= 10;
    return (
        <div className="ia-velo" onPointerDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div className="ia-hoja" role="dialog" aria-modal="true" aria-label="Subir fotos del móvil">
                <div className="ia-hoja-asa" />
                <p className="ia-eyebrow" style={{ padding: '4px 2px 6px' }}>Subir del móvil</p>
                <p className="ia-toca-h" style={{ padding: '0 2px 10px' }}>{n === 1 ? 'Vas a subir 1 foto' : `Vas a subir ${n} fotos`}</p>
                {(grandes > 0 || n > 10) && (
                    <div className="ia-aviso tu" style={{ marginBottom: 10 }}>
                        {n > 10 ? 'Como mucho 10 fotos de una vez.' : `${grandes === 1 ? 'Una foto pesa' : `${grandes} fotos pesan`} más de 10 MB: elige otra.`}
                    </div>
                )}
                <label className="ia-permiso" style={{ marginBottom: 12 }}>
                    <input type="checkbox" checked={permiso} onChange={(e) => setPermiso(e.target.checked)} />
                    <span>Los clientes me han dicho que <b>puedo enseñar</b> estas fotos.</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button type="button" className={`ia-btn ${listo ? 'ia-btn-pri' : 'ia-btn-sec'}`} disabled={!listo} onClick={enviar}>
                        {listo ? 'Enviar a revisión' : 'Marca que tienes permiso'}
                    </button>
                    <button type="button" className="ia-btn ia-btn-sec" onClick={onCerrar}>Volver</button>
                </div>
            </div>
        </div>
    );
}

// ── Tus textos ───────────────────────────────────────────────────────────────
function Textos({ d, api, alSubir, onHecho }) {
    const t = d.textos || {};
    const max = d.limites?.presentacion || 300;
    const base = t.en_revision || t.no_vale || t.vigentes || {};
    const [pres, setPres] = useState(base.presentacion || '');
    const [esp, setEsp] = useState(() => new Set(base.especialidades || []));
    const [pueblos, setPueblos] = useState((base.pueblos || []).join(', '));
    const largo = pres.trim().length > max;
    const guardar = async () => {
        try {
            await alSubir({ enviando: 'Guardando tus textos…', ok: '¡Textos enviados a revisión!', error: 'No se han podido guardar',subtitulo: 'Los miramos y, si están bien, salen en tu página. Mientras, se ve lo de antes.' })(
                () => api.guardarTextos({ presentacion: pres, especialidades: [...esp], pueblos }));
            onHecho();
        } catch { /* el popup dice qué falla (un teléfono, un precio…) */ }
    };
    const conmutar = (id) => setEsp((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
    return (
        <section className="ia-card ia-pg-sec ia-entra" aria-labelledby="ia-pg-textos">
            <div className="ia-pg-tit"><p id="ia-pg-textos" className="ia-eyebrow">Tus textos</p></div>
            {t.en_revision && <div className="ia-aviso tu" role="status"><b>Tus textos están en revisión.</b> Mientras, en tu página sale lo de antes. Si los cambias, se revisa lo último.</div>}
            {t.no_vale && <div className="ia-aviso tu" role="status"><b>Tus últimos textos no valen:</b> {t.no_vale.motivo || 'revísalos y vuelve a enviarlos.'}</div>}
            <label className="ia-campo">
                <span>Preséntate en dos frases</span>
                <textarea rows={4} value={pres} maxLength={max + 50} onChange={(e) => setPres(e.target.value)}
                    placeholder="Quiénes sois, desde cuándo, qué hacéis mejor." />
                <small className={largo ? 'mal' : ''}>{pres.trim().length} de {max} letras · sin teléfonos ni precios</small>
            </label>
            <fieldset className="ia-campo">
                <legend>A qué te dedicas</legend>
                <div className="ia-chips">
                    {(d.especialidades || []).map((e) => (
                        <button key={e.id} type="button" className="ia-filtro" aria-pressed={esp.has(e.id)} onClick={() => conmutar(e.id)}>{e.texto}</button>
                    ))}
                </div>
            </fieldset>
            <label className="ia-campo">
                <span>Pueblos donde trabajas</span>
                {/* Un área y no una línea: con varios pueblos, una línea los cortaba. */}
                <textarea rows={2} value={pueblos} onChange={(e) => setPueblos(e.target.value)} placeholder="Tomelloso, Socuéllamos" autoComplete="off" />
                <small>Separados por comas. Como mucho {d.limites?.pueblos || 15}.</small>
            </label>
            <button type="button" className="ia-btn ia-btn-pri" disabled={largo} onClick={guardar}>Guardar los textos</button>
        </section>
    );
}

// ── Lo que sale solo ─────────────────────────────────────────────────────────
function SaleSolo({ s = {} }) {
    return (
        <section className="ia-card ia-pg-sec ia-entra" aria-labelledby="ia-pg-solo">
            <div className="ia-pg-tit"><p id="ia-pg-solo" className="ia-eyebrow">Lo que sale solo</p></div>
            <dl className="ia-dl">
                <div className="primera"><dt>Obras con ayuda</dt><dd>{s.obras || 0}</dd></div>
                <div><dt>Ayuda media de tus clientes</dt>
                    <dd className={s.ayuda_media != null ? 'v' : ''}>{s.ayuda_media != null ? eur(s.ayuda_media) : `Sale con ${s.min_obras_media || 3} obras`}</dd></div>
                <div><dt>Marcas que instalas</dt><dd>{(s.marcas || []).length ? s.marcas.join(', ') : '—'}</dd></div>
            </dl>
            <p className="ia-nota">Lo calculamos de tus obras. Nunca sale el nombre de un cliente ni lo que cobró cada uno.</p>
        </section>
    );
}
