"""
cee_inicial_video.py — los FOTOGRAMAS de un vídeo de la vivienda.

    python cee_inicial_video.py probe      <video>
    python cee_inicial_video.py hoja       <video> <salida.jpg> [--n 30] [--cols 6] [--subtitulos s.json]
    python cee_inicial_video.py fotogramas <video> <pedidos.json> <carpeta>
    python cee_inicial_video.py mosaico    <fotogramas.json> <salida.jpg> [--cols 4]
    python cee_inicial_video.py audio      <video> <salida.aac>

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
* El AUDIO se saca APARTE (`audio`, 2026-10-09): lo que dice quien graba («este
  es el patio de luces, con las ventanas de los dos baños») es lo que dice A QUÉ
  da cada ventana cuando la imagen no lo deja ver. Con `ffmpeg` se copia la pista
  tal cual; sin él (el PC no lo tiene) se saca la pista AAC del propio MP4/MOV
  —el formato de los vídeos de móvil y de WhatsApp— y se escribe en ADTS, que es
  un `.aac` que Gemini lee. Nada se recodifica: el sonido es el del vídeo.

Imprime JSON por la salida estándar; los avisos van a la de error.
"""
import json
import os
import re
import shutil
import struct
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


def dicho_en(subtitulos, t):
    """Lo que se está diciendo en el segundo `t` (o justo antes): el subtítulo
    de esa tesela. Una frase se oye mientras se enseña lo que nombra, o un poco
    antes («y ahora el patio…» y luego se gira): por eso se mira hasta 2 s atrás."""
    if not subtitulos:
        return None
    for s in subtitulos:
        t0, t1 = float(s.get("t") or 0), float(s.get("t_fin") or s.get("t") or 0)
        if t0 - 0.3 <= t <= max(t1, t0) + 0.5:
            return s.get("texto")
    previas = [s for s in subtitulos if 0 <= t - float(s.get("t") or 0) <= 2.0]
    return previas[-1].get("texto") if previas else None


def hoja(ruta, salida, n=30, cols=6, subtitulos=None):
    """Una hoja de contactos: N fotogramas repartidos, con su minuto encima.

    Es para MIRAR el vídeo entero de un vistazo y contrastar la lectura del
    modelo: si dice que la ventana del salón está en el 0:35, se ve si es así.
    Con `subtitulos` (la transcripción del audio, [{t, t_fin, texto}]) cada
    tesela lleva debajo lo que se DICE en ese momento: imagen y voz juntas.
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
    componer([(img, mmss(t), dicho_en(subtitulos, t)) for t, img in teselas], salida, cols)
    print(json.dumps({"hoja": salida, "fotogramas": len(teselas), "duracion_s": dur,
                      "con_subtitulos": bool(subtitulos)}))


def partir(d, texto, letra, ancho, max_lineas=3):
    """El texto en líneas que caben en `ancho`; si no cabe entero, la última acaba en «…»."""
    palabras = str(texto or "").split()
    lineas, actual = [], ""
    for p in palabras:
        prueba = (actual + " " + p).strip()
        if not actual or d.textlength(prueba, font=letra) <= ancho:
            actual = prueba
        else:
            lineas.append(actual)
            actual = p
    if actual:
        lineas.append(actual)
    if len(lineas) > max_lineas:
        lineas = lineas[:max_lineas]
        ultima = lineas[-1]
        while ultima and d.textlength(ultima + "…", font=letra) > ancho:
            ultima = ultima[:-1]
        lineas[-1] = ultima + "…"
    return lineas


def componer(teselas, salida, cols, lado=300):
    """Pega las teselas en una rejilla, cada una con su rótulo arriba a la
    izquierda y, si lo trae, su SUBTÍTULO abajo (lo que se dice en ese momento)."""
    teselas = [t if len(t) == 3 else (t[0], t[1], None) for t in teselas]
    ancho = max(img.width for img, _, _ in teselas)
    alto = max(img.height for img, _, _ in teselas)
    filas = (len(teselas) + cols - 1) // cols
    lienzo = Image.new("RGB", (cols * ancho, filas * alto), (20, 20, 20))
    letra = fuente(max(13, ancho // 20))
    letra_sub = fuente(max(12, ancho // 24))
    d = ImageDraw.Draw(lienzo, "RGBA")
    for i, (img, rotulo, sub) in enumerate(teselas):
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
        # El subtítulo, abajo y en amarillo (como en la tele): lo que se OYE.
        if sub and hasattr(d, "textlength"):
            sl = partir(d, "«%s»" % sub, letra_sub, ancho - 10)
            alto_s = letra_sub.getbbox("Hg")[3] + 3 if hasattr(letra_sub, "getbbox") else 15
            y0 = y + alto - alto_s * len(sl) - 8
            d.rectangle([x, y0, x + ancho - 1, y + alto - 1], fill=(0, 0, 0, 185))
            for k, linea in enumerate(sl):
                d.text((x + 5, y0 + 4 + k * alto_s), linea, font=letra_sub, fill=(255, 230, 90))
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
        teselas.append((fondo, it.get("rotulo") or it.get("clave"), it.get("dice")))
    if not teselas:
        print(json.dumps({"error": "SIN_FOTOGRAMAS"}))
        sys.exit(3)
    componer(teselas, salida, cols)
    print(json.dumps({"mosaico": salida, "teselas": len(teselas)}))


# ── El AUDIO ────────────────────────────────────────────────────────────────
#
# Sin `ffmpeg`, la pista de sonido se saca del propio contenedor MP4/MOV: se
# leen sus tablas (qué trozos del fichero son sonido y cuánto mide cada uno) y
# cada trozo AAC se escribe con su cabecera ADTS de 7 bytes. Es lo que hace
# `ffmpeg -acodec copy -f adts`, sin tocar el sonido. Un MP3 dentro del MP4 se
# copia tal cual (sus tramas ya llevan cabecera).

def _cajas(f, inicio, fin):
    """Las cajas («atoms») entre `inicio` y `fin`: (tipo, inicio de sus datos, fin)."""
    pos = inicio
    while pos + 8 <= fin:
        f.seek(pos)
        cab = f.read(8)
        if len(cab) < 8:
            return
        tam, tipo = struct.unpack(">I4s", cab)
        datos = pos + 8
        if tam == 1:
            tam = struct.unpack(">Q", f.read(8))[0]
            datos = pos + 16
        elif tam == 0:
            tam = fin - pos
        if tam < 8:
            return
        yield tipo, datos, min(pos + tam, fin)
        pos += tam


def _hija(f, ini, fin, tipo):
    for t, d, e in _cajas(f, ini, fin):
        if t == tipo:
            return d, e
    return None


def _leer(f, pos, n):
    f.seek(pos)
    return f.read(n)


def _descriptor(buf, i):
    """Un descriptor MPEG-4 del `esds`: (etiqueta, inicio de sus datos, largo)."""
    tag = buf[i]
    i += 1
    n = 0
    for _ in range(4):
        b = buf[i]
        i += 1
        n = (n << 7) | (b & 0x7F)
        if not b & 0x80:
            break
    return tag, i, n


def _config_esds(buf):
    """(tipo de objeto, AudioSpecificConfig) del `esds`; None si no se entiende."""
    try:
        tag, i, _ = _descriptor(buf, 4)          # 4 = versión y banderas
        if tag != 0x03:
            return None
        i += 2                                   # ES_ID
        banderas = buf[i]
        i += 1
        if banderas & 0x80:
            i += 2
        if banderas & 0x40:
            i += 1 + buf[i]
        if banderas & 0x20:
            i += 2
        tag, i, _ = _descriptor(buf, i)
        if tag != 0x04:
            return None
        oti = buf[i]
        i += 13                                  # DecoderConfigDescriptor fijo
        if i >= len(buf):
            return oti, b""
        tag, i, n = _descriptor(buf, i)
        return oti, (buf[i:i + n] if tag == 0x05 else b"")
    except IndexError:
        return None


def _pista_sonido(f, tam):
    """Las tablas de la pista de SONIDO del MP4/MOV, o un motivo si no se puede."""
    moov = _hija(f, 0, tam, b"moov")
    if not moov:
        return None, "el fichero no tiene la caja «moov» (¿no es MP4/MOV?)"
    for t, d, e in _cajas(f, *moov):
        if t != b"trak":
            continue
        mdia = _hija(f, d, e, b"mdia")
        hdlr = mdia and _hija(f, mdia[0], mdia[1], b"hdlr")
        if not hdlr or _leer(f, hdlr[0] + 8, 4) != b"soun":
            continue
        mdhd = _hija(f, mdia[0], mdia[1], b"mdhd")
        minf = _hija(f, mdia[0], mdia[1], b"minf")
        stbl = minf and _hija(f, minf[0], minf[1], b"stbl")
        if not stbl:
            return None, "la pista de sonido no tiene tablas («stbl»)"
        cajas = {tp: (a, b) for tp, a, b in _cajas(f, *stbl)}
        return {"mdhd": mdhd, **{k.decode("latin-1"): v for k, v in cajas.items()}}, None
    return None, "el vídeo no tiene pista de sonido"


def _u32s(f, caja, desde, n, ancho=4):
    datos = _leer(f, caja[0] + desde, n * ancho)
    return list(struct.unpack(">%d%s" % (n, "I" if ancho == 4 else "Q"), datos))


def extraer_audio_mp4(ruta, salida):
    """La pista AAC (o MP3) del MP4/MOV, sin recodificar. Devuelve el dict del resultado."""
    tam = os.path.getsize(ruta)
    with open(ruta, "rb") as f:
        p, motivo = _pista_sonido(f, tam)
        if not p:
            return {"error": motivo}
        if "stsd" not in p or "stsz" not in p or "stsc" not in p or not ("stco" in p or "co64" in p):
            return {"error": "a la pista de sonido le faltan tablas (stsd/stsz/stsc/stco)"}
        # stsd → la primera descripción: el códec y su configuración.
        ini = p["stsd"][0] + 8                   # versión+banderas, nº de entradas
        etam, codec = struct.unpack(">I4s", _leer(f, ini, 8))
        if codec != b"mp4a":
            return {"error": "el sonido va en %s y sin ffmpeg solo se saca AAC o MP3" % codec.decode("latin-1")}
        version_qt = struct.unpack(">H", _leer(f, ini + 16, 2))[0]
        hijos = ini + 8 + 28 + {1: 16, 2: 36}.get(version_qt, 0)
        esds = _hija(f, hijos, ini + etam, b"esds")
        if not esds:
            wave = _hija(f, hijos, ini + etam, b"wave")    # QuickTime lo mete dentro de «wave»
            esds = wave and _hija(f, wave[0], wave[1], b"esds")
        cfg = esds and _config_esds(_leer(f, esds[0], esds[1] - esds[0]))
        if not cfg:
            return {"error": "no se entiende la configuración del sonido («esds»)"}
        oti, asc = cfg
        es_mp3 = oti in (0x69, 0x6B)
        if not es_mp3:
            if len(asc) < 2:
                return {"error": "el AAC no trae su AudioSpecificConfig"}
            aot = asc[0] >> 3
            idx = ((asc[0] & 7) << 1) | (asc[1] >> 7)
            canales = (asc[1] >> 3) & 0x0F
            if aot in (5, 29):                   # HE-AAC: el núcleo es AAC-LC
                aot = 2
            if aot not in (1, 2, 3, 4) or idx > 12 or not 1 <= canales <= 7:
                return {"error": "AAC que no cabe en ADTS (tipo %d, frecuencia %d, canales %d)" % (aot, idx, canales)}
            perfil = aot - 1
        # Dónde está cada trozo: stsz (tamaños), stsc (trozos por bloque), stco/co64 (bloques).
        tam_fijo, n_muestras = struct.unpack(">II", _leer(f, p["stsz"][0] + 4, 8))
        tamanos = [tam_fijo] * n_muestras if tam_fijo else _u32s(f, p["stsz"], 12, n_muestras)
        n_stsc = struct.unpack(">I", _leer(f, p["stsc"][0] + 4, 4))[0]
        stsc = struct.unpack(">%dI" % (3 * n_stsc), _leer(f, p["stsc"][0] + 8, 12 * n_stsc))
        caja_co, ancho = (p["stco"], 4) if "stco" in p else (p["co64"], 8)
        n_bloques = struct.unpack(">I", _leer(f, caja_co[0] + 4, 4))[0]
        bloques = _u32s(f, caja_co, 8, n_bloques, ancho)
        por_bloque = []
        for k in range(n_stsc):
            primero, n = stsc[3 * k], stsc[3 * k + 1]
            ultimo = stsc[3 * (k + 1)] - 1 if k + 1 < n_stsc else n_bloques
            por_bloque += [n] * max(0, ultimo - primero + 1)
        # Duración (mdhd): para decirla y comprobar que se ha sacado todo.
        dur = None
        if p.get("mdhd"):
            v = _leer(f, p["mdhd"][0], 1)[0]
            if v == 1:
                escala, d = struct.unpack(">IQ", _leer(f, p["mdhd"][0] + 20, 12))
            else:
                escala, d = struct.unpack(">II", _leer(f, p["mdhd"][0] + 12, 8))
            dur = round(d / float(escala), 2) if escala else None
        if es_mp3:
            salida = os.path.splitext(salida)[0] + ".mp3"
        escritas = 0
        with open(salida, "wb") as o:
            m = 0
            for b, n in zip(bloques, por_bloque):
                pos = b
                for _ in range(n):
                    if m >= len(tamanos):
                        break
                    t = tamanos[m]
                    trozo = _leer(f, pos, t)
                    if not es_mp3:
                        L = t + 7
                        o.write(bytes([0xFF, 0xF1, (perfil << 6) | (idx << 2) | (canales >> 2),
                                       ((canales & 3) << 6) | (L >> 11), (L >> 3) & 0xFF,
                                       ((L & 7) << 5) | 0x1F, 0xFC]))
                    o.write(trozo)
                    pos += t
                    m += 1
                    escritas += 1
        if not escritas:
            return {"error": "la pista de sonido está vacía"}
    return {"audio": salida, "motor": "mp4", "codec": "mp3" if es_mp3 else "aac",
            "tramas": escritas, "duracion_s": dur, "bytes": os.path.getsize(salida)}


def audio(ruta, salida):
    """Saca la pista de sonido del vídeo a `salida` (.aac, o .mp3 si el vídeo lo trae así)."""
    os.makedirs(os.path.dirname(os.path.abspath(salida)) or ".", exist_ok=True)
    if FFMPEG:
        # Primero COPIA (sin tocar el sonido); si el códec no cabe en ADTS, a AAC.
        for args in (["-acodec", "copy"], ["-ac", "1", "-c:a", "aac", "-b:a", "64k"]):
            r = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", ruta, "-vn",
                                *args, "-f", "adts", salida], capture_output=True)
            if r.returncode == 0 and os.path.exists(salida) and os.path.getsize(salida) > 0:
                print(json.dumps({"audio": salida, "motor": "ffmpeg", "codec": "aac",
                                  "bytes": os.path.getsize(salida)}))
                return
    r = extraer_audio_mp4(ruta, salida)
    print(json.dumps(r))
    if r.get("error"):
        sys.exit(3)


def opcion(nombre, defecto):
    if nombre in sys.argv:
        i = sys.argv.index(nombre)
        try:
            return int(sys.argv[i + 1])
        except (IndexError, ValueError):
            return defecto
    return defecto


def opcion_json(nombre):
    """El JSON del fichero que se pasa con `nombre` (o None)."""
    if nombre not in sys.argv:
        return None
    try:
        with open(sys.argv[sys.argv.index(nombre) + 1], encoding="utf-8") as f:
            return json.load(f)
    except (IndexError, OSError, ValueError):
        return None


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    orden = sys.argv[1]
    if orden == "probe":
        probe(sys.argv[2])
    elif orden == "hoja":
        hoja(sys.argv[2], sys.argv[3], opcion("--n", 30), opcion("--cols", 6), opcion_json("--subtitulos"))
    elif orden == "fotogramas":
        fotogramas(sys.argv[2], sys.argv[3], sys.argv[4])
    elif orden == "mosaico":
        mosaico(sys.argv[2], sys.argv[3], opcion("--cols", 4))
    elif orden == "audio":
        audio(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
