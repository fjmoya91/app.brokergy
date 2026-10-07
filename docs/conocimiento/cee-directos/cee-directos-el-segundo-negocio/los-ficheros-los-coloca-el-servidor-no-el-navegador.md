<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Los FICHEROS los coloca el SERVIDOR, no el navegador

**REGLA — ninguna ruta de carpeta llega desde el cliente.** `CeeDocumentsGrid` es
un componente COMPARTIDO con el CAE y escribía el destino a mano —
`["1. CEE", "CEE FINAL"]`, que es la estructura del CAE. Aquí la sección cuelga
DIRECTAMENTE de la raíz (`2. CEE FINAL`), así que `getOrCreateSubfolder` iba
creando una `1. CEE/CEE FINAL` al vuelo dentro del encargo: el fichero quedaba
donde `scanSection` no mira y fuera de lo que se comparte con el técnico y con el
cliente. Medido: **3 encargos y 18 ficheros**, entre ellos el `.cex` de
2025CEE_43, que en pantalla salía subido y en Drive no estaba donde debía.

`POST /:id/documents/upload` delega ahora en `ceeDirectoUploadService.uploadFile`,
el MISMO camino que el enlace público del técnico — carpeta de la fase según el
alcance, renombrado canónico y versionado a OLD. Las dos superficies no pueden
divergir porque son la misma función.

**La fase y el slot se DEDUCEN si no vienen.** Entre el deploy y el siguiente
refresco hay navegadores con la versión anterior cargada que siguen mandando la
ruta del CAE; el nombre canónico que ya aplican (`… – CEE FINAL.cex`) basta para
saber a qué sección y a qué slot iban (`matchSlot`). Sin esto, el fallo seguiría
ocurriendo durante horas después de arreglarlo.

**El cajón OTROS conserva su nombre** (`opts.nombreLibre`): admite varios
ficheros, y el nombre canónico de un slot es fijo — cada subida archivaría la
anterior en OLD. El prefijo `{nº} – ` lo pone el servicio, nunca quien llama.

Recolocar lo ya mal colocado:

```bash
node implementation/backend/scripts/recolocar_cee_directos_drive.js --execute
```

**SALVAGUARDA — un encargo ÚNICO con certificados de las DOS fases no se toca.**
Allí las dos fases caen en la misma carpeta (`1. CEE`), y aplanarlas mezclaría dos
certificados: `matchSlot` se quedaría con el primero de cada slot y la app
enseñaría una mezcla. Eso no es un fichero mal colocado, es un encargo que en
realidad es DOBLE (visto en 2025CEE_26). Se avisa y se deja.
