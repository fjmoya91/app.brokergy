# Pasa paredes de un .cex a «Muro en contacto con el terreno» y quita o recorta
# forjados, HACIENDOLO CE3X (su panel y su boton «Anadir»), y guarda encima.
#
#   CASO=C:\ruta\x.cex MUROS=PS1S1,PS1O3 [QUITAR=PHS11,PH11] [SUPERFICIES=SUS11=19]
#   [RESULTADO=C:\ruta\r.json]   bash run.sh "$(pwd)/muros_terreno.py"
#
# MUROS, QUITAR y SUPERFICIES van por el IDENTIFICADOR del cerramiento (la
# primera palabra de su nombre: «PS1S1 PARTICION CON EL VECINO» -> PS1S1).
#
# Por que lo hace CE3X y no el motor (26RES060_191, 01/10/2026):
# - El muro con terreno NO admite «Conocidas»: solo «Estimadas» o «Por defecto».
#   Va «Por defecto», y la U la pone CE3X por la normativa (CTE 2010, D3 -> 0,66).
#   Registro que escribe CE3X (panelFachadaConTerreno.cogerDatos):
#   [nombre, 'Fachada', sup, U, 200.0, '', '', u'Sin patron', u'Por defecto', [],
#    u'', u'', u'1', zona, 'terreno'].
# - Una pared quitada deja HUERFANOS sus puentes termicos (pilares, forjado), y
#   entonces CE3X no abre el fichero: «TreeCtrl_AppendItem ... wxTreeItemId». Se
#   quitan con ella (un muro enterrado no lleva los puentes de una fachada).
# - El panel se rehace tras cada «Anadir»: hay que volver a abrirlo cada vez.
#
# ⚠ Una medida de mejora que ya traiga el fichero conserva la envolvente de
# ANTES: vuelve a ponerla (motor, /cex/medida) y a calcularla despues.
import json
D = os.environ['ORACULO_DIR']
execfile(os.path.join(D, 'headless.py'))

def _lista(k):
    return [x.strip() for x in (os.environ.get(k) or '').split(',') if x.strip()]

CASO = os.environ['CASO']
MUROS = _lista('MUROS')
QUITAR = _lista('QUITAR')
SUPERFICIES = dict(x.split('=', 1) for x in _lista('SUPERFICIES'))
SALIDA = {'muros': [], 'quitados': [], 'puentes_quitados': [], 'superficies': [], 'error': None}

def ident(c):
    return c[0].split(u' ')[0]

try:
    FRAME.abreArchivoCEX(CASO, False, False)
    FRAME.filename = CASO
    if not getattr(FRAME, 'versionArchivoGuardado', None):
        raise RuntimeError('NO_ABRE (hace falta un CE3X 3.1 abierto en el equipo)')
    PE = FRAME.panelEnvolvente
    EO = PE.panelElegirObjeto
    import Envolvente.panelFachadaConTerreno as M

    def busca(w):
        for c in w.GetChildren():
            if isinstance(c, M.Panel1):
                return c
            r = busca(c)
            if r:
                return r

    viejos = [c for c in PE.cerramientos if ident(c) in MUROS]
    falta = set(MUROS) - set(ident(c) for c in viejos)
    if falta:
        raise RuntimeError('no estan en el fichero: ' + ', '.join(sorted(falta)))
    for c in viejos:
        EO.definirFachada.SetValue(True); EO.OndefinirFachada(None)
        EO.contactoSuelo.SetValue(True); EO.OncontactoSuelo(None)
        P = busca(FRAME)
        P.nombreMuro.SetValue(ident(c) + u' MURO EN CONTACTO CON EL TERRENO')
        P.subgrupoChoice.SetStringSelection(c[-2])
        P.superficieMuro.SetValue(unicode(c[2]))
        P.valorUChoice.SetStringSelection(u'Por defecto')
        try:
            P.OnValorUChoiceChoice(None)
        except Exception:
            pass
        PE.panelBotones.OnAnadirBotonButton(None)
        nuevo = PE.cerramientos[-1]
        SALIDA['muros'].append({'antes': c[0], 'tipo_antes': c[1], 'u_antes': c[3],
                                'ahora': nuevo[0], 'u': nuevo[3], 'superficie': nuevo[2], 'zona': nuevo[-2]})
    nombres = set()
    for c in viejos:
        PE.cerramientos.remove(c); nombres.add(c[0])
    for c in list(PE.cerramientos):
        if ident(c) in QUITAR:
            PE.cerramientos.remove(c); nombres.add(c[0])
            SALIDA['quitados'].append({'nombre': c[0], 'superficie': c[2], 'zona': c[-2]})
        elif ident(c) in SUPERFICIES:
            SALIDA['superficies'].append({'nombre': c[0], 'antes': c[2], 'ahora': SUPERFICIES[ident(c)]})
            c[2] = unicode(SUPERFICIES[ident(c)])
    for pt in list(PE.puentesTermicos):
        if isinstance(pt, list) and len(pt) > 7 and pt[7] in nombres:
            PE.puentesTermicos.remove(pt); SALIDA['puentes_quitados'].append(pt[0])
    FRAME.OnMenuFileSaveMenu(None)
except Exception:
    import traceback
    SALIDA['error'] = traceback.format_exc().decode('utf-8', 'replace')

print json.dumps(SALIDA, ensure_ascii=False, indent=1).encode('utf-8')
if os.environ.get('RESULTADO'):
    f = open(os.environ['RESULTADO'], 'wb'); f.write(json.dumps(SALIDA)); f.close()
