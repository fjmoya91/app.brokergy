<!-- conocimiento · área: consultas · las rutas de los enlaces son relativas a la raíz del repo -->

# Placas (autoconsumo ≤10 kW) y cargador del coche: ¿un boletín o dos? — Castilla-La Mancha (20/10/2026)

**La pregunta** (2026CEE_61, por WhatsApp, 20/10/2026): el cliente ha puesto placas con batería y un
cargador de coche en su vivienda, y el instalador le dice que le tiene que dar un certificado de
instalación (boletín) de las placas y otro del cargador, y que no vale uno para las dos cosas.
¿Es así o se puede hacer en uno y ahorrarse un trámite?

## Respuesta corta

**Sí, en Castilla-La Mancha son dos, y el instalador tiene razón**: las placas y el cargador se
legalizan en Industria por **vías distintas**, así que cada uno lleva su certificado. Lo tramita el
instalador; al cliente no le cuesta un trámite más.

## Por qué

- **REBT (RD 842/2002), ITC-BT-04**: toda instalación nueva, ampliación o modificación de baja tensión
  se legaliza con el **Certificado de Instalación** (el «boletín») y una **Memoria Técnica de Diseño
  (MTD)** o, por encima de ciertos límites, un proyecto.
- **Cargador (ITC-BT-52)** en una vivienda: basta la MTD (interior hasta 50 kW; en el exterior, hasta
  10 kW). En CLM se diligencia por **eDice-bt**, que tiene en el propio formulario la casilla «¿instalación
  de recarga de vehículos eléctricos? sí/no · uso público/privado».
- **Placas de autoconsumo (ITC-BT-40, RD 244/2019)**: hasta 10 kW, también MTD. Pero **eDice no admite
  autoconsumo**: lo dice la propia aplicación («si la instalación a registrar es para autoconsumo no
  es posible realizarla a través de eDice»). Va por la **sede electrónica, trámite SJE4** (Registro de
  una instalación eléctrica de baja tensión) y, si es SIN excedentes, con la documentación del
  antivertido (ITC-BT-40, anexo I, I.4). Con ese registro la Junta inscribe **de oficio** la
  instalación en el Registro de Autoconsumo (BT y menos de 100 kW) — Instrucción 1/2020 de la
  Dirección General de Transición Energética, apartado 5.1. Ese certificado es además el que necesita
  la distribuidora (con el CAU) para activar la compensación de excedentes.
- Si el cargador y las placas los ha montado **empresas distintas**, cada una certifica lo suyo: dos
  certificados sí o sí.

**Sin confirmar**: el REBT no prohíbe que una sola ampliación recoja las dos cosas, así que en teoría
se podría meter el circuito del cargador dentro del certificado de autoconsumo por SJE4 (misma empresa
instaladora, una MTD que cubra ITC-BT-40 e ITC-BT-52). No lo hemos visto confirmado por la Junta y
apenas ahorra nada: el del cargador por eDice es el trámite rápido. Si alguien insiste, se pregunta
al Servicio de Industria de la Delegación Provincial.

## Lo que sí importa para el cliente: la renta

- La deducción del IRPF de la vivienda (DA 50ª de la Ley del IRPF, la del par de certificados: ver
  [deduccion-del-irpf-vale-el-par-de-certificados.md](docs/conocimiento/cee/deduccion-del-irpf-vale-el-par-de-certificados.md))
  es por la obra que **mejora la eficiencia**: placas y batería. **El cargador no entra ahí.**
- Por eso conviene que el cargador vaya en **factura aparte** (o, como mínimo, desglosado): si va
  mezclado con las placas, la justificación de la deducción se complica.
- El cargador tuvo su propia deducción (15 %, DA 58ª de la Ley del IRPF). **Antes de decírselo a un
  cliente, comprobar si sigue vigente el año de la obra**: tenía fecha de fin y se ha ido prorrogando.

## Lo que se le contestó (2026CEE_61, enviado el 20/10/2026 a las 15:43)

> Sí, José Ángel: cuando la tengas, mándame la factura de Sergio de las placas y la batería, que se
> vea la potencia de los paneles, el inversor y la batería. Con eso hacemos el certificado final. El
> presupuesto no hace falta.
>
> Lo de los certificados es así: en Castilla-La Mancha las placas y el cargador se legalizan en
> Industria por caminos distintos (el autoconsumo tiene su trámite propio), así que lo normal es que
> te den dos, uno de cada cosa. Eso lo tramita el instalador, tú no tienes que hacer nada.
>
> Y una cosa importante para la renta: pide que el cargador vaya en una factura aparte de las placas
> y la batería. La deducción es por las placas y la batería; el cargador no entra ahí, y si va
> mezclado complica justificarla.

## Fuentes

- eDice-bt (JCCM), avisos de la página de inicio: <https://edice.castillalamancha.es/eDice-bt/binicio.jsp>
- Instrucción 1/2020 sobre las instalaciones de autoconsumo (DG de Transición Energética, JCCM):
  <https://edice.castillalamancha.es/eDice-bt/autoconsumo.pdf> — apartados 4.3.1 y 5.1
- REBT: RD 842/2002 (ITC-BT-04, ITC-BT-40) y RD 1053/2014 (ITC-BT-52)
