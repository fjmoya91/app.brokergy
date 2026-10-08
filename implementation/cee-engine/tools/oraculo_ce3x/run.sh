#!/bin/bash
# Ejecuta un script de Python 2.7 DENTRO de CE3X, con su propio intérprete.
#
#   [CE3X_DIR=…] [CE3X_EXE=…] [TIMEOUT=s] bash run.sh /ruta/ABSOLUTA/script.py
#
# Por defecto la 3.2 (la vigente desde el 08/10/2026). Para la 2.3:
#   CE3X_DIR='C:\Program Files (x86)\CEXv2.3' CE3X_EXE=cexv2.3.exe bash run.sh …
#
# ⚠ La ruta del script tiene que ser ABSOLUTA: el host cambia de directorio al
# de CE3X antes de ejecutarlo.
#
# La salida (stdout y stderr del script) va a `<script>.out` y se imprime al
# terminar. El script se envuelve en un try/except para que un error no se
# pierda en una ventana que nadie ve.
AQUI="$(cd "$(dirname "$0")" && pwd)"
CE3X_DIR=${CE3X_DIR:-'C:\Program Files (x86)\CE3Xv3.2'}
CE3X_EXE=${CE3X_EXE:-ce3xv3.2.exe}
export CE3X_DIR
ORACULO_DIR=$(cygpath -w "$AQUI")
export ORACULO_DIR
f="$1"; base="${f%.py}"; rm -f "$base.out"
OUTW=$(cygpath -w "$base.out")
{ echo "# -*- coding: utf-8 -*-"; echo "import sys, os"; echo "OUT = open(r'$OUTW', 'w')"; echo "sys.stdout = OUT; sys.stderr = OUT";
  echo "CE = os.environ['CE3X_DIR']";
  echo "sys.frozen = 'windows_exe'; sys.executable = os.path.join(CE, '$CE3X_EXE'); sys.argv = [sys.executable]";
  echo "os.environ['MATPLOTLIBDATA'] = os.path.join(CE, 'mpl-data')";
  echo "try:"; sed 's/^/    /' "$f"; echo "except SystemExit: pass"; echo "except BaseException:"; echo "    import traceback; traceback.print_exc()"; echo "OUT.close()"; } > "$base.wrapped.py"
timeout ${TIMEOUT:-180} "$AQUI/ce3xpy.exe" "$(cygpath -w $base.wrapped.py)" > /dev/null 2>&1
cat "$base.out"
