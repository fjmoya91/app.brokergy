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

## Lo que hay que saber

- La ruta del script, **absoluta**: el host se cambia al directorio de CE3X.
- Con la **2.3** abre el fichero pero el arnés no consigue lanzar su cálculo
  (`casoValido` sale `None`). Sirve para ver que lo abre sin errores.
- **Un nombre de `.cex` con PUNTOS rompe `xml2cert`** («26RES093_9 - CEE FINAL_3.1.cex»):
  el XML hereda el nombre y el generador del PDF no lo encuentra.
- El arnés no envía nada ni toca la red: solo lee el `.cex` que se le da y escribe el
  XML donde se le dice.
