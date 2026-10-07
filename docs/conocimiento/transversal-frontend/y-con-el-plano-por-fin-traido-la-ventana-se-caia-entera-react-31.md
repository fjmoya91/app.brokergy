<!-- conocimiento · área: transversal-frontend · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «El botón que metía su propio EVENTO dentro del POST (2026-09-18)», en el CLAUDE.md antiguo.

### Y con el plano por fin traído, la ventana se caía entera (React #310)

Arreglado el botón, la geometría llegó —`200`, **1,34 MB**— y la pantalla se fue
a «ALGO HA FALLADO · Minified React error #310». No era otro fallo nuevo: era el
que el lint ya marcaba y que **nunca se había llegado a ejecutar**, porque hacía
dos días que no se cruzaba ese render.

`useState(cuerpoSel)` y el `useMemo` de `cuerpos` se declaraban DEBAJO del
`return` de «todavía no hay geometría». El primer render salía antes de
declararlos y el siguiente, ya con el plano medido, declaraba dos más: React
corta ahí (*rendered more hooks than during the previous render*) y **tumba la
pantalla entera**. El mismo fallo estaba en `PlanoPlanta`, detrás del `return` de
«esta planta no tiene plano».

**REGLA — ningún hook por debajo de un `return` condicional, y el BUILD lo
comprueba.** `vite build` no pasa el lint, así que una violación de
`rules-of-hooks` se compila tan campante y llega a producción a esperar a que
alguien cruce ese `return`. El día que se escribió el candado había **OCHO** en
el repo:

| Pantalla | Qué se caía |
|---|---|
| `EnvolventeView` · `PlanoPlanta` | la ventana del certificador, con el plano ya medido |
| `ResumenEconomicoExpediente` | el panel económico del expediente |
| `LotesResumen` | el cuadro de mando de lotes, al llegar los datos |
| `ResultsPanel` (comparativa) · `ProposalModal` | al abrir el popup |

Se arreglaron las ocho —el hook sube por encima del `return`, o se le quita el
`useCallback` si no aportaba nada— y ahora
[check-hooks.mjs](implementation/frontend/scripts/check-hooks.mjs) va **enganchado
a `npm run build`**: con una violación, el build sale con 1 y el deploy se para
antes de compilar. No sustituye a `npm run lint`: vigila UNA regla, la que tumba
la pantalla. Meter ahí las demás (efectos que llaman a `setState`, fast-refresh)
convertiría el candado en algo que hay que saltarse.

```bash
cd implementation/frontend && npm run check:hooks
```

⚠️ En `ResultsPanel`, el popup de comparativa **deja de abrirse** si no hay casos
comparables (`stats` a `null`), donde antes se caía con un TypeError. Es mejor que
una pantalla en blanco, pero sigue siendo un clic que no hace nada: si alguna vez
sale, lo que toca es enseñar «no hay casos comparables», no volver a quitar la
guarda.
