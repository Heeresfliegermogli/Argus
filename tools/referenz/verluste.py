#!/usr/bin/env python3
"""Verlustmodell der eigenen Truppe – seit Szenario 2.5 (Änderung F2) die 1./PzBtl 613 (Absender „1. Kp“) mit vier Kampfpanzern
Leopard 2A7V, Zustand je Panzer. Referenz für src/kern/verluste.ts (gleiche Ergebnisse prüft tests/durchlauf.test.ts).

Grundsätze (claude/Aenderungen_Panzerzug_02-11.md, F2):
  * Wer schießt: Direktschützen (T-72, BMP-2, BTR-80) erst, wenn sie das Ostufer bzw. die Brücke Ost erreicht haben (x ≤ feuer_ab_x)
    und mindestens feuerbereit_s stehen – im Takt ihrer Waffe (T-72 15 s, BMP-2 10 s, BTR-80 12 s) auf den nächsten einsatzbereiten
    Panzer. Schützen mit `feuert` (Mörser, Beobachter S7, Schutzschild-SPz S5) wirken nach Drehbuch: Mörser und Beobachter eine
    Salve bzw. ein Feuerkommando je Salve des Schussrhythmus, Kanonen und Maschinenkanonen jeder Feuerstoß, auf feuert[].auf (ist der
    ausgefallen bzw. fehlt er, auf den nächsten einsatzbereiten). Feindartillerie wirkt nach den
    Einschlägen im Hintergrundgefecht, die Attrappe verrät die Stellung von 1/2, ein Durchbruch trifft die Panzer am Übergang.
  * Einschießen je Schütze und Ziel (deterministisch): direkt Schuss 1–2 daneben (20–40 m vor oder hinter dem Panzer), Schuss 3 nah
    (≤ 8 m, nur Splitter, kein Schaden), ab Schuss 4 trifft jeder zweite, ab Schuss 8 jeder; Steilfeuer und gelenktes Feuer Salve 1–2
    60–100 m daneben, ab Salve 3 im Ziel. Wechselt der Schütze das Ziel, beginnt er neu.
  * Wirkung am Panzer (Zustand 100 %): Treffer je Waffe (T-72 −25 %, BMP-2 −5 %, BTR-80 −2 %, Mörser/Artillerie im Ziel −4 %, gelenktes
    Feuer −4 %). Ab 70 % einsatzbereit, 40–69 % eingeschränkt (schießt weiter), unter 40 % ausgefallen (Besatzung verwundet, Bergung).
  * Untergrenze: höchstens `hoechstens_ausgefallen` (2) Panzer fallen aus, die übrigen bleiben bei mindestens 40 %. Die Kp hält immer.
    Verwundete je Stufe fest (eingeschränkt 1, ausgefallen 3), keine Gefallenen.
  * Bekämpfen stoppt den Schaden: Ein Schuss zählt nur, wenn der Schütze zur Schusszeit noch steht (im Raum, nicht zerstört, Feind und
    legitim); der Schaden kommt verzug_s nach dem Schuss an. Deterministisch: gleiche Entscheidungen ⇒ gleiche Verluste.

Alles ist eine reine Funktion von Welt (Szenario mit Verstärkungen und Durchbrüchen), Zerstörungszeiten, Attrappen-Treffer und Spielzeit.
Gleich im Projekt PolBil (claude/tools/verluste.py) und im Repository (tools/referenz/verluste.py). Bis 2.4: drei Züge mit Kampfkraft in
Promille (Änderungen D und E), siehe Git-Verlauf.
"""
import math

import argus_lib as L

ARTEN = ("direkt", "steil", "beobachter", "artillerie", "attrappe", "durchbruch")
EINSCHIESSEN = ("direkt", "steil", "beobachter")
# feste Richtungen für Steilfeuer daneben (Einheitsvektoren ohne Winkelfunktionen, damit Python und TypeScript gleich runden)
RICHTUNGEN = ((1, 0), (0.6, 0.8), (0, 1), (-0.6, 0.8), (-1, 0), (-0.6, -0.8), (0, -1), (0.6, -0.8))


def r2(x):
    """Auf 0,01 s runden wie Math.round(x * 100) / 100 in der Engine."""
    return math.floor(x * 100 + 0.5) / 100


def r1(x):
    """Auf 0,1 m runden (Math.round(x * 10) / 10)."""
    return math.floor(x * 10 + 0.5) / 10


def variante(s, n):
    """Feste Variante je Kennung, wie effekte.ts variante()."""
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h % n


def panzer(sz):
    return (sz.get("eigene_truppe") or {}).get("panzer", [])


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


def salven(ziel):
    """Beginn jeder Salve des Schussrhythmus (feuert): [(t, nr)] – eine Salve bzw. ein Feuerstoß zählt im Verlustmodell als ein Schuss."""
    out = []
    for f in ziel.get("feuert") or []:
        t, k = f["von_s"], 0
        while t < f["bis_s"]:
            out.append((round(t, 2), k))
            k += 1
            t += f.get("salve", 1) * f["takt_s"] + f.get("pause_s", 0)
    return out


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


def naechster(pl, p, aus, zustand=None, ab=None):
    """Nächster einsatzbereiter Panzer zur Stelle p: zuerst die voll einsatzbereiten (Zustand ≥ ab), sonst der nächste nicht
    ausgefallene (bei Gleichstand der erste der Liste). Ohne zustand: der nächste nicht ausgefallene."""
    for nur_voll in ((True, False) if zustand is not None else (False,)):
        best, bd = None, None
        for pz in pl:
            if pz["id"] in aus or (nur_voll and zustand[pz["id"]] < ab):
                continue
            dd = L.dist(pz["pos"], p)
            if bd is None or dd < bd - 1e-9:
                best, bd = pz, dd
        if best is not None:
            return best
    return None


def einschuss(vr, art, k):
    """Ergebnis des k-ten Schusses (1 …) eines Schützen auf dasselbe Ziel: daneben, nah oder treffer (F2.3)."""
    e = vr["einschiessen"]["direkt" if art == "direkt" else "steil"]
    if art == "direkt":
        if k <= e["daneben"]:
            return "daneben"
        if k <= e["daneben"] + e["nah"]:
            return "nah"
        if k >= e["jeder_ab"]:
            return "treffer"
        return "treffer" if (k - e["jeder_zweite_ab"]) % 2 == 0 else "nah"
    return "daneben" if k <= e["daneben"] else "treffer"


def einschlag_ort(vr, art, ergebnis, k, von, ziel, schl):
    """Einschlagort (Darstellung): daneben vor bzw. hinter dem Panzer in Schussrichtung, nah seitlich, Treffer am Panzer; Steilfeuer
    daneben in einer festen Richtung. Nur Grundrechenarten und Wurzel, damit Referenz und Engine bitgleich rechnen."""
    am = vr["ablage_m"]
    v = variante(schl, 1000)
    x, y = ziel
    if art == "direkt" and von is not None:
        dx, dy = x - von[0], y - von[1]
        n = math.sqrt(dx * dx + dy * dy) or 1.0
        ux, uy = dx / n, dy / n
    else:
        ux, uy = 1.0, 0.0
    qx, qy = -uy, ux
    if ergebnis == "treffer":
        return [r1(x - ux * 1.5), r1(y - uy * 1.5)]
    if ergebnis == "nah":
        a, b = am["nah"]
        s = a + v % (b - a + 1)
        seite = 1 if (k + v) % 2 else -1
        return [r1(x + qx * s * seite), r1(y + qy * s * seite)]
    if art == "direkt":
        a, b = am["daneben"]
        s = a + v % (b - a + 1)
        vorn = -1 if k % 2 else 1          # Schuss 1 vor dem Panzer, Schuss 2 dahinter
        quer = (v % 11) - 5
        return [r1(x + ux * s * vorn + qx * quer), r1(y + uy * s * vorn + qy * quer)]
    a, b = am["steil_daneben"]
    s = a + v % (b - a + 1)
    rx, ry = RICHTUNGEN[(v + k) % len(RICHTUNGEN)]
    return [r1(x + rx * s), r1(y + ry * s)]


def zeitlinie(d, zerstoert, attrappe_t=None, durch=None):
    """Alle Schüsse auf die eigenen Panzer, nach Zeit, mit Ergebnis und Zustand danach.

    d          Daten der Welt (Szenario mit eingespielten Verstärkungen und Durchbrüchen)
    zerstoert  {ziel: Spielzeit der Zerstörung}
    attrappe_t Einschlagzeit der ersten eigenen Wirkung auf die Attrappe (oder None)
    durch      Durchbruch-Gruppen, die durchgebrochen sind (wie argus_lib.durchbruch_gruppen)

    Ereignis: dict(t, ts, panzer, quelle, art, nr, k, ergebnis, schaden, zustand, roh, ausgefallen, ort, pos, von)
      t        Einschlag (Spielzeit), ts Schuss, k Schuss dieses Schützen auf dieses Ziel (Einschießen; 0 ohne Einschießen)
      ergebnis daneben | nah | treffer · schaden in Prozentpunkten (nur Treffer) · zustand nach dem Einschlag (gedeckelt an der
      Untergrenze), roh ohne Deckel · pos Einschlagort, von Ort des Schützen (oder None).
    """
    sz = d["szenario"]
    vr = d["regeln"].get("verluste") or {}
    vs = sz.get("verluste") or {}
    pl = panzer(sz)
    if not pl or not vr:
        return []
    pmap = {p["id"]: p for p in pl}
    dauer = sz["spieluhr"]["dauer_s"]
    waffen = vr["waffen"]
    verzug = vr["verzug_s"]
    zerstoert = {k: r2(v) for k, v in (zerstoert or {}).items()}
    kand = []

    def steht(ziel, t):
        return L.vorhanden(ziel, t) and zerstoert.get(ziel["id"], 1e9) > t and feindlich(ziel, t)

    for ziel in L.alle_ziele(sz):
        w = waffen.get(ziel["typ"])
        if not w:
            continue
        if ziel.get("feuert"):
            # Steilfeuer und gelenktes Feuer: eine Salve = ein Schuss; direktes Feuer: jeder Feuerstoß des Rhythmus ein Schuss
            for ts, nr in (salven(ziel) if w["art"] in ("steil", "beobachter") else L.schuesse(ziel)):
                if ts >= dauer or not steht(ziel, ts):
                    continue
                f = next((x for x in ziel["feuert"] if x["von_s"] <= ts < x["bis_s"]), ziel["feuert"][0])
                p = L.position(ziel, ts)
                kand.append({"t": r2(ts + verzug[w["art"]]), "ts": ts, "quelle": ziel["id"], "nr": nr, "art": w["art"], "fest": f.get("auf"),
                             "von": [r1(p[0]), r1(p[1])], "schaden": w["treffer_prozent"], "ort": ort_text(sz, p)})
            continue
        if w["art"] != "direkt" or ziel.get("bereitstellung"):
            continue                 # Bereitstellung (Phase 5, sammelt für den Angriff über den Bach): kein Direktfeuer
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
            if p[0] > vr["feuer_ab_x"]:
                continue
            kand.append({"t": r2(ts + verzug["direkt"]), "ts": ts, "quelle": ziel["id"], "nr": nr, "art": "direkt", "fest": None,
                         "von": [r1(p[0]), r1(p[1])], "schaden": w["treffer_prozent"], "ort": ort_text(sz, p)})
            nr += 1

    art = vr["feindartillerie"]
    for h in (sz.get("hintergrund") or {}).get("ereignisse", []):
        if h["art"] != "feindartillerie":
            continue
        for nr, (t, x, y) in enumerate(h["einschlaege"]):
            if t >= dauer:
                continue
            kand.append({"t": r2(t), "ts": t, "quelle": h["id"], "nr": nr, "art": "artillerie", "pos": [x, y], "radius": art["radius_m"],
                         "schaden": art["treffer_prozent"], "ort": "", "von": None})

    at = vs.get("attrappe")
    if at and attrappe_t is not None and at["panzer"] in pmap:
        px, py = pmap[at["panzer"]]["pos"]
        for nr, (dt, dx, dy) in enumerate(at["einschlaege"]):
            t = r2(attrappe_t + at["verzoegerung_s"] + dt)
            if t >= dauer:
                continue
            kand.append({"t": t, "ts": t, "quelle": at["ziel"], "nr": nr, "art": "attrappe", "pos": [px + dx, py + dy],
                         "radius": vr["attrappe"]["radius_m"], "schaden": vr["attrappe"]["treffer_prozent"], "ort": "", "von": None})

    db = vs.get("durchbruch") or {}
    zmap = {z["id"]: z for z in L.alle_ziele(sz)}
    for g in durch or []:
        ziele_pz = db.get(g["ueber"]) or []
        if not ziele_pz:
            continue
        for zid in g["ziele"]:
            tc = g["ueber_s"].get(zid)
            if tc is None or tc >= dauer or zerstoert.get(zid, 1e9) <= tc:
                continue
            z = zmap.get(zid)
            w = waffen.get(z["typ"]) if z else None
            if not w or w["art"] != "direkt":
                continue
            p = L.position(z, tc)
            kand.append({"t": r2(tc), "ts": tc, "quelle": zid, "nr": 0, "art": "durchbruch", "ueber": g["ueber"],
                         "von": [r1(p[0]), r1(p[1])], "schaden": (vr.get("durchbruch") or {}).get("treffer_prozent", w["treffer_prozent"]),
                         "ort": ort_text(sz, p)})

    kand = [c for c in kand if c["t"] < dauer]      # Schaden nach Spielende zählt nicht
    kand.sort(key=lambda c: (c["t"], c["quelle"], c["nr"]))

    unter = vr["untergrenze_prozent"]
    aus_unter = vr["stufen"]["ausgefallen_unter"]
    hoechstens = vr["hoechstens_ausgefallen"]
    zustand = {p["id"]: vr["zustand_start"] for p in pl}
    roh = dict(zustand)
    aus = set()
    schuetze = {}            # Quelle → [Ziel, Zahl der Schüsse auf dieses Ziel]
    n_durch = {}             # Übergang → Zahl der Durchbrüche bisher (die Panzer am Übergang im Wechsel)
    ev = []
    for c in kand:
        a = c["art"]
        if a == "artillerie":
            # Feindartillerie nach Drehbuch: trifft, wenn der Einschlag im Umkreis radius_m eines Panzers liegt (sonst nur Darstellung)
            ziel = None
            bd = None
            for pz in pl:
                dd = L.dist(pz["pos"], c["pos"])
                if dd <= c["radius"] and (bd is None or dd < bd - 1e-9):
                    ziel, bd = pz, dd
            if ziel is None or ziel["id"] in aus:
                continue
            k, ergebnis, pos = 0, "treffer", [r1(c["pos"][0]), r1(c["pos"][1])]
        elif a == "attrappe":
            # verratene Stellung von 1/2: jeder Einschlag ist ein Ereignis (Darstellung), Treffer nur im Umkreis radius_m
            ziel = pmap[at["panzer"]]
            im = L.dist(ziel["pos"], c["pos"]) <= c["radius"] and ziel["id"] not in aus
            k, ergebnis, pos = 0, ("treffer" if im else "daneben"), [r1(c["pos"][0]), r1(c["pos"][1])]
        else:
            if a == "durchbruch":
                liste = db.get(c["ueber"]) or []
                c["fest"] = liste[n_durch.get(c["ueber"], 0) % len(liste)]
                n_durch[c["ueber"]] = n_durch.get(c["ueber"], 0) + 1
            fest = pmap.get(c["fest"]) if c.get("fest") else None
            if fest is not None and fest["id"] not in aus:
                ziel = fest              # Feuer nach Drehbuch bleibt auf seinem Panzer, bis er ausfällt
            else:
                ziel = naechster(pl, c["von"], aus, zustand, vr["stufen"]["einsatzbereit_ab"])
            if ziel is None:
                continue
            if a == "durchbruch":
                k, ergebnis = 0, "treffer"
            else:
                alt = schuetze.get(c["quelle"])
                k = alt[1] + 1 if alt and alt[0] == ziel["id"] else 1
                schuetze[c["quelle"]] = [ziel["id"], k]
                ergebnis = einschuss(vr, a, k)
            pos = einschlag_ort(vr, a, ergebnis, k, c["von"], ziel["pos"], f"{c['quelle']}{ziel['id']}{k}")
        pid = ziel["id"]
        schaden = c["schaden"] if ergebnis == "treffer" else 0
        roh[pid] -= schaden
        neu = zustand[pid] - schaden
        if neu < aus_unter and pid not in aus and len(aus) >= hoechstens:
            neu = max(neu, unter)           # Untergrenze: die letzten Panzer halten
        if pid in aus:
            neu = zustand[pid]              # ein ausgefallener Panzer nimmt keinen weiteren Schaden
        zustand[pid] = neu
        if neu < aus_unter:
            aus.add(pid)
        ev.append({"t": c["t"], "ts": c["ts"], "panzer": pid, "quelle": c["quelle"], "art": a, "nr": c["nr"], "k": k, "ergebnis": ergebnis,
                   "schaden": schaden, "zustand": neu, "roh": roh[pid], "ausgefallen": pid in aus, "ort": c["ort"], "pos": pos,
                   "von": c["von"]})
    return ev


def stufe(vr, zustand, ausgefallen):
    """einsatzbereit (ab 70 %), eingeschraenkt (40–69 %) oder ausgefallen (unter 40 %)."""
    if ausgefallen:
        return "ausgefallen"
    return "einsatzbereit" if zustand >= vr["stufen"]["einsatzbereit_ab"] else "eingeschraenkt"


STUFE_TEXT = {"einsatzbereit": "einsatzbereit", "eingeschraenkt": "eingeschränkt", "ausgefallen": "ausgefallen"}


def stand(d, ev, t=None):
    """Stand je Panzer zur Spielzeit t (alle Ereignisse mit Zeit ≤ t): zustand, roh, stufe, treffer, verwundete."""
    vr = d["regeln"]["verluste"]
    out = {p["id"]: {"zustand": vr["zustand_start"], "roh": vr["zustand_start"], "ausgefallen": False, "treffer": 0}
           for p in panzer(d["szenario"])}
    for e in ev:
        if t is not None and e["t"] > t:
            break
        s = out[e["panzer"]]
        s["zustand"], s["roh"], s["ausgefallen"] = e["zustand"], e["roh"], e["ausgefallen"]
        if e["ergebnis"] == "treffer":
            s["treffer"] += 1
    for s in out.values():
        s["stufe"] = stufe(vr, s["zustand"], s["ausgefallen"])
        s["verwundete"] = vr["verwundete"].get(s["stufe"], 0)
    return out


def zug(d, st):
    """Kopfzeile: einsatzbereite Panzer (nicht ausgefallen), Zahl der Panzer, Verwundete gesamt."""
    return {"bereit": sum(1 for s in st.values() if not s["ausgefallen"]), "gesamt": len(st),
            "eingeschraenkt": sum(1 for s in st.values() if s["stufe"] == "eingeschraenkt"),
            "ausgefallen": sum(1 for s in st.values() if s["ausgefallen"]),
            "verwundete": sum(s["verwundete"] for s in st.values())}


def verw_text(n):
    return "keine Verwundeten" if n == 0 else ("1 Verwundeter" if n == 1 else f"{n} Verwundete")


def treffer_text(n):
    return "noch ohne Treffer" if n == 0 else ("1 Treffer" if n == 1 else f"{n} Treffer")


def fmt(vorlage, werte):
    """Platzhalter {name} ersetzen (unbekannte bleiben stehen), wie format() in verluste.ts."""
    out, i = [], 0
    while i < len(vorlage):
        if vorlage[i] == "{":
            j = vorlage.find("}", i)
            k = vorlage[i + 1:j] if j > 0 else ""
            if j > 0 and k.isidentifier() and k in werte:
                out.append(str(werte[k]))
                i = j + 1
                continue
        out.append(vorlage[i])
        i += 1
    return "".join(out)


def meldungen(d, ev):
    """Druckmeldungen der Kp (F2.7, je Panzer) aus der Zeitlinie: Liste dict(id, t, zug, stufe, text) – `zug` ist der Panzer.

    Sofort, ohne Abstand: ausgefallen (Stufe 3; beim letzten zulässigen Ausfall mit „hält mit Mühe“) und der Wechsel nach eingeschränkt
    (Stufe 2), ebenso der erste Treffer einer Art aus `sofort` (Attrappe). Sonst mit Abstand (abstand_alle_s seit der letzten Meldung
    der Kp, abstand_panzer_s seit der letzten dieses Panzers): ein Treffer an einem einsatzbereiten Panzer (Stufe 1), der erste
    Schuss eines neuen Schützen auf einen Panzer (Stufe 0, „Einschläge noch daneben“); ein weiterer Treffer an einem eingeschränkten
    Panzer höchstens alle abstand_limit_s (Stufe 2).

    Seit 2.6 (H3.3, H5.7):
      * erster_beschuss: Der erste Beschuss eines Panzers kommt immer als Meldung (ohne Abstand) – außer durch die Feindartillerie des
        Hintergrunds (nur_stufenwechsel).
      * nur_stufenwechsel (Feindartillerie H-01, H-04, H-12): meldet sich nur beim Wechsel nach eingeschränkt oder ausgefallen.
      * artillerie (Mörser, gelenktes Feuer, Feindartillerie, Attrappe): höchstens eine Meldung je Panzer, Schütze und Stufe und
        insgesamt höchstens eine je artillerie_abstand_s; „ausgefallen“ kommt immer.
    """
    sz, vr = d["szenario"], d["regeln"]["verluste"]
    vm = (sz.get("verluste") or {}).get("meldungen")
    if not vm:
        return []
    regel = vr["meldungen"]
    art_arten = set(regel.get("artillerie", []))
    art_abstand = regel.get("artillerie_abstand_s", 0)
    nur_wechsel = set(regel.get("nur_stufenwechsel", []))
    erster_beschuss = bool(regel.get("erster_beschuss"))
    pl = panzer(sz)
    pmap = {p["id"]: p for p in pl}
    zst = {p["id"]: {"zustand": vr["zustand_start"], "aus": False, "t": None, "treffer": 0, "arten": set(), "beschossen": False,
                     "art_schl": set()} for p in pl}
    hoechstens = vr["hoechstens_ausgefallen"]
    out = []
    t_alle = None
    t_art = None
    for e in ev:
        s = zst[e["panzer"]]
        vorher = stufe(vr, s["zustand"], s["aus"])
        s["zustand"], s["aus"] = e["zustand"], e["ausgefallen"]
        nachher = stufe(vr, s["zustand"], s["aus"])
        if e["ergebnis"] == "treffer":
            s["treffer"] += 1
        t = e["t"]
        frei_alle = t_alle is None or t - t_alle >= regel["abstand_alle_s"]
        frei_pz = s["t"] is None or t - s["t"] >= regel["abstand_panzer_s"]
        erste_art = e["ergebnis"] == "treffer" and e["art"] in regel.get("sofort", []) and e["art"] not in s["arten"]
        if e["ergebnis"] == "treffer":
            s["arten"].add(e["art"])
        erster = erster_beschuss and not s["beschossen"] and e["art"] not in nur_wechsel
        if e["art"] not in nur_wechsel:
            s["beschossen"] = True
        n_aus = sum(1 for x in zst.values() if x["aus"])
        if nachher == "ausgefallen" and vorher != "ausgefallen":
            schl, st = ("limit" if n_aus >= hoechstens else "ausgefallen"), 3
        elif nachher == "eingeschraenkt" and vorher == "einsatzbereit":
            schl, st = "eingeschraenkt", 2
        elif e["art"] in nur_wechsel:
            continue
        elif erste_art:
            schl, st = "sofort", 1 if nachher == "einsatzbereit" else 2
        elif erster:
            schl, st = ("treffer", 1) if e["ergebnis"] == "treffer" and nachher == "einsatzbereit" else \
                ("erneut", 2) if e["ergebnis"] == "treffer" else ("beschuss", 0)
        elif e["ergebnis"] == "treffer" and nachher == "einsatzbereit" and frei_alle and frei_pz:
            schl, st = "treffer", 1
        elif e["ergebnis"] == "treffer" and nachher == "eingeschraenkt" and frei_alle and (s["t"] is None or t - s["t"] >= regel["abstand_limit_s"]):
            schl, st = "erneut", 2
        elif e["k"] == 1 and e["ergebnis"] != "treffer" and frei_alle and frei_pz:
            schl, st = "beschuss", 0         # ein neuer Schütze schießt sich ein: erst daneben
        else:
            continue
        if e["art"] in art_arten:
            schl_art = (nachher, e["quelle"])
            if st < 3 and (schl_art in s["art_schl"] or (t_art is not None and t - t_art < art_abstand)):
                continue
            s["art_schl"].add(schl_art)
            t_art = t
        pz = pmap[e["panzer"]]
        bereit = sum(1 for x in zst.values() if not x["aus"])
        verw = vr["verwundete"].get(nachher, 0)
        liste = vm["schaden"].get(e["art"]) or [""]
        werte = {"pz": pz["name"], "zustand": s["zustand"], "verw": verw_text(verw), "waffe": vm["waffe"][e["art"]],
                 "ort": (" " + e["ort"]) if e["ort"] else "", "forderung": vm["forderung"][e["art"]], "bereit": bereit, "gesamt": len(pl),
                 "schaden": liste[(s["treffer"] - 1) % len(liste)] if s["treffer"] else "", "schaden_e": pz.get("schaden_eingeschraenkt", ""),
                 "zug": (sz.get("eigene_truppe") or {}).get("name", "")}
        out.append({"id": f"{vm['kennung']}{len(out) + 1:02d}", "t": t, "zug": e["panzer"], "stufe": st, "text": fmt(vm["texte"][schl], werte)})
        s["t"] = t
        t_alle = t
    return out


def fuelle(text, d, ev, t, panzer_id=None):
    """Platzhalter einer festen Lagemeldung (I-07, I-06, I-13) mit dem Stand dieses Teams zur Zeit t füllen.
    panzer_id: Panzer der Meldung oder „durchbruch“ (der Panzer, den der erste Durchbruch bis t traf)."""
    if "{" not in text:
        return text
    sz, vr = d["szenario"], d["regeln"]["verluste"]
    st = stand(d, ev, t)
    zg = zug(d, st)
    pmap = {p["id"]: p for p in panzer(sz)}
    if panzer_id == "durchbruch":
        panzer_id = next((e["panzer"] for e in ev if e["art"] == "durchbruch" and e["t"] <= t), None)
    s = st.get(panzer_id) if panzer_id else None
    werte = {"bereit": zg["bereit"], "gesamt": zg["gesamt"], "zug_verw": verw_text(zg["verwundete"]),
             "zug": (sz.get("eigene_truppe") or {}).get("name", "")}
    if s is not None:
        werte.update(pz=pmap[panzer_id]["name"], zustand=s["zustand"], verw=verw_text(s["verwundete"]), treffer=treffer_text(s["treffer"]),
                     lage=STUFE_TEXT[s["stufe"]])
    else:
        werte.update(pz="ein Panzer", zustand=vr["zustand_start"], verw=verw_text(0), treffer=treffer_text(0), lage="einsatzbereit")
    return fmt(text, werte)


def verlauf(d, ev, schritt=15):
    """Zustand der vier Panzer über die Spielzeit (Drehbuch, Auswertung): [(t, [zustand je Panzer], bereit, verwundete)]."""
    dauer = d["szenario"]["spieluhr"]["dauer_s"]
    out = []
    t = 0
    pl = panzer(d["szenario"])
    while t <= dauer:
        st = stand(d, ev, t)
        zg = zug(d, st)
        out.append((t, [st[p["id"]]["zustand"] for p in pl], zg["bereit"], zg["verwundete"]))
        t += schritt
    return out
