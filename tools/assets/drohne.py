"""Drohnenbilder (EO, Draufsicht, Nord oben) für jede ARGUS-Meldung.

Für jede Meldung aus szenario_kraehe_01.json:
  1. Ausschnitt um die gemeldeten Ziele (Position zur Meldezeit t_s); Größe aus bild.ausschnitt_m
     oder automatisch, so dass Ziele und ihre Personen hineinpassen; bild.versatz_m verschiebt.
  2. Boden und Baumkronen aus dem Gelände, dazwischen alle Fahrzeuge, die zur Zeit t im Bild
     stehen (ungemeldete nur in Bildern für die Spielleitung), mit Schatten, Fahrspuren, Personen.
  3. Sichtstörungen aus bild.sicht, Anteil gemessen und im Manifest festgehalten.
  4. Kameraeindruck (Vignette, Farbstich, Rauschen). Kein HUD und keine ARGUS-Markierung im Bild:
     Rahmen, Klasse und Konfidenz zeichnet die Oberfläche aus dem Manifest (ziele[].box).

Bildgröße 1024 × 640 (16:10), WebP. Gezeichnet wird doppelt so groß und dann verkleinert.
"""
import math
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import fahrzeuge as F
import sicht as S
from daten import Daten, bewegt_sich, drehe, fahrtrichtung, position, rechteck, spur, vorhanden

OW, OH = 1024, 640
SK = 2
CW, CH = OW * SK, OH * SK
LICHT_WELT = (-0.7071, -0.7071)          # Licht aus Nordwest
KETTENFAHRZEUGE = ("kpz_t72", "kpz_pt91", "spz_bmp2")
AUFSITZ = {"traktor": {"plaetze": [(-3.5, -0.5), (-2.7, 0.45), (-1.9, -0.35), (-3.0, 0.1)], "verdeckt": 2}}
PERSON_UEBERHOEHUNG = 1.5               # Personen etwas größer als maßstäblich, damit sie im Bild erkennbar sind
SEITE = {"vorn": (1, 0), "hinten": (-1, 0), "links": (0, -1), "rechts": (0, 1)}


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


class Drohnenbilder:
    def __init__(self, d: Daten, gelaende, log=print):
        self.d = d
        self.g = gelaende
        self.log = log
        # Rand von 60 m (gespiegelt), damit Ausschnitte am Kartenrand nicht abgeschnitten werden
        self.rand_m = 60.0
        r = int(round(self.rand_m / gelaende.res))
        self.boden = Image.fromarray(np.pad(gelaende.boden, ((r, r), (r, r), (0, 0)), mode="reflect"), "RGB")
        self.krone = Image.fromarray(np.pad(gelaende.krone, ((r, r), (r, r), (0, 0)), mode="reflect"), "RGBA")

    # ================================================================== öffentliche Aufrufe
    def meldung(self, m):
        sp = dict(id=m["id"], t=m["t_s"], ziele=m["ziele"], bild=m["bild"], spielleitung=False)
        return self._render(sp)

    def zielbild(self, name, ziele, t):
        """Bild ohne Meldung (z. B. ungemeldete Ziele) nur für Spielleitung und Plenum."""
        sp = dict(id=name, t=t, ziele=ziele, bild={"sicht": []}, spielleitung=True)
        return self._render(sp)

    # ================================================================== Aufbau
    def _ausschnitt(self, sp):
        d, t = self.d, sp["t"]
        bild = sp["bild"]
        ps = [position(d.ziele[z], t) for z in sp["ziele"]]
        c = [sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps)]
        v = bild.get("versatz_m") or [0, 0]
        c = [c[0] + v[0], c[1] + v[1]]
        breite = bild.get("ausschnitt_m") or (110 if len(ps) == 1 else 120)
        noetig = []
        for zid in sp["ziele"]:
            z = d.ziele[zid]
            L, B = d.groesse(z)
            p, h = position(z, t), fahrtrichtung(z, t)
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
        """Alle Fahrzeuge, die zur Zeit t im Ausschnitt stehen."""
        d, t = self.d, sp["t"]
        out = []
        for z in d.szenario["ziele"]:
            if not vorhanden(z, t):
                continue
            if z.get("ungemeldet") and not sp["spielleitung"] and z["id"] not in sp["ziele"]:
                continue
            if not d.fahrzeuge[z["typ"]].get("sprite"):
                continue
            p = position(z, t)
            L, B = d.groesse(z)
            r = max(L, B)
            if x0 - r < p[0] < x0 + breite + r and y0 - r < p[1] < y0 + hoehe + r:
                out.append(z)
        out.sort(key=lambda z: (z["id"] in sp["ziele"], position(z, t)[1]))
        return out

    # ================================================================== Personen
    def _personen(self, sp, z, p, h):
        """Liste (x, y, art, klein, haende_hoch, tuch, oben) in Metern für die Personen eines Ziels."""
        d, t = self.d, sp["t"]
        rng = np.random.default_rng(saat(sp["id"], z["id"], "pers"))
        L, B = d.groesse(z)
        out = []
        for pe in z.get("personen") or []:
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
                    out.append((x, y, art, False, False, False, True))
                continue
            if art == "besatzung_ergibt_sich":
                for k in range(n):
                    out.append((q[0] + (k - (n - 1) / 2) * 0.95, q[1] + rng.normal(0, 0.15), art, False, True, k == 0, False))
            elif art == "soldat" and z["typ"] == "moerser_trupp":
                # Bedienung an beiden Rohren und bei den Munitionskisten verteilen
                plaetze = [(-L / 4 + 1.4, 0.9), (L / 4 + 1.4, 0.9), (-L / 4 - 1.2, -1.9), (L / 4 - 1.2, -1.9), (0.0, 1.9), (-0.8, 2.4)]
                for k in range(n):
                    lx, ly = plaetze[k % len(plaetze)]
                    x, y = drehe([(lx + rng.normal(0, 0.25), ly + rng.normal(0, 0.25))], p, h)[0]
                    out.append((x, y, art, False, False, False, False))
            elif art == "soldat":
                for k in range(n):
                    a = 2 * math.pi * k / n + rng.uniform(-0.4, 0.4)
                    r = rng.uniform(1.0, 3.4)
                    out.append((q[0] + r * math.cos(a), q[1] + r * math.sin(a), art, False, False, False, False))
            else:
                for k in range(n):
                    a = 2 * math.pi * k / n + rng.uniform(-0.3, 0.3)
                    r = rng.uniform(0.35, 1.1)
                    out.append((q[0] + r * math.cos(a), q[1] + r * math.sin(a), art, k >= n - klein, False, False, False))
        for pe in sp["bild"].get("personen") or []:                      # nur Darstellung (bild.personen)
            if pe.get("bei") != z["id"]:
                continue
            n = pe["anzahl"]
            for k in range(n):
                lx, ly = pe["versatz_m"]
                x, y = drehe([(lx, ly + (k - (n - 1) / 2) * 0.75)], p, h)[0]
                out.append((x, y, pe["art"], False, False, False, bool(pe.get("oben"))))
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
        hauptziele = [d.ziele[z] for z in sp["ziele"]]

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
            p, h = position(z, t), fahrtrichtung(z, t)
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
            if not (z.get("bewegung") and bewegt_sich(z, t - 1)):
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
                p, h = position(z, t), fahrtrichtung(z, t)
                r2 = np.random.default_rng(saat(sp["id"], z["id"], "kisten"))
                for k in range(10):
                    lx = -L / 2 - 1.4 - (k % 4) * 0.75 + r2.uniform(-0.1, 0.1)
                    ly = 0.9 + (k // 4) * 0.48 + r2.uniform(-0.1, 0.1)
                    pts = drehe(rechteck(lx, lx + 0.62, ly, ly + 0.36), p, h + r2.uniform(-8, 8))
                    dk.polygon([S2(q) for q in pts], fill=(96, 92, 60, 255) if k % 3 else (110, 98, 64, 255))

        # ---------------------------------------------------- Fahrzeuge und Personen
        schatten = Image.new("L", (CW, CH), 0)
        lagen = []          # (img, x, y) zum Einsetzen, in Reihenfolge
        oben = []
        rumpf_masken = {}
        personen_masken = []
        pers_meta = []
        for z in objekte:
            L, B = d.groesse(z)
            p, h = position(z, t), fahrtrichtung(z, t)
            spr = F.fahrzeug(z["typ"], (L, B), s2, zustand=zustand.get(z["id"]), seed=saat(z["id"]), licht=licht_lokal(h))
            spr = spr.rotate(-h, resample=Image.BICUBIC, expand=True)
            q = S2(p)
            x, y = int(round(q[0] - spr.width / 2)), int(round(q[1] - spr.height / 2))
            sh = 1.25 * s2
            schatten.paste(255, (int(x + sh), int(y + sh)), spr.split()[3])
            lagen.append((spr, x, y))
            if z["id"] in sp["ziele"]:
                rumpf_masken[z["id"]] = poly_maske(rumpf_px(z, x0, y0), CW, CH)
            if zustand.get(z["id"]) == "furt":
                lagen.append((self._gischt(L, B, h, s2, saat(sp["id"])), None, q))
            for (px, py, art, klein, hoch, tuch, auf) in self._personen(sp, z, p, h):
                r3 = np.random.default_rng(saat(sp["id"], z["id"], px, py))
                ps = F.person(art, s2 * PERSON_UEBERHOEHUNG, r3, klein=klein, haende_hoch=hoch, tuch=tuch, hdg=r3.uniform(0, 360))
                pq = S2((px, py))
                xx, yy = int(round(pq[0] - ps.width / 2)), int(round(pq[1] - ps.height / 2))
                if not auf:
                    schatten.paste(200, (int(xx + 0.8 * s2), int(yy + 0.8 * s2)), ps.split()[3])
                (oben if auf else lagen).append((ps, xx, yy))
                r = 0.35 * s2
                personen_masken.append((max(0, int(pq[1] - r)), min(CH, int(pq[1] + r) + 1),
                                        max(0, int(pq[0] - r)), min(CW, int(pq[0] + r) + 1)))
                pers_meta.append((z["id"], art, pq))
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

        # ---------------------------------------------------- Baumkronen (natürlich), angepasst je Ziel
        kr = np.asarray(self.krone.transform((CW, CH), Image.EXTENT, box_welt, Image.BICUBIC), np.float32)
        ka = kr[..., 3] / 255
        baum_sicht = {z: None for z in sp["ziele"]}
        for sv in sicht:
            if sv["lage"] == "Ziel" and sv["art"] == "baeume":
                for zid in sp["ziele"]:
                    baum_sicht[zid] = sv
        for zid in sp["ziele"]:
            z = d.ziele[zid]
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
                blur = S.bewegungsunschaerfe(a[y_0:y_1, x_0:x_1, :3], lang, fahrtrichtung(z, t))
                mm = m[y_0:y_1, x_0:x_1, None]
                a[y_0:y_1, x_0:x_1, :3] = a[y_0:y_1, x_0:x_1, :3] * (1 - mm) + blur * mm
                meta_sicht[k] = {"anteil_ist": sv["anteil"], "bezug": "Stärke"}

        # ---------------------------------------------------- Wolkenschatten und Bereichsstörungen
        for k, sv, farbe, al in bereiche:
            if sv["art"] == "wolke":
                sx, sy = int(CW * 0.03), int(CH * 0.045)
                sch = np.zeros_like(al)
                sch[sy:, sx:] = al[:-sy, :-sx]
                sch = np.asarray(Image.fromarray((sch * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(28)), np.float32) / 255
                a[..., :3] *= (1 - 0.24 * sch)[..., None]
        for k, sv, farbe, al in bereiche:
            a[..., :3] = a[..., :3] * (1 - al[..., None]) + farbe * al[..., None]
            occ = 1 - (1 - occ) * (1 - al)
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
        f = np.asarray(img, np.float32)
        grau = f.mean(axis=2, keepdims=True)
        f = f * 0.88 + grau * 0.12
        f = f * 0.93 + np.array([14, 15, 18], np.float32)
        yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
        vig = 1 - 0.26 * (((xx - OW / 2) / (OW / 2)) ** 2 + ((yy - OH / 2) / (OH / 2)) ** 2)
        f = f * vig[..., None] * np.array([0.97, 1.0, 1.035], np.float32) + rng.normal(0, 3.0, f.shape)
        img = Image.fromarray(np.clip(f, 0, 255).astype(np.uint8))
        for k, sv in enumerate(sicht):
            if sv["art"] == "stoerung":
                img = S.bildstoerung(img, sv["anteil"], np.random.default_rng(saat(sp["id"], "stoerung")))
                meta_sicht[k] = {"anteil_ist": sv["anteil"], "bezug": "Stärke"}

        # ---------------------------------------------------- Manifest-Eintrag
        def px(q):
            return [round((q[0] - x0) / mpp, 1), round((q[1] - y0) / mpp, 1)]
        ziele_meta = []
        for z in hauptziele:
            L, B = d.groesse(z)
            p, h = position(z, t), fahrtrichtung(z, t)
            ecken = [px(q) for q in drehe(rechteck(-L / 2 - 0.7, L / 2 + 0.7, -B / 2 - 0.7, B / 2 + 0.7), p, h)]
            bx0, by0 = min(e[0] for e in ecken), min(e[1] for e in ecken)
            bx1, by1 = max(e[0] for e in ecken), max(e[1] for e in ecken)
            m = rumpf_masken[z["id"]]
            eintrag = {"id": z["id"], "mitte": px(p), "hdg": round(h, 1),
                       "box": [int(math.floor(bx0)), int(math.floor(by0)), int(math.ceil(bx1 - bx0)), int(math.ceil(by1 - by0))],
                       "verdeckt": round(float((occ * m).sum() / m.sum()), 3)}
            if z["typ"] == "san_rad":                  # Schutzzeichen muss sichtbar bleiben (Schlüsselfall S2)
                km = poly_maske([S2(q) for q in drehe(rechteck(-1.6, 0.3, -0.95, 0.95), p, h)], CW, CH)
                eintrag["kennzeichen_verdeckt"] = round(float((occ * km).sum() / km.sum()), 3)
            ziele_meta.append(eintrag)
        pers_eintraege = {}
        for (zid, art, pq), (py0, py1, px0, px1) in zip(pers_meta, personen_masken):
            e = pers_eintraege.setdefault((zid, art), {"bei": zid, "art": art, "anzahl": 0, "verdeckt": 0.0, "punkte": []})
            e["anzahl"] += 1
            e["verdeckt"] += float(occ[py0:py1, px0:px1].mean()) if py1 > py0 and px1 > px0 else 0.0
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
            "breite": OW, "hoehe": OH, "t_s": t, "uhr": d.uhr(t), "pq": d.pq(position(hauptziele[0], t)),
            "ausschnitt_m": {"x": round(x0, 2), "y": round(y0, 2), "breite": round(breite, 2), "hoehe": round(hoehe, 2)},
            "m_pro_px": round(mpp, 4),
            "ziele": ziele_meta,
            "objekte": [{"id": z["id"], "mitte": px(position(z, t)), "hdg": round(fahrtrichtung(z, t), 1)}
                        for z in objekte if z["id"] not in sp["ziele"]],
            "personen": list(pers_eintraege.values()),
            "sicht": sicht_meta,
        }
        if sp["spielleitung"]:
            meta["nur_spielleitung"] = True
        return img, meta

    # ================================================================== Hilfen
    def _seitenfeld(self, z, seite, x0, y0, s2):
        """Für jeden Bildpunkt: Lage entlang der Seite des Fahrzeugs (−1 … 1 über die halbe Länge)."""
        d = self.d
        L, B = d.groesse(z)
        tt = self._t
        p, h = position(z, tt), fahrtrichtung(z, tt)
        vx, vy = SEITE[seite]
        wx, wy = drehe([(vx, vy)], (0, 0), h)[0]
        halb = L / 2 if vx else B / 2
        yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
        mx, my = (p[0] - x0) * s2, (p[1] - y0) * s2
        return ((xx - mx) * wx + (yy - my) * wy) / (halb * s2)

    def _abdecken(self, a, occ, m, sv, z, x0, y0, s2, frei_halten, rng):
        """Stempel über das Ziel setzen, bis der verdeckte Anteil erreicht ist.
        Personen (frei_halten) bleiben zu höchstens 8 % verdeckt."""
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
