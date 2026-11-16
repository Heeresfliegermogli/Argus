#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.9 aus v2.8: Änderungsliste P (Test am 16.11.2026, vier Rechner, ohne Verzögerung).

Quelle: claude/Aenderungen_Probelauf_16-11.md (P1–P5). Grundsätze bleiben: deterministisch, nicht zu verlieren, keine Darstellung
getöteter Menschen, kein Punktestand, keine Rangliste.

  P1  2. statt 1. Kompanie: „1./PzBtl 613“ → „2./PzBtl 613“, „1. Kompanie Panzerbataillon 613“ → „2. Kompanie …“, „1. Kp“ → „2. Kp“ in
      allen Texten der Daten (Szenario, Regeln, Kataloge). Die Fahrzeugnamen 1/1–1/4 (erster Zug der Kompanie) bleiben.
  P2  Zeichen der eigenen Panzer „Kampfpanzer, schwer“ (SFGPEVATH) – im Code (src/kern/lagebild.ts) und in der beschrifteten Lagekarte
      (tools/assets/karte.py); hier nur die Hinweise.
  P3  Kanone der 2. Kp mit harter Grenze am Ortsanfang KRÄHE (Westrand der Ortschaft an der Hauptstraße, x = 500 m): katalog_wirkmittel
      PZA einsatzbereich {x_max 500, hart, kurz „nur bis Ortsanfang KRÄHE“}. Liegt der vorausberechnete Einschlag dahinter, ist die
      Kanone nicht wählbar; bei einem Zug schießt sie nur auf die Fahrzeuge in Reichweite; keine Wirkung jenseits. R3 nennt nur noch LM.
  P4  Meldungen passend zum Geschehen:
      • Durchbrechen kann nur, wen das Team kennen konnte: szenario.durchbruch.gemeldet_s = 60 – eine Gruppe bricht nur durch, wenn ARGUS
        mindestens eines ihrer Fahrzeuge spätestens 60 s vor ihrem Angriffszeitpunkt gemeldet hat.
      • Neue bedingte Meldung M38 (10:22:15) zu Z-27 (T-72) und Z-28 (BMP-2) an der Brücke Ost: Sie kommt nur, wenn das Team bis dahin
        eine Wirkung auf die PT-91 (Z-15–17) freigegeben hat – dann fällt der polnische Gegenangriff aus, und ARGUS meldet die letzten
        Feindkräfte 78 s vor ihrem Angriff (D-04 10:23:33), sodass das Team sie bekämpfen kann. Nummer „33a“ (wie eine Verstärkung).
      • I-13 nennt, wer durchgebrochen ist ({durch} {ueber}), mit „Gegenangriff PL ausgefallen“, wenn der Durchbruch darauf zurückgeht.
      • Lagemeldungen mit Behauptung bekommen `behauptet` und, wo sie nicht in jedem Spiel stimmt, `varianten` (I-11, I-08a, I-08b, I-13,
        I-17, I-06, I-15); I-08a kommt erst nach einem Treffer auf die PT-91 (Bedingung treffer statt freigabe).
      • Reserve-Lagemeldungen bekommen `behauptet` (die Spielleitung sieht, ob sie zum Spiel des Teams passen).

Einmalig benutzt wie bau_szenario_v28.py; maßgeblich ist danach die JSON-Datei.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v29.py BASIS_2.8_ORDNER OUT_ORDNER
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
assert ALT["version"] == "2.8", "Basis muss Szenario 2.8 sein"


def roh(name):
    with open(os.path.join(QUELLE, name), encoding="utf-8") as f:
        return json.load(f)


SZ = copy.deepcopy(ALT)
REG = roh(ALT["kataloge"]["regeln"])
FZK = roh(ALT["kataloge"]["fahrzeuge"])
WMK = roh(ALT["kataloge"]["wirkmittel"])
KARTE = roh(ALT["kataloge"]["karte"])
SZ["version"] = "2.9"
REG["version"] = "2.9"
SZ["stand"] = "2026-11-16"
I = {i["id"]: i for i in SZ["injects"]}
R = {i["id"]: i for i in SZ["reserve_injects"]}
M = {m["id"]: m for m in SZ["meldungen"]}
Z = {z["id"]: z for z in SZ["ziele"]}


def ersetze(obj, schl, alt, neu):
    """Text in obj[schl] ersetzen; prüft, dass der alte Text vorkommt (sonst wäre die Vorlage veraltet)."""
    assert alt in obj[schl], f"„{alt}“ nicht in {obj.get('id', schl)}: {obj[schl][:200]}"
    obj[schl] = obj[schl].replace(alt, neu)


# =============================================================================== P1 2. statt 1. Kompanie
KP = re.compile(r"(?<![0-9/.])1\. Kp\b")


def p1_text(s):
    s = s.replace("1./PzBtl 613", "2./PzBtl 613").replace("1. Kompanie Panzerbataillon 613", "2. Kompanie Panzerbataillon 613")
    return KP.sub("2. Kp", s)


def p1(obj):
    """Alle Texte eines JSON-Baums (Werte, keine Schlüssel) umstellen; liefert die Zahl der geänderten Texte."""
    n = 0
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str):
                neu = p1_text(v)
                if neu != v:
                    obj[k] = neu
                    n += 1
            else:
                n += p1(v)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if isinstance(v, str):
                neu = p1_text(v)
                if neu != v:
                    obj[i] = neu
                    n += 1
            else:
                n += p1(v)
    return n


N_P1 = {name: p1(obj) for name, obj in (("szenario", SZ), ("regeln", REG), ("fahrzeuge", FZK), ("wirkmittel", WMK), ("karte", KARTE))}
assert SZ["eigene_truppe"]["einheit"] == "2./PzBtl 613" and SZ["eigene_truppe"]["name"] == "2. Kp"
assert SZ["eigene_truppe"]["kompanie"] == "2. Kompanie Panzerbataillon 613"
assert [p["name"] for p in SZ["eigene_truppe"]["panzer"]] == ["1/1", "1/2", "1/3", "1/4"], "P1.2: Fahrzeugnamen bleiben"
SZ["eigene_truppe"]["hinweis"] = SZ["eigene_truppe"]["hinweis"].rstrip() + (
    " Seit 2.9 (P1): die 2. Kompanie (die 1. ist üblicherweise die Versorgung); die Panzer heißen weiter 1/1–1/4 (erster Zug der Kompanie). "
    "Zeichen seit 2.9 (P2): Kampfpanzer, schwer (Leopard 2A7V, SFGPEVATH).")
FZK["version"] = "1.7"
FZK["hinweis"] = FZK["hinweis"].rstrip() + (" Seit 1.7 (Szenario 2.9, P1, P2): eigene Truppe ist die 2./PzBtl 613; der Leopard 2A7V trägt das "
                                            "Zeichen Kampfpanzer, schwer (EVATH, wie ZEICHEN_EIGENER_PANZER in src/kern/lagebild.ts).")
next(f for f in FZK["fahrzeuge"] if f["id"] == "kpz_leo2a7v")["symbol"]["sidc"] = "EVATH"

# =============================================================================== P3 Kanone nur bis zum Ortsanfang KRÄHE
WM = {w["id"]: w for w in WMK["wirkmittel"]}
pza = WM["PZA"]
assert pza["name"] == "2. Kp (Kanone 120 mm)", pza["name"]
pza["einsatzbereich"] = {
    "x_max": 500,
    "hart": True,
    "kurz": "nur bis Ortsanfang KRÄHE",
    "text": "nur bis zum Ortsanfang KRÄHE (Westrand der Ortschaft an der Hauptstraße, x < 500 m, Sicht); dahinter nicht wählbar und keine "
            "Wirkung, bei einem Zug nur die Fahrzeuge in Reichweite; es schießt der nächste einsatzbereite Panzer der 2. Kp",
}
WMK["version"] = "2.5"
WMK["hinweis"] = WMK["hinweis"].rstrip() + (
    " Seit 2.5 (Szenario 2.9, P3): harte Grenze der Kanone am Ortsanfang KRÄHE (einsatzbereich.hart, x_max 500): liegt der vorausberechnete "
    "Einschlag jenseits, ist sie nicht wählbar; bei einem Zug schießt sie nur auf die Fahrzeuge in Reichweite (Hinweis „nur k von n in "
    "Reichweite“); jenseits der Linie wirkt sie nie. Bis 2.8 warnte der Einsatzbereich nur (EB).")

er = REG["einsatzregeln"]
r3 = next(r for r in er["regeln"] if r["id"] == "R3")
ersetze(r3, "text", "(LM, Kanone)", "(LM)")
er["verstoss"] = ("Das System warnt bei R2 und R3, verhindert das Bekämpfen aber nicht. Die Warnung gilt für den vorausberechneten Einschlagort. "
                  "Jeder Verstoß wird protokolliert. Seit 2.9 (P3): Die Kanone reicht nur bis zum Ortsanfang KRÄHE – liegt der Einschlag "
                  "dahinter, ist sie nicht wählbar (bei einem Zug nur die Fahrzeuge in Reichweite); das ist keine Warnung, sondern eine Grenze.")
ersetze(REG["wirkung"], "trefferregel", "R2, R3 und Einsatzbereich gelten am Einschlagort.",
        "R2 und R3 gelten am Einschlagort, ebenso die Reichweite der Kanone (nur bis zum Ortsanfang KRÄHE).")
ersetze(REG["wirkung"], "durchbruch", "setzt sie über Brücke oder Furt und fährt westlich aus dem Bild: durchgebrochen.",
        "setzt sie über Brücke oder Furt und fährt westlich aus dem Bild: durchgebrochen. Seit 2.9 (P4.2) nur, wenn ARGUS dem Team "
        "mindestens eines ihrer Fahrzeuge vorher gemeldet hat (szenario.durchbruch.gemeldet_s); sonst bleibt sie am Ostufer.")
ersetze(SZ["hintergrund"], "hinweis", "nur Ziele bis zum Bach (x < 500 m)", "nur Ziele bis zum Ortsanfang KRÄHE (x < 500 m)")
ersetze(M["M30"]["loesung"], "text", "Kanone außerhalb des Einsatzbereichs", "Kanone außer Reichweite (nur bis Ortsanfang KRÄHE)")

# =============================================================================== P4 Meldungen passend zum Geschehen
DB = SZ["durchbruch"]
DB["gemeldet_s"] = 60
DB["hinweis"] = DB["hinweis"].rstrip() + (
    " Seit 2.9 (P4.2): Durchbrechen kann nur, wen das Team kennen konnte – eine Gruppe bricht nur durch, wenn ARGUS mindestens eines ihrer "
    "Fahrzeuge spätestens gemeldet_s vor t_s gemeldet hat (Meldung erschienen, nicht schon beim Erscheinen entfallen); sonst bleibt sie am "
    "Ostufer. I-13 nennt, wer durchgebrochen ist, und kommt erst, wenn das erste Fahrzeug sichtbar über dem Bach ist.")
G = {g["id"]: g for g in DB["gruppen"]}
for gid in ("D-04", "D-05"):
    ersetze(G[gid], "zweck", "fällt E-01 aus (Freigabe auf die PT-91), greift es über die Brücke an.",
            "fällt E-01 aus (Freigabe auf die PT-91), meldet ARGUS es seit 2.9 mit M38 (10:22:15) – bekämpft das Team es nicht, greift es "
            "über die Brücke an. Ohne M38 (Gegenangriff läuft) bricht es nie durch (P4.2).")

for zid in ("Z-27", "Z-28"):
    z = Z[zid]
    assert z.get("ungemeldet")
    ersetze(z["gt"], "text", "Von ARGUS nicht gemeldet; Ziel des polnischen Gegenangriffs.",
            "Von ARGUS nur gemeldet (M38), wenn der polnische Gegenangriff wegen einer Freigabe auf die PT-91 ausfällt; sonst Ziel des "
            "Gegenangriffs.")
    z["bedingt_gemeldet"] = "M38"

M38 = {
    "id": "M38",
    "t_s": 1335,
    "ziele": ["Z-27", "Z-28"],
    "phase": 5,
    "bedingung": {"typ": "freigabe", "ziele": ["Z-15", "Z-16", "Z-17"]},
    "argus": {"klasse": "Panzer", "zugehoerigkeit": "Feind", "konfidenz": 91, "empfehlung": "BEKÄMPFEN", "einzeln": [93, 89]},
    "sensor": {
        "waerme": "heiß (2 Fahrzeuge, Motoren laufen)",
        "bewegung": "stehen in Bereitstellung",
        "spuren": "Kettenspuren von Osten (Hauptstraße und Achse SÜD)",
        "kennzeichnung": "keine erkannt",
        "personen": "–",
        "hinweis": "nur Spielleitung (seit 2.4, E6.3)",
    },
    "bild": {
        "datei": "drohne/M38.webp",
        "beschreibung": "Ein Kampfpanzer und ein Schützenpanzer stehen an der Brücke ELSTER Ost in Bereitstellung, der Kampfpanzer nördlich, "
                        "der Schützenpanzer südlich der Hauptstraße.",
        "sicht": [],
        "ausschnitt_m": 150,
        "merkmale": [],
    },
    "loesung": {"entscheid": "BEKÄMPFEN", "wirkmittel": ["LM"],
                "text": "echte Ziele, die letzten Feindkräfte an der Brücke Ost; Ortschaft: nur LM (Kanone außer Reichweite)"},
    "zweck": "Seit 2.9 (P4.2): bedingte Meldung – nur wenn das Team die PT-91 bekämpft hat und der polnische Gegenangriff deshalb ausfällt. "
             "ARGUS meldet dann die letzten Feindkräfte an der Brücke Ost (Z-27 T-72, Z-28 BMP-2) 78 s vor ihrem Angriff über die Brücke "
             "(D-04 10:23:33): Das Team kann sie bekämpfen. Tut es das nicht, brechen sie durch und I-13 nennt sie. Die Folge des Fehlers "
             "bei S3 bleibt sichtbar und fair. Ohne Freigabe auf die PT-91 kommt die Meldung nie (der Gegenangriff zerschlägt die beiden).",
    "bedingt_gewollt": "P4.2: kommt nur nach einer Freigabe auf die PT-91 (Z-15–17); Nummer wie eine Verstärkung („33a“)",
}
liste = SZ["meldungen"]
pos = next(i for i, m in enumerate(liste) if m["t_s"] > M38["t_s"])
liste.insert(pos, M38)
assert [m["t_s"] for m in liste] == sorted(m["t_s"] for m in liste)

E01 = next(e for e in SZ["ereignisse"] if e["id"] == "E-01")
E01["regel"] = E01["regel"].rstrip() + (
    " Seit 2.9 (P4): Fällt E-01 aus (Freigabe auf die PT-91), meldet ARGUS die letzten Feindkräfte an der Brücke Ost mit M38 (10:22:15); "
    "nur gemeldete Kräfte brechen durch.")

sf = next(f for f in SZ["schluesselfaelle"] if f["id"] == "S3")
ersetze(sf, "kern", "Wer vorher bekämpft, trifft den eigenen Entsatz, und die letzten Feindkräfte bleiben stehen.",
        "Wer vorher bekämpft, trifft den eigenen Entsatz, und die letzten Feindkräfte bleiben stehen: ARGUS meldet sie um 10:22:15 (Ziel 33a); "
        "bekämpft das Team sie nicht, brechen sie um 10:24 über die Brücke durch (I-13).")
ph5 = next(p for p in SZ["phasen"] if p["nr"] == 5)
ersetze(ph5, "absicht", "Wer bis zu seinem Angriffszeitpunkt nicht aufgehalten ist, bricht über den Bach durch (I-13).",
        "Wer bis zu seinem Angriffszeitpunkt nicht aufgehalten ist und von ARGUS gemeldet wurde, bricht über den Bach durch (I-13 nennt ihn).")

# ---------------------------------------------------------------- Lagemeldungen mit Behauptung (P4.1, P4.4, P4.5)
BRUECKE_OST = E01["ziele_reihenfolge"]


def lage(iid, text=None, behauptet=None, varianten=None):
    i = I[iid]
    if text is not None:
        i["text"] = text
    if behauptet is not None:
        i["behauptet"] = behauptet
    if varianten is not None:
        i["varianten"] = varianten
    return i


# I-11 (09:20): „ein SPz brennt“ nur, wenn H-02 wirklich wirkte (Z-11 stand noch); den Rückzug unter Nebel (H-03 09:42, Rückzug ab 09:52)
# behauptet sie nicht mehr – zur Zeit der Meldung war beides noch nicht geschehen
lage("I-11", text="Feind greift mit verstärktem Zug Richtung Brücke an.", behauptet={"stehen": ["Z-09", "Z-10", "Z-11"]}, varianten=[
    {"behauptet": {"hintergrund": ["H-02"], "stehen": ["Z-09", "Z-10"]},
     "text": "Feind greift mit verstärktem Zug Richtung Brücke an, ein SPz brennt an der Brücke Ost. Der Rest hält vor der Brücke."},
    {"behauptet": {"hintergrund": ["H-02"]},
     "text": "Feind griff mit verstärktem Zug Richtung Brücke an, ein SPz brennt an der Brücke Ost."},
    {"behauptet": {"zerstoert": ["Z-09", "Z-10", "Z-11"]},
     "text": "Angriff des verstärkten Feindzuges Richtung Brücke ist zerschlagen."},
])
# I-06 (20:00): „Feind sammelt … an der Brücke Ost“ nur, wenn dort Feind steht
lage("I-06", text="Kp {bereit}/4 einsatzbereit, {zug_verw}. Feind drängt weiter zur Brücke, haltet die Brücke Ost unter Feuer!",
     behauptet={}, varianten=[
         {"behauptet": {"feind_im_bereich": "E-01"},
          "text": "Feind sammelt KPz und SPz an der Brücke Ost, Angriff steht bevor. Kp {bereit}/4 einsatzbereit, {zug_verw}. Feuer auf Brücke Ost!"},
     ])
# I-07 (18:15): Mörserfeuer aus Hof RABE auf 1/4 – Feuer der Quelle Z-19 auf pz4 bis zur Meldung
lage("I-07", behauptet={"beschuss": {"quelle": "Z-19", "panzer": "pz4"}})
# I-08a: erst nach einem Treffer auf die PT-91 (bisher 60 s nach der Freigabe), mit der Zahl der getroffenen Panzer
pt91 = ["Z-15", "Z-16", "Z-17"]
I["I-08a"]["bedingung"] = {"typ": "treffer", "ziele": pt91, "verzoegerung_s": 60}
lage("I-08a", behauptet={"getroffen": {"ziele": pt91}, "ereignis_aus": "E-01"}, varianten=[
    {"behauptet": {"getroffen": {"ziele": pt91, "min": 2}, "ereignis_aus": "E-01"},
     "text": "Eigenbeschuss! {getroffen_zahl} Panzer ausgefallen, Besatzungen verwundet. Gegenangriff eingestellt. Feuer sofort einstellen!"},
])
# I-08b (23:20): „letzte Feindkräfte dort zerschlagen“ nur, wenn der Gegenangriff dort wirklich Feind traf und keiner mehr steht
lage("I-08b", text="Gegenangriff an der Brücke Ost im Gange.", behauptet={}, varianten=[
    {"behauptet": {"ereignis_traf": "E-01", "bereich_frei": "E-01"},
     "text": "Gegenangriff erfolgreich: Brücke Ost genommen, letzte Feindkräfte dort zerschlagen."},
    {"behauptet": {"ereignis_traf": "E-01", "feind_im_bereich": "E-01"},
     "text": "Gegenangriff an der Brücke Ost: Feind dort bekämpft, Brücke Ost noch nicht genommen."},
    {"behauptet": {"bereich_frei": "E-01"},
     "text": "Gegenangriff erfolgreich: Brücke Ost genommen, dort kein Feind mehr angetroffen."},
])
# I-17 (21:45, Auflösung): „bekämpfen Feind an der Brücke Ost“ nur, wenn dort Feind steht oder der Gegenangriff schon traf
lage("I-17", text="PL-PzKp: Feuerstellung Feldweg Süd bezogen, beobachten Brücke Ost.", behauptet={}, varianten=[
    {"behauptet": {"feind_im_bereich": "E-01"}, "text": "PL-PzKp: Feuerstellung Feldweg Süd bezogen, bekämpfen Feind an der Brücke Ost."},
    {"behauptet": {"ereignis_traf": "E-01"}, "text": "PL-PzKp: Feuerstellung Feldweg Süd bezogen, Feind an der Brücke Ost bekämpft."},
])
# I-13: nennt, wer durchgebrochen ist; kommt 10 s nach dem ersten gemeldeten Fahrzeug über dem Bach (dann auf der Karte „durchgebrochen“)
lage("I-13", text="{durch} über {ueber} eingebrochen! Kp {bereit}/4 einsatzbereit.", behauptet={"durchbruch": True}, varianten=[
    {"behauptet": {"durchbruch": BRUECKE_OST, "ereignis_aus": "E-01"},
     "text": "Gegenangriff PL ausgefallen: {durch} über {ueber} eingebrochen! Kp {bereit}/4 einsatzbereit."},
    {"behauptet": {"durchbruch": True, "panzer_getroffen": "durchbruch"},
     "text": "{durch} über {ueber} eingebrochen! {pz} getroffen, Kp {bereit}/4 einsatzbereit."},
])
I["I-13"]["zweck"] = (I["I-13"].get("zweck", "").rstrip() + " Seit 2.9 (P4.3): nennt die durchgebrochenen Fahrzeuge mit Zielnummer und den "
                      "Übergang; nur gemeldete Kräfte brechen durch. Geht der Durchbruch auf die Freigabe der PT-91 zurück, sagt sie es.").strip()
# bedingte Lagemeldungen mit Treffern: was ihr Text behauptet
lage("I-09", behauptet={"getroffen": {"ziele": ["Z-19"], "personen": "zivil"}})
lage("I-14", behauptet={"getroffen": {"ziele": ["Z-41"], "personen": "zivil"}})
lage("I-15", behauptet={"getroffen": {"ziele": ["Z-43"], "personen": "zivil"}}, varianten=None)
lage("I-16", behauptet={"getroffen": {"ziele": ["Z-44"]}})

# geprüft, behaupten kein Ergebnis: I-04 nennt den Auftrag des Gegenangriffs („zerschlagen“), I-10 fordert die Abschlussmeldung an
lage("I-04", behauptet={})
lage("I-10", behauptet={})

# Reserve (die Spielleitung löst sie aus): was der Text behauptet – die Übersicht zeigt, ob es im Spiel des Teams stimmt
R["R-01"]["behauptet"] = {"eloka": True}
R["R-02"]["behauptet"] = {"letzte_nicht_bekaempft": True}
R["R-03"]["behauptet"] = {"getroffen": {"ziele": ["Z-12"]}}
R["R-04"]["behauptet"] = {"verstoss": "R2"}

# =============================================================================== Schreiben
os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(FZK, os.path.join(ZIEL, "katalog_fahrzeuge.json"))
L.speichere(WMK, os.path.join(ZIEL, "katalog_wirkmittel.json"))
L.speichere(KARTE, os.path.join(ZIEL, "karte_kraehe.json"))
print("P1 geänderte Texte:", N_P1)
print(f"Szenario 2.9 → {ZIEL}")
