# Índice del conocimiento

> GENERADO — no se edita a mano: `node scripts/conocimiento.mjs regenerar`.
> Cómo está organizado y por qué: [README.md](README.md). Cómo se trabaja: [COMO-TRABAJAMOS.md](COMO-TRABAJAMOS.md).

## Áreas

| Área | Qué cubre | Regla de nivel 2 | Documentos |
|---|---|---|---|
| `calculo` | Cálculo y fichas — RES060/080/093, TER100/173, SCOP, C_b, D_ACS, CEE que manda, precio CAE, bloques | `.claude/rules/calculo.md` · 37,6 KB | 11 |
| `catastro` | Catastro — WAF, endpoints WCF JSON, búsqueda por coordenadas, OCR de la referencia, fachada | `.claude/rules/catastro.md` · 4,6 KB | 2 |
| `cee` | Módulo CEE — encargo al técnico, subida, revisión, visto bueno, presentación en el Registro, IRPF, Agente IA | `.claude/rules/cee.md` · 43,6 KB | 23 |
| `cee-directos` | CEE directos — el segundo negocio: alta, encargo, entrega, oferta y factura | `.claude/rules/cee-directos.md` · 10,9 KB | 26 |
| `cee-generacion` | Generación del CEE — .cex inicial/final y previsto RES080, instalaciones y medidas de mejora, CE3X 2.3/3.1/3.2, oráculo y PDF sin CE3X, skills CEE | `.claude/rules/cee-generacion.md` · 52,1 KB | 17 |
| `certificadores-app` | App de certificadores — cee.brokergy.es: lista de espera, obras, cuestionario, generar con IA, entrega | `.claude/rules/certificadores-app.md` · 8,2 KB | 11 |
| `claude-automatizacion` | Claude y automatización — asistente por WhatsApp, llave de Claude, hooks y scripts de mantenimiento | `.claude/rules/claude-automatizacion.md` · 19,7 KB | 6 |
| `clientes` | Clientes y partners — fichas, propietarios y cedentes, contactos comercial/técnico, cobro y venta cruzada | `.claude/rules/clientes.md` · 23,3 KB | 7 |
| `consultas` | _(sin regla de nivel 2: lo que vale siempre está en CLAUDE.md)_ | — | 1 |
| `documentacion-fotos` | Documentación y fotos — DocsManager, alcance, subida en tanda, buzón, ventanas, fotos del WhatsApp, Anexo Fotográfico | `.claude/rules/documentacion-fotos.md` · 18,1 KB | 24 |
| `documentos` | Documentos oficiales — CIFO, fichas e impresos, Anexo I, Convenio de Cesión, hitos, rechazo y re-firma | `.claude/rules/documentos.md` · 39,9 KB | 12 |
| `envolvente-ce3x` | Envolvente y CE3X — plano, motor y geometría, cerramientos y transmitancias, croquis, administrativos del .cex, PVGIS | `.claude/rules/envolvente-ce3x.md` · 92,8 KB | 36 |
| `expedientes` | Expedientes — ciclo de vida, listado y columnas, rechazo, carpetas de Drive por estado | `.claude/rules/expedientes.md` · 8,2 KB | 3 |
| `facturacion` | Facturación — presupuestos con partidas, catálogo de artículos y facturas propias | `.claude/rules/facturacion.md` · 17,8 KB | 5 |
| `facturas` | Facturas — OCR e incidencias de las facturas de obra, PDF único, facturación del certificador | `.claude/rules/facturas.md` · 2,8 KB | 2 |
| `firma` | Firma — Autofirma, firma a mano con el móvil, QR, integridad de la firma | `.claude/rules/firma.md` · 12,3 KB | 4 |
| `general` | _(sin regla de nivel 2: lo que vale siempre está en CLAUDE.md)_ | — | 8 |
| `infra` | Infraestructura — Gemini (nivel de pago), lectores con IA, Drive, email y servidor | `.claude/rules/infra.md` · 2,6 KB | 2 |
| `instalador-rite` | Instalador y RITE — envío conjunto, re-firma del CIFO, lectura del certificado RITE, memoria y estancias | `.claude/rules/instalador-rite.md` · 6,6 KB | 2 |
| `lotes` | Lotes y Sujeto Obligado — verificación, OCR de sus PDF, anexos MITECO, paquete ZIP, firmados, peticiones, factura | `.claude/rules/lotes.md` · 28,2 KB | 13 |
| `oportunidades` | Oportunidades — estados, IDs, funnel, nueva simulación, aceptación y alta desde WhatsApp | `.claude/rules/oportunidades.md` · 15,9 KB | 5 |
| `placas-catalogos` | Placas y catálogos — lectura de placas, nº de serie, aerotermia (EPREL, conjuntos), ventanas, fichas técnicas | `.claude/rules/placas-catalogos.md` · 33,3 KB | 10 |
| `propuesta` | Propuesta — versiones, envío programado, presupuesto estimado/leído, portada, comisión y enlace de aceptación | `.claude/rules/propuesta.md` · 21,8 KB | 8 |
| `seguimiento` | Seguimiento — parte diario, radar de bloques, enlaces de acción y envío en bloque | `.claude/rules/seguimiento.md` · 5,2 KB | 8 |
| `transversal-backend` | Backend — lo que vale para CUALQUIER ruta o servicio | `.claude/rules/transversal-backend.md` · 8,4 KB | 1 |
| `transversal-frontend` | Frontend — lo que vale para CUALQUIER pantalla | `.claude/rules/transversal-frontend.md` · 7,0 KB | 4 |
| `whatsapp` | WhatsApp — sesión, entrega (ACK), adjuntos, etiquetas, agenda y bot de clientes | `.claude/rules/whatsapp.md` · 17,3 KB | 15 |

## Reglas numeradas → dónde están

> Los comentarios del código citan «regla N». Para leerla: `grep -rnE "^N(\.[a-z])?\.? " .claude/rules`.

- **1** → `.claude/rules/expedientes.md` — Drive
- **2** → `.claude/rules/oportunidades.md` — Estados de oportunidad
- **3** → `.claude/rules/oportunidades.md` — IDs de oportunidad
- **3.b** → `.claude/rules/calculo.md` — Fichas
- **4** → `.claude/rules/documentos.md` — Validación de Documentos
- **5** → `.claude/rules/propuesta.md` — PDF Propuestas
- **6** → `.claude/rules/transversal-backend.md` — Seguridad de rutas
- **7** → `.claude/rules/documentos.md` — Diseño de Anexos
- **8** → `.claude/rules/calculo.md` — Expedientes — SCOP según emisor
- **8.b** → `.claude/rules/calculo.md` — Cb (RES093) — la carga de diseño sale del REGLAMENTO EUROPEO, no de la zona climática
- **8.c** → `.claude/rules/documentos.md` — Anexos del CIFO — una ficha técnica por MODELO, no por hueco
- **8.d** → `.claude/rules/calculo.md` — Una vivienda SIN calefacción se DECLARA, no se disfraza de "Otro"
- **8.e** → `.claude/rules/calculo.md` — El emisor INICIAL y el FINAL no siempre son lo mismo
- **8.f** → `.claude/rules/calculo.md` — El SCOP va con DOS decimales, igual en la fórmula, en el papel y en la BD
- **9** → `.claude/rules/clientes.md` — DNI único
- **10** → `.claude/rules/clientes.md` — Modales de Clientes / Partners
- **11** → `.claude/rules/cee.md` — XML Upload
- **12** → `.claude/rules/documentos.md` — ACS en Anexo I
- **12.b** → `.claude/rules/documentos.md` — ACS fuera del alcance → "no aplica", nunca el valor ni 0
- **12.c** → `.claude/rules/placas-catalogos.md` — `misma_aerotermia_acs` NO puede esconder un equipo de ACS DECLARADO
- **12.d** → `.claude/rules/calculo.md` — La D_ACS admite los LITROS/DÍA que declara el certificado
- **12.e** → `.claude/rules/documentos.md` — El nº de serie del equipo de ACS lo decide el DATO, no el flag
- **12.f** → `.claude/rules/calculo.md` — La demanda de ACS es la MISMA en los dos certificados, y si no, manda la del CEE INICIAL
- **13** → `.claude/rules/whatsapp.md` — WhatsApp en Sidebar
- **14** → `.claude/rules/whatsapp.md` — WhatsApp Session
- **15** → `.claude/rules/catastro.md` — Catastro — Cliente HTTP
- **16** → `.claude/rules/catastro.md` — Catastro — Endpoints
- **17** → `.claude/rules/catastro.md` — Catastro — Sin ráfagas
- **18** → `.claude/rules/documentacion-fotos.md` — Miniaturas de Drive — usar el PROXY
- **19** → `.claude/rules/documentacion-fotos.md` — reforma_uploads — escritura ATÓMICA
- **20** → `.claude/rules/documentacion-fotos.md` — Documentación — Drive es la fuente de verdad
- **21** → `.claude/rules/transversal-backend.md` — NUNCA guardar ficheros en base64 dentro de un JSONB
- **22** → `.claude/rules/transversal-backend.md` — Listados: nunca traer columnas JSONB completas
- **22.b** → `.claude/rules/firma.md` — Anexo de Cesión MANUSCRITO = escaneo + DNI del cliente + DNI del representante
- **23** → `.claude/rules/documentos.md` — Cliente EMPRESA — firma el representante legal
- **24** → `.claude/rules/documentos.md` — Rechazar un documento que generamos nosotros BLOQUEA su borrador
- **25** → `.claude/rules/propuesta.md` — La PROPUESTA se versiona al ENVIARLA, nunca al guardarla
- **25.b** → `.claude/rules/documentos.md` — Las TIPOGRAFÍAS de un documento se AUTO-ALOJAN, nunca se piden a Google Fonts.
- **26** → `.claude/rules/whatsapp.md` — El bot de WhatsApp solo habla en los chats ETIQUETADOS, en horario y sin tocar dinero
- **26.b** → `.claude/rules/documentos.md` — El CIFO y el certificado RES080 identifican a las DOS empresas cuando no son la misma
- **27** → `.claude/rules/instalador-rite.md` — Al instalador se le pide TODO de una vez, y un CIFO firmado NO cierra la tarea para siempre
- **27.b** → `.claude/rules/instalador-rite.md` — El Certificado RITE se LEE al subirlo
- **27.c** → `.claude/rules/cee.md` — La FECHA DE REGISTRO del CEE se LEE del justificante, no es el día de la subida
- **27.d** → `.claude/rules/placas-catalogos.md` — La PLACA de la caldera se LEE con IA, y una placa POLICOMBUSTIBLE no tiene UNA potencia
- **27.e** → `.claude/rules/placas-catalogos.md` — Las TRES placas de la obra se leen de un botón, y la placa se lee SOLA
- **27.f** → `.claude/rules/placas-catalogos.md` — El Nº DE SERIE de una placa lo decide el CÓDIGO, sobre DOS lecturas de dos modelos distintos
- **28** → `.claude/rules/lotes.md` — Las cifras del LOTE se leen de sus PDF, y el ahorro verificado manda sobre el pago
- **29** → `.claude/rules/lotes.md` — El ANEXO del MITECO se RELLENA, no se replica
- **29.b** → `.claude/rules/transversal-frontend.md` — `SendActionOverlay` se PORTALEA a `document.body`
- **29.c** → `.claude/rules/lotes.md` — La SOLICITUD de emisión de CAE sale del MISMO botón que los anexos
- **29.d** → `.claude/rules/transversal-frontend.md` — El informe de una acción NO repite el mismo aviso por cada elemento, y no todo es un ✓
- **30** → `.claude/rules/lotes.md` — Al Sujeto Obligado se le pide UNA vez por VARIOS lotes
- **31** → `.claude/rules/propuesta.md` — Una propuesta con presupuesto ESTIMADO lo dice, y dice a qué afecta
- **32** → `.claude/rules/calculo.md` — El CEE que MANDA es el FINAL si está cargado, y si no el INICIAL — en TODOS los documentos
- **33** → `.claude/rules/documentos.md` — Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio, y lo dice con el importe nuevo
- **34** → `.claude/rules/firma.md` — La firma A MANO se hace con el MÓVIL, y el documento sale rasterizado
- **35** → `.claude/rules/oportunidades.md` — "¿Tienes placas solares?" se pregunta en `/reforma` y llega hasta el CEE
- **36** → `.claude/rules/clientes.md` — La CONFIRMACIÓN DE COBRO es un formulario de la app, no de Tally
- **37** → `.claude/rules/placas-catalogos.md` — El Uf del marco y el Ug del vidrio salen del CATÁLOGO DE VENTANAS, y la MARCA no es el CARPINTERO
- **37.b** → `.claude/rules/placas-catalogos.md` — La ficha del catálogo puede ser VARIOS papeles unidos, y se une UNA vez
- **38** → `.claude/rules/transversal-backend.md` — Con la BD caída, la app CALLA; nunca contesta una cifra tranquila
- **39** → `.claude/rules/whatsapp.md` — Un mensaje de WhatsApp con el RELOJ no está enviado, y el "escribiendo…" es lo que rompe la sesión
- **39.b** → `.claude/rules/whatsapp.md` — Del MODELO del adjunto se esparcen sus DATOS, nunca sus internos.
- **40** → `.claude/rules/lotes.md` — El PAQUETE de cada actuación se genera, no se renombra a mano
- **41** → `.claude/rules/documentos.md` — Las FICHAS y el ANEXO I se RELLENAN sobre el impreso OFICIAL, ya no se redibujan
- **42** → `.claude/rules/calculo.md` — TER173 es la TER100 ponderada por el C_b de la RES093, y su impreso no tiene casilla para el C_b
- **42** → `.claude/rules/cee.md` — Al encargar el CEE, el cliente también se entera
- **42.b** → `.claude/rules/calculo.md` — Un TER173 (y un TER100) se crea DESDE LA OPORTUNIDAD
- **43** → `.claude/rules/calculo.md` — El precio CAE al cliente es 100 €/MWh en las propuestas NUEVAS, y lo ya guardado no se mueve
- **43** → `.claude/rules/whatsapp.md` — La cartera de INSTALADORES se etiqueta sola en WhatsApp
- **44** → `.claude/rules/clientes.md` — Cada aviso va al COMERCIAL o al TÉCNICO del partner, no "al instalador"
- **44.b** → `.claude/rules/propuesta.md` — La PROPUESTA también elige a quién de la empresa
- **45** → `.claude/rules/calculo.md` — Una RC de 14 con división horizontal es un EDIFICIO, y se puede simular entero
- **46** → `.claude/rules/calculo.md` — El coste del INFORME DE VERIFICACIÓN se teclea ya en la simulación
- **47** → `.claude/rules/oportunidades.md` — El mismo vecino volviendo al funnel NO estrena oportunidad
- **48** → `.claude/rules/envolvente-ce3x.md` — El `.cex` de la envolvente se guarda SIEMPRE en `1. CEE / CEE INICIAL` como `{nº} - CEE INICIAL_REVISAR.cex`…
- **48.b** → `.claude/rules/cee-generacion.md` — El CEE FINAL se hace COPIANDO el inicial, no regenerándolo
- **48.c** → `.claude/rules/envolvente-ce3x.md` — Los ADMINISTRATIVOS del `.cex` se corrigen desde la ventana, escribiendo en SU FUENTE
- **48.d** → `.claude/rules/envolvente-ce3x.md` — Al CERTIFICADOR no se le enseña lo que no es suyo
- **48.e** → `.claude/rules/cee-generacion.md` — Cuando el ACS lo hace OTRA máquina, se escriben DOS equipos
- **48.f** → `.claude/rules/envolvente-ce3x.md` — Un certificador FIRMA como persona y puede ejercer en una EMPRESA
- **48.g** → `.claude/rules/cee-generacion.md` — La MEDIDA DE MEJORA de una hibridación lleva los DOS generadores, repartidos por el C_b
- **48.h** → `.claude/rules/envolvente-ce3x.md` — La envolvente se puede DESHACER (Ctrl+Z o su botón), y la PLACA la lee también el CERTIFICADOR
- **48.i** → `.claude/rules/envolvente-ce3x.md` — La envolvente vale también para los CEE DIRECTOS
- **48.j** → `.claude/rules/envolvente-ce3x.md` — Una EDIFICACIÓN entera se quita del plano de un clic, se vuelve a medir, y sale SOLO DE LAS PLANTAS EN LAS Q…
- **48.k** → `.claude/rules/envolvente-ce3x.md` — La envolvente se empieza ya en la OPORTUNIDAD
- **49** → `.claude/rules/placas-catalogos.md` — Un CONJUNTO (equipo con el depósito de ACS dentro) rellena el bloque de ACS solo, y hereda el equipo pero NU…
- **50** → `.claude/rules/envolvente-ce3x.md` — Qué PLANTAS se miden lo marcó una persona, no Catastro
- **51** → `.claude/rules/lotes.md` — Las TARIFAS del verificador viven en SU ficha, y son ORIENTATIVAS
- **52** → `.claude/rules/cee.md` — El BORRADOR para presentar el CEE en el Registro
- **53** → `.claude/rules/expedientes.md` — Las COLUMNAS del listado de expedientes se ELIGEN, y son una lista declarativa
- **54** → `.claude/rules/envolvente-ce3x.md` — Cada cerramiento del plano puede llevar su FOTO REAL, y de ella se cuentan sus huecos
- **55** → `.claude/rules/firma.md` — Autofirma no falla igual en todos los ordenadores, y la app prueba DOS caminos
- **56** → `.claude/rules/documentos.md` — SUBVENCIONES se autoguarda, y sus enums NO pueden ir a MAYÚSCULAS
- **57** → `.claude/rules/placas-catalogos.md` — Un equipo del catálogo se elige por la REFERENCIA DE SU PLACA, no por su nombre comercial.
- **58** → `.claude/rules/placas-catalogos.md` — La PLACA se lee también desde la CALCULADORA, sin expediente detrás.
- **58.b** → `.claude/rules/placas-catalogos.md` — En el catálogo, un ACCESORIO no es una UNIDAD INTERIOR — y el SCOP de calefacción no es el COP de ACS.
- **59** → `.claude/rules/clientes.md` — Una vivienda puede tener DOS propietarios, y el segundo es un DESTINATARIO — no un firmante.
- **60** → `.claude/rules/documentos.md` — La PLACA de la unidad exterior va DENTRO del certificado cuando el SCOP_dhw se justifica por el ANEXO VI
- **61** → `.claude/rules/envolvente-ce3x.md` — El botón que metía su propio EVENTO dentro del POST
- **62** → `.claude/rules/transversal-frontend.md` — Ningún hook por debajo de un `return` condicional, y el BUILD lo comprueba
- **63** → `.claude/rules/firma.md` — Una firma que se VE no siempre CUBRE el documento, y se comprueba antes de dar el verde
- **64** → `.claude/rules/envolvente-ce3x.md` — Los PUENTES TÉRMICOS se MIRAN, ya no se listan
- **65** → `.claude/rules/propuesta.md` — Programar el envío de una propuesta
- **66** → `.claude/rules/envolvente-ce3x.md` — Lo que se REFORMA lleva «- CAMBIA» en el nombre, y SOLO en el nombre
- **67** → `.claude/rules/lotes.md` — El documento viaja ENTERO, y lo firma el apoderado que se ELIGE
- **68** → `.claude/rules/documentacion-fotos.md` — Las fotos suben en TANDA, se pegan con Ctrl+V y se reparten desde un buzón
- **68.b** → `.claude/rules/documentacion-fotos.md` — Las fotos que el cliente manda al WHATSAPP se TRAEN al repartidor con un botón
- **68.c** → `.claude/rules/documentacion-fotos.md` — Las fotos de las VENTANAS van ventana por ventana
- **69** → `.claude/rules/cee.md` — El CEE que entrega el certificador se REVISA antes de darle el visto bueno
- **70** → `.claude/rules/envolvente-ce3x.md` — La COMA y el PUNTO valen igual al teclear una medida, y lo que no es un número NO vale 0
- **71** → `.claude/rules/placas-catalogos.md` — La referencia de la UD. EXTERIOR solo se añade al modelo si DICE algo, y SOLO A PARTIR DE AHORA
- **72** → `.claude/rules/cee-generacion.md` — La aerotermia de la MEDIDA DE MEJORA (y del CEE final) se declara según su UNIDAD TERMINAL y según su ALCANCE
- **73** → `.claude/rules/clientes.md` — El listado de CLIENTES lleva etiquetas de TIPO y un ESTADO, y se filtra por los dos
- **74** → `.claude/rules/instalador-rite.md` — La tabla de CARGAS TÉRMICAS de la Memoria RITE sale de las ESTANCIAS REALES, confirmadas en un popup antes d…
- **75** → `.claude/rules/envolvente-ce3x.md` — Un ADOSADO dentro de una comunidad se DELIMITA a mano: el contorno corta el edificio y lo de fuera es la cas…
- **76** → `.claude/rules/expedientes.md` — Un expediente puede estar RECHAZADO, y es una SALIDA, no un paso del ciclo.
- **77** → `.claude/rules/envolvente-ce3x.md` — El `.cex` se escribe como RESIDENCIAL, PEQUEÑO o GRAN TERCIARIO, y se pregunta como CE3X antes de medir.
- **78** → `.claude/rules/cee-generacion.md` — El USO de cada equipo se cambia en Instalaciones, y la FORMA del registro la decide el COMBUSTIBLE.
- **79** → `.claude/rules/envolvente-ce3x.md` — Un garaje DENTRO de la casa se quita SOLO de su planta, y lo guardado sigue al edificio aunque el lienzo se …
- **80** → `.claude/rules/cee.md` — «Solo asignar» a un certificador EXTERNO no es un encargo: la fase NO pasa a `ASIGNADO`.
- **81** → `.claude/rules/propuesta.md` — La COMISIÓN del partner se expresa en % sobre lo que se le OFRECE AL CLIENTE, y el mensaje de la propuesta l…
- **82** → `.claude/rules/oportunidades.md` — Al ACEPTAR la propuesta, el cliente confirma sus EMISORES, sus PLACAS y su AIRE ACONDICIONADO
- **83** → `.claude/rules/envolvente-ce3x.md` — Cada hueco declara su % de MARCO, la PUERTA elige marco y vidrio, y la CUBIERTA admite LUCERNARIOS
- **84** → `.claude/rules/oportunidades.md` — En la ficha del inmueble del funnel PÚBLICO, las zonas son una PREGUNTA, no una tabla
- **85** → `.claude/rules/propuesta.md` — Los PRESUPUESTOS adjuntados a la propuesta rellenan Datos Económicos, cada uno en SU campo
- **86** → `.claude/rules/cee-generacion.md` — Los AIRES ACONDICIONADOS que confirma el cliente llegan al CEE: la pestaña, el encargo y la envolvente
- **87** → `.claude/rules/cee-generacion.md` — El CEE inicial se GENERA desde las fotos con la skill `generar-cee-inicial`, por las MISMAS funciones que la…
- **88** → `.claude/rules/envolvente-ce3x.md` — Una planta que se MIDE es VIVIENDA para sus forjados, aunque Catastro declare en ella sobre todo un garaje; …
- **89** → `.claude/rules/envolvente-ce3x.md` — Lo que no es vivienda en una planta se PINTA a mano alzada y el motor lo ajusta a los m² de Catastro
- **90** → `.claude/rules/cee.md` — Al subir su `.xml`/`.cex`, el técnico ve la REVISIÓN PREVIA y corrige lo suyo antes de que llegue a Brokergy
- **91** → `.claude/rules/envolvente-ce3x.md` — La VISTA AÉREA del plano de la envolvente es la ortofoto del PNOA (IGN), por teselas que pide el navegador, …
- **92** → `.claude/rules/cee.md` — El técnico tiene UNA página del encargo, y el enlace es SUYO
- **92** → `.claude/rules/cee-generacion.md` — El CEE FINAL de un RES060/RES093 sale de la MEDIDA DE MEJORA del inicial del técnico
- **93** → `.claude/rules/documentos.md` — Una factura de ENTREGA DE MATERIAL o un ANTICIPO no abre la actuación, y el CIFO lo cuenta en «Hitos de la a…
- **94** → `.claude/rules/whatsapp.md` — El nombre del cliente en la AGENDA de WhatsApp lleva su nº de obra
- **95** → `.claude/rules/cee-generacion.md` — La medida de AUTOCONSUMO admite los kWh TECLEADOS, y en un CEE directo es la única forma de tenerla
- **96** → `.claude/rules/envolvente-ce3x.md` — Una PROVINCIA que no está en el desplegable de CE3X impide abrir el `.cex` entero
- **97** → `.claude/rules/cee.md` — En un CEE directo de UN solo certificado, el CEE de ANTES del cliente se carga APARTE, como «CEE anterior de…
- **98** → `.claude/rules/cee.md` — Al cliente se le envían sus CEE firmados + una GUÍA de una página para la deducción del IRPF, de un botón
- **99** → `.claude/rules/oportunidades.md` — Una oportunidad se da de ALTA con lo que el instalador manda por WHATSAPP, con la skill `alta-oportunidad`
- **100** → `.claude/rules/propuesta.md` — El ENLACE para aceptar la propuesta va en un MENSAJE APARTE, después del PDF
- **101** → `.claude/rules/cee.md` — El AGENTE IA es un certificador más
- **102** → `.claude/rules/transversal-backend.md` — Ninguna ruta responde a un ANÓNIMO salvo que sea pública por diseño, y `requireAuth` NO es un guardián
- **103** → `.claude/rules/claude-automatizacion.md` — La LLAVE DE CLAUDE: una cuenta sin contraseña que pulsa los botones de la app
- **103** → `.claude/rules/lotes.md` — El CERTIFICADO CAE emitido se LEE al subirlo y sus códigos van a la factura al S.O.
- **104** → `.claude/rules/lotes.md` — La factura de Brokergy al S.O. se archiva en CONTABILIDAD al generarla y al enviarla
- **105** → `.claude/rules/cee-generacion.md` — Se certifica con CE3X 2.3 y con la 3.1, y por defecto la 3.1
- **106** → `.claude/rules/envolvente-ce3x.md` — El autoconsumo se dimensiona con PVGIS: kWp ⇄ kWh/año y su reparto mensual
- **107** → `.claude/rules/cee.md` — La rejilla del CEE: una columna por cosa, la versión del `.xml` a la vista y «Presentar» solo cuando toca
- **108** → `.claude/rules/envolvente-ce3x.md` — El borrador del CEE que deja el Agente IA lleva su CROQUIS en PDF, junto al `.cex`
- **109** → `.claude/rules/envolvente-ce3x.md` — Lo que hace el Agente IA se REVISA y se CAMBIA en la propia ventana de la envolvente
- **110** → `.claude/rules/cee-generacion.md` — El `.xml` y el PDF oficial del CEE se sacan del `.cex` SIN abrir CE3X
- **111** → `.claude/rules/calculo.md` — En el ahorro RES080 «por vector», la demanda que no cubre ningún generador la pone CE3X con su SISTEMA FICTI…
- **112** → `.claude/rules/envolvente-ce3x.md` — Al hacer un CEE se bajan de la Sede del Catastro los documentos de la parcela, y su CROQUIS POR PLANTAS mand…
- **113** → `.claude/rules/claude-automatizacion.md` — Fran trabaja con Claude por WhatsApp, siempre abierto
- **114** → `.claude/rules/documentos.md` — Una vivienda con VARIOS propietarios que PAGAN la obra: un convenio con todos, un Anexo I por cada uno y, po…
- **115** → `.claude/rules/cee-generacion.md` — El CEE inicial también sale de un VÍDEO de la vivienda, y lo que no se puede saber se PIDE
- **116** → `.claude/rules/cee.md` — El CEE se ENCARGA presentar a una persona de fuera con un enlace sin cuenta
- **117** → `.claude/rules/cee-generacion.md` — En un RES080 se hacen DOS CEE: el INICIAL y el PREVISTO, y lo que cambia el previsto ES la medida del inicial
- **118** → `.claude/rules/placas-catalogos.md` — La POTENCIA de cada equipo va en los datos del CEE, y es la MISMA que la de la Memoria RITE
- **119** → `.claude/rules/envolvente-ce3x.md` — La PIZARRA de la envolvente: se dibuja a mano cómo es de verdad la vivienda, y «✓ Así es como está» le pide …
- **120** → `.claude/rules/placas-catalogos.md` — Una aerotermia se da de alta (o se completa) con TODA su documentación, con la skill `alta-aerotermia`
- **121** → `.claude/rules/infra.md` — Lo que se le manda a Gemini sobre RAZONAMIENTO y TEMPERATURA lo decide `ajustesGemini`, nunca el lector
- **122** → `.claude/rules/catastro.md` — El icono del Catastro abre la ficha por `/api/catastro/sede/:rc`, nunca por el atajo `OVCListaBienes.aspx?rc…
- **123** → `.claude/rules/envolvente-ce3x.md` — Un SÓTANO: sus muros van contra el TERRENO y cada zona lleva de suelo solo su VIVIENDA
- **124** → `.claude/rules/envolvente-ce3x.md` — La FICHA del expediente no pisa la ENVOLVENTE
- **125** → `.claude/rules/claude-automatizacion.md` — Un expediente se JUSTIFICA al terminar la obra con la skill `justificar-expediente`, por las MISMAS rutas qu…
- **126** → `.claude/rules/cee-generacion.md` — Desde el 08/10/2026 se certifica con CE3X 3.2, y el AUTOCONSUMO de cada mes es lo MENOR entre lo que produce…
- **127** → `.claude/rules/cee-generacion.md` — El CEE FINAL de un RES060 se hace COPIANDO el CEE inicial del técnico, con las instalaciones INSTALADAS y el…
- **128** → `.claude/rules/envolvente-ce3x.md` — La ventana de la envolvente no SOLAPA nada a ningún ancho
- **129** → `.claude/rules/envolvente-ce3x.md` — La GUÍA DE TRANSMITANCIAS son los «Estimados según antigüedad y zona climática» de CE3X 3.2, escritos como «…
- **130** → `.claude/rules/placas-catalogos.md` — Un Nº DE SERIE que ya consta en OTRO expediente se AVISA, no se bloquea
- **131** → `.claude/rules/envolvente-ce3x.md` — Los EQUIPOS se marcan en el plano —caldera actual, equipo nuevo, depósito de ACS y unidad exterior— y la uni…
- **132** → `.claude/rules/propuesta.md` — Con los avisos del cliente desviados a otra persona, el TITULAR sigue pudiendo recibir la propuesta
- **133** → `.claude/rules/propuesta.md` — Caldera de BIOMASA (combustible sólido que no es carbón): la deducción del IRPF exige placas solares; el Bon…
- **134** → `.claude/rules/calculo.md` — Con PLACAS en cualquiera de los dos CEE, el ahorro RES080 va POR VECTOR aunque se haya elegido «por uso»
- **135** → `.claude/rules/cee-generacion.md` — En un RES080, cada ventana que CAMBIA resuelve sus PUENTES TÉRMICOS
- **136** → `.claude/rules/propuesta.md` — La oportunidad pasa a ENVIADA con CUALQUIER envío que salga bien, también solo al instalador, y la lista dic…
- **137** → `.claude/rules/documentos.md` — En el CEE final de un RES080 lo que se reforma se IDENTIFICA, y el inicial y el final se casan SIN el «- CAM…
- **138** → `.claude/rules/cee.md` — El CEE se PRESENTA en la sede de la JCCM sin tocar el PC: skill `presentar-cee`
- **139** → `.claude/rules/envolvente-ce3x.md` — El trabajo guardado es la RECETA del `.cex`, y cada `.cex` queda SELLADO
- **140** → `.claude/rules/cee.md` — Un CEE cuyo XML NO VALIDA no se da por bueno, ni se sube, ni se firma, ni se presenta
- **141** → `.claude/rules/lotes.md` — Los FIRMADOS que el S.O. devuelve por CORREO se registran SOLOS, y solo lo limpio
- **142** → `.claude/rules/calculo.md` — El ahorro anual en € paga cada kWh al precio de lo que lo produce
- **143** → `.claude/rules/whatsapp.md` — La RONDA de WhatsApp la hace una TAREA PROGRAMADA de Claude Code y, en FASE 1, solo INFORMA a Fran
- **144** → `.claude/rules/claude-automatizacion.md` — El ASISTENTE DENTRO DE LA APP solo LEE, va por la API y lo pesado se ENCARGA con un clic
- **145** → `.claude/rules/cee-generacion.md` — El botón CE3X pregunta cómo se hace el CEE inicial: con IA o a mano en la envolvente
- **146** → `.claude/rules/claude-automatizacion.md` — «Preséntalo» por WhatsApp: el Claude del servidor PREGUNTA, el PC de Fran PRESENTA
- **147** → `.claude/rules/envolvente-ce3x.md` — Un CUERPO se guarda por DÓNDE está, nunca por el número que le pone Catastro
- **148** → `.claude/rules/cee-generacion.md` — Una CASCADA de aerotermias son VARIOS generadores en el `.cex`, cada uno con SU SCOP y SU potencia, y la dem…
- **149** → `.claude/rules/documentos.md` — «¿Misma dirección que el cliente? → Sí» imprime la dirección del CLIENTE, en vivo; y «Sí» solo se pone si ES…
- **150** → `.claude/rules/transversal-backend.md` — Tabla nueva en `public`: en el MISMO script que la crea, `ENABLE ROW LEVEL SECURITY` (sin policies) y `GRANT…
- **152** → `.claude/rules/cee-generacion.md` — Todo CEE que genera la casa (inicial o final) deja su XML CARGADO en el expediente
- **153** → `.claude/rules/calculo.md` — En una HIBRIDACIÓN el clima del SCOP se ELIGE (cálido o medio) con un botón, y con el medio TODO sale en medio
- **154** → `.claude/rules/propuesta.md` — Hibridación manteniendo la caldera: el cliente recibe por escrito, en un mensaje APARTE, las DOS hipótesis d…
- **155** → `.claude/rules/calculo.md` — El FC (borrador DGPLACE) se calcula con la ficha que TOCA, el f_C UNA vez, el CEF del CEE INICIAL, y nunca s…
- **156** → `.claude/rules/propuesta.md` — La colaboración se VE en la portada y el coste de los servicios es UNA cifra
- **157** → `.claude/rules/clientes.md` — La CARTA DE PAGO del Bono CAE se GENERA al subir el justificante y viaja ADJUNTA al aviso
- **158** → `.claude/rules/claude-automatizacion.md` — Tras la ACEPTACIÓN, el agente revisa la documentación: pide lo que falta o hace el CEE inicial
- **159** → `.claude/rules/lotes.md` — Las INEXACTITUDES del verificador se registran SOLAS como incidencias, y la RESPUESTA se arma al subsanar
- **160** → `.claude/rules/documentos.md` — El apartado 3 del Anexo I (REPRESENTACIÓN) solo se rellena si HAY representante, y entonces COMPLETO y con s…
- **164** → `.claude/rules/transversal-frontend.md` — Lo que ve el CLIENTE se diseña con el ESTILO «carta de pago»
- **165** → `.claude/rules/facturacion.md` — Un presupuesto con PARTIDAS se calcula en UN sitio y su esquema es ADITIVO
- **166** → `.claude/rules/facturacion.md` — Una FACTURA nace BORRADOR, se EMITE con número y desde ahí NO se borra ni se cambia: se RECTIFICA; y cada em…
- **170** → `.claude/rules/facturacion.md` — El cuadro de mando y el cierre trimestral separan a los DOS contribuyentes y todo es ESTIMADO; los gastos se…
- **172** → `.claude/rules/cee.md` — El aviso de «CEE inicial presentado» pide SOLO lo que falta de la obra, y cuando lo presenta la CASA sale SO…
- **172** → `.claude/rules/cee-generacion.md` — CE3X mide la demanda cubierta por los METROS que sirve cada equipo, no por su «Porcentaje»: superficie = úti…
- **173** → `.claude/rules/cee.md` — Con el VISTO BUENO el CEE ya se puede presentar, y el `_REVISAR` de esa fase pasa a su nombre DEFINITIVO
- **175** → `.claude/rules/cee.md` — Todo CEE NACE con Fran de certificador, y el AGENTE IA trabaja SIN figurar en la barra
- **176** → `.claude/rules/claude-automatizacion.md` — La ronda de PRESENTAR de las 21:00: UN «sí» por noche para la lista entera, y un encargo por CEE
- **178** → `.claude/rules/facturacion.md` — La economía de los CAE por el MCP (bono, beneficio, ahorro estimado y verificado, volumen, ventas al S.O.) s…
- **179** → `.claude/rules/calculo.md` — Con los dos `.xml` (los dos con `<EnergiaFinalVectores>`), el ahorro RES080 es la energía final que DECLARAN…

## Documentos por área

### calculo

- `docs/conocimiento/calculo/ahorro-anual-en-euros-con-hibridacion.md` — El ahorro anual en € reparte el consumo por VECTOR: la bomba a precio de luz, la caldera al de su combustible (2026-10-19)
- `docs/conocimiento/calculo/ahorro-res080-metodo-simplificado-por-vector-energetico.md` — Ahorro RES080 — método SIMPLIFICADO, por vector energético (2026-08-10)
- `docs/conocimiento/calculo/bloques-de-viviendas-el-edificio-completo-como-objeto.md` — BLOQUES de viviendas — el edificio completo como objeto (2026-09-11)
- `docs/conocimiento/calculo/el-acs-en-el-mismo-clima-que-la-calefaccion.md` — El ACS se declara en el MISMO clima que la calefacción (2026-10-21)
- `docs/conocimiento/calculo/el-cee-que-manda-y-que-se-avisa-antes-de-generar.md` — El CEE que MANDA, y qué se avisa antes de generar (2026-09-03)
- `docs/conocimiento/calculo/el-coste-del-informe-de-verificacion-ya-en-la-simulacion.md` — El COSTE DEL INFORME DE VERIFICACIÓN, ya en la simulación (2026-09-11)
- `docs/conocimiento/calculo/ficha-ter100-sector-terciario.md` — Ficha TER100 — Sector TERCIARIO (2026-07-30)
- `docs/conocimiento/calculo/ficha-ter173-hibridacion-en-el-terciario.md` — Ficha TER173 — HIBRIDACIÓN en el terciario (2026-09-09)
- `docs/conocimiento/calculo/fichas-con-factor-de-correccion-res060fc-y-res09xfc.md` — Fichas con FACTOR DE CORRECCIÓN: RES060FC y las de hibridación por zona (2026-10-21)
- `docs/conocimiento/calculo/la-d-acs-por-litros-dia-del-certificado.md` — La D_ACS por LITROS/DÍA del certificado (2026-09-13)
- `docs/conocimiento/calculo/precio-cae-al-cliente-100-mwh-y-solo-hacia-adelante.md` — Precio CAE al cliente — 100 €/MWh, y solo hacia adelante (2026-09-09)

### catastro

- `docs/conocimiento/catastro/enlace-a-la-ficha-de-la-sede.md` — El ENLACE a la ficha del inmueble en la Sede (2026-10-07)
- `docs/conocimiento/catastro/modulo-catastro-cambios-profundos.md` — Módulo Catastro — Cambios profundos (2026-05-19)

### cee

- `docs/conocimiento/cee/al-encargar-el-cee-el-cliente-tambien-se-entera.md` — Al encargar el CEE, el CLIENTE también se entera (2026-09-09)
- `docs/conocimiento/cee/deduccion-del-irpf-vale-el-par-de-certificados.md` — Deducción del IRPF — ¿vale el par de certificados? (2026-08-27)
- `docs/conocimiento/cee/el-agente-ia-un-certificador-mas.md` — El AGENTE IA, un certificador más (2026-10-01)
- `docs/conocimiento/cee/el-aviso-de-cee-inicial-presentado-pide-solo-lo-que-falta.md` — El aviso de «CEE inicial presentado» pide SOLO lo que falta, y sale solo cuando presenta la casa (2026-10-25)
- `docs/conocimiento/cee/el-certificador-por-defecto-es-fran.md` — El certificador POR DEFECTO de todo CEE es Fran, y el AGENTE IA trabaja sin figurar en la barra (2026-10-26)
- `docs/conocimiento/cee/el-modulo-cee-del-expediente-en-el-movil-asignar-tecnico.md` — El módulo CEE del expediente, en el MÓVIL — asignar técnico (2026-08-21)
- `docs/conocimiento/cee/la-fecha-de-registro-del-cee-se-lee-del-justificante.md` — La FECHA DE REGISTRO del CEE se LEE del justificante (2026-09-07)
- `docs/conocimiento/cee/la-guia-de-la-deduccion-del-irpf-para-el-cliente.md` — La GUÍA de la deducción del IRPF para el cliente (2026-10-01)
- `docs/conocimiento/cee/la-pagina-del-encargo-del-tecnico.md` — La PÁGINA DEL ENCARGO del técnico (2026-09-30)
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/00-presentar-el-cee-en-el-registro-el-borrador.md` — PRESENTAR el CEE en el Registro — el borrador (2026-09-15)
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/el-visto-bueno-deja-el-cee-listo-para-presentar.md` — El VISTO BUENO deja el CEE listo para presentar — Eva ya no presenta (2026-10-25)
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/encargar-la-presentacion-a-una-persona-de-fuera-presentar-negoci.md` — ENCARGAR la presentación a una persona de fuera — `/presentar/:negocio/:id` (2026-10-06)
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/firmar-el-cee-sin-ventanas-firmar-cee-js.md` — FIRMAR el CEE sin ventanas — `scripts/firmar_cee.js` (2026-10-15)
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/la-calificacion-de-emisiones-no-se-guardaba.md` — La calificación de EMISIONES no se guardaba
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/los-dos-pasos-del-certificador-presentar-cee-id-token-phase.md` — Los DOS PASOS del certificador — `/presentar-cee/:id?token=&phase=`
- `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/presentarlo-sin-tocar-el-pc-skill-presentar-cee.md` — PRESENTARLO sin tocar el PC — skill `presentar-cee` (2026-10-15)
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/00-revisar-el-cee-que-entrega-el-certificador.md` — REVISAR el CEE que entrega el certificador (2026-09-21)
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/con-el-cex-delante-y-la-medida-de-mejora.md` — Con el `.cex` delante, y la MEDIDA DE MEJORA (2026-09-29)
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/el-xml-se-lee-de-supabase-sin-bajar-nada-de-drive.md` — El `.xml` se lee de SUPABASE, sin bajar nada de Drive
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/en-la-app-el-boton-revisar-del-modulo-cee-fase-2-2026-09-29.md` — En la app: el botón «Revisar» del módulo CEE (fase 2, 2026-09-29)
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/la-revision-previa-al-subir-el-tecnico-fase-3-2026-09-30.md` — La revisión PREVIA al subir el técnico (fase 3, 2026-09-30)
- `docs/conocimiento/cee/revisar-el-cee-que-entrega-el-certificador/lo-que-hay-que-saber-del-xml-medido-sobre-462-certificados-reale.md` — Lo que hay que saber del `.xml` (MEDIDO sobre 462 certificados reales)
- `docs/conocimiento/cee/un-cee-incompleto-no-se-da-por-bueno-ni-se-sube.md` — Un CEE «incompleto» no se da por bueno ni se sube (2026-10-19)

### cee-directos

- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/00-cee-directos-el-segundo-negocio.md` — CEE directos — el segundo negocio (2026-08-24)
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/alcance-unico-o-doble.md` — Alcance: ÚNICO o DOBLE
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/asignar-y-reasignar-certificador.md` — Asignar y REASIGNAR certificador
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/descuento-cuestionario-de-climatizacion-y-documentacion-del-cee.md` — Descuento, cuestionario de climatización y documentación del CEE (2026-09-23)
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/drive.md` — Drive
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-candado-de-cobro.md` — El candado de cobro
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-cliente-es-el-de-siempre-y-desde-su-ficha-se-llega-al-cee.md` — El cliente es el de siempre, y desde su ficha se llega al CEE
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-formulario-se-guarda-solo-y-eso-tiene-una-trampa.md` — El formulario se guarda solo, y eso tiene una trampa
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-historico-importado.md` — El histórico importado
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-procedimiento-de-la-oferta-a-la-entrega.md` — El PROCEDIMIENTO: de la oferta a la entrega (2026-10-14)
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-tecnico-acusa-el-encargo-lo-cojo-no-puedo.md` — El técnico ACUSA el encargo: lo cojo / no puedo
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/estados.md` — Estados
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/fuentes-unicas.md` — Fuentes únicas
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-direccion-se-elige-no-se-teclea.md` — La dirección se ELIGE, no se teclea
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-direccion-se-trae-del-catastro-y-se-puede-corregir.md` — La dirección se trae del Catastro, y se puede corregir
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-entrega-al-cliente-se-dispara-sola.md` — La entrega al cliente se dispara SOLA
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-factura-se-emite-contra-el-libro-de-facturas-de-appsheet.md` — La FACTURA se emite contra el libro de facturas de AppSheet (2026-09-23)
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-ficha-del-cee-es-una-linea-de-datos-no-un-formulario.md` — La ficha del CEE es UNA LÍNEA de datos, no un formulario
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-oferta-el-paso-anterior-al-expediente.md` — La OFERTA — el paso anterior al expediente (2026-09-23)
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/lo-que-se-comparte-importado-y-no-copiado.md` — Lo que se comparte, IMPORTADO y no copiado
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/los-avisos-al-cliente-como-en-el-cae.md` — Los avisos al CLIENTE, como en el CAE (2026-09-23)
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/los-ficheros-los-coloca-el-servidor-no-el-navegador.md` — Los FICHEROS los coloca el SERVIDOR, no el navegador
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/numeracion-aaaa-cee-n.md` — Numeración — `{AAAA}CEE_{n}`
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/que-ve-el-certificador-y-que-no.md` — Qué ve el certificador — y qué NO
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/quien-es-el-cliente-y-quien-el-partner.md` — Quién es el CLIENTE y quién el PARTNER
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/seguimiento-del-encargo-que-paso-y-cuando.md` — Seguimiento del encargo — qué pasó y cuándo

### cee-generacion

- `docs/conocimiento/cee-generacion/ce3x-2-3-y-3-1-se-certifica-con-las-dos.md` — CE3X 2.3 y 3.1 — se certifica con las DOS (2026-10-02)
- `docs/conocimiento/cee-generacion/ce3x-3-2-la-vigente-y-el-autoconsumo-mes-a-mes.md` — CE3X 3.2 — la vigente desde el 08/10/2026, y el AUTOCONSUMO mes a mes
- `docs/conocimiento/cee-generacion/el-acs-que-hace-otra-maquina-tambien-se-escribe.md` — El ACS que hace OTRA máquina también se escribe (2026-09-14)
- `docs/conocimiento/cee-generacion/el-xml-del-cee-que-hacemos-se-carga-siempre.md` — El XML del CEE que hacemos se CARGA siempre en el expediente (2026-10-21)
- `docs/conocimiento/cee-generacion/generar-el-cee-con-ia-desde-el-boton-ce3x.md` — Generar el CEE inicial con IA desde el botón CE3X (2026-10-19)
- `docs/conocimiento/cee-generacion/generar-el-cee-inicial-desde-las-fotos-skill-generar-cee-inicial/00-generar-el-cee-inicial-desde-las-fotos-skill-generar-cee-inicial.md` — GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)
- `docs/conocimiento/cee-generacion/generar-el-cee-inicial-desde-las-fotos-skill-generar-cee-inicial/con-un-video-en-vez-de-fotos-y-si-no-se-puede-se-pregunta.md` — Con un VÍDEO en vez de fotos — y si no se puede, se PREGUNTA (2026-10-06)
- `docs/conocimiento/cee-generacion/la-caldera-existente-segun-la-ficha-y-el-deposito-de-la-medida.md` — La caldera EXISTENTE según la ficha, y el depósito de la MEDIDA (2026-10-21)
- `docs/conocimiento/cee-generacion/la-medida-de-mejora-de-una-hibridacion/00-la-medida-de-mejora-de-una-hibridacion.md` — La medida de mejora de una HIBRIDACIÓN (2026-09-16)
- `docs/conocimiento/cee-generacion/la-medida-de-mejora-de-una-hibridacion/el-cee-final-de-un-res060-copiando-el-inicial.md` — El CEE FINAL de un RES060: se COPIA el inicial (2026-10-08)
- `docs/conocimiento/cee-generacion/la-medida-de-mejora-de-una-hibridacion/el-cee-final-desde-la-medida-de-mejora-del-inicial-del-tecnico.md` — El CEE FINAL desde la MEDIDA DE MEJORA del inicial del técnico (2026-09-30)
- `docs/conocimiento/cee-generacion/la-medida-de-mejora-de-una-hibridacion/el-cee-final-se-hace-copiando-el-inicial.md` — El CEE FINAL se hace COPIANDO el inicial (2026-09-13)
- `docs/conocimiento/cee-generacion/la-medida-de-mejora-de-una-hibridacion/y-el-cee-final-igual.md` — Y el CEE FINAL, igual (2026-09-16)
- `docs/conocimiento/cee-generacion/la-medida-del-previsto-res080-va-autocontenida.md` — La medida del PREVISTO (RES080) va AUTOCONTENIDA, no como «Nuevo Edificio» (2026-10-10)
- `docs/conocimiento/cee-generacion/los-puentes-de-las-ventanas-que-cambian.md` — Los PUENTES TÉRMICOS de las ventanas que CAMBIAN (RES080, 2026-10-05)
- `docs/conocimiento/cee-generacion/una-cascada-son-varios-generadores-en-el-cex.md` — Una CASCADA son VARIOS generadores en el `.cex`, a partes iguales (2026-10-20)
- `docs/conocimiento/cee-generacion/y-llega-al-cee-la-pestana-el-encargo-y-la-envolvente.md` — Y llega al CEE: la pestaña, el encargo y la envolvente (2026-09-29)

### certificadores-app

- `docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md` — La app de certificadores — cee.brokergy.es (2026-10-24)
- `docs/conocimiento/certificadores-app/alta-directa-google-y-email.md` — El alta: al momento, con Google o con el email (2026-10-24)
- `docs/conocimiento/certificadores-app/desplegar-cee-brokergy-es.md` — Desplegar cee.brokergy.es (2026-10-24)
- `docs/conocimiento/certificadores-app/documentos-de-la-obra-visor-y-cex-en-cuarentena.md` — Los documentos de la obra: visor, firmar desde el visor, versiones y el `.cex` en cuarentena (2026-10-26)
- `docs/conocimiento/certificadores-app/el-cee-de-una-obra-encargo-calificacion-entrega-y-firma.md` — El CEE de una obra: el encargo, la calificación en el PC, el aviso, la entrega y la firma (2026-10-25)
- `docs/conocimiento/certificadores-app/fase-5-fuera-enlace-corto-y-fachada.md` — Sin la fase 5, el enlace corto, la fachada propuesta y la numeración desde el 1 (2026-10-26)
- `docs/conocimiento/certificadores-app/fotos-opcionales-y-equipo-generico.md` — Las fotos opcionales («Ahora no») y el equipo genérico con su antigüedad (2026-10-25)
- `docs/conocimiento/certificadores-app/la-obra-sin-scroll-indice-y-fotos-a-mano.md` — La obra sin tanto scroll: el índice «Ir a…» y las fotos siempre a mano (2026-10-26)
- `docs/conocimiento/certificadores-app/lo-que-ha-visto-la-ia.md` — «Lo que ha visto la IA» — la fase 5 de la ficha (2026-10-25)
- `docs/conocimiento/certificadores-app/menu-lateral-y-partes-de-la-obra.md` — El menú lateral y las partes de la obra (2026-10-26)
- `docs/conocimiento/certificadores-app/seguridad-de-la-app.md` — La seguridad de la app de certificadores, antes de salir (2026-10-24)

### claude-automatizacion

- `docs/conocimiento/claude-automatizacion/el-asistente-de-fran-por-whatsapp-canal-siempre-abierto.md` — El ASISTENTE de Fran por WhatsApp — canal siempre abierto (2026-10-05)
- `docs/conocimiento/claude-automatizacion/el-asistente-dentro-de-la-app.md` — El ASISTENTE dentro de la app — botón flotante, API de Anthropic y encargos al Claude del WhatsApp (2026-10-19)
- `docs/conocimiento/claude-automatizacion/el-cee-inicial-por-la-api-banco-de-pruebas-y-coste.md` — El CEE inicial por la API de Claude: banco de pruebas y coste medido (2026-10-19)
- `docs/conocimiento/claude-automatizacion/justificar-un-expediente-al-terminar-la-obra.md` — JUSTIFICAR un expediente al terminar la obra — skill `justificar-expediente` (2026-10-08)
- `docs/conocimiento/claude-automatizacion/presentar-desde-el-whatsapp-con-el-pc.md` — «Preséntalo» por WhatsApp: el Claude del servidor pregunta, el PC de Fran presenta (2026-10-19)
- `docs/conocimiento/claude-automatizacion/tras-la-aceptacion-el-agente-revisa-y-pide-lo-que-falta.md` — Tras la ACEPTACIÓN, el agente revisa la documentación y pide lo que falta, o hace el CEE inicial (2026-10-22)

### clientes

- `docs/conocimiento/clientes/confirmacion-de-cobro-el-formulario-del-final.md` — Confirmación de cobro — el formulario del final (2026-09-07)
- `docs/conocimiento/clientes/el-aviso-lo-recibe-el-comercial-o-el-tecnico.md` — El aviso lo recibe el COMERCIAL o el TÉCNICO (2026-09-09)
- `docs/conocimiento/clientes/el-mapa-del-escaparate-ensena-todas-las-obras.md` — El MAPA del escaparate enseña TODAS las obras (2026-10-19)
- `docs/conocimiento/clientes/los-avisos-de-sus-clientes-al-partner.md` — Los avisos de sus clientes, al PARTNER (2026-10-15)
- `docs/conocimiento/clientes/modulo-prescriptores-novedades.md` — Módulo Prescriptores — Novedades (2026-03-26)
- `docs/conocimiento/clientes/patron-de-modales-clientes-y-prescriptores.md` — Patrón de Modales (Clientes y Prescriptores)
- `docs/conocimiento/clientes/una-vivienda-puede-tener-dos-propietarios.md` — Una vivienda puede tener DOS propietarios (2026-09-17)

### consultas

- `docs/conocimiento/consultas/bono-cae-no-se-resta-y-no-hay-resolucion.md` — Bono CAE: no se resta de la deducción del IRPF y no hay «resolución» (26/10/2026)

### documentacion-fotos

- `docs/conocimiento/documentacion-fotos/el-anexo-fotografico-de-un-res080-ve-la-envolvente.md` — El Anexo Fotográfico de un RES080 ve la ENVOLVENTE (2026-09-07)
- `docs/conocimiento/documentacion-fotos/el-bloque-del-parte-sin-las-fotos-no-hay-certificado.md` — El bloque del parte: sin las fotos, no hay certificado
- `docs/conocimiento/documentacion-fotos/el-boton-fotos-del-expediente-abre-el-gestor-de-documentacion.md` — El botón «Fotos» del expediente abre el gestor de DOCUMENTACIÓN
- `docs/conocimiento/documentacion-fotos/el-buzon-medido.md` — El buzón, medido (2026-09-21)
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/00-el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir.md` — El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/ctrl-v-pega-en-el-apartado-que-senala-el-raton.md` — Ctrl+V pega en el apartado que señala el ratón
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/dos-huecos-del-alcance.md` — Dos huecos del alcance
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/el-buzon-se-sueltan-todas-y-se-reparten.md` — El BUZÓN: se sueltan todas y se reparten
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/la-subida-va-en-tanda-no-foto-a-foto.md` — La subida va en TANDA, no foto a foto
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/las-ventanas-ventana-por-ventana.md` — Las VENTANAS, ventana por ventana (2026-09-30)
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/pedir-la-foto-que-falta-desde-la-foto-que-falta.md` — Pedir la foto que falta, desde la foto que falta
- `docs/conocimiento/documentacion-fotos/el-gestor-de-fotografias-subir-en-tanda-pegar-y-repartir/traer-las-fotos-del-whatsapp-al-repartidor.md` — Traer las fotos del WHATSAPP al repartidor (2026-09-30)
- `docs/conocimiento/documentacion-fotos/medio-minuto-de-espera-no-puede-ser-una-pantalla-quieta.md` — Medio minuto de espera no puede ser una pantalla quieta (2026-09-22)
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/00-modulo-documentacion-fotografica-superficie-unificada.md` — Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/alcance-documental-a-cada-expediente-se-le-pide-lo-suyo.md` — Alcance documental — a cada expediente se le pide LO SUYO (2026-08-11)
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/almacenamiento-incremental-sin-esquema-nuevo.md` — Almacenamiento (incremental, sin esquema nuevo)
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/aviso-al-staff-cuando-suben-documentacion.md` — Aviso al staff cuando suben documentación (2026-07-30)
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/checklist-por-fases-computado-no-persistido.md` — Checklist por fases (computado, NO persistido)
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/componente-nucleo-docsmanager.md` — Componente núcleo: `DocsManager`
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/el-enlace-del-cliente-se-usa-con-el-movil.md` — El enlace del cliente se usa CON EL MÓVIL (2026-08-11)
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/endpoints.md` — Endpoints
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/migracion-sql-ya-en-produccion.md` — Migración SQL (ya en producción)
- `docs/conocimiento/documentacion-fotos/modulo-documentacion-fotografica-superficie-unificada/notificacion-de-rechazo.md` — Notificación de rechazo
- `docs/conocimiento/documentacion-fotos/para-el-certificado-o-para-el-expediente-no-es-lo-mismo.md` — Para el CERTIFICADO o para el EXPEDIENTE: no es lo mismo (2026-09-21)

### documentos

- `docs/conocimiento/documentos/convenio-de-cesion-se-firma-antes-de-terminar-la-obra.md` — Convenio de Cesión — se firma ANTES de terminar la obra (2026-08-12)
- `docs/conocimiento/documentos/el-certificado-res080-con-ventanas-hoja-propia-y-fichas.md` — El Certificado RES080 con VENTANAS: la comparativa en hoja propia y las fichas del marco y del vidrio (2026-10-13)
- `docs/conocimiento/documentos/el-cifo-en-pdf-las-hojas-son-fijas-y-hay-que-medirlas.md` — El CIFO en PDF — las hojas son FIJAS y hay que medirlas (2026-08-25)
- `docs/conocimiento/documentos/hitos-de-la-actuacion-la-factura-que-no-abre-la-obra.md` — HITOS DE LA ACTUACIÓN — la factura que NO abre la obra (2026-09-30)
- `docs/conocimiento/documentos/la-placa-de-la-unidad-exterior-dentro-del-certificado.md` — La PLACA de la unidad exterior, dentro del certificado (2026-09-17)
- `docs/conocimiento/documentos/la-representacion-del-titular-en-el-anexo-i.md` — La REPRESENTACIÓN del titular en el Anexo I: poder notarial u otro documento (2026-10-22)
- `docs/conocimiento/documentos/las-coordenadas-utm-se-rotulan-etrs89-huso-30-n.md` — Las coordenadas UTM se rotulan «ETRS89 · huso 30 N» (2026-10-22)
- `docs/conocimiento/documentos/las-fichas-y-el-anexo-i-se-rellenan-ya-no-se-redibujan.md` — Las FICHAS y el ANEXO I se RELLENAN, ya no se redibujan (2026-09-08)
- `docs/conocimiento/documentos/lo-que-el-flag-esconde-y-lo-que-mayusculas-borra.md` — Lo que el FLAG esconde y lo que MAYÚSCULAS borra (2026-09-16)
- `docs/conocimiento/documentos/modulo-documentos-novedades.md` — Módulo Documentos — Novedades (2026-04-08)
- `docs/conocimiento/documentos/quien-ejecuta-la-obra-y-quien-firma-ante-industria.md` — Quién EJECUTA la obra y quién FIRMA ante Industria (2026-08-26)
- `docs/conocimiento/documentos/un-requerimiento-vuelve-a-pedir-la-firma-del-anexo-i-y-del-conve.md` — Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio (2026-09-04)

### envolvente-ce3x

- `docs/conocimiento/envolvente-ce3x/autoconsumo-con-pvgis-kwp-kwh-ano-y-su-reparto-mensual.md` — AUTOCONSUMO con PVGIS — kWp ⇄ kWh/año y su reparto mensual (2026-10-02)
- `docs/conocimiento/envolvente-ce3x/deshacer-en-la-envolvente-y-quien-puede-leer-la-placa.md` — DESHACER en la envolvente, y quién puede leer la placa (2026-09-16)
- `docs/conocimiento/envolvente-ce3x/el-boton-que-metia-su-propio-evento-dentro-del-post.md` — El botón que metía su propio EVENTO dentro del POST (2026-09-18)
- `docs/conocimiento/envolvente-ce3x/el-cex-de-la-envolvente-donde-acaba-y-con-que-transmitancias.md` — El `.cex` de la envolvente: dónde acaba y con qué transmitancias (2026-09-13)
- `docs/conocimiento/envolvente-ce3x/el-croquis-de-la-vivienda/el-croquis-a-mano-alzada-se-dice-donde-los-m-los-pone-catastro.md` — El CROQUIS a mano alzada — se dice DÓNDE, los m² los pone Catastro (2026-09-29)
- `docs/conocimiento/envolvente-ce3x/el-croquis-de-la-vivienda/el-croquis-catastral-por-plantas-de-la-sede.md` — El CROQUIS CATASTRAL POR PLANTAS, de la Sede (2026-10-05)
- `docs/conocimiento/envolvente-ce3x/el-croquis-de-la-vivienda/el-croquis-se-propone-solo.md` — El croquis se PROPONE solo (2026-09-30)
- `docs/conocimiento/envolvente-ce3x/el-croquis-de-la-vivienda/y-el-contorno-del-adosado-desde-el-mismo-enlace.md` — Y el CONTORNO del ADOSADO, desde el mismo enlace (2026-10-01)
- `docs/conocimiento/envolvente-ce3x/el-croquis-de-la-vivienda/y-se-puede-pintar-desde-el-movil-viendolo-aqui-en-tiempo-real.md` — Y se puede PINTAR DESDE EL MÓVIL, viéndolo aquí en tiempo real (2026-09-29)
- `docs/conocimiento/envolvente-ce3x/el-croquis-marca-los-huecos-que-se-sustituyen.md` — El CROQUIS marca los huecos que se SUSTITUYEN (2026-10-12)
- `docs/conocimiento/envolvente-ce3x/el-numero-de-un-cuerpo-de-catastro-no-es-estable.md` — El número de un CUERPO de Catastro («_part3») no es estable: se guarda por DÓNDE está (2026-10-20)
- `docs/conocimiento/envolvente-ce3x/el-plano-de-la-envolvente-lo-que-hace-falta-ver-para-decidir/00-el-plano-de-la-envolvente-lo-que-hace-falta-ver-para-decidir.md` — El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)
- `docs/conocimiento/envolvente-ce3x/el-plano-de-la-envolvente-lo-que-hace-falta-ver-para-decidir/la-coma-y-el-punto-valen-igual-al-teclear-una-medida.md` — La COMA y el PUNTO valen igual al teclear una medida (2026-09-21)
- `docs/conocimiento/envolvente-ce3x/el-plano-de-la-envolvente-lo-que-hace-falta-ver-para-decidir/la-geometria-se-puede-corregir-y-eso-se-mide-y-se-declara.md` — La GEOMETRÍA se puede corregir, y eso se mide y se declara (2026-09-14)
- `docs/conocimiento/envolvente-ce3x/el-plano-de-la-envolvente-lo-que-hace-falta-ver-para-decidir/la-pantalla-se-parece-a-ce3x-y-el-plano-a-un-plano-de-obra.md` — La pantalla se parece a CE3X, y el plano a un plano de obra (2026-09-13)
- `docs/conocimiento/envolvente-ce3x/el-plano-de-la-envolvente-lo-que-hace-falta-ver-para-decidir/la-ventana-sin-solapes-barra-rotulos-tiras-y-panel.md` — La ventana sin SOLAPES: barra, rótulos, tiras y panel (2026-10-08)
- `docs/conocimiento/envolvente-ce3x/el-plano-de-la-envolvente-lo-que-hace-falta-ver-para-decidir/los-equipos-en-el-plano-y-el-plano-de-cubierta.md` — Los EQUIPOS en el plano, y el PLANO DE CUBIERTA (2026-10-09)
- `docs/conocimiento/envolvente-ce3x/el-plano-de-la-envolvente-lo-que-hace-falta-ver-para-decidir/una-medida-por-defecto-se-puede-dar-por-buena-de-un-clic.md` — Una medida por defecto se puede dar por BUENA de un clic
- `docs/conocimiento/envolvente-ce3x/la-envolvente-en-terciario-pequeno-y-gran-terciario.md` — La envolvente en TERCIARIO: pequeño y gran terciario (2026-09-28)
- `docs/conocimiento/envolvente-ce3x/la-envolvente-vale-tambien-para-los-cee-directos.md` — La envolvente vale también para los CEE DIRECTOS (2026-09-16)
- `docs/conocimiento/envolvente-ce3x/la-ficha-del-expediente-ya-no-pisa-la-envolvente.md` — La FICHA del expediente ya no pisa la ENVOLVENTE (2026-10-07)
- `docs/conocimiento/envolvente-ce3x/la-foto-real-de-cada-cerramiento.md` — La FOTO REAL de cada cerramiento (2026-09-15)
- `docs/conocimiento/envolvente-ce3x/la-receta-del-cex-y-su-sello.md` — La RECETA del `.cex` y su SELLO: la ventana y la skill escriben el mismo fichero (2026-10-15)
- `docs/conocimiento/envolvente-ce3x/lo-que-el-certificador-no-tiene-que-ver-ni-tocar.md` — Lo que el CERTIFICADOR no tiene que ver ni tocar (2026-09-14)
- `docs/conocimiento/envolvente-ce3x/lo-que-se-reforma-en-la-envolvente-cambia.md` — Lo que se REFORMA en la envolvente: «- CAMBIA» (2026-09-19)
- `docs/conocimiento/envolvente-ce3x/los-administrativos-se-corrigen-desde-la-ventana-en-su-fuente.md` — Los administrativos se CORRIGEN desde la ventana, en su fuente (2026-09-14)
- `docs/conocimiento/envolvente-ce3x/los-puentes-termicos-se-miran-ya-no-se-listan.md` — Los PUENTES TÉRMICOS se miran, ya no se listan (2026-09-19)
- `docs/conocimiento/envolvente-ce3x/los-valores-por-defecto-de-ce3x-3-2-por-epoca-y-zona.md` — Los valores POR DEFECTO de CE3X 3.2, por época y zona (2026-10-08)
- `docs/conocimiento/envolvente-ce3x/que-plantas-se-miden-lo-marco-una-persona-no-catastro/00-que-plantas-se-miden-lo-marco-una-persona-no-catastro.md` — Qué PLANTAS se miden lo marcó una persona, no Catastro (2026-09-14)
- `docs/conocimiento/envolvente-ce3x/que-plantas-se-miden-lo-marco-una-persona-no-catastro/la-cartografia-del-catastro-debajo-del-plano.md` — La CARTOGRAFÍA del Catastro, debajo del plano (2026-09-14)
- `docs/conocimiento/envolvente-ce3x/que-plantas-se-miden-lo-marco-una-persona-no-catastro/la-vista-aerea-satelite-debajo-del-plano-y-bajo-el-3d.md` — La VISTA AÉREA (satélite), debajo del plano y bajo el 3D (2026-09-30)
- `docs/conocimiento/envolvente-ce3x/que-plantas-se-miden-lo-marco-una-persona-no-catastro/las-imagenes-del-certificado-se-ven-solas-y-se-pueden-sustituir.md` — Las IMÁGENES del certificado se ven solas, y se pueden sustituir
- `docs/conocimiento/envolvente-ce3x/un-certificador-firma-como-persona-y-puede-ejercer-en-una-empres.md` — Un certificador FIRMA como persona, y puede ejercer en una empresa (2026-09-15)
- `docs/conocimiento/envolvente-ce3x/un-garaje-dentro-de-la-casa-y-lo-que-se-movia-al-volver-a-medir.md` — Un GARAJE dentro de la casa, y lo que se movía al volver a medir (2026-09-28)
- `docs/conocimiento/envolvente-ce3x/un-sotano-muros-contra-el-terreno-y-suelos-solo-de-la-vivienda.md` — Un SÓTANO: muros contra el TERRENO y suelos solo de la VIVIENDA (2026-10-01)
- `docs/conocimiento/envolvente-ce3x/una-edificacion-entera-se-quita-de-un-clic.md` — Una EDIFICACIÓN entera se quita de un clic (2026-09-16 · POR PLANTA 2026-09-21)

### expedientes

- `docs/conocimiento/expedientes/carpetas-de-drive-por-estado.md` — Carpetas de Drive por estado (2026-07-24)
- `docs/conocimiento/expedientes/el-listado-de-expedientes-las-columnas-se-eligen.md` — El listado de expedientes: las columnas se ELIGEN (2026-09-15)
- `docs/conocimiento/expedientes/modulo-lifecycle-de-expedientes.md` — Módulo Lifecycle de Expedientes (2026-05-20)

### facturacion

- `docs/conocimiento/facturacion/cuadro-de-mando-y-trimestres-en-pantalla.md` — Cuadro de mando y trimestres en pantalla: el armazón de Facturación, «Hoy» y «Trimestres» (2026-10-24)
- `docs/conocimiento/facturacion/economia-cae-por-el-mcp.md` — La economía de los CAE, por el MCP: `get_expediente`, `volumen_cae` y `listar_facturas` CAE (2026-10-27)
- `docs/conocimiento/facturacion/facturas-desde-la-app.md` — Facturas desde la app: series ING y FML, rectificativas y VERI*FACTU (2026-10-24)
- `docs/conocimiento/facturacion/presupuestos-con-partidas.md` — Presupuestos con PARTIDAS: la pestaña Facturación sustituye a AppSheet (2026-10-24)
- `docs/conocimiento/facturacion/trimestres-y-contabilidad.md` — Cuadro de mando y cierre trimestral: dos contribuyentes, gastos leídos de Drive y el paquete para la gestoría (2026-10-24)

### facturas

- `docs/conocimiento/facturas/facturacion-del-certificador-conciliacion-mensual.md` — Facturación del certificador — conciliación mensual (2026-08-03)
- `docs/conocimiento/facturas/facturas-de-la-obra-ocr-y-filtro-previo-de-incidencias.md` — Facturas de la obra — OCR y filtro previo de incidencias (2026-08-03)

### firma

- `docs/conocimiento/firma/autofirma-no-falla-igual-en-todos-los-ordenadores.md` — Autofirma no falla igual en todos los ordenadores (2026-09-16)
- `docs/conocimiento/firma/la-firma-a-mano-se-hace-con-el-movil.md` — La firma A MANO se hace CON EL MÓVIL (2026-09-06)
- `docs/conocimiento/firma/una-firma-que-se-ve-no-siempre-cubre-el-documento.md` — Una firma que se VE no siempre CUBRE el documento (2026-09-18)
- `docs/conocimiento/firma/y-si-se-esta-en-el-ordenador-la-firma-se-pasa-al-movil-con-un-qr.md` — Y si se está en el ORDENADOR, la firma se pasa al MÓVIL con un QR

### general

- `docs/conocimiento/general/arquitectura-de-ficheros-clave.md` — Arquitectura de Ficheros Clave
- `docs/conocimiento/general/cabecera-del-claude-md-original.md` — CLAUDE.md — Instrucciones para Agentes de IA
- `docs/conocimiento/general/documentacion-adicional.md` — Documentación Adicional
- `docs/conocimiento/general/estado-actual-del-proyecto-actualizado-2026-05-25.md` — Estado Actual del Proyecto (Actualizado 2026-05-25)
- `docs/conocimiento/general/modulos-implementados-y-estables.md` — Módulos implementados y estables
- `docs/conocimiento/general/regla-de-oro-de-desarrollo.md` — ⚠️ Regla de oro de desarrollo
- `docs/conocimiento/general/skills-una-sola-fuente-para-code-y-cowork.md` — ⚠️ Skills: UNA sola fuente para Code y Cowork
- `docs/conocimiento/general/variables-de-entorno-requeridas.md` — Variables de Entorno Requeridas

### infra

- `docs/conocimiento/infra/la-api-de-gemini-va-en-nivel-de-pago.md` — La API de Gemini va en NIVEL DE PAGO (2026-09-01)
- `docs/conocimiento/infra/razonamiento-y-temperatura-segun-el-modelo.md` — El RAZONAMIENTO y la TEMPERATURA de Gemini, según el modelo (2026-10-07)

### instalador-rite

- `docs/conocimiento/instalador-rite/al-instalador-se-le-pide-todo-de-una-vez.md` — Al instalador se le pide TODO de una vez (2026-08-27)
- `docs/conocimiento/instalador-rite/el-certificado-rite-se-lee-al-subirlo.md` — El Certificado RITE se LEE al subirlo (2026-09-03)

### lotes

- `docs/conocimiento/lotes/armar-el-lote-propuestas-por-antiguedad-y-por-instalador.md` — Armar el lote: filtro por instalador y PROPUESTAS por antigüedad y por instalador (2026-10-27)
- `docs/conocimiento/lotes/cuando-marwen-no-responde-el-envio-por-api.md` — Cuando MARWEN no responde: el envío por API dice de quién es el fallo (2026-10-15)
- `docs/conocimiento/lotes/el-anexo-del-miteco-por-actuacion.md` — El ANEXO del MITECO por actuación (2026-09-01)
- `docs/conocimiento/lotes/el-paquete-de-cada-actuacion-renombrar-a-e-n-y-zipear.md` — El PAQUETE de cada actuación — renombrar a E{n} y zipear (2026-09-08)
- `docs/conocimiento/lotes/el-registro-miteco-y-los-requerimientos-del-gestor.md` — El Nº de REGISTRO del MITECO en el lote, y los requerimientos del Gestor (2026-10-27)
- `docs/conocimiento/lotes/el-total-que-nos-ingresa-el-so-y-el-cobro.md` — El TOTAL que nos ingresa el S.O., y marcarlo COBRADO (2026-10-15)
- `docs/conocimiento/lotes/el-zip-que-se-sube-a-becae-es-el-mismo-paquete-del-miteco.md` — El ZIP que se sube a beCAE es el MISMO paquete del MITECO (2026-09-09)
- `docs/conocimiento/lotes/las-cifras-del-lote-se-leen-de-sus-documentos.md` — Las cifras del lote se LEEN de sus documentos (2026-09-01)
- `docs/conocimiento/lotes/las-inexactitudes-del-verificador-se-registran-y-la-respuesta-se-arma-sola.md` — Las INEXACTITUDES del verificador se registran solas, y la RESPUESTA se arma al subsanar (2026-10-22)
- `docs/conocimiento/lotes/las-tarifas-del-verificador-en-su-ficha.md` — Las TARIFAS del verificador, en su ficha (2026-09-14)
- `docs/conocimiento/lotes/los-firmados-del-so-llegan-por-correo-y-se-registran-solos.md` — Los FIRMADOS del S.O. llegan por CORREO y se registran solos (2026-10-19)
- `docs/conocimiento/lotes/pedirle-cosas-al-sujeto-obligado-desde-el-cuadro-de-mando.md` — Pedirle cosas al SUJETO OBLIGADO desde el cuadro de mando (2026-09-01 · ofertas 2026-09-10)
- `docs/conocimiento/lotes/quien-firma-por-el-sujeto-obligado-y-la-ficha-que-no-viajaba.md` — Quién FIRMA por el SUJETO OBLIGADO, y la ficha que no viajaba (2026-09-19)

### oportunidades

- `docs/conocimiento/oportunidades/al-aceptar-el-cliente-confirma-sus-emisores-placas-y-aires.md` — Al ACEPTAR, el cliente confirma sus EMISORES, PLACAS y AIRES (2026-09-29)
- `docs/conocimiento/oportunidades/alta-de-oportunidad-desde-whatsapp-skill-alta-oportunidad.md` — Alta de OPORTUNIDAD desde WhatsApp — skill `alta-oportunidad` (2026-10-01)
- `docs/conocimiento/oportunidades/el-mismo-vecino-volviendo-al-funnel-no-estrena-oportunidad.md` — El mismo vecino volviendo al funnel NO estrena oportunidad (2026-09-11)
- `docs/conocimiento/oportunidades/nueva-simulacion-con-cee-inicial-y-final.md` — Nueva simulación con CEE inicial y final (2026-08-10)
- `docs/conocimiento/oportunidades/tienes-placas-solares-se-pregunta-una-vez-y-acompana-al-inmueble.md` — ¿Tienes placas solares? — se pregunta UNA vez y acompaña al inmueble (2026-09-07)

### placas-catalogos

- `docs/conocimiento/placas-catalogos/aerosun-advanced-es-hm-y-confort-plus-es-hl.md` — AEROSUN: la ADVANCED es la serie HM; la CONFORT PLUS, la HL (2026-10-14)
- `docs/conocimiento/placas-catalogos/el-catalogo-de-ventanas-marcos-y-vidrios.md` — El CATÁLOGO DE VENTANAS — marcos y vidrios (2026-09-07)
- `docs/conocimiento/placas-catalogos/el-n-de-serie-de-una-placa-dos-lecturas-y-lo-decide-el-codigo.md` — El Nº DE SERIE de una placa: dos lecturas, y lo decide el código (2026-09-30)
- `docs/conocimiento/placas-catalogos/el-n-de-serie-repetido-se-avisa.md` — El Nº DE SERIE repetido entre expedientes se AVISA (2026-10-08)
- `docs/conocimiento/placas-catalogos/la-ficha-del-catalogo-cuando-son-varios-papeles.md` — La ficha del catálogo cuando son VARIOS papeles (2026-09-11)
- `docs/conocimiento/placas-catalogos/la-placa-de-la-caldera-se-lee-con-ia.md` — La PLACA de la caldera se lee con IA (2026-09-13)
- `docs/conocimiento/placas-catalogos/la-placa-la-lee-tambien-el-certificador.md` — La PLACA la lee también el CERTIFICADOR
- `docs/conocimiento/placas-catalogos/las-tres-placas-de-la-obra-de-un-boton/00-las-tres-placas-de-la-obra-de-un-boton.md` — Las TRES placas de la obra, de un botón (2026-09-15)
- `docs/conocimiento/placas-catalogos/las-tres-placas-de-la-obra-de-un-boton/lo-que-cuesta-medido-15-09-2026.md` — Lo que cuesta, medido (15/09/2026)
- `docs/conocimiento/placas-catalogos/un-conjunto-resuelve-el-acs-solo.md` — Un CONJUNTO resuelve el ACS solo (2026-09-13)

### propuesta

- `docs/conocimiento/propuesta/biomasa-la-deduccion-del-irpf-exige-placas-solares.md` — Caldera de BIOMASA: la deducción del IRPF exige placas solares; el CAE no (2026-10-10)
- `docs/conocimiento/propuesta/enviada-con-cualquier-envio-y-a-quien-le-ha-llegado.md` — ENVIADA con cualquier envío, y la lista dice A QUIÉN le ha llegado (2026-10-14)
- `docs/conocimiento/propuesta/hibridacion-caldera-retirada-o-mantenida.md` — Hibridación: la propuesta enseña el bono RETIRANDO y MANTENIENDO la caldera (2026-10-01)
- `docs/conocimiento/propuesta/la-colaboracion-y-el-coste-de-los-servicios.md` — La colaboración se ve en la portada, y el coste de los servicios es UNO (2026-10-22)
- `docs/conocimiento/propuesta/la-propuesta-al-titular-aunque-los-avisos-vayan-al-instalador.md` — La propuesta al TITULAR, aunque sus avisos vayan al instalador (2026-10-10)
- `docs/conocimiento/propuesta/presupuesto-estimado-la-propuesta-lo-dice-y-dice-a-que-afecta.md` — Presupuesto ESTIMADO — la propuesta lo dice, y dice a qué afecta (2026-09-03)
- `docs/conocimiento/propuesta/programar-el-envio-de-una-propuesta.md` — PROGRAMAR el envío de una propuesta (2026-09-19)
- `docs/conocimiento/propuesta/versiones-de-la-propuesta.md` — Versiones de la PROPUESTA (2026-08-25)

### seguimiento

- `docs/conocimiento/seguimiento/aviso-de-cee-entregados-y-sin-revisar.md` — Aviso de CEE entregados y sin revisar
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/00-parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente.md` — Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10)
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/el-parte-dentro-de-la-app-pestana-seguimiento.md` — El parte DENTRO de la app — pestaña "Seguimiento"
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/el-plazo-decide-si-se-reclama-nunca-si-se-ve.md` — El PLAZO decide si se RECLAMA, nunca si se VE (2026-09-07)
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/encargar-el-cee-desde-la-propia-cola.md` — Encargar el CEE desde la propia cola (2026-09-23)
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/envio-en-bloque-seguimientolote-js-implementation-backend-servic.md` — Envío en BLOQUE — [seguimientoLote.js](implementation/backend/services/seguimientoLote.js)
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/los-enlaces-de-accion-acciontoken-js-implementation-backend-util.md` — Los enlaces de acción — [accionToken.js](implementation/backend/utils/accionToken.js) + [routes/acciones.js](implementation/backend/routes/acciones.js)
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/los-once-bloques-seguimientoradar-js-implementation-backend-serv.md` — Los once bloques — [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js)

### transversal-backend

- `docs/conocimiento/transversal-backend/tabla-nueva-en-supabase-grant-y-rls.md` — Tabla nueva en Supabase: GRANT a `service_role` y RLS en el mismo script (2026-10-20)

### transversal-frontend

- `docs/conocimiento/transversal-frontend/el-menu-lateral.md` — El menú lateral (2026-08-24)
- `docs/conocimiento/transversal-frontend/estilo-carta-de-pago-lo-que-ve-el-cliente.md` — El ESTILO «carta de pago»: así se diseña lo que ve el CLIENTE (2026-10-24)
- `docs/conocimiento/transversal-frontend/y-con-el-plano-por-fin-traido-la-ventana-se-caia-entera-react-31.md` — Y con el plano por fin traído, la ventana se caía entera (React #310)
- `docs/conocimiento/transversal-frontend/y-el-desplegable-se-leia-blanco-sobre-blanco.md` — Y el desplegable se leía BLANCO SOBRE BLANCO

### whatsapp

- `docs/conocimiento/whatsapp/bot-de-whatsapp-contesta-a-los-chats-etiquetados.md` — Bot de WhatsApp — contesta a los chats ETIQUETADOS (2026-08-25)
- `docs/conocimiento/whatsapp/como-se-prueba-sin-gastar-mensajes.md` — Cómo se prueba SIN gastar mensajes
- `docs/conocimiento/whatsapp/coste-medido.md` — Coste medido (2026-08-25)
- `docs/conocimiento/whatsapp/escalado.md` — Escalado
- `docs/conocimiento/whatsapp/etiquetas-de-whatsapp-desde-la-app-whatsapplabels-js-implementat.md` — Etiquetas de WhatsApp desde la app — [whatsappLabels.js](implementation/backend/services/whatsappLabels.js)
- `docs/conocimiento/whatsapp/la-agenda-de-whatsapp-como-origen-del-alta-de-clientes.md` — La agenda de WhatsApp como origen del alta de clientes (2026-10-13)
- `docs/conocimiento/whatsapp/la-cartera-de-instaladores-etiquetada-sola-en-whatsapp.md` — La cartera de instaladores, etiquetada sola en WhatsApp (2026-09-09)
- `docs/conocimiento/whatsapp/la-ronda-nocturna-de-whatsapp.md` — La RONDA NOCTURNA de WhatsApp — fase 1, en seco (2026-10-19)
- `docs/conocimiento/whatsapp/lo-que-llega-con-el-backend-parado-recuperarperdidos.md` — Lo que llega con el backend PARADO — `recuperarPerdidos()`
- `docs/conocimiento/whatsapp/lo-que-whatsapp-rompio-y-hay-que-saber.md` — Lo que WhatsApp rompió, y hay que saber (2026-08-25)
- `docs/conocimiento/whatsapp/modulo-whatsapp-novedades.md` — Módulo WhatsApp — Novedades (2026-04-17)
- `docs/conocimiento/whatsapp/rutas-y-esquema.md` — Rutas y esquema
- `docs/conocimiento/whatsapp/tras-un-despliegue-el-whatsapp-vuelve-solo.md` — Tras un despliegue el WhatsApp vuelve SOLO: el supervisor y sus plazos (2026-07-23 · 2026-10-19)
- `docs/conocimiento/whatsapp/un-mensaje-con-el-reloj-no-esta-enviado.md` — Un mensaje con el RELOJ no está enviado (2026-09-08)
- `docs/conocimiento/whatsapp/whatsapp-en-el-dia-a-dia-nombre-bandeja-mensajes-y-altas.md` — WhatsApp en el día a día: nombre, bandeja, mensajes, audios y altas (2026-10-13)
