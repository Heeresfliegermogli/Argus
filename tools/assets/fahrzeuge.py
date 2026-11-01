"""Fahrzeuge, Wracks und Personen in Draufsicht.

Jede Zeichnung entsteht in Fahrzeugkoordinaten (Meter, x nach vorn, y nach rechts) auf einer
eigenen Leinwand mit Blick nach Osten (hdg 0) und dem Fahrzeugmittelpunkt in der Bildmitte.
Dieselbe Funktion liefert die Sprites für die Karte und die Fahrzeuge in den Drohnenbildern
(dort gedreht und mit Schatten eingesetzt), damit beide gleich aussehen.

Zeichnungen sind frei gestaltet nach Silhouette und Größe aus katalog_fahrzeuge.json, ohne
Hoheitszeichen oder Kennungen. Getötete Menschen werden nirgends dargestellt; Wracks zeigen
nur Fahrzeuge.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 4                       # Überabtastung beim Zeichnen (Kantenglättung)
OLIV = (82, 88, 58)
KETTE = (44, 44, 40)
REIFEN = (30, 30, 28)
PL_TARN = [(54, 70, 44), (102, 82, 56), (30, 32, 28)]
PL_BASIS = (74, 86, 54)

# Zeichenfunktion je Katalogtyp (katalog_fahrzeuge.json → generator)
ZEICHNER = {}


def zeichner(*typen):
    def reg(f):
        for t in typen:
            ZEICHNER[t] = f
        return f
    return reg


def mische(c, z, f):
    return tuple(int(round(a * (1 - f) + b * f)) for a, b in zip(c[:3], z[:3]))


def hell(c, f):
    return tuple(int(max(0, min(255, v * f))) for v in c[:3])


class Leinwand:
    """RGBA-Leinwand in Fahrzeugkoordinaten. s = Pixel je Meter (schon überabgetastet)."""

    def __init__(self, halb_x, halb_y, s, wrack=False, rng=None, licht=(-0.7, -0.7)):
        self.s = s
        self.w = int(math.ceil(2 * halb_x * s))
        self.h = int(math.ceil(2 * halb_y * s))
        self.cx, self.cy = self.w / 2, self.h / 2
        self.img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        self.dr = ImageDraw.Draw(self.img)
        self.koerper = Image.new("L", (self.w, self.h), 0)
        self.dk = ImageDraw.Draw(self.koerper)
        self.wrack = wrack
        self.rng = rng or np.random.default_rng(1)
        n = math.hypot(*licht) or 1
        self.licht = (licht[0] / n, licht[1] / n)     # Richtung, aus der das Licht kommt (lokal)

    # Koordinaten
    def P(self, pts, dx=0.0, dy=0.0, rot=0.0):
        ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        return [(self.cx + ((x * ca - y * sa) + dx) * self.s, self.cy + ((x * sa + y * ca) + dy) * self.s) for x, y in pts]

    def farbe(self, c, a=255):
        c = tuple(c[:3])
        if self.wrack:
            grau = sum(c) / 3
            c = mische(hell(c, 0.55), (grau * 0.32 + 34, grau * 0.3 + 30, grau * 0.28 + 27), 0.62)
        return c + (a,)

    def poly(self, pts, c, koerper=False, outline=None, **kw):
        q = self.P(pts, **kw)
        self.dr.polygon(q, fill=self.farbe(c), outline=self.farbe(outline) if outline else None)
        if koerper:
            self.dk.polygon(q, fill=255)

    def kasten(self, x0, x1, y0, y1, c, **kw):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], c, **kw)

    def ell(self, cx, cy, rx, ry, c, n=24, **kw):
        self.poly([(cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n)) for k in range(n)], c, **kw)

    def linie(self, pts, c, breite_m, **kw):
        self.dr.line(self.P(pts, **{k: v for k, v in kw.items() if k in ("dx", "dy", "rot")}), fill=self.farbe(c),
                     width=max(1, int(round(breite_m * self.s))))

    def kuppel(self, cx, cy, rx, ry, c, **kw):
        """Gewölbte Fläche (Turm): Grundfarbe, Lichtseite heller, Schattenseite dunkler."""
        lx, ly = self.licht
        self.ell(cx, cy, rx, ry, hell(c, 0.82), **kw)
        self.ell(cx + lx * rx * 0.12, cy + ly * ry * 0.12, rx * 0.9, ry * 0.88, c, **kw)
        self.ell(cx + lx * rx * 0.32, cy + ly * ry * 0.32, rx * 0.45, ry * 0.42, hell(c, 1.16), **kw)

    def tarnung(self, farben, flecken=22, groesse=(0.35, 0.8)):
        """Flecktarn nur auf den als Körper markierten Flächen."""
        lage = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        dl = ImageDraw.Draw(lage)
        hx, hy = self.w / 2 / self.s, self.h / 2 / self.s
        r = np.random.default_rng(int(self.rng.integers(1 << 30)))
        for _ in range(flecken):
            x, y = r.uniform(-hx, hx), r.uniform(-hy, hy)
            rx, ry = r.uniform(*groesse), r.uniform(groesse[0] * 0.6, groesse[1] * 0.6)
            pts = [(x + rx * math.cos(2 * math.pi * k / 11) * (1 + r.normal(0, 0.12)),
                    y + ry * math.sin(2 * math.pi * k / 11) * (1 + r.normal(0, 0.12))) for k in range(11)]
            dl.polygon(self.P(pts), fill=self.farbe(farben[r.integers(len(farben))]))
        self.img.paste(lage, (0, 0), Image.fromarray(np.minimum(np.asarray(lage)[..., 3], np.asarray(self.koerper))))

    def ergebnis(self, ss=SS):
        if self.wrack:
            self._russ()
        img = self.img.convert("RGBa").resize((max(1, self.w // ss), max(1, self.h // ss)), Image.LANCZOS)
        return img.convert("RGBA")

    def _russ(self):
        a = np.asarray(self.img).astype(np.float32)
        h, w = a.shape[:2]
        r = np.random.default_rng(int(self.rng.integers(1 << 30)))
        g = r.random((max(2, h // 12), max(2, w // 12))).astype(np.float32)
        g = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        f = 0.62 + 0.5 * g
        a[..., :3] *= f[..., None]
        rost = (g > 0.8)[..., None] * np.array([16, 6, -2], np.float32)
        a[..., :3] += rost
        self.img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
        self.dr = ImageDraw.Draw(self.img)


# ====================================================================== Kettenfahrzeuge
def _ketten(lw, L, B, breite=0.6, glieder=True, unterbrochen=None):
    for s in (-1, 1):
        y0, y1 = (B / 2 - breite, B / 2) if s > 0 else (-B / 2, -B / 2 + breite)
        if unterbrochen and unterbrochen[0] == s:
            a, b = unterbrochen[1]
            lw.kasten(-L / 2, a, y0, y1, KETTE)
            lw.kasten(b, L / 2, y0, y1, KETTE)
            continue
        lw.kasten(-L / 2, L / 2, y0, y1, KETTE)
        if glieder:
            x = -L / 2 + 0.12
            while x < L / 2:
                lw.linie([(x, y0), (x, y1)], (64, 64, 58), 0.05)
                x += 0.24


def _kampfpanzer(lw, L, B, tarn=None, basis=OLIV, era=False, wrack=False, zustand=None):
    rng = lw.rng
    kette_ab = zustand == "kette_ab"
    if kette_ab:
        # rechte Kette liegt gestreckt neben dem Fahrzeug, Laufrollen frei
        lw.kasten(-L / 2 - 0.6, L / 2 - 0.4, B / 2 + 0.5, B / 2 + 1.1, KETTE)
        for k in range(12):
            x = -L / 2 - 0.5 + k * 0.55
            lw.linie([(x, B / 2 + 0.5), (x, B / 2 + 1.1)], (64, 64, 58), 0.06)
    _ketten(lw, L, B, unterbrochen=(1, (-L / 2, L / 2)) if kette_ab else ((1, (-0.6, 0.9)) if wrack else None))
    if kette_ab:
        for k in range(6):
            lw.ell(-L / 2 + 0.7 + k * 1.1, B / 2 - 0.3, 0.33, 0.22, (38, 38, 34))
    kot = hell(basis, 0.82)
    for s in (-1, 1):                       # Kotflügel / Seitenschürzen
        y0, y1 = (B / 2 - 0.62, B / 2 - 0.05) if s > 0 else (-B / 2 + 0.05, -B / 2 + 0.62)
        if not (kette_ab and s > 0):
            lw.kasten(-L / 2 + 0.35, L / 2 - 0.55, y0, y1, kot, koerper=True)
        for k in range(3):                  # Staukästen
            x = -L / 2 + 0.7 + k * 1.15
            if not (kette_ab and s > 0):
                lw.kasten(x, x + 0.8, y0 + 0.08, y1 - 0.08, hell(basis, 0.9), koerper=True)
    lw.kasten(-L / 2 + 0.15, L / 2 - 0.25, -B / 2 + 0.62, B / 2 - 0.62, basis, koerper=True)
    lw.poly([(L / 2 - 1.0, -B / 2 + 0.62), (L / 2 - 0.25, -B / 2 + 0.75), (L / 2 - 0.25, B / 2 - 0.75), (L / 2 - 1.0, B / 2 - 0.62)],
            hell(basis, 1.12), koerper=True)                                # Bugplatte
    lw.kasten(-L / 2 + 0.2, -L / 2 + 1.9, -B / 2 + 0.75, B / 2 - 0.75, hell(basis, 0.74), koerper=True)  # Motordeck
    for k in range(5):
        x = -L / 2 + 0.35 + k * 0.32
        lw.linie([(x, -0.8), (x, 0.8)], hell(basis, 0.5), 0.06)
    lw.ell(-L / 2 - 0.15, -0.55, 0.42, 0.42, hell(basis, 0.9))               # Zusatztanks
    lw.ell(-L / 2 - 0.15, 0.55, 0.42, 0.42, hell(basis, 0.9))
    lw.kasten(-L / 2 - 0.55, -L / 2 - 0.25, -1.45, 1.45, (92, 70, 48))      # Grabenbalken
    if era:                                                                    # Reaktivpanzerung auf der Bugplatte
        for k in range(5):
            y = -1.0 + k * 0.5
            lw.kasten(L / 2 - 0.95, L / 2 - 0.45, y - 0.2, y + 0.2, hell(basis, 1.02), koerper=True, outline=hell(basis, 0.7))
    if tarn:
        lw.tarnung(tarn, flecken=26)

    # Turm (beim Wrack verschoben und verdreht)
    tdx, tdy, trot = (0.0, 0.0, 0.0)
    if wrack:
        tdx, tdy, trot = rng.uniform(-1.6, -0.6), rng.uniform(0.9, 1.6) * rng.choice([-1, 1]), rng.uniform(25, 70)
    kw = dict(dx=tdx, dy=tdy, rot=trot)
    turm_c = (0.35, 0.0)
    rohr_ende = L / 2 + 2.65 if not wrack else L / 2 + 0.6
    lw.linie([(1.25, 0.0), (rohr_ende, 0.0)], hell(basis, 0.62), 0.2, **kw)
    lw.linie([(2.6, 0.0), (3.4, 0.0)], hell(basis, 0.5), 0.26, **kw)           # Rauchabsauger
    if not wrack:
        lw.linie([(rohr_ende - 0.25, 0.0), (rohr_ende, 0.0)], hell(basis, 0.45), 0.24)
    lw.kuppel(turm_c[0], turm_c[1], 1.3, 1.18, basis, koerper=True, **kw)
    if era:
        for k in range(7):
            a = math.radians(-60 + k * 20)
            x, y = turm_c[0] + 1.12 * math.cos(a), 1.02 * math.sin(a)
            lw.kasten(x - 0.16, x + 0.16, y - 0.16, y + 0.16, hell(basis, 1.05), koerper=True, outline=hell(basis, 0.7), **kw)
    if tarn:
        lw.tarnung(tarn, flecken=8, groesse=(0.3, 0.55))
    offen = zustand == "luk_offen"
    lw.ell(-0.2, 0.48, 0.32, 0.32, hell(basis, 0.7), **kw)                       # Kommandantenkuppel
    lw.ell(-0.2, 0.48, 0.2, 0.2, (24, 24, 22) if offen else hell(basis, 0.95), **kw)
    if offen:
        lw.ell(-0.62, 0.62, 0.22, 0.2, hell(basis, 0.85), **kw)
    lw.ell(-0.3, -0.48, 0.27, 0.27, hell(basis, 0.8), **kw)                      # Richtschützenluke
    lw.kasten(0.95, 1.25, -0.72, -0.46, (36, 38, 34), **kw)                     # Scheinwerfer
    lw.linie([(-0.75, 0.55), (-1.2, 0.95)], (40, 40, 36), 0.04, **kw)           # Antenne
    if zustand == "feuert":
        _muendungsfeuer(lw, rohr_ende, 0.0, 1.0)


def _muendungsfeuer(lw, x, y, f):
    lw.ell(x + 0.9 * f, y, 1.1 * f, 0.7 * f, (230, 228, 220))
    lw.ell(x + 0.55 * f, y, 0.65 * f, 0.45 * f, (255, 236, 160))
    lw.ell(x + 0.3 * f, y, 0.32 * f, 0.26 * f, (255, 250, 230))


@zeichner("kpz_t72")
def kpz_t72(lw, L, B, zustand=None):
    _kampfpanzer(lw, L, B, wrack=lw.wrack, zustand=zustand)


@zeichner("kpz_pt91")
def kpz_pt91(lw, L, B, zustand=None):
    _kampfpanzer(lw, L, B, tarn=PL_TARN, basis=PL_BASIS, era=True, wrack=lw.wrack, zustand=zustand)


@zeichner("spz_bmp2")
def spz_bmp2(lw, L, B, zustand=None):
    rng = lw.rng
    _ketten(lw, L, B, breite=0.5, unterbrochen=(-1, (-1.2, 0.2)) if lw.wrack else None)
    b = B / 2 - 0.5
    lw.poly([(-L / 2 + 0.1, -b), (L / 2 - 1.7, -b), (L / 2 - 0.05, -b + 0.35), (L / 2 - 0.05, b - 0.35), (L / 2 - 1.7, b), (-L / 2 + 0.1, b)],
            OLIV, koerper=True)
    lw.poly([(L / 2 - 1.7, -b), (L / 2 - 0.05, -b + 0.35), (L / 2 - 0.05, b - 0.35), (L / 2 - 1.7, b)], hell(OLIV, 1.14), koerper=True)
    for k in range(4):                                     # Wellenbrecher-Rippen
        x = L / 2 - 1.45 + k * 0.33
        lw.linie([(x, -b + 0.2), (x, b - 0.2)], hell(OLIV, 0.85), 0.05)
    lw.kasten(L / 2 - 2.3, L / 2 - 1.8, -b + 0.15, -b + 0.75, hell(OLIV, 0.75))   # Fahrerluke
    lw.kasten(L / 2 - 2.5, L / 2 - 1.8, b - 0.95, b - 0.2, hell(OLIV, 0.72))      # Motor rechts vorn
    for k in range(3):
        lw.linie([(L / 2 - 2.4 + k * 0.22, b - 0.9), (L / 2 - 2.4 + k * 0.22, b - 0.25)], hell(OLIV, 0.5), 0.05)
    for i in range(2):                                     # Dachluken hinten
        for s in (-1, 1):
            x = -L / 2 + 0.8 + i * 0.95
            lw.kasten(x, x + 0.75, s * 0.12, s * 0.75, hell(OLIV, 0.86))
    for s in (-1, 1):                                      # Hecktüren
        lw.kasten(-L / 2 + 0.05, -L / 2 + 0.55, s * 0.1, s * 0.85, hell(OLIV, 0.78))
    tdx, tdy, trot = (0.0, 0.0, 0.0)
    if lw.wrack:
        tdx, tdy, trot = rng.uniform(-0.8, -0.2), rng.uniform(0.6, 1.2) * rng.choice([-1, 1]), rng.uniform(20, 60)
    kw = dict(dx=tdx, dy=tdy, rot=trot)
    lw.linie([(0.9, -0.1), (L / 2 + (1.0 if not lw.wrack else 0.2), -0.1)], hell(OLIV, 0.55), 0.11, **kw)   # 30-mm-Kanone
    turm = [(0.95, -0.55), (0.55, -0.85), (-0.6, -0.85), (-0.95, -0.4), (-0.95, 0.5), (-0.6, 0.85), (0.55, 0.85), (0.95, 0.5)]
    lw.poly(turm, hell(OLIV, 0.84), koerper=True, **kw)
    lw.poly([(x * 0.86 - 0.04, y * 0.86 - 0.05) for x, y in turm], OLIV, koerper=True, **kw)
    lw.kasten(-0.4, 0.75, -0.95, -0.7, hell(OLIV, 0.72), **kw)                    # Lenkflugkörper-Starter
    lw.ell(-0.35, 0.4, 0.26, 0.26, hell(OLIV, 0.7), **kw)
    lw.ell(-0.35, -0.3, 0.24, 0.24, hell(OLIV, 0.75), **kw)
    if zustand == "feuert":
        _muendungsfeuer(lw, L / 2 + 1.0, -0.1, 0.55)


EIGEN_BASIS = (78, 88, 62)
EIGEN_TARN = [(52, 66, 40), (96, 84, 58), (34, 36, 30), (88, 102, 66)]


@zeichner("spz_eigen")
def spz_eigen(lw, L, B, zustand=None):
    """Eigener Schützenpanzer (seit Szenario 2.3, D1; fiktiv gestaltet): kantige Wanne mit Seitenschürzen, flacher
    unbemannter Turm mit Kanone, Flecktarn. Steht in Stellung am Westrand, ist nie Ziel."""
    rng = lw.rng
    _ketten(lw, L, B, breite=0.55, unterbrochen=(1, (-1.0, 0.4)) if lw.wrack else None)
    b = B / 2 - 0.08
    lw.poly([(-L / 2 + 0.05, -b), (L / 2 - 1.1, -b), (L / 2 - 0.05, -b + 0.45), (L / 2 - 0.05, b - 0.45), (L / 2 - 1.1, b),
             (-L / 2 + 0.05, b)], hell(EIGEN_BASIS, 0.86), koerper=True)                                   # Schürzen
    lw.poly([(-L / 2 + 0.25, -b + 0.5), (L / 2 - 1.2, -b + 0.5), (L / 2 - 0.3, -b + 0.85), (L / 2 - 0.3, b - 0.85),
             (L / 2 - 1.2, b - 0.5), (-L / 2 + 0.25, b - 0.5)], EIGEN_BASIS, koerper=True)                 # Wannendach
    lw.kasten(L / 2 - 1.15, L / 2 - 0.55, -b + 0.55, -b + 1.15, hell(EIGEN_BASIS, 0.72))                  # Fahrerluke
    for k in range(3):                                                                                     # Lüftergitter
        x = -L / 2 + 0.5 + k * 0.3
        lw.linie([(x, -b + 0.7), (x, b - 0.7)], hell(EIGEN_BASIS, 0.55), 0.05)
    lw.kasten(-L / 2 + 0.05, -L / 2 + 0.45, -0.9, 0.9, hell(EIGEN_BASIS, 0.78))                           # Heckklappe
    lw.tarnung(EIGEN_TARN, flecken=34, groesse=(0.3, 0.7))
    tdx, tdy, trot = (0.0, 0.0, 0.0)
    if lw.wrack:
        tdx, tdy, trot = rng.uniform(-0.8, -0.2), rng.uniform(0.5, 1.0) * rng.choice([-1, 1]), rng.uniform(20, 55)
    kw = dict(dx=tdx, dy=tdy, rot=trot)
    lw.linie([(0.9, 0.0), (L / 2 + (1.15 if not lw.wrack else 0.2), 0.0)], hell(EIGEN_BASIS, 0.5), 0.13, **kw)  # Kanone
    turm = [(1.05, -0.62), (0.75, -0.95), (-0.7, -0.95), (-0.95, -0.7), (-0.95, 0.7), (-0.7, 0.95), (0.75, 0.95), (1.05, 0.62)]
    lw.poly(turm, hell(EIGEN_BASIS, 0.8), koerper=True, **kw)
    lw.poly([(x * 0.84, y * 0.84) for x, y in turm], hell(EIGEN_BASIS, 1.05), koerper=True, **kw)
    lw.kasten(-0.55, 0.2, 0.55, 0.85, hell(EIGEN_BASIS, 0.7), **kw)                                       # Lenkflugkörper-Starter
    lw.ell(-0.4, -0.45, 0.22, 0.22, hell(EIGEN_BASIS, 0.68), **kw)                                         # Optik
    if zustand == "feuert":
        _muendungsfeuer(lw, L / 2 + 1.15, 0.0, 0.6)


# ====================================================================== Radfahrzeuge
def _raeder(lw, xs, B, breite=0.38, laenge=1.0, c=REIFEN):
    for x in xs:
        for s in (-1, 1):
            y = s * (B / 2 - breite / 2)
            lw.kasten(x - laenge / 2, x + laenge / 2, y - breite / 2, y + breite / 2, c if not lw.wrack else (24, 22, 20))


def _boot(L, B, bug=1.4, heck=0.25, schmal=0.35):
    b = B / 2
    return [(L / 2, -b + schmal + 0.25), (L / 2 - bug, -b + 0.38), (-L / 2 + heck, -b + 0.38), (-L / 2, -b + 0.55),
            (-L / 2, b - 0.55), (-L / 2 + heck, b - 0.38), (L / 2 - bug, b - 0.38), (L / 2, b - schmal - 0.25)]


def _radpanzer(lw, L, B, turm=True, kreuz=False, basis=OLIV):
    _raeder(lw, [L / 2 - 1.55, L / 2 - 3.0, -L / 2 + 2.6, -L / 2 + 1.15], B, breite=0.42, laenge=1.05)
    rumpf = _boot(L, B)
    lw.poly(rumpf, basis, koerper=True)
    lw.poly([(L / 2, -B / 2 + 0.6), (L / 2 - 1.4, -B / 2 + 0.38), (L / 2 - 1.4, B / 2 - 0.38), (L / 2, B / 2 - 0.6)], hell(basis, 1.14), koerper=True)
    lw.kasten(L / 2 - 1.75, L / 2 - 1.35, -0.75, -0.2, hell(basis, 0.7))
    lw.kasten(L / 2 - 1.75, L / 2 - 1.35, 0.2, 0.75, hell(basis, 0.7))
    lw.kasten(-L / 2 + 0.2, -L / 2 + 1.9, -0.85, 0.85, hell(basis, 0.76), koerper=True)       # Motordeck
    for k in range(5):
        x = -L / 2 + 0.35 + k * 0.3
        lw.linie([(x, -0.7), (x, 0.7)], hell(basis, 0.5), 0.05)
    for s in (-1, 1):
        lw.linie([(-0.4, s * (B / 2 - 0.4)), (0.5, s * (B / 2 - 0.4))], hell(basis, 0.6), 0.08)    # Seitentüren
    if kreuz:
        lw.kasten(-1.6, 0.3, -0.95, 0.95, (232, 232, 226))
        lw.kasten(-1.35, 0.05, -0.2, 0.2, (196, 30, 34))
        lw.kasten(-0.85, -0.45, -0.7, 0.7, (196, 30, 34))
        lw.ell(1.4, -0.5, 0.25, 0.25, hell(basis, 0.7))
        lw.ell(1.4, 0.5, 0.25, 0.25, hell(basis, 0.7))
    if turm:
        rng = lw.rng
        tdx, tdy, trot = (0.0, 0.0, 0.0)
        if lw.wrack:
            tdx, tdy, trot = rng.uniform(-0.5, 0.2), rng.uniform(0.5, 1.0) * rng.choice([-1, 1]), rng.uniform(20, 70)
        kw = dict(dx=tdx, dy=tdy, rot=trot)
        lw.linie([(1.2, 0.0), (L / 2 + (0.9 if not lw.wrack else 0.0), 0.0)], hell(basis, 0.55), 0.1, **kw)
        lw.linie([(1.0, 0.25), (2.1, 0.25)], hell(basis, 0.5), 0.05, **kw)
        lw.kuppel(0.65, 0.0, 0.62, 0.58, basis, koerper=True, **kw)
    lw.ell(1.6, -0.75, 0.22, 0.22, hell(basis, 0.72))


@zeichner("spw_btr80")
def spw_btr80(lw, L, B, zustand=None):
    _radpanzer(lw, L, B, turm=True)


@zeichner("san_rad")
def san_rad(lw, L, B, zustand=None):
    _radpanzer(lw, L, B, turm=False, kreuz=True, basis=(86, 92, 62))


@zeichner("spaehpz_brdm2")
def spaehpz_brdm2(lw, L, B, zustand=None):
    _raeder(lw, [L / 2 - 1.2, -L / 2 + 1.25], B, breite=0.36, laenge=0.95)
    b = B / 2 - 0.3
    rumpf = [(L / 2, -0.35), (L / 2 - 1.3, -b), (-L / 2 + 0.25, -b), (-L / 2, -b + 0.3), (-L / 2, b - 0.3), (-L / 2 + 0.25, b), (L / 2 - 1.3, b), (L / 2, 0.35)]
    lw.poly(rumpf, OLIV, koerper=True)
    lw.poly([(L / 2, -0.35), (L / 2 - 1.3, -b), (L / 2 - 1.3, b), (L / 2, 0.35)], hell(OLIV, 1.13), koerper=True)
    lw.kasten(L / 2 - 1.75, L / 2 - 1.35, -0.7, -0.1, hell(OLIV, 0.65))       # Sichtklappen
    lw.kasten(L / 2 - 1.75, L / 2 - 1.35, 0.1, 0.7, hell(OLIV, 0.65))
    lw.kasten(-L / 2 + 0.25, -L / 2 + 1.6, -0.7, 0.7, hell(OLIV, 0.76), koerper=True)
    for k in range(4):
        lw.linie([(-L / 2 + 0.4 + k * 0.3, -0.55), (-L / 2 + 0.4 + k * 0.3, 0.55)], hell(OLIV, 0.5), 0.05)
    rng = lw.rng
    kw = dict(dx=rng.uniform(-0.4, 0.1), dy=rng.uniform(0.4, 0.8), rot=rng.uniform(20, 60)) if lw.wrack else {}
    lw.linie([(0.0, 0.0), (1.5 if not lw.wrack else 0.6, 0.0)], hell(OLIV, 0.5), 0.09, **kw)
    lw.poly([(math.cos(2 * math.pi * k / 8) * 0.58 - 0.2, math.sin(2 * math.pi * k / 8) * 0.58) for k in range(8)], hell(OLIV, 0.85), koerper=True, **kw)
    lw.poly([(math.cos(2 * math.pi * k / 8) * 0.44 - 0.26, math.sin(2 * math.pi * k / 8) * 0.44 - 0.05) for k in range(8)], OLIV, koerper=True, **kw)
    if zustand == "luk_offen":
        lw.ell(-0.3, 0.0, 0.2, 0.2, (24, 24, 22))


@zeichner("gfz_tigr")
def gfz_tigr(lw, L, B, zustand=None):
    for x in (L / 2 - 1.0, -L / 2 + 1.05):                # Radkästen
        for s in (-1, 1):
            lw.kasten(x - 0.55, x + 0.55, s * (B / 2 - 0.05) - 0.18, s * (B / 2 - 0.05) + 0.18, REIFEN if not lw.wrack else (24, 22, 20))
    b = B / 2 - 0.12
    lw.poly([(L / 2, -b + 0.15), (L / 2 - 0.15, -b), (-L / 2 + 0.1, -b), (-L / 2, -b + 0.1), (-L / 2, b - 0.1), (-L / 2 + 0.1, b), (L / 2 - 0.15, b), (L / 2, b - 0.15)],
            OLIV, koerper=True)
    lw.kasten(L / 2 - 1.55, L / 2 - 0.05, -b + 0.15, b - 0.15, hell(OLIV, 1.1), koerper=True)        # Motorhaube
    for k in range(4):
        lw.linie([(L / 2 - 0.35, -0.6 + k * 0.4), (L / 2 - 0.1, -0.6 + k * 0.4)], hell(OLIV, 0.6), 0.05)
    lw.kasten(L / 2 - 1.95, L / 2 - 1.55, -b + 0.2, b - 0.2, (44, 52, 56) if not lw.wrack else (30, 28, 26))   # Frontscheibe
    lw.kasten(-L / 2 + 0.25, L / 2 - 2.0, -b + 0.12, b - 0.12, hell(OLIV, 0.92), koerper=True)          # Dach
    lw.ell(-0.3, 0.0, 0.33, 0.33, hell(OLIV, 0.7))
    for k in range(4):
        lw.linie([(-L / 2 + 0.4, -0.75 + k * 0.5), (-1.2, -0.75 + k * 0.5)], hell(OLIV, 0.75), 0.04)


@zeichner("lkw_ural")
def lkw_ural(lw, L, B, zustand=None):
    _raeder(lw, [L / 2 - 1.1, -L / 2 + 2.3, -L / 2 + 1.0], B, breite=0.34, laenge=0.95)
    b = B / 2 - 0.15
    lw.kasten(L / 2 - 1.3, L / 2, -0.85, 0.85, hell(OLIV, 1.05), koerper=True)      # Motorhaube
    for k in range(3):
        lw.linie([(L / 2 - 1.1 + k * 0.35, -0.6), (L / 2 - 1.1 + k * 0.35, 0.6)], hell(OLIV, 0.75), 0.04)
    lw.kasten(L / 2 - 2.6, L / 2 - 1.3, -b + 0.05, b - 0.05, OLIV, koerper=True)    # Fahrerhaus
    lw.kasten(L / 2 - 1.5, L / 2 - 1.3, -b + 0.15, b - 0.15, (44, 52, 56) if not lw.wrack else (30, 28, 26))
    lw.ell(L / 2 - 2.95, 0.0, 0.42, 0.42, REIFEN)                                    # Reserverad
    plane = (104, 104, 82)
    if lw.wrack:
        lw.kasten(-L / 2, L / 2 - 3.3, -b, b, (52, 44, 36), koerper=True)           # Ladefläche ausgebrannt
        for k in range(6):
            lw.linie([(-L / 2 + 0.3 + k * 0.7, -b), (-L / 2 + 0.3 + k * 0.7, b)], (40, 34, 28), 0.08)
    else:
        lw.kasten(-L / 2, L / 2 - 3.3, -b, b, plane, koerper=True)                  # Plane
        for k in range(6):
            x = -L / 2 + 0.3 + k * 0.7
            lw.linie([(x, -b), (x, b)], hell(plane, 0.82), 0.07)
        lw.linie([(-L / 2, 0.0), (L / 2 - 3.3, 0.0)], hell(plane, 1.1), 0.06)


@zeichner("eloka_lkw")
def eloka_lkw(lw, L, B, zustand=None):
    _raeder(lw, [L / 2 - 1.1, -L / 2 + 2.4, -L / 2 + 1.1], B, breite=0.34, laenge=0.95)
    b = B / 2 - 0.15
    lw.kasten(L / 2 - 1.3, L / 2, -0.85, 0.85, hell(OLIV, 1.05), koerper=True)
    lw.kasten(L / 2 - 2.5, L / 2 - 1.3, -b + 0.05, b - 0.05, OLIV, koerper=True)
    lw.kasten(L / 2 - 1.5, L / 2 - 1.3, -b + 0.15, b - 0.15, (44, 52, 56) if not lw.wrack else (30, 28, 26))
    koffer = (112, 116, 96)
    lw.kasten(-L / 2, L / 2 - 2.65, -b, b, koffer, koerper=True)                     # Kofferaufbau
    lw.kasten(-L / 2 + 0.1, L / 2 - 2.75, -b + 0.1, b - 0.1, hell(koffer, 1.07), koerper=True)
    lw.kasten(-L / 2 + 0.3, -L / 2 + 1.2, -0.5, 0.5, hell(koffer, 0.8))              # Klimagerät
    if not lw.wrack:
        mx = -0.4
        for ax, ay in ((mx + 3.2, -3.0), (mx + 3.2, 3.0), (mx - 3.0, -3.0), (mx - 3.0, 3.0)):   # Abspannseile
            lw.linie([(mx, 0.0), (ax, ay)], (58, 58, 54), 0.04)
        lw.ell(mx, 0.0, 0.3, 0.3, (60, 62, 58))                                       # Mast
        for a in (0, 90, 180, 270):                                                    # Antennenfeld
            r = math.radians(a + 45)
            lw.linie([(mx, 0.0), (mx + 1.1 * math.cos(r), 1.1 * math.sin(r))], (70, 72, 68), 0.12)
        lw.ell(mx, 0.0, 0.16, 0.16, (190, 190, 182))
    else:
        lw.linie([(-0.4, 0.0), (-4.6, 2.6)], (40, 40, 38), 0.18)                      # umgestürzter Mast


@zeichner("moerser_trupp")
def moerser_trupp(lw, L, B, zustand=None):
    rng = lw.rng
    sand = (150, 140, 110)
    for cx in (-L / 4, L / 4):                             # Stellungen mit Sandsäcken
        lw.ell(cx, -0.6, 1.9, 1.7, (104, 96, 74))           # ausgehobene Mulde
        for k in range(16):
            a = 2 * math.pi * k / 16
            if 0.2 < (a % (2 * math.pi)) < 1.1:
                continue
            x, y = cx + 2.1 * math.cos(a), -0.6 + 1.9 * math.sin(a)
            lw.ell(x, y, 0.42, 0.26, hell(sand, rng.uniform(0.85, 1.05)))
        if not lw.wrack:
            lw.ell(cx, -0.6, 0.6, 0.6, (64, 66, 54))        # Bodenplatte
            lw.linie([(cx, -0.6), (cx + 1.5, -0.95)], (40, 42, 36), 0.24)   # Rohr (steil, in Draufsicht verkürzt)
            lw.ell(cx + 1.5, -0.95, 0.15, 0.15, (24, 24, 22))
            lw.linie([(cx + 0.9, -0.8), (cx + 0.75, -1.5)], (46, 48, 40), 0.07)
            lw.linie([(cx + 0.9, -0.8), (cx + 0.75, -0.1)], (46, 48, 40), 0.07)
        else:
            lw.ell(cx, -0.6, 1.0, 0.9, (36, 34, 30))
            lw.linie([(cx - 1.0, -0.2), (cx + 0.3, 0.5)], (40, 38, 34), 0.22)
    for k in range(9):                                     # Munitionskisten
        x = -1.2 + (k % 3) * 0.75 + rng.uniform(-0.05, 0.05)
        y = 2.0 + (k // 3) * 0.45
        if lw.wrack:
            x += rng.uniform(-2.5, 2.5)
            y += rng.uniform(-1.5, 1.5)
        lw.kasten(x, x + 0.62, y, y + 0.36, (96, 92, 60) if k % 4 else (110, 98, 64))
        lw.linie([(x + 0.05, y + 0.18), (x + 0.57, y + 0.18)], (70, 66, 44), 0.03)


@zeichner("attrappe_kpz")
def attrappe_kpz(lw, L, B, zustand=None):
    r = np.random.default_rng(7)
    rx, ry = L / 2, B / 2
    if lw.wrack:
        # Reste: zerrissenes Netz, Bretter, Rohr-Attrappe liegt schief
        for _ in range(9):
            cx, cy = r.uniform(-rx * 1.1, rx * 1.1), r.uniform(-ry * 1.1, ry * 1.1)
            pts = [(cx + r.uniform(0.4, 1.3) * math.cos(a), cy + r.uniform(0.3, 0.9) * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 7)[:-1]]
            lw.poly(pts, (74, 80, 54))
        for _ in range(12):
            x, y = r.uniform(-rx, rx), r.uniform(-ry, ry)
            a = r.uniform(0, 180)
            lw.linie([(x, y), (x + 1.6 * math.cos(math.radians(a)), y + 1.6 * math.sin(math.radians(a)))], (120, 92, 60), 0.18)
        lw.linie([(1.0, 0.8), (L / 2 + 0.8, 1.9)], (52, 54, 40), 0.18)
        return
    umriss = []
    for k in range(28):
        a = 2 * math.pi * k / 28
        rr = 1 + r.normal(0, 0.05)
        ca, sa = math.cos(a), math.sin(a)
        umriss.append((rx * math.copysign(abs(ca) ** 0.55, ca) * rr, ry * math.copysign(abs(sa) ** 0.55, sa) * rr))
    lw.poly(umriss, (80, 86, 58), koerper=True)
    for _ in range(260):
        x, y = r.uniform(-rx, rx), r.uniform(-ry, ry)
        if (x / rx) ** 2 + (y / (ry * 1.02)) ** 2 > 1:
            continue
        c = [(58, 66, 44), (104, 98, 66), (70, 78, 50), (92, 94, 60), (120, 108, 72)][r.integers(5)]
        lw.ell(x, y, r.uniform(0.15, 0.45), r.uniform(0.12, 0.3), c, n=7)
    # Seit 2.4 (E6.3, S1): das Netz hängt zwischen den Stangen durch (helle Stangenköpfe, dunkle Mulden dazwischen,
    # Maschen sichtbar) – ein echter Panzer spannt das Netz über Turm und Wanne. Das Rohr ist ein heller Holzbalken.
    stangen = [(-rx * 0.6, -ry * 0.48), (-rx * 0.6, ry * 0.48), (rx * 0.08, -ry * 0.52), (rx * 0.08, ry * 0.52), (rx * 0.6, 0.0)]
    ov = Image.new("RGBA", (lw.w, lw.h), (0, 0, 0, 0))
    do = ImageDraw.Draw(ov)
    for i, (xa, ya) in enumerate(stangen):                                     # Mulden zwischen benachbarten Stangen
        for (xb, yb) in stangen[i + 1:]:
            if math.hypot(xb - xa, yb - ya) > rx * 0.8:
                continue
            mx, my = (xa + xb) / 2, (ya + yb) / 2
            do.ellipse(lw.P([(mx - 0.75, my - 0.6)]) + lw.P([(mx + 0.75, my + 0.6)]), fill=(26, 30, 20, 120))
    ov = ov.filter(ImageFilter.GaussianBlur(0.45 * lw.s))
    do = ImageDraw.Draw(ov)
    for (x, y) in stangen:                                                     # Netz spannt über den Stangenköpfen
        for a_ in np.linspace(0, 2 * math.pi, 9)[:-1]:
            do.line(lw.P([(x, y), (x + 1.1 * math.cos(a_), y + 0.9 * math.sin(a_))]), fill=(150, 146, 106, 110), width=max(1, int(0.05 * lw.s)))
        do.ellipse(lw.P([(x - 0.3, y - 0.28)]) + lw.P([(x + 0.3, y + 0.28)]), fill=(150, 146, 108, 200))
        do.ellipse(lw.P([(x - 0.13, y - 0.12)]) + lw.P([(x + 0.09, y + 0.08)]), fill=(178, 172, 128, 220))
    for k in np.arange(-rx - ry, rx + ry, 0.55):                               # Maschen (diagonal, beide Richtungen)
        for sgn in (-1, 1):
            do.line(lw.P([(k - ry, -sgn * ry), (k + ry, sgn * ry)]), fill=(40, 44, 30, 60), width=max(1, int(0.03 * lw.s)))
    lw.img.paste(ov, (0, 0), Image.fromarray(np.minimum(np.asarray(ov)[..., 3], np.asarray(lw.koerper))))
    holz = (194, 160, 104)
    lw.linie([(rx * 0.45, 0.0), (rx + 1.8, 0.0)], holz, 0.22)                  # Rohr: Holzbalken ragt heraus
    lw.linie([(rx * 0.5, -0.04), (rx + 1.75, -0.04)], hell(holz, 1.12), 0.06)  # Maserung im Licht
    lw.linie([(rx * 0.5, 0.06), (rx + 1.75, 0.06)], hell(holz, 0.78), 0.04)
    lw.kasten(rx + 1.62, rx + 1.82, -0.14, 0.14, hell(holz, 0.86))            # gesägtes Ende


@zeichner("traktor")
def traktor(lw, L, B, zustand=None):
    gruen = (64, 124, 54)
    # Zugmaschine vorn (ca. 4 m), Anhänger hinten (ca. 4,8 m)
    vx = L / 2 - 2.0
    lw.kasten(vx + 0.6, vx + 1.25, -0.95, -0.55, REIFEN)                           # Vorderräder
    lw.kasten(vx + 0.6, vx + 1.25, 0.55, 0.95, REIFEN)
    lw.kasten(vx - 1.4, vx - 0.3, -1.22, -0.65, REIFEN)                            # Hinterräder
    lw.kasten(vx - 1.4, vx - 0.3, 0.65, 1.22, REIFEN)
    lw.kasten(vx - 0.2, vx + 2.0, -0.45, 0.45, gruen, koerper=True)                # Motorhaube
    lw.kasten(vx - 1.5, vx - 0.2, -0.75, 0.75, hell(gruen, 0.9), koerper=True)    # Kabine
    lw.kasten(vx - 1.4, vx - 0.3, -0.68, 0.68, (226, 226, 220) if not lw.wrack else (60, 56, 50))  # Kabinendach
    lw.ell(vx + 1.4, -0.25, 0.08, 0.08, (40, 40, 40))                              # Auspuff
    lw.linie([(vx - 1.5, 0.0), (vx - 2.3, 0.0)], (60, 60, 56), 0.12)              # Deichsel
    ax0, ax1 = -L / 2, vx - 2.3
    lw.kasten(ax0 + 1.2, ax0 + 2.2, -1.2, 1.2, REIFEN)                             # Anhängerachse
    holz = (128, 98, 64)
    lw.kasten(ax0, ax1, -1.1, 1.1, holz if not lw.wrack else (52, 42, 32), koerper=True)
    lw.kasten(ax0 + 0.12, ax1 - 0.12, -0.98, 0.98, hell(holz, 0.86) if not lw.wrack else (40, 34, 28))
    if not lw.wrack:
        r = np.random.default_rng(11)
        for k in range(7):                                   # Ladung: Säcke, Kisten, Koffer
            x = r.uniform(ax0 + 0.4, ax1 - 0.6)
            y = r.uniform(-0.75, 0.6)
            c = [(196, 188, 160), (90, 70, 50), (60, 80, 120), (150, 60, 50), (200, 200, 196)][k % 5]
            lw.kasten(x, x + r.uniform(0.4, 0.8), y, y + r.uniform(0.3, 0.5), c)


# ====================================================================== Zivile Fahrzeuge, Beobachter, Verwundete (seit 2.4)
FONT_FETT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _schrift(lw, text, x0, x1, y0, y1, farbe, alpha=255):
    """Text in Fahrzeugkoordinaten in das Rechteck x0..x1 (vorwärts), y0..y1 (rechts) einpassen, lesbar bei Blick nach Osten."""
    from PIL import ImageFont
    w, h = int((x1 - x0) * lw.s), int((y1 - y0) * lw.s)
    groesse = h
    font = ImageFont.truetype(FONT_FETT, groesse)
    while groesse > 6:
        font = ImageFont.truetype(FONT_FETT, groesse)
        bb = font.getbbox(text)
        if bb[2] - bb[0] <= w:
            break
        groesse -= 2
    bb = font.getbbox(text)
    maske = Image.new("L", (w, h), 0)
    ImageDraw.Draw(maske).text(((w - (bb[2] - bb[0])) / 2 - bb[0], (h - (bb[3] - bb[1])) / 2 - bb[1]), text, font=font, fill=alpha)
    farbe_img = Image.new("RGBA", (w, h), lw.farbe(farbe))
    lw.img.paste(farbe_img, (int(lw.cx + x0 * lw.s), int(lw.cy + y0 * lw.s)), maske)


def _pkw(lw, L, B, lack, dach=None):
    """Pkw in Draufsicht: Räder, Karosserie, Motorhaube, Scheiben, Dach (Farbe dach)."""
    for x in (L / 2 - 0.85, -L / 2 + 0.9):
        for sy in (-1, 1):
            lw.kasten(x - 0.33, x + 0.33, sy * (B / 2 - 0.02) - 0.12, sy * (B / 2 - 0.02) + 0.12, REIFEN if not lw.wrack else (24, 22, 20))
    b = B / 2 - 0.08
    umriss = [(L / 2, -b + 0.3), (L / 2 - 0.25, -b), (-L / 2 + 0.2, -b), (-L / 2, -b + 0.2), (-L / 2, b - 0.2), (-L / 2 + 0.2, b), (L / 2 - 0.25, b), (L / 2, b - 0.3)]
    lw.poly(umriss, lack, koerper=True)
    lw.poly([(L / 2 - 0.05, -b + 0.32), (L / 2 - 1.15, -b + 0.12), (L / 2 - 1.15, b - 0.12), (L / 2 - 0.05, b - 0.32)], hell(lack, 1.12), koerper=True)  # Haube
    glas = (36, 44, 52) if not lw.wrack else (22, 20, 18)
    lw.poly([(L / 2 - 1.15, -b + 0.14), (L / 2 - 1.75, -b + 0.2), (L / 2 - 1.75, b - 0.2), (L / 2 - 1.15, b - 0.14)], glas)        # Frontscheibe
    lw.kasten(-L / 2 + 0.12, -L / 2 + 0.45, -b + 0.22, b - 0.22, glas)                                                           # Heckscheibe
    for sy in (-1, 1):
        ya, yb = sorted((sy * (b - 0.02), sy * (b - 0.17)))
        lw.kasten(-L / 2 + 0.6, L / 2 - 1.8, ya, yb, glas)                                                                    # Seitenscheiben
        lw.ell(L / 2 - 1.2, sy * (b + 0.08), 0.1, 0.07, hell(lack, 0.7))                                                        # Spiegel
    lw.kasten(-L / 2 + 0.45, L / 2 - 1.75, -b + 0.18, b - 0.18, dach or hell(lack, 0.96), koerper=True)                       # Dach
    return b


@zeichner("pkw_zivil")
def pkw_zivil(lw, L, B, zustand=None):
    """Kombi einer Familie auf der Flucht: Dachträger mit Koffern und zusammengerollter Matratze (S8)."""
    b = _pkw(lw, L, B, (164, 46, 40))
    x0, x1 = -L / 2 + 0.55, L / 2 - 1.85
    for sy in (-1, 1):
        lw.linie([(x0, sy * (b - 0.25)), (x1, sy * (b - 0.25))], (40, 40, 40), 0.06)                                        # Dachreling
    if lw.wrack:
        for k in range(4):
            lw.ell(x0 + 0.4 + k * 0.55, (-1) ** k * 0.2, 0.3, 0.22, (30, 26, 22))                                            # verbrannte Ladung
        return
    lw.kasten(x0 + 0.05, x0 + 1.05, -b + 0.3, b - 0.3, (214, 206, 182))                                                        # Matratze
    for k in range(5):
        lw.linie([(x0 + 0.1 + k * 0.2, -b + 0.32), (x0 + 0.1 + k * 0.2, b - 0.32)], (170, 150, 130), 0.05)
    lw.kasten(x0 + 1.15, x0 + 1.75, -b + 0.28, -0.02, (58, 92, 150))                                                           # Koffer blau
    lw.kasten(x0 + 1.15, x0 + 1.75, 0.04, b - 0.3, (110, 76, 50))                                                              # Koffer braun
    lw.kasten(x1 - 0.42, x1 - 0.02, -0.35, 0.3, (60, 120, 70))                                                                 # Tasche
    for xg in (x0 + 0.5, x0 + 1.45):
        lw.linie([(xg, -b + 0.2), (xg, b - 0.2)], (28, 28, 28), 0.06)                                                          # Spanngurte


@zeichner("pkw_presse")
def pkw_presse(lw, L, B, zustand=None):
    """Geländewagen der Presse: dunkelblau, auf dem Dach groß PRESS (weiß), dazu klein auf der Haube (S8)."""
    blau = (30, 52, 108)
    b = _pkw(lw, L, B, blau, dach=hell(blau, 0.9))
    a = 255 if not lw.wrack else 70
    _schrift(lw, "PRESS", -L / 2 + 0.5, L / 2 - 1.8, -b + 0.2, b - 0.2, (248, 248, 244), a)
    _schrift(lw, "PRESS", L / 2 - 1.1, L / 2 - 0.15, -0.38, 0.38, (248, 248, 244), a)
    if not lw.wrack:
        lw.ell(-L / 2 + 0.35, 0.55, 0.16, 0.16, (200, 200, 196))                                                               # Satellitenantenne am Heck


def _ell_um(lw, x, y, rx, ry, c, hdg=0.0, n=20):
    """Ellipse um ihren eigenen Mittelpunkt gedreht (Leinwand.ell dreht um die Fahrzeugmitte)."""
    ca, sa = math.cos(math.radians(hdg)), math.sin(math.radians(hdg))
    lw.poly([(x + rx * math.cos(t) * ca - ry * math.sin(t) * sa, y + rx * math.cos(t) * sa + ry * math.sin(t) * ca)
             for t in (2 * math.pi * k / n for k in range(n))], c)


def _kasten_um(lw, x0, x1, y0, y1, c, hdg=0.0):
    """Rechteck um seinen Mittelpunkt gedreht."""
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    ca, sa = math.cos(math.radians(hdg)), math.sin(math.radians(hdg))
    lw.poly([(mx + (px - mx) * ca - (py - my) * sa, my + (px - mx) * sa + (py - my) * ca) for px, py in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))], c)


def _soldat_oben(lw, x, y, hdg, k=1.7, helm=(64, 70, 44), uniform=(104, 110, 76), verband=None, liegt=False, sitzt=False):
    """Person in Draufsicht direkt auf der Leinwand (Meter, k = Überhöhung wie die Figuren im Drohnenbild)."""
    r = math.radians(hdg)
    ca, sa = math.cos(r), math.sin(r)

    def W(px, py):
        return (x + px * ca - py * sa, y + px * sa + py * ca)
    if liegt:                                       # liegt auf dem Rücken: Rumpf, Beine, Arme
        for sy in (-1, 1):
            lw.linie([W(-0.2 * k, sy * 0.11 * k), W(-0.95 * k, sy * 0.14 * k)], hell(uniform, 0.85), 0.16 * k)               # Beine
        _ell_um(lw, *W(0.05 * k, 0), 0.34 * k, 0.21 * k, uniform, hdg)
        for sy in (-1, 1):
            lw.linie([W(0.25 * k, sy * 0.2 * k), W(-0.05 * k, sy * 0.3 * k)], hell(uniform, 0.92), 0.1 * k)
        lw.ell(*W(0.5 * k, 0), 0.13 * k, 0.12 * k, (206, 176, 146))                                                          # Kopf (ohne Helm)
    else:
        if sitzt:
            for sy in (-1, 1):
                lw.linie([W(0.0, sy * 0.1 * k), W(0.5 * k, sy * 0.12 * k)], hell(uniform, 0.85), 0.15 * k)                    # Knie
        _ell_um(lw, *W(0, 0), 0.2 * k, 0.3 * k, uniform, hdg)                                                                 # Schultern
        lw.ell(*W(0, 0), 0.14 * k, 0.14 * k, helm if helm else (206, 176, 146))
    if verband == "kopf":
        kx, ky = W(0.5 * k, 0) if liegt else W(0, 0)
        lw.ell(kx, ky, 0.12 * k, 0.11 * k, (246, 246, 240))
    elif verband == "arm":
        lw.linie([W(0.05 * k, 0.24 * k), W(0.28 * k, 0.12 * k)], (246, 246, 240), 0.12 * k)                                   # Armschlinge
    elif verband == "bein":
        lw.linie([W(-0.45 * k, 0.12 * k), W(-0.8 * k, 0.14 * k)], (246, 246, 240), 0.17 * k)
    elif verband == "brust":
        q = W(0.02 * k, 0)
        _kasten_um(lw, q[0] - 0.13 * k, q[0] + 0.13 * k, q[1] - 0.17 * k, q[1] + 0.17 * k, (246, 246, 240), hdg)


@zeichner("beobachter_trupp")
def beobachter_trupp(lw, L, B, zustand=None):
    """Zwei Soldaten auf der Turmplattform (Blick nach vorn = Osten im Sprite): einer mit Fernglas, einer mit Funkgerät
    und Antenne, dazu Spektiv auf Dreibein und Karte. Getroffen (Wrack): nur zurückgelassenes Gerät, keine Personen."""
    funk = (52, 62, 44)
    if lw.wrack:
        _kasten_um(lw, -0.9, -0.4, 0.2, 0.62, funk, 35)                                                                        # Funkgerät umgestürzt
        lw.linie([(-0.6, 0.4), (0.4, 1.0)], (30, 30, 28), 0.04)                                                               # Antenne abgeknickt
        lw.kasten(0.3, 0.55, -0.6, -0.42, (30, 32, 30))                                                                        # Fernglas am Boden
        _kasten_um(lw, -0.2, 0.3, -0.2, 0.15, (200, 196, 176), -20)                                                            # Karte
        return
    # Spektiv auf Dreibein, an der Brüstung (vorn)
    for a in (0, 120, 240):
        q = math.radians(a)
        lw.linie([(0.95, 0.55), (0.95 + 0.38 * math.cos(q), 0.55 + 0.38 * math.sin(q))], (36, 36, 34), 0.04)
    lw.linie([(0.85, 0.55), (1.3, 0.55)], (44, 46, 42), 0.11)
    # Soldat 1 mit Fernglas (vorn links)
    _soldat_oben(lw, 0.45, -0.5, 0)
    for sy in (-0.66, -0.34):
        lw.linie([(0.45, -0.5 + (sy + 0.5) * 2.2), (0.95, sy)], (104, 110, 76), 0.13)                                          # Arme nach vorn
    lw.kasten(0.92, 1.22, -0.72, -0.56, (20, 20, 18))                                                                          # Fernglas: zwei Tuben
    lw.kasten(0.92, 1.22, -0.44, -0.28, (20, 20, 18))
    lw.kasten(0.98, 1.12, -0.56, -0.44, (20, 20, 18))
    # Soldat 2 mit Funkgerät (hinten rechts), Hörer am Ohr, Antenne nach hinten
    _soldat_oben(lw, -0.35, 0.45, 10)
    lw.kasten(-0.98, -0.62, 0.22, 0.68, funk)                                                                                  # Funkgerät (Tornister)
    lw.kasten(-0.92, -0.68, 0.28, 0.4, hell(funk, 1.3))
    lw.linie([(-0.9, 0.3), (-1.45, -0.55)], (24, 24, 22), 0.035)                                                               # Antenne (Stab)
    lw.ell(-1.45, -0.55, 0.05, 0.05, (24, 24, 22))
    lw.linie([(-0.75, 0.45), (-0.25, 0.62)], (24, 24, 22), 0.03)                                                               # Hörerkabel
    _kasten_um(lw, -0.15, 0.3, -1.05, -0.72, (206, 200, 176), -12)                                                             # Karte auf der Brüstung


@zeichner("verwundete")
def verwundete(lw, L, B, zustand=None):
    """Vier verwundete Soldaten ohne Waffen neben dem Wrack (S6): zwei liegen (einer auf einer Trage), zwei sitzen,
    alle mit weißen Verbänden; Verbandstasche offen. Getroffen: nur Trage und Verbandszeug, keine Personen."""
    weiss = (246, 246, 240)
    if lw.wrack:
        lw.kasten(-1.6, 0.6, 0.55, 1.15, (96, 100, 72))                                                                        # Trage, leer
        for k in range(5):
            lw.ell(-1.8 + k * 0.8, -1.0 + (k % 2) * 0.4, 0.12, 0.08, weiss)                                                   # Verbandsreste
        lw.kasten(1.2, 1.7, -0.5, -0.1, (74, 80, 54))
        return
    lw.kasten(-1.75, 0.75, 0.48, 1.22, (96, 100, 72))                                                                          # Trage
    for sy in (0.5, 1.2):
        lw.linie([(-1.95, sy), (0.95, sy)], (60, 58, 46), 0.06)                                                                 # Holme
    _soldat_oben(lw, -0.45, 0.85, 180, verband="brust", liegt=True, helm=None)
    _soldat_oben(lw, -0.6, -0.95, 165, verband="bein", liegt=True, helm=None)
    _soldat_oben(lw, 1.35, 0.95, 200, verband="kopf", sitzt=True, helm=None)
    _soldat_oben(lw, 1.45, -0.55, 150, verband="arm", sitzt=True)
    lw.kasten(0.55, 1.0, -1.45, -1.12, (74, 80, 54))                                                                           # Verbandstasche offen
    lw.kasten(0.62, 0.93, -1.4, -1.17, weiss)
    for (x, y) in ((0.25, -1.6), (2.05, 0.2), (-2.2, -0.2)):
        lw.ell(x, y, 0.1, 0.07, weiss)                                                                                         # Verbandspäckchen


# ====================================================================== Personen
PERSON_FARBEN = {
    "zivil": [(170, 46, 44), (52, 86, 150), (196, 182, 150), (220, 220, 214), (88, 70, 56), (120, 140, 70)],
    "soldat": [(62, 68, 42), (70, 74, 46), (56, 62, 40)],
    "besatzung_ergibt_sich": [(64, 66, 52), (70, 72, 58)],
    "sanitaet": [(86, 92, 62)],
}
HAARE = [(40, 30, 24), (90, 64, 40), (196, 170, 110), (30, 28, 26), (130, 124, 116)]


def person(art, s, rng, klein=False, haende_hoch=False, tuch=False, hdg=0.0, farbe=None, haar=None):
    """Person in Draufsicht auf eigener Leinwand (RGBA), Mitte = Person. s = Pixel je Meter (ohne Überabtastung).
    farbe/haar: feste Indizes (Sprite-Varianten im Atlas); sonst Zufall aus rng (Drohnenbilder)."""
    k = 0.72 if klein else 1.0
    lw = Leinwand(0.95, 0.95, s * SS, rng=rng)
    farben = PERSON_FARBEN.get(art, PERSON_FARBEN["zivil"])
    c = farben[rng.integers(len(farben)) if farbe is None else farbe % len(farben)]
    rot = hdg
    lw.dr.ellipse(lw.P([(-0.24 * k, -0.34 * k)], rot=0) + lw.P([(0.24 * k, 0.34 * k)], rot=0), fill=(20, 20, 18, 110))   # Kontur
    lw.ell(0.0, 0.0, 0.2 * k, 0.3 * k, c, rot=rot)                                  # Schultern
    if haende_hoch:
        for sy in (-1, 1):
            lw.ell(0.03 * k, sy * 0.27 * k, 0.08 * k, 0.08 * k, (206, 176, 146), rot=rot)
    if art in ("soldat", "sanitaet"):
        lw.ell(0.0, 0.0, 0.14 * k, 0.14 * k, hell(c, 0.82), rot=rot)               # Helm
        if art == "sanitaet":
            lw.ell(0.0, 0.0, 0.055, 0.055, (236, 236, 230), rot=rot)
    else:
        lw.ell(0.0, 0.0, 0.12 * k, 0.12 * k, HAARE[rng.integers(len(HAARE)) if haar is None else haar % len(HAARE)], rot=rot)
    if tuch:
        lw.kasten(-0.05, 0.3, 0.32, 0.85, (248, 248, 244), rot=rot)
        lw.linie([(0.0, 0.25), (0.0, 0.34)], (206, 176, 146), 0.06, rot=rot)
    return lw.ergebnis()


def person_variante(art, farbe, klein=False, tuch=False):
    """Name der Personen-Variante im Fahrzeug-Atlas (Figuren der Live-Drohnenbilder, Schritt 5b)."""
    n = len(PERSON_FARBEN.get(art, PERSON_FARBEN["zivil"]))
    teil = {"besatzung_ergibt_sich": "besatzung"}.get(art, art)
    return f"person_{teil}{'_kind' if klein else ''}{'_tuch' if tuch else ''}_c{farbe % n}.png"


def person_varianten():
    """Alle Varianten: je Kleidungsfarbe, Zivilpersonen auch als Kind, Besatzung mit und ohne weißes Tuch."""
    out = []
    for art, farben in PERSON_FARBEN.items():
        for c in range(len(farben)):
            for klein in ((False, True) if art == "zivil" else (False,)):
                for tuch in ((False, True) if art == "besatzung_ergibt_sich" else (False,)):
                    out.append(dict(art=art, farbe=c, klein=klein, tuch=tuch, haende_hoch=art == "besatzung_ergibt_sich"))
    return out


# Sprites mit feinen Merkmalen (Schrift PRESS, Verbände, Fernglas) in doppelter Auflösung im Atlas (seit 2.4); Karte
# und Live-Drohnenbild skalieren je Rahmen mit dessen px_pro_m.
SPRITE_PX_PRO_M = {"pkw_zivil": 24, "pkw_presse": 24, "beobachter_trupp": 24, "verwundete": 24}

# Zustände, die das Fahrzeug selbst verändern (eigene Sprites); „feuert“ ist ein Effekt (muendungsblitz),
# „kisten“ liegt am Boden, „furt“ ist Gischt im Standbild.
ZUSTAND_SPRITES = {"kpz_t72": ("luk_offen", "kette_ab"), "kpz_pt91": ("luk_offen", "kette_ab"), "spaehpz_brdm2": ("luk_offen",)}


def zustand_sprite(sprite, zustand):
    return sprite.replace(".png", f"_{zustand}.png")


# ====================================================================== Ausdehnung und Sprites
def ausdehnung(typ, L, B, wrack=False):
    """Halbe Leinwandgröße in Metern (vorn/hinten symmetrisch), inkl. Rohr und Rand."""
    vorn = L / 2 + {"kpz_t72": 2.7, "kpz_pt91": 2.7, "spz_bmp2": 1.1, "spw_btr80": 0.95, "attrappe_kpz": 1.9,
                    "spaehpz_brdm2": 0.1, "spz_eigen": 1.25}.get(typ, 0.0)
    hinten = L / 2 + (0.6 if typ in ("kpz_t72", "kpz_pt91") else 0.0)
    hy = B / 2 + (1.3 if typ in ("kpz_t72", "kpz_pt91") else 0.1)
    if typ == "eloka_lkw":
        vorn, hy = max(vorn, 3.6), max(hy, 3.3)
    if typ in ("verwundete", "beobachter_trupp"):
        vorn, hinten, hy = vorn + 0.6, hinten + 0.6, hy + 0.5
    hx = max(vorn, hinten) + 0.3
    hy += 0.3
    if wrack:
        hx, hy = hx + 1.8, hy + 1.8
    return hx, hy


def fahrzeug(typ, groesse, s, wrack=False, zustand=None, seed=0, licht=(-0.7, -0.7)):
    """Sprite (RGBA, Blick nach Osten, Mitte = Fahrzeugmitte). s = Pixel je Meter."""
    L, B = groesse
    hx, hy = ausdehnung(typ, L, B, wrack)
    rng = np.random.default_rng(seed)
    lw = Leinwand(hx, hy, s * SS, wrack=wrack, rng=rng, licht=licht)
    if wrack:
        _brandfleck(lw, L, B, rng)
    ZEICHNER[typ](lw, L, B, zustand=zustand)
    if wrack and typ not in ("verwundete", "beobachter_trupp"):      # Personen-Gruppen: nur liegengebliebenes Gerät
        _truemmer(lw, L, B, rng)
    return lw.ergebnis()


def _brandfleck(lw, L, B, rng):
    """Verbrannte Erde unter dem Wrack (weich, unregelmäßig)."""
    m = Image.new("L", (lw.w, lw.h), 0)
    dm = ImageDraw.Draw(m)
    for _ in range(14):
        cx, cy = rng.uniform(-L * 0.35, L * 0.35), rng.uniform(-B * 0.4, B * 0.4)
        rx, ry = rng.uniform(1.0, 2.2), rng.uniform(0.8, 1.8)
        dm.ellipse([lw.cx + (cx - rx) * lw.s, lw.cy + (cy - ry) * lw.s, lw.cx + (cx + rx) * lw.s, lw.cy + (cy + ry) * lw.s], fill=150)
    m = m.filter(ImageFilter.GaussianBlur(0.9 * lw.s))
    fleck = Image.new("RGBA", (lw.w, lw.h), (26, 24, 22, 255))
    fleck.putalpha(m)
    lw.img.alpha_composite(fleck)


def _truemmer(lw, L, B, rng):
    for _ in range(int(10 + L * 3)):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.4, 1.0)
        x, y = math.cos(a) * (L / 2 + 1.2) * r, math.sin(a) * (B / 2 + 1.2) * r
        c = [(52, 50, 44), (70, 66, 56), (30, 28, 26), (96, 70, 48)][rng.integers(4)]
        sz = rng.uniform(0.08, 0.28)
        lw.dr.polygon(lw.P([(x - sz, y - sz * 0.6), (x + sz, y - sz * 0.3), (x + sz * 0.5, y + sz), (x - sz * 0.8, y + sz * 0.5)]), fill=c + (255,))
    for _ in range(2):                                          # Glut
        x, y = rng.uniform(-L / 3, L / 3), rng.uniform(-B / 3, B / 3)
        r = rng.uniform(0.04, 0.08)
        lw.dr.ellipse(lw.P([(x - r, y - r)]) + lw.P([(x + r, y + r)]), fill=(220, 110, 40, 200))


# ====================================================================== Luftfahrzeuge (nur Sprites)
EXTRA = {}


def extra(name, groesse):
    def reg(f):
        EXTRA[name] = (f, groesse)
        return f
    return reg


@extra("lm_flugkoerper", (2.2, 2.4))
def lm_flugkoerper(lw, L, B, zustand=None):
    """Loitering Munition (frei gestaltet): schlanker Rumpf, X-Flügel."""
    grau = (96, 100, 96)
    for s in (-1, 1):
        lw.poly([(0.25, 0.0), (-0.05, s * 1.15), (-0.3, s * 1.15), (-0.05, 0.0)], hell(grau, 0.9))
        lw.poly([(-0.65, 0.0), (-0.85, s * 0.55), (-1.0, s * 0.55), (-0.85, 0.0)], hell(grau, 0.85))
    lw.ell(0.0, 0.0, 1.05, 0.12, grau)
    lw.ell(0.95, 0.0, 0.12, 0.08, (40, 44, 48))


@extra("uav_milan", (3.0, 4.4))
def uav_milan(lw, L, B, zustand=None):
    """Aufklärungsdrohne (frei gestaltet): Hochdecker mit Doppelleitwerk."""
    hellgrau = (176, 180, 178)
    lw.poly([(0.35, -2.2), (0.75, -2.2), (0.75, 2.2), (0.35, 2.2)], hellgrau)                    # Tragfläche
    lw.ell(0.2, 0.0, 1.4, 0.2, hell(hellgrau, 0.95))                                            # Rumpf
    for s in (-1, 1):
        lw.linie([(0.4, s * 0.55), (-1.25, s * 0.55)], hell(hellgrau, 0.8), 0.08)               # Leitwerksträger
    lw.kasten(-1.45, -1.2, -0.75, 0.75, hellgrau)                                                # Höhenleitwerk
    lw.ell(1.55, 0.0, 0.1, 0.1, (40, 44, 48))                                                    # Kamera
    lw.linie([(-1.25, -0.0), (-1.4, 0.0)], (60, 60, 60), 0.5)                                    # Propeller (Heck)


def extra_sprite(name, s, seed=0):
    f, (L, B) = EXTRA[name]
    lw = Leinwand(max(L, B) / 2 + 0.3, max(L, B) / 2 + 0.3, s * SS, rng=np.random.default_rng(seed))
    f(lw, L, B)
    return lw.ergebnis()
