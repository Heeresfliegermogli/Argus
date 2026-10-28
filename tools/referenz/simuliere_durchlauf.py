#!/usr/bin/env python3
"""Simulierter Durchlauf mit Modellteams, um das Drehbuch zu prüfen (kein Gefechtsmodell).

  naiv  – folgt ARGUS: G1 nimmt alles an außer UNKLAR, G2 nimmt das erste Wirkmittel, für das das System keine Warnung
          zeigt (sonst LM, auch gegen die Warnung), G3 gibt immer frei, Fast-Track wird 30 s nach dem Angebot eingeschaltet.
  ideal – handelt nach der Lösung im Szenario (loesung-Felder); G3 gibt nur frei, wenn die Warnung zum Einschlag frei ist.

Bearbeitungszeiten je Stufe (Warteschlange je Person, ein Team à 3): G1 40 s, G2 50 s, G3 30 s. Was bei Spielende nicht
freigegeben ist, bleibt offen.

Seit 2.0: Trefferregel nach der Lage beim Einschlag (argus_lib.wirkung), Hintergrundgefecht (eigene PzAbw), Ereignis E-01,
Zugmeldungen (Meldung entfällt erst, wenn jedes Fahrzeug zerstört ist) und auf Wunsch Verstärkungen.
Seit 2.1: Durchbruch nicht aufgehaltener Gruppen (Welt zur Zeit T, Lagemeldung I-13, Kennzahl durchgebrochen).
Seit 2.2: Loitering Munition trifft nur das bekämpfte Fahrzeug (wirkung(..., ziel=…), Wirkmittel mit nur_zielfahrzeug).
Prüft: Reihenfolge und Zeitbedarf, Wirkmittelbestand, Treffer auf geschützte Objekte, bedingte Injects, ob jedes Team
alle Schlüssel- und Nebenfälle erreicht.

Aufruf: python3 simuliere_durchlauf.py [--verstaerkung]   (mit Verstärkungen und Robustheit gegen langsamere Teams)

Gleich im Projekt PolBil (claude/tools/simuliere_durchlauf.py) und im Repository (tools/referenz/), Stand Szenario 2.2.
Im Repository dient sie als
Referenz für die Engine: tools/referenz/erzeuge_referenz.py schreibt die Ergebnisse nach tests/referenz_durchlauf.json,
tests/durchlauf.test.ts spielt dieselben Modellteams mit der echten Engine und vergleicht.
"""
import sys

import argus_lib as L
from pruefe_szenario import pruefe

T_G1, T_G2, T_G3 = 40, 50, 30
REIHENFOLGE = ["PZA", "ART", "MRS", "PRZ", "LM"]   # nicht vorhandene Wirkmittel werden übersprungen
FT_NACH_ANGEBOT_S = 30
VERSTAERKUNG_STANDARD = {"V-1": 240, "V-2": 480, "V-3": 720, "V-4": 960}          # alle vier Minuten bis 10:16
VERSTAERKUNG_ZU_SPAET = {"V-1": 240, "V-2": 480, "V-3": 720, "V-4": 960, "V-5": 1200}   # zusätzlich V-5 um 10:20
ROBUSTHEIT = [(40, 50, 30), (60, 50, 30), (40, 60, 30), (60, 60, 40), (40, 70, 30)]       # Bearbeitungszeiten G1, G2, G3


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
    """Spielt das Drehbuch mit einem Modellteam durch.

    Gibt (log, treffer_schutz, injects, restbestand, letzte_entscheidung) zurück. Wird eine Liste `detail` übergeben,
    landet dort je Meldung ein dict mit allen Zeitpunkten (für das Video), dazu Einträge {"inject": id, "t": s} für alle
    festen und bedingten Injects, {"fast_track": s}, {"hintergrund": id, ...} und {"ereignis": id, ...}.
    """
    if einspielen:
        d = mit_verstaerkung(d, einspielen)
    sz, wm, regeln = d["szenario"], d["wirkmittel"], d["regeln"]
    dauer = sz["spieluhr"]["dauer_s"]
    bestand = {k: (v["bestand"] if v["bestand"] is not None else 10 ** 6) for k, v in wm.items()}
    frei = {"G1": 0, "G2": 0, "G3": 0}
    i05 = next((i["t_s"] for i in sz["injects"] if i.get("aktion") == "fast_track_angebot"), None)
    ft_ab = i05 + FT_NACH_ANGEBOT_S if team == "naiv" and i05 is not None else None
    log, treffer_schutz, injects = [], [], []
    det = detail if detail is not None else []
    if ft_ab is not None:
        det.append({"fast_track": ft_ab})
    for i in sz["injects"]:
        if "t_s" in i:
            det.append({"inject": i["id"], "t": i["t_s"]})

    # Zerstörung: eigene Wirkungen (team), Hintergrundgefecht (hg), E-01 – jeweils frühester Zeitpunkt zählt
    team_z = {}
    hg = {h["ziel"]: h["t_s"] for h in (sz.get("hintergrund") or {}).get("ereignisse", [])
          if h["art"] == "panzerabwehr" and h.get("folge") == "zerstoert"}
    e01 = sz.get("ereignisse", [])
    freigabe_t = {}

    def zerstoert():
        z = dict(hg)
        for k, t in team_z.items():
            z[k] = min(z.get(k, 1e9), t)
        for e in e01:
            b = e["bedingung"]
            if b["typ"] != "keine_freigabe_bis":
                continue
            abbruch = min([freigabe_t.get(x, 1e9) for x in b["ziele"]])
            for w in sorted(e["wirkungen"], key=lambda w: w["t_s"]):
                if w["t_s"] >= abbruch or z.get(w["von"], 1e9) <= w["t_s"] or z.get(w["ziel"], 1e9) <= w["t_s"]:
                    continue
                z[w["ziel"]] = w["t_s"]
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

    def waehle(m, t_freigabe, t_jetzt):
        z = zerstoert()
        dw = welt(t_jetzt)
        return [w for w in REIHENFOLGE if w in wm and bestand[w] > 0
                and L.wirkung(dw, m["ziele"], w, t_freigabe, z)["zulaessig"]]

    def wirkung_beim_einschlag(m, wahl, t):
        """Einschlag nach der Welt bei der Freigabe (vorausberechnet), Treffer nach der Welt beim Einschlag."""
        z = zerstoert()
        t_e, pos, zid = L.einschlag(welt(t), m["ziele"], wahl, t, z)
        de = welt(t_e)
        ok, verst, getr = L.pruefe_wirkmittel(de, pos, wahl, t_s=t_e, zerstoert=z, ziel=zid)
        z0 = next(x for x in L.alle_ziele(de["szenario"]) if x["id"] == zid)
        if L.vorhanden(z0, t_e) and z.get(zid, 1e9) > t_e and not any(g[0] == zid and g[1] in ("Fahrzeug", "Attrappe") for g in getr):
            kat = L.gt_bei(z0, t_e)["kategorie"]
            getr.append((zid, "Fahrzeug" if kat != "attrappe" else "Attrappe", kat))
        return {"t": t_e, "pos": pos, "ziel": zid, "zulaessig": ok, "verstoesse": verst, "getroffen": getr}

    for m in sz["meldungen"]:
        a = m["argus"]
        ev = {"m": m["id"], "t_meld": m["t_s"], "ft": False}
        det.append(ev)
        if alle_weg(m["ziele"], m["t_s"]):
            ev["ende"] = "entfällt"
            log.append((m["id"], "entfällt (Ziel schon zerstört oder weg)"))
            continue
        t = m["t_s"]
        ft = ft_ab is not None and t >= ft_ab and a["konfidenz"] >= regeln["fast_track"]["schwelle"] and a["empfehlung"] == "BEKÄMPFEN"
        ev["ft"] = ft
        loes = m.get("loesung") or {"G1": "ANNEHMEN", "G2": "BEKÄMPFEN", "G3": "FREIGABE"}
        # G1 (eine Meldung, deren Fahrzeuge alle zerstört oder abgezogen sind, verschwindet aus dem Eingang, sobald sie dran wäre)
        if not ft:
            if alle_weg(m["ziele"], max(t, frei["G1"])):
                ev["ende"] = "entfällt"
                log.append((m["id"], f"entfällt vor G1 {L.mmss(max(t, frei['G1']))} (Ziel inzwischen zerstört oder weg)"))
                continue
            t = max(t, frei["G1"]) + T_G1
            frei["G1"] = t
            ok = a["empfehlung"] != "UNKLAR" if team == "naiv" else loes["G1"].startswith("ANNEHMEN")
            ev.update(t_g1=t, g1="ANNEHMEN" if ok else "ABLEHNEN")
            if not ok:
                ev["ende"] = "G1 lehnt ab"
                log.append((m["id"], f"G1 lehnt ab {L.mmss(t)}"))
                continue
        # G2: Warnung rechnet den Einschlag für eine Freigabe nach T_G3 voraus
        if alle_weg(m["ziele"], max(t, frei["G2"])):
            ev.update(ende="entfällt (G2)")
            log.append((m["id"], f"entfällt vor G2 {L.mmss(max(t, frei['G2']))} (Ziel inzwischen zerstört oder weg)"))
            continue
        t = max(t, frei["G2"]) + T_G2
        frei["G2"] = t
        ev["t_g2"] = t
        zul = waehle(m, t + T_G3, t)
        if team == "naiv":
            wahl = zul[0] if zul else next((w for w in ("LM", "MRS") if w in wm and bestand[w] > 0), None)
        else:
            g2 = loes["G2"]
            if "BEOBACHTEN" in g2.split(":")[0]:
                ev.update(g2="BEOBACHTEN", ende="G2 beobachtet")
                log.append((m["id"], f"G2 BEOBACHTEN {L.mmss(t)}"))
                continue
            if g2.startswith("NICHT") or loes["G1"].startswith("ABLEHNEN"):
                ev.update(g2="NICHT BEKÄMPFEN", ende="G2 nicht bekämpfen")
                log.append((m["id"], f"G2 NICHT BEKÄMPFEN {L.mmss(t)}"))
                continue
            wahl = (zul or [None])[0]
        if wahl is None:
            ev.update(g2="kein Wirkmittel", ende="kein Wirkmittel")
            log.append((m["id"], f"G2: kein Wirkmittel ohne Warnung {L.mmss(t)}"))
            continue
        ev["g2"] = wahl
        # G3
        if alle_weg(m["ziele"], max(t, frei["G3"])):
            ev.update(ende="entfällt (G3)", g3="ENTFÄLLT")
            log.append((m["id"], f"entfällt vor G3 {L.mmss(max(t, frei['G3']))} (Ziel inzwischen zerstört oder weg)"))
            continue
        t = max(t, frei["G3"]) + T_G3
        if t > dauer:
            ev["ende"] = "Spielende"
            log.append((m["id"], "bei Spielende noch offen"))
            continue
        frei["G3"] = t
        if alle_weg(m["ziele"], t):
            ev.update(t_g3=t, g3="ENTFÄLLT", ende="entfällt (G3)")
            log.append((m["id"], f"entfällt bei G3 {L.mmss(t)} (Ziel inzwischen getroffen oder weg)"))
            continue
        ev["t_g3"] = t
        if team == "ideal":
            if not loes["G3"].startswith("FREIGABE"):
                ev.update(g3="ABLEHNEN", ende="G3 lehnt ab")
                log.append((m["id"], f"G3 lehnt ab {L.mmss(t)}"))
                continue
            jetzt = waehle(m, t, t)
            if wahl not in jetzt:
                if not jetzt:
                    ev.update(g3="ZURÜCK AN G2", ende="G3: Warnung zum Einschlag")
                    log.append((m["id"], f"G3 gibt nicht frei {L.mmss(t)} (Warnung zum Einschlag)"))
                    continue
                wahl = jetzt[0]
                ev["g2"] = wahl
        bestand[wahl] -= 1
        w = wirkung_beim_einschlag(m, wahl, t)
        for zid in m["ziele"]:
            freigabe_t[zid] = min(freigabe_t.get(zid, 1e9), t)
        schutz = []
        for g in w["getroffen"]:
            if g[1] in ("Fahrzeug", "Attrappe"):
                team_z[g[0]] = min(team_z.get(g[0], 1e9), w["t"])
            if g[2] in L.SCHUTZ or g[2] == "attrappe":
                treffer_schutz.append(f"{g[0]} {L.GT_TEXT.get(g[2], g[2])}" if g[1] in ("Fahrzeug", "Attrappe") else f"{g[0]} {g[1]}")
                schutz.append(g)
        ev.update(g3="FREIGABE", wm=wahl, pos=w["pos"], ziel=w["ziel"], t_wirkung=w["t"], getroffen=w["getroffen"], schutz=schutz,
                  verstoesse=w["verstoesse"], ende="Wirkung")
        log.append((m["id"], f"Freigabe {L.mmss(t)} mit {wahl}{' FT' if ft else ''}, Einschlag {L.mmss(w['t'])}"
                             f"{' – RoE: ' + '; '.join(w['verstoesse']) if w['verstoesse'] else ''}"))
        for i in sz["injects"]:
            b = i.get("bedingung")
            if not b or not set(b.get("ziele", [])) & set(m["ziele"]):
                continue
            if b["typ"] == "freigabe" or (b["typ"] == "freigabe_mit_zivil" and any(g[2] == "zivil" for g in w["getroffen"])):
                injects.append(f"{i['id']} um {L.mmss(t + b['verzoegerung_s'])}")
                det.append({"inject": i["id"], "t": t + b["verzoegerung_s"]})
    for i in sz["injects"]:
        b = i.get("bedingung")
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
        for w in e["wirkungen"]:
            if z_end.get(w["ziel"]) == w["t_s"]:
                det.append({"ereignis": e["id"], "t": w["t_s"], "von": w["von"], "ziel": w["ziel"]})
                log.append((e["id"], f"{w['von']} trifft {w['ziel']} um {L.mmss(w['t_s'])}"))
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
    rest = {k: (v if v < 10 ** 5 else "∞") for k, v in bestand.items()}
    letzte = max([e["t_g3"] for e in det if "t_g3" in e] or [0])
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
                teile.append(f"{mid} Freigabe {L.mmss(e['t_g3'])} {e['wm']}{' FT' if e.get('ft') else ''}"
                             f"{' → ' + schutz if schutz else ''}{' RoE ' + '/'.join(v.split(' ')[0] for v in e['verstoesse']) if e.get('verstoesse') else ''}")
            else:
                zeit = e.get("t_g3") or e.get("t_g2") or e.get("t_g1")
                teile.append(f"{mid} {ende}{' ' + L.mmss(zeit) if zeit else ''}")
        out[f["id"]] = (ok, "; ".join(teile))
    return out


def robustheit(d, zeiten=ROBUSTHEIT):
    """Welche Fälle erreichen die Modellteams bei langsamerer Bearbeitung nicht? Liefert [(G1, G2, G3, {team: [fälle]})]."""
    global T_G1, T_G2, T_G3
    alt = (T_G1, T_G2, T_G3)
    out = []
    try:
        for g1, g2, g3 in zeiten:
            T_G1, T_G2, T_G3 = g1, g2, g3
            out.append((g1, g2, g3, {t: [k for k, (ok, _) in faelle_erreicht(d, t).items() if not ok] for t in ("naiv", "ideal")}))
    finally:
        T_G1, T_G2, T_G3 = alt
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
        out.append(f"Team {name}: letzte Freigabe T+{L.mmss(ende)}; geschützte/Fehlziele getroffen: {', '.join(ts) or 'keine'}; "
                   f"bedingte Injects: {', '.join(inj) or 'keine'}; Restbestand {rest}; bei Spielende offen: {', '.join(offen) or 'nichts'}")
        out.append("  Fälle: " + " | ".join(f"{k} {'✓' if ok else '✗ NICHT ERREICHT'} {txt}" for k, (ok, txt) in fe.items()))
        out.append("  " + " | ".join(f"{a}: {b}" for a, b in log))
    if mit_v:
        out.append("Robustheit (nicht erreichte Fälle bei Bearbeitungszeit G1/G2/G3 in s, ohne Verstärkung):")
        for g1, g2, g3, r in robustheit(d):
            out.append(f"  {g1}/{g2}/{g3}: " + "; ".join(f"{t} {', '.join(f) or 'alle erreicht'}" for t, f in r.items()))
    return out


def alle_faelle_erreicht(d):
    return {team: all(ok for ok, _ in faelle_erreicht(d, team).values()) for team in ("naiv", "ideal")}


if __name__ == "__main__":
    d = L.lade_alles()
    r = pruefe(d)
    assert not r["fehler"], r["fehler"]
    print("\n".join(bericht(d, "--verstaerkung" in sys.argv)))
    ok = alle_faelle_erreicht(d)
    print("Alle Schlüssel- und Nebenfälle erreicht:", ", ".join(f"{k} {'ja' if v else 'NEIN'}" for k, v in ok.items()))
    sys.exit(0 if all(ok.values()) else 1)
