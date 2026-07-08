import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─────────────────────────────────────────────────────────────────────────────
// Modal de firma con certificado electrónico vía AUTOFIRMA (formato arrastrable).
//
// Flujo:
//   1. Recibe el PDF ya generado (base64 sin prefijo data:).
//   2. Lo pinta con pdf.js y el usuario ARRASTRA el recuadro donde quiere firmar.
//   3. Convierte el recuadro a coordenadas PDF (puntos, origen abajo-izquierda).
//   4. Invoca Autofirma (autoscript.js) con formato PAdES + rúbrica (logo) + posición.
//   5. Autofirma abre → el usuario elige su certificado → devuelve el PDF firmado.
//   6. onSigned(signedPdfBase64) para que el padre lo suba a Drive / marque firmado.
//
// REQUISITO: el usuario debe tener AUTOFIRMA instalado (app de escritorio del
// Gobierno). No funciona con Adobe. La librería autoscript.js vive en
// /public/autofirma/autoscript.js y se carga como script clásico (global AutoScript).
// ─────────────────────────────────────────────────────────────────────────────

const AUTOSCRIPT_SRC = '/autofirma/autoscript.js';
const DEFAULT_RUBRIC_IMAGE_URL = '/logo-brokergy-circular-transparent.png';
const INSTALL_URL = 'https://firmaelectronica.gob.es/Home/Descargas.html';

// Carga autoscript.js una sola vez y resuelve cuando window.AutoScript existe.
let _autoscriptPromise = null;
function loadAutoScript() {
    if (window.AutoScript) return Promise.resolve(window.AutoScript);
    if (_autoscriptPromise) return _autoscriptPromise;
    _autoscriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = AUTOSCRIPT_SRC;
        s.async = true;
        s.onload = () => {
            if (window.AutoScript) resolve(window.AutoScript);
            else reject(new Error('autoscript.js cargó pero AutoScript no está definido'));
        };
        s.onerror = () => reject(new Error('No se pudo cargar autoscript.js'));
        document.head.appendChild(s);
    });
    return _autoscriptPromise;
}

// Normaliza para comparar sin tildes ni mayúsculas. \p{Diacritic} (ASCII en el
// fuente) evita que las marcas combinantes literales se corrompan al bundlear.
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Busca en el PDF la primera aparición de cualquiera de los textos ancla y
// devuelve una zona de firma SUGERIDA (debajo del ancla) en puntos PDF.
// Devuelve { page, pdf:{llx,lly,urx,ury} } o null.
async function findSignatureAnchor(doc, anchors) {
    // anchors: array de textos; cada uno puede ser "texto" (busca en todo el doc)
    // o "texto@N" para restringir a la página N. Se prioriza el ORDEN de la lista
    // (el primer ancla que aparezca gana); dentro de una misma ancla se elige la
    // coincidencia más abajo de la página más avanzada (zona de firma habitual).
    // Formato de cada ancla: "texto[@N][^above|^below]".  @N restringe a la página N.
    // ^above/^below indica si el recuadro va ENCIMA o DEBAJO del texto (def: below).
    const raw = (Array.isArray(anchors) ? anchors : [anchors]).filter(Boolean);
    const specs = raw.map(a => {
        const m = String(a).match(/^(.*?)(?:@(\d+))?(?:\^(above|below))?$/);
        return { txt: norm(m ? m[1] : a), page: m && m[2] ? parseInt(m[2], 10) : null, dir: (m && m[3]) || 'below' };
    }).filter(s => s.txt);
    if (!specs.length) return null;

    // Recolecta todas las coincidencias por índice de ancla.
    const found = specs.map(() => []);
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        for (const it of tc.items) {
            const t = norm(it.str);
            if (!t) continue;
            specs.forEach((s, i) => {
                if (t.includes(s.txt) && (s.page == null || s.page === p)) {
                    found[i].push({ page: p, it });
                }
            });
        }
    }
    // Primer ancla (por orden) con coincidencias → mejor match (página más alta, y más baja).
    for (let i = 0; i < found.length; i++) {
        if (!found[i].length) continue;
        const best = found[i].sort((a, b) => (b.page - a.page) || (a.it.transform[5] - b.it.transform[5]))[0];
        const tr = best.it.transform;             // e,f = x,y (baseline, PDF coords)
        const ex = tr[4], ey = tr[5];
        const w = best.it.width || 180;
        const fh = best.it.height || Math.abs(tr[3]) || 10;
        const boxH = Math.max(52, fh * 4.5);
        const boxW = Math.max(w, 230);
        const llx = ex;
        const urx = ex + boxW;
        let lly, ury;
        if (specs[i].dir === 'above') {           // recuadro ENCIMA del texto ancla
            lly = ey + fh * 0.8;
            ury = lly + boxH;
        } else {                                   // recuadro DEBAJO del texto ancla (def)
            ury = ey - fh * 0.8;
            lly = ury - boxH;
        }
        return { page: best.page, pdf: { llx: Math.round(llx), lly: Math.round(lly), urx: Math.round(urx), ury: Math.round(ury) } };
    }
    return null;
}

async function fetchImageAsBase64(url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
        fr.onerror = reject;
        fr.readAsDataURL(blob);
    });
}

export default function FirmarConCertificadoModal({
    pdfBase64,
    title = 'Firmar con certificado',
    productionCity = 'Tomelloso',
    rubricImageUrl = DEFAULT_RUBRIC_IMAGE_URL,
    initialPage = 1,
    signatureAnchor = null,   // texto(s) a buscar para pre-situar el recuadro de firma
    fixedBox = null,          // { page, llx, lly, urx, ury } EXACTO (puntos PDF, origen abajo-izq.)
                              // Documentos propios (plantilla fija): salta el escaneo de texto y
                              // sitúa el recuadro ya mismo → un solo click en "Firmar con Autofirma".
                              // Tiene prioridad sobre signatureAnchor si ambos se pasan.
    onClose,
    onSigned,
}) {
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const bodyRef = useRef(null);           // contenedor scrollable: mide el ancho disponible
    const pdfDocRef = useRef(null);
    const viewportRef = useRef(null);       // viewport de la página actualmente pintada
    const rubricB64Ref = useRef(null);
    const anchorRef = useRef(null);         // { page, pdf:{llx,lly,urx,ury} } zona de firma detectada
    const userDrewRef = useRef(false);      // el usuario ha dibujado su propio recuadro

    const [numPages, setNumPages] = useState(0);
    const [pageNum, setPageNum] = useState(initialPage);
    const [rect, setRect] = useState(null);           // { x, y, w, h } en px CSS del canvas (solo visual)
    const [rectPage, setRectPage] = useState(null);   // página a la que pertenece el recuadro
    const [suggested, setSuggested] = useState(false); // el recuadro actual es la sugerencia auto (destello)
    const pdfCoordsRef = useRef(null);                // { page, llx, lly, urx, ury } en puntos PDF
    const [drag, setDrag] = useState(null);           // arrastre en curso
    const [signReady, setSignReady] = useState(false); // hay coordenadas de firma listas (caja fija o arrastrada)
    const [loading, setLoading] = useState(true);
    const [signing, setSigning] = useState(false);
    const [error, setError] = useState(null);
    const [needsInstall, setNeedsInstall] = useState(false);

    // ── Cargar el PDF y la rúbrica ────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                rubricB64Ref.current = rubricImageUrl
                    ? await fetchImageAsBase64(rubricImageUrl).catch(() => null)
                    : null;
                const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
                const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
                if (cancelled) return;
                pdfDocRef.current = doc;
                setNumPages(doc.numPages);
                userDrewRef.current = false;
                // Caja EXACTA (documentos propios, plantilla fija) → salta el escaneo de
                // texto; si no hay caja fija, cae al escaneo por texto ancla (heurística).
                anchorRef.current = fixedBox
                    ? { page: fixedBox.page, pdf: { llx: fixedBox.llx, lly: fixedBox.lly, urx: fixedBox.urx, ury: fixedBox.ury } }
                    : signatureAnchor
                        ? await findSignatureAnchor(doc, signatureAnchor).catch(() => null)
                        : null;
                if (cancelled) return;
                // Fijar YA las coordenadas de firma (puntos PDF) → el botón "Firmar"
                // funciona al instante sin necesidad de arrastrar ningún recuadro.
                if (anchorRef.current) {
                    const a = anchorRef.current;
                    pdfCoordsRef.current = { page: a.page, llx: a.pdf.llx, lly: a.pdf.lly, urx: a.pdf.urx, ury: a.pdf.ury };
                    setRectPage(a.page);
                    setSuggested(true);
                    setSignReady(true);
                }
                const targetPage = anchorRef.current?.page || Math.max(1, initialPage);
                setPageNum(Math.min(targetPage, doc.numPages));
            } catch (e) {
                if (!cancelled) setError('No se pudo cargar el PDF para firmar: ' + e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [pdfBase64, rubricImageUrl, initialPage, signatureAnchor, fixedBox]);

    // ── Pintar la página actual ───────────────────────────────────────────────
    const renderPage = useCallback(async (n) => {
        const doc = pdfDocRef.current;
        const canvas = canvasRef.current;
        if (!doc || !canvas) return;
        const page = await doc.getPage(n);
        // Escala para que el documento COMPLETO quepa en el ancho disponible del
        // visor (mide el contenedor). Evita que se recorte por la derecha, sobre
        // todo en documentos apaisados (Anexo I Listado). Se recalcula al redimensionar.
        const raw = page.getViewport({ scale: 1 });
        // Ancho útil del visor = ancho del contenedor menos su padding (16px×2) y un
        // margen para la barra de scroll. Así el documento entra completo sin recortarse.
        const avail = Math.max(300, (bodyRef.current?.clientWidth || 660) - 40);
        const scale = Math.min(avail / raw.width, 2.2);
        const viewport = page.getViewport({ scale });
        viewportRef.current = viewport;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Si esta página tiene una zona de firma detectada y el usuario aún no ha
        // dibujado la suya, pre-situamos el recuadro (con destello) para guiarle.
        const a = anchorRef.current;
        if (a && a.page === n && !userDrewRef.current) {
            const [vx0, vy0] = viewport.convertToViewportPoint(a.pdf.llx, a.pdf.ury);
            const [vx1, vy1] = viewport.convertToViewportPoint(a.pdf.urx, a.pdf.lly);
            const sr = { x: Math.min(vx0, vx1), y: Math.min(vy0, vy1), w: Math.abs(vx1 - vx0), h: Math.abs(vy1 - vy0) };
            setRect(sr);
            setRectPage(n);
            setSuggested(true);
            pdfCoordsRef.current = { page: n, llx: a.pdf.llx, lly: a.pdf.lly, urx: a.pdf.urx, ury: a.pdf.ury };
        }
    }, []);

    useEffect(() => {
        if (!loading && pdfDocRef.current) renderPage(pageNum);
    }, [loading, pageNum, renderPage]);

    // Re-pintar al redimensionar la ventana para que el documento siga cabiendo entero.
    useEffect(() => {
        if (loading) return;
        let t;
        const onResize = () => { clearTimeout(t); t = setTimeout(() => renderPage(pageNum), 120); };
        window.addEventListener('resize', onResize);
        return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
    }, [loading, pageNum, renderPage]);

    // ── Arrastre del recuadro ─────────────────────────────────────────────────
    const overlayPoint = (e) => {
        const r = overlayRef.current.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(e.clientX - r.left, r.width)),
            y: Math.max(0, Math.min(e.clientY - r.top, r.height)),
        };
    };
    const onMouseDown = (e) => {
        const p = overlayPoint(e);
        // No borramos el recuadro sugerido al pulsar: solo si el usuario ARRASTRA
        // (se limpia en onMouseMove). Así un simple click sobre él dispara la firma.
        setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, moved: false });
    };
    const onMouseMove = (e) => {
        if (!drag) return;
        const p = overlayPoint(e);
        const moved = drag.moved || Math.abs(p.x - drag.x0) > 4 || Math.abs(p.y - drag.y0) > 4;
        if (moved && !drag.moved) setSuggested(false);   // empieza un arrastre real → deja de ser sugerencia
        setDrag(d => ({ ...d, x1: p.x, y1: p.y, moved }));
    };
    const onMouseUp = () => {
        if (!drag) return;
        const { x0, y0, x1, y1, moved } = drag;
        setDrag(null);
        // CLICK sin arrastre: si cae dentro del recuadro ya marcado → firmar directamente.
        if (!moved) {
            if (rect && pdfCoordsRef.current && rectPage === pageNum && !signing) {
                const inX = x0 >= rect.x - 8 && x0 <= rect.x + rect.w + 8;
                const inY = y0 >= rect.y - 8 && y0 <= rect.y + rect.h + 8;
                if (inX && inY) handleSign();
            }
            return;
        }
        const x = Math.min(x0, x1);
        const y = Math.min(y0, y1);
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0);
        if (w < 20 || h < 12) return;   // recuadro demasiado pequeño: conservamos el actual
        userDrewRef.current = true;
        setSuggested(false);
        setSignReady(true);
        setRect({ x, y, w, h });
        setRectPage(pageNum);
        // Convertir YA a puntos PDF con el viewport de ESTA página (evita usar un
        // viewport obsoleto si el usuario navega a otra página antes de firmar).
        const vp = viewportRef.current;
        const [ax, ay] = vp.convertToPdfPoint(x, y);
        const [bx, by] = vp.convertToPdfPoint(x + w, y + h);
        pdfCoordsRef.current = {
            page: pageNum,
            llx: Math.round(Math.min(ax, bx)),
            lly: Math.round(Math.min(ay, by)),
            urx: Math.round(Math.max(ax, bx)),
            ury: Math.round(Math.max(ay, by)),
        };
    };

    const liveRect = drag
        ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }
        : rect;
    const showRect = (rectPage === pageNum || drag) ? liveRect : null;

    // ── Firmar ────────────────────────────────────────────────────────────────
    const buildExtraParams = (coords) => {
        // Coordenadas PDF ya calculadas (arrastre o caja fija): no dependen del
        // viewport de la página visible actualmente.
        const { page, llx, lly, urx, ury } = coords;

        const lines = [
            'signatureFormat=PAdES',
            `signaturePage=${page}`,
            `signaturePositionOnPageLowerLeftX=${llx}`,
            `signaturePositionOnPageLowerLeftY=${lly}`,
            `signaturePositionOnPageUpperRightX=${urx}`,
            `signaturePositionOnPageUpperRightY=${ury}`,
            `signatureProductionCity=${productionCity}`,
            // Texto sobre la rúbrica: nombre del titular + fecha (desde el certificado).
            'layer2Text=Firmado por $$SUBJECTCN$$\\nFecha: $$SIGNDATE=dd/MM/yyyy HH:mm:ss$$',
            'layer2FontSize=8',
        ];
        if (rubricB64Ref.current) {
            lines.push(`signatureRubricImage=${rubricB64Ref.current}`);
        }
        return lines.join('\n');
    };

    const handleSign = async () => {
        setError(null);
        setNeedsInstall(false);
        // Coordenadas: las del arrastre/caja fija; si faltasen, respaldo desde el ancla detectada.
        let coords = pdfCoordsRef.current;
        if (!coords && anchorRef.current) {
            const a = anchorRef.current;
            coords = { page: a.page, llx: a.pdf.llx, lly: a.pdf.lly, urx: a.pdf.urx, ury: a.pdf.ury };
        }
        if (!coords) { setError('Marca en la página el recuadro donde quieres que aparezca tu firma (arrástralo).'); return; }
        setSigning(true);
        try {
            const AutoScript = await loadAutoScript();
            AutoScript.cargarAppAfirma();
            const extraParams = buildExtraParams(coords);
            AutoScript.sign(
                pdfBase64,
                'SHA512withRSA',
                'PAdES',
                extraParams,
                (signedB64 /*, certB64 */) => {
                    setSigning(false);
                    onSigned?.(signedB64);
                },
                (errType, errMsg) => {
                    setSigning(false);
                    const msg = errMsg || errType || 'Error desconocido';
                    // Autofirma no instalado / no accesible.
                    if (/no.*instal|not.*install|conect|socket|ENOENT|no se ha podido/i.test(String(msg))) {
                        setNeedsInstall(true);
                    }
                    setError('Autofirma: ' + msg);
                }
            );
        } catch (e) {
            setSigning(false);
            setNeedsInstall(true);
            setError(e.message || 'No se pudo iniciar Autofirma');
        }
    };

    const handleClose = () => { setSigning(false); onClose?.(); };

    const isSuggested = suggested && !drag;

    return (
        <div style={ovl} onMouseDown={(e) => { if (e.target === e.currentTarget && !signing) handleClose(); }}>
            <style>{`@keyframes bkgFirmaPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,.55),0 0 14px 2px rgba(245,158,11,.5);background:rgba(245,158,11,.22)}50%{box-shadow:0 0 0 6px rgba(245,158,11,0),0 0 26px 8px rgba(245,158,11,.85);background:rgba(245,158,11,.32)}}`}</style>
            <div style={box}>
                <div style={head}>
                    <span style={{ fontWeight: 800, letterSpacing: '.5px' }}>{title}</span>
                    <button onClick={handleClose} style={xBtn} aria-label="Cerrar">✕</button>
                </div>

                <div style={{ padding: '10px 16px', fontSize: 13, color: '#cbd5e1' }}>
                    {isSuggested
                        ? <>Te hemos marcado <b style={{ color: '#f59e0b' }}>dónde debes firmar</b> (recuadro que parpadea). <b>Pulsa dentro del recuadro</b> o el botón <b>Firmar con Autofirma</b> y elige tu certificado. Si quieres, puedes arrastrar otro recuadro.</>
                        : <>Arrastra sobre la página el recuadro donde quieres que aparezca tu firma. Luego pulsa <b>Firmar con Autofirma</b> y elige tu certificado.</>}
                </div>

                <div style={body} ref={bodyRef}>
                    {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando PDF…</div>}
                    {!loading && (
                        <div style={{ position: 'relative', display: 'inline-block', boxShadow: '0 4px 24px rgba(0,0,0,.4)' }}>
                            <canvas ref={canvasRef} style={{ display: 'block' }} />
                            <div
                                ref={overlayRef}
                                onMouseDown={onMouseDown}
                                onMouseMove={onMouseMove}
                                onMouseUp={onMouseUp}
                                onMouseLeave={onMouseUp}
                                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                            >
                                {showRect && (
                                    <div style={{
                                        position: 'absolute',
                                        left: showRect.x, top: showRect.y, width: showRect.w, height: showRect.h,
                                        border: '2px solid #f59e0b',
                                        background: 'rgba(245,158,11,.18)',
                                        borderRadius: 4,
                                        pointerEvents: 'none',
                                        ...(isSuggested ? { animation: 'bkgFirmaPulse 1.2s ease-in-out infinite', cursor: 'pointer' } : {}),
                                    }}>
                                        {isSuggested && (
                                            <span style={{ position: 'absolute', top: -22, left: -2, background: '#f59e0b', color: '#000', fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.5px' }}>✍️ Pulsa aquí para firmar</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {numPages > 1 && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                        <button style={navBtn} disabled={pageNum <= 1} onClick={() => setPageNum(p => Math.max(1, p - 1))}>‹</button>
                        <span style={{ fontSize: 13, color: '#cbd5e1' }}>Página {pageNum} / {numPages}</span>
                        <button style={navBtn} disabled={pageNum >= numPages} onClick={() => setPageNum(p => Math.min(numPages, p + 1))}>›</button>
                    </div>
                )}

                {error && (
                    <div style={{ margin: '0 16px 8px', padding: '10px 12px', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
                        {error}
                        {needsInstall && (
                            <div style={{ marginTop: 6 }}>
                                ¿No tienes Autofirma? <a href={INSTALL_URL} target="_blank" rel="noreferrer" style={{ color: '#fcd34d', fontWeight: 700 }}>Descárgalo aquí</a> e inténtalo de nuevo.
                            </div>
                        )}
                    </div>
                )}

                <div style={foot}>
                    <span style={{ fontSize: 12, color: signReady ? '#34d399' : '#94a3b8' }}>
                        {signReady ? `✓ Recuadro fijado en página ${rectPage || pageNum}` : 'Sin recuadro'}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleClose} style={ghostBtn}>Cancelar</button>
                        <button onClick={handleSign} disabled={signing || !signReady} style={{ ...primaryBtn, opacity: (signing || !signReady) ? 0.5 : 1 }}>
                            {signing ? 'Firmando…' : '🖊️ Firmar con Autofirma'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const ovl = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 };
const box = { background: '#0f172a', color: '#e2e8f0', borderRadius: 14, border: '1px solid #1e293b', width: 'min(920px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1e293b' };
const body = { flex: 1, overflow: 'auto', padding: 16, textAlign: 'center', background: '#020617' };
const foot = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #1e293b' };
const xBtn = { background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' };
const navBtn = { background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 8, width: 32, height: 28, cursor: 'pointer' };
const ghostBtn = { background: 'transparent', border: '1px solid #334155', color: '#cbd5e1', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontWeight: 600 };
const primaryBtn = { background: '#f59e0b', border: 'none', color: '#000', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontWeight: 800 };
