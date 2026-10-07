<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «REVISAR el CEE que entrega el certificador (2026-09-21)», en el CLAUDE.md antiguo.

### El buzón, medido (2026-09-21)

La primera prueba con trece fotos reales salió mal, y por tres cosas distintas:

**1 · Las miniaturas salían ROTAS, así que no había nada que revisar.** Los
`objectURL` se creaban en el inicializador de `useState` y se revocaban en el
cleanup del efecto. En **StrictMode** (desarrollo) React monta, desmonta y
remonta, y al remontar el estado se **RESTAURA en vez de recalcularse**: las
URLs quedaban revocadas y no se volvían a crear. Se crean ahora dentro del
efecto, que es lo que hace que el ciclo de StrictMode las suelte y las rehaga.
⚠️ No es un problema "solo de desarrollo": lo que se rompe es el orden de
creación y liberación, y revocar un recurso que el render sigue usando está mal
en cualquier modo.

**2 · Reconocía las fotos y las dejaba sin clasificar igual.** Once de trece, con
descripciones correctas ("Ventana de baño", "Tuberías y vaso de expansión"). Dos
causas:

- **El expediente era un RES060 y no tiene apartado de ventanas** (su ficha no
  cubre envolvente, regla 12.b). El modelo hacía bien en no inventarse un
  destino, pero el resultado era un hueco mudo: trece casillas vacías y ninguna
  pista. Ahora devuelve también el **`concepto`** —de la lista de
  `ADDABLE_CONCEPTS`, la misma del botón "Añadir apartado de obra"— y el buzón
  ofrece **"3 fotos parecen de ventanas · este expediente no tiene ese apartado
  → ➕ Añadir apartado"**, que lo activa por el MISMO endpoint de siempre y
  coloca esas fotos solas en el apartado de su fase.
- **El prompt era demasiado tímido.** "Aparato blanco con controles" es una
  caldera y salía DUDOSO. Ahora se le dice que asigne siempre que reconozca el
  objeto, que un apartado `multiple` admite todas las perspectivas del mismo
  aparato, y qué cuenta como caldera —su entorno inmediato: los tubos, el vaso
  de expansión, la bomba, las llaves—, que es lo que sale en la mitad de las
  fotos de una sala de calderas.

**3 · Detalles que impedían revisar**: la miniatura no se podía ampliar (a 56 px
no se distingue la ventana de la cocina de la del baño, que es justo lo que hay
que confirmar) y el botón contaba APARTADOS donde lo que se reparte son
ARCHIVOS.

**Medido, no estimado** — sobre las fotos de ejemplo del tutorial, que son del
mismo tipo que las que llegan:

```bash
node implementation/backend/scripts/probar_clasificar_fotos.js
```

**7 de 7 correctas**, todas con confianza alta, 8,6 s y **0,005 €** la tanda
(in 3.402 · out 415 · pensamiento 1.215 tokens). El checklist del banco de
pruebas es el de un RES060 **sin envolvente** a propósito: la ventana tiene que
salir sin apartado y con `concepto: ventanas`, que es el caso que falló.
