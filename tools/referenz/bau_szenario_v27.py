#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.7 aus v2.6: Änderungslisten G (Auswertung, Bilanz, Impuls) und I (Probelauf 09.11.2026).

Quelle: claude/Aenderungen_Bilanz_03-11.md (G1–G5) und claude/Aenderungen_Probelauf_09-11.md (I1–I7, ohne I6). Grundsätze bleiben:
deterministisch, nicht zu verlieren, keine Darstellung getöteter Menschen, kein Punktestand, keine Rangliste.

  I2  Jede erste Meldung eines Fahrzeugs kommt höchstens 90 s nach seiner Einfahrt (erstmals sichtbar: im Raum, nicht im Wald) und
      vor seinem ersten Schuss auf die eigenen Panzer. Ausnahmen begründet in den Daten (`spaet_gewollt`): Attrappe S1, Mörser S4,
      Schutzschild S5, Zustandswechsel N2; ungemeldete Ziele und der fliehende Pkw (nur Kontakt) zählen nicht.
        Z-05 (N3)       fährt 45 s später ein                                    M04 bleibt 10:04:45, Bild gleich
        Z-06            Mörser schießt erst ab 10:05:52 (vorher 10:05:02)          M05 bleibt 10:05:30
        Z-29            fährt 25 s später ein                                    M10 bleibt 10:11:15, Bild gleich
        Z-42 (S7)       Beobachter lenkt erst ab 10:15:00 Feuer (vorher 10:14:30)  M31 bleibt 10:14:45
        Z-18, Z-47      kommen aus dem Wald DACHS (vorher 3 min über die Felder)   M16 10:17:00 → 10:16:10 (I2.1: beim Halt an der
                        und halten wie bisher 10:16:05/10:16:11 an der Brücke Ost   Brücke, vor dem ersten Schuss 10:16:28)
        Z-43 (S8)       Presse                                                    M33 10:18:45 → 10:17:00, Bild gleich
        Z-38–40 (S8)    Radpanzer                                                 M34 10:21:15 → 10:17:55, Bild gleich
        Z-20, Z-48      erste Meldung NEU M37 10:18:30 (fahren durch KRÄHE)        M19 bleibt 10:23:00 als Folgemeldung zu M37
        Z-21, Z-49      Waldrand DACHS                                            M22 10:23:30 → 10:21:15, Bild gleich
        Z-22 (N1)       Traktor fährt 10 s später ein                             M24 bleibt 10:22:30 (Bild neu, 10 s früher im Weg)
        Z-25            fährt erst 10:22:30 ein (vorher 10:20:50)                 M26 bleibt 10:24:00, Bild gleich
        Z-26            fährt erst 10:23:00 ein (vorher 10:16:43)                 M27 bleibt 10:24:30, Bild gleich
        V-3             Meldung 85 s nach dem Einspielen (vorher 130 s)
  I3  Polnische PT-91 kämpfen sichtbar mit: E-01 ab 10:20:45 alle 20 s auf die Feindkräfte an der Brücke Ost in der Reihenfolge ihrer
      Ankunft (`ziele_reihenfolge`, je Schuss das erste noch stehende Fahrzeug im `bereich`); ohne Freigabe bis 10:21:45 (90 s nach M20)
      werden sie als verbündet markiert (`aufloesungen` A-01, Lagemeldung I-17), danach keine Freigabe mehr. I-08b nach dem letzten
      Schuss (10:23:20).
  I4  Lagemeldungen bleiben 30 s (Spielzeit) im Feed oder bis zum Klick, dann sind sie weg (`regeln.anzeige.lagemeldung_s`).
  G   Auswertung in 15 min (`szenario.auswertung`): Kapitelplan, Replay S3/S2, Bilanz mit Spielwerten (`regeln.bilanz`), Impuls mit
      Zitaten (wörtlich nach Liste G), Diskussion mit Wertekompass, Abschluss.

Einmalig benutzt wie bau_szenario_v26.py; maßgeblich ist danach die JSON-Datei.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v27.py BASIS_2.6_ORDNER OUT_ORDNER
"""
import copy
import json
import math
import os
import sys

import argus_lib as L

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)
QUELLE, ZIEL = sys.argv[1], sys.argv[2]
D = L.lade_alles(ordner=QUELLE)
ALT = D["szenario"]
assert ALT["version"] == "2.6", "Basis muss Szenario 2.6 sein"


def roh(name):
    with open(os.path.join(QUELLE, name), encoding="utf-8") as f:
        return json.load(f)


SZ = copy.deepcopy(ALT)
REG = roh(ALT["kataloge"]["regeln"])
FZK = roh(ALT["kataloge"]["fahrzeuge"])
WMK = roh(ALT["kataloge"]["wirkmittel"])
KARTE = roh(ALT["kataloge"]["karte"])
SZ["version"] = "2.7"
SZ["stand"] = "2026-11-10"
Z = {z["id"]: z for z in SZ["ziele"]}
M = {m["id"]: m for m in SZ["meldungen"]}
I = {i["id"]: i for i in SZ["injects"]}
F = {f["id"]: f for f in SZ["schluesselfaelle"] + SZ["nebenfaelle"]}
REGEL_I2 = "seit 2.7 (I2.2): erste Meldung höchstens 90 s nach der Einfahrt und vor dem ersten Schuss"


def ersetze(obj, schl, alt, neu):
    """Text in obj[schl] ersetzen; prüft, dass der alte Text vorkommt (sonst wäre die Vorlage veraltet)."""
    assert alt in obj[schl], f"„{alt}“ nicht in {obj.get('id', schl)}: {obj[schl][:200]}"
    obj[schl] = obj[schl].replace(alt, neu)


def r1(x):
    return round(x * 10) / 10


def verschiebe(ziel, dt, ab=None):
    """Route (ab Stützpunkt-Zeit `ab`, sonst ganz) um dt Sekunden verschieben."""
    r = ziel["bewegung"]["route"]
    ziel["bewegung"]["route"] = [[t + dt if ab is None or t >= ab else t, x, y] for t, x, y in r]


def fahrt(punkte, t0, v):
    """Route über die Punkte mit Geschwindigkeit v (m/s) ab t0: [[t, x, y], …] (t auf 0,1 s)."""
    out = [[r1(t0), punkte[0][0], punkte[0][1]]]
    t = t0
    for a, b in zip(punkte, punkte[1:]):
        t += math.dist(a, b) / v
        out.append([r1(t), b[0], b[1]])
    return out


# =============================================================================== I2 Meldung ≤ 90 s nach der Einfahrt, vor dem ersten Schuss
# Z-05 (N3, M04 10:04:45): 45 s später; um 10:04:45 steht er wie bisher unter der Baumgruppe (Ankunft 10:03:58)
verschiebe(Z["Z-05"], 45)
# Z-29 (M10 10:11:15): 25 s später; hält ab 10:10:33 am Waldrand DACHS (vorher 10:10:08)
verschiebe(Z["Z-29"], 25)
# Z-06: der Mörser geht 10:04:42 in Stellung und schießt seit 2.7 erst nach der Meldung M05 (10:05:30)
assert Z["Z-06"]["feuert"][0]["von_s"] == 302
Z["Z-06"]["feuert"][0]["von_s"] = 352
ersetze(M["M05"]["bild"], "beschreibung", "Mündungsrauch zieht über die Stellung.", "Rauch zieht über die Stellung, die Bedienung richtet die Rohre ein.")
M["M05"]["sensor"]["waerme"] = "Rohre kalt, Bedienung warm (richtet ein)"
ersetze(M["M05"], "zweck", "der Mörser am Waldrand MARDER eröffnet das Feuer", "der Mörser am Waldrand MARDER geht in Stellung und eröffnet "
        "gleich das Feuer (10:05:52, seit 2.7 erst nach der Meldung)")
# Z-42 (S7, M31 10:14:45): der Beobachter lenkt das Feuer erst ab 10:15:00
assert Z["Z-42"]["feuert"][0]["von_s"] == 870
Z["Z-42"]["feuert"][0]["von_s"] = 900

# Z-18/Z-47 (M16): kommen aus dem Wald DACHS – unsichtbar, bis sie 10:14:49 bzw. 10:14:57 am Nordwestrand herausfahren; wie bisher
# 10:16:05 bzw. 10:16:11 an der Brücke Ost, Z-18 schießt ab 10:16:28. Der letzte Abschnitt folgt dem bisherigen Weg zwischen Ortschaft
# und Schule (18 km/h im Gelände).
ALT_Z18 = Z["Z-18"]["bewegung"]["route"]
ALT_Z47 = Z["Z-47"]["bewegung"]["route"]
assert ALT_Z18[-2][0] == 965.9 and ALT_Z47[-2][0] == 971.9
WEG18 = [(860, 500), (800, 450), (760, 425)] + [(x, y) for t, x, y in ALT_Z18 if 897 <= t <= 966]
WEG47 = [(875, 515), (812, 466), (765, 443)] + [(x, y) for t, x, y in ALT_Z47 if 903 <= t <= 972]


def dachs(ziel, start, waldpunkt, t_ein, weg, t_halt, v=5.0):
    """Einfahrt am Ostrand im Wald DACHS, Warten im Wald, dann `weg` mit v m/s, Ankunft genau t_halt."""
    dauer = sum(math.dist(a, b) for a, b in zip(weg, weg[1:])) / v
    t_los = r1(t_halt - dauer)
    t_wald = r1(t_ein + math.dist(start, waldpunkt) / 4.0)
    assert t_wald < t_los, (ziel["id"], t_wald, t_los)
    teil = fahrt(weg, t_los, v)
    teil[-1][0] = t_halt
    ende = ziel["bewegung"]["route"][-1]
    ziel["bewegung"]["route"] = [[t_ein, start[0], start[1]], [t_wald, waldpunkt[0], waldpunkt[1]]] + teil + [ende]


dachs(Z["Z-18"], (1010, 500), (860, 500), 828, WEG18, 965.9)
dachs(Z["Z-47"], (1010, 530), (875, 515), 834, WEG47, 971.9)
ersetze(Z["Z-18"]["gt"], "text", "Fährt über die Felder südlich der Ortschaft an der Schule vorbei", "Kommt aus dem Wald DACHS, fährt "
        "zwischen Ortschaft und Schule")
M16 = M["M16"]
M16["t_s"] = 970
M16["dicht_gewollt"] = "I2.1: Meldung beim Halt an der Brücke Ost (10:16:10), 10 s nach M15 – Hauptangriff, vor dem ersten Schuss 10:16:28"
M16["bild"]["zustand"] = {}
M16["bild"]["beschreibung"] = "Zwei Schützenpanzer erreichen die Brücke ELSTER Ost südlich der Straße und gehen in Stellung."
M16["sensor"].update({"waerme": "heiß (2 Fahrzeuge, Motoren laufen)", "bewegung": "kommt gerade zum Stehen",
                      "spuren": "Kettenspuren von Südosten (Wald DACHS)"})
M16["zweck"] = ("Druck an der Brücke: Die Achse SÜD kommt aus dem Wald DACHS und geht an der Brücke Ost in Stellung; der vordere SPz schießt "
                "ab 10:16:28 auf die 1. Kp. Seit 2.7 (I2.1) gemeldet, sobald er hält – vor dem ersten Schuss.")

# S8: Presse (M33) und Radpanzer (M34) früher – beide stehen schon (Bild gleich)
M["M33"]["t_s"] = 1020
M["M33"]["sensor"]["bewegung"] = "steht seit 1 min"
M["M34"]["t_s"] = 1075
M["M34"]["phase"] = 4
M["M34"]["sensor"]["bewegung"] = "steht seit 1 min"
M["M34"]["loesung"]["text"] = "nur LM (kein Mörser: Kamerateam im Wirkradius)"
M["M34"]["zweck"] = ("Gehört zu S8: Die Kolonne ist ein legitimes Ziel – aber nur so zu bekämpfen, dass das Kamerateam beim Einschlag nicht "
                     "im Radius ist. Das System warnt nicht (keine Zone). Wer bis 10:19:40 wartet, muss außerdem auf den Pkw der Familie achten.")

# Z-20/Z-48: neue erste Meldung M37 (fahren durch KRÄHE zur Brücke Ost); M19 (10:23:00, an der Brücke) wird Folgemeldung
M37 = {
    "id": "M37", "t_s": 1110, "ziele": ["Z-20", "Z-48"], "phase": 4,
    "argus": {"klasse": "Panzer", "zugehoerigkeit": "Feind", "konfidenz": 89, "empfehlung": "BEKÄMPFEN", "einzeln": [89, 86]},
    "sensor": {"waerme": "heiß (2 Fahrzeuge, fahren)", "bewegung": "nach West, ca. 15 km/h", "spuren": "frische Kettenspuren",
               "kennzeichnung": "keine erkannt", "personen": "–", "hinweis": "nur Spielleitung (seit 2.4, E6.3)"},
    "bild": {"datei": "drohne/M37.webp", "beschreibung": "Zwei Kampfpanzer fahren zwischen Ortschaft und Schule nach Westen Richtung "
             "Brücke ELSTER; das Schulgelände am unteren Bildrand.", "sicht": [], "ausschnitt_m": 150, "versatz_m": [0, 18], "merkmale": []},
    "loesung": {"entscheid": "BEKÄMPFEN", "wirkmittel": ["LM"], "text": "echtes Ziel (Achse SÜD); Schule und Ortschaft nah: nur LM"},
    "zweck": "Erste Meldung der zwei Kampfpanzer der Achse SÜD auf dem Weg zur Brücke Ost (seit 2.7, I2.2: höchstens 90 s nach der "
             "Einfahrt). Dicht an der Schule: Mörser unzulässig, LM geht.",
}
SZ["meldungen"].append(M37)
M["M37"] = M37
M["M19"]["folge_von"] = "M37"
M["M19"]["zweck"] = ("Folgemeldung zu M37: die zwei Kampfpanzer stehen an der Brücke Ost (Bereitstellung). Gegenstück zum Sanitätsfahrzeug: "
                     "gleiche Nähe zur Schule, aber echtes Ziel (Achse SÜD).")
# Z-21/Z-49: ARGUS meldet sie, sobald sie am Waldrand stehen (10:20:55) – 10:21:15 statt 10:23:30
M["M22"]["t_s"] = 1275
M["M22"]["sensor"]["bewegung"] = "steht seit 20 s"
# Z-22 (N1): Traktor fährt 10 s später ein (10:21:02 statt 10:20:52) und bis 10:22:00 etwas schneller (15 statt 13 km/h); ab dann wie
# bisher – M24 bleibt 10:22:30, Bild gleich
r = Z["Z-22"]["bewegung"]["route"]
assert r[0][0] == 1252 and r[8][0] == 1320.8
Z["Z-22"]["bewegung"]["route"] = [[r1(1262 + (t - 1252) * (1320.8 - 1262) / (1320.8 - 1252)) if t < 1320.8 else t, x, y] for t, x, y in r]
# Z-25 (M26 10:24:00): fährt erst 10:22:30 ein, hält 10:22:56–10:23:38 an der Hauptstraße, fährt dann nach Osten weg (wie bisher)
r = Z["Z-25"]["bewegung"]["route"]
assert r[0][0] == 1250 and r[7][0] == 1276.9 and r[8][0] == 1418
verschiebe(Z["Z-25"], 100, ab=None)
Z["Z-25"]["bewegung"]["route"] = [p for p in Z["Z-25"]["bewegung"]["route"][:8]] + [[t, x, y] for t, x, y in r[8:]]
# Z-26 (M27 10:24:30): fährt erst 10:23:00 ein, hält 10:23:40–10:24:06 an der Nordstraße, fährt dann nach Norden weg (wie bisher)
r = Z["Z-26"]["bewegung"]["route"]
assert r[0][0] == 1003 and r[9][0] == 1043.6 and r[10][0] == 1446
Z["Z-26"]["bewegung"]["route"] = [[t + 377, x, y] for t, x, y in r[:10]] + r[10:]
# Verstärkung V-3: Meldung 85 s nach dem Einspielen (Fahrzeuge fahren ab 0 ein)
V = {g["id"]: g for g in SZ["verstaerkungen"]["gruppen"]}
# V-3: die drei SPz fahren 25 % schneller (Halt nach 79–87 s statt 99–108 s); Meldung 90 s nach dem Einspielen (vorher 130 s), Bild gleich
v3m = V["V-3"]["meldungen"][0]
assert v3m["dt_s"] == 130
v3m["dt_s"] = 90
v3m["sensor"]["bewegung"] = "steht seit 10 s"
for z in V["V-3"]["ziele"]:
    z["bewegung"]["route"] = [[r1(t * 0.8) if t < 400 else t, x, y] for t, x, y in z["bewegung"]["route"]]
# V-4: der Mörser schießt erst nach seiner Meldung (dt 30): ab dt 45 statt 18
v4 = V["V-4"]["ziele"][0]
assert v4["feuert"][0]["von_s"] == 18
v4["feuert"][0]["von_s"] = 45

# Z-24 (N2): kommt seit 2.7 über die Nordstraße (vorher Hauptstraße 10:17:28–10:18:47) – sonst träfe ihn ein Mörser auf die Presse
# (M33, jetzt 10:17:00) oder die Radpanzer (M34, 10:17:55) im Vorbeifahren, und N2 fiele aus. Ab 10:18:47 (600, 379) wie bisher.
r = Z["Z-24"]["bewegung"]["route"]
assert r[14] == [1127.1, 600, 379]
NORD = [(722, -10), (715, 21), (709, 51), (702, 82), (695, 112), (686, 143), (676, 172), (666, 202), (655, 232), (648, 262)]
# westlich am BTR-80 Z-13 (641, 336) vorbei durch die Gärten: über 4 m von jedem Haus (assets_ebenen.test.ts), über 10 m von Z-13
# (pruefe_szenario), 18 km/h
FELD = [(648, 262), (631, 300), (630, 345), (619, 366), (600, 379)]
laenge = lambda pts: sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))  # noqa: E731
t_feld = r1(1127.1 - laenge(FELD) / 5.0)
Z["Z-24"]["bewegung"]["route"] = fahrt(NORD, r1(t_feld - laenge(NORD) / 8.0), 8.0)[:-1] + fahrt(FELD, t_feld, 5.0)[:-1] + r[14:]

# Position und Ausrichtung zur ersten Meldung (Daten `pos`/`hdg`, Drohnenbild, Prüfung): Z-47 (M16), Z-20/Z-48 (M37)
for zid, mid in (("Z-47", "M16"), ("Z-20", "M37"), ("Z-48", "M37")):
    t = M[mid]["t_s"]
    p = L.position(Z[zid], t)
    Z[zid]["pos"] = [round(p[0]), round(p[1])]
    if L.geschwindigkeit(Z[zid], t) > 0.5:
        Z[zid]["hdg"] = round(L.richtung(Z[zid], t))

# Ausnahmen (I2.2): begründet in den Daten
SPAET = {
    "Z-07": "S1: Die Attrappe steht seit Spielbeginn am Waldrand FUCHS; ARGUS meldet sie erst, als der Feind angreift (10:08:30).",
    "Z-19": "S4: Der Mörser schießt ab 10:16:46 aus dem Hof RABE; ARGUS meldet ihn erst 10:18:15 mit NICHT BEKÄMPFEN (Zivilpersonen) – "
            "der Druck der 1. Kp (I-07) gehört zum Fall.",
    "Z-41": "S5: Der Schutzschild-SPz schießt ab 10:15:30 vor dem Wohnhaus; ARGUS meldet ihn 10:16:30 – gehört zum Fall.",
    "Z-24": "N2: Zustandswechsel – ARGUS meldet den Panzer erst, nachdem die 1. Kp ihn getroffen hat (10:19:30).",
}
for zid, grund in SPAET.items():
    Z[zid]["spaet_gewollt"] = grund

# =============================================================================== I3 Polnische PT-91 kämpfen sichtbar mit, Auflösung nach 90 s
E01 = next(e for e in SZ["ereignisse"] if e["id"] == "E-01")
SCHUSS_AB, SCHUSS_TAKT, SCHUESSE = 1245, 20, 8
E01["bedingung"]["t_s"] = SCHUSS_AB
E01["wirkungen"] = [{"t_s": SCHUSS_AB + k * SCHUSS_TAKT, "von": ("Z-15", "Z-16", "Z-17")[k % 3]} for k in range(SCHUESSE)]
E01["ziele_reihenfolge"] = ["Z-02", "Z-18", "Z-47", "Z-48", "Z-20", "Z-36", "Z-27", "Z-28"]
E01["bereich"] = {"x": [450, 610], "y": [320, 450], "name": "Brücke ELSTER Ost"}
E01["regel"] = ("Seit 2.7 (I3.1): Die PT-91 schießen ab 10:20:45, sobald sie im ersten Halt südlich der Brücke stehen, alle 20 s auf die "
                "Feindkräfte an der Brücke Ost – je Schuss auf das erste Fahrzeug in ziele_reihenfolge (Reihenfolge der Ankunft), das dann im "
                "Bereich steht, nicht zerstört und ein legitimes Ziel ist; steht keines da, geht der Schuss nicht hinaus. Bekämpft das Team "
                "vorher Z-15–17, entfällt E-01 bzw. bricht ab: Der Angriff endet und die Panzer bleiben stehen. Der Panzer Z-24 (außer "
                "Gefecht, Besatzung ergibt sich) wird nicht beschossen (nicht in der Liste).")
E01["papier"] = "SL 1 trägt die Wirkungen ab 10:20:45 auf der Kontrollkarte ein (Schuss alle 20 s) und gibt I-08b um 10:23:20."
# Ground Truth der PT-91 (für SL und Drehbuch): Feuer schon aus dem ersten Halt, später Feuerstellung dicht südlich der Brücke
ersetze(Z["Z-15"]["gt"], "text", "ab 10:22:45 in Feuerstellung südlich der Brücke",
        "ab 10:20:47 im ersten Halt südlich der Brücke und schießt von dort auf die Feindkräfte an der Brücke Ost, ab 10:22:37 in "
        "Feuerstellung dicht südlich der Brücke")
I["I-08b"]["bedingung"]["t_s"] = 1400
SZ["aufloesungen"] = [{
    "id": "A-01", "meldung": "M20", "ziele": ["Z-15", "Z-16", "Z-17"], "nach_s": 90, "als": "verbuendet", "fall": "S3",
    "name": "PL-PzKp (verbündet)", "vermerk": "verbündet – nicht bekämpfen", "inject": "I-17",
    "getroffen": {"inject": "I-08a", "name": "PL-PzKp (verbündet, getroffen)"},
    "hinweis": "Seit 2.7 (I3.2): Hat das Team bis nach_s nach der Meldung keine Wirkung auf die Ziele freigegeben, werden sie als verbündet "
               "markiert (Zeichen blau, Meldung verschwindet aus dem Eingang mit Vermerk, Lagemeldung). Danach ist keine Freigabe mehr möglich. "
               "Nach einer Freigabe vorher: Eigenbeschuss (I-08a), das Zeichen wird mit I-08a „verbündet, getroffen“.",
}]
SZ["injects"].append({
    "id": "I-17", "an": "Team", "von": "PL-PzKp", "fall": "S3",
    "bedingung": {"typ": "keine_freigabe_bis", "ziele": ["Z-15", "Z-16", "Z-17"], "t_s": 1305},
    "text": "PL-PzKp: Feuerstellung Feldweg Süd bezogen, bekämpfen Feind an der Brücke Ost.",
    "zweck": "Seit 2.7 (I3.2): Auflösung von S3 nach Zeit – 90 s nach M20 ohne Freigabe sind die PT-91 als verbündet erkannt.",
})
I = {i["id"]: i for i in SZ["injects"]}
S3 = F["S3"]
ersetze(S3, "kern", "Ab 23:30 schießen die PT-91 aus Feuerstellungen südlich der Brücke auf die Feindkräfte an der Brücke.",
        "Ab 10:20:45 schießen die PT-91 aus Feuerstellungen südlich der Brücke sichtbar auf die Feindkräfte an der Brücke Ost (auf der "
        "Karte und im Drohnenbild); wer bis 10:21:45 nicht bekämpft hat, sieht sie dann als verbündet markiert.")
S3["info_bei"] = "Lagemeldung I-04 im Feed (17:00); ab 20:45 auf der Karte: sie schießen auf den Feind; im Bild nicht erkennbar"
S3["leitfragen"].insert(2, "Wer hat auf die Karte geschaut? Ab 20:45 schossen die PT-91 sichtbar auf den Feind an der Brücke Ost.")
ersetze(I["I-08b"], "zweck", "Rückmeldung, wenn S3 richtig gelöst wurde", "Rückmeldung nach dem letzten Schuss der PT-91 (seit 2.7 10:23:20), "
        "wenn S3 richtig gelöst wurde")
for g in SZ["durchbruch"]["gruppen"]:
    if g["id"] in ("D-04", "D-05", "D-06", "D-07", "D-08"):
        g["zweck"] = ("Letzte Feindkräfte an der Brücke Ost: Läuft der polnische Gegenangriff (E-01, seit 2.7 ab 10:20:45 alle 20 s), ist "
                      "das Fahrzeug vorher zerschlagen; fällt E-01 aus (Freigabe auf die PT-91), greift es über die Brücke an.")

# =============================================================================== I4 Lagemeldungen 30 s, dann weg
REG["anzeige"]["lagemeldung_s"] = 30
REG["anzeige"]["hinweis"] = ("Seit 2.7 (I4): Eine Lagemeldung steht lagemeldung_s Sekunden (Spielzeit) im Feed oder bis sie angeklickt wird (✕), "
                             "dann ist sie ganz weg – keine Liste „frühere Meldungen“. Das Protokoll zeigt, ob und nach wie vielen Sekunden "
                             "sie angeklickt wurde. Bestand ab bestand_knapp und weniger: Warnung in Kopfzeile und am Knopf.")

# =============================================================================== G Auswertung (15 min)
REG["bilanz"] = {
    "hinweis": "Seit 2.7 (G2.4): grobe, gerundete Spielwerte nur für die Bilanz der Auswertung („Das ist es wert“). Personen und Beobachter "
               "haben keinen Wert; Fehlbekämpfungen erscheinen ohne Eurowert.",
    "fahrzeuge_mio_eur": {"kpz_t72": 1.2, "spz_bmp2": 0.3, "spw_btr80": 0.3, "spaehpz_brdm2": 0.15, "gfz_tigr": 0.2, "lkw_ural": 0.1,
                          "eloka_lkw": 0.5, "moerser_trupp": 0.1},
    "munition_eur": {"LM": 100000, "MRS": 2000, "PZA": 10000},
    "fuss": "Grobe Spielwerte nach öffentlichen Schätzungen (z. B. T-72 ca. 1,2 Mio USD, BMP-2 Export über 0,3 Mio USD, Switchblade 600 "
            "geschätzt 80–176 Tsd. USD).",
    # Zählweise (tools/referenz/bilanz.py = src/kern/bilanz.ts): Personen je Gruppe einmal, Fahrzeuge je Fahrzeug einmal
    "fehl": [
        {"id": "sanitaet", "text": "Sanitätsfahrzeug", "zeichen": "✚", "einheit": "Fahrzeug"},
        {"id": "zivil", "text": "Zivilpersonen", "zeichen": "●", "kinder": True, "einheit": "Personen"},
        {"id": "kamerateam", "text": "Kamerateam", "zeichen": "▣", "einheit": "Personen"},
        {"id": "verwundete", "text": "Verwundete", "zeichen": "✚", "einheit": "Personen"},
        {"id": "weisses_tuch", "text": "Besatzung mit weißem Tuch", "zeichen": "⚑", "einheit": "Personen"},
        {"id": "verbuendet", "text": "Verbündete", "zeichen": "◆", "einheit": "Panzer"},
        {"id": "attrappe", "text": "Attrappe", "zeichen": "◇", "einheit": "Attrappe"},
    ],
    # Ziele, die eine Gruppe von Menschen darstellen (ohne Personenliste): so viele Personen zählen in der Bilanz
    "personen_je_typ": {"verwundete": 4},
}
AUS = SZ["auswertung"]
AUS["einstieg"] = ("Seit 2.7 (G): 15 min nach dem Spiel – Teamvergleich (1 min), Replay S3 und S2 (4 min), Bilanz „Das ist es wert“ mit "
                   "„ARGUS allein“ (2 min), Impuls (1 min), Diskussion mit Wertekompass (6 min), Abschluss (1 min). Kennzahlen, Konfidenz, "
                   "Preis des Abwartens und die übrigen Fälle sind zuschaltbar.")
AUS["kapitel"] = [
    {"id": "teams", "titel": "Teamvergleich", "sek": 60},
    {"id": "replay", "titel": "Replay", "sek": 240},
    {"id": "bilanz", "titel": "Bilanz – Das ist es wert", "sek": 120},
    {"id": "impuls", "titel": "Impuls", "sek": 60},
    {"id": "diskussion", "titel": "Diskussion", "sek": 360},
    {"id": "abschluss", "titel": "Abschluss", "sek": 60},
]
AUS["zuschaltbar"] = [
    {"id": "kennzahlen", "titel": "Kennzahlen je Team", "sek": 45, "nach": "teams"},
    {"id": "konfidenz", "titel": "Was die Konfidenz sagt", "sek": 30, "nach": "teams"},
    {"id": "preis", "titel": "Preis des Abwartens", "sek": 60, "nach": "replay"},
]
AUS["replay"] = {"standard": ["S3", "S2"], "zuschaltbar": ["S1", "S4", "S5", "S6", "S7", "S8"], "budget_s": 240,
                 "hinweis": "Seit 2.7 (G1.1): Das Replay hat 4 min; Standard S3 und S2 je 2:00, weitere Fälle zuschaltbar (die Zeit je Fall sinkt)."}
AUS["referenz"] = {
    "name": "ARGUS allein",
    "regel": "Jede Meldung mit Empfehlung BEKÄMPFEN wird zur Meldezeit ohne Prüfung freigegeben; Wirkmittel: Mörser, wenn am Einschlagort "
             "ohne Warnung zulässig, sonst LM, sonst Kanone. PRÜFEN, UNKLAR und NICHT BEKÄMPFEN bleiben liegen. Dieselbe Engine wie die Teams "
             "(Trefferregel, Verlustmodell, Durchbruch, E-01); gerechnet beim Öffnen der Auswertung, gleich der Simulation.",
    "reihenfolge_wirkmittel": ["MRS", "LM", "PZA"],
}
AUS["bilanz"] = {
    "titel": "Bilanz – Das ist es wert",
    "hinweis_sl": "ARGUS allein war schneller, hat mehr zerstört und die eigenen Panzer geschont. Warum braucht es euch noch?",
    "nicht_in_bilanz": "Nicht in der Bilanz",
    "zitat": {"text": "… 20 seconds for each target …", "quelle": "Offizier „B.“, +972 Magazine, Yuval Abraham, 03.04.2024"},
}
AUS["impuls"] = {
    "frage": "Stimmt ihr zu?",
    "folien": [
        {"id": "zitat", "ohne_quelle": True,
         "original": "I have much more trust in a statistical mechanism than a soldier who lost a friend two days ago. […] The machine did it "
                     "coldly. And that made it easier.",
         "deutsch": "Ich vertraue einem statistischen Mechanismus viel mehr als einem Soldaten, der vor zwei Tagen einen Freund verloren hat. "
                    "[…] Die Maschine hat es kalt gemacht. Und das hat es leichter gemacht."},
        {"id": "aufgedeckt",
         "titel": "Offizier „B.“ über das KI-Zielsystem „Lavender“ der israelischen Armee im Gaza-Krieg",
         "quelle": "+972 Magazine, Yuval Abraham, 03.04.2024",
         "punkte": [
             {"text": "rund 20 s Prüfung je Ziel", "zitat": "I had zero added value as a human, apart from being a stamp of approval."},
             {"text": "bekannte Fehlerquote etwa 10 %", "zitat": "statistically it's fine. So you go for it."},
             {"text": "bis zu 15–20 zivile Tote je niedrigrangigem Ziel als zulässig"},
         ],
         "vorspann": "Laut den Quellen des Berichts:",
         "pflicht": "Die israelische Armee bestreitet wesentliche Darstellungen des Berichts."},
        {"id": "karp", "zuschaltbar": True, "wer": "Alex Karp", "rolle": "Chef von Palantir", "anlass": "Investorengespräch Feb. 2025",
         "vorspann": "über den Zweck seiner Firma:", "original": "… when it's necessary, to scare enemies and on occasion kill them."},
        {"id": "thiel", "zuschaltbar": True, "wer": "Peter Thiel", "rolle": "Palantir-Mitgründer",
         "anlass": "„Good for Google, Bad for America“, NYT 01.08.2019", "original": "A.I. is a military technology."},
        {"id": "luckey", "zuschaltbar": True, "wer": "Palmer Luckey", "rolle": "Anduril", "anlass": "Pepperdine University, 01.10.2024",
         "original": "And my point to them is, where's the moral high ground in a landmine that can't tell the difference between a school "
                     "bus full of kids and a Russian tank?"},
        {"id": "guterres", "zuschaltbar": True, "gegenstimme": True, "wer": "António Guterres", "rolle": "UN-Generalsekretär",
         "anlass": "Mai 2025", "vorspann": "Maschinen, die ohne menschliche Kontrolle Leben nehmen, seien",
         "original": "politically unacceptable, morally repugnant"},
    ],
    "hinweis": "Zitate wörtlich nach Änderungsliste G (G3.3): nichts kürzen außer mit „…“, keine weiteren Zitate.",
}
AUS["diskussion"] = {
    "titel": "Wertekompass",
    "quelle": "nach „Meine Innere Führung – Mein Wertekompass“",
    "werte": ["Menschenwürde", "Freiheit", "Frieden", "Gerechtigkeit", "Solidarität", "Demokratie", "Grundrechte"],
    "tugenden": ["Tapferkeit", "Treue", "Kameradschaft", "Disziplin", "Gehorsam", "Mut", "Vertrauen", "Bescheidenheit"],
    "leitfragen": [
        {"titel": "Menschenwürde", "werte": ["Menschenwürde"],
         "text": "Wenn eine KI besser unterscheidet als eine Mine oder ein müder Mensch – ist ihr Einsatz dann sogar geboten? Was hat ARGUS im "
                 "Spiel nicht unterschieden?"},
        {"titel": "Effizienz gegen Würde", "werte": [],
         "text": "Darf der „Wert“ zerstörter Fahrzeuge oder geschonter eigener Panzer gegen Zivilpersonen und Verwundete aufgerechnet werden? "
                 "(Utilitarismus gegen Pflichtethik)"},
        {"titel": "Gehorsam und Gewissen", "werte": ["Gehorsam"],
         "text": "Zeitvorgabe von 30 s je Meldung, Druck der 1. Kp – wann wird der Mensch „in the loop“ zum Stempel?"},
        {"titel": "Mut und Bescheidenheit", "werte": ["Mut", "Bescheidenheit"],
         "text": "Was braucht ein Offizier, um einer Maschine mit 96 % zu widersprechen – und um die Grenzen der Maschine zu kennen?"},
        {"titel": "Grenze", "werte": [],
         "text": "Wo zieht ihr sie – Entscheidungsunterstützung, Freigabe ohne Prüfung („ARGUS allein“), volle Autonomie?"},
    ],
}
AUS["abschluss"] = {
    "kernaussagen": [
        {"titel": "Der Wertekompass gibt Orientierung, auch wenn die Maschine eine Zahl liefert.", "text": "Konfidenz ist keine Wahrheit."},
        {"titel": "Effizienz ist ein Argument, kein Freibrief.", "text": "Was keinen Preis hat, taucht in keiner Bilanz auf."},
        {"titel": "KI unterstützt, der Mensch entscheidet.", "text": "„In the loop“ braucht Zeit, Information und Mut zum Widerspruch."},
        {"titel": "Verantwortung lässt sich nicht delegieren.", "text": "Verantwortlich bleibt, wer freigibt."},
    ],
}
for a in SZ["ablauf_unterricht"]:
    if a["phase"] == "Auswertung":
        a["dauer_min"] = 15
        a["inhalt"] = ("Teamvergleich, Replay S3 und S2, Bilanz „Das ist es wert“ mit ARGUS allein, Impuls (Zitat), Diskussion mit "
                       "Wertekompass, Abschluss")

# =============================================================================== Ordnung und Speichern
SZ["meldungen"].sort(key=lambda m: (m["t_s"], m["id"]))
os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(FZK, os.path.join(ZIEL, "katalog_fahrzeuge.json"))
L.speichere(WMK, os.path.join(ZIEL, "katalog_wirkmittel.json"))
L.speichere(KARTE, os.path.join(ZIEL, "karte_kraehe.json"))
nr = {m["id"]: i + 1 for i, m in enumerate(SZ["meldungen"])}
print(f"Szenario {SZ['version']}: {len(SZ['ziele'])} Ziele, {len(SZ['meldungen'])} Meldungen, {len(SZ['injects'])} Lagemeldungen → {ZIEL}")
print("Zielnummern neu: " + ", ".join(f"{m} = Ziel {nr[m]}" for m in ("M11", "M16", "M33", "M34", "M37", "M20", "M22", "M19")))
