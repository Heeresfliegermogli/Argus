#!/usr/bin/env python3
"""Spielleitungsmappe (PDF) für den Papier-Durchlauf des Planspiels ARGUS (ein Team).

Inhalt: Deckblatt, Zeitleiste zum Abhaken (mit Hintergrundgefecht und Durchbruch), Kontrollkarte, Lagekarte für das Team,
Lage für alle und Teamkarte, Meldekarten (je Meldung eine Entscheidung), Inject-Karten, Lösungshilfe, Beobachtungsbogen, Auswertung.

Seit Szenario 2.1: Durchbruch D-01–D-08 in der Zeitleiste (prüfen, ob die Gruppe aufgehalten ist; sonst ansagen und I-13
an das Team), nur noch die 2. Kompanie.
Seit 26.10.2026 (Änderungen B3, B4, B6, B7): Spieluhr 00:00–25:00; Meldungen als „Ziel n“ (Spielleitung sieht die interne Kennung
daneben); kein Vermerk mehr. Texte der Daten wie in der Anzeige (argus_lib.anzeige_*).
Seit Szenario 2.3 (01.11.2026, D1–D5): Teil 1b Verluste und Druckmeldungen der Kompanie (Regeln und die Meldungen der Modellteams
zum Ansagen), Inject-Karten mit Platzhaltern zum Eintragen, eigene Kräfte auf den Karten, Auswertung mit „Preis des Abwartens“.
Seit Szenario 2.5 (02.11.2026, F): eigene Truppe mit vier Kampfpanzern (1/1–1/4); Teil 1b mit Feindfeuer und Druckmeldungen je
Panzer, Inject-Karten mit dem Panzer und Lücken für Treffer und Zustand, Wirkmittel „Kanone“. Seit F5 heißt sie „1./PzBtl 613“,
Absender „1. Kp“; Texte, die die Einheit nennen, kommen aus szenario.eigene_truppe.
Meldekarten seit 2.4 (E6.3) ohne Sensordaten: was zählt, steht als Merkmal im Bild (Spielleitung sieht die Sensordaten im Drehbuch).
Seit Szenario 2.6 (09.11.2026, Änderungen H): eine Rolle je Team (Zielbearbeitung, 2–3 Personen) – die Meldekarte hat eine
Entscheidung (BEKÄMPFEN mit … / ZURÜCKSTELLEN / ABLEHNEN) mit der Uhr des Eingangs und der Entscheidung (daraus die Sekunden, H2.4),
eine Teamkarte statt drei Rollenkarten, die Lösung je Meldung, der Beobachtungsbogen mit Sekunden; Fast-Track entfällt, Phase 5
heißt „Krise“. Lagekarte: Lagekarte_Team.png.

Aufruf: python3 gen_mappe.py OUT.pdf KARTENORDNER   (Karten vorher mit karte_render.py KARTENORDNER erzeugen)
"""
import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle, CondPageBreak)

import argus_lib as L
from pruefe_szenario import pruefe, FREIGABE_RICHTWERT_S
import simuliere_durchlauf as SIM

FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", FD + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DVI", FD + "DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("DVC", FD + "DejaVuSansCondensed.ttf"))
pdfmetrics.registerFont(TTFont("DVCB", FD + "DejaVuSansCondensed-Bold.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily("DV", normal="DV", bold="DVB", italic="DVI", boldItalic="DVB")
registerFontFamily("DVC", normal="DVC", bold="DVCB", italic="DVI", boldItalic="DVCB")

S = {
    "t": ParagraphStyle("t", fontName="DVB", fontSize=18, leading=22, spaceAfter=6),
    "h": ParagraphStyle("h", fontName="DVB", fontSize=13, leading=16, spaceBefore=4, spaceAfter=5),
    "h2": ParagraphStyle("h2", fontName="DVB", fontSize=10.5, leading=13, spaceBefore=4, spaceAfter=3),
    "p": ParagraphStyle("p", fontName="DV", fontSize=9.5, leading=12.5, spaceAfter=4),
    "pl": ParagraphStyle("pl", fontName="DV", fontSize=11, leading=15, spaceAfter=6),
    "s": ParagraphStyle("s", fontName="DV", fontSize=7.8, leading=9.6),
    "sc": ParagraphStyle("sc", fontName="DVC", fontSize=7.4, leading=9),
    "scb": ParagraphStyle("scb", fontName="DVCB", fontSize=7.4, leading=9),
    "kl": ParagraphStyle("kl", fontName="DVI", fontSize=6.6, leading=8, textColor=colors.HexColor("#444444")),
    "inj": ParagraphStyle("inj", fontName="DV", fontSize=11.5, leading=15),
    "c": ParagraphStyle("c", fontName="DV", fontSize=8, leading=10, alignment=TA_CENTER),
}
GRAU = colors.HexColor("#e8e8e8")
HGRAU = colors.HexColor("#f3f0e8")
DGRAU = colors.HexColor("#e6e0f0")
SICHT_TEXT = {"wolke": "Wolke", "rauch": "Rauch", "dunst": "Dunst", "baeume": "Bäume", "tarnnetz": "Tarnnetz",
              "stoerung": "Bildstörung", "unschaerfe": "Unschärfe"}
ART_TEXT = {"feindartillerie": "Feindartillerie", "panzerabwehr": "Kanone 1. Kp", "rauch": "Rauch (Feind)"}
GELB = colors.HexColor("#fff59d")
BOX = "☐"
uhr = lambda t: L.uhrzeit(None, t)          # Spieluhr mm:ss
TEAM = "Team"


def rolle(k):
    return L.ROLLE.get(k, k)


def P(t, st="p"):
    return Paragraph(t, S[st])


def zl(ids):
    return ", ".join(ids) if len(ids) < 3 else f"{ids[0]}–{ids[-1].split('-')[-1]}"


def klasse(m):
    a = m["argus"]
    n = len(m["ziele"])
    k = f"{n}× {a['klasse']}" if n > 1 else a["klasse"]
    if a.get("zugehoerigkeit"):
        k += f" · {a['zugehoerigkeit']}"
    konf = " / ".join(str(x) for x in a["einzeln"]) if a.get("einzeln") else str(a["konfidenz"])
    return k, konf


def ziel(d, m, gruppe=True):
    """„Ziel 7“ bzw. „Ziel 7 (3 Fz)“ wie in der Anzeige."""
    n = d["nummern"].get(m["id"], m["id"])
    return f"Ziel {n}" + (f" ({len(m['ziele'])} Fz)" if gruppe and len(m["ziele"]) > 1 else "")


def AT(d, s):
    """Text, der schon in Spieluhr-Zeit steht (Lösungshilfe): nur Rollen und Zielnummern."""
    return L.meldungen_im_text(L.rollen_im_text(s), d["nummern"])


def feinlage(p):
    """PQ plus Meter im Planquadrat ab der Nordwestecke (Ost/Süd), z. B. F4 · 48/86."""
    return f"{'ABCDEFGHIJ'[int(p[0] // 100)]}{int(p[1] // 100) + 1} · {int(p[0] % 100):02d}/{int(p[1] % 100):02d}"


def etn(sz):
    """Name der eigenen Truppe wie in Absender und Kopfzeile (seit F5 „1. Kp“)."""
    return (sz.get("eigene_truppe") or {}).get("name", "eigene Truppe")


def loesung_text(m):
    """Lösung einer Meldung (seit 2.6 eine Entscheidung): „BEKÄMPFEN (nur LM) – echtes Ziel“."""
    lo = m["loesung"]
    wm = f" (nur {', '.join(lo['wirkmittel'])})" if lo.get("wirkmittel") else ""
    return f"<b>{lo['entscheid']}</b>{wm}" + (f" – {lo['text']}" if lo.get("text") else "")


class Mappe(BaseDocTemplate):
    def __init__(self, pfad, titel):
        super().__init__(pfad, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=13 * mm,
                         bottomMargin=13 * mm, title=titel, author="Planspiel ARGUS (fiktiv)")
        hoch = Frame(14 * mm, 13 * mm, A4[0] - 28 * mm, A4[1] - 26 * mm, id="hoch")
        quer = Frame(12 * mm, 11 * mm, landscape(A4)[0] - 24 * mm, landscape(A4)[1] - 22 * mm, id="quer")
        voll = Frame(0, 0, landscape(A4)[0], landscape(A4)[1], leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="voll")
        self.addPageTemplates([
            PageTemplate("hoch", [hoch], pagesize=A4, onPage=self.fuss),
            PageTemplate("quer", [quer], pagesize=landscape(A4), onPage=self.fuss),
            PageTemplate("bild", [voll], pagesize=landscape(A4)),
        ])
        self.titel = titel

    def fuss(self, c, doc):
        c.saveState()
        c.setFont("DV", 6.5)
        c.setFillColor(colors.HexColor("#666666"))
        w = doc.pagesize[0]
        c.drawString(12 * mm, 6 * mm, f"{self.titel} · ÜBUNG · alles fiktiv")
        c.drawRightString(w - 12 * mm, 6 * mm, f"Seite {doc.page}")
        c.restoreState()


def tab(data, widths, header=True, size=None, zebra=False, extra=None):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [("FONT", (0, 0), (-1, -1), "DVC", size or 7.4), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#999999")),
          ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
          ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]
    if header:
        st += [("BACKGROUND", (0, 0), (-1, 0), GRAU), ("FONT", (0, 0), (-1, 0), "DVCB", size or 7.4)]
    if extra:
        st += extra
    t.setStyle(TableStyle(st))
    return t


# ============================================================================ Teile
def deckblatt(d, r, story):
    sz, kz = d["szenario"], r["kennzahlen"]
    story += [P("Spielleitungsmappe Planspiel ARGUS", "t"),
              P(f"Szenario {sz.get('anzeige', sz['id'])} · {sz['titel']} · Version {sz['version']} · Stand {sz['stand']}", "h2"),
              P(f"<i>{sz['fiktiv']}</i> Diese Mappe ist nur für die Spielleitung. Meldekarten, Inject-Karten, die Teamkarte und die "
                "Lagekarte gehen an das Team; Zeitleiste, Kontrollkarte, Lösungshilfe und Beobachtungsbogen nicht. Auf Papier spielt ein "
                "Team (2–3 Personen, Zielbearbeitung – seit 2.6 eine Rolle, eine Entscheidung je Meldung) mit beiden Spielleitern."),
              Spacer(1, 4 * mm)]
    rows = [["Teil", "Inhalt", "an"]]
    for a, b, c in (("1", "Zeitleiste zum Abhaken mit Hintergrundgefecht und Durchbruch", "SL 1"),
                    ("1b", f"Feindfeuer und Druckmeldungen der eigenen {etn(sz)}, je Panzer (zum Ansagen)", "SL 1"), ("2", "Kontrollkarte mit Ground Truth", "SL"),
                    ("3", "Lagekarte mit Wirkradius-Schablone", "Team"),
                    ("4", "Lage für alle, Teamkarte Zielbearbeitung", "vorlesen / Team"),
                    ("5", f"{kz['meldungen']} Meldekarten: Bild, ARGUS, eine Entscheidung mit Uhr", "Team (Eingang)"),
                    ("6", "Inject-Karten (Lagemeldungen) und Reserve", "Team"),
                    ("7", "Lösungshilfe", "SL"), ("8", "Beobachtungsbogen", "SL 2"), ("9", "Auswertung: Ablauf und Leitfragen", "SL")):
        rows.append([a, b, P(c, "sc")])
    story.append(tab(rows, [12 * mm, 112 * mm, 53 * mm], size=8.5))
    story += [Spacer(1, 5 * mm), P("Ablauf im Unterricht", "h2")]
    story.append(tab([["Phase", "Dauer", "Inhalt"]] + [[a["phase"], f"{a['dauer_min']} min", P(a["inhalt"], "sc")] for a in sz["ablauf_unterricht"]],
                     [30 * mm, 18 * mm, 129 * mm], size=8.5))
    story += [Spacer(1, 5 * mm), P("Papier-Durchlauf in Kürze", "h2")]
    for t in ("Alle Zeiten sind Spielzeit: Die Spieluhr läuft von 00:00 bis 25:00 (Stoppuhr). Die Meldungen heißen für die Spieler "
              "„Ziel 1, 2, 3 …“ in der Reihenfolge, in der ARGUS meldet; die Spielleitung sieht die interne Kennung (M07) daneben.",
              "SL 1 legt jede Meldekarte zur Spielzeit der Zeitleiste beim Team ab (Eingang) – auch wenn dort noch Karten liegen. "
              "Tempo ist Absicht: etwa eine Meldung je Minute, im Hauptangriff alle 30 s.",
              "Das Team sieht das Bild mit den Merkmalen (seit 2.4 ohne Sensordaten) und die ARGUS-Zeile, trägt das Ziel nach der Feinlage "
              "auf der Lagekarte ein, prüft R2 und R3 mit Zirkel und Schablone (fährt das Ziel, gilt die Prüfung für den Ort beim Einschlag) "
              "und entscheidet: BEKÄMPFEN mit Wirkmittel, ZURÜCKSTELLEN oder ABLEHNEN. Es trägt die Uhr der Entscheidung ein und gibt die "
              "Karte an SL 1; zurückgestellte Karten bleiben beim Team und werden später entschieden.",
              "SL 1 rechnet die Sekunden vom Eingang bis zur Entscheidung, prüft mit der Lösungshilfe (Spalte „Achtung“ mit "
              "Freigabe-Zeitraum), was beim Einschlag getroffen wurde, und löst bedingte Injects aus.",
              "Hintergrundgefecht: SL 1 sagt die H-Ereignisse der Zeitleiste kurz an. Sind alle Fahrzeuge einer Meldung zerstört, nimmt SL 1 sie aus dem Eingang.",
              "Durchbruch: Zu den D-Zeilen der Zeitleiste prüft SL 1, ob ein Fahrzeug der Gruppe getroffen ist. Wenn nicht, sagt SL 1 den Durchbruch "
              "an und gibt die Lagemeldung I-13 an das Team. Das ist Lage, keine Wertung; das Gefecht ist nicht zu verlieren.",
              f"Verluste: Die eigene {etn(sz)} steht mit vier Kampfpanzern (1/1–1/4) am Westrand und liegt unter Feuer, solange feuernde Feinde "
              "stehen – erst daneben, dann Treffer. SL 1 sagt die Druckmeldungen der Panzer nach Teil 1b an und setzt in den Inject-Karten "
              "den Stand ein. Verluste sind Lage, keine Punkte; die Kp hält immer.",
              "SL 2 führt den Beobachtungsbogen (wie lange hingeschaut, was gesagt). Bei 25:00 anhalten, Meldekarten nach Fällen sortieren, auswerten."):
        story.append(P("• " + t))
    story += [Spacer(1, 4 * mm), P("Feinlage", "h2"),
              P("Jede Meldekarte nennt das Planquadrat und die Meter ab seiner Nordwestecke nach Ost und Süd: "
                "„F4 · 48/86“ heißt 48 m östlich und 86 m südlich der linken oberen Ecke von F4. Auf der Lagekarte (1:4.000) "
                "ist ein Planquadrat 25 mm breit; 10 m sind 2,5 mm.")]
    story += [Spacer(1, 4 * mm), P("Fertig-Kriterium Schritt 2", "h2"),
              P("Beide Spielleiter haben die Mappe einmal durchgespielt (SL 1 spielt das Team, SL 2 kontrolliert mit der "
                "Lösungshilfe) und keine Lücke gefunden.")]


def zeitleiste(d, r, story):
    sz = d["szenario"]
    hilfe = {h["meldung"]: h for h in r["meldungen"]}
    story += [NextPageTemplate("quer"), PageBreak(), P("1 · Zeitleiste Spielleitung (abhaken, Spielzeit)", "h")]
    ev = [(m["t_s"], "M", m) for m in sz["meldungen"]] + [(i["t_s"], "I", i) for i in sz["injects"] if "t_s" in i]
    ev += [(e["wirkungen"][0]["t_s"], "E", e) for e in sz.get("ereignisse", [])]
    ev += [(h["t_s"], "H", h) for h in (sz.get("hintergrund") or {}).get("ereignisse", [])]
    ev += [(g["t_s"], "D", g) for g in (sz.get("durchbruch") or {}).get("gruppen", [])]
    ev.sort(key=lambda e: (e[0], "HIMED".index(e[1])))
    i13 = next((i for i in sz["injects"] if (i.get("bedingung") or {}).get("typ") == "durchbruch"), None)
    rows = [["", "Uhr", "Ereignis", "Inhalt", "an", "Fall", "Notiz SL"]]
    hl = []
    pi, ph = 0, sz.get("phasen", [])
    for t, art, e in ev:
        while pi < len(ph) and t >= ph[pi]["von_s"]:
            rows.append(["", "", P(f"<b>Phase {ph[pi]['nr']}: {ph[pi]['name']}</b>", "sc"), P(f"<i>{ph[pi]['absicht']}</i>", "sc"), "", "", ""])
            hl.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), colors.HexColor("#eef3f8")))
            pi += 1
        if art == "M":
            a = e["argus"]
            k, konf = klasse(e)
            inh = f"{k} · {konf} % · {a['empfehlung']} · {hilfe[e['id']]['pq']} · {e['sensor']['bewegung']}"
            rows.append([BOX, uhr(t), P(f"<b>{ziel(d, e, False)}</b> ({e['id']})<br/>{zl(e['ziele'])}", "sc"), P(inh, "sc"),
                         P(TEAM, "sc"), e.get("fall") or "", ""])
            if (e.get("fall") or "").startswith("S"):
                hl.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), GELB))
            for i in sz["injects"]:
                bed = i.get("bedingung")
                if bed and set(bed.get("ziele", [])) & set(e["ziele"]) and e.get("folge_von") is None:
                    if bed["typ"] == "freigabe":
                        txt = f"Wenn das Team bekämpft: {bed['verzoegerung_s']} s danach geben."
                    elif bed["typ"] == "freigabe_mit_zivil":
                        bis = [n["freigabe_bis"] for w in hilfe[e["id"]]["wirkmittel"] for n in w["nebenwirkung"] if n["kategorie"] == "zivil"]
                        txt = (f"Wenn das Team bekämpft und beim Einschlag Zivilpersonen im Wirkradius sind"
                               f"{' (LM: bekämpft bis ' + uhr(max(bis)) + ', Mörser länger; Lösungshilfe)' if bis else ''}: "
                               f"{bed['verzoegerung_s']} s nach der Entscheidung geben.")
                    elif bed["typ"] == "treffer":           # seit 2.4 (E5): I-15/I-16 nach dem ersten Treffer
                        txt = f"Wenn eine eigene Wirkung {'/'.join(bed['ziele'])} trifft: {bed['verzoegerung_s']} s nach dem Einschlag geben."
                    else:
                        txt = f"Wenn bis {uhr(bed['t_s'])} nicht bekämpft: dann geben."
                    rows.append([BOX, "↳ bedingt", i["id"], P(txt, "sc"), TEAM, i.get("fall", ""), ""])
        elif art == "E":
            bed = e["bedingung"]
            txt = (f"<b>{e['name']}</b>, nur wenn bis {uhr(bed['t_s'])} nicht auf {'/'.join(bed['ziele'])} gewirkt: "
                   + ", ".join(f"{uhr(x['t_s'])} {x['von']}→{x['ziel']}" for x in e["wirkungen"])
                   + ". Nur Ziele, die noch stehen. Sonst: Angriff bricht ab.")
            rows.append([BOX, uhr(t), f"{e['id']} Ereignis", P(txt, "sc"), "SL", e.get("fall", ""), ""])
            hl.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), GELB))
        elif art == "H":
            zz = f" → {e['ziel']}" if e["art"] == "panzerabwehr" else ""
            extra = " Nur, wenn das Ziel noch steht." if e["art"] == "panzerabwehr" else ""
            rows.append([BOX, uhr(t), P(f"{e['id']} {ART_TEXT.get(e['art'], e['art'])}{zz}", "sc"),
                         P(f"<i>{e['text']}{extra}</i>", "sc"), "ansagen", "", ""])
            hl.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), HGRAU))
        elif art == "D":
            erst = min(e["ueber_s"].values())
            txt = (f"<b>{e['name']}</b> ({zl(e['ziele'])}): Ist bis jetzt keines der Fahrzeuge getroffen, setzt die Gruppe über "
                   f"{e['ueber']} und fährt westlich aus dem Bild (erstes Fahrzeug über dem Bach {uhr(erst)}). "
                   f"Dann ansagen{', ' + i13['id'] + ' ' + str(i13['bedingung']['verzoegerung_s']) + ' s danach an das Team (nur beim ersten Durchbruch)' if i13 else ''} und "
                   "die Meldungen der Gruppe aus dem Eingang nehmen, sobald die Fahrzeuge aus dem Bild sind. Sonst: nichts.")
            rows.append([BOX, uhr(t), f"{e['id']} Durchbruch?", P(txt, "sc"), "prüfen", "", ""])
            hl.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), DGRAU))
        else:
            txt_ = papier_text(sz, e) if "{" in e["text"] else f"{e['text'][:110]}{'…' if len(e['text']) > 110 else ''}"
            rows.append([BOX, uhr(t), f"{e['id']} Inject", P(f"{e['von']}: {txt_}", "sc"), TEAM, e.get("fall", ""), ""])
            if e.get("fall"):
                hl.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), GELB))
    rows.append([BOX, uhr(sz["spieluhr"]["dauer_s"]), "Spielende",
                 P("Uhr anhalten. Meldekarten einsammeln. Plenum.", "sc"), "alle", "", ""])
    story.append(tab(rows, [7 * mm, 15 * mm, 34 * mm, 138 * mm, 22 * mm, 12 * mm, 45 * mm], size=7.4, extra=hl))
    story.append(Spacer(1, 2 * mm))
    story.append(P("Gelb = Schlüsselfall. Grau = Hintergrundgefecht (ansagen). Lila = Durchbruch prüfen. Reserve-Injects "
                   f"{', '.join(i['id'] for i in sz.get('reserve_injects', []))} nur nach Lage (Teil 6). Verstärkungen V-1 bis V-5 nur im "
                   "Spiel am Rechner (seit 2.4 ausgeblendet). Druckmeldungen der Panzer: Teil 1b.", "s"))


def karten(d, ordner, story):
    for name in ("Kontrollkarte_SL.png", "Lagekarte_Team.png"):
        story += [NextPageTemplate("bild"), PageBreak()]
        story.append(Image(os.path.join(ordner, name), width=landscape(A4)[0], height=landscape(A4)[1]))


def lagekarten(d, story):
    sz = d["szenario"]
    story += [NextPageTemplate("hoch"), PageBreak(), P("4 · Lage für alle (vorlesen)", "h")]
    l = sz["lage"]["plenum"]
    for a in l["absaetze"]:
        story.append(P(a, "pl"))
    a = sz["argus_system"]
    story += [Spacer(1, 3 * mm), P(f"<b>{a['name']}</b> – {a['beschreibung']} {a['herstellerangabe']}", "p"),
              P(f"<i>Kleingedrucktes (steht im Befehl; im Spiel hinter „i“ an jeder Meldung): {a['kleingedrucktes']}</i>", "s")]
    story += [Spacer(1, 6 * mm)]
    l = sz["lage"]["team"]
    inhalt = [P(f"Teamkarte {l['titel']}", "h2")] + [P(x, "p") for x in l["absaetze"]]
    rows = [["Wirkmittel", "Radius", "bis zum Einschlag", "Bestand"]] + [
        [w["name"], f"{w['wirkradius_m']} m", P(w.get("vorlauf_text") or L.mmss(w["vorlauf_s"]), "sc"),
         str(w["bestand"]) if w["bestand"] is not None else "∞ (nur x < 500 m)"] for w in d["wirkmittel"].values()]
    inhalt.append(tab(rows, [62 * mm, 16 * mm, 58 * mm, 30 * mm], size=7.6))
    inhalt.append(Spacer(1, 1.5 * mm))
    inhalt += [P(f"<b>{e['id']}</b> {e['text']}", "s") for e in d["regeln"]["einsatzregeln"]["regeln"] if e["id"] in ("R2", "R3", "R4")]
    eigen = (f"Die eigene {etn(sz)} steht mit vier Kampfpanzern (1/1–1/4) am Westrand (Lagekarte, blau); ihre Kanone " if sz.get("eigene_truppe")
             else "Die eigene Kompanie liegt westlich außerhalb der Karte; die Kanone ")
    inhalt.append(P(eigen + "reicht bis zum Bach (x &lt; 500 m). "
                    "Fährt ein Ziel, prüft ihr R2 und R3 für den Ort, an dem es beim Einschlag sein wird. Tragt bei jeder Karte die Uhr "
                    "eurer Entscheidung ein.", "s"))
    t = Table([[inhalt]], colWidths=[A4[0] - 30 * mm])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.black), ("LEFTPADDING", (0, 0), (-1, -1), 6),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [CondPageBreak(60 * mm), t, Spacer(1, 4 * mm)]


def meldekarte(d, m, ziele):
    sz = d["szenario"]
    a, s = m["argus"], m["sensor"]
    u = uhr(m["t_s"])
    pos = {zid: L.position(ziele[zid], m["t_s"]) for zid in m["ziele"]}          # Lage zur Meldezeit (Ziele fahren)
    p0 = pos[m["ziele"][0]]
    W = A4[0] - 28 * mm
    weiss = ParagraphStyle("w", parent=S["s"], textColor=colors.white, fontSize=8.5, leading=11)
    weiss_r = ParagraphStyle("wr", parent=weiss, alignment=2)
    kopf = Table([[Paragraph("<b>ARGUS 3.2</b> · UAV-2 „Milan“ · EO TAG · KI AKTIV", weiss),
                   Paragraph(f"<b>{ziel(d, m)}</b> · {u} · PQ {L.pq(p0, d['karte'])}", weiss_r)]],
                 colWidths=[W * 0.6, W * 0.4])
    kopf.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#222222"))]))
    emp = a["empfehlung"]
    k, konf = klasse(m)
    empf_farbe = {"BEKÄMPFEN": "#f2a900", "PRÜFEN": "#f6d36b", "UNKLAR": "#d6d6d6", "NICHT BEKÄMPFEN": "#9ccc65"}[emp]
    argus = Table([[P(f"<font size=12><b>{k}</b></font>", "p"), P(f"<font size=12><b>{konf} %</b></font>", "p"),
                    P(f"<font size=11><b>{emp}</b></font>", "p")]] +
                  ([[P(f"<i>{a['hinweis']}</i>", "s"), "", ""]] if a.get("hinweis") else []),
                  colWidths=[W * 0.45, W * 0.17, W * 0.38])
    argus.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(empf_farbe)), ("SPAN", (0, 1), (-1, 1)) if a.get("hinweis") else ("SPAN", (0, 0), (0, 0)),
                               ("BOX", (0, 0), (-1, -1), 0.6, colors.black), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    sv = m["bild"].get("sicht") or []
    sicht = ""
    if sv:
        sicht = "<br/><font color='#8a4b00'><b>Sicht:</b> " + ", ".join(
            f"{SICHT_TEXT[x['art']]} verdeckt ca. {round(x['anteil'] * 100)} % ({x['lage']})" for x in sv) + "</font>"
    aus = m["bild"].get("ausschnitt_m") or (95 if len(m["ziele"]) == 1 else 140)
    bild = Table([[P(f"<b>Drohnenbild</b> (Ausschnitt ca. {aus} m):<br/>{m['bild']['beschreibung']}{sicht}", "p")]], colWidths=[W], rowHeights=[24 * mm])
    bild.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#777777")), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f2f2ee")),
                              ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    # seit 2.4 (E6.3) keine Sensordaten für die Spieler: was zählt, steht im Bild (bild.merkmale, am Rechner mit der Lupe)
    mk = [x["text"] for x in m["bild"].get("merkmale") or []]
    sen = tab([["Im Bild erkennbar (genau hinsehen)", ""]] + ([[f"{i}.", P(x, "sc")] for i, x in enumerate(mk, 1)] or [["–", "nichts Besonderes"]])
              + [["Bildalter", L.zahl(s.get("bildalter_s", 0.8)) + " s"]],
              [32 * mm, W - 32 * mm], size=7.8, extra=[("SPAN", (0, 0), (-1, 0))])
    # Spieler sehen keine Kennungen (B7): Fahrzeuge einer Gruppe als Fz 1, Fz 2 …
    if len(m["ziele"]) > 1:
        lage = " ; ".join(f"Fz {i}: {feinlage(pos[zid])}" for i, zid in enumerate(m["ziele"], 1))
    else:
        lage = feinlage(p0)
    zm = [
        [P(f"<b>ENTSCHEIDUNG · {ziel(d, m)}</b>  ·  Lage {lage}", "sc"), P(f"<font color='#888888'>SL: {m['id']}</font>", "sc")],
        [P(f"ARGUS: <b>{k}</b> · {konf} % · {emp}", "sc"), P(f"im Eingang {u}", "sc")],
        [P(f"<b>Team</b>  {BOX} BEKÄMPFEN mit ______   {BOX} ZURÜCKSTELLEN (beobachten)   {BOX} ABLEHNEN     Uhr ______", "sc"), ""],
        [P(f"<i>nach ZURÜCKSTELLEN:</i>  {BOX} BEKÄMPFEN mit ______   {BOX} ABLEHNEN     Uhr ______        "
           f"<font color='#888888'>SL: Sekunden ab Eingang ______</font>", "sc"), ""],
    ]
    zmt = Table(zm, colWidths=[W * 0.80, W * 0.20], rowHeights=[None, None, 8 * mm, 8 * mm])
    zmt.setStyle(TableStyle([("SPAN", (0, 2), (-1, 2)), ("SPAN", (0, 3), (-1, 3)),
                             ("BOX", (0, 0), (-1, -1), 0.9, colors.black), ("LINEBELOW", (0, 1), (-1, 2), 0.3, colors.HexColor("#999999")),
                             ("BACKGROUND", (0, 0), (-1, 0), GRAU), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return KeepTogether([kopf, Spacer(1, 1 * mm), argus, Spacer(1, 1.2 * mm), bild, Spacer(1, 1.2 * mm), sen,
                         P(f"i · Angaben des Herstellers: {sz['argus_system']['kleingedrucktes']}", "kl"), Spacer(1, 2 * mm), zmt])


def meldekarten(d, story):
    sz = d["szenario"]
    ziele = {z["id"]: z for z in sz["ziele"]}
    story += [NextPageTemplate("hoch"), PageBreak(), P("5 · Meldekarten", "h"),
              P("Je Seite zwei Karten. Zur Spielzeit beim Team ablegen (Eingang). Das Team entscheidet je Karte einmal und trägt die Uhr "
                "ein; zurückgestellte Karten bleiben beim Team. Die interne Kennung (grau, „SL: M07“) ist nur zum Sortieren für die Spielleitung.", "s"),
              Spacer(1, 2 * mm)]
    for k, m in enumerate(sorted(sz["meldungen"], key=lambda m: d["nummern"].get(m["id"], 999))):
        story.append(meldekarte(d, m, ziele))
        story.append(Spacer(1, 4 * mm) if k % 2 == 0 else PageBreak())


def papier_text(sz, i):
    """Inject-Text für Papier (seit 2.3): Platzhalter mit dem Stand des Teams als Lücke zum Eintragen durch SL 1 (Teil 1b)."""
    et = sz.get("eigene_truppe") or {}
    pzn = {p["id"]: p["name"] for p in et.get("panzer", [])}
    t = i["text"]
    vp = i.get("verluste_panzer")
    t = t.replace("{pz}", pzn[vp] if vp in pzn else "<u>Panzer ____</u>")      # Durchbruch: der getroffene Panzer, SL 1 trägt ein
    t = t.replace("{gesamt}", str(len(pzn)) if pzn else "____")
    for k, v in (("{treffer}", "____ Treffer"), ("{zustand}", "____"), ("{bereit}", "____"), ("{verw}", "____ Verwundete"),
                 ("{zug_verw}", "____ Verwundete")):
        t = t.replace(k, f"<u>{v}</u>")
    return t


def verluste_teil(d, story):
    """Teil 1b (seit 2.3; seit 2.5 je Panzer): Feindfeuer kurz und die Druckmeldungen beider Modellteams zum Ansagen."""
    sz, vr = d["szenario"], d["regeln"].get("verluste")
    et = sz.get("eigene_truppe")
    if not et or not vr or not et.get("panzer"):
        return
    pzn = {p["id"]: p["name"] for p in et["panzer"]}
    w = vr["waffen"]
    story += [NextPageTemplate("hoch"), PageBreak(), P(f"1b · Feindfeuer und Druckmeldungen der {et['name']}", "h"),
              P(f"Die {et['name']} ({et.get('einheit', et['name'])}) steht mit {len(et['panzer'])} Kampfpanzern am Westrand: "
                + "; ".join(f"{p['name']}{' (' + p['rolle'] + ')' if p.get('rolle') else ''} {p['ort']}" for p in et["panzer"])
                + ". Feuernde Feinde, die noch stehen, schießen sich auf die Panzer ein: Kampf- und Schützenpanzer erst ab dem Ostufer bzw. der "
                  "Brücke Ost (T-72 alle 15 s, BMP-2 alle 10 s, BTR-80 alle 12 s), Mörser eine Salve alle 30 s, der Beobachter im Kirchturm alle 35 s. "
                  "Die ersten beiden Schüsse gehen daneben, der dritte liegt nah, danach trifft jeder zweite, ab dem achten jeder (Mörser: ab der "
                  f"dritten Salve). Ein Treffer kostet: T-72 {w['kpz_t72']['treffer_prozent']} %, BMP-2 {w['spz_bmp2']['treffer_prozent']} %, "
                  f"BTR-80 {w['spw_btr80']['treffer_prozent']} %, Mörser, Artillerie und gelenktes Feuer {w['moerser_trupp']['treffer_prozent']} %. "
                  f"Ab {vr['stufen']['einsatzbereit_ab']} % einsatzbereit, darunter eingeschränkt, unter {vr['stufen']['ausgefallen_unter']} % "
                  f"ausgefallen. Höchstens {vr['hoechstens_ausgefallen']} Panzer fallen aus, die übrigen bleiben bei mindestens "
                  f"{vr['untergrenze_prozent']} % – die Kp hält immer. Bekämpfen stoppt das Feuer. Keine Darstellung getöteter Menschen, nur "
                  "Zustand und Verwundete. Das ist Lage, keine Wertung. Seit 2.6 meldet die Kp den ersten Beschuss jedes Panzers immer, Artillerie und "
                  "Mörser höchstens alle 2 min."),
              P("<b>Auf Papier:</b> Die Verluste hängen von den Entscheidungen des Teams ab. SL 1 sagt die Meldungen der Tabelle an, die "
                "dem Spiel des Teams am nächsten liegt (folgt es ARGUS in 20 s je Karte: „naiv“; wartet es bei S4 auf die Folgemeldung: „ideal“). "
                "Wichtig ist S4: Solange der Mörser im Hof RABE steht, liegt 1/4 unter Feuer; bei S5 1/1, bei S7 1/2. Die Lücken in den "
                "Inject-Karten (I-07, I-06, I-13) füllt SL 1 mit demselben Stand."), Spacer(1, 2 * mm)]
    for team in ("naiv", "ideal"):
        v = SIM.verluste_lauf(d, team)
        zg = v["zug"]
        story.append(P(f"Modellteam {team} · {et['name']} bei Spielende {zg['bereit']}/{zg['gesamt']} einsatzbereit ({zg['eingeschraenkt']} "
                       f"eingeschränkt, {zg['ausgefallen']} ausgefallen), {zg['verwundete']} Verwundete · "
                       + ", ".join(f"{pzn[k]} {s_['zustand']} %" for k, s_ in v["verluste"].items()), "h2"))
        rows = [["", "Uhr", "Panzer", f"Meldung der {et['name']} an das Team"]]
        for k in v["meldungen"]:
            rows.append([BOX, uhr(k["t"]), pzn.get(k["zug"], k["zug"]), P(k["text"], "sc")])
        for iid, txt in v["injects_text"].items():
            rows.append([BOX, iid, "", P(f"<i>Inject-Karte: {txt}</i>", "sc")])
        story.append(tab(rows, [7 * mm, 14 * mm, 16 * mm, 145 * mm], size=7.6))
        story.append(Spacer(1, 3 * mm))


def injectkarten(d, story):
    sz = d["szenario"]
    story += [NextPageTemplate("hoch"), PageBreak(), P("6 · Inject-Karten (Lagemeldungen an das Team)", "h"),
              P("Bedingte Injects (Zeit „nach Lage“) gibt SL 1 nur, wenn die Bedingung aus der Zeitleiste eintritt. Am Rechner laufen die "
                "Lagemeldungen am Rand durch und rutschen nach einigen Sekunden in „frühere Meldungen“ – auf Papier legt SL 1 sie zum Stapel "
                "des Teams, ohne sie vorzulesen.", "s"), Spacer(1, 2 * mm)]
    W = A4[0] - 28 * mm
    alle = sz["injects"] + [dict(r, reserve=True) for r in sz.get("reserve_injects", [])]
    for i in alle:
        zeit = uhr(i["t_s"]) if "t_s" in i else "nach Lage"
        kopf = f"<b>LAGEMELDUNG {i['id']}</b>  ·  an das Team  ·  {zeit}  ·  von {i['von']}" + ("  ·  RESERVE" if i.get("reserve") else "")
        text = papier_text(sz, i)
        t = Table([[P(kopf, "s")], [P(text, "inj")], [P(f"{BOX} gelesen um ______", "s")]],
                  colWidths=[W], rowHeights=[None, 26 * mm, None])
        t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 1.0, colors.black), ("BACKGROUND", (0, 0), (-1, 0), GRAU),
                               ("VALIGN", (0, 1), (-1, 1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
        story += [KeepTogether([t]), Spacer(1, 3 * mm)]


def loesung(d, r, story):
    sz = d["szenario"]
    hilfe = {h["meldung"]: h for h in r["meldungen"]}
    ziele = {z["id"]: z for z in sz["ziele"]}
    story += [NextPageTemplate("quer"), PageBreak(), P("7 · Lösungshilfe (nur Spielleitung)", "h"),
              P("„zulässig“ = R2, R3 und Einsatzbereich erfüllt, an der gemeldeten Position (Meldung) und am Einschlagort bei "
                f"BEKÄMPFEN {FREIGABE_RICHTWERT_S} s nach der Meldung (Einschlag). „Vorhalt“: ab oder bis wann sich das während der Bearbeitung ändert. "
                "Geschützte Ziele (R1, R4) erkennen nur Menschen. „Achtung“ = geschützte Objekte im Wirkradius beim Einschlag und der "
                "Zeitraum der Entscheidung, in dem das passiert. „Lösung“ = die eine Entscheidung des Teams nach dem Szenario. Alle Zeiten Spielzeit.", "s"),
              Spacer(1, 1.5 * mm)]
    rows = [["Ziel", "Fahrzeuge", "Ground Truth", "ARGUS", "zulässig", "Achtung", "Lösung (eine Entscheidung)"]]
    hl = []
    for m in sz["meldungen"]:
        h = hilfe[m["id"]]
        g0 = L.gt_bei(ziele[m["ziele"][0]], m["t_s"])
        ach = []
        for x in h["wirkmittel"]:
            prot = [AT(d, n["text"]) for n in x["nebenwirkung"] if n["kategorie"] in L.SCHUTZ]
            if prot:
                ach.append(f"{x['wm']}: {'; '.join(prot)}")
        zul = f"{', '.join(h['zulaessig_meldung']) or '—'} → {', '.join(h['zulaessig']) or '—'}"
        if h["vorhalt"]:
            zul += "<br/>" + AT(d, "; ".join(h["vorhalt"]))
        rows.append([P(f"<b>{ziel(d, m, False)}</b> ({m['id']}) {m.get('fall') or ''}", "sc"), zl(m["ziele"]),
                     P(f"<b>{L.GT_TEXT[g0['kategorie']]}</b>: {g0['text']}", "sc"),
                     "falsch" if h["argus_falsch"] else "richtig", P(zul, "sc"),
                     P("<br/>".join(ach) or "–", "sc"), P(loesung_text(m), "sc")])
        if (m.get("fall") or "").startswith("S"):
            hl.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), GELB))
        if h["argus_falsch"]:
            hl.append(("FONT", (3, len(rows) - 1), (3, len(rows) - 1), "DVCB", 7.4))
    story.append(tab(rows, [19 * mm, 15 * mm, 74 * mm, 13 * mm, 36 * mm, 50 * mm, 66 * mm], extra=hl))


def beobachtung(d, story):
    sz = d["szenario"]
    inj = {i["id"]: i for i in sz["injects"]}
    story += [NextPageTemplate("quer"), PageBreak(), P("8 · Beobachtungsbogen SL 2", "h"),
              P("Je Fall eintragen: Uhr der Entscheidung, Sekunden ab Eingang, Entscheidung, ob das Bild vergrößert wurde, was gesagt wurde. "
                "Zitate sind für die Auswertung am wertvollsten („Wie lange habt ihr hingeschaut?“).", "s"),
              Spacer(1, 2 * mm)]
    rows = [["Fall", "Meldung", "Uhr · Sekunden ab Eingang", "Entscheidung (Wirkmittel)", "Bild angesehen / Lupe?",
             "Gesagt / beobachtet"]]
    for f in sorted(sz["schluesselfaelle"], key=lambda f: f["reihenfolge"]) + sz.get("nebenfaelle", []):
        m = next(m for m in sz["meldungen"] if m["id"] == f["meldung"])
        rows.append([P(f"<b>{f['id']}</b> {f['titel']}", "sc"), P(f"{ziel(d, m, False)} ({m['id']})<br/>{uhr(m['t_s'])}", "sc"), "", "", "", ""])
    for iid, titel, frage in (("I-04", "Brigade: PL-PzKp (PT-91)", "angeklickt / gelesen um, angesprochen?"),
                              ("I-07", "1/4 unter Mörserfeuer", "Reaktion:")):
        if iid in inj:
            rows.append([P(f"<b>{iid}</b> {titel}", "sc"), uhr(inj[iid]["t_s"]), "–", "–", P(frage, "sc"), ""])
    if sz.get("eigene_truppe"):
        rows.append([P(f"<b>K-</b> Druckmeldungen der Panzer der {etn(sz)}", "sc"), "nach Lage", "–", "–", P("Reaktion, Tempo, Begründung:", "sc"), ""])
    i13 = next((i for i in sz["injects"] if (i.get("bedingung") or {}).get("typ") == "durchbruch"), None)
    if i13:
        rows.append([P(f"<b>{i13['id']}</b> Feind eingebrochen (nur wenn Durchbruch)", "sc"), "nach Lage", "–", "–", P("Reaktion:", "sc"), ""])
    t = tab(rows, [42 * mm, 22 * mm, 46 * mm, 44 * mm, 36 * mm, 83 * mm], size=7.6)
    t._argH = [None] + [13 * mm] * (len(rows) - 1)
    story.append(t)


def auswertung(d, r, story):
    sz, kz = d["szenario"], r["kennzahlen"]
    story += [NextPageTemplate("hoch"), PageBreak(), P("9 · Auswertung (12 min)", "h"), P(sz["auswertung"]["einstieg"]),
              P(f"<b>Kernaussage:</b> {sz['auswertung']['kernaussage']}"),
              P(f"Zum Vorlesen: ARGUS lag bei {kz['argus_richtig']} von {kz['meldungen']} Meldungen richtig. Mittlere Konfidenz bei den "
                f"{kz['argus_falsch']} falschen Empfehlungen: {L.zahl(kz['konfidenz_falsch_mittel'])} %, bei den richtigen: "
                f"{L.zahl(kz['konfidenz_richtig_bekaempfen_mittel'])} %."),
              P("Seit 2.6 zuerst das Tempo: Wie viele Sekunden lagen im Schnitt zwischen Eingang und Entscheidung? Welche Karte wurde am "
                "schnellsten entschieden – und war es eine der Fallen?"), Spacer(1, 2 * mm)]
    for f in sorted(sz["schluesselfaelle"], key=lambda f: f["reihenfolge"]):
        m = next(m for m in sz["meldungen"] if m["id"] == f["meldung"])
        story.append(P(f"{f['id']} · {f['titel']} ({ziel(d, m, False)})  <font size=8>(Info: {f['info_kurz']})</font>", "h2"))
        story.append(P(f"<b>Kern:</b> {f['kern']}", "s"))
        story.append(P(f"<b>Gut:</b> {f['gut']}", "s"))
        for q in f["leitfragen"]:
            story.append(P("• " + q, "p"))
        story.append(P(f"<i>Bezüge: {'; '.join(f['bezuege'])}</i>", "kl"))
        story.append(Spacer(1, 2 * mm))
    pa = (sz.get("verluste") or {}).get("auswertung")
    if pa:
        story.append(P(f"{pa['titel']} (1 min, nach den vier Fällen)", "h2"))
        story.append(P(f"Zustand der vier Panzer der {etn(sz)} über die Spielzeit (einsatzbereit, eingeschränkt, ausgefallen), dazu die "
                       "Entscheidungen bei S4, S5, N4 und S3 und die Fehlbekämpfungen.", "s"))
        story.append(P("• " + pa["leitfragen"]["weniger"], "p"))
        story.append(P("• " + pa["leitfragen"]["mehr"], "p"))
        story.append(P(f"<b>Offenlegung:</b> {pa['offenlegung']}", "p"))
        story.append(P(f"<i>Bezüge: {'; '.join(pa['bezuege'])}</i>", "kl"))
        story.append(Spacer(1, 2 * mm))
    story.append(P("Nebenfälle", "h2"))
    for f in sz.get("nebenfaelle", []):
        story.append(P(f"<b>{f['id']} {f['titel']}:</b> {f['kurz']}", "s"))
    story.append(Spacer(1, 2 * mm))
    story.append(P(f"<b>Schlussfrage:</b> {sz['auswertung']['schlussfrage']}", "pl"))


def anzeige(d):
    """Daten mit Texten wie in der Anzeige (Rollen, Spieluhr, Zielnummern); gerechnet wird weiter mit d."""
    sz0 = d["szenario"]
    a = dict(d)
    a["szenario"] = L.anzeige_szenario(sz0)
    a["regeln"] = L.anzeige_daten(d["regeln"], sz0)
    a["wirkmittel"] = L.anzeige_daten(d["wirkmittel"], sz0)
    a["nummern"] = L.basis_nummern(sz0)
    return a


def baue(pfad, kartenordner):
    d = L.lade_alles()
    r = pruefe(d)
    if r["fehler"]:
        raise SystemExit(f"Szenario hat Fehler: {r['fehler']}")
    a = anzeige(d)
    doc = Mappe(pfad, f"Planspiel ARGUS · Szenario {d['szenario'].get('anzeige', d['szenario']['id'])}")
    story = []
    deckblatt(a, r, story)
    zeitleiste(a, r, story)
    verluste_teil(a, story)
    karten(a, kartenordner, story)
    lagekarten(a, story)
    meldekarten(a, story)
    injectkarten(a, story)
    loesung(a, r, story)
    beobachtung(a, story)
    auswertung(a, r, story)
    doc.build(story)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "Spielleitungsmappe_ARGUS.pdf"
    ordner = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(out))
    baue(out, ordner)
    print("ok", out)
