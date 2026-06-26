import React, { useEffect, useRef } from 'react';

// Convierte un hex (#RRGGBB) a {r,g,b}. Devuelve null si no es válido.
const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
};

// Fondo de "red de partículas" SUTIL para el sidebar — continuidad de marca con el login.
// Diferencias deliberadas con DynamicNetworkBackground (ese es a pantalla completa para el login):
//  - Se CONTIENE en su contenedor (no `fixed`); se dimensiona al padre con ResizeObserver.
//  - Pocas partículas, movimiento lento y baja opacidad → no distrae ni penaliza rendimiento.
//  - Se PAUSA cuando la pestaña no está visible y respeta `prefers-reduced-motion`.
//  - Sin listeners globales de ratón.
// `color` (opcional): hex para teñir nodos/líneas (p.ej. color de marca del partner). Sin él → ámbar Brokergy.
export const SidebarNetworkBackground = ({ color = null }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        const ctx = canvas.getContext('2d');
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

        const accent = hexToRgb(color) || { r: 255, g: 160, b: 0 };
        const accentHex = (color && hexToRgb(color)) ? color : '#FFA000';

        const CONNECT = 110;
        let particles = [];
        let raf = null;
        let w = 0;
        let h = 0;

        class P {
            constructor() {
                this.x = Math.random() * w;
                this.y = Math.random() * h;
                this.size = Math.random() * 1.6 + 0.6;
                this.dx = (Math.random() - 0.5) * 0.22;
                this.dy = (Math.random() - 0.5) * 0.22;
                this.color = Math.random() > 0.85 ? '#29B6F6' : accentHex;
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
            const count = Math.max(8, Math.min(24, Math.round((w * h) / 16000)));
            particles = Array.from({ length: count }, () => new P());
        };

        const render = () => {
            if (w === 0 || h === 0) return;
            ctx.clearRect(0, 0, w, h);
            ctx.globalAlpha = 0.5;
            for (let i = 0; i < particles.length; i++) {
                particles[i].draw();
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < CONNECT) {
                        const op = (1 - dist / CONNECT) * 0.13;
                        ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${op})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
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
