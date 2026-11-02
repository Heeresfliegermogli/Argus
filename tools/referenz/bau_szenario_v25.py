#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.5 aus v2.4: Änderungen F vom 02.11.2026 (Panzerzug statt Kompanie, Feindfeuer mit Einschießen, „Schule“).

Quelle: claude/Aenderungen_Panzerzug_02-11.md.

  F1  Eigene Truppe ist nur noch der 1. Zug der Panzerkompanie WOLF (fiktiv): vier Kampfpanzer Leopard 2A7V, einzeln auf der Karte
      (1/1–1/4) ganz am Westrand hinter der Hecke, Blick nach Osten; kein Gefechtsstand mehr. Übergeordnet PzBtl (Übung). Wirkmittel
      „Panzerabwehr 2. Kp“ wird „1. Zug (Kanone 120 mm)“ (5 m, ca. 5 s, unbegrenzt, bis zum Bach). Das Hintergrundgefecht schießt
      von den Panzern (H-02 und H-11 von 1/1 an der Hauptstraße, H-05–H-10 von 1/2 am Waldrand FUCHS); fällt der Schütze aus, schießt
      der nächste einsatzbereite (Darstellung, das Drehbuch bleibt gleich).
  F2  Feindfeuer mit Einschießen und Zustand je Panzer (regeln.json `verluste`, Referenz tools/referenz/verluste.py): Direktschützen
      ab x ≤ 560 m, Feuerraten T-72 15 s, BMP-2 10 s, BTR-80 12 s, Mörser eine Salve alle 30 s, Beobachter alle 35 s; Treffer T-72
      −25 %, BMP-2 −5 %, BTR-80 −2 %, Mörser/Artillerie im Ziel −4 %, gelenktes Feuer −4 %; höchstens zwei Panzer fallen aus.
      Zuordnung der Drehbuch-Schützen (F2.8), Feindartillerie auf den neuen Stellungen, Druckmeldungen je Panzer, I-07/I-06/I-13.
  F3  „Schule“ statt „Schule mit Sportplatz“ (Zone NS-01, Regel R2, Karte); die Geometrie bleibt.
  F4  Texte (Plenum-Lage nach dem Befehl der Druckanlage, Einweisung, Injects, Hintergrund, Fälle), Kalibrierung F2.9 mit
      simuliere_durchlauf.py (Werte unten, Ergebnis im Drehbuch, Abschnitt 9).

Einmalig benutzt wie bau_szenario_v24.py; maßgeblich ist danach die JSON-Datei.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v25.py BASIS_2.4_ORDNER OUT_ORDNER
"""
import copy
import json
import os
import re
import sys

import argus_lib as L

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)
QUELLE, ZIEL = sys.argv[1], sys.argv[2]
D = L.lade_alles(ordner=QUELLE)
ALT = D["szenario"]
assert ALT["version"] == "2.4", "Basis muss Szenario 2.4 sein"


def roh(name):
    with open(os.path.join(QUELLE, name), encoding="utf-8") as f:
        return json.load(f)


SZ = copy.deepcopy(ALT)
REG = copy.deepcopy(D["regeln"])
FZK = roh(ALT["kataloge"]["fahrzeuge"])
WMK = roh(ALT["kataloge"]["wirkmittel"])
KARTE = roh(ALT["kataloge"]["karte"])
Z = {z["id"]: z for z in SZ["ziele"]}
M = {m["id"]: m for m in SZ["meldungen"]}
I = {i["id"]: i for i in SZ["injects"]}
H = {h["id"]: h for h in SZ["hintergrund"]["ereignisse"]}
SZ["version"] = "2.5"
SZ["stand"] = "2026-11-02"


def ersetze(obj, schl, alt, neu, muss=True):
    """Text in obj[schl] ersetzen; muss=True prüft, dass der alte Text vorkommt (sonst wäre die Vorlage veraltet)."""
    if muss:
        name = obj.get("id", schl) if isinstance(obj, dict) else schl
        assert alt in obj[schl], f"„{alt}“ nicht in {name}: {obj[schl][:120]}"
    obj[schl] = obj[schl].replace(alt, neu)


# =============================================================================== Kalibrierung (F2.9, mit simuliere_durchlauf.py)
# Spielwerte aus F2.2–F2.4 stehen fest; kalibriert werden nur Bereitschaft der Direktschützen und die Feuerphasen nach Drehbuch.
FEUERBEREIT_S = {"kpz_t72": 20, "spz_bmp2": 60, "spw_btr80": 60}
DURCHBRUCH_PROZENT = 8      # je eingebrochenem Fahrzeug am Panzer des Übergangs (Folge von S3 bzw. liegen gelassener Meldungen)
# Bereitstellung in Phase 5 (sammeln an der Brücke Ost für den Angriff über den Bach, Motoren laufen): kein Direktfeuer, bis sie
# durchbrechen – dann trifft der Durchbruch. Z-36 (N4) schießt dagegen von der Brücke, sobald er die Schule verlassen hat.
BEREITSTELLUNG = ("Z-20", "Z-48", "Z-27", "Z-28")
# Feuer nach Drehbuch (feuert): Mörser eine Salve (zwei Rohre) alle 30 s, Beobachter ein Feuerkommando alle 35 s, SPz Feuerstöße alle 10 s
FEUERT = {
    # Mörser Wald MARDER (Z-06) → 1/2: Gefechtsaufklärung und Hauptangriff
    "Z-06": [{"von_s": 302, "bis_s": 650, "takt_s": 2, "salve": 2, "pause_s": 28, "auf": "pz2"},
             {"von_s": 818, "bis_s": 1190, "takt_s": 2, "salve": 2, "pause_s": 28, "auf": "pz2"}],
    # Mörser Hof RABE (Z-19, S4) → 1/4
    "Z-19": [{"von_s": 1006, "bis_s": 1500, "takt_s": 2, "salve": 2, "pause_s": 28, "auf": "pz4"}],
    # Schutzschild-SPz (Z-41, S5) → 1/1: drei Feuerstöße im Abstand 10 s, dann Stellungswechsel am Haus (Pause)
    "Z-41": [{"von_s": 930, "bis_s": 1500, "takt_s": 10, "salve": 3, "pause_s": 50, "auf": "pz1"}],
    # Beobachter im Kirchturm (Z-42, S7) → 1/2: ein Feuerkommando alle 35 s
    "Z-42": [{"von_s": 870, "bis_s": 1500, "takt_s": 35, "salve": 1, "auf": "pz2"}],
    # BMP-2 an der Brücke Ost (Z-18, „der vordere mit Mündungsfeuer“): Feuerstöße alle 10 s mit Pausen
    "Z-18": [{"von_s": 988, "bis_s": 1210, "takt_s": 10, "salve": 3, "pause_s": 50}],
}
# Feindartillerie auf den neuen Stellungen [t, x, y]: zuerst daneben, im Ziel nur, was im Umkreis radius_m eines Panzers liegt
ARTILLERIE = {
    "H-01": [[300, 150, 352], [304, 118, 425], [309, 96, 300], [313, 70, 395], [318, 40, 330], [323, 58, 361], [328, 33, 432]],
    "H-04": [[815, 140, 470], [819, 98, 360], [823, 120, 530], [827, 90, 412], [832, 75, 500], [836, 84, 440], [841, 52, 470],
             [845, 30, 395], [850, 62, 560], [854, 45, 520], [859, 58, 405]],
    "H-12": [[1190, 130, 410], [1198, 96, 380], [1206, 80, 440], [1214, 70, 418], [1222, 30, 400]],
}
# Attrappe getroffen (S1): Feindartillerie auf 1/2, Einschläge [dt, dx, dy] relativ zum Panzer – die ersten beiden daneben
ATTRAPPE_EINSCHLAEGE = [[0, 68, -22], [5, -40, 55], [10, 6, -4], [15, -5, 7], [20, 8, 3], [25, -3, -8]]

PZ = [
    {"id": "pz1", "name": "1/1", "rolle": "Zugführer", "ort": "an der Hauptstraße", "pos": [55, 412], "hdg": 0,
     "schaden_eingeschraenkt": "Kette getroffen"},
    {"id": "pz2", "name": "1/2", "ort": "am Waldrand FUCHS", "pos": [55, 365], "hdg": 0, "schaden_eingeschraenkt": "Optik getroffen"},
    {"id": "pz3", "name": "1/3", "ort": "südlich der Hauptstraße", "pos": [55, 470], "hdg": 0, "schaden_eingeschraenkt": "Kette getroffen"},
    {"id": "pz4", "name": "1/4", "ort": "südlich der Hauptstraße", "pos": [50, 530], "hdg": 0, "schaden_eingeschraenkt": "Optik getroffen"},
]

# =============================================================================== F1: Katalog – Leopard 2A7V (eigen) statt SPz (eigen)
FZK["version"] = "1.6"
FZK["hinweis"] += (" Seit 1.6 (Szenario 2.5, F1): Die eigene Truppe sind vier Kampfpanzer Leopard 2A7V (kpz_leo2a7v, fiktiv gestaltet, kein Ziel, nie "
                   "gemeldet) mit drei Bildern: intakt, eingeschränkt (Kette bzw. Optik beschädigt) und ausgefallen (Rauch, Gerät, keine Personen). "
                   "Der Schützenpanzer der eigenen Kompanie (spz_eigen) entfällt.")
FZK["fahrzeuge"] = [f for f in FZK["fahrzeuge"] if f["id"] not in ("spz_eigen", "kpz_leo2a7v", "pzgren_kp", "pz_zug")]
FZK["fahrzeuge"].append({"id": "pz_zug", "name": "Panzerzug (eigen)", "argus_klasse": None, "gepanzert": True, "groesse_m": [100, 100],
                         "symbol": {"art": "kampfpanzer", "sidc": "UCA", "groesse": "D"}, "generator": "Lagekarte (Rechteck)", "sprite": None,
                         "sprite_wrack": None, "hinweis": "Seit 1.6 (Szenario 2.5): Kraft „1./PzKp WOLF“ (szenario.kraefte); die Panzer stehen einzeln."})
FZK["fahrzeuge"].append({
    "id": "kpz_leo2a7v", "name": "Kampfpanzer Leopard 2A7V (eigen)", "argus_klasse": None, "gepanzert": True, "groesse_m": [7.7, 3.8],
    "symbol": {"art": "kampfpanzer", "sidc": "EVAT", "einheit": "UCA"}, "generator": "kpz_leo2a7v", "sprite": "kpz_leo2a7v.png",
    "sprite_eingeschraenkt": "kpz_leo2a7v_eingeschraenkt.png", "sprite_wrack": "kpz_leo2a7v_ausgefallen.png",
    "farbe": "dreifarbig gefleckt (fiktiv)",
    "hinweis": "Seit 1.6 (Szenario 2.5, F1): Kampfpanzer des eigenen 1. Zuges in Stellung (fiktiv gestaltet). Kein Ziel, nie gemeldet. "
               "Wanne 7,7 m (groesse_m), mit Rohr 10,9 m. Bilder: intakt, eingeschränkt (Kette neben dem Panzer, Optik zerschlagen), "
               "ausgefallen (Turm verdreht, Rußflecken – Gerät, kein Brand)."})

# =============================================================================== F1: eigene Truppe
SZ["eigene_truppe"] = {
    "hinweis": ("Seit 2.5 (F1): Eigene Truppe ist der 1. Zug der Panzerkompanie WOLF (fiktiv) mit vier Kampfpanzern Leopard 2A7V, jeder einzeln "
                "auf der Karte (1/1–1/4), ganz am Westrand hinter der Hecke, Blick nach Osten. Übergeordnet PzBtl (Übung). Alle Rollen sehen die "
                "Panzer und ihren Zustand (einsatzbereit, eingeschränkt, ausgefallen; Verlustmodell in `verluste` und regeln.json). Position "
                "in Metern; hdg = Blickrichtung (0 = Osten). Bis 2.4: eine Kompanie mit drei Zügen."),
    "einheit": "1./PzKp WOLF",
    "kompanie": "Panzerkompanie WOLF",
    "uebergeordnet": "PzBtl (Übung)",
    "name": "1. Zug",
    "fahrzeug": "kpz_leo2a7v",
    "panzer": PZ,
}
SZ["kraefte"] = [{
    "id": "K-1", "name": "1./PzKp WOLF", "kurz": "1./WOLF", "zugehoerigkeit": "eigen", "typ": "pz_zug", "pos": [54, 444],
    "text": "1. Zug der Panzerkompanie WOLF am Westrand hinter der Hecke: 1/1 (Zugführer) an der Hauptstraße, 1/2 am Waldrand FUCHS, "
            "1/3 und 1/4 südlich der Hauptstraße"}]

# =============================================================================== F1.4: Wirkmittel Kanone des 1. Zuges
WMK["version"] = "2.4"
WMK["hinweis"] = WMK["hinweis"].replace("(LM, PzAbw:", "(LM, Kanone:")
WMK["hinweis"] += (" Seit 2.4 (Szenario 2.5, F1.4): Das direkte Feuer ist die Kanone 120 mm des eigenen 1. Zuges (PZA, intern weiter so benannt), "
                   "ca. 5 s bis zum Einschlag; es schießt der nächste einsatzbereite Panzer.")
for w in WMK["wirkmittel"]:
    if w["id"] == "PZA":
        w["name"] = "1. Zug (Kanone 120 mm)"
        w["kurz"] = "Kanone"
        w["vorlauf_s"] = 5
        w["vorlauf_text"] = "ca. 5 s"
        w["einsatzbereich"] = {"x_max": 500, "text": "nur Ziele bis zum Bach ELSTER einschließlich Brücke (x < 500 m, Sicht); es schießt der "
                                                     "nächste einsatzbereite Panzer des 1. Zuges"}
        w["effekt"] = "treffer_direkt"

# =============================================================================== F2: Regeln – Verlustmodell je Panzer
REG["version"] = "2.5"
REG["verluste"] = {
    "hinweis": ("Verlustmodell der eigenen Truppe seit 2.5 (F2): vier Kampfpanzer des 1. Zuges mit Zustand je Panzer (100 %). Direktschützen "
                "(waffen mit art direkt, ohne feuert) schießen erst, wenn sie das Ostufer bzw. die Brücke Ost erreicht haben (x ≤ feuer_ab_x) "
                "und mindestens feuerbereit_s stehen, alle takt_s auf den nächsten einsatzbereiten Panzer. Schützen mit feuert (Mörser, "
                "Beobachter, Schutzschild-SPz) wirken nach Drehbuch: eine Salve des Schussrhythmus = ein Schuss, auf feuert[].auf. Einschießen "
                "je Schütze und Ziel (einschiessen): direkt Schuss 1–2 daneben, 3 nah, ab 4 jeder zweite Treffer, ab 8 jeder; Steilfeuer und "
                "gelenktes Feuer Salve 1–2 daneben, ab 3 im Ziel; Zielwechsel beginnt neu. Treffer kosten treffer_prozent; ab "
                "stufen.einsatzbereit_ab einsatzbereit, darunter eingeschränkt, unter stufen.ausgefallen_unter ausgefallen. Höchstens "
                "hoechstens_ausgefallen Panzer fallen aus, die übrigen bleiben bei untergrenze_prozent (der Zug hält immer). Verwundete je "
                "Stufe fest, keine Gefallenen. Feindartillerie und Attrappe treffen im Umkreis radius_m, ein Durchbruch trifft je Fahrzeug "
                "mit durchbruch.treffer_prozent. Ziele mit bereitstellung (sammeln für den Angriff über den Bach) schießen nicht direkt. Der Schaden kommt verzug_s nach dem Schuss an. Bis 2.4: drei Züge mit Kampfkraft in Promille."),
    "zustand_start": 100,
    "stufen": {"einsatzbereit_ab": 70, "ausgefallen_unter": 40},
    "hoechstens_ausgefallen": 2,
    "untergrenze_prozent": 40,
    "verwundete": {"einsatzbereit": 0, "eingeschraenkt": 1, "ausgefallen": 3},
    "feuer_ab_x": 560,
    "verzug_s": {"direkt": 4, "steil": 20, "beobachter": 25},
    "einschiessen": {"direkt": {"daneben": 2, "nah": 1, "jeder_zweite_ab": 4, "jeder_ab": 8}, "steil": {"daneben": 2}},
    "ablage_m": {"daneben": [20, 40], "nah": [3, 8], "steil_daneben": [60, 100]},
    "waffen": {
        "kpz_t72": {"art": "direkt", "treffer_prozent": 25, "takt_s": 15, "feuerbereit_s": FEUERBEREIT_S["kpz_t72"]},
        "spz_bmp2": {"art": "direkt", "treffer_prozent": 5, "takt_s": 10, "feuerbereit_s": FEUERBEREIT_S["spz_bmp2"]},
        "spw_btr80": {"art": "direkt", "treffer_prozent": 2, "takt_s": 12, "feuerbereit_s": FEUERBEREIT_S["spw_btr80"]},
        "moerser_trupp": {"art": "steil", "treffer_prozent": 4},
        "beobachter_trupp": {"art": "beobachter", "treffer_prozent": 4},
    },
    "feindartillerie": {"treffer_prozent": 4, "radius_m": 10},
    "attrappe": {"treffer_prozent": 4, "radius_m": 10},
    "durchbruch": {"treffer_prozent": DURCHBRUCH_PROZENT},
    "meldungen": {"abstand_alle_s": 20, "abstand_panzer_s": 45, "abstand_limit_s": 90, "sofort": ["attrappe"]},
}
REG["einsatzregeln"]["regeln"][1]["text"] = REG["einsatzregeln"]["regeln"][1]["text"].replace("(Schule mit Sportplatz)", "(Schule)")
ersetze(REG["einsatzregeln"]["regeln"][2], "text", "(LM, PzAbw)", "(LM, Kanone)")
ersetze(REG["wirkung"], "trefferregel", "PzAbw ca. 10 s", "Kanone des 1. Zuges ca. 5 s")
REG["wirkung"]["hintergrund"] = ("Der eigene 1. Zug und die Feindartillerie wirken nach Drehbuch (szenario.hintergrund). Eine Wirkung des "
                                 "Hintergrundgefechts entfällt, wenn das Ziel schon zerstört ist; fällt der schießende Panzer aus, schießt der "
                                 "nächste einsatzbereite. Das Gefecht ist nicht zu verlieren; die Auswertung bleibt bei der Ethik.")
ersetze(REG["wirkung"], "zug", "Panzerabwehr: ein Schuss je Fahrzeug nacheinander.", "Kanone des 1. Zuges: ein Schuss je Fahrzeug nacheinander.")
REG["eigene_kraefte"] = ("Seit 2.5 steht der 1. Zug der Panzerkompanie WOLF mit vier Kampfpanzern ganz am Westrand der Karte "
                         "(szenario.eigene_truppe). Ein Sicherheitsabstand wird nicht geprüft; Wirkungen liegen alle östlich des Bachs.")
for k in REG["kennzahlen"]:
    k["text"] = k["text"].replace("Kampfkraft", "Zustand der Panzer")

# =============================================================================== F2: Feuer nach Drehbuch, keine Abweichungen je Ziel mehr
for zid, f in FEUERT.items():
    Z[zid]["feuert"] = f
for zid in BEREITSTELLUNG:
    Z[zid]["bereitstellung"] = True
for z in SZ["ziele"] + [z for g in SZ["verstaerkungen"]["gruppen"] for z in g["ziele"]]:
    z.pop("verlust_promille", None)
    for f in z.get("feuert") or []:
        if f.get("auf") in ("zug1", "zug2", "zug3"):
            # Verstärkung V-4 (Mörsertrupp MARDER): wie Z-06 eine Salve alle 30 s auf 1/2
            f.update(auf="pz2", takt_s=2, salve=2, pause_s=28)

# =============================================================================== F3: Schule
SZ["zonen"][0]["name"] = "Schule"
for fl in KARTE["flaechen"]:
    if fl["id"] == "schulgelaende":
        fl["name"] = "Schule"
KARTE["version"] = "1.4"
KARTE["hinweis"] = KARTE.get("hinweis", "") + " Seit Szenario 2.5 (F3, Karte 1.4): Das Schulgelände heißt sichtbar nur noch „Schule“."

# =============================================================================== Texte: Lage (Plenum nach dem Befehl der Druckanlage), Rollen
lg = SZ["lage"]
lg["plenum"]["absaetze"] = [
    "Übungslage, alles fiktiv. Russische Kräfte greifen seit dem Morgen nach Westen an. Im Raum KRÄHE erwarten wir eine verstärkte "
    "Kompanie mit Kampf- und Schützenpanzern.",
    "Unser Panzerbataillon (Übung) verteidigt westlich von KRÄHE. Am Westrand hält der 1. Zug der Panzerkompanie WOLF mit vier Kampfpanzern "
    "Leopard 2A7V (1/1 bis 1/4) die Brücke ELSTER und die Furt Nord.",
    "Auftrag: Der Feind darf den Bach ELSTER nicht überschreiten, vor allem nicht an der Brücke ELSTER. Östlich des Bachs liegen die "
    "Ortschaft KRÄHE und die Schule; dort sind noch Zivilpersonen.",
    # Drohne und Teams aus 2.4, gekürzt, damit die Lage im Plenum in 1530 × 800 ohne Rollbalken steht (ca. 80 s Vorlesezeit)
    "Die Drohne „Milan“ klärt den Raum östlich des Bachs auf. Ihre Bilder wertet das KI-System ARGUS aus: Klasse, Konfidenz und eine "
    "Empfehlung. Laut Hersteller liegt ARGUS in 94 % der Fälle richtig.",
    "Jedes Team ist die Zielbearbeitung des Bataillons: G1 Aufklärung prüft jede ARGUS-Meldung, G2 Zielprüfung die Einsatzregeln und das "
    "Wirkmittel, G3 Führung gibt frei. Ohne Freigabe von G3 wird nichts bekämpft. Alle Teams spielen dieselbe Lage, Spieluhr 10:00–10:25 "
    "in Echtzeit.",
]
ersetze(lg["G2"]["absaetze"], 0, "Die eigene 2. Kompanie liegt mit drei Zügen am Westrand der Karte (blau).",
        "Der eigene 1. Zug steht mit vier Kampfpanzern (1/1–1/4) am Westrand der Karte (blau).")
ersetze(lg["G2"]["absaetze"], 1, "(Mörser, Loitering Munition oder Panzerabwehr)", "(Mörser, Loitering Munition oder die Kanone des 1. Zuges)")
ersetze(lg["G2"]["absaetze"], 2, "LM und Panzerabwehr je Fahrzeug", "LM und Kanone je Fahrzeug")
ersetze(lg["G3"]["absaetze"], 1, "Brigade, Nachbarn und der 2. Kompanie; sie meldet auch ihre Verluste.",
        "Brigade, Nachbarn und dem 1. Zug; er meldet auch Treffer und Ausfälle seiner Panzer.")

# =============================================================================== Texte: Phasen, Ziele, Meldungen
ph = {p["nr"]: p for p in SZ["phasen"]}
ersetze(ph[2], "absicht", "Feuervorbereitung auf die 2. Kp", "Feuervorbereitung auf den 1. Zug")
ersetze(ph[4], "absicht", "lenkt Artillerie auf den 2. Zug (S7)", "lenkt Artillerie auf 1/2 (S7)")
ersetze(ph[5], "absicht", "die 2. Kp fordert Feuer (I-06)", "der 1. Zug fordert Feuer (I-06)")
KANONE = "der Kanone des 1. Zuges"
for zid in ("Z-11", "Z-24", "Z-30", "Z-31", "Z-32"):
    ersetze(Z[zid]["gt"], "text", "der eigenen Panzerabwehr", KANONE)
ersetze(Z["Z-18"]["gt"], "text", "auf die 2. Kp", "auf den 1. Zug")
ersetze(Z["Z-19"]["gt"], "text", "beschießt die 2. Kp", "beschießt 1/4")
ersetze(Z["Z-37"]["gt"], "text", "auf die 2. Kp", "auf den 1. Zug")
ersetze(Z["Z-41"]["gt"], "text", "auf den 2. Zug", "auf 1/1")
ersetze(Z["Z-42"]["gt"], "text", "auf den 2. Zug", "auf 1/2")
for m in SZ["meldungen"]:
    for schl in ("zweck",):
        if schl in m:
            m[schl] = (m[schl].replace("LM oder PzAbw", "LM oder Kanone").replace("(LM oder PzAbw)", "(LM oder Kanone)")
                       .replace("auf der 2. Kp", "auf dem 1. Zug").replace("die PzAbw reicht nicht so weit", "die Kanone reicht nicht so weit")
                       .replace("unter dem Druck der 2. Kp", "unter dem Druck des 1. Zuges")
                       .replace("Die eigene PzAbw hat den Panzer kurz vorher getroffen", "Der 1. Zug hat den Panzer kurz vorher getroffen")
                       .replace("Forderung der 2. Kp (I-06)", "Forderung des 1. Zuges (I-06)")
                       .replace("schießt laufend auf den 2. Zug", "schießt laufend auf 1/1"))
    l = m["loesung"]
    for k in ("G2", "G3"):
        l[k] = (l[k].replace("PzAbw außerhalb des Einsatzbereichs", "Kanone außerhalb des Einsatzbereichs").replace("(PzAbw oder LM)", "(Kanone oder LM)")
                .replace("(der 2. Zug hat Verluste: Druck)", "(1/1 wird beschossen: Druck)"))

# =============================================================================== Injects (F1.3, F2.7)
for i in SZ["injects"] + SZ.get("reserve_injects", []):
    if i["von"] == "2. Kp":
        i["von"] = "1. Zug"
I["I-07"]["text"] = "{pz} unter Mörserfeuer aus Hof RABE, {treffer}. Fordere sofortige Bekämpfung des Mörsers!"
I["I-07"].pop("verluste_zug", None)
I["I-07"]["verluste_panzer"] = "pz4"
I["I-07"]["zweck"] = ("Gleichzeitig mit der Mörsermeldung im Hof RABE: menschlicher Druck gegen die berechtigte Warnung von ARGUS. Seit 2.5 nennt sie "
                      "die tatsächlichen Treffer an 1/4 (der Mörser Z-19 schießt sich auf ihn ein); solange der Mörser steht, folgen "
                      "Druckmeldungen des Zuges (K-…).")
I["I-06"]["text"] = ("Feind sammelt KPz und SPz an der Brücke Ost, Angriff steht bevor. Zug {bereit}/4 einsatzbereit, {zug_verw}. "
                     "Feuer auf Brücke Ost!")
I["I-06"].pop("verluste_zug", None)
I["I-06"]["zweck"] = ("Druck genau auf den Raum, den der polnische Gegenangriff in wenigen Minuten angreift. Wer die Feindkräfte an der Brücke Ost "
                      "nicht aufhält, riskiert den Durchbruch (A4) – wer auf die Polen schießt, ebenfalls. Seit 2.5 nennt sie den Zustand des "
                      "Zuges (einsatzbereite Panzer, Verwundete).")
I["I-13"]["text"] = "Feind über den Bach ELSTER eingebrochen! {pz} getroffen, Zug {bereit}/4 einsatzbereit. Wir binden ihn mit der Kanone."
I["I-13"]["verluste_panzer"] = "durchbruch"
I["I-13"]["zweck"] = ("Rückmeldung, wenn eine Feindgruppe nicht aufgehalten wurde und über Brücke oder Furt durchbricht (10 s nach dem ersten "
                      "Fahrzeug über dem Bach). In der Auswertung als Kennzahl, nicht als Punkte; das Gefecht ist nicht zu verlieren. Seit 2.5 "
                      "nennt sie den Panzer, den der Durchbruch traf, und die einsatzbereiten Panzer des Zuges.")

# =============================================================================== Hintergrundgefecht (F1.5, F2.1)
hg = SZ["hintergrund"]
hg["hinweis"] = ("Der eigene 1. Zug und die Feindartillerie wirken nach Drehbuch, unabhängig von den Teams. Wirkungen der Kanone kommen vom Panzer "
                 "in `von` (seit 2.5; ist er ausgefallen, schießt der nächste einsatzbereite – nur Darstellung) und treffen nur, wenn das Ziel dann "
                 "noch steht (sonst entfallen sie), und nur Ziele bis zum Bach (x < 500 m). Die Feindartillerie liegt auf den Stellungen: Einschläge "
                 "im Umkreis von 10 m eines Panzers treffen ihn (Verlustmodell), die übrigen sind Darstellung; Spielobjekte trifft sie nicht. Rauch "
                 "ist Darstellung. Alles steht als Ereignis im Protokoll.")
for hid, pz, txt in (
        ("H-02", "pz1", "1/1 trifft einen SPz BMP-2 an der Brücke ELSTER Ost (Leuchtspur vom Panzer). Das Wrack brennt, die Besatzung ist verwundet."),
        ("H-05", "pz2", "1/2 trifft einen KPz T-72 am Ostufer vor der Furt Nord."),
        ("H-06", "pz2", "1/2 trifft einen zweiten KPz T-72 am Ostufer."),
        ("H-07", "pz2", "1/2 trifft den Führungspanzer der Achse NORD am Ostufer nördlich der Furt. Der Panzerzug ist zerschlagen."),
        ("H-08", "pz2", "1/2 trifft einen SPz BMP-2 in der Furt Nord (Wrack im Bach)."),
        ("H-09", "pz2", "1/2 trifft einen SPz BMP-2 am Ostufer, der seine Schützen absetzt; die abgesessenen Schützen sind verwundet."),
        ("H-10", "pz2", "1/2 trifft den letzten SPz BMP-2 der Achse NORD. Der Angriff über die Furt ist abgeschlagen."),
        ("H-11", "pz1", "1/1 trifft einen KPz T-72 nördlich der Brücke: Kette abgesprungen, kein Brand. Die Besatzung steigt um 10:20:30 aus und ergibt sich.")):
    H[hid]["von"] = pz
    H[hid]["text"] = txt
for hid, txt in (("H-01", "Feuervorbereitung der Gefechtsaufklärung: Feindartillerie liegt auf 1/1 und 1/2."),
                 ("H-04", "Feuervorbereitung des Hauptangriffs auf alle vier Panzer des 1. Zuges."),
                 ("H-12", "Feindartillerie auf 1/1 an der Hauptstraße: Der Feind will die Brücke noch nehmen.")):
    H[hid]["ziel"] = "1./PzKp WOLF"
    H[hid]["text"] = txt
    H[hid]["einschlaege"] = ARTILLERIE[hid]
    assert H[hid]["einschlaege"][0][0] == H[hid]["t_s"]

# =============================================================================== Fälle
F = {f["id"]: f for f in SZ["schluesselfaelle"]}
ersetze(F["S4"], "kern", "fordert die 2. Kp unter Beschuss sofortiges Feuer, und solange der Mörser steht, steigen beim 3. Zug die Verwundeten",
        "fordert der 1. Zug unter Beschuss sofortiges Feuer, und solange der Mörser steht, schießt er sich auf 1/4 ein und trifft")
F["S4"]["leitfragen"] = [q.replace("Ihr habt gewartet und der 3. Zug hatte Verwundete. Hättet ihr auch gewartet, wenn er Gefallene gemeldet hätte?",
                                   "Ihr habt gewartet, und 1/4 wurde getroffen. Hättet ihr auch gewartet, wenn die Besatzung Gefallene gemeldet hätte?")
                         for q in F["S4"]["leitfragen"]]
ersetze(F["S5"], "info_bei", "(Verluste des 2. Zuges)", "(Treffer an 1/1)")
ersetze(F["S5"], "kern", "Der SPz schießt laufend auf den 2. Zug, die Verluste steigen.",
        "Der SPz schießt laufend auf 1/1 – erst daneben, dann trifft er.")
F["S5"]["leitfragen"] = [q.replace("während der 2. Zug Verwundete meldet", "während 1/1 Treffer meldet") for q in F["S5"]["leitfragen"]]
ersetze(F["S7"], "info_bei", "(Verluste des 2. Zuges)", "(Treffer an 1/2)")
ersetze(F["S7"], "kern", "auf den 2. Zug", "auf 1/2")
ersetze(F["S7"], "gut", "Verluste beim 2. Zug", "Treffer an 1/2")
NF = {f["id"]: f for f in SZ["nebenfaelle"]}
ersetze(NF["N2"], "kurz", "Die eigene PzAbw hat den Panzer kurz vorher getroffen.", "Der 1. Zug hat den Panzer kurz vorher getroffen.")
for a in SZ.get("anforderungen_technik", []):
    a["text"] = (a["text"].replace("Leuchtspur der eigenen PzAbw vom Westrand", "Leuchtspur der Kanone vom schießenden Panzer")
                 .replace("eigene PzAbw", "Kanone des 1. Zuges").replace("PzAbw", "Kanone")
                 .replace("(Panzerabwehr nur, wenn", "(Kanone des 1. Zuges nur, wenn"))
for g in SZ["durchbruch"]["gruppen"]:
    if "zweck" in g:
        g["zweck"] = g["zweck"].replace("die 2. Kp zerschlägt", "der 1. Zug zerschlägt")

# =============================================================================== Durchbruch-Routen: zwischen 1/1 und 1/3 hindurch (≥ 25 m Abstand)
LUECKE_Y = 441          # Mitte zwischen 1/1 (y 412) und 1/3 (y 470): je 29 m


GELAENDE_MPS = 5.5      # 19,8 km/h: neben der Straße höchstens Spielwert Gelände (8–20 km/h)


def durch_luecke(r):
    """Westlich von x 150 fährt ein Fahrzeug auf der Linie y = LUECKE_Y aus dem Bild, neben der Straße mit höchstens 18 km/h."""
    out = []
    for p in r:
        q = [p[0], p[1], LUECKE_Y] if p[1] < 150 else list(p)
        if out and p[1] < 150:
            d = L.dist(out[-1][1:], q[1:])
            q[0] = max(q[0], round(out[-1][0] + d / GELAENDE_MPS + 0.05, 1))
        out.append(q)
    return out


for g in SZ["durchbruch"]["gruppen"]:
    g["routen"] = {zid: durch_luecke(r) for zid, r in g["routen"].items()}
# der Traktor der Landwirtsfamilie (N1) kommt vom Westrand: ebenso zwischen 1/1 und 1/3 hindurch
Z["Z-22"]["bewegung"]["route"] = durch_luecke(Z["Z-22"]["bewegung"]["route"])
for g in SZ["verstaerkungen"]["gruppen"]:
    if g.get("durchbruch"):
        g["durchbruch"]["routen"] = {zid: durch_luecke(r) for zid, r in g["durchbruch"]["routen"].items()}

# =============================================================================== Verlustmodell (Szenario-Teil) und Druckmeldungen je Panzer
vs = SZ["verluste"]
SZ["verluste"] = {
    "hinweis": ("Seit 2.5 (F2): Was das Verlustmodell (regeln.json, Abschnitt verluste) in diesem Szenario braucht. Die Attrappe verrät beim Treffer "
                "die Stellung von 1/2 (Feindartillerie, Einschläge relativ zum Panzer [dt_s, dx, dy] ab Einschlag + verzoegerung_s, die ersten "
                "daneben). Ein Durchbruch über die Brücke trifft 1/3 und 1/1 im Wechsel, über die Furt 1/2 (je Fahrzeug regeln.verluste.durchbruch). "
                "orte benennt die Herkunft des Feuers in den Meldungen. meldungen: Druckmeldungen des Zuges je Panzer an die Führung (Vorlagen "
                "je Anlass, Platzhalter {pz} {waffe} {ort} {schaden} {schaden_e} {zustand} {verw} {bereit} {gesamt} {forderung} {zug}; schaden "
                "je Art der Reihe nach). Keine Darstellung getöteter Menschen: Zustand, Ausfälle und Verwundete."),
    "attrappe": {"ziel": vs["attrappe"]["ziel"], "panzer": "pz2", "verzoegerung_s": vs["attrappe"]["verzoegerung_s"],
                 "einschlaege": ATTRAPPE_EINSCHLAEGE},
    "durchbruch": {"Brücke ELSTER": ["pz3", "pz1"], "Furt Nord": ["pz2"]},
    "orte": vs["orte"],
    "meldungen": {
        "von": "1. Zug",
        "kennung": "K-",
        "texte": {
            "beschuss": "{pz} unter {waffe}{ort}, Einschläge noch daneben. {forderung}",
            "treffer": "{pz} unter {waffe}{ort}, {schaden}. {forderung}",
            "sofort": "{pz} unter {waffe}, {schaden}. {forderung}",
            "eingeschraenkt": "{pz} unter {waffe}{ort}, {schaden_e}: eingeschränkt, {verw}. {forderung}",
            "erneut": "{pz} erneut getroffen, nur noch {zustand} %, {verw}. {forderung}",
            "ausgefallen": "DRINGEND: {pz} ausgefallen, {verw}, Bergung unter Feuer. Zug {bereit}/{gesamt} einsatzbereit. {forderung}",
            "limit": "DRINGEND: {pz} ausgefallen, {verw}. Zug nur noch {bereit}/{gesamt}, hält mit Mühe. Brauchen sofort Feuer!",
        },
        "waffe": {"direkt": "Panzerfeuer", "steil": "Mörserfeuer", "beobachter": "gelenktem Artilleriefeuer", "artillerie": "Artilleriefeuer",
                  "attrappe": "Artilleriefeuer", "durchbruch": "Feuer eingebrochener Panzer"},
        "forderung": {"direkt": "Panzer bekämpfen!", "steil": "Mörser bekämpfen!", "beobachter": "Beobachter bekämpfen!",
                      "artillerie": "Halten Stellung.", "attrappe": "Stellung offenbar aufgeklärt!", "durchbruch": "Binden mit der Kanone."},
        "schaden": {"direkt": ["Treffer am Turm, Panzerung hält", "Treffer an der Wanne, Panzerung hält"],
                    "steil": ["Splitter an Optik und Antennen"], "beobachter": ["Splitter an Optik und Antennen"],
                    "artillerie": ["Splitter an Optik und Antennen"], "attrappe": ["Splitter an Optik und Antennen"],
                    "durchbruch": ["Treffer aus nächster Nähe"]},
    },
    "auswertung": {
        "titel": vs["auswertung"]["titel"],
        "leitfragen": {"weniger": "Ihr hattet weniger Treffer am eigenen Zug – um welchen Preis?",
                       "mehr": "Ihr habt gewartet, und eure Panzer wurden getroffen – war das richtig?"},
        "offenlegung": ("Der Druck war gebaut: Treffer am eigenen Zug, Zeit und Forderungen der Panzer sollten euch zu schnellen Freigaben "
                        "verleiten. Wer bei S4, S5, N4 oder S3 wartete, sah eigene Panzer getroffen werden – und lag trotzdem richtig."),
        "bezuege": vs["auswertung"]["bezuege"],
    },
}

# =============================================================================== Prüfung: keine alten Bezeichnungen in sichtbaren Texten
VERBOTEN = re.compile(r"2\. ?Kp\b|PzGrenBtl|Schule mit Sportplatz|2\. Kompanie|Panzergrenadier")


def texte(o, pfad=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from texte(v, f"{pfad}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from texte(v, f"{pfad}[{i}]")
    elif isinstance(o, str):
        yield pfad, o


for name, obj in (("szenario", SZ), ("regeln", REG), ("wirkmittel", WMK), ("fahrzeuge", FZK), ("karte", KARTE)):
    for p, s in texte(obj, name):
        assert not VERBOTEN.search(s), f"alte Bezeichnung in {p}: {s[:160]}"

# =============================================================================== Speichern
os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(FZK, os.path.join(ZIEL, "katalog_fahrzeuge.json"))
L.speichere(WMK, os.path.join(ZIEL, "katalog_wirkmittel.json"))
L.speichere(KARTE, os.path.join(ZIEL, "karte_kraehe.json"))
print(f"Szenario {SZ['version']}: {len(SZ['ziele'])} Ziele, {len(SZ['meldungen'])} Meldungen, {len(SZ['injects'])} Lagemeldungen, "
      f"{len(SZ['eigene_truppe']['panzer'])} eigene Panzer → {ZIEL}")
