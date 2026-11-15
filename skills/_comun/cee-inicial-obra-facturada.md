# ⛔ Con la obra ya FACTURADA: el CEE inicial, firmado ANTES de la factura

**Regla de Fran (06/11/2026), para SIEMPRE.** Si el expediente ya tiene una factura de la obra, el CEE
inicial no se FIRMA ni se PRESENTA sin comprobar antes que va firmado **y visitado** ANTES de esa
factura y con el **mes para registrarlo** todavía abierto. El CEE inicial es la situación de partida:
un inicial firmado hoy de una obra facturada la semana pasada no se sostiene ante el verificador.
Vale también aunque el usuario diga «firma», «presenta» o «doy por válido».

**Por qué se avisa aunque para el CAE no sea grave: el IRPF del cliente** (Fran, 15/11/2026). La deducción por obras de eficiencia energética (DA 50ª LIRPF) mide la mejora con el CEE **expedido antes del inicio de las obras**; con un inicial posterior a la primera factura el cliente puede perder la deducción (hasta el 60 %). Para el verificador del CAE es como mucho LEVE; para el cliente, no. Por eso la parada se mantiene: es el AVISO que protege la deducción del cliente, y la fecha la decide Fran.

## La comprobación

- **Fecha de obra** = la PRIMERA de: las facturas que computan para el CAE (también las de material o
  anticipo; no las de placas fuera del alcance), el inicio de actuación tecleado en el CIFO y la fecha
  de pruebas del Certificado RITE.
- **Vale** si la firma y la visita son ANTERIORES a esa fecha (el mismo día no vale), la visita no es
  posterior a la firma y hoy no han pasado 30 días desde la firma.
- **Ventana de firma posible hoy**: de «hoy − 30 días» al día antes de la fecha de obra. Si la factura
  es de hace más de un mes, **no hay ninguna**: para firmar antes habría que haberlo presentado ya.

No se calcula a mano: lo dicen los scripts, con la ventana y una propuesta.

- `presentar_cee.js pendientes`: bloque «CON LA OBRA YA FACTURADA», ✓ o ⛔ por expediente.
- `presentar_cee.js preparar <nº>`: el ⛔ va el primero de los avisos y el plan queda **NO LISTO**.
- `firmar_cee.js <nº>`: en un CEE inicial de expediente, **no firma** y dice lo mismo.

## Si sale ⛔: se PARA y se le pregunta a Fran

Se le enseña lo que dice el script: la factura y su fecha, la firma y la visita del CEE, la ventana
y la propuesta, o que no hay fecha posible. **Decide él.** Nunca se re-fecha por iniciativa propia, ni
en el asistente del WhatsApp/PC, ni para «no dejarlo atascado».

Con su «sí» a UNA fecha (la propuesta u otra dentro de la ventana):

```bash
cd implementation/backend
node scripts/cee_inicial.js fechas <nº> --firma AAAA-MM-DD [--visita AAAA-MM-DD]             # en seco: la comprueba
node scripts/cee_inicial.js fechas <nº> --firma AAAA-MM-DD [--visita AAAA-MM-DD] --escribir # la pone en el expediente
node scripts/cee_inicial.js calificar <nº> --escribir      # rehace el .cex desde la receta, con esas fechas
node scripts/cee_inicial.js listo <nº> --escribir          # --forzar si ya había un _fdo.pdf (hay que volver a firmar)
node scripts/firmar_cee.js <nº> --escribir
node scripts/presentar_cee.js preparar <nº>                # tiene que decir LISTO
```

- La visita, por defecto, el mismo día que la firma; nunca después.
- **Poner la fecha en el `plan.json` de `aplicar` no basta** si el expediente ya tiene una: las del
  expediente mandan (la receta solo rellena las que faltan). Por eso existe `fechas`.
- `fechas` no toca un inicial ya REGISTRADO.

## `--factura-revisada`

Lo aceptan `preparar`, `firmar_cee.js` y `fechas`: cambia el ⛔ por un aviso, sin esconder el
problema. **Solo con el «sí» explícito de Fran para ESE expediente** (por ejemplo, una factura de
material que él da por buena). Nunca para desatascar.

Documento: `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/con-la-obra-ya-facturada-el-cee-inicial-antes-de-la-factura.md`
(regla 199 de `.claude/rules/cee.md`).
