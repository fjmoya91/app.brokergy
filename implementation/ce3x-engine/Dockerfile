# ce3x-engine: el MOTOR de CE3X 3.2 (su Python 2.7 y su código, sin ventana) con Wine, para
# calificar un .cex en el servidor sin el PC de Fran (ver servidor.js y README.md).
#
# CE3X NO va en el repo (es público y CE3X no tiene licencia libre): la carpeta instalada llega por
# dos contextos de build con nombre (docker-compose.yml → additional_contexts):
#   ce3x_programa   = la carpeta instalada  (en el PC: C:\Program Files (x86)\CE3Xv3.2)
#   ce3x_documentos = la de Documentos      (en el PC: C:\Users\Public\Documents\CE3X3.2)
#   oraculo         = implementation/cee-engine/tools/oraculo_ce3x (los scripts que se ejecutan)
# En el VPS viven en /opt/brokergy-ce3x/{programa,documentos} (README: «Subir CE3X al VPS»).

# ── El arnés, en C (el de C# pediría Mono): compilado con MinGW de 32 bits ──
FROM debian:trixie-slim AS host
RUN apt-get update && apt-get install -y --no-install-recommends gcc-mingw-w64-i686 binutils-mingw-w64-i686 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /b
COPY host.c host.rc ./
COPY --from=oraculo vc90.manifest ./
# El manifiesto de Visual C++ 2008 va incrustado: sin él el `wx` de CE3X no carga (ImportError).
RUN i686-w64-mingw32-windres host.rc -O coff -o host.res \
    && i686-w64-mingw32-gcc -O2 -static -o ce3xpy.exe host.c host.res

# ── Wine de 32 bits (el Python de CE3X es de 32 bits) ──
FROM debian:trixie-slim
ENV DEBIAN_FRONTEND=noninteractive WINEDEBUG=-all WINEARCH=win32 WINEPREFIX=/opt/wine DISPLAY=:99
RUN dpkg --add-architecture i386 && apt-get update \
    && apt-get install -y --no-install-recommends wine wine32:i386 xvfb xauth nodejs ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN wineboot -i >/dev/null 2>&1; wineserver -w; test -d /opt/wine/drive_c/windows

# CE3X tal cual está instalado, en la MISMA ruta que en el PC.
COPY --from=ce3x_programa [".", "/opt/wine/drive_c/Program Files (x86)/CE3Xv3.2/"]
COPY --from=ce3x_documentos . /opt/wine/drive_c/users/Public/Documents/CE3X3.2/
COPY preparar.sh /opt/preparar.sh
RUN bash /opt/preparar.sh \
    && test -f "/opt/wine/drive_c/Program Files (x86)/CE3Xv3.2/python27.dll" \
    && test -f "/opt/wine/drive_c/Program Files (x86)/CE3Xv3.2/wxFrame1.pyd"

COPY --from=host /b/ce3xpy.exe /opt/host/ce3xpy.exe
COPY --from=oraculo *.py /opt/oraculo/
COPY servidor.js autoprueba.js arrancar.sh /opt/

# Autoprueba: el ejemplo oficial 2 tiene que dar lo mismo que en el PC; si no, no hay imagen.
COPY --from=ce3x_documentos ["Ejemplos/2 Vivienda dentro de bloque.cex", "/opt/autoprueba/ejemplo2.cex"]
# Al acabar, /tmp limpio: su cerrojo de X y la carpeta de wineserver irían en la imagen.
RUN (Xvfb :99 -screen 0 1024x768x24 >/dev/null 2>&1 &) ; sleep 2; node /opt/autoprueba.js; r=$?; wineserver -k 2>/dev/null; \
    sleep 1; rm -rf /tmp/.X99-lock /tmp/.X11-unix /tmp/wine-* /tmp/.wine-* /tmp/ce3x; exit $r

EXPOSE 8096
CMD ["sh", "/opt/arrancar.sh"]
