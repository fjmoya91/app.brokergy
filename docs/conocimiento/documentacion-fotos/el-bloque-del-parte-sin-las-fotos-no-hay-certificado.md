<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «REVISAR el CEE que entrega el certificador (2026-09-21)», en el CLAUDE.md antiguo.

### El bloque del parte: sin las fotos, no hay certificado

`CEE_SIN_MATERIAL` en [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js).
Se acepta la propuesta, el cliente no manda nada y el expediente se queda parado
ANTES de empezar, sin que nadie lo reclame. Medido al estrenarlo: **16
expedientes** en producción, el más antiguo de **160 días**.

Es distinto de `SIN_ENCARGAR` —allí falta que mandemos el encargo— y solo vive
mientras el material sirve de algo: en cuanto el CEE se entrega (`PRESENTADO` en
adelante), el técnico ya pudo trabajar y reclamarlo sería pedir fotos que no va a
mirar nadie.

**REGLA — el detector mira `reforma_uploads`; el MENSAJE se compone mirando
DRIVE.** Traer Drive de 150 expedientes es una llamada por cada uno, así que el
detector se conforma con lo que hay en la BD — y por eso puede sobrar alguno. El
texto lo redacta `faltantesPorDestino`, que sí reconcilia (regla 20) y puede
acabar diciendo que no falta nada. Los MIGRADOS se excluyen: su material vive en
el Drive antiguo y saldrían todos en falso.

**REGLA — solo se reclama lo IMPRESCINDIBLE** (`SLOTS_CEE_MINIMOS`: fachada y
patios). El vídeo, los planos y el CEE anterior ayudan, pero el certificador
trabaja sin ellos; reclamar lo que da igual que no llegue es lo que enseña a
ignorar el parte entero.

El envío en bloque (`pedir-cee` en `TIPOS_LOTE`) manda UN mensaje al cliente con
sus N viviendas, cada línea con su enlace filtrado.
