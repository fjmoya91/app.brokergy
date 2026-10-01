"""
cee_inicial_plano.py — el plano de las PAREDES encima de la cartografía del
Catastro, en una imagen, para poder decir qué foto es de qué fachada.

    python cee_inicial_plano.py <geometria.json> <fondo> <salida.png> [trabajo.json]
                                [--foto foto.png]

Lo llama `cee_inicial.js paredes` (skill `generar-cee-inicial`). Es la misma
vista que la ventana de la envolvente —el plano sobre la cartografía— pero en
un PNG que se puede mirar sin navegador: la foto de la fachada dice «la puerta,
dos ventanas y el garaje», y el plano dice que esa fachada es FBN3 porque es la
que da a la calle con ese largo.

El FONDO puede ser de dos clases, igual que en la ventana:
  · un PNG (la cartografía del Catastro, pedida para el rectángulo del motor);
  · un `.json` con las teselas de la ORTOFOTO del PNOA ya descargadas y
    colocadas en el lienzo (lo escribe `cee_inicial.js`, con `teselasOrtofoto`
    de `logic/ortofoto.js` — la rejilla NO se repite aquí). Entonces se compone
    la foto aérea del rectángulo y, con `--foto`, se guarda también SIN las
    paredes encima: para leer un tejado, las rayas estorban.

Las coordenadas NO se reinventan: el motor dibuja en un LIENZO (el mundo
trasladado y con la Y del revés) y dice en `georef` en qué rectángulo del mundo
lo hizo; la cartografía se pide para ESE rectángulo, así que un punto del lienzo
cae en el píxel `(x - en.x) / en.ancho * W`. Es la misma cuenta que
`lienzoAMundo` en geometriaPlano.js.
"""
import json
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover - sin Pillow no hay imagen, y se dice
    print("NO_PIL: instala Pillow (pip install pillow) para dibujar el plano")
    sys.exit(2)

COLOR = {
    "FACHADA": (230, 120, 20),
    "MEDIANERA": (40, 110, 220),
    "PARTICION_VERTICAL": (220, 60, 160),
    "PARTICION_INTERIOR_VERTICAL": (220, 60, 160),
}


def fuente(tam):
    for f in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(f, tam)
        except OSError:
            continue
    return ImageFont.load_default()


#: El lado mayor de la foto aérea compuesta. El mismo orden que la cartografía
#: (`getWmsImage`, 1600): los rótulos tienen que leerse igual en las dos.
LADO_FOTO = 1600


def componer_ortofoto(manifiesto, en):
    """La foto aérea del rectángulo `en` (el del lienzo), con sus teselas.

    Cada tesela viene ya colocada EN EL LIENZO (x, y, ancho, alto en metros), así
    que un punto cae en el píxel `(x - en.x) / en.ancho * W`: la misma cuenta que
    las paredes. Una tesela que no se descargó deja su hueco en gris y se dice.
    """
    k = LADO_FOTO / max(en["ancho"], en["alto"])
    W, H = max(1, round(en["ancho"] * k)), max(1, round(en["alto"] * k))
    img = Image.new("RGB", (W, H), (128, 128, 128))
    for t in manifiesto.get("teselas") or []:
        archivo = t.get("archivo")
        if not archivo:
            continue
        try:
            tes = Image.open(archivo).convert("RGB")
        except OSError:
            continue
        izq = (t["x"] - en["x"]) * k
        arr = (t["y"] - en["y"]) * k
        # Redondeando los DOS bordes, y no el origen y el tamaño por separado:
        # así dos teselas vecinas comparten píxel y no queda una rendija.
        x0, y0 = round(izq), round(arr)
        x1, y1 = round(izq + t["ancho"] * k), round(arr + t["alto"] * k)
        if x1 <= x0 or y1 <= y0:
            continue
        img.paste(tes.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))
    return img


def main():
    args = sys.argv[1:]
    foto_sola = None
    if "--foto" in args:
        i = args.index("--foto")
        foto_sola = args[i + 1]
        del args[i:i + 2]
    geo = json.load(open(args[0], encoding="utf-8"))
    salida = args[2]
    trabajo = json.load(open(args[3], encoding="utf-8")) if len(args) > 3 else {}
    huecos = (trabajo or {}).get("huecos") or {}

    en = (geo.get("georef") or {}).get("en_el_lienzo") or {}
    if not en:
        print("SIN_GEOREF: el motor no ha dicho en qué rectángulo dibujó")
        sys.exit(3)

    manifiesto = None
    if args[1].lower().endswith(".json"):
        manifiesto = json.load(open(args[1], encoding="utf-8"))
        img = componer_ortofoto(manifiesto, en)
        if foto_sola:
            img.save(foto_sola)
    else:
        img = Image.open(args[1]).convert("RGB")
    sobre_foto = manifiesto is not None

    W, H = img.size

    def px(p):
        return ((p[0] - en["x"]) / en["ancho"] * W, (p[1] - en["y"]) / en["alto"] * H)

    capa = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    f = fuente(max(14, W // 70))
    fp = fuente(max(11, W // 95))

    plantas = geo.get("plantas") or []
    # La planta más baja se dibuja la última: es la que se mira para la calle.
    for i, p in enumerate(sorted(plantas, key=lambda q: -(q.get("nivel") or 0))):
        baja = (p.get("nivel") or 0) == min((q.get("nivel") or 0) for q in plantas)
        for m in p.get("muros") or []:
            pts = [px(q) for q in (m.get("svg") or [])]
            if len(pts) < 2:
                continue
            c = COLOR.get(m.get("tipo"), (120, 120, 120))
            alfa = 255 if baja else 150
            ancho = max(4, W // 260) if baja else 3
            # Sobre la foto, un halo oscuro debajo: una fachada NARANJA encima
            # de un tejado de teja naranja no se distingue de él.
            if sobre_foto:
                d.line(pts, fill=(15, 15, 15, 200 if baja else 120), width=ancho + 4)
            d.line(pts, fill=c + (alfa,), width=ancho)
            # El rótulo, apartado hacia FUERA del edificio por la mitad del muro.
            mx = sum(q[0] for q in pts) / len(pts)
            my = sum(q[1] for q in pts) / len(pts)
            n = len(huecos.get(m["id"]) or [])
            texto = f"{m['id']} {m.get('orientacion') or ''} {float(m.get('largo') or 0):.1f}m"
            if n:
                texto += f" · {n}h"
            off = 0 if baja else fp.size + 4
            caja = d.textbbox((mx, my + off), texto, font=fp if not baja else f)
            d.rectangle([caja[0] - 3, caja[1] - 2, caja[2] + 3, caja[3] + 2],
                        fill=(255, 255, 255, 215))
            d.text((mx, my + off), texto, fill=c + (255,), font=fp if not baja else f)

    # Las ZONAS que no cuentan (garaje, porche…), que el trabajo guarda en el
    # MUNDO: se pasan al lienzo con la misma traslación que `lienzoAMundo`.
    bb = (geo.get("georef") or {}).get("bbox")
    if bb:
        dx, y0 = bb[0] - en["x"], bb[3] + en["y"]
        for z in (trabajo or {}).get("zonas_fuera") or []:
            pts = [px((x - dx, y0 - y)) for x, y in z.get("poligono") or []]
            if len(pts) < 3:
                continue
            color = (40, 170, 90) if z.get("uso") == "PORCHE" else (150, 90, 200)
            d.polygon(pts, fill=color + (70,), outline=color + (255,))
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            txt = f"{z.get('uso')} PB {z.get('area_m2', '')} m2"
            caja = d.textbbox((cx, cy), txt, font=fp)
            d.rectangle([caja[0] - 3, caja[1] - 2, caja[2] + 3, caja[3] + 2], fill=(255, 255, 255, 215))
            d.text((cx, cy), txt, fill=color + (255,), font=fp)

    # Norte arriba (el lienzo tiene la Y del revés: arriba es el norte).
    # Sobre un papel claro que no se vea no pasa nada; sobre la foto, una flecha
    # negra encima de un tejado oscuro desaparece. Va sobre su propia placa.
    d.rectangle([W - 72, 22, W - 18, 78 + f.size + 6], fill=(255, 255, 255, 215))
    d.polygon([(W - 60, 70), (W - 45, 30), (W - 30, 70)], fill=(20, 20, 20, 230))
    d.text((W - 52, 72), "N", fill=(20, 20, 20, 255), font=f)

    ley = ["Naranja: fachada · Azul: medianera · Rosa: partición",
           "Rótulo grande: planta baja · pequeño y apartado: plantas de arriba",
           "«Nh»: huecos ya puestos en esa pared"]
    if sobre_foto:
        # De CUÁNDO es la foto: una anterior a la obra enseña otra casa.
        vuelo = manifiesto.get("vuelo") or {}
        ley.append(f"Ortofoto PNOA © IGN · {vuelo.get('texto') or 'fecha del vuelo desconocida'}"
                   + (f" · {vuelo['resolucion']} m/píxel" if vuelo.get("resolucion") else ""))
        if manifiesto.get("fallidas"):
            ley.append(f"⚠ {manifiesto['fallidas']} tesela(s) sin descargar (gris)")
    y = 12
    for linea in ley:
        caja = d.textbbox((12, y), linea, font=fp)
        d.rectangle([caja[0] - 4, caja[1] - 2, caja[2] + 4, caja[3] + 2], fill=(255, 255, 255, 220))
        d.text((12, y), linea, fill=(30, 30, 30, 255), font=fp)
        y = caja[3] + 6

    Image.alpha_composite(img.convert("RGBA"), capa).convert("RGB").save(salida)
    print(salida)


if __name__ == "__main__":
    main()
