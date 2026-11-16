# Fecha de inicio, inversión y SCOP: lo que el verificador comprueba con el documento delante

**Origen:** informe de inexactitudes del LOTE-2026-019 (Marwen, CAE-2078, 12/11/2026), cinco
inexactitudes. Se subsanaron dos, se aceptó una y se aclararon dos. La contestación se subió el
13/11/2026 y en esa fecha el verificador todavía no había contestado. Lo que se ACEPTÓ o se SUBSANÓ
es criterio firme. Lo que se ACLARÓ es nuestro criterio, que se mantiene salvo que el verificador
lo rechace.

## 1. Fecha de inicio = la PRIMERA factura, aunque sea de material o un anticipo (subsanado)

El verificador lo dijo así: *«la fecha de inicio declarada difiere de la fecha de la factura en la que
se alcanza un primer compromiso en firme para la realización»*. Pasó en dos expedientes:

- **26RES060_114**: se declaró el 27/07. La factura de acopio de material era del 24/05.
- **26RES060_180**: se declaró el 29/10. El anticipo del 70 % era del 14/09.

El RD 36/2023 define el inicio como el primer compromiso en firme. Un anticipo o una entrega de
material **son** ese compromiso.

- **No se usa la marca `motivo_no_inicio` (MATERIAL / ANTICIPO).** Esa marca de la regla 93 saca la
  factura del inicio que calcula `calcCifo`, y esa fecha fue la que se tumbó. Tampoco se fija un
  inicio a mano (`fecha_inicio_cifo_manual`) para retrasarlo.
- Si una factura lleva la marca, se quita y se recalcula. Después se rehacen el CIFO, la Ficha RES,
  el Anexo I del lote y la solicitud, porque las tres fechas tienen que ser idénticas.
- **Un CEE inicial posterior a la primera factura NO es grave** (Fran, 15/11/2026): como mucho LEVE,
  no bloquea el APTO y se explica, si hace falta, en el escrito aclaratorio del lote. Lo que nunca se
  hace es retrasar el inicio para taparlo: el verificador mira la factura. **Se avisa igual**, por el
  IRPF del cliente: la DA 50ª LIRPF pide el CEE expedido antes del inicio de las obras. (Un CEE inicial que aún está
  por firmar se sigue fechando antes de la factura cuando se puede: ver
  [cee-inicial-obra-facturada.md](cee-inicial-obra-facturada.md).)
- **Unas pruebas RITE anteriores a la primera factura SÍ abren la actuación** (Fran, 16/11/2026, que
  corrige lo dicho el 15/11): el inicio es lo primero entre las facturas de la obra y las pruebas.
  Una factura que no es de la obra (una bancada) no cuenta.
- La fecha de fin es lo último entre la última factura y las pruebas RITE.

## 2. Inversión = TODAS las partidas de las facturas (aceptado)

En 26RES060_114 se habían dejado fuera 41,30 €. Era un «VASO EXPANSIÓN A.C.S. 8 L» de la factura
175/2026, excluido porque esa actuación no declaraba ahorro en ACS. El verificador sumó las facturas
(8.691,07 €) y Fran **aceptó** su cifra.

- La inversión es Σ de las facturas sin IVA, **partida por partida**, aunque alguna sea de un servicio
  sin ahorro declarado (ACS, accesorios, desmontaje…). Sin excluir nada a ojo.
- Si alguna vez hay una partida de verdad ajena a la actuación (otra obra, otra vivienda), se pregunta
  a Fran antes de quitarla, y entonces se deja escrito qué se excluye y por qué.
- Las tres cifras tienen que cuadrar: facturas = Ficha RES = Anexo I / solicitud del lote.

## 3. SCOPcal: el número declarado tiene que estar ESCRITO en un documento anexo (aclarado)

En 26RES060_121 (Domusa Dual Clima 19HT, radiadores) el verificador vio en la ficha técnica comercial
un 4,64, y nosotros habíamos declarado 4,38.

- El 4,64 era el SCOP a **35 °C** en clima medio.
- Con radiadores manda el SCOP a **55 °C en clima cálido** (Anexo IV de la RES060).
- Ese dato está en la **ficha de producto oficial del Reglamento (UE) 811/2013**, en este caso el
  documento CDOC003067 del fabricante: ηs,h 55 °C cálido = 172 %, y (172 % + 3 %) × 2,5 = 4,38.

**La lección:** las fichas técnicas que van con el CIFO tienen que contener, con la temperatura y el
clima, el número que se declara.

- Si la ficha comercial solo trae el valor a 35 °C o en clima medio, se le añade la ficha de producto
  811/2013 o la ficha EPREL, la que dé el ηs,h a 55 °C cálido.
- Esa página se guarda también en la ficha del catálogo (skill `alta-aerotermia`), para que salga sola
  en el próximo expediente.
- Si el verificador puede leer en el anexo un SCOP distinto al declarado, sin la página que explique
  el nuestro, lo levanta.

## 4. SCOPdhw de un equipo de ACS con otro nombre comercial (aclarado)

En 26RES060_181 el verificador vio un 3,55 en la ficha técnica, y nosotros habíamos declarado 3,18.
Además, el EPREL aportado no tenía el mismo nombre de modelo que la ficha.

- El equipo es un Legato CHWSG200CNMREP, vendido en el catálogo de Toshiba y fabricado por Climer.
- En EPREL está registrado como «Climer EH200P 444» (registro 2008673).
- El 3,55 es la tabla comercial (142 %). El 3,18 es ηwh en clima **cálido** del EPREL (127 %) × 2,5.

**La lección:**

- **El SCOPdhw sale del registro EPREL** (ηwh en clima cálido × 2,5), no de la tabla comercial.
  Además, el valor oficial suele ser el más prudente.
- **Si el nombre comercial no es el del EPREL, la equivalencia se PRUEBA con un documento**: la
  etiqueta energética del modelo comercial, con los mismos datos que el registro EPREL (perfil de
  carga, clase, consumos anuales). Esa etiqueta va anexa junto al EPREL, y en el escrito se pone una
  tabla con los datos de las dos lado a lado.
- Sin ese documento de equivalencia, el EPREL de otro nombre **no justifica** nada.

## 5. Etiqueta del CEE final que la JCCM todavía no ha emitido (aclarado)

En 26RES060_228 el CEE final estaba inscrito (registro 4445104/2026, solicitado el 05/11), pero la
etiqueta v3.0 aún no salía en notifica.jccm.es.

- Se **aclara con el justificante de registro** del CEE final (E{n}-3-6), junto con el certificado
  firmado y su .xml, que ya van en el paquete.
- A la vez se pide la etiqueta **por escrito** al buzón de los técnicos de eficiencia energética de la
  JCCM: **tecnicoeficiencia@jccm.es**. El correo lleva el justificante de registro adjunto y cita la
  petición de SIGUE, si ya se abrió una.
- En cuanto llegue, se aporta: va a su casilla con `presentar_cee.js notificaciones` (skill
  `presentar-cee`, paso 10).

## 6. Una re-firma que se manda por email no está pedida hasta que sale también el WhatsApp

La re-firma del CIFO de 26RES060_114 salió solo por email y el instalador no se enteró hasta que se
le mandó el WhatsApp aparte.

- Después de cada «volver a pedir la firma», se comprueba en `whatsapp_queue` que hay un mensaje
  **SENT** a ese destinatario.
- Si no lo hay, se le manda por WhatsApp el enlace de re-firma, con la plantilla de requerimiento y
  con el «sí» de Fran.
