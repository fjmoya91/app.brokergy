import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BorradorCeeModal } from '../../expedientes/components/BorradorCeeModal';

// RELATIVO también en desarrollo (como PresentarCeeView): la abre una persona de
// fuera desde su ordenador con un enlace nuestro. Vite proxea /api.
const API_URL = '/api/public/presentar';

// ─────────────────────────────────────────────────────────────────────────────
// PresentarEncargoView — /presentar/:negocio/:id?fase=&token=
//
// Lo que ve quien PRESENTA el CEE en el Registro por encargo nuestro (Eva), sin
// cuenta: los tres ficheros que se anexan (.cex, .xml y PDF firmado), el borrador
// con cada casilla del formulario y dónde subir el justificante de registro.
// Ni un importe. Ver services/presentacionCeeService.js.
//
// REGLA — los pasos en el orden en que ocurren: descargar → presentar → subir el
// justificante. Subido el justificante, la página lo dice en verde y ya no pide
// nada: es la señal de que el trabajo está entregado.
// ─────────────────────────────────────────────────────────────────────────────
export function PresentarEncargoView({ negocio, id, token, fase = 'inicial' }) {
    const [info, setInfo] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [borradorAbierto, setBorradorAbierto] = useState(false);
    const [descargando, setDescargando] = useState(null);

    const base = `${API_URL}/${negocio}`;
    const params = { token, fase };

    const cargar = useCallback(async () => {
        try {
            const { data } = await axios.get(`${base}/${id}`, { params: { token, fase } });
            setInfo(data);
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo abrir el encargo.');
        } finally {
            setCargando(false);
        }
    }, [base, id, token, fase]);

    useEffect(() => { cargar(); }, [cargar]);

    const descargar = async (f) => {
        if (!f.presente || descargando) return;
        setDescargando(f.clave);
        try {
            const resp = await axios.get(`${base}/${id}/borrador-cee/fichero`,
                { params: { ...params, doc: f.clave }, responseType: 'blob', timeout: 60000 });
            const url = URL.createObjectURL(resp.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = f.nombreRegistro || 'documento';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch (e) {
            let msg = 'No se pudo descargar el fichero';
            try { msg = JSON.parse(await e.response?.data?.text())?.error || msg; } catch { /* noop */ }
            setError(msg);
        } finally {
            setDescargando(null);
        }
    };

    // Lo que devuelve la sede, desde el popup del borrador.
    const subirDevuelto = async (_fase, doc, file) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('tipo', doc.clave);
        const { data } = await axios.post(`${base}/${id}/devuelto`, fd,
            { params: { ...params, tipo: doc.clave }, timeout: 120000 });
        cargar();
        if (doc.clave === 'registro' && data?.fecha_registro) {
            const [a, m, d] = String(data.fecha_registro).split('-');
            return { texto: `${file.name} · registrado el ${d}/${m}/${a}` };
        }
        return { texto: file.name };
    };

    if (cargando) {
        return <Marco><p className="text-[12px] text-white/40 normal-case">Abriendo el encargo…</p></Marco>;
    }
    if (error && !info) {
        return (
            <Marco>
                <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-4 text-[12px] text-red-300 normal-case leading-snug">
                    {error}
                </div>
            </Marco>
        );
    }

    const plazo = info?.plazo;
    const fechaCorta = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : ''; };

    return (
        <Marco titulo={`Presentar el ${info?.faseLabel || 'CEE'}`}
               subtitulo={[info?.numero, info?.cliente].filter(Boolean).join(' · ')}>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[12px] text-red-300 normal-case leading-snug">{error}</div>
            )}

            {/* Su lista con TODO lo pendiente, para no tener que buscar cada correo. */}
            {info?.bandeja && (
                <a href={info.bandeja}
                   className="block text-center text-[11px] font-bold text-brand/90 hover:text-brand normal-case">
                    📋 Ver todo lo que tengo pendiente de presentar
                </a>
            )}

            {info?.registrado ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] px-5 py-4">
                    <div className="text-[12px] font-black text-emerald-300 uppercase tracking-widest">✓ Registrado</div>
                    <p className="text-[12px] text-white/60 normal-case mt-1 leading-snug">
                        El justificante de registro ya está en el expediente
                        {info.fechaRegistro ? ` (registrado el ${fechaCorta(info.fechaRegistro)})` : ''}. ¡Gracias!
                        Si te ha llegado también el recibo de la tasa, puedes subirlo desde el borrador.
                    </p>
                </div>
            ) : plazo && (
                <p className={`text-[11px] normal-case text-center ${plazo.quedan < 0 ? 'text-red-300' : plazo.quedan <= 7 ? 'text-amber-300' : 'text-white/45'}`}>
                    Plazo para registrarlo: {plazo.quedan < 0 ? `vencido el ${fechaCorta(plazo.limite)}` : `hasta el ${fechaCorta(plazo.limite)} (quedan ${plazo.quedan} días)`}
                </p>
            )}

            <Paso n={1} titulo="Descarga los tres ficheros">
                <p className="text-[12px] text-white/55 normal-case leading-snug mb-3">
                    Son los que se adjuntan en la sede. Ya llevan el NIF del titular delante, que es como hay que subirlos.
                    También te han llegado por correo.
                </p>
                <div className="space-y-1.5">
                    {(info?.ficheros || []).map(f => (
                        <div key={f.clave} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03]">
                            <div className="min-w-0 flex-1">
                                <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">{f.titulo}</div>
                                {f.presente
                                    ? <code className="block text-[11px] text-white/75 break-all normal-case mt-0.5">{f.nombreRegistro}</code>
                                    : <span className="text-[11px] text-amber-300/90 normal-case">No está disponible ahora mismo: avísanos.</span>}
                            </div>
                            {f.presente && (
                                <button type="button" onClick={() => descargar(f)} disabled={!!descargando}
                                        className="shrink-0 px-3 py-2 rounded-md text-[9px] font-black uppercase tracking-widest bg-white/5 text-white/55 hover:bg-brand/20 hover:text-brand disabled:opacity-40">
                                    {descargando === f.clave ? '…' : '⬇ Descargar'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </Paso>

            <Paso n={2} titulo="Preséntalo y sube el justificante" hecho={!!info?.registrado}>
                <p className="text-[12px] text-white/55 normal-case leading-snug mb-3">
                    Abre el borrador: tiene lo que va en cada casilla del formulario, listo para copiar, y el
                    botón a la sede. Al final del borrador subes el justificante de registro cuando te lo den
                    (y el recibo de la tasa, si lo tienes).
                </p>
                <button type="button" onClick={() => setBorradorAbierto(true)}
                        className="w-full px-4 py-3.5 rounded-xl border border-brand/50 bg-brand/15 text-[11px] font-black uppercase tracking-widest text-brand hover:bg-brand hover:text-black transition-colors">
                    📄 Abrir el borrador para presentar
                </button>
            </Paso>

            <BorradorCeeModal
                isOpen={borradorAbierto}
                onClose={() => setBorradorAbierto(false)}
                expedienteId={id}
                apiBase={base}
                paramsExtra={{ token }}
                fases={[fase]}
                faseInicial={fase}
                onSubirDevuelto={subirDevuelto}
            />
        </Marco>
    );
}

function Marco({ titulo, subtitulo, children }) {
    return (
        <div className="min-h-screen bg-bkg-deep flex items-start justify-center p-4 md:p-8">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-6">
                    <img src="/logo.png" alt="BROKERGY" className="h-9 mx-auto mb-4 opacity-90"
                         onError={e => { e.currentTarget.style.display = 'none'; }} />
                    {titulo && <h1 className="text-lg font-black text-white uppercase tracking-widest">{titulo}</h1>}
                    {subtitulo && <p className="text-[11px] text-white/40 normal-case mt-1">{subtitulo}</p>}
                </div>
                <div className="space-y-4">{children}</div>
            </div>
        </div>
    );
}

function Paso({ n, titulo, hecho = false, children }) {
    return (
        <div className={`rounded-2xl border bg-white/[0.02] overflow-hidden ${hecho ? 'border-emerald-500/25' : 'border-white/[0.08]'}`}>
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
                <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${
                    hecho ? 'bg-emerald-500/20 text-emerald-400' : 'bg-brand/15 text-brand'
                }`}>{hecho ? '✓' : n}</span>
                <span className="text-[12px] font-black text-white uppercase tracking-widest">{titulo}</span>
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

export default PresentarEncargoView;
