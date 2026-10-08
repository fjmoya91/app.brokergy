<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### La entrega al cliente se dispara SOLA

Condición doble, y las dos mitades llegan en desorden — unas veces se cobra y
días después el certificador sube el registro, otras al revés:

```
cobrado + justificante de REGISTRO subido + PDF firmado subido
```

Por eso **no hay un único disparador**: la comprobación es una sola función
([ceeDirectoEntrega.js](implementation/backend/services/ceeDirectoEntrega.js)) y
la llaman los TRES sitios donde puede completarse la condición — marcar cobrado,
el PUT que pone la fase en REGISTRADO, y la subida del registro desde el enlace
público del certificador. **Quien llegue el segundo es el que envía.**

**REGLA — se le mandan TRES ficheros: el PDF firmado, el justificante de registro y
la ETIQUETA** (+ la guía de la Renta si procede). Hasta el 07/10/2026 eran dos —«la
etiqueta ya va dentro del certificado»—, pero el usuario la quiere en TODAS las
entregas (inicial, final y único): es el papel que se cuelga y el que piden en una
compraventa. Sin etiqueta subida no se entrega (sale en «qué falta»). El `.xml` y el
`.cex` siguen fuera: son ficheros de trabajo del certificador que el cliente no puede
abrir. El reenvío desde la rejilla («Reenviar notificación») es esta MISMA entrega
(`entregar` con `reenviar`): antes tenía su copia, saludaba y escribía al TITULAR en
vez de a la persona de contacto (2026CEE_55) y mandaba la sección entera.

En un encargo DOBLE, la entrega del INICIAL termina con «cuando tengas la factura
definitiva de la instalación, avísanos y emitimos el certificado final».

**REGLA — la idempotencia se comprueba ANTES que nada.** Los dos disparadores
pueden coincidir en el mismo minuto (marcar cobrado justo cuando entra el
registro) y el cliente recibiría el certificado dos veces. El sello va en
`documentacion.entrega_cliente[fase]` y es **por FASE**: en un encargo doble se
entrega el inicial y meses después el final, así que un sello único daría el
segundo por hecho. Se escribe con la RPC de MERGE.

**REGLA — los adjuntos se vuelven a comprobar al descargarlos.** `estado()` los ve
en Drive, pero entre la comprobación y la descarga alguien puede haberlos movido:
un email de entrega SIN el certificado deja al cliente esperando algo que ya
consta como enviado. Si no bajan los dos, no sale nada.

**En WhatsApp el texto va PRIMERO y aparte**, y cada PDF detrás con una etiqueta
corta ("certificado firmado", "justificante de registro"). Un mensaje largo como
caption de un adjunto hace que mucha gente no llegue a abrir el fichero.

**En LOCAL hay que apagarlo**: `CEE_ENTREGA_AUTO=false` en el `.env`. Si no,
marcar como cobrado un expediente cualquiera mientras se prueba manda un WhatsApp
y un email REALES al cliente REAL. El botón manual de la ficha sigue funcionando
con la variable apagada —ahí hay una persona decidiendo, que es justo lo que le
falta al automático— y el panel **dice en pantalla** que el automático está
apagado: sin ese aviso uno marca cobrado, no pasa nada, y piensa que está roto.

El panel de la ficha (`EntregaCliente.jsx`) enseña **qué falta en lenguaje de
tarea** ("Subir el PDF del CEE firmado"), no un booleano: el automático no puede
explicarse solo. `GET /:id/entrega` usa la MISMA función que el envío, así que la
pantalla no puede decir que está listo mientras el backend dice que no.
