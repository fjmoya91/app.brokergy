import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';

// ─── Encargar la PRESENTACIÓN del CEE ────────────────────────────────────────
// Le manda a quien presenta (Eva) un correo con los TRES ficheros —el .cex, el
// .xml y el PDF firmado— y un enlace sin cuenta donde tiene el borrador del
// Registro y dónde subir el justificante. Ver services/presentacionCeeService.js.
//
// REGLA — si falta uno de los tres no se envía nada, y se dice cuál. Un fichero
// con «REVISAR» en el nombre no cuenta: es un borrador de la app, no el
// certificado.
//
// REGLA — volver a enviarlo deja sin valor el enlace anterior. Se dice antes de
// pulsar, porque quien lo recibió puede tenerlo abierto.

const fechaEs = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fechaCorta = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : ''; };
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

// `onValidar` — si el CEE está PENDIENTE del visto bueno: enviarlo a presentar
// es darlo por bueno, así que al enviar también se valida (sin avisar al técnico,
// que es el de la casa). Y deja «Solo validar» para cuando no se le encarga a nadie.
export function EncargarPresentacionModal({ isOpen, onClose, apiBase, expedienteId, fase, onEnviado, onValidar = null }) {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [nombre, setNombre] = useState('');
    const [email, setEmail] = useState('');
    const [nota, setNota] = useState('');
    const [overlay, setOverlay] = useState({ phase: null });
    const [copiado, setCopiado] = useState(false);
    const [copiadoBandeja, setCopiadoBandeja] = useState(false);
    const [retirando, setRetirando] = useState(false);
    const [validando, setValidando] = useState(false);

    const cargar = async () => {
        setCargando(true);
        setError(null);
        try {
            const { data } = await axios.get(`${apiBase}/${expedienteId}/presentacion-cee`, { params: { fase } });
            setDatos(data);
            // Quien presenta: el del encargo vigente, o el último que se usó.
            const p = data?.encargo?.email ? { nombre: data.encargo.nombre, email: data.encargo.email } : data?.presentador;
            if (p) { setNombre(n => n || p.nombre || ''); setEmail(e => e || p.email || ''); }
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo preparar el encargo');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => { if (isOpen && expedienteId) cargar(); }, [isOpen, expedienteId, fase]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const faltan = datos?.faltan || [];
    const enc = datos?.encargo;
    const puedeEnviar = datos && !faltan.length && !datos.registrado && emailValido(email) && overlay.phase !== 'sending';

    const enviar = async () => {
        if (!puedeEnviar) return;
        setOverlay({ phase: 'sending' });
        try {
            const { data } = await axios.post(`${apiBase}/${expedienteId}/presentacion-cee`,
                { fase, email: email.trim(), nombre: nombre.trim(), nota: nota.trim() }, { timeout: 120000 });
            const items = [`Para ${nombre.trim() || data.para} · ${data.para}`, ...(data.adjuntos || []).map(a => `📎 ${a}`)];
            // El encargo ya ha salido: un fallo al validar no lo deshace, se dice.
            if (onValidar) {
                try {
                    await onValidar(`Presentación encargada a ${nombre.trim() || data.para}.`);
                    items.unshift({ texto: 'Visto bueno dado (sin aviso al técnico)', tono: 'ok' });
                } catch (e) {
                    items.unshift({ texto: `El encargo ha salido, pero NO se ha podido dar el visto bueno: ${e.response?.data?.error || e.message}. Pulsa «Validar» otra vez.`, tono: 'aviso' });
                }
            }
            setOverlay({ phase: 'done', ok: true, items });
            onEnviado?.();
            cargar();
        } catch (e) {
            setOverlay({ phase: 'done', ok: false, errorText: e.response?.data?.error || 'No se pudo enviar el encargo' });
        }
    };

    // Visto bueno SIN encargo: lo presenta otro, o aún faltan ficheros para Eva.
    const soloValidar = async () => {
        if (!onValidar || validando) return;
        setValidando(true);
        setOverlay({ phase: 'sending', titulo: 'Validando el CEE…' });
        try {
            await onValidar(enc?.activo
                ? `La presentación ya estaba encargada a ${enc.nombre || enc.email}.`
                : 'Sin encargo de presentación.');
            setOverlay({ phase: 'done', ok: true, okTitle: 'CEE validado',
                items: [{ texto: 'Visto bueno dado (sin aviso al técnico)', tono: 'ok' }] });
            onEnviado?.();
        } catch (e) {
            setOverlay({ phase: 'done', ok: false, errorText: e.response?.data?.error || 'No se ha podido validar el CEE' });
        } finally {
            setValidando(false);
        }
    };

    const retirar = async () => {
        if (retirando) return;
        setRetirando(true);
        try {
            await axios.post(`${apiBase}/${expedienteId}/presentacion-cee/retirar`, { fase });
            onEnviado?.();
            await cargar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo retirar el encargo');
        } finally {
            setRetirando(false);
        }
    };

    const copiarEnlace = async () => {
        if (!datos?.enlace) return;
        try {
            await navigator.clipboard.writeText(datos.enlace);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1800);
        } catch { setError('No se pudo copiar: selecciónalo a mano.'); }
    };

    // Su página con TODO lo pendiente: va en cada correo, y se puede copiar aquí
    // para pasársela por otro canal.
    const copiarBandeja = async () => {
        if (!datos?.bandeja) return;
        try {
            await navigator.clipboard.writeText(datos.bandeja);
            setCopiadoBandeja(true);
            setTimeout(() => setCopiadoBandeja(false), 1800);
        } catch { setError('No se pudo copiar: selecciónalo a mano.'); }
    };

    const plazo = datos?.plazo;

    return (
        <div className="fixed inset-0 z-[540] flex items-center justify-center max-md:items-end bg-black/70 backdrop-blur-sm p-4 max-md:p-0"
             onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl max-md:rounded-b-none max-md:rounded-t-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">{onValidar ? '✓ Validar y enviar a presentar' : '✉ Enviar a presentar'}</h3>
                        <p className="text-[10px] text-white/40 normal-case mt-1 leading-snug">
                            {datos ? `${datos.faseLabel} · ${datos.numero}${datos.cliente ? ` · ${datos.cliente}` : ''}` : 'Preparando…'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5 text-white/40">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {cargando && !datos && <p className="text-[11px] text-white/40 normal-case">Mirando la carpeta del CEE…</p>}
                    {error && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[11px] text-red-300 normal-case leading-snug">{error}</div>
                    )}

                    {datos && onValidar && !datos.registrado && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-[11px] text-emerald-200/90 normal-case leading-snug">
                            El visto bueno <b>no se le envía a nadie</b>: el certificador es de la casa.
                            {enc?.activo
                                ? <> La presentación ya está encargada a <b>{enc.nombre || enc.email}</b>: basta con validar.</>
                                : <> Al enviar el encargo queda <b>validado</b> a la vez. Si lo presentas tú, «Solo validar».</>}
                        </div>
                    )}

                    {datos && (
                        <>
                            <p className="text-[11px] text-white/55 normal-case leading-snug">
                                Le llega un correo con el <b className="text-white/80">borrador</b> y los <b className="text-white/80">tres ficheros</b> adjuntos, y un enlace
                                (sin usuario ni contraseña) donde copiar cada casilla y subir el justificante.
                                No ve ningún importe.
                            </p>

                            {datos.registrado && (
                                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-[11px] text-emerald-300 normal-case">
                                    ✓ Este CEE ya está registrado{datos.fechaRegistro ? ` (${fechaCorta(datos.fechaRegistro)})` : ''}: no hay nada que presentar.
                                </div>
                            )}

                            {/* Los tres ficheros */}
                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                                <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-2">Adjuntos</div>
                                <div className="space-y-1.5">
                                    {/* El borrador del Registro: se prepara en el momento de enviar. */}
                                    <div className="flex items-start gap-2">
                                        <span className="shrink-0 text-[11px] text-emerald-400">✓</span>
                                        <div className="min-w-0">
                                            <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">Borrador para presentar (PDF)</div>
                                            <span className="text-[11px] text-white/55 normal-case">Lo que va en cada casilla del formulario · se prepara al enviar</span>
                                        </div>
                                    </div>
                                    {datos.ficheros.map(f => (
                                        <div key={f.clave} className="flex items-start gap-2">
                                            <span className={`shrink-0 text-[11px] ${f.presente ? 'text-emerald-400' : 'text-red-400'}`}>{f.presente ? '✓' : '✗'}</span>
                                            <div className="min-w-0">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">{f.titulo}</div>
                                                {f.presente
                                                    ? <code className="block text-[11px] text-white/75 break-all normal-case">{f.nombre}</code>
                                                    : <span className="text-[11px] text-red-300/90 normal-case">No está en la carpeta del CEE</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {faltan.length > 0 && (
                                    <p className="text-[10px] text-red-300/90 normal-case leading-snug mt-2">
                                        Falta {faltan.join(', ')}: no se envía nada hasta que estén los tres.
                                        Los ficheros con «REVISAR» en el nombre no cuentan.
                                        {onValidar && ' Puedes validarlo ya y enviárselo cuando estén.'}
                                    </p>
                                )}
                                {(datos.avisos || []).map((a, i) => (
                                    <p key={i} className="text-[10px] text-amber-300/80 normal-case leading-snug mt-1.5">{a}</p>
                                ))}
                            </div>

                            {plazo && (
                                <p className={`text-[10px] normal-case leading-snug ${plazo.quedan < 0 ? 'text-red-300' : plazo.quedan <= 7 ? 'text-amber-300' : 'text-white/45'}`}>
                                    Plazo para registrarlo: {plazo.quedan < 0 ? `vencido el ${fechaCorta(plazo.limite)}` : `hasta el ${fechaCorta(plazo.limite)} (quedan ${plazo.quedan} días)`}.
                                </p>
                            )}

                            {/* Encargo vigente */}
                            {enc?.enviado_at && (
                                <div className={`rounded-xl border px-4 py-3 ${enc.activo ? 'border-brand/30 bg-brand/[0.05]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
                                    <div className="text-[11px] text-white/75 normal-case leading-snug">
                                        {enc.activo ? 'Enviado' : 'Se envió'} a <b>{enc.nombre || enc.email}</b> el {fechaEs(enc.enviado_at)}
                                        {enc.veces > 1 ? ` (${enc.veces}ª vez)` : ''}.
                                        {enc.registrado_at && <span className="text-emerald-400"> ✓ Justificante subido el {fechaEs(enc.registrado_at)}.</span>}
                                        {!enc.activo && enc.retirado_at && <span className="text-white/40"> Retirado el {fechaEs(enc.retirado_at)}: su enlace ya no vale.</span>}
                                    </div>
                                    {enc.activo && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            <button type="button" onClick={copiarEnlace}
                                                    className="px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-white/5 text-white/55 hover:bg-brand/20 hover:text-brand">
                                                {copiado ? '✓ Copiado' : '🔗 Copiar su enlace'}
                                            </button>
                                            <button type="button" onClick={retirar} disabled={retirando}
                                                    className="px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-white/5 text-white/45 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40">
                                                {retirando ? 'Retirando…' : 'Retirar el encargo'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {datos.bandeja && (
                                <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
                                    <span className="text-[10px] text-white/50 normal-case leading-snug">
                                        Su página con todo lo pendiente de presentar (va también en cada correo).
                                    </span>
                                    <button type="button" onClick={copiarBandeja}
                                            className="shrink-0 px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-white/5 text-white/55 hover:bg-brand/20 hover:text-brand">
                                        {copiadoBandeja ? '✓ Copiado' : '📋 Copiar su página'}
                                    </button>
                                </div>
                            )}

                            {/* Destinatario */}
                            {!datos.registrado && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 max-md:grid-cols-1 gap-2">
                                        <label className="block">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Nombre</span>
                                            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Eva"
                                                   className="mt-1 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white normal-case no-uppercase max-md:text-[16px]" />
                                        </label>
                                        <label className="block">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Correo</span>
                                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com"
                                                   className="mt-1 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white normal-case no-uppercase max-md:text-[16px]" />
                                        </label>
                                    </div>
                                    <label className="block">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Nota (opcional)</span>
                                        <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                                                  placeholder="Algo que deba saber para presentarlo"
                                                  className="mt-1 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white normal-case no-uppercase resize-y max-md:text-[16px]" />
                                    </label>
                                    {enc?.activo && (
                                        <p className="text-[10px] text-amber-300/80 normal-case leading-snug">
                                            Volver a enviarlo genera un enlace nuevo: el que tiene {enc.nombre || 'ahora'} dejará de valer.
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {datos && !datos.registrado && (() => {
                    const quien = nombre.trim() ? ` a ${nombre.trim().split(/\s+/)[0]}` : '';
                    // Con el encargo ya enviado (o sin los ficheros para enviarlo),
                    // lo que toca es validar: reenviar le cambiaría el enlace a
                    // quien ya lo tiene.
                    const validarPrimero = !!onValidar && (!!enc?.activo || faltan.length > 0);
                    const secundario = 'px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 text-white/60 hover:text-white hover:border-white/25 disabled:opacity-40';
                    const btnEnviar = (
                        <button type="button" onClick={enviar} disabled={!puedeEnviar}
                                className={validarPrimero ? secundario
                                    : 'px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-brand/40 bg-brand/15 text-brand hover:bg-brand hover:text-black transition-colors disabled:opacity-40 disabled:hover:bg-brand/15 disabled:hover:text-brand'}>
                            {enc?.activo ? 'Volver a enviar' : onValidar ? `Validar y enviar${quien}` : `Enviar${quien}`}
                        </button>
                    );
                    const btnValidar = onValidar ? (
                        <button type="button" onClick={soloValidar} disabled={validando}
                                className={validarPrimero
                                    ? 'px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40'
                                    : secundario}>
                            {validando ? 'Validando…' : enc?.activo ? '✓ Validar' : 'Solo validar'}
                        </button>
                    ) : null;
                    return (
                        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t border-white/[0.06] shrink-0 max-md:pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                            <button type="button" onClick={onClose}
                                    className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">
                                Cancelar
                            </button>
                            {validarPrimero ? <>{btnEnviar}{btnValidar}</> : <>{btnValidar}{btnEnviar}</>}
                        </div>
                    );
                })()}
            </div>

            <SendActionOverlay
                phase={overlay.phase}
                ok={overlay.ok}
                items={overlay.items}
                errorText={overlay.errorText}
                subtitle={datos ? `${datos.numero} · ${datos.faseLabel}` : ''}
                sendingTitle={overlay.titulo || 'Enviando el encargo…'}
                okTitle={overlay.okTitle || (onValidar ? 'Validado y enviado' : 'Encargo enviado')}
                errorTitle="No se ha enviado"
                onClose={() => setOverlay({ phase: null })}
            />
        </div>
    );
}

export default EncargarPresentacionModal;
