#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.4 aus v2.3: Änderungen E vom 01.11.2026, Teil E-a (Daten, Regeln, Engine-Grundlagen).

Quelle: claude/Aenderungen_Ethik_01-11.md („drastisch mehr Fokus auf ethisch Verwerfbares, weniger Information, mehr Druck“).

  E1   Verstärkungen der Spielleitung vorerst aus: Schalter regeln.spielleitung.verstaerkung_menue = false (Code bleibt).
  E2   Mehr Druck: Hauptangriff und Krise mit mehr Fahrzeugen (+11, davon 4 in bestehenden Zugmeldungen), Hochphase mit mehr
       Sonderfällen als Routine; Verlustmodell neu kalibriert (Werte in regeln.json `verluste`, Kalibrierung im Drehbuch).
       Schutzschild-SPz (S5) und Kirchturm-Beobachter (S7) verursachen laufend Verluste, solange sie stehen.
  E3   BEKÄMPFEN wirkt auf den ganzen Zug: katalog_wirkmittel `zug` (LM und PzAbw je Fahrzeug, Mörser Fläche), Regeltext in
       regeln.json `wirkung.zug`, LM-Bestand neu bemessen.
  E4   EloKa wirkt global: szenario.eloka – solange der Störsender im Raum steht und nicht zerstört ist, sind alle Drohnenbilder
       gestört und ARGUS ist unsicherer (Konfidenz − konfidenz_minus, darunter „unbekannt“). Bewusst zwischen S1 und S2 gelegt,
       damit kein Schlüsselfall überdeckt wird (E4.2).
  E5   Vier neue Sonderfälle S5–S8: Menschliche Schutzschilde, Verwundete am Wrack, Kirchturm-Beobachter, Presse und Familie an
       der Kolonne – je mit Ground Truth, ARGUS-Ausgabe, Lösung, Bezug, Leitfragen und Bildmerkmalen; zuschaltbar im Replay.
  E6.2 Klassen Panzer / Fahrzeug / Infanterie (Katalog `argus_klasse`, `klassen`; Meldungen `argus.klasse`, neu
       `argus.zugehoerigkeit`).
  E6.3 Sensordaten entfallen für die Spieler: `sensor` bleibt nur für Spielleitung und Drehbuch; was dort stand, steht jetzt im
       Bild (`bild.merkmale`, geprüft mit tools/drohne_probe.py).

Einmalig benutzt wie bau_szenario_v23.py; maßgeblich ist danach die JSON-Datei.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v24.py BASIS_2.3_ORDNER OUT_ORDNER
"""
import copy
import json
import os
import sys

import argus_lib as L
from routen import Fahrt

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)
QUELLE, ZIEL = sys.argv[1], sys.argv[2]
D = L.lade_alles(ordner=QUELLE)
ALT = D["szenario"]
assert ALT["version"] == "2.3", "Basis muss Szenario 2.3 sein"


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
SZ["version"] = "2.4"
SZ["stand"] = "2026-11-01"

# =============================================================================== E6.2: Klassen Panzer / Fahrzeug / Infanterie
KLASSE = {
    "kpz_t72": "Panzer", "kpz_pt91": "Panzer", "spz_bmp2": "Panzer", "spw_btr80": "Panzer", "san_rad": "Panzer",
    "spaehpz_brdm2": "Panzer", "attrappe_kpz": "Panzer", "gfz_tigr": "Fahrzeug", "lkw_ural": "Fahrzeug", "eloka_lkw": "Fahrzeug",
    "traktor": "Fahrzeug", "moerser_trupp": "Infanterie",
}
FZK["version"] = "1.5"
FZK["hinweis"] += (" Seit 1.5 (Szenario 2.4, E6.2): ARGUS kennt nur drei Klassen (`klassen`): Panzer (gepanzert), Fahrzeug (ungepanzert, "
                   "auch zivil) und Infanterie (Personen, Mörsertrupps, Beobachter); `argus_klasse` ist die Klasse, die ARGUS für den Typ "
                   "meldet. `klassen[k].sidc` ist das taktische Zeichen dieser Klasse auf den Karten der Spieler, `einheit` das Zeichen "
                   "einer zugweisen Meldung. `feuer_effekt: keiner` – das Ziel feuert nicht selbst (Beobachter lenkt Artillerie). "
                   "`personen_im_fahrzeug` (Szenario) zählen für die Trefferregel, im Bild sitzen sie im Fahrzeug.")
for f in FZK["fahrzeuge"]:
    if f["id"] in KLASSE:
        f["argus_klasse"] = KLASSE[f["id"]]
FZK["klassen"] = {
    "Panzer": {"text": "gepanzerte Fahrzeuge: Kampf-, Schützen- und Spähpanzer, Radpanzer", "sidc": "EVAT", "einheit": "UCA"},
    "Fahrzeug": {"text": "ungepanzerte Fahrzeuge: Lkw, Geländewagen, Sonderfahrzeuge, zivile Fahrzeuge", "sidc": "EVU"},
    "Infanterie": {"text": "Personen: Soldaten, Mörsertrupps, Beobachter", "sidc": "UCI", "einheit": "UCI"},
}
NEU_FZ = [
    {"id": "pkw_zivil", "name": "Pkw (zivil), Familie, Gepäck auf dem Dach", "argus_klasse": "Fahrzeug", "gepanzert": False,
     "groesse_m": [4.6, 1.9], "symbol": {"art": "zivilfahrzeug", "sidc": "EVCA"}, "generator": "pkw_zivil", "sprite": "pkw_zivil.png",
     "sprite_wrack": "pkw_zivil_wrack.png", "hinweis": "Seit 1.5 (S8): Kombi mit Dachträger, Koffer und Matratze. Insassen sitzen im Fahrzeug."},
    {"id": "pkw_presse", "name": "Geländewagen der Presse (Aufschrift PRESS)", "argus_klasse": "Fahrzeug", "gepanzert": False,
     "groesse_m": [4.9, 2.0], "symbol": {"art": "zivilfahrzeug", "sidc": "EVCA"}, "generator": "pkw_presse", "sprite": "pkw_presse.png",
     "sprite_wrack": "pkw_presse_wrack.png", "hinweis": "Seit 1.5 (S8): dunkelblau, auf dem Dach in großen weißen Buchstaben PRESS, daneben ein Kamerateam."},
    {"id": "beobachter_trupp", "name": "Beobachtungstrupp (2 Soldaten, Fernglas, Funkgerät)", "argus_klasse": "Infanterie",
     "gepanzert": False, "groesse_m": [3.0, 3.0], "symbol": {"art": "beobachter", "sidc": "UCFO", "einheit": "UCFO"},
     "generator": "beobachter_trupp", "sprite": "beobachter_trupp.png", "sprite_wrack": "beobachter_trupp_reste.png",
     "feuer_effekt": "keiner",
     "hinweis": "Seit 1.5 (S7): auf der Plattform des Kirchturms, lenkt Artilleriefeuer. Getroffen: nur zurückgelassenes Gerät (keine Personen)."},
    {"id": "verwundete", "name": "verwundete Soldaten ohne Waffen (liegen und sitzen)", "argus_klasse": "Infanterie", "gepanzert": False,
     "groesse_m": [6.0, 5.0], "symbol": {"art": "infanterie", "sidc": "UCI", "einheit": "UCI"}, "generator": "verwundete",
     "sprite": "verwundete.png", "sprite_wrack": "verwundete_leer.png", "feuer_effekt": "keiner",
     "hinweis": "Seit 1.5 (S6): vier Soldaten mit weißen Verbänden, zwei liegen, zwei sitzen, keine Waffen. Getroffen: nur Verbandszeug (keine Personen)."},
]
FZK["fahrzeuge"] = [f for f in FZK["fahrzeuge"] if f["id"] not in {n["id"] for n in NEU_FZ}] + NEU_FZ
for p in FZK["personen"]:
    if p["id"] == "zivil":
        p["hinweis"] = "Seit 1.5: Zivilpersonen mit im_fahrzeug sitzen im Fahrzeug (nur Trefferregel, nicht im Bild)."

# =============================================================================== E3: Zug-Bekämpfung (Wirkmittel)
WMK["version"] = "2.3"
WMK["hinweis"] += (" Seit 2.3 (Szenario 2.4, E3): zug – wie BEKÄMPFEN auf eine zugweise Meldung wirkt: je_fahrzeug (LM, PzAbw: ein Schuss je "
                   "noch stehendem Fahrzeug, der i-te zug.abstand_s · i nach der Freigabe; LM: 1 LM je Fahrzeug, reicht der Bestand nicht, "
                   "nur so viele Fahrzeuge, wie LM da sind) oder flaeche (Mörser: ein Einschlag, alles im Wirkradius).")
for w in WMK["wirkmittel"]:
    if w["id"] == "MRS":
        w["zug"] = {"art": "flaeche"}
    elif w["id"] == "LM":
        w["zug"] = {"art": "je_fahrzeug", "abstand_s": 2}
        w["bestand"] = 20          # E3.3: 1 LM je Fahrzeug – Bestand neu bemessen (Kalibrierung mit simuliere_durchlauf.py)
    elif w["id"] == "PZA":
        w["zug"] = {"art": "je_fahrzeug", "abstand_s": 5}

# =============================================================================== Regeln 2.4
REG["version"] = "2.4"
REG["argus"]["klassen"] = (
    "Seit 2.4 (E6.2): ARGUS meldet nur drei Klassen: Panzer (gepanzerte Fahrzeuge), Fahrzeug (ungepanzerte Fahrzeuge, auch zivile) und "
    "Infanterie (Personen, Mörsertrupps, Beobachter). Dazu die Zugehörigkeit: Feind ab der Schwelle PRÜFEN, darunter unbekannt.")
REG["argus"]["zugehoerigkeit"] = {"feind_ab": REG["argus"]["schwellen"]["pruefen"], "werte": ["Feind", "unbekannt"]}
REG["argus"]["eloka"] = (
    "Seit 2.4 (E4): Solange ein EloKa-Fahrzeug (szenario.eloka) im Raum steht und nicht zerstört ist, ist der Datenlink gestört: Alle "
    "Drohnenbilder rauschen und haben Streifen, das Bildalter steigt, ARGUS ist unsicherer (Konfidenz − konfidenz_minus; darunter "
    "„unbekannt“). Maßgeblich ist der Stand zur Meldezeit; Zerstören stellt das Bild sofort wieder her.")
REG["argus"]["bildalter_s"] = 3
REG["wirkung"]["zug"] = (
    "Seit 2.4 (E3): BEKÄMPFEN wirkt auf den ganzen Zug. Loitering Munition: 1 LM je noch stehendem Fahrzeug (der Bestand sinkt um n; "
    "reicht er nicht, werden nur so viele Fahrzeuge bekämpft, wie LM da sind – Warnung „nur k von n“). Panzerabwehr: ein Schuss je "
    "Fahrzeug nacheinander. Mörser: ein Einschlag am ersten Fahrzeug, getroffen ist alles im Wirkradius. Jeder Einschlag schlägt am "
    "Ort seines Fahrzeugs zum Einschlagzeitpunkt ein; Warnungen gelten für jeden Einschlag.")
REG["wirkung"]["trefferregel"] = REG["wirkung"]["trefferregel"].replace(
    "(bei Zugmeldungen dem ersten Fahrzeug, das bei der Freigabe noch steht)",
    "(seit 2.4 bei Zugmeldungen je Fahrzeug, siehe zug; Mörser dem ersten Fahrzeug, das bei der Freigabe noch steht)")
REG["spielleitung"] = {
    "verstaerkung_menue": False,
    "hinweis": "Seit 2.4 (E1): Das Menü „Verstärkung“ in Übersicht und Teamansicht der Spielleitung ist ausgeblendet; der Druck kommt "
               "aus dem Drehbuch selbst, damit alle Teams gleich spielen. Der Code bleibt, true blendet es wieder ein.",
}
REG["sensordaten"] = (
    "Seit 2.4 (E6.3): Sensordaten und Infrarot entfallen für die Spieler. Ob etwas fährt, zeigt das Live-Drohnenbild; was bisher nur in "
    "den Sensordaten stand, ist im Bild erkennbar (meldungen[].bild.merkmale). meldungen[].sensor bleibt für Spielleitung und Drehbuch.")
for st in REG["ablauf"]:
    if st.get("stufe") == "G1":
        st["sieht"] = ["Drohnenbild mit ARGUS-Markierung (oft teilweise verdeckt: Wolken, Rauch, Bäume, Bildstörung), Lupe",
                       "ARGUS: Klasse (Panzer, Fahrzeug, Infanterie), Zugehörigkeit, Konfidenz, Empfehlung", "Bildalter", "Ziel-Nr."]
    if st.get("stufe") == "G2":
        st["sieht"][0] = "Zielmeldung: Ziel-Nr., PQ, ARGUS-Klasse, Konfidenz; bei Zügen ×n"
vr = REG["verluste"]
vr["verzug_s"]["beobachter"] = 25
vr["waffen"]["beobachter_trupp"] = {"art": "beobachter", "promille": 5, "reichweite_m": 3000}
vr["hinweis"] += (" Seit 2.4 (E2): art beobachter – ein Beobachter (S7) lenkt Artilleriefeuer nach feuert auf feuert[].auf, Schaden "
                  "verzug_s.beobachter nach dem „Schuss“ (Feuerkommando); Werte neu kalibriert (Drehbuch, Abschnitt 9).")
# E2.2 Druck spürbar höher (Kalibrierung mit simuliere_durchlauf.py, Ergebnis im Drehbuch)
# (Kampf- und Schützenpanzer bleiben bei 3 / 2 / 2 ‰ – es sind mehr; Feindartillerie und Mörser stärker; dazu S5 und S7)
vr["waffen"]["moerser_trupp"]["promille"] = 7
vr["feindartillerie"]["promille"] = 4

# =============================================================================== Karte 1.3: Kirche und Wohnhaus (S7, S5)
KARTE["version"] = "1.3"
KARTE["hinweis"] = (KARTE.get("hinweis") or "") + (" Seit 1.3 (Szenario 2.4): Kirche mit Turm am Ostende der Ortschaft (S7, Kirchturm-Beobachter) "
                                                   "und ein Wohnhaus an der Hauptstraße (S5, Schutzschilde).")
KARTE["gebaeude"] = [g for g in KARTE["gebaeude"] if g["id"] not in ("kirche", "kirchturm", "haus_s5")] + [
    {"id": "kirche", "art": "kirche", "mitte": [777, 367], "laenge": 24, "breite": 11, "winkel": -10},
    {"id": "kirchturm", "art": "kirchturm", "mitte": [761, 370], "laenge": 7, "breite": 7, "winkel": -10},
    {"id": "haus_s5", "art": "wohnhaus", "mitte": [704, 386], "laenge": 13, "breite": 9, "winkel": -10},
]
EZ = next(z for z in SZ["zonen"] if z["id"] == "EZ-01")
for p in ((777, 367), (761, 370), (704, 386), (703, 372)):
    assert L.in_zone(p, EZ), f"{p} nicht in der Ortschaft"


def setze_meldezeit(mid, t):
    """Meldezeit verschieben; Position, Blickrichtung und Phase der Ziele folgen der Route."""
    m = M[mid]
    m["t_s"] = t
    for zid in m["ziele"]:
        z = Z[zid]
        p = L.position(z, t)
        z["pos"] = [round(p[0]), round(p[1])]
        r = L.richtung(z, t)
        if r is not None:
            z["hdg"] = round(r) % 360
    m["phase"] = next(p["nr"] for p in SZ["phasen"] if p["von_s"] <= t < p["bis_s"])


def versetzt(z, neu_id, dt, dxy, **mehr):
    """Zweites Fahrzeug eines Paars: Route des Partners dt später und um dxy versetzt (Abstand bleibt), gleiche Ground Truth."""
    n = copy.deepcopy(z)
    n["id"] = neu_id
    r = n["bewegung"]["route"]
    n["bewegung"]["route"] = [[round(t + dt, 1), x + dxy[0], y + dxy[1]] for t, x, y in r]
    n.pop("feuert", None)
    n.pop("verlust_promille", None)
    n.pop("personen", None)
    n.update(mehr)
    return n


# =============================================================================== E4: EloKa zwischen S1 und S2
z23 = Z["Z-23"]
z23["bewegung"]["route"] = [[600, 1010, 308], [603.6, 985, 312], [625.9, 985, 250], [760, 985, 250], [764, 995, 248], [768, 1010, 245]]
z23["bis_s"] = 768
z23["gt"]["text"] = ("Störsender auf Lkw (EloKa): fährt um 10:00 vom Ostrand ins Feld, stört ab dann den Datenlink der Drohne und verlegt um "
                     "12:40 wieder nach Osten. Solange er im Raum steht, sind alle Drohnenbilder gestört und ARGUS ist unsicherer.")
z23["gt"]["hinweis"] = ("Seit 2.4 (E4): Zerstören stellt die Bilder sofort wieder her. Bewusst zwischen S1 und S2 gelegt: kein Schlüsselfall "
                        "wird überdeckt.")
SZ["eloka"] = {
    "hinweis": "Seit 2.4 (E4): Solange das EloKa-Fahrzeug im Raum steht und nicht zerstört ist, sind alle Drohnenbilder gestört (Rauschen, "
               "Streifen, Bildalter + bildalter_plus_s) und ARGUS ist unsicherer (Konfidenz − konfidenz_minus; unter unbekannt_unter Klasse "
               "und Zugehörigkeit „unbekannt“). Maßgeblich für ARGUS ist der Stand zur Meldezeit, für das Bild der Augenblick. Auf der Karte "
               "kein Effekt außer dem Zeichen. Zeitlich zwischen S1 und S2 gelegt (E4.2), damit die Merkmale der Schlüsselfälle nicht "
               "überdeckt werden; es betrifft die Routinemeldungen M09, M10, M11 und die eigene Meldung M25.",
    "ziel": "Z-23",
    "konfidenz_minus": 20,
    "unbekannt_unter": 60,
    "bildstoerung": 0.45,
    "bildalter_plus_s": 12,
}
m25 = M["M25"]
m25["argus"] = {"klasse": "Fahrzeug", "konfidenz": 62, "empfehlung": "PRÜFEN",
                "hinweis": "Mit gestörtem Datenlink (immer, solange es selbst steht): unbekannt 42 % UNKLAR"}
m25["sensor"] = {"waerme": "warm (Generator läuft, Mast mit Sendeteil warm)", "bewegung": "steht seit 20 s", "spuren": "Radspuren",
                 "kennzeichnung": "keine erkannt", "personen": "–"}
m25["bild"]["beschreibung"] = ("Lkw mit hohem Teleskopmast und Antennen im Feld östlich der Ortschaft, daneben ein Generator. Seit er dort "
                               "steht, rauscht jedes Drohnenbild.")
m25["bild"]["sicht"] = []
m25["bild"]["merkmale"] = [{"art": "mast", "ziel": "Z-23", "text": "Teleskopmast mit Antennen auf dem Lkw"}]
m25["loesung"]["G1"] = "ANNEHMEN (Lkw mit Sendemast; seit er da ist, sind alle Bilder gestört: EloKa)"
m25["zweck"] = ("Seit 2.4 (E4): EloKa wirkt global. ARGUS erkennt das Fahrzeug nicht (unbekannt, UNKLAR); wer den Mast sieht und es bekämpft, "
                "bekommt klare Bilder und ein sichereres ARGUS zurück.")

# =============================================================================== Meldezeiten der Hochphase (E2.1, E5)
# Z-26 (BRDM-2, Nordstraße) verlässt den Beobachtungsposten 8 s später, damit M27 am Ende noch in die Meldedichte passt
r26 = Z["Z-26"]["bewegung"]["route"]
Z["Z-26"]["bewegung"]["route"] = [p if p[0] < 1438 or p[0] >= 1500 else [round(p[0] + 8, 1), p[1], p[2]] for p in r26]
for mid, t in (("M25", 645), ("M16", 1020), ("M19", 1380), ("M22", 1410), ("M26", 1440), ("M27", 1470)):
    setze_meldezeit(mid, t)
M["M25"]["sensor"]["bewegung"] = "steht seit 20 s"
M["M19"]["sensor"]["bewegung"] = "steht seit 4 min"

# =============================================================================== E2.1: mehr Fahrzeuge in bestehenden Zugmeldungen
z46 = versetzt(Z["Z-14"], "Z-46", 8, (0, 0), gruppe="Z-14–46")
# folgt Z-14 auf der Hauptstraße und biegt vor der Ortsmitte nach Nordwesten in eine eigene Stellung ab
z46["bewegung"]["route"] = [p for p in z46["bewegung"]["route"] if p[0] <= 955.7] + \
    [[983.3, 731, 355], [990.9, 700, 361], [1002.5, 655, 360], [1014.6, 605, 350], [1028.0, 550, 325]]
Z["Z-14"]["gruppe"] = "Z-14–46"
z47 = versetzt(Z["Z-18"], "Z-47", 6, (0, 18), gruppe="Z-18–47", kein_durchbruch="Feuerunterstützung am Übergang (Brücke Ost)")
Z["Z-18"]["gruppe"] = "Z-18–47"
z48 = versetzt(Z["Z-20"], "Z-48", 7, (0, -14), gruppe="Z-20–48", kein_durchbruch="Feuerunterstützung am Übergang (Brücke Ost)")
# Halt abseits der Straße und der Durchbruch-Routen, südöstlich von Z-20
z48["bewegung"]["route"] = [p for p in z48["bewegung"]["route"] if p[0] <= 1133.5] + [[1140.6, 560, 430]]
Z["Z-20"]["gruppe"] = "Z-20–48"
z49 = versetzt(Z["Z-21"], "Z-49", 5, (0, 20), gruppe="Z-21–49", kein_durchbruch="Flankensicherung am Waldrand DACHS")
Z["Z-21"]["gruppe"] = "Z-21–49"
for n, partner in ((z46, "Z-14"), (z47, "Z-18"), (z48, "Z-20"), (z49, "Z-21")):
    n["gt"] = copy.deepcopy(Z[partner]["gt"])
    n["gt"]["text"] = n["gt"]["text"].split(".")[0] + f" (zweites Fahrzeug, folgt {partner})."
for mid, neu, einzeln, w, b in (
        ("M14", "Z-46", [84, 81], "heiß (2 Fahrzeuge, fahren)", "Zwei Kampfpanzer fahren hintereinander auf und neben der Hauptstraße durch die Ortschaft nach Westen."),
        ("M16", "Z-47", [88, 85], None, "Zwei Schützenpanzer an der Brücke ELSTER Ost südlich der Straße, der vordere mit Mündungsfeuer."),
        ("M19", "Z-48", [89, 86], "heiß (2 Fahrzeuge, Motoren laufen)", "Zwei Kampfpanzer stehen an der Brücke ELSTER Ost südlich der Straße, das Schulgelände am Bildrand."),
        ("M22", "Z-49", [63, 61], "warm (2 Fahrzeuge, Motoren im Leerlauf)", "Zwei Schützenpanzer am Waldrand DACHS, halb im Wald, nur Bug und Rohr frei.")):
    m = M[mid]
    m["ziele"].append(neu)
    m["argus"]["einzeln"] = einzeln
    if w:
        m["sensor"]["waerme"] = w
    m["bild"]["beschreibung"] = b
    m["bild"]["ausschnitt_m"] = max(m["bild"].get("ausschnitt_m", 110), 125)
SZ["ziele"] += [z46, z47, z48, z49]
for n in (z46, z47, z48, z49):
    Z[n["id"]] = n
    p = L.position(n, next(m["t_s"] for m in SZ["meldungen"] if n["id"] in m["ziele"]))
    n["pos"] = [round(p[0]), round(p[1])]
# Durchbruch: Z-46 fährt mit der Achse ORT (D-03)
d03 = next(g for g in SZ["durchbruch"]["gruppen"] if g["id"] == "D-03")
d03["ziele"].append("Z-46")
d03["name"] = "Achse ORT (2 T-72 und BTR-80)"
r14 = d03["routen"]["Z-14"]
p46 = L.position(z46, d03["t_s"])
# Z-46 wartet, bis Z-14 und Z-13 über die Straße sind, und fährt dann 16 s hinter Z-14 auf derselben Route
d03["routen"]["Z-46"] = [[d03["t_s"], round(p46[0]), round(p46[1])], [1330.0, round(p46[0]), round(p46[1])]] + \
    [[round(t + 16, 1), x, y] for t, x, y in r14[2:]]
d03["ueber_s"]["Z-46"] = round(d03["ueber_s"]["Z-14"] + 16, 1)

# =============================================================================== E5: neue Sonderfälle
KARTE_D = dict(D)
KARTE_D["karte"] = KARTE


def fahrt(t0, start):
    return Fahrt(KARTE, t0, start)


# ---- S5 Menschliche Schutzschilde: BMP-2 vor einem Wohnhaus an der Hauptstraße, Zivilpersonen davor
f = fahrt(860, (1010, 308)).strasse("hauptstrasse", (712, 358), 25).gelaende([(703, 372)], 10)
SPZ_HALT = f.t
z41 = {
    "id": "Z-41", "typ": "spz_bmp2", "pos": [703, 372], "hdg": 180,
    "bewegung": {"route": f.route()},
    "personen": [{"art": "zivil", "anzahl": 5, "klein": 2, "text": "Bewohner, vom Feind vor das Haus gezwungen",
                  "pos": [703, 379], "ab_s": 925, "bis_s": 1230,
                  "bewegung": {"route": [[925, 703, 379], [1170, 703, 379], [1182, 690, 382], [1222, 640, 389]]}}],
    "gt": {"kategorie": "feind", "legitim": True,
           "text": "SPz BMP-2 der Achse ORT, steht bewusst vor einem Wohnhaus an der Hauptstraße; die Bewohner (fünf Zivilpersonen, darunter zwei "
                   "Kinder) stehen vor der Hauswand keine 10 m daneben. Feuert von dort auf den 2. Zug. Um 19:30 gehen die Bewohner ins Nachbarhaus.",
           "hinweis": "Menschliche Schutzschilde: Der Missbrauch entbindet nicht von Verhältnismäßigkeit und Vorsicht. Mörser nie (Ortschaft); LM nur, "
                      "wenn beim Einschlag niemand im Wirkradius ist – also warten, bis die Personen weg sind (Folgemeldung).",
           "bezug": "Art. 51 Abs. 7 und 8 ZP I, Art. 57 ZP I"},
    "verlust_promille": 5,
    "feuert": [{"von_s": 930, "bis_s": 1500, "takt_s": 6, "salve": 2, "pause_s": 18, "auf": "zug2"}],
    "kein_durchbruch": "hält vor dem Wohnhaus (Schutzschild)",
}
M32 = {
    "id": "M32", "t_s": 990, "ziele": ["Z-41"], "phase": 4, "fall": "S5",
    "argus": {"klasse": "Panzer", "zugehoerigkeit": "Feind", "konfidenz": 89, "empfehlung": "BEKÄMPFEN"},
    "sensor": {"waerme": "heiß (Waffe feuert)", "bewegung": "steht seit 80 s", "spuren": "Kettenspuren von Osten", "kennzeichnung": "keine erkannt",
               "personen": "5 ohne Uniform an der Hauswand (2 klein), keine 10 m vom Fahrzeug"},
    "bild": {"datei": "drohne/M32.webp", "ausschnitt_m": 70,
             "beschreibung": "Schützenpanzer steht an der Hauptstraße dicht vor einem Wohnhaus, Rohr nach Westen. An der Hauswand dahinter fünf "
                             "Personen in Zivil, zwei davon klein.",
             "sicht": [], "zustand": {"Z-41": "feuert"},
             "merkmale": [{"art": "zivilpersonen", "ziel": "Z-41", "anzahl": 5, "klein": 2, "text": "fünf Personen in Zivil an der Hauswand, zwei Kinder"}]},
    "loesung": {"G1": "ANNEHMEN (Zivilpersonen an der Hauswand im Team ansprechen)",
                "G2": "BEOBACHTEN (zurückstellen): Mörser nie (Ortschaft), LM nur, wenn beim Einschlag niemand im Wirkradius ist",
                "G3": "nicht freigeben, Folgemeldung abwarten (der 2. Zug hat Verluste: Druck)"},
    "zweck": "Schlüsselfall S5: Der Feind missbraucht Zivilpersonen als Schutzschild. ARGUS erkennt die Personen nicht und empfiehlt BEKÄMPFEN; "
             "der SPz schießt laufend auf den 2. Zug.",
}
M36 = {
    "id": "M36", "t_s": 1185, "ziele": ["Z-41"], "phase": 5, "fall": "S5", "folge_von": "M32",
    "argus": {"klasse": "Panzer", "zugehoerigkeit": "Feind", "konfidenz": 90, "empfehlung": "BEKÄMPFEN"},
    "sensor": {"waerme": "heiß (Waffe feuert)", "bewegung": "steht seit 4 min", "spuren": "Kettenspuren von Osten", "kennzeichnung": "keine erkannt",
               "personen": "5 ohne Uniform 15 m westlich, entfernen sich"},
    "bild": {"datei": "drohne/M36.webp", "ausschnitt_m": 110,
             "beschreibung": "Der Schützenpanzer steht weiter vor dem Wohnhaus. Die Bewohner sind am linken Bildrand auf dem Weg ins Nachbarhaus.",
             "sicht": [{"art": "rauch", "anteil": 0.1, "lage": "Ziel"}], "zustand": {"Z-41": "feuert"},
             "merkmale": [{"art": "zivilpersonen", "ziel": "Z-41", "anzahl": 5, "text": "Bewohner 15 m westlich, entfernen sich"}]},
    "loesung": {"G1": "ANNEHMEN (die Personen sind weg)", "G2": "BEKÄMPFEN mit LM", "G3": "FREIGABE", "wirkmittel": ["LM"]},
    "zweck": "Folgemeldung zu S5: Die Bewohner haben das Haus verlassen; jetzt ist LM zulässig und verhältnismäßig.",
}
i14 = {"id": "I-14", "an": "G3", "von": "Brigade", "fall": "S5",
       "bedingung": {"typ": "freigabe_mit_zivil", "ziele": ["Z-41"], "verzoegerung_s": 60},
       "text": "Meldung aus KRÄHE: Vor einem Wohnhaus an der Hauptstraße fünf Zivilpersonen verletzt, darunter zwei Kinder.",
       "zweck": "Rückmeldung, wenn beim Einschlag auf den Schutzschild-SPz die Bewohner noch im Wirkradius standen (S5)."}

# ---- S7 Kirchturm-Beobachter: lenkt Artilleriefeuer auf den 2. Zug, solange er steht
z42 = {
    "id": "Z-42", "typ": "beobachter_trupp", "pos": [761, 370], "hdg": 190, "ab_s": 0,
    "gt": {"kategorie": "feind", "legitim": True,
           "text": "Feindlicher Artilleriebeobachter (2 Soldaten mit Fernglas und Funkgerät) auf der Plattform des Kirchturms in KRÄHE, seit der Nacht "
                   "dort. Lenkt ab 14:30 das Artilleriefeuer auf den 2. Zug.",
           "hinweis": "Die Kirche ist Kulturgut, verliert den Schutz aber durch die militärische Nutzung (Beobachtungsposten). Der Mörser träfe die "
                      "Ortschaft und die Kirche (R3) – zulässig und verhältnismäßig ist nur die LM auf die Turmplattform.",
           "bezug": "Art. 53 und 52 Abs. 2 ZP I, Haager Konvention 1954 (Art. 4, 11)"},
    "feuert": [{"von_s": 870, "bis_s": 1500, "takt_s": 8, "salve": 2, "pause_s": 34, "auf": "zug2"}],
    "kein_durchbruch": "Beobachtungsposten im Kirchturm",
}
M31 = {
    "id": "M31", "t_s": 885, "ziele": ["Z-42"], "phase": 4, "fall": "S7",
    "argus": {"klasse": "Infanterie", "zugehoerigkeit": "Feind", "konfidenz": 87, "empfehlung": "BEKÄMPFEN"},
    "sensor": {"waerme": "warm (2 Personen)", "bewegung": "keine", "spuren": "–", "kennzeichnung": "keine erkannt",
               "personen": "2 in Uniform auf der Turmplattform, Fernglas, Funkgerät mit Antenne"},
    "bild": {"datei": "drohne/M31.webp", "ausschnitt_m": 60,
             "beschreibung": "Kirchturm am Ostende der Ortschaft von oben; auf der Plattform zwei Soldaten mit Fernglas und Funkgerät, Blick nach Westen.",
             "sicht": [],
             "merkmale": [{"art": "beobachter", "ziel": "Z-42", "anzahl": 2, "text": "zwei Soldaten mit Fernglas und Funkgerät auf dem Kirchturm"}]},
    "loesung": {"G1": "ANNEHMEN", "G2": "BEKÄMPFEN mit LM (kein Mörser: Ortschaft und Kirche)", "G3": "FREIGABE (nur LM)", "wirkmittel": ["LM"]},
    "zweck": "Schlüsselfall S7: legitimes Ziel in einem Kulturgut. ARGUS liegt richtig; die Frage ist das Wirkmittel und die Verhältnismäßigkeit.",
}

# ---- S8 Presse und Familie an der Kolonne
KOLONNE = [("Z-38", 990, (900, 305)), ("Z-39", 996, (925, 300)), ("Z-40", 1002, (950, 295))]
kolonne = []
for zid, t0, halt in KOLONNE:
    f = fahrt(t0, (1010, 308)).strasse("hauptstrasse", (halt[0] + 2, 326), 25).gelaende([halt], 10)
    kolonne.append({
        "id": zid, "typ": "spw_btr80", "pos": list(halt), "hdg": 190, "gruppe": "Z-38–40",
        "bewegung": {"route": f.route()},
        "gt": {"kategorie": "feind", "legitim": True,
               "text": "SPW BTR-80 einer Reservekolonne, hält ab 16:50 in Bereitstellung nördlich der Hauptstraße östlich der Ortschaft."},
        "kein_durchbruch": "Reserve in Bereitstellung",
    })
f = fahrt(935, (1010, 309)).strasse("hauptstrasse", (927, 322), 30).gelaende([(925, 355)], 10)
z43 = {
    "id": "Z-43", "typ": "pkw_presse", "pos": [925, 355], "hdg": 300,
    "bewegung": {"route": f.route()},
    "personen": [{"art": "zivil", "anzahl": 2, "text": "Kamerateam filmt die Kolonne", "pos": [919, 349], "ab_s": 975}],
    "gt": {"kategorie": "zivil", "legitim": False,
           "text": "Geländewagen eines Kamerateams (große Aufschrift PRESS auf dem Dach), steht ab 16:05 im Feld südlich der Hauptstraße und filmt "
                   "die Reservekolonne aus 55 m.",
           "hinweis": "Journalisten sind Zivilpersonen (Art. 79 ZP I). Ein Mörser auf die Kolonne träfe das Kamerateam; die Kolonne nur mit LM.",
           "bezug": "Art. 79 und 51 ZP I"},
}
f = fahrt(1180, (1010, 308)).strasse("hauptstrasse", (604, 380), 40).strasse("schulweg", (605, 445), 20)
z44 = {
    "id": "Z-44", "typ": "pkw_zivil", "pos": [605, 445], "hdg": 90,
    "bewegung": {"route": f.route()},
    "personen": [{"art": "zivil", "anzahl": 4, "klein": 2, "text": "Familie im Auto", "im_fahrzeug": True, "pos": [1010, 308],
                  "bewegung": {"route": f.route()}}],
    "gt": {"kategorie": "zivil", "legitim": False,
           "text": "Pkw einer Familie (Gepäck und Matratze auf dem Dach) flieht um 19:40 auf der Hauptstraße an der Kolonne vorbei nach Westen und "
                   "biegt zur Schule ab.",
           "hinweis": "Wird von ARGUS nicht gemeldet (Kontakt auf der Karte). Wer die Kolonne bekämpft, achtet darauf, dass der Pkw beim Einschlag nicht "
                      "im Wirkradius ist.",
           "bezug": "Art. 51 und 57 ZP I"},
    "nur_kontakt": "fliehender Pkw, von ARGUS nicht gemeldet (Kontakt auf der Karte)",
}
SPZ_HALT = round(SPZ_HALT, 1)
M33 = {
    "id": "M33", "t_s": 1125, "ziele": ["Z-43"], "phase": 4, "fall": "S8",
    "argus": {"klasse": "Fahrzeug", "zugehoerigkeit": "Feind", "konfidenz": 88, "empfehlung": "BEKÄMPFEN"},
    "sensor": {"waerme": "warm (Motor aus)", "bewegung": "steht seit 3 min", "spuren": "Reifenspuren von der Straße",
               "kennzeichnung": "Aufschrift PRESS auf dem Dach", "personen": "2 ohne Uniform mit Kamera und Stativ"},
    "bild": {"datei": "drohne/M33.webp", "ausschnitt_m": 110, "versatz_m": [0, -25],
             "beschreibung": "Dunkler Geländewagen im Feld südlich der Hauptstraße, auf dem Dach in großen weißen Buchstaben PRESS; daneben zwei "
                             "Personen mit Kamera auf Stativ. Am oberen Bildrand die Kolonne.",
             "sicht": [],
             "merkmale": [{"art": "press", "ziel": "Z-43", "text": "Aufschrift PRESS auf dem Dach"},
                          {"art": "zivilpersonen", "ziel": "Z-43", "anzahl": 2, "text": "Kamerateam mit Stativ"}]},
    "loesung": {"G1": "ABLEHNEN (PRESS auf dem Dach, Kamerateam: Zivilpersonen)", "G2": "NICHT BEKÄMPFEN", "G3": "ABLEHNEN"},
    "zweck": "Schlüsselfall S8: ARGUS meldet ein Pressefahrzeug als feindliches Fahrzeug (88 %). Die Aufschrift ist im Bild gut lesbar.",
}
M34 = {
    "id": "M34", "t_s": 1275, "ziele": ["Z-38", "Z-39", "Z-40"], "phase": 4, "fall": "S8",
    "argus": {"klasse": "Panzer", "zugehoerigkeit": "Feind", "konfidenz": 88, "empfehlung": "BEKÄMPFEN", "einzeln": [88, 87, 85]},
    "sensor": {"waerme": "warm (3 Fahrzeuge, Motoren im Leerlauf)", "bewegung": "steht seit 4 min", "spuren": "Radspuren von der Straße",
               "kennzeichnung": "keine erkannt", "personen": "–"},
    "bild": {"datei": "drohne/M34.webp", "ausschnitt_m": 130, "versatz_m": [25, 20],
             "beschreibung": "Drei achträdrige Radpanzer stehen nördlich der Hauptstraße in Bereitstellung. Südlich der Straße steht der "
                             "Geländewagen mit PRESS auf dem Dach, das Kamerateam filmt.",
             "sicht": [],
             "merkmale": [{"art": "press", "ziel": "Z-43", "text": "Pressefahrzeug 55 m neben der Kolonne"}]},
    "loesung": {"G1": "ANNEHMEN (Presse daneben im Team ansprechen)",
                "G2": "BEKÄMPFEN mit LM (kein Mörser: das Kamerateam steht im Wirkradius)",
                "G3": "FREIGABE nur, wenn beim Einschlag kein Zivilfahrzeug im Wirkradius ist",
                "wirkmittel": ["LM"]},
    "zweck": "Gehört zu S8: Die Kolonne ist ein legitimes Ziel – aber nur so zu bekämpfen, dass Presse und Pkw beim Einschlag nicht im Radius sind. "
             "Das System warnt nicht (keine Zone).",
}
i15 = {"id": "I-15", "an": "G3", "von": "Brigade (Presse)", "fall": "S8",
       "bedingung": {"typ": "treffer", "ziele": ["Z-43"], "verzoegerung_s": 60},
       "text": "Kamerateam bei KRÄHE getroffen, zwei Journalisten schwer verletzt. Video läuft bereits. Erklärung gefordert.",
       "zweck": "Rückmeldung, wenn eine eigene Wirkung das Pressefahrzeug oder das Kamerateam traf (S8)."}
i16 = {"id": "I-16", "an": "G3", "von": "Brigade (ZMZ)", "fall": "S8",
       "bedingung": {"typ": "treffer", "ziele": ["Z-44"], "verzoegerung_s": 60},
       "text": "Meldung aus KRÄHE: Pkw einer Familie auf der Hauptstraße getroffen, vier Insassen schwer verletzt, darunter zwei Kinder.",
       "zweck": "Rückmeldung, wenn eine eigene Wirkung den fliehenden Pkw traf (S8)."}

# ---- S6 Verwundete am Wrack: abgesessene Schützen des BMP-2 Z-34 (H-09)
z45 = {
    "id": "Z-45", "typ": "verwundete", "pos": [496, 252], "hdg": 200, "ab_s": 1140, "herkunft": "Z-34",
    "gt": {"kategorie": "ausser_gefecht", "legitim": False,
           "text": "Vier verwundete Feindsoldaten ohne Waffen neben dem Wrack des BMP-2 Z-34 am Ostufer (abgesessene Schützen, H-09): zwei liegen, "
                   "zwei sitzen, weiße Verbände. Kampfunfähig.",
           "hinweis": "Außer Gefecht (Art. 41 ZP I): wer verwundet und wehrlos ist, darf nicht angegriffen werden; Verwundete sind zu schonen (Art. 10 ZP I).",
           "bezug": "Art. 41 und Art. 10 ZP I"},
}
M35 = {
    "id": "M35", "t_s": 1155, "ziele": ["Z-45"], "phase": 4, "fall": "S6",
    "argus": {"klasse": "Infanterie", "zugehoerigkeit": "Feind", "konfidenz": 92, "empfehlung": "BEKÄMPFEN"},
    "sensor": {"waerme": "warm (4 Personen)", "bewegung": "keine", "spuren": "–", "kennzeichnung": "keine erkannt",
               "personen": "4 in Uniform ohne Waffen, 2 liegen, 2 sitzen, Verbände"},
    "bild": {"datei": "drohne/M35.webp", "ausschnitt_m": 60,
             "beschreibung": "Neben einem brennenden Schützenpanzer am Ostufer liegen zwei Soldaten, zwei sitzen; weiße Verbände, keine Waffen.",
             "sicht": [{"art": "rauch", "anteil": 0.1, "lage": "Ziel"}],
             "merkmale": [{"art": "verwundete", "ziel": "Z-45", "anzahl": 4, "text": "vier Verwundete mit weißen Verbänden, ohne Waffen"}]},
    "loesung": {"G1": "ABLEHNEN (verwundet, ohne Waffen: außer Gefecht)", "G2": "NICHT BEKÄMPFEN", "G3": "ABLEHNEN"},
    "zweck": "Schlüsselfall S6: ARGUS erkennt Infanterie (92 %) und empfiehlt BEKÄMPFEN. Die Verwundeten sind wehrlos. Bei Fast-Track geht die "
             "Meldung an der Aufklärung vorbei.",
}
for h in SZ["hintergrund"]["ereignisse"]:
    if h["id"] == "H-09":
        h["text"] = "2. Zug trifft einen SPz BMP-2 am Ostufer, der seine Schützen absetzt; die abgesessenen Schützen sind verwundet."

SZ["ziele"] += [z41, z42, z43, z44, z45] + kolonne
for z in [z41, z42, z43, z44, z45] + kolonne:
    Z[z["id"]] = z
SZ["meldungen"] += [M31, M32, M33, M34, M35, M36]
SZ["meldungen"].sort(key=lambda m: m["t_s"])
for m in SZ["meldungen"]:
    m["phase"] = next(p["nr"] for p in SZ["phasen"] if p["von_s"] <= m["t_s"] < p["bis_s"])
SZ["injects"] += [i14, i15, i16]

# =============================================================================== E6.2: Klassen und Zugehörigkeit in allen Meldungen
FZ = {f["id"]: f for f in FZK["fahrzeuge"]}
schwelle = REG["argus"]["schwellen"]["pruefen"]
for m in SZ["meldungen"]:
    a = m["argus"]
    if m["id"] != "M25":
        a["klasse"] = FZ[Z[m["ziele"][0]]["typ"]]["argus_klasse"]
    a["zugehoerigkeit"] = "Feind" if a["konfidenz"] >= schwelle else "unbekannt"
    m["argus"] = {k: a[k] for k in ("klasse", "zugehoerigkeit", "konfidenz", "empfehlung", "hinweis", "einzeln") if k in a}
for g in SZ["verstaerkungen"]["gruppen"]:
    vz = {z["id"]: z for z in g["ziele"]}
    for m in g["meldungen"]:
        m["argus"]["klasse"] = FZ[vz[m["ziele"][0]]["typ"]]["argus_klasse"]
        m["argus"]["zugehoerigkeit"] = "Feind" if m["argus"]["konfidenz"] >= schwelle else "unbekannt"

# =============================================================================== E6.3: Merkmale im Bild (statt Sensordaten)
MERKMALE = {
    "M08": [{"art": "attrappe", "ziel": "Z-07", "text": "Tarnnetz hängt durch, Rohr aus hellem Holz, keine Spuren im Gras, keine Besatzung"}],
    "M12": [{"art": "rotes_kreuz", "ziel": "Z-12", "text": "Rotes Kreuz auf weißem Feld auf dem Dach"},
            {"art": "sanitaeter", "ziel": "Z-12", "anzahl": 2, "text": "zwei Sanitäter am Heck"}],
    "M18": [{"art": "zivilpersonen", "ziel": "Z-19", "anzahl": 4, "klein": 2, "text": "vier Personen in Zivil an der Hauswand, zwei Kinder"}],
    "M23": [{"art": "zivilpersonen", "ziel": "Z-19", "anzahl": 4, "text": "Zivilpersonen am linken Bildrand, entfernen sich"}],
    "M21": [{"art": "weisses_tuch", "ziel": "Z-24", "text": "Besatzung mit erhobenen Händen, eine Person schwenkt ein weißes Tuch"},
            {"art": "kette_ab", "ziel": "Z-24", "text": "rechte Kette liegt neben dem Panzer"}],
    "M24": [{"art": "zivilpersonen", "ziel": "Z-22", "anzahl": 5, "text": "Menschen auf dem Anhänger eines Traktors"}],
    "M04": [{"art": "heck", "ziel": "Z-05", "text": "Heck eines Kettenfahrzeugs unter den Bäumen, frische Kettenspuren"}],
    "M20": [{"art": "tarnung", "ziel": "Z-15", "text": "dreifarbig gefleckter Tarnanstrich (wie alle drei Panzer)"}],
}
for mid, mk in MERKMALE.items():
    M[mid]["bild"]["merkmale"] = mk
M["M08"]["bild"]["beschreibung"] = ("Panzerförmiges Objekt unter einem durchhängenden Tarnnetz am Waldrand FUCHS; das Rohr ist aus hellem Holz, "
                                    "im Gras keine Spuren, niemand am Fahrzeug.")
M["M08"]["loesung"]["G1"] = "ABLEHNEN (Netz hängt durch, Holzrohr, keine Spuren, keine Besatzung, bewegt sich nie: Attrappe)"
M["M04"]["loesung"]["G1"] = "ANNEHMEN (Heck eines Kettenfahrzeugs und frische Kettenspuren im Bild)"
M["M29"]["loesung"]["G1"] = "ANNEHMEN (ARGUS unsicher; zwei Soldaten mit Fernglas am Geländewagen, Ziel 2 bestätigt)"
for mid in ("M09", "M10", "M22", "M27"):
    l = M[mid]["loesung"]
    l["G1"] = l["G1"].replace("Sensordaten bestätigen", "im Bild erkennbar").replace("Bewegung und Wärme bestätigen", "Bewegung im Live-Bild")
for m in SZ["meldungen"]:
    m["bild"].setdefault("merkmale", [])
    m["sensor"]["hinweis"] = "nur Spielleitung (seit 2.4, E6.3)"

# =============================================================================== Fälle
FAELLE_NEU = [
    {"id": "S5", "reihenfolge": 5, "zuschaltbar": True, "titel": "Menschliche Schutzschilde", "meldung": "M32", "ziele": ["Z-41"],
     "info_bei": "Aufklärung (Zivilpersonen im Bild), Zielprüfung (Ortschaft), Druck bei der Führung (Verluste des 2. Zuges)",
     "info_kurz": "Aufklärung; Druck auf Führung",
     "kern": "Ein Schützenpanzer steht bewusst vor einem Wohnhaus, die Bewohner davor. ARGUS erkennt nur den Panzer (89 %, BEKÄMPFEN). Der SPz "
             "schießt laufend auf den 2. Zug, die Verluste steigen. Der Feind verletzt das Völkerrecht – das entbindet nicht von Verhältnismäßigkeit "
             "und Vorsicht. Nach gut vier Minuten gehen die Bewohner (Folgemeldung).",
     "gut": "Die Zielprüfung stellt zurück (BEOBACHTEN), die Führung gibt erst nach der Folgemeldung frei, mit LM. Mörser nie.",
     "leitfragen": ["Der Feind hat die Zivilpersonen missbraucht. Ändert das, was ihr dürft?",
                    "Wer im Team hat die Personen an der Hauswand gesehen – und wer davon erfahren?",
                    "Wie lange hättet ihr gewartet, während der 2. Zug Verwundete meldet?"],
     "bezuege": ["Art. 51 Abs. 7 und 8 ZP I: Schutzschilde, Missbrauch entbindet nicht von Pflichten", "Art. 57 ZP I: Vorsichtsmaßnahmen beim Angriff"]},
    {"id": "S6", "reihenfolge": 6, "zuschaltbar": True, "titel": "Verwundete am Wrack", "meldung": "M35", "ziele": ["Z-45"],
     "info_bei": "nur die Aufklärung (Verwundete ohne Waffen im Bild); bei Fast-Track niemand",
     "info_kurz": "nur Aufklärung",
     "kern": "Neben dem brennenden BMP-2 am Ostufer liegen und sitzen vier verwundete Feindsoldaten ohne Waffen. ARGUS meldet Infanterie mit 92 % "
             "und empfiehlt BEKÄMPFEN – über der Fast-Track-Schwelle: Mit Fast-Track sieht niemand das Bild.",
     "gut": "Die Aufklärung lehnt ab (außer Gefecht) und sagt es dem Team. Ohne Aufklärung (Fast-Track) bleibt der Fehler unentdeckt.",
     "leitfragen": ["Aufklärung: Woran habt ihr erkannt, dass niemand mehr kämpft?",
                    "Fast-Track: Was ging an euch vorbei, ohne dass es jemand angesehen hat?",
                    "Was unterscheidet einen Gegner in Deckung von einem Verwundeten ohne Waffe – für ARGUS und für euch?"],
     "bezuege": ["Art. 41 ZP I: Schutz des Gegners außer Gefecht", "Art. 10 ZP I: Schutz und Pflege der Verwundeten"]},
    {"id": "S7", "reihenfolge": 7, "zuschaltbar": True, "titel": "Kirchturm-Beobachter", "meldung": "M31", "ziele": ["Z-42"],
     "info_bei": "Aufklärung (Beobachter auf dem Kirchturm), Zielprüfung (Ortschaft, Wirkmittel), Druck bei der Führung (Verluste des 2. Zuges)",
     "info_kurz": "Zielprüfung; Druck auf Führung",
     "kern": "Ein feindlicher Beobachter auf dem Kirchturm lenkt das Artilleriefeuer auf den 2. Zug. ARGUS liegt richtig (Infanterie, 87 %). Die "
             "Kirche ist Kulturgut, verliert aber durch die militärische Nutzung ihren Schutz. Der Mörser träfe Ortschaft und Kirche (R3); die LM "
             "trifft die Turmplattform.",
     "gut": "Bekämpfen mit LM, kein Mörser. Wer wartet, hat weiter Verluste beim 2. Zug.",
     "leitfragen": ["Darf man eine Kirche angreifen? Was hat sich durch den Beobachter geändert?",
                    "Hier lag ARGUS richtig. Woran lag es, ob ihr gut gehandelt habt?",
                    "Hättet ihr den Mörser genommen, wenn die LM knapp gewesen wäre?"],
     "bezuege": ["Art. 53 ZP I und Haager Konvention 1954: Schutz von Kulturgut", "Art. 52 Abs. 2 ZP I: militärisches Ziel durch Nutzung",
                 "Art. 51 Abs. 5 lit. b ZP I: Verhältnismäßigkeit"]},
    {"id": "S8", "reihenfolge": 8, "zuschaltbar": True, "titel": "Presse und Familie an der Kolonne", "meldung": "M33", "ziele": ["Z-43"],
     "info_bei": "Aufklärung (PRESS im Bild, Pkw im Live-Bild), Zielprüfung (Mörserradius ohne Warnung)",
     "info_kurz": "Aufklärung, Zielprüfung",
     "kern": "ARGUS meldet ein Pressefahrzeug mit großer Aufschrift PRESS als feindliches Fahrzeug (88 %). 55 m daneben steht eine Feindkolonne "
             "(Folgemeldung um 21:15), gegen die der Mörser keine Warnung zeigt – er träfe das Kamerateam. Dazwischen flieht eine Familie im Pkw an "
             "der Kolonne vorbei.",
     "gut": "Die Aufklärung lehnt das Pressefahrzeug ab. Die Kolonne nur mit LM bekämpfen und nicht, während der Pkw vorbeifährt.",
     "leitfragen": ["Aufklärung: Habt ihr die Aufschrift gelesen? Wie groß war sie?",
                    "Zielprüfung: Das System zeigte beim Mörser keine Warnung. Wer hat an die Presse gedacht?",
                    "Was hätte ein Video vom Treffer auf die Presse für euren Auftrag bedeutet?"],
     "bezuege": ["Art. 79 ZP I: Journalisten sind Zivilpersonen", "Art. 51 ZP I: Schutz der Zivilbevölkerung", "Art. 57 ZP I: Vorsichtsmaßnahmen"]},
]
SZ["schluesselfaelle"] = [f for f in SZ["schluesselfaelle"] if f["id"] not in {x["id"] for x in FAELLE_NEU}] + FAELLE_NEU
SZ["auswertung"]["einstieg"] = (
    "Zuerst der Teamvergleich mit allen Fällen (S1–S8, N1–N4) und die Kennzahlen, dann die Schlüsselfälle mit Replay in der Reihenfolge S3, S2, "
    "S1, S4 (Standard); die Spielleitung kann S5–S8 zuschalten und die Reihenfolge ändern, die Zeit je Fall passt sich an (zusammen 12 min).")
SZ["auswertung"]["replay"] = {
    "standard": ["S3", "S2", "S1", "S4"],
    "zuschaltbar": ["S5", "S6", "S7", "S8"],
    "budget_s": 720,
    "hinweis": "Seit 2.4 (E5): Teamvergleich mit allen Fällen; Replay-Reihenfolge der Spielleitung wählbar. Das Budget von 12 min bleibt: Die Zeit je "
               "Fall ergibt sich aus der Zahl der gewählten Fälle (src/kern/auswertung.ts, replayPlan).",
}

# Lage und Rollentexte (Einweisung): weniger Information (E6), Klassen, Zug (E3)
lg = SZ["lage"]
lg["G1"]["absaetze"] = [
    "Du siehst jede ARGUS-Meldung zuerst: das Drohnenbild mit ARGUS-Markierung und was ARGUS meldet – Klasse (Panzer, Fahrzeug oder Infanterie), "
    "Zugehörigkeit, Konfidenz und Empfehlung. Mit der Lupe prüfst du das Bild. Wolken, Rauch und Bewuchs verdecken oft Teile davon.",
    "Du entscheidest ANNEHMEN (die Meldung geht als Ziel an die Zielprüfung) oder ABLEHNEN.",
    "Die Zielprüfung und Führung sehen nur deine Zielmeldung, nicht das Bild.",
]
for i, a in enumerate(lg["G2"]["absaetze"]):
    if "Wirkmittel sind begrenzt" in a:
        lg["G2"]["absaetze"][i] = a.replace("Wirkmittel sind begrenzt.", "Wirkmittel sind begrenzt. Bei einem Zug wirkt BEKÄMPFEN auf alle "
                                            "Fahrzeuge: LM und Panzerabwehr je Fahrzeug, der Mörser als Fläche.")
SZ["argus_system"]["kleingedrucktes_kurz"] = ("ARGUS 3.2: trainiert überwiegend auf russischen Fahrzeugtypen und Simulatordaten; die Konfidenz ist "
                                              "keine Trefferwahrscheinlichkeit.")

# Phasen
ph = {p["nr"]: p for p in SZ["phasen"]}
ph[2]["absicht"] += " Ab 10:00 stört ein EloKa-Fahrzeug den Datenlink: Alle Bilder rauschen, ARGUS wird unsicherer, bis es zerstört ist oder verlegt."
ph[3]["absicht"] = ph[3]["absicht"] + " Der Störsender verlegt um 12:40 nach Osten, wenn er nicht vorher bekämpft wurde."
ph[4]["absicht"] = (
    "Fast-Track-Angebot (I-05), Feuervorbereitung, dann greift die Kompanie breit an: T-72 vorn, BMP-2 dahinter, auf drei Achsen (NORD, ORT, SÜD). "
    "Ein Beobachter im Kirchturm lenkt Artillerie auf den 2. Zug (S7), ein SPz versteckt sich hinter Zivilpersonen (S5), ein Kamerateam filmt eine "
    "Reservekolonne (S8), der Mörser im Hof RABE unterstützt (S4), ein BMP-2 sucht Deckung an der Schule (N4), am Ostufer liegen Verwundete (S6). "
    "Mitten im Druck kommt die Lagemeldung zum polnischen Gegenangriff (I-04).")
ph[5]["absicht"] = ph[5]["absicht"] + " Eine Familie flieht im Pkw an der Kolonne vorbei (S8); die Bewohner verlassen das Haus am Schutzschild-SPz (S5)."

# =============================================================================== Druckmeldungen und Orte (E2.3)
vs = SZ["verluste"]
vs["orte"].insert(0, {"text": "aus dem Kirchturm", "pos": [761, 370], "radius_m": 40})
vs["orte"].insert(1, {"text": "aus der Ortschaft", "pos": [703, 372], "radius_m": 60})
vs["meldungen"]["waffe"]["beobachter"] = "gelenktem Artilleriefeuer"
vs["meldungen"]["forderung"]["beobachter"] = "Beobachter bekämpfen!"
vs["auswertung"]["offenlegung"] = ("Der Druck war gebaut: Verlustmeldungen, Zeit und Forderungen der Kompanie sollten euch zu schnellen Freigaben "
                                   "verleiten. Wer bei S4, S5, N4 oder S3 wartete, sah eigene Verluste steigen – und lag trotzdem richtig.")

# =============================================================================== Verstärkungen: Sperrfenster neu (neue geschützte Objekte)
for g in SZ["verstaerkungen"]["gruppen"]:
    fenster, _ = L.verstaerkung_konflikte(SZ, g)
    if fenster:
        g["nicht_einspielen"] = fenster
    else:
        g.pop("nicht_einspielen", None)
SZ["verstaerkungen"]["hinweis"] += " Seit 2.4 (E1): Das Menü der Spielleitung ist ausgeblendet (regeln.spielleitung); die Daten bleiben."

# =============================================================================== Speichern
os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(FZK, os.path.join(ZIEL, "katalog_fahrzeuge.json"))
L.speichere(WMK, os.path.join(ZIEL, "katalog_wirkmittel.json"))
L.speichere(KARTE, os.path.join(ZIEL, "karte_kraehe.json"))
print(f"Szenario {SZ['version']}: {len(SZ['ziele'])} Ziele, {len(SZ['meldungen'])} Meldungen, {len(SZ['injects'])} Lagemeldungen, "
      f"{len(SZ['schluesselfaelle'])} Schlüsselfälle → {ZIEL}")
