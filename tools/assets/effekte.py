"""Effekt-Animationen in Draufsicht (prozedural, Bildfolgen im Spritesheet).

Namen der Wirkungseffekte wie in katalog_wirkmittel.json (effekt):
  explosion_mittel  Mörser (Steilfeuer)       explosion_klein  Loitering Munition
  treffer_direkt    Panzerabwehr (direktes Feuer)
dazu rauch (Schleife, für brennende Wracks), feuer (Schleife), krater (drei Varianten, statisch).

Jede Animation hat eine Bildgröße in Pixeln und eine sichtbare Größe in Metern (groesse_m);
die Karte skaliert danach. Der Wirkradius selbst wird nicht als Bild gezeigt, sondern als Kreis
(Spielregel), damit die Darstellung den Spielwert nicht vortäuscht.
"""
import math

import numpy as np
from PIL import Image

from sicht import fraktal, glatt_stufe

EFFEKTE = {
    # name: (bilder, px, groesse_m, fps, schleife)
    "explosion_mittel": (16, 192, 36.0, 16, False),
    "explosion_klein": (12, 128, 14.0, 18, False),
    "treffer_direkt": (10, 96, 8.0, 20, False),
    "rauch": (16, 128, 22.0, 8, True),
    "feuer": (8, 64, 6.0, 12, True),
    "krater": (3, 96, 12.0, 0, False),
}


def _raster(n):
    yy, xx = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5 - n / 2) / (n / 2)
    return xx, yy, np.sqrt(xx ** 2 + yy ** 2), np.arctan2(yy, xx)


def _rgba(rgb, a):
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8), "RGBA")


def _ueber(rgb, a, rgb2, a2):
    """Ebene 2 über Ebene 1 legen (gerade Alphawerte)."""
    ao = a2 + a * (1 - a2)
    out = (rgb2 * a2[..., None] + rgb * (a * (1 - a2))[..., None]) / np.maximum(ao, 1e-6)[..., None]
    return out, ao


def explosion(n_bilder, n, staerke, rng):
    xx, yy, rr, ww = _raster(n)
    rausch = [fraktal(n, n, np.random.default_rng(int(rng.integers(1 << 30))), zelle=n / 6, oktaven=4) for _ in range(3)]
    truemmer = [(rng.uniform(0, 2 * math.pi), rng.uniform(0.5, 1.0), rng.uniform(0.012, 0.03)) for _ in range(int(26 * staerke))]
    bilder = []
    for i in range(n_bilder):
        t = i / (n_bilder - 1)
        rgb = np.zeros((n, n, 3), np.float32)
        a = np.zeros((n, n), np.float32)
        # Rauch (dunkel, wächst, verblasst)
        if t > 0.15:
            ts = (t - 0.15) / 0.85
            rs = 0.45 + 0.5 * ts
            feld = rr / rs - 0.35 * (rausch[1] - 0.5)
            ar = glatt_stufe(-feld, -1.0, -0.6) * (0.85 * (1 - ts ** 1.6))
            grau = 54 + 60 * rausch[2] + 30 * ts
            rgb, a = _ueber(rgb, a, np.dstack([grau, grau * 0.97, grau * 0.92]), ar)
        # Feuerball
        if t < 0.65:
            tf = t / 0.65
            rf = 0.18 + 0.5 * math.sqrt(tf)
            feld = rr / rf - 0.45 * (rausch[0] - 0.5)
            af = glatt_stufe(-feld, -1.05, -0.75) * (1 - tf ** 2)
            heiss = np.clip(1 - rr / rf, 0, 1) * (1 - tf)
            farbe = np.dstack([255 * np.ones_like(rr), 140 + 110 * heiss, 30 + 200 * heiss ** 2])
            rgb, a = _ueber(rgb, a, farbe, af)
        # Blitz
        if t < 0.2:
            ab = np.clip(1 - rr / (0.25 + t * 1.2), 0, 1) ** 1.5 * (1 - t / 0.2)
            rgb, a = _ueber(rgb, a, np.dstack([np.full_like(rr, 255), np.full_like(rr, 250), np.full_like(rr, 225)]), ab)
        # Druckwelle
        if 0.04 < t < 0.35:
            rd = 0.3 + 2.0 * t
            ad = np.exp(-((rr - rd) / 0.035) ** 2) * 0.35 * (1 - t / 0.35)
            rgb, a = _ueber(rgb, a, np.dstack([np.full_like(rr, 235), np.full_like(rr, 228), np.full_like(rr, 210)]), ad)
        # Trümmer
        if 0.04 < t < 0.7:
            for w0, v, gr in truemmer:
                r0 = v * min(1.0, t * 1.8)
                x0, y0 = r0 * math.cos(w0), r0 * math.sin(w0)
                at = np.clip(1 - np.sqrt((xx - x0) ** 2 + (yy - y0) ** 2) / gr, 0, 1) * (1 - t / 0.7)
                rgb, a = _ueber(rgb, a, np.dstack([np.full_like(rr, 40), np.full_like(rr, 36), np.full_like(rr, 32)]), at)
        bilder.append(_rgba(rgb, a))
    return bilder


def treffer(n_bilder, n, rng):
    xx, yy, rr, ww = _raster(n)
    funken = [(rng.uniform(0, 2 * math.pi), rng.uniform(0.5, 1.0)) for _ in range(18)]
    rausch = fraktal(n, n, rng, zelle=n / 5, oktaven=3)
    bilder = []
    for i in range(n_bilder):
        t = i / (n_bilder - 1)
        rgb = np.zeros((n, n, 3), np.float32)
        a = np.zeros((n, n), np.float32)
        if t > 0.2:
            ts = (t - 0.2) / 0.8
            ar = glatt_stufe(-(rr / (0.3 + 0.45 * ts) - 0.4 * (rausch - 0.5)), -1, -0.6) * 0.7 * (1 - ts)
            g = 80 + 50 * rausch
            rgb, a = _ueber(rgb, a, np.dstack([g, g, g * 0.95]), ar)
        if t < 0.5:
            for w0, v in funken:
                r0 = v * (0.15 + t * 1.6)
                laenge = 0.12
                for k in range(4):
                    rk = r0 - laenge * k / 4
                    x0, y0 = rk * math.cos(w0), rk * math.sin(w0)
                    af = np.clip(1 - np.sqrt((xx - x0) ** 2 + (yy - y0) ** 2) / 0.03, 0, 1) * (1 - t / 0.5)
                    rgb, a = _ueber(rgb, a, np.dstack([np.full_like(rr, 255), np.full_like(rr, 220), np.full_like(rr, 120)]), af)
        if t < 0.3:
            ab = np.clip(1 - rr / 0.45, 0, 1) ** 1.3 * (1 - t / 0.3)
            rgb, a = _ueber(rgb, a, np.dstack([np.full_like(rr, 255), np.full_like(rr, 245), np.full_like(rr, 200)]), ab)
        bilder.append(_rgba(rgb, a))
    return bilder


def rauch_schleife(n_bilder, n, rng):
    """Rauchfahne von oben, Wind nach Südost; nahtlose Schleife."""
    xx, yy, rr, ww = _raster(n)
    puffs = 7
    phasen = [(k / puffs, rng.uniform(-0.15, 0.15), rng.uniform(0.85, 1.15)) for k in range(puffs)]
    rausch = [fraktal(n, n, np.random.default_rng(int(rng.integers(1 << 30))), zelle=n / 8, oktaven=3) for _ in range(2)]
    bilder = []
    for i in range(n_bilder):
        rgb = np.zeros((n, n, 3), np.float32)
        a = np.zeros((n, n), np.float32)
        for ph, quer, gr in sorted(phasen, key=lambda p: -((i / n_bilder + p[0]) % 1)):
            t = (i / n_bilder + ph) % 1
            cx = -0.55 + 1.1 * t + quer * 0.3
            cy = -0.55 + 1.1 * t - quer * 0.3
            r = (0.16 + 0.32 * t) * gr
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r - 0.5 * (rausch[0] - 0.5)
            ap = glatt_stufe(-d, -1.0, -0.4) * 0.55 * min(1, t * 6) * (1 - t) ** 0.8
            g = 70 + 55 * t + 25 * rausch[1]
            rgb, a = _ueber(rgb, a, np.dstack([g, g * 0.98, g * 0.94]), ap)
        bilder.append(_rgba(rgb, a))
    return bilder


def feuer_schleife(n_bilder, n, rng):
    xx, yy, rr, ww = _raster(n)
    basis = [fraktal(n, n, np.random.default_rng(int(rng.integers(1 << 30))), zelle=n / 5, oktaven=3) for _ in range(4)]
    bilder = []
    for i in range(n_bilder):
        w = 2 * math.pi * i / n_bilder
        mix = sum(basis[k] * (0.5 + 0.5 * math.cos(w + k * math.pi / 2)) for k in range(4)) / 2
        feld = rr / 0.8 - 0.6 * (mix - 0.5)
        af = glatt_stufe(-feld, -1.0, -0.55)
        heiss = np.clip(1 - feld, 0, 1)
        farbe = np.dstack([np.full_like(rr, 255), 90 + 150 * heiss, 20 + 140 * heiss ** 2])
        bilder.append(_rgba(farbe, af * 0.95))
    return bilder


def krater(n_var, n, rng):
    xx, yy, rr, ww = _raster(n)
    bilder = []
    for v in range(n_var):
        r2 = np.random.default_rng(int(rng.integers(1 << 30)))
        rausch = fraktal(n, n, r2, zelle=n / 7, oktaven=4)
        strahlen = 0.5 + 0.18 * np.cos(ww * r2.integers(5, 9) + r2.uniform(0, 6)) + 0.3 * (rausch - 0.5)
        russ = glatt_stufe(-(rr / (0.6 + 0.35 * strahlen) - 0.35 * (rausch - 0.5)), -1.0, -0.45) * 0.8
        rgb = np.dstack([30 + 20 * rausch, 28 + 18 * rausch, 26 + 14 * rausch])
        wall = np.exp(-((rr - 0.3) / 0.07) ** 2) * 0.8
        loch = glatt_stufe(-rr, -0.27, -0.2)
        rgb2 = np.dstack([96 + 30 * rausch, 84 + 26 * rausch, 66 + 20 * rausch])
        rgb, a = _ueber(rgb, russ, rgb2, wall)
        rgb, a = _ueber(rgb, a, np.dstack([18 + 0 * rr, 16 + 0 * rr, 14 + 0 * rr]), loch * 0.9)
        bilder.append(_rgba(rgb, a))
    return bilder


def alle(seed=11):
    rng = np.random.default_rng(seed)
    out = {}
    for name, (nb, px, gm, fps, schleife) in EFFEKTE.items():
        if name == "explosion_mittel":
            b = explosion(nb, px, 1.0, rng)
        elif name == "explosion_klein":
            b = explosion(nb, px, 0.6, rng)
        elif name == "treffer_direkt":
            b = treffer(nb, px, rng)
        elif name == "rauch":
            b = rauch_schleife(nb, px, rng)
        elif name == "feuer":
            b = feuer_schleife(nb, px, rng)
        else:
            b = krater(nb, px, rng)
        out[name] = b
    return out
