#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.2 aus v2.1: Änderungen nach dem 2. Solo-Durchlauf am 28.10.2026 (Liste C1–C9).

  C1/C5  Kein Fahrzeug erscheint mitten im Bild. Die Spieler sehen jedes Fahrzeug ab der Einfahrt als „Kontakt“ (Oberfläche,
         src/kern/lagebild.ts); dafür muss es in der Lage auch vom Kartenrand einfahren: Die Mörser Z-06 (Wald MARDER) und Z-19
         (Hof RABE), der BMP-2 Z-21 (Wald DACHS) und der Mörsertrupp der Verstärkung V-4 fahren jetzt vom Rand ein (Mörser auf
         Lkw, Sprite beim Fahren aus dem Katalog: sprite_fahrt). Fahrzeuge halten Abstand: in einer Meldung oder Gruppe ≥ 15 m,
         sonst ≥ 10 m (Z-02, Z-04, Z-05, Z-08–10, Z-14, Z-24, Z-26, Z-33 und die Durchbruch-Routen nachgezogen).
  C3     Keine Meldelücke über 60 s: neue Meldungen M28 (Tigr Z-03 fährt zur Brücke, 02:10), M29 (Tigr Z-04 in Beobachtung,
         03:05) und M30 (neuer BRDM-2 Z-37 als vorgeschobener Beobachter am Nordrand der Ortschaft, 09:20); Routinemeldungen
         gleichmäßiger: M06 07:00 → 06:30, M07 07:35 → 07:30, M09 10:00 → 10:15, M13 14:30 → 14:15, M19 19:00 → 19:15.
         Zeiten der Schlüssel- und Nebenfälle bleiben. Die Meldungs-IDs bleiben (die neuen heißen M28–M30); die Spieler sehen
         „Ziel n“ in der Reihenfolge der Zeitleiste.
  C6     Loitering Munition trifft genau ein Fahrzeug (katalog_wirkmittel: nur_zielfahrzeug; regeln.json wirkung.praezision).
  C7     Größenangabe der zugweisen Meldungen nach APP-6 (katalog_fahrzeuge: symbol.einheit und groesse_nach_anzahl).
  C9     EloKa-Meldung M25: Störung deutlich stärker (Bild 85 %, Bildalter 18 s), ARGUS meldet „Ziel unbekannt“ mit 38 % (UNKLAR);
         die Sensordaten bleiben der Hinweis.

Einmalig benutzt wie bau_szenario_v21.py; maßgeblich ist danach die JSON-Datei. Das Skript bleibt als Nachweis, wie
Routen, Positionen, Fahrtrichtungen und Sensortexte zusammenpassen.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v22.py public/daten OUT_ORDNER
Liest die Daten v2.1 aus dem ersten Ordner und schreibt Szenario, Regeln und Kataloge nach OUT_ORDNER.
"""
import copy
import json
import math
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
assert ALT["version"] == "2.1", "Basis muss Szenario 2.1 sein"
SZ = copy.deepcopy(ALT)
K = D["karte"]
REG = copy.deepcopy(D["regeln"])
with open(os.path.join(QUELLE, ALT["kataloge"]["fahrzeuge"]), encoding="utf-8") as f:
    FZK = json.load(f)
with open(os.path.join(QUELLE, ALT["kataloge"]["wirkmittel"]), encoding="utf-8") as f:
    WMK = json.load(f)
Z = {z["id"]: z for z in SZ["ziele"]}
M = {m["id"]: m for m in SZ["meldungen"]}
GEAENDERT = set()


def F(t0, start):
    return Fahrt(K, t0, start)


def setze_route(zid, route, bis=None):
    z = Z[zid]
    z["bewegung"] = {"route": route.route() if isinstance(route, Fahrt) else route}
    if bis is not None:
        z["bis_s"] = bis
    GEAENDERT.add(zid)


def rt(zid):
    return Z[zid]["bewegung"]["route"]


def ersetze_punkt(zid, alt_xy, neu_xy):
    """Ersetzt alle Stützpunkte mit den Koordinaten alt_xy (Halt) durch neu_xy."""
    n = 0
    for p in rt(zid):
        if (p[1], p[2]) == tuple(alt_xy):
            p[1], p[2] = neu_xy
            n += 1
    assert n, (zid, alt_xy)
    GEAENDERT.add(zid)


# =============================================================================== C1: vom Rand einfahren
# Mörser Z-06: auf Lkw durch den Wald MARDER vom Ostrand an den Waldrand, Stellung ab 04:42, Feuer ab 05:02
setze_route("Z-06", [[250, 1010, 100], [268, 960, 104], [282, 920, 105]])
Z["Z-06"].pop("ab_s", None)
for p in Z["Z-06"]["personen"]:
    p["ab_s"] = 282                        # Bedienung sitzt ab, wenn der Lkw steht
Z["Z-06"]["gt"]["text"] = ("Mörsertrupp mit zwei Rohren (auf Lkw), fährt um 10:04:10 durch den Wald MARDER an den Waldrand, unterstützt die "
                          "Gefechtsaufklärung und den Angriff.")

# Mörser Z-19: auf Lkw vom Ostrand über die Hauptstraße in den Hof RABE (hinter Z-14, vor allen anderen auf der Straße)
f = F(930, (1010, 308)).strasse("hauptstrasse", (758, 350), 25).gelaende([(758, 315), (768, 305)], 12)
setze_route("Z-19", f)
Z["Z-19"].pop("ab_s", None)
ankunft_19 = rt("Z-19")[-1][0]
for p in Z["Z-19"]["personen"]:
    if p["art"] == "soldat":
        p["ab_s"] = ankunft_19
Z["Z-19"]["gt"]["text"] = Z["Z-19"]["gt"]["text"].replace(
    "Mörsertrupp im Hof RABE,", "Mörsertrupp (auf Lkw), fährt um 10:15:30 über die Hauptstraße in den Hof RABE,")

# BMP-2 Z-21: fährt durch den Wald DACHS in die Lauerstellung (verdeckt), kommt um 10:20:30 heraus
setze_route("Z-21", [[1118, 1010, 585], [1170, 880, 580], [1185, 842, 576], [1230, 842, 576], [1250, 790, 560]])
Z["Z-21"]["gt"]["text"] = ("SPz BMP-2, fährt um 10:18:40 durch den Wald DACHS in eine Lauerstellung am Waldrand, kommt um 10:20:30 heraus und "
                          "sichert die Flanke der Feindkräfte, die sich an der Brücke sammeln.")

# Verstärkung V-4: Mörsertrupp auf Lkw vom Nordrand an den Waldrand MARDER, Feuer ab +18 s
VG = {g["id"]: g for g in SZ["verstaerkungen"]["gruppen"]}
v41 = VG["V-4"]["ziele"][0]
v41["bewegung"] = {"route": [[0, 862, -10], [14, 862, 45]]}
v41.pop("ab_s", None)
for p in v41["personen"]:
    p["ab_s"] = 14

# Verstärkungen: das vordere Fahrzeug zieht zuerst ab, die anderen folgen mit Abstand (vorher Auffahren beim Abzug)
def abzug(z, t_halt_ende, neu_ende):
    """Verschiebt das Ende des Halts (und alles danach) von t_halt_ende auf neu_ende."""
    r = z["bewegung"]["route"]
    dt = neu_ende - t_halt_ende
    k = next(i for i, p in enumerate(r) if abs(p[0] - t_halt_ende) < 1e-6)
    for p in r[k:]:
        p[0] = round(p[0] + dt, 1)
    if z.get("bis_s") is not None:
        z["bis_s"] = r[-1][0]


VZ = {z["id"]: z for g in SZ["verstaerkungen"]["gruppen"] for z in g["ziele"]}
abzug(VZ["V1-2"], 176, 170)
abzug(VZ["V1-1"], 170, 178)
abzug(VZ["V2-2"], 300, 306)
abzug(VZ["V2-1"], 300, 312)
abzug(VZ["V5-2"], 206, 200)
abzug(VZ["V5-1"], 200, 206)

# =============================================================================== C1: Abstände (Meldung/Gruppe ≥ 15 m, sonst ≥ 10 m)
# Spähtrupp NORD: Z-04 hält beim ersten Halt weiter östlich (vorher 14 m neben Z-03)
ersetze_punkt("Z-04", (553, 140), (560, 150))
# Spähtrupp HAUPT: Z-02 hält 15 m nördlich der Hauptstraße an der Brücke Ost (vorher auf der Fahrbahn, 14 m neben Z-18)
r2 = rt("Z-02")
assert (r2[-2][1], r2[-2][2]) == (482, 390) and (r2[-3][1], r2[-3][2]) == (506, 405)
r2[-2] = [round(r2[-3][0] + L.dist((506, 405), (476, 375)) / (16 / 3.6), 1), 476, 375]
r2[-1] = [r2[-1][0], 476, 375]
GEAENDERT.add("Z-02")
# Z-11 stößt an die Brücke vor und hält nördlich der Fahrbahn (Wrack nicht auf der Straße, Abstand zu Z-09 ≥ 15 m)
r11 = rt("Z-11")
i = next(k for k, p in enumerate(r11) if (p[1], p[2]) == (600, 330))
r11[i + 1:] = [[538, 560, 385], [552, 497, 377], [1500, 497, 377]]
GEAENDERT.add("Z-11")
# N3: BMP-2 Z-05 steht unter der Baumgruppe östlich des Feldwegs Nordost, abseits der Anmarsch- und Rückzugswege
r5 = rt("Z-05")
assert (r5[-1][1], r5[-1][2]) == (812, 214) and (r5[-2][1], r5[-2][2]) == (834, 194)
_v = 15 / 3.6
_t1 = round(r5[-2][0] + L.dist((834, 194), (828, 220)) / _v, 1)
r5[-1:] = [[_t1, 828, 220], [round(_t1 + L.dist((828, 220), (824, 238)) / _v, 1), 824, 238]]
GEAENDERT.add("Z-05")
# Verstärkter Zug sammelt am Feldweg Nordost nebeneinander statt durcheinander: Z-08 (955,172), Z-10 (925,198), Z-09 (895,222)
r9 = rt("Z-09")
i = next(k for k, p in enumerate(r9) if (p[1], p[2]) == (805, 212))
r9[i + 1:] = [[682, 895, 222], [794, 895, 222], [802, 905, 190], [808, 925, 165], [814, 955, 156], [819, 985, 153], [824, 1010, 150]]
Z["Z-09"]["bis_s"] = 824
r10 = rt("Z-10")
i = next(k for k, p in enumerate(r10) if (p[1], p[2]) == (810, 195))
r10[i + 1:] = [[687, 925, 198], [798, 925, 198], [804, 935, 175], [810, 962, 160], [815, 985, 153], [820, 1010, 150]]
Z["Z-10"]["bis_s"] = 820
GEAENDERT.update({"Z-09", "Z-10"})
# M07 um 07:30: Z-09 und Z-10 halten etwas früher (gestaffelt hinter dem Kampfpanzer)
for zid, (xy, t_neu) in {"Z-09": ((690, 254), 444), "Z-10": ((700, 214), 446)}.items():
    p = next(p for p in rt(zid) if (p[1], p[2]) == xy)
    p[0] = t_neu
# Achse ORT: Z-14 hält beim zweiten Halt nördlich der Fahrbahn (das Sanitätsfahrzeug fährt um 10:16:40 vorbei)
ersetze_punkt("Z-14", (632, 374), (632, 360))
# Z-24 (zweite Staffel) fährt erst ein, wenn das Sanitätsfahrzeug den Raum verlassen hat (vorher Gegenverkehr auf der Hauptstraße)
r24 = rt("Z-24")
t_alt0, t_alt1 = r24[0][0], 1127                    # bis 10:18:47 neu takten
t_neu0 = 1048
for p in r24:
    if p[0] <= t_alt1:
        p[0] = round(t_neu0 + (p[0] - t_alt0) * (t_alt1 - t_neu0) / (t_alt1 - t_alt0), 1)
GEAENDERT.add("Z-24")
# Z-26 (BRDM-2, Beobachtungsposten Nordstraße) kommt vom Nordrand über die Nordstraße statt über die Hauptstraße
r26 = rt("Z-26")
rest = [p for p in r26 if p[0] >= 1438]             # Ende des Halts an der Nordstraße und Ausweichen nach Norden bleiben
f = F(1003, (722, -10)).strasse("nordstrasse", (648, 262), 25)
setze_route("Z-26", f.route()[:-1] + [[round(f.t, 1), 648, 262]] + [p for p in rest if p[0] > f.t])
Z["Z-26"]["gt"]["text"] = ("Spähpanzer BRDM-2, kommt um 10:16:43 über die Nordstraße, Beobachtungsposten an der Nordstraße in der Ortschaft, "
                          "weicht um 10:23:58 nach Norden aus.")
# Achse NORD: Z-33 fährt am Wrack von Z-31 vorbei (vorher 7 m)
ersetze_punkt("Z-33", (470, 268), (472, 256))

# =============================================================================== C3: neues Ziel Z-37 (vorgeschobener Beobachter)
f = (F(525, (722, -10)).strasse("nordstrasse", (698, 95), 25).halt(bis=600)
     .strasse("nordstrasse", (722, -10), 25))
z37 = {
    "id": "Z-37", "typ": "spaehpz_brdm2", "pos": [698, 95], "hdg": 0, "bis_s": None,
    "bewegung": {"route": f.route()},
    "personen": [],
    "gt": {"kategorie": "feind", "legitim": True,
           "text": ("Spähpanzer BRDM-2 mit vorgeschobenem Beobachter: kommt um 10:08:45 über die Nordstraße, lenkt vom Nordrand der "
                    "Ortschaft das Feuer der Feindartillerie auf die 2. Kp und zieht sich um 10:10 mit dem Rückzug des verstärkten Zuges nach "
                    "Norden zurück.")},
}
z37["bis_s"] = round(f.t, 1)
SZ["ziele"].append(z37)
Z["Z-37"] = z37
GEAENDERT.add("Z-37")


# =============================================================================== C3: Meldungen
def neue_meldung(nach, m):
    i = next(k for k, x in enumerate(SZ["meldungen"]) if x["id"] == nach)
    SZ["meldungen"].insert(i + 1, m)
    M[m["id"]] = m


neue_meldung("M02", {
    "id": "M28", "t_s": 130, "ziele": ["Z-03"], "phase": 1, "folge_von": "M02",
    "argus": {"klasse": "Radfahrzeug (mil.) Tigr", "konfidenz": 88, "empfehlung": "BEKÄMPFEN"},
    "sensor": {"waerme": "heiß (Motor, fährt)", "bewegung": "", "spuren": "Radspuren von Norden", "kennzeichnung": "keine erkannt",
               "personen": "–"},
    "bild": {"datei": "drohne/M28.webp", "beschreibung": "Geländewagen in Tarnfarbe fährt über das Feld westlich der Ortschaft nach Süden, "
                                                          "Richtung Brücke ELSTER.", "sicht": []},
    "loesung": {"G1": "ANNEHMEN", "G2": "BEKÄMPFEN", "G3": "FREIGABE"},
    "zweck": ("Folgemeldung: Der Spähtrupp NORD teilt sich, ein Fahrzeug fährt über die Felder an die Brücke vor. Füllt die Pause nach den "
              "ersten Meldungen; je näher es der Brücke kommt, desto eher nur LM oder PzAbw."),
})
neue_meldung("M28", {
    "id": "M29", "t_s": 185, "ziele": ["Z-04"], "phase": 1, "folge_von": "M02",
    "argus": {"klasse": "Radfahrzeug (mil.) Tigr", "konfidenz": 58, "empfehlung": "UNKLAR", "hinweis": "teilverdeckt"},
    "sensor": {"waerme": "warm (Motor im Leerlauf)", "bewegung": "", "spuren": "Radspuren von Norden", "kennzeichnung": "keine erkannt",
               "personen": "2 Personen in Uniform mit Fernglas"},
    "bild": {"datei": "drohne/M29.webp", "beschreibung": "Geländewagen hält am Rand einer Baumgruppe auf dem Feld nordwestlich der Ortschaft, "
                                                          "zwei Soldaten beobachten mit Fernglas nach Westen.",
             "sicht": [{"art": "baeume", "anteil": 0.5, "lage": "Ziel", "seite": "hinten"}],
             "personen": [{"bei": "Z-04", "art": "soldat", "anzahl": 2, "versatz_m": [-4.6, 2.2]}]},
    "loesung": {"G1": "ANNEHMEN (ARGUS unsicher, Sensordaten und Ziel 2 bestätigen)", "G2": "BEKÄMPFEN", "G3": "FREIGABE"},
    "zweck": ("Folgemeldung: Der zweite Tigr des Spähtrupps NORD hält unter Bäumen in Beobachtung. ARGUS ist so unsicher, dass es nichts "
              "empfiehlt (UNKLAR) – das Ziel ist trotzdem echt; Sensordaten und die erste Meldung des Spähtrupps bestätigen es. "
              "Gegenstück zum Traktor (N1): UNKLAR heißt weder harmlos noch gefährlich."),
})
neue_meldung("M08", {
    "id": "M30", "t_s": 560, "ziele": ["Z-37"], "phase": 2,
    "argus": {"klasse": "Spähpanzer BRDM-2", "konfidenz": 86, "empfehlung": "BEKÄMPFEN"},
    "sensor": {"waerme": "warm (Motor im Leerlauf)", "bewegung": "", "spuren": "Radspuren von Norden", "kennzeichnung": "keine erkannt",
               "personen": "1 Person im Turmluk, Fernglas"},
    "bild": {"datei": "drohne/M30.webp", "beschreibung": "Spähpanzer steht an der Nordstraße am Nordrand der Ortschaft zwischen zwei Häusern, "
                                                          "Turmluk offen, Blick nach Westen.",
             "sicht": [],
             "zustand": {"Z-37": "luk_offen"},
             "personen": [{"bei": "Z-37", "art": "soldat", "anzahl": 1, "versatz_m": [-0.3, 0.0], "oben": True}]},
    "loesung": {"G1": "ANNEHMEN", "G2": "BEKÄMPFEN (LM: Ortschaft, PzAbw außerhalb des Einsatzbereichs)", "G3": "FREIGABE"},
    "zweck": ("Vorgeschobener Beobachter der Feindartillerie am Nordrand der Ortschaft: echtes Ziel, wegen der Ortschaft nur LM (R3), "
              "die PzAbw reicht nicht so weit. Füllt die Pause zwischen Attrappe und Rückzug."),
})

# Routinemeldungen gleichmäßiger (Schlüssel- und Nebenfälle bleiben)
for mid, t in {"M06": 390, "M07": 450, "M09": 615, "M13": 855, "M19": 1155}.items():
    M[mid]["t_s"] = t
SZ["meldungen"].sort(key=lambda m: m["t_s"])
M["M06"]["bild"]["beschreibung"] = "Kampfpanzer im Feld nordöstlich der Ortschaft, fährt nach Westen auf die Brücke zu."
M["M07"]["bild"]["beschreibung"] = "Zwei Schützenpanzer halten gestaffelt im Feld hinter dem Kampfpanzer, ein dritter schließt auf."
M["M07"]["sensor"]["waerme"] = "heiß (3 Fahrzeuge, Motoren laufen)"
M["M13"]["bild"]["beschreibung"] = "Drei Kampfpanzer fahren gestaffelt vom Feldweg Nordost ins offene Feld, Richtung Westen."
M["M19"]["sensor"]["waerme"] = "heiß (Motor läuft)"
M["M19"]["bild"]["beschreibung"] = ("Kampfpanzer steht an der Brücke ELSTER Ost südlich der Straße, das Schulgelände am Bildrand. Rauch aus "
                                   "der Ortschaft zieht ins Bild.")
Z["Z-20"]["gt"]["text"] = ("KPz T-72 der Achse SÜD. Fährt zwischen Ortschaft und Schule nach Westen und sammelt ab 10:19:05 an der Brücke "
                          "ELSTER Ost (bei der Meldung ca. 75 m vom Schulgelände).")

# =============================================================================== C9: EloKa-Meldung M25
m25 = M["M25"]
m25["argus"] = {"klasse": "Ziel unbekannt", "konfidenz": 38, "empfehlung": "UNKLAR", "hinweis": "Bildstörung"}
m25["sensor"].update({"waerme": "warm (Generator läuft, Mast mit Sendeteil warm)", "bildalter_s": 18})
m25["bild"]["beschreibung"] = ("Kaum zu erkennen: ein Fahrzeug mit Mast im Feld östlich der Ortschaft. Starkes Bildrauschen und Streifen, "
                               "das Bild ist 18 s alt: Der Datenlink ist stark gestört.")
m25["bild"]["sicht"] = [{"art": "stoerung", "anteil": 0.85, "lage": "ganzes Bild"}]
m25["loesung"] = {"G1": "ANNEHMEN (ARGUS weiß es nicht; Wärmebild zeigt Generator und warmen Sendemast: EloKa)", "G2": "BEKÄMPFEN (Mörser zulässig)",
                  "G3": "FREIGABE"}
m25["zweck"] = ("Der Störsender stört den Datenlink so stark, dass ARGUS nichts mehr erkennt: „Ziel unbekannt“ mit niedriger Konfidenz. "
                "Das Ziel ist echt; nur die Sensordaten der Aufklärung zeigen, was dort steht.")


# =============================================================================== Positionen, Ausrichtung, Sensortexte neu
def kmh_text(v):
    k = v * 3.6
    return int(round(k / 5.0) * 5) if k >= 12.5 else int(round(k))


def bewegungstext(z, t, zusatz=""):
    v = L.geschwindigkeit(z, t)
    if v < 0.3:
        s = L.stand_seit(z, t)
        if s >= 120:
            return f"steht seit {int(s // 60)} min"
        return f"steht seit {max(5, int(round(s / 5) * 5))} s"
    return f"nach {L.himmelsrichtung(L.richtung(z, t))}, ca. {kmh_text(v)} km/h{zusatz}"


def letzte_richtung(z, t):
    r = L.richtung(z, t)
    if r is not None:
        return r
    rr = z["bewegung"]["route"]
    seg = [(a, b) for a, b in zip(rr, rr[1:]) if b[0] <= t and (a[1], a[2]) != (b[1], b[2])]
    if not seg:
        return z.get("hdg", 0)
    (_, x0, y0), (_, x1, y1) = seg[-1]
    return math.degrees(math.atan2(y1 - y0, x1 - x0))


erste = {}
for m in SZ["meldungen"]:
    if m.get("folge_von"):
        continue
    for x in m["ziele"]:
        erste.setdefault(x, m)
NEU_GEMELDET = {"M06", "M07", "M09", "M13", "M19", "M28", "M29", "M30"}
for zid in sorted(GEAENDERT | {x for mid in NEU_GEMELDET for x in M[mid]["ziele"]}):
    z = Z[zid]
    if zid in erste:
        t_ref = erste[zid]["t_s"]
    else:
        continue                                        # nur in Folgemeldungen (pos gilt für die erste Meldung)
    p = L.position(z, t_ref)
    z["pos"] = [round(p[0]), round(p[1])]
    z["hdg"] = round(letzte_richtung(z, t_ref)) % 360
# Ziele ohne Meldung (Z-27, Z-28) und reine Stellungen behalten pos/hdg
for m in SZ["meldungen"]:
    z0 = Z[m["ziele"][0]]
    if m["id"] not in NEU_GEMELDET and m["ziele"][0] not in GEAENDERT:
        continue
    alt = m["sensor"]["bewegung"]
    if alt.startswith("keine") and L.geschwindigkeit(z0, m["t_s"]) < 0.3:
        continue                                        # „keine“ (Stellung) bleibt
    m["sensor"]["bewegung"] = bewegungstext(z0, m["t_s"])

# =============================================================================== Durchbruch-Routen: Abstand innerhalb der Gruppe ≥ 15 m
def mindestabstand(za, zb, von, bis):
    best = 1e9
    t = von
    while t <= bis:
        if L.vorhanden(za, t) and L.vorhanden(zb, t):
            best = min(best, L.dist(L.position(za, t), L.position(zb, t)))
        t += 0.5
    return best


def verzoegere(r, schritt):
    """Start halten: [t0, p0] bleibt, alles danach `schritt` Sekunden später."""
    t0 = r[0][0]
    r[1:] = [[round(p[0] + schritt, 1), p[1], p[2]] for p in r[1:]]
    if r[1][1:] != r[0][1:]:
        r.insert(1, [round(t0 + schritt, 1), r[0][1], r[0][2]])


def mindestabstand_halt(za, zb, von, bis, halt_b=None):
    """Kleinster Abstand (und ob zb dabei fährt) – zb bleibt nach halt_b als Wrack stehen."""
    best = (1e9, False)
    t = von
    while t <= bis:
        if L.vorhanden(za, t) and (L.vorhanden(zb, t) or (halt_b is not None and t >= halt_b)):
            tb = min(t, halt_b) if halt_b is not None else t
            d = L.dist(L.position(za, t), L.position(zb, tb))
            if d < best[0]:
                best = (d, (halt_b is None or t < halt_b) and L.geschwindigkeit(zb, t) > 0.3)
        t += 0.5
    return best


def staffeln_alle(gruppen, quelle, basis, halt, schritt=2.0, max_n=60):
    """Durchbruch-Routen nacheinander (nach t_s): Ein Fahrzeug wartet am Start, bis es auf der ganzen Route Abstand hält – zu
    Fahrzeugen der eigenen Gruppe ≥ 15 m, zu früheren Durchbrüchen und zu fahrenden Fahrzeugen der Lage ≥ 10 m. Stehende
    Fahrzeuge muss die Route selbst meiden (die Prüfung meldet es)."""
    fertig = []
    for g in sorted(gruppen, key=lambda g: g["t_s"]):
        for zid in list(g["routen"].keys()):
            r = g["routen"][zid]
            for _ in range(max_n):
                zz = L.durchbruch_ziel(quelle[zid], r)
                t0, t1 = r[0][0], r[-1][0]
                warten = False
                for gid2, zv in fertig:
                    if mindestabstand_halt(zz, zv, t0, t1)[0] < (15 if gid2 == g["id"] else 10):
                        warten = True
                        break
                if not warten:
                    for zb in basis:
                        d, faehrt = mindestabstand_halt(zz, zb, t0, t1, halt.get(zb["id"]))
                        if d < 10 and faehrt:
                            warten = True
                            break
                if not warten:
                    break
                verzoegere(r, schritt)
            g["ueber_s"][zid] = schnitt(r)
            fertig.append((g["id"], L.durchbruch_ziel(quelle[zid], r)))


BACH = L.linie(K, "bach_elster")


def schnitt(r, linie=BACH):
    for (t0, x0, y0), (t1, x1, y1) in zip(r, r[1:]):
        for a, b in zip(linie, linie[1:]):
            d1 = (x1 - x0, y1 - y0)
            d2 = (b[0] - a[0], b[1] - a[1])
            den = d1[0] * d2[1] - d1[1] * d2[0]
            if abs(den) < 1e-9:
                continue
            u = ((a[0] - x0) * d2[1] - (a[1] - y0) * d2[0]) / den
            w = ((a[0] - x0) * d1[1] - (a[1] - y0) * d1[0]) / den
            if 0 <= u <= 1 and 0 <= w <= 1:
                return round(t0 + u * (t1 - t0), 1)
    return None


def kompakt(r):
    """Doppelte Haltepunkte zusammenfassen (Start, Halt, weiter)."""
    out = []
    for p in r:
        if len(out) >= 2 and out[-1][1:] == p[1:] and out[-2][1:] == p[1:]:
            out[-1] = p
        else:
            out.append(p)
    return out


HALT_HG = {h["ziel"]: h["t_s"] for h in SZ["hintergrund"]["ereignisse"] if h["art"] == "panzerabwehr" and h.get("folge") == "zerstoert"}
IN_DB = {zid for g in SZ["durchbruch"]["gruppen"] for zid in g["ziele"]}
staffeln_alle(SZ["durchbruch"]["gruppen"], Z, [z for z in SZ["ziele"] if z["id"] not in IN_DB], HALT_HG)
for g in SZ["durchbruch"]["gruppen"]:
    for zid in g["routen"]:
        g["routen"][zid] = kompakt(g["routen"][zid])
for g in SZ["verstaerkungen"]["gruppen"]:
    if g.get("durchbruch"):
        vz = {z["id"]: z for z in g["ziele"]}
        gg = dict(g["durchbruch"], id=g["id"], t_s=g["durchbruch"]["t_s"])
        staffeln_alle([gg], vz, [], {})
        g["dauer_s"] = int(round(max(r[-1][0] for r in g["durchbruch"]["routen"].values())))

# Verstärkungen: Sperrfenster neu (Routen geändert)
for g in SZ["verstaerkungen"]["gruppen"]:
    g.pop("nicht_einspielen", None)
    fenster, _ = L.verstaerkung_konflikte(SZ, g)
    if fenster:
        g["nicht_einspielen"] = fenster

# =============================================================================== Technik, Version
SZ["anforderungen_technik"].append({
    "schritt": "2.2 Kontakte, Abstände, Meldedichte",
    "text": ("Kontakt (C1): Jedes Fahrzeug, das ARGUS (noch) nicht gemeldet hat oder dessen Meldung bei der Rolle (noch) nicht angekommen "
             "ist, steht auf den Karten von Aufklärung, Zielprüfung und Führung ab der Einfahrt als unklassifizierter Kontakt (APP-6 "
             "unbekannt), nicht im Wald und nie bei ungemeldeten Zielen. Fahrzeuge einer Meldung, die sich vom Zeichen entfernen, bekommen "
             "ein eigenes kleines Zeichen; getroffene ein eigenes durchgestrichenes am Wrack (C8). Meldelücken höchstens 60 s (C3), "
             "sonst `pause_gewollt` an der folgenden Meldung. LM trifft nur das bekämpfte Fahrzeug (C6).")})
SZ["version"] = "2.2"
SZ["stand"] = "2026-10-28"

# =============================================================================== Regeln und Kataloge
REG["version"] = "2.2"
REG["wirkung"]["praezision"] = ("Präzisionswirkmittel (Loitering Munition, katalog_wirkmittel: nur_zielfahrzeug) treffen genau das bekämpfte "
                                "Fahrzeug: Andere Fahrzeuge im Wirkradius bleiben stehen. Personen im Wirkradius sind betroffen; R2, R3 und "
                                "die Warnungen gelten wie bei jedem Wirkmittel. Der Mörser trifft weiter alles im Wirkradius.")
REG["argus"]["unbekannt"] = ("Erkennt ARGUS nichts (z. B. Bildstörung), meldet es „Ziel unbekannt“ oder „Fahrzeug unbekannt“ mit niedriger "
                             "Konfidenz (UNKLAR).")
WMK["version"] = "2.2"
for w in WMK["wirkmittel"]:
    if w["id"] == "LM":
        w["nur_zielfahrzeug"] = True
WMK["hinweis"] += (" Seit 2.2: nur_zielfahrzeug (LM) – das Wirkmittel trifft nur das bekämpfte Fahrzeug, andere Fahrzeuge im Wirkradius "
                   "nicht; Personen im Wirkradius schon.")
EINHEIT = {"kpz_t72": "UCA", "kpz_pt91": "UCA", "spz_bmp2": "UCIZ", "spw_btr80": "UCIZ", "san_rad": "USM", "spaehpz_brdm2": "UCRVA",
           "gfz_tigr": "UCR", "lkw_ural": "USS", "eloka_lkw": "UUMSEJ", "moerser_trupp": "UCFM", "attrappe_kpz": "UCA", "traktor": None}
FZK["version"] = "1.3"
FZK["groesse_nach_anzahl"] = {"hinweis": ("Größenangabe nach APP-6 für zugweise Meldungen (Anzahl noch stehender Fahrzeuge → Kennbuchstabe): "
                                          "C = Halbzug/Trupp ●●, D = Zug ●●●. Ein einzelnes Fahrzeug trägt keine Größenangabe."),
                              "2": "C", "3": "D", "4": "D"}
FZK["hinweis"] += (" Seit 1.3: 'symbol.einheit' ist das Zeichen der Einheit (APP-6) für zugweise Meldungen mit Größenangabe "
                   "(groesse_nach_anzahl); 'sprite_fahrt' der Sprite während der Fahrt (Mörsertrupp auf Lkw).")
for fz in FZK["fahrzeuge"]:
    e = EINHEIT.get(fz["id"])
    if e:
        fz["symbol"]["einheit"] = e
    if fz["id"] == "moerser_trupp":
        fz["sprite_fahrt"] = "lkw_ural.png"

os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(FZK, os.path.join(ZIEL, ALT["kataloge"]["fahrzeuge"]))
L.speichere(WMK, os.path.join(ZIEL, ALT["kataloge"]["wirkmittel"]))
print("geschrieben:", ZIEL, len(SZ["ziele"]), "Ziele,", len(SZ["meldungen"]), "Meldungen")
