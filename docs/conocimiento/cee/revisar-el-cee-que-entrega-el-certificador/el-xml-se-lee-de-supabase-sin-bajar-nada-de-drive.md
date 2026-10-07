<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «REVISAR el CEE que entrega el certificador (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### El `.xml` se lee de SUPABASE, sin bajar nada de Drive

El certificado crudo está guardado en el propio expediente (`cee.xml_inicial` / `cee.xml_final`: 115
expedientes lo tienen), así que la revisión no necesita Drive: `--expediente 26RES060_192` lo trae
todo de una vez.

**⚠️ Ese XML está EN MAYÚSCULAS** —`normalizeData` deja la columna entera así— y eso es justo lo que
impide releerlo con `parseCeeXml` (regla 32: busca los tags con mayúsculas exactas y `DOMParser`
rechaza `<?XML VERSION…?>`). `radiografiaCee` SÍ puede, porque busca sin distinguir mayúsculas y
normaliza los valores antes de casarlos con los enums. **Si alguien quita el flag `i` de esas
expresiones, deja de funcionar EN SILENCIO** (devolvería todo a `null`): lo vigila el test.

**⚠️ Los dos XML pesan ~110 KB cada uno**: se piden de UN expediente, nunca de un listado (regla 22).

**⚠️ La FASE no se deduce del nombre del fichero.** De ella depende el criterio —en el inicial se
espera una caldera y en el final una bomba de calor, y en un RES080 la demanda tiene que BAJAR—, así
que equivocarla no da un aviso raro: revisa con el criterio contrario. En la app la da el SLOT al que
se subió (`ceeUploadService`), que es un dato; en el CLI, `--fase` MANDA y lo deducido se dice.
