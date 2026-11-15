#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.8 aus v2.7: Änderungsliste M (Test „allein testen“ vom 15.11.2026), Teil M3.

Quelle: claude/Aenderungen_Testpunkte_15-11.md (M3.1–M3.4). Grundsätze bleiben: deterministisch, nicht zu verlieren, keine Darstellung
getöteter Menschen, kein Punktestand, keine Rangliste.

  M3.1  Erster Einschlag bei uns → sofort eine Meldung. regeln.verluste.meldungen.erste_quelle: Jede Feuerquelle (Feindartillerie
        H-01/H-04/H-12, Mörser, Beobachter, Direktschützen, Attrappe, Durchbruch) meldet sich mit ihrem ersten Einschlag bei den eigenen
        Panzern; kam dazu bisher keine Meldung, kommt eine dazu (ohne Abstand, zählt für keine Drosselung, alle übrigen Meldungen
        bleiben). Die Feuervorbereitung des Hintergrunds meldet sich mit ihrem ersten Einschlag überhaupt (auch daneben) für die Panzer,
        auf denen sie liegt (neues Feld `panzer`): H-01 05:00 „1/1 und 1/2 unter Artilleriefeuer, Einschläge noch daneben. Halten
        Stellung.“, H-04 13:35 „1/1 bis 1/4 …“, H-12 19:50 „1/1 …“. Prüfgrenze erste_quelle_s = 3 s.
        M3.1b: Den Beschuss zu H-04 meldet jetzt die Kp um 13:35 – I-12 (14:40) spricht nur noch vom Angriff der Feind-Kp.
  M3.2  I-03 „Zielbearbeitung dauert zu lange …“ (07:00) ersatzlos gestrichen; die Leitfrage „Gehorsam und Gewissen“ der Diskussion
        nannte die „Zeitvorgabe von 30 s je Meldung“ aus I-03 und spricht jetzt nur noch vom Druck der 1. Kp.
  M3.3  Die drei PT-91 erscheinen nach der Auflösung A-01 geschlossen als ein Zug: blaues Zeichen Größe Zug (`groesse`),
        „PL-PzZug (verbündet)“, nach Eigenbeschuss „PL-PzZug (verbündet, getroffen)“. Lagemeldungen sprechen weiter von der PL-PzKp.

Einmalig benutzt wie bau_szenario_v27.py; maßgeblich ist danach die JSON-Datei.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v28.py BASIS_2.7_ORDNER OUT_ORDNER
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
assert ALT["version"] == "2.7", "Basis muss Szenario 2.7 sein"


def roh(name):
    with open(os.path.join(QUELLE, name), encoding="utf-8") as f:
        return json.load(f)


SZ = copy.deepcopy(ALT)
REG = roh(ALT["kataloge"]["regeln"])
FZK = roh(ALT["kataloge"]["fahrzeuge"])
WMK = roh(ALT["kataloge"]["wirkmittel"])
KARTE = roh(ALT["kataloge"]["karte"])
SZ["version"] = "2.8"
REG["version"] = "2.8"   # 2.7 hatte die Nummer der Regeln nicht nachgezogen
SZ["stand"] = "2026-11-15"
I = {i["id"]: i for i in SZ["injects"]}
H = {h["id"]: h for h in SZ["hintergrund"]["ereignisse"]}


def ersetze(obj, schl, alt, neu):
    """Text in obj[schl] ersetzen; prüft, dass der alte Text vorkommt (sonst wäre die Vorlage veraltet)."""
    assert alt in obj[schl], f"„{alt}“ nicht in {obj.get('id', schl)}: {obj[schl][:200]}"
    obj[schl] = obj[schl].replace(alt, neu)


# =============================================================================== M3.1 erste Meldung je Feuerquelle
PANZER_DER_VORBEREITUNG = {"H-01": ["pz1", "pz2"], "H-04": ["pz1", "pz2", "pz3", "pz4"], "H-12": ["pz1"]}
for hid, pz in PANZER_DER_VORBEREITUNG.items():
    h = H[hid]
    assert h["art"] == "feindartillerie", hid
    # Reihenfolge der Schlüssel: panzer vor text (wie in den Daten üblich)
    neu = {}
    for k, v in h.items():
        if k == "text":
            neu["panzer"] = pz
        neu[k] = v
    h.clear()
    h.update(neu)
if SZ["hintergrund"].get("hinweis"):
    SZ["hintergrund"]["hinweis"] = (SZ["hintergrund"]["hinweis"].rstrip() + " Seit 2.8 (M3.1): Die Kp meldet den ersten Einschlag jeder "
                                    "Feuervorbereitung (auch daneben) für die Panzer in `panzer`.")

mel = REG["verluste"]["meldungen"]
neu = {}
for k, v in mel.items():
    if k == "hinweis":
        neu["erste_quelle"] = True
        neu["erste_quelle_s"] = 3
    neu[k] = v
REG["verluste"]["meldungen"] = mel = neu
mel["hinweis"] = (mel["hinweis"].rstrip() + " Seit 2.8 (M3.1a, erste_quelle): Jede Feuerquelle meldet sich mit ihrem ersten Einschlag bei den "
                  "eigenen Panzern (Feuervorbereitung des Hintergrunds: erster Einschlag überhaupt, Vorlage „beschuss“ für die Panzer in "
                  "hintergrund.ereignisse[].panzer). Kam dazu bisher keine Meldung, kommt eine dazu – ohne Abstand, sie zählt für keine "
                  "Drosselung; alle übrigen Meldungen bleiben wie bisher. Prüfregel: Meldung höchstens erste_quelle_s nach dem ersten Einschlag.")

# M3.1b: I-12 nur noch zum Angriff der Feind-Kp (den Beschuss meldet die Kp um 13:35 selbst)
ersetze(I["I-12"], "text", "Starkes Artilleriefeuer auf unsere Stellungen. Feind greift mit einer Kp an:", "Feind greift mit einer Kp an:")
I["I-12"]["zweck"] = (I["I-12"]["zweck"].rstrip() + " Seit 2.8 (M3.1b) nur noch der Angriff: Den Beschuss der Feuervorbereitung H-04 "
                      "meldet die Kp schon mit dem ersten Einschlag um 10:13:35.")

# =============================================================================== M3.2 I-03 streichen
assert "I-03" in I
SZ["injects"] = [i for i in SZ["injects"] if i["id"] != "I-03"]
for lf in SZ["auswertung"]["diskussion"]["leitfragen"]:
    if lf["titel"] == "Gehorsam und Gewissen":
        ersetze(lf, "text", "Zeitvorgabe von 30 s je Meldung, Druck der 1. Kp", "Druck der 1. Kp")
roh_text = json.dumps(SZ, ensure_ascii=False)
assert "I-03" not in roh_text and "30 s je Meldung" not in roh_text, "I-03 noch erwähnt"

# =============================================================================== M3.3 PT-91 als ein Zug
for a in SZ["aufloesungen"]:
    if a["id"] != "A-01":
        continue
    a["name"] = "PL-PzZug (verbündet)"
    a["getroffen"]["name"] = "PL-PzZug (verbündet, getroffen)"
    neu = {}
    for k, v in a.items():
        if k == "hinweis":
            neu["groesse"] = "zug"
        neu[k] = v
    a.clear()
    a.update(neu)
    a["hinweis"] = (a["hinweis"].rstrip() + " Seit 2.8 (M3.3): Die drei PT-91 stehen danach geschlossen als ein blaues Zeichen der Größe "
                    "Zug (groesse) auf der Karte – kein Teil-, Wrack- oder Kontaktzeichen mehr mit Feindzeichen. Lagemeldungen sprechen "
                    "weiter von der PL-PzKp (die Kompanie greift an, auf der Karte ist ihr Zug).")

# =============================================================================== Speichern
os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(FZK, os.path.join(ZIEL, "katalog_fahrzeuge.json"))
L.speichere(WMK, os.path.join(ZIEL, "katalog_wirkmittel.json"))
L.speichere(KARTE, os.path.join(ZIEL, "karte_kraehe.json"))
print(f"Szenario {SZ['version']}: {len(SZ['ziele'])} Ziele, {len(SZ['meldungen'])} Meldungen, {len(SZ['injects'])} Lagemeldungen → {ZIEL}")
