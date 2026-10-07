<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «Al ACEPTAR, el cliente confirma sus EMISORES, PLACAS y AIRES (2026-09-29)», en el CLAUDE.md antiguo.

### Y llega al CEE: la pestaña, el encargo y la envolvente (2026-09-29)

Lo confirmado se quedaba en el WhatsApp al staff y en Instalación, que no es donde
se mira al encargar el certificado. Ahora va a los tres sitios donde se usa:

| Dónde | Qué |
|---|---|
| Pestaña **CEE** del expediente | Línea «🏠 Confirmado por el cliente» ([ConfirmadoPorCliente.jsx](implementation/frontend/src/features/expedientes/components/ConfirmadoPorCliente.jsx)) |
| **Encargo del CEE INICIAL** al certificador | Bloque con lo confirmado y CÓMO declararlo — `bloqueConfirmacionCertificador` en `confirmacionCliente.js`, que el backend manda como `bloque_certificador` en `GET /:id/aviso-cliente-cee` (CAE **y** CEE directos) y el popup mete en su plantilla |
| **Envolvente → Instalaciones** | Bloque «❄️ Aires acondicionados existentes»: los crea de un clic, uno por aparato |

**REGLA — los aires existentes se declaran según el NEGOCIO, y lo decide una
persona.** En un expediente **CAE** van como **«Equipo de sólo refrigeración»**
(máquina frigorífica, 250 % nominal), repartiéndose el 100 % de la refrigeración
—y la superficie en la misma proporción—: es el CEE inicial de **26RES060_206**
hecho a mano (5 × 20 %, 28,4 m² cada uno). En una **deducción del IRPF** (CEE
directo, **2026CEE_60**) van como **«Equipo de calefacción y refrigeración»**
(bomba de calor, 270 % / 250 %): ahí los aires son parte de la calefacción. El
bloque propone uno u otro por el negocio (`airesDelCliente`) y se cambia en él;
el número viene de lo que dijo el cliente. Volver a pulsar **sustituye** los aires
que puso el bloque (marca `aire: true`), nunca los suma.

**REGLA — los aires van en el CEE INICIAL.** El final los conserva al copiarlo (la
refrigeración nunca retira nada, regla 72); declararlos solo en el final dejaría
dos certificados de viviendas distintas. Si el cliente dijo que tiene aires y el
inicial no lleva ningún equipo de frío, el bloque sale abierto en ámbar y la ficha
lo avisa al generar.

**El motor aprendió el «calefacción y refrigeración» ESTIMADO** (`equipo_climatizacion`):
antes solo sabía el ensayado. Forma MEDIDA sobre los 1.597 `.cex` de «Mi unidad»
(258 equipos, 211 idénticos): cola `[['', nominal_cal, nominal_ref], [True, False,
False], []]`. Y el estacional que CE3X calcula del nominal se escribe ya
aproximado (`FACTOR_ESTACIONAL`, medido: máquina frigorífica 0,63; bomba de calor
de caudal variable 0,7567 / 0,6533) en vez del nominal: 250 → **157,5** y 270 / 250
→ **204,3 / 163,3**, las cifras exactas de los dos `.cex` de referencia. Los
interruptores no mueven el estacional (medido), así que van los más comunes.

⚠️ Con **frío y calor** los aires cubren también la calefacción: si además hay
caldera al 100 %, el total de Instalaciones sale en rojo y hay que repasar los
porcentajes. Se dice en el propio bloque; no se reparte solo, porque cómo se
reparte la calefacción entre la caldera y los aires lo decide el certificador.

```bash
node implementation/backend/scripts/test_aires_ce3x.mjs
python -m pytest implementation/cee-engine/tests/test_equipos.py
```
