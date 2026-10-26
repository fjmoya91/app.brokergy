// ─── Vídeo promo de cee.brokergy.es — vertical 9:16, 30 s, sin sonido ───────
// Gancho («¿te imaginas…?» → «lo hemos hecho posible») → 1 los datos de la obra →
// 2 preguntas y fotos → 3 se lo envías a la IA → 4 revisas el croquis y firmas
// desde la web → llamada: «Crear mi cuenta gratis». Va en la portada de la
// landing, al lado de su titular: no repite lo que ese titular ya dice.
// Los textos dicen solo lo que la app hace (como la landing: sin cifras,
// testimonios ni logos inventados). Ver LEEME.md.
import { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { IcoChispa, IcoFlecha } from '../../frontend/src/certificadores/ui/Iconos';
import { avance } from './anim';
import { CSS, cargarFuentes } from './estilo';
import { Movil, MOVIL_W } from './Movil';
import {
    Aviso, PantallaFotos, PantallaListo, PantallaNueva, PantallaPanel, PantallaPregunta, PantallaPreparando, PantallaVivienda,
} from './pantallas';

export const FPS = 30;
export const DURACION = 900;

const T = { posible: 78, p1: 120, p2: 330, p3: 570, p4: 668, cta: 790 };
const PASOS = 4;

/* Lo que se lee encima del móvil. `t` = [antes, palabra en lima, después]. */
const TITULARES = [
    { desde: 0, hasta: T.posible, eyebrow: 'Para certificadores energéticos', t: ['¿Te imaginas tener el .cex ', 'hecho', ' sin pasar horas de gabinete?'] },
    { desde: T.posible, hasta: T.p1, eyebrow: 'Certifica con IA', t: ['Lo hemos hecho ', 'posible', '.'] },
    { desde: T.p1, hasta: T.p2, eyebrow: 'Paso 1', t: ['Metes los datos de la ', 'obra', '.'], sub: 'Con la referencia catastral sale el plano de la vivienda.' },
    { desde: T.p2, hasta: T.p3, eyebrow: 'Paso 2', t: ['Contestas unas ', 'preguntas', ' y subes las fotos.'], sub: 'Lo que la IA no ve: calefacción, ventanas…' },
    { desde: T.p3, hasta: T.p4, eyebrow: 'Paso 3', t: ['Se lo envías a la ', 'IA', '.'], sub: 'Te avisamos por WhatsApp y email cuando está listo.' },
    { desde: T.p4, hasta: T.cta, eyebrow: 'Paso 4', t: ['Revisas el croquis y lo ', 'firmas', ' desde la web.'], sub: 'Con el .cex de CE3X 3.2, el XML y el PDF.' },
];

/* Lo que se ve dentro del móvil, en orden. `desde` en fotogramas del vídeo. */
const PANTALLAS = [
    { desde: 0, el: f => <PantallaPanel f={f} toqueEn={128} /> },
    { desde: 138, el: f => <PantallaNueva f={f} escribeDesde={12} toqueEn={84} /> },
    { desde: 245, el: f => <PantallaVivienda f={f} /> },
    { desde: 335, el: f => <PantallaPregunta f={f} eligeEn={40} /> },
    { desde: 420, el: f => <PantallaFotos f={f} fotosEn={[22, 52, 74, 104]} /> },
    { desde: 575, el: f => <PantallaPreparando f={f} /> },
    { desde: 672, el: f => <PantallaListo f={f} pulsoEn={50} firmaEn={88} /> },
];
const AVISO = { desde: 640, toqueEn: 24 };
const CAMBIO = 14;

function Titular({ f, desde, hasta, eyebrow, t, sub }) {
    if (f < desde - 1 || f > hasta + 1) return null;
    const entra = avance(f, desde + (desde ? 4 : 6), 14);
    const sale = avance(f, hasta - 8, 8);
    return (
        <div style={{ position: 'absolute', left: 74, right: 74, top: 176, opacity: entra * (1 - sale), transform: `translateY(${(1 - entra) * 34 - sale * 18}px)` }}>
            <p className="ca-eyebrow" style={{ fontSize: 26, margin: 0 }}>{eyebrow}</p>
            <h1 className="ca-display" style={{ fontSize: 96, lineHeight: 1.04, margin: '18px 0 0', isolation: 'isolate' }}>
                {t[0]}<span className="ca-mark" style={{ position: 'relative', zIndex: -1, borderRadius: 12, padding: '0 .1em' }}>{t[1]}</span>{t[2]}
            </h1>
            {sub && <p style={{ font: "500 33px/1.42 'Inter',sans-serif", color: 'var(--gris)', margin: '20px 0 0', maxWidth: 900 }}>{sub}</p>}
        </div>
    );
}

function Pasos({ f }) {
    const vis = avance(f, T.posible + 6, 12) * (1 - avance(f, T.cta - 8, 8));
    if (vis <= 0) return null;
    const actual = f >= T.p4 ? 4 : f >= T.p3 ? 3 : f >= T.p2 ? 2 : f >= T.p1 ? 1 : 0;
    return (
        <div style={{ position: 'absolute', right: 74, top: 62, display: 'flex', gap: 10, opacity: vis }}>
            {Array.from({ length: PASOS }, (_, i) => i + 1).map(n => {
                const hecho = n < actual;
                const act = n === actual;
                return (
                    <span key={n} style={{ width: 54, height: 54, borderRadius: 999, display: 'grid', placeItems: 'center', font: "700 28px/1 'Antonio','Inter',sans-serif",
                        background: act ? 'var(--tinta)' : hecho ? 'rgba(177,209,62,.3)' : '#fff', color: act ? '#fff' : hecho ? 'var(--verde-txt)' : 'var(--gris)',
                        border: act ? 'none' : '1.5px solid rgba(20,17,17,.12)' }}>{n}</span>
                );
            })}
        </div>
    );
}

function PantallasDelMovil({ f }) {
    return (
        <>
            {PANTALLAS.map((p, i) => {
                const sig = PANTALLAS[i + 1];
                if (f < p.desde || (sig && f >= sig.desde + CAMBIO)) return null;
                const entra = i === 0 ? 1 : avance(f, p.desde, CAMBIO);
                const sale = sig ? avance(f, sig.desde, CAMBIO) : 0;
                const x = (1 - entra) * 100 - sale * 28;
                return (
                    <div key={p.desde} style={{ position: 'absolute', inset: 0, transform: `translateX(${x}%)`, zIndex: i, boxShadow: entra < 1 ? '-20px 0 40px rgba(20,17,17,.12)' : 'none' }}>
                        {p.el(f - p.desde)}
                        {sale > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(20,17,17,${0.18 * sale})` }} />}
                    </div>
                );
            })}
            {f >= AVISO.desde && f < AVISO.desde + 60 && <Aviso f={f - AVISO.desde} toqueEn={AVISO.toqueEn} />}
        </>
    );
}

function Llamada({ f }) {
    if (f < T.cta) return null;
    const e = (d) => avance(f, T.cta + d, 16);
    const estilo = (d) => ({ opacity: e(d), transform: `translateY(${(1 - e(d)) * 36}px)` });
    return (
        <div style={{ position: 'absolute', left: 74, right: 74, top: 250 }}>
            <p className="ca-eyebrow" style={{ fontSize: 26, margin: 0, ...estilo(6) }}>Beta para certificadores energéticos</p>
            <h1 className="ca-display" style={{ fontSize: 132, lineHeight: 1.02, margin: '20px 0 0', isolation: 'isolate', ...estilo(10) }}>
                Tu primer certificado, <span className="ca-mark" style={{ position: 'relative', zIndex: -1, borderRadius: 14, padding: '0 .1em' }}>gratis</span>.
            </h1>
            <p style={{ font: "500 34px/1.42 'Inter',sans-serif", color: 'var(--gris)', margin: '24px 0 0', ...estilo(16) }}>
                Entras al momento, con Google o con tu email.
            </p>
            <div style={{ marginTop: 44, ...estilo(22) }}>
                <span className="ca-btn ca-btn-pri" style={{ minHeight: 124, borderRadius: 34, fontSize: 44, gap: 20, boxShadow: '0 2px 0 rgba(255,255,255,.35) inset, 0 30px 60px -24px rgba(255,160,0,.8)' }}>
                    Crear mi cuenta gratis <IcoFlecha size={44} sw={2.4} />
                </span>
            </div>
            <p className="ca-display" style={{ fontSize: 64, margin: '34px 0 0', textAlign: 'center', ...estilo(28) }}>cee.brokergy.es</p>
        </div>
    );
}

export function Promo() {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    const [espera] = useState(() => delayRender('Cargando las tipografías de la app'));
    useEffect(() => { cargarFuentes().then(() => continueRender(espera)); }, [espera]);

    const subida = spring({ frame: f - 4, fps, config: { damping: 18, mass: 0.9 } });
    const bajada = spring({ frame: f - T.cta, fps, config: { damping: 20 } });
    const movilY = 640 + (1 - subida) * 900 + bajada * 830;
    const deriva = Math.sin((f / DURACION) * Math.PI * 2) * 30;

    return (
        <AbsoluteFill className="ca" style={{ minHeight: 0, background: 'var(--crema)' }}>
            <style>{CSS}</style>
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(55% 32% at ${30 + deriva / 3}% 6%, rgba(255,160,0,.16), transparent 70%), radial-gradient(50% 30% at ${78 - deriva / 3}% 42%, rgba(199,246,1,.18), transparent 70%)` }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10, background: 'var(--filete)' }} />
            <div style={{ position: 'absolute', left: 74, top: 70, display: 'flex', alignItems: 'center', gap: 18 }}>
                <Img src={staticFile('logo_brokergy_dark.png')} style={{ height: 42 }} />
                <span className="ca-marca-txt" style={{ height: 48, gap: 10, padding: '0 20px 0 16px', fontSize: 19 }}><IcoChispa size={24} sw={2.4} />Certifica con IA</span>
            </div>
            <Pasos f={f} />

            {TITULARES.map(t => <Titular key={t.desde} f={f} {...t} />)}
            <Llamada f={f} />

            <div style={{ position: 'absolute', left: (1080 - MOVIL_W) / 2 + 30, top: movilY + 40, width: MOVIL_W, height: 1100, borderRadius: 90, background: 'linear-gradient(150deg,rgba(255,160,0,.22),rgba(238,228,117,.24) 50%,rgba(181,207,56,.26))', transform: `rotate(${4 + deriva / 30}deg)` }} />
            <Movil style={{ left: (1080 - MOVIL_W) / 2, top: movilY }}>
                <PantallasDelMovil f={f} />
            </Movil>
        </AbsoluteFill>
    );
}
