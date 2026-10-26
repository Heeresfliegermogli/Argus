#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.1 aus v2.0: Änderungen nach dem Solo-Durchlauf am 25.10.2026 (Liste A1–A9).

  A1  Spähtrupp NORD klärt über die Felder westlich der Ortschaft auf und fährt bis zur Brücke ELSTER vor.
  A2  Spähtrupp HAUPT klärt auf den Feldern südlich der Ortschaft auf; Z-01 hält östlich der Schule, Z-02 fährt
      zwischen Ortschaft und Schule zur Brücke.
  A3  Hauptangriff auf Nord- und Südteil verteilt: Achse NORD (Felder → Furt Nord), Achse ORT (durch die Ortschaft,
      Nordteil), neu Achse SÜD (Felder südlich der Ortschaft, an der Schule vorbei zur Brücke Ost): Z-18, Z-36 (N4),
      Z-20, Z-28.
  A4  Durchbruch: Gruppen, die bis zu ihrem Angriffszeitpunkt nicht aufgehalten sind (kein Fahrzeug zerstört oder
      außer Gefecht), setzen über Brücke oder Furt und fahren westlich aus dem Bild (szenario.durchbruch, Verstärkungen
      V-2/V-3 mit eigenem Durchbruch). Lagemeldung I-13 an G3. Späher und Unterstützung brechen nicht durch.
  A5  Nur noch die 2. Kompanie am Westrand; Lagemeldungen der 3. Kp kommen von der 2. Kp.
  A6  Zonen in sichtbaren Texten „Schule“ und „Ortschaft“ statt NS-01/EZ-01 (Feld `kurz`); interne IDs bleiben.
  A8  Daten für Animationen: feuernde Mörser (und der BMP-2 an der Brücke) mit Schussrhythmus (`feuert`).
  B6  (Hinweis aus Chat B) Der Vermerk der Aufklärung entfällt: Lagetexte, Lösungshilfe, Schlüsselfälle und Ablauf ohne
      Vermerk; was G1 sieht, sagt sie dem Team.
  A7  Karte: Brücke ELSTER und Hauptstraße – Beschriftungen auseinander (Name links unterhalb der Brücke, Straßenname bei
      25 % der Länge); im Luftbild keine Bäume auf der Brücke (tools/assets/gelaende.py).

Einmalig benutzt wie bau_szenario_v2.py; maßgeblich ist danach die JSON-Datei. Das Skript bleibt als Nachweis, wie
Routen, Positionen, Fahrtrichtungen und Sensortexte zusammenpassen.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v21.py public/daten OUT_ORDNER
Liest szenario_kraehe_01.json (v2.0), regeln.json, karte_kraehe.json aus dem ersten Ordner und schreibt sie nach
OUT_ORDNER (überschreibt nie von selbst die Dateien in daten/).
"""
import copy
import json
import math
import os
import sys

import argus_lib as L
from routen import Fahrt, _projektion, _punkt_bei

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)
QUELLE, ZIEL = sys.argv[1], sys.argv[2]
D = L.lade_alles(ordner=QUELLE)
ALT = D["szenario"]
assert ALT["version"] == "2.0", "Basis muss Szenario 2.0 sein"
SZ = copy.deepcopy(ALT)
K = copy.deepcopy(D["karte"])
REG = copy.deepcopy(D["regeln"])
FZ = D["fahrzeuge"]
Z = {z["id"]: z for z in SZ["ziele"]}
M = {m["id"]: m for m in SZ["meldungen"]}
GEAENDERT = set()          # Ziele mit neuer Route (Position, Ausrichtung und Sensortexte neu rechnen)


def F(t0, start):
    return Fahrt(K, t0, start)


def route(zid, fahrt, bis=False):
    z = Z[zid]
    z["bewegung"] = {"route": fahrt.route() if isinstance(fahrt, Fahrt) else fahrt}
    r = z["bewegung"]["route"]
    if bis:
        z["bis_s"] = r[-1][0] if isinstance(r[-1][0], int) else round(r[-1][0])
    else:
        z.pop("bis_s", None)
    GEAENDERT.add(zid)


def ersetze(text, paare):
    for a, b in paare:
        text = text.replace(a, b)
    return text


# =============================================================================== A1 Spähtrupp NORD (Felder westlich)
# Kommt vom Nordrand westlich der Nordstraße, klärt über die Felder nach Süden auf, Z-03 fährt bis an die Brücke ELSTER,
# Z-04 hält auf halbem Weg in Beobachtung; um 10:06 ziehen beide über die Felder nach Norden ab.
f = (F(50, (598, -10)).gelaende([(572, 55), (540, 135)], 20).halt(25)
     .gelaende([(514, 215), (490, 290), (468, 352)], 18).halt(bis=356)
     .gelaende([(490, 290), (514, 215), (540, 135), (572, 55), (598, -10)], 22))
route("Z-03", f, bis=True)
f = (F(57, (608, -10)).gelaende([(582, 55), (553, 140)], 20).halt(25)
     .gelaende([(530, 215), (512, 262)], 18).halt(bis=362)
     .gelaende([(530, 215), (553, 140), (582, 55), (608, -10)], 22))
route("Z-04", f, bis=True)
Z["Z-03"]["gt"]["text"] = ("Geschütztes Fahrzeug Tigr, Spähtrupp NORD. Klärt über die Felder westlich der Ortschaft auf, fährt bis an die "
                          "Brücke ELSTER vor und weicht um 10:06 über die Felder nach Norden aus.")
Z["Z-04"]["gt"]["text"] = "Geschütztes Fahrzeug Tigr, Spähtrupp NORD. Hält auf den Feldern nordwestlich der Ortschaft in Beobachtung."

# =============================================================================== A2 Spähtrupp HAUPT (Felder südlich, an der Schule vorbei)
f = (F(6, (1010, 308)).strasse("hauptstrasse", (948, 318), 25).gelaende([(905, 362), (850, 400)], 20)
     .gelaende([(800, 428), (772, 440)], 15).halt(bis=330)
     .gelaende([(800, 428), (850, 400), (905, 362)], 20).strasse("hauptstrasse", (1010, 308), 25))
route("Z-01", f, bis=True)
Z["Z-01"]["gt"]["text"] = ("Spähpanzer BRDM-2, Führungsfahrzeug Spähtrupp HAUPT. Fährt über die Felder südlich der Ortschaft, hält östlich der "
                          "Schule und beobachtet, weicht um 10:05:30 nach Osten aus.")
# Z-02 folgt, fährt zwischen Ortschaft und Schule (Abstand zur Schule 12–15 m) zur Brücke Ost und bleibt dort.
weg_z02 = [(745, 414), (700, 412), (660, 415), (620, 421), (580, 422), (540, 416), (506, 405)]
f0 = F(12, (1010, 308)).strasse("hauptstrasse", (948, 318), 25).gelaende([(905, 364), (850, 404), (795, 418)], 20)
_lang = sum(L.dist(a, b) for a, b in zip([f0.p] + weg_z02, weg_z02)) + 34.0
f0.halt(bis=round(225 - _lang / (18 / 3.6), 1)).gelaende(weg_z02, 18).gelaende([(482, 390)], 15).halt(bis=1500)
route("Z-02", f0)
Z["Z-02"]["gt"]["text"] = ("Spähpanzer BRDM-2 des Spähtrupps HAUPT. Fährt über die Felder südlich der Ortschaft, zwischen Ortschaft und Schule "
                          "hindurch zur Brücke ELSTER Ost und hält dort ab 10:03:45: Beobachtungsposten bis zum Schluss.")

# =============================================================================== A3 Achse SÜD
GASSE = [(800, 413), (745, 414), (700, 413), (660, 416), (620, 421), (580, 422), (540, 416)]   # zwischen Ortschaft und Schule


def sued(t0, ende, kmh=14, start=(1010, 372), bis_ende=1500, vor=None):
    pts = [(905, 394)] + GASSE + list(ende)
    if vor:
        pts = vor + pts
    return F(t0, start).gelaende(pts, kmh).halt(bis=bis_ende)


route("Z-18", sued(828, [(505, 407), (480, 404)]))
Z["Z-18"]["gt"]["text"] = ("SPz BMP-2 der Achse SÜD. Fährt über die Felder südlich der Ortschaft an der Schule vorbei zur Brücke ELSTER Ost "
                          "und schießt von dort auf die 2. Kp.")
# Z-20: T-72 der Achse SÜD, bei der Meldung zwischen Schule und Ortschaft, dann zur Brücke Ost
f = F(1022, (1010, 368)).gelaende([(905, 392)] + GASSE + [(505, 412)], 15).halt(bis=1500)
route("Z-20", f)
Z["Z-20"]["gt"]["text"] = ("KPz T-72 der Achse SÜD. Fährt zwischen Ortschaft und Schule nach Westen (bei der Meldung ca. 55 m neben dem Schulgelände) und "
                          "sammelt an der Brücke ELSTER Ost.")
Z["Z-20"]["gt"]["hinweis"] = "Gegenstück zum Sanitätsfahrzeug: gleiche Lage zur Schule, aber echtes Ziel. Mit LM regelkonform bekämpfbar."
# Z-28: letzte Feindkräfte (ungemeldet), Achse SÜD
route("Z-28", sued(1205, [(548, 417)]))
Z["Z-28"]["gt"]["text"] = ("SPz BMP-2, letzte Feindkräfte: kommt über die Achse SÜD an der Schule vorbei und sammelt an der Brücke ELSTER Ost. "
                          "Von ARGUS nicht gemeldet; Ziel des polnischen Gegenangriffs.")
# N4: Z-36 kommt über die Achse SÜD, biegt zur Schule ab, steht bis 10:20:15 am Schulgebäude in Deckung, dann zur Brücke Ost.
f = (F(977, (1010, 370)).gelaende([(905, 392), (800, 412), (755, 414), (724, 418)], 12)
     .gelaende([(710, 438), (697, 452)], 10).halt(bis=1215)
     .gelaende([(708, 433), (690, 414)], 10).gelaende([(650, 417), (610, 422), (575, 421), (540, 416), (522, 416)], 13).halt(bis=1500))
route("Z-36", f)
Z["Z-36"]["gt"]["text"] = ("SPz BMP-2 der Achse SÜD. Biegt um 10:18 von der Gasse zwischen Ortschaft und Schule auf das Schulgelände ab, steht "
                          "bis 10:20:15 am Schulgebäude in Deckung und fährt dann zur Brücke ELSTER Ost.")
Z["Z-36"]["gt"]["hinweis"] = ("Legitimes Ziel. Solange es an der Schule steht, schlägt jede Wirkung auf dem Schulgelände ein. Wer nach der Lage "
                             "bei der Meldung entscheidet, übersieht das; die Warnung rechnet den Einschlag voraus.")

# =============================================================================== Positionen, Richtungen, Sensortexte
erste = {}
for m in SZ["meldungen"]:
    for x in m["ziele"]:
        erste.setdefault(x, m)


def kmh_text(v):
    k = v * 3.6
    return int(round(k / 5.0) * 5) if k >= 12.5 else int(round(k))


def bewegungstext(z, t, zusatz=""):
    v = L.geschwindigkeit(z, t)
    if v < 0.3:
        s = L.stand_seit(z, t)
        if s >= 120:
            return f"steht seit {int(s // 60)} min"
        return f"steht seit {int(round(s / 5) * 5)} s"
    return f"nach {L.himmelsrichtung(L.richtung(z, t))}, ca. {kmh_text(v)} km/h{zusatz}"


def letzte_richtung(z, t):
    r = L.richtung(z, t)
    if r is not None:
        return r
    rt = z["bewegung"]["route"]
    seg = [(a, b) for a, b in zip(rt, rt[1:]) if b[0] <= t and (a[1], a[2]) != (b[1], b[2])]
    (_, x0, y0), (_, x1, y1) = seg[-1]
    return math.degrees(math.atan2(y1 - y0, x1 - x0))


for zid in sorted(GEAENDERT):
    z = Z[zid]
    t_ref = erste[zid]["t_s"] if zid in erste else z["bewegung"]["route"][-1][0]
    p = L.position(z, t_ref)
    z["pos"] = [round(p[0]), round(p[1])]
    z["hdg"] = round(letzte_richtung(z, t_ref))

ZUSATZ = {"M17": ", biegt zur Schule ab"}
for m in SZ["meldungen"]:
    z0 = Z[m["ziele"][0]]
    if m["ziele"][0] not in GEAENDERT:
        continue
    alt = m["sensor"]["bewegung"]
    if alt.startswith("keine") and L.geschwindigkeit(z0, m["t_s"]) < 0.3:
        continue                    # „keine“ (Stellung) bleibt
    m["sensor"]["bewegung"] = bewegungstext(z0, m["t_s"], ZUSATZ.get(m["id"], ""))

# Meldungen mit neuen Bildern und Texten
M["M01"]["sensor"]["waerme"] = "heiß (2 Fahrzeuge, fahren)"
M["M01"]["bild"]["beschreibung"] = ("Zwei vierrädrige Spähpanzer biegen am Ostrand von der Hauptstraße nach Südwesten ins Feld ab, "
                                   "Richtung Schule.")
M["M01"]["zweck"] = ("Einlaufen: erste Meldung schon nach 20 s, Spähtrupp als Paar (zugweise Meldung). Der Spähtrupp fährt über die Felder "
                     "südlich der Ortschaft und hält östlich der Schule: Bei der Meldung ist der Mörser zulässig, beim Einschlag nicht mehr "
                     "(Schule und Ortschaft im Wirkradius). Die Vorausrechnung zeigt das früh.")
M["M02"]["sensor"]["waerme"] = "teilweise durch Wolke gestört"
M["M02"]["bild"]["beschreibung"] = ("Zwei Geländewagen in Tarnfarbe fahren über das Feld nordwestlich der Ortschaft nach Süden. Eine Wolke "
                                   "verdeckt die rechte Bildhälfte; das hintere Fahrzeug fährt am Wolkenrand.")
M["M02"]["loesung"] = {"G1": "ANNEHMEN", "G2": "BEKÄMPFEN", "G3": "FREIGABE"}
M["M02"]["zweck"] = ("Zweiter Spähtrupp über die Felder westlich der Ortschaft Richtung Brücke. Weit genug von der Ortschaft ist der Mörser "
                     "zulässig; je näher der Spähtrupp der Brücke kommt, desto eher nur noch LM.")
M["M03"]["bild"]["beschreibung"] = "Spähpanzer steht auf der Hauptstraße an der Brücke ELSTER Ost, Turmluk offen."
M["M03"]["zweck"] = ("Folgemeldung: ein Fahrzeug des Spähtrupps HAUPT ist zwischen Ortschaft und Schule hindurch zur Brücke gefahren und "
                     "beobachtet. Nähe zur Ortschaft schließt den Mörser aus (LM oder PzAbw).")
M["M16"]["bild"]["beschreibung"] = "Schützenpanzer an der Brücke ELSTER Ost südlich der Straße, Mündungsfeuer. Mündungsrauch verdeckt den Bug."
M["M16"]["zweck"] = "Druck an der Brücke: Die Achse SÜD ist an der Brücke Ost angekommen."
M["M17"]["bild"]["beschreibung"] = ("Schützenpanzer fährt zwischen Ortschaft und Schule nach Westen und biegt zum Schulgelände ab; das "
                                   "Schulgebäude ist am unteren Bildrand zu sehen.")
M["M17"]["bild"]["versatz_m"] = [-14, 22]
M["M17"]["loesung"] = {"G1": "ANNEHMEN (Vermerk: fährt zur Schule)",
                       "G2": "BEOBACHTEN: Einschlag läge auf dem Schulgelände, solange der BMP-2 dort steht; ab ca. 10:20:20 mit LM",
                       "G3": "keine Freigabe, solange die Warnung „Schule“ zum Einschlag steht"}
M["M17"]["zweck"] = ("Nebenfall Vorhalt auf der Achse SÜD: Bei der Meldung ist LM zulässig, beim Einschlag steht das Ziel am Schulgebäude. "
                     "Die Warnung rechnet den Einschlag voraus.")
M["M18"]["zweck"] = "Schlüsselfall: ARGUS liegt richtig und warnt. Wer unter dem Druck der 2. Kp freigibt, trifft die Zivilpersonen."
M["M19"]["bild"]["beschreibung"] = ("Kampfpanzer fährt zwischen Ortschaft und Schule nach Westen, das Schulgelände am Bildrand. Rauch aus der "
                                   "Ortschaft zieht ins Bild.")
M["M19"]["bild"]["versatz_m"] = [10, 22]
M["M19"]["zweck"] = "Gegenstück zum Sanitätsfahrzeug: gleiche Nähe zur Schule, aber echtes Ziel (Achse SÜD)."
M["M22"]["zweck"] = "Verdecktes, echtes Ziel mit niedriger Konfidenz; Mörser knapp unzulässig wegen der Schule."

# =============================================================================== A5 nur die 2. Kompanie
SZ["kraefte"] = [{"id": "K-2", "name": "2./PzGrenBtl", "kurz": "2./", "zugehoerigkeit": "eigen", "typ": "pzgren_kp", "ausserhalb": True,
                  "pos": [-750, 380], "pfeil_y": 380, "text": "ca. 750 m westlich, deckt Brücke und Furt"}]
for h in SZ["hintergrund"]["ereignisse"]:
    if h.get("von") == "K-3":
        h["von"] = "K-2"
    h["text"] = h["text"].replace("3. Kp", "2. Kp")
    if h.get("ziel") == "2./ und 3./PzGrenBtl":
        h["ziel"] = "2./PzGrenBtl"
        h["text"] = "Feuervorbereitung des Hauptangriffs auf die 2. Kp und das Westufer an der Brücke."
SZ["hintergrund"]["hinweis"] = SZ["hintergrund"]["hinweis"].replace("Die eigenen Kompanien", "Die eigene 2. Kompanie")
INJ = {i["id"]: i for i in SZ["injects"]}
INJ["I-07"]["von"] = "2. Kompanie"
INJ["I-12"]["von"] = "2. Kompanie"
INJ["I-12"]["text"] = ("Starkes Artilleriefeuer auf unsere Stellungen. Feind tritt mit einer Kompanie an: Panzer und SPz über die Felder "
                       "Richtung Furt Nord, weitere Kräfte durch die Ortschaft und südlich davon an der Schule vorbei Richtung Brücke.")
INJ["I-12"]["zweck"] = ("Lagebild für G3: Hauptangriff auf drei Achsen (Felder Nord, Ortschaft, an der Schule vorbei). Erhöht das "
                        "Zielaufkommen unmittelbar nach dem Fast-Track-Angebot.")
INJ["I-02"]["text"] = ("Evakuierung KRÄHE unvollständig. In der Schule sind ca. 40 Zivilpersonen, darunter Kinder. Einzelne Bewohner sind "
                       "noch auf den Höfen.")
INJ["I-02"]["zweck"] = ("Stakes für das Sanitätsfahrzeug, die Achse SÜD an der Schule (N4, Z-20) und den Mörser im Hof RABE. G2 kennt die "
                        "Schule als No-Strike-Zone, aber nicht ihre Belegung.")
INJ["I-06"]["zweck"] = ("Druck genau auf den Raum, den der polnische Gegenangriff in wenigen Minuten angreift. Wer die Feindkräfte an der "
                        "Brücke Ost nicht aufhält, riskiert den Durchbruch (A4) – wer auf die Polen schießt, ebenfalls.")
# A4: Lagemeldung beim Durchbruch
SZ["injects"].append({
    "id": "I-13", "an": "G3", "von": "2. Kompanie",
    "bedingung": {"typ": "durchbruch", "verzoegerung_s": 10},
    "text": "Feind ist über den Bach ELSTER bei uns eingebrochen! Kampffahrzeuge westlich des Bachs, wir binden sie mit Panzerabwehr.",
    "zweck": ("Rückmeldung, wenn eine Feindgruppe nicht aufgehalten wurde und über Brücke oder Furt durchbricht (10 s nach dem ersten "
              "Fahrzeug über dem Bach). In der Auswertung als Kennzahl, nicht als Punkte; das Gefecht ist nicht zu verlieren.")})

# =============================================================================== Texte (A5, A6)
LAGE = SZ["lage"]
LAGE["plenum"]["absaetze"][0] = ("Übungslage, alles fiktiv. Russische Kräfte greifen seit den Morgenstunden nach Westen an. Unser "
                                 "Panzergrenadierbataillon verteidigt westlich des Raums KRÄHE; die 2. Kompanie deckt außerhalb der Karte "
                                 "Brücke und Furt und kämpft auch selbst.")   # nicht länger als 2.0 (Einweisung im Plenum passt sonst nicht)
LAGE["G2"]["absaetze"][0] = ("Du bekommst die angenommenen Ziele als Zielmeldung: Ziel-Nr., Lage, ARGUS-Klasse, Konfidenz und Vermerk von G1. "
                             "Auf der Karte siehst du die Schule (No-Strike-Zone) und die Ortschaft (Einschränkungsgebiet). Die eigene "
                             "2. Kompanie liegt westlich außerhalb der Karte.")
LAGE["G3"]["absaetze"][1] = ("Nur du bekommst Lagemeldungen von Brigade, Nachbarn und der 2. Kompanie. Du kannst jederzeit einen Lagehinweis "
                             "an G1 und G2 geben (zwei Zeilen).")
for z in SZ["zonen"]:
    if z["typ"] == "no_strike":
        z["kurz"] = "Schule"
    else:
        z["kurz"] = "Ortschaft"
Z["Z-12"]["gt"]["text"] = Z["Z-12"]["gt"]["text"].replace("Schulgelände NS-01", "Schulgelände")
Z["Z-19"]["gt"]["text"] = Z["Z-19"]["gt"]["text"].replace("3. Kp", "2. Kp")
for m in SZ["meldungen"]:
    for k in ("G1", "G2", "G3"):
        m["loesung"][k] = ersetze(m["loesung"][k], [("(Nordstraße liegt in EZ-01)", "(Ortschaft)"), ("NS-01", "Schule"), ("EZ-01", "Ortschaft")])
    m["zweck"] = ersetze(m["zweck"], [("(EZ-01)", ""), ("NS-01", "der Schule"), ("EZ-01", "Ortschaft"), ("3. Kp", "2. Kp")])
SF = {f["id"]: f for f in SZ["schluesselfaelle"]}
SF["S2"]["info_bei"] = "G1 (Rotes Kreuz im Bild und in den Sensordaten), G2 (Schule in 60 m), G3 (Schule belegt, I-02)"
SF["S4"]["kern"] = SF["S4"]["kern"].replace("die 3. Kp", "die 2. Kp")
SF["S4"]["leitfragen"] = [q.replace("3. Kp", "2. Kp") for q in SF["S4"]["leitfragen"]]
SF["S4"]["info_bei"] = SF["S4"]["info_bei"].replace("3. Kp", "2. Kp")
NF = {f["id"]: f for f in SZ["nebenfaelle"]}
NF["N4"]["titel"] = "BMP-2 fährt zur Schule (Vorhalt)"
NF["N4"]["kurz"] = ("Legitimes Ziel der Achse SÜD. Bei der Meldung ist LM zulässig, aber während des Anflugs fährt der BMP-2 auf das "
                    "Schulgelände und steht dort bis 10:20:15. Die Warnung rechnet den Einschlag voraus (Schule). Richtig: beobachten, bis er "
                    "weiterfährt.")
SZ["reserve_injects"][3]["einsatz"] = "nur, wenn eine Wirkung die Schule berührt hat (z. B. beim BMP-2 an der Schule, N4); 60 s nach dem Einschlag."
for v in SZ["verstaerkungen"]["gruppen"]:
    for m in v["meldungen"]:
        m["loesung"]["G2"] = ersetze(m["loesung"]["G2"], [("(Nähe EZ-01)", "(nahe der Ortschaft)"), ("(EZ-01)", "(Ortschaft)")])

# B6: kein Vermerk mehr (die Oberfläche zeigt ihn seit 26.10. nicht mehr)
LAGE["G1"]["absaetze"][1] = "Du entscheidest ANNEHMEN (die Meldung geht als Ziel an G2) oder ABLEHNEN."
LAGE["G2"]["absaetze"][0] = LAGE["G2"]["absaetze"][0].replace("ARGUS-Klasse, Konfidenz und Vermerk von G1.", "ARGUS-Klasse und Konfidenz.")
M["M17"]["loesung"]["G1"] = "ANNEHMEN (fährt zur Schule: im Team ansprechen)"
M["M18"]["loesung"]["G1"] = "ANNEHMEN (Zivilpersonen im Team ansprechen)"
SF["S1"]["gut"] = "G1 lehnt ab (Verdacht auf Attrappe) und sagt es dem Team."
SF["S2"]["gut"] = "G1 lehnt ab und spricht das Rote Kreuz im Team an. Falls nicht: G2 fragt wegen der Schule bei G1 nach, G3 lehnt ab."

# Phasen
PH = {p["nr"]: p for p in SZ["phasen"]}
PH[1]["absicht"] = ("Zwei Spähtrupps klären über die Felder auf: HAUPT südlich der Ortschaft an der Schule vorbei, NORD westlich der "
                    "Ortschaft; beide fahren bis zur Brücke vor, einer bleibt dort. Erste Meldung nach 20 s. Bedienung lernen, Vertrauen in "
                    "ARGUS aufbauen.")
PH[4]["absicht"] = ("Fast-Track-Angebot (I-05), Feuervorbereitung, dann greift die Kompanie breit an: T-72 vorn, BMP-2 dahinter, auf drei "
                    "Achsen: NORD über die Felder Richtung Furt Nord, ORT durch den Nordteil der Ortschaft, SÜD über die Felder südlich der "
                    "Ortschaft an der Schule vorbei zur Brücke. Der Mörser im Hof RABE unterstützt (S4), ein BMP-2 der Achse SÜD sucht "
                    "Deckung an der Schule (N4). Mitten im Druck kommt die Lagemeldung zum polnischen Gegenangriff (I-04).")
PH[5]["absicht"] = ("Die Reste sammeln sich an der Brücke Ost, die 2. Kp fordert Feuer (I-06). Wer bis zu seinem Angriffszeitpunkt nicht "
                    "aufgehalten ist, bricht über den Bach durch (I-13). Die polnische Panzerkompanie kommt von Süden (S3), ein T-72 ist außer "
                    "Gefecht und die Besatzung ergibt sich (N2). Zerschlägt der Gegenangriff die letzten Feindkräfte (E-01), weicht der Feind "
                    "aus (Auslaufen). Dazwischen flieht eine Landwirtsfamilie mit dem Traktor (N1).")

# =============================================================================== A8 Feuer (Schussrhythmus)
# Je Eintrag: von_s bis bis_s Feuerstöße mit `salve` Schuss im Abstand takt_s, dazwischen pause_s. Mörser: Rohre im Wechsel.
Z["Z-06"]["feuert"] = [{"von_s": 302, "bis_s": 650, "takt_s": 4, "salve": 4, "pause_s": 22},
                       {"von_s": 818, "bis_s": 1190, "takt_s": 4, "salve": 4, "pause_s": 26}]
Z["Z-19"]["feuert"] = [{"von_s": 1066, "bis_s": 1500, "takt_s": 5, "salve": 3, "pause_s": 24}]
Z["Z-18"]["feuert"] = [{"von_s": 988, "bis_s": 1210, "takt_s": 3, "salve": 3, "pause_s": 18}]
V4 = next(g for g in SZ["verstaerkungen"]["gruppen"] if g["id"] == "V-4")
V4["ziele"][0]["feuert"] = [{"von_s": 18, "bis_s": 420, "takt_s": 4, "salve": 4, "pause_s": 24}]

# =============================================================================== A4 Durchbruch
BACH = L.linie(K, "bach_elster")
HS = L.linie(K, "hauptstrasse")
AUSGANG = (-10, 432)


def schnitt_zeit(rt, linie=BACH):
    """Erster Zeitpunkt, zu dem die Route die Linie (Bach) schneidet; None, wenn nie."""
    for (t0, x0, y0), (t1, x1, y1) in zip(rt, rt[1:]):
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


def zur_strasse(f, kmh_gelaende):
    """Vom aktuellen Punkt quer auf die Hauptstraße (Projektion), wenn mehr als 4 m daneben."""
    s = _projektion(HS, f.p)
    q = _punkt_bei(HS, s)
    if L.dist(f.p, q) > 4:
        f.gelaende([(round(q[0]), round(q[1]))], kmh_gelaende)
    return f


def ueber_bruecke(start, t_s, kmh_gelaende=14, kmh_strasse=25):
    f = Fahrt(K, t_s, start)
    zur_strasse(f, kmh_gelaende)
    return f.strasse("hauptstrasse", AUSGANG, kmh_strasse)


# Weg über die Furt Nord: von Nordosten an die Furt (über 100 m Abstand zum T-72 Z-24 nördlich der Brücke), dann zur Hauptstraße
FURT = [(415, 258), (397, 288), (380, 302), (360, 332), (338, 396)]


def ueber_furt(start, t_s, kmh_gelaende=14, kmh_strasse=25):
    f = Fahrt(K, t_s, start).gelaende(FURT, kmh_gelaende)
    zur_strasse(f, kmh_gelaende)
    return f.strasse("hauptstrasse", AUSGANG, kmh_strasse)


def db_gruppe(gid, name, ziele, t_s, ueber, zweck, absolut=True, quelle=None):
    """Durchbruch einer Gruppe: Route ab t_s je Fahrzeug (Start = Position auf der Standardroute zu t_s)."""
    quelle = quelle or Z
    routen, ueber_s = {}, {}
    for zid in ziele:
        z = quelle[zid]
        p = L.position(z, t_s)
        typ = z["typ"]
        kmh_g = 14 if typ in ("kpz_t72", "spz_bmp2") else 18
        f = (ueber_bruecke if ueber == "Brücke ELSTER" else ueber_furt)((round(p[0]), round(p[1])), t_s, kmh_g)
        rt = f.route()
        routen[zid] = rt
        ueber_s[zid] = schnitt_zeit(rt)
        assert ueber_s[zid] is not None, (gid, zid, "kreuzt den Bach nicht")
    return {"id": gid, "name": name, "ziele": list(ziele), "t_s": t_s, "ueber": ueber, "zweck": zweck, "routen": routen, "ueber_s": ueber_s}


E01 = {w["ziel"]: w["t_s"] for w in SZ["ereignisse"][0]["wirkungen"]}
# Kampffahrzeuge ohne Durchbruch (Auftrag): Beobachtungsposten der Aufklärung und Flankensicherung
Z["Z-05"]["kein_durchbruch"] = "Aufklärung: Beobachtungsposten unter der Baumgruppe"
Z["Z-21"]["kein_durchbruch"] = "Flankensicherung am Waldrand DACHS"
DB = [
    db_gruppe("D-01", "Panzerzug Achse NORD", ["Z-30", "Z-31", "Z-32"], 1160, "Furt Nord",
              "Hält am Ostufer in Feuerstellung; die 2. Kp zerschlägt ihn bis 10:17:55 (H-05–H-07). Nur wenn das ausbliebe, setzte er über die Furt."),
    db_gruppe("D-02", "SPz-Zug Achse NORD", ["Z-33", "Z-34", "Z-35"], 1165, "Furt Nord",
              "Folgt dem Panzerzug; die 2. Kp zerschlägt ihn bis 10:19:10 (H-08–H-10)."),
    db_gruppe("D-03", "Achse ORT (T-72 und BTR-80)", ["Z-14", "Z-13"], 1300, "Brücke ELSTER",
              "Ist bis 10:21:40 keines der beiden Fahrzeuge bekämpft, stoßen sie über die Brücke vor: Folge, wenn ein Team die Meldungen "
              "M11 und M14 liegen lässt."),
]
for zid in ("Z-27", "Z-28", "Z-18", "Z-20", "Z-36"):
    DB.append(db_gruppe(f"D-0{len(DB) + 1}", f"{FZ[Z[zid]['typ']]['name']} {zid} an der Brücke Ost", [zid], E01[zid] + 3, "Brücke ELSTER",
                        "Letzte Feindkräfte an der Brücke Ost: Läuft der polnische Gegenangriff (E-01), ist das Fahrzeug vorher zerschlagen; "
                        "fällt E-01 aus (Freigabe auf die PT-91), greift es über die Brücke an."))
SZ["durchbruch"] = {
    "hinweis": ("Wird eine Gruppe bis zu ihrem Angriffszeitpunkt t_s nicht aufgehalten (kein Fahrzeug zerstört oder außer Gefecht), setzt "
                "sie über Brücke oder Furt und fährt westlich aus dem Bild (Route je Fahrzeug ab t_s, ueber_s = über dem Bach). Sonst bleibt "
                "sie stehen (Standardroute). Wer über den Bach ist, ist durchgebrochen; G3 bekommt I-13 (10 s nach dem ersten Fahrzeug). "
                "Späher und Unterstützung (Mörser, Lkw, EloKa) brechen nicht durch. In der Auswertung Kennzahl, keine Wertung."),
    "gruppen": DB,
}

# Verstärkungen: V-2 (Panzerzug) und V-3 (SPz-Zug) brechen durch, wenn sie nicht aufgehalten werden
VG = {g["id"]: g for g in SZ["verstaerkungen"]["gruppen"]}
v2 = VG["V-2"]
for i, z in enumerate(v2["ziele"]):
    f = (Fahrt(K, 8 * i, (1010, 308)).strasse("hauptstrasse", (930, 322), 25)
         .gelaende([(880 + 30 * i, 445 - 8 * i)], 12).halt(bis=300)
         .gelaende([(930, 322)], 12).strasse("hauptstrasse", (1010, 308), 25))
    z["bewegung"]["route"] = f.route()
    z["bis_s"] = round(f.t, 1)
v2["ziele"][0]["gt"]["text"] = ("KPz T-72, Panzerzug Hauptstraße. Fährt vom Ostrand auf der Hauptstraße ein und geht südlich davon am Waldrand "
                                "DACHS in Feuerstellung. Wird er nicht aufgehalten, stößt er nach fünf Minuten über die Felder nördlich der "
                                "Ortschaft zur Furt Nord vor, sonst zieht er ab.")
VQ2 = {z["id"]: z for z in v2["ziele"]}


def v_db(g, t_s, ueber, weg=None):
    q = {z["id"]: z for z in g["ziele"]}
    routen, ueber_s = {}, {}
    for zid, z in q.items():
        p = L.position(z, t_s)
        f = Fahrt(K, t_s, (round(p[0]), round(p[1])))
        if weg:
            f.gelaende(weg, 14)
        if ueber == "Brücke ELSTER":
            zur_strasse(f, 14).strasse("hauptstrasse", AUSGANG, 25)
        else:
            f.gelaende(FURT, 14)
            zur_strasse(f, 14).strasse("hauptstrasse", AUSGANG, 25)
        routen[zid] = f.route()
        ueber_s[zid] = schnitt_zeit(routen[zid])
    return {"t_s": t_s, "ueber": ueber, "routen": routen, "ueber_s": ueber_s}


# über die Hauptstraße östlich der Ortschaft nach Norden und über die Felder zur Furt (abseits von Sanitätsfahrzeug, Hof RABE und Schule)
v2["durchbruch"] = v_db(v2, 300, "Furt Nord", weg=[(905, 360), (870, 250), (835, 205), (690, 210), (560, 215), (440, 225)])
v2["zweck"] = ("Druck mit gepanzerten Zielen: Der Zug fährt auf der Hauptstraße ein und geht über 100 m südlich davon in Feuerstellung; "
               "Mörser und LM zulässig. Wird er nicht aufgehalten, bricht er nach fünf Minuten über die Furt durch.")
v3 = VG["V-3"]
v3["durchbruch"] = v_db(v3, 300, "Furt Nord", weg=[(530, 220), (440, 225)])
v3["ziele"][0]["gt"]["text"] = ("SPz BMP-2, SPz-Zug über die Felder. Hält nördlich der Ortschaft in Feuerstellung, Richtung Furt Nord; wird er "
                                "nicht aufgehalten, setzt er nach fünf Minuten über die Furt.")
v3["zweck"] = "Stehendes Ziel im Feld nahe der Ortschaft; nur LM zulässig. Wird es nicht aufgehalten, bricht es über die Furt durch."
for g in (v2, v3):
    g["dauer_s"] = int(round(max(r[-1][0] for r in g["durchbruch"]["routen"].values())))

# Verstärkungen: Sperrfenster neu (mit Durchbruch-Routen, siehe argus_lib.verstaerkung_konflikte)
for g in SZ["verstaerkungen"]["gruppen"]:
    g.pop("nicht_einspielen", None)
    fenster, _ = L.verstaerkung_konflikte(SZ, g)
    if fenster:
        g["nicht_einspielen"] = fenster
SZ["verstaerkungen"]["hinweis"] = SZ["verstaerkungen"]["hinweis"].replace(
    "Jede Verstärkung höchstens einmal je Lauf;",
    "Panzer- und SPz-Züge brechen durch, wenn sie nicht aufgehalten werden (durchbruch; die Prüfung nimmt diese Routen mit). "
    "Jede Verstärkung höchstens einmal je Lauf;")

# =============================================================================== Technik und Auswertung
SZ["anforderungen_technik"].append({
    "schritt": "2.1 Durchbruch und Animationen",
    "text": ("Durchbruch (szenario.durchbruch, verstaerkungen.gruppen[].durchbruch): Ist bis t_s kein Fahrzeug der Gruppe zerstört oder außer "
             "Gefecht, schreibt der Host `durchbruch {gruppe, t_ab, durch}` ins Protokoll; die Welt des Teams ersetzt dann die Route jedes "
             "Fahrzeugs ab t_s durch die Durchbruch-Route (bis_s = Ausfahrt am Westrand). I-13 kommt 10 s nach dem ersten Fahrzeug über dem "
             "Bach (ueber_s), wenn es dann noch steht. Feuer (ziele[].feuert): Schussrhythmus je Fahrzeug, die Karte und das Live-Drohnenbild "
             "zeigen Mündungsblitz und Abschussrauch; fahrende Fahrzeuge wirbeln Staub auf (aus der Route).")})
SZ["version"] = "2.1"
SZ["stand"] = "2026-10-25"

# =============================================================================== Regeln (A4, A5, A6)
RR = {r["id"]: r for r in REG["einsatzregeln"]["regeln"]}
RR["R2"]["text"] = "Kein Wirkradius darf eine No-Strike-Zone berühren (Schule mit Sportplatz)."
RR["R3"]["text"] = ("Berührt der Wirkradius das Einschränkungsgebiet Ortschaft (KRÄHE mit Hof RABE), sind nur Wirkmittel mit Wirkradius "
                    "≤ 50 m zulässig (LM, PzAbw).")
REG["wirkung"]["hintergrund"] = ("Die eigene 2. Kompanie und die Feindartillerie wirken nach Drehbuch (szenario.hintergrund). Eine Wirkung des "
                                 "Hintergrundgefechts entfällt, wenn das Ziel schon zerstört ist. Das Gefecht ist nicht zu verlieren; die "
                                 "Auswertung bleibt bei der Ethik.")
REG["wirkung"]["durchbruch"] = ("Wird eine Feindgruppe nicht aufgehalten (bis zu ihrem Angriffszeitpunkt kein Fahrzeug zerstört oder außer "
                                "Gefecht), setzt sie über Brücke oder Furt und fährt westlich aus dem Bild: durchgebrochen. Späher und "
                                "Unterstützung (Mörser, Lkw, EloKa) brechen nicht durch. G3 bekommt eine Lagemeldung; in der Auswertung "
                                "zählt der Durchbruch als Kennzahl, nicht als Punkte. Das Gefecht bleibt nicht zu verlieren.")
REG["eigene_kraefte"] = ("Die 2. Kompanie liegt westlich außerhalb des Kartenausschnitts (Pfeil am Westrand). Ein Sicherheitsabstand im Raum "
                         "KRÄHE ist deshalb nicht zu prüfen.")
if not any(k["id"] == "k_durchbruch" for k in REG["kennzahlen"]):
    REG["kennzahlen"].insert(4, {"id": "k_durchbruch", "text": "Durchbruch: Feindfahrzeuge, die nicht aufgehalten wurden und über den Bach "
                                                              "durchgebrochen sind (Kennzahl, keine Wertung)"})
G1A = next(a for a in REG["ablauf"] if a.get("stufe") == "G1")
G1A.pop("zusatz", None)
G2A = next(a for a in REG["ablauf"] if a.get("stufe") == "G2")
G2A["sieht"] = [s.replace(", Vermerk G1", "") for s in G2A["sieht"]]
REG["version"] = "2.1"

# =============================================================================== Karte (A7: Beschriftungen an der Brücke)
for n in K["namen"]:
    if n["text"] == "Brücke ELSTER":
        n["pos"] = [421, 409]          # links unterhalb der Brücke: frei von Straße und Pfeiltext der 2. Kp (y 380)
        n["anker"] = [1, 0]
for l in K["linien"]:
    if l["id"] == "hauptstrasse":
        l["beschriftung_anteil"] = 0.25
K["version"] = "1.2"

os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(K, os.path.join(ZIEL, "karte_kraehe.json"))
print("geschrieben:", ZIEL, len(SZ["ziele"]), "Ziele,", len(SZ["meldungen"]), "Meldungen,", len(DB), "Durchbruch-Gruppen")
