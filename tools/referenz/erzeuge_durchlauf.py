#!/usr/bin/env python3
"""Erzeugt tests/referenz_durchlauf.json aus simuliere_durchlauf.py (Modellteams naiv und ideal).

tests/durchlauf.test.ts spielt dieselben fünf Läufe (= fünf Teams einer Sitzung) mit der echten Engine
(Host, Zeitplan, Trefferregel beim Einschlag, Hintergrundgefecht, E-01, Verstärkungen) und vergleicht
je Meldung Ausgang und Zeitpunkte, Wirkmittel, Einschlag und Treffer, dazu bedingte Injects, Restbestand,
Hintergrundgefecht, E-01 und die erreichten Schlüssel- und Nebenfälle.

Aufruf (im Repo-Wurzelordner): python3 tools/referenz/erzeuge_durchlauf.py
"""
import json
import os

import argus_lib as L
import simuliere_durchlauf as S

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HIER, "..", "..", "tests", "referenz_durchlauf.json")

# Verstärkungen wie in simuliere_durchlauf.py (alle vier Minuten bis 10:16, zusätzlich V-5 um 10:20), aber V-2 um 10:09:00
# statt 10:08:00: 10:08:00 liegt in seinem Fenster `nicht_einspielen` (10:07:45–10:08:45), das die Engine sperrt.
VERSTAERKUNG_STANDARD = {"V-1": 240, "V-2": 540, "V-3": 720, "V-4": 960}
VERSTAERKUNG_ZU_SPAET = {"V-1": 240, "V-2": 540, "V-3": 720, "V-4": 960, "V-5": 1200}

LAEUFE = [
    ("naiv", None),
    ("ideal", None),
    ("naiv", VERSTAERKUNG_STANDARD),
    ("ideal", VERSTAERKUNG_STANDARD),
    ("naiv", VERSTAERKUNG_ZU_SPAET),
]


def zahl(x):
    return None if x is None else round(float(x), 3)


def lauf_export(d, team, ein):
    det = []
    log, schutz, injects, rest, letzte = S.lauf(d, team, det, ein)
    meldungen = []
    for e in det:
        if "m" not in e:
            continue
        meldungen.append({
            "meldung": e["m"], "t_meld": e["t_meld"], "ft": bool(e.get("ft")), "ende": e.get("ende", "?"),
            "t_g1": zahl(e.get("t_g1")), "g1": e.get("g1"), "t_g2": zahl(e.get("t_g2")), "g2": e.get("g2"),
            "t_g3": zahl(e.get("t_g3")), "g3": e.get("g3"), "wm": e.get("wm"),
            "t_wirkung": zahl(e.get("t_wirkung")), "ziel": e.get("ziel"),
            "pos": [zahl(v) for v in e["pos"]] if e.get("pos") else None,
            "getroffen": sorted(f"{g[0]}|{g[2]}" for g in e.get("getroffen", [])),
            "verstoesse": [v.split(" ")[0].rstrip(":") for v in e.get("verstoesse", [])],
        })
    inj = sorted(({"inject": e["inject"], "t": zahl(e["t"])} for e in det if "inject" in e), key=lambda x: (x["t"], x["inject"]))
    hg = [{"id": e["hintergrund"], "t": e["t"], "wirkt": e.get("wirkt")} for e in det if "hintergrund" in e]
    e01 = [{"entfaellt": True} if e.get("entfaellt") else {"t": e["t"], "von": e["von"], "ziel": e["ziel"]}
           for e in det if "ereignis" in e]
    ft = next((e["fast_track"] for e in det if "fast_track" in e), None)
    faelle = {k: ok for k, (ok, _) in S.faelle_erreicht(d, team, ein).items()}
    return {
        "team": team, "einspielen": ein or {}, "fast_track_ab": ft, "meldungen": meldungen, "injects": inj,
        "hintergrund": hg, "e01": e01, "rest": rest, "treffer_schutz": schutz, "faelle": faelle,
        "letzte_freigabe": letzte, "log": [f"{a}: {b}" for a, b in log],
    }


def gesperrt(d, ein):
    gruppen = {g["id"]: g for g in d["szenario"]["verstaerkungen"]["gruppen"]}
    return [f"{g} {t0}" for g, t0 in (ein or {}).items() if any(a <= t0 <= b for a, b in gruppen[g].get("nicht_einspielen", []))]


def main():
    d = L.lade_alles()
    for _, ein in LAEUFE:
        assert not gesperrt(d, ein), f"Verstärkung im gesperrten Fenster: {gesperrt(d, ein)}"
    print("simuliere_durchlauf.VERSTAERKUNG_STANDARD gesperrt:", gesperrt(d, S.VERSTAERKUNG_STANDARD) or "nein")
    out = {
        "hinweis": "Erzeugt mit tools/referenz/erzeuge_durchlauf.py aus simuliere_durchlauf.py (Szenario "
                   f"{d['szenario']['id']} v{d['szenario']['version']}). Nicht von Hand ändern.",
        "szenario": d["szenario"]["version"],
        "zeiten": {"G1": S.T_G1, "G2": S.T_G2, "G3": S.T_G3, "ft_nach_angebot": S.FT_NACH_ANGEBOT_S},
        "reihenfolge_wirkmittel": S.REIHENFOLGE,
        "laeufe": [lauf_export(d, team, ein) for team, ein in LAEUFE],
    }
    with open(ZIEL, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"{len(out['laeufe'])} Läufe → {os.path.normpath(ZIEL)}")


if __name__ == "__main__":
    main()
