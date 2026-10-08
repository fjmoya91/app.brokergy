# Abre un .cex con CE3X (sin ventana), lo califica y, si se pide, calcula sus
# medidas de mejora y escribe su XML. Lo que diga CE3X es lo que vale.
#
#   CASO=C:\ruta\fichero.cex [MEDIDAS=1] [XML=C:\ruta\fichero.xml] bash run.sh "$(pwd)/abrir.py"
#
# Con la 2.3 abre el fichero, pero el arnés no consigue lanzar su cálculo
# (`casoValido` sale None): para la 2.3 sirve para ver que lo abre sin errores.
import os
D = os.environ['ORACULO_DIR']
execfile(os.path.join(D, 'headless.py'))
execfile(os.path.join(D, 'res.py'))
execfile(os.path.join(D, 'xml.py'))

CASO = os.environ['CASO']
del LOG[:]
FRAME.abreArchivoCEX(CASO, False, False)
print 'abrir ->', getattr(FRAME, 'versionArchivoGuardado', '?'), LOG

g = FRAME.panelDatosGenerales
if hasattr(g, 'superficieUtil'):
    # Los campos que la 3.x exige para calificar.
    print 'generales 3.x: sup util', repr(g.superficieUtil.GetValue()), \
        'viviendas', repr(g.numViviendas.GetValue()), \
        'bajo rasante', repr(g.numeroPlantasBajoRasante.GetValue()), \
        'sobre rasante', repr(g.numeroPlantasSobreRasante.GetValue())

del LOG[:]
try:
    FRAME.calculoCalificacion(False)
except Exception:
    import traceback; traceback.print_exc()
r = resultados()
print 'calificacion ->', r.get('_valido'), r.get('_aviso'), LOG
for k in ('ddaBrutaCal', 'ddaBrutaACS', 'ddaBrutaRef', 'emisiones', 'emisiones_nota',
          'enPrimNoRen', 'enPrimNoRen_nota', 'enFinalContrib'):
    print '   ', k, r.get(k)

if os.environ.get('MEDIDAS'):
    del LOG[:]
    try:
        FRAME.calculoMedidasUsuario(False)
    except Exception:
        import traceback; traceback.print_exc()
    print 'medidas ->', LOG
    for gm in getattr(FRAME, 'listadoConjuntosMMUsuario', None) or []:
        st = gm.__dict__
        print '   medida', repr(st.get('nombre')), 'ahorro', st.get('ahorro')

x = os.environ.get('XML')
if x:
    print 'xml ->', generar_xml(x)
