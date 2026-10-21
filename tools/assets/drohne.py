"""Drohnenbilder (EO, Draufsicht, Nord oben) für jede ARGUS-Meldung und jede Verstärkung.

Für jede Meldung aus szenario_kraehe_01.json (und jede Meldung einer Verstärkung V-1 … V-5):
  1. Ausschnitt um die gemeldeten Ziele (Position zur Meldezeit t_s); Größe aus bild.ausschnitt_m
     oder automatisch, so dass Ziele und ihre Personen hineinpassen; bild.versatz_m verschiebt.
  2. Boden und Baumkronen aus dem Gelände, dazwischen alle Fahrzeuge, die zur Zeit t im Bild
     stehen (ungemeldete nur in Bildern für die Spielleitung, bei Verstärkungen nur deren Fahrzeuge),
     mit Schatten, Fahrspuren, Personen. Fahrzeuge, die das Hintergrundgefecht vor t zerstört hat,
     liegen als brennendes Wrack da, wo sie getroffen wurden (Schritt 5b); außer Gefecht gesetzte
     Kampfpanzer stehen mit abgesprungener Kette.
  3. Sichtstörungen aus bild.sicht, Anteil gemessen und im Manifest festgehalten.
  4. Kameraeindruck (Vignette, Farbstich, Rauschen). Kein HUD und keine ARGUS-Markierung im Bild:
     Rahmen, Klasse und Konfidenz zeichnet die Oberfläche aus dem Manifest (ziele[].box).

Ergebnis je Meldung (Schritt 5b):
  * Standbild  drohne/M07.webp – fertiges Bild zur Meldezeit (G1, Lupe, Druck).
  * Ebenen     drohne/ebenen/M07-boden.webp, -kronen.webp, -stoerung.webp – dasselbe Bild zerlegt für
    das Live-Drohnenbild: Boden (mit Dächern, Fahrspuren bis zur Meldezeit, Kisten), Baumkronen
    (RGBA) und Sichtstörungen (RGBA: Wolke, Rauch, Dunst, Tarnnetz, Wolkenschatten, Streifen der
    Bildstörung). Fahrzeuge, Wracks, Personen und Effekte zeichnet die Oberfläche als Sprites
    dazwischen (Reihenfolge: Boden, Schatten, Fahrzeuge, Figuren, Kronen, Störung, Kamera), Positionen
    aus der Engine; das Manifest nennt Sprite und Zustand jedes Fahrzeugs und jede Figur mit Versatz.

Bildgröße 1024 × 640 (16:10), WebP. Gezeichnet wird doppelt so groß und dann verkleinert.
"""
import math
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

import effekte as E
import fahrzeuge as F
import sicht as S
from daten import Daten, drehe, position, rechteck, spur, vorhanden

OW, OH = 1024, 640
SK = 2
CW, CH = OW * SK, OH * SK
LICHT_WELT = (-0.7071, -0.7071)          # Licht aus Nordwest
KETTENFAHRZEUGE = ("kpz_t72", "kpz_pt91", "spz_bmp2")
AUFSITZ = {"traktor": {"plaetze": [(-3.5, -0.5), (-2.7, 0.45), (-1.9, -0.35), (-3.0, 0.1)], "verdeckt": 2}}
PERSON_UEBERHOEHUNG = 1.5               # Personen etwas größer als maßstäblich, damit sie im Bild erkennbar sind
SEITE = {"vorn": (1, 0), "hinten": (-1, 0), "links": (0, -1), "rechts": (0, 1)}

# Kamera (linear, gilt für Standbild und Ebenen): 12 % Graustufen, Kontrast 0,93, Anhebung; danach
# Vignette (Randabdunklung) mit leichtem Blaustich und Rauschen nur im Standbild.
KAMERA_GRAU = 0.12
KAMERA_KONTRAST = 0.93
KAMERA_ANHEBUNG = (14.0, 15.0, 18.0)
VIGNETTE = 0.26
TONUNG = (0.97, 1.0, 1.035)
# Wracks im Standbild: Feuer und Rauchfahne (Wind aus Nordwest); die Live-Lage zeichnet sie als Effekte.
RAUCH_PX, RAUCH_M, FEUER_PX, FEUER_M = 256, 30.0, 96, 3.6
RAUCH_DICHTE, FEUER_DECKUNG = 1.7, 0.8
RAUCH_ANKER = 0.225
_EFFEKT_CACHE = {}


def saat(*teile):
    return zlib.crc32("|".join(map(str, teile)).encode()) & 0x7FFFFFFF


def licht_lokal(hdg):
    a = math.radians(-hdg)
    x, y = LICHT_WELT
    return (x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a))


def poly_maske(pts, w, h):
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).polygon(pts, fill=255)
    return np.asarray(im, np.float32) / 255


def kamera_farbe(f, alpha=None):
    """Farbe wie die Kamera (linear). Mit alpha: vormultiplizierte Farbe (Anhebung × Deckkraft)."""
    grau = f.mean(axis=-1, keepdims=True)
    f = (f * (1 - KAMERA_GRAU) + grau * KAMERA_GRAU) * KAMERA_KONTRAST
    an = np.array(KAMERA_ANHEBUNG, np.float32)
    return f + (an if alpha is None else an * alpha[..., None])


def farbmatrix():
    """Kamerafarbe als 4×5-Farbmatrix (PixiJS ColorMatrixFilter, Werte 0…1) für Sprites im Live-Drohnenbild."""
    m = KAMERA_KONTRAST * ((1 - KAMERA_GRAU) * np.eye(3) + KAMERA_GRAU / 3 * np.ones((3, 3)))
    zeilen = [[round(float(v), 4) for v in m[i]] + [0, round(KAMERA_ANHEBUNG[i] / 255, 4)] for i in range(3)]
    return zeilen + [[0, 0, 0, 1, 0]]


def vignette():
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    return 1 - VIGNETTE * (((xx - OW / 2) / (OW / 2)) ** 2 + ((yy - OH / 2) / (OH / 2)) ** 2)


def kamera_ebene():
    """Gemeinsame Ebene für alle Live-Drohnenbilder: Vignette als schwarze Ebene mit Deckkraft 1 − Vignette."""
    a = 1 - vignette()
    return Image.fromarray(np.dstack([np.zeros((OH, OW, 3)), np.clip(a, 0, 1) * 255]).astype(np.uint8), "RGBA")


def _effekt(name):
    if name not in _EFFEKT_CACHE:
        if name == "rauch":
            _EFFEKT_CACHE[name] = E.rauch_schleife(16, RAUCH_PX, np.random.default_rng(21))
        else:
            _EFFEKT_CACHE[name] = E.feuer_schleife(8, FEUER_PX, np.random.default_rng(22))
    return _EFFEKT_CACHE[name]


def verkleinere(P, A, unschaerfe=0.45):
    """Vormultiplizierte Ebene (Zeichenfläche) auf Bildgröße bringen und wie die Kamera färben.
    Liefert RGBA-Bild (gerade Alphawerte) oder RGB, wenn A None ist."""
    kan = [P[..., i] for i in range(3)] + ([A] if A is not None else [])
    klein = []
    for c in kan:
        c = gaussian_filter(c, unschaerfe) if unschaerfe else c
        klein.append(np.asarray(Image.fromarray(c.astype(np.float32), "F").resize((OW, OH), Image.LANCZOS), np.float32))
    Pk = np.dstack(klein[:3])
    if A is None:
        return Image.fromarray(np.clip(kamera_farbe(Pk), 0, 255).astype(np.uint8), "RGB")
    Ak = np.clip(klein[3], 0, 1)
    farbe = kamera_farbe(Pk, Ak) / np.maximum(Ak, 1e-4)[..., None]
    farbe = np.where(Ak[..., None] > 1e-3, farbe, 0)
    return Image.fromarray(np.dstack([np.clip(farbe, 0, 255), Ak * 255]).astype(np.uint8), "RGBA")


class Drohnenbilder:
    def __init__(self, d: Daten, gelaende, log=print):
        self.d = d
        self.g = gelaende
        self.log = log
        self.zmap = d.alle_ziele
        # Rand von 60 m (gespiegelt), damit Ausschnitte am Kartenrand nicht abgeschnitten werden
        self.rand_m = 60.0
        r = int(round(self.rand_m / gelaende.res))
        self.boden = Image.fromarray(np.pad(gelaende.boden, ((r, r), (r, r), (0, 0)), mode="reflect"), "RGB")
        self.krone = Image.fromarray(np.pad(gelaende.krone, ((r, r), (r, r), (0, 0)), mode="reflect"), "RGBA")

    # ================================================================== öffentliche Aufrufe
    def meldung(self, m):
        sp = dict(id=m["id"], t=m["t_s"], ziele=m["ziele"], bild=m["bild"], spielleitung=False)
        return self._render(sp)

    def verstaerkung(self, g, m):
        """Meldung einer Verstärkung: Zeit relativ zum Einspielen, nur die Fahrzeuge der Verstärkung im Bild."""
        sp = dict(id=m["id"], t=m["dt_s"], ziele=m["ziele"], bild=m["bild"], spielleitung=False,
                  nur=[z["id"] for z in g["ziele"]], gruppe=g["id"])
        return self._render(sp)

    def zielbild(self, name, ziele, t):
        """Bild ohne Meldung (z. B. ungemeldete Ziele) nur für Spielleitung und Plenum."""
        sp = dict(id=name, t=t, ziele=ziele, bild={"sicht": []}, spielleitung=True)
        return self._render(sp)

    # ================================================================== Lage zur Zeit t
    def _p(self, z):
        return self.d.pos(z, self._t)

    def _h(self, z):
        return self.d.hdg(z, self._t)

    def _darstellung(self, z, sp):
        """(Wrack?, Zustand fürs Zeichnen, Schaden) nach Hintergrundgefecht und bild.zustand."""
        sch = self.d.zustand_bei(z, sp["t"]) if z["id"] in self.d.ziele else "intakt"
        zu = (sp["bild"].get("zustand") or {}).get(z["id"])
        if sch == "zerstoert":
            return True, None, sch
        if sch == "ausser_gefecht" and zu is None and "kette_ab" in F.ZUSTAND_SPRITES.get(z["typ"], ()):
            zu = "kette_ab"
        return False, zu, sch

    # ================================================================== Aufbau
    def _ausschnitt(self, sp):
        d, t = self.d, sp["t"]
        bild = sp["bild"]
        ps = [self._p(self.zmap[z]) for z in sp["ziele"]]
        c = [sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps)]
        v = bild.get("versatz_m") or [0, 0]
        c = [c[0] + v[0], c[1] + v[1]]
        breite = bild.get("ausschnitt_m") or (110 if len(ps) == 1 else 120)
        noetig = []
        for zid in sp["ziele"]:
            z = self.zmap[zid]
            L, B = d.groesse(z)
            p, h = self._p(z), self._h(z)
            noetig += drehe(rechteck(-L / 2 - 1, L / 2 + 1, -B / 2 - 1, B / 2 + 1), p, h)
            for pe in z.get("personen") or []:
                if vorhanden(pe, t, z):
                    q = position(pe, t)
                    noetig += [(q[0] - 3, q[1] - 3), (q[0] + 3, q[1] + 3)]
        hw = max(breite / 2, max(abs(x - c[0]) for x, _ in noetig) + 6)
        hh = max(breite / 2 * OH / OW, max(abs(y - c[1]) for _, y in noetig) + 5)
        breite = max(2 * hw, 2 * hh * OW / OH)
        return c, breite, breite * OH / OW

    def _objekte(self, sp, x0, y0, breite, hoehe):
        """Alle Fahrzeuge (auch Wracks), die zur Zeit t im Ausschnitt stehen."""
        d, t = self.d, sp["t"]
        kandidaten = [self.zmap[i] for i in sp["nur"]] if sp.get("nur") else d.szenario["ziele"]
        out = []
        for z in kandidaten:
            if not d.da(z, t):
                continue
            if z.get("ungemeldet") and not sp["spielleitung"] and z["id"] not in sp["ziele"]:
                continue
            if not d.fahrzeuge[z["typ"]].get("sprite"):
                continue
            p = self._p(z)
            L, B = d.groesse(z)
            r = max(L, B)
            if x0 - r < p[0] < x0 + breite + r and y0 - r < p[1] < y0 + hoehe + r:
                out.append(z)
        out.sort(key=lambda z: (z["id"] in sp["ziele"], self._p(z)[1]))
        return out

    # ================================================================== Personen
    def _personen(self, sp, z, p, h):
        """Figuren eines Fahrzeugs: Lage in Metern und, für die Live-Ebenen, Bezug und Versatz.
        bezug 'gruppe': Position der Personengruppe z.personen[gruppe] + versatz_m (Weltachsen);
        bezug 'fahrzeug': Fahrzeugmitte + versatz_m in Fahrzeugachsen (vorwärts, rechts), mit hdg drehen."""
        d, t = self.d, sp["t"]
        rng = np.random.default_rng(saat(sp["id"], z["id"], "pers"))
        L, B = d.groesse(z)
        out = []

        def fig(x, y, art, klein=False, hoch=False, tuch=False, oben=False, bezug="gruppe", gruppe=None, versatz=(0, 0)):
            out.append(dict(x=x, y=y, art=art, klein=klein, hoch=hoch, tuch=tuch, oben=oben, bezug=bezug, gruppe=gruppe,
                            versatz=[round(float(versatz[0]), 2), round(float(versatz[1]), 2)]))
        for gi, pe in enumerate(z.get("personen") or []):
            if not vorhanden(pe, t, z):
                continue
            q = position(pe, t)
            n = pe["anzahl"]
            klein = pe.get("klein", 0)
            art = pe["art"]
            if z["typ"] in AUFSITZ and math.hypot(q[0] - p[0], q[1] - p[1]) < max(L, B) / 2:      # aufgesessen
                a = AUFSITZ[z["typ"]]
                sichtbar = max(0, n - a["verdeckt"])
                for k, (lx, ly) in enumerate(a["plaetze"][:sichtbar]):
                    x, y = drehe([(lx, ly)], p, h)[0]
                    fig(x, y, art, oben=True, bezug="fahrzeug", gruppe=gi, versatz=(lx, ly))
                continue
            if art == "besatzung_ergibt_sich":
                for k in range(n):
                    dx, dy = (k - (n - 1) / 2) * 0.95, rng.normal(0, 0.15)
                    fig(q[0] + dx, q[1] + dy, art, hoch=True, tuch=k == 0, gruppe=gi, versatz=(dx, dy))
            elif art == "soldat" and z["typ"] == "moerser_trupp":
                # Bedienung an beiden Rohren und bei den Munitionskisten verteilen
                plaetze = [(-L / 4 + 1.4, 0.9), (L / 4 + 1.4, 0.9), (-L / 4 - 1.2, -1.9), (L / 4 - 1.2, -1.9), (0.0, 1.9), (-0.8, 2.4)]
                for k in range(n):
                    lx, ly = plaetze[k % len(plaetze)]
                    lok = (lx + rng.normal(0, 0.25), ly + rng.normal(0, 0.25))
                    x, y = drehe([lok], p, h)[0]
                    fig(x, y, art, bezug="fahrzeug", gruppe=gi, versatz=lok)
            elif art == "soldat":
                for k in range(n):
                    a = 2 * math.pi * k / n + rng.uniform(-0.4, 0.4)
                    r = rng.uniform(1.0, 3.4)
                    fig(q[0] + r * math.cos(a), q[1] + r * math.sin(a), art, gruppe=gi, versatz=(r * math.cos(a), r * math.sin(a)))
            else:
                for k in range(n):
                    a = 2 * math.pi * k / n + rng.uniform(-0.3, 0.3)
                    r = rng.uniform(0.35, 1.1)
                    fig(q[0] + r * math.cos(a), q[1] + r * math.sin(a), art, klein=k >= n - klein, gruppe=gi,
                        versatz=(r * math.cos(a), r * math.sin(a)))
        for pe in sp["bild"].get("personen") or []:                      # nur Darstellung (bild.personen)
            if pe.get("bei") != z["id"]:
                continue
            n = pe["anzahl"]
            for k in range(n):
                lx, ly = pe["versatz_m"]
                lok = (lx, ly + (k - (n - 1) / 2) * 0.75)
                x, y = drehe([lok], p, h)[0]
                fig(x, y, pe["art"], oben=bool(pe.get("oben")), bezug="fahrzeug", versatz=lok)
        return out

    # ================================================================== Render
    def _render(self, sp):
        d, t = self.d, sp["t"]
        self._t = t
        bild = sp["bild"]
        rng = np.random.default_rng(saat(sp["id"], "bild"))
        c, breite, hoehe = self._ausschnitt(sp)
        mpp = breite / OW                       # Meter je Bildpunkt (fertiges Bild)
        s2 = CW / breite                        # Pixel je Meter auf der Zeichenfläche
        sicht = bild.get("sicht") or []
        hauptziele = [self.zmap[z] for z in sp["ziele"]]
        # Ebene „Störung“ (vormultipliziert) wird parallel zum Standbild mitgeschrieben
        stP = np.zeros((CH, CW, 3), np.float32)
        stA = np.zeros((CH, CW), np.float32)
        stV = np.zeros((CH, CW), np.float32)            # davon verdeckend (ohne Wolkenschatten), für die Prüfwerte

        def stoerung_ueber(farbe, al, sl=(slice(None), slice(None)), verdeckt=True):
            stP[sl] = stP[sl] * (1 - al[..., None]) + farbe * al[..., None]
            stA[sl] = stA[sl] * (1 - al) + al
            if verdeckt:
                stV[sl] = stV[sl] * (1 - al) + al
        self._stoerung_ueber = stoerung_ueber

        # ---------------------------------------------------- Bereichsstörungen (Bildkoordinaten)
        bereiche = []
        for k, sv in enumerate(sicht):
            if sv["lage"] != "Ziel" and sv["art"] in ("wolke", "rauch", "dunst"):
                farbe, a = S.bereichsstoerung(sv["art"], sv["lage"], sv["anteil"], CH, CW, np.random.default_rng(saat(sp["id"], k)))
                bereiche.append((k, sv, farbe, a))
        occ_bereich = np.zeros((CH, CW), np.float32)
        for _, _, _, a in bereiche:
            occ_bereich = 1 - (1 - occ_bereich) * (1 - a)

        # ---------------------------------------------------- Lage des Ausschnitts (Ziel am Wolkenrand usw.)
        def ursprung(dx, dy):
            x0 = c[0] - breite / 2 - dx * mpp
            y0 = c[1] - hoehe / 2 - dy * mpp
            rm = self.rand_m
            x0 = min(max(x0, -rm), d.breite_m + rm - breite)
            y0 = min(max(y0, -rm), d.hoehe_m + rm - hoehe)
            return x0, y0

        def rumpf_px(z, x0, y0, k=1.0, rand=0.0):
            L, B = d.groesse(z)
            p, h = self._p(z), self._h(z)
            pts = drehe(rechteck(-L / 2 - rand, L / 2 + rand, -B / 2 - rand, B / 2 + rand), p, h)
            return [((x - x0) * s2 * k, (y - y0) * s2 * k) for x, y in pts]

        ziel_anteil = [sv.get("ziel_anteil") for _, sv, _, _ in bereiche if sv.get("ziel_anteil") is not None]
        verschiebung = (0, 0)
        if bereiche:
            goal = max(ziel_anteil) if ziel_anteil else 0.0
            k4 = 0.25
            occ4 = np.asarray(Image.fromarray((occ_bereich * 255).astype(np.uint8)).resize((CW // 4, CH // 4), Image.BILINEAR), np.float32) / 255
            best = None
            for dy in range(-int(OH * 0.28), int(OH * 0.28) + 1, 10):
                for dx in range(-int(OW * 0.3), int(OW * 0.3) + 1, 10):
                    x0, y0 = ursprung(dx, dy)
                    covs, raus = [], 0
                    for z in hauptziele:
                        pts = rumpf_px(z, x0, y0, k4)
                        m = poly_maske(pts, CW // 4, CH // 4)
                        if m.sum() < 1:
                            raus = 1
                            continue
                        covs.append((occ4 * m).sum() / m.sum())
                        xs = [q[0] for q in pts]
                        ys = [q[1] for q in pts]
                        if min(xs) < CW / 4 * 0.05 or max(xs) > CW / 4 * 0.95 or min(ys) < CH / 4 * 0.07 or max(ys) > CH / 4 * 0.93:
                            raus = 1
                    if not covs:
                        continue
                    kosten = abs(max(covs) - goal) + 10 * raus + 0.00015 * (abs(dx) + abs(dy))
                    if best is None or kosten < best[0]:
                        best = (kosten, dx, dy)
            verschiebung = best[1:] if best else (0, 0)
        x0, y0 = ursprung(*verschiebung)
        rm = self.rand_m
        box_welt = ((x0 + rm) / self.g.res, (y0 + rm) / self.g.res, (x0 + rm + breite) / self.g.res, (y0 + rm + hoehe) / self.g.res)

        def S2(p):
            return ((p[0] - x0) * s2, (p[1] - y0) * s2)

        # ---------------------------------------------------- Boden
        img = self.boden.transform((CW, CH), Image.EXTENT, box_welt, Image.BICUBIC)
        img = img.filter(ImageFilter.UnsharpMask(radius=3, percent=55, threshold=2)).convert("RGBA")
        if hasattr(self.g, "zeichne_daecher"):       # Dächer scharf neu zeichnen
            dach = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
            self.g.zeichne_daecher(ImageDraw.Draw(dach), S2, s2, nur_in=(x0, y0, x0 + breite, y0 + hoehe))
            img.alpha_composite(dach)
        basis = np.asarray(img.convert("RGB"), np.float32)

        objekte = self._objekte(sp, x0, y0, breite, hoehe)
        zustand = bild.get("zustand") or {}

        # Fahrspuren hinter fahrenden Fahrzeugen
        spuren = Image.new("L", (CW, CH), 0)
        dsp = ImageDraw.Draw(spuren)
        for z in objekte:
            if not (z.get("bewegung") and d.faehrt(z, t - 1)):
                continue
            L, B = d.groesse(z)
            weg = spur(z, t, 55)
            if len(weg) < 2:
                continue
            kette = z["typ"] in KETTENFAHRZEUGE
            off = B / 2 - (0.3 if kette else 0.22)
            for seite in (-1, 1):
                pts = []
                for k in range(len(weg)):
                    a, b = weg[max(k - 1, 0)], weg[min(k + 1, len(weg) - 1)]
                    tx, ty = b[0] - a[0], b[1] - a[1]
                    Lg = math.hypot(tx, ty) or 1
                    pts.append(S2((weg[k][0] - ty / Lg * seite * off, weg[k][1] + tx / Lg * seite * off)))
                dsp.line(pts, fill=70 if kette else 50, width=max(1, int((0.55 if kette else 0.35) * s2)))
        spuren = np.asarray(spuren.filter(ImageFilter.GaussianBlur(0.25 * s2)), np.float32) / 255
        basis *= (1 - spuren)[..., None]

        # Munitionskisten u. a. am Boden
        kisten = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
        dk = ImageDraw.Draw(kisten)
        for z in objekte:
            if zustand.get(z["id"]) == "kisten":
                L, B = d.groesse(z)
                p, h = self._p(z), self._h(z)
                r2 = np.random.default_rng(saat(sp["id"], z["id"], "kisten"))
                for k in range(10):
                    lx = -L / 2 - 1.4 - (k % 4) * 0.75 + r2.uniform(-0.1, 0.1)
                    ly = 0.9 + (k // 4) * 0.48 + r2.uniform(-0.1, 0.1)
                    pts = drehe(rechteck(lx, lx + 0.62, ly, ly + 0.36), p, h + r2.uniform(-8, 8))
                    dk.polygon([S2(q) for q in pts], fill=(96, 92, 60, 255) if k % 3 else (110, 98, 64, 255))
        kn = np.asarray(kisten, np.float32)
        ebene_boden = basis * (1 - kn[..., 3:4] / 255) + kn[..., :3] * (kn[..., 3:4] / 255)      # Ebene „Boden“

        # ---------------------------------------------------- Fahrzeuge und Personen
        schatten = Image.new("L", (CW, CH), 0)
        lagen = []          # (img, x, y) zum Einsetzen, in Reihenfolge
        oben = []
        rumpf_masken = {}
        personen_masken = []
        pers_meta = []
        fahrzeug_meta, figur_meta, wracks = [], [], []
        for z in objekte:
            L, B = d.groesse(z)
            p, h = self._p(z), self._h(z)
            wrack, zu, sch = self._darstellung(z, sp)
            spr = F.fahrzeug(z["typ"], (L, B), s2, wrack=wrack, zustand=zu, seed=saat(z["id"]), licht=licht_lokal(h))
            spr = spr.rotate(-h, resample=Image.BICUBIC, expand=True)
            q = S2(p)
            x, y = int(round(q[0] - spr.width / 2)), int(round(q[1] - spr.height / 2))
            sh = 1.25 * s2
            schatten.paste(255, (int(x + sh), int(y + sh)), spr.split()[3])
            lagen.append((spr, x, y))
            if z["id"] in sp["ziele"]:
                rumpf_masken[z["id"]] = poly_maske(rumpf_px(z, x0, y0), CW, CH)
            if zu == "furt":
                lagen.append((self._gischt(L, B, h, s2, saat(sp["id"])), None, q))
            if wrack:
                wracks.append((z, p, h))
            f = d.fahrzeuge[z["typ"]]
            sprite = f["sprite_wrack"] if wrack else (F.zustand_sprite(f["sprite"], zu) if zu in F.ZUSTAND_SPRITES.get(z["typ"], ()) else f["sprite"])
            e = {"id": z["id"], "sprite": sprite, "zustand": sch, "hauptziel": z["id"] in sp["ziele"],
                 "mitte": [round((p[0] - x0) / mpp, 1), round((p[1] - y0) / mpp, 1)], "hdg": round(h, 1)}
            if zu:
                e["darstellung"] = zu
            if sch != "intakt":
                e["seit_s"] = d.schaden_seit(z, t)
            if wrack:
                e["effekte"] = list(E.ZUORDNUNG["wrack"]["zerstoert"])
            if zu == "feuert":
                e["effekte"] = [E.ZUORDNUNG["feuert"]["moerser" if z["typ"] == "moerser_trupp" else "kanone"]]
            fahrzeug_meta.append(e)
            for fg in self._personen(sp, z, p, h):
                px, py, art = fg["x"], fg["y"], fg["art"]
                seed = saat(sp["id"], z["id"], px, py)
                r3 = np.random.default_rng(seed)
                ps = F.person(art, s2 * PERSON_UEBERHOEHUNG, r3, klein=fg["klein"], haende_hoch=fg["hoch"], tuch=fg["tuch"], hdg=r3.uniform(0, 360))
                rc = np.random.default_rng(seed)                 # gleiche Folge: Blickrichtung, dann Kleidungsfarbe
                hdg_p = rc.uniform(0, 360)
                fi = int(rc.integers(len(F.PERSON_FARBEN.get(art, F.PERSON_FARBEN["zivil"]))))
                pq = S2((px, py))
                xx, yy = int(round(pq[0] - ps.width / 2)), int(round(pq[1] - ps.height / 2))
                if not fg["oben"]:
                    schatten.paste(200, (int(xx + 0.8 * s2), int(yy + 0.8 * s2)), ps.split()[3])
                (oben if fg["oben"] else lagen).append((ps, xx, yy))
                r = 0.35 * s2
                personen_masken.append((max(0, int(pq[1] - r)), min(CH, int(pq[1] + r) + 1),
                                        max(0, int(pq[0] - r)), min(CW, int(pq[0] + r) + 1)))
                pers_meta.append((z["id"], art, pq))
                fe = {"bei": z["id"], "art": art, "sprite": F.person_variante(art, fi, fg["klein"], fg["tuch"]),
                      "bezug": fg["bezug"], "versatz_m": fg["versatz"], "hdg": round(hdg_p, 1),
                      "px": [round(pq[0] / SK, 1), round(pq[1] / SK, 1)]}
                if fg["gruppe"] is not None:
                    fe["gruppe"] = fg["gruppe"]
                for k in ("klein", "tuch", "oben"):
                    if fg[k]:
                        fe[k] = True
                if fg["hoch"]:
                    fe["haende_hoch"] = True
                figur_meta.append(fe)
        schatten = np.asarray(schatten.filter(ImageFilter.GaussianBlur(0.35 * s2)), np.float32) / 255
        basis = basis * (1 - 0.5 * schatten)[..., None] + np.array([10, 14, 20], np.float32) * (0.5 * schatten)[..., None]
        bild_rgba = Image.fromarray(np.clip(basis, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
        bild_rgba.alpha_composite(kisten)
        for spr, x, y in lagen:
            if x is None:      # Gischt: Mitte übergeben
                q = y
                bild_rgba.alpha_composite(spr, (int(q[0] - spr.width / 2), int(q[1] - spr.height / 2)))
            else:
                bild_rgba.alpha_composite(spr, (x, y))
        for spr, x, y in oben:
            bild_rgba.alpha_composite(spr, (x, y))
        for z, p, h in wracks:                                   # Feuer im Motorraum des Wracks (nur Standbild)
            fr = _effekt("feuer")[saat(sp["id"], z["id"], "feuer") % 8]
            n = max(8, int(FEUER_M * s2))
            fr = np.asarray(fr.resize((n, n), Image.BICUBIC), np.float32)
            fr[..., 3] *= FEUER_DECKUNG
            fr = Image.fromarray(fr.astype(np.uint8), "RGBA")
            L, _ = d.groesse(z)
            q = S2(drehe([(-L / 4, 0.0)], p, h)[0])
            bild_rgba.alpha_composite(fr, (int(q[0] - n / 2), int(q[1] - n / 2)))

        # ---------------------------------------------------- Baumkronen (natürlich), angepasst je Ziel
        kr = np.asarray(self.krone.transform((CW, CH), Image.EXTENT, box_welt, Image.BICUBIC), np.float32)
        ka = kr[..., 3] / 255
        baum_sicht = {z: None for z in sp["ziele"]}
        for sv in sicht:
            if sv["lage"] == "Ziel" and sv["art"] == "baeume":
                for zid in sp["ziele"]:
                    baum_sicht[zid] = sv
        for zid in sp["ziele"]:
            z = self.zmap[zid]
            sv = baum_sicht[zid]
            frei = poly_maske(rumpf_px(z, x0, y0, rand=1.2), CW, CH)
            if sv is None:
                ka = ka * (1 - frei)
            else:
                m = rumpf_masken[zid]
                cov = (ka * m).sum() / m.sum()
                if cov > sv["anteil"] + 0.06:
                    tloc = self._seitenfeld(z, sv.get("seite") or "hinten", x0, y0, s2)
                    for tau in np.linspace(-1.2, 1.2, 49):
                        weg = (tloc < tau) * frei
                        ka2 = ka * (1 - weg)
                        if (ka2 * m).sum() / m.sum() <= sv["anteil"]:
                            break
                    ka = ka2
        for (py0, py1, px0, px1) in personen_masken:      # Personen nicht unter Kronen verstecken
            ka[py0:py1, px0:px1] = 0
        ebene_kronen = (kr[..., :3] * ka[..., None], ka.copy())                                 # Ebene „Kronen“
        a = np.asarray(bild_rgba, np.float32)
        a[..., :3] = a[..., :3] * (1 - ka[..., None]) + kr[..., :3] * ka[..., None]
        occ = ka.copy()

        # ---------------------------------------------------- Zielstörungen (Stempel bis zum Anteil)
        meta_sicht = [None] * len(sicht)
        alle_rumpf = np.zeros((CH, CW), np.float32)
        for m in rumpf_masken.values():
            alle_rumpf = np.maximum(alle_rumpf, m)
        pers_union = np.zeros((CH, CW), np.float32)
        for (py0, py1, px0, px1) in personen_masken:
            pers_union[py0:py1, px0:px1] = 1
        unschaerfe_meta = None
        for k, sv in enumerate(sicht):
            if sv["lage"] != "Ziel":
                continue
            z = hauptziele[0]
            if sv["art"] in ("baeume", "tarnnetz", "rauch", "wolke"):
                a, occ, ist = self._abdecken(a, occ, rumpf_masken[z["id"]], sv, z, x0, y0, s2, pers_union,
                                             np.random.default_rng(saat(sp["id"], "ziel", k)))
                meta_sicht[k] = {"anteil_ist": round(ist, 3), "bezug": "Ziel"}
            elif sv["art"] == "unschaerfe":
                m = poly_maske(rumpf_px(z, x0, y0, rand=2.5), CW, CH)
                m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0 * s2)), np.float32) / 255
                ys, xs = np.nonzero(m > 0.01)
                y_0, y_1, x_0, x_1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
                lang = (0.8 + 4.0 * sv["anteil"]) * s2
                blur = S.bewegungsunschaerfe(a[y_0:y_1, x_0:x_1, :3], lang, self._h(z))
                mm = m[y_0:y_1, x_0:x_1, None]
                a[y_0:y_1, x_0:x_1, :3] = a[y_0:y_1, x_0:x_1, :3] * (1 - mm) + blur * mm
                meta_sicht[k] = {"anteil_ist": sv["anteil"], "bezug": "Stärke"}
                unschaerfe_meta = {"ziel": z["id"], "laenge_m": round(lang / s2, 2), "laenge_px": round(lang / SK, 1),
                                   "winkel": round(self._h(z), 1), "rand_m": 2.5,
                                   "hinweis": "Bewegungsunschärfe auf den Sprite des Ziels und 2,5 m drumherum (z. B. PixiJS MotionBlur/BlurFilter)"}

        # ---------------------------------------------------- Rauchfahnen der Wracks (nur Standbild)
        wrack_rauch = []
        if wracks:
            km = np.zeros((CH, CW), np.float32)
            for z in hauptziele:
                if z["typ"] == "san_rad":
                    km = np.maximum(km, poly_maske([S2(q) for q in drehe(rechteck(-1.6, 0.3, -0.95, 0.95), self._p(z), self._h(z))], CW, CH))
            for z, p, h in wracks:
                fr = _effekt("rauch")[saat(sp["id"], z["id"], "rauch") % 16]
                n = max(16, int(RAUCH_M * s2))
                fa = np.asarray(fr.resize((n, n), Image.BICUBIC), np.float32)
                q = S2(p)
                xa, ya = int(q[0] - RAUCH_ANKER * n), int(q[1] - RAUCH_ANKER * n)
                xb, yb, xe, ye = max(0, xa), max(0, ya), min(CW, xa + n), min(CH, ya + n)
                if xe <= xb or ye <= yb:
                    continue
                sub = fa[yb - ya:ye - ya, xb - xa:xe - xa]
                al0 = np.clip(sub[..., 3] / 255 * RAUCH_DICHTE, 0, 0.9)
                sl = (slice(yb, ye), slice(xb, xe))
                staerke = 0.0
                for f_ in (1.0, 0.6, 0.35, 0.15):              # Ziele, Rotes Kreuz und Personen bleiben frei
                    al = al0 * f_
                    zu_viel = False
                    for m in list(rumpf_masken.values()) + ([km] if km.any() else []):
                        if (al * m[sl]).sum() / max(m.sum(), 1) > 0.015:
                            zu_viel = True
                    if pers_union.any() and (al * pers_union[sl]).sum() / max(pers_union.sum(), 1) > 0.03:
                        zu_viel = True
                    if not zu_viel:
                        staerke = f_
                        break
                if staerke > 0:
                    al = al0 * staerke
                    a[sl][..., :3] = a[sl][..., :3] * (1 - al[..., None]) + sub[..., :3] * al[..., None]
                    occ[sl] = 1 - (1 - occ[sl]) * (1 - al)
                wrack_rauch.append({"id": z["id"], "staerke": staerke})

        # ---------------------------------------------------- Wolkenschatten und Bereichsstörungen
        for k, sv, farbe, al in bereiche:
            if sv["art"] == "wolke":
                sx, sy = int(CW * 0.03), int(CH * 0.045)
                sch = np.zeros_like(al)
                sch[sy:, sx:] = al[:-sy, :-sx]
                sch = np.asarray(Image.fromarray((sch * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(28)), np.float32) / 255
                a[..., :3] *= (1 - 0.24 * sch)[..., None]
                stoerung_ueber(np.zeros(3, np.float32), 0.24 * sch, verdeckt=False)
        for k, sv, farbe, al in bereiche:
            a[..., :3] = a[..., :3] * (1 - al[..., None]) + farbe * al[..., None]
            occ = 1 - (1 - occ) * (1 - al)
            stoerung_ueber(farbe, al)
            meta_sicht[k] = {"anteil_ist": round(float(al.mean()), 3), "bezug": "Bildfläche"}
        for k, sv in enumerate(sicht):
            if sv["lage"] != "Ziel" and sv["art"] == "unschaerfe":
                reg = S.bereich(sv["lage"], CH, CW, 40)
                blur = np.asarray(Image.fromarray(np.clip(a[..., :3], 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3 + 10 * sv["anteil"])), np.float32)
                a[..., :3] = a[..., :3] * (1 - reg[..., None]) + blur * reg[..., None]
                meta_sicht[k] = {"anteil_ist": round(float(reg.mean()), 3), "bezug": "Bildfläche"}

        # ---------------------------------------------------- Kamera
        img = Image.fromarray(np.clip(a[..., :3], 0, 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(0.45))
        img = img.resize((OW, OH), Image.LANCZOS)
        f = kamera_farbe(np.asarray(img, np.float32))
        f = f * vignette()[..., None] * np.array(TONUNG, np.float32) + rng.normal(0, 3.0, f.shape)
        img = Image.fromarray(np.clip(f, 0, 255).astype(np.uint8))
        bildstoerung = None
        for k, sv in enumerate(sicht):
            if sv["art"] == "stoerung":
                img = S.bildstoerung(img, sv["anteil"], np.random.default_rng(saat(sp["id"], "stoerung")))
                meta_sicht[k] = {"anteil_ist": sv["anteil"], "bezug": "Stärke"}
                bildstoerung = sv["anteil"]

        # ---------------------------------------------------- Ebenen für das Live-Drohnenbild
        ebenen = {"boden": verkleinere(ebene_boden, None)}
        kP, kA = ebene_kronen
        ebenen["kronen"] = verkleinere(kP, kA) if kA.max() > 0.02 else None
        st = verkleinere(stP, stA) if stA.max() > 0.02 else None
        if bildstoerung is not None:
            streifen = S.bildstoerung_ebene(OW, OH, bildstoerung, np.random.default_rng(saat(sp["id"], "stoerung")))
            st = streifen if st is None else Image.alpha_composite(st, streifen)
        ebenen["stoerung"] = st
        occ_ebenen = 1 - (1 - ka) * (1 - stV)                  # was Kronen und Störung zur Meldezeit verdecken

        # ---------------------------------------------------- Manifest-Eintrag
        def px(q):
            return [round((q[0] - x0) / mpp, 1), round((q[1] - y0) / mpp, 1)]
        ziele_meta, ebenen_verdeckt = [], {}
        km_eb = None
        for z in hauptziele:
            L, B = d.groesse(z)
            p, h = self._p(z), self._h(z)
            ecken = [px(q) for q in drehe(rechteck(-L / 2 - 0.7, L / 2 + 0.7, -B / 2 - 0.7, B / 2 + 0.7), p, h)]
            bx0, by0 = min(e[0] for e in ecken), min(e[1] for e in ecken)
            bx1, by1 = max(e[0] for e in ecken), max(e[1] for e in ecken)
            m = rumpf_masken[z["id"]]
            eintrag = {"id": z["id"], "mitte": px(p), "hdg": round(h, 1),
                       "box": [int(math.floor(bx0)), int(math.floor(by0)), int(math.ceil(bx1 - bx0)), int(math.ceil(by1 - by0))],
                       "verdeckt": round(float((occ * m).sum() / m.sum()), 3)}
            ebenen_verdeckt[z["id"]] = round(float((occ_ebenen * m).sum() / m.sum()), 3)
            if z["typ"] == "san_rad":                  # Schutzzeichen muss sichtbar bleiben (Schlüsselfall S2)
                km = poly_maske([S2(q) for q in drehe(rechteck(-1.6, 0.3, -0.95, 0.95), p, h)], CW, CH)
                eintrag["kennzeichen_verdeckt"] = round(float((occ * km).sum() / km.sum()), 3)
                km_eb = round(float((occ_ebenen * km).sum() / km.sum()), 3)
            ziele_meta.append(eintrag)
        pers_eintraege, pers_eb = {}, {}
        for (zid, art, pq), (py0, py1, px0, px1) in zip(pers_meta, personen_masken):
            e = pers_eintraege.setdefault((zid, art), {"bei": zid, "art": art, "anzahl": 0, "verdeckt": 0.0, "punkte": []})
            e["anzahl"] += 1
            e["verdeckt"] += float(occ[py0:py1, px0:px1].mean()) if py1 > py0 and px1 > px0 else 0.0
            pers_eb[(zid, art)] = pers_eb.get((zid, art), 0.0) + (float(occ_ebenen[py0:py1, px0:px1].mean()) if py1 > py0 and px1 > px0 else 0.0)
            e["punkte"].append([round(pq[0] / SK, 1), round(pq[1] / SK, 1)])
        for e in pers_eintraege.values():
            e["verdeckt"] = round(e["verdeckt"] / e["anzahl"], 3)
        sicht_meta = []
        for k, sv in enumerate(sicht):
            e = dict(sv)
            if meta_sicht[k]:
                e.update(meta_sicht[k])
            if sv.get("ziel_anteil") is not None:
                e["ziel_ist"] = max(zm["verdeckt"] for zm in ziele_meta)
            sicht_meta.append(e)
        meta = {
            "breite": OW, "hoehe": OH, "t_s": t, "uhr": None if sp.get("gruppe") else d.uhr(t), "pq": d.pq(self._p(hauptziele[0])),
            "ausschnitt_m": {"x": round(x0, 2), "y": round(y0, 2), "breite": round(breite, 2), "hoehe": round(hoehe, 2)},
            "m_pro_px": round(mpp, 4),
            "ziele": ziele_meta,
            "objekte": [dict({"id": z["id"], "mitte": px(self._p(z)), "hdg": round(self._h(z), 1)},
                             **({"zustand": d.zustand_bei(z, t)} if z["id"] in d.ziele and d.zustand_bei(z, t) != "intakt" else {}))
                        for z in objekte if z["id"] not in sp["ziele"]],
            "personen": list(pers_eintraege.values()),
            "sicht": sicht_meta,
        }
        if sp.get("gruppe"):
            meta["relativ"] = True
            meta["verstaerkung"] = sp["gruppe"]
        if wrack_rauch:
            meta["wracks"] = wrack_rauch
        if sp["spielleitung"]:
            meta["nur_spielleitung"] = True
        eb = {"fahrzeuge": fahrzeug_meta, "figuren": figur_meta, "verdeckt": ebenen_verdeckt,
              "figuren_verdeckt": {f"{zid}/{art}": round(v / pers_eintraege[(zid, art)]["anzahl"], 3) for (zid, art), v in pers_eb.items()}}
        if km_eb is not None:
            eb["kennzeichen_verdeckt"] = km_eb
        if unschaerfe_meta:
            eb["unschaerfe"] = unschaerfe_meta
        if bildstoerung is not None:
            eb["bildstoerung"] = bildstoerung
        meta["ebenen"] = eb
        return img, meta, ebenen

    # ================================================================== Hilfen
    def _seitenfeld(self, z, seite, x0, y0, s2):
        """Für jeden Bildpunkt: Lage entlang der Seite des Fahrzeugs (−1 … 1 über die halbe Länge)."""
        d = self.d
        L, B = d.groesse(z)
        p, h = self._p(z), self._h(z)
        vx, vy = SEITE[seite]
        wx, wy = drehe([(vx, vy)], (0, 0), h)[0]
        halb = L / 2 if vx else B / 2
        yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
        mx, my = (p[0] - x0) * s2, (p[1] - y0) * s2
        return ((xx - mx) * wx + (yy - my) * wy) / (halb * s2)

    def _abdecken(self, a, occ, m, sv, z, x0, y0, s2, frei_halten, rng):
        """Stempel über das Ziel setzen, bis der verdeckte Anteil erreicht ist.
        Personen (frei_halten) bleiben zu höchstens 8 % verdeckt. Jeder Stempel geht auch in die Ebene „Störung“."""
        ziel = sv["anteil"]
        art = sv["art"]
        flaeche = m.sum()
        frei_flaeche = frei_halten.sum()
        cov = float((occ * m).sum() / flaeche)
        frei_cov = float((occ * frei_halten).sum() / frei_flaeche) if frei_flaeche else 0.0
        if cov >= ziel - 0.02:
            return a, occ, cov
        ys, xs = np.nonzero(m > 0.5)
        tfeld = self._seitenfeld(z, sv["seite"], x0, y0, s2) if sv.get("seite") else None
        if tfeld is not None:
            gew = np.clip(tfeld[ys, xs] + 0.3, 0, None) ** 2 + 1e-4
        else:
            gew = np.ones(len(xs))
        gew = gew / gew.sum()
        L, B = self.d.groesse(z)
        r_m = {"baeume": (2.0, 3.4), "tarnnetz": (max(1.1, B * 0.45), max(1.5, B * 0.75)),
               "rauch": (1.6, 3.0), "wolke": (2.0, 3.5)}[art]
        for _ in range(260):
            i = rng.choice(len(xs), p=gew)
            cx, cy = xs[i], ys[i]
            r = rng.uniform(*r_m) * s2
            for _ in range(5):
                sa = np.asarray(S.stempel(art, r, rng), np.float32)
                hh, ww = sa.shape[:2]
                xa, ya = int(cx - ww / 2), int(cy - hh / 2)
                xb, yb, xe, ye = max(0, xa), max(0, ya), min(CW, xa + ww), min(CH, ya + hh)
                if xe <= xb or ye <= yb:
                    break
                sub = sa[yb - ya:ye - ya, xb - xa:xe - xa]
                al = sub[..., 3] / 255
                o_alt = occ[yb:ye, xb:xe]
                o_neu = 1 - (1 - o_alt) * (1 - al)
                diff = o_neu - o_alt
                neu = cov + float((diff * m[yb:ye, xb:xe]).sum() / flaeche)
                frei_neu = frei_cov + (float((diff * frei_halten[yb:ye, xb:xe]).sum() / frei_flaeche) if frei_flaeche else 0.0)
                zu_viel = neu > ziel + 0.06 or frei_neu > 0.08
                if zu_viel and r > 0.6 * s2:
                    r *= 0.7
                    continue
                if zu_viel:
                    break
                a[yb:ye, xb:xe, :3] = a[yb:ye, xb:xe, :3] * (1 - al[..., None]) + sub[..., :3] * al[..., None]
                self._stoerung_ueber(sub[..., :3], al, (slice(yb, ye), slice(xb, xe)))
                occ[yb:ye, xb:xe] = o_neu
                cov, frei_cov = neu, frei_neu
                break
            if cov >= ziel - 0.02:
                break
        return a, occ, cov

    def _gischt(self, L, B, h, s2, sd):
        """Spritzwasser und Bugwelle in einer Furt (eigene Ebene, Mitte = Fahrzeugmitte)."""
        r = np.random.default_rng(sd)
        lw = F.Leinwand(L / 2 + 3, B / 2 + 3, s2 * F.SS, rng=r)
        for k in range(40):
            lx = r.uniform(L / 2 - 0.8, L / 2 + 2.2) if k < 18 else r.uniform(-L / 2, L / 2)
            ly = r.uniform(-B / 2 - 1.4, B / 2 + 1.4) if k < 18 else r.choice([-1, 1]) * r.uniform(B / 2 - 0.1, B / 2 + 1.2)
            rr = r.uniform(0.2, 0.6)
            c = (236, 240, 240) if r.random() < 0.7 else (200, 210, 212)
            lw.dr.ellipse(lw.P([(lx - rr, ly - rr)]) + lw.P([(lx + rr, ly + rr)]), fill=c + (int(r.uniform(120, 220)),))
        img = lw.ergebnis()
        return img.rotate(-h, resample=Image.BICUBIC, expand=True)
