# El oráculo de CE3X

Ejecuta el **propio CE3X** —su intérprete de Python 2.7 y su código— sin abrir su
ventana, para preguntarle a él lo que hace con un `.cex`: si lo abre, qué pide, qué
calcula y qué XML escribe. Es lo que permitió escribir `../version_ce3x.py` sin
deducir nada mirando ficheros a ojo (CE3X 2.3 → 3.1, octubre de 2026).

**Es una herramienta de DESARROLLO, solo para Windows y con CE3X instalado.** No la
usa la app ni el contenedor del motor.

## Montarlo (una vez)

CE3X trae `python27.dll` de 32 bits, así que el host tiene que ser de 32 bits, y
con el manifiesto de las librerías de Visual C++ 2008 que usa su `wx` (sin él:
«ImportError: DLL load failed» al importar `wx`):

```bash
"C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe" /platform:x86 /win32manifest:vc90.manifest /out:ce3xpy.exe host.cs
```

`ce3xpy.exe` no va al repositorio (`.gitignore`).

## Usarlo

```bash
# CE3X 3.1 (por defecto): abrir, calificar, calcular las medidas y escribir el XML
CASO='C:\ruta\x.cex' MEDIDAS=1 XML='C:\ruta\x.xml' bash run.sh "$(pwd)/abrir.py"

# CE3X 2.3
CE3X_DIR='C:\Program Files (x86)\CEXv2.3' CE3X_EXE=cexv2.3.exe CASO='C:\ruta\x.cex' \
    bash run.sh "$(pwd)/abrir.py"

# El PDF oficial a partir del XML (lo que hace CE3X al «Generar informe»)
"C:\Program Files (x86)\CE3Xv3.1\moduloXML\xmlcert_20260703\xml2cert.exe" x.xml -o carpeta
```

| Fichero | Qué hace |
|---|---|
| `host.cs` | Carga `python27.dll` de CE3X y ejecuta un script (`execfile`) |
| `vc90.manifest` | Las librerías de Visual C++ 2008 que necesita su `wx`, incrustadas al compilar |
| `run.sh` | Envuelve el script, recoge su salida en `<script>.out` y la imprime |
| `headless.py` | Crea la ventana de CE3X sin mostrarla y neutraliza sus diálogos (los anota en `LOG`) |
| `res.py` | `resultados()`: lo que CE3X ha calculado; `rellenar_generales()` |
| `xml.py` | `generar_xml(ruta)`: el XML del certificado, como el botón de CE3X |
| `abrir.py` | Todo junto, con un `.cex` |
| `cex_a_xml.py` | Califica, calcula medidas y escribe el XML devolviendo JSON. Lo usa `backend/services/cee/cexAPdf.js` (→ XML + PDF oficial; comando `backend/scripts/cex_a_pdf.js`) |

## Lo que hay que saber

- La ruta del script, **absoluta**: el host se cambia al directorio de CE3X.
- Con la **2.3** también CALIFICA, calcula las medidas y escribe el XML —**con un CE3X
  2.3 abierto en el equipo** (arrancado oculto: `Start-Process cexv2.3.exe -WindowStyle
  Hidden`, ~12 s), igual que la 3.1—. Sin él no lanza el cálculo (`casoValido` sale
  `None`), que es lo que se vio al principio. Medido el 05/10/2026 con 26RES080_68.
  · **Guardar** el `.cex` con las medidas calculadas: `FRAME.OnMenuFileSaveMenu(None)`
    con `FRAME.filename` puesto (escribe encima de ese fichero).
  · **El PDF de la 2.3 lo hace CE3X por dentro**: `FRAME.OnGenerarInforme(None)` con
    `wx.FileDialog` parcheado (GetPath/ShowModal) deja `x.pdf` y
    `x_informeMedidasMejora.pdf`. `xml2cert` NO sirve: solo lee el esquema v3.0.
  · La «Fecha» de la cabecera de cada página y `<FechaGeneracion>` son el reloj del
    sistema al generar; la de firma y la de visita salen del informe (pickle 11).
  · El XML v2.0 de la 2.3 no lleva al titular (el PDF tampoco): solo vive en el `.cex`.
- **Un nombre de `.cex` con PUNTOS rompe `xml2cert`** («26RES093_9 - CEE FINAL_3.1.cex»):
  el XML hereda el nombre y el generador del PDF no lo encuentra.
- **El arnés solo abre `.cex` mientras hay un CE3X 3.1 ABIERTO en el equipo.** Sin él,
  `abreArchivoCEX` vuelve sin leer el fichero, sin error y sin escribir en `erroresCEX.txt`
  (`versionArchivoGuardado` vacío, también con los ejemplos oficiales). Medido el 02/10/2026:
  funcionaba con la ventana abierta y dejó de hacerlo al cerrarla; con CE3X arrancado OCULTO
  (`windowsHide`) vuelve a abrir a los ~10 s. `cexAPdf.js` lo arranca solo si hace falta y lo
  cierra al terminar. No se ha encontrado el mecanismo (no hay ficheros, registro ni sockets).
- **CE3X 3.1 no saca el PDF del informe si la ruta del `.cex` lleva tildes o eñes**
  («2026CEE_61 - JOSÉ ÁNGEL…»). El XML sí lo escribe; el PDF lo hace llamando a
  `xml2cert.exe` con `subprocess.call([exe, ruta_unicode])` (`wxFrame1.OnGenerarInforme`),
  y el `subprocess` de Python 2.7 en Windows no admite argumentos Unicode no ASCII:
  `UnicodeEncodeError: 'ascii' codec can't encode character u'\xc9'`. La 2.3 no tenía el
  problema porque hacía el PDF por dentro (`Informes/creaPDF.pyc`, reportlab). Llamado a
  mano, `xml2cert.exe x.xml -o carpeta` funciona con cualquier ruta. Los puntos en las
  CARPETAS y la longitud de la ruta no influyen.
- El arnés no envía nada ni toca la red: solo lee el `.cex` que se le da y escribe el
  XML donde se le dice.
