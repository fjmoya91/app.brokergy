"""El CEE FINAL a partir de la MEDIDA DE MEJORA del CEE inicial del técnico.

Es como se hace a mano, y por eso se hace así: se abre el CEE inicial que
ENTREGÓ el certificador —con su medida de mejora ya calculada por CE3X— y el
«edificio mejorado» de esa medida pasa a ser el certificado final. La
envolvente, los datos administrativos y generales, el técnico, las imágenes y
el texto de las pruebas son los suyos, byte a byte; solo cambian:

  · pickle 4  (instalaciones) = los `sistemas*MM` de su medida, TAL CUAL
    (equipo a equipo, con sus porcentajes y superficies);
  · pickle 5  (medidas)       = la medida de mejora del FINAL;
  · pickle 6  (resumen)       = su fila del análisis económico;
  · pickle 11 (informe)       = el conjunto que se imprime y las fechas.

REGLA — la instalación del final NO se recompone desde el expediente. Sale del
fichero del técnico, que es lo que CE3X calculó y lo que se le dio por bueno al
revisar el inicial. Recomponerla (como hace `/cex/instalaciones` con la ficha)
podría dar otro C_b, otro slot para la aerotermia o otro reparto del frío, y el
final dejaría de ser «lo que aparece en la medida de mejora».

REGLA — en una HIBRIDACIÓN la medida del final es RETIRAR el generador que se
quedó en apoyo: la bomba de calor pasa a cubrir el 100 % de lo que compartían.
No se decide por la ficha sino mirando el fichero: un equipo que está en el
inicial y cuya parte de un servicio BAJA en la medida es el generador que se
quedó en apoyo; el equipo NUEVO que comparte ese servicio con él es la bomba.
En una sustitución no hay nada que retirar y esa medida no se ofrece.

REGLA — si la medida del inicial toca la ENVOLVENTE (una rehabilitación,
RES080) no se genera: el final también tendría que llevar esa obra, y eso es
otra fase.

Todo lo que CALCULA CE3X —el ahorro y la calificación de la medida nueva, y la
calificación del propio final— no está aquí: el fichero sale para abrirlo en
CE3X, pulsar Calificar y «Actualizar» la medida. Lo que SÍ se sabe es qué debe
dar el final: la foto del edificio mejorado que guardó CE3X al calcular la
medida del inicial (`datosNuevoEdificio.datosResultados`), y se devuelve para
contrastarlo.
"""
from __future__ import annotations

import copy
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import convertir_cex as CX        # noqa: E402
import editar_cex as E            # noqa: E402
import generar_cex as G           # noqa: E402
import leer_cex as L              # noqa: E402
import radiografia_cex as RX      # noqa: E402
import version_ce3x as VC         # noqa: E402

#: El orden del bloque [5] de un equipo: [acs, calefacción, refrigeración].
SERVICIOS = ("acs", "calefaccion", "refrigeracion")
NOMBRE_SERVICIO = {"acs": "ACS", "calefaccion": "calefacción", "refrigeracion": "refrigeración"}

#: Cómo se llama el combustible en el título de la medida. Las cadenas de la
#: izquierda son las del desplegable de CE3X (medidas sobre el corpus).
COMBUSTIBLE_CORTO = {
    "gasóleo-c": "GASÓLEO", "gas natural": "GAS NATURAL", "glp": "GLP",
    "carbón": "CARBÓN", "biomasadens": "BIOMASA", "biomasa/renovable": "BIOMASA",
    "biocarburante": "BIOCARBURANTE", "electricidad": "ELÉCTRICA",
}

#: Un porcentaje que baja menos que esto no es un reparto: es redondeo.
_TOL_PCT = 0.5


class FinalNoEscrito(Exception):
    """El fichero no da para montar el final: es una respuesta, no un fallo."""


# ─── Lectura ────────────────────────────────────────────────────────────────

def _f(x: Any) -> float | None:
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _reparto(rec: Any) -> list | None:
    """El bloque [5] de un equipo —[[sup, pct] × 3]— o None si no lo tiene
    (las placas solares, `renovable`, llevan otra forma)."""
    if not (isinstance(rec, list) and len(rec) > 5 and isinstance(rec[5], list)
            and len(rec[5]) == 3 and all(isinstance(p, list) and len(p) == 2 for p in rec[5])):
        return None
    return rec[5]


def _pct(rec: Any, i: int) -> float:
    rep = _reparto(rec)
    return (_f(rep[i][1]) or 0.0) if rep else 0.0


def _sup(rec: Any, i: int) -> float:
    rep = _reparto(rec)
    return (_f(rep[i][0]) or 0.0) if rep else 0.0


def elegir_medida(cex: Any) -> tuple[Any, list[str]]:
    """La medida del inicial que describe la obra.

    Con una sola, ésa. Con varias manda la que el propio certificado imprime en
    su informe (casilla 0 del pickle 11): es la que el técnico eligió como «el
    conjunto de medidas» de su CEE. Adivinar entre varias sería montar el final
    sobre una obra que quizá no es la que se hizo.
    """
    grupos = L.leer(cex, G.MEDIDAS) or []
    if not isinstance(grupos, list) or not grupos:
        raise FinalNoEscrito(
            "El CEE inicial del técnico no tiene medida de mejora: no hay «edificio "
            "mejorado» del que sacar el final.")
    if len(grupos) == 1:
        return grupos[0], []
    informe = L.leer(cex, G.INFORME) or []
    en_informe = str(informe[0]).strip() if isinstance(informe, list) and informe else ""
    for g in grupos:
        if str((getattr(g, "estado", {}) or {}).get("nombre") or "").strip() == en_informe:
            return g, [f"El CEE inicial trae {len(grupos)} medidas de mejora: se usa "
                       f"«{en_informe}», que es la que imprime su informe."]
    nombres = ", ".join(f"«{(getattr(g, 'estado', {}) or {}).get('nombre')}»" for g in grupos)
    raise FinalNoEscrito(
        f"El CEE inicial trae {len(grupos)} medidas de mejora ({nombres}) y su informe no "
        "dice cuál es la de la obra: deja solo esa en CE3X (o elígela en «Opciones del "
        "informe») y vuelve a generar.")


def instalaciones_de_medida(grupo: Any) -> list:
    """Los 12 slots del edificio mejorado de la medida, en el orden de `SLOTS`.

    Una medida «Nuevo Edificio Definido por el Usuario» (el técnico importa en
    CE3X un `.cex` entero como edificio mejorado) deja vacíos sus `sistemas*MM`:
    sus equipos viven en la foto del edificio nuevo (`datosInstalaciones`),
    igual que en una medida calculada. Mismo orden de búsqueda que
    `radiografia_cex.medida`, o el análisis vería equipos que aquí no salen.
    Medido en 26RES060_167 (medida «CEE FINAL.cex»).
    """
    return instalaciones_de_medida_con_meta(grupo)[0]


def instalaciones_de_medida_con_meta(grupo: Any) -> tuple[list, dict]:
    """Lo mismo, en la forma interna (la de la 2.3), y lo que la 3.1 añade.

    Una medida guardada por CE3X 3.1 trae sus equipos con la POTENCIA de cada
    uno y, aparte, sus generadores eléctricos y termosolares (las placas, que
    en la 3.1 se declaran como «generador eléctrico»: medido en un .cex migrado
    a mano). Se devuelven en `meta` para que el final, si sale en la 3.1, los
    lleve igual.
    """
    st = getattr(grupo, "estado", {}) or {}
    mm = [copy.deepcopy(st.get(G.SLOT_A_MM[s]) or []) for s in G.SLOTS]
    extra = VC.extra_de_grupo(st)
    if not any(mm):
        nuevo_st = getattr(st.get("datosNuevoEdificio"), "estado", {}) or {}
        for inst in (nuevo_st.get("datosInstalaciones"), st.get("datosInstalaciones")):
            if isinstance(inst, list) and len(inst) in (12, 14) and any(inst):
                mm = [copy.deepcopy(x or []) for x in inst]
                break
    slots, meta = VC.instalaciones_a_23(mm)
    if not any(meta["extra"]):
        meta["extra"] = [list(x) for x in extra]
    return slots, meta


def resultados(grupo: Any) -> dict | None:
    """Lo que CE3X calculó para el edificio original y el mejorado.

    El mejorado ES el certificado final: al calificarlo en CE3X tiene que salir
    lo mismo. Sin medida calculada, None.
    """
    st = getattr(grupo, "estado", {}) or {}

    def de(clave: str) -> dict | None:
        foto = st.get(clave)
        dr = (getattr(foto, "estado", {}) or {}).get("datosResultados")
        d = getattr(dr, "estado", None) or (dr if isinstance(dr, dict) else None)
        if not isinstance(d, dict):
            return None
        r = lambda k: round(_f(d.get(k)), 2) if _f(d.get(k)) is not None else None  # noqa: E731
        n = lambda k: str(d.get(k)) if d.get(k) not in (None, "") else None           # noqa: E731
        return {
            "emisiones": r("emisiones"), "emisiones_letra": n("emisiones_nota"),
            "epnr": r("enPrimNoRen"), "epnr_letra": n("enPrimNoRen_nota"),
            "demanda_cal": r("ddaBrutaCal"), "demanda_cal_letra": n("ddaBrutaCal_nota"),
            "demanda_ref": r("ddaBrutaRef"), "demanda_ref_letra": n("ddaBrutaRef_nota"),
        }

    final, inicial = de("datosNuevoEdificio"), de("datosEdificioOriginal")
    if not final and not inicial:
        return None
    return {"final": final, "inicial": inicial}


# ─── La retirada del generador en apoyo (hibridación) ───────────────────────

def _nombre(rec: Any) -> str:
    return str(rec[0]) if isinstance(rec, list) and rec else ""


def retirada(inst_final: list, inst_base: list) -> tuple[list | None, dict]:
    """El edificio del final SIN el generador que quedó en apoyo.

    Devuelve `(slots, info)`. `slots` es None si no hay nada que retirar (una
    sustitución) o si no se puede decidir sin adivinar — y entonces `info`
    dice por qué.
    """
    base = {}
    for i, lista in enumerate(inst_base or []):
        for rec in (lista or []):
            if _reparto(rec) is not None:
                base[(G.SLOTS[i], _nombre(rec))] = rec

    nuevos, reducidos = [], []
    for i, lista in enumerate(inst_final or []):
        for j, rec in enumerate(lista or []):
            if _reparto(rec) is None:
                continue
            previo = base.get((G.SLOTS[i], _nombre(rec)))
            if previo is None:
                nuevos.append((i, j, rec))
                continue
            bajan = [k for k in range(3)
                     if _pct(rec, k) + _TOL_PCT < _pct(previo, k)]
            if bajan:
                reducidos.append((i, j, rec, bajan))

    info: dict = {"posible": False, "motivo": None, "previos": [], "nuevo": None, "servicios": []}
    if not reducidos:
        info["motivo"] = ("La medida del inicial no deja ningún generador en apoyo (es una "
                          "sustitución): no hay nada que retirar en el final.")
        return None, info

    slots = copy.deepcopy(inst_final)
    receptor = None                      # (i, j) del equipo nuevo que lo asume
    servicios: set[str] = set()
    for (i, j, rec, bajan) in reducidos:
        for k in bajan:
            quien = [(ni, nj) for (ni, nj, n) in nuevos if _pct(n, k) > 0]
            if len(quien) != 1:
                info["motivo"] = (
                    f"«{_nombre(rec)}» comparte la {NOMBRE_SERVICIO[SERVICIOS[k]]} con "
                    f"{len(quien)} equipos nuevos: no se puede decir sin adivinar cuál "
                    "asume su parte. Móntalo en CE3X.")
                return None, info
            if receptor not in (None, quien[0]):
                info["motivo"] = ("El generador en apoyo comparte servicios con equipos nuevos "
                                  "distintos: móntalo en CE3X.")
                return None, info
            receptor = quien[0]
            servicios.add(SERVICIOS[k])
            ni, nj = receptor
            n_rep = slots[ni][nj][5]
            r_rep = slots[i][j][5]
            sup = _sup(slots[ni][nj], k) + _sup(slots[i][j], k)
            pct = _pct(slots[ni][nj], k) + _pct(slots[i][j], k)
            n_rep[k] = [str(round(sup, 2)), G._num(round(pct, 2))]
            r_rep[k] = ["0.0", "0"]

    # El receptor se coge ANTES de quitar nada: si el generador retirado va antes
    # que él en su slot (la caldera y luego la bomba, que es lo normal), borrarlo
    # corre los índices.
    ni, nj = receptor
    nuevo = slots[ni][nj]

    # Un generador que se queda sin ningún servicio SALE; uno mixto que aún da
    # otro (la caldera que sigue con el ACS) se queda con ése, como lo dejan los
    # certificadores a mano (ver `_sin_servicios`).
    quitar = []
    for (i, j, rec, _b) in reducidos:
        queda = any(_pct(slots[i][j], k) > 0 for k in range(3))
        info["previos"].append({
            "nombre": _nombre(rec), "slot": G.SLOTS[i],
            "generador": str(rec[3]) if len(rec) > 3 else None,
            "combustible": str(rec[4]) if len(rec) > 4 else None,
            "se_queda_para": [NOMBRE_SERVICIO[SERVICIOS[k]] for k in range(3)
                              if _pct(slots[i][j], k) > 0],
        })
        if not queda:
            quitar.append((i, j))
    for (i, j) in sorted(quitar, reverse=True):
        del slots[i][j]

    rend = nuevo[2] if isinstance(nuevo[2], list) else []
    info.update({
        "posible": True,
        "nuevo": {"nombre": _nombre(nuevo), "slot": G.SLOTS[ni],
                  "rendimiento": {s: _f(rend[k]) if k < len(rend) else None
                                  for k, s in enumerate(SERVICIOS)}},
        # En el orden en que se leen, no en el del bloque [5] (que empieza por ACS).
        "servicios": [NOMBRE_SERVICIO[s] for s in ("calefaccion", "acs", "refrigeracion")
                      if s in servicios],
    })
    return slots, info


def texto_retirada(info: dict) -> dict:
    """El nombre y las características de la medida del final, por defecto.

    Es un borrador: se ve antes de generar y se puede reescribir.
    """
    previos = info.get("previos") or []
    nuevo = info.get("nuevo") or {}
    p = previos[0] if previos else {}
    tipo = "CALDERA" if "caldera" in str(p.get("generador") or "").lower() else "GENERADOR"
    comb = COMBUSTIBLE_CORTO.get(str(p.get("combustible") or "").strip().lower(), "")
    corto_nuevo = re.sub(r"\s*\([^)]*\)\s*$", "", nuevo.get("nombre") or "BOMBA DE CALOR").strip()
    nombre = f"RETIRADA {tipo}{f' {comb}' if comb else ''}: {corto_nuevo} AL 100 %"

    servicios = info.get("servicios") or ["calefacción"]
    rends = []
    rend = nuevo.get("rendimiento") or {}
    if "calefacción" in servicios and rend.get("calefaccion"):
        rends.append(f"SCOP de {rend['calefaccion'] / 100:.2f}".replace(".", ","))
    if "ACS" in servicios and rend.get("acs"):
        rends.append(f"SCOPdhw de {rend['acs'] / 100:.2f}".replace(".", ","))
    if "refrigeración" in servicios and rend.get("refrigeracion"):
        rends.append(f"SEER de {rend['refrigeracion'] / 100:.2f}".replace(".", ","))

    def lista(xs: list[str]) -> str:
        return xs[0] if len(xs) == 1 else f"{', '.join(xs[:-1])} y {xs[-1]}"

    previo_txt = (f"la {tipo.lower()}{f' de {comb.lower()}' if comb else ''} existente "
                  f"({p.get('nombre')})") if p else "el generador existente"
    caracteristicas = (
        f"Retirada de {previo_txt}, que hoy trabaja en apoyo a la bomba de calor (sistema "
        f"híbrido). La {nuevo.get('nombre') or 'bomba de calor'} ya instalada pasa a cubrir el "
        f"100 % de la demanda de {lista(servicios)}"
        f"{f', con {lista(rends)}' if rends else ''}.")
    return {"nombre": nombre[:120], "caracteristicas": caracteristicas, "otros_datos": ""}


# ─── Los equipos del EXPEDIENTE mandan sobre los que tecleó el técnico ──────

#: Posición de cada servicio en los tríos [2] y [7] de un equipo «Conocido».
_IDX_SERVICIO = {"acs": 0, "calefaccion": 1, "refrigeracion": 2}
_CONOCIDO = "Conocido (Ensayado/justificado)"


def _clave_nombre(s: Any) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def corregir_equipos(inst_final: list, equipos: list | None,
                     potencias: dict | None = None) -> tuple[list[dict], list[str]]:
    """Pone en la instalación del final la máquina que declara el EXPEDIENTE.

    REGLA (decisión del usuario, 2026-09-30) — la instalación sale de la medida
    del técnico, pero si su máquina NO es la del expediente, manda el
    expediente: es lo que imprimen el CIFO y el Anexo I. Medido en
    26RES060_184/185: la medida declaraba una ACS JOHNSON MANANTIAL150RPLUSB
    (402 %) donde se instaló una MANANTIAL110RPLUSV (374 %).

    Solo se toca lo que el registro dice de ESE servicio: el nombre y el
    rendimiento (casillas [2] y [7] de un equipo con el rendimiento CONOCIDO).
    El slot, los porcentajes, las superficies y la acumulación son los del
    técnico. Un equipo cuyo nombre ya contiene la máquina y rinde lo mismo no se
    toca. Un equipo ESTIMADO (una caldera) no se corrige: no es una bomba de
    calor con un SCOP que declarar.

    `potencias` (si se pasa) se rellena con la POTENCIA que el expediente da a
    cada máquina, por el nombre con el que queda en el final: es la que la 3.1
    pide para escribir el XML del certificado.
    """
    cambios: list[dict] = []
    avisos: list[str] = []
    for eq in equipos or []:
        idx = _IDX_SERVICIO.get(str(eq.get("servicio") or ""))
        rend = _f(eq.get("rend"))
        nombre = str(eq.get("nombre") or "").strip()
        clave = _clave_nombre(eq.get("clave") or nombre)
        if idx is None or not rend or not nombre:
            continue
        hallado = False
        for lista in inst_final:
            for rec in lista or []:
                if not (isinstance(rec, list) and len(rec) >= 8 and rec[6] == _CONOCIDO):
                    continue
                if _pct(rec, idx) <= 0:
                    continue
                hallado = True
                antes_nombre = _nombre(rec)
                antes_rend = _f((rec[2] or [None] * 3)[idx]) if isinstance(rec[2], list) else None
                mismo = clave and clave in _clave_nombre(antes_nombre) \
                    and antes_rend is not None and abs(antes_rend - rend) < 1
                if mismo:
                    _anotar_potencia(potencias, antes_nombre, eq)
                    continue
                for pos in (2, 7):
                    if isinstance(rec[pos], list) and len(rec[pos]) == 3:
                        rec[pos][idx] = str(int(round(rend)))
                rec[0] = nombre[:120]
                _anotar_potencia(potencias, rec[0], eq)
                cambios.append({"servicio": eq.get("servicio"), "antes": antes_nombre,
                                "antes_rend": antes_rend, "ahora": rec[0], "ahora_rend": rend})
                avisos.append(
                    f"{_mayus(NOMBRE_SERVICIO[eq['servicio']])}: la medida del técnico "
                    f"declaraba «{antes_nombre}» ({_num(antes_rend)} %) y el expediente "
                    f"«{rec[0]}» ({_num(rend)} %). Se escribe la del EXPEDIENTE.")
        if not hallado:
            avisos.append(f"El expediente declara «{nombre}» para "
                          f"{NOMBRE_SERVICIO[eq['servicio']]} y la medida del técnico no tiene "
                          "ningún equipo con el rendimiento CONOCIDO que la cubra: no se corrige.")
    return cambios, avisos


def _anotar_potencia(potencias: dict | None, nombre: str, eq: dict) -> None:
    """La potencia (kW) y el tipo de bomba de calor que el expediente da a `eq`."""
    if potencias is None:
        return
    p = potencias.setdefault(str(nombre), {})
    kw = _f(eq.get("potencia"))
    if kw and kw > 0:
        p[str(eq.get("servicio"))] = kw
    if eq.get("tipo_bdc") not in (None, ""):
        p["tipo_bdc"] = eq.get("tipo_bdc")


def heredar_deposito(inst_final: list, inst_base: list) -> list[str]:
    """El DEPÓSITO de ACS del inicial pasa al equipo que da el ACS en el final.

    REGLA (decisión del usuario, 2026-10-01) — la demanda de ACS del final tiene
    que ser la MISMA que la del inicial (regla 12.f), y CE3X la calcula con las
    pérdidas del depósito: sin acumulación sale otra. Medido en 26RES060_185: el
    inicial declaraba la caldera mixta «Con acumulación» de 150 l (UA por
    defecto 4,7, 80/60 °C, multiplicador 1) y la medida del técnico ponía la
    bomba de calor de ACS con `[False]`; con el mismo depósito, la demanda de
    ACS del final vuelve a ser 22,04 kWh/m²·año, la del inicial.

    Se copia el bloque [8] TAL CUAL (litros, temperaturas, UA, multiplicador)
    en cada equipo del final que cubre ACS y no declara depósito. Uno que ya
    declara el suyo no se toca: ahí alguien decidió otro.
    """
    previa = None
    for lista in inst_base or []:
        for rec in lista or []:
            if (isinstance(rec, list) and len(rec) > 8 and isinstance(rec[8], list)
                    and rec[8] and rec[8][0] is True and _pct(rec, 0) > 0):
                previa = rec[8]
                break
        if previa:
            break
    if not previa:
        return []
    # Si en el final ya hay un equipo de ACS CON depósito (la caldera que sigue
    # en apoyo en una hibridación, o uno que declaró el técnico), el depósito ya
    # está: añadir otro lo contaría dos veces.
    for lista in inst_final:
        for rec in lista or []:
            if (isinstance(rec, list) and len(rec) > 8 and isinstance(rec[8], list)
                    and rec[8] and rec[8][0] is True and _pct(rec, 0) > 0):
                return []
    avisos: list[str] = []
    for lista in inst_final:
        for rec in lista or []:
            if not (isinstance(rec, list) and len(rec) > 9 and isinstance(rec[8], list)):
                continue
            if _pct(rec, 0) <= 0 or (rec[8] and rec[8][0] is True):
                continue
            rec[8] = list(previa)
            avisos.append(
                f"«{_nombre(rec)}» lleva el MISMO depósito de ACS que el inicial ({previa[1]} l, "
                f"UA {previa[4] if len(previa) > 4 else '?'} ({previa[5] if len(previa) > 5 else ''}), "
                f"{previa[2]}/{previa[3]} °C): así la demanda de ACS del final es la del inicial.")
    return avisos


def _mayus(s: str) -> str:
    return s[:1].upper() + s[1:]


def _num(x: Any) -> str:
    return "—" if x is None else (str(int(x)) if float(x).is_integer() else str(x))


# ─── Todo junto ─────────────────────────────────────────────────────────────

def _zonas(cex: Any) -> set[str]:
    zonas = {"Edificio Objeto"}
    try:
        for z in L.leer(cex, G.ENVOLVENTE)[3]:
            nombre = (getattr(z, "estado", {}) or {}).get("nombre")
            if nombre:
                zonas.add(str(nombre))
    except Exception:                              # noqa: BLE001
        pass
    return zonas


def componer(crudo: bytes, datos: dict) -> tuple[bytes | None, dict, list[str]]:
    """El `.cex` del final (o solo el análisis, con `solo_analizar`).

    `datos`:
      · `retirar_previo`: None (si se puede), True o False;
      · `retirada`: {nombre, caracteristicas, otros_datos} que manda sobre el borrador;
      · `medidas`: otras medidas del final, con la forma de la ficha de la app
        (el autoconsumo de `medidasCe3x`);
      · `informe`: {fecha_emision, fecha_visita} en 'AAAA-MM-DD';
      · `solo_analizar`: no escribe, solo dice qué haría.
    """
    base = L.trocear_bytes(crudo)
    if not base.version_conocida:
        raise FinalNoEscrito(f"versión de .cex no probada: {base.version!r}")
    avisos: list[str] = []

    grupo, av = elegir_medida(base)
    avisos += av
    st = getattr(grupo, "estado", {}) or {}
    nombre_medida = str(st.get("nombre") or "")

    # Lo que la radiografía ya sabe decir de esa medida (envolvente, desfase).
    rx = RX.radiografia_bytes(crudo)
    rx_m = next((m for m in rx.get("medidas") or [] if m.get("nombre") == nombre_medida), None) or {}
    if rx_m.get("envolvente_cambia"):
        raise FinalNoEscrito(
            f"La medida «{nombre_medida}» cambia la ENVOLVENTE ("
            + "; ".join(rx_m["envolvente_cambia"][:4])
            + "): eso es una rehabilitación (RES080) y el final no se genera solo todavía.")
    if not rx_m.get("calculada"):
        avisos.append(f"La medida «{nombre_medida}» del inicial NO está calculada: el final lleva "
                      "sus equipos, pero no hay resultados de CE3X con los que comparar.")
    if rx_m.get("desfase"):
        avisos.append(f"La medida «{nombre_medida}» se calculó sobre OTRA versión del edificio ("
                      + "; ".join(rx_m["desfase"][:3])
                      + "): los resultados esperados no valen; el final sí lleva sus equipos.")

    # Las dos instalaciones en la forma interna (la de la 2.3), venga el fichero
    # de la versión que venga; lo que la 3.1 añade queda en `meta_final`.
    inst_base, _meta_base = CX.instalaciones_internas(base)
    inst_final, meta_final = instalaciones_de_medida_con_meta(grupo)
    version = VC.version_pedida(datos)
    if not any(inst_final):
        raise FinalNoEscrito(f"La medida «{nombre_medida}» no declara ningún equipo.")

    # La máquina que se instaló la dice el EXPEDIENTE (antes de la retirada, que
    # así trabaja ya con los equipos buenos).
    potencias: dict = {}
    correcciones, av_c = corregir_equipos(inst_final, datos.get("equipos_expediente"), potencias)
    avisos += av_c
    if correcciones:
        avisos.append("Los resultados que guardó CE3X para la medida del inicial NO valen para "
                      "este final: se ha cambiado el rendimiento de algún equipo. Al calificarlo "
                      "saldrá otra cifra, y es la buena.")

    # El depósito de ACS del inicial: sin él, CE3X calcula otra demanda de ACS.
    avisos += heredar_deposito(inst_final, inst_base)

    slots_ret, info = retirada(inst_final, inst_base)
    borrador = texto_retirada(info) if info.get("posible") else None

    analisis = {
        "medida_inicial": {"nombre": nombre_medida,
                           "calculada": bool(rx_m.get("calculada")),
                           "desfase": rx_m.get("desfase") or []},
        "equipos_inicial": RX.instalaciones(inst_base),
        "equipos_final": RX.instalaciones(inst_final),
        "equipos_corregidos": correcciones,
        # En la 3.1 las placas pueden venir como «generador eléctrico».
        "tiene_renovable": bool(inst_final[G.SLOTS.index("renovable")]
                                or (meta_final.get("extra") or [[], []])[1]),
        "version_inicial": VC.version_de(base),
        "version_final": version,
        # Los cerramientos del edificio (los mismos en el final): de su U sale la
        # que quedaría con cada medida de aislamiento.
        "cerramientos": (rx.get("envolvente") or {}).get("cerramientos") or [],
        "resultados": resultados(grupo),
        "retirada": {**info, "borrador": borrador,
                     "equipos": RX.instalaciones(slots_ret) if slots_ret else None},
        "informe_inicial": rx.get("informe"),
    }
    if datos.get("solo_analizar"):
        return None, analisis, avisos

    # ── Las medidas del final ────────────────────────────────────────────────
    quiere = datos.get("retirar_previo")
    grupos_mm, filas, nombres = [], [], []
    envolvente = L.leer(base, G.ENVOLVENTE)
    if quiere is True and not info.get("posible"):
        raise FinalNoEscrito(info.get("motivo") or "No hay generador en apoyo que retirar.")
    if (quiere is None and info.get("posible")) or (quiere is True):
        texto = dict(borrador)
        for k, v in (datos.get("retirada") or {}).items():
            if isinstance(v, str) and (v.strip() or k == "otros_datos"):
                texto[k] = v.strip()
        g, fila, av_g = G.construir_medida(texto, envolvente, slots_ret)
        avisos += av_g
        grupos_mm += g
        filas += [fila] if fila else []
        nombres.append(texto["nombre"])

    zonas = _zonas(base)
    for m in datos.get("medidas") or []:
        # Una medida de ENVOLVENTE (aislamiento de cubierta, fachada…): el mismo
        # edificio con la U nueva en sus cerramientos y la instalación del final.
        if m.get("aislamiento"):
            g, fs, av_g = G.construir_medida_aislamiento(m, envolvente, inst_final)
            avisos += av_g
            grupos_mm += g
            filas += fs
            nombres.append(str(m.get("nombre") or ""))
            continue
        equipos_m = m.get("instalaciones") or []
        if not equipos_m:
            avisos.append(f"La medida «{m.get('nombre')}» no declara ningún equipo: no se escribe.")
            continue
        avisos += G.heredar_del_base(equipos_m, inst_final)
        inst_m, av_i = G.construir_instalaciones(
            {"instalaciones": equipos_m, "envolvente": {"espacio": "auto"}},
            inst_final, zonas, retirar=G.slots_a_retirar(equipos_m))
        g, fila, av_g = G.construir_medida(m, envolvente, inst_m)
        avisos += av_i + av_g
        grupos_mm += g
        filas += [fila] if fila else []
        nombres.append(str(m.get("nombre") or ""))
    if not grupos_mm:
        avisos.append("El CEE final sale SIN medida de mejora: defínela en CE3X antes de emitirlo.")

    # ── El informe: el conjunto que se imprime y las fechas DEL FINAL ────────
    informe = L.leer(base, G.INFORME)
    informe = (G._reemitible(informe) if VC.informe_valido(informe)
               else list(G._INFORME_VACIO))
    informe[0] = nombres[0] if nombres else ""
    fechas = datos.get("informe") or {}
    for clave, i, que in (("fecha_emision", 5, "emisión"), ("fecha_visita", 6, "visita")):
        f = G._fecha_cex(fechas.get(clave))
        # Las del inicial NO valen para el final: sin fecha, en blanco y dicho.
        informe[i] = f if f else ["", "", ""]
        if not f:
            avisos.append(f"Sin fecha de {que} del CEE final: queda en blanco y hay que ponerla "
                          "en CE3X («Opciones del informe») antes de emitirlo.")

    cambios = {
        G.INSTALACIONES: G._reemitible(inst_final),
        G.MEDIDAS: grupos_mm,
        G.RESUMEN_MEDIDAS: G.construir_resumen_medidas(filas, L.leer(base, G.RESUMEN_MEDIDAS)),
        G.INFORME: informe,
    }
    # La versión del final (por defecto la 3.1, aunque el inicial sea de la
    # 2.3): se le añade lo que esa versión pide, con la potencia que el
    # expediente da a cada máquina.
    avisos += CX.a_version(base, cambios, version, datos, meta_final, potencias)
    salida = E.sustituir_pickles(crudo, cambios)
    analisis["medidas_final"] = nombres
    return salida, analisis, avisos
