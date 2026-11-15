<!-- conocimiento · área: oportunidades · las rutas de los enlaces son relativas a la raíz del repo -->

## Si el instalador no dice nada del agua caliente, el ACS no se calcula (2026-10-23)

**Decisión de Fran (23/10/2026)**, a raíz de las dos calderas de pellets de Federico Romero
(Villanueva de los Infantes), que no decían nada del agua caliente: «si el instalador no dice nada de
agua caliente, los cálculos no se hacen con agua caliente: ACS no aplicaría. La caldera inicial sería
lo que fuese, pellets, gasóleo… El certificado inicial se haría poniendo esa caldera o un termo, me da
igual. Y el final, si el presupuesto no dice nada de ACS, será con un termo eléctrico».

**Antes**, la skill `alta-oportunidad` incluía el ACS (`acs.incluir: true`) también cuando la caldera
que se retira es MIXTA, con el argumento de que «al quitarla, el agua caliente la tiene que dar la
aerotermia». Eso metía en la propuesta un ahorro de ACS que nadie había presupuestado, y luego, al
hacer el CEE, había que quitarlo y preguntar con las dos cifras (26RES060_237).

**REGLA — sin ACS declarado, la simulación va SIN ACS** (`acs.incluir: false`, `changeAcs: false`):
el ahorro y el bono son solo de la calefacción, con la caldera de hoy y su combustible. Se incluye el
ACS solo si el presupuesto trae un equipo o un depósito de ACS, o lo dicen el instalador o el cliente
claramente. «Posiblemente con ACS» o una idea sin presupuesto no cuentan: van a `decisiones`.

**REGLA — en los certificados:**

- **CEE inicial**: el ACS lo puede dar la caldera de hoy (mixta) o un termo eléctrico; da igual. Por
  defecto el termo, que es lo que lleva el final.
- **CEE final** (y la medida de mejora): si el presupuesto no trae nada de ACS, el ACS es un **termo
  eléctrico** (efecto Joule), también cuando en el inicial lo daba la caldera mixta. La demanda de ACS
  del final sigue siendo la del inicial (regla 127).
- **Si el presupuesto SÍ trae ACS** (Fran, 24/10/2026, 26RES060_OP337): en el inicial el ACS lo da
  la misma caldera de hoy, y en el final la aerotermia o el aerotermo del presupuesto.

**REGLA — el agua caliente no se le pregunta al cliente.** La decide el presupuesto. En OP337 el
borrador del WhatsApp le preguntaba a Pedro «¿con qué calentáis el agua?»; Fran: «eso ya lo
comentamos». El presupuesto no traía equipo de ACS (solo un termo Tesy como opcional aparte), así
que el inicial y el final van con termo eléctrico y no hay nada que preguntar.

Completa lo que ya se decidió el 19/10/2026 en 26RES060_237 para el CEE (sin ACS en el presupuesto,
termo eléctrico en el inicial y en el final: skills `generar-cee-inicial`, punto 18, y
`generar-cee-final`): ahora la simulación ya nace sin ACS y no hay nada que preguntar al hacer el CEE.

Pendiente de comprobar: que `cee_final_copiando.js` escriba el termo cuando el inicial tenía la
caldera MIXTA (hoy, por la regla 72, conserva la caldera con la calefacción a 0 y el ACS como estaba).
