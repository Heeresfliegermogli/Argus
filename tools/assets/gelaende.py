"""Gelände Raum KRÄHE als Rasterbild (Luftbild-Optik), erzeugt aus karte_kraehe.json.

Weiterentwicklung von gen_raum_kraehe.py (Schritt 1/2): gleiche Verfahren für Felder, Wege,
Wald und Gebäude, aber
  * Straßen, Wege, Bach, Wald, Hof, Schule und Gebäude kommen aus der Kartendatei,
  * Einzelhäuser nach der Regel karte.bebauung, mit Abstand zu allen Zielen und Personen,
  * Baumgruppen bei Zielen, deren Drohnenbild „Bäume“ als Sichtstörung hat (z. B. Z-04),
    freie Sicht bei allen anderen gemeldeten Zielen,
  * Boden und Baumkronen bleiben getrennte Ebenen, damit Fahrzeuge im Drohnenbild unter den
    Kronen liegen können.

Alles prozedural und mit festem Seed: gleiche Daten ⇒ gleiches Bild.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import binary_dilation, gaussian_filter, grey_dilation, zoom

from daten import Daten, dist, dist_polylinie, drehe, im_polygon, linie_punkte, position, rechteck

DACH = [(148, 68, 50), (132, 62, 48), (112, 72, 58), (72, 74, 78), (150, 152, 150)]
AUTOS = [(176, 30, 30), (210, 212, 214), (40, 44, 52), (90, 96, 110), (200, 200, 196)]
KRONEN = np.array([(32, 50, 33), (38, 56, 36), (44, 62, 40), (28, 44, 30),       # Nadelbäume
                   (150, 128, 58), (126, 108, 50), (116, 86, 46), (98, 96, 50),   # Laub, herbstlich
                   (86, 96, 52), (128, 78, 44)], np.float32)
FELDER = {
    "plow": dict(base=(108, 88, 68), amp=17, per=1.5),
    "stubble": dict(base=(168, 151, 108), amp=9, per=0.9),
    "winter": dict(base=(96, 112, 66), amp=0, per=1.3),
    "meadow": dict(base=(92, 110, 64), amp=4, per=7.0),
    "fallow": dict(base=(120, 117, 78), amp=0, per=1.0),
}


def farbton(c, f, a=255):
    return tuple(int(max(0, min(255, v * f))) for v in c[:3]) + (a,)


def stadion(w, h, n=16):
    r = h / 2
    pts = []
    for k in range(n + 1):
        a = -math.pi / 2 + math.pi * k / n
        pts.append((w / 2 - r + r * math.cos(a), r * math.sin(a)))
    for k in range(n + 1):
        a = math.pi / 2 + math.pi * k / n
        pts.append((-w / 2 + r + r * math.cos(a), r * math.sin(a)))
    return pts


def huelle(pts):
    """Konvexe Hülle (Monotone Chain)."""
    P = sorted(set(map(tuple, pts)))
    if len(P) < 3:
        return P

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def schlagschatten(poly_px, dx, dy):
    return huelle(list(poly_px) + [(x + dx, y + dy) for x, y in poly_px])


def bewertung(bild, faktor=0.93, versatz=(14, 15, 18)):
    """Leichter Dunst und Kontrast für alle Luftbilder (wie im Original)."""
    return bild * faktor + np.array(versatz, np.float32)


class Gelaende:
    """Boden (RGB) und Kronen (RGBA) in res m/px für den ganzen Kartenausschnitt."""

    def __init__(self, d: Daten, res=0.25, seed=42, log=print):
        self.d = d
        self.res = res
        self.W = int(round(d.breite_m / res))
        self.H = int(round(d.hoehe_m / res))
        self.rng = np.random.default_rng(seed)
        self.log = log
        self.haeuser = []          # (cx, cy, laenge, tiefe, winkel, dachfarbe)
        self.baumgruppen = []      # Ziele mit Baumgruppe
        self._sperren()
        self._erzeuge()

    # ------------------------------------------------------------------ Hilfen
    def M(self, v):
        return v / self.res

    def PT(self, p):
        return (p[0] / self.res, p[1] / self.res)

    def PTS(self, ps):
        return [self.PT(p) for p in ps]

    def rauschen(self, zelle_m, seed, oktaven=4, pers=0.5):
        r = np.random.default_rng(seed)
        H, W = self.H, self.W
        out = np.zeros((H, W), np.float32)
        amp, c = 1.0, zelle_m / self.res
        for _ in range(oktaven):
            gh, gw = int(H / c) + 4, int(W / c) + 4
            g = r.standard_normal((gh, gw)).astype(np.float32)
            z = zoom(g, c, order=3, prefilter=False)[:H, :W] if c > 1.01 else g[:H, :W]
            out += amp * z
            amp *= pers
            c = max(c / 2.0, 1.0)
        out -= out.mean()
        out /= out.std() + 1e-6
        return out

    def maske(self, zeichne):
        im = Image.new("L", (self.W, self.H), 0)
        zeichne(ImageDraw.Draw(im))
        return np.asarray(im, np.float32) / 255.0

    def poly_maske(self, poly):
        return self.maske(lambda dr: dr.polygon(self.PTS(poly), fill=255))

    def linien_maske(self, pts, breite_m):
        return self.maske(lambda dr: dr.line(self.PTS(pts), fill=255, width=max(1, int(self.M(breite_m))), joint="curve"))

    @staticmethod
    def mische(basis, farbe, a):
        a = a[..., None]
        return basis * (1 - a) + np.asarray(farbe, np.float32) * a

    # ------------------------------------------------------------------ Sperrflächen
    def _sperren(self):
        """Wo keine Häuser und keine Bäume stehen dürfen, damit Ziele im Bild frei bleiben."""
        d = self.d
        sicht_baeume = set()
        for m in d.szenario["meldungen"]:
            if any(s["art"] == "baeume" and s["lage"] == "Ziel" for s in m["bild"].get("sicht") or []):
                sicht_baeume.update(m["ziele"])
        self.frei = []      # (x, y, radius) ohne Bäume
        self.haus_frei = []  # (x, y, radius) ohne Häuser
        gesehen = set()
        for z, p, m in d.meldepositionen():
            l, b = d.groesse(z)
            r = max(l, b) / 2
            key = (z["id"], round(p[0]), round(p[1]))
            if key in gesehen:
                continue
            gesehen.add(key)
            self.haus_frei.append((p[0], p[1], r + 8))
            if z["id"] in sicht_baeume:
                self.frei.append((p[0], p[1], r + 0.5))
                self.baumgruppen.append((z["id"], p, r))
            else:
                self.frei.append((p[0], p[1], r + 4.0))
        for z in d.szenario["ziele"]:
            l, b = d.groesse(z)
            self.haus_frei.append((z["pos"][0], z["pos"][1], max(l, b) / 2 + 8))
            for pe in z.get("personen") or []:
                for t in (pe.get("ab_s") or 0, 1500):
                    q = position(pe, t) if pe.get("bewegung") else pe["pos"]
                    self.frei.append((q[0], q[1], 5.0))
                    self.haus_frei.append((q[0], q[1], 6.0))
        self.flaechen_frei = [f["punkte"] for f in d.flaechen("schule") + d.flaechen("hof")]

    def haus_erlaubt(self, cx, cy, groesse):
        for h in self.haeuser:
            if math.hypot(h[0] - cx, h[1] - cy) < 15:
                return False
        for x, y, r in self.haus_frei:
            if math.hypot(x - cx, y - cy) < r + groesse / 2:
                return False
        for poly in self.flaechen_frei:
            if im_polygon((cx, cy), poly) or min(dist((cx, cy), q) for q in poly) < 8:
                return False
        for g in self.d.gebaeude():
            if math.hypot(g["mitte"][0] - cx, g["mitte"][1] - cy) < max(g["laenge"], g["breite"]) / 2 + 10:
                return False
        for l, pts in self.d.linien("strasse"):
            if dist_polylinie((cx, cy), pts) < l["breite_m"] / 2 + groesse / 2 + 2:
                return False
        return True

    # ------------------------------------------------------------------ Aufbau
    def _erzeuge(self):
        d, rng, H, W, M = self.d, self.rng, self.H, self.W, self.M
        self.log("Gelände: Felder …")
        nx, ny = 7, 5
        xs = np.linspace(-60, d.breite_m + 60, nx + 1)
        ys = np.linspace(-60, d.hoehe_m + 60, ny + 1)
        V = np.zeros((ny + 1, nx + 1, 2))
        for j in range(ny + 1):
            for i in range(nx + 1):
                V[j, i] = (xs[i] + (rng.uniform(-38, 38) if 0 < i < nx else 0),
                           ys[j] + (rng.uniform(-30, 30) if 0 < j < ny else 0))
        self.feldraster = V
        felder = []
        typen, gewichte = list(FELDER), [0.27, 0.22, 0.24, 0.17, 0.10]
        for j in range(ny):
            for i in range(nx):
                a, b, c, dd = V[j, i], V[j, i + 1], V[j + 1, i + 1], V[j + 1, i]
                k = rng.choice([1, 1, 2, 3])
                quer = rng.random() < 0.5
                for s in range(k):
                    t0, t1 = s / k, (s + 1) / k
                    if quer:
                        poly = [a + (dd - a) * t0, b + (c - b) * t0, b + (c - b) * t1, a + (dd - a) * t1]
                        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
                    else:
                        poly = [a + (b - a) * t0, a + (b - a) * t1, dd + (c - dd) * t1, dd + (c - dd) * t0]
                        ang = math.degrees(math.atan2(dd[1] - a[1], dd[0] - a[0]))
                    felder.append(([tuple(p) for p in poly], rng.choice(typen, p=gewichte), ang + rng.uniform(-3, 3)))

        idim = Image.new("I", (W, H), 0)
        dr = ImageDraw.Draw(idim)
        for n, (poly, _, _) in enumerate(felder):
            dr.polygon(self.PTS(poly), fill=n + 1)
        ids = np.asarray(idim, np.int32)
        nf = len(felder) + 1
        ftyp = np.array(["meadow"] + [f[1] for f in felder])
        fwin = np.radians(np.array([0.0] + [f[2] for f in felder], np.float32))
        fvers = rng.uniform(-9, 9, nf).astype(np.float32)

        Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
        th = fwin[ids]
        v = -X * np.sin(th) + Y * np.cos(th)
        del th
        self.n_mot = n_mot = self.rauschen(7, 1)
        self.n_fein = n_fein = self.rauschen(1.2, 2, oktaven=3)
        n_gross = self.rauschen(40, 3, oktaven=3)

        boden = np.zeros((H, W, 3), np.float32)
        typ_px = ftyp[ids]
        for t, sp in FELDER.items():
            m = typ_px == t
            if not m.any():
                continue
            s = np.sin(2 * np.pi * v[m] / M(sp["per"]))
            if t == "plow":
                s = np.sign(s) * np.abs(s) ** 0.5
            col = np.array(sp["base"], np.float32)[None, :] + (sp["amp"] * s)[:, None]
            if t == "winter":
                erde = np.array([112, 94, 72], np.float32)
                w = (0.5 + 0.5 * np.sin(2 * np.pi * v[m] / M(sp["per"])))[:, None] * 0.75
                col = erde * (1 - w) + np.array(sp["base"], np.float32) * w
            if t == "stubble":
                col += (6 * np.sin(2 * np.pi * v[m] / M(6.5)))[:, None]
            col += (fvers[ids[m]] + 9 * n_mot[m] + 6 * n_fein[m] + 5 * n_gross[m])[:, None]
            boden[m] = col
        del n_gross
        # Fahrgassen
        tram = np.zeros((H, W), bool)
        ph = np.mod(v, M(20.0))
        for t in ("winter", "stubble"):
            m = typ_px == t
            tram |= m & ((np.abs(ph - M(9.1)) < M(0.28)) | (np.abs(ph - M(10.9)) < M(0.28)))
        boden[tram] = boden[tram] * 0.82 + np.array([20, 16, 10], np.float32)
        del v, ph, tram, typ_px
        # Feldraine
        e = (ids != np.roll(ids, 1, 0)) | (ids != np.roll(ids, 1, 1))
        e = binary_dilation(e, iterations=int(M(1.0)))
        boden = self.mische(boden, (92, 106, 64), (e * (0.8 + 0.1 * n_fein)).astype(np.float32))
        del e, ids

        # -------------------------------------------------------------- Ortschaft
        self.log("Gelände: Ortschaft …")
        beb = d.karte.get("bebauung") or {}
        ab = beb.get("abstand_m", [13, 21])
        schritt = beb.get("schritt_m", 17)
        for abschnitt in beb.get("abschnitte", []):
            l = next(l for l in d.karte["linien"] if l["id"] == abschnitt["linie"])
            pts = np.array(linie_punkte(l))
            proben, letzte = [], None
            for k in range(1, len(pts) - 1):
                x, y = pts[k]
                if not (abschnitt.get("x_von", -1e9) <= x <= abschnitt.get("x_bis", 1e9)):
                    continue
                if not (abschnitt.get("y_von", -1e9) <= y <= abschnitt.get("y_bis", 1e9)):
                    continue
                tx, ty = pts[k + 1] - pts[k - 1]
                Lg = math.hypot(tx, ty)
                if letzte is None or math.hypot(x - letzte[0], y - letzte[1]) >= schritt:
                    proben.append((x, y, tx / Lg, ty / Lg))
                    letzte = (x, y)
            for (x, y, tx, ty) in proben:
                for seite in (-1, 1):
                    off = rng.uniform(*ab)
                    nxv, nyv = -ty * seite, tx * seite
                    cx, cy = x + nxv * off, y + nyv * off
                    ang = math.degrees(math.atan2(ty, tx)) + (90 if rng.random() < 0.25 else 0)
                    w_, t_ = rng.uniform(10, 14), rng.uniform(8, 10)
                    dach = DACH[rng.choice(len(DACH), p=[0.35, 0.2, 0.2, 0.15, 0.1])]
                    if self.haus_erlaubt(cx, cy, max(w_, t_)):
                        self.haeuser.append((cx, cy, w_, t_, ang, dach))

        garten = self.maske(lambda dr: [dr.polygon(self.PTS(drehe(rechteck(-h[2] / 2 - 7, h[2] / 2 + 7, -h[3] / 2 - 8, h[3] / 2 + 12),
                                                                    (h[0], h[1]), h[4])), fill=255) for h in self.haeuser])
        boden = self.mische(boden, (98, 116, 70), np.clip(gaussian_filter(garten, 2), 0, 1) * (0.85 + 0.1 * n_mot))
        for f in d.flaechen("hof"):
            boden = self.mische(boden, (128, 122, 104), gaussian_filter(self.poly_maske(f["punkte"]), 2) * (0.9 + 0.05 * n_fein))
        for f in d.flaechen("schule"):
            rasen = gaussian_filter(self.poly_maske(f["punkte"]), 2)
            boden = self.mische(boden, (90, 114, 66), np.clip(rasen, 0, 1) * (0.92 + 0.05 * n_mot))
        for f in d.flaechen("pflaster"):
            boden = self.mische(boden, (150, 144, 128), self.poly_maske(f["punkte"]) * (0.95 + 0.03 * n_fein))
        for f in d.flaechen("parkplatz"):
            boden = self.mische(boden, (92, 92, 94), self.poly_maske(f["punkte"]))
        for g in d.gebaeude("sportplatz"):
            boden = self._sportplatz(boden, g, X, Y, n_fein)
        del X, Y

        # -------------------------------------------------------------- Wege, Straßen, Bach
        self.log("Gelände: Straßen …")
        n_str = self.rauschen(3, 5, oktaven=3)
        for l, pts in d.linien("feldweg"):
            mm = gaussian_filter(self.linien_maske(pts, l["breite_m"]), 1.2)
            boden = self.mische(boden, (148, 128, 98), np.clip(mm, 0, 1) * (0.9 + 0.05 * n_fein))
            mitte = gaussian_filter(self.linien_maske(pts, 0.8), 1.0)
            boden = self.mische(boden, (102, 108, 70), np.clip(mitte, 0, 1) * 0.8)
        for l, pts in d.linien("strasse"):
            wr = l["breite_m"]
            rand = gaussian_filter(self.linien_maske(pts, wr + 2.6), 1.5)
            boden = self.mische(boden, (138, 130, 112), np.clip(rand, 0, 1) * 0.85)
            rm = gaussian_filter(self.linien_maske(pts, wr), 0.8)
            belag = np.stack([86 + 6 * n_str + 3 * n_fein] * 3, -1) + np.array([0, 0, 3], np.float32)
            boden = boden * (1 - rm[..., None]) + belag * rm[..., None]
        del n_str
        for l, pts in d.linien("gewaesser"):
            ufer = gaussian_filter(self.linien_maske(pts, l["breite_m"] * 2.2), 2.0)
            wasser = gaussian_filter(self.linien_maske(pts, l["breite_m"]), 1.0)
            boden = self.mische(boden, (70, 84, 52), np.clip(ufer, 0, 1) * 0.7)
            boden = self.mische(boden, (46, 58, 56), np.clip(wasser, 0, 1))
        for p in d.karte.get("punkte", []):
            if p["art"] == "bruecke":
                boden = self._bruecke(boden, p)
            elif p["art"] == "furt":
                fm = gaussian_filter(self.maske(lambda dr: dr.ellipse([self.M(p["pos"][0] - 6), self.M(p["pos"][1] - 3.5),
                                                                      self.M(p["pos"][0] + 6), self.M(p["pos"][1] + 3.5)], fill=255)), 3)
                boden = self.mische(boden, (126, 118, 96), np.clip(fm, 0, 1) * 0.6)

        # -------------------------------------------------------------- Bäume
        self.log("Gelände: Wald und Bäume …")
        self._baeume(boden)
        boden = boden * (1 - 0.38 * self._baumschatten)[..., None]
        del self._baumschatten

        # -------------------------------------------------------------- Gebäude
        self.log("Gelände: Gebäude …")
        self.boden = self._gebaeude(np.clip(boden, 0, 255).astype(np.uint8))

    def _sportplatz(self, boden, g, X, Y, n_fein):
        sx, sy = g["mitte"]
        sw, sh, sa = g["laenge"], g["breite"], g["winkel"]
        o = Image.new("L", (self.W, self.H), 0)
        i = Image.new("L", (self.W, self.H), 0)
        li = Image.new("L", (self.W, self.H), 0)
        do, di, dl = ImageDraw.Draw(o), ImageDraw.Draw(i), ImageDraw.Draw(li)
        do.polygon(self.PTS(drehe(stadion(sw, sh), (sx, sy), sa)), fill=255)
        di.polygon(self.PTS(drehe(stadion(sw - 14, sh - 14), (sx, sy), sa)), fill=255)
        pw, ph = sw - 22, sh - 18
        seg = rechteck(-pw / 2, pw / 2, -ph / 2, ph / 2)
        dl.line(self.PTS(drehe(seg + [seg[0]], (sx, sy), sa)), fill=255, width=2)
        dl.line(self.PTS(drehe([(0, -ph / 2), (0, ph / 2)], (sx, sy), sa)), fill=255, width=2)
        dl.ellipse([self.M(sx - 6), self.M(sy - 6), self.M(sx + 6), self.M(sy + 6)], outline=255, width=2)
        mo, mi, ml = (np.asarray(x, np.float32) / 255 for x in (o, i, li))
        boden = self.mische(boden, (168, 82, 64), np.clip(mo - mi, 0, 1) * (0.92 + 0.04 * n_fein))
        streifen = (np.sin(2 * np.pi * (X * math.cos(math.radians(sa)) + Y * math.sin(math.radians(sa))) / self.M(10)) > 0)
        rasen = np.empty((self.H, self.W, 3), np.float32)
        rasen[..., 0], rasen[..., 1], rasen[..., 2] = 70, 118, 60
        rasen += (streifen * 8)[..., None]
        boden = boden * (1 - mi[..., None]) + rasen * mi[..., None]
        return self.mische(boden, (225, 228, 222), np.clip(ml * mi, 0, 1) * 0.85)

    def _bruecke(self, boden, p):
        # Fahrbahn über dem Bach etwas heller, Brüstungen als helle Kanten
        l = next(l for l, pts in self.d.linien("strasse") if dist_polylinie(p["pos"], pts) < 10)
        pts = next(pts for l2, pts in self.d.linien("strasse") if l2 is l)
        k = min(range(len(pts)), key=lambda i: dist(pts[i], p["pos"]))
        a, b = pts[max(k - 1, 0)], pts[min(k + 1, len(pts) - 1)]
        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
        w = l["breite_m"]
        deck = self.poly_maske(drehe(rechteck(-9, 9, -w / 2 - 0.9, w / 2 + 0.9), p["pos"], ang))
        boden = self.mische(boden, (122, 120, 114), deck)
        for s in (-1, 1):
            kante = self.poly_maske(drehe(rechteck(-9, 9, s * (w / 2 + 0.4) - 0.35, s * (w / 2 + 0.4) + 0.35), p["pos"], ang))
            boden = self.mische(boden, (186, 182, 172), kante)
        return boden

    def _baeume(self, boden):
        d, rng, H, W, M = self.d, self.rng, self.H, self.W, self.M
        wald = sum(self.poly_maske(f["punkte"]) for f in d.flaechen("wald"))
        wald = gaussian_filter(wald, M(5))
        # Waldrand ausfransen; abseits der Wälder nur selten ein Feldgehölz
        wald = (wald + np.where(wald > 0.02, 0.22, 0.15) * self.rauschen(9, 11, oktaven=3)) > 0.5
        Hh, Wh = H // 2, W // 2
        spec = (1 / (1 + np.exp(-2.4 * self.rauschen(18, 21, oktaven=3))))[::2, ::2]
        imp = np.full((Hh, Wh), -60.0, np.float32)
        wh = wald[::2, ::2]
        pick = (rng.random((Hh, Wh)) < 1.0 / (2.2 / (2 * self.res)) ** 2) & wh
        n_ = int(pick.sum())
        nadel = rng.random(n_) < spec[pick]
        art = np.where(nadel, rng.integers(0, 4, n_), rng.integers(4, 10, n_))
        imp[pick] = (np.round(rng.uniform(16, 21, n_), 2) + art / 1000.0).astype(np.float32)
        del pick, spec

        def baum(x, y, h=None):
            xi, yi = int(M(x) / 2), int(M(y) / 2)
            if 0 <= xi < Wh and 0 <= yi < Hh:
                hv = round(h * 26 if h is not None else rng.uniform(20, 26), 2) + int(rng.integers(4, 10)) / 1000.0
                imp[yi, xi] = max(imp[yi, xi], hv)

        V = self.feldraster
        ny, nx = V.shape[0] - 1, V.shape[1] - 1
        for j in range(ny + 1):        # Hecken an Feldgrenzen
            for i in range(nx + 1):
                for (a, b) in (((j, i), (j, i + 1)), ((j, i), (j + 1, i))):
                    if a[0] > ny or a[1] > nx or b[0] > ny or b[1] > nx:
                        continue
                    if rng.random() < 0.28:
                        pa, pb = V[a], V[b]
                        Lg = np.linalg.norm(pb - pa)
                        for t in np.arange(0, 1, 3.4 / Lg):
                            if rng.random() < 0.8:
                                baum(*(pa + (pb - pa) * t + rng.normal(0, 1.0, 2)))
        for l, pts in d.linien("gewaesser"):   # Ufergehölz
            for p in pts[::2]:
                for s in (-1, 1):
                    if rng.random() < 0.55:
                        baum(p[0] + s * rng.uniform(4, 8), p[1] + rng.normal(0, 2))
        for h in self.haeuser:                  # Gärten
            for _ in range(rng.integers(1, 4)):
                baum(h[0] + rng.uniform(-12, 12), h[1] + rng.uniform(-12, 12), rng.uniform(0.75, 0.9))
        for l, pts in d.linien("strasse"):      # Alleen
            if l.get("allee"):
                for k in range(2, len(pts) - 2, 2):
                    a, b = pts[k - 1], pts[k + 1]
                    tx, ty = b[0] - a[0], b[1] - a[1]
                    Lg = math.hypot(tx, ty) or 1
                    nxv, nyv = -ty / Lg, tx / Lg
                    off = l.get("allee_abstand_m", 6)
                    baum(pts[k][0] + nxv * off, pts[k][1] + nyv * off)
                    baum(pts[k][0] - nxv * off, pts[k][1] - nyv * off)
        for p in d.karte.get("einzelbaeume", []):
            baum(p[0], p[1], 0.92)
        for zid, p, r in self.baumgruppen:      # Baumgruppen um teilgedeckte Ziele
            for k in range(9):
                a = 2 * math.pi * k / 9 + rng.uniform(-0.2, 0.2)
                rr = r + rng.uniform(3.0, 6.5)
                baum(p[0] + rr * math.cos(a), p[1] + rr * math.sin(a), rng.uniform(0.85, 1.0))

        # freie Sicht: keine Stämme auf Straßen und Wegen und bei frei sichtbaren Zielen
        Yh, Xh = np.mgrid[0:Hh, 0:Wh].astype(np.float32)
        Xh = (Xh + 0.5) * 2 * self.res
        Yh = (Yh + 0.5) * 2 * self.res
        for x, y, r in self.frei:
            imp[(Xh - x) ** 2 + (Yh - y) ** 2 < r * r] = -60.0
        weg = np.zeros((H, W), np.float32)
        for l, pts in d.linien():
            if l["art"] in ("strasse", "feldweg"):
                weg = np.maximum(weg, self.linien_maske(pts, l["breite_m"] + 1.0))
        imp[weg[::2, ::2][:Hh, :Wh] > 0.5] = -60.0
        del weg, Xh, Yh

        rr_ = 9
        yy_, xx_ = np.mgrid[-rr_:rr_ + 1, -rr_:rr_ + 1]
        struct = np.round(-0.22 * (xx_ ** 2 + yy_ ** 2), 2).astype(np.float32)
        can_h = grey_dilation(imp, structure=struct)
        del imp
        art_h = np.mod(np.round(can_h.astype(np.float64) * 1000), 10).astype(np.int8)
        cov_h = np.clip((can_h - 12.0) / 1.0, 0, 1).astype(np.float32)
        can = zoom(can_h, 2, order=1)[:H, :W]
        cover = zoom(cov_h, 2, order=1)[:H, :W]
        art = np.repeat(np.repeat(art_h, 2, 0), 2, 1)[:H, :W]
        del can_h, cov_h, art_h
        self.kronenhoehe = can

        n_blatt = self.rauschen(0.6, 31, oktaven=2)
        hgt = np.clip(can, 8, None) * 0.35 + 0.35 * n_blatt
        gy, gx = np.gradient(hgt)
        gx /= self.res
        gy /= self.res
        lam = (gx * 0.55 + gy * 0.55 + 0.63) / np.sqrt(gx ** 2 + gy ** 2 + 1)
        del gx, gy, hgt, n_blatt
        licht = np.clip(lam, 0, 1)
        ccol = KRONEN[art] * (0.40 + 0.95 * licht)[..., None] * (1 + 0.06 * self.n_fein)[..., None]
        del lam, art, licht

        unter = gaussian_filter(wald.astype(np.float32), 3)
        boden[:] = self.mische(boden, (30, 38, 27), unter * 0.92)
        del unter

        sh = np.roll(np.roll(cover, int(M(4)), 0), int(M(4)), 1)
        self._baumschatten = gaussian_filter(np.clip(sh - cover, 0, 1), 2)
        self.krone = np.dstack([np.clip(ccol, 0, 255).astype(np.uint8), (np.clip(cover, 0, 1) * 255).astype(np.uint8)])
        self.wald = wald

    def _gebaeude(self, boden_u8):
        """Dächer als Vektor-Grundformen in Metern (self.daecher), damit Luftbild und Drohnenbilder
        dieselben Gebäude zeigen; im Drohnenbild werden sie scharf neu gezeichnet."""
        d, rng, M = self.d, self.rng, self.M
        prims = []           # ("poly", pts_m, rgba) | ("linie", pts_m, rgba, breite_m)
        schatten_polys = []  # (pts_m, versatz_m)
        satteldach = [(h[0], h[1], h[2], h[3], h[4], h[5]) for h in self.haeuser]
        for g in d.gebaeude():
            if g["art"] in ("scheune", "wohnhaus"):
                farbe = {"scheune": (150, 154, 156), "wohnhaus": (140, 66, 50)}[g["art"]]
                if g["id"] == "scheune_2":
                    farbe = (120, 124, 128)
                satteldach.append((g["mitte"][0], g["mitte"][1], g["laenge"], g["breite"], g["winkel"], farbe))
        for (cx, cy, w, t, ang, dach) in satteldach:
            fp = drehe(rechteck(-w / 2, w / 2, -t / 2, t / 2), (cx, cy), ang)
            hm = 7 if w < 20 else 9
            schatten_polys.append((fp, hm * 0.75))
            h1 = drehe(rechteck(-w / 2, w / 2, -t / 2, 0), (cx, cy), ang)
            h2 = drehe(rechteck(-w / 2, w / 2, 0, t / 2), (cx, cy), ang)
            nx1, ny1 = -math.sin(math.radians(ang)), math.cos(math.radians(ang))
            hell2 = (nx1 * -1 + ny1 * -1) > 0
            prims.append(("poly", h1, farbton(dach, 0.78 if hell2 else 1.12)))
            prims.append(("poly", h2, farbton(dach, 1.12 if hell2 else 0.78)))
            # Ziegelreihen andeuten
            for k in range(1, 5):
                for sgn in (-1, 1):
                    y = sgn * t / 2 * k / 5
                    prims.append(("linie", drehe([(-w / 2 + 0.2, y), (w / 2 - 0.2, y)], (cx, cy), ang),
                                  farbton(dach, (0.72 if hell2 else 1.02) if sgn < 0 else (1.02 if hell2 else 0.72)), 0.12))
            prims.append(("linie", drehe([(-w / 2, 0), (w / 2, 0)], (cx, cy), ang), farbton(dach, 0.6), 0.45))
            if rng.random() < 0.4:
                prims.append(("poly", drehe(rechteck(-0.6, 0.6, -0.6, 0.6), (cx + rng.uniform(-2, 2), cy), ang), (60, 50, 45, 255)))
        for g in d.gebaeude("schule"):
            w, t = g["laenge"], g["breite"]
            fp = drehe(rechteck(-w / 2, w / 2, -t / 2, t / 2), g["mitte"], g["winkel"])
            schatten_polys.append((fp, 8))
            prims.append(("poly", fp, (96, 96, 94, 255)))
            prims.append(("poly", drehe(rechteck(-w / 2 + 0.5, w / 2 - 0.5, -t / 2 + 0.5, t / 2 - 0.5), g["mitte"], g["winkel"]), (150, 150, 146, 255)))
            prims.append(("poly", drehe(rechteck(-w / 2 + 1.0, w / 2 - 1.0, -t / 2 + 1.0, t / 2 - 1.0), g["mitte"], g["winkel"]), (162, 162, 157, 255)))
            lang = w >= t
            n = int((w if lang else t) // 10)
            for k in range(n):       # Lüftungsgeräte auf dem Flachdach
                off = -((n - 1) * 9) / 2 + k * 9
                lx, ly = (off, -t / 4) if lang else (-w / 4, off)
                prims.append(("poly", drehe(rechteck(lx - 1.2, lx + 1.2, ly - 1.2, ly + 1.2), g["mitte"], g["winkel"]),
                              (110, 112, 116, 255) if lang else (186, 192, 198, 255)))
        for f in d.flaechen("parkplatz"):      # parkende Autos
            pts = f["punkte"]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            for k in range(8):
                x = min(xs) + 4 + (k % 2) * 8
                y = min(ys) + 4 + (k // 2) * 6
                if im_polygon((x, y), pts) and rng.random() < 0.75:
                    c = AUTOS[rng.integers(len(AUTOS))]
                    prims.append(("poly", drehe(rechteck(-2.2, 2.2, -0.9, 0.9), (x, y), 84), c + (255,)))
                    prims.append(("poly", drehe(rechteck(-0.6, 0.9, -0.75, 0.75), (x, y), 84), farbton(c, 0.55)))
        self.daecher = prims
        self.dach_schatten = schatten_polys

        schatten = Image.new("L", (self.W, self.H), 0)
        sd = ImageDraw.Draw(schatten)
        for fp, v in schatten_polys:
            sd.polygon(schlagschatten(self.PTS(fp), M(v), M(v)), fill=150)
        schatten = schatten.filter(ImageFilter.GaussianBlur(2.2))
        s = np.asarray(schatten, np.float32) / 255.0 * 0.62
        b = boden_u8.astype(np.float32)
        b = b * (1 - s[..., None]) + np.array([12, 16, 22], np.float32) * s[..., None]
        welt = Image.fromarray(np.clip(b, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
        oben = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        self.zeichne_daecher(ImageDraw.Draw(oben), self.PT, 1 / self.res)
        welt.alpha_composite(oben)
        return np.asarray(welt.convert("RGB"), np.uint8)

    def zeichne_daecher(self, dr, nach_px, px_pro_m, nur_in=None):
        """Dächer und Autos auf eine beliebige Zeichenfläche; nach_px wandelt Meter in Pixel."""
        for pr in self.daecher:
            if nur_in is not None:
                xs = [p[0] for p in pr[1]]
                ys = [p[1] for p in pr[1]]
                if max(xs) < nur_in[0] or min(xs) > nur_in[2] or max(ys) < nur_in[1] or min(ys) > nur_in[3]:
                    continue
            if pr[0] == "poly":
                dr.polygon([nach_px(p) for p in pr[1]], fill=pr[2])
            else:
                dr.line([nach_px(p) for p in pr[1]], fill=pr[2], width=max(1, int(round(pr[3] * px_pro_m))))

    # ------------------------------------------------------------------ Ausgabe
    def welt(self, mit_kronen=True):
        """Luftbild (float32, H×W×3, noch ohne Rauschen)."""
        b = self.boden.astype(np.float32)
        if mit_kronen:
            a = self.krone[..., 3:4].astype(np.float32) / 255
            b = b * (1 - a) + self.krone[..., :3].astype(np.float32) * a
        return bewertung(b)

