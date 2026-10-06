"""
cee_inicial_video.py — los FOTOGRAMAS de un vídeo de la vivienda.

    python cee_inicial_video.py probe      <video>
    python cee_inicial_video.py hoja       <video> <salida.jpg> [--n 30] [--cols 6]
    python cee_inicial_video.py fotogramas <video> <pedidos.json> <carpeta>
    python cee_inicial_video.py mosaico    <fotogramas.json> <salida.jpg> [--cols 4]

Lo llama `cee_inicial.js video` (skill `generar-cee-inicial`). El modelo que
mira el vídeo (`services/videoEnvolventeService.js`) dice EN QUÉ SEGUNDO se ve
cada ventana; esto saca ese fotograma, que es lo que mira una persona para
comprobarlo y lo que se pega al hueco en la ventana de la envolvente.

REGLAS
------
* De cada segundo pedido se saca el fotograma MÁS NÍTIDO de ±0,7 s (varianza
  del laplaciano). Un vídeo de móvil andando por la casa va movido la mitad del
  tiempo, y el segundo que da el modelo es aproximado: el fotograma exacto de
  ese segundo suele ser un borrón y el de medio segundo después, nítido.
* Los fotogramas salen a la RESOLUCIÓN DEL VÍDEO y GIRADOS como se ve en el
  móvil (OpenCV aplica la orientación de la cabecera; ffmpeg también).
* Dos motores, y se dice cuál se usó: OpenCV (`cv2`, el del PC) o, si no está,
  el ejecutable `ffmpeg` (el del contenedor del asistente) con Pillow para medir
  la nitidez y componer. Sin ninguno de los dos, se dice y se sale con 2.

Imprime JSON por la salida estándar; los avisos van a la de error.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception:  # pragma: no cover - el contenedor del asistente no lo tiene
    cv2 = None
    np = None

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat
except ImportError:  # pragma: no cover
    Image = None

FFMPEG = shutil.which("ffmpeg")

#: Medio ancho de la ventana en la que se busca el fotograma más nítido.
VENTANA_S = 0.7
#: Cuántos fotogramas se prueban dentro de esa ventana.
CANDIDATOS = 9


def motor():
    if cv2 is not None:
        return "opencv"
    if FFMPEG and Image is not None:
        return "ffmpeg"
    return None


def salir_sin_motor():
    print(json.dumps({"error": "NO_MOTOR: hace falta OpenCV (pip install opencv-python) "
                               "o el ejecutable ffmpeg con Pillow para sacar fotogramas."}))
    sys.exit(2)


def tiene_audio(ruta):
    """¿Lleva pista de sonido? Se mira el `hdlr` de las cajas MP4/QuickTime.

    Importa porque al modelo se le pide lo que DICE quien graba: si el vídeo no
    tiene sonido y se le deja preguntar, se lo inventa. None = no se sabe.
    """
    if not re.search(r"\.(mp4|m4v|mov|qt|3gp)$", ruta, re.I):
        return None
    try:
        with open(ruta, "rb") as f:
            datos = f.read()
    except OSError:
        return None
    tipos = set(m.group(1) for m in re.finditer(rb"hdlr.{8}(vide|soun)", datos, re.S))
    if not tipos:
        return None
    return b"soun" in tipos


def fuente(tam):
    if Image is None:
        return None
    for f in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(f, tam)
        except OSError:
            continue
    return ImageFont.load_default()


def mmss(t):
    t = max(0.0, float(t))
    return "%d:%04.1f" % (t // 60, t % 60)


# ── OpenCV ──────────────────────────────────────────────────────────────────

def cv_probe(ruta):
    c = cv2.VideoCapture(ruta)
    if not c.isOpened():
        return None
    fps = c.get(cv2.CAP_PROP_FPS) or 0
    n = c.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    ok, fr = c.read()
    c.release()
    if not ok:
        return None
    alto, ancho = fr.shape[:2]
    return {"duracion_s": round(n / fps, 2) if fps else None, "fps": round(fps, 2),
            "ancho": int(ancho), "alto": int(alto)}


def cv_leer(c, t):
    c.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t) * 1000.0)
    ok, fr = c.read()
    return fr if ok else None


def nitidez_cv(fr):
    gris = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
    # Se mide sobre una copia reducida: el ruido del sensor no es nitidez.
    h, w = gris.shape[:2]
    escala = 640.0 / max(h, w)
    if escala < 1:
        gris = cv2.resize(gris, (int(w * escala), int(h * escala)))
    return float(cv2.Laplacian(gris, cv2.CV_64F).var())


# ── ffmpeg ──────────────────────────────────────────────────────────────────

def ff_probe(ruta):
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", ruta], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    txt = r.stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", txt)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None
    v = re.search(r"Video: .*?, (\d{2,5})x(\d{2,5})", txt)
    f = re.search(r"(\d+(?:\.\d+)?) fps", txt)
    ancho, alto = (int(v.group(1)), int(v.group(2))) if v else (None, None)
    # ffmpeg informa del tamaño SIN girar; si la cabecera dice 90/270, se cruzan.
    if re.search(r"rotate\s*:\s*-?(90|270)|rotation of -?(90|270)", txt) and ancho:
        ancho, alto = alto, ancho
    return {"duracion_s": round(dur, 2) if dur else None,
            "fps": float(f.group(1)) if f else None, "ancho": ancho, "alto": alto}


def ff_leer(ruta, t, dest):
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", "%.3f" % max(0.0, t),
                    "-i", ruta, "-frames:v", "1", "-q:v", "2", dest],
                   capture_output=True)
    return dest if os.path.exists(dest) and os.path.getsize(dest) > 0 else None


def nitidez_pil(img):
    g = img.convert("L")
    g.thumbnail((640, 640))
    return float(ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).var[0])


# ── Órdenes ─────────────────────────────────────────────────────────────────

def probe(ruta):
    m = motor()
    if not m:
        salir_sin_motor()
    datos = cv_probe(ruta) if m == "opencv" else ff_probe(ruta)
    if not datos:
        print(json.dumps({"error": "NO_SE_ABRE: el vídeo no se puede leer (¿formato o fichero roto?)"}))
        sys.exit(3)
    datos["audio"] = tiene_audio(ruta)
    datos["motor"] = m
    print(json.dumps(datos))


def tiempos_hoja(dur, n):
    return [dur * (i + 0.5) / n for i in range(n)]


def hoja(ruta, salida, n=30, cols=6):
    """Una hoja de contactos: N fotogramas repartidos, con su minuto encima.

    Es para MIRAR el vídeo entero de un vistazo y contrastar la lectura del
    modelo: si dice que la ventana del salón está en el 0:35, se ve si es así.
    """
    m = motor()
    if not m:
        salir_sin_motor()
    datos = cv_probe(ruta) if m == "opencv" else ff_probe(ruta)
    dur = (datos or {}).get("duracion_s") or 0
    if not dur:
        print(json.dumps({"error": "SIN_DURACION"}))
        sys.exit(3)
    lado = 300
    teselas = []
    if m == "opencv":
        c = cv2.VideoCapture(ruta)
        for t in tiempos_hoja(dur, n):
            fr = cv_leer(c, t)
            if fr is None:
                continue
            h, w = fr.shape[:2]
            esc = lado / float(max(h, w))
            fr = cv2.resize(fr, (int(w * esc), int(h * esc)))
            img = Image.fromarray(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)) if Image else None
            teselas.append((t, img))
        c.release()
    else:
        tmp = tempfile.mkdtemp()
        for i, t in enumerate(tiempos_hoja(dur, n)):
            f = ff_leer(ruta, t, os.path.join(tmp, "h%03d.jpg" % i))
            if not f:
                continue
            img = Image.open(f).convert("RGB")
            img.thumbnail((lado, lado))
            teselas.append((t, img))
        shutil.rmtree(tmp, ignore_errors=True)
    if not teselas:
        print(json.dumps({"error": "SIN_FOTOGRAMAS"}))
        sys.exit(3)
    componer([(img, mmss(t)) for t, img in teselas], salida, cols)
    print(json.dumps({"hoja": salida, "fotogramas": len(teselas), "duracion_s": dur}))


def componer(teselas, salida, cols, lado=300):
    """Pega las teselas en una rejilla, cada una con su rótulo arriba a la izquierda."""
    ancho = max(img.width for img, _ in teselas)
    alto = max(img.height for img, _ in teselas)
    filas = (len(teselas) + cols - 1) // cols
    lienzo = Image.new("RGB", (cols * ancho, filas * alto), (20, 20, 20))
    letra = fuente(max(13, ancho // 20))
    d = ImageDraw.Draw(lienzo, "RGBA")
    for i, (img, rotulo) in enumerate(teselas):
        x, y = (i % cols) * ancho, (i // cols) * alto
        lienzo.paste(img, (x, y))
        # El rótulo, en una banda oscura y SIN salirse de su casilla: con el
        # texto encima de la foto de al lado no se sabe de qué hueco es cada uno.
        lineas = str(rotulo or "").split("|")
        alto_l = letra.getbbox("Hg")[3] + 4 if hasattr(letra, "getbbox") else 16
        d.rectangle([x, y, x + ancho - 1, y + alto_l * len(lineas) + 6], fill=(0, 0, 0, 170))
        for k, linea in enumerate(lineas):
            while linea and hasattr(d, "textlength") and d.textlength(linea, font=letra) > ancho - 10:
                linea = linea[:-1]
            d.text((x + 5, y + 3 + k * alto_l), linea, font=letra, fill=(255, 255, 255))
    lienzo.save(salida, quality=82)


def fotogramas(ruta, pedidos_json, carpeta):
    """De cada pedido {clave, t} saca el fotograma más nítido de ±0,7 s."""
    m = motor()
    if not m:
        salir_sin_motor()
    with open(pedidos_json, encoding="utf-8") as f:
        pedidos = json.load(f)
    os.makedirs(carpeta, exist_ok=True)
    salida = []
    if m == "opencv":
        c = cv2.VideoCapture(ruta)
        for p in pedidos:
            t0 = float(p["t"])
            mejor = None
            for k in range(CANDIDATOS):
                t = t0 - VENTANA_S + 2 * VENTANA_S * k / (CANDIDATOS - 1)
                if t < 0:
                    continue
                fr = cv_leer(c, t)
                if fr is None:
                    continue
                n = nitidez_cv(fr)
                if mejor is None or n > mejor[0]:
                    mejor = (n, t, fr)
            if mejor is None:
                salida.append({"clave": p["clave"], "error": "no se ha podido leer ese momento"})
                continue
            dest = os.path.join(carpeta, "%s.jpg" % p["clave"])
            cv2.imwrite(dest, mejor[2], [cv2.IMWRITE_JPEG_QUALITY, 92])
            h, w = mejor[2].shape[:2]
            salida.append({"clave": p["clave"], "t_pedido": t0, "t": round(mejor[1], 2),
                           "nitidez": round(mejor[0], 1), "archivo": dest, "ancho": w, "alto": h})
        c.release()
    else:
        tmp = tempfile.mkdtemp()
        for p in pedidos:
            t0 = float(p["t"])
            mejor = None
            for k in range(5):
                t = t0 - VENTANA_S + 2 * VENTANA_S * k / 4
                if t < 0:
                    continue
                f = ff_leer(ruta, t, os.path.join(tmp, "%s_%d.jpg" % (p["clave"], k)))
                if not f:
                    continue
                img = Image.open(f)
                n = nitidez_pil(img)
                if mejor is None or n > mejor[0]:
                    mejor = (n, t, f, img.size)
            if mejor is None:
                salida.append({"clave": p["clave"], "error": "no se ha podido leer ese momento"})
                continue
            dest = os.path.join(carpeta, "%s.jpg" % p["clave"])
            shutil.copyfile(mejor[2], dest)
            salida.append({"clave": p["clave"], "t_pedido": t0, "t": round(mejor[1], 2),
                           "nitidez": round(mejor[0], 1), "archivo": dest,
                           "ancho": mejor[3][0], "alto": mejor[3][1]})
        shutil.rmtree(tmp, ignore_errors=True)
    print(json.dumps({"motor": m, "fotogramas": salida}))


def mosaico(fotogramas_json, salida, cols=4):
    """Todos los fotogramas sacados, rotulados («H3 · 0:35 · P1 · dormitorio»),
    en una imagen: para repasar de una vez lo que propone la lectura."""
    if Image is None:
        print(json.dumps({"error": "NO_PIL"}))
        sys.exit(2)
    with open(fotogramas_json, encoding="utf-8") as f:
        lista = json.load(f)
    teselas = []
    for it in lista:
        try:
            img = Image.open(it["archivo"]).convert("RGB")
        except (OSError, KeyError):
            continue
        img.thumbnail((360, 360))
        fondo = Image.new("RGB", (360, 360), (20, 20, 20))
        fondo.paste(img, ((360 - img.width) // 2, (360 - img.height) // 2))
        teselas.append((fondo, it.get("rotulo") or it.get("clave")))
    if not teselas:
        print(json.dumps({"error": "SIN_FOTOGRAMAS"}))
        sys.exit(3)
    componer(teselas, salida, cols)
    print(json.dumps({"mosaico": salida, "teselas": len(teselas)}))


def opcion(nombre, defecto):
    if nombre in sys.argv:
        i = sys.argv.index(nombre)
        try:
            return int(sys.argv[i + 1])
        except (IndexError, ValueError):
            return defecto
    return defecto


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    orden = sys.argv[1]
    if orden == "probe":
        probe(sys.argv[2])
    elif orden == "hoja":
        hoja(sys.argv[2], sys.argv[3], opcion("--n", 30), opcion("--cols", 6))
    elif orden == "fotogramas":
        fotogramas(sys.argv[2], sys.argv[3], sys.argv[4])
    elif orden == "mosaico":
        mosaico(sys.argv[2], sys.argv[3], opcion("--cols", 4))
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
