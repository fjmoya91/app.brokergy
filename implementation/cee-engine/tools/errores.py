# ============================================================================
# errores.py — el fallo que para la escritura de un .cex.
#
# Vive aparte porque lo levantan DOS modulos que no se pueden importar el uno
# al otro: `generar_cex.py` (que escribe el fichero) y `puentes.py` (que decide
# que puentes termicos tiene el edificio). Con una clase en cada uno, un
# `except GeneracionError` del servidor dejaria pasar la mitad de los fallos
# convertidos en un 500 sin explicacion.
# ============================================================================
from __future__ import annotations


class GeneracionError(Exception):
    """Falta un dato o la plantilla no sirve. No se escribe nada a medias."""
