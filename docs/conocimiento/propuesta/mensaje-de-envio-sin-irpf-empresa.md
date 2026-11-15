<!-- conocimiento · área: propuesta · las rutas de los enlaces son relativas a la raíz del repo -->

## El mensaje de envío sin IRPF: empresa y terciario, escueto (2026-11-10)

Fran, 10/11/2026, al ir a enviar la propuesta de 26TER100_OP389 (AUTOSERVICIO RODRIGUEZ SL): «cuando es
una empresa, no tiene sentido que se haga lo de ambas opciones, deducciones IRPF, etcétera. El mensaje debe
ser más escueto […] tienen que tener sentido. Este no tenía sentido si lo enviamos tal cual».

El mensaje general (`buildCaptionBase` de `ProposalModal.jsx`) es de una vivienda de un particular. A la
empresa le decía:
- «*Opción 1:*», cuando había una sola opción;
- «si eres propietario y tienes retenciones… *0 €*»;
- «*5.027 €* combinando ambas opciones», cuando las «opciones» eran el bono y un cero.

**REGLA — si ninguna de las opciones que se presentan lleva deducción del IRPF, el mensaje es el bono y
los pasos.** No lleva el párrafo del IRPF, ni el «resumen total», ni «Opción 1» cuando hay una sola.
- Con dos opciones de verdad (aerotermia / aerotermia + envolvente, o CEE aportado / CEE nuevo), las dos
  cifras van una por línea.
- Se decide por las CIFRAS: es `propuestaSinIrpf` sobre el `irpfDeduction` de cada opción. Vale para la
  empresa, el terciario (allí la calculadora no calcula IRPF) y cualquier caso con la deducción a 0 €.
- El partner y el instalador reciben la misma versión, en tercera persona.
- Las notas fijas siguen igual: CEE inicial, presupuesto estimado (sin hablar del IRPF) y comisión del
  partner.

**REGLA — la ayuda va sola en su línea y entera en negrita** («la ayuda en negrita, que destaque»):
`💰 *BONO ENERGÉTICO CAE: 5.027 €*`. Con dos opciones, cada una igual.

**REGLA — a una EMPRESA se la saluda por su PERSONA, nunca por la razón social** (Fran, 10/11/2026: «al
ser una empresa no debe poner nombre, siempre debe haber una persona de contacto o representante»). Salía
«¡Hola Autoservicio!».
- Se usa la persona de contacto o, si no hay, el representante legal (`clientes.persona_contacto_nombre` →
  `representante_nombre`). Lo resuelve `clienteInfo.saludo` (y `titular.saludo`) en `ProposalModal`, que
  pisa el `targetName` de `buildCaptionBase` en los modos CLIENTE y TITULAR.
- El rótulo del destinatario en el popup sigue siendo la razón social.
- Sin persona en la ficha, el saludo es «¡Hola!», nunca «¡Hola cliente!» (vale ya para todos los
  clientes).

Texto: `logic/mensajeSinIrpf.js`. Prueba: `implementation/backend/scripts/test_mensaje_sin_irpf.mjs`
(`--ver` imprime los mensajes).
