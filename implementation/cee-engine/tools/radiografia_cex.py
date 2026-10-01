# ============================================================================
# radiografia_cex.py — LOS HECHOS de un .cex, como JSON. No juzga nada.
#
#   python tools/radiografia_cex.py FICHERO.cex [--json]
#
# Es la otra mitad del lector del .xml (`backend/services/cee/radiografiaCee.js`)
# y existe porque hay cosas que SOLO están en el .cex:
#
#   · el DEPÓSITO de ACS (medido: el .xml no lo declara en ninguno de 462);
#   · la COLA con la que CE3X estima una caldera —aislamiento, rendimiento de
#     COMBUSTIÓN, carga media y potencia—, que es lo que explica el estacional
#     que sale en el .xml (una caldera con 85 % de combustión y «antigua con mal
#     aislamiento» da 56,8 % estacional);
#   · la MEDIDA DE MEJORA entera: qué equipos propone, si está CALCULADA y, lo
#     que más vale, si se calculó sobre ESTE edificio o sobre una versión
#     anterior del fichero (ver `desfase`).
#
# El juicio —si esto está bien para ESTE expediente— es del backend
# (`revisionCee.js`). Aquí solo se lee: el mismo reparto que el .xml.
#
# Solo LEE, y nunca deserializa: `leer_cex` recorre los opcodes con
# pickletools y no importa ni construye nada. Estos ficheros vienen de fuera.
# ============================================================================
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import leer_cex as L          # noqa: E402
import generar_cex as G       # noqa: E402

#: Los tres modos de transmitancia de un cerramiento opaco, tal y como los
#: escribe CE3X en la casilla [8]. `Conocidas` es «justificada».
MODOS_CERRAMIENTO = ("Conocidas", "Estimadas", "Por defecto")

#: Qué servicios da cada slot del pickle 4 (el orden de los tres bloques de
#: superficie/porcentaje es SIEMPRE ACS · calefacción · refrigeración).
SERVICIOS = ("acs", "calefaccion", "refrigeracion")


def _f(x: Any) -> float | None:
    """Un número del fichero, venga como texto o como número. '' = no consta."""
    if x is None or x == "" or isinstance(x, bool):
        return None
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _s(x: Any) -> str | None:
    s = str(x).strip() if x is not None else ""
    return s or None


# ─── Envolvente ─────────────────────────────────────────────────────────────

def cerramiento(rec: list) -> dict:
    """Un cerramiento opaco. Medianera 13 campos; fachada, cubierta, partición
    15; suelo contra terreno 17. El modo va en [8] salvo en la medianera, que no
    tiene (su U no describe nada: es adiabática)."""
    modo = rec[8] if len(rec) > 8 and rec[8] in MODOS_CERRAMIENTO else None
    frontera = _s(rec[-1])
    tipo = _s(rec[1])
    medianera = tipo == "Fachada" and frontera == "edificio"
    return {
        "nombre": _s(rec[0]),
        "tipo": "Medianera" if medianera else tipo,
        "superficie": _f(rec[2]),
        "u": _f(rec[3]),
        "masa": _f(rec[4]),
        #: En una fachada es el rumbo; en una partición, el tipo de espacio.
        "orientacion": _s(rec[5]),
        "modo": modo,
        "frontera": frontera,
        "zona": _s(rec[-2]),
    }


def hueco(h: Any) -> dict:
    st = getattr(h, "estado", {}) or {}
    g = lambda k: st.get(k)                                  # noqa: E731
    return {
        "nombre": _s(g("descripcion")),
        "tipo": _s(g("tipo")),
        "clase": getattr(h, "clase", None),
        "cerramiento": _s(g("cerramientoAsociado")),
        "orientacion": _s(g("orientacion")),
        "ancho": _f(g("longitud")),
        "alto": _f(g("altura")),
        "superficie": _f(g("superficie")),
        "multiplicador": _f(g("multiplicador")) or 1.0,
        "vidrio": _s(g("tipoVidrio")),
        "marco": _s(g("tipoMarco")),
        "porc_marco": _f(g("porcMarco")),
        "u_vidrio": _f(g("Uvidrio")),
        "g_vidrio": _f(g("Gvidrio")),
        "u_marco": _f(g("Umarco")),
        "permeabilidad": _s(g("permeabilidadChoice")),
        "proteccion_solar": bool(g("tieneProteccionSolar")),
        "doble_ventana": bool(g("dobleVentana")),
    }


def puente(p: list) -> dict:
    return {
        "nombre": _s(p[0]),
        "tipo": _s(p[2]) if len(p) > 2 else None,
        "psi": _f(p[3]) if len(p) > 3 else None,
        "longitud": _f(p[4]) if len(p) > 4 else None,
        "modo": _s(p[6]) if len(p) > 6 else None,
        "cerramiento": _s(p[7]) if len(p) > 7 else None,
    }


def envolvente(env: Any) -> dict:
    env = env if isinstance(env, list) else []
    cer = env[0] if len(env) > 0 and isinstance(env[0], list) else []
    hue = env[1] if len(env) > 1 and isinstance(env[1], list) else []
    pts = env[2] if len(env) > 2 and isinstance(env[2], list) else []
    zon = env[3] if len(env) > 3 and isinstance(env[3], list) else []
    return {
        "cerramientos": [cerramiento(c) for c in cer if isinstance(c, list) and len(c) > 5],
        "huecos": [hueco(h) for h in hue],
        "puentes": [puente(p) for p in pts if isinstance(p, list)],
        "zonas": [{"nombre": _s((getattr(z, "estado", {}) or {}).get("nombre")),
                   "superficie": _f((getattr(z, "estado", {}) or {}).get("superficie"))}
                  for z in zon],
    }


# ─── Instalaciones ──────────────────────────────────────────────────────────

def _cola_caldera(cola: Any) -> dict | None:
    """La cola con la que CE3X ESTIMA una caldera de combustión:
    [aislamiento, rendimiento de combustión, carga media, potencia, …]."""
    if (isinstance(cola, list) and len(cola) >= 4 and isinstance(cola[0], str)
            and _f(cola[0]) is None and cola[0].strip()):
        return {
            "aislamiento": cola[0],
            "rend_combustion": _f(cola[1]),
            "carga_media": _f(cola[2]),
            "potencia_kw": _f(cola[3]),
        }
    return None


def _nominal(cola: Any) -> dict | None:
    """El rendimiento NOMINAL de un equipo estimado sin combustión (efecto
    Joule, máquina frigorífica): la cola simple lleva primero [acs, cal, ref]."""
    if isinstance(cola, list) and cola and isinstance(cola[0], list) and len(cola[0]) == 3:
        return dict(zip(SERVICIOS, (_f(x) for x in cola[0])))
    return None


def _acumulacion(bloque: Any) -> dict | None:
    if isinstance(bloque, list) and bloque and bloque[0] is True:
        return {
            "volumen_l": _f(bloque[1]) if len(bloque) > 1 else None,
            "t_alta": _f(bloque[2]) if len(bloque) > 2 else None,
            "t_baja": _f(bloque[3]) if len(bloque) > 3 else None,
            "ua": _f(bloque[4]) if len(bloque) > 4 else None,
        }
    return None


def equipo(rec: list) -> dict:
    rend = rec[2] if len(rec) > 2 and isinstance(rec[2], list) else []
    serv = rec[5] if len(rec) > 5 and isinstance(rec[5], list) else []
    modo = _s(rec[6]) if len(rec) > 6 else None
    cola = rec[7] if len(rec) > 7 else None
    servicios = {}
    for i, k in enumerate(SERVICIOS):
        par = serv[i] if i < len(serv) and isinstance(serv[i], list) else []
        sup = _f(par[0]) if len(par) > 0 else None
        pct = _f(par[1]) if len(par) > 1 else None
        if sup is not None or pct:
            servicios[k] = {"superficie": sup, "pct": pct}
    #: El bloque del depósito solo existe en los equipos que dan ACS y va en
    #: [8]; los de 9 campos (calefacción, refrigeración) no lo llevan.
    acum = _acumulacion(rec[8]) if len(rec) >= 10 else None
    return {
        "nombre": _s(rec[0]),
        "slot": _s(rec[1]),
        "generador": _s(rec[3]) if len(rec) > 3 else None,
        "combustible": _s(rec[4]) if len(rec) > 4 else None,
        "modo_rendimiento": modo,
        "rend_estacional": dict(zip(SERVICIOS, (_f(x) for x in (rend + [None] * 3)[:3]))),
        "servicios": servicios,
        "caldera": _cola_caldera(cola),
        "nominal": _nominal(cola),
        "acumulacion": acum,
        "zona": _s(rec[-1]),
    }


def instalaciones(slots: Any) -> list[dict]:
    out = []
    if not isinstance(slots, list):
        return out
    for lista in slots:
        for rec in (lista or []):
            if isinstance(rec, list) and len(rec) >= 7:
                out.append(equipo(rec))
    return out


# ─── Datos generales ────────────────────────────────────────────────────────

def generales(g: Any) -> dict:
    g = g if isinstance(g, list) else []
    at = lambda i: g[i] if len(g) > i else None           # noqa: E731
    return {
        "normativa": _s(at(0)),
        "tipo_edificio": _s(at(1)),
        "provincia": _s(at(2)),
        "localidad": _s(at(12)) if _s(at(3)) == "Otro" else _s(at(3)),
        "zona_he1": _s(at(4)),
        "zona_he4": _s(at(5)),
        "superficie": _f(at(6)),
        "altura_planta": _f(at(7)),
        "plantas": _f(at(8)),
        "demanda_acs_l_dia": _f(at(9)),
        "masa_particiones": _s(at(10)),
        "ventilacion": _f(at(16)),
        "tiene_foto": bool(_s(at(17))),
        "tiene_plano": bool(_s(at(18))),
        "anio": _f(at(19)),
    }


# ─── Comparar dos fotos del mismo edificio ──────────────────────────────────

def _norm(x: Any) -> Any:
    """Un dato en forma comparable: los números como número redondeado (el
    mismo 148 llega unas veces como '148' y otras como 148.0), sin imágenes."""
    if isinstance(x, L.Opaco):
        return (x.clase, _norm(x.estado))
    if isinstance(x, dict):
        return {str(k): _norm(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_norm(v) for v in x]
    if isinstance(x, bool) or x is None:
        return x
    n = _f(x)
    if n is not None:
        return round(n, 2)
    return str(x).strip()


def _diferencias_generales(a: Any, b: Any) -> list[str]:
    """Qué campos de datos generales difieren. Las dos imágenes (17, 18) no
    cuentan: son PNG y se reescalan cada vez que CE3X guarda."""
    etiquetas = {0: "normativa", 1: "tipo de edificio", 2: "provincia",
                 3: "localidad", 4: "zona climática", 5: "zona HE4",
                 6: "superficie", 7: "altura de planta", 8: "nº de plantas",
                 9: "demanda de ACS", 10: "masa de particiones",
                 16: "ventilación", 19: "año de construcción"}
    out = []
    if not isinstance(a, list) or not isinstance(b, list):
        return out
    for i, et in etiquetas.items():
        va = _norm(a[i]) if len(a) > i else None
        vb = _norm(b[i]) if len(b) > i else None
        if va != vb:
            out.append(f"{et}: {va} → {vb}")
    return out


def _diferencias_envolvente(a: Any, b: Any) -> list[str]:
    """Qué cerramientos y huecos difieren entre dos envolventes, por nombre."""
    ea, eb = envolvente(a), envolvente(b)
    out = []
    for clase, clave in (("cerramiento", "cerramientos"), ("hueco", "huecos")):
        pa = {x["nombre"]: x for x in ea[clave]}
        pb = {x["nombre"]: x for x in eb[clave]}
        for n in sorted(set(pa) - set(pb), key=str):
            out.append(f"{clase} {n}: ya no existe")
        for n in sorted(set(pb) - set(pa), key=str):
            out.append(f"{clase} {n}: nuevo")
        for n in sorted(set(pa) & set(pb), key=str):
            x, y = pa[n], pb[n]
            for k in ("superficie", "u", "u_vidrio", "u_marco", "tipo"):
                if k in x and x[k] != y.get(k):
                    out.append(f"{clase} {n}: {k} {x[k]} → {y.get(k)}")
    return out


def _diferencias_instalaciones(a: Any, b: Any) -> list[str]:
    ia = {e["nombre"]: e for e in instalaciones(a)}
    ib = {e["nombre"]: e for e in instalaciones(b)}
    out = []
    for n in sorted(set(ia) - set(ib), key=str):
        out.append(f"equipo {n}: ya no existe")
    for n in sorted(set(ib) - set(ia), key=str):
        out.append(f"equipo {n}: nuevo")
    for n in sorted(set(ia) & set(ib), key=str):
        if _norm(ia[n]) != _norm(ib[n]):
            out.append(f"equipo {n}: cambiado")
    return out


# ─── Medidas de mejora ──────────────────────────────────────────────────────

def medida(g: Any, fila: list | None, actual: dict) -> dict:
    st = getattr(g, "estado", {}) or {}
    orig = st.get("datosEdificioOriginal")
    nuevo = st.get("datosNuevoEdificio")
    orig_st = getattr(orig, "estado", {}) or {}
    nuevo_st = getattr(nuevo, "estado", {}) or {}
    ahorro = st.get("ahorro") or []
    calculada = bool(any(_f(x) for x in ahorro) and orig is not None)

    #: Qué propone la medida. Calculada, lo dice la foto del edificio nuevo;
    #: sin calcular (la que escribe la app), sus `sistemas*MM`.
    if nuevo_st.get("datosInstalaciones") is not None:
        inst_mm = nuevo_st["datosInstalaciones"]
    elif st.get("datosInstalaciones") is not None:
        inst_mm = st["datosInstalaciones"]
    else:
        inst_mm = [st.get(G.SLOT_A_MM[s]) or [] for s in G.SLOTS]

    if nuevo_st.get("datosEnvolvente") is not None:
        env_mm = nuevo_st["datosEnvolvente"]
    else:
        env_mm = [st.get("cerramientosMejorados") or [], st.get("huecosMejorados") or [],
                  st.get("puentesTermicosMejorados") or [], []]

    #: REGLA — el DESFASE: una medida calculada guarda la foto del edificio
    #: ORIGINAL con la que se calculó. Si no coincide con el fichero de hoy, el
    #: certificador tocó el edificio DESPUÉS de calcularla y el ahorro que
    #: declara la medida es el de otra versión: hay que pulsar Actualizar.
    desfase = None
    if calculada:
        desfase = (
            _diferencias_generales(orig_st.get("datosGenerales"), actual["_generales"])
            + _diferencias_envolvente(orig_st.get("datosEnvolvente"), actual["_envolvente"])
            + _diferencias_instalaciones(orig_st.get("datosInstalaciones"), actual["_instalaciones"])
        )

    return {
        "nombre": _s(st.get("nombre")),
        "tipo": _s(fila[0]) if fila else None,
        "caracteristicas": _s(st.get("caracteristicas")),
        "otros_datos": _s(st.get("otrosDatos")),
        "calculada": calculada,
        "ahorro": [_f(x) for x in ahorro],
        "equipos": instalaciones(inst_mm),
        "envolvente_cambia": _diferencias_envolvente(actual["_envolvente"], env_mm),
        "desfase": desfase,
        "inversion": _f((fila or [None] * 5)[4]) if fila and len(fila) > 4 else None,
        "vida_util": _f(fila[3]) if fila and len(fila) > 3 else None,
    }


# ─── Todo junto ─────────────────────────────────────────────────────────────

def radiografia_bytes(crudo: bytes) -> dict:
    cex = L.trocear_bytes(crudo)
    leer = lambda i: _seguro(lambda: L.leer(cex, i))       # noqa: E731
    gen, env, inst = leer(G.GENERALES), leer(G.ENVOLVENTE), leer(G.INSTALACIONES)
    actual = {"_generales": gen, "_envolvente": env, "_instalaciones": inst}

    grupos = leer(G.MEDIDAS) or []
    resumen = leer(G.RESUMEN_MEDIDAS) or []
    filas = resumen[2] if isinstance(resumen, list) and len(resumen) > 2 and isinstance(resumen[2], list) else []

    inf = leer(G.INFORME) or []
    fecha = lambda v: "/".join(v) if isinstance(v, list) and any(v) else None   # noqa: E731

    adm = leer(G.ADMINISTRATIVOS) or []
    tec = lambda k: _s(adm[G.CAMPOS_TECNICO[k]]) if isinstance(adm, list) and len(adm) > G.CAMPOS_TECNICO[k] else None   # noqa: E731

    return {
        "version": cex.version,
        "version_conocida": cex.version_conocida,
        "tecnico": {"nombre": tec("nombre"), "empresa": tec("empresa")},
        "generales": generales(gen),
        "envolvente": envolvente(env),
        "equipos": instalaciones(inst),
        "medidas": [medida(g, filas[i] if i < len(filas) else None, actual)
                    for i, g in enumerate(grupos if isinstance(grupos, list) else [])],
        "informe": {
            "emision": fecha(inf[5]) if len(inf) > 5 else None,
            "visita": fecha(inf[6]) if len(inf) > 6 else None,
        },
        "errores": [f"pickle {p.indice}: {p.error}" for p in cex.pickles if p.error],
    }


def _seguro(f):
    try:
        return f()
    except Exception:                              # noqa: BLE001
        return None


def main(argv: list[str]) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass
    if not argv:
        print("uso: python tools/radiografia_cex.py FICHERO.cex")
        return 2
    print(json.dumps(radiografia_bytes(Path(argv[0]).read_bytes()), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
