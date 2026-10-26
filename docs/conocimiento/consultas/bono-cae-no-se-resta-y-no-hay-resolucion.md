<!-- conocimiento · área: consultas · las rutas de los enlaces son relativas a la raíz del repo -->

## Bono CAE: no se resta de la deducción del IRPF y no hay «resolución» (26/10/2026)

**Caso:** muchos clientes (y sus gestores) piden «el justificante de la resolución» del bono CAE
para la declaración de la Renta, y tratan el bono como las subvenciones públicas de antes:
**lo restan de lo pagado por la obra** antes de aplicar la deducción del IRPF. Fran, 26/10/2026:
«con los CAE no es igual; la carta de pago ya hace de justificante».

### Respuesta corta

1. **El bono CAE NO se resta** de las «Cantidades satisfechas» de la deducción por obras de mejora
   energética: ahí va todo lo pagado, IVA incluido.
2. **El bono tributa aparte**, como **ganancia patrimonial** por la transmisión de un derecho, en la
   **base del ahorro**: 19 % hasta 6.000 €, 21 % de 6.000 a 50.000 € (23 % hasta 200.000, 27 % hasta
   300.000, 28 % por encima). No lleva retención: se paga en la declaración.
3. **No hay resolución**, porque el bono no lo concede ninguna Administración. El justificante es la
   **carta de pago** (nº CP-AAAA-NNNN, la que mandamos con la transferencia) junto con el **convenio
   de cesión de ahorros** que firmó.

Se le manda la hoja **«Tu bono CAE en la Renta»**: en su guía de la Renta va como hoja 2 (solo en los
expedientes CAE) y suelta sale con `node implementation/backend/scripts/hoja_bono_cae.js [<nº>]`
(genérica o con su bono y su carta). Ver [la guía](docs/conocimiento/cee/la-guia-de-la-deduccion-del-irpf-para-el-cliente.md).
**Solo cuando le gestionamos el CAE**: a un cliente de un CEE directo no se le dice nada de esto.

### El porqué y la norma

- **DA 50ª de la Ley 35/2006 (LIRPF)**, texto del BOE: la base de la deducción son las cantidades
  satisfechas «debiendo descontar aquellas cuantías que, en su caso, hubieran sido subvencionadas a
  través de un **programa de ayudas públicas** o fueran a serlo en virtud de **resolución definitiva
  de la concesión** de tales ayudas». De ahí sale que el gestor pida «la resolución».
- Eso pasaba con las ayudas del **RD 853/2021** (rehabilitación residencial, Next Generation) o del
  **RD 477/2021** (autoconsumo y renovables térmicas): eran programas de ayudas públicas con
  resolución de concesión, y lo concedido se restaba.
- El **bono CAE** es el **precio** que un sujeto obligado paga por los ahorros de energía que el
  cliente le cede en el convenio (**RD 36/2023**, Sistema de Certificados de Ahorro Energético). No
  es una ayuda pública.
- **DGT, consulta vinculante V2137-25 (11/11/2025)**: lo que se cobra por ceder los ahorros es una
  **ganancia patrimonial** derivada de la transmisión de un derecho, que se integra en la base del
  ahorro. (Comprobado que existe; es la que se cita en los documentos.)
- La calculadora ya lo trata así: el interruptor **«IRPF del CAE»** (`inputs.aplicarIrpfCae`, solo
  particulares) descuenta del bono su impuesto con `calcularIrpfGananciaPatrimonial`, y la deducción
  del IRPF se calcula sobre el presupuesto ENTERO, sin restarle el bono. Revisado el 26/10/2026:
  correcto; solo faltaba el tramo del 28 % por encima de 300.000 € (ya añadido, no movía ninguna
  cifra real).

### Lo que quedó SIN confirmar

- **El año de imputación** cuando la cesión se firma un año y se cobra al siguiente: la hoja dice «el
  año en que se cierra la cesión y lo cobras» y que lo confirme su asesor.
- **Las casillas de Renta Web** donde se declara (fuentes secundarias apuntan a «transmisión de otros
  elementos patrimoniales»): la hoja no da números de casilla.
- Las consultas **V0478-26** y **V0361-23** que circulan citadas no se han podido comprobar: **no se
  citan**.

### Fuentes

- BOE, Ley 35/2006, disposición adicional quincuagésima (texto consolidado).
- RD 36/2023, de 24 de enero (Sistema de CAE). RD 853/2021 y RD 477/2021.
- DGT, consulta vinculante V2137-25, de 11/11/2025.

### Lo que se propone mandar (WhatsApp, en borrador; sale solo con el «sí» de Fran)

> ¡Hola {nombre}! Sobre el justificante de la resolución que te pide tu gestor: con el bono CAE **no
> hay resolución**, porque no es una subvención. Es el precio que paga una empresa obligada a ahorrar
> energía por los ahorros de tu obra, que tú le cediste al firmar el convenio.
>
> Por eso:
> • *No se resta* de lo que pagaste por la obra. En la deducción del IRPF, en «Cantidades
> satisfechas», va todo lo pagado, IVA incluido. Restar la ayuda era cosa de las subvenciones
> públicas (las de los Reales Decretos 853/2021 o 477/2021), que sí tenían resolución.
> • El bono tributa *aparte*, como *ganancia patrimonial* en la base del ahorro: 19 % hasta 6.000 € y
> 21 % de ahí a 50.000 €. No lleva retención: se paga en la declaración del año en que lo cobras.
> • Tu justificante es la *carta de pago* que te enviamos con la transferencia, junto con el
> *convenio de cesión de ahorros* que firmaste.
>
> Te adjunto una hoja que lo explica, para que se la pases a tu gestor.
>
> Cualquier duda, aquí estamos.
> *BROKERGY · Ingeniería Energética*
