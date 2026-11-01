#!/usr/bin/env python3
"""Verlustmodell der eigenen 2. Kompanie (seit Szenario 2.3, Änderung D2) – Referenz für src/kern/verluste.ts.

Grundsätze (claude/Aenderungen_Druck_01-11.md):
  * Schaden entsteht nur durch feuernde Feinde, die noch stehen: Mörser und andere Fahrzeuge mit `feuert` (Schussrhythmus),
    Kampf- und Schützenpanzer im Halt in Reichweite eines Zuges (fester Takt), Feindartillerie (Einschläge im Hintergrund-
    gefecht). Je Schuss bzw. Einschlag ein fester Schadenswert je Waffenart (regeln.json, Abschnitt `verluste`).
  * Bekämpfen stoppt den Schaden: Ein Schuss zählt nur, wenn der Schütze zur Schusszeit noch steht (zerstört > t, im Raum,
    Feind und legitim). Der Schaden kommt `verzug_s` nach dem Schuss an der Stellung an (Flugzeit, Meldeweg).
  * Fehler haben Folgen: Wirkung auf die Attrappe verrät die Stellung (zusätzliche Feindartillerie auf den Zug), eine
    durchgebrochene Gruppe richtet beim Übergang über den Bach hohen Schaden an, ohne E-01 feuern die Feinde an der Brücke
    weiter (das folgt von selbst daraus, dass sie stehen bleiben).
  * Deterministisch, ganzzahlig in Promille: gleiche Entscheidungen ⇒ gleiche Verluste. Untergrenze je Zug (die Kompanie
    hält immer), danach eskalieren nur die Meldungen.
  * Keine Darstellung getöteter Menschen: Kampfkraft in %, Verwundete als Zahl.

Alles ist eine reine Funktion von Welt (Szenario mit Verstärkungen und Durchbrüchen), Zerstörungszeiten, Attrappen-Treffer und
Spielzeit. Gleich im Projekt PolBil (claude/tools/verluste.py) und im Repository (tools/referenz/verluste.py).
"""
import math

import argus_lib as L

ARTEN = ("direkt", "steil", "artillerie", "attrappe", "durchbruch")


def r2(x):
    """Auf 0,01 s runden wie Math.round(x * 100) / 100 in der Engine."""
    return math.floor(x * 100 + 0.5) / 100


def zuege(sz):
    return (sz.get("eigene_truppe") or {}).get("zuege", [])


def zug_mitte(zug):
    f = zug["fahrzeuge"]
    return (sum(p[0] for p in f) / len(f), sum(p[1] for p in f) / len(f))


def halt_seit(ziel, t):
    """Wie lange steht das Fahrzeug zur Zeit t schon (s)? 0, wenn es fährt. Ohne Route: seit es im Raum ist."""
    r = (ziel.get("bewegung") or {}).get("route")
    if not r:
        return t - L.ab_s(ziel)
    if t < r[0][0]:
        return 0.0
    gleich = lambda a, b: abs(a[1] - b[1]) < 0.01 and abs(a[2] - b[2]) < 0.01
    i = len(r) - 1
    for k in range(len(r) - 1):
        if r[k][0] <= t < r[k + 1][0]:
            if not gleich(r[k], r[k + 1]):
                return 0.0
            i = k
            break
    while i > 0 and gleich(r[i - 1], r[i]):
        i -= 1
    return t - r[i][0]


def phase(zid, takt):
    """Fester Versatz des Takts je Fahrzeug, damit nicht alle zugleich feuern (Ziffern der Kennung)."""
    ziffern = "".join(c for c in zid if c.isdigit())
    return (int(ziffern or "0") * 7) % int(takt)


def naechster_zug(zl, p, reichweite=None):
    """Zug, auf den ein Feind an der Stelle p schießt: der Zug, in dessen Gefechtsstreifen (streifen = [y_von, y_bis)) p liegt,
    sonst der nächste – jeweils nur in Reichweite."""
    for zug in zl:
        st = zug.get("streifen")
        if st and st[0] <= p[1] < st[1]:
            if reichweite is None or L.dist(zug_mitte(zug), p) <= reichweite:
                return zug
            break
    best, bd = None, None
    for zug in zl:
        dd = L.dist(zug_mitte(zug), p)
        if reichweite is not None and dd > reichweite:
            continue
        if bd is None or dd < bd - 1e-9:
            best, bd = zug, dd
    return best


def ort_text(sz, p):
    """„aus Hof RABE“ o. Ä.: nächster benannter Ort (verluste.orte) im Umkreis, sonst leer."""
    vl = sz.get("verluste") or {}
    best, bd = "", None
    for o in vl.get("orte", []):
        dd = L.dist(o["pos"], p)
        if dd <= o.get("radius_m", 150) and (bd is None or dd < bd - 1e-9):
            best, bd = o["text"], dd
    return best


def feindlich(ziel, t):
    gt = L.gt_bei(ziel, t)
    return gt.get("kategorie") == "feind" and gt.get("legitim", False)


def zeitlinie(d, zerstoert, attrappe_t=None, durch=None):
    """Alle Schadensereignisse an den eigenen Zügen, nach Zeit sortiert.

    d          Daten der Welt (Szenario mit eingespielten Verstärkungen und Durchbrüchen)
    zerstoert  {ziel: Spielzeit der Zerstörung}
    attrappe_t Einschlagzeit der ersten eigenen Wirkung auf die Attrappe (oder None)
    durch      Durchbruch-Gruppen, die durchgebrochen sind (wie argus_lib.durchbruch_gruppen)

    Ereignis: dict(t, zug, promille, art, quelle, nr, ort, pos) – pos = Einschlagort an der Stellung (für die Darstellung).
    """
    sz = d["szenario"]
    vr = d["regeln"].get("verluste") or {}
    vs = sz.get("verluste") or {}
    zl = zuege(sz)
    if not zl or not vr:
        return []
    zmap = {z["id"]: z for z in zl}
    dauer = sz["spieluhr"]["dauer_s"]
    waffen = vr["waffen"]
    verzug = vr["verzug_s"]
    zerstoert = {k: r2(v) for k, v in (zerstoert or {}).items()}
    ev = []

    def steht(ziel, t):
        return L.vorhanden(ziel, t) and zerstoert.get(ziel["id"], 1e9) > t and feindlich(ziel, t)

    for ziel in L.alle_ziele(sz):
        w = waffen.get(ziel["typ"])
        if not w:
            continue
        if ziel.get("feuert"):
            for ts, nr in L.schuesse(ziel):
                if ts >= dauer or not steht(ziel, ts):
                    continue
                f = next((x for x in ziel["feuert"] if x["von_s"] <= ts < x["bis_s"]), ziel["feuert"][0])
                p = L.position(ziel, ts)
                zug = zmap.get(f.get("auf")) or naechster_zug(zl, p, w.get("reichweite_m"))
                if zug is None:
                    continue
                t = r2(ts + verzug[w["art"]])
                ev.append({"t": t, "zug": zug["id"], "promille": ziel.get("verlust_promille", w["promille"]), "art": w["art"], "quelle": ziel["id"], "nr": nr,
                           "ort": ort_text(sz, p)})
            continue
        if w["art"] != "direkt":
            continue
        takt = w["takt_s"]
        ph = phase(ziel["id"], takt)
        t0 = L.ab_s(ziel)
        k = max(0, math.ceil((t0 - ph) / takt))
        nr = 0
        while True:
            ts = k * takt + ph
            k += 1
            if ts >= dauer or ts >= ziel.get("bis_s", 1e9) or ts >= zerstoert.get(ziel["id"], 1e9):
                break
            if not steht(ziel, ts) or halt_seit(ziel, ts) < w["feuerbereit_s"]:
                continue
            p = L.position(ziel, ts)
            zug = naechster_zug(zl, p, w["reichweite_m"])
            if zug is None:
                continue
            ev.append({"t": r2(ts + verzug["direkt"]), "zug": zug["id"], "promille": ziel.get("verlust_promille", w["promille"]), "art": "direkt",
                       "quelle": ziel["id"], "nr": nr, "ort": ort_text(sz, p)})
            nr += 1

    art = vr["feindartillerie"]
    for h in (sz.get("hintergrund") or {}).get("ereignisse", []):
        if h["art"] != "feindartillerie":
            continue
        for nr, (t, x, y) in enumerate(h["einschlaege"]):
            zug = naechster_zug(zl, (x, y), art["radius_m"])
            if zug is None or t >= dauer:
                continue
            ev.append({"t": r2(t), "zug": zug["id"], "promille": art["promille"], "art": "artillerie", "quelle": h["id"], "nr": nr,
                       "ort": "", "pos": [x, y]})

    at = vs.get("attrappe")
    if at and attrappe_t is not None and at["zug"] in zmap:
        zug = zmap[at["zug"]]
        mx, my = zug_mitte(zug)
        for nr, (dt, dx, dy) in enumerate(at["einschlaege"]):
            t = r2(attrappe_t + at["verzoegerung_s"] + dt)
            if t >= dauer:
                continue
            ev.append({"t": t, "zug": zug["id"], "promille": vr["attrappe"]["promille"], "art": "attrappe", "quelle": at["ziel"],
                       "nr": nr, "ort": "", "pos": [mx + dx, my + dy]})

    db = vs.get("durchbruch") or {}
    for g in durch or []:
        zug = zmap.get(db.get(g["ueber"]))
        if zug is None:
            continue
        for zid in g["ziele"]:
            tc = g["ueber_s"].get(zid)
            if tc is None or tc >= dauer or zerstoert.get(zid, 1e9) <= tc:
                continue
            ev.append({"t": r2(tc), "zug": zug["id"], "promille": vr["durchbruch"]["promille"], "art": "durchbruch", "quelle": zid,
                       "nr": 0, "ort": ""})

    ev = [e for e in ev if e["t"] < dauer]     # Schaden nach Spielende zählt nicht
    reihe = {z["id"]: i for i, z in enumerate(zl)}
    ev.sort(key=lambda e: (e["t"], reihe[e["zug"]], e["quelle"], e["nr"]))
    # Einschlagort an der Stellung (Darstellung): Fahrzeug und Versatz der Reihe nach, wenn nicht vorgegeben
    versatz = vr.get("versatz_m", [[0, 0]])
    zaehler = {z["id"]: 0 for z in zl}
    for e in ev:
        if "pos" in e:
            continue
        zug = zmap[e["zug"]]
        k = zaehler[e["zug"]]
        zaehler[e["zug"]] += 1
        fz = zug["fahrzeuge"][k % len(zug["fahrzeuge"])]
        dx, dy = versatz[k % len(versatz)]
        e["pos"] = [fz[0] + dx, fz[1] + dy]
    return ev


def stand(d, ev, t=None):
    """Stand je Zug zur Spielzeit t (alle Ereignisse mit Zeit ≤ t): verlust (Promille, gedeckelt), Kampfkraft, Verwundete."""
    vr = d["regeln"]["verluste"]
    deckel = 1000 - 10 * vr["untergrenze_prozent"]
    roh = {z["id"]: 0 for z in zuege(d["szenario"])}
    for e in ev:
        if t is not None and e["t"] > t:
            break
        roh[e["zug"]] += e["promille"]
    out = {}
    for zid, v in roh.items():
        vv = min(v, deckel)
        out[zid] = {"verlust": vv, "roh": v, "kampfkraft": (1000 - vv) // 10, "verwundete": vv // vr["promille_je_verwundeter"]}
    return out


def kompanie(d, st):
    """Kopfzeile: Kampfkraft der Kompanie (Mittel der Züge, abgerundet) und Verwundete gesamt."""
    n = len(st)
    if not n:
        return {"kampfkraft": 100, "verwundete": 0}
    return {"kampfkraft": sum(1000 - s["verlust"] for s in st.values()) // (10 * n),
            "verwundete": sum(s["verwundete"] for s in st.values())}


def stufe_fuer(vr, verlust):
    deckel = 1000 - 10 * vr["untergrenze_prozent"]
    if verlust >= deckel:
        return 3
    kk = 1000 - verlust
    s = 0
    for i, sw in enumerate(vr["schwellen_prozent"]):
        if kk < 10 * sw:
            s = i + 1
    return s


def verw_text(n):
    return "keine Verwundeten" if n == 0 else ("1 Verwundeter" if n == 1 else f"{n} Verwundete")


def meldungen(d, ev):
    """Druckmeldungen der Kompanie (D3) aus der Zeitlinie: Liste dict(id, t, zug, stufe, text).

    Neue Stufe (Kampfkraft unter einer Schwelle, Untergrenze) meldet sofort, ebenso der erste Treffer einer Art aus `sofort`
    (Attrappe: „Stellung offenbar aufgeklärt“). Sonst meldet ein Zug neue Verwundete, sobald es `je_verwundete` mehr sind als bei
    seiner letzten Meldung – frühestens `abstand_zug_s` nach seiner und `abstand_alle_s` nach der letzten Meldung der Kompanie.
    An der Untergrenze wiederholt er höchstens alle `abstand_limit_s`. Die Meldung nennt die Hauptquelle der letzten
    `fenster_s` Sekunden an diesem Zug (größter Schaden, bei Gleichstand die zuletzt getroffene).
    """
    sz, vr = d["szenario"], d["regeln"]["verluste"]
    vm = (sz.get("verluste") or {}).get("meldungen")
    if not vm:
        return []
    regel = vr["meldungen"]
    deckel = 1000 - 10 * vr["untergrenze_prozent"]
    zl = zuege(sz)
    name = {z["id"]: z["name"] for z in zl}
    zst = {z["id"]: {"verlust": 0, "stufe": 0, "t": None, "verw": 0, "arten": set(), "letzte": []} for z in zl}
    out = []
    t_alle = None
    for i, e in enumerate(ev):
        s = zst[e["zug"]]
        s["verlust"] = min(deckel, s["verlust"] + e["promille"])
        s["letzte"].append((e["t"], e["art"], e["ort"], e["promille"], i))
        verw = s["verlust"] // vr["promille_je_verwundeter"]
        neu = stufe_fuer(vr, s["verlust"])
        t = e["t"]
        frei_alle = t_alle is None or t - t_alle >= regel["abstand_alle_s"]
        erste_art = e["art"] in regel.get("sofort", []) and e["art"] not in s["arten"]
        s["arten"].add(e["art"])
        if neu > s["stufe"] or erste_art:
            stufe = neu
        elif neu < 3 and verw - s["verw"] >= regel["je_verwundete"] and frei_alle and (s["t"] is None or t - s["t"] >= regel["abstand_zug_s"]):
            stufe = neu
        elif neu == 3 and frei_alle and (s["t"] is None or t - s["t"] >= regel["abstand_limit_s"]):
            stufe = 3
        else:
            continue
        if erste_art:
            art, ort = e["art"], e["ort"]
        else:
            summe = {}
            for (te, a, o, p, k) in s["letzte"]:
                if te >= t - regel["fenster_s"]:
                    alt = summe.get((a, o), (0, -1))
                    summe[(a, o)] = (alt[0] + p, k)
            art, ort = max(summe.items(), key=lambda kv: kv[1])[0]
        werte = {"zug": name[e["zug"]], "kk": (1000 - s["verlust"]) // 10, "verw": verw_text(verw),
                 "neu": neu_text(verw - s["verw"]), "waffe": vm["waffe"][art], "ort": (" " + ort) if ort else "",
                 "forderung": vm["forderung"][art]}
        text = vm["texte"]["sofort" if erste_art and neu == s["stufe"] else str(stufe)].format(**werte)
        out.append({"id": f"{vm['kennung']}{len(out) + 1:02d}", "t": t, "zug": e["zug"], "stufe": stufe, "text": text})
        s.update(stufe=max(s["stufe"], neu), t=t, verw=verw, letzte=[x for x in s["letzte"] if x[0] >= t - regel["fenster_s"]])
        t_alle = t
    return out


def neu_text(n):
    return "keine neuen Verwundeten" if n <= 0 else ("1 neuer Verwundeter" if n == 1 else f"{n} neue Verwundete")


def fuelle(text, d, st, zug_id):
    """Platzhalter einer festen Lagemeldung (D3.2: I-07, I-06, I-13) mit dem Stand dieses Teams füllen."""
    if "{" not in text:
        return text
    zl = {z["id"]: z for z in zuege(d["szenario"])}
    s = st.get(zug_id) or {"kampfkraft": 100, "verwundete": 0}
    kp = kompanie(d, st)
    return text.format(zug=zl[zug_id]["name"] if zug_id in zl else "", kk=s["kampfkraft"], verw=verw_text(s["verwundete"]),
                       kp_kk=kp["kampfkraft"], kp_verw=verw_text(kp["verwundete"]))


def verlauf(d, ev, schritt=15):
    """Kampfkraft der Kompanie über die Spielzeit (für Drehbuch und Auswertung): [(t, kp_kampfkraft, verwundete)]."""
    dauer = d["szenario"]["spieluhr"]["dauer_s"]
    out = []
    t = 0
    while t <= dauer:
        kp = kompanie(d, stand(d, ev, t))
        out.append((t, kp["kampfkraft"], kp["verwundete"]))
        t += schritt
    return out
