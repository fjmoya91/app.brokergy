/**
 * MiExpedienteView — home del portal del cliente.
 * URL: /mi-expediente/:uuid?token=
 *
 * Layout compacto (poco scroll): Dinero + Estado arriba, y una rejilla 2×2
 * (Mis documentos · Subir fotos · Dudas · Contactar) que abre cada sección en
 * una ventana. Solo lectura + subida (reusa DocsManager mode="token").
 * Nunca recibe margen/precio SO: el backend ya sirve un DTO curado.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import { DocsManager } from '../../docs/DocsManager';

const API = import.meta.env.PROD ? '/api/public/portal' : 'http://localhost:3000/api/public/portal';
const WHATSAPP_CONTACTO = '34600000000'; // TODO: teléfono real de atención al cliente

const HITOS = ['Certificado inicial', 'Obra y firmas', 'Certificado final', 'Preparación', 'Tramitación CAE', 'Cobro'];

const eur = (n) => {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    const s = Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${s} €`;
};

const FAQS = [
    {
        q: '¿Tengo que pagar impuestos por el bono del CAE?',
        a: 'Sí, es un ingreso que debes declarar. Según Hacienda (consultas vinculantes V0361-23 y V2137-25) es una ganancia patrimonial que va a la base del ahorro de tu IRPF y tributa por tramos (19 % hasta 6.000 €, 21 % de 6.000 a 50.000 €…). Como el bono suele ser de unos pocos miles de euros, lo habitual es tributar al 19 %. Importante: el bono no es una subvención, así que no reduce tu deducción por la reforma. Esta información es orientativa; confirma tu caso con tu asesor fiscal.',
    },
    {
        q: '¿Cuáles son las fases de mi expediente?',
        a: 'Cuando la documentación está completa (fotos, facturas y anexos firmados), tu actuación se agrupa con otras (normalmente en lotes de 5) y se envía a una entidad verificadora acreditada por ENAC. Si todo está bien, pasa al gestor autonómico y luego al coordinador nacional, que emite los CAE. A partir de ahí se tramita el pago.',
    },
    {
        q: '¿Puedo firmar un acuerdo con otra entidad?',
        a: 'No. Una vez firmado el acuerdo de cesión de ahorros existe el compromiso de no ceder esos ahorros a otra entidad.',
    },
    {
        q: '¿Cuándo y cómo cobro?',
        a: 'Cuando el CAE es favorable, el Sujeto Obligado abona el importe a Brokergy y Brokergy te lo transfiere a ti. Verás el estado avanzar a "Cobro" cuando el CAE esté emitido.',
    },
];

const WhatsAppIcon = ({ size = 26 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

function GridButton({ icon, label, onClick, href, badge, highlight }) {
    const cls = `relative bg-bkg-surface border rounded-2xl py-6 px-3 flex flex-col items-center gap-2 hover:border-brand transition ${highlight ? 'border-brand/60' : 'border-white/10'}`;
    const inner = (
        <>
            <span className="text-2xl" aria-hidden="true">{icon}</span>
            <span className="text-white/80 text-xs font-semibold text-center leading-tight">{label}</span>
            {badge ? (
                <span className="absolute top-2 right-2 bg-brand text-bkg-deep text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">{badge}</span>
            ) : null}
        </>
    );
    return href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
        : <button onClick={onClick} className={cls}>{inner}</button>;
}

export function MiExpedienteView({ uuid, token }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [panel, setPanel] = useState(null);   // 'docs' | 'upload' | 'faq'
    const [openFaq, setOpenFaq] = useState(null);

    useEffect(() => {
        axios.get(`${API}/expediente/${uuid}?token=${token}`)
            .then(r => setInfo(r.data))
            .catch(e => setError(e.response?.data?.error || 'No se encontró tu expediente. Vuelve a acceder desde el portal.'))
            .finally(() => setLoading(false));
    }, [uuid, token]);

    const money = info?.dinero || {};
    const estado = info?.estado || {};
    const req = info?.requerimiento || {};
    const documentos = info?.documentos || [];
    const queFalta = info?.queFalta || [];
    const hitoIndex = estado.hitoIndex || 1;

    const pendMsg = estado.subestado === 'finalizado'
        ? 'Tu expediente está finalizado.'
        : estado.responsable === 'CERTIFICADOR'
            ? 'El certificador está trabajando en tu certificado. No necesitas hacer nada ahora.'
            : 'No necesitas hacer nada por ahora. Te avisaremos cuando te toque a ti.';

    const panelTitle = panel === 'docs' ? 'Mis documentos' : panel === 'upload' ? 'Subir fotos y facturas' : panel === 'faq' ? 'Dudas frecuentes' : '';

    return (
        <div className="min-h-screen bg-slate-950 text-white relative overflow-x-hidden px-4 py-6 md:py-10">
            <DynamicNetworkBackground />
            <div className="relative z-10 max-w-lg mx-auto">
                <header className="flex items-center justify-between mb-6">
                    <div className="text-2xl font-black tracking-tight">
                        <span className="text-white">BROKER</span><span className="text-amber-400">GY</span>
                    </div>
                    {info?.identidad?.numeroExpediente && (
                        <span className="text-white/40 text-xs font-mono">{info.identidad.numeroExpediente}</span>
                    )}
                </header>

                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    </div>
                )}

                {error && !loading && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-6 text-red-300 text-sm text-center">{error}</div>
                )}

                {info && !loading && (
                    <>
                        {/* DINERO CAE */}
                        <div className="bg-bkg-surface border border-white/10 rounded-2xl p-6 mb-4 text-center">
                            <div className="text-white/50 text-xs font-bold uppercase tracking-wide">Bono CAE que cobrarás</div>
                            {money.bonoCae != null ? (
                                <>
                                    <div className="text-4xl font-black text-white my-1.5">{eur(money.bonoCae)}</div>
                                    <span className="inline-block text-[11px] text-amber-300 bg-amber-500/10 px-3 py-0.5 rounded-full">Estimado</span>
                                </>
                            ) : (
                                <div className="text-white/55 text-sm my-3">Estamos calculando tu bono. Te lo confirmaremos pronto.</div>
                            )}

                            {money.deduccionIrpf ? (
                                <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2 text-left">
                                    <span className="text-emerald-400 mt-0.5">＋</span>
                                    <div className="text-emerald-300 text-xs leading-relaxed">
                                        <strong className="font-semibold">Y además, deducción en tu IRPF.</strong> Podrás deducirte hasta {eur(money.deduccionIrpf)} por la reforma (60 % de la obra) en tu declaración.
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {/* ESTADO (incluye qué falta) */}
                        <div className="bg-bkg-surface border border-white/10 rounded-2xl p-5 mb-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-white font-bold text-sm flex items-center gap-2"><span className="text-brand">●</span>Estado de tu expediente</h3>
                                <span className="text-white/40 text-xs">Paso {hitoIndex} de 6</span>
                            </div>
                            <div className="flex gap-1 mb-4">
                                {HITOS.map((_, i) => (
                                    <div key={i} className={`flex-1 h-1.5 rounded-full ${i + 1 < hitoIndex ? 'bg-emerald-500' : i + 1 === hitoIndex ? 'bg-brand' : 'bg-white/10'}`} />
                                ))}
                            </div>
                            <div className="text-white font-semibold text-sm">{estado.hitoLabel}</div>
                            <div className="text-white/55 text-xs leading-relaxed mt-1">{estado.microcopy}</div>

                            {req.activo && (
                                <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                                    <span className="text-amber-400 mt-0.5">⚠</span>
                                    <div className="text-amber-200 text-xs leading-relaxed">{req.mensaje}</div>
                                </div>
                            )}

                            {queFalta.length === 0 ? (
                                <div className="mt-3 bg-emerald-500/10 rounded-xl px-3 py-2.5 flex items-center gap-2 text-emerald-300 text-xs">
                                    <span>✓</span>{pendMsg}
                                </div>
                            ) : (
                                <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-amber-200 text-xs">
                                    <div className="font-semibold mb-1">Te falta por aportar:</div>
                                    <ul className="list-disc list-inside space-y-0.5">
                                        {queFalta.map((f, i) => <li key={i}>{f}</li>)}
                                    </ul>
                                    <button onClick={() => setPanel('upload')} className="mt-2 text-brand underline font-semibold">Subir ahora</button>
                                </div>
                            )}
                        </div>

                        {/* REJILLA 2×2 */}
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <GridButton icon="📁" label="Mis documentos" onClick={() => setPanel('docs')} badge={documentos.length || null} />
                            <GridButton icon="📷" label="Subir fotos" onClick={() => setPanel('upload')} badge={queFalta.length || null} highlight={queFalta.length > 0} />
                            <GridButton icon="❓" label="Dudas frecuentes" onClick={() => setPanel('faq')} />
                            <GridButton icon={<WhatsAppIcon />} label="Contactar" href={`https://wa.me/${WHATSAPP_CONTACTO}`} />
                        </div>

                        <footer className="pt-4 border-t border-white/5 text-center">
                            <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">Brokergy · Ingeniería Energética</p>
                        </footer>
                    </>
                )}
            </div>

            {/* VENTANA (bottom-sheet en móvil, modal en escritorio) */}
            {panel && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setPanel(null)}>
                    <div className="bg-bkg-surface w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-bkg-surface z-10">
                            <h3 className="text-white font-bold text-base">{panelTitle}</h3>
                            <button onClick={() => setPanel(null)} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-bkg-elevated text-white/60 flex items-center justify-center hover:text-white transition">✕</button>
                        </div>
                        <div className="p-5">
                            {panel === 'docs' && (
                                documentos.length === 0 ? (
                                    <p className="text-white/40 text-sm">Aún no hay documentos disponibles para descargar. Aparecerán aquí a medida que tu expediente avance.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {documentos.map(d => (
                                            <li key={d.key}>
                                                <a href={`${API}/doc/${uuid}/${d.key}?token=${token}`} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center justify-between bg-bkg-elevated border border-white/10 rounded-xl px-4 py-3 text-white/80 text-sm hover:border-brand transition">
                                                    <span className="flex items-center gap-2">📄 {d.label}</span>
                                                    <span className="text-brand">↓</span>
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                )
                            )}

                            {panel === 'upload' && (
                                <DocsManager mode="token" idOrUuid={uuid} token={token} />
                            )}

                            {panel === 'faq' && (
                                <div className="space-y-2">
                                    {FAQS.map((f, i) => (
                                        <div key={i} className="border border-white/10 rounded-xl overflow-hidden">
                                            <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                                className="w-full text-left px-4 py-3 text-white/85 text-sm font-medium flex items-center justify-between gap-2">
                                                {f.q}
                                                <span className="text-white/40">{openFaq === i ? '−' : '+'}</span>
                                            </button>
                                            {openFaq === i && <div className="px-4 pb-4 text-white/55 text-xs leading-relaxed">{f.a}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MiExpedienteView;
