"""Gemeinsame Funktionen für das Planspiel ARGUS: Laden der Daten, Geometrie, Regelprüfung.

Reines Python (keine Abhängigkeiten), damit Validator, Drehbuch-Generator und später die
Engine dieselbe Logik nutzen können. Koordinaten in Metern, x Ost, y Süd. Winkel (hdg) in Grad,
0 = Osten, im Uhrzeigersinn (90 = Süden).

Seit Szenario 2.0: Trefferregel nach der Lage beim Einschlag (einschlag, wirkung), Bewegung
(geschwindigkeit, richtung) und Verstärkungen mit relativer Zeit (verstaerkung_ziel).
"""
import json
import math
import os

# Projekt PolBil: claude/tools/argus_lib.py → claude/daten; Repository: tools/referenz/argus_lib.py → public/daten
_HIER = os.path.dirname(os.path.abspath(__file__))
_ORTE = [os.path.join(_HIER, "..", "daten"), os.path.join(_HIER, "..", "..", "public", "daten")]
DATEN = next((p for p in _ORTE if os.path.isdir(p)), _ORTE[0])


# ----------------------------------------------------------------------------- Laden
def lade(name, ordner=DATEN):
    with open(os.path.join(ordner, name), encoding="utf-8") as f:
        return json.load(f)


def lade_alles(szenario="szenario_kraehe_01.json", ordner=DATEN):
    sz = lade(szenario, ordner)
    k = sz["kataloge"]
    return {
        "szenario": sz,
        "karte": lade(k["karte"], ordner),
        "fahrzeuge": {f["id"]: f for f in lade(k["fahrzeuge"], ordner)["fahrzeuge"]},
        "wirkmittel": {w["id"]: w for w in lade(k["wirkmittel"], ordner)["wirkmittel"]},
        "regeln": lade(k["regeln"], ordner),
    }


def speichere(obj, pfad, breite=120):
    """JSON kompakt schreiben: kurze Listen/Objekte auf einer Zeile, sonst eingerückt (2 Leerzeichen je Ebene)."""
    def f(o, ind, praefix):
        flach = json.dumps(o, ensure_ascii=False)
        if ind + praefix + len(flach) <= breite or not isinstance(o, (dict, list)) or not o:
            return flach
        pad = " " * (ind + 2)
        if isinstance(o, dict):
            teile = []
            for k, v in o.items():
                kk = json.dumps(k, ensure_ascii=False) + ": "
                teile.append(pad + kk + f(v, ind + 2, len(kk)))
            return "{\n" + ",\n".join(teile) + "\n" + " " * ind + "}"
        if all(isinstance(v, (int, float)) or (isinstance(v, list) and all(isinstance(x, (int, float)) for x in v)) for v in o):
            zeilen, z = [], ""
            for v in o:
                t = json.dumps(v)
                if z and len(pad) + len(z) + len(t) + 2 > breite:
                    zeilen.append(z.rstrip())
                    z = ""
                z += t + ", "
            zeilen.append(z.rstrip(", "))
            zeilen = [q.rstrip(",") for q in zeilen]
            return "[\n" + ",\n".join(pad + q for q in zeilen) + "\n" + " " * ind + "]"
        return "[\n" + ",\n".join(pad + f(v, ind + 2, 0) for v in o) + "\n" + " " * ind + "]"
    with open(pfad, "w", encoding="utf-8") as fh:
        fh.write(f(obj, 0, 0) + "\n")


# ----------------------------------------------------------------------------- Zeit / Raster
def mmss(t_s):
    t_s = int(round(t_s))
    return f"{t_s // 60:02d}:{t_s % 60:02d}"


def uhrzeit(start, t_s):
    h, m, s = (int(v) for v in start.split(":"))
    tot = h * 3600 + m * 60 + s + int(round(t_s))
    return f"{tot // 3600 % 24:02d}:{tot // 60 % 60:02d}:{tot % 60:02d}"


def pq(p, karte):
    r = karte["raster"]
    sp = r["spalten"]
    z = r["zelle_m"]
    i = min(max(int(p[0] // z), 0), len(sp) - 1)
    j = int(p[1] // z) + r.get("zeilen_ab", 1)
    return f"{sp[i]}{j}"


# ----------------------------------------------------------------------------- Kurven
def glatt(pts, n=12):
    """Catmull-Rom wie im Gelände-Generator."""
    p = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2
                       + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3) for d in (0, 1)))
    out.append(tuple(p[-2]))
    return out


def linie(karte, lid):
    for l in karte["linien"]:
        if l["id"] == lid:
            return glatt(l["punkte"]) if l.get("glatt") else [tuple(q) for q in l["punkte"]]
    raise KeyError(lid)


# ----------------------------------------------------------------------------- Geometrie
def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def dist_segment(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return dist(p, a)
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))


def dist_polylinie(p, pts):
    return min(dist_segment(p, a, b) for a, b in zip(pts, pts[1:]))


def im_polygon(p, poly):
    x, y = p
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xs = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xs:
                inside = not inside
    return inside


def abstand_polygon(p, poly):
    """0, wenn innen; sonst kürzester Abstand zum Rand."""
    if im_polygon(p, poly):
        return 0.0
    return min(dist_segment(p, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))


def abstand_zone(p, zone):
    g = zone["geometrie"]
    if g["typ"] == "polygon":
        return abstand_polygon(p, g["punkte"])
    if g["typ"] == "polygone":
        return min(abstand_polygon(p, q) for q in g["teile"])
    if g["typ"] == "kreis":
        return max(0.0, dist(p, g["mitte"]) - g["radius_m"])
    raise ValueError(g["typ"])


def in_zone(p, zone):
    return abstand_zone(p, zone) == 0.0


def zonen_name(zone):
    """Sichtbarer Name einer Zone (seit 2.1: „Schule“, „Ortschaft“); die ID (NS-01, EZ-01) bleibt intern."""
    return zone.get("kurz") or zone["id"]


# ----------------------------------------------------------------------------- Position und Bewegung zur Zeit t
def position(ziel, t_s):
    """Position eines Ziels zur Spielzeit t (lineare Interpolation entlang der Route)."""
    r = (ziel.get("bewegung") or {}).get("route")
    if not r:
        return tuple(ziel["pos"])
    if t_s <= r[0][0]:
        return (r[0][1], r[0][2])
    for (t0, x0, y0), (t1, x1, y1) in zip(r, r[1:]):
        if t0 <= t_s <= t1:
            f = (t_s - t0) / (t1 - t0) if t1 > t0 else 0
            return (x0 + f * (x1 - x0), y0 + f * (y1 - y0))
    return (r[-1][1], r[-1][2])


def abschnitt(ziel, t_s):
    """Routenabschnitt ((t0,x0,y0),(t1,x1,y1)), in dem t liegt; None ohne Route oder außerhalb."""
    r = (ziel.get("bewegung") or {}).get("route")
    if not r or len(r) < 2 or t_s < r[0][0] or t_s >= r[-1][0]:
        return None
    for a, b in zip(r, r[1:]):
        if a[0] <= t_s < b[0]:
            return a, b
    return None


def geschwindigkeit(ziel, t_s):
    """Geschwindigkeit in m/s zur Zeit t (0, wenn das Ziel steht)."""
    s = abschnitt(ziel, t_s)
    if not s:
        return 0.0
    (t0, x0, y0), (t1, x1, y1) = s
    return math.hypot(x1 - x0, y1 - y0) / (t1 - t0) if t1 > t0 else 0.0


def richtung(ziel, t_s):
    """Fahrtrichtung in Grad (0 = Osten, 90 = Süden); None, wenn das Ziel steht."""
    s = abschnitt(ziel, t_s)
    if not s:
        return None
    (_, x0, y0), (_, x1, y1) = s
    if abs(x1 - x0) + abs(y1 - y0) < 1e-6:
        return None
    return math.degrees(math.atan2(y1 - y0, x1 - x0))


def stand_seit(ziel, t_s):
    """Wie lange das Ziel zur Zeit t schon steht (s); 0, wenn es fährt."""
    r = (ziel.get("bewegung") or {}).get("route")
    if geschwindigkeit(ziel, t_s) > 0.3:
        return 0.0
    if not r:
        return t_s - ab_s(ziel)
    p = position(ziel, t_s)
    t_an = r[0][0]
    for t, x, y in r:
        if t > t_s:
            break
        if dist((x, y), p) > 0.5:
            t_an = None
        elif t_an is None:
            t_an = t
    return t_s - (t_an if t_an is not None else r[0][0])


HIMMEL = [(0, "Ost"), (45, "Südost"), (90, "Süd"), (135, "Südwest"), (180, "West"), (-180, "West"), (-135, "Nordwest"),
          (-90, "Nord"), (-45, "Nordost")]


def himmelsrichtung(grad):
    return min(HIMMEL, key=lambda h: abs(((grad - h[0]) + 180) % 360 - 180))[1]


def winkel_diff(a, b):
    return abs(((a - b) + 180) % 360 - 180)


def gt_bei(ziel, t_s):
    """Ground Truth eines Ziels zur Zeit t. Ein Ziel kann seinen Zustand im Gefecht wechseln: gt gilt ab gt.ab_s,
    davor gt.vorher (z. B. Z-24: Feind, bis die eigene Panzerabwehr ihn um 10:19:30 außer Gefecht setzt)."""
    gt = ziel["gt"]
    if gt.get("vorher") and t_s < gt.get("ab_s", 0):
        return gt["vorher"]
    return gt


def ab_s(obj, eltern=None):
    """Ab wann ein Objekt im Raum ist: ab_s, sonst Routenbeginn, sonst wie das Elternobjekt, sonst 0."""
    if obj.get("ab_s") is not None:
        return obj["ab_s"]
    r = (obj.get("bewegung") or {}).get("route")
    if r:
        return r[0][0]
    return ab_s(eltern) if eltern is not None else 0


def vorhanden(obj, t_s, eltern=None):
    """Personen erben nur den Beginn vom Fahrzeug; ein Ende (bis_s) tragen sie selbst (wie src/kern/geometrie.ts)."""
    return ab_s(obj, eltern) <= t_s < obj.get("bis_s", 10 ** 9)


# ----------------------------------------------------------------------------- Regelprüfung
PERSONEN_TEXT = {"zivil": "Zivilpersonen", "soldat": "Soldaten", "besatzung_ergibt_sich": "Besatzung (ergibt sich)",
                 "sanitaet": "Sanitätspersonal"}
GT_TEXT = {"feind": "Feind", "verbuendet": "verbündet", "zivil": "zivil", "geschuetzt": "geschützt",
           "attrappe": "Attrappe", "ausser_gefecht": "außer Gefecht", "soldat": "Feind", "besatzung_ergibt_sich": "außer Gefecht",
           "sanitaet": "geschützt"}
SCHUTZ = ("zivil", "geschuetzt", "verbuendet", "besatzung_ergibt_sich", "ausser_gefecht", "sanitaet")


def pruefe_wirkmittel(d, ziel_pos, wm_id, t_s=0, ausgenommen=(), zerstoert=None):
    """Prüft ein Wirkmittel gegen die Einsatzregeln an einer Position und ermittelt, was dort zur Zeit t
    im Wirkradius liegt.

    Liefert (zulaessig: bool, verstoesse: [str], getroffen: [(ziel-id, was, kategorie)]).
    Geprüft werden nur Regeln, die die Karte kennt (Zonen, eigene Kräfte, Einsatzbereich,
    Personen in der Nähe). Ob das Ziel selbst geschützt ist, prüft der Mensch.
    zerstoert: optional {ziel-id: Zeitpunkt der Zerstörung}; zerstörte Fahrzeuge zählen nicht mehr.
    Die Trefferregel (Lage beim Einschlag) baut darauf auf: siehe wirkung().
    """
    sz, regeln = d["szenario"], d["regeln"]
    wm = d["wirkmittel"][wm_id]
    r = wm["wirkradius_m"]
    v = []
    for z in sz["zonen"]:
        a = abstand_zone(ziel_pos, z)
        name = zonen_name(z)
        if z["typ"] == "no_strike" and a < r:
            v.append(f"{name} im Wirkradius ({a:.0f} m)")
        if z["typ"] == "einschraenkung" and a < r and r > z["max_wirkradius_m"]:
            v.append(f"{name}: Wirkradius > {z['max_wirkradius_m']} m ({a:.0f} m)")
    sab = regeln["einsatzregeln"].get("sicherheitsabstand_eigene_kraefte_m")
    for k in sz["kraefte"]:
        if sab is None or k["zugehoerigkeit"] != "eigen" or k.get("ausserhalb"):
            continue
        a = dist(ziel_pos, k["pos"])
        if a < r + sab:
            v.append(f"eigene Kräfte {k['kurz']} zu nah ({a:.0f} m < {r + sab:.0f} m)")
    b = wm.get("einsatzbereich") or {}
    if "x_max" in b and ziel_pos[0] >= b["x_max"]:
        v.append(f"außerhalb Einsatzbereich ({b['text']})")
    getroffen = []
    zerstoert = zerstoert or {}
    for z in alle_ziele(sz):
        if z["id"] in ausgenommen:
            continue
        if vorhanden(z, t_s) and zerstoert.get(z["id"], 1e9) > t_s and dist(ziel_pos, position(z, t_s)) <= r:
            kat = gt_bei(z, t_s)["kategorie"]
            getroffen.append((z["id"], "Fahrzeug" if kat != "attrappe" else "Attrappe", kat))
        for p in z.get("personen", []) or []:
            if vorhanden(p, t_s, z) and dist(ziel_pos, position(p, t_s)) <= r:
                getroffen.append((z["id"], f"{p['anzahl']} {PERSONEN_TEXT.get(p['art'], p['art'])}", p["art"]))
    return (not v, v, getroffen)


def alle_ziele(sz):
    """Ziele des Szenarios. Verstärkungen sind nur enthalten, wenn sie eingespielt wurden (siehe verstaerkung_ziel)."""
    return sz["ziele"] + sz.get("_eingespielt", [])


# ----------------------------------------------------------------------------- Trefferregel (Lage beim Einschlag)
def flugzeit(wm, ziel_pos):
    """Zeit von der Freigabe bis zum Einschlag in s. Mit `flug` (LM): Startvorbereitung + Strecke ab Startpunkt / Geschwindigkeit."""
    fl = wm.get("flug")
    if fl:
        return fl.get("vorbereitung_s", 0) + dist(fl["start"], ziel_pos) / fl["geschwindigkeit_mps"]
    return wm["vorlauf_s"]


def einschlag(d, ziele_ids, wm_id, t_freigabe, zerstoert=None):
    """Einschlagzeit und -ort einer Wirkung (Trefferregel ab 2.0).

    Die Wirkung gilt dem ersten Fahrzeug der Meldung, das bei der Freigabe noch im Raum und nicht zerstört ist
    (bei Zugmeldungen das Führungsfahrzeug). Sie schlägt am Ort dieses Fahrzeugs zum Einschlagzeitpunkt ein;
    die Flugzeit hängt beim LM von diesem Ort ab (Fixpunkt-Iteration).
    Liefert (t_einschlag, pos, ziel-id).
    """
    zmap = {z["id"]: z for z in alle_ziele(d["szenario"])}
    zerstoert = zerstoert or {}
    kand = [zmap[z] for z in ziele_ids if vorhanden(zmap[z], t_freigabe) and zerstoert.get(z, 1e9) > t_freigabe]
    haupt = kand[0] if kand else zmap[ziele_ids[0]]
    wm = d["wirkmittel"][wm_id]
    t_e = t_freigabe + flugzeit(wm, position(haupt, t_freigabe))
    for _ in range(4):
        t_e = t_freigabe + flugzeit(wm, position(haupt, t_e))
    return t_e, position(haupt, t_e), haupt["id"]


def wirkung(d, ziele_ids, wm_id, t_freigabe, zerstoert=None):
    """Trefferregel ab 2.0: Getroffen ist alles im Wirkradius um den Einschlagort nach der Lage beim Einschlag,
    dazu das bekämpfte Fahrzeug selbst, wenn es dann noch im Raum ist. Verstöße (R2, R3, Einsatzbereich) gelten am
    Einschlagort. Liefert dict(t, pos, ziel, zulaessig, verstoesse, getroffen)."""
    t_e, pos, zid = einschlag(d, ziele_ids, wm_id, t_freigabe, zerstoert)
    ok, verst, getr = pruefe_wirkmittel(d, pos, wm_id, t_s=t_e, zerstoert=zerstoert)
    z0 = next(z for z in alle_ziele(d["szenario"]) if z["id"] == zid)
    if vorhanden(z0, t_e) and (zerstoert or {}).get(zid, 1e9) > t_e \
            and not any(g[0] == zid and g[1] in ("Fahrzeug", "Attrappe") for g in getr):
        kat = gt_bei(z0, t_e)["kategorie"]
        getr.append((zid, "Fahrzeug" if kat != "attrappe" else "Attrappe", kat))
    return {"t": t_e, "pos": pos, "ziel": zid, "zulaessig": ok, "verstoesse": verst, "getroffen": getr}


# ----------------------------------------------------------------------------- Verstärkungen
def verstaerkung_ziel(z, t0):
    """Ziel einer Verstärkung mit absoluter Zeit: Route und ab_s/bis_s um den Einspielzeitpunkt t0 verschoben."""
    neu = json.loads(json.dumps(z))
    r = (neu.get("bewegung") or {}).get("route")
    if r:
        neu["bewegung"]["route"] = [[t + t0, x, y] for t, x, y in r]
    for k in ("ab_s", "bis_s"):
        if neu.get(k) is not None:
            neu[k] += t0
    for p in neu.get("personen", []) or []:
        for k in ("ab_s", "bis_s"):
            if p.get(k) is not None:
                p[k] += t0
    for f in neu.get("feuert", []) or []:      # Schussrhythmus (seit 2.1)
        f["von_s"] += t0
        f["bis_s"] += t0
    if "ab_s" not in neu and not r:
        neu["ab_s"] = t0
    return neu


def zahl(x, nach=1):
    return f"{x:.{nach}f}".replace(".", ",")


def argus_empfehlung(konfidenz, regeln):
    s = regeln["argus"]["schwellen"]
    if konfidenz >= s["bekaempfen"]:
        return "BEKÄMPFEN"
    if konfidenz >= s["pruefen"]:
        return "PRÜFEN"
    return "UNKLAR"


# ----------------------------------------------------------------------------- Sensortext ↔ Route
import re as _re

_RICHTUNG = {"Ost": 0, "Südost": 45, "Süd": 90, "Südwest": 135, "West": 180, "Nordwest": -135, "Nord": -90, "Nordost": -45}


def lies_bewegung(text):
    """Zerlegt den Sensortext `bewegung`: dict(steht, kmh, richtung, seit_s) – fehlende Angaben None."""
    t = text or ""
    out = {"steht": None, "kmh": None, "richtung": None, "seit_s": None}
    if _re.search(r"\b(keine|steht|stehen)\b", t):
        out["steht"] = True
        m = _re.search(r"seit (\d+) (s|min)\b", t)
        if m:
            out["seit_s"] = int(m.group(1)) * (60 if m.group(2) == "min" else 1)
    m = _re.search(r"nach (Nordost|Nordwest|Südost|Südwest|Nord|Süd|Ost|West)\b", t)
    if m:
        out["richtung"] = _RICHTUNG[m.group(1)]
        out["steht"] = False if out["steht"] is None else out["steht"]
    m = _re.search(r"ca\. (\d+) km/h", t)
    if m:
        out["kmh"] = int(m.group(1))
        out["steht"] = False
    return out


def pruefe_bewegungstext(ziel, t_s, text):
    """Passt der Sensortext zur Route? Liefert eine Liste von Abweichungen (leer = passt)."""
    b = lies_bewegung(text)
    v = geschwindigkeit(ziel, t_s) * 3.6
    r = richtung(ziel, t_s)
    fehler = []
    if b["steht"] is True and v > 1.0:
        fehler.append(f"Text sagt steht, Route fährt {v:.0f} km/h")
    if b["steht"] is False and v < 1.0:
        fehler.append(f"Text sagt fährt, Route steht")
    if b["kmh"] is not None and v >= 1.0 and abs(v - b["kmh"]) > max(3.0, 0.25 * b["kmh"]):
        fehler.append(f"Text {b['kmh']} km/h, Route {v:.1f} km/h")
    if b["richtung"] is not None and r is not None and winkel_diff(r, b["richtung"]) > 50:
        fehler.append(f"Text nach {himmelsrichtung(b['richtung'])}, Route {r:.0f}° ({himmelsrichtung(r)})")
    if b["seit_s"] is not None and v < 1.0:
        s = stand_seit(ziel, t_s)
        if abs(s - b["seit_s"]) > max(15, 0.3 * b["seit_s"]):
            fehler.append(f"Text steht seit {b['seit_s']} s, Route seit {s:.0f} s")
    return fehler


def pruefe_waermetext(ziele, t_s, text):
    """Passt der Wärmetext (z. B. „heiß (3 Fahrzeuge, fahren)“) zur Route? „fährt/fahren“ verlangt, dass jedes genannte
    Fahrzeug fährt; „steht/Leerlauf/Motoren laufen“ ist mit Fahrt unvereinbar, wenn alle fahren."""
    t = text or ""
    fahrend = [geschwindigkeit(z, t_s) * 3.6 >= 1.0 for z in ziele]
    fehler = []
    if _re.search(r"\bfahr(t|en)\b|fährt", t) and not all(fahrend):
        fehler.append(f"Wärmetext sagt fährt, aber {sum(1 for f in fahrend if not f)} von {len(ziele)} Fahrzeugen stehen")
    if _re.search(r"Leerlauf|steht|stehen", t) and all(fahrend):
        fehler.append("Wärmetext sagt steht, aber alle Fahrzeuge fahren")
    m = _re.search(r"\((\d+) Fahrzeuge", t)
    if m and int(m.group(1)) != len(ziele):
        fehler.append(f"Wärmetext nennt {m.group(1)} Fahrzeuge, Meldung hat {len(ziele)}")
    return fehler


# ----------------------------------------------------------------------------- Verstärkungen: Konflikte je Einspielzeit
def geschuetzte_objekte(sz, t_s):
    """Positionen geschützter Objekte und Fehlziele zur Zeit t (Fahrzeuge nach Ground Truth, Personen nach Art)."""
    out = []
    for z in sz["ziele"]:
        kat = gt_bei(z, t_s)["kategorie"]
        if (kat in SCHUTZ or kat == "attrappe") and vorhanden(z, t_s):
            out.append((z["id"], kat, position(z, t_s)))
        for p in z.get("personen", []) or []:
            if p["art"] in SCHUTZ and vorhanden(p, t_s, z):
                out.append((z["id"], p["art"], position(p, t_s)))
    return out


def verstaerkung_konflikte(sz, gruppe, abstand_m=100, schritt=15):
    """Einspielzeiten t0 (Raster schritt), zu denen ein Fahrzeug der Verstärkung einem geschützten Objekt näher als abstand_m kommt.
    Liefert die zusammengefassten Zeitfenster [[von, bis], ...] und Beispiele."""
    dauer = sz["spieluhr"]["dauer_s"]
    schlecht, beispiele = [], {}
    db = gruppe.get("durchbruch")
    for t0 in range(0, dauer, schritt):
        varianten = [verstaerkung_ziel(zv, t0) for zv in gruppe["ziele"]]
        if db:      # Durchbruch, wenn die Gruppe nicht aufgehalten wird: die Prüfung nimmt beide Wege mit
            varianten += [durchbruch_ziel(verstaerkung_ziel(zv, t0), [[t + t0, x, y] for t, x, y in db["routen"][zv["id"]]])
                          for zv in gruppe["ziele"] if zv["id"] in db["routen"]]
        for z in varianten:
            r = (z.get("bewegung") or {}).get("route")
            ende = min(dauer, (r[-1][0] if r else t0 + gruppe.get("dauer_s", 300)))
            for t in range(int(ab_s(z)), int(ende) + 1, 5):
                if not vorhanden(z, t):
                    continue
                p = position(z, t)
                for oid, kat, q in geschuetzte_objekte(sz, t):
                    if dist(p, q) < abstand_m:
                        schlecht.append(t0)
                        beispiele.setdefault(t0, f"{z['id']} {dist(p, q):.0f} m an {oid} ({kat}) um {mmss(t)}")
                        break
                else:
                    continue
                break
    fenster = []
    for t0 in sorted(set(schlecht)):
        if fenster and t0 - fenster[-1][1] <= max(schritt, 60):      # Lücken bis 60 s zusammenfassen (für die Spielleitung lesbar)
            fenster[-1][1] = t0
        else:
            fenster.append([t0, t0])
    return fenster, beispiele


# ----------------------------------------------------------------------------- Durchbruch (seit 2.1)
def durchbruch_ziel(z, route_db):
    """Ziel mit Durchbruch: Standardroute bis zum Beginn der Durchbruch-Route, danach diese; bis_s = Ausfahrt am Westrand."""
    neu = json.loads(json.dumps(z))
    t_s = route_db[0][0]
    alt = (neu.get("bewegung") or {}).get("route") or [[ab_s(neu), neu["pos"][0], neu["pos"][1]]]
    neu["bewegung"] = {"route": [list(p) for p in alt if p[0] < t_s] + [list(p) for p in route_db]}
    neu["bis_s"] = route_db[-1][0]
    return neu


def durchbruch_gruppen(sz, einspielen=None):
    """Durchbruch-Gruppen mit absoluten Zeiten: aus dem Szenario und aus eingespielten Verstärkungen ({gruppe: t0})."""
    out = [dict(g) for g in (sz.get("durchbruch") or {}).get("gruppen", [])]
    for g in (sz.get("verstaerkungen") or {}).get("gruppen", []):
        db = g.get("durchbruch")
        if not db or not einspielen or g["id"] not in einspielen:
            continue
        t0 = einspielen[g["id"]]
        out.append({"id": g["id"], "name": g["name"], "ziele": [z["id"] for z in g["ziele"]], "t_s": db["t_s"] + t0, "ueber": db["ueber"],
                    "routen": {k: [[t + t0, x, y] for t, x, y in r] for k, r in db["routen"].items()},
                    "ueber_s": {k: v + t0 for k, v in db["ueber_s"].items()}, "verstaerkung": True})
    return out


def durchbruch_stand(gruppe, zmap, zerstoert, ausser_gefecht=None):
    """Bricht die Gruppe zu ihrem Zeitpunkt t_s durch? (durch, grund). Aufgehalten, wenn bis t_s ein Fahrzeug zerstört oder
    außer Gefecht ist; nichts zu tun, wenn keines mehr im Raum ist."""
    t = gruppe["t_s"]
    ag = ausser_gefecht or {}
    for x in gruppe["ziele"]:
        if zerstoert.get(x, 1e9) <= t:
            return False, f"{x} zerstört"
        if ag.get(x, 1e9) <= t:
            return False, f"{x} außer Gefecht"
    if not any(x in zmap and vorhanden(zmap[x], t) for x in gruppe["ziele"]):
        return False, "nicht mehr im Raum"
    return True, None


def mit_durchbruch(sz, gruppen):
    """Kopie des Szenarios, in der die Fahrzeuge der durchgebrochenen Gruppen ihren Durchbruch fahren."""
    neu = dict(sz)
    routen = {}
    for g in gruppen:
        routen.update(g["routen"])
    neu["ziele"] = [durchbruch_ziel(z, routen[z["id"]]) if z["id"] in routen else z for z in sz["ziele"]]
    if sz.get("_eingespielt"):
        neu["_eingespielt"] = [durchbruch_ziel(z, routen[z["id"]]) if z["id"] in routen else z for z in sz["_eingespielt"]]
    return neu


# ----------------------------------------------------------------------------- Feuer (seit 2.1)
def schuesse(ziel):
    """Schusszeitpunkte eines feuernden Fahrzeugs (ziele[].feuert): Feuerstöße mit `salve` Schuss im Abstand takt_s, dann pause_s.
    Liefert [(t, nr)], nr = laufende Nummer (bei Mörsern wechseln die Rohre)."""
    out = []
    for f in ziel.get("feuert") or []:
        t = f["von_s"]
        k = 0
        while t < f["bis_s"]:
            for i in range(f.get("salve", 1)):
                ts = t + i * f["takt_s"]
                if ts < f["bis_s"]:
                    out.append((round(ts, 2), k))
                    k += 1
            t += f.get("salve", 1) * f["takt_s"] + f.get("pause_s", 0)
    return out
