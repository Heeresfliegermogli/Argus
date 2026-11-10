#!/usr/bin/env python3
"""Simulierter Durchlauf mit Modellteams, um das Drehbuch zu prüfen (kein Gefechtsmodell).

Seit 2.6 (Änderungen H, 09.11.2026): eine Rolle je Team, eine Entscheidung je Meldung (BEKÄMPFEN mit Wirkmittel = Freigabe,
ZURÜCKSTELLEN oder ABLEHNEN). Das Team arbeitet die Meldungen der Reihe nach ab (die älteste öffnet sich von selbst); jede
Entscheidung dauert die Modellzeit des Teams.

  naiv  – folgt ARGUS (bei gestörtem Datenlink der gestörten Ausgabe): BEKÄMPFEN außer bei UNKLAR (ABLEHNEN), mit dem ersten
          Wirkmittel, für das das System keine Warnung zeigt (sonst LM, auch gegen die Warnung). Modellzeit T_NAIV je Entscheidung
          („Lavender“: 20 s je Ziel).
  ideal – handelt nach der Lösung im Szenario (loesung.entscheid); BEKÄMPFEN nur mit einem Wirkmittel der Lösung, ohne Warnung und
          wenn beim vorausberechneten Einschlag nichts Geschütztes im Wirkradius ist (sonst ZURÜCKSTELLEN). Modellzeit T_IDEAL.

Was bei Spielende nicht entschieden ist, bleibt offen.

Seit 2.0: Trefferregel nach der Lage beim Einschlag (argus_lib.wirkung), Hintergrundgefecht (eigene Kanone), Ereignis E-01,
Zugmeldungen (Meldung entfällt erst, wenn jedes Fahrzeug zerstört ist) und auf Wunsch Verstärkungen.
Seit 2.1: Durchbruch nicht aufgehaltener Gruppen (Welt zur Zeit T, Lagemeldung I-13, Kennzahl durchgebrochen).
Seit 2.2: Loitering Munition trifft nur das bekämpfte Fahrzeug (wirkung(..., ziel=…), Wirkmittel mit nur_zielfahrzeug).
Seit 2.3: Verluste der eigenen Truppe (verluste.py) aus Zerstörungen, Attrappen-Treffer und Durchbrüchen; Druckmeldungen K-…
als Lagemeldungen, I-07/I-06/I-13 mit dem Stand des Teams; seit 2.5 je Panzer mit Einschießen, Kalibrierung F2.9 (kalibrierung()).
Prüft: Reihenfolge und Zeitbedarf, Wirkmittelbestand, Treffer auf geschützte Objekte, bedingte Injects, ob jedes Team
alle Schlüssel- und Nebenfälle erreicht.

Aufruf: python3 simuliere_durchlauf.py [--verstaerkung]   (mit Verstärkungen und Robustheit gegen langsamere Teams)

Gleich im Projekt PolBil (claude/tools/simuliere_durchlauf.py) und im Repository (tools/referenz/), Stand Szenario 2.6.
Im Repository dient sie als Referenz für die Engine: tools/referenz/erzeuge_durchlauf.py schreibt die Ergebnisse nach
tests/referenz_durchlauf.json, tests/durchlauf.test.ts spielt dieselben Modellteams mit der echten Engine und vergleicht.
"""
import sys

import argus_lib as L
import verluste as V
from pruefe_szenario import pruefe

T_NAIV, T_IDEAL = 20, 35      # Sekunden je Entscheidung (eine Rolle, seit 2.6)
AUSWAHL_ARGUS = ["MRS", "LM", "PZA"]   # „ARGUS allein“ (seit 2.7, G2.1): Mörser ohne Warnung, sonst LM, sonst Kanone
REIHENFOLGE = ["PZA", "ART", "MRS", "PRZ", "LM"]   # nicht vorhandene Wirkmittel werden übersprungen
VERSTAERKUNG_STANDARD = {"V-1": 240, "V-2": 480, "V-3": 720, "V-4": 960}          # alle vier Minuten bis 10:16
VERSTAERKUNG_ZU_SPAET = {"V-1": 240, "V-2": 480, "V-3": 720, "V-4": 960, "V-5": 1200}   # zusätzlich V-5 um 10:20
ROBUSTHEIT = [(20, 35), (25, 35), (20, 40), (25, 40), (30, 40), (30, 45), (35, 50)]       # Sekunden je Entscheidung naiv, ideal


def mit_verstaerkung(d, einspielen):
    """Kopie der Daten, in der die Verstärkungen zu den Zeiten {gruppe: t0} eingespielt sind (Ziele und Meldungen absolut)."""
    sz = dict(d["szenario"])
    ziele, meldungen = list(sz["ziele"]), list(sz["meldungen"])
    for g in (sz.get("verstaerkungen") or {}).get("gruppen", []):
        if g["id"] not in einspielen:
            continue
        t0 = einspielen[g["id"]]
        ziele += [L.verstaerkung_ziel(z, t0) for z in g["ziele"]]
        for m in g["meldungen"]:
            mm = dict(m)
            mm["t_s"] = t0 + m["dt_s"]
            mm["verstaerkung"] = g["id"]
            meldungen.append(mm)
    sz["ziele"] = ziele
    sz["meldungen"] = sorted(meldungen, key=lambda m: m["t_s"])
    dd = dict(d)
    dd["szenario"] = sz
    return dd


def lauf(d, team, detail=None, einspielen=None):
    """Spielt das Drehbuch mit einem Modellteam durch (eine Rolle, seit 2.6).

    Gibt (log, treffer_schutz, injects, restbestand, letzte_bekaempfung) zurück. Wird eine Liste `detail` übergeben,
    landet dort je Meldung ein dict mit Entscheidung und Zeitpunkten (t_entscheid, entscheid, sek_eingang, sek_offen), dazu
    Einträge {"inject": id, "t": s} für alle festen und bedingten Injects, {"hintergrund": id, ...} und {"ereignis": id, ...}.
    """
    if einspielen:
        d = mit_verstaerkung(d, einspielen)
    sz, wm, regeln = d["szenario"], d["wirkmittel"], d["regeln"]
    dauer = sz["spieluhr"]["dauer_s"]
    bestand = {k: (v["bestand"] if v["bestand"] is not None else 10 ** 6) for k, v in wm.items()}
    frei = 0                     # das Team ist frei ab (eine Rolle: eine Meldung nach der anderen)
    dauer_je = T_NAIV if team == "naiv" else T_IDEAL if team == "ideal" else 0
    log, treffer_schutz, injects = [], [], []
    det = detail if detail is not None else []
    for i in sz["injects"]:
        if "t_s" in i:
            det.append({"inject": i["id"], "t": i["t_s"]})

    # Zerstörung: eigene Wirkungen (team), Hintergrundgefecht (hg), E-01 – jeweils frühester Zeitpunkt zählt
    team_z = {}
    hg = {h["ziel"]: h["t_s"] for h in (sz.get("hintergrund") or {}).get("ereignisse", [])
          if h["art"] == "panzerabwehr" and h.get("folge") == "zerstoert"}
    e01 = sz.get("ereignisse", [])
    aufloesungen = sz.get("aufloesungen", [])
    freigabe_t = {}

    zmap_e = {x["id"]: x for x in sz["ziele"]}

    def e01_abbruch(e):
        """Früheste Freigabe auf die Bedingungsziele; liegt sie bis zum Zeitpunkt der Bedingung, entfällt das Ereignis ganz."""
        b = e["bedingung"]
        ab = min([freigabe_t.get(x, 1e9) for x in b["ziele"]])
        return -1 if ab <= b["t_s"] else ab

    def e01_wirkungen(z):
        """Wirkungen der Skriptereignisse (seit 2.7, I3.1: je Schuss das erste stehende Fahrzeug an der Brücke Ost), wie die Engine."""
        out = []
        for e in e01:
            if e["bedingung"]["typ"] != "keine_freigabe_bis":
                continue
            ab = e01_abbruch(e)
            if ab < 0:
                continue
            # ein Schuss genau zur Zeit einer Freigabe entfällt (Freigabe zählt bis einschließlich w.t_s, wie ablauf.ts)
            out.append((e, L.ereignis_wirkungen(zmap_e, e, z, ab + 1e-9 if ab < 1e9 else 1e9)))
        return out

    def zerstoert():
        z = dict(hg)
        for k, t in team_z.items():
            z[k] = min(z.get(k, 1e9), t)
        for e, liste in e01_wirkungen(z):
            for nr, t, von, zid, wirkt, grund in liste:
                if wirkt:
                    z[zid] = min(z.get(zid, 1e9), t)
        return z

    # Durchbruch (seit 2.1): Eine Gruppe, die bis t_s nicht aufgehalten ist, fährt ab t_s ihre Durchbruch-Route. Die Welt zur
    # Zeit T enthält die Durchbrüche, die bis T entschieden sind (wie die Engine: Ereignis `durchbruch` erst nach t_s).
    dbg = L.durchbruch_gruppen(sz, einspielen)
    zmap0 = {x["id"]: x for x in sz["ziele"]}
    ag = {h["ziel"]: h["t_s"] for h in (sz.get("hintergrund") or {}).get("ereignisse", [])
          if h["art"] == "panzerabwehr" and h.get("folge") == "ausser_gefecht"}
    welten = {}

    def aktive(T):
        z = zerstoert()
        return tuple(g["id"] for g in dbg if g["t_s"] < T and L.durchbruch_stand(g, zmap0, z, ag)[0])

    def welt(T):
        akt = aktive(T)
        if akt not in welten:
            dd = dict(d)
            dd["szenario"] = L.mit_durchbruch(sz, [g for g in dbg if g["id"] in akt]) if akt else sz
            welten[akt] = dd
        return welten[akt]

    def alle_weg(ziele, t):
        z = zerstoert()
        zmap = {x["id"]: x for x in welt(t)["szenario"]["ziele"]}
        return all(z.get(x, 1e9) <= t or not L.vorhanden(zmap[x], t) for x in ziele)

    def rest(w):
        """Bestand für die Zug-Regel (None = unbegrenzt)."""
        return None if wm[w]["bestand"] is None else bestand[w]

    def waehle(m, t_freigabe, t_jetzt, bild=False):
        """Wirkmittel ohne Warnung (R2, R3, Einsatzbereich) für eine Freigabe zur Zeit t_freigabe. Team „ideal“ (seit 2.4): nur die
        Wirkmittel der Lösung (loesung.wirkmittel); die Führung gibt außerdem nur frei (bild=True), wenn beim vorausberechneten Einschlag
        nichts Geschütztes im Wirkradius ist – sie schaut auf die Lage, nicht nur auf die Warnungen des Systems."""
        z = zerstoert()
        dw = welt(t_jetzt)
        erlaubt = (m.get("loesung") or {}).get("wirkmittel") if team == "ideal" else None
        out = []
        for w in REIHENFOLGE:
            if w not in wm or bestand[w] <= 0 or (erlaubt and w not in erlaubt):
                continue
            v = L.wirkung(dw, m["ziele"], w, t_freigabe, z, rest(w))
            if not v["zulaessig"]:
                continue
            if bild and team == "ideal" and any(g[2] in L.SCHUTZ or g[2] == "attrappe" for g in v["getroffen"]):
                continue
            out.append(w)
        return out

    def waehle_argus(m, t):
        """„ARGUS allein“: Mörser, wenn am Einschlagort ohne Warnung zulässig, sonst LM (solange Bestand), sonst Kanone."""
        z = zerstoert()
        dw = welt(t)
        for w in AUSWAHL_ARGUS:
            if w not in wm or bestand[w] <= 0:
                continue
            if w == AUSWAHL_ARGUS[0] and not L.wirkung(dw, m["ziele"], w, t, z, rest(w))["zulaessig"]:
                continue
            return w
        return None

    def wirkung_beim_einschlag(m, wahl, t):
        """Einschläge nach der Welt bei der Freigabe (vorausberechnet), Treffer je Einschlag nach der Welt beim Einschlag;
        seit 2.4 (E3) je Fahrzeug des Zuges nacheinander (LM, PzAbw) oder als Fläche (Mörser)."""
        z = dict(zerstoert())
        teile = []
        for t_e, pos, zid in L.einschlaege(welt(t), m["ziele"], wahl, t, z, rest(wahl)):
            ok, verst, getr = L.treffer_einschlag(welt(t_e), t_e, pos, zid, wahl, z)
            teile.append({"t": t_e, "pos": pos, "ziel": zid, "zulaessig": ok, "verstoesse": verst, "getroffen": getr})
            for g in getr:
                if g[1] in ("Fahrzeug", "Attrappe"):
                    z[g[0]] = min(z.get(g[0], 1e9), t_e)
        return L.zusammenfassen(teile)

    def argus(m):
        """ARGUS-Ausgabe zur Meldezeit (seit 2.4, E4: bei aktivem EloKa-Fahrzeug gestört)."""
        g = L.eloka_aktiv(welt(m["t_s"])["szenario"], zerstoert(), m["t_s"])
        return L.argus_bei(m, sz, regeln, g), g

    for m in sz["meldungen"]:
        a, gestoert = argus(m)
        ev = {"m": m["id"], "t_meld": m["t_s"], "gestoert": gestoert}
        det.append(ev)
        if alle_weg(m["ziele"], m["t_s"]):
            ev["ende"] = "entfällt"
            log.append((m["id"], "entfällt (Ziel schon zerstört oder weg)"))
            continue
        loes = m.get("loesung") or {"entscheid": "BEKÄMPFEN"}
        # seit 2.7 (I3.2): Auflösung nach Zeit – ohne Freigabe bis t_aufl ist die Meldung danach weg (als verbündet erkannt)
        aufl = next((x for x in aufloesungen if x["meldung"] == m["id"]), None)
        t_aufl = m["t_s"] + aufl["nach_s"] if aufl else None
        if team == "argus":
            # „ARGUS allein“ (seit 2.7, G2.1): BEKÄMPFEN zur Meldezeit ohne Prüfung; Mörser, wenn ohne Warnung zulässig, sonst LM, sonst
            # Kanone. PRÜFEN, UNKLAR und NICHT BEKÄMPFEN bleiben liegen.
            t = m["t_s"]
            if a["empfehlung"] != "BEKÄMPFEN":
                ev["ende"] = "Spielende"
                log.append((m["id"], f"bleibt liegen ({a['empfehlung']})"))
                continue
            ev.update(t_entscheid=t, t_offen=t, sek_eingang=0.0, sek_offen=0.0)
            wahl = waehle_argus(m, t)
        else:
            wahl = None
        # Das Team öffnet die Meldung, sobald es frei ist (die älteste zuerst). Eine Meldung, deren Fahrzeuge alle zerstört oder
        # abgezogen sind, verschwindet aus dem Eingang, sobald sie dran wäre – oder während das Team sie ansieht.
        t_offen = max(m["t_s"], frei)
        if team == "argus":
            pass
        elif t_aufl is not None and t_offen > t_aufl:
            ev["ende"] = "aufgelöst"
            log.append((m["id"], f"aufgelöst {L.mmss(t_aufl)} ({aufl['als']}), bevor das Team sie öffnete"))
            continue
        if team != "argus" and alle_weg(m["ziele"], t_offen):
            ev["ende"] = "entfällt"
            log.append((m["id"], f"entfällt vor der Entscheidung {L.mmss(t_offen)} (Ziel inzwischen zerstört oder weg)"))
            continue
        if team != "argus":
            t = t_offen + dauer_je
            if t >= dauer:
                ev["ende"] = "Spielende"
                log.append((m["id"], "bei Spielende noch offen"))
                continue
            frei = t
            if alle_weg(m["ziele"], t):       # wie die Engine: entfällt, sobald das letzte Fahrzeug weg ist (auch während der Bearbeitung)
                ev["ende"] = "entfällt"
                log.append((m["id"], f"entfällt beim Team {L.mmss(t)} (Ziel inzwischen zerstört oder weg)"))
                continue
            if t_aufl is not None and t > t_aufl and not any(freigabe_t.get(x, 1e9) <= t_aufl for x in m["ziele"]):
                ev["ende"] = "aufgelöst"
                log.append((m["id"], f"aufgelöst {L.mmss(t_aufl)} ({aufl['als']}), während das Team sie ansah"))
                continue
            ev.update(t_entscheid=t, t_offen=t_offen, sek_eingang=round(t - m["t_s"], 1), sek_offen=round(t - t_offen, 1))
        if team == "argus":
            pass
        elif team == "naiv":
            if a["empfehlung"] == "UNKLAR":
                ev.update(entscheid="ABLEHNEN", ende="abgelehnt")
                log.append((m["id"], f"ABLEHNEN {L.mmss(t)}"))
                continue
            zul = waehle(m, t, t)
            wahl = zul[0] if zul else next((w for w in ("LM", "MRS") if w in wm and bestand[w] > 0), None)
        else:
            if loes["entscheid"] == "ABLEHNEN":
                ev.update(entscheid="ABLEHNEN", ende="abgelehnt")
                log.append((m["id"], f"ABLEHNEN {L.mmss(t)}"))
                continue
            if loes["entscheid"] == "ZURÜCKSTELLEN":
                ev.update(entscheid="ZURÜCKSTELLEN", ende="zurückgestellt")
                log.append((m["id"], f"ZURÜCKSTELLEN {L.mmss(t)}"))
                continue
            zul = waehle(m, t, t, bild=True)
            wahl = (zul or [None])[0]
            if wahl is None:
                ev.update(entscheid="ZURÜCKSTELLEN", ende="zurückgestellt")
                log.append((m["id"], f"ZURÜCKSTELLEN {L.mmss(t)} (kein Wirkmittel ohne Warnung und ohne Geschütztes beim Einschlag)"))
                continue
        if wahl is None:
            ev.update(entscheid="ZURÜCKSTELLEN", ende="kein Wirkmittel")
            log.append((m["id"], f"kein Wirkmittel mehr {L.mmss(t)}"))
            continue
        w = wirkung_beim_einschlag(m, wahl, t)
        bestand[wahl] -= len(w["einschlaege"])
        for zid in m["ziele"]:
            freigabe_t[zid] = min(freigabe_t.get(zid, 1e9), t)
        schutz = []
        for x in w["einschlaege"]:          # seit 2.4 (E3): jedes Fahrzeug zur Zeit seines Einschlags
            for g in x["getroffen"]:
                if g[1] in ("Fahrzeug", "Attrappe"):
                    team_z[g[0]] = min(team_z.get(g[0], 1e9), x["t"])
        for g in w["getroffen"]:
            if g[2] in L.SCHUTZ or g[2] == "attrappe":
                treffer_schutz.append(f"{g[0]} {L.GT_TEXT.get(g[2], g[2])}" if g[1] in ("Fahrzeug", "Attrappe") else f"{g[0]} {g[1]}")
                schutz.append(g)
        ev.update(entscheid="BEKÄMPFEN", wm=wahl, pos=w["pos"], ziel=w["ziel"], t_wirkung=w["t"], getroffen=w["getroffen"], schutz=schutz,
                  verstoesse=w["verstoesse"], ende="Wirkung", einschlaege=w["einschlaege"])
        n_zug = len(w["einschlaege"])
        log.append((m["id"], f"BEKÄMPFEN {L.mmss(t)} mit {wahl}{f' ×{n_zug}' if n_zug > 1 else ''}, Einschlag {L.mmss(w['t'])}"
                             f"{' – RoE: ' + '; '.join(w['verstoesse']) if w['verstoesse'] else ''}"))
        for i in sz["injects"]:
            b = i.get("bedingung")
            if not b or not set(b.get("ziele", [])) & set(m["ziele"]):
                continue
            if b["typ"] == "freigabe":
                injects.append(f"{i['id']} um {L.mmss(t + b['verzoegerung_s'])}")
                det.append({"inject": i["id"], "t": t + b["verzoegerung_s"]})
            elif b["typ"] == "freigabe_mit_zivil":
                # Zivilpersonen beim Einschlag: frühestens verzoegerung_s nach der Freigabe, nicht vor dem Einschlag, der sie traf
                tz = [x["t"] for x in w["einschlaege"] if any(g[2] == "zivil" for g in x["getroffen"])]
                if tz and i["id"] not in {e.get("inject") for e in det}:
                    ti = max(t + b["verzoegerung_s"], min(tz))
                    injects.append(f"{i['id']} um {L.mmss(ti)}")
                    det.append({"inject": i["id"], "t": ti})
    for i in sz["injects"]:
        b = i.get("bedingung")
        if b and b["typ"] == "treffer":
            # seit 2.4 (S8): verzoegerung_s nach dem ersten eigenen Einschlag, der eines der Ziele (oder Personen bei ihm) traf
            tt = [x["t"] for e in det if "m" in e and e.get("ende") == "Wirkung" for x in e["einschlaege"]
                  if any(g[0] in b["ziele"] for g in x["getroffen"])]
            if tt and min(tt) + b["verzoegerung_s"] <= dauer:
                injects.append(f"{i['id']} um {L.mmss(min(tt) + b['verzoegerung_s'])}")
                det.append({"inject": i["id"], "t": min(tt) + b["verzoegerung_s"]})
        if b and b["typ"] == "keine_freigabe_bis" and not any(freigabe_t.get(z, 1e9) <= b["t_s"] for z in b["ziele"]):
            injects.append(f"{i['id']} um {L.mmss(b['t_s'])}")
            det.append({"inject": i["id"], "t": b["t_s"]})
    # Hintergrund und E-01 für Protokoll und Video
    z_end = zerstoert()
    for h in (sz.get("hintergrund") or {}).get("ereignisse", []):
        if h["art"] == "panzerabwehr":
            wirkt = team_z.get(h["ziel"], 1e9) > h["t_s"]
            det.append({"hintergrund": h["id"], "t": h["t_s"], "ziel": h["ziel"], "folge": h.get("folge"), "wirkt": wirkt})
        else:
            det.append({"hintergrund": h["id"], "t": h["t_s"], "art": h["art"]})
    for e in e01:
        b = e["bedingung"]
        if b["typ"] == "keine_freigabe_bis" and any(freigabe_t.get(z, 1e9) <= b["t_s"] for z in b["ziele"]):
            det.append({"ereignis": e["id"], "entfaellt": True})
            log.append((e["id"], "entfällt (Gegenangriff abgebrochen)"))
            continue
    z0 = dict(hg)
    for k, t in team_z.items():
        z0[k] = min(z0.get(k, 1e9), t)
    for e, liste in e01_wirkungen(z0):
        for nr, t, von, zid, wirkt, grund in liste:
            if wirkt:
                det.append({"ereignis": e["id"], "nr": nr, "t": t, "von": von, "ziel": zid})
                log.append((e["id"], f"{von} trifft {zid} um {L.mmss(t)}"))
    # Durchbruch: Ereignisse je Gruppe (nach t_s), Lagemeldung beim ersten Fahrzeug über dem Bach, Kennzahl
    z_end = zerstoert()
    erste_ueber = None
    durch_ids = []
    for g in dbg:
        if g["t_s"] >= dauer:
            continue
        durch, grund = L.durchbruch_stand(g, zmap0, z_end, ag)
        det.append({"durchbruch": g["id"], "t": g["t_s"], "durch": durch, "grund": grund})
        if not durch:
            log.append((g["id"], f"aufgehalten ({grund})"))
            continue
        for zid in g["ziele"]:
            tc = g["ueber_s"].get(zid)
            if tc is not None and tc <= dauer and z_end.get(zid, 1e9) > tc:
                durch_ids.append(zid)
                erste_ueber = tc if erste_ueber is None else min(erste_ueber, tc)
        log.append((g["id"], f"bricht durch ab {L.mmss(g['t_s'])}"))
    det.append({"durchgebrochen": sorted(durch_ids)})
    for i in sz["injects"]:
        b = i.get("bedingung")
        if b and b["typ"] == "durchbruch" and erste_ueber is not None and erste_ueber + b["verzoegerung_s"] <= dauer:
            injects.append(f"{i['id']} um {L.mmss(erste_ueber + b['verzoegerung_s'])}")
            det.append({"inject": i["id"], "t": erste_ueber + b["verzoegerung_s"]})
    # Verluste der eigenen Truppe (seit 2.5 je Panzer, F2): Zeitlinie aus den Zerstörungen, dem ersten Treffer auf die Attrappe und den
    # Durchbrüchen; Druckmeldungen K-… kommen als Lagemeldungen dazu, I-07/I-06/I-13 nennen den Stand dieses Teams.
    if (d["regeln"].get("verluste") and sz.get("eigene_truppe")):
        dw = welt(dauer)
        att = [x["t"] for e in det if "m" in e and e.get("ende") == "Wirkung" for x in e.get("einschlaege", [])
               if any(g[2] == "attrappe" and g[1] == "Attrappe" for g in x["getroffen"])]
        durch_g = [g for g in dbg if g["t_s"] < dauer and L.durchbruch_stand(g, zmap0, z_end, ag)[0]]
        ev = V.zeitlinie(dw, z_end, V.r2(min(att)) if att else None, durch_g)
        for k in V.meldungen(dw, ev):
            injects.append(f"{k['id']} um {L.mmss(k['t'])}")
            det.append({"inject": k["id"], "t": k["t"], "text": k["text"], "zug": k["zug"], "stufe": k["stufe"]})
        texte = {i["id"]: i for i in sz["injects"]}
        for e in det:
            if "inject" in e and e["inject"] in texte and "{" in texte[e["inject"]]["text"]:
                e["text"] = V.fuelle(texte[e["inject"]]["text"], dw, ev, e["t"], texte[e["inject"]].get("verluste_panzer"))
        st = V.stand(dw, ev)
        det.append({"verluste": st, "zug": V.zug(dw, st), "ereignisse": len(ev), "treffer": sum(1 for e in ev if e["ergebnis"] == "treffer"),
                    "verlauf": V.verlauf(dw, ev), "zeitlinie": ev})
    rest = {k: (v if v < 10 ** 5 else "∞") for k, v in bestand.items()}
    letzte = max([e["t_entscheid"] for e in det if e.get("entscheid") == "BEKÄMPFEN"] or [0])
    return log, treffer_schutz, injects, rest, letzte


def faelle_erreicht(d, team, einspielen=None):
    """Je Schlüssel-/Nebenfall: entscheidende Stelle erreicht? Liefert {fall: (erreicht, text)}."""
    det = []
    lauf(d, team, det, einspielen)
    ev = {e["m"]: e for e in det if "m" in e}
    sz = d["szenario"]
    out = {}
    for f in sz["schluesselfaelle"] + sz.get("nebenfaelle", []):
        ms = [m["id"] for m in sz["meldungen"] if m.get("fall") == f["id"]]
        teile, ok = [], True
        for mid in ms:
            e = ev.get(mid, {})
            ende = e.get("ende", "?")
            erreicht = ende not in ("Spielende", "?") and not ende.startswith("entfällt")
            # Erreicht heißt: Die Entscheidung an der Fall-Meldung ist gefallen. Folgemeldungen (z. B. S4 nach Abwarten) entfallen
            # zu Recht, wenn das Ziel vorher bekämpft wurde.
            if mid == f["meldung"]:
                ok = ok and erreicht
            if ende == "Wirkung":
                schutz = ", ".join(g[0] + " " + (L.GT_TEXT.get(g[2], g[2]) if g[1] in ("Fahrzeug", "Attrappe") else g[1])
                                   for g in e.get("schutz", []))
                teile.append(f"{mid} BEKÄMPFEN {L.mmss(e['t_entscheid'])} {e['wm']}"
                             f"{' → ' + schutz if schutz else ''}{' RoE ' + '/'.join(v.split(' ')[0] for v in e['verstoesse']) if e.get('verstoesse') else ''}")
            else:
                zeit = e.get("t_entscheid")
                teile.append(f"{mid} {ende}{' ' + L.mmss(zeit) if zeit else ''}")
        out[f["id"]] = (ok, "; ".join(teile))
    return out


def robustheit(d, zeiten=ROBUSTHEIT):
    """Welche Fälle erreichen die Modellteams bei langsamerer Bearbeitung nicht? Liefert [(T_NAIV, T_IDEAL, {team: [fälle]})]."""
    global T_NAIV, T_IDEAL
    alt = (T_NAIV, T_IDEAL)
    out = []
    try:
        for tn, ti in zeiten:
            T_NAIV, T_IDEAL = tn, ti
            out.append((tn, ti, {t: [k for k, (ok, _) in faelle_erreicht(d, t).items() if not ok] for t in ("naiv", "ideal")}))
    finally:
        T_NAIV, T_IDEAL = alt
    return out


def bericht(d, mit_v=False):
    out = []
    laeufe = [("naiv", None), ("ideal", None)]
    if mit_v:
        laeufe += [("naiv", VERSTAERKUNG_STANDARD), ("ideal", VERSTAERKUNG_STANDARD), ("naiv", VERSTAERKUNG_ZU_SPAET)]
    for team, ein in laeufe:
        log, ts, inj, rest, ende = lauf(d, team, None, ein)
        name = team + (" + Verstärkungen " + ", ".join(f"{k} {L.mmss(v)}" for k, v in ein.items()) if ein else "")
        fe = faelle_erreicht(d, team, ein)
        offen = [a for a, b in log if b == "bei Spielende noch offen"]
        out.append(f"Team {name}: letzte Bekämpfung T+{L.mmss(ende)}; geschützte/Fehlziele getroffen: {', '.join(ts) or 'keine'}; "
                   f"bedingte Injects: {', '.join(inj) or 'keine'}; Restbestand {rest}; bei Spielende offen: {', '.join(offen) or 'nichts'}")
        out.append("  Fälle: " + " | ".join(f"{k} {'✓' if ok else '✗ NICHT ERREICHT'} {txt}" for k, (ok, txt) in fe.items()))
        out.append("  " + " | ".join(f"{a}: {b}" for a, b in log))
    if mit_v:
        out.append("Robustheit (nicht erreichte Fälle bei Sekunden je Entscheidung naiv/ideal, ohne Verstärkung):")
        for tn, ti, r in robustheit(d):
            out.append(f"  {tn}/{ti}: " + "; ".join(f"{t} {', '.join(f) or 'alle erreicht'}" for t, f in r.items()))
    return out


def alle_faelle_erreicht(d):
    return {team: all(ok for ok, _ in faelle_erreicht(d, team).values()) for team in ("naiv", "ideal")}


LAEUFE_FUENF = [("naiv", None), ("ideal", None), ("naiv", VERSTAERKUNG_STANDARD), ("ideal", VERSTAERKUNG_STANDARD),
                ("naiv", VERSTAERKUNG_ZU_SPAET)]


def verluste_lauf(d, team, einspielen=None):
    """Verluste eines Modelllaufs (seit 2.5 je Panzer): dict(verluste je Panzer, zug, meldungen K-…, verlauf, zeitlinie) oder None."""
    det = []
    lauf(d, team, det, einspielen)
    v = next((e for e in det if "verluste" in e), None)
    if v is None:
        return None
    v = dict(v)
    v["meldungen"] = [e for e in det if "inject" in e and "stufe" in e]
    v["injects_text"] = {e["inject"]: e["text"] for e in det if "inject" in e and "text" in e and "stufe" not in e}
    return v


def schwere(v):
    """Ordnung für „spürbar schlechter“: mehr ausgefallen, dann mehr eingeschränkt, dann weniger Zustand in Summe."""
    return (v["zug"]["ausgefallen"], v["zug"]["eingeschraenkt"], -sum(s["zustand"] for s in v["verluste"].values()))


def kalibrierung(d):
    """Kalibrierung F2.9 (seit 2.5): Team „ideal“ (wartet bei S4, S5, N4, lehnt S3 ab) endet spürbar schlechter als „naiv“ – mehr
    Panzer ausgefallen bzw. eingeschränkt –, die Untergrenze hält in allen fünf Modellläufen (höchstens hoechstens_ausgefallen Panzer
    ausgefallen, die übrigen ≥ untergrenze_prozent), und kein Panzer fällt vor seinem dritten Treffer aus (ein T-72 braucht drei).
    Vorschlag: ideal mindestens 1 Panzer ausgefallen, naiv keiner.
    Liefert dict(ok, vorschlag, laeufe=[(name, zug, {panzer: (zustand, stufe, treffer, verwundete, roh)}, k_meldungen)], text)."""
    vr = d["regeln"].get("verluste")
    if not vr or not d["szenario"].get("eigene_truppe"):
        return {"ok": True, "vorschlag": True, "laeufe": [], "text": ["kein Verlustmodell"]}
    name_pz = {p["id"]: p["name"] for p in V.panzer(d["szenario"])}
    out, ref = [], {}
    grenze_ok, dritter_ok = True, True
    for team, ein in LAEUFE_FUENF:
        v = verluste_lauf(d, team, ein)
        name = team + (f" + V-1…V-{len(ein)}" if ein else "")
        pz = {k: (s["zustand"], s["stufe"], s["treffer"], s["verwundete"], s["roh"]) for k, s in v["verluste"].items()}
        grenze_ok = grenze_ok and v["zug"]["ausgefallen"] <= vr["hoechstens_ausgefallen"] and all(
            s["zustand"] >= vr["untergrenze_prozent"] for s in v["verluste"].values() if not s["ausgefallen"])
        # Treffer bis zum Ausfall je Panzer
        n = {}
        for e in v["zeitlinie"]:
            if e["ergebnis"] == "treffer":
                n[e["panzer"]] = n.get(e["panzer"], 0) + 1
                if e["ausgefallen"] and n[e["panzer"]] < 3:
                    dritter_ok = False
        out.append((name, v["zug"], pz, len(v["meldungen"])))
        if not ein:
            ref[team] = v
    schlechter = schwere(ref["ideal"]) > schwere(ref["naiv"])
    vorschlag = ref["ideal"]["zug"]["ausgefallen"] >= 1 and ref["naiv"]["zug"]["ausgefallen"] == 0
    zi, zn = ref["ideal"]["zug"], ref["naiv"]["zug"]
    text = [f"Kalibrierung F2.9: ideal {zi['ausgefallen']} ausgefallen, {zi['eingeschraenkt']} eingeschränkt / naiv {zn['ausgefallen']} ausgefallen, "
            f"{zn['eingeschraenkt']} eingeschränkt – ideal spürbar schlechter: {'ja' if schlechter else 'NEIN'}; Untergrenze (höchstens "
            f"{vr['hoechstens_ausgefallen']} ausgefallen, übrige ≥ {vr['untergrenze_prozent']} %) hält in allen fünf Läufen: {'ja' if grenze_ok else 'NEIN'}; "
            f"kein Ausfall vor dem dritten Treffer: {'ja' if dritter_ok else 'NEIN'}; im Vorschlag (ideal ≥ 1 ausgefallen, naiv keiner): "
            f"{'ja' if vorschlag else 'nein'}"]
    for name, zg, pz, nm in out:
        text.append(f"  {name:22} {zg['bereit']}/{zg['gesamt']} einsatzbereit, {zg['verwundete']:2} Verwundete, {nm:2} Druckmeldungen | " +
                    " | ".join(f"{name_pz[k]} {zu} % {st} ({tr} Treffer)" for k, (zu, st, tr, vw, r) in pz.items()))
    return {"ok": schlechter and grenze_ok and dritter_ok, "vorschlag": vorschlag, "laeufe": out, "text": text}


if __name__ == "__main__":
    d = L.lade_alles()
    r = pruefe(d)
    assert not r["fehler"], r["fehler"]
    print("\n".join(bericht(d, "--verstaerkung" in sys.argv)))
    ok = alle_faelle_erreicht(d)
    print("Alle Schlüssel- und Nebenfälle erreicht:", ", ".join(f"{k} {'ja' if v else 'NEIN'}" for k, v in ok.items()))
    kal = kalibrierung(d)
    print("\n".join(kal["text"]))
    sys.exit(0 if all(ok.values()) and kal["ok"] else 1)
