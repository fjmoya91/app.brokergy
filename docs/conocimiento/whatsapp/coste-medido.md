<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «La API de Gemini va en NIVEL DE PAGO (2026-09-01)», en el CLAUDE.md antiguo.

### Coste medido (2026-08-25)

- **En reposo**: UNA consulta cada 30 s con índice parcial. El índice de
  teléfonos es perezoso —solo se construye al llegar un mensaje—, así que sin
  tráfico el bot no consulta nada más.
- **Por mensaje**: `datos_calculo` pesa **86 KB de media** (5,3 MB el peor caso).
  Con el tope de 40 respuestas/día son ~6 MB diarios de egress. No compensa
  optimizarlo pidiendo subcampos: el riesgo de que falte uno y el checklist
  salga mal en silencio supera el ahorro.
- **Tamaño**: las dos tablas nuevas ocupan 176 KB sobre una base de 106 MB.
