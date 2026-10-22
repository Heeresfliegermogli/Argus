#!/usr/bin/env python3
"""Prüft ein ARGUS-Szenario auf Konsistenz und rechnet die Lösungshilfe für die Spielleitung.

Aufruf:  python3 pruefe_szenario.py [szenario.json] [--json loesungshilfe.json] [--kurz]
Ausgabe: Prüfbericht auf der Konsole, optional Lösungshilfe als JSON (für den Drehbuch-Generator).
Exit-Code 1 bei Fehlern.

Seit 2.0 zusätzlich: Bewegung (Sensortext ↔ Route, realistische Geschwindigkeiten), Gruppen, Trefferregel nach der
Lage beim Einschlag (Lösungshilfe mit Freigabe-Fenster), Hintergrundgefecht, Verstärkungen (für jeden Einspielzeitpunkt).

Kopie aus dem Projekt PolBil (claude/tools/pruefe_szenario.py, Stand Schritt 2b); simuliere_durchlauf.py braucht sie.
"""
import json
import statistics
import sys

import argus_lib as L

FREIGABE_RICHTWERT_S = 120      # Meldung bis Freigabe bei zügiger Bearbeitung (G1 40 s, G2 50 s, G3 30 s)
FENSTER_S = (30, 300)           # Freigabe frühestens/spätestens so viele Sekunden nach der Meldung (Lösungshilfe)
KETTE = ("kpz_t72", "kpz_pt91", "spz_bmp2", "attrappe_kpz")


def strassen(karte):
    return [L.linie(karte, l["id"]) for l in karte["linien"] if l["art"] in ("strasse", "feldweg")]


def auf_strasse(p, karte_linien, toleranz=6.0):
    return min(L.dist_polylinie(p, pts) for pts in karte_linien) <= toleranz


def pruefe_bewegung(ziel, fz, linien, fehler, warn, wer=None):
    """Geschwindigkeiten je Routenabschnitt: unrealistisch langsam/schnell → Fehler, außerhalb der Spielwerte → Warnung."""
    r = (ziel.get("bewegung") or {}).get("route")
    if not r:
        return
    wer = wer or ziel["id"]
    for (t0, x0, y0), (t1, x1, y1) in zip(r, r[1:]):
        if t1 < t0:
            fehler.append(f"{wer}: Route zeitlich rückwärts bei t={t0}")
            continue
        s = L.dist((x0, y0), (x1, y1))
        if s < 0.5:
            continue
        if t1 == t0:
            fehler.append(f"{wer}: Sprung ohne Zeit bei t={t0}")
            continue
        kmh = s / (t1 - t0) * 3.6
        mitte = ((x0 + x1) / 2, (y0 + y1) / 2)
        strasse = auf_strasse(mitte, linien)
        if kmh > 60 or kmh < 3:
            fehler.append(f"{wer}: {kmh:.1f} km/h bei t={t0:.0f}–{t1:.0f} (unrealistisch)")
            continue
        typ = ziel["typ"]
        if typ == "traktor":
            lo, hi = 5, 20
        elif typ in KETTE:
            lo, hi = (8, 35) if strasse else (8, 20)
        elif typ in ("spaehpz_brdm2", "gfz_tigr"):
            lo, hi = (15, 35) if strasse else (10, 25)
        else:
            lo, hi = (10, 45) if strasse else (8, 25)
        if not lo <= kmh <= hi + 0.5:
            warn.append(f"{wer}: {kmh:.0f} km/h {'auf der Straße' if strasse else 'im Gelände'} bei t={t0:.0f} (Spielwert {lo}–{hi})")


def fenster_text(start, werte):
    """werte: [(t_freigabe, ok)] → 'immer', 'nie', 'bis 10:17:40', 'ab 10:20:15', sonst 'wechselnd'."""
    oks = [ok for _, ok in werte]
    if all(oks):
        return "immer"
    if not any(oks):
        return "nie"
    wechsel = [i for i in range(1, len(oks)) if oks[i] != oks[i - 1]]
    if len(wechsel) == 1:
        i = wechsel[0]
        return f"bis {L.uhrzeit(start, werte[i - 1][0])}" if oks[0] else f"ab {L.uhrzeit(start, werte[i][0])}"
    return "wechselnd"


def loesung_meldung(d, m, ziele, t0=None, zerstoert=None):
    """Lösungshilfe einer Meldung: Zonen an der gemeldeten Position, je Wirkmittel Zulässigkeit bei Meldung, beim Einschlag
    (Freigabe Meldung + Richtwert) und im Freigabe-Fenster, geschützte Objekte im Wirkradius beim Einschlag."""
    sz, karte, wm = d["szenario"], d["karte"], d["wirkmittel"]
    t_m = m["t_s"] if t0 is None else t0 + m["dt_s"]
    haupt = ziele[m["ziele"][0]]
    p = L.position(haupt, t_m)
    zonen = {z["id"]: round(L.abstand_zone(p, z)) for z in sz["zonen"]}
    res = []
    for wid in wm:
        ok_m, verst_m, getr_m = L.pruefe_wirkmittel(d, p, wid, t_s=t_m, zerstoert=zerstoert)
        w = L.wirkung(d, m["ziele"], wid, t_m + FREIGABE_RICHTWERT_S, zerstoert)
        werte, schutz = [], {}
        for dt in range(FENSTER_S[0], FENSTER_S[1] + 1, 5):
            ww = L.wirkung(d, m["ziele"], wid, t_m + dt, zerstoert)
            werte.append((t_m + dt, ww["zulaessig"]))
            for g in ww["getroffen"]:
                schluessel = (g[0], g[1], g[2])
                if g[2] in L.SCHUTZ and not (g[0] in m["ziele"] and g[1] in ("Fahrzeug", "Attrappe")):
                    schutz.setdefault(schluessel, []).append(t_m + dt)
        neben = []
        for (zid, was, kat), ts in schutz.items():
            neben.append({"ziel": zid, "was": was, "kategorie": kat, "freigabe_von": min(ts), "freigabe_bis": max(ts),
                          "text": f"{was if was not in ('Fahrzeug', 'Attrappe') else zid + ' ' + L.GT_TEXT[kat]} ({zid}) bei Freigabe "
                                  f"{L.uhrzeit(sz['spieluhr']['start'], min(ts))[:8]}–{L.uhrzeit(sz['spieluhr']['start'], max(ts))[:8]}"})
        res.append({"wm": wid, "zulaessig_meldung": ok_m, "verstoesse_meldung": verst_m,
                    "zulaessig": w["zulaessig"], "verstoesse": w["verstoesse"], "einschlag_t": round(w["t"]),
                    "einschlag_pos": [round(w["pos"][0]), round(w["pos"][1])],
                    "fenster": fenster_text(sz["spieluhr"]["start"], werte),
                    "getroffen": [{"ziel": g[0], "was": g[1], "kategorie": g[2]} for g in w["getroffen"]],
                    "nebenwirkung": neben})
    return p, zonen, res


def pruefe(d):
    """Prüft das Szenario und rechnet Lösungshilfe und Kennzahlen. Gibt ein dict zurück."""
    sz, karte, fz, wm, regeln = d["szenario"], d["karte"], d["fahrzeuge"], d["wirkmittel"], d["regeln"]
    fehler, warn = [], []
    start, dauer = sz["spieluhr"]["start"], sz["spieluhr"]["dauer_s"]
    linien = strassen(karte)
    W, H = karte["ausdehnung_m"]["breite"], karte["ausdehnung_m"]["hoehe"]

    # ---------------------------------------------------------------- IDs und Verweise
    ziele = {z["id"]: z for z in sz["ziele"]}
    if len(ziele) != len(sz["ziele"]):
        fehler.append("doppelte Ziel-IDs")
    mids = [m["id"] for m in sz["meldungen"]]
    if len(set(mids)) != len(mids):
        fehler.append("doppelte Meldungs-IDs")
    faelle = {f["id"] for f in sz["schluesselfaelle"]} | {f["id"] for f in sz.get("nebenfaelle", [])}
    for z in sz["ziele"]:
        if z["typ"] not in fz:
            fehler.append(f"{z['id']}: Typ {z['typ']} fehlt im Katalog")
    gemeldet, letzte_meldung = set(), {}
    for m in sz["meldungen"]:
        for zid in m["ziele"]:
            if zid not in ziele:
                fehler.append(f"{m['id']}: Ziel {zid} unbekannt")
            gemeldet.add(zid)
            letzte_meldung[zid] = m["t_s"]
        if m.get("fall") and m["fall"] not in faelle:
            fehler.append(f"{m['id']}: Fall {m['fall']} unbekannt")
        if m.get("folge_von") and m["folge_von"] not in mids:
            fehler.append(f"{m['id']}: folge_von {m['folge_von']} unbekannt")
    for f in sz["schluesselfaelle"] + sz.get("nebenfaelle", []):
        if f["meldung"] not in mids:
            fehler.append(f"{f['id']}: Meldung {f['meldung']} unbekannt")
    for zid in ziele:
        if zid not in gemeldet and not ziele[zid].get("ungemeldet"):
            warn.append(f"{zid} wird nie gemeldet")
        if zid in gemeldet and ziele[zid].get("ungemeldet"):
            fehler.append(f"{zid}: ungemeldet, steht aber in einer Meldung")
    for e in sz.get("ereignisse", []):
        for zid in e["bedingung"].get("ziele", []) + [w["ziel"] for w in e["wirkungen"]] + [w["von"] for w in e["wirkungen"]]:
            if zid not in ziele:
                fehler.append(f"{e['id']}: Ziel {zid} unbekannt")
        if any(w["t_s"] >= dauer for w in e["wirkungen"]):
            fehler.append(f"{e['id']}: Wirkung nach Spielende")
    # Gruppen: Kennung = erstes–letztes Mitglied, alle Mitglieder in derselben (ersten) Meldung
    gruppen = {}
    for z in sz["ziele"]:
        if z.get("gruppe"):
            gruppen.setdefault(z["gruppe"], []).append(z["id"])
    for g, mitglieder in gruppen.items():
        soll = f"{mitglieder[0]}–{mitglieder[-1].split('-')[-1]}"
        if g != soll:
            fehler.append(f"Gruppe {g}: Kennung passt nicht zu den Mitgliedern {mitglieder} (Soll {soll})")
        if not any(set(mitglieder) == set(m["ziele"]) for m in sz["meldungen"]):
            warn.append(f"Gruppe {g}: keine Meldung mit genau diesen Fahrzeugen")

    # ---------------------------------------------------------------- Zeiten
    ts = [m["t_s"] for m in sz["meldungen"]]
    if ts != sorted(ts):
        fehler.append("Meldungen nicht zeitlich sortiert")
    if max(ts) >= dauer:
        fehler.append("Meldung nach Spielende")
    abst = [b - a for a, b in zip(ts, ts[1:])]
    if min(abst) < 30:
        warn.append(f"Meldungsabstand unter 30 s ({min(abst)} s)")
    if ts[0] > 30:
        warn.append(f"erste Meldung erst nach {ts[0]} s (Soll ca. 20 s)")
    feste = [i for i in sz["injects"] if "t_s" in i]
    if any(i["t_s"] >= dauer for i in feste):
        fehler.append("Inject nach Spielende")
    n_inj = len({i["id"].rstrip("ab") for i in sz["injects"]})
    if not 8 <= n_inj <= 14:
        warn.append(f"{n_inj} G3-Injects (Soll 8–14)")
    if not 25 <= len(sz["meldungen"]) <= 30:
        warn.append(f"{len(sz['meldungen'])} Meldungen (Soll ca. 25–30 Entscheidungen je Team ohne Verstärkung)")
    for p in sz.get("phasen", []):
        if p["bis_s"] <= p["von_s"]:
            fehler.append(f"Phase {p['nr']}: bis ≤ von")
    for m in sz["meldungen"]:
        ph = next((p for p in sz.get("phasen", []) if p["von_s"] <= m["t_s"] < p["bis_s"]), None)
        if ph and ph["nr"] != m.get("phase"):
            fehler.append(f"{m['id']}: Phase {m.get('phase')} passt nicht zur Zeit (Phase {ph['nr']})")

    # ---------------------------------------------------------------- ARGUS-Logik
    for m in sz["meldungen"]:
        a = m["argus"]
        soll = L.argus_empfehlung(a["konfidenz"], regeln)
        if a["empfehlung"] != soll and a["empfehlung"] != "NICHT BEKÄMPFEN":
            fehler.append(f"{m['id']}: Empfehlung {a['empfehlung']} passt nicht zu {a['konfidenz']} % (Soll {soll})")
        if a.get("einzeln") and len(a["einzeln"]) != len(m["ziele"]):
            fehler.append(f"{m['id']}: {len(a['einzeln'])} Einzelkonfidenzen für {len(m['ziele'])} Fahrzeuge")
        if len(m["ziele"]) > 1 and not a.get("einzeln"):
            warn.append(f"{m['id']}: Zugmeldung ohne Einzelkonfidenzen")
        for zid in m["ziele"]:
            k = fz[ziele[zid]["typ"]]["argus_klasse"]
            if k != a["klasse"]:
                warn.append(f"{m['id']}: ARGUS-Klasse '{a['klasse']}' ≠ Katalog '{k}' für {zid}")

    # ---------------------------------------------------------------- Positionen und Bewegung
    waelder = [f for f in karte["flaechen"] if f["art"] == "wald"]
    for z in sz["ziele"]:
        pruefe_bewegung(z, fz, linien, fehler, warn)
        r = (z.get("bewegung") or {}).get("route")
        if r:
            for t, x, y in r:
                if not (-15 <= x <= W + 15 and -15 <= y <= H + 15):
                    fehler.append(f"{z['id']}: Routenpunkt außerhalb der Karte ({x}, {y})")
    for z in sz["ziele"]:
        r = (z.get("bewegung") or {}).get("route")
        if not r or len(r) < 2:
            continue
        for wo, (t, x, y) in (("taucht", r[0]), ("verschwindet", r[-1])):
            if wo == "verschwindet" and z.get("bis_s") is None:
                continue
            rand = min(x, W - x, y, H - y)
            wald = min(L.abstand_polygon((x, y), w["punkte"]) for w in waelder)
            if rand > 20 and wald > 0:
                warn.append(f"{z['id']}: {wo} bei ({x}, {y}) mitten in der Karte {'auf' if wo == 'taucht' else ''} (t={t:.0f})".replace("  ", " "))
    for m in sz["meldungen"]:
        for i, zid in enumerate(m["ziele"]):
            z = ziele[zid]
            p = L.position(z, m["t_s"])
            if not L.vorhanden(z, m["t_s"]):
                fehler.append(f"{m['id']}: {zid} ist zur Meldezeit nicht im Raum")
            if m.get("folge_von") is None and L.dist(p, z["pos"]) > 2:
                fehler.append(f"{zid}: Routenposition zur Meldezeit {tuple(round(v) for v in p)} ≠ pos {z['pos']}")
            if not (0 <= p[0] < W and 0 <= p[1] < H):
                fehler.append(f"{zid}: zur Meldezeit außerhalb der Karte {p}")
            for w in waelder:
                if L.im_polygon(p, w["punkte"]):
                    warn.append(f"{zid}: liegt zur Meldezeit im {w['name']} (Sichtbarkeit prüfen)")
            rr = L.richtung(z, m["t_s"])
            if m.get("folge_von") is None and rr is not None and L.winkel_diff(rr, z["hdg"]) > 25:
                warn.append(f"{zid}: hdg {z['hdg']}° passt nicht zur Fahrtrichtung {rr:.0f}° bei {m['id']}")
        abw = L.pruefe_bewegungstext(ziele[m["ziele"][0]], m["t_s"], m["sensor"]["bewegung"])
        abw += L.pruefe_waermetext([ziele[x] for x in m["ziele"]], m["t_s"], m["sensor"]["waerme"])
        for a in abw:
            fehler.append(f"{m['id']}: Sensor „{m['sensor']['bewegung']} / {m['sensor']['waerme']}“: {a}")

    # ---------------------------------------------------------------- Hintergrundgefecht (eigene PzAbw, Feindartillerie, Rauch)
    zerstoert_hg = {}
    hg = (sz.get("hintergrund") or {}).get("ereignisse", [])
    hids = [h["id"] for h in hg]
    if len(set(hids)) != len(hids):
        fehler.append("doppelte IDs im Hintergrundgefecht")
    pza = wm.get("PZA")
    for h in hg:
        if not 0 <= h["t_s"] < dauer:
            fehler.append(f"{h['id']}: Zeit außerhalb des Spiels")
        if h["art"] == "panzerabwehr":
            z = ziele.get(h["ziel"])
            if not z:
                fehler.append(f"{h['id']}: Ziel {h['ziel']} unbekannt")
                continue
            if not L.vorhanden(z, h["t_s"]):
                fehler.append(f"{h['id']}: {h['ziel']} ist um {L.mmss(h['t_s'])} nicht im Raum")
            p = L.position(z, h["t_s"])
            if pza and p[0] >= pza["einsatzbereich"]["x_max"]:
                fehler.append(f"{h['id']}: {h['ziel']} liegt außerhalb des Einsatzbereichs der PzAbw (x = {p[0]:.0f})")
            vor = L.gt_bei(z, h["t_s"] - 0.5)
            if not vor["legitim"]:
                fehler.append(f"{h['id']}: eigene PzAbw wirkt auf {h['ziel']} ({vor['kategorie']})")
            if h.get("folge") == "ausser_gefecht":
                if z["gt"]["kategorie"] != "ausser_gefecht":
                    fehler.append(f"{h['id']}: folge ausser_gefecht, aber Ground Truth von {h['ziel']} ist {z['gt']['kategorie']}")
                elif z["gt"].get("vorher") and z["gt"].get("ab_s") != h["t_s"]:
                    fehler.append(f"{h['id']}: {h['ziel']} wechselt laut gt.ab_s um {z['gt'].get('ab_s')}, das Ereignis ist um {h['t_s']}")
            if h.get("folge") == "zerstoert":
                if h["ziel"] in letzte_meldung and letzte_meldung[h["ziel"]] > h["t_s"]:
                    fehler.append(f"{h['id']}: zerstört {h['ziel']} vor seiner Meldung")
                zerstoert_hg[h["ziel"]] = h["t_s"]
            if any(f["ziele"] and h["ziel"] in f["ziele"] for f in sz["schluesselfaelle"]):
                fehler.append(f"{h['id']}: wirkt auf ein Ziel eines Schlüsselfalls")
        elif h["art"] == "feindartillerie":
            for t, x, y in h["einschlaege"]:
                if not (0 <= x < W and 0 <= y < H):
                    fehler.append(f"{h['id']}: Einschlag außerhalb der Karte ({x}, {y})")
                for z in sz["ziele"]:
                    if L.vorhanden(z, t) and L.dist((x, y), L.position(z, t)) < 40:
                        warn.append(f"{h['id']}: Einschlag ({x}, {y}) nur {L.dist((x, y), L.position(z, t)):.0f} m neben {z['id']}")
        elif h["art"] == "rauch":
            pass
        else:
            warn.append(f"{h['id']}: unbekannte Art {h['art']}")
    for z in sz["ziele"]:
        if z["gt"].get("vorher") and not any(h.get("ziel") == z["id"] and h.get("folge") == "ausser_gefecht" for h in hg):
            fehler.append(f"{z['id']}: gt.vorher ohne Ereignis im Hintergrundgefecht, das den Zustand wechselt")
    for e in sz.get("ereignisse", []):
        for w in e["wirkungen"]:
            z = ziele.get(w["ziel"])
            if z and not L.gt_bei(z, w["t_s"])["legitim"]:
                fehler.append(f"{e['id']}: wirkt auf {w['ziel']} ({L.gt_bei(z, w['t_s'])['kategorie']})")
            if z and not L.vorhanden(z, w["t_s"]):
                fehler.append(f"{e['id']}: {w['ziel']} ist um {L.mmss(w['t_s'])} nicht im Raum")
            if zerstoert_hg.get(w["ziel"], 1e9) <= w["t_s"]:
                warn.append(f"{e['id']}: {w['ziel']} ist dann schon durch das Hintergrundgefecht zerstört")
            if w["von"] in ziele and z:
                a = L.dist(L.position(ziele[w["von"]], w["t_s"]), L.position(z, w["t_s"]))
                if a > 600:
                    warn.append(f"{e['id']}: {w['von']} → {w['ziel']} {a:.0f} m")
    for m in sz["meldungen"]:
        if all(zerstoert_hg.get(z, 1e9) <= m["t_s"] for z in m["ziele"]):
            fehler.append(f"{m['id']}: alle Fahrzeuge sind zur Meldezeit schon durch das Hintergrundgefecht zerstört")

    # ---------------------------------------------------------------- Verstärkungen
    vinfo = []
    vg = (sz.get("verstaerkungen") or {}).get("gruppen", [])
    alle_ids = set(ziele) | set(mids)
    for g in vg:
        ids_z = [z["id"] for z in g["ziele"]]
        ids_m = [m["id"] for m in g["meldungen"]]
        for i in ids_z + ids_m:
            if i in alle_ids:
                fehler.append(f"{g['id']}: ID {i} doppelt")
            alle_ids.add(i)
        vz = {z["id"]: z for z in g["ziele"]}
        for z in g["ziele"]:
            if z["typ"] not in fz:
                fehler.append(f"{z['id']}: Typ {z['typ']} fehlt im Katalog")
            if not z["gt"]["legitim"] or z["gt"]["kategorie"] != "feind":
                fehler.append(f"{g['id']}: {z['id']} ist kein Routineziel ({z['gt']['kategorie']})")
            if any(p["art"] in L.SCHUTZ for p in z.get("personen", []) or []):
                fehler.append(f"{g['id']}: {z['id']} hat geschützte Personen (neue Falle)")
            pruefe_bewegung(z, fz, linien, fehler, warn, wer=f"{g['id']} {z['id']}")
        for m in g["meldungen"]:
            a = m["argus"]
            if a["empfehlung"] != L.argus_empfehlung(a["konfidenz"], regeln):
                fehler.append(f"{m['id']}: Empfehlung passt nicht zur Konfidenz")
            for zid in m["ziele"]:
                if zid not in vz:
                    fehler.append(f"{m['id']}: Ziel {zid} gehört nicht zur Gruppe {g['id']}")
                    continue
                z = vz[zid]
                if fz[z["typ"]]["argus_klasse"] != a["klasse"]:
                    warn.append(f"{m['id']}: ARGUS-Klasse ≠ Katalog für {zid}")
                p = L.position(z, m["dt_s"])
                if L.dist(p, z["pos"]) > 2:
                    fehler.append(f"{zid}: Routenposition zur Meldezeit ≠ pos")
                if not (0 <= p[0] < W and 0 <= p[1] < H):
                    fehler.append(f"{zid}: zur Meldezeit außerhalb der Karte")
            for aw in L.pruefe_bewegungstext(vz[m["ziele"][0]], m["dt_s"], m["sensor"]["bewegung"]) \
                    + L.pruefe_waermetext([vz[x] for x in m["ziele"] if x in vz], m["dt_s"], m["sensor"]["waerme"]):
                fehler.append(f"{m['id']}: Sensor „{m['sensor']['bewegung']}“: {aw}")
        # Konflikte mit geschützten Objekten je Einspielzeit, Zulässigkeit (gerechnet für Einspielen um 10:00, Lage ohne Hauptszenario)
        fenster, beisp = L.verstaerkung_konflikte(sz, g)
        soll = g.get("nicht_einspielen", [])
        for f in fenster:
            if not any(s[0] <= f[0] and f[1] <= s[1] for s in soll):
                fehler.append(f"{g['id']}: Konflikt bei Einspielen {L.uhrzeit(start, f[0])[:8]}–{L.uhrzeit(start, f[1])[:8]} "
                              f"fehlt in nicht_einspielen ({beisp[f[0]]})")
        sz_v = dict(sz)
        d_v = dict(d)
        sz_v["_eingespielt"] = [L.verstaerkung_ziel(z, 0) for z in g["ziele"]]
        d_v["szenario"] = sz_v
        vz_abs = {z["id"]: z for z in sz_v["_eingespielt"]}
        for m in g["meldungen"]:
            _, zonen, res = loesung_meldung(d_v, m, vz_abs, t0=0)
            zul = [r["wm"] for r in res if r["zulaessig_meldung"]]
            if not zul:
                fehler.append(f"{m['id']}: kein Wirkmittel zulässig")
            for r in res:
                if r["zulaessig_meldung"] and r["fenster"] != "immer":
                    warn.append(f"{m['id']}: {r['wm']} bei Meldung zulässig, beim Einschlag {r['fenster']} (Vorhalt bei einer Routine-Verstärkung)")
            vinfo.append({"gruppe": g["id"], "meldung": m["id"], "zulaessig": zul, "nicht_einspielen": fenster})

    # ---------------------------------------------------------------- Lösungshilfe
    hilfe = []
    for m in sz["meldungen"]:
        p, zonen, wmres = loesung_meldung(d, m, ziele, zerstoert=zerstoert_hg)
        eigen = {k["kurz"]: round(L.dist(p, k["pos"])) for k in sz["kraefte"] if k["zugehoerigkeit"] == "eigen"}
        gt = [L.gt_bei(ziele[z], m["t_s"]) for z in m["ziele"]]
        legitim = all(g["legitim"] for g in gt)
        hilfe.append({
            "meldung": m["id"], "t": L.mmss(m["t_s"]), "uhr": L.uhrzeit(start, m["t_s"]),
            "ziele": m["ziele"], "pq": L.pq(p, karte), "pos": [round(p[0]), round(p[1])],
            "kmh": round(L.geschwindigkeit(ziele[m["ziele"][0]], m["t_s"]) * 3.6),
            "in_zone": [zid for zid, a in zonen.items() if a == 0], "abstand_zonen_m": zonen, "abstand_eigene_m": eigen,
            "wirkmittel": wmres,
            "zulaessig_meldung": [w["wm"] for w in wmres if w["zulaessig_meldung"]],
            "zulaessig": [w["wm"] for w in wmres if w["zulaessig"]],
            "vorhalt": [f"{w['wm']} {w['fenster']}" for w in wmres if w["fenster"] not in ("immer", "nie")
                        or w["zulaessig"] != w["zulaessig_meldung"]],
            "gt_kategorie": sorted({g["kategorie"] for g in gt}), "legitim": legitim,
            "argus_falsch": m["argus"]["empfehlung"] == "BEKÄMPFEN" and not legitim,
            "fall": m.get("fall"),
        })

    # ---------------------------------------------------------------- Kennzahlen
    falsch = [h for h in hilfe if h["argus_falsch"]]
    bek = {h["meldung"]: h for h in hilfe}
    konf_f = [m["argus"]["konfidenz"] for m in sz["meldungen"] if bek[m["id"]]["argus_falsch"]]
    konf_r = [m["argus"]["konfidenz"] for m in sz["meldungen"]
              if m["argus"]["empfehlung"] == "BEKÄMPFEN" and not bek[m["id"]]["argus_falsch"]]
    steil = max(wm.values(), key=lambda w: w["wirkradius_m"])["id"]
    praez = [w for w in wm if wm[w]["wirkradius_m"] <= 50 and not wm[w].get("einsatzbereich")]
    i05 = next((i["t_s"] for i in sz["injects"] if i.get("aktion") == "fast_track_angebot"), 0)
    kz = {
        "meldungen": len(sz["meldungen"]), "zielobjekte": len(ziele),
        "fahrzeuge_gemeldet": len(gemeldet),
        "argus_richtig": len(hilfe) - len(falsch), "argus_falsch": len(falsch),
        "falsch_meldungen": [h["meldung"] for h in falsch],
        "konfidenz_falsch_mittel": round(statistics.mean(konf_f), 1) if konf_f else None,
        "konfidenz_richtig_bekaempfen_mittel": round(statistics.mean(konf_r), 1) if konf_r else None,
        "fast_track_faellig": [m["id"] for m in sz["meldungen"]
                               if m["argus"]["konfidenz"] >= regeln["fast_track"]["schwelle"] and m["argus"]["empfehlung"] == "BEKÄMPFEN"],
        "fast_track_nach_angebot": [m["id"] for m in sz["meldungen"] if m["t_s"] >= i05
                                    and m["argus"]["konfidenz"] >= regeln["fast_track"]["schwelle"] and m["argus"]["empfehlung"] == "BEKÄMPFEN"],
        "ohne_zulaessiges_wm": [h["meldung"] for h in hilfe if not h["zulaessig"] and h["legitim"]],
        "steilfeuer": steil,
        "steilfeuer_zulaessig": [h["meldung"] for h in hilfe if steil in h["zulaessig"]],
        "nur_praezision": [h["meldung"] for h in hilfe if h["legitim"] and h["zulaessig"] and all(w in praez for w in h["zulaessig"])],
        "vorhalt": {h["meldung"]: h["vorhalt"] for h in hilfe if h["vorhalt"]},
        "sicht_gestoert": [m["id"] for m in sz["meldungen"] if m["bild"].get("sicht")],
        "zugmeldungen": [m["id"] for m in sz["meldungen"] if len(m["ziele"]) > 1],
        "phasen": {p["nr"]: sum(1 for m in sz["meldungen"] if m.get("phase") == p["nr"]) for p in sz.get("phasen", [])},
        "hintergrund_zerstoert": zerstoert_hg,
        "verstaerkungen": vinfo,
    }
    kz["bestand"] = {w: wm[w]["bestand"] for w in wm}
    lm = sum(wm[w]["bestand"] or 0 for w in praez)
    if lm and len(kz["nur_praezision"]) > lm + 2:
        warn.append(f"nur Präzision zulässig bei {len(kz['nur_praezision'])} legitimen Meldungen, Bestand {lm}")
    if kz["konfidenz_falsch_mittel"] and kz["konfidenz_richtig_bekaempfen_mittel"] \
            and kz["konfidenz_falsch_mittel"] <= kz["konfidenz_richtig_bekaempfen_mittel"]:
        warn.append("Kernaussage der Auswertung prüfen: ARGUS ist bei falschen Empfehlungen nicht sicherer als bei richtigen")

    return {"kennzahlen": kz, "meldungen": hilfe, "warnungen": warn, "fehler": fehler, "n_injects": n_inj}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_json = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
    if out_json in args:
        args.remove(out_json)
    d = L.lade_alles(*(args[:1] or []))
    sz = d["szenario"]
    r = pruefe(d)
    kz, hilfe, warn, fehler, n_inj = r["kennzahlen"], r["meldungen"], r["warnungen"], r["fehler"], r["n_injects"]

    # ---------------------------------------------------------------- Bericht
    print(f"Szenario {sz['id']} v{sz['version']}: {kz['meldungen']} Meldungen ({len(kz['zugmeldungen'])} zugweise) zu "
          f"{kz['fahrzeuge_gemeldet']} gemeldeten Fahrzeugen, {kz['zielobjekte']} Zielobjekte, {n_inj} Injects")
    print(f"ARGUS richtig {kz['argus_richtig']}, falsch {kz['argus_falsch']} {kz['falsch_meldungen']}; "
          f"Ø Konfidenz falsch {kz['konfidenz_falsch_mittel']} % / richtig (BEKÄMPFEN) {kz['konfidenz_richtig_bekaempfen_mittel']} %")
    print(f"Phasen {kz['phasen']}; Fast-Track-fähig nach Angebot: {kz['fast_track_nach_angebot']}")
    print(f"{kz['steilfeuer']} zulässig (Einschlag bei Freigabe +{FREIGABE_RICHTWERT_S} s) bei {kz['steilfeuer_zulaessig']}")
    print(f"nur Präzision zulässig bei {len(kz['nur_praezision'])}: {kz['nur_praezision']}; ohne zulässiges Wirkmittel: {kz['ohne_zulaessiges_wm']}")
    print(f"Vorhalt (Zulässigkeit ändert sich während der Bearbeitung): {kz['vorhalt']}")
    print(f"Bestand {kz['bestand']}; Sicht gestört bei {len(kz['sicht_gestoert'])} Meldungen; "
          f"Hintergrund zerstört {kz['hintergrund_zerstoert']}")
    for v in kz["verstaerkungen"]:
        print(f"  {v['gruppe']} {v['meldung']}: zulässig {v['zulaessig']}; nicht einspielen "
              f"{[L.uhrzeit(sz['spieluhr']['start'], a)[:5] + '–' + L.uhrzeit(sz['spieluhr']['start'], b)[:5] for a, b in v['nicht_einspielen']] or '–'}")
    if "--kurz" not in sys.argv:
        print()
        print(f"{'Meld':5}{'T':6}{'Ziel':8}{'PQ':4}{'km/h':>5} {'Zonen':10}{'NS m':>5}{'EZ m':>5}  {'Meldung':12}{'Einschlag+120':14}{'Vorhalt':24} GT")
        for h in hilfe:
            print(f"{h['meldung']:5}{h['t']:6}{h['ziele'][0]:8}{h['pq']:4}{h['kmh']:5} {','.join(h['in_zone']) or '-':10}"
                  f"{h['abstand_zonen_m']['NS-01']:5}{h['abstand_zonen_m']['EZ-01']:5}  "
                  f"{','.join(h['zulaessig_meldung']) or '—':12}{','.join(h['zulaessig']) or '—':14}{'; '.join(h['vorhalt']) or '':24} "
                  f"{'/'.join(h['gt_kategorie'])}{'  ARGUS FALSCH' if h['argus_falsch'] else ''}"
                  f"{'  [' + h['fall'] + ']' if h['fall'] else ''}")
            for w in h["wirkmittel"]:
                if w["nebenwirkung"]:
                    print(f"      {w['wm']}: trifft auch {'; '.join(n['text'] for n in w['nebenwirkung'])}")
    print()
    for w in warn:
        print("WARNUNG:", w)
    for f in fehler:
        print("FEHLER:", f)
    print("OK" if not fehler else f"{len(fehler)} Fehler")

    if out_json:
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False, indent=1)
    sys.exit(1 if fehler else 0)


if __name__ == "__main__":
    main()
