import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOILER_EFFICIENCIES } from '../calculator/logic/calculation';
import { EMITTER_OPTIONS } from '../expedientes/logic/cifoDoc';
import { bloqueConfirmacionCertificador } from '../expedientes/logic/confirmacionCliente';
import { etiquetaFotovoltaica } from '../expedientes/logic/fotovoltaica';

// ============================================================================
// La PÁGINA DEL ENCARGO del certificador — /encargo/:id?token=&phase=[&origen=cee]
//
// Todo el encargo en UNA página, pensada para el móvil: lo que le toca ahora
// (con su botón), a quién llamar, dónde es y cómo llegar, qué hay en la vivienda
// y qué se instala, lo que confirmó el cliente, las fotos que ya mandó —y las
// que faltan— y los enlaces para subir, firmar y presentar. Antes eso eran un
// email, dos WhatsApp y una carpeta de Drive.
//
// Los datos los compone el servidor (`services/encargoTecnico.js`) con una LISTA
// BLANCA: ni un importe; del cálculo solo el OBJETIVO del certificado (demanda
// y superficie mínimas, las mismas cifras del email del encargo). Aquí solo se
// pinta, con las MISMAS piezas que el resto de la app (etiquetas de caldera y de
// emisor, lo que confirmó el cliente), para que no digan cosas distintas.
//
// La API va en RELATIVO, como la firma con el móvil: se abre en el teléfono.
// ============================================================================

const API = '/api/public';

const soloCifras = (t) => String(t || '').replace(/[^0-9+]/g, '');
const telHref = (t) => `tel:${soloCifras(t)}`;
function waHref(t) {
    let n = String(t || '').replace(/[^0-9]/g, '');
    if (n.length === 9) n = `34${n}`;
    return `https://wa.me/${n}`;
}
const fechaCorta = (iso) => {
    if (!iso) return null;
    const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};
const titulo = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const FICHA_TEXTO = {
    RES060: 'Cambio de caldera por aerotermia',
    RES080: 'Rehabilitación de la vivienda',
    RES093: 'Hibridación: aerotermia junto a la caldera',
    TER100: 'Cambio de caldera por aerotermia (terciario)',
    TER173: 'Hibridación en terciario',
};

const COLOR_PASO = {
    aceptar: 'border-violet-400/50 bg-violet-500/10',
    visita: 'border-brand/40 bg-brand/[0.07]',
    revision: 'border-sky-400/40 bg-sky-500/[0.07]',
    presentar: 'border-emerald-400/50 bg-emerald-500/10',
    registrado: 'border-emerald-400/40 bg-emerald-500/[0.06]',
};

/** La caldera en una línea: «Gas, posterior a 1998… · ATLANTIC NAEMA DUO 35 · 25 kW · 2016». */
function lineaCaldera(c, potencia) {
    if (!c) return null;
    const fila = BOILER_EFFICIENCIES.find(b => b.id === c.rendimiento_id);
    if (c.rendimiento_id === 'sin_calefaccion') return 'La vivienda no tiene calefacción';
    const partes = [
        fila ? fila.label.split('(')[0].trim() : null,
        [c.marca, c.modelo].filter(Boolean).join(' ') || null,
        potencia ? `${String(potencia).replace('.', ',')} kW` : null,
        c.anio_fabricacion ? `de ${c.anio_fabricacion}` : null,
    ].filter(Boolean);
    return partes.join(' · ') || null;
}
const lineaEquipo = (e) => (e ? [e.marca, e.modelo].filter(Boolean).join(' ') || e.modelo_conjunto || null : null);
const labelEmisor = (id) => EMITTER_OPTIONS.find(o => o.value === id)?.label || null;

/** Lo que confirmó el cliente, en filas y notas (sale del mismo texto que el encargo). */
function confirmado(e) {
    const texto = bloqueConfirmacionCertificador({
        confirmacion: e.confirmacion, cuestionario: e.cuestionario, cae: e.negocio !== 'cee',
    });
    if (!texto) return null;
    const filas = [], notas = [];
    for (const raw of texto.split('\n').slice(1)) {
        const l = raw.replace(/\*/g, '').trim();
        if (!l) continue;
        if (l.startsWith('• ')) {
            const [tema, ...resto] = l.slice(2).split(':');
            filas.push([tema.trim(), resto.join(':').trim()]);
        } else notas.push(l);
    }
    return filas.length || notas.length ? { filas, notas } : null;
}

// ── Piezas ───────────────────────────────────────────────────────────────────

const decimal = (v, d) => v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * El OBJETIVO del certificado. Son las MISMAS cifras del email del encargo (las
 * compone `objetivosEncargo` en el backend): de la demanda y la superficie sale
 * el ahorro en MWh que se puede certificar, y la página no puede decir otra cosa
 * que el correo.
 */
function Objetivo({ o }) {
    const cifras = (o.reforma
        ? [['Ahorro mínimo esperado', o.ahorro != null && `${decimal(o.ahorro, 0)} kWh/año`],
            ['Demanda de calefacción simulada', o.demanda != null && `${decimal(o.demanda, 1)} kWh/m²·año`]]
        : [['Demanda mínima', o.demanda != null && `${decimal(o.demanda, 1)} kWh/m²·año`],
            ['Superficie útil mínima', o.superficie != null && `${decimal(o.superficie, o.superficie % 1 ? 2 : 0)} m²`]]
    ).filter(([, v]) => v);
    return (
        <Tarjeta titulo="Objetivo del certificado">
            <p className="text-[13px] leading-snug text-white/75">
                {o.reforma
                    ? 'Del ahorro de energía final que recoja el certificado sale lo que se puede certificar. Como objetivo de seguridad, tiene que quedar por encima del estimado en la propuesta.'
                    : 'De la demanda de calefacción y de la superficie útil sale el ahorro en MWh que se puede certificar. Como objetivo de seguridad, la demanda del certificado debe quedar por encima de la estimada y la superficie útil no debe ser inferior.'}
            </p>
            <div className={`mt-3 grid gap-1.5 ${cifras.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {cifras.map(([t, v]) => (
                    <div key={t} className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-center">
                        <p className="text-[10.5px] font-bold uppercase tracking-wider text-white/60">{t}</p>
                        <p className="mt-0.5 text-[17px] font-black leading-tight text-amber-200">{v}</p>
                    </div>
                ))}
            </div>
            <p className="mt-2.5 text-[12px] leading-snug text-white/60">
                Certifica la vivienda tal y como es. Si con la vivienda real no sale, cuéntanoslo al enviarlo y lo miramos contigo.
            </p>
        </Tarjeta>
    );
}

function Tarjeta({ titulo: t, children, className = '' }) {
    return (
        <section className={`rounded-2xl border border-white/[0.08] bg-bkg-surface/90 p-4 shadow-lg ${className}`}>
            {t && <h2 className="mb-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-white/55">{t}</h2>}
            {children}
        </section>
    );
}

function Boton({ href, onClick, children, principal = false, disabled = false, externo = true }) {
    const cls = `flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-3 text-[14.5px] font-bold transition
                 ${principal ? 'bg-brand text-white shadow-lg shadow-brand/20 active:opacity-90'
                             : 'border border-white/15 bg-white/[0.05] text-white active:bg-white/[0.1]'}
                 ${disabled ? 'pointer-events-none opacity-40' : ''}`;
    if (href) {
        return <a href={href} className={cls} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
    }
    return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

function Contacto({ nombre, tlf, email, sub = null }) {
    return (
        <div className="space-y-2">
            <div>
                <p className="text-[16px] font-black leading-tight text-white">{nombre ? titulo(nombre) : 'Sin nombre'}</p>
                {sub && <p className="text-[12px] text-white/60">{sub}</p>}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
                <Boton href={tlf ? telHref(tlf) : null} externo={false} disabled={!tlf}>📞 Llamar</Boton>
                <Boton href={tlf ? waHref(tlf) : null} disabled={!tlf}>💬 WhatsApp</Boton>
                <Boton href={email ? `mailto:${email}` : null} externo={false} disabled={!email}>✉️ Email</Boton>
            </div>
            {(tlf || email) && (
                <p className="text-[12px] text-white/60">
                    {[tlf, email].filter(Boolean).join(' · ')}
                </p>
            )}
        </div>
    );
}

function Fila({ etiqueta, children }) {
    if (!children) return null;
    return (
        <div className="flex gap-3 border-t border-white/[0.06] py-2 first:border-t-0 first:pt-0">
            <span className="w-[42%] shrink-0 text-[12px] text-white/55">{etiqueta}</span>
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-white">{children}</span>
        </div>
    );
}

function Visor({ foto, url, onCerrar }) {
    useEffect(() => {
        const k = (ev) => { if (ev.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [onCerrar]);
    return createPortal(
        <div className="fixed inset-0 z-[600] flex flex-col bg-black/95" onClick={onCerrar}>
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <p className="min-w-0 truncate text-[12.5px] text-white/80">{foto.nombre}</p>
                <button onClick={onCerrar} aria-label="Cerrar"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">✕</button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-2">
                <img src={url(foto, 1600)} alt="" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
                <a href={url(foto)} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}
                   className="block rounded-xl border border-white/20 py-3 text-center text-[13px] font-bold text-white">
                    Abrir la foto original
                </a>
            </div>
        </div>,
        document.body,
    );
}

// ── La página ────────────────────────────────────────────────────────────────

export default function EncargoTecnicoView({ id, token, phase = 'inicial', origen = null }) {
    const [e, setE] = useState(null);
    const [error, setError] = useState(null);
    const [aceptando, setAceptando] = useState(false);
    const [avisoAceptar, setAvisoAceptar] = useState(null);
    const [visor, setVisor] = useState(null);
    const [copiado, setCopiado] = useState(false);

    const q = new URLSearchParams({ token, phase, ...(origen ? { origen } : {}) }).toString();
    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`${API}/encargo/${id}?${q}`);
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { setError(d.error || 'No se ha podido abrir el encargo.'); return; }
            setE(d);
            setError(null);
        } catch {
            setError('No se ha podido abrir el encargo. Comprueba la conexión y vuelve a intentarlo.');
        }
    }, [id, q]);
    useEffect(() => { cargar(); }, [cargar]);

    const url = useCallback((f, sz = null) =>
        `${API}/encargo/${id}/fichero/${f.id}?${q}${sz ? `&sz=${sz}` : ''}`, [id, q]);

    // Aceptar el encargo SIN salir de la página: por la misma ruta que el botón
    // del email (el mismo acuse, el mismo aviso a Brokergy).
    const aceptar = async () => {
        if (!e?.ack?.token) return;
        setAceptando(true);
        setAvisoAceptar(null);
        try {
            const r = e.negocio === 'cee'
                ? await fetch(`${API}/cee-ack/${id}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: e.ack.token, respuesta: 'acepta' }) })
                : await fetch(`/api/expedientes/${id}/cert-ack`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: e.ack.token, phase: e.ack.fase }) });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                setAvisoAceptar(d.error || 'No se ha podido aceptar ahora mismo.');
            }
            await cargar();
        } catch {
            setAvisoAceptar('No hay conexión. Vuelve a intentarlo.');
        } finally {
            setAceptando(false);
        }
    };

    const copiarRc = async () => {
        try { await navigator.clipboard.writeText(e.vivienda.rc); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
        catch { /* sin portapapeles: la referencia está a la vista */ }
    };

    if (error) {
        return (
            <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-bkg-deep p-8 text-center">
                <div className="text-4xl">📋</div>
                <p className="max-w-xs text-[15px] font-bold text-white">{error}</p>
            </div>
        );
    }
    if (!e) {
        return (
            <div className="flex min-h-[100dvh] items-center justify-center bg-bkg-deep">
                <p className="text-[12px] font-black uppercase tracking-widest text-white/70">Abriendo el encargo…</p>
            </div>
        );
    }

    const paso = e.paso || {};
    const inst = e.instalacion;
    const conf = confirmado(e);
    const subidos = Object.entries(e.subidos || {});
    const faltan = (e.material || []).filter(s => s.falta);
    const fechas = [['Visita', e.fechas?.visita], ['Firma', e.fechas?.firma], ['Registro', e.fechas?.registro]]
        .filter(([, v]) => v);

    return (
        <div className="min-h-[100dvh] bg-bkg-deep pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
            <div className="mx-auto w-full max-w-lg space-y-3 px-3 pt-[max(1rem,env(safe-area-inset-top))]">
                {/* Qué es */}
                <header className="px-1 pb-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Encargo · Brokergy</p>
                    <h1 className="text-[24px] font-black leading-tight">{e.faseLabel}</h1>
                    <p className="text-[13px] text-white/70">
                        Expediente <b className="text-white">{e.numero}</b>
                        {e.ficha && FICHA_TEXTO[e.ficha] ? ` · ${FICHA_TEXTO[e.ficha]}` : ''}
                    </p>
                    {e.tecnico && <p className="mt-1 text-[12.5px] text-white/60">Para {titulo(e.tecnico)}</p>}
                </header>

                {/* Qué le toca AHORA: lo primero, con su botón. */}
                <section className={`rounded-2xl border p-4 ${COLOR_PASO[paso.clave] || COLOR_PASO.visita}`}>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/60">Ahora</p>
                    <p className="text-[18px] font-black leading-snug">{paso.titulo}</p>
                    <p className="mt-1 text-[13px] leading-snug text-white/80">{paso.texto}</p>
                    <div className="mt-3 space-y-2">
                        {paso.clave === 'aceptar' && (
                            <>
                                <Boton principal onClick={aceptar} disabled={aceptando}>
                                    {aceptando ? 'Aceptando…' : '✅ Acepto el encargo'}
                                </Boton>
                                {e.ack?.rechazar && (
                                    <a href={e.ack.rechazar} className="block py-1 text-center text-[12.5px] text-white/60 underline">
                                        No puedo cogerlo
                                    </a>
                                )}
                                {avisoAceptar && <p className="text-[12.5px] text-amber-200">{avisoAceptar}</p>}
                            </>
                        )}
                        {(paso.clave === 'visita' || paso.clave === 'aceptar') && (
                            <Boton principal={paso.clave === 'visita'} href={e.enlaces.subir}>📤 Subir el certificado (.xml y .cex)</Boton>
                        )}
                        {paso.clave === 'revision' && <Boton href={e.enlaces.subir}>Ver lo que subiste</Boton>}
                        {paso.clave === 'presentar' && (
                            <>
                                {e.enlaces.presentar && <Boton principal href={e.enlaces.presentar}>✍️ Firmar y presentar</Boton>}
                                <Boton href={e.enlaces.subir}>📤 Subir el justificante y la etiqueta</Boton>
                            </>
                        )}
                    </div>
                    {!!subidos.length && paso.clave !== 'registrado' && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {subidos.map(([k, ok]) => (
                                <span key={k} className={`rounded-lg px-2 py-1 text-[11px] font-bold
                                    ${ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/[0.06] text-white/55'}`}>
                                    {ok ? '✓' : '·'} {k === 'registro' ? 'justificante' : k}
                                </span>
                            ))}
                        </div>
                    )}
                    {e.revision?.tecnico && (
                        <p className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] font-bold
                            ${e.revision.tecnico.estado === 'corregir' ? 'bg-rose-500/15 text-rose-100'
                                : e.revision.tecnico.estado === 'revisar' ? 'bg-amber-500/15 text-amber-100'
                                    : 'bg-emerald-500/10 text-emerald-100'}`}>
                            Revisión automática de lo que subiste: {e.revision.tecnico.titular}
                        </p>
                    )}
                </section>

                {/* A quién llamar */}
                <Tarjeta titulo="El cliente">
                    <Contacto nombre={e.cliente.nombre} tlf={e.cliente.tlf} email={e.cliente.email}
                              sub={e.cliente.dni ? `DNI ${e.cliente.dni}` : null} />
                    {e.cliente.contacto && (e.cliente.contacto.tlf || e.cliente.contacto.email) && (
                        <div className="mt-3 border-t border-white/[0.08] pt-3">
                            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/50">Persona de contacto</p>
                            <Contacto nombre={e.cliente.contacto.nombre} tlf={e.cliente.contacto.tlf} email={e.cliente.contacto.email} />
                        </div>
                    )}
                </Tarjeta>

                {/* Dónde es */}
                <Tarjeta titulo="La vivienda">
                    <p className="text-[14.5px] font-bold leading-snug">{e.vivienda.direccion || 'Sin dirección'}</p>
                    {e.cliente.domicilio && (
                        <p className="mt-1 text-[12px] text-white/60">Domicilio del cliente: {e.cliente.domicilio}</p>
                    )}
                    {e.vivienda.rc && (
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-[12px] text-white/55">Ref. catastral</span>
                            <span className="font-mono text-[13px] font-bold">{e.vivienda.rc}</span>
                            <button onClick={copiarRc} className="ml-auto min-h-[36px] rounded-lg border border-white/15 px-2.5 text-[12px] font-bold">
                                {copiado ? '✓ Copiada' : 'Copiar'}
                            </button>
                        </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <Boton principal href={e.vivienda.mapa} disabled={!e.vivienda.mapa}>🗺️ Cómo llegar</Boton>
                        <Boton href={e.vivienda.catastro} disabled={!e.vivienda.catastro}>Ver en Catastro</Boton>
                    </div>
                </Tarjeta>

                {/* Qué hay y qué se instala */}
                {inst && (
                    <Tarjeta titulo="La instalación">
                        <Fila etiqueta="Calefacción hoy">{lineaCaldera(inst.caldera, inst.potencia_caldera)}</Fila>
                        <Fila etiqueta="ACS hoy">{inst.caldera_acs ? lineaCaldera(inst.caldera_acs) : null}</Fila>
                        <Fila etiqueta="Emisores">{labelEmisor(inst.tipo_emisor)}</Fila>
                        <Fila etiqueta="Placas solares">{inst.fotovoltaica?.estado ? etiquetaFotovoltaica(inst.fotovoltaica) : null}</Fila>
                        <Fila etiqueta={e.fase === 'final' ? 'Se ha instalado' : 'Se instala'}>{lineaEquipo(inst.aerotermia)}</Fila>
                        <Fila etiqueta="Equipo de ACS">{inst.aerotermia_acs ? lineaEquipo(inst.aerotermia_acs) : null}</Fila>
                        {inst.hibridacion && (
                            <p className="mt-2 rounded-lg bg-white/[0.05] px-3 py-2 text-[12.5px] text-white/80">
                                Es una <b>hibridación</b>: la caldera se queda y trabaja junto a la aerotermia.
                            </p>
                        )}
                        {!inst.cambio_acs && (
                            <p className="mt-2 text-[12px] text-white/60">El agua caliente (ACS) no entra en esta actuación.</p>
                        )}
                    </Tarjeta>
                )}

                {/* Lo que tiene que alcanzar el certificado (lo mismo que el email) */}
                {e.objetivo && <Objetivo o={e.objetivo} />}

                {conf && (
                    <Tarjeta titulo={e.negocio === 'cee' ? 'Lo que contestó el cliente' : 'Lo que confirmó el cliente'}>
                        {conf.filas.map(([t, v]) => <Fila key={t} etiqueta={t}>{v}</Fila>)}
                        {conf.notas.map((n, i) => (
                            <p key={i} className="mt-2 rounded-lg bg-sky-500/10 px-3 py-2 text-[12.5px] leading-snug text-sky-100">{n}</p>
                        ))}
                    </Tarjeta>
                )}

                {/* Lo que ya mandó el cliente, y lo que falta */}
                <Tarjeta titulo="Fotos y documentos del cliente">
                    {faltan.length > 0 && (
                        <p className="mb-2.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[12.5px] leading-snug text-amber-100">
                            Falta: <b>{faltan.map(s => s.titulo).join(', ')}</b>. Si puedes, hazlas en la visita.
                        </p>
                    )}
                    {!(e.material || []).length && (
                        <p className="text-[12.5px] text-white/60">El cliente todavía no ha mandado nada.</p>
                    )}
                    <div className="space-y-3">
                        {(e.material || []).filter(s => s.ficheros.length).map(s => (
                            <div key={s.clave}>
                                <p className="mb-1.5 text-[12.5px] font-bold text-white/85">{s.titulo}</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {s.ficheros.map(f => (f.tipo === 'imagen' ? (
                                        <button key={f.id} onClick={() => setVisor(f)} aria-label={f.nombre || 'Foto'}
                                                className="aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                                            <img src={url(f, 400)} alt="" loading="lazy" className="h-full w-full object-cover" />
                                        </button>
                                    ) : (
                                        <a key={f.id} href={url(f)} target="_blank" rel="noopener noreferrer"
                                           className="relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg
                                                      border border-white/10 bg-white/[0.04] text-center">
                                            <img src={url(f, 400)} alt="" loading="lazy"
                                                 onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                                                 className="absolute inset-0 h-full w-full object-cover opacity-60" />
                                            <span className="croquis-chip relative rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-black text-white">
                                                {f.tipo === 'video' ? '▶ Vídeo' : f.tipo === 'pdf' ? 'PDF' : 'Abrir'}
                                            </span>
                                        </a>
                                    )))}
                                </div>
                            </div>
                        ))}
                    </div>
                </Tarjeta>

                {!!fechas.length && (
                    <Tarjeta titulo="Fechas">
                        {fechas.map(([k, v]) => <Fila key={k} etiqueta={k}>{fechaCorta(v)}</Fila>)}
                    </Tarjeta>
                )}

                {/* El resto de los accesos */}
                <Tarjeta titulo="Más accesos">
                    <div className="space-y-1.5">
                        {e.enlaces.carpeta && <Boton href={e.enlaces.carpeta}>📁 Carpeta del expediente (Drive)</Boton>}
                        <Boton href={e.enlaces.envolvente}>🧱 Preparar el .cex (envolvente CE3X)</Boton>
                        <Boton href={e.enlaces.app}>💻 Abrir el expediente en la app</Boton>
                    </div>
                    <p className="mt-2 text-[11.5px] leading-snug text-white/55">
                        La envolvente y la app se abren con tu usuario de Brokergy.
                    </p>
                </Tarjeta>

                <p className="px-2 pt-1 text-center text-[11.5px] text-white/45">
                    Este enlace es tuyo: no lo reenvíes. Si el encargo pasa a otro técnico, deja de funcionar.
                </p>
            </div>
            {visor && <Visor foto={visor} url={url} onCerrar={() => setVisor(null)} />}
        </div>
    );
}
