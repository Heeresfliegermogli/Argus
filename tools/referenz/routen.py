"""Hilfen zum Bauen zeitlich stimmiger Routen für ARGUS-Szenarien.

Eine Route ist eine Liste von Stützpunkten [t_s, x, y]; dazwischen bewegt sich das Fahrzeug geradlinig.
Fahrt() setzt Abschnitte aneinander: entlang einer Straße der Karte (geglättet wie im Gelände-Generator),
quer durchs Gelände oder als Halt. Die Zeit ergibt sich aus Strecke und Geschwindigkeit (km/h).

    f = Fahrt(t0=340, start=(1010, 150))
    f.strasse("feldweg_no", (880, 170), 20)      # 20 km/h auf dem Feldweg
    f.gelaende([(780, 205), (680, 240)], 14)      # 14 km/h im Gelände
    f.halt(25)                                    # 25 s Halt (Feuerstellung)
    route = f.route()                             # [[t, x, y], ...]

Wird von bau_szenario_v2.py und bau_szenario_v21.py benutzt; kann auch beim Nachbessern einzelner Routen helfen.
"""
import math

import argus_lib as L


def _bogen(pts):
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        s.append(s[-1] + L.dist(a, b))
    return s


def _projektion(pts, p):
    """Bogenlänge des Punkts auf der Polylinie, der p am nächsten liegt."""
    s = _bogen(pts)
    best = (1e18, 0.0)
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        dx, dy = b[0] - a[0], b[1] - a[1]
        l2 = dx * dx + dy * dy
        f = 0.0 if l2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
        q = (a[0] + f * dx, a[1] + f * dy)
        d = L.dist(p, q)
        if d < best[0]:
            best = (d, s[i] + f * math.sqrt(l2))
    return best[1]


def _punkt_bei(pts, s_ziel):
    s = _bogen(pts)
    if s_ziel <= 0:
        return tuple(pts[0])
    for i in range(len(pts) - 1):
        if s[i] <= s_ziel <= s[i + 1]:
            f = (s_ziel - s[i]) / (s[i + 1] - s[i]) if s[i + 1] > s[i] else 0
            return (pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1]))
    return tuple(pts[-1])


def teilstueck(karte, lid, von, bis, schritt=30.0):
    """Punkte entlang der Straße lid von der Projektion von `von` bis zur Projektion von `bis` (alle ca. schritt m)."""
    pts = L.linie(karte, lid)
    s0, s1 = _projektion(pts, von), _projektion(pts, bis)
    n = max(1, int(round(abs(s1 - s0) / schritt)))
    return [_punkt_bei(pts, s0 + (s1 - s0) * k / n) for k in range(n + 1)]


class Fahrt:
    def __init__(self, karte, t0, start):
        self.karte = karte
        self.r = [[float(t0), round(start[0]), round(start[1])]]

    @property
    def t(self):
        return self.r[-1][0]

    @property
    def p(self):
        return (self.r[-1][1], self.r[-1][2])

    def _hin(self, pts, kmh):
        v = kmh / 3.6
        for i, q in enumerate(pts):
            q = (round(q[0]), round(q[1]))
            d = L.dist(self.p, q)
            if d < 0.5 or (d < 4 and i < len(pts) - 1):      # sehr kurze Stücke weglassen (Rundung der Zeit verfälscht sonst die Geschwindigkeit)
                continue
            self.r.append([round(self.t + d / v, 1), q[0], q[1]])
        return self

    def strasse(self, lid, ziel, kmh, schritt=30.0):
        """Entlang der Straße bis zur Projektion von ziel (liegt das Fahrzeug neben der Straße, fährt es zuerst auf sie)."""
        return self._hin(teilstueck(self.karte, lid, self.p, ziel, schritt), kmh)

    def gelaende(self, pts, kmh):
        return self._hin(pts, kmh)

    def halt(self, dauer=None, bis=None):
        t = bis if bis is not None else self.t + dauer
        if t > self.t:
            self.r.append([round(t, 1), self.p[0], self.p[1]])
        return self

    def bis_zeit(self, t_ziel, lid, ziel, schritt=30.0):
        """Entlang der Straße so, dass ziel genau um t_ziel erreicht wird (Geschwindigkeit ergibt sich)."""
        pts = teilstueck(self.karte, lid, self.p, ziel, schritt)
        laenge = sum(L.dist(a, b) for a, b in zip([self.p] + pts, pts))
        return self._hin(pts, laenge / (t_ziel - self.t) * 3.6)

    def route(self):
        return [[int(t) if float(t).is_integer() else t, x, y] for t, x, y in self.r]


def verschiebe(route, dt):
    return [[round(t + dt, 1), x, y] for t, x, y in route]
