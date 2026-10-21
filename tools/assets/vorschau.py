"""Vorschaubilder zur Kontrolle (nicht für das Spiel): Kontaktbogen der Drohnenbilder mit
ARGUS-Rahmen aus dem Manifest, Bogen aller Sprites und Effekte.

Aufruf über gen_assets.py --vorschau ORDNER.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FD = "/usr/share/fonts/truetype/dejavu/"
AMBER = (242, 169, 0)


def schrift(name, groesse):
    try:
        return ImageFont.truetype(FD + name, groesse)
    except OSError:
        return ImageFont.load_default()


def mit_rahmen(bild, eintrag, meldung):
    """ARGUS-Darstellung wie in der G1-Ansicht vorgesehen: Eckrahmen, Klasse, Konfidenz, Empfehlung."""
    img = bild.convert("RGB").copy()
    d = ImageDraw.Draw(img, "RGBA")
    f = schrift("DejaVuSansMono-Bold.ttf", 17)
    a = meldung["argus"] if meldung else None
    einzeln = (a or {}).get("einzeln") or []
    for i, z in enumerate(eintrag["ziele"]):
        x, y, w, h = z["box"]
        k = min(16, w / 3)
        for (ax, ay, bx, by, cx, cy) in ((x, y + k, x, y, x + k, y), (x + w - k, y, x + w, y, x + w, y + k),
                                         (x + w, y + h - k, x + w, y + h, x + w - k, y + h), (x + k, y + h, x, y + h, x, y + h - k)):
            d.line([(ax, ay), (bx, by), (cx, cy)], fill=AMBER + (255,), width=3)
        if a:
            konf = einzeln[i] if i < len(einzeln) else a["konfidenz"]
            lab = f"{a['klasse']} · {konf} %"
            tw = d.textlength(lab, font=f)
            ly = y - 26 if y > 30 else y + h + 4
            d.rectangle([x, ly, x + tw + 10, ly + 22], fill=AMBER + (230,))
            d.text((x + 5, ly + 2), lab, font=f, fill=(12, 14, 12))
    if a:
        d.rectangle([0, 0, img.width, 28], fill=(0, 0, 0, 130))
        uhr = eintrag["uhr"] or f"Einspielen + {eintrag['t_s']} s"
        d.text((10, 5), f"ARGUS 3.2 │ UAV-2 MILAN │ {uhr} │ PQ {eintrag['pq']} │ {a['empfehlung']}", font=f, fill=(232, 232, 226))
    return img


def kontaktbogen(assets, manifest, szenario, pfad, spalten=4, breite=512):
    meld = {m["id"]: m for m in szenario["meldungen"]}
    meld.update({m["id"]: m for g in (szenario.get("verstaerkungen") or {}).get("gruppen", []) for m in g["meldungen"]})
    eintraege = list(manifest["drohne"].items()) + list(manifest.get("zielbilder", {}).items())
    zeilen = math.ceil(len(eintraege) / spalten)
    h = int(breite * 640 / 1024)
    f = schrift("DejaVuSans-Bold.ttf", 15)
    fs = schrift("DejaVuSans.ttf", 12)
    bogen = Image.new("RGB", (spalten * (breite + 8) + 8, zeilen * (h + 52) + 8), (28, 30, 34))
    dr = ImageDraw.Draw(bogen)
    for n, (mid, e) in enumerate(eintraege):
        img = Image.open(os.path.join(assets, e["datei"]))
        img = mit_rahmen(img, e, meld.get(mid)).resize((breite, h), Image.LANCZOS)
        x = 8 + (n % spalten) * (breite + 8)
        y = 8 + (n // spalten) * (h + 52)
        bogen.paste(img, (x, y))
        m = meld.get(mid)
        titel = f"{mid} {m.get('fall') or ''} · {m['argus']['klasse']} {m['argus']['konfidenz']} %" if m else f"{mid} (nur Spielleitung)"
        dr.text((x, y + h + 4), titel, font=f, fill=(235, 235, 230))
        sicht = ", ".join(f"{s['art']} {s['lage']} soll {round(s['anteil'] * 100)} % / ist {round(s.get('anteil_ist', 0) * 100)} %"
                          for s in e["sicht"]) or "freie Sicht"
        verdeckt = " · Ziel verdeckt " + "/".join(f"{round(z['verdeckt'] * 100)} %" for z in e["ziele"])
        dr.text((x, y + h + 24), (sicht + verdeckt)[:92], font=fs, fill=(180, 184, 190))
    bogen.save(pfad, quality=86)
    return pfad


def spritebogen(assets, manifest, pfad):
    teile = []
    for atlas in ("fahrzeuge", "effekte"):
        a = manifest[atlas]
        img = Image.open(os.path.join(assets, a["bild"]))
        hintergrund = Image.new("RGBA", img.size, (118, 112, 86, 255))
        hintergrund.alpha_composite(img)
        teile.append(hintergrund)
    W = max(t.width for t in teile)
    H = sum(t.height for t in teile) + 20 * len(teile)
    bogen = Image.new("RGB", (W, H), (28, 30, 34))
    y = 0
    for t in teile:
        bogen.paste(t.convert("RGB"), (0, y))
        y += t.height + 20
    bogen.save(pfad)
    return pfad


def _schach(w, h, k=16):
    yy, xx = np.mgrid[0:h, 0:w]
    v = np.where(((xx // k) + (yy // k)) % 2 == 0, 150, 110).astype(np.uint8)
    return Image.fromarray(np.dstack([v, v, v, np.full_like(v, 255)]), "RGBA")


def ebenen_bogen(assets, manifest, d, pfad, ids, breite=400):
    """Je Meldung: Standbild | Ebenen zusammengesetzt (Live zur Meldezeit) | Boden | Kronen + Störung auf Schachbrett."""
    from live import Live
    live = Live(d, assets, manifest)
    h = int(breite * 640 / 1024)
    f = schrift("DejaVuSans-Bold.ttf", 14)
    bogen = Image.new("RGB", (4 * (breite + 6) + 6, len(ids) * (h + 26) + 6), (28, 30, 34))
    dr = ImageDraw.Draw(bogen)
    for n, mid in enumerate(ids):
        e = manifest["drohne"][mid]
        eb = e["ebenen"]
        teile = [Image.open(os.path.join(assets, e["datei"])).convert("RGB"), live.bild(mid, e["t_s"]),
                 Image.open(os.path.join(assets, eb["boden"])).convert("RGB")]
        oben = _schach(1024, 640)
        for k in ("kronen", "stoerung"):
            if eb.get(k):
                oben.alpha_composite(Image.open(os.path.join(assets, eb[k])).convert("RGBA"))
        teile.append(oben.convert("RGB"))
        y = 6 + n * (h + 26)
        for i, t in enumerate(teile):
            bogen.paste(t.resize((breite, h), Image.LANCZOS), (6 + i * (breite + 6), y + 20))
        dr.text((6, y + 2), f"{mid} · Standbild | Ebenen zusammengesetzt (Meldezeit) | Boden | Kronen + Störung · "
                            f"Ebenen {eb['bytes'] // 1024} KB, {len(eb['fahrzeuge'])} Fahrzeuge, {len(eb['figuren'])} Figuren", font=f, fill=(235, 235, 230))
    bogen.save(pfad, quality=86)
    return pfad


def live_animation(assets, manifest, d, mid, pfad, dauer_s=24, schritt_s=1.0, breite=640):
    """Animiertes WebP: Live-Drohnenbild ab der Meldezeit (Fahrzeuge fahren, Effekte laufen)."""
    from live import Live
    live = Live(d, assets, manifest)
    t0 = manifest["drohne"][mid]["t_s"]
    bilder = []
    for k in range(int(dauer_s / schritt_s)):
        t = t0 + k * schritt_s
        img = live.bild(mid, t, effekte_zeit=k * schritt_s).resize((breite, int(breite * 640 / 1024)), Image.LANCZOS)
        ImageDraw.Draw(img).text((8, 6), f"{mid}  t = {t:.0f} s", font=schrift("DejaVuSansMono-Bold.ttf", 14), fill=(242, 169, 0))
        bilder.append(img)
    bilder[0].save(pfad, "WEBP", save_all=True, append_images=bilder[1:], duration=int(schritt_s * 1000 / 4), loop=0, quality=70)
    return pfad


def manifest_laden(assets):
    with open(os.path.join(assets, "manifest.json"), encoding="utf-8") as f:
        return json.load(f)
