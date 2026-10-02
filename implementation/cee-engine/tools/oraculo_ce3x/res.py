CLAVES = ['ddaBrutaCal','ddaBrutaRef','ddaBrutaACS','enFinal','enFinalCal','enFinalACS','enFinalRef','enFinalContrib','emisiones','emisionesCal','emisionesACS','emisionesRef','emisiones_nota','enPrimNoRen','enPrimNoRen_nota']
def resultados():
    oe = FRAME.objEdificio
    if oe is None or not getattr(oe, 'casoValido', False):
        return {'_valido': False, '_aviso': getattr(oe, 'mensajeAviso', None)}
    d = oe.datosResultados.__dict__
    out = {'_valido': True}
    for k in CLAVES:
        if k in d: out[k] = d[k]
    for k in sorted(d):
        if k.startswith('enPrimNoRen') and '_' not in k: out[k] = d[k]
    return out
def rellenar_generales(viviendas=u'1', bajo=u'0', sobre=None):
    g = FRAME.panelDatosGenerales
    if not g.superficieUtil.GetValue(): g.superficieUtil.SetValue(g.superficie.GetValue())
    if not g.numViviendas.GetValue(): g.numViviendas.SetValue(viviendas)
    if not g.numeroPlantasBajoRasante.GetValue(): g.numeroPlantasBajoRasante.SetValue(bajo)
    if not g.numeroPlantasSobreRasante.GetValue(): g.numeroPlantasSobreRasante.SetValue(sobre or g.numeroPlantas.GetValue())
