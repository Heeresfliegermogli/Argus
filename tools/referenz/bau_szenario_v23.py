#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.3 aus v2.2: Änderungen D1–D5 vom 01.11.2026 (mehr Druck durch eigene Verluste, kürzere Lagemeldungen).

  D1  Die 2. Kp steht sichtbar am Westrand (eigene_truppe): drei Züge in Stellungen westlich des Bachs (1. Zug Brücke West,
      2. Zug Furt Nord West, 3. Zug Süd) und der Gefechtsstand des Kompaniechefs dahinter. Die Attrappe (S1) steht weiter
      „westlich des Bachs, scheinbar durchgebrochen“ vor dem 2. Zug. Die eigene Panzerabwehr (H-02, H-05–H-11) schießt aus
      den Stellungen (von: zug1/zug2), die Feindartillerie (H-01, H-04, H-12) liegt auf den Stellungen.
  D2  Verlustmodell (Abschnitt `verluste` hier und in regeln.json): Mörser schießen auf einen festen Zug (feuert[].auf),
      Kampf- und Schützenpanzer im Halt auf den nächsten Zug, Feindartillerie auf den Zug am Einschlag. Wirkung auf die
      Attrappe verrät die Stellung des 2. Zuges, Durchbruch über Brücke/Furt trifft den 1./2. Zug.
  D3  Druckmeldungen der Kompanie (verluste.meldungen); I-07 (S4), I-06 (S3) und I-13 nennen die Verluste dieses Teams
      (Platzhalter, verluste_zug).
  D4  Alle Lagemeldungen (Injects, Reserve, bedingte) ≤ 140 Zeichen mit Absender, Funkstil Absender – Lage – Forderung.
  D5  Texte für die Auswertung „Preis des Abwartens“ und die Offenlegung des Drucks (verluste.auswertung).

Einmalig benutzt wie bau_szenario_v22.py; maßgeblich ist danach die JSON-Datei.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v23.py public/daten OUT_ORDNER
"""
import copy
import json
import os
import sys

import argus_lib as L

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)
QUELLE, ZIEL = sys.argv[1], sys.argv[2]
D = L.lade_alles(ordner=QUELLE)
ALT = D["szenario"]
assert ALT["version"] == "2.2", "Basis muss Szenario 2.2 sein"
SZ = copy.deepcopy(ALT)
REG = copy.deepcopy(D["regeln"])
with open(os.path.join(QUELLE, ALT["kataloge"]["fahrzeuge"]), encoding="utf-8") as f:
    FZK = json.load(f)
Z = {z["id"]: z for z in SZ["ziele"]}

SZ["version"] = "2.3"
SZ["stand"] = "2026-11-01"

# =============================================================================== D1: eigene Truppe auf der Karte
ZUEGE = [
    {"id": "zug1", "name": "1. Zug", "kurz": "1./2", "ort": "Brücke West", "fahrzeuge": [[275, 458], [300, 464], [325, 470]], "hdg": -28,
     "streifen": [320, 470]},
    {"id": "zug2", "name": "2. Zug", "kurz": "2./2", "ort": "Furt Nord West", "fahrzeuge": [[110, 370], [135, 363], [160, 356]], "hdg": -16,
     "streifen": [-100, 320]},
    {"id": "zug3", "name": "3. Zug", "kurz": "3./2", "ort": "Süd", "fahrzeuge": [[292, 556], [311, 571], [330, 586]], "hdg": -8,
     "streifen": [470, 800]},
]
MITTE = {z["id"]: (sum(p[0] for p in z["fahrzeuge"]) / 3, sum(p[1] for p in z["fahrzeuge"]) / 3) for z in ZUEGE}
SZ["eigene_truppe"] = {
    "hinweis": "Seit 2.3 (D1): Die 2. Kompanie steht sichtbar am Westrand. Drei Züge in Stellungen westlich des Bachs, der Gefechtsstand "
               "des Kompaniechefs dahinter. Alle Rollen sehen die Züge und ihren Zustand (Kampfkraft, Verwundete; Verlustmodell in "
               "`verluste` und regeln.json). Fahrzeugpositionen in Metern; hdg = Blickrichtung (0 = Osten).",
    "kompanie": "K-2",
    "name": "2. Kp",
    "fahrzeug": "spz_eigen",
    "gefechtsstand": {"name": "Gefechtsstand Kompaniechef", "pos": [62, 484]},
    "zuege": ZUEGE,
}
k2 = SZ["kraefte"][0]
assert k2["id"] == "K-2"
k2.pop("ausserhalb", None)
k2.pop("pfeil_y", None)
k2["pos"] = [62, 484]
k2["text"] = "am Westrand: 1. Zug Brücke West, 2. Zug Furt Nord West, 3. Zug Süd, Gefechtsstand dahinter"

# Mörser schießen auf einen festen Zug (D2.2); Z-18 (BMP-2 mit Feuerstößen) auf den Zug im Gefechtsstreifen
for zid, zug in (("Z-06", "zug2"), ("Z-19", "zug3")):
    for f in Z[zid]["feuert"]:
        f["auf"] = zug
for g in SZ["verstaerkungen"]["gruppen"]:
    for z in g["ziele"]:
        for f in z.get("feuert") or []:
            if z["typ"] == "moerser_trupp":
                f["auf"] = "zug2"
# Schaden je Schuss abweichend vom Typ (Kalibrierung D2.6): Der Mörser im Hof RABE liegt nah und gut beobachtet auf dem 3. Zug
# (S4: der Preis des Abwartens), der BMP-2 an der Schule (N4) schießt aus der Deckung des Schulgebäudes; die Mörser am Waldrand
# MARDER schießen auf große Entfernung.
VERLUST_PROMILLE = {"Z-19": 10, "Z-36": 8, "Z-06": 2}
for zid, p in VERLUST_PROMILLE.items():
    Z[zid]["verlust_promille"] = p
# Mörser im Hof RABE: erst Einschießen (langsam), ab 20:50 Wirkungsfeuer – wer die drei Minuten wartet, zahlt dafür
assert Z["Z-19"]["feuert"] == [{"von_s": 1066, "bis_s": 1500, "takt_s": 5, "salve": 3, "pause_s": 24, "auf": "zug3"}], Z["Z-19"]["feuert"]
# Feuerstöße so gelegt, dass zu den Meldezeiten von M18 (18:15) und M23 (22:00) weder Mündungsblitz noch Abschussrauch im
# Live-Drohnenbild stehen (wie das Standbild): Stöße 16:46–16:56, 17:31 … 20:31–20:41, dann 21:06, 21:36–21:48, 22:06 …
Z["Z-19"]["feuert"] = [{"von_s": 1006, "bis_s": 1266, "takt_s": 5, "salve": 3, "pause_s": 30, "auf": "zug3"},
                       {"von_s": 1266, "bis_s": 1500, "takt_s": 4, "salve": 4, "pause_s": 18, "auf": "zug3"}]
# Verstärkungen sind Routineziele für mehr Arbeit, nicht für mehr Verluste: geringer Schaden je Schuss
for g in SZ["verstaerkungen"]["gruppen"]:
    for z in g["ziele"]:
        p = {"moerser_trupp": 3, "kpz_t72": 2, "spz_bmp2": 1}.get(z["typ"])
        if p:
            z["verlust_promille"] = p

# Hintergrundgefecht: Feindartillerie auf die Stellungen, eigene PzAbw aus den Stellungen (D1.2)
VERSATZ = [(-14, 9), (12, -10), (-4, -16), (18, 12), (-20, -6), (6, 18), (24, -4), (-10, 22), (2, -26), (-26, 14), (16, 24)]


def einschlaege(t0, abstaende, zuege):
    out = []
    t = t0
    for i, (dt, zug) in enumerate(zip(abstaende, zuege)):
        t += dt
        mx, my = MITTE[zug]
        dx, dy = VERSATZ[i % len(VERSATZ)]
        out.append([t, round(mx + dx), round(my + dy)])
    return out


H = {h["id"]: h for h in SZ["hintergrund"]["ereignisse"]}
H["H-01"]["einschlaege"] = einschlaege(300, [0, 4, 5, 4, 5, 6, 6], ["zug2", "zug2", "zug1", "zug2", "zug1", "zug2", "zug1"])
H["H-01"]["text"] = "Feuervorbereitung der Gefechtsaufklärung: Feindartillerie liegt auf dem 1. und 2. Zug der 2. Kp."
H["H-04"]["einschlaege"] = einschlaege(815, [0, 4, 4, 5, 4, 5, 5, 5, 5, 6, 6],
                                        ["zug1", "zug2", "zug3", "zug1", "zug2", "zug1", "zug3", "zug2", "zug1", "zug3", "zug1"])
H["H-04"]["text"] = "Feuervorbereitung des Hauptangriffs auf alle drei Züge der 2. Kp."
H["H-12"]["einschlaege"] = einschlaege(1190, [0, 8, 9, 9, 10], ["zug1", "zug1", "zug3", "zug1", "zug1"])
H["H-12"]["text"] = "Feindartillerie auf den 1. Zug an der Brücke: Der Feind will die Brücke noch nehmen."
for hid, zug, txt in (
        ("H-02", "zug1", "1. Zug trifft einen SPz BMP-2 an der Brücke ELSTER Ost (Leuchtspur aus der Stellung). Das Wrack brennt, die Besatzung ist verwundet."),
        ("H-05", "zug2", "2. Zug trifft einen KPz T-72 am Ostufer vor der Furt Nord."),
        ("H-06", "zug2", "2. Zug trifft einen zweiten KPz T-72 am Ostufer."),
        ("H-07", "zug2", "2. Zug trifft den Führungspanzer der Achse NORD am Ostufer nördlich der Furt. Der Panzerzug ist zerschlagen."),
        ("H-08", "zug2", "2. Zug trifft einen SPz BMP-2 in der Furt Nord (Wrack im Bach)."),
        ("H-09", "zug2", "2. Zug trifft einen SPz BMP-2 am Ostufer, der seine Schützen absetzt."),
        ("H-10", "zug2", "2. Zug trifft den letzten SPz BMP-2 der Achse NORD. Der Angriff über die Furt ist abgeschlagen."),
        ("H-11", "zug1", "1. Zug trifft einen KPz T-72 nördlich der Brücke: Kette abgesprungen, kein Brand. Die Besatzung steigt um 10:20:30 aus und ergibt sich.")):
    H[hid]["von"] = zug
    H[hid]["text"] = txt
SZ["hintergrund"]["hinweis"] = (
    "Die eigene 2. Kompanie und die Feindartillerie wirken nach Drehbuch, unabhängig von den Teams. Wirkungen der eigenen Panzerabwehr "
    "kommen aus den Stellungen der Züge (von) und treffen nur, wenn das Ziel dann noch steht (sonst entfallen sie), und nur Ziele bis "
    "zum Bach (x < 500 m). Seit 2.3 liegt die Feindartillerie auf den Stellungen und verursacht eigene Verluste (Verlustmodell); "
    "Spielobjekte trifft sie nicht. Rauch ist Darstellung. Alles steht als Ereignis im Protokoll.")

# =============================================================================== D2/D3/D5: Verlustmodell (szenariobezogen)
SZ["verluste"] = {
    "hinweis": "Seit 2.3 (D2, D3, D5): Was das Verlustmodell (regeln.json, Abschnitt verluste) in diesem Szenario braucht. Die "
               "Attrappe verrät beim Treffer die Stellung des 2. Zuges (zusätzliche Feindartillerie, Einschläge relativ zur Zugmitte "
               "[dt_s, dx, dy] ab Einschlag + verzoegerung_s). Durchbruch über die Brücke trifft den 1. Zug, über die Furt den 2. Zug. "
               "orte benennt die Herkunft des Feuers in den Meldungen. meldungen: Druckmeldungen der Kompanie an die Führung, je "
               "Stufe (0 neue Verwundete, 1 unter 75 %, 2 unter 55 %, 3 Untergrenze, sofort: erster Treffer einer Art aus regeln.verluste.meldungen.sofort); Platzhalter {zug} {kk} {verw} {neu} {waffe} "
               "{ort} {forderung}. Keine Darstellung getöteter Menschen: nur Kampfkraft und Verwundete.",
    "attrappe": {"ziel": "Z-07", "zug": "zug2", "verzoegerung_s": 40,
                 "einschlaege": [[0, -14, 9], [4, 12, -8], [8, -3, -14], [12, 16, 11], [17, -18, -4], [22, 5, 16]]},
    "durchbruch": {"Brücke ELSTER": "zug1", "Furt Nord": "zug2"},
    "orte": [
        {"text": "aus Hof RABE", "pos": [765, 300], "radius_m": 90},
        {"text": "vom Waldrand MARDER", "pos": [905, 100], "radius_m": 130},
        {"text": "von der Brücke Ost", "pos": [505, 395], "radius_m": 110},
        {"text": "vom Ostufer an der Furt", "pos": [455, 270], "radius_m": 120},
        {"text": "aus der Ortschaft", "pos": [665, 360], "radius_m": 150},
        {"text": "von der Schule", "pos": [650, 515], "radius_m": 120},
        {"text": "vom Waldrand DACHS", "pos": [820, 540], "radius_m": 130},
        {"text": "von den Feldern Nord", "pos": [790, 190], "radius_m": 170},
    ],
    "meldungen": {
        "von": "2. Kp",
        "kennung": "K-",
        "texte": {
            "0": "{zug} unter {waffe}{ort}, {neu}. {forderung}",
            "1": "{zug} nur noch {kk} %, {verw}. {waffe}{ort} hält an. {forderung}",
            "2": "DRINGEND: {zug} {kk} %, {verw}. Bergung unter Feuer kaum möglich. {forderung}",
            "3": "{zug} am Limit ({kk} %), hält nur noch mit Mühe. Brauchen sofort Feuer!",
            "sofort": "{zug} unter {waffe}{ort}, {verw}. {forderung}",
        },
        "waffe": {"steil": "Mörserfeuer", "direkt": "Panzerfeuer", "artillerie": "Artilleriefeuer", "attrappe": "Artilleriefeuer",
                  "durchbruch": "Feuer eingebrochener Kampffahrzeuge"},
        "forderung": {"steil": "Mörser bekämpfen!", "direkt": "Panzer bekämpfen!", "artillerie": "Halten Stellung.",
                      "attrappe": "Stellung offenbar aufgeklärt!", "durchbruch": "Binden mit Panzerabwehr."},
    },
    "auswertung": {
        "titel": "Preis des Abwartens",
        "leitfragen": {
            "weniger": "Ihr hattet weniger eigene Verluste – um welchen Preis?",
            "mehr": "Ihr habt gewartet und Verwundete gehabt – war das richtig?",
        },
        "offenlegung": "Der Druck war gebaut: Verlustmeldungen, Zeit und Forderungen der Kompanie sollten euch zu schnellen Freigaben "
                       "verleiten. Wer bei S4, N4 oder S3 wartete, sah eigene Verluste steigen – und lag trotzdem richtig.",
        "bezuege": [
            "Militärische Notwendigkeit gegen Verhältnismäßigkeit: Art. 51 Abs. 5 lit. b ZP I",
            "Vorsichtsmaßnahmen beim Angriff: Art. 57 ZP I",
            "Fürsorge für die eigenen Soldaten – und ihre Grenze im Recht",
            "Innere Führung: Gewissen und Verantwortung unter Druck",
        ],
    },
}

# =============================================================================== D4: Lagemeldungen kürzen (≤ 140 Zeichen mit Absender)
I = {i["id"]: i for i in SZ["injects"]}
NEU = {
    "I-01": ("Brigade", "Brücke ELSTER halten. Feind will mit der Masse über KRÄHE nach Westen durchstoßen. ARGUS für Ihren Abschnitt frei."),
    "I-02": ("Brigade (ZMZ)", "Evakuierung KRÄHE unvollständig: In der Schule ca. 40 Zivilpersonen, darunter Kinder. Einzelne Bewohner noch auf den Höfen."),
    "I-03": ("Brigade", "Zielbearbeitung dauert im Schnitt über 3 min, Ziel sind 90 s je Ziel. Sonst nimmt der Feind die Brücke."),
    "I-11": ("2. Kp", "Feind greift mit verstärktem Zug Richtung Brücke an, ein SPz brennt an der Brücke Ost. Feind nebelt ein, zieht sich zurück."),
    "I-05": ("Brigade", "Fast-Track genehmigt: Meldungen ab 90 % gehen ohne Aufklärung direkt an die Zielprüfung. Sie entscheiden, ob Sie einschalten."),
    "I-12": ("2. Kp", "Starkes Artilleriefeuer auf unsere Stellungen. Feind greift mit einer Kp an: Richtung Furt, durch KRÄHE und an der Schule vorbei."),
    "I-04": ("Brigade", "PL-PzKp (PT-91) greift ab 10:19 entlang Feldweg Süd nach Norden an. Auftrag: Feind Brücke Ost zerschlagen."),
    "I-07": ("2. Kp", "{zug} unter Mörserfeuer aus Hof RABE, {verw}. Fordere sofortige Bekämpfung des Mörsers!"),
    "I-06": ("2. Kp", "Feind sammelt KPz und SPz an der Brücke Ost, Angriff über den Bach steht bevor. {zug} {kk} %. Sofort Feuer auf Brücke Ost!"),
    "I-10": ("Brigade", "Abschlussmeldung bis 10:25: bekämpfte Ziele, eigene Verluste, Besonderheiten."),
    "I-08a": ("PL-PzKp", "Eigenbeschuss! Ein Panzer ausgefallen, Besatzung verwundet. Gegenangriff eingestellt. Feuer sofort einstellen!"),
    "I-08b": ("PL-PzKp", "Gegenangriff erfolgreich: Brücke Ost genommen, letzte Feindkräfte dort zerschlagen. Feind weicht nach Osten aus."),
    "I-09": ("Brigade", "Meldung aus KRÄHE: Am Hof RABE vier Zivilpersonen schwer verletzt, darunter zwei Kinder."),
    "I-13": ("2. Kp", "Feind über den Bach ELSTER eingebrochen! Kp {kp_kk} %, {kp_verw}. Wir binden ihn mit Panzerabwehr."),
}
for iid, (von, text) in NEU.items():
    I[iid]["von"] = von
    I[iid]["text"] = text
I["I-07"]["verluste_zug"] = "zug3"
I["I-06"]["verluste_zug"] = "zug1"
I["I-07"]["zweck"] = ("Gleichzeitig mit der Mörsermeldung im Hof RABE: menschlicher Druck gegen die berechtigte Warnung von ARGUS. Seit 2.3 "
                      "nennt sie die tatsächlichen Verwundeten des 3. Zuges (Mörser Z-19 schießt auf ihn); solange der Mörser steht, folgen "
                      "Druckmeldungen der Kompanie (K-…).")
I["I-06"]["zweck"] = (I["I-06"]["zweck"] + " Seit 2.3 nennt sie die Kampfkraft des 1. Zuges, der unter dem Feuer von der Brücke Ost liegt.")
I["I-13"]["zweck"] = (I["I-13"]["zweck"] + " Seit 2.3 mit Kampfkraft und Verwundeten der Kompanie; der Übergang trifft den Zug an Brücke bzw. Furt.")
R = {r["id"]: r for r in SZ["reserve_injects"]}
for rid, (von, text) in {
        "R-01": ("ARGUS-System", "Datenlink gestört. Bildalter bis 15 s, Bildqualität eingeschränkt."),
        "R-02": ("Brigade", "Warum haben Sie das letzte Ziel nicht bekämpft? Begründen Sie das."),
        "R-03": ("Brigade (Presse)", "Video in sozialen Medien: brennendes Fahrzeug mit Rotem Kreuz vor einer Schule in KRÄHE."),
        "R-04": ("Brigade (ZMZ)", "Einschlag auf dem Schulgelände KRÄHE: Fenster zersplittert, mehrere Kinder durch Splitter verletzt."),
}.items():
    R[rid]["von"] = von
    R[rid]["text"] = text

# =============================================================================== Texte, die die Kompanie außerhalb der Karte nannten
SZ["lage"]["plenum"]["absaetze"][0] = (
    "Übungslage, alles fiktiv. Russische Kräfte greifen seit den Morgenstunden nach Westen an. Unser Panzergrenadierbataillon "
    "verteidigt westlich des Raums KRÄHE; die 2. Kompanie liegt mit drei Zügen am Westrand der Karte an Brücke und Furt.")
SZ["lage"]["G2"]["absaetze"][0] = SZ["lage"]["G2"]["absaetze"][0].replace(
    "Die eigene 2. Kompanie liegt westlich außerhalb der Karte.", "Die eigene 2. Kompanie liegt mit drei Zügen am Westrand der Karte (blau).")
SZ["lage"]["G3"]["absaetze"][1] = SZ["lage"]["G3"]["absaetze"][1].replace(
    "Nur du bekommst Lagemeldungen von Brigade, Nachbarn und der 2. Kompanie.",
    "Nur du bekommst Lagemeldungen von Brigade, Nachbarn und der 2. Kompanie; sie meldet auch ihre Verluste.")
S4 = next(f for f in SZ["schluesselfaelle"] if f["id"] == "S4")
S4["kern"] = S4["kern"].replace(
    "Gleichzeitig fordert die 2. Kp unter Beschuss sofortiges Feuer.",
    "Gleichzeitig fordert die 2. Kp unter Beschuss sofortiges Feuer, und solange der Mörser steht, steigen beim 3. Zug die Verwundeten.")
S4["leitfragen"][2] = "Ihr habt gewartet und der 3. Zug hatte Verwundete. Hättet ihr auch gewartet, wenn er Gefallene gemeldet hätte?"

# =============================================================================== Regeln (D2): Verlustwerte
REG["version"] = "2.3"
REG["eigene_kraefte"] = ("Seit 2.3 steht die 2. Kompanie mit drei Zügen am Westrand der Karte (szenario.eigene_truppe). Ein Sicherheitsabstand "
                         "wird nicht geprüft; Wirkungen liegen alle östlich des Bachs.")
REG["verluste"] = {
    "hinweis": "Verlustmodell der eigenen Kompanie (seit 2.3, D2). Ganzzahlig in Promille Kampfkraft je Zug. Ein Schuss zählt, wenn der "
               "Schütze dann noch steht (im Raum, nicht zerstört, Feind und legitim); der Schaden kommt verzug_s später an der Stellung an. "
               "waffen je Fahrzeugtyp: art steil (Mörser, nur nach feuert, Zug aus feuert[].auf) oder direkt (im Halt seit feuerbereit_s, "
               "alle takt_s auf den nächsten Zug in reichweite_m; Fahrzeuge mit feuert nur nach feuert). Feindartillerie je Einschlag auf "
               "den nächsten Zug in radius_m. Attrappe und Durchbruch siehe szenario.verluste. Untergrenze je Zug (die Kompanie hält "
               "immer), Verwundete = Verlust / promille_je_verwundeter. Meldungen: Regeln der Druckmeldungen (D3).",
    "untergrenze_prozent": 40,
    "promille_je_verwundeter": 30,
    "schwellen_prozent": [75, 55],
    "verzug_s": {"direkt": 4, "steil": 20},
    "waffen": {
        "kpz_t72": {"art": "direkt", "promille": 3, "takt_s": 20, "feuerbereit_s": 10, "reichweite_m": 800},
        "spz_bmp2": {"art": "direkt", "promille": 2, "takt_s": 15, "feuerbereit_s": 10, "reichweite_m": 800},
        "spw_btr80": {"art": "direkt", "promille": 2, "takt_s": 15, "feuerbereit_s": 10, "reichweite_m": 600},
        "moerser_trupp": {"art": "steil", "promille": 6, "reichweite_m": 3000},
    },
    "feindartillerie": {"promille": 3, "radius_m": 70},
    "attrappe": {"promille": 6},
    "durchbruch": {"promille": 25},
    "versatz_m": [[0, 0], [8, -6], [-7, 5], [5, 9], [-9, -7], [11, 3], [-4, 11], [3, -10]],
    "meldungen": {"je_verwundete": 2, "abstand_zug_s": 60, "abstand_alle_s": 25, "abstand_limit_s": 120, "fenster_s": 60,
                  "sofort": ["attrappe"]},
}

# =============================================================================== Fahrzeugkatalog: eigener Schützenpanzer
FZK["version"] = "1.4"
if not any(f["id"] == "spz_eigen" for f in FZK["fahrzeuge"]):
    i = next(k for k, f in enumerate(FZK["fahrzeuge"]) if f["id"] == "pzgren_kp")
    FZK["fahrzeuge"].insert(i, {
        "id": "spz_eigen", "name": "Schützenpanzer (eigen)", "argus_klasse": None, "gepanzert": True, "groesse_m": [7.4, 3.6],
        "symbol": {"art": "panzergrenadiere", "sidc": "UCIZ", "einheit": "UCIZ"}, "generator": "spz_eigen",
        "sprite": "spz_eigen.png", "sprite_wrack": "spz_eigen_wrack.png", "farbe": "dreifarbig gefleckt (fiktiv)",
        "hinweis": "Seit 1.4 (Szenario 2.3, D1): Fahrzeuge der eigenen Züge in Stellung (fiktiv gestaltet). Kein Ziel, nie gemeldet."})

os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(FZK, os.path.join(ZIEL, ALT["kataloge"]["fahrzeuge"]))
print("Szenario 2.3 →", ZIEL)
