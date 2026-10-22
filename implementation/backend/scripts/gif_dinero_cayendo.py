# Tira animada (GIF) de monedas y billetes cayendo para el email de la carta de pago.
# Uso (con Pillow): python gif_dinero_cayendo.py <salida.gif> 1.5 600 96   (escala, ancho y alto en px de email)
# La salida va a plantillas/email_carta_pago/ Y a frontend/public/email/carta-pago/ (las dos IGUALES).
# Va de FONDO de la cabecera (logo + nº de carta), 600x96 de email. Medido el 22/10/2026: 900x144 a 1,5x, fondo TRANSPARENTE.
import math, random, sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
ESC = float(sys.argv[2]) if len(sys.argv) > 2 else 1.5      # 1,5 = nítido en retina
ANCHO, ALTO = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (600, 96)
W, H = int(ANCHO * ESC), int(ALTO * ESC)
N = 32                     # fotogramas del bucle
DELAY = 60                 # ms por fotograma
SS = 3                     # superesmuestreo de cada sprite (bordes suaves)
FONT = 'C:/Windows/Fonts/arialbd.ttf'

ORO, ORO_CLARO, ORO_BORDE, ORO_TINTA = (255, 160, 0), (255, 196, 64), (196, 118, 0), (140, 84, 0)
VERDE, VERDE_CLARO, VERDE_BORDE, VERDE_TINTA = (177, 209, 62), (214, 236, 128), (112, 140, 24), (64, 86, 10)


def moneda(r, ancho):
    """Moneda de radio r vista con un giro: `ancho` (0-1) estrecha el eje x."""
    s = int(r * 2 * SS) + 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = s / 2
    R = r * SS
    d.ellipse([c - R, c - R, c + R, c + R], fill=ORO_BORDE)
    d.ellipse([c - R * .86, c - R * .86, c + R * .86, c + R * .86], fill=ORO)
    d.ellipse([c - R * .62, c - R * .62, c + R * .62, c + R * .62], fill=ORO_CLARO)
    f = ImageFont.truetype(FONT, int(R * 1.0))
    d.text((c, c + R * .04), '€', font=f, fill=ORO_TINTA, anchor='mm')
    nx = max(2, int(s * max(ancho, .12)))
    img = img.resize((nx, s), Image.LANCZOS)
    lienzo = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    lienzo.paste(img, ((s - nx) // 2, 0), img)
    return lienzo.resize((s // SS, s // SS), Image.LANCZOS)


def billete(w, h, angulo):
    s = int(max(w, h) * 1.6 * SS)
    img = Image.new('RGBA', (int(w * SS), int(h * SS)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    W2, H2 = w * SS, h * SS
    rr = int(H2 * .14)
    d.rounded_rectangle([0, 0, W2 - 1, H2 - 1], radius=rr, fill=VERDE_BORDE)
    m = H2 * .08
    d.rounded_rectangle([m, m, W2 - 1 - m, H2 - 1 - m], radius=rr * .7, fill=VERDE)
    cr = H2 * .3
    d.ellipse([W2 / 2 - cr, H2 / 2 - cr, W2 / 2 + cr, H2 / 2 + cr], fill=VERDE_CLARO)
    f = ImageFont.truetype(FONT, int(H2 * .42))
    d.text((W2 / 2, H2 / 2 + H2 * .02), '€', font=f, fill=VERDE_TINTA, anchor='mm')
    f2 = ImageFont.truetype(FONT, int(H2 * .2))
    for x, y in ((m * 2.2, m * 1.6), (W2 - m * 2.2, H2 - m * 1.6)):
        d.text((x, y), '€', font=f2, fill=VERDE_TINTA, anchor='mm')
    img = img.rotate(angulo, resample=Image.BICUBIC, expand=True)
    return img.resize((max(1, img.width // SS), max(1, img.height // SS)), Image.LANCZOS)


random.seed(36)
piezas = []
# Repartidas a lo ancho por carriles, para que el primer fotograma (Outlook) se vea lleno.
carriles = round(15 * ANCHO / 520)
for i in range(carriles):
    es_billete = i % 3 == 1
    tam = (random.uniform(26, 34) if es_billete else random.uniform(9, 13)) * ESC
    piezas.append({
        'billete': es_billete,
        'tam': tam,
        'x': (i + .5) * W / carriles + random.uniform(-.25, .25) * W / carriles,
        'fase': (i * 0.618 + 0.07) % 1,          # dónde está al empezar: repartido (proporción áurea)
        'vueltas': random.choice([1, 1, 2]),     # recorridos completos por bucle (entero: bucle continuo)
        'giro': random.choice([-1, 1]) * random.choice([1, 2]),
        'balanceo': random.uniform(4, 9) * ESC,
        'phi': random.uniform(-0.6, 0.6),        # monedas DE CARA en el primer fotograma (Outlook no anima)
        'ang0': random.uniform(-30, 30),
    })
# Primero lo que cae despacio (detrás), luego lo rápido.
piezas.sort(key=lambda p: p['vueltas'])

# FONDO TRANSPARENTE (22/10/2026): en modo oscuro el cliente de correo oscurece el email
# pero NO las imágenes, y una tira con fondo blanco salía como un rectángulo blanco. El GIF
# solo tiene transparencia de 1 bit: el borde suavizado se corta al 50 % y se queda con el
# color del PROPIO canto (no mezclado con blanco), así no hay halo ni en blanco ni en negro.
CLAVE = (255, 0, 255)      # color reservado para «transparente»
frames, rgbas = [], []
for t in range(N):
    u = t / N
    fr = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for p in piezas:
        alto = p['tam'] * (0.6 if p['billete'] else 2)
        recorrido = H + alto * 2
        y = ((p['fase'] + p['vueltas'] * u) % 1) * recorrido - alto
        x = p['x'] + p['balanceo'] * math.sin(2 * math.pi * u + p['phi'])
        if p['billete']:
            ang = p['ang0'] + 22 * math.sin(2 * math.pi * (u * p['giro']) + p['phi'])
            spr = billete(p['tam'] * 2, p['tam'] * 1.05, ang)
        else:
            spr = moneda(p['tam'], abs(math.cos(math.pi * p['giro'] * u + p['phi'])))
        fr.alpha_composite(spr, (int(x - spr.width / 2), int(y - spr.height / 2)))
    rgbas.append(fr)
    fondo = Image.new('RGB', (W, H), CLAVE)
    fondo.paste(fr.convert('RGB'), (0, 0), fr.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    frames.append(fondo)

# Paleta común sacada de varios fotogramas (con la clave dentro), y su índice transparente.
muestra = Image.new('RGB', (W, H * 4))
for k, i in enumerate((0, N // 4, N // 2, 3 * N // 4)):
    muestra.paste(frames[i], (0, H * k))
paleta = muestra.quantize(colors=48, method=Image.Quantize.MEDIANCUT)
pal = paleta.getpalette()[:48 * 3]
itrans = min(range(48), key=lambda i: sum((pal[i * 3 + c] - CLAVE[c]) ** 2 for c in range(3)))
q = [f.quantize(palette=paleta, dither=Image.Dither.NONE) for f in frames]
# disposal=2: cada fotograma se pinta sobre el fondo limpio (si no, se arrastran los anteriores).
q[0].save(OUT, save_all=True, append_images=q[1:], duration=DELAY, loop=0, optimize=False,
          disposal=2, transparency=itrans)
import os
print(f'{OUT}: {W}x{H}, {N} fotogramas, {os.path.getsize(OUT) / 1024:.0f} KB, transparente = índice {itrans} {tuple(pal[itrans*3:itrans*3+3])}')
