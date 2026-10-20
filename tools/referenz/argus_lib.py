"""Gemeinsame Funktionen für das Planspiel ARGUS: Laden der Daten, Geometrie, Regelprüfung.

Reines Python (keine Abhängigkeiten), damit Validator, Drehbuch-Generator und später die
Engine dieselbe Logik nutzen können. Koordinaten in Metern, x Ost, y Süd.

Auszug aus dem Projekt (claude/tools/argus_lib.py, ohne speichere/glatt/linie). Im Repo dient sie als Referenz für die
TypeScript-Portierung in src/kern/geometrie.ts und src/kern/regeln.ts (Vergleichstest).
DATEN zeigt hier auf public/daten.
"""
import json
import math
import os

DATEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "daten")


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


# ----------------------------------------------------------------------------- Position zur Zeit t
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


def ab_s(obj, eltern=None):
    """Ab wann ein Objekt im Raum ist: ab_s, sonst Routenbeginn, sonst wie das Elternobjekt, sonst 0."""
    if obj.get("ab_s") is not None:
        return obj["ab_s"]
    r = (obj.get("bewegung") or {}).get("route")
    if r:
        return r[0][0]
    return ab_s(eltern) if eltern is not None else 0


def vorhanden(obj, t_s, eltern=None):
    return ab_s(obj, eltern) <= t_s < obj.get("bis_s", 10 ** 9)


# ----------------------------------------------------------------------------- Regelprüfung
def pruefe_wirkmittel(d, ziel_pos, wm_id, t_s=0, ausgenommen=()):
    """Prüft ein Wirkmittel gegen die Einsatzregeln an einer Zielposition.

    Liefert (zulaessig: bool, verstoesse: [str], getroffen: [ziel-ids]).
    Geprüft werden nur Regeln, die die Karte kennt (Zonen, eigene Kräfte, Einsatzbereich,
    Personen in der Nähe). Ob das Ziel selbst geschützt ist, prüft der Mensch.
    """
    sz, regeln = d["szenario"], d["regeln"]
    wm = d["wirkmittel"][wm_id]
    r = wm["wirkradius_m"]
    v = []
    for z in sz["zonen"]:
        a = abstand_zone(ziel_pos, z)
        if z["typ"] == "no_strike" and a < r:
            v.append(f"{z['id']} im Wirkradius ({a:.0f} m)")
        if z["typ"] == "einschraenkung" and a < r and r > z["max_wirkradius_m"]:
            v.append(f"{z['id']}: Wirkradius > {z['max_wirkradius_m']} m ({a:.0f} m)")
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
    for z in sz["ziele"]:
        if z["id"] in ausgenommen:
            continue
        if vorhanden(z, t_s) and dist(ziel_pos, position(z, t_s)) <= r:
            getroffen.append((z["id"], "Fahrzeug" if z["gt"]["kategorie"] != "attrappe" else "Attrappe", z["gt"]["kategorie"]))
        for p in z.get("personen", []) or []:
            if vorhanden(p, t_s, z) and dist(ziel_pos, position(p, t_s)) <= r:
                getroffen.append((z["id"], f"{p['anzahl']} {PERSONEN_TEXT.get(p['art'], p['art'])}", p["art"]))
    return (not v, v, getroffen)


PERSONEN_TEXT = {"zivil": "Zivilpersonen", "soldat": "Soldaten", "besatzung_ergibt_sich": "Besatzung (ergibt sich)"}
GT_TEXT = {"feind": "Feind", "verbuendet": "verbündet", "zivil": "zivil", "geschuetzt": "geschützt",
           "attrappe": "Attrappe", "ausser_gefecht": "außer Gefecht", "soldat": "Feind", "besatzung_ergibt_sich": "außer Gefecht"}
SCHUTZ = ("zivil", "geschuetzt", "verbuendet", "besatzung_ergibt_sich", "ausser_gefecht")


def zahl(x, nach=1):
    return f"{x:.{nach}f}".replace(".", ",")


def argus_empfehlung(konfidenz, regeln):
    s = regeln["argus"]["schwellen"]
    if konfidenz >= s["bekaempfen"]:
        return "BEKÄMPFEN"
    if konfidenz >= s["pruefen"]:
        return "PRÜFEN"
    return "UNKLAR"
