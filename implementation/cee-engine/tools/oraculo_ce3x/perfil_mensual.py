# El REPARTO MENSUAL con el que CE3X 3.2 reparte el consumo de calefaccion y de
# refrigeracion (sus `coeficientesCal` / `coeficientesRef`, que son el reparto
# de su demanda mes a mes), por zona climatica: cada .cex en su zona y, si es de
# Ciudad Real (localidad «Otro»), en las doce de la peninsula.
#
#   LISTA=C:\ruta\lista.json SALIDA_JSON=C:\ruta\perfil.json bash run.sh "$(pwd)/perfil_mensual.py"
#
# `lista.json` = [{"ruta": "C:\\...\\x.cex", "zona": "D3", ...}, ...] (rutas ASCII).
# De aqui sale la tabla `PERFILES` de
# frontend/src/features/expedientes/logic/autoconsumoMensual.js (la media por
# zona). Medido el 08/10/2026 con 14 viviendas de D3 y 11 de D2; ~2 min por
# fichero con las doce zonas. Lo que diga CE3X es lo que vale.
#
# Por que: en CE3X 3.2 el autoconsumo fotovoltaico de cada mes no puede pasar
# del consumo electrico de ese mes (CE3X avisa), y ese consumo es
#     S * (Cal * coefCal[mes] + Ref * coefRef[mes] + (ACS + Ilu) * dias/365)
# con Cal, Ref, ACS e Ilu los kWh/m2 electricos del XML del certificado.
import os, json, time
D = os.environ['ORACULO_DIR']
execfile(os.path.join(D, 'headless.py'))
execfile(os.path.join(D, 'res.py'))
LISTA = json.load(open(os.environ['LISTA']))
SALIDA = os.environ['SALIDA_JSON']
ZONAS = [u'A3', u'A4', u'B3', u'B4', u'C1', u'C2', u'C3', u'C4', u'D1', u'D2', u'D3', u'E1']
res = []


def toma(etq):
    oe = FRAME.objEdificio
    if oe is None or not getattr(oe, 'casoValido', False):
        return {'etq': etq, 'ok': False, 'aviso': repr(getattr(oe, 'mensajeAviso', None))[:200],
                'log': [l[:200] for l in LOG][-3:]}
    d = oe.__dict__
    dr = oe.datosResultados.__dict__
    return {'etq': etq, 'ok': True,
            'cal': list(d.get('coeficientesCal') or []), 'ref': list(d.get('coeficientesRef') or []),
            'acs': list(d.get('coeficientesACS') or []), 'ilu': list(d.get('coeficientesIlum') or []),
            'ddaCal': dr.get('ddaBrutaCal'), 'ddaRef': dr.get('ddaBrutaRef')}


for f in LISTA:
    t0 = time.time()
    fila = {'ruta': f['ruta'], 'zona': f.get('zona'), 'medidas': []}
    try:
        del LOG[:]
        FRAME.abreArchivoCEX(f['ruta'], False, False)
        # Los .cex de la 2.3 no traen lo que la 3.x exige para calificar.
        try:
            rellenar_generales()
        except Exception as e:
            fila['relleno'] = str(e)[:100]
        FRAME.calculoCalificacion(False)
        fila['medidas'].append(toma('propia'))
        g = FRAME.panelDatosGenerales
        if g.provinciaChoice.GetStringSelection() == u'Ciudad Real':
            g.localidadChoice.SetStringSelection(u'Otro')
            for z in ZONAS:
                try:
                    g.HE1.SetStringSelection(z)
                    FRAME.calculoCalificacion(False)
                    m = toma(z)
                    m['he1'] = g.HE1.GetStringSelection()
                    fila['medidas'].append(m)
                except Exception as e:
                    fila['medidas'].append({'etq': z, 'ok': False, 'error': str(e)[:200]})
    except Exception:
        import traceback
        fila['error'] = traceback.format_exc()[-400:]
    fila['s'] = round(time.time() - t0, 1)
    res.append(fila)
    json.dump(res, open(SALIDA, 'w'), indent=0)
    print 'hecho', f['ruta'][-12:], fila['s'], len(fila['medidas'])
