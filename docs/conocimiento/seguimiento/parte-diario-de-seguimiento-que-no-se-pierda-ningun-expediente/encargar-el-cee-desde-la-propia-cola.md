<!-- conocimiento · área: seguimiento · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10)»; la introducción y el resto, en esta misma carpeta.

### Encargar el CEE desde la propia cola (2026-09-23)

En REVISAR, cada fila de **"Aceptados y sin encargar el CEE"** lleva el selector de
técnico, **"Enviar el encargo"** si ya tiene técnico puesto, y tres chapas con el
**material para el CEE inicial**: vivienda · caldera · placa.

| Qué | Dónde |
|---|---|
| Criterio del material (fuente única) | [utils/materialCee.js](implementation/backend/utils/materialCee.js) |
| Popup del encargo (COMPARTIDO con el módulo CEE) | [EncargoCertificadorModal.jsx](implementation/frontend/src/features/expedientes/components/EncargoCertificadorModal.jsx) |
| Lista ligera de técnicos | `GET /api/seguimiento/certificadores` (staffOnly) |

**REGLA — el material es: VÍDEO de la vivienda, o FACHADA + PATIOS; y la CALDERA con
su PLACA.** El vídeo sustituye a las fotos. Los patios no bloquean (no toda casa tiene):
con la fachada sola el estado es `parcial` y cuenta como suficiente. Sin calefacción
declarada (`sin_calefaccion`) no se pide caldera. El bloque `CEE_SIN_MATERIAL` y el
mensaje al cliente (`faltantesPorDestino(..., { materialCee: true })`, que añade la
caldera y quita fachada/patios si ya hay vídeo) usan el MISMO criterio.

**REGLA — el popup del encargo es UNO.** Se sacó de `CeeModule` al necesitarlo esta
pantalla; con dos copias el encargo de la cola diría otra cosa que el del expediente.
Si falta material, el popup lo avisa en ámbar pero NO bloquea (hay técnicos que hacen
las fotos en la visita). Cerrarlo sin confirmar deshace la elección.

⚠️ Los detectores leían `e.uploads` y **nadie lo rellenaba** (las fotos vienen en
`oportunidades.uploads`): `CEE_SIN_MATERIAL` daba por vacía toda vivienda. Corregido
en `escanear()`. El material se mide sobre `reforma_uploads`, no sobre Drive: una foto
copiada a mano en la carpeta sale como que falta — el mensaje sí reconcilia con Drive.
