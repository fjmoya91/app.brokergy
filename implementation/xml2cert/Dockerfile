# xml2cert: el XML de un CEE → PDF oficial, en el servidor (ver servidor.js).
#
# El generador oficial (xml2cert.exe del IETcc-CSIC, MIT) solo existe para Windows: corre con
# Wine. Medido en el VPS el 31/10/2026: con Wine 8 (bookworm) no arranca (falta
# bcryptprimitives.dll, Rust ≥ 1.78); con Wine 10 (trixie) sí, ~3 s por certificado.
FROM debian:trixie-slim

ENV DEBIAN_FRONTEND=noninteractive WINEDEBUG=-all WINEARCH=win64 WINEPREFIX=/opt/wine

# contrib, para las fuentes de Microsoft (licencia aceptada por Fran el 31/10/2026). La plantilla
# del certificado usa Arial, Verdana y Courier New: sin ellas el PDF sale SIN TEXTO.
RUN sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources \
    && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
    && apt-get update \
    && apt-get install -y --no-install-recommends wine wine64 nodejs ca-certificates curl unzip ttf-mscorefonts-installer \
    && rm -rf /var/lib/apt/lists/* \
    && test -f /usr/share/fonts/truetype/msttcorefonts/Arial.ttf \
    && test -f /usr/share/fonts/truetype/msttcorefonts/Verdana.ttf \
    && test -f /usr/share/fonts/truetype/msttcorefonts/Courier_New.ttf

# La validación (bin/jing.jar) llama a `java` desde dentro de Wine: un Java 8 de Windows.
RUN curl -fsSL -o /tmp/jre.zip "https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jre/hotspot/normal/eclipse" \
    && mkdir -p /opt/jre && unzip -q /tmp/jre.zip -d /opt/jre && rm /tmp/jre.zip && mv /opt/jre/* /opt/jre/win
ENV WINEPATH="Z:\\opt\\jre\\win\\bin"

RUN wineboot -i >/dev/null 2>&1; wineserver -w; \
    cp /usr/share/fonts/truetype/msttcorefonts/[A-Z]*.ttf "$WINEPREFIX/drive_c/windows/Fonts/"

COPY xmlcert /opt/xmlcert
WORKDIR /opt/xmlcert

# Autoprueba: si el PDF no sale o le faltan las fuentes, la imagen no se construye.
RUN mkdir -p /tmp/st; wine xml2cert.exe examples/Ejemplo30_Informe.xml -o /tmp/st > /tmp/st.txt 2>&1; wineserver -w; cat /tmp/st.txt; \
    test -s /tmp/st/Ejemplo30_Informe.pdf \
    && ! grep -qi "unknown font" /tmp/st.txt /tmp/st/Ejemplo30_Informe.log \
    && rm -rf /tmp/st /tmp/st.txt

COPY servidor.js /opt/servidor.js
EXPOSE 8095
CMD ["node", "/opt/servidor.js"]
