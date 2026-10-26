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
    # name: (bilder, px, groesse_m, fps, schleife)   px/groesse_m = Breite; Höhe und Anker in FORM
    "explosion_mittel": (16, 192, 36.0, 16, False),
    "explosion_klein": (12, 128, 14.0, 18, False),
    "treffer_direkt": (10, 96, 8.0, 20, False),
    "rauch": (16, 128, 22.0, 8, True),
    "feuer": (8, 64, 6.0, 12, True),
    "krater": (3, 96, 12.0, 0, False),
    # Schritt 5b (Konzept v2: Live-Lage, Hintergrundgefecht)
    "lm_flug": (8, 64, 3.2, 16, True),                 # Loitering Munition im Flug (Blick nach Osten)
    "leuchtspur": (6, 256, 24.0, 20, True),            # Leuchtspur der eigenen PzAbw, Kopf vorn (Osten)
    "muendungsblitz": (6, 120, 10.0, 24, False),       # Kanone/Maschinenkanone, Rohr nach Osten
    "muendungsblitz_steil": (8, 72, 8.0, 18, False),   # Mörser (Steilfeuer), ringförmig
    "einschlag_artillerie": (18, 224, 44.0, 14, False),  # Feindartillerie: Erdfontäne, Staub
    "nebel": (16, 256, 64.0, 6, True),                 # Rauch-/Nebelwand (Rückzug unter Rauch, H-03)
    # Szenario 2.1 (A8: dynamische Animationen)
    "abschussrauch": (14, 96, 12.0, 7, False),         # Rauch nach dem Abschuss (Mörser, Kanone): quillt auf, zieht ab
    "staub": (4, 64, 8.0, 0, False),                   # Staubwolke hinter fahrenden Fahrzeugen (4 Varianten)
}

# Abweichende Form und Anker (Anteil der Bildbreite/-höhe); sonst quadratisch, Anker Mitte.
FORM = {
    "rauch": {"anker": (0.225, 0.225), "hinweis": "Anker = Quelle (Wrack); die Fahne zieht nach Südost"},
    "lm_flug": {"hinweis": "um die Flugrichtung drehen (0 = Osten); Schatten wie bei Fahrzeugen, aber 4 m versetzt"},
    "leuchtspur": {"hoehe_px": 32, "hoehe_m": 3.0, "anker": (0.94, 0.5),
                   "hinweis": "Anker = Kopf; vom Westrand zum Ziel bewegen und um die Flugrichtung drehen"},
    "muendungsblitz": {"hoehe_px": 72, "hoehe_m": 6.0, "anker": (0.1, 0.5),
                       "hinweis": "Anker = Mündung (Rohrende); um die Rohrrichtung drehen"},
    "einschlag_artillerie": {"hinweis": "danach krater; Staub zieht nach Südost"},
    "nebel": {"hinweis": "mehrere Instanzen über die Fläche (radius_m) verteilen, ein- und ausblenden"},
    "abschussrauch": {"hinweis": "nach dem Mündungsblitz am selben Ort abspielen (Echtzeit); zieht nach Südost ab"},
    "staub": {"hinweis": "Varianten (fps 0): je Wolke eine, mit dem Alter größer und blasser zeichnen; Wind nach Südost"},
}

# Welche Animation wofür (Oberfläche, Schritt 6b/7). Wirkmittel-IDs wie in katalog_wirkmittel.json,
# Hintergrund-Arten wie in szenario.hintergrund.ereignisse[].art.
ZUORDNUNG = {
    "wirkmittel": {
        "MRS": {"flug": None, "einschlag": "explosion_mittel", "danach": ["krater"]},
        "LM": {"flug": "lm_flug", "einschlag": "explosion_klein", "danach": ["krater"]},
        "PZA": {"flug": "leuchtspur", "einschlag": "treffer_direkt", "danach": []},
    },
    "hintergrund": {
        "feindartillerie": {"einschlag": "einschlag_artillerie", "danach": ["krater"]},
        "panzerabwehr": {"flug": "leuchtspur", "einschlag": "treffer_direkt"},
        "rauch": {"flaeche": "nebel"},
    },
    "wrack": {"zerstoert": ["feuer", "rauch"], "ausser_gefecht": []},
    "feuert": {"kanone": "muendungsblitz", "moerser": "muendungsblitz_steil"},
    # Szenario 2.1: Rauch nach dem Abschuss, Staub hinter fahrenden Fahrzeugen
    "abschuss": {"kanone": "abschussrauch", "moerser": "abschussrauch"},
    "fahrt": "staub",
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


# ============================================================================ Schritt 5b
def _feld(w, h, breite_m, hoehe_m):
    """Koordinaten in Metern (x nach Osten, y nach Süden) für ein w×h-Bild mit Mitte 0,0."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return (xx + 0.5 - w / 2) * (breite_m / w), (yy + 0.5 - h / 2) * (hoehe_m / h)


def _voll(form, rgb):
    return np.dstack([np.full(form, rgb[0], np.float32), np.full(form, rgb[1], np.float32), np.full(form, rgb[2], np.float32)])


def lm_flug(n_bilder, n, groesse_m, rng):
    """Loitering Munition im Flug: Rumpf mit X-Flügeln (wie lm_flugkoerper im Fahrzeug-Atlas),
    Druckpropeller am Heck als drehende, halbdurchsichtige Scheibe, Blitzlicht an den Flügelspitzen."""
    import fahrzeuge as F
    bilder = []
    for i in range(n_bilder):
        lw = F.Leinwand(groesse_m / 2, groesse_m / 2, n / groesse_m * F.SS, rng=np.random.default_rng(3))
        grau = (104, 108, 104)
        for s in (-1, 1):
            lw.poly([(0.25, 0.0), (-0.05, s * 1.15), (-0.3, s * 1.15), (-0.05, 0.0)], F.hell(grau, 0.9))
            lw.poly([(-0.65, 0.0), (-0.85, s * 0.55), (-1.0, s * 0.55), (-0.85, 0.0)], F.hell(grau, 0.85))
        lw.ell(0.0, 0.0, 1.05, 0.12, grau)
        lw.ell(0.95, 0.0, 0.12, 0.08, (40, 44, 48))                 # Suchkopf
        # Propellerscheibe (Draufsicht: schmale Ellipse quer zum Rumpf) mit umlaufendem Blatt
        lw.dr.ellipse(lw.P([(-1.16, -0.42)]) + lw.P([(-1.04, 0.42)]), fill=(70, 72, 70, 70))
        w = 2 * math.pi * i / n_bilder
        ya = 0.4 * math.cos(w)
        lw.linie([(-1.1, -ya), (-1.1, ya)], (40, 40, 38), 0.06)
        if i % 4 == 0:                                               # Blitzlicht
            for s, c in ((-1, (255, 60, 50)), (1, (120, 255, 140))):
                lw.ell(-0.2, s * 1.12, 0.09, 0.09, c)
        bilder.append(lw.ergebnis())
    return bilder


def leuchtspur(n_bilder, w, h, laenge_m, hoehe_m, rng):
    """Leuchtspur in Draufsicht: heißer Kopf vorn (Osten), Schweif nach Westen, flackert."""
    xx, yy = _feld(w, h, laenge_m, hoehe_m)
    kopf_x = laenge_m * (0.94 - 0.5)
    bilder = []
    for i in range(n_bilder):
        flacker = rng.uniform(0.82, 1.0)
        schweif = laenge_m * rng.uniform(0.62, 0.8)
        u = np.clip(1 - (kopf_x - xx) / schweif, 0, 1)               # 1 am Kopf, 0 am Schweifende
        u = np.where(xx > kopf_x, np.clip(1 - (xx - kopf_x) / 0.35, 0, 1), u)
        kern = np.exp(-(yy / 0.13) ** 2) * u ** 1.6
        glut = np.exp(-(yy / (0.45 + 0.35 * (1 - u))) ** 2) * u ** 2.4 * 0.55
        kopf = np.exp(-(((xx - kopf_x) / 0.7) ** 2 + (yy / 0.42) ** 2)) * 0.9
        rgb = np.zeros((h, w, 3), np.float32)
        a = np.zeros((h, w), np.float32)
        rgb, a = _ueber(rgb, a, _voll((h, w), (255, 110, 40)), np.clip(glut * flacker, 0, 1))
        rgb, a = _ueber(rgb, a, np.dstack([np.full((h, w), 255.0), 150 + 100 * u, 60 + 160 * u ** 2]), np.clip(kern * flacker, 0, 1))
        rgb, a = _ueber(rgb, a, _voll((h, w), (255, 250, 228)), np.clip(kopf * flacker, 0, 1))
        bilder.append(_rgba(rgb, a))
    return bilder


def muendungsblitz(n_bilder, w, h, breite_m, hoehe_m, rng):
    """Mündungsfeuer einer Kanone von oben: Feuerzunge nach vorn, seitliche Strahlen der Mündungsbremse,
    danach Pulverdampf. Mündung bei x = 10 % der Breite."""
    xx, yy = _feld(w, h, breite_m, hoehe_m)
    x0 = breite_m * (0.1 - 0.5)
    rx = xx - x0
    rausch = fraktal(h, w, rng, zelle=w / 7, oktaven=3)
    bilder = []
    for i in range(n_bilder):
        t = i / (n_bilder - 1)
        rgb = np.zeros((h, w, 3), np.float32)
        a = np.zeros((h, w), np.float32)
        if t > 0.1:                                                  # Pulverdampf
            ts = (t - 0.1) / 0.9
            cx, r = 1.6 + 3.2 * ts, 0.9 + 1.8 * ts
            d = np.sqrt(((rx - cx) / (r * 1.25)) ** 2 + (yy / r) ** 2) - 0.45 * (rausch - 0.5)
            ad = glatt_stufe(-d, -1.0, -0.5) * 0.55 * (1 - ts) ** 1.2
            g = 150 + 50 * rausch
            rgb, a = _ueber(rgb, a, np.dstack([g, g * 0.98, g * 0.94]), ad)
        if t < 0.45:                                                 # Feuerzunge und Seitenstrahlen
            tf = t / 0.45
            f = 1 - tf
            zunge = np.exp(-(((rx - 1.5) / (1.6 + 0.6 * tf)) ** 2 + (yy / (0.55 + 0.3 * tf)) ** 2))
            seite = sum(np.exp(-(((rx - 0.25) / 0.45) ** 2 + ((yy - s * (0.9 + 0.5 * tf)) / 0.5) ** 2)) for s in (-1, 1)) * 0.8
            af = np.clip((zunge + seite) * (1.2 * f), 0, 1)
            heiss = np.clip(zunge * 1.4 * f, 0, 1)
            rgb, a = _ueber(rgb, a, np.dstack([np.full((h, w), 255.0), 150 + 100 * heiss, 50 + 190 * heiss ** 2]), af)
        bilder.append(_rgba(rgb, a))
    return bilder


def muendungsblitz_steil(n_bilder, n, groesse_m, rng):
    """Mörser feuert: kurzer runder Blitz, Druckring wirbelt Staub auf, Rauchwolke."""
    xx, yy = _feld(n, n, groesse_m, groesse_m)
    rr = np.sqrt(xx ** 2 + yy ** 2)
    rausch = fraktal(n, n, rng, zelle=n / 6, oktaven=3)
    bilder = []
    for i in range(n_bilder):
        t = i / (n_bilder - 1)
        rgb = np.zeros((n, n, 3), np.float32)
        a = np.zeros((n, n), np.float32)
        rs = 0.8 + 2.8 * t                                           # Staubring
        ring = np.exp(-((rr - rs) / (0.45 + 0.5 * t)) ** 2) * (0.75 * (1 - t) ** 0.8) * (0.7 + 0.6 * rausch)
        rgb, a = _ueber(rgb, a, np.dstack([150 + 30 * rausch, 136 + 26 * rausch, 108 + 20 * rausch]), np.clip(ring, 0, 1))
        if t > 0.1:
            d = rr / (0.6 + 1.6 * t) - 0.5 * (rausch - 0.5)
            ar = glatt_stufe(-d, -1.0, -0.5) * 0.6 * (1 - t)
            g = 170 + 40 * rausch
            rgb, a = _ueber(rgb, a, np.dstack([g, g, g * 0.97]), ar)
        if t < 0.3:
            ab = np.clip(1 - rr / (0.9 + 1.4 * t), 0, 1) ** 1.4 * (1 - t / 0.3)
            rgb, a = _ueber(rgb, a, _voll((n, n), (255, 236, 170)), ab)
        bilder.append(_rgba(rgb, a))
    return bilder


def einschlag_artillerie(n_bilder, n, rng):
    """Einschlag der Feindartillerie im Feld, von oben: kurzer Blitz, Erdfontäne als dunkle Strahlen,
    braungraue Staubwolke, die sich ausbreitet und nach Südost abzieht (kein Feuerball wie bei Mörser/LM)."""
    xx, yy, rr, ww = _raster(n)
    rausch = [fraktal(n, n, np.random.default_rng(int(rng.integers(1 << 30))), zelle=n / 6, oktaven=4) for _ in range(3)]
    strahlen = [(rng.uniform(0, 2 * math.pi), rng.uniform(0.45, 0.85), rng.uniform(0.05, 0.11)) for _ in range(16)]
    brocken = [(rng.uniform(0, 2 * math.pi), rng.uniform(0.4, 0.98), rng.uniform(0.012, 0.026)) for _ in range(40)]
    bilder = []
    for i in range(n_bilder):
        t = i / (n_bilder - 1)
        rgb = np.zeros((n, n, 3), np.float32)
        a = np.zeros((n, n), np.float32)
        # Staubwolke (wächst, zieht ab, verblasst langsam)
        if t > 0.06:
            ts = (t - 0.06) / 0.94
            cx, cy = 0.12 * ts, 0.12 * ts
            rs = 0.25 + 0.55 * ts ** 0.7
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / rs - 0.4 * (rausch[1] - 0.5)
            ad = glatt_stufe(-d, -1.0, -0.55) * (0.92 - 0.62 * ts)
            g = rausch[2]
            rgb, a = _ueber(rgb, a, np.dstack([108 + 40 * g + 20 * ts, 94 + 34 * g + 22 * ts, 74 + 28 * g + 24 * ts]), ad)
        # Erdfontäne: dunkle Strahlen
        if 0.02 < t < 0.6:
            tr = (t - 0.02) / 0.58
            for w0, laenge, breite in strahlen:
                L = laenge * min(1.0, tr * 2.2)
                dw = np.angle(np.exp(1j * (ww - w0)))
                band = np.exp(-(dw / breite) ** 2) * (rr < L) * np.clip(1 - rr / max(L, 1e-3), 0, 1) ** 0.4
                rgb, a = _ueber(rgb, a, np.dstack([62 + 0 * rr, 50 + 0 * rr, 38 + 0 * rr]), np.clip(band * 0.85 * (1 - tr), 0, 1))
        # Brocken
        if 0.03 < t < 0.75:
            for w0, v, gr in brocken:
                r0 = v * min(1.0, t * 1.6)
                x0, y0 = r0 * math.cos(w0), r0 * math.sin(w0)
                ab = np.clip(1 - np.sqrt((xx - x0) ** 2 + (yy - y0) ** 2) / gr, 0, 1) * (1 - t / 0.75)
                rgb, a = _ueber(rgb, a, _voll((n, n), (46, 38, 30)), ab)
        # Blitz
        if t < 0.12:
            ab = np.clip(1 - rr / (0.14 + t * 1.1), 0, 1) ** 1.3 * (1 - t / 0.12)
            rgb, a = _ueber(rgb, a, _voll((n, n), (255, 226, 160)), ab)
        bilder.append(_rgba(rgb, a))
    return bilder


def nebel(n_bilder, n, rng):
    """Rauch-/Nebelwand als nahtlose Schleife: hellgrauer, quellender Rauch mit weichem Rand."""
    xx, yy, rr, ww = _raster(n)
    basis = [fraktal(n, n, np.random.default_rng(int(rng.integers(1 << 30))), zelle=n / 5, oktaven=4) for _ in range(4)]
    fein = fraktal(n, n, np.random.default_rng(int(rng.integers(1 << 30))), zelle=n / 16, oktaven=3)
    bilder = []
    for i in range(n_bilder):
        w = 2 * math.pi * i / n_bilder
        mix = sum(basis[k] * (0.5 + 0.5 * math.cos(w + k * math.pi / 2)) for k in range(4)) / 2
        d = rr / 0.92 - 0.5 * (mix - 0.5) - 0.12 * (fein - 0.5)
        al = glatt_stufe(-d, -1.0, -0.35) * 0.86
        hoehe = mix + 0.3 * fein
        gy, gx = np.gradient(hoehe)
        licht = np.clip(1.0 + 6.0 * (-gx - gy), 0.8, 1.1)
        g = (196 + 26 * fein) * licht
        bilder.append(_rgba(np.dstack([g, g * 1.01, g * 1.0]), al))
    return bilder


def abschussrauch(n_bilder, n, groesse_m, rng):
    """Rauch nach dem Abschuss, von oben: dichter hellgrauer Ballen, quillt auf, zieht mit dem Wind nach Südost und
    verblasst (folgt auf muendungsblitz bzw. muendungsblitz_steil)."""
    xx, yy = _feld(n, n, groesse_m, groesse_m)
    rausch = [fraktal(n, n, np.random.default_rng(int(rng.integers(1 << 30))), zelle=n / 6, oktaven=3) for _ in range(2)]
    bilder = []
    for i in range(n_bilder):
        t = i / (n_bilder - 1)
        cx = cy = 0.9 * groesse_m * 0.18 * t                       # Drift nach Südost
        r = groesse_m * (0.12 + 0.3 * t ** 0.7)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r - 0.55 * (rausch[0] - 0.5)
        a = glatt_stufe(-d, -1.0, -0.45) * (0.82 * (1 - t) ** 1.3) * min(1.0, 0.35 + t * 5)
        g = (178 + 36 * rausch[1]) * (0.94 + 0.06 * t)
        bilder.append(_rgba(np.dstack([g, g * 0.985, g * 0.96]), a))
    return bilder


def staub(n_var, n, groesse_m, rng):
    """Staubwolke hinter einem fahrenden Fahrzeug (Draufsicht): weich, sandfarben, unregelmäßiger Rand; Varianten."""
    xx, yy = _feld(n, n, groesse_m, groesse_m)
    rr = np.sqrt(xx ** 2 + yy ** 2) / (groesse_m / 2)
    bilder = []
    for v in range(n_var):
        r2 = np.random.default_rng(int(rng.integers(1 << 30)))
        rausch = fraktal(n, n, r2, zelle=n / 5, oktaven=3)
        fein = fraktal(n, n, r2, zelle=n / 12, oktaven=2)
        d = rr / 0.78 - 0.6 * (rausch - 0.5)
        a = glatt_stufe(-d, -1.0, -0.2) * (0.55 + 0.25 * fein)
        rgb = np.dstack([168 + 26 * fein, 150 + 22 * fein, 118 + 16 * fein])
        bilder.append(_rgba(rgb, a))
    return bilder


def alle(seed=11):
    rng = np.random.default_rng(seed)
    out = {}
    for name, (nb, px, gm, fps, schleife) in EFFEKTE.items():
        form = FORM.get(name, {})
        neu = np.random.default_rng(zlib_saat(name))          # Effekte ab 5b: eigener Seed je Effekt
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
        elif name == "krater":
            b = krater(nb, px, rng)
        elif name == "lm_flug":
            b = lm_flug(nb, px, gm, neu)
        elif name == "leuchtspur":
            b = leuchtspur(nb, px, form["hoehe_px"], gm, form["hoehe_m"], neu)
        elif name == "muendungsblitz":
            b = muendungsblitz(nb, px, form["hoehe_px"], gm, form["hoehe_m"], neu)
        elif name == "muendungsblitz_steil":
            b = muendungsblitz_steil(nb, px, gm, neu)
        elif name == "einschlag_artillerie":
            b = einschlag_artillerie(nb, px, neu)
        elif name == "nebel":
            b = nebel(nb, px, neu)
        elif name == "abschussrauch":
            b = abschussrauch(nb, px, gm, neu)
        elif name == "staub":
            b = staub(nb, px, gm, neu)
        else:
            raise ValueError(name)
        out[name] = b
    return out


def zlib_saat(name):
    import zlib
    return zlib.crc32(name.encode()) & 0x7FFFFFFF
