# Califica un .cex con CE3X 3.2 (sin ventana), calcula sus medidas de mejora y
# escribe el XML del certificado: lo mismo que abrirlo y pulsar «Calificar»,
# «Calcular medidas» y «Generar XML». El PDF lo hace despues xml2cert.exe.
#
#   CASO=C:\ruta\x.cex XML=C:\ruta\x.xml [SIN_MEDIDAS=1] RESULTADO=C:\ruta\r.json
#   [AJUSTAR_AUTOCONSUMO=1 SALIDA_CEX=C:\ruta\ajustado.cex]
#
# EL AUTOCONSUMO MES A MES (CE3X 3.2, 08/10/2026): CE3X solo usa el TOTAL anual
# de la «Generacion renovable electrica», pero avisa (`mensajeAviso` del
# edificio y de cada medida) de cada mes en que el autoconsumo supera el consumo
# electrico de calefaccion + refrigeracion + ACS de ESE mes, con su consumo. La
# regla (decision del usuario): cada mes, lo menor entre la produccion de PVGIS
# y lo que el edificio consume. La app lo aproxima con el XML; aqui manda CE3X:
# con AJUSTAR_AUTOCONSUMO cada mes avisado se RECORTA a su consumo (si hay varios
# generadores, a prorrata), se recalcula y el .cex se GUARDA en SALIDA_CEX con
# CE3X. `autoconsumo` del resultado dice que meses, cuanto y si se guardo.
#
# Lo llama services/cee/cexAPdf.js, que se ocupa de las rutas (siempre ASCII:
# el subprocess de Python 2.7 de CE3X no admite tildes) y del PDF.
# Lo que diga CE3X es lo que vale: aqui no se decide nada.
import os, json, re, math
D = os.environ['ORACULO_DIR']
execfile(os.path.join(D, 'headless.py'))
execfile(os.path.join(D, 'res.py'))
execfile(os.path.join(D, 'xml.py'))

CASO = os.environ['CASO']
SALIDA = {'version': None, 'abrir': [], 'calificacion': None, 'medidas': [],
          'medidas_log': [], 'xml': [], 'generales': None, 'error': None,
          'autoconsumo': {'edificio': None, 'medidas': [], 'guardado': False}}
AJUSTAR = bool(os.environ.get('AJUSTAR_AUTOCONSUMO'))

#: Los meses del objeto `models.GeneradorElectrico` y como los nombra el aviso.
MESES_GEN = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
             'septiembre', 'octubre', 'noviembre', 'diciembre']
NOMBRES_MES = [u'Enero', u'Febrero', u'Marzo', u'Abril', u'Mayo', u'Junio', u'Julio',
               u'Agosto', u'Septiembre', u'Octubre', u'Noviembre', u'Diciembre']


def meses_que_superan(aviso):
    """{indice de mes: consumo electrico de ese mes (kWh)} de los meses avisados."""
    out = {}
    if not aviso or u'autoconsumo' not in aviso:
        return out
    for i, n in enumerate(NOMBRES_MES):
        m = re.search(n + u': consumo de ([0-9.]+) kWh', aviso)
        if m:
            out[i] = float(m.group(1))
    return out


def recortar(gens, supera):
    """Cada mes avisado, al consumo de ese mes (a prorrata si hay varios
    generadores). Devuelve lo cambiado: [(mes, antes, despues)]."""
    hechos = []
    gens = [g for g in (gens or []) if g is not None]
    for i, cons in sorted(supera.items()):
        m = MESES_GEN[i]
        total = sum(float(getattr(g, m, 0) or 0) for g in gens)
        if total <= cons or total <= 0:
            continue
        k = cons / total
        for g in gens:
            antes = float(getattr(g, m, 0) or 0)
            # Hacia abajo: el aviso salta con «supera», y un redondeo hacia
            # arriba lo volveria a disparar.
            despues = math.floor(antes * k * 100) / 100.0
            setattr(g, m, despues)
            hechos.append((NOMBRES_MES[i], antes, despues))
    for g in gens:
        g.consumoMensual = [float(getattr(g, m, 0) or 0) for m in MESES_GEN]
    return hechos


def informe(supera, hechos):
    return {'meses': dict((NOMBRES_MES[i], c) for i, c in supera.items()),
            'recortes': [{'mes': a, 'antes': b, 'despues': c} for a, b, c in hechos]}

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
    ajustado = False

    # Las placas del EDIFICIO (un CEE final con la fotovoltaica ya instalada).
    oe = FRAME.objEdificio
    supera = meses_que_superan(getattr(oe, 'mensajeAviso', u'')) if r.get('_valido') else {}
    if supera:
        hechos = []
        if AJUSTAR:
            hechos = recortar(getattr(FRAME.panelInstalaciones, 'generadoresElectrico', None), supera)
            if hechos:
                ajustado = True
                del LOG[:]
                FRAME.calculoCalificacion(False)
                r = resultados()
                r['_log'] = list(LOG)
                SALIDA['calificacion'] = r
        SALIDA['autoconsumo']['edificio'] = informe(supera, hechos)

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
            gens = st.get('listadoGeneradoresElectricoMM') or []
            if gens:
                # Con placas, se vuelve a calcular la medida para tener SU aviso
                # (una medida ya calculada no se recalcula sola).
                try:
                    gm.incluirMedidas(); gm.calificacion(); gm.calcularAhorros()
                    ne = st.get('datosNuevoEdificio')
                    supera = meses_que_superan(getattr(ne, 'mensajeAviso', u''))
                    hechos = []
                    if supera and AJUSTAR:
                        hechos = recortar(gens, supera)
                        if hechos:
                            ajustado = True
                            gm.incluirMedidas(); gm.calificacion(); gm.calcularAhorros()
                    if supera:
                        rep = informe(supera, hechos)
                        rep['nombre'] = _txt(st.get('nombre'))
                        SALIDA['autoconsumo']['medidas'].append(rep)
                except Exception:
                    import traceback
                    SALIDA['medidas_log'].append(traceback.format_exc().decode('utf-8', 'replace'))
            SALIDA['medidas'].append({'nombre': _txt(st.get('nombre')),
                                      'ahorro': [_txt(x) for x in (st.get('ahorro') or [])]})

    if ajustado and os.environ.get('SALIDA_CEX'):
        # Guardado por el PROPIO CE3X, como si se pulsara «Guardar».
        del LOG[:]
        FRAME.filename = os.environ['SALIDA_CEX']
        FRAME.OnMenuFileSaveMenu(None)
        SALIDA['autoconsumo']['guardado'] = os.path.exists(os.environ['SALIDA_CEX'])
        # CE3X 3.2 deja el XML junto al .cex que tiene abierto y con su nombre:
        # se vuelve al de entrada para que salga donde lo espera quien llama
        # (es el mismo edificio: lo que hay en memoria es lo ajustado).
        FRAME.filename = CASO

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
