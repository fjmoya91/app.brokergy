// ─── Las pantallas del móvil, recreadas con las clases de la app (.ca-…) ────
// Copian lo que se ve en cee.brokergy.es con los datos de la DEMO de la app
// (src/certificadores/dev/demo.js): ninguna obra ni persona de verdad.
// Cada pantalla recibe `f`, el fotograma desde que entró.
import { Img, interpolate, staticFile } from 'remotion';
import {
    IcoAtras, IcoBuscar, IcoCamara, IcoCasa, IcoCheck, IcoChispa, IcoMas, IcoMenu, IcoSello,
    IcoWhatsApp, IcoImagen, IcoPlano,
} from '../../frontend/src/certificadores/ui/Iconos';
import { avance, aparece, Toque } from './anim';

export const OBRA = {
    numero: '2026EXT_1',
    titular: 'Carmen Díaz',
    direccion: 'CALLE SOCUÉLLAMOS 7',
    municipio: 'Tomelloso, Ciudad Real',
    ref: '5554443VJ1253S0001ZZ',
    superficie: '142 m²',
    anio: '1968',
};

/** El papel de la app, a la medida de la pantalla del móvil. */
export function Pantalla({ children, fondo }) {
    return (
        <div className="ca" style={{ position: 'absolute', inset: 0, minHeight: 0, overflow: 'hidden', background: fondo || 'var(--crema)' }}>
            <div className="ca-filete-top" />
            <div className="ca-halo" style={{ height: 360 }} />
            <div style={{ position: 'relative', zIndex: 1, paddingTop: 44 }}>{children}</div>
        </div>
    );
}

export function BarraApp({ creditos = 4 }) {
    return (
        <div className="ca-bar" style={{ position: 'relative', top: 'auto', paddingTop: 0 }}>
            <div className="ca-bar-in">
                <Img className="ca-logo" src={staticFile('logo_brokergy_dark.png')} style={{ height: 24 }} />
                <div className="ca-bar-esp" />
                <span className="ca-creditos"><b>{creditos}</b> créditos</span>
                <span className="ca-icobtn"><IcoMenu /></span>
            </div>
        </div>
    );
}

/* ── 0 · Mis obras ─────────────────────────────────────────────────────────── */
const OBRAS = [
    { n: '2026EXT_3', nombre: 'María López Ruiz', dir: 'CALLE DON VÍCTOR PEÑASCO 12, Tomelloso', chip: ['ca-chip-gris', 'Borrador'] },
    { n: '2026EXT_2', nombre: 'Antonio Ruiz', dir: 'AVENIDA ANTONIO HUERTAS 41 3º B, Tomelloso', chip: ['ca-chip-naranja', 'En preparación'] },
    { n: '2026EXT_1', nombre: 'Carmen Díaz', dir: 'CALLE SOCUÉLLAMOS 7, Tomelloso', chip: ['ca-chip-verde', 'Listo para revisar'] },
];

export function PantallaPanel({ f, toqueEn }) {
    return (
        <Pantalla>
            <BarraApp />
            <div style={{ padding: '16px 16px 0' }}>
                <div className="ca-card ca-pad" style={aparece(f, 6)}>
                    <div className="ca-filete" />
                    <p className="ca-hola">Hola, <b>Laura</b></p>
                    <div className="ca-cifra" style={{ marginTop: 6 }}><b>4</b><span>certificados disponibles</span></div>
                    <div className="ca-btns">
                        <span className="ca-btn ca-btn-pri" style={{ position: 'relative' }}>
                            <IcoMas /> Nueva obra
                            <Toque f={f} en={toqueEn} />
                        </span>
                    </div>
                </div>
                <h2 className="ca-display ca-h2" style={{ margin: '24px 2px 12px', ...aparece(f, 12) }}>Mis obras</h2>
                <div className="ca-obras">
                    {OBRAS.map((o, i) => (
                        <div key={o.n} className="ca-obra" style={aparece(f, 16 + i * 4)}>
                            <div className="ca-obra-top">
                                <span className="ca-mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gris)' }}>{o.n}</span>
                                <span className={`ca-chip ${o.chip[0]}`}>{o.chip[1]}</span>
                            </div>
                            <b>{o.nombre}</b>
                            <small>{o.dir}</small>
                        </div>
                    ))}
                </div>
            </div>
        </Pantalla>
    );
}

/* ── 1 · Nueva obra: la referencia catastral ───────────────────────────────── */
export function PantallaNueva({ f, escribeDesde, toqueEn }) {
    const letras = Math.max(0, Math.min(OBRA.ref.length, Math.floor((f - escribeDesde) / 2.6)));
    const texto = OBRA.ref.slice(0, letras);
    const completa = letras === OBRA.ref.length;
    const cursor = !completa && Math.floor(f / 8) % 2 === 0;
    const buscando = f >= toqueEn + 4;
    return (
        <Pantalla>
            <BarraApp />
            <div style={{ padding: '16px 16px 0' }}>
                <div className="ca-q-top">
                    <span className="ca-icobtn"><IcoAtras /></span>
                    <div style={{ flex: 1 }}>
                        <p className="ca-eyebrow" style={{ margin: '0 0 8px' }}>Nueva obra · paso 1 de 4</p>
                        <div className="ca-barra"><i style={{ width: '25%' }} /></div>
                    </div>
                </div>
                <div className="ca-card ca-pad">
                    <div className="ca-filete" />
                    <h2 className="ca-display ca-pregunta">¿Dónde está la <span className="ca-mark">vivienda</span>?</h2>
                    <p className="ca-preg-ayuda">Con la referencia catastral traemos del Catastro la dirección, la superficie y el año.</p>
                    <div className="ca-tabs" style={{ marginTop: 16 }}>
                        <span className="ca-tab ca-tab-act">Referencia catastral</span>
                        <span className="ca-tab">Dirección</span>
                    </div>
                    <label className="ca-campo">
                        <span className="ca-label">Referencia catastral</span>
                        <span className="ca-input ca-input-mayus" style={{ borderColor: completa ? 'var(--linea)' : 'var(--tinta)', boxShadow: completa ? 'none' : '0 0 0 4px rgba(255,160,0,.18)', minHeight: 52 }}>
                            {texto || <span style={{ color: 'rgba(20,17,17,.38)' }}>1234567AB1234C0001XY</span>}
                            {cursor && <span style={{ display: 'inline-block', width: 2, height: 20, background: 'var(--tinta)', verticalAlign: 'middle', marginLeft: 1 }} />}
                        </span>
                    </label>
                    <p className="ca-ayuda">20 caracteres. Está en el recibo del IBI o en la escritura.</p>
                    <div className="ca-btns">
                        <span className="ca-btn ca-btn-pri" style={{ position: 'relative', opacity: completa ? 1 : 0.55 }}>
                            {buscando
                                ? <><Girando f={f} /> Buscando en el Catastro…</>
                                : <><IcoBuscar /> Buscar en el Catastro</>}
                            <Toque f={f} en={toqueEn} />
                        </span>
                    </div>
                </div>
            </div>
        </Pantalla>
    );
}

function Girando({ f }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ transform: `rotate(${f * 24}deg)` }}>
            <path d="M21 12a9 9 0 1 1-6.2-8.56" />
        </svg>
    );
}

/** Croquis de la vivienda: se dibuja solo (`dibujo` 0 → 1). */
export function Croquis({ dibujo = 1, huecos = 1 }) {
    return (
        <svg viewBox="0 0 260 150" style={{ display: 'block', width: '100%', height: 'auto' }}>
            <defs>
                <pattern id="rej" width="13" height="13" patternUnits="userSpaceOnUse">
                    <path d="M13 0H0V13" fill="none" stroke="rgba(20,17,17,.06)" strokeWidth="1" />
                </pattern>
            </defs>
            <rect width="260" height="150" fill="url(#rej)" />
            <path d="M70 28H190V82H150V122H70Z" fill="#fff" fillOpacity={dibujo} stroke="#141111" strokeWidth="3.5" strokeLinejoin="round"
                pathLength="100" strokeDasharray="100" strokeDashoffset={100 - dibujo * 100} />
            <path d="M120 28V82H70M150 82H120" fill="none" stroke="rgba(20,17,17,.28)" strokeWidth="1.5" strokeDasharray="3 3" opacity={dibujo} />
            <g stroke="#ffa000" strokeWidth="6" opacity={huecos}>
                <path d="M86 28H106" /><path d="M140 28H170" /><path d="M190 44V66" />
                <path d="M88 122H112" /><path d="M150 96V112" /><path d="M70 52V72" />
            </g>
            <g fontFamily="ui-monospace,Menlo,Consolas,monospace" fontSize="10" fontWeight="700" fill="#55585f" textAnchor="middle" opacity={huecos}>
                <text x="130" y="16">N</text><text x="130" y="142">S</text><text x="210" y="59">E</text><text x="52" y="66">O</text>
            </g>
        </svg>
    );
}

/* ── 1b · La vivienda que trae el Catastro ─────────────────────────────────── */
export function PantallaVivienda({ f }) {
    return (
        <Pantalla>
            <BarraApp />
            <div style={{ padding: '16px 16px 0' }}>
                <div className="ca-q-top">
                    <span className="ca-icobtn"><IcoAtras /></span>
                    <div style={{ flex: 1 }}>
                        <p className="ca-eyebrow" style={{ margin: '0 0 8px' }}>Nueva obra · paso 2 de 4</p>
                        <div className="ca-barra"><i style={{ width: `${25 + 25 * avance(f, 4, 16)}%` }} /></div>
                    </div>
                </div>
                <div className="ca-card ca-pad">
                    <div className="ca-filete" />
                    <div style={aparece(f, 2)}>
                        <span className="ca-chip ca-chip-verde"><IcoCheck size={14} sw={3} /> Encontrada en el Catastro</span>
                        <h2 className="ca-display ca-h3" style={{ marginTop: 12 }}>{OBRA.direccion}</h2>
                        <p className="ca-peq" style={{ margin: '2px 0 0' }}>{OBRA.municipio}</p>
                    </div>
                    <div style={{ marginTop: 14, borderRadius: 16, background: 'var(--crema)', border: '1px solid var(--linea)', overflow: 'hidden', ...aparece(f, 8) }}>
                        <Croquis dibujo={avance(f, 12, 26)} huecos={avance(f, 34, 10)} />
                    </div>
                    <dl className="ca-dl" style={{ marginTop: 10 }}>
                        {[['Referencia catastral', OBRA.ref, true], ['Superficie', OBRA.superficie], ['Año de construcción', OBRA.anio], ['Uso', 'Residencial']].map(([dt, dd, mono], i) => (
                            <div key={dt} style={aparece(f, 20 + i * 5)}>
                                <dt>{dt}</dt><dd className={mono ? 'ca-mono' : undefined} style={mono ? { fontSize: 12.5 } : undefined}>{dd}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </Pantalla>
    );
}

/* ── Cabecera de la obra (fases) ───────────────────────────────────────────── */
function CabObra({ fase, de = 6, titulo }) {
    return (
        <div className="ca-card" style={{ padding: '16px 18px' }}>
            <div className="ca-filete" />
            <div className="ca-fila-top">
                <span className="ca-mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--naranja-txt)' }}>{OBRA.numero}</span>
                <span className="ca-guardado"><IcoCheck size={14} sw={2.6} /> Guardado</span>
            </div>
            <p className="ca-display" style={{ fontSize: 26, lineHeight: 1.05, margin: '8px 0 0' }}>{OBRA.titular}</p>
            <ul className="ca-fases-barra" style={{ marginTop: 10 }}>
                {Array.from({ length: de }).map((_, i) => (
                    <li key={i} className={i < fase - 1 ? 'ca-fb-hecha' : i === fase - 1 ? 'ca-fb-act' : ''}><span style={{ display: 'block', padding: '4px 0' }}><i /></span></li>
                ))}
            </ul>
            <p className="ca-peq" style={{ margin: '6px 0 0' }}>Fase {fase} de {de} · {titulo}</p>
        </div>
    );
}

/* ── 2 · Una pregunta del cuestionario ─────────────────────────────────────── */
const CALEFACCION = ['Caldera de gasóleo', 'Caldera de gas', 'Bomba de calor', 'Radiadores eléctricos', 'No tiene calefacción'];

export function PantallaPregunta({ f, eligeEn }) {
    const elegida = f >= eligeEn + 2;
    return (
        <Pantalla>
            <BarraApp />
            <div style={{ padding: '16px 16px 0' }}>
                <CabObra fase={4} titulo="Instalaciones" />
                <div className="ca-card ca-pad" style={{ marginTop: 12 }}>
                    <div className="ca-filete" />
                    <p className="ca-eyebrow" style={{ margin: '0 0 8px' }}>Fase 4 de 6</p>
                    <h2 className="ca-display ca-pregunta">¿Cómo se calienta la vivienda?</h2>
                    <p className="ca-preg-ayuda">Lo que la IA no puede ver en el plano.</p>
                    <div className="ca-opts">
                        {CALEFACCION.map((o, i) => {
                            const sel = i === 0 && elegida;
                            return (
                                <span key={o} className={`ca-opt${sel ? ' ca-opt-sel' : ''}`} style={{ position: 'relative', ...aparece(f, 4 + i * 3, 12, 10) }}>
                                    <span className="ca-opt-marca">{sel && <IcoCheck size={14} sw={3.2} />}</span>
                                    <span><b>{o}</b></span>
                                    {i === 0 && <Toque f={f} en={eligeEn} />}
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>
        </Pantalla>
    );
}

/* ── 2b · Las fotos de la visita ───────────────────────────────────────────── */
const SLOTS = [
    { id: 'fachada', label: 'Fachada principal', ayuda: 'Entera, desde la calle', ico: <IcoCasa />, fotos: [['fachada.jpg', 0]] },
    { id: 'caldera', label: 'La caldera y su placa', ayuda: 'La placa, que se lea', ico: <IcoChispa />, fotos: [['caldera.jpg', 1], ['placa_caldera.jpg', 2]] },
    { id: 'ventanas', label: 'Las ventanas', ayuda: 'Una de cada tipo', ico: <IcoImagen />, fotos: [['ventana.jpg', 3]] },
];

export function PantallaFotos({ f, fotosEn }) {
    return (
        <Pantalla>
            <BarraApp />
            <div style={{ padding: '16px 16px 0' }}>
                <CabObra fase={5} titulo="Fotos" />
                <p className="ca-sec" style={{ margin: '20px 4px 10px' }}>Fotos de la visita</p>
                {SLOTS.map((s, si) => {
                    const subidas = s.fotos.filter(([, k]) => f >= fotosEn[k] + 3);
                    const turno = s.fotos.find(([, k]) => f < fotosEn[k] + 3);
                    const k = turno ? turno[1] : null;
                    return (
                        <div key={s.id} className={`ca-slot${turno && (si === 0 || f >= fotosEn[SLOTS[si - 1].fotos.at(-1)[1]] + 3) ? ' ca-guia' : ''}`} style={aparece(f, 4 + si * 4)}>
                            <div className="ca-slot-top">
                                <span className={`ca-ico-tile ${subidas.length ? 'ca-tile-verde' : 'ca-tile-crema'}`}>{subidas.length ? <IcoCheck sw={2.6} /> : s.ico}</span>
                                <span><b>{s.label}</b><small>{s.ayuda}</small></span>
                                <span className={`ca-cuenta${subidas.length ? '' : ' ca-cuenta-0'}`}>{subidas.length} {subidas.length === 1 ? 'foto' : 'fotos'}</span>
                            </div>
                            {subidas.length > 0 && (
                                <div className="ca-thumbs">
                                    {subidas.map(([img, kk]) => {
                                        const p = avance(f, fotosEn[kk] + 3, 10);
                                        return (
                                            <span key={img} className="ca-thumb" style={{ opacity: p, transform: `scale(${0.8 + 0.2 * p})` }}>
                                                <Img src={staticFile(`fotos/${img}`)} />
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            {turno && (
                                <div className="ca-btns ca-btns-2" style={{ marginTop: 12 }}>
                                    <span className="ca-btn ca-btn-tinta ca-btn-peq" style={{ width: '100%', position: 'relative' }}>
                                        <IcoCamara size={18} /> Hacer foto
                                        <Toque f={f} en={fotosEn[k]} />
                                    </span>
                                    <span className="ca-btn ca-btn-sec ca-btn-peq" style={{ width: '100%' }}>Galería</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Pantalla>
    );
}

/* ── 3 · La IA lo prepara ──────────────────────────────────────────────────── */
const TAREAS = ['Datos del Catastro y plano', 'Envolvente: muros, cubierta y huecos', 'Calefacción y agua caliente', '.cex de CE3X 3.2, XML y PDF'];

export function PantallaPreparando({ f }) {
    const pct = interpolate(f, [4, 66], [8, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
        <Pantalla>
            <BarraApp creditos={3} />
            <div style={{ padding: '16px 16px 0' }}>
                <CabObra fase={6} titulo="Pedir el certificado" />
                <div className="ca-card ca-pad" style={{ marginTop: 12 }}>
                    <div className="ca-filete" />
                    <div className="ca-fila-top">
                        <p className="ca-eyebrow ca-eyebrow-verde" style={{ margin: 0 }}>La IA está trabajando</p>
                        <span className="ca-ico-tile ca-tile-verde"><IcoChispa /></span>
                    </div>
                    <h2 className="ca-display ca-h3" style={{ marginTop: 10 }}>Preparando tu CEE inicial</h2>
                    <div className="ca-barra" style={{ marginTop: 14 }}><i style={{ width: `${pct}%` }} /></div>
                    <ul className="ca-lista">
                        {TAREAS.map((t, i) => {
                            const hecho = f >= 14 + i * 14;
                            return (
                                <li key={t} style={{ opacity: hecho ? 1 : 0.45 }}>
                                    {hecho ? <IcoCheck size={18} sw={2.6} /> : <span style={{ width: 18, height: 18, flex: 'none', borderRadius: 999, border: '2px solid rgba(20,17,17,.18)', marginTop: 2 }} />}
                                    <span>{t}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="ca-peq" style={{ marginTop: 10 }}>Te avisamos por WhatsApp y email cuando esté listo.</p>
                </div>
            </div>
        </Pantalla>
    );
}

/** El aviso que cae desde arriba: «Tu CEE inicial está listo». */
export function Aviso({ f, toqueEn }) {
    const baja = avance(f, 0, 14);
    const sube = avance(f, toqueEn + 6, 10);
    const y = -150 + 150 * baja - 150 * sube;
    return (
        <div style={{ position: 'absolute', left: 10, right: 10, top: 50, zIndex: 30, transform: `translateY(${y}px)`, opacity: 1 - sube }}>
            <div style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 22, background: 'rgba(255,255,255,.96)', boxShadow: '0 18px 40px -16px rgba(20,17,17,.45)', border: '1px solid var(--linea)', fontFamily: 'Inter, sans-serif' }}>
                <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 11, background: '#25d366', color: '#fff', display: 'grid', placeItems: 'center' }}><IcoWhatsApp size={22} /></span>
                <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gris)', fontWeight: 600 }}><span>WhatsApp · BROKERGY</span><span>ahora</span></span>
                    <b style={{ display: 'block', fontSize: 14.5, color: 'var(--tinta)' }}>Tu CEE inicial está listo ✅</b>
                    <span style={{ display: 'block', fontSize: 13, color: '#3b3e45' }}>{OBRA.numero} · Calle Socuéllamos 7. Ábrelo y revísalo.</span>
                </span>
                <Toque f={f} en={toqueEn} />
            </div>
        </div>
    );
}

/* ── 3b · Listo para revisar: el croquis a la vista y la firma desde la web ── */
const DESCARGAS = [['.cex', 'CE3X 3.2'], ['.xml', 'Registro'], ['.pdf', 'Certificado']];

function Letra({ l, color, txt }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--gris)' }}>
            <b style={{ width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center', background: color, color: 'var(--tinta)', font: "700 17px/1 'Antonio','Inter',sans-serif" }}>{l}</b>{txt}
        </span>
    );
}

export function PantallaListo({ f, pulsoEn, firmaEn }) {
    const circulo = avance(f, 4, 16);
    const palomita = avance(f, 16, 10);
    const firmado = avance(f, firmaEn + 6, 12);
    const pulso = f >= pulsoEn && f < firmaEn ? 1 + 0.035 * Math.sin(((f - pulsoEn) / 30) * Math.PI * 2) : 1;
    return (
        <Pantalla>
            <BarraApp creditos={3} />
            <div style={{ padding: '16px 16px 0' }}>
                <div className="ca-card ca-pad">
                    <div className="ca-filete" />
                    <div className="ca-fila-top">
                        <span className="ca-mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--naranja-txt)' }}>{OBRA.numero}</span>
                        <span className="ca-chip ca-chip-verde">{firmado > 0.5 ? 'Firmado' : 'Listo para revisar'}</span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <svg width="44" height="44" viewBox="0 0 64 64" style={{ display: 'block' }}>
                            <circle cx="32" cy="32" r="28" fill="rgba(177,209,62,.16)" stroke="#b1d13e" strokeWidth="3" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - circulo * 100} transform="rotate(-90 32 32)" />
                            <path d="M20 33l8 8 16-17" fill="none" stroke="#4d6b0f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - palomita * 100} />
                        </svg>
                        <h2 className="ca-display ca-h2" style={{ margin: '8px 0 0', isolation: 'isolate' }}>Tu certificado está <span className="ca-mark" style={{ position: 'relative', zIndex: -1 }}>listo</span></h2>
                    </div>
                    <div style={{ display: 'flex', gap: 18, marginTop: 12, ...aparece(f, 14) }}>
                        <Letra l="E" color="#f5b52e" txt="en consumo" />
                        <Letra l="D" color="#f2dc2d" txt="en emisiones" />
                    </div>
                    <div style={{ marginTop: 12, borderRadius: 14, background: 'var(--crema)', border: '1px solid var(--linea)', overflow: 'hidden', ...aparece(f, 18) }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px 0', fontSize: 12.5, fontWeight: 700 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IcoPlano size={15} /> Croquis</span>
                            <span style={{ color: 'var(--gris)', fontWeight: 500 }}>fachadas y huecos</span>
                        </div>
                        <Croquis dibujo={avance(f, 22, 22)} huecos={avance(f, 40, 10)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
                        {DESCARGAS.map(([b, s], i) => (
                            <span key={b} style={{ padding: '8px 10px', borderRadius: 12, background: '#fff', border: '1px solid var(--linea)', fontSize: 11, color: 'var(--gris)', ...aparece(f, 26 + i * 4, 12, 10) }}>
                                <b style={{ display: 'block', font: "700 17px/1.1 'Antonio','Inter',sans-serif", color: 'var(--tinta)' }}>{b}</b>{s}
                            </span>
                        ))}
                    </div>
                    <div className="ca-btns" style={{ position: 'relative', ...aparece(f, 40) }}>
                        {firmado < 1 && (
                            <span className="ca-btn ca-btn-pri" style={{ position: 'relative', transform: `scale(${pulso})`, opacity: 1 - firmado }}>
                                <IcoSello size={20} /> Validar y firmar con AutoFirma
                                <Toque f={f} en={firmaEn} />
                            </span>
                        )}
                        {firmado > 0 && (
                            <span className="ca-btn" style={{ position: firmado < 1 ? 'absolute' : 'relative', inset: 0, opacity: firmado, background: 'rgba(177,209,62,.22)', color: 'var(--verde-txt)', boxShadow: 'none' }}>
                                <IcoCheck size={20} sw={2.6} /> Certificado firmado
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </Pantalla>
    );
}
