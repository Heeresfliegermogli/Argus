"""Kartenpaket Raum KRÄHE.

  luftbild_1m.webp      1000 × 700   schneller erster Aufbau
  luftbild_050.webp     2000 × 1400  Standard für die Lagekarte
  kacheln/z025/X_Y.webp 512er Kacheln in 0,25 m/px, nur bei starkem Zoom nachladen
  topo_050.webp         schematische Karte (Wald, Wege, Gebäude) als ruhiger Hintergrund
  lagekarte_beschriftet.webp  Luftbild mit Raster, Zonen und Namen (Vorschau, Plenum, Druck)
  gelaende.json         erzeugte Einzelhäuser (Vektoren), falls die Karte sie selbst zeichnen will

Raster, Zonen, Namen und Zeichen zeichnet die Spielkarte selbst aus den Daten. Die Bilder
enthalten deshalb (außer der Vorschau) keine Schrift und keine Zonen.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from daten import Daten, drehe, linie_punkte, rechteck

KACHEL_PX = 512
FD = "/usr/share/fonts/truetype/dejavu/"


def speichere_webp(img, pfad, qualitaet=80, verlustfrei=False):
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    if verlustfrei:
        img.save(pfad, "WEBP", lossless=True, quality=100, method=6)
    else:
        img.save(pfad, "WEBP", quality=qualitaet, method=6)
    return os.path.getsize(pfad)


def luftbild(g, rng):
    w = g.welt()
    w = w + rng.normal(0, 2.0, w.shape).astype(np.float32)
    return Image.fromarray(np.clip(w, 0, 255).astype(np.uint8), "RGB")


def kartenpaket(d: Daten, g, aus, log=print):
    rng = np.random.default_rng(3)
    eintrag = {"id": d.karte["id"], "ausdehnung_m": d.karte["ausdehnung_m"]}
    log("Karte: Luftbild …")
    welt = luftbild(g, rng)
    W, H = welt.size
    stufen = []
    for name, mpp, q in (("luftbild_1m.webp", 1.0, 80), ("luftbild_050.webp", 0.5, 80)):
        img = welt.resize((int(round(d.breite_m / mpp)), int(round(d.hoehe_m / mpp))), Image.LANCZOS)
        n = speichere_webp(img, os.path.join(aus, "karte", name), q)
        stufen.append({"datei": f"karte/{name}", "m_pro_px": mpp, "breite": img.width, "hoehe": img.height, "bytes": n})
    log("Karte: Kacheln …")
    spalten, zeilen = math.ceil(W / KACHEL_PX), math.ceil(H / KACHEL_PX)
    gesamt = 0
    for j in range(zeilen):
        for i in range(spalten):
            box = (i * KACHEL_PX, j * KACHEL_PX, min(W, (i + 1) * KACHEL_PX), min(H, (j + 1) * KACHEL_PX))
            gesamt += speichere_webp(welt.crop(box), os.path.join(aus, "karte", "kacheln", "z025", f"{i}_{j}.webp"), 76)
    eintrag["luftbild"] = {
        "stufen": stufen,
        "kacheln": {"muster": "karte/kacheln/z025/{x}_{y}.webp", "m_pro_px": g.res, "kachel_px": KACHEL_PX,
                    "spalten": spalten, "zeilen": zeilen, "bytes": gesamt,
                    "hinweis": "Randkacheln sind kleiner (rechts und unten abgeschnitten)."},
    }
    log("Karte: Topo …")
    topo = topokarte(d, g)
    n = speichere_webp(topo, os.path.join(aus, "karte", "topo_050.webp"), 90)
    eintrag["topo"] = {"datei": "karte/topo_050.webp", "m_pro_px": 0.5, "breite": topo.width, "hoehe": topo.height, "bytes": n}
    log("Karte: beschriftete Lagekarte …")
    lk = beschriftet(d, welt)
    n = speichere_webp(lk, os.path.join(aus, "karte", "lagekarte_beschriftet.webp"), 82)
    eintrag["lagekarte"] = {"datei": "karte/lagekarte_beschriftet.webp", "m_pro_px": round(d.breite_m / lk.width, 4),
                            "breite": lk.width, "hoehe": lk.height, "bytes": n,
                            "hinweis": "Vorschau/Rückfall mit eingebrannter Schrift; im Spiel zeichnet die Karte Raster, Zonen und Namen selbst."}
    haeuser = [{"mitte": [round(h[0], 1), round(h[1], 1)], "laenge": round(h[2], 1), "breite": round(h[3], 1), "winkel": round(h[4], 1)}
               for h in g.haeuser]
    pfad = os.path.join(aus, "karte", "gelaende.json")
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump({"hinweis": "Vom Generator erzeugte Einzelhäuser (Regel karte.bebauung), Koordinaten in Metern.",
                   "haeuser": haeuser}, f, ensure_ascii=False, separators=(",", ":"))
    eintrag["gelaende"] = {"datei": "karte/gelaende.json", "bytes": os.path.getsize(pfad)}
    return eintrag


# ---------------------------------------------------------------------------- Topo
FARBE_TOPO = {"grund": (240, 236, 222), "wald": (186, 211, 165), "waldrand": (127, 163, 106), "strasse": (141, 141, 141),
              "strasse_innen": (250, 250, 250), "feldweg": (161, 136, 127), "wasser": (74, 144, 200), "gebaeude": (158, 158, 158),
              "gebaeude_rand": (97, 97, 97), "schule": (232, 238, 223), "hof": (227, 220, 203), "sport": (197, 219, 176),
              "bahn": (214, 160, 140), "pflaster": (214, 210, 200), "parkplatz": (200, 200, 200)}


def topokarte(d, g, mpp=0.5, ss=2):
    s = ss / mpp
    W, H = int(d.breite_m * s), int(d.hoehe_m * s)

    def P(p):
        return (p[0] * s, p[1] * s)
    kr = Image.fromarray(g.krone[..., 3]).resize((W, H), Image.BILINEAR)
    from scipy.ndimage import binary_closing, binary_opening
    wald = binary_opening(binary_closing(np.asarray(kr, np.float32) / 255 > 0.45, iterations=3), iterations=1)
    img = Image.new("RGB", (W, H), FARBE_TOPO["grund"])
    rand = Image.fromarray((wald * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    img.paste(FARBE_TOPO["waldrand"], (0, 0), rand)
    img.paste(FARBE_TOPO["wald"], (0, 0), Image.fromarray((wald * 255).astype(np.uint8)))
    dr = ImageDraw.Draw(img)
    for art in ("schule", "hof", "pflaster", "parkplatz"):
        for f in d.flaechen(art):
            dr.polygon([P(p) for p in f["punkte"]], fill=FARBE_TOPO[art])
    for gb in d.gebaeude("sportplatz"):
        from gelaende import stadion
        dr.polygon([P(p) for p in drehe(stadion(gb["laenge"], gb["breite"]), gb["mitte"], gb["winkel"])], fill=FARBE_TOPO["bahn"])
        dr.polygon([P(p) for p in drehe(stadion(gb["laenge"] - 14, gb["breite"] - 14), gb["mitte"], gb["winkel"])], fill=FARBE_TOPO["sport"])
    for l, pts in d.linien("feldweg"):
        q = [P(p) for p in pts]
        # gestrichelt
        laenge = 0
        for a, b in zip(q, q[1:]):
            seg = math.hypot(b[0] - a[0], b[1] - a[1])
            n = max(1, int(seg / 2))
            for k in range(n):
                t0, t1 = k / n, (k + 1) / n
                if int((laenge + seg * t0) / (6 * s)) % 2 == 0:
                    dr.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)],
                            fill=FARBE_TOPO["feldweg"], width=int(1.6 * s))
            laenge += seg
    for l, pts in d.linien("gewaesser"):
        dr.line([P(p) for p in pts], fill=FARBE_TOPO["wasser"], width=int(l["breite_m"] * s), joint="curve")
    for l, pts in d.linien("strasse"):
        dr.line([P(p) for p in pts], fill=FARBE_TOPO["strasse"], width=int((l["breite_m"] + 2) * s), joint="curve")
    for l, pts in d.linien("strasse"):
        dr.line([P(p) for p in pts], fill=FARBE_TOPO["strasse_innen"], width=int(l["breite_m"] * s), joint="curve")
    gebaeude = [(h[0], h[1], h[2], h[3], h[4]) for h in g.haeuser] + \
               [(gb["mitte"][0], gb["mitte"][1], gb["laenge"], gb["breite"], gb["winkel"]) for gb in d.gebaeude() if gb["art"] != "sportplatz"]
    for (cx, cy, w, t, a) in gebaeude:
        dr.polygon([P(p) for p in drehe(rechteck(-w / 2, w / 2, -t / 2, t / 2), (cx, cy), a)], fill=FARBE_TOPO["gebaeude"], outline=FARBE_TOPO["gebaeude_rand"])
    for p in d.karte.get("punkte", []):
        if p["art"] == "bruecke":
            x, y = P(p["pos"])
            dr.line([(x - 6 * s, y - 4 * s), (x + 6 * s, y - 4 * s)], fill=(60, 60, 60), width=int(0.8 * s))
            dr.line([(x - 6 * s, y + 4 * s), (x + 6 * s, y + 4 * s)], fill=(60, 60, 60), width=int(0.8 * s))
    return img.resize((W // ss, H // ss), Image.LANCZOS)


# ---------------------------------------------------------------------------- Beschriftete Vorschau
def beschriftet(d, welt, breite_px=1500):
    sc = breite_px / d.breite_m
    img = welt.resize((breite_px, int(d.hoehe_m * sc)), Image.LANCZOS).convert("RGBA")
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(ov)

    def P(p):
        return (p[0] * sc, p[1] * sc)
    f_lab = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 17)
    f_pq = ImageFont.truetype(FD + "DejaVuSansMono-Bold.ttf", 13)
    r = d.karte["raster"]
    z = r["zelle_m"]
    for k in range(int(d.breite_m // z) + 1):
        dr.line([P((k * z, 0)), P((k * z, d.hoehe_m))], fill=(255, 255, 255, 80), width=1)
    for k in range(int(d.hoehe_m // z) + 1):
        dr.line([P((0, k * z)), P((d.breite_m, k * z))], fill=(255, 255, 255, 80), width=1)
    for i in range(int(d.breite_m // z)):
        for j in range(int(d.hoehe_m // z)):
            dr.text(P((i * z + 4, j * z + 3)), f"{r['spalten'][i]}{j + r.get('zeilen_ab', 1)}", font=f_pq, fill=(255, 255, 255, 150))
    for zo in d.szenario["zonen"]:
        pts = [P(p) for p in zo["geometrie"]["punkte"]]
        if zo["typ"] == "no_strike":
            dr.polygon(pts, fill=(220, 40, 40, 55), outline=(235, 50, 50, 255))
            dr.line(pts + [pts[0]], fill=(235, 50, 50, 255), width=3)
            x0 = min(p[0] for p in pts)
            y1 = max(p[1] for p in pts)
            dr.text((x0 + 6, y1 + 4), f"{zo['id']} {zo['name'].upper()}", font=f_lab, fill=(255, 110, 110, 255), stroke_width=3, stroke_fill=(0, 0, 0, 200))
        else:
            for a, b in zip(pts, pts[1:] + pts[:1]):
                seg = math.hypot(b[0] - a[0], b[1] - a[1])
                n = max(1, int(seg / 8))
                for k in range(0, n, 2):
                    dr.line([(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n),
                             (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)], fill=(255, 152, 0, 230), width=2)
            dr.text(P((500, 440)), f"{zo['id']} ≤ {zo['max_wirkradius_m']} m", font=f_pq, fill=(255, 180, 60, 255), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    punktnamen = {p["name"] for p in d.karte.get("punkte", [])}
    for n in d.karte["namen"]:
        if n["text"] in punktnamen:          # steht schon am Punkt (Brücke, Furt)
            continue
        x, y = P(n["pos"])
        tw = dr.textlength(n["text"], font=f_lab)
        dr.text((x - tw / 2, y - 10), n["text"], font=f_lab, fill=(255, 255, 255, 240), stroke_width=3, stroke_fill=(0, 0, 0, 180))
    for p in d.karte.get("punkte", []):
        x, y = P(p["pos"])
        if p["art"] == "bruecke":
            dr.rectangle([x - 5, y - 5, x + 5, y + 5], fill=(255, 255, 255, 230), outline=(20, 60, 120, 255), width=2)
        else:
            dr.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 255, 255, 230), outline=(20, 60, 120, 255), width=2)
        tw = dr.textlength(p["name"], font=f_pq)
        dr.text((x - tw - 9, y - 22 if p["art"] == "bruecke" else y - 8), p["name"], font=f_pq, fill=(255, 255, 255, 240),
                stroke_width=2, stroke_fill=(0, 0, 0, 180))
    aussen = [k for k in d.szenario["kraefte"] if k.get("ausserhalb")]
    if aussen:
        ym = sum(k["pfeil_y"] for k in aussen) / len(aussen) * sc
        dr.polygon([(4, ym), (34, ym - 18), (34, ym - 8), (80, ym - 8), (80, ym + 8), (34, ym + 8), (34, ym + 18)], fill=(30, 100, 210, 220), outline=(255, 255, 255, 255))
        dr.text((10, ym + 24), "eigene Kräfte\n" + " · ".join(k["kurz"] for k in aussen) + "PzGrenBtl\nwestlich", font=f_pq, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    W, H = img.size
    dr.polygon([(W - 40, H - 150), (W - 28, H - 114), (W - 40, H - 122), (W - 52, H - 114)], fill=(255, 255, 255, 240))
    dr.text((W - 46, H - 110), "N", font=f_lab, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    L200 = 200 * sc
    dr.rectangle([W - 30 - L200, H - 36, W - 30, H - 28], fill=(255, 255, 255, 230), outline=(0, 0, 0, 255))
    dr.rectangle([W - 30 - L200, H - 36, W - 30 - L200 / 2, H - 28], fill=(20, 20, 20, 230))
    dr.text((W - 30 - L200, H - 58), "0          100         200 m", font=f_pq, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    dr.text((12, H - 26), "ÜBUNG · FIKTIVES GELÄNDE · Raum KRÄHE · Raster 100 m", font=f_pq, fill=(255, 255, 255, 230), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    img.alpha_composite(ov)
    return img.convert("RGB")
