#!/usr/bin/env python3
"""Erzeugt tests/referenz_durchlauf.json aus simuliere_durchlauf.py (Modellteams naiv und ideal).

tests/durchlauf.test.ts spielt dieselben fünf Läufe (= fünf Teams, seit 2.6 je Team eine lokale Engine) mit der echten Engine
(Host, Zeitplan, Trefferregel beim Einschlag, Hintergrundgefecht, E-01, Verstärkungen, seit 2.1 Durchbruch) und vergleicht
je Meldung Ausgang, Entscheidung und Zeitpunkte (seit 2.6 eine Entscheidung je Meldung mit Sekunden ab Eingang und ab Öffnen),
Wirkmittel, Einschlag und Treffer, dazu bedingte Injects, Restbestand,
Hintergrundgefecht, E-01 und die erreichten Schlüssel- und Nebenfälle; seit 2.3 auch die Verluste der eigenen Truppe (seit 2.5 je
Panzer: jeder Schuss mit Einschießen und Zustand, Stand je Panzer und der Kp, Druckmeldungen K-… mit Text, I-07/I-06/I-13 mit dem
Stand des Teams).

Aufruf (im Repo-Wurzelordner): python3 tools/referenz/erzeuge_durchlauf.py
"""
import json
import os

import argus_lib as L
import simuliere_durchlauf as S
import bilanz as B

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HIER, "..", "..", "tests", "referenz_durchlauf.json")

# Verstärkungen wie in simuliere_durchlauf.py (alle vier Minuten bis 10:16, zusätzlich V-5 um 10:20). Seit Szenario 2.1
# liegt V-2 um 10:08:00 nicht mehr in einem Fenster `nicht_einspielen` (bis 2.0 deshalb 10:09:00); main() prüft das.
VERSTAERKUNG_STANDARD = dict(S.VERSTAERKUNG_STANDARD)
VERSTAERKUNG_ZU_SPAET = dict(S.VERSTAERKUNG_ZU_SPAET)

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
            "meldung": e["m"], "t_meld": e["t_meld"], "ende": e.get("ende", "?"),
            "t_offen": zahl(e.get("t_offen")), "t_entscheid": zahl(e.get("t_entscheid")), "entscheid": e.get("entscheid"),
            "sek_eingang": zahl(e.get("sek_eingang")), "sek_offen": zahl(e.get("sek_offen")), "wm": e.get("wm"),
            "t_wirkung": zahl(e.get("t_wirkung")), "ziel": e.get("ziel"),
            "pos": [zahl(v) for v in e["pos"]] if e.get("pos") else None,
            "getroffen": sorted(f"{g[0]}|{g[2]}" for g in e.get("getroffen", [])),
            "verstoesse": [v.split(" ")[0].rstrip(":") for v in e.get("verstoesse", [])],
        })
    inj = sorted(({"inject": e["inject"], "t": zahl(e["t"])} for e in det if "inject" in e), key=lambda x: (x["t"], x["inject"]))
    hg = [{"id": e["hintergrund"], "t": e["t"], "wirkt": e.get("wirkt")} for e in det if "hintergrund" in e]
    e01 = [{"entfaellt": True} if e.get("entfaellt") else {"t": e["t"], "von": e["von"], "ziel": e["ziel"], "nr": e.get("nr")}
           for e in det if "ereignis" in e]
    durchbruch = [{"gruppe": e["durchbruch"], "t": e["t"], "durch": e["durch"]} for e in det if "durchbruch" in e]
    durchgebrochen = next((e["durchgebrochen"] for e in det if "durchgebrochen" in e), [])
    faelle = {k: ok for k, (ok, _) in S.faelle_erreicht(d, team, ein).items()}
    v = next((e for e in det if "verluste" in e), None)
    verluste = None if v is None else {
        "panzer": {k: {"zustand": s["zustand"], "roh": s["roh"], "stufe": s["stufe"], "treffer": s["treffer"], "verwundete": s["verwundete"],
                       "ausgefallen": s["ausgefallen"]} for k, s in v["verluste"].items()},
        "zug": v["zug"],
        "ereignisse": v["ereignisse"],
        # seit 2.5: jeder Schuss mit Einschießen, Ergebnis, Zustand danach und Einschlagort (Engine = Simulation bitgenau)
        "zeitlinie": [[e["t"], e["panzer"], e["quelle"], e["art"], e["k"], e["ergebnis"], e["schaden"], e["zustand"], e["ausgefallen"], e["pos"]]
                      for e in v["zeitlinie"]],
        "meldungen": [{"inject": e["inject"], "t": zahl(e["t"]), "zug": e["zug"], "stufe": e["stufe"], "text": e["text"]}
                      for e in det if "inject" in e and "stufe" in e],
        "texte": {e["inject"]: e["text"] for e in det if "inject" in e and "text" in e and "stufe" not in e},
        "verlauf": v["verlauf"],
    }
    # seit 2.7 (G2): Bilanz „Das ist es wert“, unabhängig nachgerechnet (tools/referenz/bilanz.py = src/kern/bilanz.ts)
    bil = B.bilanz(d, det, None if v is None else (v["zug"]["bereit"], v["zug"]["gesamt"]))
    return {
        "team": team, "einspielen": ein or {}, "meldungen": meldungen, "injects": inj, "bilanz": bil,
        "hintergrund": hg, "e01": e01, "durchbruch": durchbruch, "durchgebrochen": durchgebrochen, "rest": rest, "treffer_schutz": schutz, "faelle": faelle,
        "letzte_bekaempfung": letzte, "log": [f"{a}: {b}" for a, b in log], "verluste": verluste,
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
        "zeiten": {"naiv": S.T_NAIV, "ideal": S.T_IDEAL, "argus": 0},
        "reihenfolge_wirkmittel": S.REIHENFOLGE,
        "auswahl_argus": S.AUSWAHL_ARGUS,
        "laeufe": [lauf_export(d, team, ein) for team, ein in LAEUFE],
        # seit 2.7 (G2.1): Referenzlauf „ARGUS allein“ – jede BEKÄMPFEN-Empfehlung zur Meldezeit, Mörser/LM/Kanone
        "referenz": lauf_export(d, "argus", None),
    }
    with open(ZIEL, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"{len(out['laeufe'])} Läufe → {os.path.normpath(ZIEL)}")


if __name__ == "__main__":
    main()
