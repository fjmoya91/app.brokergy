"""El CEE PREVISTO de un RES080: el edificio DESPUES de la obra, para calcular el
ahorro antes de hacerla.

QUE ES
------
En un RES080 se hacen DOS certificados antes de la obra: el INICIAL (la casa como
esta) y el PREVISTO (la casa con la medida de mejora entera ya puesta: aerotermia,
aires, ventanas, aislamiento...). El ahorro de la ficha es la diferencia entre los
dos, y el previsto se mete en el inicial como su medida de mejora («Nuevo Edificio
Definido por el Usuario»).

COMO SE HACE A MANO, Y POR ESO SE HACE ASI
------------------------------------------
Se abre el inicial, se cambia lo que cambia la obra y se guarda con otro nombre.
Medido sobre los previstos de 19 expedientes RES080 (los de Eladio, Laura Millan,
Diego Rubio, Natalia Ramos...):

  · los EQUIPOS son los de la medida (la aerotermia sustituye a la caldera);
  · las VENTANAS que se cambian pasan a «Conocidas» con los valores de su ficha
    (o, sin ficha, U marco 1,3 · U vidrio 1,3 · g 0,43 · 20 % de marco ·
    permeabilidad 3 m³/h·m², decision de 2026-10-06);
  · los cerramientos que se AISLAN, con su U nueva en «Conocidas»;
  · la VENTILACION a 0,53 ren/h y la MASA de las particiones a «Ligera» (lo que
    hacen los previstos desde 2025: una vivienda con ventanas nuevas es mas
    estanca, decision de 2026-10-06);
  · y sin medidas de mejora: el previsto ES la medida.

Todo lo demas —la geometria, las transmitancias de lo que no se toca, el
tecnico, las imagenes— sale del inicial BYTE A BYTE (`editar_cex.sustituir_pickles`).

LO QUE ESTE FICHERO NO DECIDE
-----------------------------
Ni la U del aislamiento ni los valores de una ventana: los manda quien llama
(la U del aislamiento se le PREGUNTA a una persona, nunca se supone). Aqui solo
se escriben con la forma que guarda CE3X, medida sobre el corpus:

  Fachada al aire     [8]='Conocidas' [9]=[True, U, masa]            (122 de 122)
  Cubierta al aire    [8]='Conocidas' [9]=[forma, True, U, masa]     (18 de 18)
  Suelo al aire       [8]='Conocidas' [9]=[True, False, U, masa]     (3 de 3)
  Particion interior  [8]='Conocidas' [9]=[U]                        (28 de 28)
  Hueco               clase HuecoConocidas (3.456 en 1.455 ficheros)

Un suelo contra el TERRENO no se escribe nunca en «Conocidas» (ni uno en el
corpus: CE3X modela el terreno aparte) y una MEDIANERA es adiabatica: los dos se
rechazan con su nombre.
"""
from __future__ import annotations

from typing import Any

import generar_cex as G
import leer_cex as L
from errores import GeneracionError
from pickle0 import Cadena

#: Lo que llevan los previstos (decision del usuario, 2026-10-06).
VENTILACION = 0.53
MASA_PARTICIONES = "Ligera"
MASAS = ("Ligera", "Media", "Pesada")

#: Una ventana nueva sin ficha (decision del usuario, 2026-10-06).
VENTANA_DEFECTO = {"u_marco": 1.3, "u_vidrio": 1.3, "g": 0.43,
                   "porc_marco": 20, "permeabilidad": 3}

#: Por encima de este % de marco es una PUERTA (90 la de entrada, 100 la opaca):
#: el 20 % de una ventana no se le aplica, conserva el suyo.
PORC_PUERTA = 60.0


def _n(x: Any, que: str) -> float:
    v = G._numf(x)
    if v is None:
        raise GeneracionError(f"{que}: {x!r} no es un numero")
    return float(v)


def _clave(nombre: Any) -> str:
    """Un nombre para comparar: sin el sufijo de la reforma y sin mayusculas."""
    n = str(nombre or "").strip()
    if n.endswith(G.SUFIJO_CAMBIA):
        n = n[: -len(G.SUFIJO_CAMBIA)]
    return n.strip().casefold()


def _cambia(nombre: Any) -> bool:
    """Marcado en el plano como lo que se reforma (regla 66)."""
    return str(nombre or "").strip().endswith(G.SUFIJO_CAMBIA.strip())


def _seleccion(que: Any, nombres: list[str]) -> tuple[set[int], list[str]]:
    """Que elementos toca una regla: 'cambia' (los marcados «- CAMBIA» en el
    plano), 'todos', o una lista de nombres. Un nombre que no existe NO se traga:
    escribir el previsto sin ese elemento daria un ahorro de otra obra."""
    if que in (None, "", "cambia"):
        return {i for i, n in enumerate(nombres) if _cambia(n)}, []
    if que == "todos":
        return set(range(len(nombres))), []
    if isinstance(que, str):
        que = [que]
    claves = [_clave(n) for n in nombres]
    elegidos, faltan = set(), []
    for q in que:
        hit = {i for i, c in enumerate(claves) if c == _clave(q)}
        if not hit:
            faltan.append(str(q))
        elegidos |= hit
    return elegidos, faltan


# --------------------------------------------------------------------------
# Huecos
# --------------------------------------------------------------------------

def _hueco_conocido(h: Any, v: dict) -> list[str]:
    """Pasa un hueco (ya reemitido) a «Conocidas» con los valores de `v`. EN SITIO.

    La forma es la de los 3.456 HuecoConocidas del corpus: desaparecen
    `tipoMarco`/`tipoVidrio`, aparecen los tres `*Conocido` (texto) junto a sus
    gemelos numericos, la permeabilidad pasa a «Valor conocido» y las
    absortividades a [0, 0] (2.922 de 3.456).
    """
    st = h.estado
    nombre = str(st.get("descripcion") or "?")
    um = _n(v.get("u_marco", VENTANA_DEFECTO["u_marco"]), f"{nombre}: U del marco")
    uv = _n(v.get("u_vidrio", VENTANA_DEFECTO["u_vidrio"]), f"{nombre}: U del vidrio")
    g = _n(v.get("g", VENTANA_DEFECTO["g"]), f"{nombre}: factor solar")
    perm = _n(v.get("permeabilidad", VENTANA_DEFECTO["permeabilidad"]),
              f"{nombre}: permeabilidad")
    if not (0 < um < 10 and 0 < uv < 10 and 0 < g <= 1 and 0 < perm <= 100):
        raise GeneracionError(
            f"{nombre}: los valores de la ventana no son razonables "
            f"(U marco {um}, U vidrio {uv}, g {g}, permeabilidad {perm}).")
    avisos: list[str] = []
    porc_actual = G._numf(st.get("porcMarco"))
    if v.get("porc_marco") not in (None, ""):
        porc = _n(v["porc_marco"], f"{nombre}: % de marco")
    elif porc_actual is not None and porc_actual >= PORC_PUERTA:
        porc = porc_actual            # una puerta conserva su marco
    else:
        porc = float(VENTANA_DEFECTO["porc_marco"])
    if not (0 < porc <= 100):
        raise GeneracionError(f"{nombre}: el % de marco {porc} no vale")

    for k in ("tipoMarco", "tipoVidrio"):
        st.pop(k, None)
    h.clase = "HuecoConocidas"
    st[Cadena("__tipo__")] = Cadena("HuecoConocidas")
    st[Cadena("Umarco")] = um
    st[Cadena("Uvidrio")] = uv
    st[Cadena("Gvidrio")] = g
    st[Cadena("UmarcoConocido")] = G._dec(um)
    st[Cadena("UvidrioConocido")] = G._dec(uv)
    st[Cadena("GvidrioConocido")] = G._dec(g)
    st[Cadena("marcoSeleccionado")] = ""
    st[Cadena("vidrioSeleccionado")] = ""
    st[Cadena("porcMarco")] = G._dec(porc)
    st[Cadena("permeabilidadChoice")] = "Valor conocido"
    st[Cadena("permeabilidadValor")] = G._dec(perm)
    st[Cadena("absortividadPosiciones")] = [0, 0]
    return avisos


# --------------------------------------------------------------------------
# Cerramientos
# --------------------------------------------------------------------------

def _forma_cubierta(rec: list) -> str:
    par = rec[9] if len(rec) > 9 else None
    if isinstance(par, list) and par and isinstance(par[0], str) and "ubierta" in par[0]:
        return str(par[0])
    return "Cubierta plana"


def _cerramiento_conocido(rec: list, u: float) -> None:
    """Pone la U nueva en un cerramiento (ya reemitido), en «Conocidas». EN SITIO."""
    tipo, frontera = str(rec[1]), str(rec[-1])
    masa = str(rec[4])
    su = G._dec(u)
    if tipo == "Fachada" and frontera == "aire":
        par = [True, su, masa]
    elif tipo == "Cubierta":
        par = [_forma_cubierta(rec), True, su, masa]
    elif tipo == "Suelo" and frontera == "aire":
        par = [True, False, su, masa]
    elif tipo.startswith("Partici"):
        par = [su]
    else:
        raise GeneracionError(f"{rec[0]!r}: un {tipo.lower()} contra «{frontera}» no se "
                              "puede escribir con una U conocida")
    rec[3] = float(su)
    rec[8] = "Conocidas"
    rec[9] = par


def _u_aislado(rec: list, a: dict) -> float:
    if a.get("modo") == "u" or ("u" in a and "lambda" not in a):
        return _n(a.get("u"), f"{rec[0]}: U del aislamiento")
    u0 = G._numf(rec[3])
    if not u0:
        raise GeneracionError(f"{rec[0]!r}: no tiene U de partida a la que sumarle el "
                              "aislante; da la U final")
    return G.u_con_aislante(u0, _n(a.get("lambda"), "lambda"),
                            _n(a.get("espesor"), "espesor (m)"))


# --------------------------------------------------------------------------
# Lo que cambia el previsto
# --------------------------------------------------------------------------

def aplicar_envolvente(envolvente: Any, spec: dict) -> tuple[list, list[str], dict]:
    """El pickle 3 del previsto y lo que se ha cambiado (para el informe).

    `spec`:
      huecos:      [{que: 'cambia'|'todos'|[nombres], u_marco, u_vidrio, g,
                     porc_marco?, permeabilidad}]
      aislamiento: [{que: 'cambia'|'todos'|[nombres], elementos: [fachada|
                     cubierta|suelo|particion], modo: 'u'|'lambda', u | lambda +
                     espesor (m)}]
    Las reglas se aplican en orden: una posterior manda sobre una anterior.
    """
    env = G._reemitible(envolvente)
    cerr, huecos = env[0], env[1]
    avisos: list[str] = []
    hechos = {"huecos": [], "cerramientos": []}

    nombres_h = [str((h.estado or {}).get("descripcion") or "") for h in huecos]
    for regla in spec.get("huecos") or []:
        idx, faltan = _seleccion(regla.get("que"), nombres_h)
        if faltan:
            raise GeneracionError(f"Huecos que no existen en el inicial: {', '.join(faltan)}")
        if not idx:
            avisos.append("Ninguna ventana marcada «- CAMBIA»: el previsto no cambia "
                          "ningun hueco.")
        for i in sorted(idx):
            avisos += _hueco_conocido(huecos[i], regla)
            hechos["huecos"].append(nombres_h[i])

    nombres_c = [str(r[0]) if isinstance(r, list) and r else "" for r in cerr]
    for regla in spec.get("aislamiento") or []:
        tipos = {G.ELEMENTO_AISLAMIENTO[e] for e in (regla.get("elementos") or [])
                 if e in G.ELEMENTO_AISLAMIENTO}
        idx, faltan = _seleccion(regla.get("que"), nombres_c)
        if faltan:
            raise GeneracionError(
                f"Cerramientos que no existen en el inicial: {', '.join(faltan)}")
        tocados = 0
        for i in sorted(idx):
            rec = cerr[i]
            if not isinstance(rec, list) or len(rec) < 10:
                continue
            if tipos and str(rec[1]) not in tipos:
                continue
            if str(rec[1]) == "Fachada" and str(rec[-1]) == "edificio":
                if regla.get("que") not in (None, "", "cambia", "todos"):
                    raise GeneracionError(f"{rec[0]!r} es una MEDIANERA: no se aisla "
                                          "(es adiabatica)")
                continue
            if str(rec[1]) == "Suelo" and str(rec[-1]) == "terreno":
                raise GeneracionError(
                    f"{rec[0]!r} es un suelo contra el TERRENO: CE3X no admite su U "
                    "conocida (ni uno en el corpus). Aislarlo hay que hacerlo en CE3X.")
            u0 = G._numf(rec[3])
            u1 = _u_aislado(rec, regla)
            if u0 and u1 >= u0:
                avisos.append(f"{rec[0]!r}: la U nueva ({u1:.2f}) no mejora la que "
                              f"tiene ({u0:.2f}).")
            _cerramiento_conocido(rec, u1)
            hechos["cerramientos"].append({"nombre": str(rec[0]), "u_antes": u0,
                                           "u": round(u1, 4)})
            tocados += 1
        if not tocados:
            raise GeneracionError(
                "Una regla de aislamiento no toca ningun cerramiento"
                + (f" de tipo {', '.join(sorted(tipos))}" if tipos else "")
                + (" marcado «- CAMBIA»" if regla.get("que") in (None, "", "cambia") else "")
                + ". Marca en el plano lo que se aisla o di los nombres.")
    return env, avisos, hechos


def aplicar_generales(generales: Any, spec: dict) -> tuple[list, list[str]]:
    """Ventilacion y masa de las particiones (mismas casillas en 2.3 y 3.1)."""
    p2 = G._reemitible(generales)
    if not isinstance(p2, list) or len(p2) < 21:
        raise GeneracionError("los datos generales del inicial no tienen la forma conocida")
    ven = _n(spec.get("ventilacion", VENTILACION), "ventilacion (ren/h)")
    if not (0 < ven < 5):
        raise GeneracionError(f"ventilacion {ven} ren/h no es razonable")
    masa = str(spec.get("masa_particiones") or MASA_PARTICIONES)
    if masa not in MASAS:
        raise GeneracionError(f"masa de las particiones {masa!r}: CE3X usa {MASAS}")
    avisos = []
    if str(p2[16]) != G._dec(ven) or str(p2[10]) != masa:
        avisos.append(f"Ventilación {p2[16]} → {G._dec(ven)} ren/h y masa de las "
                      f"particiones {p2[10]} → {masa}, como en los previstos.")
    p2[16] = G._dec(ven)
    p2[10] = masa
    return p2, avisos


def sin_medidas(base: Any) -> dict:
    """Los pickles 5, 6 y 11 de un fichero SIN medidas de mejora: el previsto es
    la medida, no lleva otra dentro. Los precios de la energia se conservan."""
    cambios: dict[int, Any] = {G.MEDIDAS: []}
    cambios[G.RESUMEN_MEDIDAS] = G.construir_resumen_medidas(
        [], G._reemitible(L.leer(base, G.RESUMEN_MEDIDAS)))
    informe = L.leer(base, G.INFORME)
    if isinstance(informe, list) and informe:
        informe = G._reemitible(informe)
        informe[0] = ""
        cambios[G.INFORME] = informe
    return cambios
