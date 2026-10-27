<!-- conocimiento · área: consultas · las rutas de los enlaces son relativas a la raíz del repo -->

## CAE a nombre de UN copropietario, segunda obra al año siguiente y el tope de 3.000 €/año del IRPF (20/10/2026)

**Caso:** 26RES080_OP79 (unifamiliar en Bargas, aerotermia con suelo radiante + insuflado de la
buhardilla). El cliente preguntó por WhatsApp, tras recibir la propuesta:

1. «La casa está al 50 % con mi mujer, ¿hay algún problema en que se haga todo a su nombre?»
2. «Si hacemos esto ahora y el año que viene ventanas y placas solares (a mi nombre), ¿podemos pedir
   otra subvención?»
3. «Tengo entendido que el máximo es 3.000 €/persona y año, ¿te lo van devolviendo en años
   posteriores?»

### Respuesta corta

1. **Sí, puede ir todo a nombre de UN copropietario**: firma la aceptación y los documentos del CAE,
   las facturas van a su nombre y el bono se le paga a él. Es como trabaja la app: el titular firma y
   los demás propietarios son destinatarios de avisos (ver la memoria de copropietarios y
   `logic/cedentes.js` si hubiera varios cedentes). **La deducción del IRPF**: lo normal es que cada
   propietario se la aplique por lo que le corresponde (en gananciales, a medias) → **se le remite a
   su gestor**.
2. **Decisión de Fran:** las **ventanas, a priori, no interesan** — con la aerotermia ya puesta el
   ahorro que añaden es pequeño y la ayuda no cubre casi nada de lo que cuestan. Las **placas, el año
   siguiente y por el IRPF**: otro CEE para que el otro propietario se aplique su deducción por esa obra.
3. **Correcto**: deducción del **60 %** (edificio residencial / unifamiliar), base máxima **5.000 €/año**
   (→ 3.000 € de deducción al año) y **15.000 € en total** (→ 9.000 €) por contribuyente; lo que pase
   del año se arrastra a los **4 siguientes**. Es una deducción en la cuota de la Renta, no una
   devolución: hace falta tener cuota de IRPF.

### El porqué y la norma

- Modalidades, topes y vigencia: `MODALIDADES` en
  [guiaIrpf.js](implementation/frontend/src/features/expedientes/logic/guiaIrpf.js) — DA 50.ª de la
  Ley 35/2006, prorrogada por el RDL 7/2026: el 60 % para obras **pagadas hasta el 31/12/2027**.
  Requisito: −30 % de energía primaria no renovable o letra A/B (`irpfEpnr.js`).
- El bono CAE no reduce la base de la deducción (ganancia patrimonial, no subvención): memoria
  «Fiscalidad CAE IRPF» (DGT V0361-23, V2137-25).

### Lo que quedó SIN confirmar

- **El reparto de la deducción entre copropietarios** (por cuota de propiedad, por quién paga, en
  gananciales): pendiente de asesor desde el 06/10/2026. No se le promete a uno solo los 9.000 €.
- Si la **segunda obra** (placas) cumplirá el requisito del 60 % partiendo de una casa que ya sale B:
  se comprueba con sus certificados cuando se haga.

### Lo que se le mandó (20/10/2026, con el «sí» de Fran)

> 1️⃣ Ningún problema en que vaya todo a nombre de tu mujer: ella firma la aceptación y los documentos
> del CAE, las facturas van a su nombre y el bono se le paga a ella. Para la deducción del IRPF, lo
> normal es que cada propietario se la aplique por lo que le corresponde (si estáis en gananciales, a
> medias); esto que os lo confirme vuestro gestor. […]
>
> 2️⃣ Las ventanas, a priori, no os interesan: con la aerotermia ya puesta, los números no salen y la
> ayuda no cubriría prácticamente nada de lo que cuestan. Las placas sí: el año que viene, a tu nombre,
> hacemos otro certificado de eficiencia energética para que te puedas aplicar la deducción del IRPF
> por esa obra (la del 60 % vale, de momento, para obras pagadas hasta el 31/12/2027).
>
> 3️⃣ Correcto: es el 60 % de lo que paguéis, con un máximo de 3.000 € por persona y año. Lo que pase
> de ahí se aplica en los 4 años siguientes, hasta 9.000 € en total por persona […]. Es una deducción
> en la Renta, así que se descuenta de lo que pagáis de IRPF.
