import React, { useEffect, useRef } from 'react';

// Convierte un hex (#RRGGBB) a {r,g,b}. Devuelve null si no es válido.
const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
};

// Colores de los puntos del fondo Brokergy = los del círculo del logo.
const BRAND_DOT_COLORS = ['#FFA000', '#EFE778', '#AECD33'];

// `color` (opcional): hex del partner para teñir nodos y líneas en la landing
// white-label. Sin color → comportamiento por defecto (ámbar + azul Brokergy).
export const DynamicNetworkBackground = ({ color = null }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let particles = [];
        let pulses = [];                    // "energía" viajando por las conexiones (efecto WOW)
        const particleCount = 75;
        const connectionDistance = 160;
        const mouseRadius = 220;
        const MAX_PULSES = 14;

        // Paleta: si hay color de partner, los nodos son su color (con algunos
        // blancos para dar profundidad) y las líneas su color. Si no, ámbar+azul.
        const accentRgb = hexToRgb(color) || { r: 255, g: 160, b: 0 };
        const nodeColor = (color && hexToRgb(color)) ? color : null;

        let mouse = { x: null, y: null };

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initParticles();
        };

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                // Antes 1–3px. Ahora 2.5–5.5px para que se vean más.
                this.size = Math.random() * 3 + 2.5;
                this.baseX = this.x;
                this.baseY = this.y;
                this.dx = (Math.random() - 0.5) * 0.8;
                this.dy = (Math.random() - 0.5) * 0.8;
                // Partner (white-label) → su color. Brokergy → paleta del logo.
                this.color = nodeColor
                    ? (Math.random() > 0.8 ? '#FFFFFF' : nodeColor)
                    : BRAND_DOT_COLORS[Math.floor(Math.random() * BRAND_DOT_COLORS.length)];
            }

            update() {
                this.x += this.dx;
                this.y += this.dy;

                // Rebote en bordes
                if (this.x > canvas.width || this.x < 0) this.dx = -this.dx;
                if (this.y > canvas.height || this.y < 0) this.dy = -this.dy;

                // Interacción con ratón (vortex sutil)
                if (mouse.x != null) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouseRadius) {
                        this.x -= dx / 50;
                        this.y -= dy / 50;
                    }
                }
            }

            draw() {
                // Glow ANTES del relleno para que el nodo ilumine de verdad.
                ctx.shadowBlur = 12;
                ctx.shadowColor = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        const initParticles = () => {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 1) Actualizar posiciones
            for (let i = 0; i < particles.length; i++) particles[i].update();

            // 2) LÍNEAS DE UNIÓN — degradado entre los colores de los dos nodos.
            //    Metáfora: Brokergy une piezas distintas en una sola red.
            ctx.shadowBlur = 0;
            for (let i = 0; i < particles.length; i++) {
                const pi = particles[i];
                for (let j = i + 1; j < particles.length; j++) {
                    const pj = particles[j];
                    const distance = Math.hypot(pi.x - pj.x, pi.y - pj.y);
                    if (distance >= connectionDistance) continue;

                    const strength = 1 - distance / connectionDistance;
                    const grad = ctx.createLinearGradient(pi.x, pi.y, pj.x, pj.y);
                    grad.addColorStop(0, pi.color);
                    grad.addColorStop(1, pj.color);
                    ctx.strokeStyle = grad;
                    ctx.globalAlpha = strength * 0.55;          // antes 0.15 → ahora se ven
                    ctx.lineWidth = 1 + strength * 0.8;
                    ctx.beginPath();
                    ctx.moveTo(pi.x, pi.y);
                    ctx.lineTo(pj.x, pj.y);
                    ctx.stroke();

                    // Sembrar un pulso de "energía" en conexiones fuertes, de tanto en tanto.
                    if (strength > 0.55 && pulses.length < MAX_PULSES && Math.random() > 0.9993) {
                        pulses.push({ i, j, t: 0, speed: 0.012 + Math.random() * 0.02,
                            color: Math.random() > 0.5 ? pi.color : pj.color });
                    }
                }
            }
            ctx.globalAlpha = 1;

            // 3) CONSTELACIÓN CON EL CURSOR — el usuario "conecta" las piezas cercanas.
            if (mouse.x != null) {
                for (let i = 0; i < particles.length; i++) {
                    const pi = particles[i];
                    const d = Math.hypot(mouse.x - pi.x, mouse.y - pi.y);
                    if (d >= mouseRadius) continue;
                    const strength = 1 - d / mouseRadius;
                    ctx.strokeStyle = pi.color;
                    ctx.globalAlpha = strength * 0.5;
                    ctx.lineWidth = 1 + strength;
                    ctx.beginPath();
                    ctx.moveTo(mouse.x, mouse.y);
                    ctx.lineTo(pi.x, pi.y);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }

            // 4) NODOS (con brillo, por encima de las líneas)
            for (let i = 0; i < particles.length; i++) particles[i].draw();

            // 5) PULSOS DE ENERGÍA viajando por las conexiones (aparecen/desaparecen suave)
            ctx.shadowBlur = 12;
            for (let k = pulses.length - 1; k >= 0; k--) {
                const p = pulses[k];
                p.t += p.speed;
                if (p.t >= 1) { pulses.splice(k, 1); continue; }
                const a = particles[p.i], b = particles[p.j];
                const x = a.x + (b.x - a.x) * p.t;
                const y = a.y + (b.y - a.y) * p.t;
                ctx.shadowColor = p.color;
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.sin(p.t * Math.PI);
                ctx.beginPath();
                ctx.arc(x, y, 2.6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            animationFrameId = requestAnimationFrame(draw);
        };

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.x;
            mouse.y = e.y;
        });
        window.addEventListener('mouseleave', () => {
            mouse.x = null;
            mouse.y = null;
        });

        resize();
        draw();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resize);
        };
    }, [color]);

    return (
        <>
            <canvas
                ref={canvasRef}
                className="fixed inset-0 z-0 pointer-events-none bg-bkg-base"
                style={{ filter: 'contrast(120%) brightness(110%)' }}
            />
            {/* Capas de profundidad con gradientes para suavizar los bordes del canvas */}
            <div className="fixed inset-0 z-1 pointer-events-none shadow-[inset_0_0_150px_rgba(8,9,12,0.9)]"></div>
            <div className="fixed inset-0 z-1 pointer-events-none bg-gradient-to-b from-bkg-base/40 via-transparent to-bkg-base/40"></div>
        </>
    );
};
