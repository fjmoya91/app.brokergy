<!-- conocimiento · área: claude-automatizacion · las rutas de los enlaces son relativas a la raíz del repo -->

## JUSTIFICAR un expediente al terminar la obra — skill `justificar-expediente` (2026-10-08)

Al acabar la obra el instalador manda un paquete (zip, carpeta, WhatsApp) con las facturas, el
certificado y la memoria RITE y las fotos de antes y después. Llevarlo a la app era una tarde de
trabajo a mano: leer cada factura y teclearla, subir el RITE, repartir las fotos, corregir los
equipos por sus placas, y pulsar «Generar» en cuatro documentos revisando que cada cifra cuadra.
La skill [justificar-expediente](skills/justificar-expediente/SKILL.md) lo hace igual que una
persona, y nació de hacerlo entero sobre **26RES060_178** (petición del usuario: «cógelo como
referencia para una skill de justificación»).

**REGLA — por la MISMA ruta que la pantalla, con la cuenta de CLAUDE.** Nada se recompone ni se
escribe «a mano»: facturas por `POST /facturas/ocr` (lee y archiva; las filas las registra después
el `PUT`, como el modal), RITE por `POST /rite/ocr`, placas por `POST /placas/ocr` (en seco y luego
`aplicar` con lo revisado), cliente y expediente por sus `PUT`, fotos por `subirFicherosASlot`,
CIFO y Anexo Fotográfico por sus generadores del servidor, y **el Anexo I y el Convenio pulsando
«Generar» → «Guardar en Drive» en la app**, porque los compone el navegador (igual que la propuesta,
regla 103). La sesión es la del robot (`utils/sesionRobot.js`, sacada de `claude_propuesta.js`) y el
historial firma «CLAUDE». Herramienta: [scripts/justificar.js](implementation/backend/scripts/justificar.js)
(`estado` · `api` · `fotos` · `anexos` · `bajar`).

**REGLA — nada sale a terceros.** La skill deja borradores en Drive y enlazados; no pulsa ningún
«Enviar». El envío a firma lo hace una persona.

**REGLA — lo dudoso se pregunta una vez, al final, con opciones.** En 26RES060_178 salieron, y son
las típicas: el año de la placa de la caldera (decide la fila de rendimiento), una factura de otra
empresa (acometida eléctrica: el usuario decidió no subirla), el SCOP cuando el modelo no publica el
clima cálido (se usó el medio), la fecha de inicio cuando las facturas declaran otra (se dejó la
calculada), el precio CAE de una oportunidad sin sellar, el email que falta para el Anexo I y las
fechas del CEE final.

**REGLA — el CEE final de la justificación no se pregunta más que las fechas** (usuario, 08/10/2026):
en un RES060 se COPIA el inicial del técnico con las instalaciones INSTALADAS y el autoconsumo
máximo mes a mes del XML del propio final, a 1.000 €/kWp, en CE3X 3.2, y sin SEER en el catálogo se
pone el EER de la ficha técnica (regla 127, `scripts/cee_final_copiando.js`). En 26RES060_178 se
hizo primero «desde la medida» con el consumo del inicial (1,84 kWp, sin frío, sin inversión) y el
usuario lo rechazó; rehecho: B/C, 10,61 kWp, 10.610 €.

### Lo que destapó el caso (y quedó arreglado en local)

1. **El CIFO decía «Condiciones en calefacción: Cálido» con un SCOP de clima MEDIO.** El rótulo salía
   solo de la zona (D3 → cálido). Ahora, si el expediente tiene SELLADA la temporada del SCOP
   (`aerotermia_cal.scop_temporada`), manda ella; sin sello, la zona, para que un CIFO ya emitido no
   cambie al regenerarse ([cifoDoc.js](implementation/frontend/src/features/expedientes/logic/cifoDoc.js),
   `climaScopCal`). Medido: 4 expedientes con sello «medio» en zona cálida (dos ya firmados, que no
   cambian si no se regeneran). Los certificados RES080 (`res080Doc.js` y su modal) tienen el mismo
   rótulo por zona y no se han tocado.
2. **El lector de placas, al SUSTITUIR el equipo, conservaba la ficha, el EPREL y el Keymark del
   anterior**: el CIFO habría anexado los papeles de la DUO AI 10 a una Extensa S 10. Ahora los trae
   del modelo nuevo, como el desplegable ([placasInstalacion.js](implementation/backend/services/placasInstalacion.js)).
   Caso nuevo en `test_placas_instalacion.js` (falla sin el arreglo).
3. **«Guardar en Drive» del Convenio no enlazaba el borrador** (el del Anexo I sí): quedaba en Drive
   sin `anexo_cesion_drive_link` hasta el primer envío. Ahora llama a `onSaveDrive`
   ([AnexoCesionModal.jsx](implementation/frontend/src/features/expedientes/components/AnexoCesionModal.jsx)).

### Otras cosas medidas en el caso

- **El precio al cliente de una oportunidad anterior al sellado** (regla 43): la propuesta iba a
  103 €/MWh y el expediente calculaba a 95; el Convenio toma el precio de `caePriceClient` y el
  importe del motor económico, así que sin fijar el precio en el Económico **se contradecía**
  (0,103 €/kWh junto a un importe a 0,095). Se fija en `economico_override.cae_client_rate`.
- **La foto que el cliente ya mandó por WhatsApp vuelve en el paquete del instalador** recomprimida
  (md5 distinto, mismo encuadre): se compara mirando, y no se duplica.
- **El `.cex` del técnico puede no traer la medida de mejora** aunque su `.xml` y su informe sí: lo
  guardó antes de añadirla. `generar-cee-final` no puede partir de él tal cual.
- **Git Bash convierte `/api/…` en una ruta de Windows** al pasarlo como argumento: la orden `api`
  admite la ruta sin la barra inicial.

Tras tocarlo: `node implementation/backend/scripts/test_placas_instalacion.js`,
`node implementation/backend/scripts/check_cifo_paginas.mjs` y `node implementation/backend/scripts/justificar.js estado <nº>` (solo lee).
