# Con la obra ya FACTURADA, el CEE inicial va firmado ANTES de la factura (2026-11-06)

Decisión de Fran (06/11/2026): «cuando mande a presentar un CEE, si ya tiene factura emitida, no debe
dejar presentarlo antes [de] revisar para ver si se puede firmar con un mes de antelación antes de la
factura». El CEE inicial es la SITUACIÓN DE PARTIDA: su visita y su firma tienen que ser anteriores al
comienzo de la obra (la fecha de registro no cuenta, ver `utils/ceeFechas.js`), y el auditor lo cruza
con la primera factura. Un inicial firmado HOY de una obra facturada la semana pasada no se sostiene.

> **15/11/2026, Fran: la regla se queda, sobre todo por el IRPF del CLIENTE.** «Que el CEE inicial sea
> posterior a facturas no es grave» para el CAE (como mucho LEVE en la auditoría, regla 93), pero «la
> regla es buena para que me avise al menos, sobre todo para que el cliente no tenga problemas con las
> deducciones en el IRPF». La deducción por obras de eficiencia energética (DA 50ª LIRPF) mide la
> mejora con el CEE **expedido antes del inicio de las obras**; con un inicial posterior a la primera
> factura, el cliente puede perder la deducción (hasta el 60 % de la obra). Por eso `preparar`,
> `pendientes` y `firmar_cee.js` siguen parando y enseñando la ventana, y la auditoría deja una línea
> «⚠ IRPF» en el informe, aunque el expediente sea APTO.

**REGLA — con una factura de la obra ya emitida, el CEE inicial no se FIRMA ni se PRESENTA sin
comprobar que va firmado y visitado ANTES de ella y con el mes de registro aún abierto.** Es decir, la
firma tiene que caer entre «hoy − 30 días» (el plazo de un mes para registrarlo desde la firma, RD
390/2021; la app cuenta 30 días, como `presentacionCeeService.PLAZO_DIAS`) y el día ANTERIOR a la
factura. El mismo día de la factura no vale.

**REGLA — si no cumple, se PARA y se le dice a Fran la VENTANA de fechas posibles y una propuesta**
(el primer día de la ventana + 3 días de margen para presentarlo, o el último si es más corta), o que
**no hay ninguna** (la factura es de hace más de un mes: para firmar antes habría que haberlo
presentado ya). Decide él. Ni Claude ni el asistente del PC re-fechan un CEE por su cuenta.

**REGLA — la fecha de obra que manda es la PRIMERA de:** las facturas que computan para el CAE
(`computa_cae !== false`: una de placas fuera del alcance no es la actuación), incluidas las de
MATERIAL o ANTICIPO (`motivo_no_inicio`: son facturas emitidas y `facturaIncidencias` las compara con
la firma igual; si Fran la da por buena, lo dice él), el **inicio de actuación tecleado en el CIFO**
(`fecha_inicio_cifo_manual`) y la **fecha de pruebas del Certificado RITE**
(`fecha_pruebas_cert_instalacion`). Sin ninguna, no hay nada que comprobar.

**REGLA — la visita también**: anterior a la fecha de obra y no posterior a la firma. Sin visita
declarada no se da por bueno.

## Dónde está

- Fuente única: [utils/ceeFechas.js](../../../../implementation/backend/utils/ceeFechas.js) —
  `fechasDeObra`, `fechasDelXml` (firma y visita del `.xml` que se va a presentar, v3.0 y v2.0, sin
  DOM y sin distinguir mayúsculas), `firmaCeeFrenteAObra` y `textoFirmaFrenteAObra`.
- `scripts/presentar_cee.js preparar <nº>`: con la obra facturada y el inicial fuera de la ventana,
  el aviso ⛔ va PRIMERO y el plan sale **NO LISTO** (`obra_facturada` en `plan.json`).
  `pendientes` lista aparte «CON LA OBRA YA FACTURADA», con ✓/⛔, la fecha de obra, la firma y la
  ventana. Lee las fechas del `.xml` que se va a subir; si no lo encuentra, de la BD.
- `scripts/firmar_cee.js <nº>` (fase inicial de un expediente): no firma y lo dice con la misma
  ventana. Así para también el camino desatendido del WhatsApp/PC (`asistente_pc.js`, que firma y
  prepara, y para en un NO LISTO).
- `scripts/cee_inicial.js fechas <nº> --firma AAAA-MM-DD [--visita …] [--escribir]`: con el «sí» de
  Fran a una fecha, la comprueba igual y la pone en el expediente (`cee.fecha_firma/visita_cee_inicial`
  y su espejo de `documentacion`, por las RPC de clave). Es la que MANDA al componer el `.cex`
  (`conLaReceta`: la receta solo rellena las que faltan), así que poner la fecha en el plan de
  `aplicar` NO basta si el expediente ya tiene una. No toca un inicial ya REGISTRADO.
- La **revisión del CEE** (`services/cee/revisionCee.js`, la lupa y la revisión PREVIA al subir el
  técnico): punto `fecha_obra` «El CEE inicial es anterior a la obra» — **falla** (NO APTO) si la firma
  o la visita son del día de la obra o posteriores, **aviso** si solo es el plazo; con el inicial ya
  registrado, el plazo se mira contra su fecha de registro. Al técnico se le dice que no lo presente y
  hable con Brokergy (`revisionTecnico.js`). Así el de un técnico de FUERA lo corrige él antes del
  visto bueno.
- La **ronda de las 21:00** (`asistente_pc.js noche`): un ⛔ no entra en la pregunta del pago; va en
  «Fuera de la lista» con la factura, la ventana y la propuesta. Y el encargo desatendido del PC
  (`promptPresentar`) para sin pagar y nunca re-fecha.
- `--factura-revisada` (en los tres scripts) cambia el ⛔ por un aviso sin esconder el problema. Solo
  con el «sí» explícito de Fran para ESE expediente.

## Re-fechar, paso a paso (con el «sí» de Fran)

1. `node scripts/cee_inicial.js fechas <nº> --firma <propuesta> [--visita <día>]` en seco, y con
   `--escribir`.
2. `node scripts/cee_inicial.js calificar <nº> --escribir`: rehace el `.cex` desde la receta con esas
   fechas, con su `.xml` y su PDF.
3. `node scripts/cee_inicial.js listo <nº> --escribir` (`--forzar` si ya había un `_fdo.pdf`, que hay
   que volver a firmar).
4. `node scripts/firmar_cee.js <nº> --escribir` y `node scripts/presentar_cee.js preparar <nº>`, que
   tiene que decir LISTO.

⚠️ La «Fecha de emisión» que compara la sede es la `<FechaGeneracion>` del `.xml` (el día en que se
genera), no la de firma: 26RES060_221 llevaba calificación del 08/10, generación del 15/10 y se
registró el 15/10 sin problema. Re-fechar cambia `<FechaCalificacion>` y la visita; la generación
sigue siendo el día en que se rehace.

## Lo medido (06/11/2026)

De los 126 expedientes con factura y CEE inicial firmado (tomando como «hoy» su fecha de registro
cuando la hay), **92 cumplen y 34 no**. Entre los que no: 26RES060_144 (visita 08/04, factura 07/04,
firma 10/05), 26RES093_11, 26RES060_96, _105, _112 y _116; 26RES060_100 con las pruebas del RITE antes
de la firma; y varios de técnicos de fuera registrados pasado el mes (26RES060_132, _138, _139, _146,
_158). Los pendientes de presentar ese día (26RES060_232, _264 y _269) no tenían factura.

Tras tocarlo: `node implementation/backend/scripts/test_cee_fecha_factura.js`,
`test_revision_cee.js` (caso «1b») y `test_presentar_noche.js`.
