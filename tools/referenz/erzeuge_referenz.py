#!/usr/bin/env python3
"""Erzeugt tests/referenz_regeln.json aus argus_lib.py.

Der Vergleichstest (tests/regeln.test.ts) prüft damit, dass die TypeScript-Portierung von
Geometrie und Einsatzregeln dieselben Ergebnisse liefert wie die Python-Werkzeuge aus Schritt 2.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/erzeuge_referenz.py
"""
import json
import os
import re

import argus_lib as L

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HIER, "..", "..", "tests", "referenz_regeln.json")


def regel_code(text):
    if text.startswith("außerhalb Einsatzbereich"):
        return "EB", None, None
    m = re.match(r"(\S+?)(?::| im) .*\((\d+) m\)", text)
    zone = m.group(1)
    return ("R2" if zone.startswith("NS") else "R3"), zone, int(m.group(2))


def main():
    d = L.lade_alles()
    sz, karte = d["szenario"], d["karte"]
    faelle = []
    for m in sz["meldungen"]:
        haupt = next(z for z in sz["ziele"] if z["id"] == m["ziele"][0])
        p = L.position(haupt, m["t_s"])
        for t in (m["t_s"], m["t_s"] + 60, m["t_s"] + 150):
            for wid in d["wirkmittel"]:
                ok, verst, getr = L.pruefe_wirkmittel(d, p, wid, t_s=t)
                faelle.append({
                    "meldung": m["id"], "pos": list(p), "t": t, "wm": wid, "zulaessig": ok,
                    "verstoesse": [list(regel_code(v)) for v in verst],
                    "getroffen": sorted(f"{g[0]}|{g[2]}" for g in getr),
                })
    positionen = []
    for z in sz["ziele"]:
        for t in (0, 100, 500, 800, 1000, 1200, 1300, 1450, 1500):
            positionen.append({"ziel": z["id"], "t": t, "pos": list(L.position(z, t)), "vorhanden": L.vorhanden(z, t)})
    raster = [{"p": [x, y], "pq": L.pq((x, y), karte)} for x in (0, 99.9, 100, 476, 999) for y in (0, 99, 612, 699)]
    zonen = []
    for x in range(0, 1001, 50):
        for y in range(0, 701, 50):
            for zone in sz["zonen"]:
                zonen.append({"p": [x, y], "zone": zone["id"], "abstand": L.abstand_zone((x, y), zone)})
    with open(ZIEL, "w", encoding="utf-8") as f:
        json.dump({"faelle": faelle, "positionen": positionen, "raster": raster, "zonen": zonen}, f, ensure_ascii=False)
    print(f"{len(faelle)} Regelfälle, {len(positionen)} Positionen, {len(zonen)} Zonenabstände → {os.path.normpath(ZIEL)}")


if __name__ == "__main__":
    main()
