import React, { useEffect, useRef } from 'react';

// Convierte un hex (#RRGGBB) a {r,g,b}. Devuelve null si no es válido.
const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
};

// `color` (opcional): hex del partner para teñir nodos y líneas en la landing
// white-label. Sin color → comportamiento por defecto (ámbar + azul Brokergy).
export const DynamicNetworkBackground = ({ color = null }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let particles = [];
        const particleCount = 60;
        const connectionDistance = 150;
        const mouseRadius = 200;

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
                this.size = Math.random() * 2 + 1;
                this.baseX = this.x;
                this.baseY = this.y;
                this.dx = (Math.random() - 0.5) * 0.8;
                this.dy = (Math.random() - 0.5) * 0.8;
                this.color = nodeColor
                    ? (Math.random() > 0.8 ? '#FFFFFF' : nodeColor)
                    : (Math.random() > 0.85 ? '#29B6F6' : '#FFA000');
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
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();

                // Brillo del nodo
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.color;
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
            ctx.shadowBlur = 0; // Reset shadow for lines

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        // El color de la línea es un degradado entre los dos nodos
                        const opacity = 1 - (distance / connectionDistance);
                        ctx.strokeStyle = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${opacity * 0.15})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();

                        // Pequeño pulso de luz ocasional en la conexión
                        if (Math.random() > 0.9995) {
                            // Aquí se podría animar un pulso, pero simplificamos por rendimiento
                        }
                    }
                }
            }

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
