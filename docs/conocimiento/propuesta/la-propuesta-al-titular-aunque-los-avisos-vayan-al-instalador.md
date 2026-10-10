<!-- conocimiento · área: propuesta · las rutas de los enlaces son relativas a la raíz del repo -->

## La propuesta al TITULAR, aunque sus avisos vayan al instalador (2026-10-10)

Hay instaladores que quieren recibir ellos la simulación y, cuando la ven bien, nos
piden que se la mandemos nosotros al cliente. En la ficha del cliente eso es «los avisos
los recibe el partner» (`notificaciones_contacto_activas` + `persona_contacto_*`), y el
popup de envío solo conocía a esa persona: la fila CLIENTE era el instalador y **el
titular no aparecía**. Medido en 26RES060_OP264: «JESÚS · CLIENTE · 636748521» (el
instalador) y FRANCISCO, con su 647426378, sin forma de elegirlo.

**REGLA — con los avisos desviados, el titular es una fila más: `TITULAR`.**
`ProposalModal` la añade cuando el cliente tiene la persona de contacto activa y el
titular tiene un teléfono o un email DISTINTO del de esa persona (si son los mismos,
sería la misma persona dos veces). Viene sin marcar: lo de por defecto sigue siendo lo
que dice la ficha. Cuenta como cliente en todo: tuteo, email de cliente, aviso del CEE y
paso a ENVIADA (`EnviarPropuestaModal` y el envío programado, `propuestaProgramada.js`).
El robot la pide con `--a titular` ([claude_propuesta.js](implementation/backend/scripts/claude_propuesta.js)).

**REGLA — si la oportunidad viene de un colaborador, al titular se le escribe «En
colaboración con {empresa}, te adjuntamos…»**, no «Tal y como acordamos, te adjunto…»:
quien habló con el cliente fue el instalador. La empresa es la del co-branding de la
propuesta (`cobrand`: el instalador asociado o, si no, el partner; nunca BROKERGY). Solo
al propio titular —fila `TITULAR`, o `CLIENTE` sin desvío—: a la persona de contacto
(casi siempre ese mismo instalador) se le sigue escribiendo como antes.
