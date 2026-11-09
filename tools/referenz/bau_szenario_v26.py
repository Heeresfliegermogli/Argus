#!/usr/bin/env python3
"""Baut Szenario KRÄHE-01 v2.6 aus v2.5: Änderungen H vom 09.11.2026 (eine Rolle je Team, Tempo statt Arbeitsteilung).

Quelle: claude/Aenderungen_EineRolle_09-11.md (H2, H3). Grundsätze bleiben: deterministisch, nicht zu verlieren, keine Darstellung
getöteter Menschen, kein Punktestand.

  H2  Eine Rolle „Zielbearbeitung“ je Team (2–3 Personen an einem Laptop), eine Entscheidung je Meldung: BEKÄMPFEN mit Mörser, LM
      oder Kanone (= Freigabe), ZURÜCKSTELLEN oder ABLEHNEN. Die Lösung je Meldung ist eine Entscheidung (`loesung.entscheid`, dazu
      Wirkmittel und Begründung) statt drei Stufen G1/G2/G3; Fälle, Lage und Rollentexte für eine Rolle. Alle Lagemeldungen gehen an
      das Team (`an: "Team"`).
  H3.1 Fast-Track entfällt: Inject I-05 (Angebot), regeln.fast_track und alle Texte dazu.
  H3.2 Phase 5 heißt „Krise“ (vorher „Krise und Gegenangriff“): Der polnische Gegenangriff ist vorher nirgends sichtbar – nur die
      Lagemeldung I-04 im Spiel trägt die Information (S3).
  H3.3 Weniger Artilleriemeldungen (regeln.verluste.meldungen): Druckmeldungen wegen Artillerie und Mörser höchstens eine je Panzer,
      Schütze und Stufe und insgesamt höchstens eine je 2 min (ausgefallen kommt immer); die Feindartillerie des Hintergrunds
      (H-01, H-04, H-12) meldet sich nur noch beim Stufenwechsel eines Panzers. Neu (H5.7): der erste Beschuss eines Panzers kommt
      immer als Lagemeldung. Umsetzung in tools/referenz/verluste.py und src/kern/verluste.ts.
  H3.4 Texte auf eine Rolle (Plenum-Lage, Lage des Teams, Spielleitung, Fälle, Lösungen, Regeln).

Einmalig benutzt wie bau_szenario_v25.py; maßgeblich ist danach die JSON-Datei.
Aufruf (im Repo-Wurzelordner): python3 tools/referenz/bau_szenario_v26.py BASIS_2.5_ORDNER OUT_ORDNER
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
assert ALT["version"] == "2.5", "Basis muss Szenario 2.5 sein"


def roh(name):
    with open(os.path.join(QUELLE, name), encoding="utf-8") as f:
        return json.load(f)


SZ = copy.deepcopy(ALT)
REG = roh(ALT["kataloge"]["regeln"])
FZK = roh(ALT["kataloge"]["fahrzeuge"])
WMK = roh(ALT["kataloge"]["wirkmittel"])
KARTE = roh(ALT["kataloge"]["karte"])
M = {m["id"]: m for m in SZ["meldungen"]}
I = {i["id"]: i for i in SZ["injects"]}
F = {f["id"]: f for f in SZ["schluesselfaelle"] + SZ["nebenfaelle"]}
SZ["version"] = "2.6"
SZ["stand"] = "2026-11-09"


def ersetze(obj, schl, alt, neu):
    """Text in obj[schl] ersetzen; prüft, dass der alte Text vorkommt (sonst wäre die Vorlage veraltet)."""
    assert alt in obj[schl], f"„{alt}“ nicht in {obj.get('id', schl)}: {obj[schl][:160]}"
    obj[schl] = obj[schl].replace(alt, neu)


# =============================================================================== H3.1 Fast-Track entfällt
SZ["injects"] = [i for i in SZ["injects"] if i.get("aktion") != "fast_track_angebot"]
I = {i["id"]: i for i in SZ["injects"]}
REG.pop("fast_track", None)

# =============================================================================== H3.2 Phase 5 „Krise“
P = {p["nr"]: p for p in SZ["phasen"]}
assert P[5]["name"] == "Krise und Gegenangriff"
P[5]["name"] = "Krise"
ersetze(P[4], "absicht", "Fast-Track-Angebot (I-05), Feuervorbereitung", "Feuervorbereitung")
# H4.2: je Phase ein Satz für die Einweisung der Teams (ohne Gegenangriff, ohne Lösungshinweis); „absicht“ bleibt für die Spielleitung
KURZ = {
    1: "Feindliche Spähtrupps klären auf; die ersten Meldungen kommen – Zeit, die Bedienung kennenzulernen.",
    2: "Der Feind greift mit einzelnen Kräften an und tastet eure Stellungen ab.",
    3: "Kurze Atempause: Der Feind ordnet sich und holt zurück, was liegen geblieben ist.",
    4: "Der Feind greift mit der ganzen Kompanie auf mehreren Achsen an – viele Meldungen in kurzer Zeit.",
    5: "Die Lage spitzt sich zu: Der Feind drängt mit allem, was er hat, zum Bach; die 1. Kp braucht Feuer.",
}
for nr, satz in KURZ.items():
    P[nr]["kurz"] = satz

# =============================================================================== H2/H3.4 Lage für eine Rolle
SZ["lage"] = {
    "plenum": {
        "titel": "Lage für alle (Spielleitung liest vor, ca. 80 s)",
        "absaetze": [
            "Übungslage, alles fiktiv. Russische Kräfte greifen seit dem Morgen nach Westen an. Im Raum KRÄHE erwarten wir eine "
            "verstärkte Kompanie mit Kampf- und Schützenpanzern.",
            "Unser Panzerbataillon 613 verteidigt westlich von KRÄHE. Am Westrand hält die 1./PzBtl 613 mit vier Kampfpanzern "
            "Leopard 2A7V (1/1 bis 1/4) Brücke ELSTER und Furt Nord.",
            "Auftrag: Der Feind darf den Bach ELSTER nicht überschreiten, vor allem nicht an der Brücke ELSTER. Östlich des Bachs liegen "
            "die Ortschaft KRÄHE und die Schule; dort sind noch Zivilpersonen.",
            "Die Drohne „Milan“ klärt den Raum östlich des Bachs auf. Ihre Bilder wertet das KI-System ARGUS aus: Klasse, Konfidenz und "
            "eine Empfehlung. Laut Hersteller liegt ARGUS in 94 % der Fälle richtig.",
            "Jedes Team ist die Zielbearbeitung des Bataillons und entscheidet jede ARGUS-Meldung: BEKÄMPFEN (mit Mörser, Loitering "
            "Munition oder der Kanone der 1. Kp), ZURÜCKSTELLEN oder ABLEHNEN. Ohne eure Entscheidung wird nichts bekämpft. Alle Teams "
            "spielen dieselbe Lage, 25 Minuten in Echtzeit.",
        ],
    },
    "team": {
        "titel": "Zielbearbeitung",
        "absaetze": [
            "Ihr seid zu zweit oder zu dritt an einem Laptop. Jede ARGUS-Meldung kommt in euren Eingang, die Wartezeit läuft mit. Ihr "
            "seht das Drohnenbild live mit Lupe und was ARGUS meldet: Klasse (Panzer, Fahrzeug oder Infanterie), Zugehörigkeit, "
            "Konfidenz und Empfehlung.",
            "Ihr entscheidet: BEKÄMPFEN mit Mörser, Loitering Munition (LM) oder der Kanone der 1. Kp, ZURÜCKSTELLEN (beobachten) oder "
            "ABLEHNEN. Die Fahrzeuge fahren weiter, während die Wirkung unterwegs ist: Das System rechnet den Einschlagort voraus und "
            "warnt bei einem Regelverstoß dort, verhindert ihn aber nicht. Wirkmittel sind begrenzt; bei einem Zug wirken LM und "
            "Kanone je Fahrzeug, der Mörser als Fläche.",
            "Am Rand laufen die Lagemeldungen von Brigade, Nachbarn und der 1. Kp. In der Kopfzeile stehen eure vier Panzer mit ihrem "
            "Zustand und der Bestand der Wirkmittel. Ihr verantwortet jede Wirkung.",
        ],
    },
    "spielleitung": {
        "titel": "Spielleitung (2 Personen)",
        "absaetze": [
            "SL 1 steuert: Spiel für alle Teams öffnen und mit „Start für alle“ starten, bei Bedarf anhalten und weiter, "
            "Reserve-Lagemeldungen nach Lage. Jeder Team-Laptop rechnet sein Spiel selbst; die Übersicht zeigt die Statusmeldungen der "
            "Teams (Uhr, Eingang, Schlüsselfälle, Panzer).",
            "SL 2 beobachtet: schaut einzelnen Teams zu und notiert je Schlüsselfall: Was hat das Team gesehen, wie lange hat es "
            "hingeschaut, was hat es entschieden? Was wurde gesagt?",
            "Nicht eingreifen und keine Hinweise geben. Fragen zur Bedienung beantworten, Fragen zur Lage nicht.",
        ],
    },
}
SZ["ablauf_unterricht"] = [
    {"phase": "Einweisung", "dauer_min": 3,
     "inhalt": "Lage im Plenum (Spielleitung liest vor), Einweisung am Team-Laptop: Übersicht der Ansicht, Phasen, Klassen, Wirkmittel"},
    {"phase": "Spiel", "dauer_min": 25,
     "inhalt": "Spieluhr 00:00–25:00, alle Teams parallel, jeder Team-Laptop rechnet sein Spiel selbst; Meldungen, Lagemeldungen und "
               "Hintergrundgefecht nach Zeitleiste"},
    {"phase": "Auswertung", "dauer_min": 12, "inhalt": "Teamvergleich, dann die Schlüsselfälle in der Reihenfolge S3, S2, S1, S4"},
]

# =============================================================================== H2 Lagemeldungen an das Team
for i in SZ["injects"] + SZ["reserve_injects"]:
    i["an"] = "Team"
ersetze(I["I-02"], "zweck", "G2 kennt die Schule als No-Strike-Zone, aber nicht ihre Belegung.",
        "Die Karte zeigt die Schule als No-Strike-Zone, die Belegung steht nur hier im Feed.")
ersetze(I["I-11"], "zweck", "Lagebild für G3: ", "Lagebild: ")
ersetze(I["I-12"], "zweck", "Lagebild für G3: ", "Lagebild: ")
ersetze(I["I-12"], "zweck", "Erhöht das Zielaufkommen unmittelbar nach dem Fast-Track-Angebot.", "Erhöht das Zielaufkommen.")
I["I-04"]["zweck"] = ("Die entscheidende Information für S3, gut drei Minuten vor der Meldung und mitten im Hauptangriff, kurz vor S4. Sie "
                      "steht nur im Feed der Lagemeldungen und läuft unter Druck leicht unter. Ideal: Das Team merkt sich Feldweg Süd und "
                      "lehnt M20 ab.")
ersetze(I["I-10"], "zweck", "G3 zieht selbst Bilanz", "das Team zieht selbst Bilanz")
# I-03 sprach von der Kette über drei Stellen („über 3 min“); mit einer Rolle drängt es aufs Tempo (H: Lavender, 20 s je Ziel).
I["I-03"]["text"] = "Zielbearbeitung dauert zu lange. Ziel sind 30 s je Meldung, sonst nimmt der Feind die Brücke."
I["I-03"]["zweck"] = ("Tempo-Druck: Die Brigade fordert 30 s je Meldung. Für die Auswertung: Wie lange habt ihr hingeschaut (Sekunden je "
                      "Entscheidung im Protokoll)?")
R = {r["id"]: r for r in SZ["reserve_injects"]}
ersetze(R["R-02"], "einsatz", "wenn G3 viel ablehnt", "wenn ein Team viel ablehnt")
ersetze(SZ["ereignisse"][0], "regel", "Gibt G3 vorher eine Wirkung auf Z-15–17 frei", "Bekämpft das Team vorher Z-15–17")

# =============================================================================== H2/H3.4 eine Lösung je Meldung
EINE = {"BEKÄMPFEN", "ZURÜCKSTELLEN", "ABLEHNEN"}


def klammer(s):
    m = re.search(r"\((.*)\)", s)
    return m.group(1) if m else ""


def eine_loesung(m):
    """Aus den drei Stufen G1/G2/G3 eine Entscheidung des Teams: ABLEHNEN, ZURÜCKSTELLEN oder BEKÄMPFEN (mit Wirkmittel und Grund)."""
    lo = m["loesung"]
    g1, g2, g3 = lo["G1"], lo["G2"], lo["G3"]
    neu = {}
    if g1.startswith("ABLEHNEN"):
        neu = {"entscheid": "ABLEHNEN", "text": klammer(g1) or "kein Ziel"}
    elif g2.startswith("BEOBACHTEN"):
        neu = {"entscheid": "ZURÜCKSTELLEN", "text": g2.split(":", 1)[1].strip() if ":" in g2 else "abwarten"}
    elif g2.startswith("NICHT"):
        neu = {"entscheid": "ABLEHNEN", "text": "nicht bekämpfen"}
    elif re.match(r"^(ABLEHNEN|keine|nicht)", g3):
        neu = {"entscheid": "ABLEHNEN", "text": g3.replace("ABLEHNEN und ", "").replace("ABLEHNEN, ", "")}
    else:
        grund = [x for x in (klammer(g1), klammer(g2) or g2.replace("BEKÄMPFEN", "").strip()) if x]
        neu = {"entscheid": "BEKÄMPFEN", "text": "; ".join(grund) if grund else "echtes Ziel"}
    if lo.get("wirkmittel"):
        neu["wirkmittel"] = lo["wirkmittel"]
    return neu


# Fälle und Sonderlagen: Begründung von Hand (eine Rolle, was im Bild, auf der Karte und im Feed steht)
VON_HAND = {
    "M08": {"entscheid": "ABLEHNEN", "text": "Attrappe: Netz hängt durch, Holzrohr, keine Spuren, keine Besatzung, bewegt sich nie"},
    "M12": {"entscheid": "ABLEHNEN", "text": "Rotes Kreuz im Bild; Schule 60 m daneben und belegt (I-02)"},
    "M32": {"entscheid": "ZURÜCKSTELLEN", "text": "Zivilpersonen an der Hauswand; Mörser nie (Ortschaft), LM erst, wenn beim Einschlag niemand im "
                                                  "Wirkradius ist (Folgemeldung)"},
    "M17": {"entscheid": "ZURÜCKSTELLEN", "text": "fährt zur Schule: Einschlag läge auf dem Schulgelände, solange der BMP-2 dort steht; ab ca. "
                                                  "20:20 mit LM"},
    "M18": {"entscheid": "ZURÜCKSTELLEN", "text": "ARGUS warnt zu Recht: Zivilpersonen am Mörser; Folgemeldung abwarten (Druck durch I-07)"},
    "M33": {"entscheid": "ABLEHNEN", "text": "PRESS auf dem Dach, Kamerateam: Zivilpersonen"},
    "M35": {"entscheid": "ABLEHNEN", "text": "verwundet, ohne Waffen: außer Gefecht"},
    "M20": {"entscheid": "ABLEHNEN", "text": "polnische PT-91: passt zu I-04 (Gegenangriff ab 19:00 entlang Feldweg Süd); im Bild nicht erkennbar"},
    "M21": {"entscheid": "ABLEHNEN", "text": "außer Gefecht, Besatzung ergibt sich (weißes Tuch); Gefangennahme veranlassen"},
    "M24": {"entscheid": "ABLEHNEN", "text": "Traktor mit Familie, ARGUS unsicher"},
    "M34": {"entscheid": "BEKÄMPFEN", "wirkmittel": ["LM"],
            "text": "nur LM (kein Mörser: Kamerateam im Wirkradius) und nicht, solange der Pkw der Familie vorbeifährt"},
    "M31": {"entscheid": "BEKÄMPFEN", "wirkmittel": ["LM"], "text": "Beobachter im Kirchturm; nur LM (kein Mörser: Ortschaft und Kirche)"},
    "M36": {"entscheid": "BEKÄMPFEN", "wirkmittel": ["LM"], "text": "die Bewohner sind weg; nur LM (Ortschaft)"},
    "M04": {"entscheid": "BEKÄMPFEN", "text": "ARGUS unsicher, aber Heck eines Kettenfahrzeugs und frische Kettenspuren im Bild"},
}
for m in SZ["meldungen"] + [vm for g in SZ["verstaerkungen"]["gruppen"] for vm in g["meldungen"]]:
    m["loesung"] = VON_HAND.get(m["id"]) or eine_loesung(m)
    assert m["loesung"]["entscheid"] in EINE, m["id"]
# Zweck-Texte ohne Rollen und Fast-Track (nur Spielleitung und Drehbuch)
ersetze(M["M08"], "zweck", "Die Information liegt nur bei G1 in den Sensordaten.", "Die Hinweise stehen nur im Bild (Lupe).")
ersetze(M["M12"], "zweck", "G1 sieht das Schutzzeichen, G2 sieht die Schule.",
        "Im Bild steht das Schutzzeichen, auf der Karte die Schule (60 m), im Feed ihre Belegung (I-02).")
ersetze(M["M13"], "zweck", " Erste Meldung nach dem Fast-Track-Angebot (91 %).", "")
ersetze(M["M35"], "zweck", " Bei Fast-Track geht die Meldung an der Aufklärung vorbei.", "")
ersetze(M["M20"], "zweck", "Nur G3 hat die Information. Bei Fast-Track entfällt G1 ganz.",
        "Die Information steht nur in der Lagemeldung I-04 im Feed.")
ersetze(M["M21"], "zweck", " Bei Fast-Track (94 %) sieht G1 das weiße Tuch nie.", "")

# =============================================================================== H3.4 Fälle für eine Rolle
def fall(fid, **kw):
    for k, v in kw.items():
        F[fid][k] = v


fall("S3", info_bei="Lagemeldung I-04 im Feed (17:00), im Bild nicht erkennbar", info_kurz="nur im Feed (I-04)",
     kern="Als Finale stößt eine polnische Panzerkompanie von Süden vor, um die letzten Feindkräfte an der Brücke zu zerschlagen. ARGUS "
          "meldet sie mit 96 % als drei T-72. PT-91 sind eine polnische Weiterentwicklung des T-72, ARGUS wurde laut Kleingedrucktem "
          "überwiegend auf russische Fahrzeuge trainiert. Im Bild ist der Fehler nicht zu erkennen; die Information stand gut drei "
          "Minuten vorher im Feed der Lagemeldungen (I-04) – mitten im Hauptangriff und kurz vor dem Mörser im Hof RABE. Ab 23:30 "
          "schießen die PT-91 aus Feuerstellungen südlich der Brücke auf die Feindkräfte an der Brücke. Wer vorher bekämpft, trifft den "
          "eigenen Entsatz, und die letzten Feindkräfte bleiben stehen.",
     gut="Das Team liest I-04, merkt sich Feldweg Süd und lehnt M20 ab. Der Gegenangriff entscheidet das Gefecht (I-08b).",
     leitfragen=["Wann habt ihr I-04 gesehen, mitten im Hauptangriff und kurz vor dem Mörser im Hof RABE? Wie lange stand die Meldung "
                 "im Feed, bevor ihr weitergearbeitet habt?",
                 "Wie viele Sekunden habt ihr auf diese Meldung geschaut? Hättet ihr den Fehler mit mehr Zeit gefunden?",
                 "Teamvergleich: Einige Teams haben die Polen beschossen, andere nicht. Was haben die anderen anders gemacht?",
                 "Wer ist verantwortlich, wenn alle nach Vorschrift gehandelt haben und trotzdem Verbündete getroffen wurden?"])
fall("S2", info_bei="im Bild (Rotes Kreuz), auf der Karte (Schule 60 m), im Feed (Schule belegt, I-02)", info_kurz="Bild, Karte, Feed",
     gut="Das Team sieht das Rote Kreuz und lehnt ab.",
     leitfragen=["Habt ihr das Rote Kreuz gesehen? Wie lange habt ihr auf das Bild geschaut?",
                 "Das System meldete keinen Verstoß. Reicht das?",
                 "Was hat der echte BTR-80 kurz vorher mit eurer Erwartung gemacht?"])
fall("S1", info_bei="nur im Bild (Netz hängt durch, Holzrohr, keine Spuren, bewegt sich nie)", info_kurz="nur im Bild",
     kern="Während der Gefechtsaufklärung meldet ARGUS mit 93 % einen T-72 am Waldrand FUCHS, westlich des Bachs: Der Feind scheint die "
          "Bachlinie schon überschritten zu haben. Die Attrappe gehört zur Täuschung und soll das eigene Feuer herauslocken. Im Bild "
          "sieht man es mit der Lupe: durchhängendes Netz, Holzrohr, keine Spuren, keine Besatzung, keine Bewegung. ARGUS wertet nur "
          "die Form aus (Kleingedrucktes).",
     gut="Das Team prüft das Bild mit der Lupe und lehnt ab (Verdacht auf Attrappe).",
     leitfragen=["Was habt ihr im Bild angesehen, bevor ihr entschieden habt – und wie lange?",
                 "Der Gegner kennt die Schwächen der KI. Was bedeutet das für euer Vertrauen in 93 %?",
                 "Was kostet ein Fehlschuss hier? (Munition, eigene Stellung verraten, Zeit, falsches Lagebild)"])
fall("S4", info_bei="ARGUS-Warnung NICHT BEKÄMPFEN, Zivilpersonen im Bild; Druck im Feed (I-07) und an 1/4", info_kurz="ARGUS warnt; Druck im Feed",
     gut="Das Team stellt zurück und bekämpft erst die Folgemeldung M23 (LM).")
fall("S5", info_bei="im Bild (Zivilpersonen an der Hauswand), auf der Karte (Ortschaft); Druck: Treffer an 1/1",
     info_kurz="Bild; Druck an 1/1",
     gut="Das Team stellt zurück und bekämpft erst nach der Folgemeldung, mit LM. Mörser nie.",
     leitfragen=["Der Feind hat die Zivilpersonen missbraucht. Ändert das, was ihr dürft?",
                 "Habt ihr die Personen an der Hauswand gesehen? Wie lange habt ihr geschaut?",
                 "Wie lange hättet ihr gewartet, während 1/1 Treffer meldet?"])
fall("S6", info_bei="nur im Bild (Verwundete ohne Waffen)", info_kurz="nur im Bild",
     kern="Neben dem brennenden BMP-2 am Ostufer liegen und sitzen vier verwundete Feindsoldaten ohne Waffen. ARGUS meldet Infanterie "
          "mit 92 % und empfiehlt BEKÄMPFEN. Nur wer das Bild ansieht, erkennt, dass niemand mehr kämpft.",
     gut="Das Team sieht die Verwundeten und lehnt ab (außer Gefecht).",
     leitfragen=["Woran habt ihr erkannt, dass niemand mehr kämpft?",
                 "Wie lange habt ihr auf dieses Bild geschaut? Was ging unter dem Tempo an euch vorbei?",
                 "Was unterscheidet einen Gegner in Deckung von einem Verwundeten ohne Waffe – für ARGUS und für euch?"])
fall("S7", info_bei="im Bild (Beobachter auf dem Kirchturm), auf der Karte (Ortschaft), Warnung am Mörser; Druck: Treffer an 1/2",
     info_kurz="Wirkmittel; Druck an 1/2")
fall("S8", info_bei="im Bild (PRESS auf dem Dach, Pkw im Live-Bild); Mörser ohne Warnung", info_kurz="Bild",
     gut="Das Team lehnt das Pressefahrzeug ab und bekämpft die Kolonne nur mit LM und nicht, während der Pkw vorbeifährt.",
     leitfragen=["Habt ihr die Aufschrift gelesen? Wie groß war sie?",
                 "Das System zeigte beim Mörser keine Warnung. Wer hat an die Presse gedacht?",
                 "Was hätte ein Video vom Treffer auf die Presse für euren Auftrag bedeutet?"])
ersetze(F["N2"], "kurz", " Bei Fast-Track (94 %) geht die Meldung an G1 vorbei, niemand sieht das weiße Tuch.",
        " Das weiße Tuch sieht nur, wer das Bild ansieht.")
ersetze(F["N3"], "kurz", "Sensordaten bestätigen das Ziel.", "Heck und frische Kettenspuren im Bild bestätigen das Ziel.")

# Technische Anforderungen (Doku in den Daten)
for a in SZ["anforderungen_technik"]:
    if a["schritt"] == "8 Auswertung":
        a["text"] = ("Teamvergleich je Schlüsselfall (S1–S8, N1–N4) aus den Protokollen der Teams; Replay mit Meldung, der einen Entscheidung "
                     "des Teams mit den Sekunden bis zur Entscheidung (ab Eingang und ab Öffnen) und dem Einschlag, bei S3 dazu, wann "
                     "I-04 angeklickt wurde.")
    a["text"] = a["text"].replace("Warnungen bei G2/G3 am vorausberechneten Einschlagort", "Warnungen am vorausberechneten Einschlagort")
    a["text"] = a["text"].replace("auf den Karten von Aufklärung, Zielprüfung und Führung", "auf der Karte des Teams")
    a["text"] = a["text"].replace("bei der Rolle (noch) nicht angekommen ist", "beim Team (noch) nicht angekommen ist")
SZ["anforderungen_technik"].append({
    "schritt": "2.6 Eine Rolle, lokale Engine",
    "text": "Jeder Team-Laptop rechnet sein Spiel selbst (Host im Browser des Teams). Das Netz dient nur der Lobby, dem Start für alle "
            "(Uhr-Aktion der Spielleitung mit Startzeitpunkt), der Statusmeldung des Teams an die Spielleitung (status/<team>, alle ca. "
            "5 s) und dem Protokoll-Upload in Stücken. Fällt das Netz aus, spielt das Team weiter; das Protokoll wird nachgeladen oder "
            "als Datei gespeichert. Eine Entscheidung je Meldung (Ereignis `entscheid`) mit Sekunden ab Eingang und ab Öffnen.",
})

# =============================================================================== Regeln: eine Rolle, kein Fast-Track, weniger Artillerie
REG["version"] = "2.6"
REG["ablauf"] = [
    {"stufe": "ARGUS", "aktion": "Meldung erzeugen"},
    {"stufe": "Team (Zielbearbeitung)",
     "aktionen": ["BEKÄMPFEN mit <Wirkmittel>", "ZURÜCKSTELLEN", "ABLEHNEN"],
     "sieht": [
         "Eingang mit Wartezeit je Meldung",
         "Drohnenbild live mit ARGUS-Markierung (oft teilweise verdeckt: Wolken, Rauch, Bäume, Bildstörung), Lupe",
         "ARGUS: Klasse (Panzer, Fahrzeug, Infanterie), Zugehörigkeit, Konfidenz, Empfehlung, Bildalter",
         "Lagekarte mit Zonen, Spuren der gemeldeten Ziele, Kontakten, eigenen Panzern; Wirkradius-Vorschau am vorausberechneten Einschlagort",
         "Wirkmittel mit Bestand, Einschlag als Countdown, Warnungen; bei Zügen ×n",
         "Lagemeldungen (Brigade, Nachbarn, 1. Kp) im Feed",
     ]},
    {"stufe": "Wirkung", "aktion": "schlägt nach der Flugzeit am Ort des Ziels ein; getroffen ist alles im Wirkradius nach der Lage beim Einschlag"},
]
ER = {r["id"]: r for r in REG["einsatzregeln"]["regeln"]}
ER["R1"]["prueft"] = "Team"
ER["R2"]["prueft"] = "System warnt, Team entscheidet"
ER["R3"]["prueft"] = "System warnt, Team entscheidet"
ER["R4"]["prueft"] = "Team"
ER["R5"]["text"] = "Wirkung nur mit der Entscheidung BEKÄMPFEN des Teams."
ER["R5"]["prueft"] = "Team"
REG["wirkung"]["vorhersage"] = REG["wirkung"]["vorhersage"].replace("Die Warnungen bei G2 und G3 rechnen", "Die Warnungen am Wirkmittel rechnen")
REG["wirkung"]["unbearbeitet"] = REG["wirkung"]["unbearbeitet"].replace(" Es gibt keinen Zeitablauf außer Fast-Track.", " Es gibt keinen Zeitablauf.")
KZ = {k["id"]: k for k in REG["kennzahlen"]}
KZ["k_zeit"]["text"] = "Wie lange habt ihr hingeschaut? Sekunden je Entscheidung ab Eingang und ab Öffnen (Median), getrennt nach Konfidenz"
KZ["k_verstoss"]["text"] = "Bekämpfungen trotz RoE-Warnung (am vorausberechneten Einschlagort)"
REG["einsatzregeln"]["verstoss"] = REG["einsatzregeln"]["verstoss"].replace("verhindert die Freigabe aber nicht", "verhindert das Bekämpfen aber nicht")
# H3.3 / H5.7: Druckmeldungen der Kp
MLD = REG["verluste"]["meldungen"]
MLD.update({
    "artillerie": ["steil", "beobachter", "artillerie", "attrappe"],
    "artillerie_abstand_s": 120,
    "nur_stufenwechsel": ["artillerie"],
    "erster_beschuss": True,
    "hinweis": "Seit 2.6 (H3.3, H5.7): Wegen Artillerie und Mörser (artillerie) höchstens eine Druckmeldung je Panzer, Schütze und Stufe und "
               "insgesamt höchstens eine je artillerie_abstand_s (ausgefallen kommt immer); die Feindartillerie des Hintergrunds "
               "(nur_stufenwechsel) meldet sich nur beim Stufenwechsel. Der erste Beschuss eines Panzers kommt immer (erster_beschuss).",
})
# Anzeige im Spiel (H5.5, H5.6): Lagemeldungen bleiben so lange oben stehen; Bestand gilt ab so wenig als knapp
REG["anzeige"] = {
    "lagemeldung_s": 8,
    "bestand_knapp": {"LM": 4, "MRS": 3},
    "hinweis": "Seit 2.6: Eine neue Lagemeldung steht lagemeldung_s Sekunden (Echtzeit) oben im Feed und rutscht dann ohne Klick in die "
               "einklappbare Liste „frühere Meldungen“; ein Klick liest sie sofort. Bestand ab bestand_knapp und weniger: Warnung in "
               "Kopfzeile und am Knopf.",
}

# Regeln und Hinweise für Spielleitung und Drehbuch ohne Rollen (H3.4)
ersetze(REG["wirkung"], "trefferregel", "Freigabe durch G3 plus Zeit bis zum Einschlag", "BEKÄMPFEN durch das Team plus Zeit bis zum Einschlag")
ersetze(REG["wirkung"], "bewegung", "auf den Karten von G1, G2 und G3", "auf der Lagekarte des Teams")
ersetze(REG["wirkung"], "durchbruch", "G3 bekommt eine Lagemeldung", "Das Team bekommt eine Lagemeldung")
ersetze(SZ["durchbruch"], "hinweis", "G3 bekommt I-13", "das Team bekommt I-13")
ersetze(SZ["eigene_truppe"], "hinweis", "Alle Rollen sehen die Panzer", "Team, Spielleitung und Plenum sehen die Panzer")
ersetze(SZ["verluste"], "hinweis", "je Panzer an die Führung", "je Panzer an das Team")

# =============================================================================== Prüfung: keine Rollen und kein Fast-Track in sichtbaren Texten
VERBOTEN = re.compile(r"Fast-?Track|\bG[123]\b|ZURÜCK AN|Lagehinweis")
# vor dem Spiel sichtbar (Plenum, Einweisung, Kopfzeile): auch kein „Gegenangriff“ (H3.2)
VORHER = re.compile(r"Gegenangriff")
SICHTBAR = [("lage", SZ["lage"]), ("phasen.name", [p["name"] for p in SZ["phasen"]]), ("phasen.kurz", [p["kurz"] for p in SZ["phasen"]]),
            ("ablauf_unterricht", SZ["ablauf_unterricht"]),
            ("injects.text", [i["text"] for i in SZ["injects"] if i["id"] not in ("I-08a", "I-08b")]),
            ("reserve.text", [r["text"] for r in SZ["reserve_injects"]]), ("loesung", [m["loesung"] for m in SZ["meldungen"]]),
            ("faelle", [{k: f[k] for k in ("info_bei", "info_kurz", "gut", "leitfragen") if k in f} for f in SZ["schluesselfaelle"]]),
            ("nebenfaelle", [f["kurz"] for f in SZ["nebenfaelle"]]), ("regeln", {k: REG[k] for k in ("ablauf", "einsatzregeln", "kennzahlen")})]


def texte(o, pfad=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from texte(v, f"{pfad}.{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from texte(v, f"{pfad}[{i}]")
    elif isinstance(o, str):
        yield pfad, o


for name, obj in SICHTBAR:
    for p, s in texte(obj, name):
        if VERBOTEN.search(s) and not (name == "injects.text"):
            raise AssertionError(f"alte Rolle oder Fast-Track in {p}: {s[:160]}")
        if VORHER.search(s) and name in ("lage", "phasen.name", "phasen.kurz", "ablauf_unterricht"):
            raise AssertionError(f"Gegenangriff vor dem Spiel sichtbar in {p}: {s[:160]}")
# In allen Texten (auch nur für Spielleitung und Drehbuch): keine Rollenkürzel, kein Fast-Track
for name, obj in (("szenario", SZ), ("regeln", REG)):
    for p, s_ in texte(obj, name):
        if re.search(r"\bG[123]\b|Fast-?Track|Alle Rollen", s_):
            raise AssertionError(f"alte Rolle oder Fast-Track in {p}: {s_[:160]}")
# I-04 nennt den polnischen Angriff als Information im Spiel (S3) – das ist gewollt; die Phase heißt nicht danach
assert all("Gegenangriff" not in p["name"] for p in SZ["phasen"])
assert not any("fast" in json.dumps(i).lower() for i in SZ["injects"])

# =============================================================================== Speichern
os.makedirs(ZIEL, exist_ok=True)
L.speichere(SZ, os.path.join(ZIEL, "szenario_kraehe_01.json"))
L.speichere(REG, os.path.join(ZIEL, "regeln.json"))
L.speichere(FZK, os.path.join(ZIEL, "katalog_fahrzeuge.json"))
L.speichere(WMK, os.path.join(ZIEL, "katalog_wirkmittel.json"))
L.speichere(KARTE, os.path.join(ZIEL, "karte_kraehe.json"))
print(f"Szenario {SZ['version']}: {len(SZ['ziele'])} Ziele, {len(SZ['meldungen'])} Meldungen, {len(SZ['injects'])} Lagemeldungen, "
      f"Lösungen {dict((e, sum(1 for m in SZ['meldungen'] if m['loesung']['entscheid'] == e)) for e in sorted(EINE))} → {ZIEL}")
