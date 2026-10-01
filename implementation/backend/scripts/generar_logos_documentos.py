"""
Genera los logos de los DOCUMENTOS a partir del original en alta resolución.

    python implementation/backend/scripts/generar_logos_documentos.py

Fuente única: `imagenes/BROKERGY_logo_transparente_HD.png` (logotipo horizontal
negro sobre transparente, con «INGENIERÍA ENERGÉTICA» debajo). Cuando cambie el
logo se sustituye ese fichero y se vuelve a lanzar esto.

Lo que escribe —y quién lo usa— :

  frontend/public/logo_brokergy_doc.png    negro sobre BLANCO   · certificado RES080, Anexo Fotográfico
  backend/assets/logo_brokergy_doc.png     el mismo              · Anexo Fotográfico generado en el servidor
  frontend/public/logo_brokergy_dark.png   negro, transparente   · Convenio de Cesión
  frontend/public/logo_brokergy_white.png  BLANCO, transparente  · franja oscura del certificado RES080
  frontend/src/features/lotes/logic/facturaLogo.js
      BROKERGY_MARK_DATAURI (incrustado)                         · guía de la Renta, oferta CEE,
                                                                   factura CEE, factura al S.O.

REGLA — el lienzo de cada fichero conserva sus PÍXELES (1000×200; el incrustado,
840×168) y la proporción 5:1 de siempre: los documentos le fijan el ALTO por CSS y
el ancho sale solo, así que un lienzo de otra proporción movería la maquetación de
documentos que tienen las hojas medidas al píxel (Convenio, RES080).

REGLA — el incrustado va en base64 DENTRO del código porque esos documentos los
rasteriza Puppeteer sobre about:blank, sin red. Las copias de `android/`, `ios/` y
`dist/` son salidas de compilación: no se tocan aquí.
"""
import base64
import io
import os
import re

from PIL import Image

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ORIGEN = os.path.join(RAIZ, 'imagenes', 'BROKERGY_logo_transparente_HD.png')
FRONT = os.path.join(RAIZ, 'implementation', 'frontend')
BACK = os.path.join(RAIZ, 'implementation', 'backend')
LOGO_JS = os.path.join(FRONT, 'src', 'features', 'lotes', 'logic', 'facturaLogo.js')


def encajar(logo, ancho, alto, margen=0.01):
    """El logo recortado a lo que pinta, centrado en un lienzo transparente de ancho×alto."""
    caja = logo.getbbox()
    logo = logo.crop(caja)
    disp_w, disp_h = ancho * (1 - 2 * margen), alto * (1 - 2 * margen)
    escala = min(disp_w / logo.width, disp_h / logo.height)
    tam = (max(1, round(logo.width * escala)), max(1, round(logo.height * escala)))
    logo = logo.resize(tam, Image.LANCZOS)
    lienzo = Image.new('RGBA', (ancho, alto), (0, 0, 0, 0))
    lienzo.alpha_composite(logo, ((ancho - tam[0]) // 2, (alto - tam[1]) // 2))
    return lienzo


def en_color(img, rgb):
    """El mismo dibujo en otro color: se conserva el alfa, se cambia el RGB."""
    alfa = img.getchannel('A')
    out = Image.new('RGBA', img.size, rgb + (255,))
    out.putalpha(alfa)
    return out


def sobre_blanco(img):
    fondo = Image.new('RGBA', img.size, (255, 255, 255, 255))
    fondo.alpha_composite(img)
    return fondo.convert('RGB')


def guardar(img, ruta):
    img.save(ruta, optimize=True)
    print(f'  {os.path.relpath(ruta, RAIZ)}  {img.size[0]}x{img.size[1]}  {os.path.getsize(ruta) // 1024} KB')


def main():
    hd = Image.open(ORIGEN).convert('RGBA')
    print(f'Origen: {os.path.relpath(ORIGEN, RAIZ)} ({hd.size[0]}x{hd.size[1]})')

    negro = en_color(encajar(hd, 1000, 200), (0, 0, 0))
    guardar(sobre_blanco(negro), os.path.join(FRONT, 'public', 'logo_brokergy_doc.png'))
    guardar(sobre_blanco(negro), os.path.join(BACK, 'assets', 'logo_brokergy_doc.png'))
    guardar(negro, os.path.join(FRONT, 'public', 'logo_brokergy_dark.png'))
    guardar(en_color(negro, (255, 255, 255)), os.path.join(FRONT, 'public', 'logo_brokergy_white.png'))

    marca = en_color(encajar(hd, 840, 168), (0, 0, 0))
    buf = io.BytesIO()
    marca.save(buf, format='PNG', optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    # En binario: el fichero va con CRLF y no se le cambian los finales de línea.
    js = open(LOGO_JS, 'rb').read().decode('utf-8')
    nuevo, n = re.subn(r"(export const BROKERGY_MARK_DATAURI = 'data:image/png;base64,)[^']+(')",
                       lambda m: m.group(1) + b64 + m.group(2), js)
    if n != 1:
        raise SystemExit('No se encontró BROKERGY_MARK_DATAURI en facturaLogo.js')
    open(LOGO_JS, 'wb').write(nuevo.encode('utf-8'))
    print(f'  {os.path.relpath(LOGO_JS, RAIZ)}  BROKERGY_MARK_DATAURI 840x168  {len(b64) // 1024} KB en base64')


if __name__ == '__main__':
    main()
