<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Quién es el CLIENTE y quién el PARTNER

**REGLA — el que va en el certificado es el CLIENTE, y punto.** Cuando nos
contrata una empresa pero la vivienda es de un particular, el modelo NO es
inventarse un "titular": es el de siempre en toda la app —**la empresa es el
PARTNER** que trae el encargo (`prescriptor_id`) y **el particular es el CLIENTE**
(`cliente_id`).

Medido en 2026CEE_54: nos lo trae ATERSOL (partner, INSTALADOR) y el CEE se emite
a nombre de Vicente Gavidia (cliente). Hubo una versión con un campo `titular`
aparte; se retiró —columna incluida— porque tener DOS campos contestando a "quién
va en el certificado" es una contradicción esperando a ocurrir.

**La base de clientes es LA MISMA que la del CAE.** Un cliente puede tener a la
vez oportunidades, expedientes CAE y CEE sueltos. Se da de alta desde Clientes o
desde el propio formulario del CEE, y **se edita sin salir de él** (`ClientePicker`
→ "Editar" abre `ClienteDetailModal`): si para corregir un teléfono hay que irse a
otra pestaña, se pierde lo que estabas haciendo y casi nadie vuelve.
