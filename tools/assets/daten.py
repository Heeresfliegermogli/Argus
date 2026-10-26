"""Daten und Geometrie für den Asset-Generator.

Lädt Szenario, Karte und Kataloge aus public/daten (oder einem anderen Ordner) und stellt die
Hilfen bereit, die alle Teile des Generators brauchen: Position und Fahrtrichtung zur Zeit t,
Sichtbarkeit, Kurven, Uhrzeit. Positions- und Sichtbarkeitslogik kommt aus argus_lib.py
(tools/referenz), damit Bilder, Engine und Python-Werkzeuge dieselbe Lage zeigen.

Koordinaten in Metern, x nach Osten, y nach Süden. Fahrtrichtung (hdg) in Grad, 0 = Osten,
im Uhrzeigersinn (90 = Süden), wie in szenario_kraehe_01.json.
"""
import math
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HIER, "..", ".."))
# Repository: tools/assets + tools/referenz/argus_lib.py + public/daten
# Projekt PolBil: claude/tools/assets + claude/tools/argus_lib.py + claude/daten
sys.path.insert(0, os.path.join(REPO, "tools"))
sys.path.insert(0, os.path.join(REPO, "tools", "referenz"))

import argus_lib as L  # noqa: E402

_REPO_DATEN = os.path.join(REPO, "public", "daten")
DATEN = _REPO_DATEN if os.path.isdir(_REPO_DATEN) else os.path.join(REPO, "daten")
ASSETS = os.path.join(REPO, "public", "assets") if os.path.isdir(_REPO_DATEN) else os.path.join(REPO, "assets")


class Daten:
    """Alle Inhalte eines Szenarios mit Nachschlage-Tabellen."""

    def __init__(self, ordner=DATEN, szenario="szenario_kraehe_01.json"):
        d = L.lade_alles(szenario, ordner)
        self.ordner = ordner
        self.szenario = d["szenario"]
        self.karte = d["karte"]
        self.fahrzeuge = d["fahrzeuge"]
        self.wirkmittel = d["wirkmittel"]
        self.regeln = d["regeln"]
        self.katalog_personen = {p["id"]: p for p in L.lade(self.szenario["kataloge"]["fahrzeuge"], ordner)["personen"]}
        self.ziele = {z["id"]: z for z in self.szenario["ziele"]}
        self.meldungen = {m["id"]: m for m in self.szenario["meldungen"]}
        self.start = self.szenario["spieluhr"]["start"]
        # Hintergrundgefecht (Schritt 2b): eigene PzAbw zerstört Ziele bzw. setzt sie außer Gefecht
        self.hintergrund = (self.szenario.get("hintergrund") or {}).get("ereignisse") or []
        # Verstärkungen V-1 … V-5: Zeiten relativ zum Einspielen (t0 = 0)
        self.verstaerkungen = (self.szenario.get("verstaerkungen") or {}).get("gruppen") or []
        self.v_ziele = {z["id"]: z for g in self.verstaerkungen for z in g["ziele"]}
        self.v_gruppe = {z["id"]: g["id"] for g in self.verstaerkungen for z in g["ziele"]}
        self.alle_ziele = {**self.ziele, **self.v_ziele}
        self.schaden = self._schaden_aus_hintergrund()

    # ------------------------------------------------------------------ Karte
    @property
    def breite_m(self):
        return self.karte["ausdehnung_m"]["breite"]

    @property
    def hoehe_m(self):
        return self.karte["ausdehnung_m"]["hoehe"]

    def linien(self, art=None):
        for l in self.karte["linien"]:
            if art is None or l["art"] == art:
                yield l, linie_punkte(l)

    def flaechen(self, art):
        return [f for f in self.karte["flaechen"] if f["art"] == art]

    def gebaeude(self, art=None):
        return [g for g in self.karte["gebaeude"] if art is None or g["art"] == art]

    def uhr(self, t_s):
        return L.uhrzeit(self.start, t_s)

    def pq(self, p):
        return L.pq(p, self.karte)

    # ------------------------------------------------------------------ Objekte
    def groesse(self, ziel):
        return self.fahrzeuge[ziel["typ"]]["groesse_m"]

    def alle_routen(self):
        """(Name, Ziel, Route) aller Fahrten, die in der Live-Lage vorkommen können: Szenario, Verstärkungen und seit
        Szenario 2.1 die Durchbruch-Routen (szenario.durchbruch, verstaerkungen[].durchbruch). Kein Haus darf darauf stehen."""
        out = []
        for z in list(self.szenario["ziele"]) + list(self.v_ziele.values()):
            r = (z.get("bewegung") or {}).get("route")
            if r:
                out.append((z["id"], z, r))
        gruppen = list((self.szenario.get("durchbruch") or {}).get("gruppen", []))
        gruppen += [g["durchbruch"] for g in self.verstaerkungen if g.get("durchbruch")]
        for g in gruppen:
            for zid, r in g["routen"].items():
                out.append((f"{zid} (Durchbruch)", self.alle_ziele[zid], r))
        return out

    def meldepositionen(self):
        """(Ziel, Position, Meldung) für jedes gemeldete Ziel zur Meldezeit."""
        for m in self.szenario["meldungen"]:
            for zid in m["ziele"]:
                z = self.ziele[zid]
                yield z, position(z, m["t_s"]), m

    # ------------------------------------------------------------------ Lage im Gefecht
    def _schaden_aus_hintergrund(self):
        """{Ziel-ID: (t_s, folge)} aus szenario.hintergrund (art = panzerabwehr).

        Wie die Engine (anforderungen_technik „6b/7 Live-Lage“): Eine Wirkung der eigenen PzAbw trifft
        nur, wenn das Ziel dann noch im Raum steht, und nur bis zum Bach (einsatzbereich.x_max der PzAbw).
        Spätere Ereignisse ändern ein zerstörtes Ziel nicht mehr."""
        x_max = None
        for w in self.wirkmittel.values():
            if (w.get("einsatzbereich") or {}).get("x_max") is not None and w["effekt"] == "treffer_direkt":
                x_max = w["einsatzbereich"]["x_max"]
        out = {}
        for e in sorted(self.hintergrund, key=lambda e: e["t_s"]):
            zid = e.get("ziel")
            if e.get("art") != "panzerabwehr" or zid not in self.ziele:
                continue
            if out.get(zid, (0, None))[1] == "zerstoert":
                continue
            z = self.ziele[zid]
            if not vorhanden(z, e["t_s"]):
                continue
            if x_max is not None and position(z, e["t_s"])[0] >= x_max:
                continue
            out[zid] = (e["t_s"], e.get("folge") or "zerstoert")
        return out

    def zustand_bei(self, z, t_s):
        """'intakt', 'zerstoert' oder 'ausser_gefecht' nach dem Hintergrundgefecht (nur Szenario-Ziele)."""
        s = self.schaden.get(z["id"])
        if s and t_s >= s[0]:
            return s[1]
        return "intakt"

    def schaden_seit(self, z, t_s):
        s = self.schaden.get(z["id"])
        return s[0] if s and t_s >= s[0] else None

    def pos(self, z, t_s):
        """Position zur Zeit t; ein getroffenes Fahrzeug bleibt dort stehen, wo es getroffen wurde."""
        s = self.schaden.get(z["id"])
        return position(z, min(t_s, s[0]) if s else t_s)

    def hdg(self, z, t_s):
        s = self.schaden.get(z["id"])
        return fahrtrichtung(z, min(t_s, s[0] - 0.01) if s else t_s)

    def da(self, z, t_s):
        """Im Bild: vorhanden – oder als Wrack/außer Gefecht liegen geblieben (bleibt auch nach bis_s)."""
        s = self.schaden.get(z["id"])
        if s and t_s >= s[0]:
            return True
        return vorhanden(z, t_s)

    def faehrt(self, z, t_s):
        s = self.schaden.get(z["id"])
        if s and t_s >= s[0]:
            return False
        return bewegt_sich(z, t_s)


def linie_punkte(l):
    return glatt(l["punkte"]) if l.get("glatt") else [tuple(p) for p in l["punkte"]]


def glatt(pts, n=12):
    """Catmull-Rom durch die Stützpunkte (wie gen_raum_kraehe.py und argus_lib.glatt)."""
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


def position(obj, t_s):
    return L.position(obj, t_s)


def vorhanden(obj, t_s, eltern=None):
    return L.vorhanden(obj, t_s, eltern)


def fahrtrichtung(ziel, t_s):
    """Fahrtrichtung zur Zeit t: Richtung des aktuellen Routenabschnitts, sonst hdg."""
    r = (ziel.get("bewegung") or {}).get("route")
    if not r or len(r) < 2:
        return float(ziel.get("hdg", 0))
    seg = None
    for a, b in zip(r, r[1:]):
        if a[0] <= t_s < b[0]:
            seg = (a, b)
            break
    if seg is None:
        seg = (r[-2], r[-1]) if t_s >= r[-1][0] else (r[0], r[1])
    (_, x0, y0), (_, x1, y1) = seg
    if abs(x1 - x0) + abs(y1 - y0) < 1e-6:
        return float(ziel.get("hdg", 0))
    return math.degrees(math.atan2(y1 - y0, x1 - x0))


def bewegt_sich(ziel, t_s):
    r = (ziel.get("bewegung") or {}).get("route")
    if not r:
        return False
    for a, b in zip(r, r[1:]):
        if a[0] <= t_s < b[0] and (a[1], a[2]) != (b[1], b[2]):
            return True
    return False


def spur(ziel, t_s, laenge_m=60.0):
    """Zurückgelegter Weg der letzten laenge_m Meter vor t (für Fahrspuren), neueste zuletzt."""
    r = (ziel.get("bewegung") or {}).get("route")
    if not r:
        return []
    pts = [(x, y) for t, x, y in r if t <= t_s] + [position(ziel, t_s)]
    out = [pts[-1]]
    rest = laenge_m
    for a in reversed(pts[:-1]):
        b = out[-1]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d < 1e-6:
            continue
        if d >= rest:
            f = rest / d
            out.append((b[0] + (a[0] - b[0]) * f, b[1] + (a[1] - b[1]) * f))
            break
        out.append(a)
        rest -= d
    return list(reversed(out))


def drehe(lokal, mitte, hdg):
    """Lokale Punkte (vorwärts, rechts) in Metern um mitte drehen; hdg 0 = Osten, im Uhrzeigersinn."""
    ca, sa = math.cos(math.radians(hdg)), math.sin(math.radians(hdg))
    return [(mitte[0] + lx * ca - ly * sa, mitte[1] + lx * sa + ly * ca) for lx, ly in lokal]


def rechteck(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def im_polygon(p, poly):
    return L.im_polygon(p, poly)


def abstand_polygon(p, poly):
    return L.abstand_polygon(p, poly)


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def dist_polylinie(p, pts):
    return min(L.dist_segment(p, a, b) for a, b in zip(pts, pts[1:]))
