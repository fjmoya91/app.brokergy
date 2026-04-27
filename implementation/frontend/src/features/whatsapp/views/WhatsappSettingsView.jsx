import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';

/**
 * Vista de administración del canal WhatsApp.
 * - Muestra estado actual (DISCONNECTED / INITIALIZING / QR / READY ...).
 * - Permite conectar (escaneando QR) y desconectar.
 * - Auto-polling del estado cada 3s y del QR cada 2s cuando aplica.
 *
 * Solo visible para ADMIN.
 */
export function WhatsappSettingsView() {
    const { showAlert, showConfirm } = useModal();
    const [status, setStatus] = useState(null);
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const pollRef = useRef(null);
    const [groups, setGroups] = useState(null);
    const [loadingGroups, setLoadingGroups] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await axios.get('/api/whatsapp/status');
            setStatus(res.data);
            setError(null);
            return res.data;
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            return null;
        }
    }, []);

    const fetchQr = useCallback(async () => {
        try {
            const res = await axios.get('/api/whatsapp/qr');
            if (res.data?.dataUrl) setQrDataUrl(res.data.dataUrl);
        } catch (_) {
            // 404 = aún no hay QR, ignorar
        }
    }, []);

    const connect = async () => {
        setLoading(true);
        setError(null);
        try {
            await axios.post('/api/whatsapp/connect');
            await fetchStatus();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const disconnect = async () => {
        const confirmed = await showConfirm(
            '¿Estás seguro de que deseas desconectar el canal de WhatsApp? Para volver a usarlo, tendrás que escanear el código QR de nuevo.',
            'Desconectar WhatsApp',
            'warning'
        );
        if (!confirmed) return;
        setLoading(true);
        try {
            await axios.post('/api/whatsapp/disconnect');
            setQrDataUrl(null);
            await fetchStatus();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    // Polling
    useEffect(() => {
        fetchStatus();
        pollRef.current = setInterval(async () => {
            const s = await fetchStatus();
            if (s?.state === 'QR') fetchQr();
            else if (s?.state === 'READY') setQrDataUrl(null);
        }, 2500);
        return () => clearInterval(pollRef.current);
    }, [fetchStatus, fetchQr]);

    const state = status?.state || '—';
    const stateStyle = {
        READY: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        AUTHENTICATED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
        QR: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        INITIALIZING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        AUTH_FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
        DISCONNECTED: 'bg-white/5 text-white/40 border-white/10',
    }[state] || 'bg-white/5 text-white/40 border-white/10';

    return (
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-10 animate-fade-in">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white">Canal WhatsApp</h1>
                <p className="text-white/50 text-sm mt-1">
                    Conecta tu teléfono de empresa para enviar notificaciones a clientes desde la app.
                </p>
            </header>

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                    {error}
                </div>
            )}

            {status && !status.enabled && (
                <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
                    <strong>WhatsApp deshabilitado.</strong> Añade <code className="px-1.5 py-0.5 bg-black/30 rounded">WHATSAPP_ENABLED=true</code> en el <code>.env</code> del backend y reinicia.
                </div>
            )}

            <div className="bg-bkg-surface border border-white/10 rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Estado</div>
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-xs uppercase tracking-wider ${stateStyle}`}>
                            <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                            {state}
                        </span>
                    </div>
                    {status?.me && (
                        <div className="text-right">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Conectado como</div>
                            <div className="text-white font-mono text-sm">+{status.me.number}</div>
                            {status.me.pushname && <div className="text-white/40 text-xs">{status.me.pushname}</div>}
                        </div>
                    )}
                </div>

                {state === 'QR' && qrDataUrl && (
                    <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-6 text-center">
                        <p className="text-amber-300 text-sm mb-4 font-medium">
                            Abre <strong>WhatsApp Business</strong> en tu móvil → <em>Ajustes → Dispositivos vinculados → Vincular un dispositivo</em> y escanea:
                        </p>
                        <img src={qrDataUrl} alt="QR WhatsApp" className="mx-auto rounded-lg bg-white p-3" />
                        <p className="text-white/40 text-xs mt-4">El QR caduca cada ~40s y se regenera solo.</p>
                    </div>
                )}

                {state === 'INITIALIZING' && (
                    <div className="text-center py-8 text-white/50 text-sm">Inicializando cliente, esto puede tardar unos segundos...</div>
                )}

                {state === 'READY' && (
                    <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-6 text-center">
                        <div className="text-3xl mb-2">✓</div>
                        <p className="text-emerald-300 text-sm font-medium">WhatsApp conectado y listo para enviar.</p>
                    </div>
                )}

                <div className="flex gap-3 mt-6 justify-end">
                    {(state === 'DISCONNECTED' || state === 'AUTH_FAILED') && status?.enabled && (
                        <button
                            onClick={connect}
                            disabled={loading}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-bold text-xs uppercase tracking-wider disabled:opacity-50"
                        >
                            {loading ? 'Conectando...' : 'Conectar'}
                        </button>
                    )}
                    {(state === 'READY' || state === 'QR' || state === 'AUTHENTICATED' || state === 'INITIALIZING') && (
                        <button
                            onClick={disconnect}
                            disabled={loading}
                            className="px-5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-bold text-xs uppercase tracking-wider disabled:opacity-50"
                        >
                            Desconectar
                        </button>
                    )}
                </div>
            </div>

            {status?.state === 'READY' && (
                <div className="bg-bkg-surface border border-white/5 rounded-2xl p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">Grupos de WhatsApp</h2>
                        <button
                            onClick={async () => {
                                setLoadingGroups(true);
                                try {
                                    const res = await axios.get('/api/whatsapp/groups');
                                    setGroups(res.data);
                                } catch (e) {
                                    setGroups([]);
                                } finally {
                                    setLoadingGroups(false);
                                }
                            }}
                            disabled={loadingGroups}
                            className="px-4 py-2 rounded-lg bg-brand/10 hover:bg-brand/20 border border-brand/20 text-brand text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40"
                        >
                            {loadingGroups ? 'Cargando...' : 'Ver Grupos'}
                        </button>
                    </div>
                    {groups !== null && (
                        groups.length === 0 ? (
                            <p className="text-white/30 text-sm text-center py-4">No hay grupos disponibles.</p>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-white/40 text-xs mb-3">
                                    Copia el <strong className="text-white/60">ID</strong> del grupo al que quieres redirigir las notificaciones admin y añádelo como <code className="px-1.5 py-0.5 bg-black/30 rounded text-brand">WHATSAPP_ADMIN_CHAT</code> en el <code className="px-1.5 py-0.5 bg-black/30 rounded">.env</code> del servidor.
                                </p>
                                {groups.map(g => (
                                    <div key={g.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                        <div className="min-w-0">
                                            <div className="text-white text-sm font-medium truncate">{g.name}</div>
                                            <div className="text-white/30 text-xs font-mono">{g.id} · {g.participants} participantes</div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(g.id);
                                                showAlert(`ID copiado: ${g.id}`, 'Copiado', 'success');
                                            }}
                                            className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-brand/10 border border-white/10 hover:border-brand/30 text-white/50 hover:text-brand text-[10px] font-black uppercase tracking-wider transition-all"
                                        >
                                            Copiar ID
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            )}

            {status && (
                <div className="bg-bkg-surface border border-white/5 rounded-2xl p-6">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-white/60 mb-4">Configuración de envío</h2>
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt className="text-white/40 text-xs uppercase tracking-wider mb-1">Rate limit</dt>
                            <dd className="text-white font-mono">{status.config.ratePerMin} mensajes / min</dd>
                        </div>
                        <div>
                            <dt className="text-white/40 text-xs uppercase tracking-wider mb-1">Delay humano</dt>
                            <dd className="text-white font-mono">{status.config.minDelayMs}–{status.config.maxDelayMs} ms</dd>
                        </div>
                        <div>
                            <dt className="text-white/40 text-xs uppercase tracking-wider mb-1">Typing indicator</dt>
                            <dd className="text-white font-mono">{status.config.typingMs} ms</dd>
                        </div>
                        <div>
                            <dt className="text-white/40 text-xs uppercase tracking-wider mb-1">Cola / ventana</dt>
                            <dd className="text-white font-mono">{status.queueSize} en cola · {status.rateWindow} últimos 60s</dd>
                        </div>
                    </dl>
                    <p className="mt-6 text-xs text-white/40 leading-relaxed">
                        Aviso: usar whatsapp-web.js viola los Términos de Servicio de WhatsApp.
                        Recomendado un número dedicado (no el personal). Si el volumen crece, migrar a la Cloud API oficial.
                    </p>
                </div>
            )}
        </div>
    );
}

export default WhatsappSettingsView;
