# Califica un .cex con CE3X 3.1 (sin ventana), calcula sus medidas de mejora y
# escribe el XML del certificado: lo mismo que abrirlo y pulsar «Calificar»,
# «Calcular medidas» y «Generar XML». El PDF lo hace despues xml2cert.exe.
#
#   CASO=C:\ruta\x.cex XML=C:\ruta\x.xml [SIN_MEDIDAS=1] RESULTADO=C:\ruta\r.json
#
# Lo llama services/cee/cexAPdf.js, que se ocupa de las rutas (siempre ASCII:
# el subprocess de Python 2.7 de CE3X no admite tildes) y del PDF.
# Lo que diga CE3X es lo que vale: aqui no se decide nada.
import os, json
D = os.environ['ORACULO_DIR']
execfile(os.path.join(D, 'headless.py'))
execfile(os.path.join(D, 'res.py'))
execfile(os.path.join(D, 'xml.py'))

CASO = os.environ['CASO']
SALIDA = {'version': None, 'abrir': [], 'calificacion': None, 'medidas': [],
          'medidas_log': [], 'xml': [], 'generales': None, 'error': None}

def _txt(x):
    try: return unicode(x)
    except Exception: return repr(x)

try:
    del LOG[:]
    FRAME.abreArchivoCEX(CASO, False, False)
    FRAME.filename = CASO
    SALIDA['version'] = _txt(getattr(FRAME, 'versionArchivoGuardado', None))
    SALIDA['abrir'] = list(LOG)
    if not getattr(FRAME, 'versionArchivoGuardado', None):
        # abreArchivoCEX vuelve sin abrir NADA (ni lee el fichero) si no hay un
        # CE3X 3.1 abierto en el equipo: lo decide cexAPdf.js, que lo arranca.
        raise RuntimeError('NO_ABRE')

    g = FRAME.panelDatosGenerales
    if hasattr(g, 'superficieUtil'):
        SALIDA['generales'] = {
            'superficie_util': _txt(g.superficieUtil.GetValue()),
            'viviendas': _txt(g.numViviendas.GetValue()),
            'plantas_bajo_rasante': _txt(g.numeroPlantasBajoRasante.GetValue()),
            'plantas_sobre_rasante': _txt(g.numeroPlantasSobreRasante.GetValue()),
        }

    del LOG[:]
    FRAME.calculoCalificacion(False)
    r = resultados()
    r['_log'] = list(LOG)
    SALIDA['calificacion'] = r

    if r.get('_valido') and not os.environ.get('SIN_MEDIDAS'):
        del LOG[:]
        try:
            FRAME.calculoMedidasUsuario(False)
        except Exception:
            import traceback
            SALIDA['medidas_log'].append(traceback.format_exc().decode('utf-8', 'replace'))
        SALIDA['medidas_log'] += list(LOG)
        for gm in getattr(FRAME, 'listadoConjuntosMMUsuario', None) or []:
            st = gm.__dict__
            SALIDA['medidas'].append({'nombre': _txt(st.get('nombre')),
                                      'ahorro': [_txt(x) for x in (st.get('ahorro') or [])]})

    if r.get('_valido'):
        SALIDA['xml'] = generar_xml(os.environ['XML'])
except RuntimeError as e:
    if str(e) == 'NO_ABRE':
        SALIDA['error'] = 'NO_ABRE'
    else:
        import traceback
        SALIDA['error'] = traceback.format_exc().decode('utf-8', 'replace')
except Exception:
    import traceback
    SALIDA['error'] = traceback.format_exc().decode('utf-8', 'replace')

f = open(os.environ['RESULTADO'], 'wb')
f.write(json.dumps(SALIDA, default=_txt))
f.close()
