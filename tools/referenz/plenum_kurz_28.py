#!/usr/bin/env python3
"""Szenario KRÄHE-01 2.8: Plenum kurz (Änderungsliste O, 15.11.2026). Die Version bleibt 2.8 – es ändert sich nur, was das Plenum
nach dem Spiel zeigt (szenario.auswertung, ablauf_unterricht, je Schlüsselfall ein Satz zur Auflösung); am Spiel selbst nichts.

Quelle: claude/Aenderungen_Plenum_15-11.md (O1). Grundsätze bleiben: deterministisch, keine Darstellung getöteter Menschen, keine
Rangliste.

  O1.1  Kapitel 1 „Gefecht beendet“ (Abschlussbild M4, eine Karte je Team), Soll 1:00.
  O1.2  Kapitel 2 „Schlüsselfälle“, je Fall eine Folie, Soll 0:45 je Fall; Standard S3, S2, S1, S4, zuschaltbar S5–S8
        (auswertung.faelle). Erst das Drohnenbild, auf Klick aufgedeckt: was es war (schluesselfaelle[].wirklich) und
        „x von n Teams haben das falsch behandelt – y %“.
  O1.6  Kapitel 3 „Gesamt“, Soll 1:00: alle gezeigten Fälle zusammen und auf Klick die Zahl (Median Sekunden je Ziel).
  O1.9  Teamvergleich, Kennzahlen, Konfidenz, Replay, Preis des Abwartens, Bilanz, Impuls, Diskussion, Abschluss bleiben, aber nur
        zuschaltbar (nach „Gesamt“, in der bisherigen Reihenfolge). Standard Σ 5:00.
  Ablauf im Unterricht: These vorher in der PowerPoint, Plenum ca. 5 min, danach zurück in die PowerPoint (Zitat, Diskussion).

Einmalig benutzt wie bau_szenario_v28.py; maßgeblich ist danach die JSON-Datei.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/plenum_kurz_28.py public/daten
"""
import json
import os
import sys

import argus_lib as L

if len(sys.argv) < 2:
    print(__doc__)
    sys.exit(2)
ORDNER = sys.argv[1]
PFAD = os.path.join(ORDNER, "szenario_kraehe_01.json")
with open(PFAD, encoding="utf-8") as f:
    SZ = json.load(f)
assert SZ["version"] == "2.8", "Szenario 2.8 erwartet"
AU = SZ["auswertung"]
assert AU["kapitel"][0]["id"] == "teams", "schon umgestellt?"

# =============================================================================== O1.1–O1.9 Kapitelplan
AU["kapitel"] = [
    {"id": "gefecht", "titel": "Gefecht beendet", "sek": 60},
    {"id": "faelle", "titel": "Schlüsselfälle", "sek": 180},
    {"id": "gesamt", "titel": "Gesamt", "sek": 60},
]
AU["faelle"] = {
    "standard": ["S3", "S2", "S1", "S4"],
    "zuschaltbar": ["S5", "S6", "S7", "S8"],
    "je_fall_s": 45,
    "hinweis": "Seit Liste O (O1.2): je Schlüsselfall eine Folie – erst das Drohnenbild, wie die Teams es sahen, auf Klick aufgedeckt, "
               "was es war, und wie viele Teams es falsch behandelt haben (Ausgang falsch oder zu Unrecht abgelehnt; ohne Entscheidung "
               "zählt nicht). 0:45 je Fall; weitere Fälle verlängern das Plenum.",
}
ALT = {k["id"]: k for k in AU["zuschaltbar"]}
AU["zuschaltbar"] = [
    {"id": "teams", "titel": "Teamvergleich", "sek": 60, "nach": "gesamt"},
    {**{k: v for k, v in ALT["kennzahlen"].items() if k != "nach"}, "nach": "gesamt"},
    {**{k: v for k, v in ALT["konfidenz"].items() if k != "nach"}, "nach": "gesamt"},
    {"id": "replay", "titel": "Replay", "sek": AU["replay"]["budget_s"], "nach": "gesamt"},
    {**{k: v for k, v in ALT["preis"].items() if k != "nach"}, "nach": "gesamt"},
    {"id": "bilanz", "titel": "Bilanz – Das ist es wert", "sek": 120, "nach": "gesamt"},
    {"id": "impuls", "titel": "Impuls", "sek": 60, "nach": "gesamt"},
    {"id": "diskussion", "titel": "Diskussion", "sek": 360, "nach": "gesamt"},
    {"id": "abschluss", "titel": "Abschluss", "sek": 60, "nach": "gesamt"},
]
AU["replay"]["hinweis"] = ("Seit 2.7 (G1.1): Das Replay hat 4 min; Standard S3 und S2 je 2:00, weitere Fälle zuschaltbar (die Zeit je Fall "
                           "sinkt). Seit Liste O nur noch zuschaltbar (Menü ＋ im Plenum).")

# =============================================================================== O1.4 ein Satz zur Auflösung je Fall
WIRKLICH = {
    "S3": "Polnische PT-91 – verbündet: der Entsatz von Süden.",
    "S2": "Sanitätsfahrzeug neben der Schule, mit Rotem Kreuz.",
    "S1": "Attrappe am Waldrand FUCHS – Holzrohr unter dem Tarnnetz.",
    "S4": "Mörser im Hof RABE – vier Zivilpersonen daneben. ARGUS warnte zu Recht.",
    "S5": "Schützenpanzer vor dem Wohnhaus – die Bewohner davor als Schutzschild.",
    "S6": "Verwundete Soldaten ohne Waffen am Wrack – außer Gefecht.",
    "S7": "Beobachter im Kirchturm – echtes Ziel, aber nur mit LM, nicht mit dem Mörser.",
    "S8": "Pressefahrzeug mit Kamerateam – kein Feind.",
}
for f in SZ["schluesselfaelle"]:
    neu = {}
    for k, v in f.items():
        neu[k] = v
        if k == "titel":
            neu["wirklich"] = WIRKLICH[f["id"]]
    f.clear()
    f.update(neu)

# =============================================================================== Ablauf im Unterricht
for a in SZ["ablauf_unterricht"]:
    if a["phase"] == "Auswertung":
        a["phase"] = "Plenum"
        a["dauer_min"] = 5
        a["inhalt"] = ("Gefecht beendet, die Schlüsselfälle S3, S2, S1, S4 einzeln (erst das Bild, dann aufgedeckt, wie viele Teams sie "
                       "falsch behandelt haben), Gesamt mit der einen Zahl (Sekunden je Ziel); danach zurück in die PowerPoint: These, "
                       "Zitat, Diskussion")
assert [a["phase"] for a in SZ["ablauf_unterricht"]] == ["Einweisung", "Spiel", "Plenum"]

SZ["stand"] = "2026-11-15"
L.speichere(SZ, PFAD)
print(f"Szenario {SZ['version']}: Plenum {sum(k['sek'] for k in AU['kapitel'])} s, Fälle {AU['faelle']['standard']} → {PFAD}")
