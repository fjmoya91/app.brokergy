#!/bin/bash
# Deja el prefijo de Wine como lo deja el instalador de CE3X 3.2: sus claves del registro. Sin
# ellas, `registro.leerDirectorioDoc` lanza WindowsError 2 al importar wxFrame1 (medido el
# 23/11/2026). Son las del PC: HKLM, HKCU y HKU\.DEFAULT\Software\CE3X3.2 → idioma,
# directorio (predeterminado) y directorioDoc. Se escriben en las dos vistas (32 y 64 bits).
set -e
CE='C:\Program Files (x86)\CE3Xv3.2'
DOC='C:\users\Public\Documents\CE3X3.2'
for raiz in 'HKLM\Software\CE3X3.2' 'HKCU\Software\CE3X3.2' 'HKU\.DEFAULT\Software\CE3X3.2'; do
  for vista in /reg:32 /reg:64; do
    wine reg add "$raiz" /v idioma /d es /f $vista >/dev/null 2>&1 || true
    wine reg add "$raiz\\directorio" /ve /d "$CE" /f $vista >/dev/null 2>&1 || true
    wine reg add "$raiz\\directorioDoc" /v directorioDoc /d "$DOC" /f $vista >/dev/null 2>&1 || true
    wine reg add "$raiz\\idioma" /v idioma /d es /f $vista >/dev/null 2>&1 || true
  done
done
wineserver -w
wine reg query 'HKLM\Software\CE3X3.2\directorioDoc' /reg:32 | grep -q directorioDoc
echo "registro de CE3X listo"
