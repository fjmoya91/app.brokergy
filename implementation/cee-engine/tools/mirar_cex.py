# ============================================================================
# mirar_cex.py — QUE LLEVA DENTRO un .cex, sin abrir CE3X.
#
#   python tools/mirar_cex.py "ruta/al/fichero.cex" [otro.cex ...]
#
# Responde a las tres preguntas que se hacen delante de un .cex y que no se
# pueden contestar mirando el fichero: que generador declara, si lleva medida
# de mejora (y si esta CALCULADA o solo definida) y si el cuadro de texto del
# informe esta relleno. Con varios ficheros los pone en columnas para poder
# comparar el que genera la app con el que guardo el certificador.
#
# Solo LEE: `leer_cex` recorre los opcodes con pickletools y no construye ni
# importa nada (ver la cabecera de tools/leer_cex.py).
# ============================================================================
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import leer_cex as L          # noqa: E402
import generar_cex as G       # noqa: E402


def _txt(v, n=64):
    s = str(v or "").replace("\n", " ").strip()
    return (s[:n] + "…") if len(s) > n else (s or "—")


def radiografia(ruta: Path) -> dict:
    cex = L.trocear(ruta)
    d: dict = {"fichero": ruta.name, "bytes": ruta.stat().st_size,
               "version": cex.version, "pickles": len(cex.pickles)}

    # -- el generador que declara --------------------------------------------
    try:
        slots = L.leer(cex, G.INSTALACIONES)
        equipos = [(G.SLOTS[i], e[0]) for i, lista in enumerate(slots)
                   for e in (lista or [])]
        d["equipos"] = equipos
    except Exception as exc:                       # noqa: BLE001
        d["equipos"] = [("?", f"no se ha podido leer: {exc}")]

    # -- la medida de mejora --------------------------------------------------
    try:
        grupos = L.leer(cex, G.MEDIDAS) or []
    except Exception:                              # noqa: BLE001
        grupos = []
    d["medidas"] = []
    for g in grupos:
        st = getattr(g, "estado", {}) or {}
        equipos_mm = [e[0] for clave in G.SLOT_A_MM.values()
                      for e in (st.get(clave) or [])]
        ahorro = st.get("ahorro") or []
        d["medidas"].append({
            "nombre": st.get("nombre"),
            "caracteristicas": st.get("caracteristicas"),
            "equipos": equipos_mm,
            # Lo que separa "definida" de "CALCULADA por CE3X": el ahorro y los
            # dos snapshots del edificio. La app escribe lo primero y deja lo
            # segundo vacio a proposito.
            "calculada": any(float(x or 0) for x in ahorro)
                         and st.get("datosEdificioOriginal") is not None,
            "ahorro": ahorro,
        })

    # -- los precios de la energia del analisis economico ---------------------
    try:
        p6 = L.leer(cex, G.RESUMEN_MEDIDAS) or []
        d["precios"] = p6[1] if len(p6) > 1 and isinstance(p6[1], list) else None
    except Exception:                              # noqa: BLE001
        d["precios"] = None

    # -- el cuadro de texto del informe --------------------------------------
    try:
        inf = L.leer(cex, G.INFORME) or []
    except Exception:                              # noqa: BLE001
        inf = []
    d["informe"] = {
        "conjunto": inf[0] if len(inf) > 0 else None,
        "pruebas": len(str(inf[3] or "")) if len(inf) > 3 else 0,
        "emision": "/".join(inf[5]) if len(inf) > 5 and isinstance(inf[5], list) and any(inf[5]) else None,
        "visita": "/".join(inf[6]) if len(inf) > 6 and isinstance(inf[6], list) and any(inf[6]) else None,
    } if inf else None
    return d


def imprimir(d: dict) -> None:
    print(f"\n=== {d['fichero']}")
    print(f"    {d['bytes']:,} bytes · {d['version']} · {d['pickles']} pickles"
          .replace(",", "."))
    print("    INSTALACIÓN:")
    for slot, nombre in d["equipos"] or [("—", "ninguna")]:
        print(f"       [{slot}] {nombre}")
    print("    MEDIDAS DE MEJORA:", "ninguna" if not d["medidas"] else "")
    for m in d["medidas"]:
        estado = "CALCULADA por CE3X" if m["calculada"] else "definida, SIN calcular"
        print(f"       «{_txt(m['nombre'])}» — {estado}")
        print(f"          equipo: {', '.join(_txt(e, 50) for e in m['equipos']) or '— ninguno'}")
        print(f"          caract.: {_txt(m['caracteristicas'], 70)}")
        if m["calculada"]:
            print(f"          ahorro: {m['ahorro']}")
    pr = d.get("precios")
    print(f"    PRECIOS DE LA ENERGÍA: {'—  (las 10 casillas, en blanco)' if not (pr and any(pr)) else ' '.join(str(x) for x in pr)}")
    i = d["informe"]
    if i is None:
        print("    INFORME: el pickle está vacío (una plantilla virgen)")
    else:
        print(f"    INFORME: pruebas {i['pruebas']} caracteres · emisión {i['emision'] or '—'}"
              f" · visita {i['visita'] or '—'}")
        print(f"       conjunto en el informe: {_txt(i['conjunto'])}")


def main(argv: list[str]) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass
    if not argv:
        print(__doc__ or "Dime qué .cex quieres mirar.")
        return 2
    for a in argv:
        p = Path(a)
        if not p.exists():
            print(f"\n=== {a}\n    NO EXISTE")
            continue
        try:
            imprimir(radiografia(p))
        except Exception as exc:                   # noqa: BLE001
            print(f"\n=== {p.name}\n    no se ha podido leer: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
