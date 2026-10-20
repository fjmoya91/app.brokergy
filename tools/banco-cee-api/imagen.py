"""Imágenes para el agente del banco, siempre REDUCIDAS (los modelos 4.7+ no
recortan la resolución y una foto de móvil de 4032 px costaría ~16.000 tokens).

  python -P imagen.py foto   <entrada> <salida.jpg> [lado_max] [x0,y0,x1,y1]
  python -P imagen.py hoja   <salida.jpg> <lado_celda> <columnas> <entrada1> [<entrada2> …]
  python -P imagen.py pdf    <entrada.pdf> <dir_salida> <lado_max> <paginas: 1,2-3 | todas>

Imprime en JSON lo que ha escrito (ruta, ancho, alto).
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageOps


def abrir(ruta):
    im = Image.open(ruta)
    im = ImageOps.exif_transpose(im)  # la orientación EXIF, como la vería una persona
    return im.convert("RGB")


def reducir(im, lado):
    w, h = im.size
    f = min(1.0, lado / max(w, h))
    if f < 1.0:
        im = im.resize((max(1, round(w * f)), max(1, round(h * f))), Image.LANCZOS)
    return im


def foto(entrada, salida, lado=1400, recorte=None):
    im = abrir(entrada)
    if recorte:
        x0, y0, x1, y1 = [float(v) for v in recorte.split(",")]
        w, h = im.size
        im = im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h)))
    im = reducir(im, int(lado))
    im.save(salida, "JPEG", quality=85)
    return [{"ruta": salida, "ancho": im.size[0], "alto": im.size[1]}]


def hoja(salida, celda, columnas, entradas):
    celda, columnas = int(celda), int(columnas)
    filas = (len(entradas) + columnas - 1) // columnas
    pie = 22
    lienzo = Image.new("RGB", (columnas * celda, filas * (celda + pie)), "white")
    d = ImageDraw.Draw(lienzo)
    for i, e in enumerate(entradas):
        try:
            im = abrir(e)
        except Exception as ex:  # una foto rota no tumba la hoja
            im = Image.new("RGB", (celda, celda), (230, 230, 230))
            d.text((10, 10), f"no se abre: {ex}", fill="black")
        im.thumbnail((celda, celda))
        x, y = (i % columnas) * celda, (i // columnas) * (celda + pie)
        lienzo.paste(im, (x + (celda - im.size[0]) // 2, y + (celda - im.size[1]) // 2))
        d.text((x + 4, y + celda + 4), f"{i + 1}. {os.path.basename(e)[:60]}", fill="black")
    lienzo = reducir(lienzo, 1800)
    lienzo.save(salida, "JPEG", quality=85)
    return [{"ruta": salida, "ancho": lienzo.size[0], "alto": lienzo.size[1]}]


def paginas_de(texto, n):
    if texto in ("", "todas"):
        return list(range(n))
    out = []
    for parte in texto.split(","):
        if "-" in parte:
            a, b = parte.split("-")
            out += list(range(int(a) - 1, min(int(b), n)))
        else:
            out.append(int(parte) - 1)
    return [p for p in out if 0 <= p < n]


def pdf(entrada, dir_salida, lado, paginas):
    import fitz  # PyMuPDF

    os.makedirs(dir_salida, exist_ok=True)
    doc = fitz.open(entrada)
    out = []
    for p in paginas_de(paginas, doc.page_count)[:8]:
        pag = doc[p]
        escala = int(lado) / max(pag.rect.width, pag.rect.height)
        pix = pag.get_pixmap(matrix=fitz.Matrix(escala, escala))
        ruta = os.path.join(dir_salida, f"{os.path.splitext(os.path.basename(entrada))[0]}_p{p + 1}.jpg")
        Image.frombytes("RGB", (pix.width, pix.height), pix.samples).save(ruta, "JPEG", quality=85)
        out.append({"ruta": ruta, "ancho": pix.width, "alto": pix.height, "pagina": p + 1, "de": doc.page_count})
    return out


def texto(entrada, paginas):
    import fitz  # PyMuPDF

    doc = fitz.open(entrada)
    partes = []
    for p in paginas_de(paginas, doc.page_count)[:20]:
        partes.append(f"--- página {p + 1} de {doc.page_count} ---\n{doc[p].get_text()}")
    return [{"texto": "\n".join(partes).strip()}]


if __name__ == "__main__":
    orden, *a = sys.argv[1:]
    if orden == "foto":
        r = foto(a[0], a[1], a[2] if len(a) > 2 else 1400, a[3] if len(a) > 3 else None)
    elif orden == "hoja":
        r = hoja(a[0], a[1], a[2], a[3:])
    elif orden == "pdf":
        r = pdf(a[0], a[1], a[2], a[3] if len(a) > 3 else "todas")
    elif orden == "texto":
        r = texto(a[0], a[1] if len(a) > 1 else "todas")
    else:
        raise SystemExit(f"orden desconocida: {orden}")
    print(json.dumps(r, ensure_ascii=False))
