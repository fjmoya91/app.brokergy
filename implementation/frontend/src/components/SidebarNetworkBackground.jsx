import React, { useEffect, useRef } from 'react';

// Convierte un hex (#RRGGBB) a {r,g,b}. Devuelve null si no es válido.
const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
};

// Colores de los puntos del fondo Brokergy = los del círculo del logo.
const BRAND_DOT_COLORS = ['#FFA000', '#EFE778', '#AECD33'];

// Fondo de "red de partículas" para el sidebar — mismo lenguaje que el login
// (líneas con degradado entre nodos + pulsos de energía), pero CONTENIDO y discreto.
// Diferencias deliberadas con DynamicNetworkBackground (ese es a pantalla completa):
//  - Se CONTIENE en su contenedor (no `fixed`); se dimensiona al padre con ResizeObserver.
//  - Pocas partículas, movimiento lento → no distrae ni penaliza rendimiento.
//  - Se PAUSA cuando la pestaña no está visible y respeta `prefers-reduced-motion`.
//  - Sin listeners de ratón (el contenido va por encima).
// `color` (opcional): hex para teñir nodos (color de marca del partner). Sin él → paleta Brokergy.
export const SidebarNetworkBackground = ({ color = null }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        const ctx = canvas.getContext('2d');
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

        const isPartner = !!(color && hexToRgb(color));
        const accentHex = isPartner ? color : '#FFA000';

        const CONNECT = 120;
        const MAX_PULSES = 4;
        let particles = [];
        let pulses = [];                 // "energía" viajando por las conexiones
        let raf = null;
        let w = 0;
        let h = 0;

        // Partner → su color (con algún blanco). Brokergy → paleta del logo.
        const pickColor = () => isPartner
            ? (Math.random() > 0.85 ? '#FFFFFF' : accentHex)
            : BRAND_DOT_COLORS[Math.floor(Math.random() * BRAND_DOT_COLORS.length)];

        class P {
            constructor() {
                this.x = Math.random() * w;
                this.y = Math.random() * h;
                this.size = Math.random() * 2 + 1.4;     // antes 0.6–2.2 → ahora 1.4–3.4
                this.dx = (Math.random() - 0.5) * 0.22;
                this.dy = (Math.random() - 0.5) * 0.22;
                this.color = pickColor();
            }
            update() {
                this.x += this.dx;
                this.y += this.dy;
                if (this.x > w || this.x < 0) this.dx = -this.dx;
                if (this.y > h || this.y < 0) this.dy = -this.dy;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
        }

        const init = () => {
            // Densidad baja proporcional al área del sidebar, con tope.
            const count = Math.max(8, Math.min(26, Math.round((w * h) / 14000)));
            particles = Array.from({ length: count }, () => new P());
            pulses = [];
        };

        const render = () => {
            if (w === 0 || h === 0) return;
            ctx.clearRect(0, 0, w, h);

            // 1) Líneas de unión — degradado entre los colores de los dos nodos.
            for (let i = 0; i < particles.length; i++) {
                const pi = particles[i];
                for (let j = i + 1; j < particles.length; j++) {
                    const pj = particles[j];
                    const dist = Math.hypot(pi.x - pj.x, pi.y - pj.y);
                    if (dist >= CONNECT) continue;
                    const strength = 1 - dist / CONNECT;
                    const grad = ctx.createLinearGradient(pi.x, pi.y, pj.x, pj.y);
                    grad.addColorStop(0, pi.color);
                    grad.addColorStop(1, pj.color);
                    ctx.strokeStyle = grad;
                    ctx.globalAlpha = strength * 0.4;        // antes 0.13 → ahora se ven
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(pi.x, pi.y);
                    ctx.lineTo(pj.x, pj.y);
                    ctx.stroke();

                    if (!reduceMotion && strength > 0.55 && pulses.length < MAX_PULSES && Math.random() > 0.9985) {
                        pulses.push({ i, j, t: 0, speed: 0.01 + Math.random() * 0.015,
                            color: Math.random() > 0.5 ? pi.color : pj.color });
                    }
                }
            }
            ctx.globalAlpha = 1;

            // 2) Nodos.
            ctx.globalAlpha = 0.9;
            for (let i = 0; i < particles.length; i++) particles[i].draw();
            ctx.globalAlpha = 1;

            // 3) Pulsos de energía viajando por las conexiones (suaves).
            for (let k = pulses.length - 1; k >= 0; k--) {
                const p = pulses[k];
                p.t += p.speed;
                const a = particles[p.i], b = particles[p.j];
                if (p.t >= 1 || !a || !b) { pulses.splice(k, 1); continue; }
                const x = a.x + (b.x - a.x) * p.t;
                const y = a.y + (b.y - a.y) * p.t;
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.sin(p.t * Math.PI) * 0.9;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };

        const frame = () => {
            for (const p of particles) p.update();
            render();
            raf = requestAnimationFrame(frame);
        };

        const start = () => { if (raf == null && !reduceMotion) raf = requestAnimationFrame(frame); };
        const stop = () => { if (raf != null) { cancelAnimationFrame(raf); raf = null; } };

        const resize = () => {
            w = canvas.width = parent.clientWidth;
            h = canvas.height = parent.clientHeight;
            init();
            // Con movimiento reducido pintamos un único frame estático (sin bucle).
            if (reduceMotion) render();
        };

        const ro = new ResizeObserver(resize);
        ro.observe(parent);
        resize();
        start();

        const onVisibility = () => { if (document.hidden) stop(); else start(); };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            stop();
            ro.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [color]);

    return (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <canvas ref={canvasRef} className="w-full h-full opacity-80" />
        </div>
    );
};
