"""Sichtstörungen für die Drohnenbilder (bild.sicht im Szenario).

Jede Störung ist eine Ebene aus Farbe und Deckkraft (alpha 0…1) in Bildkoordinaten.
  * Bereichsstörungen (lage = oben, unten, links, rechts, oben links, Mitte, ganzes Bild):
    Wolke, Rauch, Dunst. Der Anteil ist die verdeckte Bildfläche (Mittel der Deckkraft über das
    ganze Bild) und wird per Schwellwertsuche genau eingestellt.
  * Zielstörungen (lage = Ziel): Bäume, Tarnnetz, Rauch, Wolke als Stempel über dem Fahrzeug.
    Der Anteil ist der verdeckte Teil des Fahrzeugs; drohne.py setzt Stempel, bis er erreicht ist.
  * Bildstörung und Unschärfe verändern das Bild statt es zu verdecken.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, zoom

LAGE = {"oben": (0, 0, 1, .5), "unten": (0, .5, 1, 1), "links": (0, 0, .5, 1), "rechts": (.5, 0, 1, 1),
        "oben links": (0, 0, .58, .58), "oben rechts": (.42, 0, 1, .58), "unten links": (0, .42, .58, 1),
        "unten rechts": (.42, .42, 1, 1), "Mitte": (.2, .15, .8, .85), "ganzes Bild": (0, 0, 1, 1)}
VERDECKEND = ("wolke", "rauch", "dunst", "baeume", "tarnnetz")


def fraktal(h, w, rng, zelle, oktaven=4, pers=0.55, streckung=(1.0, 1.0)):
    """Fraktales Rauschen 0…1 (h×w). streckung > 1 zieht Strukturen in x bzw. y in die Länge."""
    out = np.zeros((h, w), np.float32)
    amp = 1.0
    c = float(zelle)
    for _ in range(oktaven):
        cx, cy = c * streckung[0], c * streckung[1]
        gh, gw = int(h / cy) + 3, int(w / cx) + 3
        g = rng.standard_normal((gh, gw)).astype(np.float32)
        z = zoom(g, (cy, cx), order=3, prefilter=False)[:h, :w]
        if z.shape != (h, w):
            z = np.pad(z, ((0, h - z.shape[0]), (0, w - z.shape[1])), mode="edge")
        out += amp * z
        amp *= pers
        c = max(c / 2, 1.5)
    out -= out.min()
    out /= out.max() + 1e-6
    return out


def bereich(lage, h, w, weich):
    """Weiche Rechteckmaske für eine Bildlage (0…1)."""
    x0, y0, x1, y1 = LAGE.get(lage, LAGE["ganzes Bild"])
    m = np.zeros((h, w), np.float32)
    m[int(y0 * h):int(math.ceil(y1 * h)), int(x0 * w):int(math.ceil(x1 * w))] = 1
    if weich > 0:
        # Ränder am Bildrand nicht ausblenden: vorher auffüllen
        p = int(weich * 3)
        m = np.pad(m, p, mode="edge")
        m = gaussian_filter(m, weich)[p:-p, p:-p]
    return m


def glatt_stufe(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def auf_anteil(feld, anteil, max_a=1.0, breite=0.07):
    """Schwelle so suchen, dass das Mittel der Deckkraft dem Anteil entspricht."""
    lo, hi = -1.0, 2.0
    for _ in range(40):
        th = (lo + hi) / 2
        a = glatt_stufe(feld, th - breite, th + breite) * max_a
        if a.mean() > anteil:
            lo = th
        else:
            hi = th
    return glatt_stufe(feld, th - breite, th + breite) * max_a


def bereichsstoerung(art, lage, anteil, h, w, rng):
    """Farbe (h×w×3, float) und Deckkraft (h×w) einer Wolke, von Rauch oder Dunst über eine Bildlage."""
    k = 4                                     # in Viertelauflösung rechnen, dann hochziehen
    hk, wk = h // k, w // k
    weich = min(hk, wk) * (0.2 if art == "wolke" else 0.12)
    reg = bereich(lage, hk, wk, weich)
    if art == "wolke":
        n = fraktal(hk, wk, rng, zelle=wk / 5, oktaven=5, pers=0.55)
        fein = fraktal(hk, wk, rng, zelle=wk / 22, oktaven=3, pers=0.6)
        feld = reg * 0.72 + n * 0.62 + fein * 0.14
        a = auf_anteil(feld, anteil, max_a=1.0, breite=0.1)
        a = np.clip(a * (0.82 + 0.3 * fein), 0, 1)              # ausgefranste, durchscheinende Ränder
        a = a * (anteil / max(a.mean(), 1e-6)) if a.mean() > 0 else a
        a = np.clip(a, 0, 1)
        # Wolkenoberfläche: Quellformen, Licht aus Nordwest
        hoehe = gaussian_filter(a, 6) + 0.35 * fein + 0.25 * fraktal(hk, wk, rng, zelle=wk / 12, oktaven=3)
        gy, gx = np.gradient(gaussian_filter(hoehe, 2))
        licht = np.clip(1.0 + 9.0 * (-gx - gy), 0.72, 1.12)
        hellig = (0.8 + 0.2 * fein) * licht
        farbe = np.dstack([246 * hellig, 247 * hellig, 250 * hellig])
    elif art == "rauch":
        n = fraktal(hk, wk, rng, zelle=wk / 7, oktaven=5, pers=0.6, streckung=(2.2, 1.0))
        feld = reg * 0.8 + n * 0.6
        a = auf_anteil(feld, anteil, max_a=0.86, breite=0.12)
        t = fraktal(hk, wk, rng, zelle=wk / 12, oktaven=3, streckung=(2.0, 1.0))
        farbe = np.dstack([62 + 50 * t, 60 + 46 * t, 58 + 40 * t])
    elif art == "dunst":
        n = fraktal(hk, wk, rng, zelle=wk / 4, oktaven=3)
        feld = reg * 0.9 + n * 0.25
        a = auf_anteil(feld, anteil, max_a=0.62, breite=0.35)
        farbe = np.dstack([np.full((hk, wk), 222.0), np.full((hk, wk), 228.0), np.full((hk, wk), 236.0)])
    else:
        raise ValueError(art)
    a = np.asarray(Image.fromarray((np.clip(a, 0, 1) * 65535).astype(np.uint16)).resize((w, h), Image.BICUBIC), np.float32) / 65535
    farbe = np.dstack([np.asarray(Image.fromarray(farbe[..., i].astype(np.float32)).resize((w, h), Image.BICUBIC)) for i in range(3)])
    return farbe.astype(np.float32), np.clip(a, 0, 1).astype(np.float32)


# ---------------------------------------------------------------------------- Stempel (lage = Ziel)
KRONEN = [(38, 56, 36), (44, 62, 40), (126, 108, 50), (116, 86, 46), (98, 96, 50), (86, 96, 52), (128, 78, 44), (150, 128, 58)]


def stempel(art, r_px, rng):
    """Farbe (RGBA-Bild) eines Stempels mit Radius r_px; Deckkraft im Alphakanal."""
    n = int(math.ceil(r_px * 2.4)) | 1
    yy, xx = (np.mgrid[0:n, 0:n].astype(np.float32) - n / 2) / r_px
    rr = np.sqrt(xx ** 2 + yy ** 2)
    rausch = fraktal(n, n, rng, zelle=max(2.0, r_px / 3), oktaven=3)
    if art == "baeume":
        rand = 1 + 0.18 * (rausch - 0.5) * 2
        a = glatt_stufe(-(rr - rand), -0.06, 0.06)
        kuppel = np.sqrt(np.clip(1 - rr ** 2, 0, 1))
        licht = np.clip(0.55 + 0.45 * (-(xx + yy) * 0.6 + kuppel * 0.8), 0.25, 1.25)
        blatt = 0.8 + 0.4 * fraktal(n, n, rng, zelle=max(1.5, r_px / 7), oktaven=2)
        c = np.array(KRONEN[rng.integers(len(KRONEN))], np.float32)
        rgb = c[None, None, :] * (licht * blatt)[..., None]
    elif art in ("rauch", "wolke"):
        a = np.clip(1 - rr, 0, 1) ** 1.2 * (0.55 + 0.6 * rausch)
        a = np.clip(a * (1.0 if art == "wolke" else 0.95), 0, 0.92)
        if art == "wolke":
            rgb = np.dstack([240 + 0 * rr, 242 + 0 * rr, 246 + 0 * rr]) * (0.9 + 0.12 * rausch)[..., None]
        else:
            rgb = np.dstack([70 + 40 * rausch, 68 + 36 * rausch, 64 + 30 * rausch])
    elif art == "tarnnetz":
        rand = 1 + 0.12 * (rausch - 0.5) * 2
        a = glatt_stufe(-(rr - rand), -0.03, 0.03)
        flecken = fraktal(n, n, rng, zelle=max(1.5, r_px / 9), oktaven=2)
        pal = np.array([(58, 66, 44), (104, 98, 66), (70, 78, 50), (92, 94, 60), (120, 108, 72)], np.float32)
        idx = np.clip((flecken * 5).astype(int), 0, 4)
        rgb = pal[idx] * (0.92 + 0.12 * rausch)[..., None]
        maschen = ((np.mod(xx * r_px, 5) < 0.8) | (np.mod(yy * r_px, 5) < 0.8))
        rgb = rgb * (1 - 0.1 * maschen[..., None])
    else:
        raise ValueError(art)
    rgba = np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


# ---------------------------------------------------------------------------- Veränderungen
def bildstoerung(img, staerke, rng):
    """Gestörter Datenlink: Rauschen, Streifen, versetzte Zeilenblöcke, Farbversatz (auf das fertige Bild)."""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    # Rauschen in Blöcken zu 2 × 2 Bildpunkten (Kompressionsartefakte des Datenlinks; bleibt bei starker Störung im
    # Größenbudget des Standbilds, seit 2.2)
    n = rng.normal(0, 34 * staerke, ((h + 1) // 2, (w + 1) // 2, a.shape[2]))
    a += np.repeat(np.repeat(n, 2, axis=0), 2, axis=1)[:h, :w]
    for _ in range(int(22 * staerke)):
        y, hh = int(rng.integers(0, h - 6)), int(rng.integers(1, 5))
        a[y:y + hh] = a[y:y + hh] * 0.35 + rng.uniform(120, 200)
    for _ in range(int(8 * staerke)):
        y, hh = int(rng.integers(0, h - 40)), int(rng.integers(6, 36))
        a[y:y + hh] = np.roll(a[y:y + hh], int(rng.integers(-28, 28)), axis=1)
    a[..., 0] = np.roll(a[..., 0], 2, axis=1)
    a[..., 2] = np.roll(a[..., 2], -2, axis=1)
    by = int(rng.integers(0, h - 60))
    a[by:by + 48, :, :] = a[by:by + 48, :, :] * 0.6 + a[by:by + 48, :, :].mean(axis=(0, 1)) * 0.4
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def bildstoerung_ebene(w, h, staerke, rng):
    """Bildstörung als Ebene (RGBA) für das Live-Drohnenbild: dieselben hellen Streifen und das graue Band
    wie bildstoerung() (gleiche Zufallsfolge), aber ohne Rauschen und Zeilenversatz – die macht die
    Oberfläche (Wackeln, Körnung), weil sie sich bewegen sollen."""
    rng.normal(0, 34 * staerke, ((h + 1) // 2, (w + 1) // 2, 3))  # gleiche Folge wie bildstoerung()
    P = np.zeros((h, w, 3), np.float32)                         # vormultiplizierte Farbe
    a = np.zeros((h, w), np.float32)

    def ueber(sl, farbe, al):
        P[sl] = P[sl] * (1 - al) + farbe * al
        a[sl] = a[sl] * (1 - al) + al
    for _ in range(int(22 * staerke)):
        y, hh = int(rng.integers(0, h - 6)), int(rng.integers(1, 5))
        ueber(slice(y, y + hh), rng.uniform(120, 200), 0.65)
    for _ in range(int(8 * staerke)):
        rng.integers(0, h - 40), rng.integers(6, 36), rng.integers(-28, 28)
    by = int(rng.integers(0, h - 60))
    ueber(slice(by, by + 48), 128.0, 0.4)
    rgb = P / np.maximum(a, 1e-6)[..., None]
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8), "RGBA")


def bewegungsunschaerfe(a, laenge_px, winkel_grad):
    """Lineare Bewegungsunschärfe eines Bildausschnitts (float-Array h×w×3) entlang winkel
    (Grad, 0 = Osten, im Uhrzeigersinn): Mittel aus verschobenen Kopien."""
    n = max(3, int(laenge_px))
    ca, sa = math.cos(math.radians(winkel_grad)), math.sin(math.radians(winkel_grad))
    p = n + 2
    b = np.pad(a, ((p, p), (p, p), (0, 0)), mode="edge")
    out = np.zeros_like(b)
    for k in range(n):
        f = k - (n - 1) / 2
        out += np.roll(np.roll(b, int(round(f * sa)), axis=0), int(round(f * ca)), axis=1)
    return (out / n)[p:-p, p:-p]
